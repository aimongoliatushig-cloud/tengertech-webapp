import "server-only";

import type { AppSession } from "@/lib/auth";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { loadDepartmentOptions, loadGarbageVehicleOptions } from "@/lib/workspace";
import {
  CHANGE_REASON_LABELS,
  GARBAGE_STATUS_LABELS,
  ISSUE_TYPE_LABELS,
  ODOO_MODELS,
  POINT_STATUS_LABELS,
  WEEKDAY_LABELS,
} from "@/lib/garbage-route-models";

type FieldInfo = {
  type?: string;
  relation?: string;
  readonly?: boolean;
  required?: boolean;
  selection?: Array<[string, string]>;
};
type FieldMap = Record<string, FieldInfo>;
type OdooRecord = Record<string, unknown> & { id: number };

export type GarbageRouteAction =
  | "weekly_create"
  | "weekly_edit"
  | "daily_change"
  | "today_view"
  | "point_execute"
  | "inspection_write"
  | "dashboard_view"
  | "all_view";

export type GarbageRoutePermissions = Record<GarbageRouteAction, boolean>;

export type GarbageRouteOption = {
  id: number;
  label: string;
  meta?: string;
};

export type GarbageRouteOptions = {
  permissions: GarbageRoutePermissions;
  roleLabel: string;
  vehicles: GarbageRouteOption[];
  drivers: GarbageRouteOption[];
  collectors: GarbageRouteOption[];
  inspectors: GarbageRouteOption[];
  teams: GarbageRouteOption[];
  routes: Array<GarbageRouteOption & { pointIds: number[]; pointNames: string[] }>;
  points: GarbageRouteOption[];
  departments: GarbageRouteOption[];
  weekdays: GarbageRouteOption[];
  statuses: string[];
  issueTypes: string[];
  changeReasons: string[];
};

export type WeeklyPlanInput = {
  name: string;
  referenceDate: string;
  departmentId?: number | null;
  assignments: Array<{
    id?: number;
    weekday: string;
    vehicleId?: number | null;
    driverId?: number | null;
    collectorIds: number[];
    teamId?: number | null;
    routeId?: number | null;
    pointIds: number[];
  }>;
};

export type DailyChangeInput = {
  reason: string;
  note?: string;
  vehicleId?: number | null;
  driverId?: number | null;
  collectorIds?: number[];
  routeId?: number | null;
  pointIds?: number[];
};

const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Ulaanbaatar";
const REQUIRED_PROOF_MESSAGE =
  "Өмнөх болон дараах зураг хавсаргаагүй бол асуудлын шалтгаан сонгоно уу.";

function connectionFromSession(session: AppSession): Partial<OdooConnection> {
  return {
    login: session.login,
    password: session.password,
  };
}

function relationId(value: unknown) {
  return Array.isArray(value) && typeof value[0] === "number" ? value[0] : null;
}

function relationName(value: unknown, fallback = "") {
  return Array.isArray(value) && typeof value[1] === "string" ? value[1] : fallback;
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value ? value : fallback;
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => Number.isInteger(item) && item > 0)
    : [];
}

function currentDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDate(value: string | false | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatDateTime(value: string | false | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function startOfWeek(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function weekdayForDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return String((date.getUTCDay() + 6) % 7);
}

function statusLabel(state: string) {
  return GARBAGE_STATUS_LABELS[state] ?? state ?? "Тодорхойгүй";
}

function pointStatusLabel(state: string) {
  return POINT_STATUS_LABELS[state] ?? state ?? "Тодорхойгүй";
}

function getRoleLabelForGarbage(session: AppSession) {
  if (session.role === "project_manager" || session.groupFlags?.mfoManager) {
    return "Хэлтсийн дарга";
  }
  if (session.groupFlags?.mfoInspector) {
    return "Хяналтын байцаагч";
  }
  if (session.role === "director" || session.role === "general_manager") {
    return "Удирдлага / Project Manager";
  }
  return "Жолооч / Хог ачигч";
}

export function getGarbageRoutePermissions(session: AppSession): GarbageRoutePermissions {
  const isAdmin = session.role === "system_admin";
  const isHead = isAdmin || session.role === "project_manager" || Boolean(session.groupFlags?.mfoManager);
  const isInspector = isAdmin || Boolean(session.groupFlags?.mfoInspector);
  const isExecutive = isAdmin || session.role === "director" || session.role === "general_manager";
  const isMobile = session.role === "worker" || Boolean(session.groupFlags?.mfoMobile);

  return {
    weekly_create: isHead,
    weekly_edit: isHead,
    daily_change: isHead,
    today_view: isMobile || isHead || isInspector || isExecutive,
    point_execute: isMobile || isAdmin,
    inspection_write: isInspector,
    dashboard_view: isHead || isExecutive,
    all_view: isHead || isInspector || isExecutive,
  };
}

function assertPermission(session: AppSession, action: GarbageRouteAction) {
  if (!getGarbageRoutePermissions(session)[action]) {
    throw new Error("Таны эрх хүрэхгүй байна.");
  }
}

async function fieldsForModel(model: string, connection: Partial<OdooConnection>) {
  return executeOdooKw<FieldMap>(
    model,
    "fields_get",
    [],
    { attributes: ["type", "relation", "readonly", "required", "selection"] },
    connection,
  );
}

function pickValues(values: Record<string, unknown>, fields: FieldMap | null) {
  if (!fields) {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
  }
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => {
      if (!fields[key] || fields[key].readonly || value === undefined || value === null || value === "") {
        return false;
      }
      return true;
    }),
  );
}

async function createRecord<T = number>(
  model: string,
  values: Record<string, unknown>,
  connection: Partial<OdooConnection>,
) {
  const fields = await fieldsForModel(model, connection).catch(() => null);
  return executeOdooKw<T>(model, "create", [pickValues(values, fields)], {}, connection);
}

