import "server-only";

import { getDateKeyFromValue, getTodayDateKey } from "@/lib/dashboard-scope";
import {
  CANONICAL_DEPARTMENT_NAMES,
  findDepartmentGroupByName,
  matchesDepartmentGroup,
  normalizeOrganizationUnitName,
} from "@/lib/department-groups";
import type { RoleGroupFlags } from "@/lib/roles";

type OdooRelation = [number, string] | false;

type OdooProjectRecord = {
  id: number;
  name: string;
  user_id: OdooRelation;
  ops_department_id: OdooRelation;
  date_start: string | false;
  date: string | false;
};

type OdooTaskRecord = {
  id: number;
  name: string;
  project_id: OdooRelation;
  ops_department_id?: OdooRelation;
  stage_id: OdooRelation;
  ops_team_leader_id?: OdooRelation;
  user_ids?: number[];
  ops_planned_quantity?: number;
  ops_completed_quantity?: number;
  ops_remaining_quantity?: number;
  ops_progress_percent?: number;
  ops_measurement_unit?: string | false;
  ops_measurement_unit_id?: OdooRelation;
  ops_measurement_unit_code?: string | false;
  priority?: string;
  date_deadline?: string | false;
  mfo_shift_date?: string | false;
  state?: string;
  mfo_is_operation_project?: boolean;
  mfo_operation_type?: string | false;
  mfo_route_id?: OdooRelation;
  mfo_unresolved_stop_count?: number;
  mfo_missing_proof_stop_count?: number;
  mfo_route_deviation_stop_count?: number;
  mfo_skipped_without_reason_count?: number;
  mfo_weight_sync_warning?: boolean;
  mfo_quality_exception_count?: number;
};

type OdooReportRecord = {
  id: number;
  task_id: OdooRelation;
  reporter_id: OdooRelation;
  report_datetime: string;
  report_summary: string | false;
  reported_quantity: number;
  task_measurement_unit_id?: OdooRelation;
  task_measurement_unit_code?: string | false;
  image_count?: number;
  audio_count?: number;
  image_attachment_ids?: number[];
  audio_attachment_ids?: number[];
};

type OdooAttachmentRecord = {
  id: number;
  name: string | false;
  mimetype: string | false;
};

type OdooAttachmentBinaryRecord = OdooAttachmentRecord & {
  datas: string | false;
};

type OdooUserRecord = {
  id: number;
  name: string;
  login: string;
  ops_user_type: string | false;
};

type OdooEmployeeRecord = {
  id: number;
  name: string;
  active?: boolean;
  department_id?: OdooRelation;
  job_id?: OdooRelation;
  job_title?: string | false;
  work_phone?: string | false;
  mobile_phone?: string | false;
  work_email?: string | false;
  user_id?: OdooRelation;
  image_128?: string | false;
  avatar_128?: string | false;
  image_1920?: string | false;
  parent_id?: OdooRelation;
  contract_date_start?: string | false;
  contract_date_end?: string | false;
  sex?: string | false;
  certificate?: string | false;
  x_mn_employee_code?: string | false;
  x_mn_grade_rank?: string | false;
  x_mn_employment_status?: string | false;
  x_mn_missing_document_count?: number;
  x_mn_performance_score?: number;
  x_mn_task_completion_percent?: number;
  x_mn_discipline_score?: number;
};

type DepartmentCard = {
  name: string;
  label: string;
  icon: string;
  accent: string;
  openTasks: number;
  reviewTasks: number;
  completion: number;
};

type ProjectCard = {
  id: number;
  name: string;
  manager: string;
  departmentName: string;
  stageLabel: string;
  stageBucket: StageBucket;
  openTasks: number;
  completion: number;
  deadline: string;
  href: string;
};

type ReviewItem = {
  id: number;
  name: string;
  departmentName: string;
  stageLabel: string;
  deadline: string;
  projectName: string;
  leaderName: string;
  progress: number;
  href: string;
};

type LiveTask = {
  id: number;
  name: string;
  departmentName: string;
  projectName: string;
  stageLabel: string;
  stageBucket: StageBucket;
  deadline: string;
  scheduledDate?: string | null;
  plannedQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  measurementUnit: string;
  leaderName: string;
  priorityLabel: string;
  progress: number;
  href: string;
};

export type TaskStatusKey = "planned" | "working" | "review" | "verified" | "problem";

export type TaskDirectoryItem = {
  id: number;
  name: string;
  departmentName: string;
  projectName: string;
  stageLabel: string;
  stageBucket: StageBucket;
  statusKey: TaskStatusKey;
  statusLabel: string;
  deadline: string;
  scheduledDate?: string | null;
  leaderName: string;
  priorityLabel: string;
  progress: number;
  plannedQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  measurementUnit: string;
  operationTypeLabel: string;
  issueFlag: boolean;
  assigneeIds?: number[];
  href: string;
};

type ReportFeedItem = {
  id: number;
  reporter: string;
  taskName: string;
  departmentName: string;
  projectName: string;
  summary: string;
  reportedQuantity: number;
  measurementUnit: string;
  measurementUnitCode: string;
  imageCount: number;
  audioCount: number;
  submittedAt: string;
  images: {
    id: number;
    name: string;
    mimetype: string;
    url: string;
  }[];
  audios: {
    id: number;
    name: string;
    mimetype: string;
    url: string;
  }[];
};

type TeamLeaderCard = {
  name: string;
  activeTasks: number;
  reviewTasks: number;
  averageCompletion: number;
  squadSize: number;
};

type QualityAlert = {
  id: number;
  name: string;
  departmentName: string;
  projectName: string;
  routeName: string;
  operationTypeLabel: string;
  exceptionCount: number;
  unresolvedStopCount: number;
  missingProofStopCount: number;
  deviationStopCount: number;
  skippedWithoutReasonCount: number;
  hasWeightWarning: boolean;
  href: string;
};

type DashboardMetric = {
  label: string;
  value: string;
  note: string;
  tone: "amber" | "teal" | "red" | "slate";
};

export type OdooConnection = {
  url: string;
  db: string;
  login: string;
  password: string;
};

export type AuthenticatedOdooUser = {
  uid: number;
  user: {
    name: string;
    login: string;
    role: string;
    groupFlags: RoleGroupFlags;
  };
};

export type DashboardSnapshot = {
  source: "live" | "demo";
  generatedAt: string;
  metrics: DashboardMetric[];
  qualityMetrics: DashboardMetric[];
  departments: DepartmentCard[];
  projects: ProjectCard[];
  taskDirectory: TaskDirectoryItem[];
  liveTasks: LiveTask[];
  reviewQueue: ReviewItem[];
  qualityAlerts: QualityAlert[];
  reports: ReportFeedItem[];
  teamLeaders: TeamLeaderCard[];
  odooBaseUrl: string;
  totalTasks: number;
};

export type HrEmployeeDirectoryItem = {
  id: number;
  name: string;
  active: boolean;
  departmentName: string;
  jobTitle: string;
  workPhone: string;
  mobilePhone: string;
  workEmail: string;
  userName: string;
  photoUrl: string;
  employeeCode: string;
  gradeRank: string;
  statusKey: string;
  statusLabel: string;
  managerName: string;
  startDate: string;
  contractEndDate: string;
  genderLabel: string;
  educationLevel: string;
  missingDocumentCount: number;
  kpiScore: number;
  taskCompletionPercent: number;
  disciplineScore: number;
};

type OdooFleetVehicleRecord = {
  id: number;
  name: string;
  license_plate?: string | false;
  model_id?: OdooRelation;
  category_id?: OdooRelation;
  vin_sn?: string | false;
  odometer?: number | false;
  fuel_type?: string | false;
  driver_id?: OdooRelation;
  state_id?: OdooRelation;
  mfo_active_for_ops?: boolean;
  latest_repair_state?: string | false;
  vehicle_downtime_open?: boolean;
  active?: boolean;
};

type OdooCrewTeamRecord = {
  id: number;
  name: string;
  active?: boolean;
  operation_type?: string | false;
  vehicle_id?: OdooRelation;
  driver_employee_id?: OdooRelation;
  mfo_driver_employee_id?: OdooRelation;
  loader_employee_id?: OdooRelation;
  loader_employee_ids?: number[];
  loader_ids?: number[];
  mfo_loader_employee_ids?: number[];
  mfo_loader_ids?: number[];
  member_employee_ids?: number[];
  member_ids?: number[];
  employee_ids?: number[];
};

export type FleetVehicleCrewAssignment = {
  teamId: number;
  teamName: string;
  operationType: string;
  driverNames: string[];
  loaderNames: string[];
  memberNames: string[];
};

export type FleetVehicleBoardItem = {
  id: number;
  plate: string;
  name: string;
  modelName: string;
  categoryName: string;
  vin: string;
  odometerLabel: string;
  fuelTypeLabel: string;
  fleetDriverName: string;
  stateLabel: string;
  latestRepairState: string;
  isOperational: boolean;
  isRepair: boolean;
  crewAssignments: FleetVehicleCrewAssignment[];
};

export type FleetVehicleBoard = {
  allVehicles: FleetVehicleBoardItem[];
  activeVehicles: FleetVehicleBoardItem[];
  repairVehicles: FleetVehicleBoardItem[];
  totalVehicles: number;
  activeCount: number;
  repairCount: number;
};

type StageBucket = "todo" | "progress" | "review" | "done" | "unknown";

const DEFAULT_CONNECTION: OdooConnection = {
  url: process.env.ODOO_URL ?? "http://localhost:8069",
  db: process.env.ODOO_DB ?? "odoo19_admin",
  login: process.env.ODOO_LOGIN ?? "admin",
  password: process.env.ODOO_PASSWORD ?? "admin",
};

type OdooAuthSession = {
  uid: number;
  connection: OdooConnection;
};

export function createOdooConnection(
  overrides: Partial<OdooConnection> = {},
): OdooConnection {
  return {
    ...DEFAULT_CONNECTION,
    ...overrides,
  };
}

function normalizeOdooBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function isLocalOdooHost(hostname: string) {
  return hostname === "127.0.0.1" || hostname === "localhost";
}

function buildOdooConnectionCandidates(connection: OdooConnection) {
  const candidateUrls: string[] = [normalizeOdooBaseUrl(connection.url)];
  const configuredFallbacks = (process.env.ODOO_FALLBACK_URLS ?? "")
    .split(",")
    .map((item) => normalizeOdooBaseUrl(item))
    .filter(Boolean);

  candidateUrls.push(...configuredFallbacks);

  try {
    const currentUrl = new URL(connection.url);
    if (isLocalOdooHost(currentUrl.hostname)) {
      for (const hostname of ["127.0.0.1", "localhost"]) {
        for (const port of ["8071", "8069"]) {
          candidateUrls.push(`${currentUrl.protocol}//${hostname}:${port}`);
        }
      }
    }
  } catch {
    // Invalid URL values will fail later when the JSON-RPC request runs.
  }

  return Array.from(new Set(candidateUrls)).map((url) => ({
    ...connection,
    url,
  }));
}

const DEPARTMENT_ORDER = CANONICAL_DEPARTMENT_NAMES;

const DEPARTMENT_LABELS: Record<string, string> = {
  "Санхүүгийн алба": "Санхүү, төлөвлөлт, тайлагнал",
  "Захиргааны алба": "Захиргаа, бичиг хэрэг, удирдлага",
  "Авто бааз, хог тээвэрлэлтийн хэлтэс": "Техник, маршрут, хог тээвэрлэлт",
  "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс":
    "Ногоон байгууламж, зам талбайн цэвэрлэгээ",
  "Тохижилтын хэлтэс": "Нийтийн талбай, засвар, тохижилт",
};

const DEPARTMENT_ACCENTS: Record<string, string> = {
  "Санхүүгийн алба": "var(--tone-blue)",
  "Захиргааны алба": "var(--tone-slate)",
  "Авто бааз, хог тээвэрлэлтийн хэлтэс": "var(--tone-amber)",
  "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс": "var(--tone-teal)",
  "Тохижилтын хэлтэс": "var(--tone-slate)",
};

const OPERATION_TYPE_LABELS: Record<string, string> = {
  garbage: "Хог цуглуулалт",
  street_cleaning: "Гудамж цэвэрлэгээ",
  green_maintenance: "Ногоон байгууламж",
};

const STAGE_LABELS: Record<StageBucket, string> = {
  todo: "Хийгдэх ажил",
  progress: "Явагдаж буй ажил",
  review: "Хянагдаж буй ажил",
  done: "Дууссан ажил",
  unknown: "Тодорхойгүй",
};

const TASK_STATUS_LABELS: Record<TaskStatusKey, string> = {
  planned: "Төлөвлөгдсөн",
  working: "Ажиллаж байна",
  review: "Хянагдаж байна",
  verified: "Баталгаажсан",
  problem: "Асуудалтай",
};

const UNKNOWN_DEPARTMENT = "Тодорхойгүй";
const AUTO_BASE_DEPARTMENT = "Авто бааз, хог тээвэрлэлтийн хэлтэс";
const AUTO_BASE_UNIT = "Авто бааз";
const WASTE_TRANSPORT_UNIT = "Хог тээвэрлэлт";

const KNOWN_STAGE_MATCHERS: Array<[StageBucket, string[]]> = [
  ["todo", ["хийгдэх", "todo", "task"]],
  ["progress", ["явагдаж", "хийгдэж", "хийж байна", "ажиллаж", "progress", "hiihdej", "in progress"]],
  ["review", ["шалгагдаж", "хянагдаж", "review", "changes requested", "shalgagdaj", "shalgah", "hyanagdaj"]],
  ["done", ["дууссан", "done", "completed", "duussan"]],
  ["todo", ["төлөвлөгдсөн", "хуваарилсан"]],
  ["progress", ["гүйцэтгэж"]],
  ["review", ["шалгаж"]],
];

function getStageBucket(stageName?: string | null): StageBucket {
  const normalized = (stageName ?? "").trim().toLowerCase();
  for (const [bucket, matchers] of KNOWN_STAGE_MATCHERS) {
    if (matchers.some((item) => normalized.includes(item))) {
      return bucket;
    }
  }
  return "unknown";
}

const TASK_FIELD_VARIANTS: string[][] = [
  [
    "name",
    "project_id",
    "stage_id",
    "ops_team_leader_id",
    "user_ids",
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
    "state",
    "mfo_is_operation_project",
    "mfo_operation_type",
    "mfo_route_id",
    "mfo_unresolved_stop_count",
    "mfo_missing_proof_stop_count",
    "mfo_route_deviation_stop_count",
    "mfo_skipped_without_reason_count",
    "mfo_weight_sync_warning",
    "mfo_quality_exception_count",
  ],
  [
    "name",
    "project_id",
    "stage_id",
    "ops_team_leader_id",
    "user_ids",
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
    "state",
    "mfo_is_operation_project",
    "mfo_operation_type",
    "mfo_route_id",
  ],
  [
    "name",
    "project_id",
    "stage_id",
    "ops_team_leader_id",
    "user_ids",
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
    "state",
  ],
  [
    "name",
    "project_id",
    "stage_id",
    "ops_team_leader_id",
    "user_ids",
    "ops_planned_quantity",
    "ops_completed_quantity",
    "ops_remaining_quantity",
    "ops_progress_percent",
    "ops_measurement_unit",
    "priority",
    "date_deadline",
    "mfo_shift_date",
    "state",
  ],
];

const REPORT_FIELD_VARIANTS: string[][] = [
  [
    "task_id",
    "reporter_id",
    "report_datetime",
    "report_summary",
    "reported_quantity",
    "task_measurement_unit_id",
    "task_measurement_unit_code",
    "image_count",
    "audio_count",
    "image_attachment_ids",
    "audio_attachment_ids",
  ],
  [
    "task_id",
    "reporter_id",
    "report_datetime",
    "report_summary",
    "reported_quantity",
    "task_measurement_unit_id",
    "task_measurement_unit_code",
    "image_count",
    "audio_count",
  ],
  [
    "task_id",
    "reporter_id",
    "report_datetime",
    "report_summary",
    "reported_quantity",
    "task_measurement_unit_id",
    "task_measurement_unit_code",
  ],
  ["task_id", "reporter_id", "report_datetime", "report_summary", "reported_quantity"],
];

const HR_EMPLOYEE_FIELD_VARIANTS: string[][] = [
  [
    "name",
    "active",
    "department_id",
    "job_id",
    "job_title",
    "work_phone",
    "mobile_phone",
    "work_email",
    "user_id",
    "parent_id",
    "contract_date_start",
    "contract_date_end",
    "sex",
    "certificate",
    "image_128",
    "x_mn_employee_code",
    "x_mn_grade_rank",
    "x_mn_employment_status",
    "x_mn_missing_document_count",
    "x_mn_performance_score",
    "x_mn_task_completion_percent",
    "x_mn_discipline_score",
  ],
  [
    "name",
    "active",
    "department_id",
    "job_id",
    "job_title",
    "work_phone",
    "mobile_phone",
    "work_email",
    "user_id",
    "image_128",
  ],
  [
    "name",
    "active",
    "department_id",
    "job_id",
    "job_title",
    "work_phone",
    "mobile_phone",
    "work_email",
    "user_id",
    "avatar_128",
  ],
  [
    "name",
    "active",
    "department_id",
    "job_id",
    "job_title",
    "work_phone",
    "mobile_phone",
    "work_email",
    "user_id",
    "image_1920",
  ],
  ["name", "active", "department_id", "job_id", "work_phone", "mobile_phone", "work_email", "user_id"],
  ["name", "active", "department_id", "job_title", "work_phone", "mobile_phone", "work_email", "user_id"],
  ["name", "active", "department_id", "work_phone", "mobile_phone", "work_email", "user_id"],
  ["name", "active", "department_id"],
];

const FLEET_VEHICLE_FIELD_VARIANTS: string[][] = [
  [
    "name",
    "license_plate",
    "model_id",
    "category_id",
    "vin_sn",
    "odometer",
    "fuel_type",
    "driver_id",
    "state_id",
    "mfo_active_for_ops",
    "latest_repair_state",
    "vehicle_downtime_open",
    "active",
  ],
  [
    "name",
    "license_plate",
    "model_id",
    "vin_sn",
    "odometer",
    "fuel_type",
    "driver_id",
    "state_id",
    "mfo_active_for_ops",
    "latest_repair_state",
    "vehicle_downtime_open",
    "active",
  ],
  ["name", "license_plate", "state_id", "mfo_active_for_ops", "active"],
  ["name", "license_plate", "state_id", "active"],
  ["name", "license_plate", "active"],
];

const CREW_TEAM_FIELD_VARIANTS: string[][] = [
  [
    "name",
    "active",
    "operation_type",
    "vehicle_id",
    "driver_employee_id",
    "loader_employee_ids",
    "member_employee_ids",
  ],
  [
    "name",
    "active",
    "operation_type",
    "vehicle_id",
    "driver_employee_id",
    "loader_ids",
    "member_ids",
  ],
  [
    "name",
    "active",
    "operation_type",
    "vehicle_id",
    "mfo_driver_employee_id",
    "mfo_loader_employee_ids",
    "member_employee_ids",
  ],
  [
    "name",
    "active",
    "operation_type",
    "vehicle_id",
    "mfo_driver_employee_id",
    "mfo_loader_ids",
    "member_ids",
  ],
  [
    "name",
    "active",
    "operation_type",
    "vehicle_id",
    "driver_employee_id",
    "loader_employee_ids",
    "employee_ids",
  ],
  [
    "name",
    "active",
    "operation_type",
    "vehicle_id",
    "driver_employee_id",
    "loader_ids",
    "employee_ids",
  ],
  [
    "name",
    "active",
    "operation_type",
    "vehicle_id",
    "driver_employee_id",
    "loader_employee_id",
    "member_employee_ids",
  ],
  ["name", "active", "operation_type", "vehicle_id", "driver_employee_id", "loader_employee_ids"],
  ["name", "active", "operation_type", "vehicle_id", "driver_employee_id", "loader_ids"],
  ["name", "active", "operation_type", "vehicle_id", "driver_employee_id", "employee_ids"],
  ["name", "active", "vehicle_id", "driver_employee_id", "employee_ids"],
  ["name", "vehicle_id", "driver_employee_id"],
  ["name", "vehicle_id"],
];

