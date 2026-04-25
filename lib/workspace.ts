import "server-only";

import { CANONICAL_DEPARTMENT_NAMES, normalizeOrganizationUnitName } from "@/lib/department-groups";
import { createOdooConnection, executeOdooKw, type OdooConnection } from "@/lib/odoo";

type Relation = [number, string] | false;

type ProjectRecord = {
  id: number;
  name: string;
  user_id: Relation;
  ops_department_id: Relation;
  date_start: string | false;
  date: string | false;
  mfo_operation_type?: string | false;
  ops_allowed_unit_ids?: number[];
  ops_default_unit_id?: Relation;
  ops_measurement_unit_id?: Relation;
  ops_allowed_unit_summary?: string | false;
};

type TaskRecord = {
  id: number;
  name: string;
  project_id: Relation;
  sequence?: number;
  stage_id: Relation;
  ops_team_leader_id: Relation;
  user_ids: number[];
  mfo_operation_type?: string | false;
  ops_planned_quantity: number;
  ops_completed_quantity: number;
  ops_remaining_quantity: number;
  ops_progress_percent: number;
  ops_measurement_unit: string | false;
  ops_measurement_unit_id?: Relation;
  ops_measurement_unit_code?: string | false;
  ops_allowed_unit_ids?: number[];
  ops_default_unit_id?: Relation;
  ops_allowed_unit_summary?: string | false;
  priority: string;
  date_deadline: string | false;
  state: string;
  description?: string | false;
  ops_can_submit_for_review?: boolean;
  ops_can_mark_done?: boolean;
  ops_can_return_for_changes?: boolean;
  ops_reports_locked?: boolean;
};

type ReportRecord = {
  id: number;
  reporter_id: Relation;
  report_datetime: string;
  report_text: string;
  report_summary: string | false;
  reported_quantity: number;
  image_count: number;
  audio_count: number;
  image_attachment_ids: number[];
  audio_attachment_ids: number[];
  task_measurement_unit_id?: Relation;
  task_measurement_unit_code?: string | false;
};

type UserRecord = {
  id: number;
  name: string;
  login: string;
  ops_user_type: string | false;
};

type DepartmentRecord = {
  id: number;
  name: string;
  parent_id: Relation;
};

type WorkUnitRecord = {
  id: number;
  name: string;
  code: string;
  category: string;
  sequence: number;
};

type WorkTypeRecord = {
  id: number;
  name: string;
  operation_type: string;
  allowed_unit_ids: number[];
  default_unit_id: Relation;
};

export type SelectOption = {
  id: number;
  name: string;
  login: string;
  role: string;
};

export type DepartmentOption = {
  id: number;
  name: string;
  label: string;
};

export type WorkUnitOption = {
  id: number;
  name: string;
  code: string;
  category: string;
  categoryLabel: string;
};

export type WorkTypeOption = {
  id: number;
  name: string;
  operationType: string;
  defaultUnitId: number | null;
  allowedUnits: WorkUnitOption[];
  allowedUnitSummary: string;
};

type GarbageVehicleRecord = {
  id: number;
  name: string;
  license_plate: string | false;
};

type GarbageRouteRecord = {
  id: number;
  name: string;
  code: string | false;
  project_id: Relation;
  shift_type: string | false;
  collection_point_count: number;
  subdistrict_names: string | false;
};

export type GarbageVehicleOption = {
  id: number;
  label: string;
  plate: string;
};

export type GarbageRouteOption = {
  id: number;
  label: string;
  name: string;
  code: string;
  projectId: number | null;
  shiftType: string;
  pointCount: number;
  subdistrictNames: string;
};

const GARBAGE_ROUTE_FIELD_VARIANTS = [
  [
    "name",
    "code",
    "project_id",
    "shift_type",
    "collection_point_count",
    "subdistrict_names",
  ],
  ["name", "code", "project_id", "shift_type"],
  ["name", "code", "project_id"],
  ["name", "code"],
  ["name"],
];

