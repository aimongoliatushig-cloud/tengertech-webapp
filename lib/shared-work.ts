import "server-only";

import type { AppSession } from "@/lib/auth";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { fixMojibakeText } from "@/lib/text-normalize";

type Relation = [number, string] | false;

type SharedWorkRecord = {
  id: number;
  name: string;
  code?: string | false;
  description?: string | false;
  location_text?: string | false;
  priority?: string | false;
  planned_start_date?: string | false;
  planned_end_date?: string | false;
  status?: SharedWorkStatus | false;
  created_by?: Relation;
  created_department_id?: Relation;
  involved_department_ids?: number[];
  progress_percent?: number;
  attachment_ids?: number[];
};

type SharedDepartmentTaskRecord = {
  id: number;
  shared_work_id?: Relation;
  department_id?: Relation;
  department_head_id?: Relation;
  assigned_employee_ids?: number[];
  assigned_vehicle_ids?: number[];
  team_ids?: number[];
  route_ids?: number[];
  operational_task_ids?: number[];
  status?: DepartmentTaskStatus | false;
  progress_percent?: number;
  notes?: string | false;
  started_at?: string | false;
  completed_at?: string | false;
};

type SharedReportRecord = {
  id: number;
  shared_work_id?: Relation;
  department_task_id?: Relation;
  employee_id?: Relation;
  note?: string | false;
  image_ids?: number[];
  created_at?: string | false;
  latitude?: number;
  longitude?: number;
};

type DepartmentRecord = {
  id: number;
  name: string;
  manager_id?: Relation;
};

type EmployeeRecord = {
  id: number;
  name: string;
  department_id?: Relation;
  user_id?: Relation;
  job_id?: Relation;
  job_title?: string | false;
};

type VehicleRecord = {
  id: number;
  name?: string | false;
  license_plate?: string | false;
  municipal_department_id?: Relation;
  department_id?: Relation;
};

type TeamRecord = {
  id: number;
  name: string;
  operation_type?: string | false;
};

type RouteRecord = {
  id: number;
  name: string;
  department_id?: Relation;
};

export type SharedWorkStatus =
  | "draft"
  | "planned"
  | "in_progress"
  | "partially_completed"
  | "completed"
  | "cancelled";

export type DepartmentTaskStatus =
  | "pending"
  | "planned"
  | "in_progress"
  | "completed"
  | "blocked"
  | "cancelled";

export type SharedWorkFilter = "all" | "mine" | "progress" | "completed" | "reports";

export type SharedWorkOption = {
  id: number;
  name: string;
  note?: string;
  departmentId?: number | null;
};

export type SharedWorkDepartmentTask = {
  id: number;
  sharedWorkId: number;
  departmentId: number | null;
  departmentName: string;
  departmentHeadId: number | null;
  departmentHeadName: string;
  assignedEmployeeIds: number[];
  assignedVehicleIds: number[];
  teamIds: number[];
  routeIds: number[];
  operationalTaskIds: number[];
  status: DepartmentTaskStatus;
  statusLabel: string;
  progress: number;
  notes: string;
  startedAt: string;
  completedAt: string;
};

export type SharedWorkReport = {
  id: number;
  sharedWorkId: number;
  departmentTaskId: number;
  departmentTaskName: string;
  employeeId: number | null;
  employeeName: string;
  note: string;
  imageIds: number[];
  createdAt: string;
  latitude: number | null;
  longitude: number | null;
};

export type SharedWorkItem = {
  id: number;
  name: string;
  code: string;
  description: string;
  locationText: string;
  priority: string;
  priorityLabel: string;
  plannedStartDate: string;
  plannedEndDate: string;
  status: SharedWorkStatus;
  statusLabel: string;
  statusTone: "muted" | "progress" | "warning" | "done" | "danger";
  createdById: number | null;
  createdByName: string;
  createdDepartmentId: number | null;
  createdDepartmentName: string;
  involvedDepartmentIds: number[];
  involvedDepartments: string[];
  progress: number;
  attachmentIds: number[];
  tasks: SharedWorkDepartmentTask[];
  reports: SharedWorkReport[];
};

export type SharedWorkBoard = {
  works: SharedWorkItem[];
  reports: SharedWorkReport[];
  departments: SharedWorkOption[];
  employees: SharedWorkOption[];
  vehicles: SharedWorkOption[];
  teams: SharedWorkOption[];
  routes: SharedWorkOption[];
  userDepartmentId: number | null;
  source: "live" | "uninstalled";
};

