import "server-only";

import { normalizeDepartmentText } from "@/lib/department-permissions";
import { loadLocalInspectorScopes } from "@/lib/inspector-scope-store";
import { executeOdooKw, loadFleetVehicleBoard, type OdooConnection } from "@/lib/odoo";
import { loadDepartmentOptions } from "@/lib/workspace";

type Relation = [number, string] | false;
type OdooFieldMap = Record<string, { type?: string }>;

type InspectorRecord = {
  id: number;
  name: string;
  job_title?: string | false;
  department_id?: Relation;
  mfo_inspected_team_ids?: number[];
  mfo_inspected_subdistrict_ids?: number[];
  mfo_inspected_point_ids?: number[];
  mfo_inspected_vehicle_ids?: number[];
};

type PointRecord = {
  id: number;
  name: string;
  subdistrict_id?: Relation;
  inspector_employee_ids?: number[];
};

type SubdistrictRecord = {
  id: number;
  name: string;
  district_id?: Relation;
};

type VehicleRecord = {
  id: number;
  name?: string | false;
  license_plate?: string | false;
  mfo_inspector_employee_ids?: number[];
  mfo_garbage_work_create_allowed?: boolean;
};

function relationName(value: Relation | undefined) {
  return Array.isArray(value) ? value[1] : "";
}

async function getModelFields(model: string, connection: Partial<OdooConnection>) {
  return executeOdooKw<OdooFieldMap>(
    model,
    "fields_get",
    [],
    { attributes: ["type"] },
    connection,
  ).catch(() => null);
}

function pickExistingFields(fields: OdooFieldMap | null, candidates: string[]) {
  if (!fields) {
    return candidates;
  }
  return candidates.filter((fieldName) => fields[fieldName]);
}

async function loadVehicleRecordsForScope(
  connection: Partial<OdooConnection>,
  vehicleFields: OdooFieldMap | null,
) {
  const board = await loadFleetVehicleBoard().catch(() => null);
  if (board?.allVehicles.length) {
    return board.allVehicles.map((vehicle) => ({
      id: vehicle.id,
      name: vehicle.name,
      license_plate: vehicle.plate,
      mfo_inspector_employee_ids: [],
      mfo_garbage_work_create_allowed: true,
    } satisfies VehicleRecord));
  }

  const fields = vehicleFields
    ? pickExistingFields(vehicleFields, [
        "name",
        "license_plate",
        "mfo_inspector_employee_ids",
        "mfo_garbage_work_create_allowed",
      ])
    : ["name", "license_plate"];

  return executeOdooKw<VehicleRecord[]>(
    "fleet.vehicle",
    "search_read",
    [[["active", "=", true]]],
    {
      fields,
      order: "license_plate asc, name asc",
      limit: 300,
    },
    connection,
  ).catch(() => []);
}

async function loadDepartmentId(
  departmentName: string | null,
  connection: Partial<OdooConnection>,
) {
  if (!departmentName) {
    return null;
  }
  const normalized = normalizeDepartmentText(departmentName);
  const departments = await loadDepartmentOptions(connection);
  return departments.find((department) => normalizeDepartmentText(department.name) === normalized)?.id ?? null;
}