async function writeRecord(
  model: string,
  ids: number[],
  values: Record<string, unknown>,
  connection: Partial<OdooConnection>,
) {
  const fields = await fieldsForModel(model, connection).catch(() => null);
  const supported = pickValues(values, fields);
  if (!Object.keys(supported).length) {
    return true;
  }
  return executeOdooKw<boolean>(model, "write", [ids, supported], {}, connection);
}

async function unlinkRecords(model: string, ids: number[], connection: Partial<OdooConnection>) {
  if (!ids.length) {
    return true;
  }
  return executeOdooKw<boolean>(model, "unlink", [ids], {}, connection);
}

export async function searchRead<T>(
  model: string,
  domain: unknown[],
  fields: string[],
  options: Record<string, unknown>,
  connection: Partial<OdooConnection>,
) {
  return executeOdooKw<T[]>(model, "search_read", [domain], { fields, ...options }, connection);
}

export async function createOdoo(model: string, values: Record<string, unknown>, connection: Partial<OdooConnection>) {
  return createRecord(model, values, connection);
}

export async function writeOdoo(
  model: string,
  ids: number[],
  values: Record<string, unknown>,
  connection: Partial<OdooConnection>,
) {
  return writeRecord(model, ids, values, connection);
}

export async function callOdooMethod<T>(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown>,
  connection: Partial<OdooConnection>,
) {
  return executeOdooKw<T>(model, method, args, kwargs, connection);
}

async function getCurrentEmployeeId(session: AppSession, connection: Partial<OdooConnection>) {
  const employees = await searchRead<{ id: number }>(
    ODOO_MODELS.employee,
    [["user_id", "=", session.uid]],
    ["id"],
    { limit: 1 },
    connection,
  ).catch(() => []);
  return employees[0]?.id ?? null;
}

async function loadRouteLines(routeIds: number[], connection: Partial<OdooConnection>) {
  if (!routeIds.length) {
    return [];
  }
  return searchRead<OdooRecord>(
    ODOO_MODELS.routeLine,
    [["route_id", "in", routeIds]],
    ["route_id", "sequence", "collection_point_id"],
    { order: "route_id asc, sequence asc, id asc", limit: 2000 },
    connection,
  ).catch(() => []);
}

async function loadRoutePointMap(routeIds: number[], connection: Partial<OdooConnection>) {
  const lines = await loadRouteLines(routeIds, connection);
  const map = new Map<number, { ids: number[]; names: string[] }>();
  for (const line of lines) {
    const routeId = relationId(line.route_id);
    const pointId = relationId(line.collection_point_id);
    if (!routeId || !pointId) {
      continue;
    }
    const item = map.get(routeId) ?? { ids: [], names: [] };
    item.ids.push(pointId);
    item.names.push(relationName(line.collection_point_id));
    map.set(routeId, item);
  }
  return map;
}

async function createRouteFromPoints(
  planName: string,
  weekday: string,
  pointIds: number[],
  connection: Partial<OdooConnection>,
) {
  const projectId = await createRecord<number>(
    ODOO_MODELS.project,
    {
      name: `${planName} - ${WEEKDAY_LABELS[weekday] ?? "Өдөр"}`,
      privacy_visibility: "employees",
      mfo_is_operation_project: true,
      mfo_operation_type: "garbage",
    },
    connection,
  );
  const routeId = await createRecord<number>(
    ODOO_MODELS.route,
    {
      name: `${planName} - ${WEEKDAY_LABELS[weekday] ?? "Өдөр"}`,
      project_id: projectId,
      active: true,
      operation_type: "garbage",
      shift_type: "morning",
    },
    connection,
  );
  await replaceRouteLines(routeId, pointIds, connection);
  return routeId;
}

async function replaceRouteLines(routeId: number, pointIds: number[], connection: Partial<OdooConnection>) {
  const existing = await searchRead<{ id: number }>(
    ODOO_MODELS.routeLine,
    [["route_id", "=", routeId]],
    ["id"],
    { limit: 1000 },
    connection,
  ).catch(() => []);
  await unlinkRecords(
    ODOO_MODELS.routeLine,
    existing.map((line) => line.id),
    connection,
  );
  for (const [index, pointId] of pointIds.entries()) {
    await createRecord(
      ODOO_MODELS.routeLine,
      {
        route_id: routeId,
        collection_point_id: pointId,
        sequence: index + 1,
      },
      connection,
    );
  }
}

export async function loadGarbageRouteOptions(session: AppSession): Promise<GarbageRouteOptions> {
  const connection = connectionFromSession(session);
  const [vehicles, employees, teams, routes, points, departments] = await Promise.all([
    loadGarbageVehicleOptions(connection).catch(() => []),
    searchRead<OdooRecord>(
      ODOO_MODELS.employee,
      [["active", "=", true]],
      ["name", "job_title", "department_id"],
      { order: "name asc", limit: 500 },
      connection,
    ).catch(() => []),
    searchRead<OdooRecord>(
      ODOO_MODELS.crewTeam,
      [["active", "=", true], ["operation_type", "=", "garbage"]],
      ["name", "vehicle_id", "driver_employee_id", "collector_employee_ids"],
      { order: "name asc", limit: 200 },
      connection,
    ).catch(() => []),
    searchRead<OdooRecord>(
      ODOO_MODELS.route,
      [["active", "=", true], ["operation_type", "=", "garbage"]],
      ["name", "code", "collection_point_count"],
      { order: "name asc", limit: 300 },
      connection,
    ).catch(() => []),
    searchRead<OdooRecord>(
      ODOO_MODELS.garbagePoint,
      [["active", "=", true], ["operation_type", "=", "garbage"]],
      ["name", "address", "subdistrict_id"],
      { order: "subdistrict_id asc, name asc", limit: 1000 },
      connection,
    ).catch(() => []),
    loadDepartmentOptions(connection).catch(() => []),
  ]);
  const pointMap = await loadRoutePointMap(
    routes.map((route) => route.id),
    connection,
  );
  const employeeOptions = employees.map((employee) => ({
    id: employee.id,
    label: textValue(employee.name, `#${employee.id}`),
    meta: [textValue(employee.job_title), relationName(employee.department_id)].filter(Boolean).join(" · "),
  }));

  return {
    permissions: getGarbageRoutePermissions(session),
    roleLabel: getRoleLabelForGarbage(session),
    vehicles: vehicles.map((vehicle) => ({ id: vehicle.id, label: vehicle.label })),
    drivers: employeeOptions,
    collectors: employeeOptions,
    inspectors: employeeOptions,
    teams: teams.map((team) => ({ id: team.id, label: textValue(team.name, `#${team.id}`), meta: relationName(team.vehicle_id) })),
    routes: routes.map((route) => {
      const pointsForRoute = pointMap.get(route.id) ?? { ids: [], names: [] };
      return {
        id: route.id,
        label: textValue(route.name, `#${route.id}`),
        meta: `${pointsForRoute.ids.length || Number(route.collection_point_count || 0)} хогийн цэг`,
        pointIds: pointsForRoute.ids,
        pointNames: pointsForRoute.names,
      };
    }),
    points: points.map((point) => ({
      id: point.id,
      label: textValue(point.name, `#${point.id}`),
      meta: [textValue(point.address), relationName(point.subdistrict_id)].filter(Boolean).join(" · "),
    })),
    departments: departments.map((department) => ({ id: department.id, label: department.name })),
    weekdays: Object.entries(WEEKDAY_LABELS).map(([id, label]) => ({ id: Number(id), label })),
    statuses: Object.values(GARBAGE_STATUS_LABELS),
    issueTypes: [...ISSUE_TYPE_LABELS],
    changeReasons: [...CHANGE_REASON_LABELS],
  };
}

