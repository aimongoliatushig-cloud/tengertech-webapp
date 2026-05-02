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

type ProjectCrewRecord = {
  id: number;
  mfo_crew_team_id?: Relation;
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

type MailMessageRecord = {
  id: number;
  author_id: Relation;
  date: string | false;
  body: string | false;
  message_type: string | false;
  subtype_id: Relation;
};

type UserRecord = {
  id: number;
  name: string;
  login: string;
  ops_user_type: string | false;
  partner_id?: Relation;
};

type EmployeeUserRecord = {
  id: number;
  name: string;
  department_id: Relation;
  user_id: Relation;
  job_id?: Relation;
  job_title?: string | false;
  work_phone?: string | false;
  mobile_phone?: string | false;
  work_email?: string | false;
};

type CrewTeamRecord = {
  id: number;
  name: string;
  vehicle_id?: Relation;
  driver_employee_id?: Relation;
  collector_employee_ids?: number[];
  inspector_employee_id?: Relation;
  member_user_ids?: number[];
};

type RouteCrewRecord = {
  id: number;
  project_id?: Relation;
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

async function searchReadWithFieldFallback<T>(
  model: string,
  domain: unknown[],
  fields: string[],
  kwargs: Record<string, unknown> = {},
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<T[]> {
  const remainingFields = [...fields];

  for (;;) {
    try {
      return await executeOdooKw<T[]>(
        model,
        "search_read",
        [domain],
        {
          ...kwargs,
          fields: remainingFields,
        },
        connectionOverrides,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const invalidField = message.match(/Invalid field '([^']+)'/)?.[1];
      const fieldIndex = invalidField ? remainingFields.indexOf(invalidField) : -1;

      if (fieldIndex < 0 || remainingFields.length <= 1) {
        throw error;
      }

      remainingFields.splice(fieldIndex, 1);
    }
  }
}

export type SelectOption = {
  id: number;
  name: string;
  login: string;
  role: string;
  departmentName?: string;
  phone?: string;
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

type SeasonalPlanRecord = {
  id: number;
  name: string;
  department_id: Relation;
  operation_type?: string | false;
  date_start: string | false;
  date_end: string | false;
  work_days?: string | false;
  state?: string | false;
  notes?: string | false;
};

type SeasonalPlanLineRecord = {
  id: number;
  plan_id: Relation;
  sequence?: number;
  district_id?: Relation;
  subdistrict_id?: Relation;
  khoroo_label?: string | false;
  location_name?: string | false;
  planned_vehicle_count?: number;
  planned_tonnage?: number;
  route_id?: Relation;
  remarks?: string | false;
};

type SeasonalPlanDayRecord = {
  id: number;
  plan_line_id: Relation;
  work_date: string | false;
  is_planned?: boolean;
  status?: string | false;
  assigned_vehicle_id?: Relation;
  generated_task_id?: Relation;
  actual_vehicle_count?: number;
  actual_tonnage?: number;
  completion_note?: string | false;
};

type SeasonalConflictTaskRecord = {
  id: number;
  name: string;
  mfo_shift_date?: string | false;
  mfo_vehicle_id?: Relation;
  mfo_operation_type?: string | false;
};

export type SeasonalPlanLineInput = {
  sequence: number;
  khorooLabel: string;
  locationName: string;
  plannedVehicleCount: number;
  plannedTonnage: number;
  workDate?: string | null;
  routeId?: number | null;
  remarks?: string;
};

export type SeasonalPlanCreateResult = {
  planId: number;
  created: boolean;
  message: string;
};

export type SeasonalPlanDay = {
  id: number;
  lineId: number;
  workDate: string;
  workDateLabel: string;
  isPlanned: boolean;
  status: string;
  statusLabel: string;
  assignedVehicleId: number | null;
  assignedVehicleName: string;
  generatedTaskId: number | null;
  generatedTaskHref: string;
  actualVehicleCount: number;
  actualTonnage: number;
  completionNote: string;
};

export type SeasonalPlanLine = {
  id: number;
  sequence: number;
  districtName: string;
  subdistrictName: string;
  khorooLabel: string;
  locationName: string;
  plannedVehicleCount: number;
  plannedVehicleCountLabel: string;
  plannedTonnage: number;
  plannedTonnageLabel: string;
  routeId: number | null;
  routeName: string;
  remarks: string;
  days: SeasonalPlanDay[];
};

export type SeasonalConflictWarning = {
  id: string;
  workDate: string;
  workDateLabel: string;
  vehicleName: string;
  taskId: number;
  taskName: string;
  taskHref: string;
  note: string;
};

export type SeasonalPlan = {
  id: number;
  name: string;
  departmentName: string;
  operationType: string;
  state: string;
  stateLabel: string;
  dateStart: string;
  dateEnd: string;
  dateRangeLabel: string;
  workDays: string[];
  workDayLabels: string[];
  notes: string;
  lineCount: number;
  plannedDateCount: number;
  generatedDateCount: number;
  totalPlannedVehicleCount: number;
  totalPlannedTonnage: number;
  totalPlannedTonnageLabel: string;
  lines: SeasonalPlanLine[];
  plannedDates: Array<{
    dateKey: string;
    dateLabel: string;
    generatedCount: number;
    pendingCount: number;
  }>;
  conflictWarnings: SeasonalConflictWarning[];
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
  departmentUserOptions: SelectOption[];
  crewTeamOptions: Array<{
    id: number;
    label: string;
    memberUserIds: number[];
  }>;
  workTypeName: string;
  operationType: string;
  allowedUnits: WorkUnitOption[];
  allUnitOptions: WorkUnitOption[];
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

export type TaskMessageItem = {
  id: number;
  author: string;
  postedAt: string;
  body: string;
  kind: "message" | "note" | "system";
  subtype: string;
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
  messages: TaskMessageItem[];
};

const WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

type StageBucket = "todo" | "progress" | "review" | "done" | "unknown";

const STAGE_ALIASES: Array<[StageBucket, string[]]> = [
  ["todo", ["хийгдэх ажил", "hiigdeh ajil", "todo", "task"]],
  [
    "progress",
    ["явагдаж буй ажил", "хийгдэж", "хийж байна", "ажиллаж", "yovagdaj bui ajil", "progress", "in progress"],
  ],
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

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    apos: "'",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const normalizedEntity = entity.toLowerCase();
    if (normalizedEntity.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalizedEntity.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return namedEntities[normalizedEntity] ?? match;
  });
}

function htmlToPlainText(value?: string | false) {
  if (!value) {
    return "";
  }

  return decodeHtmlEntities(
    value
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function plainTextToOdooHtml(value: string) {
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function classifyTaskMessage(message: MailMessageRecord): TaskMessageItem["kind"] {
  const subtype = relationName(message.subtype_id, "").toLowerCase();
  const messageType = String(message.message_type || "").toLowerCase();

  if (subtype.includes("note")) {
    return "note";
  }
  if (messageType === "comment" || subtype.includes("comment")) {
    return "message";
  }
  return "system";
}

function filterCrewTeamsByDepartmentUsers<
  T extends {
    memberUserIds: number[];
  },
>(teams: T[], users: SelectOption[]) {
  const departmentUserIds = new Set(users.map((user) => user.id));
  if (!departmentUserIds.size) {
    return [];
  }

  return teams.filter((team) =>
    team.memberUserIds.some((userId) => departmentUserIds.has(userId)),
  );
}

function dateInputToOdooDatetime(value: string) {
  return value.includes(" ") ? value : `${value} 00:00:00`;
}

function isMasterLikeJobTitle(value: string) {
  const title = value.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    title.includes("ахлах мастер") ||
    title.includes("мастер") ||
    title.includes("даамал") ||
    title.includes("талбайн инженер") ||
    title.includes("talbain engineer") ||
    title.includes("field engineer")
  );
}

function getEmployeeJobTitle(employee: Pick<EmployeeUserRecord, "job_id" | "job_title">) {
  return [
    Array.isArray(employee.job_id) ? employee.job_id[1] : "",
    employee.job_title || "",
  ]
    .join(" ")
    .trim();
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

function formatShortDateLabel(value?: string | false) {
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
  }).format(parsed);
}

function formatTonnage(value?: number | null) {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${Math.round(safeValue * 100) / 100} тн`;
}

function weekdayLabel(value: WeekdayKey) {
  switch (value) {
    case "monday":
      return "Даваа";
    case "tuesday":
      return "Мягмар";
    case "wednesday":
      return "Лхагва";
    case "thursday":
      return "Пүрэв";
    case "friday":
      return "Баасан";
    case "saturday":
      return "Бямба";
    case "sunday":
      return "Ням";
    default:
      return value;
  }
}

function parseWorkDays(value?: string | false) {
  if (!value) {
    return [] as WeekdayKey[];
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return [] as WeekdayKey[];
  }

  try {
    const parsed = JSON.parse(normalized) as string[];
    return parsed.filter((item): item is WeekdayKey =>
      WEEKDAY_KEYS.includes(item as WeekdayKey),
    );
  } catch {
    return normalized
      .split(",")
      .map((item) => item.trim())
      .filter((item): item is WeekdayKey => WEEKDAY_KEYS.includes(item as WeekdayKey));
  }
}

function seasonalStateLabel(value?: string | false) {
  switch (value) {
    case "approved":
      return "Баталсан";
    case "active":
      return "Идэвхтэй";
    case "done":
      return "Дууссан";
    case "cancelled":
      return "Цуцалсан";
    case "draft":
    default:
      return "Ноорог";
  }
}

function seasonalDayStatusLabel(value?: string | false) {
  switch (value) {
    case "generated":
      return "Үүсгэсэн";
    case "in_progress":
      return "Ажиллаж байна";
    case "done":
      return "Дууссан";
    case "skipped":
      return "Алгассан";
    case "planned":
    default:
      return "Төлөвлөсөн";
  }
}

function operationTypeLabel(value?: string | false) {
  switch (value) {
    case "garbage_seasonal":
      return "Улирлын хог ачилт";
    case "garbage":
      return "Хог тээвэрлэлт";
    case "street_cleaning":
      return "Гудамж цэвэрлэгээ";
    case "green_maintenance":
      return "Ногоон байгууламж";
    default:
      return "Төлөвлөгөөт";
  }
}

function dateRangeLabel(startDate: string, endDate: string) {
  if (!startDate && !endDate) {
    return "Огноо тохируулаагүй";
  }
  if (!startDate || startDate === endDate) {
    return formatShortDateLabel(startDate || endDate);
  }
  if (!endDate) {
    return formatShortDateLabel(startDate);
  }
  return `${formatShortDateLabel(startDate)} - ${formatShortDateLabel(endDate)}`;
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

    const userIds = users.map((user) => user.id);
    const employeeDepartments = userIds.length
      ? await executeOdooKw<
          Array<{
            user_id: Relation;
            department_id: Relation;
            job_id?: Relation;
            job_title?: string | false;
          }>
        >(
          "hr.employee",
          "search_read",
          [[["user_id", "in", userIds]]],
          {
            fields: ["user_id", "department_id"],
            limit: 200,
          },
          connectionOverrides,
        ).catch(() => [])
      : [];
    const departmentByUserId = new Map(
      employeeDepartments
        .map((employee) => [
          Array.isArray(employee.user_id) ? employee.user_id[0] : null,
          relationName(employee.department_id ?? false, ""),
        ] as const)
        .filter((entry): entry is readonly [number, string] => entry[0] !== null),
    );

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      login: user.login,
      role: user.ops_user_type || "worker",
      departmentName: departmentByUserId.get(user.id),
    }));
  } catch {
    return [] satisfies SelectOption[];
  }
}

async function loadDepartmentUserOptions(
  departmentId: number | null,
  connectionOverrides: Partial<OdooConnection>,
) {
  if (!departmentId) {
    return [] satisfies SelectOption[];
  }

  try {
    const employees = await executeOdooKw<EmployeeUserRecord[]>(
      "hr.employee",
      "search_read",
      [[["department_id", "=", departmentId], ["user_id", "!=", false]]],
      {
        fields: [
          "name",
          "department_id",
          "job_id",
          "job_title",
          "user_id",
          "work_phone",
          "mobile_phone",
          "work_email",
        ],
        order: "name asc",
        limit: 120,
      },
      connectionOverrides,
    );
    const options = employees.reduce<SelectOption[]>((items, employee) => {
      const userId = relationId(employee.user_id);
      if (!userId) {
        return items;
      }

      const phone = employee.mobile_phone || employee.work_phone || "";
      items.push({
        id: userId,
        name: relationName(employee.user_id, employee.name),
        login: phone || employee.work_email || "",
        phone: phone || "",
        role: "department_user",
        departmentName: relationName(employee.department_id, ""),
      });
      return items;
    }, []);

    return Array.from(new Map(options.map((option) => [option.id, option])).values());
  } catch {
    return [] satisfies SelectOption[];
  }
}

async function loadMasterEmployeeUserOptions(
  connectionOverrides: Partial<OdooConnection>,
) {
  try {
    const employees = await executeOdooKw<EmployeeUserRecord[]>(
      "hr.employee",
      "search_read",
      [[["user_id", "!=", false]]],
      {
        fields: [
          "name",
          "department_id",
          "job_id",
          "job_title",
          "user_id",
          "work_phone",
          "mobile_phone",
          "work_email",
        ],
        order: "department_id asc, name asc",
        limit: 300,
      },
      connectionOverrides,
    );

    const options = employees.reduce<SelectOption[]>((items, employee) => {
      const userId = relationId(employee.user_id);
      if (!userId || !isMasterLikeJobTitle(getEmployeeJobTitle(employee))) {
        return items;
      }

      const phone = employee.mobile_phone || employee.work_phone || "";
      items.push({
        id: userId,
        name: relationName(employee.user_id, employee.name),
        login: phone || employee.work_email || "",
        phone: phone || "",
        role: "senior_master",
        departmentName: relationName(employee.department_id, ""),
      });
      return items;
    }, []);

    return Array.from(new Map(options.map((option) => [option.id, option])).values());
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
  const [roleOptions, inferredMasterOptions] = await Promise.all([
    loadUserOptions(["team_leader", "senior_master"], connectionOverrides),
    loadMasterEmployeeUserOptions(connectionOverrides),
  ]);

  return Array.from(
    new Map(
      [...roleOptions, ...inferredMasterOptions].map((option) => [option.id, option]),
    ).values(),
  ).sort((left, right) => left.name.localeCompare(right.name, "mn"));
}

export async function loadCrewTeamOptions(
  operationType = "",
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const domain: unknown[] = [["active", "=", true]];
  if (operationType) {
    domain.push(["operation_type", "=", operationType]);
  }

  const query = (overrides: Partial<OdooConnection>) =>
    executeOdooKw<CrewTeamRecord[]>(
      "mfo.crew.team",
      "search_read",
      [domain],
      {
        fields: ["name", "vehicle_id", "member_user_ids"],
        order: "name asc",
        limit: 200,
      },
      overrides,
    );

  const teams = await query(connectionOverrides).catch(() => query({}).catch(() => []));

  return teams.map((team) => {
    const vehicleName = relationName(team.vehicle_id ?? false, "");
    return {
      id: team.id,
      label: vehicleName ? `${team.name} (${vehicleName})` : team.name,
      memberUserIds: team.member_user_ids ?? [],
    };
  });
}

async function loadCrewTeamForRoute(
  routeId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const routes = await executeOdooKw<RouteCrewRecord[]>(
    "mfo.route",
    "search_read",
    [[["id", "=", routeId]]],
    {
      fields: ["project_id"],
      limit: 1,
    },
    connectionOverrides,
  ).catch(() => []);
  const routeProjectId = relationId(routes[0]?.project_id ?? false);
  if (!routeProjectId) {
    return null;
  }

  const projects = await executeOdooKw<ProjectCrewRecord[]>(
    "project.project",
    "search_read",
    [[["id", "=", routeProjectId]]],
    {
      fields: ["mfo_crew_team_id"],
      limit: 1,
    },
    connectionOverrides,
  ).catch(() => []);
  const crewTeamId = relationId(projects[0]?.mfo_crew_team_id ?? false);
  if (!crewTeamId) {
    return null;
  }

  const teams = await executeOdooKw<CrewTeamRecord[]>(
    "mfo.crew.team",
    "search_read",
    [[["id", "=", crewTeamId]]],
    {
      fields: [
        "driver_employee_id",
        "collector_employee_ids",
        "inspector_employee_id",
        "member_user_ids",
      ],
      limit: 1,
    },
    connectionOverrides,
  ).catch(() => []);

  return teams[0] ? { ...teams[0], id: crewTeamId } : null;
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

async function loadSeasonalConflictWarnings(
  planDays: SeasonalPlanDayRecord[],
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<SeasonalConflictWarning[]> {
  const assignedDays = planDays.filter(
    (day) => relationId(day.assigned_vehicle_id ?? false) && day.work_date,
  );
  if (!assignedDays.length) {
    return [];
  }

  const dateKeys = Array.from(
    new Set(
      assignedDays
        .map((day) => day.work_date || "")
        .filter((value) => Boolean(value)),
    ),
  );
  const vehicleIds = Array.from(
    new Set(
      assignedDays
        .map((day) => relationId(day.assigned_vehicle_id ?? false))
        .filter((value): value is number => Boolean(value)),
    ),
  );

  if (!dateKeys.length || !vehicleIds.length) {
    return [];
  }

  try {
    const existingTasks = await executeOdooKw<SeasonalConflictTaskRecord[]>(
      "project.task",
      "search_read",
      [[
        ["mfo_shift_date", "in", dateKeys],
        ["mfo_vehicle_id", "in", vehicleIds],
        ["mfo_operation_type", "in", ["garbage", "garbage_seasonal"]],
      ]],
      {
        fields: ["name", "mfo_shift_date", "mfo_vehicle_id", "mfo_operation_type"],
        order: "mfo_shift_date asc, id asc",
        limit: 500,
      },
      connectionOverrides,
    );

    const warnings: SeasonalConflictWarning[] = [];
    for (const task of existingTasks) {
      const taskDate = task.mfo_shift_date || "";
      const vehicleId = relationId(task.mfo_vehicle_id ?? false);
      if (!taskDate || !vehicleId) {
        continue;
      }

      const linkedPlanDay = assignedDays.find(
        (day) =>
          day.work_date === taskDate &&
          relationId(day.assigned_vehicle_id ?? false) === vehicleId &&
          relationId(day.generated_task_id ?? false) !== task.id,
      );

      if (!linkedPlanDay) {
        continue;
      }

      warnings.push({
        id: `${linkedPlanDay.id}-${task.id}`,
        workDate: taskDate,
        workDateLabel: formatShortDateLabel(taskDate),
        vehicleName: relationName(task.mfo_vehicle_id ?? false),
        taskId: task.id,
        taskName: task.name,
        taskHref: `/tasks/${task.id}`,
        note: `${operationTypeLabel(task.mfo_operation_type)} ажилтай давхцаж байна.`,
      });
    }

    return warnings;
  } catch {
    return [];
  }
}

export async function createSeasonalWorkspacePlan(
  input: {
    name: string;
    departmentId: number;
    startDate: string;
    endDate: string;
    workDays: WeekdayKey[];
    notes?: string;
    lines: SeasonalPlanLineInput[];
  },
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<SeasonalPlanCreateResult> {
  const payload = {
    name: input.name.trim(),
    department_id: input.departmentId,
    operation_type: "garbage_seasonal",
    date_start: input.startDate,
    date_end: input.endDate,
    work_days: input.workDays,
    notes: input.notes?.trim() || false,
    lines: input.lines.map((line, index) => ({
      sequence: line.sequence || index + 1,
      khoroo_label: line.khorooLabel.trim(),
      location_name: line.locationName.trim(),
      planned_vehicle_count: line.plannedVehicleCount,
      planned_tonnage: line.plannedTonnage,
      work_date: line.workDate || false,
      route_id: line.routeId || false,
      remarks: line.remarks?.trim() || false,
    })),
  };

  const result = await executeOdooKw<
    number | { plan_id?: number; id?: number; created?: boolean; message?: string }
  >(
    "mfo.seasonal.plan",
    "action_mfo_create_seasonal_plan",
    [payload],
    {},
    connectionOverrides,
  );

  if (typeof result === "number") {
    return {
      planId: result,
      created: true,
      message: "Улирлын хог ачилтын төлөвлөгөө амжилттай үүслээ.",
    };
  }

  const planId = result.plan_id || result.id;
  if (!planId) {
    throw new Error("Улирлын төлөвлөгөөний дугаар буцаагдсангүй.");
  }

  return {
    planId,
    created: result.created ?? true,
    message: result.message || "Улирлын хог ачилтын төлөвлөгөө амжилттай үүслээ.",
  };
}

export async function generateSeasonalWorkspaceExecution(
  input: {
    planId: number;
    workDate: string;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return executeOdooKw<
    boolean | { created?: number; warning_count?: number; message?: string }
  >(
    "mfo.seasonal.plan",
    "action_mfo_generate_seasonal_execution",
    [[input.planId], { work_date: input.workDate }],
    {},
    connectionOverrides,
  );
}

export async function loadSeasonalPlanDetail(
  planId: number,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<SeasonalPlan> {
  const [plans, lines, days] = await Promise.all([
    executeOdooKw<SeasonalPlanRecord[]>(
      "mfo.seasonal.plan",
      "search_read",
      [[["id", "=", planId]]],
      {
        fields: [
          "name",
          "department_id",
          "operation_type",
          "date_start",
          "date_end",
          "work_days",
          "state",
          "notes",
        ],
        limit: 1,
      },
      connectionOverrides,
    ),
    executeOdooKw<SeasonalPlanLineRecord[]>(
      "mfo.seasonal.plan.line",
      "search_read",
      [[["plan_id", "=", planId]]],
      {
        fields: [
          "plan_id",
          "sequence",
          "district_id",
          "subdistrict_id",
          "khoroo_label",
          "location_name",
          "planned_vehicle_count",
          "planned_tonnage",
          "route_id",
          "remarks",
        ],
        order: "sequence asc, id asc",
        limit: 1000,
      },
      connectionOverrides,
    ),
    executeOdooKw<SeasonalPlanDayRecord[]>(
      "mfo.seasonal.plan.day",
      "search_read",
      [[["plan_line_id.plan_id", "=", planId]]],
      {
        fields: [
          "plan_line_id",
          "work_date",
          "is_planned",
          "status",
          "assigned_vehicle_id",
          "generated_task_id",
          "actual_vehicle_count",
          "actual_tonnage",
          "completion_note",
        ],
        order: "work_date asc, id asc",
        limit: 5000,
      },
      connectionOverrides,
    ),
  ]);

  const plan = plans[0];
  if (!plan) {
    throw new Error("Улирлын төлөвлөгөө олдсонгүй.");
  }

  const daysByLineId = new Map<number, SeasonalPlanDay[]>();
  for (const day of days) {
    const lineId = relationId(day.plan_line_id);
    if (!lineId || !day.work_date) {
      continue;
    }

    const dayItem: SeasonalPlanDay = {
      id: day.id,
      lineId,
      workDate: day.work_date,
      workDateLabel: formatShortDateLabel(day.work_date),
      isPlanned: Boolean(day.is_planned ?? true),
      status: day.status || "planned",
      statusLabel: seasonalDayStatusLabel(day.status),
      assignedVehicleId: relationId(day.assigned_vehicle_id ?? false),
      assignedVehicleName: relationName(day.assigned_vehicle_id ?? false, "Оноогоогүй"),
      generatedTaskId: relationId(day.generated_task_id ?? false),
      generatedTaskHref: relationId(day.generated_task_id ?? false)
        ? `/tasks/${relationId(day.generated_task_id ?? false)}`
        : "",
      actualVehicleCount: day.actual_vehicle_count ?? 0,
      actualTonnage: day.actual_tonnage ?? 0,
      completionNote: day.completion_note || "",
    };

    const existing = daysByLineId.get(lineId) ?? [];
    existing.push(dayItem);
    daysByLineId.set(lineId, existing);
  }

  const normalizedLines = lines.map<SeasonalPlanLine>((line, index) => {
    const lineDays = daysByLineId.get(line.id) ?? [];

    return {
      id: line.id,
      sequence: line.sequence ?? index + 1,
      districtName: relationName(line.district_id ?? false, ""),
      subdistrictName: relationName(line.subdistrict_id ?? false, ""),
      khorooLabel: line.khoroo_label || "",
      locationName: line.location_name || "",
      plannedVehicleCount: line.planned_vehicle_count ?? 0,
      plannedVehicleCountLabel: `${line.planned_vehicle_count ?? 0} машин`,
      plannedTonnage: line.planned_tonnage ?? 0,
      plannedTonnageLabel: formatTonnage(line.planned_tonnage ?? 0),
      routeId: relationId(line.route_id ?? false),
      routeName: relationName(line.route_id ?? false, "Маршрутгүй"),
      remarks: line.remarks || "",
      days: lineDays,
    };
  });

  const plannedDateMap = new Map<string, { generatedCount: number; pendingCount: number }>();
  for (const day of normalizedLines.flatMap((line) => line.days)) {
    const existing = plannedDateMap.get(day.workDate) ?? { generatedCount: 0, pendingCount: 0 };
    if (day.generatedTaskId) {
      existing.generatedCount += 1;
    } else {
      existing.pendingCount += 1;
    }
    plannedDateMap.set(day.workDate, existing);
  }

  const plannedDates = Array.from(plannedDateMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, counts]) => ({
      dateKey,
      dateLabel: formatShortDateLabel(dateKey),
      generatedCount: counts.generatedCount,
      pendingCount: counts.pendingCount,
    }));

  const conflictWarnings = await loadSeasonalConflictWarnings(days, connectionOverrides);
  const totalPlannedVehicleCount = normalizedLines.reduce(
    (sum, line) => sum + line.plannedVehicleCount,
    0,
  );
  const totalPlannedTonnage = normalizedLines.reduce(
    (sum, line) => sum + line.plannedTonnage,
    0,
  );

  return {
    id: plan.id,
    name: plan.name,
    departmentName: relationName(plan.department_id),
    operationType: plan.operation_type || "garbage_seasonal",
    state: plan.state || "draft",
    stateLabel: seasonalStateLabel(plan.state),
    dateStart: formatDateInput(plan.date_start),
    dateEnd: formatDateInput(plan.date_end),
    dateRangeLabel: dateRangeLabel(
      formatDateInput(plan.date_start),
      formatDateInput(plan.date_end),
    ),
    workDays: parseWorkDays(plan.work_days),
    workDayLabels: parseWorkDays(plan.work_days).map((day) => weekdayLabel(day)),
    notes: plan.notes || "",
    lineCount: normalizedLines.length,
    plannedDateCount: plannedDates.length,
    generatedDateCount: plannedDates.filter((item) => item.generatedCount > 0).length,
    totalPlannedVehicleCount,
    totalPlannedTonnage,
    totalPlannedTonnageLabel: formatTonnage(totalPlannedTonnage),
    lines: normalizedLines,
    plannedDates,
    conflictWarnings,
  };
}

export async function loadProjectDetail(
  projectId: number,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<ProjectDetail> {
  const [projects, tasks, teamLeaderOptions, workUnits, workTypes] = await Promise.all([
    searchReadWithFieldFallback<ProjectRecord>(
      "project.project",
      [["id", "=", projectId]],
      [
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
      {
        limit: 1,
      },
      connectionOverrides,
    ),
    searchReadWithFieldFallback<TaskRecord>(
      "project.task",
      [["project_id", "=", projectId]],
      [
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
      {
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

  const projectDepartmentId = relationId(project.ops_department_id);
  const departmentUserOptions = await loadDepartmentUserOptions(
    projectDepartmentId,
    connectionOverrides,
  );

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
  const allCrewTeamOptions = await loadCrewTeamOptions(
    project.mfo_operation_type || "",
    connectionOverrides,
  );
  const crewTeamOptions = filterCrewTeamsByDepartmentUsers(
    allCrewTeamOptions,
    departmentUserOptions,
  );
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
    departmentId: projectDepartmentId,
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
    departmentUserOptions,
    crewTeamOptions,
    workTypeName: workType?.name ?? "",
    operationType: project.mfo_operation_type || "",
    allowedUnits,
    allUnitOptions: workUnits,
    defaultUnitId,
    allowedUnitSummary,
  };
}

export async function loadTaskDetail(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<TaskDetail> {
  const taskPromise = searchReadWithFieldFallback<TaskRecord>(
    "project.task",
    [["id", "=", taskId]],
    [
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
    {
      limit: 1,
    },
    connectionOverrides,
  );

  const reportQuery = (overrides: Partial<OdooConnection>) =>
    searchReadWithFieldFallback<ReportRecord>(
      "ops.task.report",
      [["task_id", "=", taskId]],
      [
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
      {
        order: "report_datetime desc",
        limit: 60,
      },
      overrides,
    );

  const messageQuery = (overrides: Partial<OdooConnection>) =>
    executeOdooKw<MailMessageRecord[]>(
      "mail.message",
      "search_read",
      [[["model", "=", "project.task"], ["res_id", "=", taskId]]],
      {
        fields: ["author_id", "date", "body", "message_type", "subtype_id"],
        order: "date desc, id desc",
        limit: 40,
      },
      overrides,
    );

  const [tasks, primaryReports, primaryMessages] = await Promise.all([
    taskPromise,
    reportQuery(connectionOverrides).catch(() => [] as ReportRecord[]),
    messageQuery(connectionOverrides).catch(() => [] as MailMessageRecord[]),
  ]);

  const task = tasks[0];
  if (!task) {
    throw new Error("Даалгавар олдсонгүй.");
  }

  let reports = primaryReports;
  let messages = primaryMessages;
  const primaryConnection = createOdooConnection(connectionOverrides);
  const fallbackConnection = createOdooConnection();
  const sameConnection =
    primaryConnection.url === fallbackConnection.url &&
    primaryConnection.db === fallbackConnection.db &&
    primaryConnection.login === fallbackConnection.login &&
    primaryConnection.password === fallbackConnection.password;

  if (!sameConnection) {
    if (!reports.length) {
      reports = await reportQuery({}).catch(() => [] as ReportRecord[]);
    }
    if (!messages.length) {
      messages = await messageQuery({}).catch(() => [] as MailMessageRecord[]);
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
    quantityOptional:
      task.mfo_operation_type === "garbage" ||
      task.mfo_operation_type === "garbage_seasonal",
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
    description: htmlToPlainText(task.description),
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
    messages: messages
      .map((message) => ({
        id: message.id,
        author: relationName(message.author_id, "Систем"),
        postedAt: formatDateLabel(message.date),
        body: htmlToPlainText(message.body),
        kind: classifyTaskMessage(message),
        subtype: relationName(message.subtype_id, ""),
      }))
      .filter((message) => message.body)
      .slice(0, 20),
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

export async function assignGarbageProjectTasksFromRouteTeam(
  input: {
    projectId: number;
    routeId: number;
    vehicleId?: number | null;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const crewTeam = await loadCrewTeamForRoute(input.routeId, connectionOverrides);
  if (!crewTeam) {
    return { assignedTaskCount: 0, hasCrewTeam: false };
  }

  const tasks = await executeOdooKw<Array<{ id: number }>>(
    "project.task",
    "search_read",
    [[["project_id", "=", input.projectId]]],
    {
      fields: ["id"],
      limit: 500,
    },
    connectionOverrides,
  );
  if (!tasks.length) {
    return { assignedTaskCount: 0, hasCrewTeam: true };
  }

  const values: Record<string, unknown> = {
    mfo_crew_team_id: crewTeam.id,
    ops_planned_quantity: 1,
  };
  if (input.vehicleId) {
    values.mfo_vehicle_id = input.vehicleId;
  }
  const memberUserIds = Array.from(new Set(crewTeam.member_user_ids ?? [])).filter(
    (id) => Number.isFinite(id) && id > 0,
  );
  if (memberUserIds.length) {
    values.user_ids = [[6, 0, memberUserIds]];
  }
  const driverEmployeeId = relationId(crewTeam.driver_employee_id ?? false);
  const inspectorEmployeeId = relationId(crewTeam.inspector_employee_id ?? false);
  if (driverEmployeeId) {
    values.mfo_driver_employee_id = driverEmployeeId;
  }
  if (crewTeam.collector_employee_ids?.length) {
    values.mfo_collector_employee_ids = [[6, 0, crewTeam.collector_employee_ids]];
  }
  if (inspectorEmployeeId) {
    values.mfo_inspector_employee_id = inspectorEmployeeId;
  }

  await executeOdooKw<boolean>(
    "project.task",
    "write",
    [tasks.map((task) => task.id), values],
    {},
    connectionOverrides,
  );

  return { assignedTaskCount: tasks.length, hasCrewTeam: true };
}

export async function createWorkspaceTask(
  input: {
    projectId: number;
    name: string;
    teamLeaderId?: number | null;
    crewTeamId?: number | null;
    assigneeUserIds?: number[];
    startDate?: string;
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
  if (input.crewTeamId) {
    values.mfo_crew_team_id = input.crewTeamId;
  }
  const assigneeUserIds = Array.from(
    new Set([
      ...(input.teamLeaderId ? [input.teamLeaderId] : []),
      ...(input.assigneeUserIds ?? []),
    ]),
  ).filter((id) => Number.isFinite(id) && id > 0);
  if (input.deadline) {
    values.date_deadline = input.deadline;
  }
  if (input.startDate) {
    values.mfo_planned_start = dateInputToOdooDatetime(input.startDate);
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

  const taskId = await executeOdooKw<number>(
    "project.task",
    "create",
    [values],
    {},
    connectionOverrides,
  );

  if (assigneeUserIds.length) {
    await executeOdooKw<boolean>(
      "project.task",
      "write",
      [[taskId], { user_ids: [[6, 0, assigneeUserIds]] }],
      {},
      connectionOverrides,
    );
  }

  return taskId;
}

export async function createWorkspaceTaskAttachments(
  taskId: number,
  attachments: WorkspaceReportAttachmentInput[],
  connectionOverrides: Partial<OdooConnection> = {},
) {
  if (!attachments.length) {
    return [];
  }

  return Promise.all(
    attachments.map((attachment) =>
      executeOdooKw<number>(
        "ir.attachment",
        "create",
        [
          {
            name: attachment.name,
            datas: attachment.base64,
            mimetype: attachment.mimeType || "application/octet-stream",
            res_model: "project.task",
            res_id: taskId,
          },
        ],
        {},
        connectionOverrides,
      ),
    ),
  );
}

export async function createWorkspaceProjectAttachments(
  projectId: number,
  attachments: WorkspaceReportAttachmentInput[],
  connectionOverrides: Partial<OdooConnection> = {},
) {
  if (!attachments.length) {
    return [];
  }

  return Promise.all(
    attachments.map((attachment) =>
      executeOdooKw<number>(
        "ir.attachment",
        "create",
        [
          {
            name: attachment.name,
            datas: attachment.base64,
            mimetype: attachment.mimeType || "application/octet-stream",
            res_model: "project.project",
            res_id: projectId,
          },
        ],
        {},
        connectionOverrides,
      ),
    ),
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
  const reportId = await executeOdooKw<number>(
    "project.task",
    "action_ops_create_mobile_report",
    [
      [input.taskId],
      {
        report_text: input.reportText.trim(),
        reported_quantity: input.reportedQuantity,
        image_attachments: [],
        audio_attachments: [],
      },
    ],
    {},
    connectionOverrides,
  );

  const createReportAttachments = async (
    attachments: WorkspaceReportAttachmentInput[] | undefined,
  ) => {
    const attachmentIds: number[] = [];

    for (const attachment of attachments ?? []) {
      const attachmentId = await executeOdooKw<number>(
        "ir.attachment",
        "create",
        [
          {
            name: attachment.name,
            datas: attachment.base64,
            mimetype: attachment.mimeType || "application/octet-stream",
            res_model: "ops.task.report",
            res_id: reportId,
          },
        ],
        {},
        connectionOverrides,
      );
      attachmentIds.push(attachmentId);
    }

    return attachmentIds;
  };

  const [imageAttachmentIds, audioAttachmentIds] = await Promise.all([
    createReportAttachments(input.imageAttachments),
    createReportAttachments(input.audioAttachments),
  ]);

  if (imageAttachmentIds.length || audioAttachmentIds.length) {
    await executeOdooKw<boolean>(
      "ops.task.report",
      "write",
      [
        [reportId],
        {
          ...(imageAttachmentIds.length
            ? { image_attachment_ids: [[6, 0, imageAttachmentIds]] }
            : {}),
          ...(audioAttachmentIds.length
            ? { audio_attachment_ids: [[6, 0, audioAttachmentIds]] }
            : {}),
        },
      ],
      {},
      connectionOverrides,
    );
  }

  return reportId;
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

async function writeWorkspaceTaskCompletionFallback(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const writeProgress = (values: Record<string, unknown>) =>
    executeOdooKw<boolean>(
      "project.task",
      "write",
      [[taskId], values],
      {},
      connectionOverrides,
    );

  try {
    await writeProgress({
      ops_planned_quantity: 1,
      ops_completed_quantity: 1,
      ops_progress_percent: 100,
    });
  } catch {
    try {
      await writeProgress({ ops_progress_percent: 100 });
    } catch {
      await writeProgress({
        ops_planned_quantity: 1,
        ops_completed_quantity: 1,
      });
    }
  }
}

export async function completeUnmeasuredWorkspaceTaskForReview(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  await writeWorkspaceTaskCompletionFallback(taskId, connectionOverrides);

  return submitWorkspaceTaskForReview(taskId, connectionOverrides);
}

export async function sendWorkspaceTaskReportToReview(
  taskId: number,
  options: {
    forceComplete?: boolean;
  } = {},
  connectionOverrides: Partial<OdooConnection> = {},
) {
  if (options.forceComplete) {
    await writeWorkspaceTaskCompletionFallback(taskId, connectionOverrides);
  }

  try {
    return await submitWorkspaceTaskForReview(taskId, connectionOverrides);
  } catch (error) {
    if (!options.forceComplete) {
      await writeWorkspaceTaskCompletionFallback(taskId, connectionOverrides);
      return submitWorkspaceTaskForReview(taskId, connectionOverrides);
    }

    throw error;
  }
}

async function loadDefaultActivityTypeId(connectionOverrides: Partial<OdooConnection>) {
  const readActivityTypes = (domain: unknown[]) =>
    executeOdooKw<Array<{ id: number }>>(
      "mail.activity.type",
      "search_read",
      [domain],
      {
        fields: ["id"],
        limit: 1,
      },
      connectionOverrides,
    );

  const defaultTypes = await readActivityTypes([["category", "=", "default"]]).catch(
    () => [],
  );
  if (defaultTypes[0]?.id) {
    return defaultTypes[0].id;
  }

  const fallbackTypes = await readActivityTypes([]).catch(() => []);
  return fallbackTypes[0]?.id ?? null;
}

async function loadProjectTaskModelId(connectionOverrides: Partial<OdooConnection>) {
  const models = await executeOdooKw<Array<{ id: number }>>(
    "ir.model",
    "search_read",
    [[["model", "=", "project.task"]]],
    {
      fields: ["id"],
      limit: 1,
    },
    connectionOverrides,
  ).catch(() => []);

  return models[0]?.id ?? null;
}

export async function notifyWorkspaceTaskReportReviewers(
  taskId: number,
  reporterName: string,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  try {
    const tasks = await executeOdooKw<
      Array<{
        id: number;
        name: string;
        project_id: Relation;
        ops_team_leader_id: Relation;
        user_ids: number[];
      }>
    >(
      "project.task",
      "search_read",
      [[["id", "=", taskId]]],
      {
        fields: ["name", "project_id", "ops_team_leader_id", "user_ids"],
        limit: 1,
      },
      connectionOverrides,
    );
    const task = tasks[0];
    if (!task) {
      return;
    }

    const projectId = relationId(task.project_id);
    const projects = projectId
      ? await executeOdooKw<
          Array<{
            id: number;
            name: string;
            user_id: Relation;
            ops_department_id: Relation;
          }>
        >(
          "project.project",
          "search_read",
          [[["id", "=", projectId]]],
          {
            fields: ["name", "user_id", "ops_department_id"],
            limit: 1,
          },
          connectionOverrides,
        ).catch(() => [])
      : [];
    const project = projects[0] ?? null;
    const departmentId = project ? relationId(project.ops_department_id) : null;
    const recipientIds = new Set<number>();
    const teamLeaderId = relationId(task.ops_team_leader_id);
    const projectManagerId = project ? relationId(project.user_id) : null;

    if (teamLeaderId) {
      recipientIds.add(teamLeaderId);
    }
    if (projectManagerId) {
      recipientIds.add(projectManagerId);
    }

    const roleUsers = await executeOdooKw<UserRecord[]>(
      "res.users",
      "search_read",
      [
        [
          ["share", "=", false],
          ["ops_user_type", "in", ["director", "general_manager", "project_manager", "senior_master", "team_leader"]],
        ],
      ],
      {
        fields: ["name", "login", "ops_user_type", "partner_id"],
        limit: 200,
      },
      connectionOverrides,
    ).catch(() => []);

    const departmentEmployees = departmentId
      ? await executeOdooKw<
          Array<{
            user_id: Relation;
            department_id: Relation;
            job_id?: Relation;
            job_title?: string | false;
          }>
        >(
          "hr.employee",
          "search_read",
          [[["department_id", "=", departmentId], ["user_id", "!=", false]]],
          {
            fields: ["user_id", "department_id", "job_id", "job_title"],
            limit: 300,
          },
          connectionOverrides,
        ).catch(() => [])
      : [];
    const departmentUserIds = new Set(
      departmentEmployees
        .map((employee) => relationId(employee.user_id))
        .filter((id): id is number => Boolean(id)),
    );
    const assignedUserIds = new Set(task.user_ids ?? []);

    for (const user of roleUsers) {
      const role = user.ops_user_type || "";
      const isExecutiveReviewer = role === "director" || role === "general_manager";
      const isDepartmentReviewer =
        role === "project_manager" && (!departmentId || departmentUserIds.has(user.id));
      const isMasterReviewer =
        (role === "senior_master" || role === "team_leader") &&
        (user.id === teamLeaderId || assignedUserIds.has(user.id));

      if (isExecutiveReviewer || isDepartmentReviewer || isMasterReviewer) {
        recipientIds.add(user.id);
      }
    }

    for (const employee of departmentEmployees) {
      const employeeUserId = relationId(employee.user_id);
      if (employeeUserId && isMasterLikeJobTitle(getEmployeeJobTitle(employee))) {
        recipientIds.add(employeeUserId);
      }
    }

    const finalRecipientIds = Array.from(recipientIds).filter((id) => id > 0);
    if (!finalRecipientIds.length) {
      return;
    }

    const [activityTypeId, modelId, recipientUsers] = await Promise.all([
      loadDefaultActivityTypeId(connectionOverrides),
      loadProjectTaskModelId(connectionOverrides),
      executeOdooKw<UserRecord[]>(
        "res.users",
        "search_read",
        [[["id", "in", finalRecipientIds]]],
        {
          fields: ["name", "login", "ops_user_type", "partner_id"],
          limit: finalRecipientIds.length,
        },
        connectionOverrides,
      ).catch(() => []),
    ]);

    const title = "Шинэ тайлан хяналт хүлээж байна";
    const projectName = relationName(task.project_id, "Ажил");
    const note = [
      `<p><strong>${task.name}</strong> ажилбар дээр шинэ тайлан орлоо.</p>`,
      `<p>Ажил: ${projectName}<br/>Илгээсэн: ${reporterName}</p>`,
      `<p><a href="/tasks/${task.id}">Тайлан шалгах</a></p>`,
    ].join("");

    if (activityTypeId && modelId) {
      await Promise.all(
        finalRecipientIds.map((userId) =>
          executeOdooKw<number>(
            "mail.activity",
            "create",
            [
              {
                activity_type_id: activityTypeId,
                res_model: "project.task",
                res_model_id: modelId,
                res_id: task.id,
                user_id: userId,
                summary: title,
                note,
                date_deadline: new Date().toISOString().slice(0, 10),
              },
            ],
            {},
            connectionOverrides,
          ).catch(() => 0),
        ),
      );
    }

    const partnerIds = recipientUsers
      .map((user) => relationId(user.partner_id ?? false))
      .filter((id): id is number => Boolean(id));
    if (partnerIds.length) {
      await executeOdooKw<number>(
        "project.task",
        "message_post",
        [[task.id]],
        {
          body: note,
          subject: title,
          partner_ids: partnerIds,
          message_type: "notification",
          subtype_xmlid: "mail.mt_comment",
        },
        connectionOverrides,
      ).catch(() => 0);
    }
  } catch (error) {
    console.error("Failed to notify task report reviewers:", error);
  }
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

async function loadDoneTaskStageId(connectionOverrides: Partial<OdooConnection>) {
  const stages = await executeOdooKw<Array<{ id: number; name: string }>>(
    "project.task.type",
    "search_read",
    [
      [
        "|",
        ["name", "ilike", "Дууссан"],
        ["name", "ilike", "Done"],
      ],
    ],
    {
      fields: ["name"],
      order: "sequence desc, id desc",
      limit: 1,
    },
    connectionOverrides,
  ).catch(() => []);

  return stages[0]?.id ?? null;
}

export async function forceWorkspaceTaskDone(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const doneStageId = await loadDoneTaskStageId(connectionOverrides);
  const values: Record<string, unknown> = {
    ops_progress_percent: 100,
  };

  if (doneStageId) {
    values.stage_id = doneStageId;
  }

  try {
    values.state = "1_done";
    return await executeOdooKw<boolean>(
      "project.task",
      "write",
      [[taskId], values],
      {},
      connectionOverrides,
    );
  } catch {
    delete values.state;
    return executeOdooKw<boolean>(
      "project.task",
      "write",
      [[taskId], values],
      {},
      connectionOverrides,
    );
  }
}

export async function postWorkspaceTaskMessage(
  taskId: number,
  input: {
    body: string;
    kind: "message" | "note";
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const body = input.body.trim();
  if (!body) {
    return 0;
  }

  return executeOdooKw<number>(
    "project.task",
    "message_post",
    [[taskId]],
    {
      body: plainTextToOdooHtml(body),
      message_type: "comment",
      subtype_xmlid: input.kind === "note" ? "mail.mt_note" : "mail.mt_comment",
    },
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