function getSessionConnection(session: AppSession): Partial<OdooConnection> {
  return {
    login: session.login,
    password: session.password,
  };
}

function relationId(value: unknown) {
  if (Array.isArray(value)) {
    const id = Number(value[0]);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return null;
}

function relationName(value?: Relation, fallback = "") {
  return Array.isArray(value) ? clean(value[1]) : fallback;
}

function clean(value: unknown) {
  if (value === false || value === null || value === undefined) {
    return "";
  }
  return fixMojibakeText(String(value ?? "")).trim();
}

function normalizeIds(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
    : [];
}

export function getSharedWorkStatusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Ноорог";
    case "planned":
      return "Төлөвлөсөн";
    case "in_progress":
      return "Явагдаж байгаа";
    case "partially_completed":
      return "Хэсэгчлэн дууссан";
    case "completed":
      return "Дууссан";
    case "cancelled":
      return "Цуцлагдсан";
    default:
      return "Тодорхойгүй";
  }
}

export function getDepartmentTaskStatusLabel(status: string) {
  switch (status) {
    case "pending":
      return "Хүлээгдэж байгаа";
    case "planned":
      return "Төлөвлөсөн";
    case "in_progress":
      return "Явагдаж байгаа";
    case "completed":
      return "Дууссан";
    case "blocked":
      return "Саатсан";
    case "cancelled":
      return "Цуцлагдсан";
    default:
      return "Тодорхойгүй";
  }
}

function getSharedWorkStatusTone(status: string): SharedWorkItem["statusTone"] {
  switch (status) {
    case "completed":
      return "done";
    case "in_progress":
      return "progress";
    case "partially_completed":
    case "planned":
      return "warning";
    case "cancelled":
      return "danger";
    default:
      return "muted";
  }
}

function getPriorityLabel(priority?: string | false) {
  switch (priority) {
    case "3":
      return "Маш яаралтай";
    case "2":
      return "Яаралтай";
    case "1":
      return "Чухал";
    default:
      return "Энгийн";
  }
}

async function loadSupportedFields(
  model: string,
  desiredFields: string[],
  connection: Partial<OdooConnection>,
) {
  try {
    const fields = await executeOdooKw<Record<string, unknown>>(
      model,
      "fields_get",
      [desiredFields],
      { attributes: ["string", "type"] },
      connection,
    );
    return desiredFields.filter((field) => Boolean(fields[field]));
  } catch {
    return [];
  }
}

async function safeSearchRead<T>(
  model: string,
  domain: unknown[],
  desiredFields: string[],
  connection: Partial<OdooConnection>,
  options: Record<string, unknown> = {},
) {
  const fields = await loadSupportedFields(model, desiredFields, connection);
  if (!fields.length) {
    return [] as T[];
  }
  return executeOdooKw<T[]>(
    model,
    "search_read",
    [domain],
    {
      fields,
      limit: options.limit ?? 200,
      order: options.order,
      context: { active_test: false, ...(options.context as Record<string, unknown> | undefined) },
    },
    connection,
  ).catch(() => [] as T[]);
}

async function loadUserDepartmentId(session: AppSession, connection: Partial<OdooConnection>) {
  const employees = await safeSearchRead<EmployeeRecord>(
    "hr.employee",
    [["user_id", "=", session.uid]],
    ["department_id"],
    connection,
    { limit: 1 },
  );
  return relationId(employees[0]?.department_id);
}