export async function loadWeeklyPlans(session: AppSession) {
  assertPermission(session, "all_view");
  const connection = connectionFromSession(session);
  const plans = await searchRead<OdooRecord>(
    ODOO_MODELS.weeklyRoutePlan,
    [["operation_type", "=", "garbage"]],
    ["name", "reference_date", "last_generated_week_start", "line_ids", "write_date"],
    { order: "write_date desc", limit: 80 },
    connection,
  );
  const lineIds = Array.from(new Set(plans.flatMap((plan) => numberArray(plan.line_ids))));
  const lines = lineIds.length
    ? await searchRead<OdooRecord>(
        ODOO_MODELS.weeklyRoutePlanLine,
        [["id", "in", lineIds]],
        ["template_id", "weekday", "vehicle_id", "driver_employee_id", "collector_employee_ids", "route_id"],
        { order: "weekday asc, sequence asc, id asc", limit: lineIds.length },
        connection,
      )
    : [];
  const linesByPlan = new Map<number, OdooRecord[]>();
  for (const line of lines) {
    const planId = relationId(line.template_id);
    if (!planId) {
      continue;
    }
    linesByPlan.set(planId, [...(linesByPlan.get(planId) ?? []), line]);
  }
  const routePointMap = await loadRoutePointMap(
    Array.from(new Set(lines.map((line) => relationId(line.route_id)).filter((id): id is number => Boolean(id)))),
    connection,
  );

  return {
    permissions: getGarbageRoutePermissions(session),
    plans: plans.map((plan) => {
      const planLines = linesByPlan.get(plan.id) ?? [];
      const pointCount = planLines.reduce((sum, line) => {
        const routeId = relationId(line.route_id);
        return sum + (routeId ? routePointMap.get(routeId)?.ids.length ?? 0 : 0);
      }, 0);
      return {
        id: plan.id,
        name: textValue(plan.name, `Төлөвлөгөө #${plan.id}`),
        week: formatDate(textValue(plan.reference_date) || startOfWeek(currentDateKey())),
        referenceDate: textValue(plan.reference_date),
        vehicleCount: new Set(planLines.map((line) => relationId(line.vehicle_id)).filter(Boolean)).size,
        driverNames: Array.from(new Set(planLines.map((line) => relationName(line.driver_employee_id)).filter(Boolean))).join(", "),
        collectorCount: new Set(planLines.flatMap((line) => numberArray(line.collector_employee_ids))).size,
        pointCount,
        statusLabel: plan.last_generated_week_start ? "Төлөвлөгдсөн" : "Ноорог",
        updatedAt: formatDateTime(textValue(plan.write_date)),
      };
    }),
  };
}

export async function loadWeeklyPlan(session: AppSession, planId: number) {
  assertPermission(session, "all_view");
  const connection = connectionFromSession(session);
  const plans = await searchRead<OdooRecord>(
    ODOO_MODELS.weeklyRoutePlan,
    [["id", "=", planId]],
    ["name", "reference_date", "last_generated_week_start", "line_ids", "note", "write_date"],
    { limit: 1 },
    connection,
  );
  const plan = plans[0];
  if (!plan) {
    return null;
  }
  const lineIds = numberArray(plan.line_ids);
  const lines = lineIds.length
    ? await searchRead<OdooRecord>(
        ODOO_MODELS.weeklyRoutePlanLine,
        [["id", "in", lineIds]],
        [
          "weekday",
          "sequence",
          "vehicle_id",
          "driver_employee_id",
          "collector_employee_ids",
          "crew_team_id",
          "route_id",
          "note",
        ],
        { order: "weekday asc, sequence asc, id asc", limit: lineIds.length },
        connection,
      )
    : [];
  const employees = new Map<number, string>();
  const collectorIds = Array.from(new Set(lines.flatMap((line) => numberArray(line.collector_employee_ids))));
  if (collectorIds.length) {
    const rows = await searchRead<OdooRecord>(
      ODOO_MODELS.employee,
      [["id", "in", collectorIds]],
      ["name"],
      { limit: collectorIds.length },
      connection,
    ).catch(() => []);
    rows.forEach((row) => employees.set(row.id, textValue(row.name, `#${row.id}`)));
  }
  const routePointMap = await loadRoutePointMap(
    Array.from(new Set(lines.map((line) => relationId(line.route_id)).filter((id): id is number => Boolean(id)))),
    connection,
  );
  return {
    permissions: getGarbageRoutePermissions(session),
    plan: {
      id: plan.id,
      name: textValue(plan.name, `Төлөвлөгөө #${plan.id}`),
      referenceDate: textValue(plan.reference_date),
      week: formatDate(textValue(plan.reference_date)),
      note: textValue(plan.note),
      updatedAt: formatDateTime(textValue(plan.write_date)),
      lines: lines.map((line) => {
        const routeId = relationId(line.route_id);
        const pointsForRoute = routeId ? routePointMap.get(routeId) : null;
        const ids = numberArray(line.collector_employee_ids);
        return {
          id: line.id,
          weekday: textValue(line.weekday),
          weekdayLabel: WEEKDAY_LABELS[textValue(line.weekday)] ?? textValue(line.weekday),
          vehicleId: relationId(line.vehicle_id),
          vehicleName: relationName(line.vehicle_id, "Машин оноогоогүй"),
          driverId: relationId(line.driver_employee_id),
          driverName: relationName(line.driver_employee_id, "Жолооч оноогоогүй"),
          collectorIds: ids,
          collectorNames: ids.map((id) => employees.get(id) ?? `#${id}`),
          teamId: relationId(line.crew_team_id),
          teamName: relationName(line.crew_team_id),
          routeId,
          routeName: relationName(line.route_id, "Маршрут оноогоогүй"),
          pointIds: pointsForRoute?.ids ?? [],
          pointNames: pointsForRoute?.names ?? [],
        };
      }),
    },
  };
}