function relationName(relation: OdooRelation, fallback = "Оноогоогүй") {
  return Array.isArray(relation) ? relation[1] : fallback;
}

function relationId(relation: OdooRelation) {
  return Array.isArray(relation) ? relation[0] : null;
}

function resolveHrEmploymentStatus(employee: OdooEmployeeRecord) {
  if (employee.active === false) {
    return { key: "archived", label: "Архивласан" };
  }

  const status = employee.x_mn_employment_status || "active";
  const labels: Record<string, string> = {
    active: "Идэвхтэй",
    probation: "Туршилт",
    suspended: "Түдгэлзсэн",
    terminated: "Чөлөөлөгдсөн",
    rehired: "Дахин авсан",
  };

  return {
    key: status,
    label: labels[status] ?? "Идэвхтэй",
  };
}

function resolveHrGenderLabel(value?: string | false) {
  const labels: Record<string, string> = {
    male: "Эрэгтэй",
    female: "Эмэгтэй",
    other: "Бусад",
  };
  return value ? (labels[value] ?? value) : "";
}

function normalizeFleetStatusValue(value?: string | false) {
  return (typeof value === "string" ? value : "").trim().toLowerCase();
}

function isRepairStatusLabel(value?: string | false) {
  const normalized = normalizeFleetStatusValue(value);
  if (!normalized) {
    return false;
  }

  const resolvedTokens = [
    "done",
    "completed",
    "fixed",
    "cancel",
    "цуцлагдсан",
    "дууссан",
    "баталгаажсан",
  ];
  if (resolvedTokens.some((token) => normalized.includes(token))) {
    return false;
  }

  return [
    "засагдаж",
    "засварт",
    "repair",
    "waiting repair",
    "parts received",
    "approval",
  ].some((token) => normalized.includes(token));
}