export async function loadInspectorScopeData(
  departmentName: string | null,
  connection: Partial<OdooConnection> = {},
) {
  const [departmentId, employeeFields, pointFields, subdistrictFields, vehicleFields] = await Promise.all([
    loadDepartmentId(departmentName, connection),
    getModelFields("hr.employee", connection),
    getModelFields("mfo.collection.point", connection),
    getModelFields("mfo.subdistrict", connection),
    getModelFields("fleet.vehicle", connection),
  ]);

  const employeeDomain: unknown[] = [["active", "=", true]];
  if (departmentId) {
    employeeDomain.push(["department_id", "=", departmentId]);
  }

  const employees = await executeOdooKw<InspectorRecord[]>(
    "hr.employee",
    "search_read",
    [employeeDomain],
    {
      fields: pickExistingFields(employeeFields, [
        "name",
        "job_title",
        "department_id",
        "mfo_inspected_team_ids",
        "mfo_inspected_subdistrict_ids",
        "mfo_inspected_point_ids",
        "mfo_inspected_vehicle_ids",
      ]),
      order: "department_id asc, name asc",
      limit: 300,
    },
    connection,
  ).catch(() => []);

  const inspectors = employees.filter((employee) => {
    const text = normalizeDepartmentText(`${employee.name} ${employee.job_title || ""}`);
    return (
      text.includes("тээвэрлэлтийн хяналтын ажилтан") ||
      text.includes("хян") ||
      text.includes("байцаагч") ||
      text.includes("inspector") ||
      (employee.mfo_inspected_subdistrict_ids?.length ?? 0) > 0 ||
      (employee.mfo_inspected_point_ids?.length ?? 0) > 0 ||
      (employee.mfo_inspected_vehicle_ids?.length ?? 0) > 0
    );
  });
  const pointDomain = pointFields?.operation_type
    ? [["active", "=", true], ["operation_type", "=", "garbage"]]
    : [["active", "=", true]];

  const subdistrictDomain = subdistrictFields?.active ? [["active", "=", true]] : [];

  const [subdistricts, points, vehicles] = await Promise.all([
    executeOdooKw<SubdistrictRecord[]>(
      "mfo.subdistrict",
      "search_read",
      [subdistrictDomain],
      {
        fields: pickExistingFields(subdistrictFields, [
          "name",
          "district_id",
        ]),
        order: "district_id asc, name asc",
        limit: 500,
      },
      connection,
    ).catch(() => []),
    executeOdooKw<PointRecord[]>(
      "mfo.collection.point",
      "search_read",
      [pointDomain],
      {
        fields: pickExistingFields(pointFields, [
          "name",
          "subdistrict_id",
          "inspector_employee_ids",
        ]),
        order: "subdistrict_id asc, name asc",
        limit: 600,
      },
      connection,
    ).catch(() => []),
    loadVehicleRecordsForScope(connection, vehicleFields),
  ]);

  const localScopes = await loadLocalInspectorScopes();
  const localScopeByEmployeeId = new Map(
    localScopes.map((scope) => [scope.inspectorEmployeeId, scope]),
  );

  return {
    inspectors: inspectors.map((inspector) => ({
      id: inspector.id,
      name: inspector.name,
      meta: [inspector.job_title || "", relationName(inspector.department_id)].filter(Boolean).join(" · "),
      subdistrictIds:
        localScopeByEmployeeId.get(inspector.id)?.subdistrictIds ??
        inspector.mfo_inspected_subdistrict_ids ??
        [],
      pointIds:
        localScopeByEmployeeId.get(inspector.id)?.pointIds ??
        inspector.mfo_inspected_point_ids ??
        [],
      vehicleIds:
        localScopeByEmployeeId.get(inspector.id)?.vehicleIds ??
        inspector.mfo_inspected_vehicle_ids ??
        [],
    })),
    subdistricts: subdistricts.map((subdistrict) => ({
      id: subdistrict.id,
      label: relationName(subdistrict.district_id)
        ? `${relationName(subdistrict.district_id)} · ${subdistrict.name}`
        : subdistrict.name,
    })),
    points: points.map((point) => ({
      id: point.id,
      label: relationName(point.subdistrict_id) ? `${relationName(point.subdistrict_id)} · ${point.name}` : point.name,
      subdistrictId: Array.isArray(point.subdistrict_id) ? point.subdistrict_id[0] : null,
      inspectorIds: point.inspector_employee_ids ?? [],
    })),
    vehicles: vehicles.map((vehicle) => {
      const plate = vehicle.license_plate || vehicle.name || `Техник #${vehicle.id}`;
      return {
        id: vehicle.id,
        label: plate,
        inspectorIds: vehicle.mfo_inspector_employee_ids ?? [],
        workCreateAllowed: vehicle.mfo_garbage_work_create_allowed ?? true,
      };
    }),
  };
}