export async function saveWeeklyPlan(session: AppSession, input: WeeklyPlanInput, planId?: number) {
  assertPermission(session, planId ? "weekly_edit" : "weekly_create");
  const connection = connectionFromSession(session);
  if (!input.name.trim()) {
    throw new Error("Төлөвлөгөөний нэр оруулна уу.");
  }
  const referenceDate = startOfWeek(input.referenceDate || currentDateKey());
  const templateId =
    planId ??
    (await createRecord<number>(
      ODOO_MODELS.weeklyRoutePlan,
      {
        name: input.name.trim(),
        reference_date: referenceDate,
        operation_type: "garbage",
      },
      connection,
    ));
  if (planId) {
    await writeRecord(
      ODOO_MODELS.weeklyRoutePlan,
      [planId],
      { name: input.name.trim(), reference_date: referenceDate },
      connection,
    );
    const oldLines = await searchRead<{ id: number }>(
      ODOO_MODELS.weeklyRoutePlanLine,
      [["template_id", "=", planId]],
      ["id"],
      { limit: 1000 },
      connection,
    ).catch(() => []);
    await unlinkRecords(
      ODOO_MODELS.weeklyRoutePlanLine,
      oldLines.map((line) => line.id),
      connection,
    );
  }
  for (const [index, assignment] of input.assignments.entries()) {
    const collectorIds = assignment.collectorIds.filter((id) => Number.isInteger(id) && id > 0).slice(0, 2);
    const routeId =
      assignment.routeId ||
      (assignment.pointIds.length
        ? await createRouteFromPoints(input.name.trim(), assignment.weekday, assignment.pointIds, connection)
        : null);
    if (routeId && assignment.pointIds.length && assignment.routeId) {
      await replaceRouteLines(routeId, assignment.pointIds, connection);
    }
    await createRecord(
      ODOO_MODELS.weeklyRoutePlanLine,
      {
        template_id: templateId,
        weekday: assignment.weekday,
        sequence: index + 1,
        vehicle_id: assignment.vehicleId,
        driver_employee_id: assignment.driverId,
        collector_employee_ids: collectorIds.length ? [[6, 0, collectorIds]] : undefined,
        crew_team_id: assignment.teamId,
        route_id: routeId,
      },
      connection,
    );
  }
  return { id: templateId };
}

async function loadRouteProject(routeId: number, connection: Partial<OdooConnection>) {
  const routes = await searchRead<OdooRecord>(
    ODOO_MODELS.route,
    [["id", "=", routeId]],
    ["name", "project_id"],
    { limit: 1 },
    connection,
  );
  return routes[0] ?? null;
}

async function createStopLinesForTask(taskId: number, routeId: number, connection: Partial<OdooConnection>) {
  const lines = await loadRouteLines([routeId], connection);
  for (const [index, line] of lines.entries()) {
    const pointId = relationId(line.collection_point_id);
    if (!pointId) {
      continue;
    }
    await createRecord(
      ODOO_MODELS.routePointLine,
      {
        task_id: taskId,
        route_line_id: line.id,
        collection_point_id: pointId,
        sequence: Number(line.sequence || index + 1),
        status: "draft",
        planned_arrival_hour: line.planned_arrival_hour,
        planned_service_minutes: line.planned_service_minutes,
      },
      connection,
    );
  }
}

