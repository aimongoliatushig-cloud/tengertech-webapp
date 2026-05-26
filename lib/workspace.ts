import "server-only";

import { CANONICAL_DEPARTMENT_NAMES, normalizeOrganizationUnitName } from "@/lib/department-groups";
import { findLocalInspectorScope } from "@/lib/inspector-scope-store";
import { createOdooConnection, executeOdooKw, loadFleetVehicleBoard, type OdooConnection } from "@/lib/odoo";
import {
  findLocalRoadCleaningAreaOption,
  loadLocalRoadCleaningAreaOptions,
  updateLocalRoadCleaningAreaMasterAssignments,
} from "@/lib/road-cleaning-area-store";

type Relation = [number, string] | false;

type ProjectRecord = {
  id: number;
  name: string;
  user_id: Relation;
  ops_department_id: Relation;
  date_start: string | false;
  date: string | false;
  description?: string | false;
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
  mfo_crew_team_id?: Relation;
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
  mfo_planned_start?: string | false;
  mfo_shift_date?: string | false;
  mfo_vehicle_id?: Relation;
  mfo_driver_employee_id?: Relation;
  mfo_collector_employee_ids?: number[];
  mfo_inspector_employee_id?: Relation;
  mfo_unresolved_stop_count?: number;
  mfo_missing_proof_stop_count?: number;
  mfo_route_deviation_stop_count?: number;
  mfo_weight_sync_warning?: boolean;
  state: string;
  mfo_state?: string | false;
  description?: string | false;
  ops_can_submit_for_review?: boolean;
  ops_can_mark_done?: boolean;
  ops_can_return_for_changes?: boolean;
  ops_reports_locked?: boolean;
};

type ReportRecord = {
  id: number;
  task_id?: Relation;
  reporter_id: Relation;
  report_datetime: string;
  report_text: string;
  report_summary: string | false;
  reported_quantity: number;
  image_count: number;
  audio_count: number;
  image_attachment_ids: number[];
  audio_attachment_ids: number[];
  state?: string | false;
  rejection_reason?: string | false;
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
  attachment_ids?: number[];
};

type OdooAttachmentRecord = {
  id: number;
  name: string | false;
  mimetype: string | false;
  res_id?: number | false;
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

type CleaningAreaRecord = {
  id: number;
  name: string;
  khoroo_name?: string | false;
  working_day_keys?: string | false;
  street_name?: string | false;
  start_point?: string | false;
  end_point?: string | false;
  area_m2?: number | false;
  department_id?: Relation;
  master_id?: Relation;
  employee_id?: Relation;
  frequency?: string | false;
  note?: string | false;
};

type CrewTeamRecord = {
  id: number;
  name: string;
  active?: boolean;
  operation_type?: string | false;
  department_id?: Relation;
  ops_department_id?: Relation;
  vehicle_id?: Relation;
  driver_employee_id?: Relation;
  mfo_driver_employee_id?: Relation;
  leader_employee_id?: Relation;
  team_leader_id?: Relation;
  master_employee_id?: Relation;
  responsible_employee_id?: Relation;
  collector_employee_ids?: number[];
  member_employee_ids?: number[];
  member_ids?: number[];
  employee_ids?: number[];
  loader_employee_ids?: number[];
  loader_ids?: number[];
  inspector_employee_id?: Relation;
  member_user_ids?: number[];
  user_ids?: number[];
  service_area?: string | false;
  zone_name?: string | false;
  responsibility_area?: string | false;
  khoroo_scope?: string | false;
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
  jobTitle?: string;
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

export type RoadCleaningAreaOption = {
  id: number;
  name: string;
  khorooName: string;
  workingDayKeys: string[];
  streetName: string;
  startPoint: string;
  endPoint: string;
  areaM2: number;
  departmentId: number | null;
  departmentName: string;
  masterId: number | null;
  masterName: string;
  employeeId: number | null;
  employeeName: string;
  frequency: string;
  frequencyLabel: string;
  note: string;
};

export type RoadCleaningEmployeeOption = {
  id: number;
  name: string;
  departmentId: number | null;
  departmentName: string;
  jobTitle: string;
  phone: string;
  userId: number | null;
};

const ROAD_CLEANING_WORKING_DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const ROAD_CLEANING_WORKING_DAY_KEY_SET = new Set<string>(ROAD_CLEANING_WORKING_DAY_KEYS);

function normalizeRoadCleaningWorkingDayKeys(value?: string | string[] | false | null) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  const keys = source
    .map((item) => item.trim())
    .filter((item) => ROAD_CLEANING_WORKING_DAY_KEY_SET.has(item));
  return keys.length ? Array.from(new Set(keys)) : [...ROAD_CLEANING_WORKING_DAY_KEYS];
}

function getRoadCleaningDayKey(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00+08:00`);
  return ROAD_CLEANING_WORKING_DAY_KEYS[(date.getUTCDay() + 6) % 7] ?? "monday";
}

function isRoadCleaningWorkingDate(area: Pick<RoadCleaningAreaOption, "workingDayKeys">, dateValue: string) {
  return area.workingDayKeys.includes(getRoadCleaningDayKey(dateValue));
}

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
  departmentName?: string;
  isRepair?: boolean;
  statusLabel?: string;
  mfo_garbage_work_create_allowed?: boolean;
};

type GarbagePointRecord = {
  id: number;
  name: string;
  subdistrict_id?: Relation;
  inspector_employee_ids?: number[];
  operation_type?: string | false;
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
  departmentName?: string;
  isRepair?: boolean;
  isOperational?: boolean;
  isArchived?: boolean;
  statusLabel?: string;
  driverId?: number | null;
  driverName?: string;
  loaderIds?: number[];
  loaderNames?: string[];
};

export type GarbagePointOption = {
  id: number;
  label: string;
  name: string;
  subdistrictId: number | null;
  subdistrictName: string;
};

export type GarbageSubdistrictOption = {
  id: number;
  label: string;
  name: string;
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
  vehicleIds?: number[];
  plannedVehicleCount: number;
  plannedTonnage: number;
  plannedUnit?: string;
  workDate?: string | null;
  routeId?: number | null;
  remarks?: string;
};

export type SeasonalPlanCreateResult = {
  planId: number;
  created: boolean;
  message: string;
  redirectHref?: string;
  fallbackProjectId?: number;
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
  isOverdue: boolean;
  progress: number;
  deadline: string;
  deadlineValue: string;
  startDateValue: string;
  teamLeaderId: number | null;
  teamLeaderName: string;
  teamLeaderJobTitle: string;
  crewTeamId: number | null;
  assignees: string[];
  assigneeUserIds: number[];
  vehicleId: number | null;
  vehicleName: string;
  driverEmployeeId: number | null;
  driverName: string;
  collectorEmployeeIds: number[];
  collectorNames: string[];
  plannedQuantity: number;
  measurementUnitId: number | null;
  completedQuantity: number;
  measurementUnit: string;
  quantitySummary: string;
  quantitySummaryLines: string[];
  description: string;
  reportCount: number;
};

export type WorkspaceAttachmentItem = {
  id: number;
  name: string;
  mimetype: string;
  url: string;
};

export type ProjectDetail = {
  id: number;
  name: string;
  managerName: string;
  managerJobTitle: string;
  managerId: number | null;
  departmentName: string;
  departmentId: number | null;
  startDate: string;
  deadline: string;
  description: string;
  attachments: WorkspaceAttachmentItem[];
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

export type ProjectAccessSummary = {
  id: number;
  managerId: number | null;
  departmentName: string;
};

export type TaskReportFeedItem = {
  id: number;
  reporterId: number | null;
  reporter: string;
  submittedAt: string;
  state: string;
  stateLabel: string;
  stateBucket: StageBucket;
  rejectionReason: string;
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
  attachments: WorkspaceAttachmentItem[];
};

export type TaskQuantityLine = {
  quantity: number;
  unit: string;
  completedQuantity?: number;
  progress?: number;
};

export type TaskCrewMember = {
  id: string;
  name: string;
  roleLabel: string;
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
  deadlineValue: string;
  startDateValue: string;
  scheduledDate: string;
  measurementUnit: string;
  measurementUnitId: number | null;
  quantityLines: TaskQuantityLine[];
  vehicleName: string;
  driverName: string;
  unresolvedStopCount: number;
  missingProofStopCount: number;
  deviationStopCount: number;
  hasWeightWarning: boolean;
  plannedQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  progress: number;
  teamLeaderId: number | null;
  teamLeaderName: string;
  crewTeamId: number | null;
  crewTeamName: string;
  crewMembers: TaskCrewMember[];
  assignees: string[];
  assigneeUserIds: number[];
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

export type ProjectTaskEditOptions = {
  departmentUserOptions: SelectOption[];
  crewTeamOptions: Array<{
    id: number;
    label: string;
    memberUserIds: number[];
  }>;
  unitOptions: WorkUnitOption[];
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

type StageBucket = "todo" | "progress" | "review" | "done" | "problem" | "unknown";

const STAGE_ALIASES: Array<[StageBucket, string[]]> = [
  ["problem", ["returned", "rejected", "changes_requested", "return", "буцаасан", "буцаагдсан", "засвар"]],
  ["todo", ["төлөвлөгдсөн", "хийгдэх ажил", "хуваарилсан", "draft", "dispatched", "planned", "hiigdeh ajil", "todo", "task"]],
  [
    "progress",
    ["явагдаж буй", "явагдаж буй ажил", "хийгдэж", "хийж байна", "ажиллаж", "in_progress", "yovagdaj bui ajil", "progress", "in progress"],
  ],
  ["review", ["хянагдаж буй", "шалгагдаж буй ажил", "хянагдаж буй ажил", "submitted", "under_review", "shalgagdaj bui ajil", "hyanagdaj bui ajil", "review", "changes requested"]],
  ["done", ["дууссан", "дууссан ажил", "verified", "approved", "1_done", "duussan ajil", "done", "completed"]],
  ["todo", ["төлөвлөгдсөн", "хуваарилсан"]],
  ["progress", ["гүйцэтгэж байна"]],
  ["review", ["шалгаж байна"]],
  ["done", ["дууссан"]],
];

function resolveEffectiveTaskStage(
  stageName: string,
  progress: number,
  context: {
    reportCount?: number;
    reportStates?: Array<string | false | undefined>;
    mfoState?: string | false;
    taskState?: string | false;
    reportsLocked?: boolean;
  } = {},
) {
  const stateBucket = normalizeStageBucket(String(context.taskState || ""));
  const mfoBucket = normalizeStageBucket(String(context.mfoState || ""));
  const stageBucket = normalizeStageBucket(stageName);
  const reportBuckets = (context.reportStates ?? []).map((state) =>
    normalizeStageBucket(String(state || "")),
  );
  const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const hasProblemState =
    stateBucket === "problem" || mfoBucket === "problem" || reportBuckets.includes("problem");
  const hasReviewState =
    mfoBucket === "review" ||
    stateBucket === "review" ||
    stageBucket === "review" ||
    reportBuckets.includes("review");
  const bucket =
    hasProblemState
      ? "problem"
      : hasReviewState
        ? "review"
        : stateBucket === "done" || mfoBucket === "done" || stageBucket === "done"
          ? "done"
          : context.reportsLocked && normalizedProgress >= 100
            ? "done"
            : mfoBucket !== "unknown"
              ? mfoBucket
              : stageBucket;

  if (bucket === "done") {
    return { bucket: "done" as const, label: "Дууссан" };
  }
  if (bucket === "problem") {
    return { bucket: "problem" as const, label: "Засвар шаардсан" };
  }
  if (bucket === "review") {
    return { bucket: "review" as const, label: "Хянагдаж буй" };
  }
  if (bucket === "progress" || normalizedProgress > 0 || (context.reportCount ?? 0) > 0) {
    return { bucket: "progress" as const, label: "Явагдаж буй" };
  }

  return { bucket: "todo" as const, label: "Төлөвлөгдсөн" };
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

  return decodeHtmlEntities(value)
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function translateWorkspaceChatterBody(value: string) {
  const text = value.trim();

  if (!text) {
    return "";
  }

  let translated = text
    .replace(/^Dear\s+(.+?),\s*\n+/i, "$1 танд,\n\n")
    .replace(
      /You have been assigned to the Task\s+([\s\S]+?)\s+and you are now responsible for it\.?/gi,
      (_match, taskName: string) =>
        `Танд “${taskName.trim()}” даалгавар оноогдлоо. Та энэ даалгаврын хариуцагчаар бүртгэгдсэн байна.`,
    )
    .replace(
      /A new task has been created in the\s+([\s\S]+?)\s+project\.?/gi,
      (_match, projectName: string) => `“${projectName.trim()}” ажил дээр шинэ даалгавар үүслээ.`,
    )
    .replace(
      /You have been assigned to the Project\s+([\s\S]+?)\s+and you are now responsible for it\.?/gi,
      (_match, projectName: string) =>
        `Танд “${projectName.trim()}” ажил оноогдлоо. Та энэ ажлын хариуцагчаар бүртгэгдсэн байна.`,
    )
    .replace(
      /A new project has been created(?:\s*:\s*|\s+)([\s\S]+?)\.?$/gi,
      (_match, projectName: string) => `“${projectName.trim()}” нэртэй шинэ ажил үүслээ.`,
    );

  translated = translated.replace(/\n{3,}/g, "\n\n").trim();

  return translated || text;
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

function extractTaskQuantityLines(description: string): TaskQuantityLine[] {
  const markerIndex = description.toLowerCase().indexOf("тоо хэмжээ");
  if (markerIndex === -1) {
    return [];
  }

  const quantityText = description.slice(markerIndex).replace(/^тоо хэмжээ\s*:?\s*/i, "");
  const matches = Array.from(
    quantityText.matchAll(/(?:^|\s)(?:\d+\.\s*)?(\d+(?:[.,]\d+)?)\s+([^\d\n]+?)(?=\s+\d+\.|\n|$)/gi),
  );

  return matches
    .map((match) => ({
      quantity: Number(match[1].replace(",", ".")),
      unit: match[2].trim().replace(/[.,;:]+$/, ""),
    }))
    .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0 && line.unit);
}

function normalizeQuantityUnit(value: string) {
  return value
    .toLowerCase()
    .replace(/[.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractReportQuantityLines(reportText: string): TaskQuantityLine[] {
  const normalizedText = htmlToPlainText(reportText);
  const markerMatch = normalizedText.match(/гүйцэтгэсэн\s+хэмжээ\s*:?\s*/i);
  if (!markerMatch || typeof markerMatch.index !== "number") {
    return [];
  }

  const quantityBlock = normalizedText
    .slice(markerMatch.index + markerMatch[0].length)
    .split(/\n{2,}/)[0];
  const lines = quantityBlock
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line) => {
      const match = line.match(/^(?:\d+\.\s*)?(.+?)\s+(\d+(?:[.,]\d+)?)$/);
      if (!match) {
        return null;
      }
      return {
        quantity: Number(match[2].replace(",", ".")),
        unit: match[1].trim().replace(/[.,;:]+$/, ""),
      };
    })
    .filter(
      (line): line is TaskQuantityLine =>
        line !== null &&
        Number.isFinite(line.quantity) &&
        line.quantity >= 0 &&
        Boolean(line.unit),
    );
}

function enrichQuantityLinesWithReportProgress(
  plannedLines: TaskQuantityLine[],
  reports: ReportRecord[],
) {
  if (!plannedLines.length) {
    return {
      quantityLines: plannedLines,
      completedQuantity: 0,
      progress: 0,
      remainingQuantity: 0,
    };
  }

  const completedByUnit = new Map<string, number>();

  for (const report of reports) {
    const reportLines = extractReportQuantityLines(report.report_text || report.report_summary || "");
    for (const line of reportLines) {
      const key = normalizeQuantityUnit(line.unit);
      completedByUnit.set(key, (completedByUnit.get(key) ?? 0) + line.quantity);
    }
  }

  const quantityLines = plannedLines.map((line) => {
    const completedQuantity = completedByUnit.get(normalizeQuantityUnit(line.unit)) ?? 0;
    const cappedCompletedQuantity = Math.min(completedQuantity, line.quantity);
    const progress =
      line.quantity > 0 ? (cappedCompletedQuantity / line.quantity) * 100 : 0;

    return {
      ...line,
      completedQuantity,
      progress,
    };
  });
  const plannedQuantity = quantityLines.reduce((total, line) => total + line.quantity, 0);
  const completedQuantity = quantityLines.reduce(
    (total, line) => total + Math.min(line.completedQuantity ?? 0, line.quantity),
    0,
  );
  const progress = quantityLines.length
    ? Math.min(
        100,
        Math.round(
          quantityLines.reduce((total, line) => total + (line.progress ?? 0), 0) /
            quantityLines.length,
        ),
      )
    : 0;

  return {
    quantityLines,
    completedQuantity,
    progress,
    remainingQuantity: Math.max(plannedQuantity - completedQuantity, 0),
  };
}

function getProjectTaskQuantitySnapshot(task: TaskRecord, reports: ReportRecord[]) {
  const stageBucket = normalizeStageBucket(relationName(task.stage_id, ""));
  const measurementUnit = formatMeasurementUnit(task.ops_measurement_unit_id, task.ops_measurement_unit);
  const plannedLines = extractTaskQuantityLines(htmlToPlainText(task.description));
  let hasExplicitQuantityLines = plannedLines.length > 0;

  if (!plannedLines.length) {
    const reportLinesByUnit = new Map<string, TaskQuantityLine>();
    for (const report of reports) {
      for (const line of extractReportQuantityLines(report.report_text || report.report_summary || "")) {
        const key = normalizeQuantityUnit(line.unit);
        const currentLine = reportLinesByUnit.get(key);
        reportLinesByUnit.set(key, {
          unit: line.unit,
          quantity: Math.max(currentLine?.quantity ?? 0, line.quantity),
        });
      }
    }
    plannedLines.push(...reportLinesByUnit.values());
    hasExplicitQuantityLines = plannedLines.length > 0;
  }

  if (!plannedLines.length && (task.ops_planned_quantity ?? 0) > 0) {
    plannedLines.push({
      quantity: task.ops_planned_quantity ?? 0,
      unit: measurementUnit,
    });
  }

  const reportProgress = enrichQuantityLinesWithReportProgress(plannedLines, reports);
  const quantityLines = reportProgress.quantityLines.length
    ? reportProgress.quantityLines
    : plannedLines;
  const plannedQuantity = quantityLines.length
    ? quantityLines.reduce((total, line) => total + line.quantity, 0)
    : (task.ops_planned_quantity ?? 0);
  const completedQuantity =
    stageBucket === "done" && plannedQuantity > 0
      ? plannedQuantity
      : reportProgress.completedQuantity > 0
        ? reportProgress.completedQuantity
        : (task.ops_completed_quantity ?? 0);
  const progress =
    stageBucket === "done"
      ? 100
      : reportProgress.progress > 0
        ? reportProgress.progress
        : Math.round(task.ops_progress_percent ?? 0);
  const quantitySummary = quantityLines.length
    ? quantityLines
        .map((line) => {
          const done = stageBucket === "done" ? line.quantity : (line.completedQuantity ?? 0);
          return `${done}/${line.quantity} ${line.unit}`.trim();
        })
        .join(", ")
    : plannedQuantity > 0 && measurementUnit
      ? `${completedQuantity}/${plannedQuantity} ${measurementUnit}`.trim()
      : "";
  const isPlaceholderQuantity =
    !hasExplicitQuantityLines &&
    quantityLines.length <= 1 &&
    plannedQuantity <= 1 &&
    ["нэгж", "unit"].includes(normalizeQuantityUnit(measurementUnit)) &&
    task.mfo_operation_type !== "garbage" &&
    task.mfo_operation_type !== "garbage_seasonal";
  const displayQuantitySummary = isPlaceholderQuantity ? "" : quantitySummary;
  const quantitySummaryLines = displayQuantitySummary
    ? displayQuantitySummary.split(",").map((line) => line.trim()).filter(Boolean)
    : [];

  return {
    plannedQuantity,
    completedQuantity,
    progress,
    measurementUnit,
    quantitySummary: displayQuantitySummary,
    quantitySummaryLines,
  };
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
  const parts = [
    Array.isArray(employee.job_id) ? employee.job_id[1] : "",
    employee.job_title || "",
  ]
    .map((part) => String(part).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const uniqueParts = parts.filter(
    (part, index) =>
      parts.findIndex((candidate) => candidate.toLowerCase() === part.toLowerCase()) === index,
  );
  const words = uniqueParts.join(" ").split(" ");

  return words
    .filter((word, index) => index === 0 || word.toLowerCase() !== words[index - 1].toLowerCase())
    .join(" ")
    .trim();
}

function roleFromMasterJobTitle(jobTitle: string): "senior_master" | "team_leader" {
  return jobTitle.toLowerCase().includes("ахлах мастер") ? "senior_master" : "team_leader";
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

function reportStateLabel(state?: string | false) {
  switch (String(state || "").toLowerCase()) {
    case "submitted":
    case "under_review":
      return "Тайлан илгээсэн";
    case "returned":
    case "rejected":
      return "Буцаагдсан";
    case "approved":
      return "Баталгаажсан";
    case "draft":
      return "Ноорог";
    default:
      return state ? String(state) : "Тайлан";
  }
}

function reportStateBucket(state?: string | false): StageBucket {
  switch (String(state || "").toLowerCase()) {
    case "verified":
    case "done":
    case "cancelled":
    case "canceled":
      return "done";
    case "submitted":
    case "under_review":
      return "review";
    case "returned":
    case "rejected":
      return "problem";
    case "approved":
      return "done";
    default:
      return "progress";
  }
}

function isPastDueDate(value?: string | false | null) {
  if (!value) {
    return false;
  }

  const parsed = new Date(`${value}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.getTime() < Date.now();
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

function formatDateOnlyLabel(value?: string | false) {
  if (!value) {
    return "Товлоогүй";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
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
      return "Гэнэтийн ажил";
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
            fields: ["user_id", "department_id", "job_id", "job_title"],
            limit: 200,
          },
          connectionOverrides,
        ).catch(() => [])
      : [];
    const employeeByUserId = new Map(
      employeeDepartments
        .map((employee) => [
          Array.isArray(employee.user_id) ? employee.user_id[0] : null,
          {
            departmentName: relationName(employee.department_id ?? false, ""),
            jobTitle: getEmployeeJobTitle(employee),
          },
        ] as const)
        .filter(
          (entry): entry is readonly [number, { departmentName: string; jobTitle: string }] =>
            entry[0] !== null,
        ),
    );

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      login: user.login,
      role: user.ops_user_type || "worker",
      departmentName: employeeByUserId.get(user.id)?.departmentName,
      jobTitle: employeeByUserId.get(user.id)?.jobTitle,
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
        jobTitle: getEmployeeJobTitle(employee),
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
      const jobTitle = getEmployeeJobTitle(employee);
      items.push({
        id: userId,
        name: relationName(employee.user_id, employee.name),
        login: phone || employee.work_email || "",
        phone: phone || "",
        role: roleFromMasterJobTitle(jobTitle),
        departmentName: relationName(employee.department_id, ""),
        jobTitle,
      });
      return items;
    }, []);

    return Array.from(new Map(options.map((option) => [option.id, option])).values());
  } catch {
    return [] satisfies SelectOption[];
  }
}