async function readFirstAvailable<T>(
  attempts: Array<{
    model: string;
    domain: unknown[];
    fields: string[];
    order?: string;
    limit?: number;
  }>,
  connectionOverrides: Partial<OdooConnection>,
) {
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const records = await executeOdooKw<T[]>(
        attempt.model,
        "search_read",
        [attempt.domain],
        {
          fields: attempt.fields,
          order: attempt.order,
          limit: attempt.limit ?? 80,
        },
        connectionOverrides,
      );

      if (records.length) {
        return records;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn("Odoo option list could not be loaded:", lastError);
  }
  return [];
}

export type GarbageProjectCreateResult = {
  project_id: number;
  created: boolean;
  message: string;
};

export type ProjectTaskCard = {
  id: number;
  name: string;
  href: string;
  stageLabel: string;
  stageBucket: StageBucket;
  progress: number;
  deadline: string;
  teamLeaderName: string;
  plannedQuantity: number;
  completedQuantity: number;
  measurementUnit: string;
};

export type ProjectDetail = {
  id: number;
  name: string;
  managerName: string;
  managerId: number | null;
  departmentName: string;
  departmentId: number | null;
  startDate: string;
  deadline: string;
  taskCount: number;
  reviewCount: number;
  doneCount: number;
  completion: number;
  tasks: ProjectTaskCard[];
  teamLeaderOptions: SelectOption[];
  workTypeName: string;
  operationType: string;
  allowedUnits: WorkUnitOption[];
  defaultUnitId: number | null;
  allowedUnitSummary: string;
};

export type TaskReportFeedItem = {
  id: number;
  reporter: string;
  submittedAt: string;
  summary: string;
  text: string;
  quantity: number;
  measurementUnit: string;
  measurementUnitCode: string;
  imageCount: number;
  audioCount: number;
  images: {
    id: number;
    name: string;
    url: string;
  }[];
  audios: {
    id: number;
    name: string;
    url: string;
  }[];
};

type WorkspaceReportAttachmentInput = {
  name: string;
  mimeType?: string;
  base64: string;
};

export type TaskDetail = {
  id: number;
  name: string;
  projectId: number | null;
  projectName: string;
  operationType: string;
  quantityOptional: boolean;
  stageLabel: string;
  stageBucket: StageBucket;
  state: string;
  deadline: string;
  measurementUnit: string;
  plannedQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  progress: number;
  teamLeaderName: string;
  assignees: string[];
  priorityLabel: string;
  description: string;
  measurementUnitCode: string;
  canSubmitForReview: boolean;
  canMarkDone: boolean;
  canReturnForChanges: boolean;
  reportsLocked: boolean;
  reports: TaskReportFeedItem[];
};

type StageBucket = "todo" | "progress" | "review" | "done" | "unknown";

const STAGE_ALIASES: Array<[StageBucket, string[]]> = [
  ["todo", ["хийгдэх ажил", "hiigdeh ajil", "todo", "task"]],
  ["progress", ["явагдаж буй ажил", "yovagdaj bui ajil", "progress", "in progress"]],
  ["review", ["шалгагдаж буй ажил", "хянагдаж буй ажил", "shalgagdaj bui ajil", "hyanagdaj bui ajil", "review", "changes requested"]],
  ["done", ["дууссан ажил", "duussan ajil", "done", "completed"]],
  ["todo", ["төлөвлөгдсөн", "хуваарилсан"]],
  ["progress", ["гүйцэтгэж байна"]],
  ["review", ["шалгаж байна"]],
  ["done", ["дууссан"]],
];

function displayStageLabel(name: string) {
  const bucket = normalizeStageBucket(name);
  switch (bucket) {
    case "todo":
      return "Хийгдэх ажил";
    case "progress":
      return "Явагдаж буй ажил";
    case "review":
      return "Хянагдаж буй ажил";
    case "done":
      return "Дууссан ажил";
    default:
      return name || "Тодорхойгүй";
  }
}