export async function generateTodayTasks(session: AppSession, requestedDate?: string) {
  assertPermission(session, "weekly_edit");
  const connection = connectionFromSession(session);
  const dateKey = requestedDate || currentDateKey();
  const weekday = weekdayForDate(dateKey);
  const plans = await searchRead<OdooRecord>(
    ODOO_MODELS.weeklyRoutePlan,
    [["operation_type", "=", "garbage"]],
    ["name", "reference_date", "line_ids"],
    { order: "write_date desc", limit: 20 },
    connection,
  );
  const lineIds = plans.flatMap((plan) => numberArray(plan.line_ids));
  const lines = lineIds.length
    ? await searchRead<OdooRecord>(
        ODOO_MODELS.weeklyRoutePlanLine,
        [["id", "in", lineIds], ["weekday", "=", weekday]],
        ["template_id", "route_id", "vehicle_id", "driver_employee_id", "collector_employee_ids", "crew_team_id"],
        { order: "sequence asc, id asc", limit: lineIds.length },
        connection,
      )
    : [];
  const created: number[] = [];
  for (const line of lines) {
    const routeId = relationId(line.route_id);
    if (!routeId) {
      continue;
    }
    const existing = await searchRead<OdooRecord>(
      ODOO_MODELS.dailyRouteTask,
      [
        ["mfo_shift_date", "=", dateKey],
        ["mfo_route_id", "=", routeId],
        ["mfo_vehicle_id", "=", relationId(line.vehicle_id)],
      ],
      ["id"],
      { limit: 1 },
      connection,
    ).catch(() => []);
    if (existing.length) {
      continue;
    }
    const route = await loadRouteProject(routeId, connection);
    const projectId = relationId(route?.project_id);
    if (!projectId) {
      continue;
    }
    const taskId = await createRecord<number>(
      ODOO_MODELS.dailyRouteTask,
      {
        name: `${formatDate(dateKey)} - ${relationName(line.vehicle_id, "Машин")} - ${relationName(route?.project_id, "Маршрут")}`,
        project_id: projectId,
        mfo_shift_date: dateKey,
        mfo_vehicle_id: relationId(line.vehicle_id),
        mfo_driver_employee_id: relationId(line.driver_employee_id),
        mfo_collector_employee_ids: numberArray(line.collector_employee_ids).length
          ? [[6, 0, numberArray(line.collector_employee_ids).slice(0, 2)]]
          : undefined,
        mfo_crew_team_id: relationId(line.crew_team_id),
        mfo_route_id: routeId,
        mfo_planning_template_line_id: line.id,
        mfo_state: "dispatched",
      },
      connection,
    );
    await createStopLinesForTask(taskId, routeId, connection);
    created.push(taskId);
  }
  return { ok: true, createdCount: created.length, taskIds: created };
}

async function loadCollectors(namesForIds: number[], connection: Partial<OdooConnection>) {
  if (!namesForIds.length) {
    return new Map<number, string>();
  }
  const rows = await searchRead<OdooRecord>(
    ODOO_MODELS.employee,
    [["id", "in", namesForIds]],
    ["name"],
    { limit: namesForIds.length },
    connection,
  ).catch(() => []);
  return new Map(rows.map((row) => [row.id, textValue(row.name, `#${row.id}`)]));
}

async function normalizeTask(task: OdooRecord, connection: Partial<OdooConnection>, includeStops = false) {
  const collectorIds = numberArray(task.mfo_collector_employee_ids);
  const collectorNames = await loadCollectors(collectorIds, connection);
  const stops = includeStops
    ? await loadStopLines(task.id, connection)
    : [];
  const completed = stops.filter((stop) => stop.status === "done").length;
  const next = stops.find((stop) => stop.status !== "done");
  return {
    id: task.id,
    name: textValue(task.name, `Маршрут #${task.id}`),
    date: textValue(task.mfo_shift_date),
    dateLabel: formatDate(textValue(task.mfo_shift_date)),
    vehicleId: relationId(task.mfo_vehicle_id),
    vehicleName: relationName(task.mfo_vehicle_id, "Машин оноогоогүй"),
    driverId: relationId(task.mfo_driver_employee_id),
    driverName: relationName(task.mfo_driver_employee_id, "Жолооч оноогоогүй"),
    collectorIds,
    collectorNames: collectorIds.map((id) => collectorNames.get(id) ?? `#${id}`),
    teamName: relationName(task.mfo_crew_team_id),
    routeId: relationId(task.mfo_route_id),
    routeName: relationName(task.mfo_route_id, "Маршрут оноогоогүй"),
    status: textValue(task.mfo_state, "draft"),
    statusLabel: statusLabel(textValue(task.mfo_state, "draft")),
    progress: Math.round(Number(task.ops_progress_percent ?? task.mfo_progress_percent ?? 0)),
    stopCount: Number(task.mfo_stop_count ?? stops.length ?? 0),
    completedStopCount: Number(task.mfo_completed_stop_count ?? completed),
    skippedStopCount: Number(task.mfo_skipped_stop_count ?? 0),
    issueCount: Number(task.mfo_issue_count ?? 0),
    nextPointName: next?.pointName ?? "Дараагийн цэг алга",
    changed: Boolean(task.mfo_last_reassignment_reason),
    lastChangeReason: textValue(task.mfo_last_reassignment_reason),
    href: `/garbage-routes/execution/${task.id}`,
    stops,
  };
}

async function loadStopLines(taskId: number, connection: Partial<OdooConnection>) {
  const lines = await searchRead<OdooRecord>(
    ODOO_MODELS.routePointLine,
    [["task_id", "=", taskId]],
    [
      "task_id",
      "collection_point_id",
      "route_line_id",
      "sequence",
      "status",
      "arrival_datetime",
      "departure_datetime",
      "skip_reason",
      "note",
      "proof_count",
      "issue_count",
    ],
    { order: "sequence asc, id asc", limit: 1000 },
    connection,
  ).catch(() => []);
  return lines.map((line) => ({
    id: line.id,
    taskId,
    sequence: Number(line.sequence || 0),
    pointId: relationId(line.collection_point_id),
    pointName: relationName(line.collection_point_id, "Хогийн цэг"),
    status: textValue(line.status, "draft"),
    statusLabel: pointStatusLabel(textValue(line.status, "draft")),
    arrivedAt: formatDateTime(textValue(line.arrival_datetime)),
    completedAt: formatDateTime(textValue(line.departure_datetime)),
    skipReason: textValue(line.skip_reason),
    note: textValue(line.note),
    proofCount: Number(line.proof_count ?? 0),
    issueCount: Number(line.issue_count ?? 0),
  }));
}

