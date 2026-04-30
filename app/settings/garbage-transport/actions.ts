"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { requireSession } from "@/lib/auth";
import { isAutoGarbageDepartment, normalizeDepartmentText } from "@/lib/department-permissions";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { loadDepartmentOptions } from "@/lib/workspace";

const SETTINGS_PATH = "/settings/garbage-transport";

type OdooFieldInfo = {
  type?: string;
  required?: boolean;
  readonly?: boolean;
  selection?: Array<[string, string]>;
};

type OdooFieldMap = Record<string, OdooFieldInfo>;

type WorkUnitRecord = {
  id: number;
  name: string;
  code?: string | false;
};

type WorkTypeRecord = {
  id: number;
  active?: boolean;
};

function cleanInput(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveId(value: FormDataEntryValue | null) {
  const id = Number(cleanInput(value));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parsePositiveIds(values: FormDataEntryValue[]) {
  return values
    .map((value) => Number(cleanInput(value)))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function redirectToSettings(kind: "notice" | "error", message: string, anchor = "general"): never {
  redirect(`${SETTINGS_PATH}?${kind}=${encodeURIComponent(message)}#${anchor}`);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getSessionConnection(session: Awaited<ReturnType<typeof requireSession>>) {
  return {
    login: session.login,
    password: session.password,
  } satisfies Partial<OdooConnection>;
}

async function loadDepartmentId(
  departmentName: string | null,
  connection: Partial<OdooConnection>,
) {
  if (!departmentName) {
    return null;
  }

  const normalizedDepartmentName = normalizeDepartmentText(departmentName);
  const departments = await loadDepartmentOptions(connection);
  return departments.find((department) => normalizeDepartmentText(department.name) === normalizedDepartmentName)
    ?.id ?? null;
}

async function getModelFields(model: string, connection: Partial<OdooConnection>) {
  try {
    return await executeOdooKw<OdooFieldMap>(
      model,
      "fields_get",
      [],
      { attributes: ["type", "required", "readonly", "selection"] },
      connection,
    );
  } catch {
    return null;
  }
}

function pickSupportedValues(
  candidateValues: Record<string, unknown>,
  fields: OdooFieldMap | null,
) {
  if (!fields) {
    return candidateValues;
  }

  return Object.fromEntries(
    Object.entries(candidateValues).filter(([fieldName, value]) => {
      if (!fields[fieldName] || fields[fieldName].readonly) {
        return false;
      }
      if (value === undefined || value === null || value === "") {
        return false;
      }
      return true;
    }),
  );
}

function pickSelectionValue(
  fields: OdooFieldMap | null,
  fieldName: string,
  preferredValues: string[],
) {
  const selection = fields?.[fieldName]?.selection;
  if (!selection?.length) {
    return preferredValues[0];
  }
  const allowed = new Set(selection.map(([value]) => value));
  return preferredValues.find((value) => allowed.has(value)) ?? selection[0]?.[0] ?? preferredValues[0];
}

async function createOdooRecord(
  model: string,
  values: Record<string, unknown>,
  connection: Partial<OdooConnection>,
) {
  const fields = await getModelFields(model, connection);
  const supportedValues = pickSupportedValues(values, fields);

  try {
    return await executeOdooKw<number>(model, "create", [supportedValues], {}, connection);
  } catch (error) {
    console.warn(`Retrying ${model} create with system connection`, error);
    return executeOdooKw<number>(model, "create", [supportedValues], {});
  }
}

async function writeOdooRecord(
  model: string,
  id: number,
  values: Record<string, unknown>,
  connection: Partial<OdooConnection>,
) {
  const fields = await getModelFields(model, connection);
  const supportedValues = pickSupportedValues(values, fields);

  if (!Object.keys(supportedValues).length) {
    return true;
  }

  try {
    return await executeOdooKw<boolean>(model, "write", [[id], supportedValues], {}, connection);
  } catch (error) {
    console.warn(`Retrying ${model} write with system connection`, error);
    return executeOdooKw<boolean>(model, "write", [[id], supportedValues], {});
  }
}

async function unlinkOdooRecords(
  model: string,
  ids: number[],
  connection: Partial<OdooConnection>,
) {
  if (!ids.length) {
    return true;
  }

  try {
    return await executeOdooKw<boolean>(model, "unlink", [ids], {}, connection);
  } catch (error) {
    console.warn(`Retrying ${model} unlink with system connection`, error);
    return executeOdooKw<boolean>(model, "unlink", [ids], {});
  }
}

async function replaceGarbageRouteLines(
  routeId: number,
  pointIds: number[],
  connection: Partial<OdooConnection>,
) {
  const existingLines = await executeOdooKw<Array<{ id: number }>>(
    "mfo.route.line",
    "search_read",
    [[["route_id", "=", routeId]]],
    {
      fields: ["id"],
      limit: 1000,
    },
    connection,
  ).catch(() => []);

  await unlinkOdooRecords(
    "mfo.route.line",
    existingLines.map((line) => line.id),
    connection,
  );

  await Promise.all(
    pointIds.map((pointId, index) =>
      createOdooRecord(
        "mfo.route.line",
        {
          route_id: routeId,
          collection_point_id: pointId,
          sequence: index + 1,
        },
        connection,
      ),
    ),
  );
}

async function loadGarbageWorkUnitIds(connection: Partial<OdooConnection>) {
  const units = await executeOdooKw<WorkUnitRecord[]>(
    "ops.work.unit",
    "search_read",
    [[["active", "=", true]]],
    {
      fields: ["name", "code"],
      order: "sequence asc, name asc",
      limit: 80,
    },
    connection,
  ).catch(() => []);
  const allowedNames = ["цэг", "рейс", "тонн", "м³", "км"];
  const allowedCodes = ["point", "trip", "ton", "m3", "km"];
  const ids = units
    .filter((unit) => {
      const name = normalizeDepartmentText(unit.name);
      const code = String(unit.code || "").toLowerCase();
      return allowedNames.some((allowedName) => name.includes(normalizeDepartmentText(allowedName)))
        || allowedCodes.includes(code);
    })
    .map((unit) => unit.id);

  return ids.length ? ids : units.slice(0, 1).map((unit) => unit.id);
}

async function requireGarbageTransportHead() {
  const session = await requireSession();
  const departmentName = await loadSessionDepartmentName(session);
  const canAccess =
    String(session.role) === "system_admin" ||
    (String(session.role) === "project_manager" && isAutoGarbageDepartment(departmentName));

  if (!canAccess) {
    redirect("/");
  }

  const connection = getSessionConnection(session);
  const departmentId = await loadDepartmentId(departmentName, connection);

  return {
    session,
    connection,
    departmentName,
    departmentId,
  };
}

export async function saveGarbageTransportPreferencesAction(formData: FormData) {
  const { connection } = await requireGarbageTransportHead();
  const booleanKeys = [
    "is_active",
    "notify_assign",
    "notify_due_soon",
    "notify_overdue_head",
    "notify_done_head",
    "notify_complaint",
    "photo_required",
    "location_required",
    "start_time_required",
    "end_time_required",
    "quantity_required",
  ];
  const textKeys = ["report_template", "measurement_unit"];

  const entries = [
    ...booleanKeys
      .filter((key) => formData.has(key) || formData.has(`${key}_present`))
      .map((key) => [
        `mfo.garbage_transport.${key}`,
        formData.get(key) === "on" ? "1" : "0",
      ] as const),
    ...textKeys
      .filter((key) => formData.has(key))
      .map((key) => [
        `mfo.garbage_transport.${key}`,
        cleanInput(formData.get(key)),
      ] as const),
  ];

  try {
    for (const [key, value] of entries) {
      try {
        await executeOdooKw<boolean>(
          "ir.config_parameter",
          "set_param",
          [key, value],
          {},
          connection,
        );
      } catch {
        await executeOdooKw<boolean>("ir.config_parameter", "set_param", [key, value], {});
      }
    }
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Тохиргоо хадгалах үед Odoo дээр алдаа гарлаа."),
      "general",
    );
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Хог тээвэрлэлтийн тохиргоо хадгалагдлаа.", "general");
}

export async function createGarbageTransportTeamAction(formData: FormData) {
  const { connection, departmentId } = await requireGarbageTransportHead();
  const teamName = cleanInput(formData.get("team_name"));
  const leaderId = parsePositiveId(formData.get("team_leader_id"));
  const vehicleId = parsePositiveId(formData.get("team_vehicle_id"));
  const memberIds = parsePositiveIds(formData.getAll("member_ids"));
  const serviceArea = cleanInput(formData.get("service_area"));

  if (!teamName) {
    redirectToSettings("error", "Багийн нэр оруулна уу.", "teams");
  }

  try {
    const fields = await getModelFields("mfo.crew.team", connection);
    const memberCommand = memberIds.length ? [[6, 0, memberIds]] : undefined;
    const values = pickSupportedValues(
      {
        name: teamName,
        active: true,
        operation_type: pickSelectionValue(fields, "operation_type", ["garbage"]),
        department_id: departmentId,
        ops_department_id: departmentId,
        vehicle_id: vehicleId,
        driver_employee_id: leaderId,
        mfo_driver_employee_id: leaderId,
        leader_employee_id: leaderId,
        team_leader_id: leaderId,
        master_employee_id: leaderId,
        responsible_employee_id: leaderId,
        collector_employee_ids: memberCommand,
        member_employee_ids: memberCommand,
        member_ids: memberCommand,
        employee_ids: memberCommand,
        loader_employee_ids: memberCommand,
        loader_ids: memberCommand,
        service_area: serviceArea,
        zone_name: serviceArea,
        responsibility_area: serviceArea,
        khoroo_scope: serviceArea,
      },
      fields,
    );

    await createOdooRecord("mfo.crew.team", values, connection);
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Хог тээврийн баг үүсгэх үед Odoo дээр алдаа гарлаа."),
      "teams",
    );
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Хог тээврийн баг нэмэгдлээ.", "teams");
}

export async function archiveGarbageTransportTeamAction(formData: FormData) {
  const { connection } = await requireGarbageTransportHead();
  const teamId = parsePositiveId(formData.get("team_id"));
  if (!teamId) {
    redirectToSettings("error", "Баг сонгоно уу.", "teams");
  }

  try {
    await writeOdooRecord("mfo.crew.team", teamId, { active: false }, connection);
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Баг идэвхгүй болгох үед Odoo дээр алдаа гарлаа."),
      "teams",
    );
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Баг идэвхгүй боллоо.", "teams");
}

export async function createGarbageTransportWorkTypeAction(formData: FormData) {
  const { connection } = await requireGarbageTransportHead();
  const workTypeName = cleanInput(formData.get("work_type_name"));

  if (!workTypeName) {
    redirectToSettings("error", "Ажлын төрлийн нэр оруулна уу.", "work-types");
  }

  try {
    const fields = await getModelFields("ops.work.type", connection);
    const existing = await executeOdooKw<WorkTypeRecord[]>(
      "ops.work.type",
      "search_read",
      [[["name", "=", workTypeName], ["operation_type", "=", "garbage"]]],
      {
        fields: ["active"],
        limit: 1,
      },
      connection,
    ).catch(() => []);

    if (existing[0]?.id) {
      await writeOdooRecord("ops.work.type", existing[0].id, { active: true }, connection);
    } else {
      const unitIds = await loadGarbageWorkUnitIds(connection);
      await createOdooRecord(
        "ops.work.type",
        pickSupportedValues(
          {
            name: workTypeName,
            active: true,
            operation_type: pickSelectionValue(fields, "operation_type", ["garbage"]),
            allowed_unit_ids: unitIds.length ? [[6, 0, unitIds]] : undefined,
            default_unit_id: unitIds[0],
          },
          fields,
        ),
        connection,
      );
    }
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Ажлын төрөл нэмэх үед Odoo дээр алдаа гарлаа."),
      "work-types",
    );
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Ажлын төрөл нэмэгдлээ.", "work-types");
}

export async function archiveGarbageTransportWorkTypeAction(formData: FormData) {
  const { connection } = await requireGarbageTransportHead();
  const workTypeId = parsePositiveId(formData.get("work_type_id"));

  if (!workTypeId) {
    redirectToSettings("error", "Ажлын төрөл сонгоно уу.", "work-types");
  }

  try {
    await writeOdooRecord("ops.work.type", workTypeId, { active: false }, connection);
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Ажлын төрөл хасах үед Odoo дээр алдаа гарлаа."),
      "work-types",
    );
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Ажлын төрөл хасагдлаа.", "work-types");
}

async function findDefaultVehicleModel(connection: Partial<OdooConnection>) {
  const models = await executeOdooKw<Array<{ id: number }>>(
    "fleet.vehicle.model",
    "search_read",
    [[]],
    { fields: ["id"], order: "id asc", limit: 1 },
    connection,
  ).catch(() => []);

  return models[0]?.id ?? null;
}

export async function createGarbageTransportVehicleAction(formData: FormData) {
  const { connection } = await requireGarbageTransportHead();
  const plate = cleanInput(formData.get("vehicle_plate"));
  const name = cleanInput(formData.get("vehicle_name")) || plate;
  const vehicleType = cleanInput(formData.get("vehicle_type"));
  const capacity = cleanInput(formData.get("vehicle_capacity"));
  const driverEmployeeId = parsePositiveId(formData.get("driver_employee_id"));
  const helperEmployeeId = parsePositiveId(formData.get("helper_employee_id"));
  const status = cleanInput(formData.get("vehicle_status")) || "ready";
  const fuelType = cleanInput(formData.get("fuel_type"));
  const inspectionDate = cleanInput(formData.get("inspection_date"));

  if (!plate) {
    redirectToSettings("error", "Машины улсын дугаар оруулна уу.", "vehicles");
  }

  try {
    const fields = await getModelFields("fleet.vehicle", connection);
    const modelId = fields?.model_id?.required ? await findDefaultVehicleModel(connection) : null;
    const isOperational = status === "ready" || status === "in_service";
    const repairState =
      status === "repair"
        ? "Засвартай"
        : status === "paused"
          ? "Түр зогссон"
          : status === "in_service"
            ? "Ажилд гарсан"
            : "Бэлэн";

    const values = pickSupportedValues(
      {
        name,
        license_plate: plate,
        active: true,
        model_id: modelId,
        mfo_active_for_ops: isOperational,
        latest_repair_state: repairState,
        fuel_type: fuelType,
        category_name: vehicleType,
        vehicle_type: vehicleType,
        capacity,
        carrying_capacity: capacity,
        mfo_capacity: capacity,
        driver_employee_id: driverEmployeeId,
        mfo_driver_employee_id: driverEmployeeId,
        helper_employee_id: helperEmployeeId,
        loader_employee_id: helperEmployeeId,
        next_inspection_date: inspectionDate,
        inspection_date: inspectionDate,
        insurance_date: inspectionDate,
      },
      fields,
    );

    await createOdooRecord("fleet.vehicle", values, connection);
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Машин нэмэх үед Odoo дээр алдаа гарлаа."),
      "vehicles",
    );
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Машин нэмэгдлээ.", "vehicles");
}

export async function createGarbageTransportPointAction(formData: FormData) {
  const { connection } = await requireGarbageTransportHead();
  const pointName = cleanInput(formData.get("point_name"));
  const address = cleanInput(formData.get("point_address"));
  const subdistrictId = parsePositiveId(formData.get("subdistrict_id"));
  const routeId = parsePositiveId(formData.get("point_route_id"));
  const teamId = parsePositiveId(formData.get("point_team_id"));
  const pointType = cleanInput(formData.get("point_type")) || "normal";
  const pointState = cleanInput(formData.get("point_state")) || "active";

  if (!pointName) {
    redirectToSettings("error", "Хогийн цэгийн нэр оруулна уу.", "points");
  }
  if (!subdistrictId) {
    redirectToSettings("error", "Хогийн цэгийн хороог сонгоно уу.", "points");
  }

  try {
    const fields = await getModelFields("mfo.collection.point", connection);
    await createOdooRecord(
      "mfo.collection.point",
      pickSupportedValues(
        {
          name: pointName,
          address,
          active: pointState !== "deleted",
          operation_type: pickSelectionValue(fields, "operation_type", ["garbage"]),
          subdistrict_id: subdistrictId,
          route_id: routeId,
          team_id: teamId,
          crew_team_id: teamId,
          point_type: pointType,
          waste_type: pointType,
          collection_type: pointType,
          state: pointState,
          status: pointState,
        },
        fields,
      ),
      connection,
    );
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Хогийн цэг нэмэх үед Odoo дээр алдаа гарлаа."),
      "points",
    );
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Хогийн цэг нэмэгдлээ.", "points");
}

export async function createGarbageTransportRouteAction(formData: FormData) {
  const { connection, departmentId } = await requireGarbageTransportHead();
  const routeName = cleanInput(formData.get("route_name"));
  const teamId = parsePositiveId(formData.get("route_team_id"));
  const vehicleId = parsePositiveId(formData.get("route_vehicle_id"));
  const pointIds = parsePositiveIds(formData.getAll("route_point_ids"));

  if (!routeName) {
    redirectToSettings("error", "Маршрутын нэр оруулна уу.", "routes");
  }

  try {
    const projectId = await createOdooRecord(
      "project.project",
      {
        name: routeName,
        active: true,
        privacy_visibility: "employees",
        mfo_is_operation_project: true,
        mfo_operation_type: "garbage",
        mfo_default_shift_type: "morning",
        mfo_selected_shift_type: "morning",
        mfo_selected_vehicle_id: vehicleId,
        mfo_crew_team_id: teamId,
        ops_department_id: departmentId,
      },
      connection,
    );
    const routeFields = await getModelFields("mfo.route", connection);
    const routeId = await createOdooRecord(
      "mfo.route",
      pickSupportedValues(
        {
          name: routeName,
          active: true,
          project_id: projectId,
          operation_type: pickSelectionValue(routeFields, "operation_type", ["garbage"]),
          shift_type: "morning",
          crew_team_id: teamId,
          team_id: teamId,
          vehicle_id: vehicleId,
          assigned_vehicle_id: vehicleId,
        },
        routeFields,
      ),
      connection,
    );

    await replaceGarbageRouteLines(routeId, pointIds, connection);
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Маршрут нэмэх үед Odoo дээр алдаа гарлаа."),
      "routes",
    );
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Маршрут нэмэгдлээ.", "routes");
}

export async function updateGarbageTransportRouteAction(formData: FormData) {
  const { connection } = await requireGarbageTransportHead();
  const routeId = parsePositiveId(formData.get("route_id"));
  const routeName = cleanInput(formData.get("route_name"));
  const pointIds = parsePositiveIds(formData.getAll("route_point_ids"));

  if (!routeId) {
    redirectToSettings("error", "Маршрут сонгоно уу.", "routes");
  }
  if (!routeName) {
    redirectToSettings("error", "Маршрутын нэр оруулна уу.", "routes");
  }

  try {
    await writeOdooRecord("mfo.route", routeId, { name: routeName }, connection);
    const routeRecords = await executeOdooKw<Array<{ project_id?: [number, string] | false }>>(
      "mfo.route",
      "search_read",
      [[["id", "=", routeId]]],
      {
        fields: ["project_id"],
        limit: 1,
      },
      connection,
    ).catch(() => []);
    const projectId = Array.isArray(routeRecords[0]?.project_id) ? routeRecords[0].project_id[0] : null;
    if (projectId) {
      await writeOdooRecord("project.project", projectId, { name: routeName }, connection);
    }
    await replaceGarbageRouteLines(routeId, pointIds, connection);
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Маршрут засах үед Odoo дээр алдаа гарлаа."),
      "routes",
    );
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Маршрут шинэчлэгдлээ.", "routes");
}

export async function archiveGarbageTransportRouteAction(formData: FormData) {
  const { connection } = await requireGarbageTransportHead();
  const routeId = parsePositiveId(formData.get("route_id"));

  if (!routeId) {
    redirectToSettings("error", "Маршрут сонгоно уу.", "routes");
  }

  try {
    await writeOdooRecord("mfo.route", routeId, { active: false }, connection);
  } catch (error) {
    redirectToSettings(
      "error",
      getErrorMessage(error, "Маршрут устгах үед Odoo дээр алдаа гарлаа."),
      "routes",
    );
  }

  revalidatePath(SETTINGS_PATH);
  redirectToSettings("notice", "Маршрут устгагдлаа.", "routes");
}