function formatCleaningFrequency(value?: string | false) {
  switch (value) {
    case "daily":
      return "Өдөр бүр";
    case "one_time":
      return "Нэг удаа";
    case "weekly":
      return "7 хоног бүр";
    case "manual":
      return "Гараар";
    default:
      return "Тодорхойгүй";
  }
}

export async function loadRoadCleaningAreaOptions(
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const localAreas = await loadLocalRoadCleaningAreaOptions();
  try {
    const fieldNames = await loadModelFieldNames("municipal.cleaning.area", connectionOverrides);
    const fields = [
      "name",
      fieldNames.has("khoroo_name") ? "khoroo_name" : "",
      fieldNames.has("working_day_keys") ? "working_day_keys" : "",
      "street_name",
      "start_point",
      "end_point",
      "area_m2",
      "department_id",
      "master_id",
      "employee_id",
      "frequency",
      "note",
    ].filter(Boolean);
    const areas = await executeOdooKw<CleaningAreaRecord[]>(
      "municipal.cleaning.area",
      "search_read",
      [[["active", "=", true]]],
      {
        fields,
        order: "street_name asc, name asc",
        limit: 300,
      },
      connectionOverrides,
    );

    const odooAreas = areas.map<RoadCleaningAreaOption>((area) => ({
      id: area.id,
      name: area.name,
      khorooName: String(area.khoroo_name || ""),
      workingDayKeys: normalizeRoadCleaningWorkingDayKeys(area.working_day_keys),
      streetName: String(area.street_name || ""),
      startPoint: String(area.start_point || ""),
      endPoint: String(area.end_point || ""),
      areaM2: Number(area.area_m2 || 0),
      departmentId: relationId(area.department_id ?? false),
      departmentName: relationName(area.department_id ?? false, ""),
      masterId: relationId(area.master_id ?? false),
      masterName: relationName(area.master_id ?? false, ""),
      employeeId: relationId(area.employee_id ?? false),
      employeeName: relationName(area.employee_id ?? false, ""),
      frequency: String(area.frequency || ""),
      frequencyLabel: formatCleaningFrequency(area.frequency),
      note: String(area.note || ""),
    }));
    const odooNames = new Set(odooAreas.map((area) => area.name.trim().toLowerCase()));
    return [
      ...odooAreas,
      ...localAreas.filter((area) => !odooNames.has(area.name.trim().toLowerCase())),
    ];
  } catch {
    return localAreas;
  }
}

export async function loadRoadCleaningEmployeeOptions(
  connectionOverrides: Partial<OdooConnection> = {},
) {
  try {
    const employees = await executeOdooKw<EmployeeUserRecord[]>(
      "hr.employee",
      "search_read",
      [[["active", "=", true]]],
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
        limit: 600,
      },
      connectionOverrides,
    );

    return employees.map<RoadCleaningEmployeeOption>((employee) => {
      const phone = employee.mobile_phone || employee.work_phone || "";
      return {
        id: employee.id,
        name: employee.name,
        departmentId: relationId(employee.department_id),
        departmentName: relationName(employee.department_id, ""),
        jobTitle: getEmployeeJobTitle(employee),
        phone: phone || employee.work_email || "",
        userId: relationId(employee.user_id),
      };
    });
  } catch {
    return [] satisfies RoadCleaningEmployeeOption[];
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
  ).sort((left, right) => {
    const roleRank = (role: string) => (role === "senior_master" ? 0 : 1);
    const rankDiff = roleRank(left.role) - roleRank(right.role);
    if (rankDiff !== 0) {
      return rankDiff;
    }
    const departmentDiff = (left.departmentName ?? "").localeCompare(
      right.departmentName ?? "",
      "mn",
    );
    if (departmentDiff !== 0) {
      return departmentDiff;
    }
    return left.name.localeCompare(right.name, "mn");
  });
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

const ROAD_CLEANING_TEAM_OPERATION_TYPES = ["street_cleaning", "green_maintenance", "garbage"];
const CREW_TEAM_MEMBER_EMPLOYEE_FIELDS = [
  "collector_employee_ids",
  "member_employee_ids",
  "member_ids",
  "employee_ids",
  "loader_employee_ids",
  "loader_ids",
] as const;
const CREW_TEAM_LEADER_FIELDS = [
  "driver_employee_id",
  "mfo_driver_employee_id",
  "leader_employee_id",
  "team_leader_id",
  "master_employee_id",
  "responsible_employee_id",
] as const;

function collectCrewTeamEmployeeIds(team: CrewTeamRecord) {
  const ids = new Set<number>();

  for (const fieldName of CREW_TEAM_MEMBER_EMPLOYEE_FIELDS) {
    const value = team[fieldName];
    if (!Array.isArray(value)) {
      continue;
    }
    for (const id of value) {
      if (Number.isInteger(id) && id > 0) {
        ids.add(id);
      }
    }
  }

  return Array.from(ids);
}

function resolveCrewTeamLeaderId(team: CrewTeamRecord) {
  for (const fieldName of CREW_TEAM_LEADER_FIELDS) {
    const id = relationId(team[fieldName] ?? false);
    if (id) {
      return id;
    }
  }
  return null;
}

export async function loadRoadCleaningTeamOptions(
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const fieldNames = await loadModelFieldNames("mfo.crew.team", connectionOverrides).catch(
    () => new Set<string>(),
  );
  if (!fieldNames.size) {
    return [];
  }

  const domain: unknown[] = [["active", "=", true]];
  if (fieldNames.has("operation_type")) {
    domain.push(["operation_type", "in", ROAD_CLEANING_TEAM_OPERATION_TYPES]);
  }

  const fields = [
    "name",
    "operation_type",
    "department_id",
    "ops_department_id",
    "service_area",
    "zone_name",
    "responsibility_area",
    "khoroo_scope",
    ...CREW_TEAM_LEADER_FIELDS,
    ...CREW_TEAM_MEMBER_EMPLOYEE_FIELDS,
  ].filter((fieldName) => fieldNames.has(fieldName));

  const teams = await executeOdooKw<CrewTeamRecord[]>(
    "mfo.crew.team",
    "search_read",
    [domain],
    {
      fields,
      order: "name asc",
      limit: 300,
    },
    connectionOverrides,
  ).catch(() => []);

  const employeeIds = Array.from(
    new Set([
      ...teams.flatMap((team) => collectCrewTeamEmployeeIds(team)),
      ...teams.map(resolveCrewTeamLeaderId).filter((id): id is number => Boolean(id)),
    ]),
  );
  const employees = employeeIds.length
    ? await executeOdooKw<Array<{ id: number; name: string }>>(
        "hr.employee",
        "search_read",
        [[["id", "in", employeeIds]]],
        {
          fields: ["name"],
          limit: employeeIds.length,
        },
        connectionOverrides,
      ).catch(() => [])
    : [];
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.name]));

  return teams.map((team) => {
    const memberIds = collectCrewTeamEmployeeIds(team);
    const leaderId = resolveCrewTeamLeaderId(team);

    return {
      id: team.id,
      name: team.name,
      operationType: team.operation_type || "",
      departmentName: relationName(team.department_id ?? false) || relationName(team.ops_department_id ?? false),
      leaderId,
      leaderName: leaderId ? employeeNames.get(leaderId) ?? "" : "",
      memberIds,
      memberNames: memberIds
        .map((id) => employeeNames.get(id))
        .filter((name): name is string => Boolean(name)),
      serviceArea:
        team.service_area ||
        team.zone_name ||
        team.responsibility_area ||
        team.khoroo_scope ||
        "",
    };
  });
}

async function loadModelFieldNames(
  model: string,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const fields = await executeOdooKw<Record<string, unknown>>(
    model,
    "fields_get",
    [],
    {},
    connectionOverrides,
  );

  return new Set(Object.keys(fields));
}

function keepSupportedValues(
  values: Record<string, unknown>,
  fieldNames: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([fieldName, value]) => fieldNames.has(fieldName) && value !== undefined,
    ),
  );
}

async function hasModelField(
  model: string,
  fieldName: string,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const fieldNames = await loadModelFieldNames(model, connectionOverrides).catch(() => new Set<string>());
  return fieldNames.has(fieldName);
}