export async function loadTodayRoutes(session: AppSession, requestedDate?: string) {
  assertPermission(session, "today_view");
  const connection = connectionFromSession(session);
  const dateKey = requestedDate || currentDateKey();
  const employeeId = await getCurrentEmployeeId(session, connection);
  const permissions = getGarbageRoutePermissions(session);
  const domain: unknown[] = [["mfo_shift_date", "=", dateKey], ["mfo_route_id", "!=", false]];
  if (!permissions.all_view && employeeId) {
    domain.push("|", ["mfo_driver_employee_id", "=", employeeId], ["mfo_collector_employee_ids", "in", [employeeId]]);
  }
  const tasks = await searchRead<OdooRecord>(
    ODOO_MODELS.dailyRouteTask,
    domain,
    [
      "name",
      "mfo_shift_date",
      "mfo_vehicle_id",
      "mfo_driver_employee_id",
      "mfo_collector_employee_ids",
      "mfo_crew_team_id",
      "mfo_route_id",
      "mfo_state",
      "mfo_stop_count",
      "mfo_completed_stop_count",
      "mfo_skipped_stop_count",
      "mfo_issue_count",
      "ops_progress_percent",
      "mfo_progress_percent",
      "mfo_last_reassignment_reason",
    ],
    { order: "mfo_vehicle_id asc, id asc", limit: 200 },
    connection,
  ).catch(() => []);
  return {
    permissions,
    date: dateKey,
    dateLabel: formatDate(dateKey),
    routes: await Promise.all(tasks.map((task) => normalizeTask(task, connection, true))),
  };
}

export async function loadDailyRoute(session: AppSession, taskId: number) {
  assertPermission(session, "today_view");
  const connection = connectionFromSession(session);
  const tasks = await searchRead<OdooRecord>(
    ODOO_MODELS.dailyRouteTask,
    [["id", "=", taskId]],
    [
      "name",
      "mfo_shift_date",
      "mfo_vehicle_id",
      "mfo_driver_employee_id",
      "mfo_collector_employee_ids",
      "mfo_crew_team_id",
      "mfo_route_id",
      "mfo_state",
      "mfo_stop_count",
      "mfo_completed_stop_count",
      "mfo_skipped_stop_count",
      "mfo_issue_count",
      "ops_progress_percent",
      "mfo_progress_percent",
      "mfo_last_reassignment_reason",
      "mfo_planning_template_line_id",
    ],
    { limit: 1 },
    connection,
  );
  const task = tasks[0];
  if (!task) {
    return null;
  }
  const route = await normalizeTask(task, connection, true);
  const [proofs, issues] = await Promise.all([
    searchRead<OdooRecord>(
      ODOO_MODELS.proofImage,
      [["task_id", "=", taskId]],
      ["name", "proof_type", "stop_line_id", "capture_datetime", "uploader_employee_id", "description"],
      { order: "capture_datetime desc", limit: 500 },
      connection,
    ).catch(() => []),
    searchRead<OdooRecord>(
      ODOO_MODELS.issueReport,
      [["task_id", "=", taskId]],
      ["name", "issue_type", "description", "severity", "state", "stop_line_id", "report_datetime", "reporter_employee_id"],
      { order: "report_datetime desc", limit: 500 },
      connection,
    ).catch(() => []),
  ]);
  return {
    permissions: getGarbageRoutePermissions(session),
    route,
    proofs: proofs.map((proof) => ({
      id: proof.id,
      name: textValue(proof.name),
      type: textValue(proof.proof_type),
      typeLabel: textValue(proof.proof_type) === "before" ? "Өмнөх зураг" : textValue(proof.proof_type) === "after" ? "Дараах зураг" : "Зураг",
      stopLineId: relationId(proof.stop_line_id),
      uploadedBy: relationName(proof.uploader_employee_id, "Ажилтан"),
      uploadedAt: formatDateTime(textValue(proof.capture_datetime)),
      description: textValue(proof.description),
    })),
    issues: issues.map((issue) => ({
      id: issue.id,
      title: textValue(issue.name),
      type: textValue(issue.issue_type),
      description: textValue(issue.description),
      severity: textValue(issue.severity),
      state: textValue(issue.state),
      stopLineId: relationId(issue.stop_line_id),
      reporter: relationName(issue.reporter_employee_id, "Ажилтан"),
      date: formatDateTime(textValue(issue.report_datetime)),
    })),
  };
}

async function validateSequentialAccess(
  stopLineId: number,
  skipReason: string | null,
  connection: Partial<OdooConnection>,
) {
  const lines = await searchRead<OdooRecord>(
    ODOO_MODELS.routePointLine,
    [["id", "=", stopLineId]],
    ["task_id", "sequence", "status"],
    { limit: 1 },
    connection,
  );
  const line = lines[0];
  if (!line) {
    throw new Error("Маршрут олдсонгүй.");
  }
  const taskId = relationId(line.task_id);
  const sequence = Number(line.sequence || 0);
  if (!taskId || sequence <= 1) {
    return line;
  }
  const previous = await searchRead<OdooRecord>(
    ODOO_MODELS.routePointLine,
    [["task_id", "=", taskId], ["sequence", "<", sequence], ["status", "!=", "done"]],
    ["id"],
    { limit: 1 },
    connection,
  ).catch(() => []);
  if (previous.length && !skipReason?.trim()) {
    throw new Error("Та өмнөх цэгийг дуусгаагүй байна. Алгасах шалтгаанаа оруулна уу.");
  }
  if (previous.length && skipReason?.trim()) {
    await writeRecord(ODOO_MODELS.routePointLine, [previous[0].id], { status: "skipped", skip_reason: skipReason.trim() }, connection);
  }
  return line;
}

export async function markPointArrived(session: AppSession, stopLineId: number, skipReason?: string) {
  assertPermission(session, "point_execute");
  const connection = connectionFromSession(session);
  const line = await validateSequentialAccess(stopLineId, skipReason || null, connection);
  await writeRecord(
    ODOO_MODELS.routePointLine,
    [stopLineId],
    { status: "arrived", arrival_datetime: new Date().toISOString().replace("T", " ").slice(0, 19) },
    connection,
  );
  const taskId = relationId(line.task_id);
  if (taskId) {
    await writeRecord(ODOO_MODELS.dailyRouteTask, [taskId], { mfo_state: "in_progress" }, connection);
  }
  return { ok: true };
}

async function fileToBase64(file: File) {
  return Buffer.from(await file.arrayBuffer()).toString("base64");
}