function relationName(relation: Relation, fallback = "Тодорхойгүй") {
  return Array.isArray(relation) ? relation[1] : fallback;
}

function relationId(relation: Relation) {
  return Array.isArray(relation) ? relation[0] : null;
}

function unitCategoryLabel(category?: string | false) {
  switch (category) {
    case "weight":
      return "Жин";
    case "distance":
      return "Зай";
    case "area":
      return "Талбай";
    case "volume":
      return "Эзлэхүүн";
    case "trip":
      return "Давтамж";
    case "point":
      return "Цэг";
    case "vehicle":
      return "Тээврийн хэрэгсэл";
    case "tree":
      return "Мод";
    case "count":
      return "Тоо ширхэг";
    default:
      return "Бусад";
  }
}

function buildWorkUnitOption(unit: WorkUnitRecord): WorkUnitOption {
  return {
    id: unit.id,
    name: unit.name,
    code: unit.code,
    category: unit.category,
    categoryLabel: unitCategoryLabel(unit.category),
  };
}

function formatMeasurementUnit(
  relation?: Relation,
  legacyValue?: string | false,
  fallback = "нэгж",
) {
  if (Array.isArray(relation)) {
    return relation[1];
  }
  if ((legacyValue || "").trim()) {
    return String(legacyValue).trim();
  }
  return fallback;
}

function normalizeStageBucket(name: string) {
  const normalized = (name || "").trim().toLowerCase();
  for (const [bucket, aliases] of STAGE_ALIASES) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return bucket;
    }
  }
  return "unknown";
}

function formatDateLabel(value?: string | false) {
  if (!value) {
    return "Товлоогүй";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatDateInput(value?: string | false) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function priorityLabel(priority: string) {
  switch (priority) {
    case "3":
      return "Яаралтай";
    case "2":
      return "Өндөр";
    case "1":
      return "Дунд";
    default:
      return "Тогтмол";
  }
}

async function loadUserOptions(
  roles: string[],
  connectionOverrides: Partial<OdooConnection>,
) {
  try {
    const users = await executeOdooKw<UserRecord[]>(
      "res.users",
      "search_read",
      [[["share", "=", false], ["ops_user_type", "in", roles]]],
      {
        fields: ["name", "login", "ops_user_type"],
        order: "name asc",
        limit: 80,
      },
      connectionOverrides,
    );

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      login: user.login,
      role: user.ops_user_type || "worker",
    }));
  } catch {
    return [] satisfies SelectOption[];
  }
}

export async function loadProjectManagerOptions(
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return loadUserOptions(
    ["general_manager", "project_manager", "system_admin"],
    connectionOverrides,
  );
}

export async function loadTeamLeaderOptions(
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return loadUserOptions(["team_leader", "senior_master"], connectionOverrides);
}