function mapDepartmentOptions(records: DepartmentRecord[]): SharedWorkOption[] {
  return records
    .map((department) => ({
      id: department.id,
      name: clean(department.name),
      note: relationName(department.manager_id, "Хэлтсийн дарга тохируулаагүй"),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));
}

function mapEmployeeOptions(records: EmployeeRecord[]): SharedWorkOption[] {
  return records
    .map((employee) => ({
      id: employee.id,
      name: clean(employee.name),
      note: [relationName(employee.department_id), relationName(employee.job_id) || clean(employee.job_title)]
        .filter(Boolean)
        .join(" · "),
      departmentId: relationId(employee.department_id),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));
}

function mapVehicleOptions(records: VehicleRecord[]): SharedWorkOption[] {
  return records
    .map((vehicle) => {
      const departmentId = relationId(vehicle.municipal_department_id) ?? relationId(vehicle.department_id);
      const plate = clean(vehicle.license_plate);
      const name = clean(vehicle.name) || plate || `#${vehicle.id}`;
      return {
        id: vehicle.id,
        name: plate && !name.includes(plate) ? `${plate} · ${name}` : name,
        note: relationName(vehicle.municipal_department_id) || relationName(vehicle.department_id),
        departmentId,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));
}

function mapTeamOptions(records: TeamRecord[]): SharedWorkOption[] {
  return records
    .map((team) => ({
      id: team.id,
      name: clean(team.name),
      note: team.operation_type ? clean(team.operation_type) : "Баг",
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));
}

function mapRouteOptions(records: RouteRecord[]): SharedWorkOption[] {
  return records
    .map((route) => ({
      id: route.id,
      name: clean(route.name),
      note: relationName(route.department_id),
      departmentId: relationId(route.department_id),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));
}

function mapTask(record: SharedDepartmentTaskRecord): SharedWorkDepartmentTask {
  const status = (record.status || "pending") as DepartmentTaskStatus;
  return {
    id: record.id,
    sharedWorkId: relationId(record.shared_work_id) ?? 0,
    departmentId: relationId(record.department_id),
    departmentName: relationName(record.department_id, "Хэлтэсгүй"),
    departmentHeadId: relationId(record.department_head_id),
    departmentHeadName: relationName(record.department_head_id, "Хэлтсийн дарга тохируулаагүй"),
    assignedEmployeeIds: normalizeIds(record.assigned_employee_ids),
    assignedVehicleIds: normalizeIds(record.assigned_vehicle_ids),
    teamIds: normalizeIds(record.team_ids),
    routeIds: normalizeIds(record.route_ids),
    operationalTaskIds: normalizeIds(record.operational_task_ids),
    status,
    statusLabel: getDepartmentTaskStatusLabel(status),
    progress: Math.round(Number(record.progress_percent ?? 0)),
    notes: clean(record.notes),
    startedAt: clean(record.started_at),
    completedAt: clean(record.completed_at),
  };
}

function mapReport(record: SharedReportRecord): SharedWorkReport {
  return {
    id: record.id,
    sharedWorkId: relationId(record.shared_work_id) ?? 0,
    departmentTaskId: relationId(record.department_task_id) ?? 0,
    departmentTaskName: relationName(record.department_task_id, "Хэлтсийн ажил"),
    employeeId: relationId(record.employee_id),
    employeeName: relationName(record.employee_id, "Ажилтан"),
    note: clean(record.note),
    imageIds: normalizeIds(record.image_ids),
    createdAt: clean(record.created_at),
    latitude: Number.isFinite(record.latitude ?? NaN) ? Number(record.latitude) : null,
    longitude: Number.isFinite(record.longitude ?? NaN) ? Number(record.longitude) : null,
  };
}

function mapWork(
  record: SharedWorkRecord,
  tasks: SharedWorkDepartmentTask[],
  reports: SharedWorkReport[],
): SharedWorkItem {
  const status = (record.status || "draft") as SharedWorkStatus;
  const taskDepartments = tasks.map((task) => task.departmentName).filter(Boolean);
  return {
    id: record.id,
    name: clean(record.name),
    code: clean(record.code) || `#${record.id}`,
    description: clean(record.description),
    locationText: clean(record.location_text),
    priority: clean(record.priority) || "0",
    priorityLabel: getPriorityLabel(record.priority),
    plannedStartDate: clean(record.planned_start_date),
    plannedEndDate: clean(record.planned_end_date),
    status,
    statusLabel: getSharedWorkStatusLabel(status),
    statusTone: getSharedWorkStatusTone(status),
    createdById: relationId(record.created_by),
    createdByName: relationName(record.created_by, "Үүсгэсэн хэрэглэгч"),
    createdDepartmentId: relationId(record.created_department_id),
    createdDepartmentName: relationName(record.created_department_id),
    involvedDepartmentIds: normalizeIds(record.involved_department_ids),
    involvedDepartments: Array.from(new Set(taskDepartments)),
    progress: Math.round(Number(record.progress_percent ?? 0)),
    attachmentIds: normalizeIds(record.attachment_ids),
    tasks,
    reports,
  };
}

export async function loadSharedWorkBoard(
  session: AppSession,
  filter: SharedWorkFilter = "all",
): Promise<SharedWorkBoard> {
  const connection = getSessionConnection(session);
  const userDepartmentIdPromise = loadUserDepartmentId(session, connection);
  const statusDomain =
    filter === "progress"
      ? [["status", "in", ["planned", "in_progress", "partially_completed"]]]
      : filter === "completed"
        ? [["status", "=", "completed"]]
        : [];

  const [
    userDepartmentId,
    workRecords,
    departmentRecords,
    employeeRecords,
    vehicleRecords,
    teamRecords,
    routeRecords,
  ] = await Promise.all([
    userDepartmentIdPromise,
    safeSearchRead<SharedWorkRecord>(
      "shared.work",
      [["active", "=", true], ...statusDomain],
      [
        "name",
        "code",
        "description",
        "location_text",
        "priority",
        "planned_start_date",
        "planned_end_date",
        "status",
        "created_by",
        "created_department_id",
        "involved_department_ids",
        "progress_percent",
        "attachment_ids",
      ],
      connection,
      { limit: 120, order: "planned_start_date desc, id desc" },
    ),
    safeSearchRead<DepartmentRecord>("hr.department", [], ["name", "manager_id"], connection, {
      limit: 300,
      order: "name asc",
    }),
    safeSearchRead<EmployeeRecord>(
      "hr.employee",
      [["active", "=", true]],
      ["name", "department_id", "user_id", "job_id", "job_title"],
      connection,
      { limit: 500, order: "name asc" },
    ),
    safeSearchRead<VehicleRecord>(
      "fleet.vehicle",
      [["active", "=", true]],
      ["name", "license_plate", "municipal_department_id", "department_id"],
      connection,
      { limit: 500, order: "license_plate asc, name asc" },
    ),
    safeSearchRead<TeamRecord>(
      "mfo.crew.team",
      [["active", "=", true]],
      ["name", "operation_type"],
      connection,
      { limit: 300, order: "name asc" },
    ),
    safeSearchRead<RouteRecord>(
      "mfo.route",
      [["active", "=", true]],
      ["name", "department_id"],
      connection,
      { limit: 500, order: "name asc" },
    ),
  ]);

  if (!workRecords.length && filter !== "reports") {
    return {
      works: [],
      reports: [],
      departments: mapDepartmentOptions(departmentRecords),
      employees: mapEmployeeOptions(employeeRecords),
      vehicles: mapVehicleOptions(vehicleRecords),
      teams: mapTeamOptions(teamRecords),
      routes: mapRouteOptions(routeRecords),
      userDepartmentId,
      source: departmentRecords.length ? "live" : "uninstalled",
    };
  }

  const workIds = workRecords.map((work) => work.id);
  const [taskRecords, reportRecords] = await Promise.all([
    workIds.length
      ? safeSearchRead<SharedDepartmentTaskRecord>(
          "shared.work.department.task",
          [["shared_work_id", "in", workIds]],
          [
            "shared_work_id",
            "department_id",
            "department_head_id",
            "assigned_employee_ids",
            "assigned_vehicle_ids",
            "team_ids",
            "route_ids",
            "operational_task_ids",
            "status",
            "progress_percent",
            "notes",
            "started_at",
            "completed_at",
          ],
          connection,
          { limit: Math.max(workIds.length * 10, 100), order: "id asc" },
        )
      : Promise.resolve([]),
    safeSearchRead<SharedReportRecord>(
      "shared.work.report",
      workIds.length ? [["shared_work_id", "in", workIds]] : [],
      [
        "shared_work_id",
        "department_task_id",
        "employee_id",
        "note",
        "image_ids",
        "created_at",
        "latitude",
        "longitude",
      ],
      connection,
      { limit: 120, order: "created_at desc, id desc" },
    ),
  ]);

  const tasks = taskRecords.map(mapTask);
  const reports = reportRecords.map(mapReport);
  const tasksByWorkId = new Map<number, SharedWorkDepartmentTask[]>();
  const reportsByWorkId = new Map<number, SharedWorkReport[]>();
  for (const task of tasks) {
    tasksByWorkId.set(task.sharedWorkId, [...(tasksByWorkId.get(task.sharedWorkId) ?? []), task]);
  }
  for (const report of reports) {
    reportsByWorkId.set(report.sharedWorkId, [...(reportsByWorkId.get(report.sharedWorkId) ?? []), report]);
  }

  let works = workRecords.map((work) =>
    mapWork(work, tasksByWorkId.get(work.id) ?? [], reportsByWorkId.get(work.id) ?? []),
  );
  if (filter === "mine" && userDepartmentId) {
    works = works.filter((work) => work.tasks.some((task) => task.departmentId === userDepartmentId));
  }

  return {
    works,
    reports,
    departments: mapDepartmentOptions(departmentRecords),
    employees: mapEmployeeOptions(employeeRecords),
    vehicles: mapVehicleOptions(vehicleRecords),
    teams: mapTeamOptions(teamRecords),
    routes: mapRouteOptions(routeRecords),
    userDepartmentId,
    source: "live",
  };
}

export async function loadSharedWorkDetail(session: AppSession, workId: number) {
  const connection = getSessionConnection(session);
  const userDepartmentIdPromise = loadUserDepartmentId(session, connection);
  const [
    userDepartmentId,
    workRecords,
    departmentRecords,
    employeeRecords,
    vehicleRecords,
    teamRecords,
    routeRecords,
    taskRecords,
    reportRecords,
  ] = await Promise.all([
    userDepartmentIdPromise,
    safeSearchRead<SharedWorkRecord>(
      "shared.work",
      [["id", "=", workId]],
      [
        "name",
        "code",
        "description",
        "location_text",
        "priority",
        "planned_start_date",
        "planned_end_date",
        "status",
        "created_by",
        "created_department_id",
        "involved_department_ids",
        "progress_percent",
        "attachment_ids",
      ],
      connection,
      { limit: 1 },
    ),
    safeSearchRead<DepartmentRecord>("hr.department", [], ["name", "manager_id"], connection, {
      limit: 300,
      order: "name asc",
    }),
    safeSearchRead<EmployeeRecord>(
      "hr.employee",
      [["active", "=", true]],
      ["name", "department_id", "user_id", "job_id", "job_title"],
      connection,
      { limit: 500, order: "name asc" },
    ),
    safeSearchRead<VehicleRecord>(
      "fleet.vehicle",
      [["active", "=", true]],
      ["name", "license_plate", "municipal_department_id", "department_id"],
      connection,
      { limit: 500, order: "license_plate asc, name asc" },
    ),
    safeSearchRead<TeamRecord>(
      "mfo.crew.team",
      [["active", "=", true]],
      ["name", "operation_type"],
      connection,
      { limit: 300, order: "name asc" },
    ),
    safeSearchRead<RouteRecord>(
      "mfo.route",
      [["active", "=", true]],
      ["name", "department_id"],
      connection,
      { limit: 500, order: "name asc" },
    ),
    safeSearchRead<SharedDepartmentTaskRecord>(
      "shared.work.department.task",
      [["shared_work_id", "=", workId]],
      [
        "shared_work_id",
        "department_id",
        "department_head_id",
        "assigned_employee_ids",
        "assigned_vehicle_ids",
        "team_ids",
        "route_ids",
        "operational_task_ids",
        "status",
        "progress_percent",
        "notes",
        "started_at",
        "completed_at",
      ],
      connection,
      { limit: 50, order: "id asc" },
    ),
    safeSearchRead<SharedReportRecord>(
      "shared.work.report",
      [["shared_work_id", "=", workId]],
      [
        "shared_work_id",
        "department_task_id",
        "employee_id",
        "note",
        "image_ids",
        "created_at",
        "latitude",
        "longitude",
      ],
      connection,
      { limit: 120, order: "created_at desc, id desc" },
    ),
  ]);

  const tasks = taskRecords.map(mapTask);
  const reports = reportRecords.map(mapReport);
  const work = workRecords[0] ? mapWork(workRecords[0], tasks, reports) : null;

  return {
    works: work ? [work] : [],
    reports,
    departments: mapDepartmentOptions(departmentRecords),
    employees: mapEmployeeOptions(employeeRecords),
    vehicles: mapVehicleOptions(vehicleRecords),
    teams: mapTeamOptions(teamRecords),
    routes: mapRouteOptions(routeRecords),
    userDepartmentId,
    source: departmentRecords.length ? "live" : "uninstalled",
    work,
  };
}