export async function createWorkspaceCrewTeam(
  input: {
    name: string;
    departmentId?: number | null;
    operationType?: string;
    memberUserIds: number[];
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const teamName = input.name.trim();
  const memberUserIds = Array.from(new Set(input.memberUserIds)).filter(
    (id) => Number.isFinite(id) && id > 0,
  );

  if (!teamName) {
    throw new Error("Багийн нэр оруулна уу.");
  }
  if (!memberUserIds.length) {
    throw new Error("Багийн гишүүдээс дор хаяж нэг ажилтан сонгоно уу.");
  }

  const [fieldNames, employees] = await Promise.all([
    loadModelFieldNames("mfo.crew.team", connectionOverrides),
    executeOdooKw<Array<{ id: number; user_id: Relation }>>(
      "hr.employee",
      "search_read",
      [[["user_id", "in", memberUserIds]]],
      {
        fields: ["user_id"],
        limit: 300,
      },
      connectionOverrides,
    ).catch(() => []),
  ]);
  const memberEmployeeIds = employees.map((employee) => employee.id);
  const leaderEmployeeId = memberEmployeeIds[0] ?? null;
  const memberUserCommand = [[6, 0, memberUserIds]];
  const memberEmployeeCommand = memberEmployeeIds.length
    ? [[6, 0, memberEmployeeIds]]
    : undefined;

  const values = keepSupportedValues(
    {
      name: teamName,
      active: true,
      operation_type: input.operationType || "street_cleaning",
      department_id: input.departmentId || undefined,
      ops_department_id: input.departmentId || undefined,
      member_user_ids: memberUserCommand,
      user_ids: memberUserCommand,
      collector_user_ids: memberUserCommand,
      member_employee_ids: memberEmployeeCommand,
      collector_employee_ids: memberEmployeeCommand,
      employee_ids: memberEmployeeCommand,
      member_ids: memberEmployeeCommand,
      loader_employee_ids: memberEmployeeCommand,
      loader_ids: memberEmployeeCommand,
      driver_employee_id: leaderEmployeeId || undefined,
      mfo_driver_employee_id: leaderEmployeeId || undefined,
      leader_employee_id: leaderEmployeeId || undefined,
      team_leader_id: leaderEmployeeId || undefined,
      master_employee_id: leaderEmployeeId || undefined,
      responsible_employee_id: leaderEmployeeId || undefined,
    },
    fieldNames,
  );

  return {
    id: await executeOdooKw<number>(
      "mfo.crew.team",
      "create",
      [values],
      {},
      connectionOverrides,
    ),
    memberUserIds,
  };
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

function slugifyUnitCode(value: string) {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return ascii || `unit_${Date.now().toString(36)}`;
}

export async function createWorkspaceWorkUnit(
  name: string,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const unitName = name.trim();
  if (!unitName) {
    throw new Error("Хэмжих нэгжийн нэр оруулна уу.");
  }

  const existing = await executeOdooKw<WorkUnitRecord[]>(
    "ops.work.unit",
    "search_read",
    [[["name", "=", unitName]]],
    {
      fields: ["name", "code", "category", "sequence"],
      limit: 1,
    },
    connectionOverrides,
  ).catch(() => []);

  if (existing[0]) {
    return buildWorkUnitOption(existing[0]);
  }

  const code = `${slugifyUnitCode(unitName)}_${Date.now().toString(36)}`;
  const unitId = await executeOdooKw<number>(
    "ops.work.unit",
    "create",
    [
      {
        name: unitName,
        code,
        category: "other",
        active: true,
      },
    ],
    {},
    connectionOverrides,
  );

  return {
    id: unitId,
    name: unitName,
    code,
    category: "other",
    categoryLabel: unitCategoryLabel("other"),
  };
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

async function loadCurrentUserId(connectionOverrides: Partial<OdooConnection> = {}) {
  if (!connectionOverrides.login) {
    return null;
  }

  const users = await executeOdooKw<Array<{ id: number }>>(
    "res.users",
    "search_read",
    [[["login", "=", connectionOverrides.login]]],
    {
      fields: ["id"],
      limit: 1,
    },
    connectionOverrides,
  ).catch(() => []);

  return users[0]?.id ?? null;
}

async function loadCurrentEmployeeId(
  connectionOverrides: Partial<OdooConnection> = {},
  userId?: number | null,
) {
  const resolvedUserId = userId ?? (await loadCurrentUserId(connectionOverrides));
  if (!resolvedUserId) {
    return null;
  }

  const employeesByUser = await executeOdooKw<Array<{ id: number }>>(
    "hr.employee",
    "search_read",
    [[["user_id", "=", resolvedUserId]]],
    {
      fields: ["id"],
      limit: 1,
    },
    connectionOverrides,
  ).catch(() => []);

  return employeesByUser[0]?.id ?? null;
}

async function loadCurrentInspectorVehicleScope(
  connectionOverrides: Partial<OdooConnection> = {},
) {
  if (!connectionOverrides.login) {
    return [];
  }

  const userId = await loadCurrentUserId(connectionOverrides);
  const employeeId = await loadCurrentEmployeeId(connectionOverrides, userId);

  if (employeeId) {
    const localScope = await findLocalInspectorScope(employeeId);
    if (localScope?.vehicleIds.length) {
      return localScope.vehicleIds;
    }

    const employees = await executeOdooKw<Array<{ mfo_inspected_vehicle_ids?: number[] }>>(
      "hr.employee",
      "search_read",
      [[["id", "=", employeeId]]],
      {
        fields: ["mfo_inspected_vehicle_ids"],
        limit: 1,
      },
      connectionOverrides,
    ).catch(() => []);

    if (employees[0]?.mfo_inspected_vehicle_ids?.length) {
      return employees[0].mfo_inspected_vehicle_ids;
    }
  }

  if (!userId) {
    return [];
  }

  const vehiclesByInspector = await executeOdooKw<Array<{ id: number }>>(
    "fleet.vehicle",
    "search_read",
    [[["mfo_inspector_employee_ids.user_id", "=", userId]]],
    {
      fields: ["id"],
      limit: 500,
    },
    connectionOverrides,
  ).catch(() => []);

  return vehiclesByInspector.map((vehicle) => vehicle.id);
}

async function loadCurrentEmployeeScope(
  connectionOverrides: Partial<OdooConnection> = {},
) {
  if (!connectionOverrides.login) {
    return { employeeId: null as number | null, subdistrictIds: [] as number[], pointIds: [] as number[] };
  }

  const userId = await loadCurrentUserId(connectionOverrides);
  const employeeId = await loadCurrentEmployeeId(connectionOverrides, userId);

  if (employeeId) {
    const localScope = await findLocalInspectorScope(employeeId);
    if (localScope && (localScope.subdistrictIds.length || localScope.pointIds.length)) {
      return {
        employeeId,
        subdistrictIds: localScope.subdistrictIds,
        pointIds: localScope.pointIds,
      };
    }

    const employees = await executeOdooKw<Array<{
      mfo_inspected_subdistrict_ids?: number[];
      mfo_inspected_point_ids?: number[];
    }>>(
      "hr.employee",
      "search_read",
      [[["id", "=", employeeId]]],
      {
        fields: ["mfo_inspected_subdistrict_ids", "mfo_inspected_point_ids"],
        limit: 1,
      },
      connectionOverrides,
    ).catch(() => []);

    const scopedEmployee = employees[0];
    if (
      (scopedEmployee?.mfo_inspected_subdistrict_ids?.length ?? 0) > 0 ||
      (scopedEmployee?.mfo_inspected_point_ids?.length ?? 0) > 0
    ) {
      return {
        employeeId,
        subdistrictIds: scopedEmployee?.mfo_inspected_subdistrict_ids ?? [],
        pointIds: scopedEmployee?.mfo_inspected_point_ids ?? [],
      };
    }
  }

  if (!userId) {
    return { employeeId, subdistrictIds: [], pointIds: [] };
  }

  const assignedPoints = await executeOdooKw<Array<{ id: number; subdistrict_id?: Relation }>>(
    "mfo.collection.point",
    "search_read",
    [[["inspector_employee_ids.user_id", "=", userId]]],
    {
      fields: ["id", "subdistrict_id"],
      limit: 1000,
    },
    connectionOverrides,
  ).catch(() => []);

  return {
    employeeId,
    subdistrictIds: Array.from(
      new Set(
        assignedPoints
          .map((point) => relationId(point.subdistrict_id ?? false))
          .filter((value): value is number => Boolean(value)),
      ),
    ),
    pointIds: assignedPoints.map((point) => point.id),
  };
}

export async function loadGarbagePointOptions(
  connectionOverrides: Partial<OdooConnection> = {},
  options: { requireCurrentEmployeeScope?: boolean } = {},
): Promise<GarbagePointOption[]> {
  const [employeeScope, fieldMap] = await Promise.all([
    loadCurrentEmployeeScope(connectionOverrides),
    executeOdooKw<Record<string, unknown>>(
      "mfo.collection.point",
      "fields_get",
      [],
      { attributes: ["type"] },
      connectionOverrides,
    ).catch(() => null),
  ]);
  const domain: unknown[] = [["active", "=", true]];
  if (fieldMap?.operation_type) {
    domain.push(["operation_type", "=", "garbage"]);
  }
  if (employeeScope.pointIds.length && employeeScope.subdistrictIds.length) {
    domain.push("|", ["id", "in", employeeScope.pointIds], ["subdistrict_id", "in", employeeScope.subdistrictIds]);
  } else if (employeeScope.pointIds.length) {
    domain.push(["id", "in", employeeScope.pointIds]);
  } else if (employeeScope.subdistrictIds.length) {
    domain.push(["subdistrict_id", "in", employeeScope.subdistrictIds]);
  } else if (options.requireCurrentEmployeeScope) {
    return [];
  }
  const fields = ["name", "subdistrict_id"];
  if (fieldMap?.inspector_employee_ids) {
    fields.push("inspector_employee_ids");
  }

  const points = await executeOdooKw<GarbagePointRecord[]>(
    "mfo.collection.point",
    "search_read",
    [domain],
    {
      fields,
      order: "subdistrict_id asc, name asc",
      limit: 800,
    },
    connectionOverrides,
  ).catch(() => []);

  return points.map((point) => {
    const subdistrictName = relationName(point.subdistrict_id ?? false);
    return {
      id: point.id,
      name: point.name,
      label: subdistrictName ? `${subdistrictName} · ${point.name}` : point.name,
      subdistrictId: relationId(point.subdistrict_id ?? false),
      subdistrictName,
    };
  });
}

export async function loadGarbageSubdistrictOptions(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<GarbageSubdistrictOption[]> {
  const subdistricts = await readFirstAvailable<{
    id: number;
    name: string;
    district_id?: Relation;
  }>(
    [
      {
        model: "mfo.subdistrict",
        domain: [["active", "=", true]],
        fields: ["name", "district_id"],
        order: "district_id asc, name asc",
        limit: 500,
      },
      {
        model: "mfo.subdistrict",
        domain: [],
        fields: ["name", "district_id"],
        order: "district_id asc, name asc",
        limit: 500,
      },
    ],
    connectionOverrides,
  );

  return subdistricts.map(toGarbageSubdistrictOption);
}

type SubdistrictOptionRecord = {
  id: number;
  name: string;
  district_id?: Relation;
};

function toGarbageSubdistrictOption(subdistrict: SubdistrictOptionRecord): GarbageSubdistrictOption {
  const districtName = relationName(subdistrict.district_id ?? false, "");
  return {
    id: subdistrict.id,
    name: subdistrict.name,
    label: districtName ? `${districtName} · ${subdistrict.name}` : subdistrict.name,
  };
}

async function loadDefaultDistrictId(connectionOverrides: Partial<OdooConnection>) {
  const districts = await executeOdooKw<Array<{ id: number }>>(
    "mfo.district",
    "search_read",
    [[["name", "=", "Хан-Уул дүүрэг"]]],
    { fields: ["id"], limit: 1 },
    connectionOverrides,
  ).catch(() => []);

  return districts[0]?.id ?? null;
}

export async function findOrCreateWorkspaceSubdistrictOption(
  name: string,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<GarbageSubdistrictOption | null> {
  const cleanName = name.trim().replace(/\s+/g, " ");
  if (!cleanName) {
    return null;
  }

  const candidates = await executeOdooKw<SubdistrictOptionRecord[]>(
    "mfo.subdistrict",
    "search_read",
    [[["name", "ilike", cleanName]]],
    {
      fields: ["name", "district_id"],
      order: "district_id asc, name asc",
      limit: 50,
    },
    connectionOverrides,
  ).catch(() => []);
  const normalizedName = cleanName.toLocaleLowerCase("mn-MN");
  const existing = candidates.find(
    (subdistrict) => subdistrict.name.trim().toLocaleLowerCase("mn-MN") === normalizedName,
  );

  if (existing) {
    return toGarbageSubdistrictOption(existing);
  }

  try {
    const fieldNames = await loadModelFieldNames("mfo.subdistrict", connectionOverrides);
    const districtId = fieldNames.has("district_id")
      ? await loadDefaultDistrictId(connectionOverrides)
      : null;
    const values = keepSupportedValues(
      {
        name: cleanName,
        active: true,
        district_id: districtId ?? undefined,
      },
      fieldNames,
    );

    if (!values.name) {
      values.name = cleanName;
    }

    const createdId = await executeOdooKw<number>(
      "mfo.subdistrict",
      "create",
      [values],
      {},
      connectionOverrides,
    );

    return toGarbageSubdistrictOption({
      id: createdId,
      name: cleanName,
      district_id: false,
    });
  } catch (error) {
    console.warn("Workspace subdistrict create failed:", error);
    throw new Error("Шинэ хороо хадгалах үед алдаа гарлаа. Ерөнхий тохиргоонд хороо нэмэх эрхтэй эсэхээ шалгана уу.");
  }
}

export async function loadGarbageVehicleOptions(
  connectionOverrides: Partial<OdooConnection> = {},
  options: { requireCurrentEmployeeScope?: boolean; ignoreCurrentEmployeeScope?: boolean } = {},
): Promise<GarbageVehicleOption[]> {
  const inspectorVehicleScopeIds = options.ignoreCurrentEmployeeScope
    ? []
    : await loadCurrentInspectorVehicleScope(connectionOverrides);
  if (inspectorVehicleScopeIds.length) {
    const fleetBoard = await loadFleetVehicleBoard().catch(() => null);
    const vehiclesById = new Map((fleetBoard?.allVehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));

    const scopedVehicles = await readFirstAvailable<GarbageVehicleRecord>(
      [
        {
          model: "fleet.vehicle",
          domain: [["id", "in", inspectorVehicleScopeIds], ["mfo_garbage_work_create_allowed", "=", true]],
          fields: ["name", "license_plate", "mfo_garbage_work_create_allowed"],
          order: "license_plate asc, name asc",
          limit: inspectorVehicleScopeIds.length,
        },
        {
          model: "fleet.vehicle",
          domain: [["id", "in", inspectorVehicleScopeIds]],
          fields: ["name", "license_plate"],
          order: "license_plate asc, name asc",
          limit: inspectorVehicleScopeIds.length,
        },
      ],
      connectionOverrides,
    );

    const scopedVehicleRecordsById = new Map(scopedVehicles.map((vehicle) => [vehicle.id, vehicle]));
    return inspectorVehicleScopeIds
      .map((vehicleId): GarbageVehicleOption | null => {
        const boardVehicle = vehiclesById.get(vehicleId);
        const scopedVehicle = scopedVehicleRecordsById.get(vehicleId);
        if (!boardVehicle && !scopedVehicle) {
          return null;
        }
        if (scopedVehicle?.mfo_garbage_work_create_allowed === false) {
          return null;
        }
        const vehicle = scopedVehicle ?? {
          id: vehicleId,
          name: boardVehicle?.name,
          license_plate: boardVehicle?.plate,
        };
        const plate = vehicle.license_plate || vehicle.name || `Ð¢ÐµÑ…Ð½Ð¸Ðº #${vehicle.id}`;
        const vehicleOption: GarbageVehicleOption = {
          id: vehicle.id,
          label: plate,
          plate,
          departmentName: boardVehicle?.departmentName,
          isRepair: Boolean(boardVehicle?.isRepair),
          isOperational: boardVehicle?.isOperational,
          isArchived: boardVehicle?.isArchived,
          statusLabel: boardVehicle?.stateLabel,
          driverId: boardVehicle?.responsibleDriverId ?? null,
          driverName: boardVehicle?.responsibleDriverName || boardVehicle?.fleetDriverName || "",
          loaderIds: [boardVehicle?.loader1Id, boardVehicle?.loader2Id].filter((id): id is number => Boolean(id)),
          loaderNames: [boardVehicle?.loader1Name, boardVehicle?.loader2Name].filter((name): name is string => Boolean(name)),
        };
        return vehicleOption;
      })
      .filter((vehicle): vehicle is GarbageVehicleOption => vehicle !== null);
  }

  if (options.requireCurrentEmployeeScope) {
    return [];
  }

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
  const hasMfoActiveForOps = await hasModelField("fleet.vehicle", "mfo_active_for_ops", connectionOverrides);

  const vehicles = vehicleIds.length
    ? await readFirstAvailable<GarbageVehicleRecord>(
        [
          ...(hasMfoActiveForOps
            ? [
                {
                  model: "fleet.vehicle",
                  domain: [["id", "in", vehicleIds], ["mfo_active_for_ops", "=", true]],
                  fields: ["name", "license_plate"],
                  order: "license_plate asc, name asc",
                  limit: vehicleIds.length,
                },
              ]
            : []),
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

  const fallbackVehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  for (const attempt of [
    ...(hasMfoActiveForOps ? [[["mfo_active_for_ops", "=", true]]] : []),
    [["active", "=", true]],
    [],
  ] as unknown[][]) {
    try {
      const records = await executeOdooKw<GarbageVehicleRecord[]>(
        "fleet.vehicle",
        "search_read",
        [attempt],
        {
          fields: ["name", "license_plate"],
          order: "license_plate asc, name asc",
          limit: 500,
        },
        connectionOverrides,
      );
      for (const vehicle of records) {
        fallbackVehiclesById.set(vehicle.id, vehicle);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Invalid field")) {
        console.warn("Fleet vehicle option fallback could not be loaded:", error);
      }
    }
  }
  const fleetBoard = await loadFleetVehicleBoard().catch(() => null);
  if (options.ignoreCurrentEmployeeScope && fleetBoard?.allVehicles.length) {
    for (const vehicle of fleetBoard.allVehicles) {
      fallbackVehiclesById.set(vehicle.id, {
        id: vehicle.id,
        name: vehicle.name,
        license_plate: vehicle.plate,
        departmentName: vehicle.departmentName,
        isRepair: vehicle.isRepair,
        statusLabel: vehicle.stateLabel,
      });
    }
  }
  const optionVehicles = Array.from(
    fallbackVehiclesById.values(),
  );
  const boardVehicleById = new Map((fleetBoard?.allVehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));

  return optionVehicles.map((vehicle) => {
    const boardVehicle = boardVehicleById.get(vehicle.id);
    const plate = vehicle.license_plate || vehicle.name || `Техник #${vehicle.id}`;
    return {
      id: vehicle.id,
      label: boardVehicle?.plate || plate,
      plate: boardVehicle?.plate || plate,
      departmentName: boardVehicle?.departmentName || vehicle.departmentName,
      isRepair: Boolean(boardVehicle?.isRepair),
      isOperational: boardVehicle?.isOperational,
      isArchived: boardVehicle?.isArchived,
      statusLabel: boardVehicle?.stateLabel,
      driverId: boardVehicle?.responsibleDriverId ?? null,
      driverName: boardVehicle?.responsibleDriverName || boardVehicle?.fleetDriverName || "",
      loaderIds: [boardVehicle?.loader1Id, boardVehicle?.loader2Id].filter((id): id is number => Boolean(id)),
      loaderNames: [boardVehicle?.loader1Name, boardVehicle?.loader2Name].filter(
        (name): name is string => Boolean(name),
      ),
    };
  });
}

export async function loadActiveGarbageVehicleOptions(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<GarbageVehicleOption[]> {
  const hasMfoActiveForOps = await hasModelField("fleet.vehicle", "mfo_active_for_ops", connectionOverrides);
  const vehicles = await readFirstAvailable<GarbageVehicleRecord>(
    [
      ...(hasMfoActiveForOps
        ? [
            {
              model: "fleet.vehicle",
              domain: [["mfo_active_for_ops", "=", true]],
              fields: ["name", "license_plate"],
              order: "license_plate asc, name asc",
              limit: 500,
            },
          ]
        : []),
      {
        model: "fleet.vehicle",
        domain: [["active", "=", true]],
        fields: ["name", "license_plate"],
        order: "license_plate asc, name asc",
        limit: 500,
      },
      {
        model: "fleet.vehicle",
        domain: [],
        fields: ["name", "license_plate"],
        order: "license_plate asc, name asc",
        limit: 500,
      },
    ],
    connectionOverrides,
  );

  const fleetBoard = await loadFleetVehicleBoard().catch(() => null);
  const boardVehicleById = new Map((fleetBoard?.allVehicles ?? []).map((vehicle) => [vehicle.id, vehicle]));

  return vehicles.map((vehicle) => {
    const boardVehicle = boardVehicleById.get(vehicle.id);
    const plate = vehicle.license_plate || vehicle.name || `Техник #${vehicle.id}`;
    return {
      id: vehicle.id,
      label: boardVehicle?.plate || plate,
      plate: boardVehicle?.plate || plate,
      driverId: boardVehicle?.responsibleDriverId ?? null,
      driverName: boardVehicle?.responsibleDriverName || boardVehicle?.fleetDriverName || "",
      loaderIds: [boardVehicle?.loader1Id, boardVehicle?.loader2Id].filter((id): id is number => Boolean(id)),
      loaderNames: [boardVehicle?.loader1Name, boardVehicle?.loader2Name].filter(
        (name): name is string => Boolean(name),
      ),
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
      remarks: [
        line.remarks?.trim() || "",
        line.plannedUnit && line.plannedUnit !== "тонн"
          ? `Хэмжих нэгж: ${line.plannedUnit}`
          : "",
      ].filter(Boolean).join("\n") || false,
    })),
  };

  let result: number | { plan_id?: number; id?: number; created?: boolean; message?: string };
  try {
    result = await executeOdooKw<
      number | { plan_id?: number; id?: number; created?: boolean; message?: string }
    >(
      "mfo.seasonal.plan",
      "action_mfo_create_seasonal_plan",
      [payload],
      {},
      connectionOverrides,
    );
  } catch (error) {
    if (!isMissingMunicipalModelError(error)) {
      throw error;
    }
    return createSeasonalWorkspaceProjectFallback(input, connectionOverrides);
  }

  if (typeof result === "number") {
    return {
      planId: result,
      created: true,
      message: "Гэнэтийн ажил амжилттай үүслээ.",
    };
  }

  const planId = result.plan_id || result.id;
  if (!planId) {
    throw new Error("Гэнэтийн ажлын дугаар буцаагдсангүй.");
  }

  return {
    planId,
    created: result.created ?? true,
    message: result.message || "Гэнэтийн ажил амжилттай үүслээ.",
  };
}

async function createSeasonalWorkspaceProjectFallback(
  input: {
    name: string;
    departmentId: number;
    startDate: string;
    endDate: string;
    workDays: WeekdayKey[];
    notes?: string;
    lines: SeasonalPlanLineInput[];
  },
  connectionOverrides: Partial<OdooConnection>,
): Promise<SeasonalPlanCreateResult> {
  const totalPlannedTonnage = input.lines.reduce(
    (sum, line) => sum + (Number.isFinite(line.plannedTonnage) ? line.plannedTonnage : 0),
    0,
  );
  const projectId = await createWorkspaceProject(
    {
      name: input.name,
      departmentId: input.departmentId,
      operationType: "garbage_seasonal",
      trackQuantity: totalPlannedTonnage > 0,
      plannedQuantity: totalPlannedTonnage > 0 ? totalPlannedTonnage : null,
      startDate: input.startDate,
      deadline: input.endDate,
      description: input.notes,
    },
    connectionOverrides,
  );

  for (const [lineIndex, line] of input.lines.entries()) {
    const vehicleIds = line.vehicleIds?.length
      ? Array.from(new Set(line.vehicleIds))
      : Array.from({ length: Math.max(1, Math.floor(line.plannedVehicleCount || 1)) }, () => null);
    const effectiveDate = line.workDate || input.startDate;
    const plannedUnit = line.plannedUnit?.trim() || "тонн";
    const baseDescription = [
      line.khorooLabel ? `Хороо: ${line.khorooLabel}` : "",
      line.locationName ? `Байршил: ${line.locationName}` : "",
      Number.isFinite(line.plannedTonnage) && line.plannedTonnage > 0
        ? `Төлөвлөсөн хэмжээ: ${line.plannedTonnage} ${plannedUnit}`
        : "",
      line.remarks ? `Тайлбар: ${line.remarks}` : "",
      input.notes ? `Нэмэлт тэмдэглэл: ${input.notes}` : "",
    ].filter(Boolean).join("\n");

    for (const [vehicleIndex, vehicleId] of vehicleIds.entries()) {
      const taskName = [
        input.name.trim(),
        line.khorooLabel.trim(),
        line.locationName.trim(),
        vehicleIds.length > 1 ? `машин ${vehicleIndex + 1}` : "",
      ].filter(Boolean).join(" - ");

      await createWorkspaceTask(
        {
          projectId,
          name: taskName || `${input.name.trim()} - ${lineIndex + 1}`,
          deadline: effectiveDate,
          startDate: effectiveDate,
          plannedQuantity:
            Number.isFinite(line.plannedTonnage) && line.plannedTonnage > 0
              ? line.plannedTonnage
              : null,
          description: baseDescription,
          sequence: (line.sequence || lineIndex + 1) * 10 + vehicleIndex,
          operationType: "garbage_seasonal",
          shiftDate: effectiveDate,
          vehicleId: vehicleId || null,
        },
        connectionOverrides,
      );
    }
  }

  return {
    planId: projectId,
    fallbackProjectId: projectId,
    redirectHref: `/projects/${projectId}`,
    created: true,
    message: "Гэнэтийн ажил амжилттай үүслээ.",
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
    throw new Error("Гэнэтийн ажил олдсонгүй.");
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
      routeName: relationName(line.route_id ?? false, "Гараар оруулсан байршил"),
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
  const [projects, tasks, attachments, teamLeaderOptions, workUnits, workTypes, projectReports] = await Promise.all([
    searchReadWithFieldFallback<ProjectRecord>(
      "project.project",
      [["id", "=", projectId]],
      [
        "name",
        "user_id",
        "ops_department_id",
        "date_start",
        "date",
        "description",
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
        "user_ids",
        "mfo_crew_team_id",
        "ops_planned_quantity",
        "ops_completed_quantity",
        "ops_progress_percent",
        "ops_measurement_unit",
        "ops_measurement_unit_id",
        "mfo_operation_type",
        "date_deadline",
        "mfo_planned_start",
        "state",
        "mfo_state",
        "ops_reports_locked",
        "mfo_shift_date",
        "mfo_vehicle_id",
        "mfo_driver_employee_id",
        "mfo_collector_employee_ids",
        "description",
      ],
      {
        order: "sequence asc, create_date asc, id asc",
        limit: 120,
      },
      connectionOverrides,
    ),
    executeOdooKw<OdooAttachmentRecord[]>(
      "ir.attachment",
      "search_read",
      [[["res_model", "=", "project.project"], ["res_id", "=", projectId]]],
      {
        fields: ["name", "mimetype"],
        order: "create_date desc, id desc",
        limit: 100,
      },
      connectionOverrides,
    ).catch(() => []),
    loadTeamLeaderOptions(connectionOverrides),
    loadWorkUnitOptions(connectionOverrides),
    loadWorkTypeOptions(connectionOverrides),
    searchReadWithFieldFallback<ReportRecord>(
      "ops.task.report",
      [["task_id.project_id", "=", projectId]],
      [
        "task_id",
        "reporter_id",
        "report_datetime",
        "report_text",
        "report_summary",
        "reported_quantity",
        "image_count",
        "audio_count",
        "image_attachment_ids",
        "audio_attachment_ids",
        "state",
        "rejection_reason",
        "task_measurement_unit_id",
        "task_measurement_unit_code",
      ],
      {
        order: "report_datetime desc, id desc",
        limit: 300,
      },
      connectionOverrides,
    ).catch(() => [] as ReportRecord[]),
  ]);

  const project = projects[0];
  if (!project) {
    throw new Error("Ажил олдсонгүй.");
  }

  const projectDepartmentId = relationId(project.ops_department_id);
  const projectManagerId = relationId(project.user_id);
  const projectManagerEmployee = projectManagerId
    ? await executeOdooKw<EmployeeUserRecord[]>(
        "hr.employee",
        "search_read",
        [[["user_id", "=", projectManagerId]]],
        {
          fields: ["job_id", "job_title", "user_id", "name", "department_id"],
          limit: 1,
        },
        connectionOverrides,
      )
        .then((employees) => employees[0] ?? null)
        .catch(() => null)
    : null;
  const departmentUserOptions = await loadDepartmentUserOptions(
    projectDepartmentId,
    connectionOverrides,
  );

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
  const departmentUserById = new Map(departmentUserOptions.map((user) => [user.id, user]));
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
  const reportsByTaskId = new Map<number, ReportRecord[]>();
  for (const report of projectReports) {
    const reportTaskId = relationId(report.task_id ?? false);
    if (!reportTaskId) {
      continue;
    }
    const taskReports = reportsByTaskId.get(reportTaskId) ?? [];
    taskReports.push(report);
    reportsByTaskId.set(reportTaskId, taskReports);
  }

  const taskAssigneeUserIds = Array.from(new Set(tasks.flatMap((task) => task.user_ids ?? [])));
  const taskAssigneeUsers = taskAssigneeUserIds.length
    ? await executeOdooKw<UserRecord[]>(
        "res.users",
        "search_read",
        [[["id", "in", taskAssigneeUserIds]]],
        {
          fields: ["name", "login", "ops_user_type"],
          order: "name asc",
          limit: taskAssigneeUserIds.length,
        },
        connectionOverrides,
      ).catch(() => [])
    : [];
  const taskAssigneeUserById = new Map(taskAssigneeUsers.map((user) => [user.id, user]));
  const taskCrewEmployeeIds = Array.from(
    new Set(
      tasks.flatMap((task) => [
        relationId(task.mfo_driver_employee_id ?? false),
        ...(task.mfo_collector_employee_ids ?? []),
      ]).filter((id): id is number => Boolean(id)),
    ),
  );
  const taskCrewEmployees = taskCrewEmployeeIds.length
    ? await executeOdooKw<EmployeeUserRecord[]>(
        "hr.employee",
        "search_read",
        [[["id", "in", taskCrewEmployeeIds]]],
        {
          fields: ["name", "user_id", "department_id", "job_id", "job_title"],
          order: "name asc",
          limit: taskCrewEmployeeIds.length,
        },
        connectionOverrides,
      ).catch(() => [])
    : [];
  const taskCrewEmployeeById = new Map(taskCrewEmployees.map((employee) => [employee.id, employee]));

  const taskCards = tasks
    .filter((task) => !isRoadCleaningPhotoPlaceholderLine(task.name))
    .map((task) => {
    const taskReports = reportsByTaskId.get(task.id) ?? [];
    const quantitySnapshot = getProjectTaskQuantitySnapshot(task, taskReports);
    const assigneeUserIds = task.user_ids ?? [];
    const assigneeNames = assigneeUserIds.map(
      (userId) => taskAssigneeUserById.get(userId)?.name || `Хэрэглэгч #${userId}`,
    );
    const vehicleId = relationId(task.mfo_vehicle_id ?? false);
    const driverEmployeeId = relationId(task.mfo_driver_employee_id ?? false);
    const driverName = relationName(task.mfo_driver_employee_id ?? false, "");
    const collectorEmployeeIds = task.mfo_collector_employee_ids ?? [];
    const collectorNames = collectorEmployeeIds
      .map((employeeId) => taskCrewEmployeeById.get(employeeId)?.name || "")
      .filter(Boolean);
    const effectiveStage = resolveEffectiveTaskStage(
      relationName(task.stage_id, ""),
      quantitySnapshot.progress,
      {
        reportCount: taskReports.length,
        reportStates: taskReports.map((report) => report.state),
        mfoState: task.mfo_state,
        taskState: task.state,
        reportsLocked: Boolean(task.ops_reports_locked),
      },
    );

    return {
      id: task.id,
      name: task.name,
      href: `/tasks/${task.id}`,
      stageLabel: effectiveStage.label,
      stageBucket: effectiveStage.bucket,
      isOverdue:
        effectiveStage.bucket !== "done" &&
        isPastDueDate(task.date_deadline),
      progress: quantitySnapshot.progress,
      deadline: formatDateOnlyLabel(task.date_deadline),
      deadlineValue: formatDateInput(task.date_deadline),
      startDateValue: formatDateInput(task.mfo_planned_start || false),
      teamLeaderId: relationId(task.ops_team_leader_id),
      teamLeaderName: relationName(task.ops_team_leader_id, "Сонгоогүй"),
      teamLeaderJobTitle:
        departmentUserById.get(relationId(task.ops_team_leader_id) ?? 0)?.jobTitle ?? "",
      crewTeamId: relationId(task.mfo_crew_team_id ?? false),
      assignees: assigneeNames,
      assigneeUserIds,
      vehicleId,
      vehicleName: relationName(task.mfo_vehicle_id ?? false, ""),
      driverEmployeeId,
      driverName,
      collectorEmployeeIds,
      collectorNames,
      plannedQuantity: quantitySnapshot.plannedQuantity,
      measurementUnitId: relationId(task.ops_measurement_unit_id ?? false),
      completedQuantity: quantitySnapshot.completedQuantity,
      measurementUnit: quantitySnapshot.measurementUnit,
      quantitySummary: quantitySnapshot.quantitySummary,
      quantitySummaryLines: quantitySnapshot.quantitySummaryLines,
      description: htmlToPlainText(task.description),
      reportCount: taskReports.length,
    };
  }).sort((left, right) => {
    const leftSequence = getRoadCleaningDefaultLineSequence(left.name);
    const rightSequence = getRoadCleaningDefaultLineSequence(right.name);

    if (leftSequence === null && rightSequence === null) {
      return 0;
    }

    return (leftSequence ?? Number.MAX_SAFE_INTEGER) - (rightSequence ?? Number.MAX_SAFE_INTEGER);
  });
  const doneCount = taskCards.filter((task) => task.stageBucket === "done").length;
  const reviewCount = taskCards.filter((task) => task.stageBucket === "review").length;
  const completion = taskCards.length
    ? Math.round(taskCards.reduce((total, task) => total + task.progress, 0) / taskCards.length)
    : 0;

  return {
    id: project.id,
    name: project.name,
    managerName: relationName(project.user_id),
    managerJobTitle: projectManagerEmployee ? getEmployeeJobTitle(projectManagerEmployee) : "",
    managerId: projectManagerId,
    departmentName: relationName(project.ops_department_id),
    departmentId: projectDepartmentId,
    startDate: formatDateInput(project.date_start),
    deadline: formatDateInput(project.date),
    description: htmlToPlainText(project.description),
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name || `attachment-${attachment.id}`,
      mimetype: attachment.mimetype || "application/octet-stream",
      url: `/api/odoo/attachments/${attachment.id}`,
    })),
    taskCount: taskCards.length,
    reviewCount,
    doneCount,
    completion,
    tasks: taskCards,
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

export async function loadProjectAccessSummary(
  projectId: number,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<ProjectAccessSummary> {
  const projects = await searchReadWithFieldFallback<ProjectRecord>(
    "project.project",
    [["id", "=", projectId]],
    ["user_id", "ops_department_id"],
    { limit: 1 },
    connectionOverrides,
  );
  const project = projects[0];
  if (!project) {
    throw new Error("Ажил олдсонгүй.");
  }

  return {
    id: project.id,
    managerId: relationId(project.user_id),
    departmentName: relationName(project.ops_department_id, ""),
  };
}

export async function hasProjectTaskLeader(
  projectId: number,
  userId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  if (!projectId || !userId) {
    return false;
  }

  const count = await executeOdooKw<number>(
    "project.task",
    "search_count",
    [[["project_id", "=", projectId], ["ops_team_leader_id", "=", userId]]],
    {},
    connectionOverrides,
  ).catch(() => 0);

  return count > 0;
}

export async function loadProjectTaskEditOptions(
  projectId: number,
  operationType = "",
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<ProjectTaskEditOptions> {
  const projects = await searchReadWithFieldFallback<ProjectRecord>(
    "project.project",
    [["id", "=", projectId]],
    ["ops_department_id", "mfo_operation_type"],
    { limit: 1 },
    connectionOverrides,
  );
  const project = projects[0];
  if (!project) {
    return { departmentUserOptions: [], crewTeamOptions: [], unitOptions: [] };
  }

  const departmentId = relationId(project.ops_department_id);
  const resolvedOperationType = operationType || project.mfo_operation_type || "";
  const [departmentUserOptions, unitOptions, allCrewTeamOptions] = await Promise.all([
    loadDepartmentUserOptions(departmentId, connectionOverrides),
    loadWorkUnitOptions(connectionOverrides),
    loadCrewTeamOptions(resolvedOperationType, connectionOverrides),
  ]);

  return {
    departmentUserOptions,
    crewTeamOptions: filterCrewTeamsByDepartmentUsers(allCrewTeamOptions, departmentUserOptions),
    unitOptions,
  };
}

export async function loadTaskDetail(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<TaskDetail> {
  const taskQuery = (overrides: Partial<OdooConnection>) =>
    searchReadWithFieldFallback<TaskRecord>(
      "project.task",
      [["id", "=", taskId]],
      [
        "name",
        "project_id",
        "stage_id",
        "ops_team_leader_id",
        "user_ids",
        "mfo_crew_team_id",
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
        "mfo_shift_date",
        "mfo_vehicle_id",
        "mfo_driver_employee_id",
        "mfo_collector_employee_ids",
        "mfo_inspector_employee_id",
        "mfo_unresolved_stop_count",
        "mfo_missing_proof_stop_count",
        "mfo_route_deviation_stop_count",
        "mfo_weight_sync_warning",
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
      overrides,
    );

  const primaryConnection = createOdooConnection(connectionOverrides);
  const fallbackConnection = createOdooConnection();
  const sameConnection =
    primaryConnection.url === fallbackConnection.url &&
    primaryConnection.db === fallbackConnection.db &&
    primaryConnection.login === fallbackConnection.login &&
    primaryConnection.password === fallbackConnection.password;

  const taskPromise = taskQuery(connectionOverrides).catch((error) => {
    if (sameConnection) {
      throw error;
    }

    console.warn("Task detail could not be loaded with user credentials, retrying as system:", error);
    return taskQuery({});
  });

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
        "state",
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
        fields: ["author_id", "date", "body", "message_type", "subtype_id", "attachment_ids"],
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
  if (!sameConnection) {
    if (!reports.length) {
      reports = await reportQuery({}).catch(() => [] as ReportRecord[]);
    }
    if (!messages.length) {
      messages = await messageQuery({}).catch(() => [] as MailMessageRecord[]);
    }
  }
  const messageAttachmentIds = Array.from(
    new Set(messages.flatMap((message) => message.attachment_ids ?? [])),
  );
  const messageAttachments = messageAttachmentIds.length
    ? await executeOdooKw<OdooAttachmentRecord[]>(
        "ir.attachment",
        "search_read",
        [[["id", "in", messageAttachmentIds]]],
        {
          fields: ["name", "mimetype"],
          limit: messageAttachmentIds.length,
        },
        connectionOverrides,
      ).catch(() => [])
    : [];
  const messageAttachmentById = new Map(
    messageAttachments.map((attachment) => [
      attachment.id,
      {
        id: attachment.id,
        name: attachment.name || `attachment-${attachment.id}`,
        mimetype: attachment.mimetype || "application/octet-stream",
        url: `/api/odoo/attachments/${attachment.id}`,
      },
    ]),
  );
  const reportIds = reports.map((report) => report.id).filter((id) => id > 0);
  const fallbackReportAttachments = reportIds.length
    ? await executeOdooKw<OdooAttachmentRecord[]>(
        "ir.attachment",
        "search_read",
        [[["res_model", "=", "ops.task.report"], ["res_id", "in", reportIds]]],
        {
          fields: ["name", "mimetype", "res_id"],
          order: "create_date asc, id asc",
          limit: Math.max(reportIds.length * 20, 100),
        },
        connectionOverrides,
      ).catch(() => [])
    : [];
  const fallbackReportAttachmentsByReportId = new Map<number, OdooAttachmentRecord[]>();
  for (const attachment of fallbackReportAttachments) {
    if (!attachment.res_id) {
      continue;
    }
    const existing = fallbackReportAttachmentsByReportId.get(attachment.res_id) ?? [];
    existing.push(attachment);
    fallbackReportAttachmentsByReportId.set(attachment.res_id, existing);
  }
  const reportAttachmentItem = (
    attachmentId: number,
    fallbackAttachments: OdooAttachmentRecord[],
    fallbackName: string,
  ) => {
    const fallbackAttachment = fallbackAttachments.find((attachment) => attachment.id === attachmentId);
    return {
      id: attachmentId,
      name: fallbackAttachment?.name || `${fallbackName}-${attachmentId}`,
      url: `/api/odoo/attachments/${attachmentId}`,
    };
  };
  const reportAttachmentIds = (
    primaryIds: number[] | undefined,
    fallbackAttachments: OdooAttachmentRecord[],
    mimePrefix: string,
  ) => {
    const ids = new Set<number>();
    for (const id of primaryIds ?? []) {
      if (Number.isFinite(id) && id > 0) {
        ids.add(id);
      }
    }
    for (const attachment of fallbackAttachments) {
      if ((attachment.mimetype || "").startsWith(mimePrefix)) {
        ids.add(attachment.id);
      }
    }
    return Array.from(ids);
  };

  let assigneeNames: string[] = [];
  let assigneeUsers: UserRecord[] = [];
  let assigneeUserIds: number[] = [...(task.user_ids ?? [])];
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
      assigneeUsers = assignees;
      assigneeNames = assignees.map((user) => user.name);
    } catch {
      assigneeNames = task.user_ids.map((id) => `Хэрэглэгч #${id}`);
    }
  }
  const crewTeamId = relationId(task.mfo_crew_team_id ?? false);
  const crewTeamName = relationName(task.mfo_crew_team_id ?? false, "");

  if (crewTeamId) {
    try {
      const teams = await executeOdooKw<CrewTeamRecord[]>(
        "mfo.crew.team",
        "search_read",
        [[["id", "=", crewTeamId]]],
        {
          fields: ["name", "member_user_ids"],
          limit: 1,
        },
        connectionOverrides,
      );
      const memberUserIds = teams[0]?.member_user_ids ?? [];
      if (memberUserIds.length) {
        const crewUsers = await executeOdooKw<UserRecord[]>(
          "res.users",
          "search_read",
          [[["id", "in", memberUserIds]]],
          {
            fields: ["name", "login", "ops_user_type"],
            order: "name asc",
            limit: memberUserIds.length,
          },
          connectionOverrides,
        );
        const assigneeUserById = new Map(assigneeUsers.map((user) => [user.id, user]));
        for (const user of crewUsers) {
          assigneeUserById.set(user.id, user);
        }
        assigneeUsers = Array.from(assigneeUserById.values());
        assigneeNames = Array.from(
          new Set([...assigneeNames, ...crewUsers.map((user) => user.name)]),
        );
        assigneeUserIds = Array.from(new Set([...assigneeUserIds, ...memberUserIds]));
      }
    } catch (error) {
      console.warn("Даалгаврын багийн гишүүдийг уншиж чадсангүй.", error);
    }
  }

  const driverEmployeeId = relationId(task.mfo_driver_employee_id ?? false);
  const collectorEmployeeIds = task.mfo_collector_employee_ids ?? [];
  const inspectorEmployeeId = relationId(task.mfo_inspector_employee_id ?? false);
  const crewEmployeeIds = Array.from(
    new Set(
      [driverEmployeeId, inspectorEmployeeId, ...collectorEmployeeIds].filter(
        (id): id is number => Boolean(id),
      ),
    ),
  );
  const crewEmployees = crewEmployeeIds.length
    ? await executeOdooKw<EmployeeUserRecord[]>(
        "hr.employee",
        "search_read",
        [[["id", "in", crewEmployeeIds]]],
        {
          fields: ["name", "user_id", "department_id", "job_id", "job_title"],
          order: "name asc",
          limit: crewEmployeeIds.length,
        },
        connectionOverrides,
      ).catch(() => [] as EmployeeUserRecord[])
    : [];
  const crewEmployeeById = new Map(crewEmployees.map((employee) => [employee.id, employee]));
  const crewMembers: TaskCrewMember[] = [];
  const crewMemberKeys = new Set<string>();
  const addCrewMember = (id: string, name: string, roleLabel: string) => {
    const normalizedName = name.trim().toLocaleLowerCase("mn-MN");
    if (!normalizedName) {
      return;
    }

    const key = `${roleLabel}:${normalizedName}`;
    if (crewMemberKeys.has(key)) {
      return;
    }

    crewMemberKeys.add(key);
    crewMembers.push({
      id,
      name: name.trim(),
      roleLabel,
    });
  };
  const userRoleLabel = (role: string | false) => {
    const normalizedRole = String(role || "").toLocaleLowerCase("mn-MN");

    if (normalizedRole.includes("driver")) {
      return "Жолооч";
    }
    if (
      normalizedRole.includes("loader") ||
      normalizedRole.includes("collector") ||
      normalizedRole.includes("ачигч")
    ) {
      return "Ачигч";
    }
    if (normalizedRole.includes("inspector") || normalizedRole.includes("хяналт")) {
      return "Хяналтын ажилтан";
    }

    return "Хариуцсан ажилтан";
  };

  if (inspectorEmployeeId) {
    addCrewMember(
      `inspector-${inspectorEmployeeId}`,
      crewEmployeeById.get(inspectorEmployeeId)?.name ||
        relationName(task.mfo_inspector_employee_id ?? false, ""),
      "Хяналтын ажилтан",
    );
  }
  if (driverEmployeeId) {
    addCrewMember(
      `driver-${driverEmployeeId}`,
      crewEmployeeById.get(driverEmployeeId)?.name ||
        relationName(task.mfo_driver_employee_id ?? false, ""),
      "Жолооч",
    );
  }
  for (const collectorEmployeeId of collectorEmployeeIds) {
    addCrewMember(
      `collector-${collectorEmployeeId}`,
      crewEmployeeById.get(collectorEmployeeId)?.name || "",
      "Ачигч",
    );
  }
  for (const user of assigneeUsers) {
    addCrewMember(`user-${user.id}`, user.name, userRoleLabel(user.ops_user_type));
  }
  if (!assigneeUsers.length) {
    for (const assigneeName of assigneeNames) {
      addCrewMember(`assignee-${assigneeName}`, assigneeName, "Хариуцсан ажилтан");
    }
  }

  const taskDescription = htmlToPlainText(task.description);
  const quantityLines = extractTaskQuantityLines(taskDescription);
  if (!quantityLines.length && (task.ops_planned_quantity ?? 0) > 0) {
    quantityLines.push({
      quantity: task.ops_planned_quantity ?? 0,
      unit: formatMeasurementUnit(task.ops_measurement_unit_id, task.ops_measurement_unit),
    });
  }
  const reportProgress = enrichQuantityLinesWithReportProgress(quantityLines, reports);
  const effectiveQuantityLines = reportProgress.quantityLines.length
    ? reportProgress.quantityLines
    : quantityLines;
  const effectivePlannedQuantity = effectiveQuantityLines.length
    ? effectiveQuantityLines.reduce((total, line) => total + line.quantity, 0)
    : (task.ops_planned_quantity ?? 0);
  const effectiveCompletedQuantity =
    reportProgress.completedQuantity > 0
      ? reportProgress.completedQuantity
      : (task.ops_completed_quantity ?? 0);
  const effectiveProgress =
    reportProgress.progress > 0
      ? reportProgress.progress
      : Math.round(task.ops_progress_percent ?? 0);
  const effectiveStage = resolveEffectiveTaskStage(
    relationName(task.stage_id, ""),
    effectiveProgress,
    {
      reportCount: reports.length,
      reportStates: reports.map((report) => report.state),
      mfoState: task.mfo_state,
      taskState: task.state,
      reportsLocked: Boolean(task.ops_reports_locked),
    },
  );

  return {
    id: task.id,
    name: task.name,
    projectId: relationId(task.project_id),
    projectName: relationName(task.project_id),
    operationType: task.mfo_operation_type || "",
    quantityOptional:
      task.mfo_operation_type === "garbage" ||
      task.mfo_operation_type === "garbage_seasonal",
    stageLabel: effectiveStage.label,
    stageBucket: effectiveStage.bucket,
    state: task.state,
    deadline: formatDateOnlyLabel(task.date_deadline),
    deadlineValue: formatDateInput(task.date_deadline),
    startDateValue: formatDateInput(task.mfo_planned_start || false),
    scheduledDate: formatDateInput(task.mfo_shift_date || task.date_deadline),
    measurementUnit: formatMeasurementUnit(
      task.ops_measurement_unit_id,
      task.ops_measurement_unit,
    ),
    measurementUnitId: relationId(task.ops_measurement_unit_id ?? false),
    quantityLines: effectiveQuantityLines,
    measurementUnitCode: task.ops_measurement_unit_code || "",
    vehicleName: relationName(task.mfo_vehicle_id ?? false, ""),
    driverName: relationName(task.mfo_driver_employee_id ?? false, ""),
    unresolvedStopCount: task.mfo_unresolved_stop_count ?? 0,
    missingProofStopCount: task.mfo_missing_proof_stop_count ?? 0,
    deviationStopCount: task.mfo_route_deviation_stop_count ?? 0,
    hasWeightWarning: Boolean(task.mfo_weight_sync_warning),
    plannedQuantity: effectivePlannedQuantity,
    completedQuantity: effectiveCompletedQuantity,
    remainingQuantity:
      reportProgress.progress > 0
        ? reportProgress.remainingQuantity
        : (task.ops_remaining_quantity ?? 0),
    progress: effectiveProgress,
    teamLeaderId: relationId(task.ops_team_leader_id),
    teamLeaderName: relationName(task.ops_team_leader_id),
    crewTeamId,
    crewTeamName,
    crewMembers,
    assignees: assigneeNames,
    assigneeUserIds,
    priorityLabel: priorityLabel(task.priority),
    description: taskDescription,
    canSubmitForReview: Boolean(task.ops_can_submit_for_review),
    canMarkDone: Boolean(task.ops_can_mark_done),
    canReturnForChanges: Boolean(task.ops_can_return_for_changes),
    reportsLocked: Boolean(task.ops_reports_locked),
    reports: reports.map((report) => {
      const fallbackAttachments = fallbackReportAttachmentsByReportId.get(report.id) ?? [];
      const imageIds = reportAttachmentIds(report.image_attachment_ids, fallbackAttachments, "image/");
      const audioIds = reportAttachmentIds(report.audio_attachment_ids, fallbackAttachments, "audio/");

      return {
      id: report.id,
      reporterId: relationId(report.reporter_id),
      reporter: relationName(report.reporter_id),
      submittedAt: formatDateLabel(report.report_datetime),
      state: String(report.state || ""),
      stateLabel: reportStateLabel(report.state),
      stateBucket: reportStateBucket(report.state),
      rejectionReason: htmlToPlainText(report.rejection_reason),
      summary: report.report_summary || "Тайлбар оруулаагүй",
      text: report.report_text || "",
      quantity: report.reported_quantity ?? 0,
      measurementUnit: formatMeasurementUnit(
        report.task_measurement_unit_id,
        task.ops_measurement_unit,
      ),
      measurementUnitCode:
        report.task_measurement_unit_code || task.ops_measurement_unit_code || "",
      imageCount: Math.max(report.image_count ?? 0, imageIds.length),
      audioCount: Math.max(report.audio_count ?? 0, audioIds.length),
      images: imageIds.map((attachmentId) =>
        reportAttachmentItem(attachmentId, fallbackAttachments, "image"),
      ),
      audios: audioIds.map((attachmentId) =>
        reportAttachmentItem(attachmentId, fallbackAttachments, "audio"),
      ),
      };
    }),
    messages: messages
      .map((message) => ({
        id: message.id,
        author: relationName(message.author_id, "Систем"),
        postedAt: formatDateLabel(message.date),
        body: translateWorkspaceChatterBody(htmlToPlainText(message.body)),
        kind: classifyTaskMessage(message),
        subtype: relationName(message.subtype_id, ""),
        attachments: (message.attachment_ids ?? [])
          .map((attachmentId) => messageAttachmentById.get(attachmentId))
          .filter((attachment): attachment is WorkspaceAttachmentItem => Boolean(attachment)),
      }))
      .filter((message) => message.body || message.attachments.length)
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
    description?: string;
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

const ROAD_CLEANING_DEFAULT_LINES = [
  "Явган зам цэвэрлэх",
  "Замын нуух цэвэрлэх",
  "Хогийн сав шалгах",
  "Жижиг хог / шарилж / зарын хуудас цэвэрлэх",
];
const ROAD_CLEANING_DEFAULT_LINE_SEQUENCE = new Map(
  ROAD_CLEANING_DEFAULT_LINES.map((lineName, index) => [
    normalizeRoadCleaningDefaultLineName(lineName),
    (index + 1) * 10,
  ]),
);
const ROAD_CLEANING_EMPLOYEE_DEPARTMENT_KEYWORDS = [
  "ногоон",
  "цэвэрлэгээ үйлчилгээний хэлтэс",
];
const ROAD_CLEANING_EMPLOYEE_JOB_KEYWORD = "зам талбайн үйлчлэгч";
const ROAD_CLEANING_MASTER_JOB_KEYWORDS = ["мастер", "зам талбайн ахлах мастер"];

function normalizeRoadCleaningMatcherValue(value?: string | false) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeRoadCleaningDefaultLineName(value: string) {
  return value.trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

function getRoadCleaningDefaultLineSequence(value: string) {
  const normalized = normalizeRoadCleaningDefaultLineName(value);
  return ROAD_CLEANING_DEFAULT_LINE_SEQUENCE.get(normalized) ?? null;
}

function isRoadCleaningPhotoPlaceholderLine(value: string) {
  const normalized = normalizeRoadCleaningDefaultLineName(value);
  return normalized.includes("өмнөх зураг") || normalized.includes("дараах зураг");
}

function isRoadCleaningServiceEmployeeRecord(employee: EmployeeUserRecord) {
  const departmentName = normalizeRoadCleaningMatcherValue(
    relationName(employee.department_id, ""),
  );
  const jobTitle = normalizeRoadCleaningMatcherValue(getEmployeeJobTitle(employee));

  return (
    ROAD_CLEANING_EMPLOYEE_DEPARTMENT_KEYWORDS.every((keyword) =>
      departmentName.includes(keyword),
    ) && jobTitle.includes(ROAD_CLEANING_EMPLOYEE_JOB_KEYWORD)
  );
}

function isRoadCleaningMasterEmployeeRecord(employee: EmployeeUserRecord) {
  const departmentName = normalizeRoadCleaningMatcherValue(
    relationName(employee.department_id, ""),
  );
  const jobTitle = normalizeRoadCleaningMatcherValue(getEmployeeJobTitle(employee));

  return (
    ROAD_CLEANING_EMPLOYEE_DEPARTMENT_KEYWORDS.every((keyword) =>
      departmentName.includes(keyword),
    ) &&
    ROAD_CLEANING_MASTER_JOB_KEYWORDS.some(
      (keyword) => jobTitle === keyword || jobTitle.includes(keyword),
    )
  );
}

function isMissingMunicipalModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("doesn't exist") ||
    message.includes("does not exist") ||
    message.includes("Invalid field") ||
    message.includes("Unknown field")
  );
}

async function loadAndValidateRoadCleaningServiceEmployee(
  employeeId: number,
  connectionOverrides: Partial<OdooConnection>,
) {
  const [employee] = await executeOdooKw<EmployeeUserRecord[]>(
    "hr.employee",
    "read",
    [[employeeId]],
    {
      fields: ["name", "user_id", "department_id", "job_id", "job_title"],
    },
    connectionOverrides,
  );

  if (!employee) {
    throw new Error("Хариуцсан ажилтан олдсонгүй.");
  }

  if (!isRoadCleaningServiceEmployeeRecord(employee)) {
    throw new Error(
      "Хариуцсан ажилтан нь Ногоон байгуулламж, цэвэрлэгээ үйлчилгээний хэлтсийн Зам талбайн үйлчлэгч байх ёстой.",
    );
  }

  return employee;
}

async function loadAndValidateRoadCleaningMasterEmployee(
  employeeId: number,
  connectionOverrides: Partial<OdooConnection>,
) {
  const [employee] = await executeOdooKw<EmployeeUserRecord[]>(
    "hr.employee",
    "read",
    [[employeeId]],
    {
      fields: ["name", "user_id", "department_id", "job_id", "job_title"],
    },
    connectionOverrides,
  );

  if (!employee) {
    throw new Error("Хариуцсан мастер олдсонгүй.");
  }

  if (!isRoadCleaningMasterEmployeeRecord(employee)) {
    throw new Error(
      "Хариуцсан мастер нь Ногоон байгуулламж, цэвэрлэгээ үйлчилгээний хэлтсийн Мастер эсвэл Зам талбайн ахлах мастер байх ёстой.",
    );
  }

  return employee;
}

async function ensureRoadCleaningWorkType(connectionOverrides: Partial<OdooConnection>) {
  const existing = await executeOdooKw<Array<{ id: number }>>(
    "municipal.work.type",
    "search_read",
    [[["code", "=", "road_area_cleaning"]]],
    { fields: ["id"], limit: 1 },
    connectionOverrides,
  );

  if (existing[0]?.id) {
    return existing[0].id;
  }

  return executeOdooKw<number>(
    "municipal.work.type",
    "create",
    [
      {
        name: "Зам талбайн цэвэрлэгээ",
        code: "road_area_cleaning",
        default_requires_photo: true,
        default_requires_approval: true,
        default_unit_of_measure: "мкв",
      },
    ],
    {},
    connectionOverrides,
  );
}

async function createRoadCleaningWorkspaceProjectFallback(
  input: {
    areaName: string;
    departmentId?: number | null;
    employee: EmployeeUserRecord;
    masterEmployee: EmployeeUserRecord | null;
    workDate: string;
    description: string;
    municipalWorkId?: number | null;
    plannedQuantity?: number | null;
  },
  connectionOverrides: Partial<OdooConnection>,
) {
  const employeeUserId = relationId(input.employee.user_id) || null;
  const masterUserId = relationId(input.masterEmployee?.user_id ?? false) || null;
  const departmentId =
    input.departmentId || relationId(input.employee.department_id ?? false) || null;
  const projectName = `${input.areaName} - ${input.employee.name} - ${input.workDate}`;
  const workspaceConnection: Partial<OdooConnection> = {};
  const existing = await executeOdooKw<Array<{ id: number }>>(
    "project.project",
    "search_read",
    [[["name", "=", projectName]]],
    {
      fields: ["id"],
      limit: 1,
    },
    workspaceConnection,
  );
  if (existing[0]?.id) {
    throw new Error("Энэ талбай дээр энэ ажилтанд тухайн өдрийн ажил аль хэдийн үүссэн байна.");
  }

  const projectId = await createWorkspaceProject(
    {
      name: projectName,
      managerId: masterUserId,
      departmentId,
      startDate: input.workDate,
      deadline: input.workDate,
      description: input.description,
    },
    workspaceConnection,
  );

  for (const [index, lineName] of ROAD_CLEANING_DEFAULT_LINES.entries()) {
    await createWorkspaceTask(
      {
        projectId,
        name: lineName,
        teamLeaderId: masterUserId,
        assigneeUserIds: employeeUserId ? [employeeUserId] : [],
        deadline: input.workDate,
        description: input.description,
        sequence: (index + 1) * 10,
        shiftDate: input.workDate,
        plannedQuantity: index === 0 ? input.plannedQuantity : null,
        municipalWorkId: input.municipalWorkId,
      },
      workspaceConnection,
    );
  }

  return {
    workId: projectId,
    assignedUserIds: [employeeUserId, masterUserId].filter(
      (userId): userId is number => Boolean(userId),
    ),
    message: "Зам талбайн цэвэрлэгээний ажил project/task хэлбэрээр амжилттай үүслээ.",
  };
}

export async function createRoadCleaningArea(
  input: {
    name: string;
    khorooName?: string;
    streetName?: string;
    startPoint?: string;
    endPoint?: string;
    areaM2?: number | null;
    workingDayKeys?: string[];
    departmentId?: number | null;
    employeeId?: number | null;
    masterId?: number | null;
    note?: string;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Цэвэрлэх талбайн нэр оруулна уу.");
  }

  if (input.employeeId) {
    await loadAndValidateRoadCleaningServiceEmployee(input.employeeId, connectionOverrides);
  }
  if (input.masterId) {
    await loadAndValidateRoadCleaningMasterEmployee(input.masterId, connectionOverrides);
  }

  const fieldNames = await loadModelFieldNames("municipal.cleaning.area", connectionOverrides);
  const values = keepSupportedValues(
    {
      name,
      khoroo_name: input.khorooName?.trim() || false,
      street_name: input.streetName?.trim() || input.khorooName?.trim() || false,
      start_point: input.startPoint?.trim() || false,
      end_point: input.endPoint?.trim() || false,
      area_m2:
        typeof input.areaM2 === "number" && Number.isFinite(input.areaM2) ? input.areaM2 : 0,
      working_day_keys: normalizeRoadCleaningWorkingDayKeys(input.workingDayKeys).join(","),
      department_id: input.departmentId || false,
      employee_id: input.employeeId || false,
      master_id: input.masterId || false,
      frequency: "daily",
      active: true,
      note: input.note?.trim() || false,
    },
    fieldNames,
  );
  const existing = await executeOdooKw<Array<{ id: number }>>(
    "municipal.cleaning.area",
    "search_read",
    [[["name", "=", name]]],
    {
      fields: ["id"],
      limit: 1,
    },
    connectionOverrides,
  );
  if (existing[0]?.id) {
    await executeOdooKw<boolean>(
      "municipal.cleaning.area",
      "write",
      [[existing[0].id], values],
      {},
      connectionOverrides,
    );
    return existing[0].id;
  }

  return executeOdooKw<number>(
    "municipal.cleaning.area",
    "create",
    [values],
    {},
    connectionOverrides,
  );
}

export async function createRoadCleaningWork(
  input: {
    cleaningAreaId?: number | null;
    areaName?: string;
    departmentId?: number | null;
    employeeId: number;
    masterId?: number | null;
    workDate: string;
    note?: string;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const employee = await loadAndValidateRoadCleaningServiceEmployee(
    input.employeeId,
    connectionOverrides,
  );

  const localArea =
    input.cleaningAreaId && input.cleaningAreaId < 0
      ? await findLocalRoadCleaningAreaOption(input.cleaningAreaId)
      : null;
  let area: CleaningAreaRecord | null = null;
  if (input.cleaningAreaId && input.cleaningAreaId > 0) {
    try {
      const areaFieldNames = await loadModelFieldNames(
        "municipal.cleaning.area",
        connectionOverrides,
      );
      const areaFields = [
        "name",
        areaFieldNames.has("khoroo_name") ? "khoroo_name" : "",
        areaFieldNames.has("working_day_keys") ? "working_day_keys" : "",
        "street_name",
        "start_point",
        "end_point",
        "area_m2",
        "department_id",
        "master_id",
        "employee_id",
        "note",
      ].filter(Boolean);
      const [odooArea] = await executeOdooKw<CleaningAreaRecord[]>(
        "municipal.cleaning.area",
        "read",
        [[input.cleaningAreaId]],
        {
          fields: areaFields,
        },
        connectionOverrides,
      );
      area = odooArea ?? null;
    } catch (error) {
      if (!isMissingMunicipalModelError(error)) {
        throw error;
      }
    }
  }

  const areaName = area?.name || localArea?.name || input.areaName?.trim() || "";
  if (!areaName) {
    throw new Error("Цэвэрлэх талбай сонгоно уу.");
  }
  let duplicateMunicipalWorkId: number | null = null;
  if (input.cleaningAreaId && input.cleaningAreaId > 0) {
    const duplicate = await executeOdooKw<Array<{ id: number }>>(
      "municipal.work",
      "search_read",
      [
        [
          ["cleaning_area_id", "=", input.cleaningAreaId],
          ["responsible_employee_id", "=", input.employeeId],
          ["work_date", "=", input.workDate],
          ["active", "=", true],
        ],
      ],
      { fields: ["id"], limit: 1 },
      connectionOverrides,
    );

    if (duplicate[0]?.id) {
      duplicateMunicipalWorkId = duplicate[0].id;
    }
  }
  const workingDayKeys = area
    ? normalizeRoadCleaningWorkingDayKeys(area.working_day_keys)
    : (localArea?.workingDayKeys ?? normalizeRoadCleaningWorkingDayKeys(null));
  if (!duplicateMunicipalWorkId && !workingDayKeys.includes(getRoadCleaningDayKey(input.workDate))) {
    throw new Error("Энэ талбай тухайн өдөр амрах хуваарьтай байна.");
  }

  const masterEmployeeId = input.masterId || relationId(area?.master_id ?? false);
  const masterEmployee = masterEmployeeId
    ? await loadAndValidateRoadCleaningMasterEmployee(masterEmployeeId, connectionOverrides)
    : null;

  const routeText = [area?.start_point || "", area?.end_point || ""].filter(Boolean).join(" → ");
  const description = [
    input.note?.trim() || area?.note || localArea?.note || "",
    area?.khoroo_name ? `Хороо: ${area.khoroo_name}` : "",
    localArea?.khorooName ? `Хороо: ${localArea.khorooName}` : "",
    area?.street_name ? `Гудамж / замын нэр: ${area.street_name}` : "",
    area?.start_point ? `Эхлэх цэг: ${area.start_point}` : "",
    area?.end_point ? `Дуусах цэг: ${area.end_point}` : "",
    area?.area_m2 ? `Талбай /мкв/: ${area.area_m2}` : "",
    localArea?.areaM2 ? `Талбай /мкв/: ${localArea.areaM2}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  let workTypeId = 0;
  try {
    workTypeId = await ensureRoadCleaningWorkType(connectionOverrides);
  } catch (error) {
    if (!isMissingMunicipalModelError(error)) {
      throw error;
    }
  }

  if (duplicateMunicipalWorkId) {
    return createRoadCleaningWorkspaceProjectFallback(
      {
        areaName,
        departmentId: input.departmentId,
        employee,
        masterEmployee,
        workDate: input.workDate,
        description,
        municipalWorkId: duplicateMunicipalWorkId,
        plannedQuantity: Number(area?.area_m2 || localArea?.areaM2 || 0),
      },
      connectionOverrides,
    );
  }

  if (!area || !input.cleaningAreaId || input.cleaningAreaId < 0 || !workTypeId) {
    return createRoadCleaningWorkspaceProjectFallback(
      {
        areaName,
        departmentId: input.departmentId,
        employee,
        masterEmployee,
        workDate: input.workDate,
        description,
        plannedQuantity: Number(localArea?.areaM2 || 0),
      },
      connectionOverrides,
    );
  }

  let workId: number;
  try {
    workId = await executeOdooKw<number>(
      "municipal.work",
      "create",
      [
        {
          name: `${areaName} - ${employee.name} - ${input.workDate}`,
          department_id: relationId(area.department_id ?? false) || false,
          work_type_id: workTypeId,
          cleaning_area_id: input.cleaningAreaId,
          responsible_employee_id: input.employeeId,
          responsible_user_id: relationId(employee.user_id) || false,
          manager_id: relationId(masterEmployee?.user_id ?? false) || false,
          master_id: masterEmployeeId || false,
          work_date: input.workDate,
          start_datetime: `${input.workDate} 00:00:00`,
          deadline_datetime: `${input.workDate} 23:59:59`,
          planned_quantity: Number(area.area_m2 || 0),
          unit_of_measure: "мкв",
          location_text: [area.street_name || "", routeText].filter(Boolean).join(" · "),
          description,
          requires_photo: true,
          requires_approval: true,
          state: "draft",
        },
      ],
      {},
      connectionOverrides,
    );
  } catch (error) {
    if (!isMissingMunicipalModelError(error)) {
      throw error;
    }
    return createRoadCleaningWorkspaceProjectFallback(
      {
        areaName,
        departmentId: input.departmentId,
        employee,
        masterEmployee,
        workDate: input.workDate,
        description,
      },
      connectionOverrides,
    );
  }

  await executeOdooKw<number[]>(
    "municipal.work.line",
    "create",
    [
      ROAD_CLEANING_DEFAULT_LINES.map((name, index) => ({
        work_id: workId,
        name,
        sequence: (index + 1) * 10,
      })),
    ],
    {},
    connectionOverrides,
  );

  await createRoadCleaningWorkspaceProjectFallback(
    {
      areaName,
      departmentId: input.departmentId,
      employee,
      masterEmployee,
      workDate: input.workDate,
      description,
      municipalWorkId: workId,
      plannedQuantity: Number(area.area_m2 || 0),
    },
    connectionOverrides,
  );

  return {
    workId,
    assignedUserIds: [
      relationId(employee.user_id) || null,
      relationId(masterEmployee?.user_id ?? false) || null,
    ].filter((userId): userId is number => Boolean(userId)),
    message: "Зам талбайн цэвэрлэгээний ажил амжилттай үүслээ.",
  };
}

export async function assignRoadCleaningMasterToEmployees(
  input: {
    masterId: number;
    employeeIds: number[];
    allEmployeeIds?: number[];
    workDate: string;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const masterEmployee = await loadAndValidateRoadCleaningMasterEmployee(
    input.masterId,
    connectionOverrides,
  );
  const employeeIds = Array.from(
    new Set(input.employeeIds.filter((id) => Number.isFinite(id) && id > 0)),
  );
  if (!employeeIds.length) {
    throw new Error("Мастерт хариуцуулах ажилтан сонгоно уу.");
  }
  for (const employeeId of employeeIds) {
    await loadAndValidateRoadCleaningServiceEmployee(employeeId, connectionOverrides);
  }

  try {
    const allEmployeeIds = Array.from(
      new Set((input.allEmployeeIds ?? []).filter((id) => Number.isFinite(id) && id > 0)),
    );
    if (allEmployeeIds.length) {
      const unassignedEmployeeIds = allEmployeeIds.filter((id) => !employeeIds.includes(id));
      if (unassignedEmployeeIds.length) {
        const oldAreas = await executeOdooKw<Array<{ id: number }>>(
          "municipal.cleaning.area",
          "search_read",
          [[["master_id", "=", input.masterId], ["employee_id", "in", unassignedEmployeeIds], ["active", "=", true]]],
          {
            fields: ["id"],
            limit: 1000,
          },
          connectionOverrides,
        );
        const oldAreaIds = oldAreas.map((area) => area.id);
        if (oldAreaIds.length) {
          await executeOdooKw<boolean>(
            "municipal.cleaning.area",
            "write",
            [oldAreaIds, { master_id: false }],
            {},
            connectionOverrides,
          );
        }
      }
    }

    const areas = await executeOdooKw<Array<{ id: number }>>(
      "municipal.cleaning.area",
      "search_read",
      [[["employee_id", "in", employeeIds], ["active", "=", true]]],
      {
        fields: ["id"],
        limit: 1000,
      },
      connectionOverrides,
    );
    const areaIds = areas.map((area) => area.id);
    if (!areaIds.length) {
      return { updatedAreaCount: 0, updatedWorkCount: 0 };
    }

    await executeOdooKw<boolean>(
      "municipal.cleaning.area",
      "write",
      [areaIds, { master_id: input.masterId }],
      {},
      connectionOverrides,
    );

    const works = await executeOdooKw<Array<{ id: number }>>(
      "municipal.work",
      "search_read",
      [
        [
          ["cleaning_area_id", "in", areaIds],
          ["work_date", "=", input.workDate],
          ["active", "=", true],
        ],
      ],
      {
        fields: ["id"],
        limit: 1000,
      },
      connectionOverrides,
    );
    const workIds = works.map((work) => work.id);
    if (workIds.length) {
      const workFields = await loadModelFieldNames("municipal.work", connectionOverrides);
      const values = keepSupportedValues(
        {
          master_id: input.masterId,
          manager_id: relationId(masterEmployee.user_id) || false,
        },
        workFields,
      );
      await executeOdooKw<boolean>(
        "municipal.work",
        "write",
        [workIds, values],
        {},
        connectionOverrides,
      );
    }

    return { updatedAreaCount: areaIds.length, updatedWorkCount: workIds.length };
  } catch (error) {
    if (!isMissingMunicipalModelError(error)) {
      throw error;
    }
    const result = await updateLocalRoadCleaningAreaMasterAssignments({
      masterId: input.masterId,
      masterName: masterEmployee.name,
      employeeIds,
      allEmployeeIds: input.allEmployeeIds,
    });
    return { updatedAreaCount: result.updatedCount, updatedWorkCount: 0 };
  }
}

export async function createTodayRoadCleaningWorks(
  input: {
    workDate: string;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const areas = await loadRoadCleaningAreaOptions(connectionOverrides);
  let createdCount = 0;
  let skippedCount = 0;

  for (const area of areas) {
    if (!area.employeeId) {
      skippedCount += 1;
      continue;
    }

    try {
      await createRoadCleaningWork(
        {
          cleaningAreaId: area.id,
          areaName: area.name,
          departmentId: area.departmentId,
          employeeId: area.employeeId,
          masterId: area.masterId,
          workDate: input.workDate,
          note: area.note,
        },
        connectionOverrides,
      );
      createdCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      if (
        message.includes("аль хэдийн үүссэн") ||
        message.includes("тухайн өдөр амрах")
      ) {
        skippedCount += 1;
        continue;
      }
      throw error;
    }
  }

  return { createdCount, skippedCount };
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
    return { assignedTaskCount: 0, hasCrewTeam: false, assignedUserIds: [] };
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
    return { assignedTaskCount: 0, hasCrewTeam: true, assignedUserIds: [] };
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

  return { assignedTaskCount: tasks.length, hasCrewTeam: true, assignedUserIds: memberUserIds };
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
    sequence?: number | null;
    operationType?: string;
    shiftDate?: string;
    vehicleId?: number | null;
    driverEmployeeId?: number | null;
    collectorEmployeeIds?: number[];
    inspectorEmployeeId?: number | null;
    municipalWorkId?: number | null;
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const baseValues: Record<string, unknown> = {
    project_id: input.projectId,
    name: input.name.trim(),
  };
  const optionalValues: Record<string, unknown> = {};

  if (input.teamLeaderId) {
    optionalValues.ops_team_leader_id = input.teamLeaderId;
  }
  if (input.crewTeamId) {
    optionalValues.mfo_crew_team_id = input.crewTeamId;
  }
  const assigneeUserIds = Array.from(
    new Set([
      ...(input.teamLeaderId ? [input.teamLeaderId] : []),
      ...(input.assigneeUserIds ?? []),
    ]),
  ).filter((id) => Number.isFinite(id) && id > 0);
  if (input.deadline) {
    optionalValues.date_deadline = input.deadline;
  }
  if (input.startDate) {
    optionalValues.mfo_planned_start = dateInputToOdooDatetime(input.startDate);
  }
  if (input.measurementUnitId) {
    optionalValues.ops_measurement_unit_id = input.measurementUnitId;
  }
  if (typeof input.plannedQuantity === "number" && !Number.isNaN(input.plannedQuantity)) {
    optionalValues.ops_planned_quantity = input.plannedQuantity;
  }
  if (input.description) {
    optionalValues.description = input.description.trim();
  }
  if (typeof input.sequence === "number" && Number.isFinite(input.sequence)) {
    optionalValues.sequence = input.sequence;
  }
  if (input.operationType) {
    optionalValues.mfo_operation_type = input.operationType;
  }
  if (input.shiftDate) {
    optionalValues.mfo_shift_date = input.shiftDate;
  }
  if (input.vehicleId) {
    optionalValues.mfo_vehicle_id = input.vehicleId;
  }
  if (input.driverEmployeeId) {
    optionalValues.mfo_driver_employee_id = input.driverEmployeeId;
  }
  if (input.collectorEmployeeIds?.length) {
    optionalValues.mfo_collector_employee_ids = [
      [6, 0, Array.from(new Set(input.collectorEmployeeIds))],
    ];
  }
  if (input.inspectorEmployeeId) {
    optionalValues.mfo_inspector_employee_id = input.inspectorEmployeeId;
  }
  if (input.municipalWorkId) {
    optionalValues.municipal_work_id = input.municipalWorkId;
  }
  if (assigneeUserIds.length) {
    baseValues.user_ids = [[6, 0, assigneeUserIds]];
  }

  const taskId = await executeOdooKw<number>(
    "project.task",
    "create",
    [baseValues],
    {},
    connectionOverrides,
  );

  const writeTaskValues = async (values: Record<string, unknown>) =>
    executeOdooKw<boolean>("project.task", "write", [[taskId], values], {}, connectionOverrides);

  if (Object.keys(optionalValues).length) {
    try {
      await writeTaskValues(optionalValues);
    } catch (error) {
      console.warn("Project task optional fields write failed; retrying field by field.", error);
      for (const [fieldName, value] of Object.entries(optionalValues)) {
        try {
          await writeTaskValues({ [fieldName]: value });
        } catch (fieldError) {
          console.warn(`Project task optional field skipped: ${fieldName}`, fieldError);
        }
      }
    }
  }

  if (assigneeUserIds.length) {
    try {
      await writeTaskValues({ user_ids: [[6, 0, assigneeUserIds]] });
    } catch (error) {
      console.warn("Project task assignee write skipped.", error);
    }
  }

  return taskId;
}

export async function updateWorkspaceTask(
  taskId: number,
  input: {
    name?: string;
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
  const values: Record<string, unknown> = {};
  const name = input.name?.trim();

  if (name) {
    values.name = name;
  }
  if (input.teamLeaderId !== undefined) {
    values.ops_team_leader_id = input.teamLeaderId || false;
  }
  if (input.crewTeamId !== undefined) {
    values.mfo_crew_team_id = input.crewTeamId || false;
  }
  if (input.startDate !== undefined) {
    values.mfo_planned_start = input.startDate ? dateInputToOdooDatetime(input.startDate) : false;
  }
  if (typeof input.deadline === "string") {
    values.date_deadline = input.deadline || false;
  }
  if (input.measurementUnitId !== undefined) {
    values.ops_measurement_unit_id = input.measurementUnitId || false;
  }
  if (input.plannedQuantity !== undefined) {
    values.ops_planned_quantity =
      typeof input.plannedQuantity === "number" && !Number.isNaN(input.plannedQuantity)
        ? input.plannedQuantity
        : false;
  }
  if (input.description !== undefined) {
    values.description = input.description.trim() || false;
  }

  if (input.assigneeUserIds !== undefined) {
    const assigneeUserIds = Array.from(
      new Set([
        ...(input.teamLeaderId ? [input.teamLeaderId] : []),
        ...(input.assigneeUserIds ?? []),
      ]),
    ).filter((id) => Number.isFinite(id) && id > 0);
    values.user_ids = [[6, 0, assigneeUserIds]];
  }

  if (!Object.keys(values).length) {
    return false;
  }

  try {
    return await executeOdooKw<boolean>(
      "project.task",
      "write",
      [[taskId], values],
      {},
      connectionOverrides,
    );
  } catch (error) {
    console.warn("Project task update failed; retrying field by field.", error);
    let wroteAnyField = false;
    for (const [fieldName, value] of Object.entries(values)) {
      try {
        await executeOdooKw<boolean>(
          "project.task",
          "write",
          [[taskId], { [fieldName]: value }],
          {},
          connectionOverrides,
        );
        wroteAnyField = true;
      } catch (fieldError) {
        console.warn(`Project task update field skipped: ${fieldName}`, fieldError);
      }
    }
    return wroteAnyField;
  }
}

export async function deleteWorkspaceTask(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const reports = await executeOdooKw<{ id: number }[]>(
    "ops.task.report",
    "search_read",
    [[["task_id", "=", taskId]]],
    { fields: ["id"] },
    connectionOverrides,
  ).catch(() => []);
  const reportIds = reports.map((report) => report.id).filter(Boolean);
  if (reportIds.length) {
    await executeOdooKw<boolean>(
      "ops.task.report",
      "unlink",
      [reportIds],
      {},
      connectionOverrides,
    );
  }

  return executeOdooKw<boolean>(
    "project.task",
    "unlink",
    [[taskId]],
    {},
    connectionOverrides,
  );
}

export async function deleteWorkspaceProject(
  projectId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const tasks = await executeOdooKw<{ id: number }[]>(
    "project.task",
    "search_read",
    [[["project_id", "=", projectId]]],
    { fields: ["id"] },
    connectionOverrides,
  ).catch(() => []);
  for (const task of tasks) {
    await deleteWorkspaceTask(task.id, connectionOverrides);
  }

  return executeOdooKw<boolean>(
    "project.project",
    "unlink",
    [[projectId]],
    {},
    connectionOverrides,
  );
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

export async function createRoadCleaningWorkAttachments(
  workId: number,
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
            res_model: "municipal.work",
            res_id: workId,
          },
        ],
        {},
        connectionOverrides,
      ),
    ),
  );
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
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
    return runWithConcurrency(attachments ?? [], 3, (attachment) =>
      executeOdooKw<number>(
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
      ),
    );
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

export async function updateWorkspaceTaskReport(
  reportId: number,
  input: {
    reportText: string;
    reportedQuantity?: number | null;
    imageAttachments?: WorkspaceReportAttachmentInput[];
    audioAttachments?: WorkspaceReportAttachmentInput[];
    removeImageAttachmentIds?: number[];
    removeAudioAttachmentIds?: number[];
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const fieldNames = await loadModelFieldNames("ops.task.report", connectionOverrides);
  const values: Record<string, unknown> = keepSupportedValues(
    {
      report_text: input.reportText.trim(),
      report_summary: input.reportText.trim(),
    },
    fieldNames,
  );

  if (
    typeof input.reportedQuantity === "number" &&
    Number.isFinite(input.reportedQuantity) &&
    input.reportedQuantity >= 0 &&
    fieldNames.has("reported_quantity")
  ) {
    values.reported_quantity = input.reportedQuantity;
  }

  const updated = Object.keys(values).length
    ? await executeOdooKw<boolean>(
        "ops.task.report",
        "write",
        [[reportId], values],
        {},
        connectionOverrides,
      )
    : true;

  const createReportAttachments = async (
    attachments: WorkspaceReportAttachmentInput[] | undefined,
  ) => {
    return runWithConcurrency(attachments ?? [], 3, (attachment) =>
      executeOdooKw<number>(
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
      ),
    );
  };

  const [newImageIds, newAudioIds] = await Promise.all([
    createReportAttachments(input.imageAttachments),
    createReportAttachments(input.audioAttachments),
  ]);
  const removeImageIds = Array.from(new Set(input.removeImageAttachmentIds ?? []));
  const removeAudioIds = Array.from(new Set(input.removeAudioAttachmentIds ?? []));

  if (newImageIds.length || newAudioIds.length || removeImageIds.length || removeAudioIds.length) {
    const currentReports = await executeOdooKw<
      Array<{
        image_attachment_ids?: number[];
        audio_attachment_ids?: number[];
      }>
    >(
      "ops.task.report",
      "search_read",
      [[["id", "=", reportId]]],
      {
        fields: ["image_attachment_ids", "audio_attachment_ids"],
        limit: 1,
      },
      connectionOverrides,
    );
    const currentImageIds = currentReports[0]?.image_attachment_ids ?? [];
    const currentAudioIds = currentReports[0]?.audio_attachment_ids ?? [];
    const nextImageIds = Array.from(
      new Set([
        ...currentImageIds.filter((id) => !removeImageIds.includes(id)),
        ...newImageIds,
      ]),
    );
    const nextAudioIds = Array.from(
      new Set([
        ...currentAudioIds.filter((id) => !removeAudioIds.includes(id)),
        ...newAudioIds,
      ]),
    );

    await executeOdooKw<boolean>(
      "ops.task.report",
      "write",
      [
        [reportId],
        {
          image_attachment_ids: [[6, 0, nextImageIds]],
          audio_attachment_ids: [[6, 0, nextAudioIds]],
        },
      ],
      {},
      connectionOverrides,
    );
  }

  const detachedAttachmentIds = [...removeImageIds, ...removeAudioIds];
  if (detachedAttachmentIds.length) {
    try {
      await executeOdooKw<boolean>(
        "ir.attachment",
        "unlink",
        [detachedAttachmentIds],
        {},
        connectionOverrides,
      );
    } catch (error) {
      console.warn("Report attachment files could not be deleted after detach.", error);
    }
  }

  return updated;
}

export async function loadWorkspaceTaskReportOwner(
  reportId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const reports = await executeOdooKw<Array<{ id: number; reporter_id: Relation }>>(
    "ops.task.report",
    "search_read",
    [[["id", "=", reportId]]],
    {
      fields: ["reporter_id"],
      limit: 1,
    },
    connectionOverrides,
  );

  return relationId(reports[0]?.reporter_id ?? false);
}

export async function deleteWorkspaceTaskReport(
  reportId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  return executeOdooKw<boolean>(
    "ops.task.report",
    "unlink",
    [[reportId]],
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
      return [];
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
      const isSeniorMasterReviewer =
        role === "senior_master" && (!departmentId || departmentUserIds.has(user.id));
      const isMasterReviewer =
        role === "team_leader" && (user.id === teamLeaderId || assignedUserIds.has(user.id));

      if (isExecutiveReviewer || isDepartmentReviewer || isSeniorMasterReviewer || isMasterReviewer) {
        recipientIds.add(user.id);
      }
    }

    const finalRecipientIds = Array.from(recipientIds).filter((id) => id > 0);
    if (!finalRecipientIds.length) {
      return [];
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
      `<p><strong>${task.name}</strong> даалгавар дээр шинэ тайлан орлоо.</p>`,
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
    return finalRecipientIds;
  } catch (error) {
    console.error("Failed to notify task report reviewers:", error);
    return [];
  }
}

export async function markWorkspaceTaskDone(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const callTaskAction = (method: string) =>
    executeOdooKw<boolean>(
      "project.task",
      method,
      [[taskId]],
      {},
      connectionOverrides,
    );

  for (const method of ["action_ops_mark_done", "action_mfo_verify"]) {
    try {
      await callTaskAction(method);
      return forceWorkspaceTaskDone(taskId, connectionOverrides);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes(method) && !message.toLowerCase().includes("does not exist")) {
        throw error;
      }
    }
  }

  return forceWorkspaceTaskDone(taskId, connectionOverrides);
}

async function loadDoneTaskStageId(connectionOverrides: Partial<OdooConnection>) {
  const readStages = (domain: unknown[]) =>
    executeOdooKw<Array<{ id: number; name: string }>>(
      "project.task.type",
      "search_read",
      [domain],
      {
        fields: ["name"],
        order: "sequence desc, id desc",
        limit: 1,
      },
      connectionOverrides,
    ).catch(() => []);

  const nameDomains = [
    [["name", "ilike", "Дууссан ажил"]],
    [["name", "ilike", "Дууссан"]],
    [["name", "ilike", "Done"]],
    [["name", "ilike", "Completed"]],
    [["name", "ilike", "Approved"]],
    [["name", "ilike", "Verified"]],
  ];

  for (const domain of nameDomains) {
    const stages = await readStages(domain);
    if (stages[0]?.id) {
      return stages[0].id;
    }
  }

  const foldedStages = await readStages([["fold", "=", true]]);
  return foldedStages[0]?.id ?? null;
}

export async function forceWorkspaceTaskDone(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const doneStageId = await loadDoneTaskStageId(connectionOverrides);
  const taskFields = await loadModelFieldNames("project.task", connectionOverrides).catch(() => null);
  let values: Record<string, unknown> = {
    ops_progress_percent: 100,
    ops_reports_locked: true,
    mfo_state: "verified",
    state: "1_done",
  };

  if (doneStageId) {
    values.stage_id = doneStageId;
  }

  if (taskFields) {
    values = keepSupportedValues(values, taskFields);
  }

  const writeDoneValues = async (nextValues: Record<string, unknown>) =>
    executeOdooKw<boolean>(
      "project.task",
      "write",
      [[taskId], nextValues],
      {},
      connectionOverrides,
    );

  try {
    const result = await writeDoneValues(values);
    await markWorkspaceTaskReportsApproved(taskId, connectionOverrides);
    return result;
  } catch {
    delete values.state;
    try {
      const result = await writeDoneValues(values);
      await markWorkspaceTaskReportsApproved(taskId, connectionOverrides);
      return result;
    } catch {
      delete values.mfo_state;
      const result = await writeDoneValues(values);
      await markWorkspaceTaskReportsApproved(taskId, connectionOverrides);
      return result;
    }
  }
}

async function markWorkspaceTaskReportsApproved(
  taskId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  try {
    const reportIds = await executeOdooKw<number[]>(
      "ops.task.report",
      "search",
      [[["task_id", "=", taskId]]],
      {},
      connectionOverrides,
    );

    if (!reportIds.length) {
      return;
    }

    const reportFields = await loadModelFieldNames("ops.task.report", connectionOverrides);
    const approvedValues = keepSupportedValues(
      {
        state: "approved",
        rejection_reason: "",
      },
      reportFields,
    );

    if (Object.keys(approvedValues).length) {
      await executeOdooKw<boolean>(
        "ops.task.report",
        "write",
        [reportIds, approvedValues],
        {},
        connectionOverrides,
      );
    }
  } catch (error) {
    console.warn("Task reports could not be marked as approved.", error);
  }
}

export async function postWorkspaceTaskMessage(
  taskId: number,
  input: {
    body: string;
    kind: "message" | "note";
    attachments?: WorkspaceReportAttachmentInput[];
  },
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const body = input.body.trim();
  const attachments = input.attachments ?? [];
  if (!body && !attachments.length) {
    return 0;
  }
  const attachmentIds: number[] = [];

  for (const attachment of attachments) {
    const attachmentId = await executeOdooKw<number>(
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
    );
    attachmentIds.push(attachmentId);
  }

  return executeOdooKw<number>(
    "project.task",
    "message_post",
    [[taskId]],
    {
      body: plainTextToOdooHtml(body || "Хавсралт илгээлээ."),
      message_type: "comment",
      subtype_xmlid: input.kind === "note" ? "mail.mt_note" : "mail.mt_comment",
      ...(attachmentIds.length ? { attachment_ids: [[6, 0, attachmentIds]] } : {}),
    },
    connectionOverrides,
  );
}

export async function updateWorkspaceProjectDescription(
  projectId: number,
  description: string,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const value = description.trim();
  if (!value) {
    return false;
  }

  try {
    return await executeOdooKw<boolean>(
      "project.project",
      "write",
      [[projectId], { description: value }],
      {},
      connectionOverrides,
    );
  } catch (error) {
    console.warn("Project description хадгалах боломжгүй байна:", error);
    return false;
  }
}

export async function returnWorkspaceTaskForChanges(
  taskId: number,
  reason: string,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const returnReason = reason.trim() || "Засвар шаардсан тул буцаалаа.";

  try {
    await executeOdooKw<boolean>(
      "project.task",
      "action_mfo_return",
      [[taskId], returnReason],
      {},
      connectionOverrides,
    );
  } catch (primaryError) {
    try {
      const wizardId = await executeOdooKw<number>(
        "ops.task.return.wizard",
        "create",
        [
          {
            task_id: taskId,
            return_reason: returnReason,
          },
        ],
        {},
        connectionOverrides,
      );

      await executeOdooKw(
        "ops.task.return.wizard",
        "action_confirm_return",
        [[wizardId]],
        {},
        connectionOverrides,
      );
    } catch (wizardError) {
      const taskFields = await loadModelFieldNames("project.task", connectionOverrides);
      const taskValues = keepSupportedValues(
        {
          mfo_state: "returned",
        },
        taskFields,
      );

      if (Object.keys(taskValues).length) {
        await executeOdooKw<boolean>(
          "project.task",
          "write",
          [[taskId], taskValues],
          {},
          connectionOverrides,
        );
      } else {
        console.warn("Task return fallback could not update project.task state.", {
          primaryError,
          wizardError,
        });
      }
    }
  }

  try {
    const reportIds = await executeOdooKw<number[]>(
      "ops.task.report",
      "search",
      [[["task_id", "=", taskId], ["state", "in", ["draft", "submitted", "under_review", "approved"]]]],
      {},
      connectionOverrides,
    );

    if (reportIds.length) {
      const reportFields = await loadModelFieldNames("ops.task.report", connectionOverrides);
      const returnValues = keepSupportedValues(
        {
          rejection_reason: returnReason,
          state: "returned",
        },
        reportFields,
      );
      if (Object.keys(returnValues).length) {
        await executeOdooKw<boolean>(
          "ops.task.report",
          "write",
          [reportIds, returnValues],
          {},
          connectionOverrides,
        );
      }
      try {
        await executeOdooKw<boolean>(
          "ops.task.report",
          "action_return",
          [reportIds],
          {},
          connectionOverrides,
        );
      } catch (actionReturnError) {
        console.warn("Task reports were written as returned but action_return failed.", actionReturnError);
      }
    }
  } catch (reportError) {
    console.warn("Task reports could not be marked as returned.", reportError);
  }

  try {
    await executeOdooKw<number>(
      "project.task",
      "message_post",
      [[taskId]],
      {
        body: plainTextToOdooHtml(`Засвар нэхэж буцаасан шалтгаан:\n${returnReason}`),
        message_type: "comment",
        subtype_xmlid: "mail.mt_comment",
      },
      connectionOverrides,
    );
  } catch (messageError) {
    console.warn("Task return message could not be posted.", messageError);
  }

  return true;
}