function formatCompactDate(value?: string | false) {
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

function formatSyncDate(value: Date) {
  return new Intl.DateTimeFormat("mn-MN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatQuantity(value: number, unit: string) {
  return `${Math.round(value * 10) / 10} ${unit}`.trim();
}

const STANDARD_UNIT_LABELS: Record<string, string> = {
  pcs: "Ширхэг",
  kg: "Кг",
  tn: "Тн",
  m: "Метр",
  km: "Км",
  m2: "М²",
  m3: "М³",
  liter: "Литр",
  times: "Удаа",
  point: "Цэг",
  vehicle: "Машин",
  tree: "Мод",
};

const UNIT_CODE_ALIASES: Record<string, string> = {
  "ширхэг": "pcs",
  "ш": "pcs",
  pcs: "pcs",
  piece: "pcs",
  pieces: "pcs",
  "кг": "kg",
  kg: "kg",
  kilogram: "kg",
  "тн": "tn",
  tn: "tn",
  ton: "tn",
  "метр": "m",
  "м": "m",
  m: "m",
  "км": "km",
  km: "km",
  "м2": "m2",
  "м²": "m2",
  sqm: "m2",
  "м3": "m3",
  "м³": "m3",
  "мкуб": "m3",
  m3: "m3",
  "литр": "liter",
  "л": "liter",
  liter: "liter",
  "удаа": "times",
  "рейс": "times",
  times: "times",
  "цэг": "point",
  point: "point",
  "машин": "vehicle",
  vehicle: "vehicle",
  "мод": "tree",
  tree: "tree",
};

function normalizeUnitValue(value?: string | false) {
  const rawValue = typeof value === "string" ? value : "";
  return rawValue
    .trim()
    .toLowerCase()
    .replace(/[.\s_-]+/g, "")
    .replace("²", "2")
    .replace("³", "3");
}

function resolveUnitCodeFromText(value?: string | false) {
  if (!value) {
    return "";
  }

  const normalized = normalizeUnitValue(value);
  return UNIT_CODE_ALIASES[normalized] ?? normalized;
}

function resolveUnitLabel(
  relation?: OdooRelation,
  code?: string | false,
  legacyValue?: string | false,
  fallback = "нэгж",
) {
  if (Array.isArray(relation)) {
    return relation[1];
  }

  if (code && STANDARD_UNIT_LABELS[code]) {
    return STANDARD_UNIT_LABELS[code];
  }

  const rawLegacyValue = typeof legacyValue === "string" ? legacyValue.trim() : "";
  if (rawLegacyValue) {
    return rawLegacyValue;
  }

  return fallback;
}

function resolveTaskMeasurementUnit(task: OdooTaskRecord, fallback = "нэгж") {
  return resolveUnitLabel(
    task.ops_measurement_unit_id,
    task.ops_measurement_unit_code,
    task.ops_measurement_unit,
    fallback,
  );
}

function resolveTaskMeasurementCode(task: OdooTaskRecord) {
  return task.ops_measurement_unit_code || resolveUnitCodeFromText(task.ops_measurement_unit);
}

function buildQuantityMetricSummary(tasks: OdooTaskRecord[]) {
  const totals = new Map<string, { label: string; value: number }>();

  for (const task of tasks) {
    const quantity = task.ops_completed_quantity ?? 0;
    if (quantity <= 0) {
      continue;
    }

    const code = resolveTaskMeasurementCode(task) || "other";
    const label = resolveTaskMeasurementUnit(task);
    const current = totals.get(code) ?? { label, value: 0 };
    current.value += quantity;
    totals.set(code, current);
  }

  const orderedTotals = Array.from(totals.values())
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);

  if (!orderedTotals.length) {
    return "0";
  }

  const visible = orderedTotals.slice(0, 3).map((item) => formatQuantity(item.value, item.label));
  if (orderedTotals.length <= 3) {
    return visible.join(", ");
  }

  return `${visible.join(", ")} +${orderedTotals.length - 3}`;
}

function inferDepartmentUnitFromText(text: string) {
  const haystack = text.toLowerCase();
  if (!haystack.trim()) {
    return UNKNOWN_DEPARTMENT;
  }

  if (haystack.includes("хог") || haystack.includes("маршрут") || haystack.includes("ачилт")) {
    return WASTE_TRANSPORT_UNIT;
  }
  if (haystack.includes("авто") || haystack.includes("машин") || haystack.includes("техник")) {
    return AUTO_BASE_UNIT;
  }

  const canonicalName = normalizeOrganizationUnitName(text);
  if (canonicalName) {
    return canonicalName;
  }

  if (haystack.includes("мод") || haystack.includes("ногоон") || haystack.includes("зүлэг")) {
    return "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс";
  }
  if (
    haystack.includes("зам") ||
    haystack.includes("талбай") ||
    haystack.includes("цэвэрлэгээ") ||
    haystack.includes("гудамж")
  ) {
    return "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс";
  }
  if (haystack.includes("тохижилт") || haystack.includes("засвар")) {
    return "Тохижилтын хэлтэс";
  }
  return UNKNOWN_DEPARTMENT;
}

function departmentUnitFromOperationType(operationType?: string | false) {
  if (operationType === "garbage") {
    return WASTE_TRANSPORT_UNIT;
  }
  if (operationType === "street_cleaning") {
    return "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс";
  }
  if (operationType === "green_maintenance") {
    return "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс";
  }
  return null;
}

function exactAutoBaseUnitFromDepartmentName(departmentName: string) {
  const normalized = departmentName.trim().toLowerCase().replace(/\s+/g, " ");

  if (normalized === AUTO_BASE_UNIT.toLowerCase()) {
    return AUTO_BASE_UNIT;
  }
  if (
    normalized === WASTE_TRANSPORT_UNIT.toLowerCase() ||
    normalized === "хог тээвэрлэлтийн хэлтэс"
  ) {
    return WASTE_TRANSPORT_UNIT;
  }

  return null;
}

function normalizeDepartmentUnitName(
  departmentName?: string | null,
  options: {
    operationType?: string | false;
    labelText?: string | null;
  } = {},
) {
  const normalizedDepartment = (departmentName ?? "").trim();
  const inferredFromOperation = departmentUnitFromOperationType(options.operationType);
  const inferredFromDepartment = exactAutoBaseUnitFromDepartmentName(normalizedDepartment);
  const inferredFromText = inferDepartmentUnitFromText(options.labelText ?? "");
  const knownInferredFromText =
    inferredFromText !== UNKNOWN_DEPARTMENT ? inferredFromText : null;

  if (!normalizedDepartment) {
    return inferredFromOperation || knownInferredFromText || UNKNOWN_DEPARTMENT;
  }

  const canonicalDepartment = normalizeOrganizationUnitName(normalizedDepartment);
  if (canonicalDepartment === AUTO_BASE_DEPARTMENT) {
    return (
      inferredFromOperation ||
      knownInferredFromText ||
      inferredFromDepartment ||
      canonicalDepartment
    );
  }

  if (canonicalDepartment) {
    return canonicalDepartment;
  }

  return inferredFromOperation || knownInferredFromText || normalizedDepartment;
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

function resolveTaskDepartmentName(
  task: Pick<OdooTaskRecord, "name" | "project_id" | "ops_department_id">,
  projectDepartmentById: Map<number, string>,
) {
  return resolveNormalizedTaskDepartmentName(
    task as Pick<OdooTaskRecord, "name" | "project_id" | "ops_department_id" | "mfo_operation_type">,
    projectDepartmentById,
  );
}

function operationTypeLabel(operationType?: string | false) {
  if (!operationType) {
    return "Ерөнхий ажил";
  }
  return OPERATION_TYPE_LABELS[operationType] ?? operationType;
}

function resolveNormalizedProjectDepartmentName(
  project: Pick<OdooProjectRecord, "name" | "ops_department_id">,
  fallback = UNKNOWN_DEPARTMENT,
) {
  return normalizeDepartmentUnitName(relationName(project.ops_department_id, fallback), {
    labelText: project.name,
  });
}

function resolveNormalizedTaskDepartmentName(
  task: Pick<OdooTaskRecord, "name" | "project_id" | "ops_department_id" | "mfo_operation_type">,
  projectDepartmentById: Map<number, string>,
) {
  const directDepartmentName = relationName(task.ops_department_id ?? false, "").trim();
  if (directDepartmentName) {
    return normalizeDepartmentUnitName(directDepartmentName, {
      operationType: task.mfo_operation_type,
      labelText: `${task.name} ${relationName(task.project_id, "")}`,
    });
  }

  const inferredFromOperation = departmentUnitFromOperationType(task.mfo_operation_type);
  if (inferredFromOperation) {
    return inferredFromOperation;
  }

  const inferredFromText = inferDepartmentUnitFromText(
    `${task.name} ${relationName(task.project_id, "")}`,
  );
  if (inferredFromText !== UNKNOWN_DEPARTMENT) {
    return inferredFromText;
  }

  const projectId = Array.isArray(task.project_id) ? task.project_id[0] : null;
  if (projectId && projectDepartmentById.get(projectId)) {
    return normalizeDepartmentUnitName(projectDepartmentById.get(projectId) as string, {
      operationType: task.mfo_operation_type,
      labelText: `${task.name} ${relationName(task.project_id, "")}`,
    });
  }

  return UNKNOWN_DEPARTMENT;
}

function getTaskStatusKey(task: Pick<OdooTaskRecord, "stage_id" | "mfo_quality_exception_count" | "mfo_weight_sync_warning">): TaskStatusKey {
  if ((task.mfo_quality_exception_count ?? 0) > 0 || task.mfo_weight_sync_warning) {
    return "problem";
  }

  switch (getStageBucket(relationName(task.stage_id, ""))) {
    case "progress":
      return "working";
    case "review":
      return "review";
    case "done":
      return "verified";
    case "todo":
    case "unknown":
    default:
      return "planned";
  }
}

function getTaskStatusLabel(statusKey: TaskStatusKey) {
  return TASK_STATUS_LABELS[statusKey];
}

function imageDataUrl(value?: string | false) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("data:") ? trimmed : `data:image/png;base64,${trimmed}`;
}

function resolveDepartmentLabel(name: string) {
  return DEPARTMENT_LABELS[name as keyof typeof DEPARTMENT_LABELS] ?? "Ажлын харьяалал";
}

function resolveDepartmentAccent(name: string) {
  return DEPARTMENT_ACCENTS[name as keyof typeof DEPARTMENT_ACCENTS] ?? "var(--tone-slate)";
}

function resolveDepartmentIcon(name: string) {
  const departmentGroup = findDepartmentGroupByName(name);
  if (departmentGroup) {
    return departmentGroup.icon;
  }

  const normalized = name.trim().toLowerCase();

  if (normalized.includes("санхүү")) {
    return "₮";
  }

  if (normalized.includes("захиргаа") || normalized.includes("удирдлага")) {
    return "🏢";
  }

  if (normalized.includes("авто") || normalized.includes("машин") || normalized.includes("техник")) {
    return "🚚";
  }

  if (normalized.includes("хог") || normalized.includes("ачилт") || normalized.includes("маршрут")) {
    return "♻️";
  }

  if (normalized.includes("ногоон") || normalized.includes("мод") || normalized.includes("зүлэг")) {
    return "🌿";
  }

  if (normalized.includes("зам") || normalized.includes("цэвэрлэгээ") || normalized.includes("гудамж")) {
    return "🧹";
  }

  if (normalized.includes("тохижилт") || normalized.includes("үйлчилгээ") || normalized.includes("засвар")) {
    return "🏙️";
  }

  return "🏢";
}

function buildTaskHref(taskId: number, returnTo = "/tasks") {
  return `/tasks/${taskId}?returnTo=${encodeURIComponent(returnTo)}`;
}

async function jsonRpc<T>(
  service: "common" | "object",
  method: string,
  args: unknown[],
  connection: OdooConnection,
) {
  const response = await fetch(`${connection.url}/jsonrpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        service,
        method,
        args,
      },
      id: `${service}-${method}-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Odoo JSON-RPC хүсэлт HTTP ${response.status} алдаатай дууслаа.`);
  }

  const payload = (await response.json()) as {
    result?: T;
    error?: {
      message?: string;
      data?: {
        message?: string;
        debug?: string;
      };
    };
  };
  if (payload.error) {
    throw new Error(
      payload.error.data?.message ??
        payload.error.message ??
        "Odoo JSON-RPC алдаа тодорхойгүй байна.",
    );
  }

  return payload.result as T;
}

async function authenticate(connection: OdooConnection) {
  return jsonRpc<number | false>(
    "common",
    "authenticate",
    [connection.db, connection.login, connection.password, {}],
    connection,
  );
}

async function authenticateWithFallback(
  connection: OdooConnection,
): Promise<OdooAuthSession | null> {
  let lastError: unknown = null;

  for (const candidate of buildOdooConnectionCandidates(connection)) {
    try {
      const uid = await authenticate(candidate);
      if (uid) {
        return {
          uid,
          connection: candidate,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

export async function authenticateOdooUser(
  login: string,
  password: string,
): Promise<AuthenticatedOdooUser | null> {
  const auth = await authenticateWithFallback(createOdooConnection({ login, password }));
  if (!auth) {
    return null;
  }
  const { uid, connection } = auth;

  const users = await executeKw<OdooUserRecord[]>(
    uid,
    "res.users",
    "search_read",
    [[["id", "=", uid]]],
    {
      fields: ["name", "login", "ops_user_type"],
      limit: 1,
    },
    connection,
  );

  const user = users[0];
  if (!user) {
    return null;
  }

  const [
    mfoManager,
    mfoDispatcher,
    mfoInspector,
    mfoMobile,
  ] = await Promise.all([
    executeKw<boolean>(
      uid,
      "res.users",
      "has_group",
      [[uid], "municipal_field_ops.group_mfo_manager"],
      {},
      connection,
    ),
    executeKw<boolean>(
      uid,
      "res.users",
      "has_group",
      [[uid], "municipal_field_ops.group_mfo_dispatcher"],
      {},
      connection,
    ),
    executeKw<boolean>(
      uid,
      "res.users",
      "has_group",
      [[uid], "municipal_field_ops.group_mfo_inspector"],
      {},
      connection,
    ),
    executeKw<boolean>(
      uid,
      "res.users",
      "has_group",
      [[uid], "municipal_field_ops.group_mfo_mobile_user"],
      {},
      connection,
    ),
  ]);

  return {
    uid,
    user: {
      name: user.name,
      login: user.login,
      role: user.ops_user_type || "worker",
      groupFlags: {
        mfoManager,
        mfoDispatcher,
        mfoInspector,
        mfoMobile,
      },
    },
  };
}

async function executeKw<T>(
  uid: number,
  model: string,
  method: string,
  methodArgs: unknown[],
  kwargs: Record<string, unknown>,
  connection: OdooConnection,
) {
  if (method === "search_read") {
    const [domain = [], positionalFields] = methodArgs as [unknown?, unknown?];
    const fields =
      Array.isArray(positionalFields)
        ? positionalFields
        : Array.isArray(kwargs.fields)
          ? kwargs.fields
          : [];

    const searchKw: Record<string, unknown> = {};
    const readKw: Record<string, unknown> = {};

    for (const key of ["offset", "limit", "order", "context"]) {
      if (kwargs[key] !== undefined) {
        searchKw[key] = kwargs[key];
      }
    }

    for (const key of ["load", "context"]) {
      if (kwargs[key] !== undefined) {
        readKw[key] = kwargs[key];
      }
    }

    if (fields.length) {
      readKw.fields = fields;
    }

    const ids = await jsonRpc<number[]>(
      "object",
      "execute_kw",
      [connection.db, uid, connection.password, model, "search", [domain], searchKw],
      connection,
    );

    if (!ids.length) {
      return [] as T;
    }

    return jsonRpc<T>(
      "object",
      "execute_kw",
      [connection.db, uid, connection.password, model, "read", [ids], readKw],
      connection,
    );
  }

  return jsonRpc<T>(
    "object",
    "execute_kw",
    [connection.db, uid, connection.password, model, method, methodArgs, kwargs],
    connection,
  );
}

async function searchReadAll<T>(
  uid: number,
  model: string,
  domain: unknown[],
  kwargs: Record<string, unknown>,
  connection: OdooConnection,
  batchSize = 400,
) {
  const records: T[] = [];
  let offset = 0;

  while (true) {
    const batch = await executeKw<T[]>(
      uid,
      model,
      "search_read",
      [domain],
      {
        ...kwargs,
        limit: batchSize,
        offset,
      },
      connection,
    );

    records.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    offset += batch.length;
  }

  return records;
}

async function searchReadAllWithFieldFallback<T>(
  uid: number,
  model: string,
  domain: unknown[],
  fieldVariants: string[][],
  kwargs: Record<string, unknown>,
  connection: OdooConnection,
  batchSize = 400,
) {
  let lastError: unknown = null;

  for (const fields of fieldVariants) {
    try {
      return await searchReadAll<T>(
        uid,
        model,
        domain,
        {
          ...kwargs,
          fields,
        },
        connection,
        batchSize,
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${model} өгөгдөл уншихад алдаа гарлаа.`);
}

export async function loadHrEmployeeDirectory(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<HrEmployeeDirectoryItem[]> {
  const auth = await authenticateWithFallback(createOdooConnection(connectionOverrides));
  if (!auth) {
    throw new Error("Odoo authentication failed");
  }
  const { uid, connection } = auth;

  const employees = await searchReadAllWithFieldFallback<OdooEmployeeRecord>(
    uid,
    "hr.employee",
    [],
    HR_EMPLOYEE_FIELD_VARIANTS,
    {
      order: "name asc",
      context: {
        active_test: false,
      },
    },
    connection,
  );

  return employees
    .map((employee) => {
      const status = resolveHrEmploymentStatus(employee);

      return {
        id: employee.id,
        name: employee.name,
        active: employee.active !== false,
        departmentName: normalizeDepartmentUnitName(
          relationName(employee.department_id ?? false, UNKNOWN_DEPARTMENT),
        ),
        jobTitle:
          relationName(employee.job_id ?? false, "") ||
          employee.job_title ||
          "Албан тушаал бүртгээгүй",
        workPhone: employee.work_phone || "",
        mobilePhone: employee.mobile_phone || "",
        workEmail: employee.work_email || "",
        userName: relationName(employee.user_id ?? false, ""),
        photoUrl: imageDataUrl(employee.image_128 || employee.avatar_128 || employee.image_1920),
        employeeCode: employee.x_mn_employee_code || `EMP-${String(employee.id).padStart(5, "0")}`,
        gradeRank: employee.x_mn_grade_rank || "",
        statusKey: status.key,
        statusLabel: status.label,
        managerName: relationName(employee.parent_id ?? false, ""),
        startDate: employee.contract_date_start || "",
        contractEndDate: employee.contract_date_end || "",
        genderLabel: resolveHrGenderLabel(employee.sex),
        educationLevel: employee.certificate || "",
        missingDocumentCount: employee.x_mn_missing_document_count ?? 0,
        kpiScore: employee.x_mn_performance_score ?? 0,
        taskCompletionPercent: employee.x_mn_task_completion_percent ?? 0,
        disciplineScore: employee.x_mn_discipline_score ?? 0,
      };
    })
    .sort((left, right) => {
      const departmentOrder = left.departmentName.localeCompare(right.departmentName, "mn");
      if (departmentOrder !== 0) {
        return departmentOrder;
      }
      return left.name.localeCompare(right.name, "mn");
    });
}

function resolveFleetFuelTypeLabel(value: string) {
  const labels: Record<string, string> = {
    gasoline: "Бензин",
    diesel: "Дизель",
    electric: "Цахилгаан",
    hybrid: "Хосолсон",
    lpg: "Газ",
  };
  return labels[value] ?? value;
}

function uniqueValues(values: Array<number | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is number => Boolean(value))));
}