export async function loadDepartmentOptions(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<DepartmentOption[]> {
  try {
    const departments = await executeOdooKw<DepartmentRecord[]>(
      "hr.department",
      "search_read",
      [[["active", "=", true]]],
      {
        fields: ["name", "parent_id"],
        order: "parent_id asc, name asc",
        limit: 80,
      },
      connectionOverrides,
    );

    const optionByCanonicalName = new Map<string, DepartmentOption>();

    for (const department of departments) {
      const parentName = Array.isArray(department.parent_id)
        ? department.parent_id[1]
        : "";
      const canonicalName = normalizeOrganizationUnitName(
        `${parentName} ${department.name}`,
      );

      if (!canonicalName || optionByCanonicalName.has(canonicalName)) {
        continue;
      }

      optionByCanonicalName.set(canonicalName, {
        id: department.id,
        name: canonicalName,
        label: canonicalName,
      });
    }

    return CANONICAL_DEPARTMENT_NAMES
      .map((name) => optionByCanonicalName.get(name))
      .filter((option): option is DepartmentOption => Boolean(option));
  } catch {
    return [];
  }
}

export async function loadWorkUnitOptions(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<WorkUnitOption[]> {
  try {
    const units = await executeOdooKw<WorkUnitRecord[]>(
      "ops.work.unit",
      "search_read",
      [[["active", "=", true]]],
      {
        fields: ["name", "code", "category", "sequence"],
        order: "sequence asc, name asc",
        limit: 120,
      },
      connectionOverrides,
    );

    return units.map(buildWorkUnitOption);
  } catch {
    return [];
  }
}

export async function loadWorkTypeOptions(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<WorkTypeOption[]> {
  try {
    const [units, workTypes] = await Promise.all([
      loadWorkUnitOptions(connectionOverrides),
      executeOdooKw<WorkTypeRecord[]>(
        "ops.work.type",
        "search_read",
        [[["active", "=", true]]],
        {
          fields: ["name", "operation_type", "allowed_unit_ids", "default_unit_id"],
          order: "sequence asc, name asc",
          limit: 40,
        },
        connectionOverrides,
      ),
    ]);

    const unitMap = new Map(units.map((unit) => [unit.id, unit]));

    return workTypes.map((workType) => {
      const allowedUnits = (workType.allowed_unit_ids ?? [])
        .map((unitId) => unitMap.get(unitId))
        .filter((unit): unit is WorkUnitOption => Boolean(unit));

      return {
        id: workType.id,
        name: workType.name,
        operationType: workType.operation_type,
        defaultUnitId: relationId(workType.default_unit_id),
        allowedUnits,
        allowedUnitSummary: allowedUnits.map((unit) => unit.name).join(", "),
      };
    });
  } catch {
    return [];
  }
}

export async function loadGarbageVehicleOptions(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<GarbageVehicleOption[]> {
  const crewTeams = await readFirstAvailable<{ vehicle_id: Relation }>(
    [
      {
        model: "mfo.crew.team",
        domain: [["active", "=", true], ["operation_type", "=", "garbage"], ["vehicle_id", "!=", false]],
        fields: ["vehicle_id"],
        order: "name asc",
      },
      {
        model: "mfo.crew.team",
        domain: [["operation_type", "=", "garbage"], ["vehicle_id", "!=", false]],
        fields: ["vehicle_id"],
        order: "name asc",
      },
      {
        model: "mfo.crew.team",
        domain: [["vehicle_id", "!=", false]],
        fields: ["vehicle_id"],
        order: "name asc",
      },
    ],
    connectionOverrides,
  );

  const vehicleIds = Array.from(
    new Set(
      crewTeams
        .map((team) => relationId(team.vehicle_id))
        .filter((value): value is number => Boolean(value)),
    ),
  );

  const vehicles = vehicleIds.length
    ? await readFirstAvailable<GarbageVehicleRecord>(
        [
          {
            model: "fleet.vehicle",
            domain: [["id", "in", vehicleIds], ["mfo_active_for_ops", "=", true]],
            fields: ["name", "license_plate"],
            order: "license_plate asc, name asc",
            limit: vehicleIds.length,
          },
          {
            model: "fleet.vehicle",
            domain: [["id", "in", vehicleIds]],
            fields: ["name", "license_plate"],
            order: "license_plate asc, name asc",
            limit: vehicleIds.length,
          },
        ],
        connectionOverrides,
      )
    : [];

  const fallbackVehicles = vehicles.length
    ? vehicles
    : await readFirstAvailable<GarbageVehicleRecord>(
        [
          {
            model: "fleet.vehicle",
            domain: [["mfo_active_for_ops", "=", true]],
            fields: ["name", "license_plate"],
            order: "license_plate asc, name asc",
          },
          {
            model: "fleet.vehicle",
            domain: [["active", "=", true]],
            fields: ["name", "license_plate"],
            order: "license_plate asc, name asc",
          },
          {
            model: "fleet.vehicle",
            domain: [],
            fields: ["name", "license_plate"],
            order: "license_plate asc, name asc",
          },
        ],
        connectionOverrides,
      );

  return fallbackVehicles.map((vehicle) => {
    const plate = vehicle.license_plate || vehicle.name || `Техник #${vehicle.id}`;
    return {
      id: vehicle.id,
      label: plate,
      plate,
    };
  });
}

function buildRouteAttempts(domainVariants: unknown[][]) {
  return domainVariants.flatMap((domain) =>
    GARBAGE_ROUTE_FIELD_VARIANTS.map((fields) => ({
      model: "mfo.route",
      domain,
      fields,
      order: fields.includes("code") ? "code asc, name asc" : "name asc",
      limit: 200,
    })),
  );
}

export async function loadGarbageRouteOptions(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<GarbageRouteOption[]> {
  const routes = await readFirstAvailable<Partial<GarbageRouteRecord> & { id: number; name: string }>(
    buildRouteAttempts([
      [["active", "=", true], ["operation_type", "=", "garbage"]],
      [["operation_type", "=", "garbage"]],
      [["active", "=", true]],
      [],
    ]),
    connectionOverrides,
  );

  return routes.map((route) => {
    const code = route.code || "";
    const routeLabel = code ? `${code} - ${route.name}` : route.name;
    return {
      id: route.id,
      label: routeLabel,
      name: route.name,
      code,
      projectId: relationId(route.project_id ?? false),
      shiftType: route.shift_type || "morning",
      pointCount: route.collection_point_count || 0,
      subdistrictNames: route.subdistrict_names || "",
    };
  });
}

export async function loadProjectDetail(
  projectId: number,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<ProjectDetail> {
  const [projects, tasks, teamLeaderOptions, workUnits, workTypes] = await Promise.all([
    executeOdooKw<ProjectRecord[]>(
      "project.project",
      "search_read",
      [[["id", "=", projectId]]],
      {
        fields: [
          "name",
          "user_id",
          "ops_department_id",
          "date_start",
          "date",
          "mfo_operation_type",
          "ops_allowed_unit_ids",
          "ops_default_unit_id",
          "ops_measurement_unit_id",
          "ops_allowed_unit_summary",
        ],
        limit: 1,
      },
      connectionOverrides,
    ),
    executeOdooKw<TaskRecord[]>(
      "project.task",
      "search_read",
      [[["project_id", "=", projectId]]],
      {
        fields: [
          "name",
          "sequence",
          "stage_id",
          "ops_team_leader_id",
          "ops_planned_quantity",
          "ops_completed_quantity",
          "ops_progress_percent",
          "ops_measurement_unit",
          "ops_measurement_unit_id",
          "date_deadline",
        ],
        order: "sequence asc, create_date asc, id asc",
        limit: 120,
      },
      connectionOverrides,
    ),
    loadTeamLeaderOptions(connectionOverrides),
    loadWorkUnitOptions(connectionOverrides),
    loadWorkTypeOptions(connectionOverrides),
  ]);

  const project = projects[0];
  if (!project) {
    throw new Error("Ажил олдсонгүй.");
  }

  const doneCount = tasks.filter(
    (task) => normalizeStageBucket(relationName(task.stage_id, "")) === "done",
  ).length;
  const reviewCount = tasks.filter(
    (task) => normalizeStageBucket(relationName(task.stage_id, "")) === "review",
  ).length;
  const unitMap = new Map(workUnits.map((unit) => [unit.id, unit]));
  const projectAllowedUnits = (project.ops_allowed_unit_ids ?? [])
    .map((unitId) => unitMap.get(unitId))
    .filter((unit): unit is WorkUnitOption => Boolean(unit));
  const workType =
    workTypes.find((item) => item.operationType === project.mfo_operation_type) ?? null;
  const allowedUnits =
    projectAllowedUnits.length > 0 ? projectAllowedUnits : workType?.allowedUnits ?? [];
  const defaultUnitId =
    relationId(project.ops_default_unit_id ?? false) ??
    workType?.defaultUnitId ??
    allowedUnits[0]?.id ??
    null;
  const allowedUnitSummary =
    project.ops_allowed_unit_summary ||
    workType?.allowedUnitSummary ||
    allowedUnits.map((unit) => unit.name).join(", ");

  return {
    id: project.id,
    name: project.name,
    managerName: relationName(project.user_id),
    managerId: relationId(project.user_id),
    departmentName: relationName(project.ops_department_id),
    departmentId: relationId(project.ops_department_id),
    startDate: formatDateInput(project.date_start),
    deadline: formatDateInput(project.date),
    taskCount: tasks.length,
    reviewCount,
    doneCount,
    completion: tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0,
    tasks: tasks.map((task) => ({
      id: task.id,
      name: task.name,
      href: `/tasks/${task.id}`,
      stageLabel: displayStageLabel(relationName(task.stage_id, "")),
      stageBucket: normalizeStageBucket(relationName(task.stage_id, "")),
      progress: Math.round(task.ops_progress_percent ?? 0),
      deadline: formatDateLabel(task.date_deadline),
      teamLeaderName: relationName(task.ops_team_leader_id),
      plannedQuantity: task.ops_planned_quantity ?? 0,
      completedQuantity: task.ops_completed_quantity ?? 0,
      measurementUnit: formatMeasurementUnit(
        task.ops_measurement_unit_id,
        task.ops_measurement_unit,
      ),
    })),
    teamLeaderOptions,
    workTypeName: workType?.name ?? "",
    operationType: project.mfo_operation_type || "",
    allowedUnits,
    defaultUnitId,
    allowedUnitSummary,
  };
}

export async function loadTaskDetail(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<TaskDetail> {
  const taskPromise = executeOdooKw<TaskRecord[]>(
    "project.task",
    "search_read",
    [[["id", "=", taskId]]],
    {
      fields: [
        "name",
        "project_id",
        "stage_id",
        "ops_team_leader_id",
        "user_ids",
        "mfo_operation_type",
        "ops_planned_quantity",
        "ops_completed_quantity",
        "ops_remaining_quantity",
        "ops_progress_percent",
        "ops_measurement_unit",
        "ops_measurement_unit_id",
        "ops_measurement_unit_code",
        "priority",
        "date_deadline",
        "state",
        "description",
        "ops_can_submit_for_review",
        "ops_can_mark_done",
        "ops_can_return_for_changes",
        "ops_reports_locked",
      ],
      limit: 1,
    },
    connectionOverrides,
  );

  const reportQuery = (overrides: Partial<OdooConnection>) =>
    executeOdooKw<ReportRecord[]>(
      "ops.task.report",
      "search_read",
      [[["task_id", "=", taskId]]],
      {
        fields: [
          "reporter_id",
          "report_datetime",
          "report_text",
          "report_summary",
          "reported_quantity",
          "image_count",
          "audio_count",
          "image_attachment_ids",
          "audio_attachment_ids",
          "task_measurement_unit_id",
          "task_measurement_unit_code",
        ],
        order: "report_datetime desc",
        limit: 60,
      },
      overrides,
    );

  const [tasks, primaryReports] = await Promise.all([
    taskPromise,
    reportQuery(connectionOverrides).catch(() => [] as ReportRecord[]),
  ]);

  const task = tasks[0];
  if (!task) {
    throw new Error("Даалгавар олдсонгүй.");
  }

  let reports = primaryReports;
  if (!reports.length) {
    const primaryConnection = createOdooConnection(connectionOverrides);
    const fallbackConnection = createOdooConnection();
    const sameConnection =
      primaryConnection.url === fallbackConnection.url &&
      primaryConnection.db === fallbackConnection.db &&
      primaryConnection.login === fallbackConnection.login &&
      primaryConnection.password === fallbackConnection.password;

    if (!sameConnection) {
      reports = await reportQuery({}).catch(() => [] as ReportRecord[]);
    }
  }

  let assigneeNames: string[] = [];
  if (task.user_ids?.length) {
    try {
      const assignees = await executeOdooKw<UserRecord[]>(
        "res.users",
        "search_read",
        [[["id", "in", task.user_ids]]],
        {
          fields: ["name", "login", "ops_user_type"],
          order: "name asc",
          limit: task.user_ids.length,
        },
        connectionOverrides,
      );
      assigneeNames = assignees.map((user) => user.name);
    } catch {
      assigneeNames = task.user_ids.map((id) => `Хэрэглэгч #${id}`);
    }
  }

  return {
    id: task.id,
    name: task.name,
    projectId: relationId(task.project_id),
    projectName: relationName(task.project_id),
    operationType: task.mfo_operation_type || "",
    quantityOptional: task.mfo_operation_type === "garbage",
    stageLabel: displayStageLabel(relationName(task.stage_id, "")),
    stageBucket: normalizeStageBucket(relationName(task.stage_id, "")),
    state: task.state,
    deadline: formatDateLabel(task.date_deadline),
    measurementUnit: formatMeasurementUnit(
      task.ops_measurement_unit_id,
      task.ops_measurement_unit,
    ),
    measurementUnitCode: task.ops_measurement_unit_code || "",
    plannedQuantity: task.ops_planned_quantity ?? 0,
    completedQuantity: task.ops_completed_quantity ?? 0,
    remainingQuantity: task.ops_remaining_quantity ?? 0,
    progress: Math.round(task.ops_progress_percent ?? 0),
    teamLeaderName: relationName(task.ops_team_leader_id),
    assignees: assigneeNames,
    priorityLabel: priorityLabel(task.priority),
    description: task.description || "",
    canSubmitForReview: Boolean(task.ops_can_submit_for_review),
    canMarkDone: Boolean(task.ops_can_mark_done),
    canReturnForChanges: Boolean(task.ops_can_return_for_changes),
    reportsLocked: Boolean(task.ops_reports_locked),
    reports: reports.map((report) => ({
      id: report.id,
      reporter: relationName(report.reporter_id),
      submittedAt: formatDateLabel(report.report_datetime),
      summary: report.report_summary || "Тайлбар оруулаагүй",
      text: report.report_text || "",
      quantity: report.reported_quantity ?? 0,
      measurementUnit: formatMeasurementUnit(
        report.task_measurement_unit_id,
        task.ops_measurement_unit,
      ),
      measurementUnitCode:
        report.task_measurement_unit_code || task.ops_measurement_unit_code || "",
      imageCount: report.image_count ?? 0,
      audioCount: report.audio_count ?? 0,
      images: (report.image_attachment_ids ?? []).map((attachmentId) => ({
        id: attachmentId,
        name: `image-${attachmentId}`,
        url: `/api/odoo/attachments/${attachmentId}`,
      })),
      audios: (report.audio_attachment_ids ?? []).map((attachmentId) => ({
        id: attachmentId,
        name: `audio-${attachmentId}`,
        url: `/api/odoo/attachments/${attachmentId}`,
      })),
    })),
  };
}

export async function createWorkspaceProject(
  input: {
    name: string;
    managerId?: number | null;
    departmentId?: number | null;
    operationType?: string;
    trackQuantity?: boolean;
    plannedQuantity?: number | null;
    measurementUnitId?: number | null;
    startDate?: string;
    deadline?: string;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const values: Record<string, unknown> = {
    name: input.name.trim(),
  };

  if (input.managerId) {
    values.user_id = input.managerId;
  }
  if (input.departmentId) {
    values.ops_department_id = input.departmentId;
  }
  if (input.operationType) {
    values.mfo_operation_type = input.operationType;
  }
  if (input.trackQuantity) {
    values.ops_track_quantity = true;
    if (
      typeof input.plannedQuantity === "number" &&
      !Number.isNaN(input.plannedQuantity)
    ) {
      values.ops_planned_quantity = input.plannedQuantity;
    }
    if (input.measurementUnitId) {
      values.ops_measurement_unit_id = input.measurementUnitId;
    }
  }
  if (input.startDate) {
    values.date_start = input.startDate;
  }
  if (input.deadline) {
    values.date = input.deadline;
  }

  return executeOdooKw<number>(
    "project.project",
    "create",
    [values],
    {},
    connectionOverrides,
  );
}

export async function createGarbageWorkspaceProject(
  input: {
    vehicleId: number;
    routeId: number;
    shiftDate: string;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return executeOdooKw<GarbageProjectCreateResult>(
    "project.project",
    "action_mfo_create_garbage_daily_project",
    [
      {
        vehicle_id: input.vehicleId,
        route_id: input.routeId,
        shift_date: input.shiftDate,
      },
    ],
    {},
    connectionOverrides,
  );
}

export async function createWorkspaceTask(
  input: {
    projectId: number;
    name: string;
    teamLeaderId?: number | null;
    deadline?: string;
    measurementUnitId?: number | null;
    plannedQuantity?: number | null;
    description?: string;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const values: Record<string, unknown> = {
    project_id: input.projectId,
    name: input.name.trim(),
  };

  if (input.teamLeaderId) {
    values.ops_team_leader_id = input.teamLeaderId;
  }
  if (input.deadline) {
    values.date_deadline = input.deadline;
  }
  if (input.measurementUnitId) {
    values.ops_measurement_unit_id = input.measurementUnitId;
  }
  if (typeof input.plannedQuantity === "number" && !Number.isNaN(input.plannedQuantity)) {
    values.ops_planned_quantity = input.plannedQuantity;
  }
  if (input.description) {
    values.description = input.description.trim();
  }

  return executeOdooKw<number>(
    "project.task",
    "create",
    [values],
    {},
    connectionOverrides,
  );
}

export async function createWorkspaceTaskReport(
  input: {
    taskId: number;
    reportText: string;
    reportedQuantity: number;
    imageAttachments?: WorkspaceReportAttachmentInput[];
    audioAttachments?: WorkspaceReportAttachmentInput[];
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return executeOdooKw<number>(
    "project.task",
    "action_ops_create_mobile_report",
    [
      [input.taskId],
      {
        report_text: input.reportText.trim(),
        reported_quantity: input.reportedQuantity,
        image_attachments: input.imageAttachments ?? [],
        audio_attachments: input.audioAttachments ?? [],
      },
    ],
    {},
    connectionOverrides,
  );
}

export async function submitWorkspaceTaskForReview(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return executeOdooKw<boolean>(
    "project.task",
    "action_ops_submit_for_review",
    [[taskId]],
    {},
    connectionOverrides,
  );
}

export async function markWorkspaceTaskDone(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return executeOdooKw<boolean>(
    "project.task",
    "action_ops_mark_done",
    [[taskId]],
    {},
    connectionOverrides,
  );
}

export async function returnWorkspaceTaskForChanges(
  taskId: number,
  reason: string,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const wizardId = await executeOdooKw<number>(
    "ops.task.return.wizard",
    "create",
    [
      {
        task_id: taskId,
        return_reason: reason.trim(),
      },
    ],
    {},
    connectionOverrides,
  );

  return executeOdooKw(
    "ops.task.return.wizard",
    "action_confirm_return",
    [[wizardId]],
    {},
    connectionOverrides,
  );
}
