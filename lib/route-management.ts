import "server-only";

import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { loadGarbageVehicleOptions } from "@/lib/workspace";

type Relation = [number, string] | false;

type RouteRecord = {
  id: number;
  name: string;
  code?: string | false;
  project_id?: Relation;
  collection_point_count?: number;
  subdistrict_names?: string | false;
};

type RouteLineRecord = {
  id: number;
  route_id: Relation;
  sequence?: number;
  collection_point_id: Relation;
};

type ProjectRecord = {
  id: number;
  mfo_operation_type?: string | false;
};

type PointRecord = {
  id: number;
  name: string;
  address?: string | false;
  subdistrict_id: Relation;
};

type SubdistrictRecord = {
  id: number;
  name: string;
  district_id: Relation;
};

type TeamRecord = {
  id: number;
  name: string;
  vehicle_id?: Relation;
};

export type RouteManagementData = {
  routes: Array<{
    id: number;
    name: string;
    code: string;
    projectName: string;
    pointCount: number;
    pointIds: number[];
    subdistrictNames: string;
    pointNames: string[];
  }>;
  points: Array<{
    id: number;
    name: string;
    address: string;
    subdistrictId: number | null;
    subdistrictName: string;
  }>;
  subdistricts: Array<{
    id: number;
    label: string;
  }>;
  vehicles: Array<{
    id: number;
    label: string;
  }>;
  teams: Array<{
    id: number;
    label: string;
  }>;
};

function relationName(value: Relation | undefined) {
  return Array.isArray(value) ? value[1] : "";
}

function relationId(value: Relation | undefined) {
  return Array.isArray(value) ? value[0] : null;
}

export async function loadRouteManagementData(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<RouteManagementData> {
  const [routes, points, subdistricts, vehicles, teams] = await Promise.all([
    executeOdooKw<RouteRecord[]>(
      "mfo.route",
      "search_read",
      [[["active", "=", true]]],
      {
        fields: ["name", "code", "project_id", "collection_point_count", "subdistrict_names"],
        order: "id desc",
        limit: 80,
      },
      connectionOverrides,
    ).catch(() => []),
    executeOdooKw<PointRecord[]>(
      "mfo.collection.point",
      "search_read",
      [[["active", "=", true], ["operation_type", "=", "garbage"]]],
      {
        fields: ["name", "address", "subdistrict_id"],
        order: "subdistrict_id asc, name asc",
        limit: 500,
      },
      connectionOverrides,
    ).catch(() => []),
    executeOdooKw<SubdistrictRecord[]>(
      "mfo.subdistrict",
      "search_read",
      [[]],
      {
        fields: ["name", "district_id"],
        order: "district_id asc, name asc",
        limit: 120,
      },
      connectionOverrides,
    ).catch(() => []),
    loadGarbageVehicleOptions(connectionOverrides).catch(() => []),
    executeOdooKw<TeamRecord[]>(
      "mfo.crew.team",
      "search_read",
      [[["operation_type", "=", "garbage"]]],
      {
        fields: ["name", "vehicle_id"],
        order: "name asc",
        limit: 120,
      },
      connectionOverrides,
    ).catch(() => []),
  ]);

  const projectIds = Array.from(
    new Set(routes.map((route) => relationId(route.project_id)).filter((id): id is number => Boolean(id))),
  );
  const routeProjectTypes = projectIds.length
    ? await executeOdooKw<ProjectRecord[]>(
        "project.project",
        "search_read",
        [[["id", "in", projectIds]]],
        {
          fields: ["mfo_operation_type"],
          limit: projectIds.length,
        },
        connectionOverrides,
      )
        .then((projects) => new Map(projects.map((project) => [project.id, project.mfo_operation_type || ""])))
        .catch(() => new Map<number, string>())
    : new Map<number, string>();
  const scopedRoutes = routeProjectTypes.size
    ? routes.filter((route) => {
        const projectId = relationId(route.project_id);
        return !projectId || routeProjectTypes.get(projectId) === "garbage";
      })
    : routes;
  const routeIds = scopedRoutes.map((route) => route.id);
  const routeLines = routeIds.length
    ? await executeOdooKw<RouteLineRecord[]>(
        "mfo.route.line",
        "search_read",
        [[["route_id", "in", routeIds]]],
        {
          fields: ["route_id", "sequence", "collection_point_id"],
          order: "route_id asc, sequence asc, id asc",
          limit: 1000,
        },
        connectionOverrides,
      ).catch(() => [])
    : [];

  const pointNamesByRouteId = new Map<number, string[]>();
  const pointIdsByRouteId = new Map<number, number[]>();
  for (const line of routeLines) {
    const routeId = relationId(line.route_id);
    const pointId = relationId(line.collection_point_id);
    const pointName = relationName(line.collection_point_id);
    if (!routeId || !pointName || !pointId) {
      continue;
    }
    const currentIds = pointIdsByRouteId.get(routeId) ?? [];
    if (currentIds.includes(pointId)) {
      continue;
    }
    currentIds.push(pointId);
    pointIdsByRouteId.set(routeId, currentIds);

    const currentNames = pointNamesByRouteId.get(routeId) ?? [];
    currentNames.push(pointName);
    pointNamesByRouteId.set(routeId, currentNames);
  }
  const uniquePoints = Array.from(new Map(points.map((point) => [point.id, point])).values());
  const uniqueSubdistricts = Array.from(new Map(subdistricts.map((subdistrict) => [subdistrict.id, subdistrict])).values());

  return {
    routes: scopedRoutes.map((route) => ({
      id: route.id,
      name: route.name,
      code: route.code || "",
      projectName: relationName(route.project_id),
      pointCount: route.collection_point_count || pointNamesByRouteId.get(route.id)?.length || 0,
      pointIds: pointIdsByRouteId.get(route.id) ?? [],
      subdistrictNames: route.subdistrict_names || "",
      pointNames: pointNamesByRouteId.get(route.id) ?? [],
    })),
    points: uniquePoints.map((point) => ({
      id: point.id,
      name: point.name,
      address: point.address || "",
      subdistrictId: relationId(point.subdistrict_id),
      subdistrictName: relationName(point.subdistrict_id),
    })),
    subdistricts: uniqueSubdistricts.map((subdistrict) => ({
      id: subdistrict.id,
      label: `${relationName(subdistrict.district_id)} ${subdistrict.name}`.trim(),
    })),
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      label: vehicle.label,
    })),
    teams: teams.map((team) => ({
      id: team.id,
      label: team.name,
    })),
  };
}