async function loadEmployeeNameMap(
  uid: number,
  employeeIds: number[],
  connection: OdooConnection,
) {
  if (!employeeIds.length) {
    return new Map<number, string>();
  }

  const employees = await executeKw<Array<{ id: number; name: string }>>(
    uid,
    "hr.employee",
    "search_read",
    [[["id", "in", employeeIds]]],
    {
      fields: ["name"],
      limit: employeeIds.length,
    },
    connection,
  );

  return new Map(employees.map((employee) => [employee.id, employee.name]));
}

function namesFromIds(ids: number[] | undefined, employeeNames: Map<number, string>) {
  return (ids ?? [])
    .map((id) => employeeNames.get(id))
    .filter((name): name is string => Boolean(name));
}

async function loadCrewAssignmentsByVehicle(uid: number, connection: OdooConnection) {
  try {
    const crewTeams = await searchReadAllWithFieldFallback<OdooCrewTeamRecord>(
      uid,
      "mfo.crew.team",
      [["vehicle_id", "!=", false]],
      CREW_TEAM_FIELD_VARIANTS,
      {
        order: "name asc",
      },
      connection,
    );

    const assignedCrewTeams = crewTeams.filter((team) => team.active !== false);
    const employeeIds = uniqueValues(
      assignedCrewTeams.flatMap((team) => [
        relationId(team.driver_employee_id ?? false),
        relationId(team.mfo_driver_employee_id ?? false),
        relationId(team.loader_employee_id ?? false),
        ...(team.loader_employee_ids ?? []),
        ...(team.loader_ids ?? []),
        ...(team.mfo_loader_employee_ids ?? []),
        ...(team.mfo_loader_ids ?? []),
        ...(team.member_employee_ids ?? []),
        ...(team.member_ids ?? []),
        ...(team.employee_ids ?? []),
      ]),
    );
    const employeeNames = await loadEmployeeNameMap(uid, employeeIds, connection);
    const byVehicle = new Map<number, FleetVehicleCrewAssignment[]>();

    for (const team of assignedCrewTeams) {
      const vehicleId = relationId(team.vehicle_id ?? false);
      if (!vehicleId) {
        continue;
      }

      const driverRelation = team.driver_employee_id || team.mfo_driver_employee_id || false;
      const driverId = relationId(driverRelation);
      const driverName = relationName(driverRelation, "");
      const driverNames = driverName ? [driverName] : driverId ? namesFromIds([driverId], employeeNames) : [];
      const loaderIds = uniqueValues([
        relationId(team.loader_employee_id ?? false),
        ...(team.loader_employee_ids ?? []),
        ...(team.loader_ids ?? []),
        ...(team.mfo_loader_employee_ids ?? []),
        ...(team.mfo_loader_ids ?? []),
      ]);
      const memberIds = uniqueValues([
        ...(team.member_employee_ids ?? []),
        ...(team.member_ids ?? []),
        ...(team.employee_ids ?? []),
      ]);
      const loaderNames = namesFromIds(loaderIds, employeeNames);
      const memberNames = namesFromIds(memberIds, employeeNames).filter(
        (name) => !driverNames.includes(name) && !loaderNames.includes(name),
      );
      const assignment: FleetVehicleCrewAssignment = {
        teamId: team.id,
        teamName: team.name || `Баг #${team.id}`,
        operationType: team.operation_type || "",
        driverNames,
        loaderNames,
        memberNames,
      };

      const current = byVehicle.get(vehicleId) ?? [];
      current.push(assignment);
      byVehicle.set(vehicleId, current);
    }

    return byVehicle;
  } catch (error) {
    console.warn("Fleet crew assignments could not be loaded:", error);
    return new Map<number, FleetVehicleCrewAssignment[]>();
  }
}