export async function uploadAttachment(
  model: string,
  resId: number,
  file: File,
  attachmentType: string,
  connection: Partial<OdooConnection>,
) {
  const datas = await fileToBase64(file);
  return createRecord<number>(
    ODOO_MODELS.attachment,
    {
      name: file.name || attachmentType,
      datas,
      mimetype: file.type || "application/octet-stream",
      res_model: model,
      res_id: resId,
      description: attachmentType,
    },
    connection,
  );
}

export async function uploadPointProof(
  session: AppSession,
  stopLineId: number,
  proofType: "before" | "after",
  file: File,
) {
  assertPermission(session, "point_execute");
  const connection = connectionFromSession(session);
  const lines = await searchRead<OdooRecord>(
    ODOO_MODELS.routePointLine,
    [["id", "=", stopLineId]],
    ["task_id", "collection_point_id"],
    { limit: 1 },
    connection,
  );
  const line = lines[0];
  if (!line) {
    throw new Error("Маршрут олдсонгүй.");
  }
  const taskId = relationId(line.task_id);
  if (!taskId) {
    throw new Error("Маршрут олдсонгүй.");
  }
  const attachmentType = proofType === "before" ? "Өмнөх зураг" : "Дараах зураг";
  const datas = await fileToBase64(file);
  const proofId = await createRecord<number>(
    ODOO_MODELS.proofImage,
    {
      name: `${attachmentType} - ${relationName(line.collection_point_id, "Хогийн цэг")}`,
      task_id: taskId,
      stop_line_id: stopLineId,
      proof_type: proofType,
      capture_datetime: new Date().toISOString().replace("T", " ").slice(0, 19),
      image_1920: datas,
      description: attachmentType,
    },
    connection,
  );
  const attachmentId = await uploadAttachment(ODOO_MODELS.routePointLine, stopLineId, file, attachmentType, connection);
  await uploadAttachment(ODOO_MODELS.dailyRouteTask, taskId, file, attachmentType, connection).catch(() => null);
  return { ok: true, proofId, attachmentId };
}

function mapIssueType(label: string) {
  if (label.includes("Зам") || label.includes("Цэг")) {
    return "route";
  }
  if (label.includes("Машин")) {
    return "vehicle";
  }
  if (label.includes("Иргэн")) {
    return "citizen";
  }
  return "other";
}

export async function reportPointIssue(
  session: AppSession,
  stopLineId: number,
  issueTypeLabel: string,
  note: string,
  file?: File | null,
) {
  assertPermission(session, "point_execute");
  const connection = connectionFromSession(session);
  const lines = await searchRead<OdooRecord>(
    ODOO_MODELS.routePointLine,
    [["id", "=", stopLineId]],
    ["task_id", "collection_point_id"],
    { limit: 1 },
    connection,
  );
  const line = lines[0];
  const taskId = relationId(line?.task_id);
  if (!line || !taskId) {
    throw new Error("Маршрут олдсонгүй.");
  }
  const issueId = await createRecord<number>(
    ODOO_MODELS.issueReport,
    {
      name: issueTypeLabel || "Асуудалтай",
      task_id: taskId,
      stop_line_id: stopLineId,
      issue_type: mapIssueType(issueTypeLabel),
      severity: issueTypeLabel.includes("эвдэрсэн") ? "high" : "medium",
      state: "new",
      report_datetime: new Date().toISOString().replace("T", " ").slice(0, 19),
      description: [issueTypeLabel, note].filter(Boolean).join("\n"),
    },
    connection,
  );
  if (file && file.size) {
    await uploadAttachment(ODOO_MODELS.issueReport, issueId, file, "Асуудлын зураг", connection);
    await uploadAttachment(ODOO_MODELS.routePointLine, stopLineId, file, "Асуудлын зураг", connection).catch(() => null);
  }
  await writeRecord(ODOO_MODELS.routePointLine, [stopLineId], { status: "issue", skip_reason: issueTypeLabel, note }, connection);
  return { ok: true, issueId };
}

export async function completePoint(
  session: AppSession,
  stopLineId: number,
  note?: string,
  issueReason?: string,
) {
  assertPermission(session, "point_execute");
  const connection = connectionFromSession(session);
  const lines = await searchRead<OdooRecord>(
    ODOO_MODELS.routePointLine,
    [["id", "=", stopLineId]],
    ["task_id"],
    { limit: 1 },
    connection,
  );
  const taskId = relationId(lines[0]?.task_id);
  if (!taskId) {
    throw new Error("Маршрут олдсонгүй.");
  }
  const proofs = await searchRead<OdooRecord>(
    ODOO_MODELS.proofImage,
    [["stop_line_id", "=", stopLineId]],
    ["proof_type"],
    { limit: 20 },
    connection,
  ).catch(() => []);
  const types = new Set(proofs.map((proof) => textValue(proof.proof_type)));
  if ((!types.has("before") || !types.has("after")) && !issueReason?.trim()) {
    throw new Error(REQUIRED_PROOF_MESSAGE);
  }
  if (issueReason?.trim()) {
    await reportPointIssue(session, stopLineId, issueReason.trim(), note || "");
    return { ok: true, status: "issue" };
  }
  await writeRecord(
    ODOO_MODELS.routePointLine,
    [stopLineId],
    {
      status: "done",
      departure_datetime: new Date().toISOString().replace("T", " ").slice(0, 19),
      note,
    },
    connection,
  );
  return { ok: true, status: "done" };
}

