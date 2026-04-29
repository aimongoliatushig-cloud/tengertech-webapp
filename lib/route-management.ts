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
    subdistrictNames: string;
    pointNames: string[];
  }>;
  points: Array<{
    id: number;
    name: string;
    address: string;
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

  const routeIds = routes.map((route) => route.id);
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
  for (const line of routeLines) {
    const routeId = relationId(line.route_id);
    const pointName = relationName(line.collection_point_id);
    if (!routeId || !pointName) {
      continue;
    }
    const current = pointNamesByRouteId.get(routeId) ?? [];
    current.push(pointName);
    pointNamesByRouteId.set(routeId, current);
  }

  return {
    routes: routes.map((route) => ({
      id: route.id,
      name: route.name,
      code: route.code || "",
      projectName: relationName(route.project_id),
      pointCount: route.collection_point_count || pointNamesByRouteId.get(route.id)?.length || 0,
      subdistrictNames: route.subdistrict_names || "",
      pointNames: pointNamesByRouteId.get(route.id) ?? [],
    })),
    points: points.map((point) => ({
      id: point.id,
      name: point.name,
      address: point.address || "",
      subdistrictName: relationName(point.subdistrict_id),
    })),
    subdistricts: subdistricts.map((subdistrict) => ({
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