export async function loadFleetVehicleBoard(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<FleetVehicleBoard> {
  const auth = await authenticateWithFallback(createOdooConnection(connectionOverrides));
  if (!auth) {
    throw new Error("Odoo authentication failed");
  }
  const { uid, connection } = auth;

  const vehicles = await searchReadAllWithFieldFallback<OdooFleetVehicleRecord>(
    uid,
    "fleet.vehicle",
    [["active", "=", true]],
    FLEET_VEHICLE_FIELD_VARIANTS,
    {
      order: "license_plate asc, name asc",
    },
    connection,
  );

  const crewAssignmentsByVehicle = await loadCrewAssignmentsByVehicle(uid, connection);

  const allVehicles = vehicles
    .map((vehicle) => {
      const stateLabel = relationName(vehicle.state_id ?? false, "");
      const latestRepairState = vehicle.latest_repair_state || "";
      const isRepair =
        Boolean(vehicle.vehicle_downtime_open) ||
        isRepairStatusLabel(stateLabel) ||
        isRepairStatusLabel(latestRepairState);
      const isOperational = Boolean(vehicle.mfo_active_for_ops);

      return {
        id: vehicle.id,
        plate: vehicle.license_plate || vehicle.name || `Машин #${vehicle.id}`,
        name: vehicle.name || vehicle.license_plate || `Машин #${vehicle.id}`,
        modelName: relationName(vehicle.model_id ?? false, ""),
        categoryName: relationName(vehicle.category_id ?? false, ""),
        vin: vehicle.vin_sn || "",
        odometerLabel:
          typeof vehicle.odometer === "number" && Number.isFinite(vehicle.odometer)
            ? `${Math.round(vehicle.odometer).toLocaleString("mn-MN")} км`
            : "",
        fuelTypeLabel: resolveFleetFuelTypeLabel(vehicle.fuel_type || ""),
        fleetDriverName: relationName(vehicle.driver_id ?? false, ""),
        stateLabel:
          stateLabel ||
          (isRepair ? "Засагдаж буй машин" : isOperational ? "Идэвхтэй машин" : "Бүртгэлтэй машин"),
        latestRepairState,
        isOperational,
        isRepair,
        crewAssignments: crewAssignmentsByVehicle.get(vehicle.id) ?? [],
      } satisfies FleetVehicleBoardItem;
    })
    .sort((left, right) => left.plate.localeCompare(right.plate, "mn"));

  const activeVehicles = allVehicles.filter((vehicle) => vehicle.isOperational && !vehicle.isRepair);
  const repairVehicles = allVehicles.filter((vehicle) => vehicle.isRepair);

  return {
    allVehicles,
    activeVehicles,
    repairVehicles,
    totalVehicles: allVehicles.length,
    activeCount: activeVehicles.length,
    repairCount: repairVehicles.length,
  };
}

export async function executeOdooKw<T>(
  model: string,
  method: string,
  methodArgs: unknown[],
  kwargs: Record<string, unknown> = {},
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const auth = await authenticateWithFallback(createOdooConnection(connectionOverrides));
  if (!auth) {
    throw new Error("Odoo authentication failed");
  }
  const { uid, connection } = auth;

  return executeKw<T>(uid, model, method, methodArgs, kwargs, connection);
}

export async function fetchOdooAttachmentContent(
  attachmentId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const attemptRead = async (connection: OdooConnection) => {
    const auth = await authenticateWithFallback(connection);
    if (!auth) {
      throw new Error("Odoo authentication failed");
    }
    const { uid, connection: resolvedConnection } = auth;

    const attachments = await executeKw<OdooAttachmentBinaryRecord[]>(
      uid,
      "ir.attachment",
      "search_read",
      [[["id", "=", attachmentId]]],
      {
        fields: ["name", "mimetype", "datas"],
        limit: 1,
      },
      resolvedConnection,
    );

    const attachment = attachments[0];
    if (!attachment?.datas) {
      return null;
    }

    return {
      id: attachment.id,
      name: attachment.name || `attachment-${attachment.id}`,
      mimetype: attachment.mimetype || "application/octet-stream",
      datas: attachment.datas,
    };
  };

  const primaryConnection = createOdooConnection(connectionOverrides);
  const primaryResult = await attemptRead(primaryConnection);
  if (primaryResult) {
    return primaryResult;
  }

  const fallbackConnection = createOdooConnection();
  const sameCredentials =
    fallbackConnection.login === primaryConnection.login &&
    fallbackConnection.password === primaryConnection.password &&
    fallbackConnection.db === primaryConnection.db &&
    fallbackConnection.url === primaryConnection.url;

  if (sameCredentials) {
    return null;
  }

  return attemptRead(fallbackConnection);
}

async function fetchLiveSnapshot(connection: OdooConnection): Promise<DashboardSnapshot> {
  const auth = await authenticateWithFallback(connection);
  if (!auth) {
    throw new Error("Odoo authentication failed");
  }
  const { uid, connection: resolvedConnection } = auth;

  const [projects, tasks] = await Promise.all([
    searchReadAll<OdooProjectRecord>(
      uid,
      "project.project",
      [],
      {
        fields: ["name", "user_id", "ops_department_id", "date_start", "date"],
        order: "create_date desc",
      },
      resolvedConnection,
    ),
    searchReadAllWithFieldFallback<OdooTaskRecord>(
      uid,
      "project.task",
      [["project_id", "!=", false]],
      TASK_FIELD_VARIANTS,
      {
        order: "priority desc, date_deadline asc, create_date desc",
      },
      resolvedConnection,
    ),
  ]);

  const reports = await searchReadAllWithFieldFallback<OdooReportRecord>(
    uid,
    "ops.task.report",
    [],
    REPORT_FIELD_VARIANTS,
    {
      order: "report_datetime desc",
    },
    resolvedConnection,
    200,
  ).catch((error) => {
    console.warn("ops.task.report өгөгдөл уншихад алдаа гарлаа:", error);
    return [] as OdooReportRecord[];
  });

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((task) => getStageBucket(relationName(task.stage_id, "")) === "done");
  const reviewTasks = tasks.filter((task) => getStageBucket(relationName(task.stage_id, "")) === "review");
  const activeTasks = tasks.filter((task) => {
    const bucket = getStageBucket(relationName(task.stage_id, ""));
    return bucket === "todo" || bucket === "progress";
  });
  const overdueTasks = tasks.filter((task) => {
    if (!task.date_deadline) {
      return false;
    }
    const bucket = getStageBucket(relationName(task.stage_id, ""));
    if (bucket === "done") {
      return false;
    }
    return new Date(task.date_deadline).getTime() < Date.now();
  });

  const projectDepartmentById = new Map(
    projects.map((project) => [
      project.id,
      Array.isArray(project.ops_department_id)
        ? resolveNormalizedProjectDepartmentName(project)
        : inferDepartmentUnitFromText(project.name),
    ]),
  );

  const orderedDepartmentNames = Array.from(new Set(DEPARTMENT_ORDER));

  const departmentSourceNames =
    orderedDepartmentNames.length > 0
      ? orderedDepartmentNames
      : tasks.length || projects.length
        ? [UNKNOWN_DEPARTMENT]
        : [];
  const matchesDepartmentBucket = (bucketName: string, itemDepartmentName: string) => {
    const bucketGroup = findDepartmentGroupByName(bucketName);

    return bucketGroup
      ? matchesDepartmentGroup(bucketGroup, itemDepartmentName)
      : itemDepartmentName === bucketName;
  };

  const departments = departmentSourceNames.map((department) => {
    const departmentTasks = tasks.filter((task) => {
      const departmentName = resolveNormalizedTaskDepartmentName(task, projectDepartmentById);
      return matchesDepartmentBucket(department, departmentName);
    });
    const departmentDone = departmentTasks.filter(
      (task) => getStageBucket(relationName(task.stage_id, "")) === "done",
    );
    const departmentReview = departmentTasks.filter(
      (task) => getStageBucket(relationName(task.stage_id, "")) === "review",
    );

    return {
      name: department,
      label: resolveDepartmentLabel(department),
      icon: resolveDepartmentIcon(department),
      accent: resolveDepartmentAccent(department),
      openTasks: departmentTasks.length - departmentDone.length,
      reviewTasks: departmentReview.length,
      completion: departmentTasks.length
        ? Math.round((departmentDone.length / departmentTasks.length) * 100)
        : 0,
    };
  });

  const projectsWithStats = projects.map((project) => {
    const projectTasks = tasks.filter(
      (task) => Array.isArray(task.project_id) && task.project_id[0] === project.id,
    );
    const projectTaskDepartments = projectTasks
      .map((task) => resolveNormalizedTaskDepartmentName(task, projectDepartmentById))
      .filter((departmentName) => departmentName !== UNKNOWN_DEPARTMENT);
    const completed = projectTasks.filter(
      (task) => getStageBucket(relationName(task.stage_id, "")) === "done",
    ).length;
    const buckets = projectTasks.map((task) => getStageBucket(relationName(task.stage_id, "")));
    const stageBucket =
      buckets.includes("review")
        ? "review"
        : buckets.includes("progress")
          ? "progress"
          : buckets.includes("todo")
            ? "todo"
            : buckets.includes("done")
              ? "done"
              : "unknown";

    return {
      id: project.id,
      name: project.name,
      manager: relationName(project.user_id),
      departmentName:
        projectTaskDepartments[0] ??
        projectDepartmentById.get(project.id) ??
        resolveNormalizedProjectDepartmentName(project),
      stageLabel: STAGE_LABELS[stageBucket],
      stageBucket,
      openTasks: projectTasks.length - completed,
      completion: projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0,
      deadline: formatCompactDate(project.date),
      href: `/projects/${project.id}`,
    } satisfies ProjectCard;
  });

  const taskDirectory = tasks
    .map((task) => {
      const stageBucket = getStageBucket(relationName(task.stage_id, ""));
      const statusKey = getTaskStatusKey(task);

      return {
        id: task.id,
        name: task.name,
        departmentName: resolveTaskDepartmentName(task, projectDepartmentById),
        projectName: relationName(task.project_id, "Ажилгүй"),
        stageLabel: STAGE_LABELS[stageBucket],
        stageBucket,
        statusKey,
        statusLabel: getTaskStatusLabel(statusKey),
        deadline: formatCompactDate(task.date_deadline),
        scheduledDate: getDateKeyFromValue(task.mfo_shift_date || task.date_deadline || null),
        leaderName: relationName(task.ops_team_leader_id ?? false),
        priorityLabel: priorityLabel(task.priority || ""),
        progress: Math.round(task.ops_progress_percent ?? 0),
        plannedQuantity: task.ops_planned_quantity ?? 0,
        completedQuantity: task.ops_completed_quantity ?? 0,
        remainingQuantity: task.ops_remaining_quantity ?? 0,
        measurementUnit: resolveTaskMeasurementUnit(task),
        operationTypeLabel: operationTypeLabel(task.mfo_operation_type),
        issueFlag: statusKey === "problem",
        assigneeIds: task.user_ids ?? [],
        href: buildTaskHref(task.id, "/tasks"),
      } satisfies TaskDirectoryItem;
    })
    .sort((left, right) => {
      const statusPriority: Record<TaskStatusKey, number> = {
        problem: 0,
        review: 1,
        working: 2,
        planned: 3,
        verified: 4,
      };

      const statusDiff = statusPriority[left.statusKey] - statusPriority[right.statusKey];
      if (statusDiff !== 0) {
        return statusDiff;
      }

      return left.name.localeCompare(right.name, "mn");
    });

  const liveTasks = activeTasks.map((task) => ({
    id: task.id,
    name: task.name,
    departmentName: resolveTaskDepartmentName(task, projectDepartmentById),
    projectName: relationName(task.project_id),
    stageLabel: STAGE_LABELS[getStageBucket(relationName(task.stage_id, ""))],
    stageBucket: getStageBucket(relationName(task.stage_id, "")),
    deadline: formatCompactDate(task.date_deadline),
    scheduledDate: getDateKeyFromValue(task.mfo_shift_date || task.date_deadline || null),
    plannedQuantity: task.ops_planned_quantity ?? 0,
    completedQuantity: task.ops_completed_quantity ?? 0,
    remainingQuantity: task.ops_remaining_quantity ?? 0,
    measurementUnit: resolveTaskMeasurementUnit(task),
    leaderName: relationName(task.ops_team_leader_id ?? false),
    priorityLabel: priorityLabel(task.priority || ""),
    progress: Math.round(task.ops_progress_percent ?? 0),
    href: buildTaskHref(task.id, "/tasks"),
  }));

  const reviewQueue = reviewTasks.map((task) => ({
    id: task.id,
    name: task.name,
    departmentName: resolveTaskDepartmentName(task, projectDepartmentById),
    stageLabel: relationName(task.stage_id, STAGE_LABELS.review),
    deadline: formatCompactDate(task.date_deadline),
    projectName: relationName(task.project_id),
    leaderName: relationName(task.ops_team_leader_id ?? false),
    progress: Math.round(task.ops_progress_percent ?? 0),
    href: buildTaskHref(task.id, "/review"),
  }));

  const attachmentIds = [
    ...new Set(
      reports.flatMap((report) => [
        ...(report.image_attachment_ids ?? []),
        ...(report.audio_attachment_ids ?? []),
      ]),
    ),
  ];

  const attachmentMap = new Map<number, OdooAttachmentRecord>();
  if (attachmentIds.length) {
    try {
      const attachments = await searchReadAll<OdooAttachmentRecord>(
        uid,
        "ir.attachment",
        [["id", "in", attachmentIds]],
        {
          fields: ["name", "mimetype"],
          order: "id asc",
        },
        connection,
        200,
      );

      for (const attachment of attachments) {
        attachmentMap.set(attachment.id, attachment);
      }
    } catch (error) {
      console.warn("ir.attachment өгөгдөл уншихад алдаа гарлаа:", error);
    }
  }

  const reportTaskMap = new Map(tasks.map((task) => [task.id, task]));
  const reportsFeed = reports.map((report) => {
    const task = Array.isArray(report.task_id) ? reportTaskMap.get(report.task_id[0]) : undefined;
    const images = (report.image_attachment_ids ?? []).map((attachmentId) => {
      const attachment = attachmentMap.get(attachmentId);
      return {
        id: attachmentId,
        name: attachment?.name || `image-${attachmentId}`,
        mimetype: attachment?.mimetype || "image/*",
        url: `/api/odoo/attachments/${attachmentId}`,
      };
    });
    const audios = (report.audio_attachment_ids ?? []).map((attachmentId) => {
      const attachment = attachmentMap.get(attachmentId);
      return {
        id: attachmentId,
        name: attachment?.name || `audio-${attachmentId}`,
        mimetype: attachment?.mimetype || "audio/*",
        url: `/api/odoo/attachments/${attachmentId}`,
      };
    });
    return {
      id: report.id,
      reporter: relationName(report.reporter_id),
      taskName: relationName(report.task_id),
      departmentName: task
        ? resolveTaskDepartmentName(task, projectDepartmentById)
        : "Тодорхойгүй",
      projectName: task ? relationName(task.project_id) : "Ажилгүй",
      summary: report.report_summary || "Тайлбар оруулаагүй",
      reportedQuantity: report.reported_quantity ?? 0,
      measurementUnit: resolveUnitLabel(
        report.task_measurement_unit_id,
        report.task_measurement_unit_code,
        task?.ops_measurement_unit,
      ),
      measurementUnitCode:
        report.task_measurement_unit_code || (task ? resolveTaskMeasurementCode(task) : ""),
      imageCount: report.image_count ?? 0,
      audioCount: report.audio_count ?? 0,
      submittedAt: formatCompactDate(report.report_datetime),
      images,
      audios,
    } satisfies ReportFeedItem;
  });

  const teamLeaderMap = new Map<string, TeamLeaderCard>();
  for (const task of tasks) {
      const leaderName = relationName(task.ops_team_leader_id ?? false, "Оноогоогүй");
    const entry = teamLeaderMap.get(leaderName) ?? {
      name: leaderName,
      activeTasks: 0,
      reviewTasks: 0,
      averageCompletion: 0,
      squadSize: Math.max((task.user_ids?.length ?? 1) - 1, 0),
    };

    const bucket = getStageBucket(relationName(task.stage_id, ""));
    if (bucket === "review") {
      entry.reviewTasks += 1;
    }
    if (bucket === "todo" || bucket === "progress") {
      entry.activeTasks += 1;
    }
    entry.averageCompletion += task.ops_progress_percent ?? 0;
    entry.squadSize = Math.max(entry.squadSize, Math.max((task.user_ids?.length ?? 1) - 1, 0));
    teamLeaderMap.set(leaderName, entry);
  }

  const teamLeaders = Array.from(teamLeaderMap.values())
    .map((leader) => {
      const relatedTasks = tasks.filter(
        (task) => relationName(task.ops_team_leader_id ?? false, "Оноогоогүй") === leader.name,
      );
      const totalProgress = relatedTasks.reduce(
        (sum, task) => sum + (task.ops_progress_percent ?? 0),
        0,
      );
      return {
        ...leader,
        averageCompletion: relatedTasks.length ? Math.round(totalProgress / relatedTasks.length) : 0,
      };
    })
    .sort((left, right) => right.activeTasks - left.activeTasks)
    .slice(0, 4);

  const qualitySourceTasks = tasks.filter(
    (task) => task.mfo_is_operation_project && (task.mfo_quality_exception_count ?? 0) > 0,
  );
  const missingProofTasks = qualitySourceTasks.filter(
    (task) => (task.mfo_missing_proof_stop_count ?? 0) > 0,
  );
  const syncWarningTasks = qualitySourceTasks.filter((task) => task.mfo_weight_sync_warning);
  const deviationTasks = qualitySourceTasks.filter(
    (task) => (task.mfo_route_deviation_stop_count ?? 0) > 0,
  );
  const unresolvedQualityTasks = qualitySourceTasks.filter(
    (task) => (task.mfo_unresolved_stop_count ?? 0) > 0,
  );
  const qualityAlerts = qualitySourceTasks
    .map((task) => ({
      id: task.id,
      name: task.name,
      departmentName: resolveTaskDepartmentName(task, projectDepartmentById),
      projectName: relationName(task.project_id),
      routeName: relationName(task.mfo_route_id ?? false, "Маршрутгүй"),
      operationTypeLabel: operationTypeLabel(task.mfo_operation_type),
      exceptionCount: task.mfo_quality_exception_count ?? 0,
      unresolvedStopCount: task.mfo_unresolved_stop_count ?? 0,
      missingProofStopCount: task.mfo_missing_proof_stop_count ?? 0,
      deviationStopCount: task.mfo_route_deviation_stop_count ?? 0,
      skippedWithoutReasonCount: task.mfo_skipped_without_reason_count ?? 0,
      hasWeightWarning: Boolean(task.mfo_weight_sync_warning),
      href: buildTaskHref(task.id, "/quality"),
    }))
    .sort((left, right) => right.exceptionCount - left.exceptionCount)
    .slice(0, 12);

  const completionRate = totalTasks ? Math.round((doneTasks.length / totalTasks) * 100) : 0;
  const completedQuantitySummary = buildQuantityMetricSummary(tasks);

  return {
    source: "live",
    generatedAt: formatSyncDate(new Date()),
    odooBaseUrl: resolvedConnection.url,
    totalTasks,
    metrics: [
      {
        label: "Идэвхтэй ажилбар",
        value: String(activeTasks.length),
        note: `${overdueTasks.length} нь хугацаа давсан`,
        tone: overdueTasks.length ? "red" : "slate",
      },
      {
        label: "Хяналтын дараалал",
        value: String(reviewTasks.length),
        note: "Үйл ажиллагаа хариуцсан менежер баталгаажуулалт хүлээж байна",
        tone: "amber",
      },
      {
        label: "Нийт гүйцэтгэл",
        value: `${completionRate}%`,
        note: `${doneTasks.length}/${totalTasks} ажилбар дууссан`,
        tone: "teal",
      },
      {
        label: "Хэмжээний биелэлт",
        value: completedQuantitySummary,
        note: "Стандарт нэгжийн кодоор нэгтгэсэн",
        tone: "slate",
      },
    ],
    qualityMetrics: [
      {
        label: "Чанарын анхааруулга",
        value: String(qualitySourceTasks.length),
        note: "Талбарын гүйцэтгэл дээр засах шаардлагатай ажилбар",
        tone: qualitySourceTasks.length ? "red" : "teal",
      },
      {
        label: "Зураг дутсан ажилбар",
        value: String(missingProofTasks.length),
        note: "Өмнө, дараах зураг бүрэн биш",
        tone: missingProofTasks.length ? "amber" : "teal",
      },
      {
        label: "Синк анхааруулга",
        value: String(syncWarningTasks.length),
        note: "WRS эсвэл жингийн өгөгдөл бүрэн биш",
        tone: syncWarningTasks.length ? "red" : "slate",
      },
      {
        label: "Маршрутын зөрүү",
        value: String(deviationTasks.length),
        note: `${unresolvedQualityTasks.length} ажилбар нээлттэй цэгтэй`,
        tone: deviationTasks.length ? "amber" : "slate",
      },
    ],
    departments,
    projects: projectsWithStats,
    taskDirectory,
    liveTasks,
    reviewQueue,
    qualityAlerts,
    reports: reportsFeed,
    teamLeaders,
  };
}

// Preserved temporarily while the clean fallback snapshot replaces the old demo payload.
function fallbackSnapshot(): DashboardSnapshot {
  const todayDateKey = getTodayDateKey();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateKey = getTodayDateKey(tomorrow);

  return {
    source: "demo",
    generatedAt: formatSyncDate(new Date()),
    odooBaseUrl: DEFAULT_CONNECTION.url,
    totalTasks: 28,
    metrics: [
      {
        label: "Идэвхтэй ажилбар",
        value: "18",
        note: "3 нь хугацаа давсан",
        tone: "red",
      },
      {
        label: "Хяналтын дараалал",
        value: "4",
        note: "Үйл ажиллагаа хариуцсан менежер шалгаж байна",
        tone: "amber",
      },
      {
        label: "Нийт гүйцэтгэл",
        value: "64%",
        note: "18/28 ажилбар дээр ахиц бүртгэгдсэн",
        tone: "teal",
      },
      {
        label: "Хэмжээний биелэлт",
        value: "713 мод",
        note: "Өнөөдрийн тайлангаас автоматаар тооцсон",
        tone: "slate",
      },
    ],
    qualityMetrics: [
      {
        label: "Чанарын анхааруулга",
        value: "5",
        note: "Талбарын гүйцэтгэл дээр дахин хянах ажилбар",
        tone: "red",
      },
      {
        label: "Зураг дутсан ажилбар",
        value: "2",
        note: "Өмнө эсвэл дараах зураг бүрэн биш",
        tone: "amber",
      },
      {
        label: "Синк анхааруулга",
        value: "1",
        note: "Жингийн синкийг нягтлах шаардлагатай",
        tone: "red",
      },
      {
        label: "Маршрутын зөрүү",
        value: "2",
        note: "Зөрүү эсвэл хаагдаагүй цэг илэрсэн",
        tone: "amber",
      },
    ],
    departments: DEPARTMENT_ORDER.map((name, index) => ({
      name,
      label: DEPARTMENT_LABELS[name],
      icon: resolveDepartmentIcon(name),
      accent: DEPARTMENT_ACCENTS[name],
      openTasks: [4, 5, 9, 6, 4][index],
      reviewTasks: [1, 0, 2, 1, 0][index],
      completion: [58, 67, 72, 49, 63][index],
    })),
    projects: [
      {
        id: 1,
        name: "2026 Мод хэлбэржүүлэлтийн хуваарь",
        manager: "BATAA",
        departmentName: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
      stageLabel: "Хянагдаж буй ажил",
        stageBucket: "review",
        openTasks: 14,
        completion: 71,
        deadline: "4-р сарын 20, 18:00",
        href: "/projects/1",
      },
      {
        id: 2,
        name: "Хог тээвэрлэлтийн өглөөний маршрут",
        manager: "ankhaa",
        departmentName: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
        stageLabel: "Явагдаж буй ажил",
        stageBucket: "progress",
        openTasks: 5,
        completion: 62,
        deadline: "Өнөөдөр 20:00",
        href: "/projects/2",
      },
      {
        id: 3,
        name: "Зам талбайн шөнийн цэвэрлэгээ",
        manager: "ankhaa",
        departmentName: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
        stageLabel: "Хийгдэх ажил",
        stageBucket: "todo",
        openTasks: 6,
        completion: 35,
        deadline: "4-р сарын 17, 06:00",
        href: "/projects/3",
      },
    ],
    taskDirectory: [
      {
        id: 201,
        name: "5-р хороо - 32 модны тайлан",
        departmentName: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
        projectName: "2026 Мод хэлбэржүүлэлтийн хуваарь",
      stageLabel: "Хянагдаж буй ажил",
        stageBucket: "review",
        statusKey: "review",
        statusLabel: "Шалгаж байна",
        deadline: "Өнөөдөр 16:30",
        scheduledDate: todayDateKey,
        leaderName: "suldee",
        priorityLabel: "Өндөр",
        progress: 100,
        plannedQuantity: 32,
        completedQuantity: 32,
        remainingQuantity: 0,
        measurementUnit: "мод",
        operationTypeLabel: "Ерөнхий ажил",
        issueFlag: false,
        href: buildTaskHref(201, "/tasks"),
      },
      {
        id: 202,
        name: "Хог тээврийн 2-р маршрут",
        departmentName: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
        projectName: "Хог тээвэрлэлтийн өглөөний маршрут",
        stageLabel: "Явагдаж буй ажил",
        stageBucket: "progress",
        statusKey: "problem",
        statusLabel: "Асуудалтай",
        deadline: "Өнөөдөр 19:00",
        scheduledDate: todayDateKey,
        leaderName: "sarangerel",
        priorityLabel: "Яаралтай",
        progress: 88,
        plannedQuantity: 5,
        completedQuantity: 4,
        remainingQuantity: 1,
        measurementUnit: "ачилт",
        operationTypeLabel: "Хог цуглуулалт",
        issueFlag: true,
        href: buildTaskHref(202, "/tasks"),
      },
      {
        id: 102,
        name: "7-р хороо - Төв замын захын цэвэрлэгээ",
        departmentName: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
        projectName: "Зам талбайн шөнийн цэвэрлэгээ",
        stageLabel: "Хийгдэх ажил",
        stageBucket: "todo",
        statusKey: "planned",
        statusLabel: "Төлөвлөгдсөн",
        deadline: "Маргааш 06:00",
        scheduledDate: tomorrowDateKey,
        leaderName: "temuulen",
        priorityLabel: "Яаралтай",
        progress: 0,
        plannedQuantity: 12,
        completedQuantity: 0,
        remainingQuantity: 12,
        measurementUnit: "км²",
        operationTypeLabel: "Гудамж цэвэрлэгээ",
        issueFlag: false,
        href: buildTaskHref(102, "/tasks"),
      },
      {
        id: 103,
        name: "Авто бааз - 3 машинд урсгал үйлчилгээ",
        departmentName: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
        projectName: "Техникийн өдөр тутмын бэлэн байдал",
        stageLabel: "Явагдаж буй ажил",
        stageBucket: "progress",
        statusKey: "working",
        statusLabel: "Ажиллаж байна",
        deadline: "Өнөөдөр 17:30",
        scheduledDate: todayDateKey,
        leaderName: "bold",
        priorityLabel: "Дунд",
        progress: 33,
        plannedQuantity: 3,
        completedQuantity: 1,
        remainingQuantity: 2,
        measurementUnit: "машин",
        operationTypeLabel: "Ерөнхий ажил",
        issueFlag: false,
        href: buildTaskHref(103, "/tasks"),
      },
    ],
    liveTasks: [
      {
        id: 101,
        departmentName: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
        name: "1-р хороо - 20-р байрны ар тал",
        projectName: "2026 Мод хэлбэржүүлэлтийн хуваарь",
        stageLabel: "Явагдаж буй ажил",
        stageBucket: "progress",
        deadline: "Өнөөдөр 18:00",
        scheduledDate: todayDateKey,
        plannedQuantity: 48,
        completedQuantity: 21,
        remainingQuantity: 27,
        measurementUnit: "мод",
        leaderName: "suldee",
        priorityLabel: "Өндөр",
        progress: 44,
        href: buildTaskHref(101, "/tasks"),
      },
      {
        id: 102,
        departmentName: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
        name: "7-р хороо - Төв замын захын цэвэрлэгээ",
        projectName: "Зам талбайн шөнийн цэвэрлэгээ",
        stageLabel: "Хийгдэх ажил",
        stageBucket: "todo",
        deadline: "Маргааш 06:00",
        scheduledDate: tomorrowDateKey,
        plannedQuantity: 12,
        completedQuantity: 0,
        remainingQuantity: 12,
        measurementUnit: "км²",
        leaderName: "temuulen",
        priorityLabel: "Яаралтай",
        progress: 0,
        href: buildTaskHref(102, "/tasks"),
      },
      {
        id: 103,
        departmentName: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
        name: "Авто бааз - 3 машинд урсгал үйлчилгээ",
        projectName: "Техникийн өдөр тутмын бэлэн байдал",
        stageLabel: "Явагдаж буй ажил",
        stageBucket: "progress",
        deadline: "Өнөөдөр 17:30",
        scheduledDate: todayDateKey,
        plannedQuantity: 3,
        completedQuantity: 1,
        remainingQuantity: 2,
        measurementUnit: "машин",
        leaderName: "bold",
        priorityLabel: "Дунд",
        progress: 33,
        href: buildTaskHref(103, "/tasks"),
      },
    ],
    reviewQueue: [
        {
          id: 201,
          name: "5-р хороо - 32 модны тайлан",
          departmentName: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
      stageLabel: "Хянагдаж буй ажил",
          deadline: "Өнөөдөр 16:30",
          projectName: "2026 Мод хэлбэржүүлэлтийн хуваарь",
          leaderName: "suldee",
          progress: 100,
        href: buildTaskHref(201, "/review"),
      },
        {
          id: 202,
          name: "Хог тээврийн 2-р маршрут",
          departmentName: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
      stageLabel: "Хянагдаж буй ажил",
          deadline: "Өнөөдөр 19:00",
          projectName: "Хог тээвэрлэлтийн өглөөний маршрут",
          leaderName: "sarangerel",
          progress: 88,
        href: buildTaskHref(202, "/review"),
      },
    ],
    qualityAlerts: [
      {
        id: 401,
        name: "Хогийн 2-р маршрут",
        departmentName: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
        projectName: "Өглөөний хог тээврийн маршрут",
        routeName: "2-р чиглэл",
        operationTypeLabel: "Хог цуглуулалт",
        exceptionCount: 3,
        unresolvedStopCount: 1,
        missingProofStopCount: 1,
        deviationStopCount: 0,
        skippedWithoutReasonCount: 0,
        hasWeightWarning: true,
        href: buildTaskHref(202, "/quality"),
      },
      {
        id: 402,
        name: "Төв замын цэвэрлэгээ",
        departmentName: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
        projectName: "Шөнийн гудамж цэвэрлэгээ",
        routeName: "7-р хорооны чиглэл",
        operationTypeLabel: "Гудамж цэвэрлэгээ",
        exceptionCount: 2,
        unresolvedStopCount: 1,
        missingProofStopCount: 0,
        deviationStopCount: 1,
        skippedWithoutReasonCount: 0,
        hasWeightWarning: false,
        href: buildTaskHref(102, "/quality"),
      },
    ],
    reports: [
      {
        id: 301,
        departmentName: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
        reporter: "suldee",
        taskName: "1-р хороо - 20-р байрны ар тал",
        projectName: "2026 Мод хэлбэржүүлэлтийн хуваарь",
        summary: "21 мод хэлбэржүүлж, 1 зураг, 1 аудио тайлан хавсаргасан.",
        reportedQuantity: 21,
        measurementUnit: "мод",
        measurementUnitCode: "tree",
        imageCount: 1,
        audioCount: 1,
        images: [],
        audios: [],
        submittedAt: "Өнөөдөр 15:30",
      },
      {
        id: 302,
        departmentName: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
        reporter: "sarangerel",
        taskName: "Хог тээврийн 2-р маршрут",
        projectName: "Хог тээвэрлэлтийн өглөөний маршрут",
        summary: "Маршрут дууссан, дахин ачилт 18:00-д эхэлнэ.",
        reportedQuantity: 4,
        measurementUnit: "удаа",
        measurementUnitCode: "times",
        imageCount: 2,
        audioCount: 0,
        images: [],
        audios: [],
        submittedAt: "Өнөөдөр 14:10",
      },
    ],
    teamLeaders: [
      {
        name: "suldee",
        activeTasks: 3,
        reviewTasks: 1,
        averageCompletion: 68,
        squadSize: 5,
      },
      {
        name: "sarangerel",
        activeTasks: 4,
        reviewTasks: 1,
        averageCompletion: 73,
        squadSize: 6,
      },
      {
        name: "bold",
        activeTasks: 2,
        reviewTasks: 0,
        averageCompletion: 51,
        squadSize: 4,
      },
    ],
  };
}

function buildFallbackSnapshot(): DashboardSnapshot {
  return fallbackSnapshot();
}

export async function loadMunicipalSnapshot(
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const connection = createOdooConnection(connectionOverrides);

  try {
    return await fetchLiveSnapshot(connection);
  } catch (error) {
    console.warn("Falling back to demo dashboard snapshot:", error);
    return buildFallbackSnapshot();
  }
}