export async function changeDailyRoute(session: AppSession, taskId: number, input: DailyChangeInput) {
  assertPermission(session, "daily_change");
  if (!input.reason?.trim()) {
    throw new Error("Өөрчлөлтийн шалтгаан оруулна уу.");
  }
  const connection = connectionFromSession(session);
  const old = await loadDailyRoute(session, taskId);
  if (!old) {
    throw new Error("Маршрут олдсонгүй.");
  }
  await writeRecord(
    ODOO_MODELS.dailyRouteTask,
    [taskId],
    {
      mfo_vehicle_id: input.vehicleId,
      mfo_driver_employee_id: input.driverId,
      mfo_collector_employee_ids: input.collectorIds?.length ? [[6, 0, input.collectorIds.slice(0, 2)]] : undefined,
      mfo_route_id: input.routeId,
      mfo_last_reassignment_reason: input.reason,
    },
    connection,
  );
  if (input.pointIds?.length) {
    const stopLines = await searchRead<OdooRecord>(
      ODOO_MODELS.routePointLine,
      [["task_id", "=", taskId]],
      ["id", "status"],
      { limit: 1000 },
      connection,
    ).catch(() => []);
    const unfinished = stopLines.filter((line) => textValue(line.status) !== "done").map((line) => line.id);
    await unlinkRecords(ODOO_MODELS.routePointLine, unfinished, connection);
    for (const [index, pointId] of input.pointIds.entries()) {
      await createRecord(
        ODOO_MODELS.routePointLine,
        { task_id: taskId, collection_point_id: pointId, sequence: index + 1, status: "draft", skip_reason: input.reason },
        connection,
      );
    }
  }
  await createRecord(
    ODOO_MODELS.issueReport,
    {
      name: "Өдрийн явцад өөрчлөгдсөн",
      task_id: taskId,
      issue_type: input.reason.includes("Машин") ? "vehicle" : input.reason.includes("Маршрут") ? "route" : "crew",
      severity: "medium",
      state: "new",
      report_datetime: new Date().toISOString().replace("T", " ").slice(0, 19),
      description: [
        `Шалтгаан: ${input.reason}`,
        input.note ? `Тайлбар: ${input.note}` : "",
        `Хуучин: ${old.route.vehicleName}, ${old.route.driverName}, ${old.route.routeName}`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    connection,
  );
  return { ok: true };
}

export async function loadInspections(session: AppSession) {
  assertPermission(session, "all_view");
  const connection = connectionFromSession(session);
  const reports = await searchRead<OdooRecord>(
    ODOO_MODELS.inspectionReport,
    [["issue_type", "in", ["safety", "citizen", "other", "route", "vehicle", "crew"]]],
    ["name", "task_id", "stop_line_id", "description", "severity", "state", "report_datetime", "reporter_employee_id"],
    { order: "report_datetime desc", limit: 120 },
    connection,
  ).catch(() => []);
  return {
    permissions: getGarbageRoutePermissions(session),
    inspections: reports.map((report) => ({
      id: report.id,
      title: textValue(report.name, "Хяналтын тайлан"),
      routeName: relationName(report.task_id),
      pointName: relationName(report.stop_line_id),
      description: textValue(report.description),
      severity: textValue(report.severity),
      state: textValue(report.state),
      inspector: relationName(report.reporter_employee_id, "Хяналтын байцаагч"),
      date: formatDateTime(textValue(report.report_datetime)),
    })),
  };
}

export async function createInspectionReport(
  session: AppSession,
  input: {
    taskId: number;
    stopLineId?: number | null;
    title: string;
    comment: string;
    hasViolation: boolean;
    violationType?: string;
    rating?: string;
    file?: File | null;
  },
) {
  assertPermission(session, "inspection_write");
  const connection = connectionFromSession(session);
  if (!input.taskId || !input.comment.trim()) {
    throw new Error("Хяналтын тайлбар заавал оруулна уу.");
  }
  const reportId = await createRecord<number>(
    ODOO_MODELS.inspectionReport,
    {
      name: input.title || "Хяналтын тайлан",
      task_id: input.taskId,
      stop_line_id: input.stopLineId || undefined,
      issue_type: input.hasViolation ? mapIssueType(input.violationType || "Бусад") : "other",
      severity: input.hasViolation ? "medium" : "low",
      state: "new",
      report_datetime: new Date().toISOString().replace("T", " ").slice(0, 19),
      description: [
        input.comment,
        input.hasViolation ? `Зөрчлийн төрөл: ${input.violationType || "Бусад"}` : "Зөрчил илрээгүй",
        input.rating ? `Үнэлгээ: ${input.rating}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    connection,
  );
  if (input.file && input.file.size) {
    await uploadAttachment(ODOO_MODELS.inspectionReport, reportId, input.file, "Хяналтын зураг", connection);
  }
  return { ok: true, id: reportId };
}

export async function loadGarbageDashboard(session: AppSession) {
  assertPermission(session, "dashboard_view");
  const today = await loadTodayRoutes(session);
  const inspections = await loadInspections(session).catch(() => ({ inspections: [] }));
  const routes = today.routes;
  const done = routes.filter((route) => route.statusLabel === "Дууссан").length;
  const progress = routes.filter((route) => route.statusLabel === "Явцтай").length;
  const problem = routes.filter((route) => route.issueCount > 0 || route.statusLabel === "Асуудалтай").length;
  const incomplete = routes.filter((route) => route.statusLabel === "Дутуу" || route.skippedStopCount > 0).length;
  return {
    permissions: getGarbageRoutePermissions(session),
    date: today.date,
    dateLabel: today.dateLabel,
    kpis: [
      { label: "Өнөөдрийн маршрут", value: String(routes.length) },
      { label: "Дууссан", value: String(done) },
      { label: "Явцтай", value: String(progress) },
      { label: "Дутуу", value: String(incomplete) },
      { label: "Асуудалтай", value: String(problem) },
      { label: "Хяналтын тайлан", value: String(inspections.inspections.length) },
    ],
    byVehicle: routes.map((route) => ({
      label: route.vehicleName,
      value: route.completedStopCount,
      total: route.stopCount,
      status: route.statusLabel,
    })),
    byDriver: routes.map((route) => ({
      label: route.driverName,
      value: route.completedStopCount,
      total: route.stopCount,
      status: route.statusLabel,
    })),
    byPoint: routes.flatMap((route) =>
      route.stops.map((stop) => ({
        label: stop.pointName,
        route: route.vehicleName,
        status: stop.statusLabel,
      })),
    ),
    routes,
    inspections: inspections.inspections.slice(0, 8),
  };
}
