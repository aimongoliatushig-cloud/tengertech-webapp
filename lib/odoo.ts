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

const DEFAULT_ODOO_RPC_TIMEOUT_MS = 30_000;
const configuredOdooRpcTimeoutMs = Number(process.env.ODOO_RPC_TIMEOUT_MS);
const ODOO_RPC_TIMEOUT_MS =
  Number.isFinite(configuredOdooRpcTimeoutMs) && configuredOdooRpcTimeoutMs > 0
    ? configuredOdooRpcTimeoutMs
    : DEFAULT_ODOO_RPC_TIMEOUT_MS;
const ODOO_AUTH_CACHE_TTL_MS = 5 * 60_000;
const ODOO_READ_RPC_CACHE_TTL_MS = 2 * 60_000;

function isRoadCleaningPhotoPlaceholderTaskName(value: string) {
  const normalized = value.trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");

  return normalized.includes("Ó©Ð¼Ð½Ó©Ñ… Ð·ÑƒÑ€Ð°Ð³") || normalized.includes("Ð´Ð°Ñ€Ð°Ð°Ñ… Ð·ÑƒÑ€Ð°Ð³");
}

type OdooProjectRecord = {
  id: number;
  name: string;
  user_id: OdooRelation;
  ops_department_id: OdooRelation;
  date_start: string | false;
  date: string | false;
  mfo_operation_type?: string | false;
};

type OdooTaskRecord = {
  id: number;
  name: string;
  project_id: OdooRelation;
  ops_department_id?: OdooRelation;
  stage_id: OdooRelation;
  state?: string | false;
  mfo_state?: string | false;
  municipal_work_id?: OdooRelation;
  description?: string | false;
  create_date?: string | false;
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
  report_text?: string | false;
  report_summary: string | false;
  reported_quantity: number;
  state?: string | false;
  rejection_reason?: string | false;
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
  res_id?: number | false;
};

type OdooWorkReturnRecord = {
  id: number;
  state?: string | false;
  rejection_reason?: string | false;
};

type OdooTaskMessageRecord = {
  id: number;
  res_id?: number | false;
  body?: string | false;
  date?: string | false;
};

type OdooAttachmentBinaryRecord = OdooAttachmentRecord & {
  datas: string | false;
};

type OdooUserRecord = {
  id: number;
  name: string;
  login: string;
  ops_user_type?: string | false;
};

type OdooAuthEmployeeRecord = {
  id: number;
  name: string;
  job_id?: OdooRelation;
  job_title?: string | false;
  department_id?: OdooRelation;
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
  birthday?: string | false;
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

type OdooHrAttendanceRecord = {
  id: number;
  employee_id: OdooRelation;
  check_in?: string | false;
  check_out?: string | false;
};

type OdooHrLeaveRecord = {
  id: number;
  employee_id: OdooRelation;
  state?: string | false;
  holiday_status_id?: OdooRelation;
  request_date_from?: string | false;
  request_date_to?: string | false;
  date_from?: string | false;
  date_to?: string | false;
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
  managerId?: number | null;
  manager: string;
  departmentName: string;
  operationTypeLabel?: string;
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
  projectId?: number | null;
  projectName: string;
  leaderId?: number | null;
  leaderName: string;
  progress: number;
  href: string;
};

type LiveTask = {
  id: number;
  name: string;
  departmentName: string;
  projectId?: number | null;
  projectName: string;
  stageLabel: string;
  stageBucket: StageBucket;
  deadline: string;
  scheduledDate?: string | null;
  plannedQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  measurementUnit: string;
  leaderId?: number | null;
  leaderName: string;
  priorityLabel: string;
  progress: number;
  href: string;
};

export type TaskStatusKey = "planned" | "working" | "review" | "verified" | "problem";

export type TaskDirectoryReportSummary = {
  id: number;
  reporter: string;
  submittedAt: string;
  state: string;
  stateLabel: string;
  stateBucket: "review" | "done" | "problem" | "progress";
  summary: string;
  text: string;
  reportedQuantity: number;
  measurementUnit: string;
  rejectionReason: string;
  imageCount: number;
  audioCount: number;
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

export type TaskDirectoryItem = {
  id: number;
  name: string;
  departmentName: string;
  projectId?: number | null;
  projectName: string;
  stageLabel: string;
  stageBucket: StageBucket;
  createdDate?: string | null;
  createdAt?: string | null;
  statusKey: TaskStatusKey;
  statusLabel: string;
  deadline: string;
  deadlineDateTime?: string | null;
  scheduledDate?: string | null;
  leaderId?: number | null;
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
  latestReport?: TaskDirectoryReportSummary;
  href: string;
};

type ReportFeedItem = {
  id: number;
  taskId?: number | null;
  reporterId?: number | null;
  reporter: string;
  taskName: string;
  departmentName: string;
  projectId?: number | null;
  projectName: string;
  summary: string;
  text: string;
  state: string;
  stateLabel: string;
  stateBucket: "review" | "done" | "problem" | "progress";
  rejectionReason: string;
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

function normalizeRoleTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function inferRoleFromEmployeeTitle(employee?: OdooAuthEmployeeRecord | null) {
  if (!employee) {
    return null;
  }

  const title = normalizeRoleTitle(
    [
      Array.isArray(employee.job_id) ? employee.job_id[1] : "",
      employee.job_title || "",
    ].join(" "),
  );
  const department = normalizeRoleTitle(
    Array.isArray(employee.department_id) ? employee.department_id[1] : "",
  );
  const titleWithDepartment = `${title} ${department}`;

  if (!title) {
    return null;
  }

  if (
    title.includes("Ñ…Ò¯Ð½Ð¸Ð¹ Ð½Ó©Ó©Ñ†") ||
    title.includes("human resources") ||
    title.includes("hr specialist") ||
    title.includes("hr manager")
  ) {
    return title.includes("manager") || title.includes("Ð¼ÐµÐ½ÐµÐ¶ÐµÑ€")
      ? "hr_manager"
      : "hr_specialist";
  }

  if (title.includes("Ð·Ð°Ñ…Ð¸Ñ€Ð°Ð»") || title.includes("ceo") || title.includes("director")) {
    return "director";
  }

  if (
    title.includes("Ò¯Ð¹Ð» Ð°Ð¶Ð¸Ð»Ð»Ð°Ð³Ð°Ð° Ñ…Ð°Ñ€Ð¸ÑƒÑ†ÑÐ°Ð½ Ð¼ÐµÐ½ÐµÐ¶ÐµÑ€") ||
    title.includes("ÐµÑ€Ó©Ð½Ñ…Ð¸Ð¹ Ð¼ÐµÐ½ÐµÐ¶ÐµÑ€") ||
    title.includes("general manager")
  ) {
    return "general_manager";
  }

  if (title.includes("Ñ…ÑÐ»Ñ‚ÑÐ¸Ð¹Ð½ Ð´Ð°Ñ€Ð³Ð°") || title.includes("Ð°Ð»Ð±Ð°Ð½Ñ‹ Ð´Ð°Ñ€Ð³Ð°")) {
    return "project_manager";
  }

  if (
    title.includes("Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ½Ð°Ð»Ñ‚Ñ‹Ð½ Ð°Ð¶Ð¸Ð»Ñ‚Ð°Ð½") ||
    title.includes("Ñ‚ÑÑÐ²Ñ€Ð¸Ð¹Ð½ Ñ…ÑÐ½Ð°Ð»Ñ‚Ñ‹Ð½ Ð°Ð¶Ð¸Ð»Ñ‚Ð°Ð½") ||
    title.includes("Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²Ñ€Ð¸Ð¹Ð½ Ñ…ÑÐ½Ð°Ð»Ñ‚Ñ‹Ð½ Ð°Ð¶Ð¸Ð»Ñ‚Ð°Ð½") ||
    (title.includes("Ñ‚ÑÑÐ²ÑÑ€") && title.includes("Ñ…ÑÐ½Ð°Ð»Ñ‚")) ||
    (title.includes("teever") && title.includes("hyanalt")) ||
    (title.includes("Ñ…ÑÐ½Ð°Ð»Ñ‚Ñ‹Ð½ Ð°Ð¶Ð¸Ð»Ñ‚Ð°Ð½") &&
      (titleWithDepartment.includes("Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€") || titleWithDepartment.includes("Ð°Ð²Ñ‚Ð¾ Ð±Ð°Ð°Ð·")))
  ) {
    return "team_leader";
  }

  if (
    title.includes("Ð°Ñ…Ð»Ð°Ñ… Ð¼Ð°ÑÑ‚ÐµÑ€") ||
    title.includes("Ð¼Ð°ÑÑ‚ÐµÑ€") ||
    title.includes("Ð´Ð°Ð°Ð¼Ð°Ð»") ||
    title.includes("Ñ‚Ð°Ð»Ð±Ð°Ð¹Ð½ Ð¸Ð½Ð¶ÐµÐ½ÐµÑ€") ||
    title.includes("talbain engineer") ||
    title.includes("field engineer")
  ) {
    return "senior_master";
  }

  return null;
}

function resolveAuthenticatedRole(
  explicitRole: string | false,
  employee?: OdooAuthEmployeeRecord | null,
) {
  const role = explicitRole || "worker";
  if (role && role !== "worker") {
    return role;
  }

  return inferRoleFromEmployeeTitle(employee) ?? role;
}

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
  departmentId?: number | null;
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
  birthDate: string;
  genderKey: string;
  genderLabel: string;
  educationLevel: string;
  missingDocumentCount: number;
  kpiScore: number;
  taskCompletionPercent: number;
  disciplineScore: number;
};

export type HrDailyAttendanceSummary = {
  totalEmployees: number;
  workingToday: number;
  absentToday: number;
  sickToday: number;
  leaveToday: number;
  generatedAt: string;
  source: "attendance" | "employee_status" | "empty";
};

type OdooFleetVehicleRecord = {
  id: number;
  name: string;
  license_plate?: string | false;
  image_128?: string | false;
  avatar_128?: string | false;
  image_1920?: string | false;
  model_id?: OdooRelation;
  category_id?: OdooRelation;
  municipal_vehicle_type_id?: OdooRelation;
  municipal_department_id?: OdooRelation;
  municipal_responsible_driver_id?: OdooRelation;
  municipal_loader_1_id?: OdooRelation;
  municipal_loader_2_id?: OdooRelation;
  x_municipal_operational_status?: string | false;
  vin_sn?: string | false;
  odometer?: number | false;
  fuel_type?: string | false;
  driver_id?: OdooRelation;
  state_id?: OdooRelation;
  mfo_active_for_ops?: boolean;
  latest_repair_state?: string | false;
  vehicle_downtime_open?: boolean;
  active?: boolean;
  municipal_insurance_company?: string | false;
  municipal_insurance_policy_number?: string | false;
  municipal_insurance_date_start?: string | false;
  municipal_insurance_date_end?: string | false;
  municipal_insurance_days_remaining?: number;
  municipal_insurance_reminder_due?: boolean;
  municipal_insurance_note?: string | false;
  municipal_insurance_attachment_ids?: number[];
  municipal_inspection_date?: string | false;
  municipal_next_inspection_date?: string | false;
  municipal_inspection_days_remaining?: number;
  municipal_inspection_reminder_due?: boolean;
  municipal_inspection_note?: string | false;
  municipal_inspection_attachment_ids?: number[];
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

type OdooVehicleDriverHistoryRecord = {
  id: number;
  vehicle_id: OdooRelation;
  driver_id: OdooRelation;
  date_start?: string | false;
  date_end?: string | false;
  changed_by_id?: OdooRelation;
  changed_date?: string | false;
};

type OdooRepairHistoryRecord = {
  id: number;
  name: string;
  vehicle_id: OdooRelation;
  request_date?: string | false;
  repair_started_at?: string | false;
  repair_done_at?: string | false;
  damage_type?: string | false;
  issue_summary?: string | false;
  issue_description?: string | false;
  description?: string | false;
  parts_note?: string | false;
  amount_total?: number;
  actual_cost?: number;
  mechanic_id?: OdooRelation;
  state?: string | false;
  procurement_request_id?: OdooRelation;
  attachment_ids?: number[];
  photo_ids?: number[];
};

type OdooGarbageWeightReportRecord = {
  id: number;
  report_date?: string | false;
  vehicle_id: OdooRelation;
  weight?: number;
  unit?: string | false;
  source?: string | false;
  fetched_at?: string | false;
  state?: string | false;
  error_message?: string | false;
};

type OdooGarbageFuelReportRecord = {
  id: number;
  report_date?: string | false;
  vehicle_id: OdooRelation;
  fuel_liters?: number;
  fuel_type?: string | false;
  source?: string | false;
  fetched_at?: string | false;
  state?: string | false;
  error_message?: string | false;
};

type OdooProcurementLinkRecord = {
  id: number;
  name: string;
  vehicle_id?: OdooRelation;
  repair_id?: OdooRelation;
  amount_total?: number;
  state?: string | false;
};

export type FleetVehicleCrewAssignment = {
  teamId: number;
  teamName: string;
  operationType: string;
  driverNames: string[];
  loaderNames: string[];
  memberNames: string[];
};

export type FleetVehicleDriverOption = {
  id: number;
  name: string;
  active: boolean;
  departmentName: string;
  jobTitle: string;
};

export type FleetVehicleDeadlineInfo = {
  company?: string;
  policyNumber?: string;
  startDate?: string;
  endDate?: string;
  startDateValue?: string;
  endDateValue?: string;
  daysRemaining: number;
  reminderDue: boolean;
  note?: string;
  attachmentCount: number;
};

export type FleetVehicleDriverHistoryItem = {
  id: number;
  driverName: string;
  dateStart: string;
  dateEnd: string;
  changedBy: string;
  changedDate: string;
};

export type FleetVehicleRepairHistoryItem = {
  id: number;
  name: string;
  requestDate: string;
  dateRange: string;
  damageType: string;
  description: string;
  partsNote: string;
  amountLabel: string;
  mechanicName: string;
  stateLabel: string;
  procurementName: string;
  attachmentCount: number;
};

export type FleetVehicleDailyWeightItem = {
  id: number;
  reportDate: string;
  weightLabel: string;
  source: string;
  fetchedAt: string;
  stateLabel: string;
  errorMessage: string;
};

export type FleetVehicleDailyFuelItem = {
  id: number;
  reportDate: string;
  fuelLabel: string;
  fuelType: string;
  source: string;
  fetchedAt: string;
  stateLabel: string;
  errorMessage: string;
};

export type FleetVehicleProcurementLink = {
  id: number;
  name: string;
  repairName: string;
  amountLabel: string;
  stateLabel: string;
};

export type FleetVehicleDepartmentOption = {
  id: number;
  name: string;
};

export type FleetVehicleSelectOption = {
  id: number;
  name: string;
};

export type FleetVehicleBoardItem = {
  id: number;
  plate: string;
  name: string;
  imageUrl: string;
  modelId: number | null;
  modelName: string;
  categoryId: number | null;
  categoryName: string;
  vehicleTypeId: number | null;
  vehicleTypeName: string;
  departmentId: number | null;
  departmentName: string;
  vin: string;
  odometerValue: string;
  odometerLabel: string;
  fuelTypeKey: string;
  fuelTypeLabel: string;
  fleetDriverName: string;
  responsibleDriverId: number | null;
  responsibleDriverName: string;
  loader1Id: number | null;
  loader1Name: string;
  loader2Id: number | null;
  loader2Name: string;
  stateLabel: string;
  operationalStatusKey: string;
  latestRepairState: string;
  isOperational: boolean;
  isRepair: boolean;
  isArchived: boolean;
  insurance: FleetVehicleDeadlineInfo;
  inspection: FleetVehicleDeadlineInfo;
  driverHistory: FleetVehicleDriverHistoryItem[];
  repairHistory: FleetVehicleRepairHistoryItem[];
  weightReports: FleetVehicleDailyWeightItem[];
  fuelReports: FleetVehicleDailyFuelItem[];
  procurementLinks: FleetVehicleProcurementLink[];
  crewAssignments: FleetVehicleCrewAssignment[];
};

export type FleetVehicleBoard = {
  allVehicles: FleetVehicleBoardItem[];
  activeVehicles: FleetVehicleBoardItem[];
  repairVehicles: FleetVehicleBoardItem[];
  driverOptions: FleetVehicleDriverOption[];
  loaderOptions: FleetVehicleDriverOption[];
  departmentOptions: FleetVehicleDepartmentOption[];
  modelOptions: FleetVehicleSelectOption[];
  vehicleTypeOptions: FleetVehicleSelectOption[];
  categoryOptions: FleetVehicleSelectOption[];
  totalVehicles: number;
  activeCount: number;
  repairCount: number;
  insuranceDueCount: number;
  inspectionDueCount: number;
  todayWeightLabel: string;
  todayFuelLabel: string;
  highestFuelVehicle: string;
  mostRepairedVehicle: string;
  failedImportCount: number;
};

type StageBucket = "todo" | "progress" | "review" | "done" | "problem" | "unknown";

const DEFAULT_CONNECTION: OdooConnection = {
  url: process.env.ODOO_URL ?? "http://localhost:8069",
  db: process.env.ODOO_DB ?? "odoo19_admin",
  login: process.env.ODOO_LOGIN ?? "admin",
  password: process.env.ODOO_PASSWORD ?? "admin",
};

const FLEET_REPAIR_GROUP_XML_IDS = {
  mechanic: "municipal_repair_workflow.group_repair_mechanic",
  teamLeader: "municipal_repair_workflow.group_repair_team_lead",
  accounting: "municipal_repair_workflow.group_repair_finance",
  administration: "municipal_repair_workflow.group_repair_manager",
  finance: "municipal_repair_workflow.group_repair_finance",
  purchaser: "municipal_repair_workflow.group_repair_storekeeper",
  generalManager: "municipal_repair_workflow.group_repair_manager",
  ceo: "municipal_repair_workflow.group_repair_director",
  manager: "municipal_repair_workflow.group_repair_manager",
} as const;

const OPS_PROFILE_GROUP_XML_IDS = {
  storekeeper: "ops_people_registry.group_ops_profile_storekeeper",
} as const;

const MUNICIPAL_CORE_GROUP_XML_IDS = {
  worker: "municipal_core.group_municipal_worker",
  master: "municipal_core.group_municipal_master",
  inspector: "municipal_core.group_municipal_inspector",
  departmentHead: "municipal_core.group_municipal_department_head",
  manager: "municipal_core.group_municipal_manager",
  director: "municipal_core.group_municipal_director",
  hr: "municipal_core.group_municipal_hr",
  it: "municipal_core.group_municipal_it",
  hse: "municipal_core.group_municipal_hse",
  publicRelations: "municipal_core.group_municipal_public_relations",
} as const;

const MFO_GROUP_XML_IDS = {
  manager: "municipal_field_ops.group_mfo_manager",
  dispatcher: "municipal_field_ops.group_mfo_dispatcher",
  inspector: "municipal_field_ops.group_mfo_inspector",
  mobile: "municipal_field_ops.group_mfo_mobile_user",
  driver: "municipal_field_ops.group_mfo_driver",
  loader: "municipal_field_ops.group_mfo_loader",
} as const;

const ENVIRONMENT_GROUP_XML_IDS = {
  worker: "municipal_environment_services.group_environment_worker",
  greenEngineer: "municipal_environment_services.group_green_engineer",
  greenMaster: "municipal_environment_services.group_green_master",
  improvementWelder: "municipal_environment_services.group_improvement_welder",
  improvementFieldEngineer: "municipal_environment_services.group_improvement_field_engineer",
  improvementEngineer: "municipal_environment_services.group_improvement_engineer",
  improvementManager: "municipal_environment_services.group_improvement_manager",
  environmentManager: "municipal_environment_services.group_environment_manager",
} as const;

const PUBLIC_SERVICE_GROUP_XML_IDS = {
  complaintManager: "municipal_public_services.group_municipal_complaint_manager",
} as const;

type OdooAuthSession = {
  uid: number;
  connection: OdooConnection;
};

type CachedOdooAuthSession = OdooAuthSession & {
  expiresAt: number;
};

const odooAuthCache = new Map<string, CachedOdooAuthSession>();

type CachedMunicipalSnapshot = {
  expiresAt: number;
  value: DashboardSnapshot;
};

type CachedFleetVehicleBoard = {
  expiresAt: number;
  value: FleetVehicleBoard;
};

type CachedOdooReadRpc = {
  expiresAt: number;
  value: unknown;
};

type CachedHrDailyAttendanceSummary = {
  expiresAt: number;
  value: HrDailyAttendanceSummary;
};

const MUNICIPAL_SNAPSHOT_CACHE_TTL_MS = 2 * 60_000;
const FLEET_VEHICLE_BOARD_CACHE_TTL_MS = 60_000;
const municipalSnapshotCache = new Map<string, CachedMunicipalSnapshot>();
const fleetVehicleBoardCache = new Map<string, CachedFleetVehicleBoard>();
const municipalSnapshotPendingCache = new Map<string, Promise<DashboardSnapshot>>();
const fleetVehicleBoardPendingCache = new Map<string, Promise<FleetVehicleBoard>>();
const odooReadRpcCache = new Map<string, CachedOdooReadRpc>();
const odooReadRpcPendingCache = new Map<string, Promise<unknown>>();
const hrDailyAttendanceSummaryCache = new Map<string, CachedHrDailyAttendanceSummary>();
const hrDailyAttendanceSummaryPendingCache = new Map<string, Promise<HrDailyAttendanceSummary>>();

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

function getOdooAuthCacheKey(connection: OdooConnection) {
  return [
    normalizeOdooBaseUrl(connection.url),
    connection.db,
    connection.login,
    connection.password,
  ].join("\u0000");
}

function getMunicipalSnapshotCacheKey(connection: OdooConnection) {
  return getOdooAuthCacheKey(connection);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function isOdooReadMethod(method: string) {
  return (
    method === "search" ||
    method === "read" ||
    method === "search_read" ||
    method === "search_count" ||
    method === "name_search" ||
    method === "fields_get"
  );
}

function isCacheableOdooReadRequest(
  model: string,
  method: string,
  kwargs: Record<string, unknown>,
) {
  const fields = Array.isArray(kwargs.fields) ? kwargs.fields : [];
  if (model === "ir.attachment" && fields.includes("datas")) {
    return false;
  }

  return isOdooReadMethod(method);
}

function getOdooReadRpcCacheKey(
  uid: number,
  model: string,
  method: string,
  methodArgs: unknown[],
  kwargs: Record<string, unknown>,
  connection: OdooConnection,
) {
  return stableSerialize({
    connection: getOdooAuthCacheKey(connection),
    uid,
    model,
    method,
    methodArgs,
    kwargs,
  });
}

function clearOdooReadCaches(connection?: OdooConnection) {
  const authKey = connection ? getOdooAuthCacheKey(connection) : "";

  if (!authKey) {
    odooReadRpcCache.clear();
    odooReadRpcPendingCache.clear();
    municipalSnapshotCache.clear();
    municipalSnapshotPendingCache.clear();
    fleetVehicleBoardCache.clear();
    fleetVehicleBoardPendingCache.clear();
    hrDailyAttendanceSummaryCache.clear();
    hrDailyAttendanceSummaryPendingCache.clear();
    return;
  }

  for (const key of odooReadRpcCache.keys()) {
    if (key.includes(authKey)) {
      odooReadRpcCache.delete(key);
    }
  }
  for (const key of odooReadRpcPendingCache.keys()) {
    if (key.includes(authKey)) {
      odooReadRpcPendingCache.delete(key);
    }
  }
  municipalSnapshotCache.delete(authKey);
  municipalSnapshotPendingCache.delete(authKey);
  fleetVehicleBoardCache.delete(authKey);
  fleetVehicleBoardPendingCache.delete(authKey);
  hrDailyAttendanceSummaryCache.delete(authKey);
  hrDailyAttendanceSummaryPendingCache.delete(authKey);
}

function readCachedMunicipalSnapshot(connection: OdooConnection) {
  const cacheKey = getMunicipalSnapshotCacheKey(connection);
  const cached = municipalSnapshotCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    municipalSnapshotCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function writeCachedMunicipalSnapshot(connection: OdooConnection, value: DashboardSnapshot) {
  municipalSnapshotCache.set(getMunicipalSnapshotCacheKey(connection), {
    value,
    expiresAt: Date.now() + MUNICIPAL_SNAPSHOT_CACHE_TTL_MS,
  });
}

function readCachedFleetVehicleBoard(connection: OdooConnection) {
  const cacheKey = getMunicipalSnapshotCacheKey(connection);
  const cached = fleetVehicleBoardCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    fleetVehicleBoardCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function writeCachedFleetVehicleBoard(connection: OdooConnection, value: FleetVehicleBoard) {
  fleetVehicleBoardCache.set(getMunicipalSnapshotCacheKey(connection), {
    value,
    expiresAt: Date.now() + FLEET_VEHICLE_BOARD_CACHE_TTL_MS,
  });
}

function readCachedOdooAuth(connection: OdooConnection): OdooAuthSession | null {
  const cached = odooAuthCache.get(getOdooAuthCacheKey(connection));
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    odooAuthCache.delete(getOdooAuthCacheKey(connection));
    return null;
  }

  return {
    uid: cached.uid,
    connection: cached.connection,
  };
}

function writeCachedOdooAuth(uid: number, connection: OdooConnection) {
  odooAuthCache.set(getOdooAuthCacheKey(connection), {
    uid,
    connection,
    expiresAt: Date.now() + ODOO_AUTH_CACHE_TTL_MS,
  });
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
  "Ð¡Ð°Ð½Ñ…Ò¯Ò¯Ð³Ð¸Ð¹Ð½ Ð°Ð»Ð±Ð°": "Ð¡Ð°Ð½Ñ…Ò¯Ò¯, Ñ‚Ó©Ð»Ó©Ð²Ð»Ó©Ð»Ñ‚, Ñ‚Ð°Ð¹Ð»Ð°Ð³Ð½Ð°Ð»",
  "Ð—Ð°Ñ…Ð¸Ñ€Ð³Ð°Ð°Ð½Ñ‹ Ð°Ð»Ð±Ð°": "Ð—Ð°Ñ…Ð¸Ñ€Ð³Ð°Ð°, Ð±Ð¸Ñ‡Ð¸Ð³ Ñ…ÑÑ€ÑÐ³, ÑƒÐ´Ð¸Ñ€Ð´Ð»Ð°Ð³Ð°",
  "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð·, Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ": "Ð¢ÐµÑ…Ð½Ð¸Ðº, Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚, Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚",
  "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ":
    "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ð·Ð°Ð¼ Ñ‚Ð°Ð»Ð±Ð°Ð¹Ð½ Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ",
  "Ð¢Ð¾Ñ…Ð¸Ð¶Ð¸Ð»Ñ‚Ñ‹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ": "ÐÐ¸Ð¹Ñ‚Ð¸Ð¹Ð½ Ñ‚Ð°Ð»Ð±Ð°Ð¹, Ð·Ð°ÑÐ²Ð°Ñ€, Ñ‚Ð¾Ñ…Ð¸Ð¶Ð¸Ð»Ñ‚",
};

const DEPARTMENT_ACCENTS: Record<string, string> = {
  "Ð¡Ð°Ð½Ñ…Ò¯Ò¯Ð³Ð¸Ð¹Ð½ Ð°Ð»Ð±Ð°": "var(--tone-blue)",
  "Ð—Ð°Ñ…Ð¸Ñ€Ð³Ð°Ð°Ð½Ñ‹ Ð°Ð»Ð±Ð°": "var(--tone-slate)",
  "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð·, Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ": "var(--tone-amber)",
  "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ": "var(--tone-teal)",
  "Ð¢Ð¾Ñ…Ð¸Ð¶Ð¸Ð»Ñ‚Ñ‹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ": "var(--tone-slate)",
};

const OPERATION_TYPE_LABELS: Record<string, string> = {
  garbage: "Ð¥Ð¾Ð³ Ñ†ÑƒÐ³Ð»ÑƒÑƒÐ»Ð°Ð»Ñ‚",
  garbage_seasonal: "Ð£Ð»Ð¸Ñ€Ð»Ñ‹Ð½ Ñ…Ð¾Ð³ Ð°Ñ‡Ð¸Ð»Ñ‚",
  street_cleaning: "Ð“ÑƒÐ´Ð°Ð¼Ð¶ Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ",
  green_maintenance: "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶",
};

const STAGE_LABELS: Record<StageBucket, string> = {
  todo: "Ð¥Ð¸Ð¹Ð³Ð´ÑÑ… Ð°Ð¶Ð¸Ð»",
  progress: "Ð¯Ð²Ð°Ð³Ð´Ð°Ð¶ Ð±ÑƒÐ¹ Ð°Ð¶Ð¸Ð»",
  review: "Ð¥ÑÐ½Ð°Ð³Ð´Ð°Ð¶ Ð±ÑƒÐ¹ Ð°Ð¶Ð¸Ð»",
  done: "Ð”ÑƒÑƒÑÑÐ°Ð½ Ð°Ð¶Ð¸Ð»",
  problem: "Ð—Ð°ÑÐ²Ð°Ñ€ ÑˆÐ°Ð°Ñ€Ð´ÑÐ°Ð½ Ð°Ð¶Ð¸Ð»",
  unknown: "Ð¢Ð¾Ð´Ð¾Ñ€Ñ…Ð¾Ð¹Ð³Ò¯Ð¹",
};

const TASK_STATUS_LABELS: Record<TaskStatusKey, string> = {
  planned: "Ð¢Ó©Ð»Ó©Ð²Ð»Ó©Ð³Ð´ÑÓ©Ð½",
  working: "ÐÐ¶Ð¸Ð»Ð»Ð°Ð¶ Ð±Ð°Ð¹Ð½Ð°",
  review: "Ð¥ÑÐ½Ð°Ð³Ð´Ð°Ð¶ Ð±Ð°Ð¹Ð½Ð°",
  verified: "Ð‘Ð°Ñ‚Ð°Ð»Ð³Ð°Ð°Ð¶ÑÐ°Ð½",
  problem: "Ð—Ð°ÑÐ²Ð°Ñ€ ÑˆÐ°Ð°Ñ€Ð´ÑÐ°Ð½",
};

const UNKNOWN_DEPARTMENT = "Ð¢Ð¾Ð´Ð¾Ñ€Ñ…Ð¾Ð¹Ð³Ò¯Ð¹";
const AUTO_BASE_DEPARTMENT = "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð·, Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ";
const AUTO_BASE_UNIT = "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð·";
const WASTE_TRANSPORT_UNIT = "Ð¥Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚";

const KNOWN_STAGE_MATCHERS: Array<[StageBucket, string[]]> = [
  ["todo", ["Ñ…Ð¸Ð¹Ð³Ð´ÑÑ…", "todo", "task"]],
  ["progress", ["ÑÐ²Ð°Ð³Ð´Ð°Ð¶", "Ñ…Ð¸Ð¹Ð³Ð´ÑÐ¶", "Ñ…Ð¸Ð¹Ð¶ Ð±Ð°Ð¹Ð½Ð°", "Ð°Ð¶Ð¸Ð»Ð»Ð°Ð¶", "progress", "hiihdej", "in progress"]],
  ["review", ["ÑˆÐ°Ð»Ð³Ð°Ð³Ð´Ð°Ð¶", "Ñ…ÑÐ½Ð°Ð³Ð´Ð°Ð¶", "review", "changes requested", "shalgagdaj", "shalgah", "hyanagdaj"]],
  ["done", ["Ð´ÑƒÑƒÑÑÐ°Ð½", "done", "completed", "duussan"]],
  ["todo", ["Ñ‚Ó©Ð»Ó©Ð²Ð»Ó©Ð³Ð´ÑÓ©Ð½", "Ñ…ÑƒÐ²Ð°Ð°Ñ€Ð¸Ð»ÑÐ°Ð½"]],
  ["progress", ["Ð³Ò¯Ð¹Ñ†ÑÑ‚Ð³ÑÐ¶"]],
  ["review", ["ÑˆÐ°Ð»Ð³Ð°Ð¶"]],
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

type QuantityLine = {
  quantity: number;
  unit: string;
  completedQuantity?: number;
  progress?: number;
};

type TaskQuantitySnapshot = {
  stageBucket: StageBucket;
  statusKey: TaskStatusKey;
  progress: number;
  plannedQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  quantitySummary: string;
};

function clampPercentValue(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return namedEntities[normalized] ?? match;
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

function extractTaskReturnReason(value?: string | false) {
  const text = htmlToPlainText(value);
  if (!text) {
    return "";
  }

  const markerMatch = text.match(/Ð—Ð°ÑÐ²Ð°Ñ€\s+Ð½ÑÑ…ÑÐ¶\s+Ð±ÑƒÑ†Ð°Ð°ÑÐ°Ð½\s+ÑˆÐ°Ð»Ñ‚Ð³Ð°Ð°Ð½\s*:?\s*/i);
  if (!markerMatch || markerMatch.index === undefined) {
    return "";
  }

  return text
    .slice(markerMatch.index + markerMatch[0].length)
    .split(/\n{2,}/)[0]
    .trim();
}

function normalizeQuantityUnit(value: string) {
  return value
    .toLowerCase()
    .replace(/[.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTaskQuantityLines(description: string): QuantityLine[] {
  const markerIndex = description.toLowerCase().indexOf("Ñ‚Ð¾Ð¾ Ñ…ÑÐ¼Ð¶ÑÑ");
  if (markerIndex === -1) {
    return [];
  }

  const quantityText = description.slice(markerIndex).replace(/^Ñ‚Ð¾Ð¾ Ñ…ÑÐ¼Ð¶ÑÑ\s*:?\s*/i, "");
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

function extractReportQuantityLines(reportText: string): QuantityLine[] {
  const normalizedText = htmlToPlainText(reportText);
  const markerMatch = normalizedText.match(/Ð³Ò¯Ð¹Ñ†ÑÑ‚Ð³ÑÑÑÐ½\s+Ñ…ÑÐ¼Ð¶ÑÑ\s*:?\s*/i);
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
      (line): line is QuantityLine =>
        line !== null &&
        Number.isFinite(line.quantity) &&
        line.quantity >= 0 &&
        Boolean(line.unit),
    );
}

function buildTaskQuantitySnapshot(task: OdooTaskRecord, reports: OdooReportRecord[]): TaskQuantitySnapshot {
  const rawStageBucket = getStageBucket(relationName(task.stage_id, ""));
  const taskStateBucket = reportStateBucket(task.state);
  const mfoStateBucket = reportStateBucket(task.mfo_state);
  const hasReturnedReport = reports.some((report) => reportStateBucket(report.state) === "problem");
  const forcedProblem = taskStateBucket === "problem" || mfoStateBucket === "problem" || hasReturnedReport;
  const plannedLines = extractTaskQuantityLines(htmlToPlainText(task.description));
  if (!plannedLines.length && (task.ops_planned_quantity ?? 0) > 0) {
    plannedLines.push({
      quantity: task.ops_planned_quantity ?? 0,
      unit: resolveTaskMeasurementUnit(task) || "Ð½ÑÐ³Ð¶",
    });
  }

  const completedByUnit = new Map<string, number>();
  for (const report of reports) {
    const parsedLines = extractReportQuantityLines(report.report_text || report.report_summary || "");
    if (parsedLines.length) {
      for (const line of parsedLines) {
        const key = normalizeQuantityUnit(line.unit);
        completedByUnit.set(key, (completedByUnit.get(key) ?? 0) + line.quantity);
      }
      continue;
    }

    const reportedQuantity = report.reported_quantity ?? 0;
    if (reportedQuantity > 0 && plannedLines.length === 1) {
      const key = normalizeQuantityUnit(plannedLines[0].unit);
      completedByUnit.set(key, (completedByUnit.get(key) ?? 0) + reportedQuantity);
    }
  }

  const quantityLines = plannedLines.map((line) => {
    const completedQuantity = completedByUnit.get(normalizeQuantityUnit(line.unit)) ?? 0;
    const cappedCompletedQuantity = Math.min(completedQuantity, line.quantity);
    const progress = line.quantity > 0 ? (cappedCompletedQuantity / line.quantity) * 100 : 0;

    return {
      ...line,
      completedQuantity,
      progress,
    };
  });
  const plannedQuantity = quantityLines.length
    ? quantityLines.reduce((total, line) => total + line.quantity, 0)
    : (task.ops_planned_quantity ?? 0);
  const parsedCompletedQuantity = quantityLines.reduce(
    (total, line) => total + Math.min(line.completedQuantity ?? 0, line.quantity),
    0,
  );
  const fallbackCompletedQuantity = task.ops_completed_quantity ?? 0;
  const completedQuantity =
    rawStageBucket === "done" && parsedCompletedQuantity <= 0 && plannedQuantity > 0
      ? plannedQuantity
      : parsedCompletedQuantity > 0
        ? parsedCompletedQuantity
        : fallbackCompletedQuantity;
  const parsedProgress = quantityLines.length
    ? quantityLines.reduce((total, line) => total + (line.progress ?? 0), 0) / quantityLines.length
    : 0;
  const rawProgress = task.ops_progress_percent ?? 0;
  const progress =
    rawStageBucket === "done" && Math.max(parsedProgress, rawProgress) <= 0
      ? 100
      : Math.max(parsedProgress, rawProgress);
  const stageBucket =
    forcedProblem
      ? "problem"
      : rawStageBucket === "review"
      ? "review"
      : rawStageBucket === "done" || progress >= 100
        ? "done"
        : rawStageBucket === "progress" || progress > 0
          ? "progress"
          : rawStageBucket;
  const rawStatusKey = getTaskStatusKey(task);
  const statusKey =
    forcedProblem || rawStatusKey === "problem"
      ? "problem"
      : stageBucket === "done"
      ? "verified"
      : stageBucket === "review"
        ? "review"
        : stageBucket === "progress"
          ? "working"
          : rawStatusKey;

  return {
    stageBucket,
    statusKey,
    progress: clampPercentValue(progress),
    plannedQuantity,
    completedQuantity,
    remainingQuantity: Math.max(plannedQuantity - completedQuantity, 0),
    quantitySummary: quantityLines.length
      ? quantityLines
          .map((line) => {
            const done =
              stageBucket === "done" && (line.completedQuantity ?? 0) <= 0
                ? line.quantity
                : (line.completedQuantity ?? 0);
            return `${done}/${line.quantity} ${line.unit}`.trim();
          })
          .join(", ")
      : plannedQuantity > 0
        ? `${completedQuantity}/${plannedQuantity} ${resolveTaskMeasurementUnit(task) || "Ð½ÑÐ³Ð¶"}`
        : "",
  };
}

const TASK_FIELD_VARIANTS: string[][] = [
  [
    "name",
    "project_id",
    "stage_id",
    "state",
    "mfo_state",
    "municipal_work_id",
    "description",
    "create_date",
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
    "state",
    "mfo_state",
    "municipal_work_id",
    "description",
    "create_date",
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
    "state",
    "mfo_state",
    "municipal_work_id",
    "description",
    "create_date",
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
    "state",
    "mfo_state",
    "municipal_work_id",
    "description",
    "create_date",
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
    "report_text",
    "report_summary",
    "reported_quantity",
    "state",
    "rejection_reason",
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
    "report_text",
    "report_summary",
    "reported_quantity",
    "state",
    "rejection_reason",
    "task_measurement_unit_id",
    "task_measurement_unit_code",
    "image_count",
    "audio_count",
  ],
  [
    "task_id",
    "reporter_id",
    "report_datetime",
    "report_text",
    "report_summary",
    "reported_quantity",
    "state",
    "rejection_reason",
    "task_measurement_unit_id",
    "task_measurement_unit_code",
  ],
  [
    "task_id",
    "reporter_id",
    "report_datetime",
    "report_text",
    "report_summary",
    "reported_quantity",
    "state",
    "rejection_reason",
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
    "birthday",
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

const HR_ATTENDANCE_EMPLOYEE_FIELD_VARIANTS: string[][] = [
  ["name", "active", "x_mn_employment_status"],
  ["name", "active"],
];

const HR_ATTENDANCE_FIELD_VARIANTS: string[][] = [
  ["employee_id", "check_in", "check_out"],
  ["employee_id", "check_in"],
];

const HR_LEAVE_FIELD_VARIANTS: string[][] = [
  [
    "employee_id",
    "state",
    "holiday_status_id",
    "request_date_from",
    "request_date_to",
    "date_from",
    "date_to",
  ],
  ["employee_id", "state", "holiday_status_id", "request_date_from", "request_date_to"],
  ["employee_id", "state", "holiday_status_id", "date_from", "date_to"],
  ["employee_id", "holiday_status_id"],
];

const FLEET_VEHICLE_FIELD_VARIANTS: string[][] = [
  [
    "name",
    "license_plate",
    "image_128",
    "model_id",
    "category_id",
    "municipal_vehicle_type_id",
    "municipal_department_id",
    "municipal_responsible_driver_id",
    "municipal_loader_1_id",
    "municipal_loader_2_id",
    "x_municipal_operational_status",
    "vin_sn",
    "odometer",
    "fuel_type",
    "driver_id",
    "state_id",
    "mfo_active_for_ops",
    "latest_repair_state",
    "vehicle_downtime_open",
    "municipal_insurance_company",
    "municipal_insurance_policy_number",
    "municipal_insurance_date_start",
    "municipal_insurance_date_end",
    "municipal_insurance_days_remaining",
    "municipal_insurance_reminder_due",
    "municipal_insurance_note",
    "municipal_insurance_attachment_ids",
    "municipal_inspection_date",
    "municipal_next_inspection_date",
    "municipal_inspection_days_remaining",
    "municipal_inspection_reminder_due",
    "municipal_inspection_note",
    "municipal_inspection_attachment_ids",
    "active",
  ],
  [
    "name",
    "license_plate",
    "avatar_128",
    "model_id",
    "category_id",
    "municipal_vehicle_type_id",
    "municipal_department_id",
    "municipal_responsible_driver_id",
    "municipal_loader_1_id",
    "municipal_loader_2_id",
    "x_municipal_operational_status",
    "vin_sn",
    "odometer",
    "fuel_type",
    "driver_id",
    "state_id",
    "municipal_insurance_company",
    "municipal_insurance_policy_number",
    "municipal_insurance_date_start",
    "municipal_insurance_date_end",
    "municipal_insurance_days_remaining",
    "municipal_insurance_reminder_due",
    "municipal_insurance_note",
    "municipal_insurance_attachment_ids",
    "municipal_inspection_date",
    "municipal_next_inspection_date",
    "municipal_inspection_days_remaining",
    "municipal_inspection_reminder_due",
    "municipal_inspection_note",
    "municipal_inspection_attachment_ids",
    "active",
  ],
  [
    "name",
    "license_plate",
    "image_1920",
    "model_id",
    "category_id",
    "municipal_vehicle_type_id",
    "municipal_department_id",
    "municipal_responsible_driver_id",
    "municipal_loader_1_id",
    "municipal_loader_2_id",
    "x_municipal_operational_status",
    "vin_sn",
    "odometer",
    "fuel_type",
    "driver_id",
    "state_id",
    "active",
  ],
  [
    "name",
    "license_plate",
    "model_id",
    "category_id",
    "municipal_vehicle_type_id",
    "municipal_department_id",
    "municipal_responsible_driver_id",
    "municipal_loader_1_id",
    "municipal_loader_2_id",
    "vin_sn",
    "odometer",
    "fuel_type",
    "driver_id",
    "state_id",
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

const VEHICLE_DRIVER_HISTORY_FIELDS = [
  "vehicle_id",
  "driver_id",
  "date_start",
  "date_end",
  "changed_by_id",
  "changed_date",
];

const VEHICLE_REPAIR_HISTORY_FIELDS = [
  "name",
  "vehicle_id",
  "request_date",
  "repair_started_at",
  "repair_done_at",
  "damage_type",
  "issue_summary",
  "issue_description",
  "description",
  "parts_note",
  "amount_total",
  "actual_cost",
  "mechanic_id",
  "state",
  "procurement_request_id",
  "attachment_ids",
  "photo_ids",
];

const VEHICLE_WEIGHT_REPORT_FIELDS = [
  "report_date",
  "vehicle_id",
  "weight",
  "unit",
  "source",
  "fetched_at",
  "state",
  "error_message",
];

const VEHICLE_FUEL_REPORT_FIELDS = [
  "report_date",
  "vehicle_id",
  "fuel_liters",
  "fuel_type",
  "source",
  "fetched_at",
  "state",
  "error_message",
];

const VEHICLE_PROCUREMENT_FIELDS = [
  "name",
  "vehicle_id",
  "repair_id",
  "amount_total",
  "state",
];

type OdooFieldMetadata = {
  relation?: string;
};

type OdooNameOptionRecord = {
  id: number;
  name?: string | false;
  parent_id?: OdooRelation;
};

function relationName(relation: OdooRelation, fallback = "ÐžÐ½Ð¾Ð¾Ð³Ð¾Ð¾Ð³Ò¯Ð¹") {
  return Array.isArray(relation) ? relation[1] : fallback;
}

function relationId(relation: OdooRelation) {
  return Array.isArray(relation) ? relation[0] : null;
}

async function loadFleetVehicleDepartmentOptions(
  uid: number,
  connection: OdooConnection,
): Promise<FleetVehicleDepartmentOption[]> {
  return loadFleetVehicleRelationOptions(uid, connection, "municipal_department_id", (record) => (
    normalizeOrganizationUnitName(
      `${relationName(record.parent_id ?? false, "")} ${String(record.name || "")}`,
    ) ||
    normalizeOrganizationUnitName(String(record.name || "")) ||
    String(record.name || "").trim()
  ));
}

async function loadFleetVehicleRelationOptions(
  uid: number,
  connection: OdooConnection,
  fieldName: string,
  normalizeOptionName?: (record: OdooNameOptionRecord) => string,
): Promise<FleetVehicleSelectOption[]> {
  let relationModel = "";

  try {
    const metadata = await executeKw<Record<string, OdooFieldMetadata>>(
      uid,
      "fleet.vehicle",
      "fields_get",
      [[fieldName]],
      {
        attributes: ["relation"],
      },
      connection,
    );
    relationModel = metadata[fieldName]?.relation || "";
  } catch (error) {
    console.warn(`Fleet vehicle relation for ${fieldName} could not be resolved:`, error);
    return [];
  }

  if (!relationModel) {
    return [];
  }

  const loadOptions = (domain: unknown[]) =>
    searchReadAllWithFieldFallback<OdooNameOptionRecord>(
      uid,
      relationModel,
      domain,
      [
        ["name", "parent_id"],
        ["name"],
      ],
      {
        order: "name asc",
      },
      connection,
    );

  const records = await loadOptions([["active", "=", true]]).catch(() => loadOptions([]));
  return records
    .map((record) => ({
      id: record.id,
      name: normalizeOptionName?.(record) || String(record.name || "").trim(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "mn"))
    .filter((record) => record.name);
}

function resolveHrEmploymentStatus(employee: OdooEmployeeRecord) {
  if (employee.active === false) {
    return { key: "archived", label: "ÐÑ€Ñ…Ð¸Ð²Ð»Ð°ÑÐ°Ð½" };
  }

  const status = employee.x_mn_employment_status || "active";
  const labels: Record<string, string> = {
    active: "Ð˜Ð´ÑÐ²Ñ…Ñ‚ÑÐ¹",
    probation: "Ð¢ÑƒÑ€ÑˆÐ¸Ð»Ñ‚",
    leave: "Ð§Ó©Ð»Ó©Ó©Ñ‚ÑÐ¹",
    sick: "Ó¨Ð²Ñ‡Ñ‚ÑÐ¹",
    business_trip: "Ð¢Ð¾Ð¼Ð¸Ð»Ð¾Ð»Ñ‚Ñ‚Ð¾Ð¹",
    suspended: "Ð¢Ò¯Ð´Ð³ÑÐ»Ð·ÑÑÐ½",
    terminated: "Ð§Ó©Ð»Ó©Ó©Ð»Ó©Ð³Ð´ÑÓ©Ð½",
    resigned: "ÐÐ¶Ð»Ð°Ð°Ñ Ð³Ð°Ñ€ÑÐ°Ð½",
    archived: "ÐÑ€Ñ…Ð¸Ð²Ð»Ð°ÑÐ°Ð½",
    rehired: "Ð”Ð°Ñ…Ð¸Ð½ Ð°Ð²ÑÐ°Ð½",
  };

  return {
    key: status,
    label: labels[status] ?? "Ð˜Ð´ÑÐ²Ñ…Ñ‚ÑÐ¹",
  };
}

function normalizeHrStatusText(value?: string | false | null) {
  return (typeof value === "string" ? value : "").trim().toLowerCase();
}

function isWorkingHrStatus(employee: OdooEmployeeRecord) {
  const status = resolveHrEmploymentStatus(employee).key;
  return employee.active !== false && ["active", "probation", "rehired"].includes(status);
}

function includesAnyToken(value: string, tokens: string[]) {
  return tokens.some((token) => value.includes(token));
}

function isSickHrText(value?: string | false | null) {
  const normalized = normalizeHrStatusText(value);
  return includesAnyToken(normalized, ["sick", "ill", "medical", "ovch", "emneleg", "Ó©Ð²Ñ‡", "ÑÐ¼Ð½ÑÐ»"]);
}

function isAbsentHrText(value?: string | false | null) {
  const normalized = normalizeHrStatusText(value);
  return includesAnyToken(normalized, ["absent", "no show", "tas", "ireegui", "Ñ‚Ð°Ñ", "Ð¸Ñ€ÑÑÐ³Ò¯Ð¹"]);
}

function formatOdooDateTimeBoundary(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function ulaanbaatarDayStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+08:00`);
}

function getNextDateKey(dateKey: string) {
  const nextDate = ulaanbaatarDayStart(dateKey);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return getTodayDateKey(nextDate);
}

function resolveHrGenderLabel(value?: string | false) {
  const labels: Record<string, string> = {
    male: "Ð­Ñ€ÑÐ³Ñ‚ÑÐ¹",
    female: "Ð­Ð¼ÑÐ³Ñ‚ÑÐ¹",
    other: "Ð‘ÑƒÑÐ°Ð´",
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
    "Ñ†ÑƒÑ†Ð»Ð°Ð³Ð´ÑÐ°Ð½",
    "Ð´ÑƒÑƒÑÑÐ°Ð½",
    "Ð±Ð°Ñ‚Ð°Ð»Ð³Ð°Ð°Ð¶ÑÐ°Ð½",
  ];
  if (resolvedTokens.some((token) => normalized.includes(token))) {
    return false;
  }

  return [
    "Ð·Ð°ÑÐ°Ð³Ð´Ð°Ð¶",
    "Ð·Ð°ÑÐ²Ð°Ñ€Ñ‚",
    "repair",
    "waiting repair",
    "parts received",
    "approval",
  ].some((token) => normalized.includes(token));
}

function formatCompactDate(value?: string | false) {
  if (!value) {
    return "Ð¢Ð¾Ð²Ð»Ð¾Ð¾Ð³Ò¯Ð¹";
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
  pcs: "Ð¨Ð¸Ñ€Ñ…ÑÐ³",
  kg: "ÐšÐ³",
  tn: "Ð¢Ð½",
  m: "ÐœÐµÑ‚Ñ€",
  km: "ÐšÐ¼",
  m2: "ÐœÂ²",
  m3: "ÐœÂ³",
  liter: "Ð›Ð¸Ñ‚Ñ€",
  times: "Ð£Ð´Ð°Ð°",
  point: "Ð¦ÑÐ³",
  vehicle: "ÐœÐ°ÑˆÐ¸Ð½",
  tree: "ÐœÐ¾Ð´",
};

const UNIT_CODE_ALIASES: Record<string, string> = {
  "ÑˆÐ¸Ñ€Ñ…ÑÐ³": "pcs",
  "Ñˆ": "pcs",
  pcs: "pcs",
  piece: "pcs",
  pieces: "pcs",
  "ÐºÐ³": "kg",
  kg: "kg",
  kilogram: "kg",
  "Ñ‚Ð½": "tn",
  tn: "tn",
  ton: "tn",
  "Ð¼ÐµÑ‚Ñ€": "m",
  "Ð¼": "m",
  m: "m",
  "ÐºÐ¼": "km",
  km: "km",
  "Ð¼2": "m2",
  "Ð¼Â²": "m2",
  sqm: "m2",
  "Ð¼3": "m3",
  "Ð¼Â³": "m3",
  "Ð¼ÐºÑƒÐ±": "m3",
  m3: "m3",
  "Ð»Ð¸Ñ‚Ñ€": "liter",
  "Ð»": "liter",
  liter: "liter",
  "ÑƒÐ´Ð°Ð°": "times",
  "Ñ€ÐµÐ¹Ñ": "times",
  times: "times",
  "Ñ†ÑÐ³": "point",
  point: "point",
  "Ð¼Ð°ÑˆÐ¸Ð½": "vehicle",
  vehicle: "vehicle",
  "Ð¼Ð¾Ð´": "tree",
  tree: "tree",
};

function normalizeUnitValue(value?: string | false) {
  const rawValue = typeof value === "string" ? value : "";
  return rawValue
    .trim()
    .toLowerCase()
    .replace(/[.\s_-]+/g, "")
    .replace("Â²", "2")
    .replace("Â³", "3");
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
  fallback = "Ð½ÑÐ³Ð¶",
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

function resolveTaskMeasurementUnit(task: OdooTaskRecord, fallback = "Ð½ÑÐ³Ð¶") {
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

  if (haystack.includes("Ñ…Ð¾Ð³") || haystack.includes("Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚") || haystack.includes("Ð°Ñ‡Ð¸Ð»Ñ‚")) {
    return WASTE_TRANSPORT_UNIT;
  }
  if (haystack.includes("Ð°Ð²Ñ‚Ð¾") || haystack.includes("Ð¼Ð°ÑˆÐ¸Ð½") || haystack.includes("Ñ‚ÐµÑ…Ð½Ð¸Ðº")) {
    return AUTO_BASE_UNIT;
  }

  const canonicalName = normalizeOrganizationUnitName(text);
  if (canonicalName) {
    return canonicalName;
  }

  if (haystack.includes("Ð¼Ð¾Ð´") || haystack.includes("Ð½Ð¾Ð³Ð¾Ð¾Ð½") || haystack.includes("Ð·Ò¯Ð»ÑÐ³")) {
    return "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ";
  }
  if (
    haystack.includes("Ð·Ð°Ð¼") ||
    haystack.includes("Ñ‚Ð°Ð»Ð±Ð°Ð¹") ||
    haystack.includes("Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ") ||
    haystack.includes("Ð³ÑƒÐ´Ð°Ð¼Ð¶")
  ) {
    return "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ";
  }
  if (haystack.includes("Ñ‚Ð¾Ñ…Ð¸Ð¶Ð¸Ð»Ñ‚") || haystack.includes("Ð·Ð°ÑÐ²Ð°Ñ€")) {
    return "Ð¢Ð¾Ñ…Ð¸Ð¶Ð¸Ð»Ñ‚Ñ‹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ";
  }
  return UNKNOWN_DEPARTMENT;
}

function departmentUnitFromOperationType(operationType?: string | false) {
  if (operationType === "garbage" || operationType === "garbage_seasonal") {
    return WASTE_TRANSPORT_UNIT;
  }
  if (operationType === "street_cleaning") {
    return "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ";
  }
  if (operationType === "green_maintenance") {
    return "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ";
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
    normalized === "Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ"
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
      return "Ð¯Ð°Ñ€Ð°Ð»Ñ‚Ð°Ð¹";
    case "2":
      return "Ó¨Ð½Ð´Ó©Ñ€";
    case "1":
      return "Ð”ÑƒÐ½Ð´";
    default:
      return "Ð¢Ð¾Ð³Ñ‚Ð¼Ð¾Ð»";
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
    return "Ð•Ñ€Ó©Ð½Ñ…Ð¸Ð¹ Ð°Ð¶Ð¸Ð»";
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

  const projectId = Array.isArray(task.project_id) ? task.project_id[0] : null;
  if (projectId && projectDepartmentById.get(projectId)) {
    return normalizeDepartmentUnitName(projectDepartmentById.get(projectId) as string, {
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

function reportStateLabel(state?: string | false) {
  switch (String(state || "").toLowerCase()) {
    case "submitted":
    case "under_review":
      return "Ð¢Ð°Ð¹Ð»Ð°Ð½ Ð¸Ð»Ð³ÑÑÑÑÐ½";
    case "returned":
    case "rejected":
      return "Ð‘ÑƒÑ†Ð°Ð°Ð³Ð´ÑÐ°Ð½";
    case "approved":
      return "Ð‘Ð°Ñ‚Ð°Ð»Ð³Ð°Ð°Ð¶ÑÐ°Ð½";
    case "draft":
      return "ÐÐ¾Ð¾Ñ€Ð¾Ð³";
    default:
      return state ? String(state) : "Ð¢Ð°Ð¹Ð»Ð°Ð½";
  }
}

function reportStateBucket(
  state?: string | false,
): TaskDirectoryReportSummary["stateBucket"] {
  switch (String(state || "").toLowerCase()) {
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
  return DEPARTMENT_LABELS[name as keyof typeof DEPARTMENT_LABELS] ?? "ÐÐ¶Ð»Ñ‹Ð½ Ñ…Ð°Ñ€ÑŒÑÐ°Ð»Ð°Ð»";
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

  if (normalized.includes("ÑÐ°Ð½Ñ…Ò¯Ò¯")) {
    return "â‚®";
  }

  if (normalized.includes("Ð·Ð°Ñ…Ð¸Ñ€Ð³Ð°Ð°") || normalized.includes("ÑƒÐ´Ð¸Ñ€Ð´Ð»Ð°Ð³Ð°")) {
    return "ðŸ¢";
  }

  if (normalized.includes("Ð°Ð²Ñ‚Ð¾") || normalized.includes("Ð¼Ð°ÑˆÐ¸Ð½") || normalized.includes("Ñ‚ÐµÑ…Ð½Ð¸Ðº")) {
    return "ðŸšš";
  }

  if (normalized.includes("Ñ…Ð¾Ð³") || normalized.includes("Ð°Ñ‡Ð¸Ð»Ñ‚") || normalized.includes("Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚")) {
    return "â™»ï¸";
  }

  if (normalized.includes("Ð½Ð¾Ð³Ð¾Ð¾Ð½") || normalized.includes("Ð¼Ð¾Ð´") || normalized.includes("Ð·Ò¯Ð»ÑÐ³")) {
    return "ðŸŒ¿";
  }

  if (normalized.includes("Ð·Ð°Ð¼") || normalized.includes("Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ") || normalized.includes("Ð³ÑƒÐ´Ð°Ð¼Ð¶")) {
    return "ðŸ§¹";
  }

  if (normalized.includes("Ñ‚Ð¾Ñ…Ð¸Ð¶Ð¸Ð»Ñ‚") || normalized.includes("Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑ") || normalized.includes("Ð·Ð°ÑÐ²Ð°Ñ€")) {
    return "ðŸ™ï¸";
  }

  return "ðŸ¢";
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
    signal: AbortSignal.timeout(ODOO_RPC_TIMEOUT_MS),
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
    throw new Error(`Odoo JSON-RPC Ñ…Ò¯ÑÑÐ»Ñ‚ HTTP ${response.status} Ð°Ð»Ð´Ð°Ð°Ñ‚Ð°Ð¹ Ð´ÑƒÑƒÑÐ»Ð°Ð°.`);
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
        "Odoo JSON-RPC Ð°Ð»Ð´Ð°Ð° Ñ‚Ð¾Ð´Ð¾Ñ€Ñ…Ð¾Ð¹Ð³Ò¯Ð¹ Ð±Ð°Ð¹Ð½Ð°.",
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
  let sawAuthenticationRejection = false;

  for (const candidate of buildOdooConnectionCandidates(connection)) {
    const cached = readCachedOdooAuth(candidate);
    if (cached) {
      return cached;
    }

    try {
      const uid = await authenticate(candidate);
      if (uid) {
        writeCachedOdooAuth(uid, candidate);
        return {
          uid,
          connection: candidate,
        };
      }
      sawAuthenticationRejection = true;
    } catch (error) {
      lastError = error;
    }
  }

  if (sawAuthenticationRejection) {
    return null;
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
  ).catch((error) => {
    if (!String(error).includes("ops_user_type")) {
      throw error;
    }

    return executeKw<OdooUserRecord[]>(
      uid,
      "res.users",
      "search_read",
      [[["id", "=", uid]]],
      {
        fields: ["name", "login"],
        limit: 1,
      },
      connection,
    );
  });

  const user = users[0];
  if (!user) {
    return null;
  }

  const employee = await executeKw<OdooAuthEmployeeRecord[]>(
    uid,
    "hr.employee",
    "search_read",
    [[["user_id", "=", uid]]],
    {
      fields: ["name", "job_id", "job_title", "department_id"],
      limit: 1,
    },
    connection,
  )
    .then((employees) => employees[0] ?? null)
    .catch(() => null);

  const hasGroup = (xmlId: string) =>
    executeKw<boolean>(
      uid,
      "res.users",
      "has_group",
      [[uid], xmlId],
      {},
      connection,
    ).catch(() => false);

  const [
    systemAdmin,
    municipalWorker,
    municipalMaster,
    municipalInspector,
    municipalDepartmentHead,
    municipalManager,
    municipalDirector,
    municipalHr,
    municipalIt,
    mfoManager,
    mfoDispatcher,
    mfoInspector,
    mfoMobile,
    mfoDriver,
    mfoLoader,
    fleetRepairMechanic,
    fleetRepairTeamLeader,
    fleetRepairAccounting,
    fleetRepairAdministration,
    fleetRepairFinance,
    fleetRepairPurchaser,
    fleetRepairGeneralManager,
    fleetRepairCeo,
    fleetRepairManager,
    opsStorekeeper,
    hrUser,
    hrManager,
    municipalHse,
    municipalPublicRelations,
    complaintManager,
    environmentWorker,
    greenEngineer,
    greenMaster,
    improvementWelder,
    improvementFieldEngineer,
    improvementEngineer,
    improvementManager,
    environmentManager,
  ] = await Promise.all([
    hasGroup("base.group_system"),
    hasGroup(MUNICIPAL_CORE_GROUP_XML_IDS.worker),
    hasGroup(MUNICIPAL_CORE_GROUP_XML_IDS.master),
    hasGroup(MUNICIPAL_CORE_GROUP_XML_IDS.inspector),
    hasGroup(MUNICIPAL_CORE_GROUP_XML_IDS.departmentHead),
    hasGroup(MUNICIPAL_CORE_GROUP_XML_IDS.manager),
    hasGroup(MUNICIPAL_CORE_GROUP_XML_IDS.director),
    hasGroup(MUNICIPAL_CORE_GROUP_XML_IDS.hr),
    hasGroup(MUNICIPAL_CORE_GROUP_XML_IDS.it),
    hasGroup(MFO_GROUP_XML_IDS.manager),
    hasGroup(MFO_GROUP_XML_IDS.dispatcher),
    hasGroup(MFO_GROUP_XML_IDS.inspector),
    hasGroup(MFO_GROUP_XML_IDS.mobile),
    hasGroup(MFO_GROUP_XML_IDS.driver),
    hasGroup(MFO_GROUP_XML_IDS.loader),
    hasGroup(FLEET_REPAIR_GROUP_XML_IDS.mechanic),
    hasGroup(FLEET_REPAIR_GROUP_XML_IDS.teamLeader),
    hasGroup(FLEET_REPAIR_GROUP_XML_IDS.accounting),
    hasGroup(FLEET_REPAIR_GROUP_XML_IDS.administration),
    hasGroup(FLEET_REPAIR_GROUP_XML_IDS.finance),
    hasGroup(FLEET_REPAIR_GROUP_XML_IDS.purchaser),
    hasGroup(FLEET_REPAIR_GROUP_XML_IDS.generalManager),
    hasGroup(FLEET_REPAIR_GROUP_XML_IDS.ceo),
    hasGroup(FLEET_REPAIR_GROUP_XML_IDS.manager),
    hasGroup(OPS_PROFILE_GROUP_XML_IDS.storekeeper),
    hasGroup("hr.group_hr_user"),
    hasGroup("hr.group_hr_manager"),
    hasGroup(MUNICIPAL_CORE_GROUP_XML_IDS.hse),
    hasGroup(MUNICIPAL_CORE_GROUP_XML_IDS.publicRelations),
    hasGroup(PUBLIC_SERVICE_GROUP_XML_IDS.complaintManager),
    hasGroup(ENVIRONMENT_GROUP_XML_IDS.worker),
    hasGroup(ENVIRONMENT_GROUP_XML_IDS.greenEngineer),
    hasGroup(ENVIRONMENT_GROUP_XML_IDS.greenMaster),
    hasGroup(ENVIRONMENT_GROUP_XML_IDS.improvementWelder),
    hasGroup(ENVIRONMENT_GROUP_XML_IDS.improvementFieldEngineer),
    hasGroup(ENVIRONMENT_GROUP_XML_IDS.improvementEngineer),
    hasGroup(ENVIRONMENT_GROUP_XML_IDS.improvementManager),
    hasGroup(ENVIRONMENT_GROUP_XML_IDS.environmentManager),
  ]);
  const hasMfoMobileAccess = mfoMobile || mfoDriver || mfoLoader;
  const canPurchaseFleetRepair = fleetRepairPurchaser || opsStorekeeper;
  const fleetRepairAny =
    fleetRepairMechanic ||
    fleetRepairTeamLeader ||
    fleetRepairAccounting ||
    fleetRepairAdministration ||
    fleetRepairFinance ||
    canPurchaseFleetRepair ||
    fleetRepairGeneralManager ||
    fleetRepairCeo ||
    fleetRepairManager;

  const inferredRole = systemAdmin
    ? "system_admin"
    : resolveAuthenticatedRole(user.ops_user_type ?? false, employee);
  const role =
    inferredRole === "worker" && hrManager
      ? "hr_manager"
      : inferredRole;

  return {
    uid,
    user: {
      name: user.name,
      login: user.login,
      role,
      groupFlags: {
        municipalWorker,
        municipalMaster,
        municipalInspector,
        municipalDepartmentHead,
        municipalManager,
        municipalDirector,
        municipalHr,
        municipalIt,
        mfoManager,
        mfoDispatcher,
        mfoInspector,
        mfoMobile: hasMfoMobileAccess,
        mfoDriver,
        mfoLoader,
        fleetRepairAny,
        fleetRepairMechanic,
        fleetRepairTeamLeader,
        fleetRepairAccounting,
        fleetRepairAdministration,
        fleetRepairFinance,
        fleetRepairPurchaser: canPurchaseFleetRepair,
        fleetRepairGeneralManager,
        fleetRepairCeo,
        fleetRepairManager,
        opsStorekeeper,
        hrUser,
        hrManager,
        municipalHse,
        municipalPublicRelations,
        complaintManager,
        environmentWorker,
        greenEngineer,
        greenMaster,
        improvementWelder,
        improvementFieldEngineer,
        improvementEngineer,
        improvementManager,
        environmentManager,
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
  const readRequest = isOdooReadMethod(method);
  const cacheableRead = isCacheableOdooReadRequest(model, method, kwargs);
  const cacheKey = cacheableRead
    ? getOdooReadRpcCacheKey(uid, model, method, methodArgs, kwargs, connection)
    : "";

  if (cacheKey) {
    const cached = odooReadRpcCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    if (cached) {
      odooReadRpcCache.delete(cacheKey);
    }

    const pending = odooReadRpcPendingCache.get(cacheKey);
    if (pending) {
      return pending as Promise<T>;
    }
  }

  const requestPromise = executeKwUncached<T>(uid, model, method, methodArgs, kwargs, connection)
    .then((result) => {
      if (cacheKey) {
        odooReadRpcCache.set(cacheKey, {
          value: result,
          expiresAt: Date.now() + ODOO_READ_RPC_CACHE_TTL_MS,
        });
      } else {
        if (!readRequest) {
          clearOdooReadCaches(connection);
        }
      }
      return result;
    })
    .finally(() => {
      if (cacheKey) {
        odooReadRpcPendingCache.delete(cacheKey);
      }
    });

  if (cacheKey) {
    odooReadRpcPendingCache.set(cacheKey, requestPromise);
  }

  return requestPromise;
}

async function executeKwUncached<T>(
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

  throw lastError instanceof Error ? lastError : new Error(`${model} Ó©Ð³Ó©Ð³Ð´Ó©Ð» ÑƒÐ½ÑˆÐ¸Ñ…Ð°Ð´ Ð°Ð»Ð´Ð°Ð° Ð³Ð°Ñ€Ð»Ð°Ð°.`);
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
        departmentId: Array.isArray(employee.department_id) ? employee.department_id[0] : null,
        departmentName: normalizeDepartmentUnitName(
          relationName(employee.department_id ?? false, UNKNOWN_DEPARTMENT),
        ),
        jobTitle:
          relationName(employee.job_id ?? false, "") ||
          employee.job_title ||
          "ÐÐ»Ð±Ð°Ð½ Ñ‚ÑƒÑˆÐ°Ð°Ð» Ð±Ò¯Ñ€Ñ‚Ð³ÑÑÐ³Ò¯Ð¹",
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
        birthDate: employee.birthday || "",
        genderKey: employee.sex || "",
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

async function loadTodayHrAttendanceRecords(
  uid: number,
  connection: OdooConnection,
  todayStartUtc: string,
  tomorrowStartUtc: string,
) {
  return searchReadAllWithFieldFallback<OdooHrAttendanceRecord>(
    uid,
    "hr.attendance",
    [
      ["check_in", ">=", todayStartUtc],
      ["check_in", "<", tomorrowStartUtc],
    ],
    HR_ATTENDANCE_FIELD_VARIANTS,
    {
      order: "check_in desc",
    },
    connection,
  );
}

async function loadTodayHrLeaveRecords(
  uid: number,
  connection: OdooConnection,
  todayKeyValue: string,
  todayStartUtc: string,
  tomorrowStartUtc: string,
) {
  const domains: unknown[][] = [
    [
      ["state", "in", ["validate", "validate1"]],
      ["request_date_from", "<=", todayKeyValue],
      ["request_date_to", ">=", todayKeyValue],
    ],
    [
      ["state", "in", ["validate", "validate1"]],
      ["date_from", "<", tomorrowStartUtc],
      ["date_to", ">=", todayStartUtc],
    ],
  ];

  let lastError: unknown = null;
  for (const domain of domains) {
    try {
      return await searchReadAllWithFieldFallback<OdooHrLeaveRecord>(
        uid,
        "hr.leave",
        domain,
        HR_LEAVE_FIELD_VARIANTS,
        {
          order: "id desc",
        },
        connection,
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("HR leave records could not be loaded.");
}

export async function loadHrDailyAttendanceSummary(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<HrDailyAttendanceSummary> {
  const requestedConnection = createOdooConnection(connectionOverrides);
  const cacheKey = getMunicipalSnapshotCacheKey(requestedConnection);
  const cached = hrDailyAttendanceSummaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  if (cached) {
    hrDailyAttendanceSummaryCache.delete(cacheKey);
  }

  const pending = hrDailyAttendanceSummaryPendingCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  const summaryPromise = fetchLiveHrDailyAttendanceSummary(requestedConnection).finally(() => {
    hrDailyAttendanceSummaryPendingCache.delete(cacheKey);
  });
  hrDailyAttendanceSummaryPendingCache.set(cacheKey, summaryPromise);
  return summaryPromise;
}

async function fetchLiveHrDailyAttendanceSummary(
  requestedConnection: OdooConnection,
): Promise<HrDailyAttendanceSummary> {
  const auth = await authenticateWithFallback(requestedConnection);
  if (!auth) {
    throw new Error("Odoo authentication failed");
  }

  const { uid, connection } = auth;
  const today = getTodayDateKey();
  const tomorrow = getNextDateKey(today);
  const todayStartUtc = formatOdooDateTimeBoundary(ulaanbaatarDayStart(today));
  const tomorrowStartUtc = formatOdooDateTimeBoundary(ulaanbaatarDayStart(tomorrow));

  const employees = await searchReadAllWithFieldFallback<OdooEmployeeRecord>(
    uid,
    "hr.employee",
    [],
    HR_ATTENDANCE_EMPLOYEE_FIELD_VARIANTS,
    {
      order: "name asc",
      context: {
        active_test: false,
      },
    },
    connection,
  );

  const activeEmployeeIds = new Set(
    employees.filter((employee) => employee.active !== false).map((employee) => employee.id),
  );
  const totalEmployees = activeEmployeeIds.size;

  let attendanceRecords: OdooHrAttendanceRecord[] = [];
  let leaveRecords: OdooHrLeaveRecord[] = [];
  let hasAttendanceSource = false;

  try {
    attendanceRecords = await loadTodayHrAttendanceRecords(uid, connection, todayStartUtc, tomorrowStartUtc);
    hasAttendanceSource = true;
  } catch (error) {
    console.warn("HR attendance records could not be loaded for dashboard:", error);
  }

  try {
    leaveRecords = await loadTodayHrLeaveRecords(uid, connection, today, todayStartUtc, tomorrowStartUtc);
    hasAttendanceSource = true;
  } catch (error) {
    console.warn("HR leave records could not be loaded for dashboard:", error);
  }

  const workingEmployeeIds = new Set(
    attendanceRecords
      .map((record) => relationId(record.employee_id))
      .filter((id): id is number => typeof id === "number" && activeEmployeeIds.has(id)),
  );
  const sickEmployeeIds = new Set<number>();
  const leaveEmployeeIds = new Set<number>();

  for (const record of leaveRecords) {
    const employeeId = relationId(record.employee_id);
    if (!employeeId || !activeEmployeeIds.has(employeeId) || workingEmployeeIds.has(employeeId)) {
      continue;
    }

    const leaveType = relationName(record.holiday_status_id ?? false, "");
    if (isSickHrText(leaveType)) {
      sickEmployeeIds.add(employeeId);
    } else {
      leaveEmployeeIds.add(employeeId);
    }
  }

  if (hasAttendanceSource) {
    const accountedEmployeeIds = new Set<number>([
      ...workingEmployeeIds,
      ...sickEmployeeIds,
      ...leaveEmployeeIds,
    ]);

    const summary: HrDailyAttendanceSummary = {
      totalEmployees,
      workingToday: workingEmployeeIds.size,
      absentToday: Math.max(totalEmployees - accountedEmployeeIds.size, 0),
      sickToday: sickEmployeeIds.size,
      leaveToday: leaveEmployeeIds.size,
      generatedAt: new Date().toISOString(),
      source: "attendance",
    };
    hrDailyAttendanceSummaryCache.set(getMunicipalSnapshotCacheKey(connection), {
      value: summary,
      expiresAt: Date.now() + ODOO_READ_RPC_CACHE_TTL_MS,
    });
    return summary;
  }

  const fallbackWorking = employees.filter(isWorkingHrStatus).length;
  const fallbackSick = employees.filter((employee) => isSickHrText(employee.x_mn_employment_status)).length;
  const fallbackAbsent = employees.filter((employee) => isAbsentHrText(employee.x_mn_employment_status)).length;

  const summary: HrDailyAttendanceSummary = {
    totalEmployees,
    workingToday: fallbackWorking,
    absentToday: fallbackAbsent,
    sickToday: fallbackSick,
    leaveToday: 0,
    generatedAt: new Date().toISOString(),
    source: employees.length ? "employee_status" : "empty",
  };
  hrDailyAttendanceSummaryCache.set(getMunicipalSnapshotCacheKey(connection), {
    value: summary,
    expiresAt: Date.now() + ODOO_READ_RPC_CACHE_TTL_MS,
  });
  return summary;
}

function resolveFleetFuelTypeLabel(value: string) {
  const labels: Record<string, string> = {
    gasoline: "Ð‘ÐµÐ½Ð·Ð¸Ð½",
    diesel: "Ð”Ð¸Ð·ÐµÐ»ÑŒ",
    electric: "Ð¦Ð°Ñ…Ð¸Ð»Ð³Ð°Ð°Ð½",
    hybrid: "Ð¥Ð¾ÑÐ¾Ð»ÑÐ¾Ð½",
    lpg: "Ð“Ð°Ð·",
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
        teamName: team.name || `Ð‘Ð°Ð³ #${team.id}`,
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

const FLEET_OPERATIONAL_STATUS_LABELS: Record<string, string> = {
  available: "ÐÐ¶Ð¸Ð»Ð»Ð°Ð¶ Ð±Ð°Ð¹Ð³Ð°Ð°",
  assigned: "ÐžÐ½Ð¾Ð¾Ð³Ð´ÑÐ¾Ð½",
  in_repair: "Ð—Ð°ÑÐ²Ð°Ñ€Ñ‚Ð°Ð¹",
  broken: "Ð­Ð²Ð´ÑÑ€ÑÑÐ½",
  retired: "ÐÑˆÐ¸Ð³Ð»Ð°Ð»Ñ‚Ð°Ð°Ñ Ð³Ð°Ñ€ÑÐ°Ð½",
  inactive: "Ð˜Ð´ÑÐ²Ñ…Ð³Ò¯Ð¹",
};

const FLEET_IMPORT_STATE_LABELS: Record<string, string> = {
  success: "ÐÐ¼Ð¶Ð¸Ð»Ñ‚Ñ‚Ð°Ð¹",
  failed: "ÐÐ»Ð´Ð°Ð°Ñ‚Ð°Ð¹",
};

const FLEET_REPAIR_STATE_LABELS: Record<string, string> = {
  new: "Ò®Ò¯ÑÑÑÐ½",
  diagnosed: "ÐžÐ½Ð¾ÑˆÐ¸Ð»ÑÐ¾Ð½",
  waiting_parts: "Ð¡ÑÐ»Ð±ÑÐ³ Ñ…Ò¯Ð»ÑÑÐ¶ Ð±Ð°Ð¹Ð½Ð°",
  waiting_approval: "Ð‘Ð°Ñ‚Ð°Ð»Ð³Ð°Ð° Ñ…Ò¯Ð»ÑÑÐ¶ Ð±Ð°Ð¹Ð½Ð°",
  approved: "Ð‘Ð°Ñ‚Ð»Ð°Ð³Ð´ÑÐ°Ð½",
  in_repair: "Ð¥Ð¸Ð¹Ð³Ð´ÑÐ¶ Ð±Ð°Ð¹Ð³Ð°Ð°",
  done: "Ð”ÑƒÑƒÑÑÐ°Ð½",
  vehicle_returned: "ÐœÐ°ÑˆÐ¸Ð½ Ð±ÑƒÑ†Ð°Ð°ÑÐ°Ð½",
  cancelled: "Ð¦ÑƒÑ†Ð»Ð°Ð³Ð´ÑÐ°Ð½",
};

const FLEET_PROCUREMENT_STATE_LABELS: Record<string, string> = {
  draft: "ÐÐ¾Ð¾Ñ€Ð¾Ð³",
  quote: "3 Ò¯Ð½Ð¸Ð¹Ð½ ÑÐ°Ð½Ð°Ð»",
  finance_review: "Ð¡Ð°Ð½Ñ…Ò¯Ò¯Ð³Ð¸Ð¹Ð½ Ñ…ÑÐ½Ð°Ð»Ñ‚",
  director_approval: "Ð—Ð°Ñ…Ð¸Ñ€Ð»Ñ‹Ð½ Ð±Ð°Ñ‚Ð°Ð»Ð³Ð°Ð°",
  contract_review: "Ð“ÑÑ€ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ½Ð°Ð»Ñ‚",
  payment: "Ð¢Ó©Ð»Ð±Ó©Ñ€",
  received: "Ð¥Ò¯Ð»ÑÑÐ½ Ð°Ð²ÑÐ°Ð½",
  done: "Ð”ÑƒÑƒÑÑÐ°Ð½",
  cancelled: "Ð¦ÑƒÑ†Ð»Ð°Ð³Ð´ÑÐ°Ð½",
};

function formatMoneyLabel(value?: number) {
  return new Intl.NumberFormat("mn-MN", {
    style: "currency",
    currency: "MNT",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatLiters(value?: number) {
  return `${new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: 1,
  }).format(value || 0)} Ð»`;
}

function formatWeight(value?: number, unit?: string | false) {
  const normalizedUnit = unit === "ton" ? "Ñ‚Ð¾Ð½Ð½" : "ÐºÐ³";
  return `${new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: normalizedUnit === "Ñ‚Ð¾Ð½Ð½" ? 2 : 0,
  }).format(value || 0)} ${normalizedUnit}`;
}

function formatOptionalCompactDate(value?: string | false) {
  if (!value) {
    return "";
  }
  return formatCompactDate(value);
}

function formatDateRange(start?: string | false, end?: string | false) {
  const startLabel = formatOptionalCompactDate(start);
  const endLabel = formatOptionalCompactDate(end);
  if (startLabel && endLabel) {
    return `${startLabel} - ${endLabel}`;
  }
  return startLabel || endLabel || "";
}

function attachmentCount(...values: Array<number[] | undefined>) {
  return values.reduce((sum, ids) => sum + (ids?.length ?? 0), 0);
}

function appendMapItem<T>(map: Map<number, T[]>, key: number | null, item: T) {
  if (!key) {
    return;
  }
  const current = map.get(key) ?? [];
  current.push(item);
  map.set(key, current);
}

async function safeSearchReadFleetModel<T>(
  uid: number,
  model: string,
  domain: unknown[],
  fields: string[],
  kwargs: Record<string, unknown>,
  connection: OdooConnection,
) {
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
    );
  } catch (error) {
    console.warn(`${model} could not be loaded for auto-base board:`, error);
    return [];
  }
}

async function loadDriverHistoryByVehicle(
  uid: number,
  vehicleIds: number[],
  connection: OdooConnection,
) {
  const records = await safeSearchReadFleetModel<OdooVehicleDriverHistoryRecord>(
    uid,
    "municipal.vehicle.driver.history",
    [["vehicle_id", "in", vehicleIds]],
    VEHICLE_DRIVER_HISTORY_FIELDS,
    { order: "date_start desc, id desc" },
    connection,
  );
  const byVehicle = new Map<number, FleetVehicleDriverHistoryItem[]>();
  for (const record of records) {
    appendMapItem(byVehicle, relationId(record.vehicle_id), {
      id: record.id,
      driverName: relationName(record.driver_id, "ÐžÐ½Ð¾Ð¾Ð³Ð¾Ð¾Ð³Ò¯Ð¹"),
      dateStart: formatOptionalCompactDate(record.date_start),
      dateEnd: formatOptionalCompactDate(record.date_end),
      changedBy: relationName(record.changed_by_id ?? false, ""),
      changedDate: formatOptionalCompactDate(record.changed_date),
    });
  }
  return byVehicle;
}

async function loadRepairHistoryByVehicle(
  uid: number,
  vehicleIds: number[],
  connection: OdooConnection,
) {
  const records = await safeSearchReadFleetModel<OdooRepairHistoryRecord>(
    uid,
    "municipal.repair.request",
    [["vehicle_id", "in", vehicleIds]],
    VEHICLE_REPAIR_HISTORY_FIELDS,
    { order: "request_date desc, id desc" },
    connection,
  );
  const byVehicle = new Map<number, FleetVehicleRepairHistoryItem[]>();
  for (const record of records) {
    appendMapItem(byVehicle, relationId(record.vehicle_id), {
      id: record.id,
      name: record.name || `Ð—Ð°ÑÐ²Ð°Ñ€ #${record.id}`,
      requestDate: formatOptionalCompactDate(record.request_date),
      dateRange: formatDateRange(record.repair_started_at, record.repair_done_at),
      damageType: record.damage_type || "",
      description: record.issue_summary || record.issue_description || record.description || "",
      partsNote: record.parts_note || "",
      amountLabel: formatMoneyLabel(record.amount_total || record.actual_cost || 0),
      mechanicName: relationName(record.mechanic_id ?? false, ""),
      stateLabel: FLEET_REPAIR_STATE_LABELS[String(record.state || "")] || String(record.state || ""),
      procurementName: relationName(record.procurement_request_id ?? false, ""),
      attachmentCount: attachmentCount(record.attachment_ids, record.photo_ids),
    });
  }
  return byVehicle;
}

async function loadWeightReportsByVehicle(
  uid: number,
  vehicleIds: number[],
  connection: OdooConnection,
) {
  const records = await safeSearchReadFleetModel<OdooGarbageWeightReportRecord>(
    uid,
    "municipal.garbage.weight.report",
    [["vehicle_id", "in", vehicleIds]],
    VEHICLE_WEIGHT_REPORT_FIELDS,
    { order: "report_date desc, id desc" },
    connection,
  );
  const byVehicle = new Map<number, FleetVehicleDailyWeightItem[]>();
  for (const record of records) {
    appendMapItem(byVehicle, relationId(record.vehicle_id), {
      id: record.id,
      reportDate: formatOptionalCompactDate(record.report_date),
      weightLabel: formatWeight(record.weight, record.unit),
      source: record.source || "Ð“Ð°Ð´Ð½Ñ‹ ÑÐ¸ÑÑ‚ÐµÐ¼",
      fetchedAt: formatOptionalCompactDate(record.fetched_at),
      stateLabel: FLEET_IMPORT_STATE_LABELS[String(record.state || "")] || String(record.state || ""),
      errorMessage: record.error_message || "",
    });
  }
  return { records, byVehicle };
}

async function loadFuelReportsByVehicle(
  uid: number,
  vehicleIds: number[],
  connection: OdooConnection,
) {
  const records = await safeSearchReadFleetModel<OdooGarbageFuelReportRecord>(
    uid,
    "municipal.garbage.fuel.report",
    [["vehicle_id", "in", vehicleIds]],
    VEHICLE_FUEL_REPORT_FIELDS,
    { order: "report_date desc, id desc" },
    connection,
  );
  const byVehicle = new Map<number, FleetVehicleDailyFuelItem[]>();
  for (const record of records) {
    appendMapItem(byVehicle, relationId(record.vehicle_id), {
      id: record.id,
      reportDate: formatOptionalCompactDate(record.report_date),
      fuelLabel: formatLiters(record.fuel_liters),
      fuelType: record.fuel_type || "",
      source: record.source || "Ð“Ð°Ð´Ð½Ñ‹ ÑÐ¸ÑÑ‚ÐµÐ¼",
      fetchedAt: formatOptionalCompactDate(record.fetched_at),
      stateLabel: FLEET_IMPORT_STATE_LABELS[String(record.state || "")] || String(record.state || ""),
      errorMessage: record.error_message || "",
    });
  }
  return { records, byVehicle };
}

async function loadProcurementLinksByVehicle(
  uid: number,
  vehicleIds: number[],
  connection: OdooConnection,
) {
  const records = await safeSearchReadFleetModel<OdooProcurementLinkRecord>(
    uid,
    "municipal.procurement.request",
    [["vehicle_id", "in", vehicleIds]],
    VEHICLE_PROCUREMENT_FIELDS,
    { order: "id desc" },
    connection,
  );
  const byVehicle = new Map<number, FleetVehicleProcurementLink[]>();
  for (const record of records) {
    appendMapItem(byVehicle, relationId(record.vehicle_id ?? false), {
      id: record.id,
      name: record.name || `Ð¥ÑƒÐ´Ð°Ð»Ð´Ð°Ð½ Ð°Ð²Ð°Ð»Ñ‚ #${record.id}`,
      repairName: relationName(record.repair_id ?? false, ""),
      amountLabel: formatMoneyLabel(record.amount_total),
      stateLabel: FLEET_PROCUREMENT_STATE_LABELS[String(record.state || "")] || String(record.state || ""),
    });
  }
  return byVehicle;
}

function latestItems<T>(items: T[] | undefined, limit = 8) {
  return (items ?? []).slice(0, limit);
}

function isDriverEmployeeRecord(employee: OdooEmployeeRecord) {
  const titleText = normalizeRoleTitle(
    [
      relationName(employee.job_id ?? false, ""),
      employee.job_title || "",
    ].join(" "),
  );

  return (
    titleText.includes("Ð¶Ð¾Ð»Ð¾Ð¾Ñ‡") ||
    titleText.includes("driver") ||
    titleText.includes("chauffeur")
  );
}

function isLoaderEmployeeRecord(employee: OdooEmployeeRecord) {
  const titleText = normalizeRoleTitle(
    [
      relationName(employee.job_id ?? false, ""),
      employee.job_title || "",
    ].join(" "),
  );

  return (
    titleText.includes("Ð°Ñ‡Ð¸Ð³Ñ‡") ||
    titleText.includes("loader")
  );
}

function toFleetStaffOption(employee: OdooEmployeeRecord): FleetVehicleDriverOption {
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
      "ÐÐ»Ð±Ð°Ð½ Ñ‚ÑƒÑˆÐ°Ð°Ð» Ð±Ò¯Ñ€Ñ‚Ð³ÑÑÐ³Ò¯Ð¹",
  };
}

function sortFleetStaffOptions(
  left: FleetVehicleDriverOption,
  right: FleetVehicleDriverOption,
) {
  if (left.active !== right.active) {
    return left.active ? -1 : 1;
  }
  return left.name.localeCompare(right.name, "mn");
}

async function loadFleetDriverOptions(
  uid: number,
  connection: OdooConnection,
  vehicles: OdooFleetVehicleRecord[] = [],
): Promise<FleetVehicleDriverOption[]> {
  try {
    const assignedDriverIds = new Set(
      vehicles
        .map((vehicle) => relationId(vehicle.municipal_responsible_driver_id ?? false))
        .filter((id): id is number => Boolean(id)),
    );
    const employees = await searchReadAllWithFieldFallback<OdooEmployeeRecord>(
      uid,
      "hr.employee",
      [],
      [
        ["name", "active", "department_id", "job_id", "job_title"],
        ["name", "active", "department_id", "job_title"],
        ["name", "active", "department_id"],
        ["name", "active"],
        ["name"],
      ],
      {
        order: "name asc",
        context: {
          active_test: false,
        },
      },
      connection,
    );

    return employees
      .filter((employee) => isDriverEmployeeRecord(employee) || assignedDriverIds.has(employee.id))
      .map(toFleetStaffOption)
      .sort(sortFleetStaffOptions);
  } catch (error) {
    console.warn("HR employee driver options could not be loaded for auto-base board:", error);
    return [];
  }
}

async function loadFleetLoaderOptions(
  uid: number,
  connection: OdooConnection,
  vehicles: OdooFleetVehicleRecord[] = [],
): Promise<FleetVehicleDriverOption[]> {
  try {
    const assignedLoaderIds = new Set(
      vehicles
        .flatMap((vehicle) => [
          relationId(vehicle.municipal_loader_1_id ?? false),
          relationId(vehicle.municipal_loader_2_id ?? false),
        ])
        .filter((id): id is number => Boolean(id)),
    );
    const employees = await searchReadAllWithFieldFallback<OdooEmployeeRecord>(
      uid,
      "hr.employee",
      [],
      [
        ["name", "active", "department_id", "job_id", "job_title"],
        ["name", "active", "department_id", "job_title"],
        ["name", "active", "department_id"],
        ["name", "active"],
        ["name"],
      ],
      {
        order: "name asc",
        context: {
          active_test: false,
        },
      },
      connection,
    );

    return employees
      .filter((employee) => isLoaderEmployeeRecord(employee) || assignedLoaderIds.has(employee.id))
      .map(toFleetStaffOption)
      .sort(sortFleetStaffOptions);
  } catch (error) {
    console.warn("HR employee loader options could not be loaded for auto-base board:", error);
    return [];
  }
}

export async function loadFleetVehicleBoard(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<FleetVehicleBoard> {
  const requestedConnection = createOdooConnection(connectionOverrides);
  const cachedBoard = readCachedFleetVehicleBoard(requestedConnection);
  if (cachedBoard) {
    return cachedBoard;
  }

  const cacheKey = getMunicipalSnapshotCacheKey(requestedConnection);
  const pendingBoard = fleetVehicleBoardPendingCache.get(cacheKey);
  if (pendingBoard) {
    return pendingBoard;
  }

  const boardPromise = fetchLiveFleetVehicleBoard(requestedConnection).finally(() => {
    fleetVehicleBoardPendingCache.delete(cacheKey);
  });
  fleetVehicleBoardPendingCache.set(cacheKey, boardPromise);
  return boardPromise;
}

async function fetchLiveFleetVehicleBoard(requestedConnection: OdooConnection) {
  const auth = await authenticateWithFallback(requestedConnection);
  if (!auth) {
    throw new Error("Odoo authentication failed");
  }
  const { uid, connection } = auth;

  const vehicles = await searchReadAllWithFieldFallback<OdooFleetVehicleRecord>(
    uid,
    "fleet.vehicle",
    [],
    FLEET_VEHICLE_FIELD_VARIANTS,
    {
      order: "active desc, license_plate asc, name asc",
      context: {
        active_test: false,
      },
    },
    connection,
  );

  const vehicleIds = vehicles.map((vehicle) => vehicle.id);
  const [
    crewAssignmentsByVehicle,
    driverHistoryByVehicle,
    repairHistoryByVehicle,
    weightReportResult,
    fuelReportResult,
    procurementLinksByVehicle,
    driverOptions,
    loaderOptions,
    departmentOptions,
    modelOptions,
    vehicleTypeOptions,
    categoryOptions,
  ] = await Promise.all([
    loadCrewAssignmentsByVehicle(uid, connection),
    loadDriverHistoryByVehicle(uid, vehicleIds, connection),
    loadRepairHistoryByVehicle(uid, vehicleIds, connection),
    loadWeightReportsByVehicle(uid, vehicleIds, connection),
    loadFuelReportsByVehicle(uid, vehicleIds, connection),
    loadProcurementLinksByVehicle(uid, vehicleIds, connection),
    loadFleetDriverOptions(uid, connection, vehicles),
    loadFleetLoaderOptions(uid, connection, vehicles),
    loadFleetVehicleDepartmentOptions(uid, connection),
    loadFleetVehicleRelationOptions(uid, connection, "model_id"),
    loadFleetVehicleRelationOptions(uid, connection, "municipal_vehicle_type_id"),
    loadFleetVehicleRelationOptions(uid, connection, "category_id"),
  ]);

  const allVehicles = vehicles
    .map((vehicle) => {
      const stateLabel = relationName(vehicle.state_id ?? false, "");
      const latestRepairState = vehicle.latest_repair_state || "";
      const operationalStatusKey = vehicle.x_municipal_operational_status || "";
      const operationalStatusLabel = FLEET_OPERATIONAL_STATUS_LABELS[operationalStatusKey] || "";
      const rawDepartmentName = relationName(vehicle.municipal_department_id ?? false, "");
      const isRepair =
        Boolean(vehicle.vehicle_downtime_open) ||
        operationalStatusKey === "in_repair" ||
        operationalStatusKey === "broken" ||
        isRepairStatusLabel(stateLabel) ||
        isRepairStatusLabel(latestRepairState);
      const isArchived = vehicle.active === false;
      const isOperational =
        !isArchived &&
        (vehicle.mfo_active_for_ops !== false ||
          operationalStatusKey === "available" ||
          operationalStatusKey === "assigned");

      return {
        id: vehicle.id,
        plate: vehicle.license_plate || vehicle.name || `ÐœÐ°ÑˆÐ¸Ð½ #${vehicle.id}`,
        name: vehicle.name || vehicle.license_plate || `ÐœÐ°ÑˆÐ¸Ð½ #${vehicle.id}`,
        imageUrl: imageDataUrl(vehicle.image_128 || vehicle.avatar_128 || vehicle.image_1920),
        modelId: relationId(vehicle.model_id ?? false),
        modelName: relationName(vehicle.model_id ?? false, ""),
        categoryId: relationId(vehicle.category_id ?? false),
        categoryName: relationName(vehicle.category_id ?? false, ""),
        vehicleTypeId: relationId(vehicle.municipal_vehicle_type_id ?? false),
        vehicleTypeName:
          relationName(vehicle.municipal_vehicle_type_id ?? false, "") ||
          relationName(vehicle.category_id ?? false, ""),
        departmentId: relationId(vehicle.municipal_department_id ?? false),
        departmentName: normalizeOrganizationUnitName(rawDepartmentName) || rawDepartmentName,
        vin: vehicle.vin_sn || "",
        odometerLabel:
          typeof vehicle.odometer === "number" && Number.isFinite(vehicle.odometer)
            ? `${Math.round(vehicle.odometer).toLocaleString("mn-MN")} ÐºÐ¼`
            : "",
        odometerValue:
          typeof vehicle.odometer === "number" && Number.isFinite(vehicle.odometer)
            ? String(Math.round(vehicle.odometer))
            : "",
        fuelTypeKey: vehicle.fuel_type || "",
        fuelTypeLabel: resolveFleetFuelTypeLabel(vehicle.fuel_type || ""),
        fleetDriverName: relationName(vehicle.driver_id ?? false, ""),
        responsibleDriverId: relationId(vehicle.municipal_responsible_driver_id ?? false),
        responsibleDriverName: relationName(vehicle.municipal_responsible_driver_id ?? false, ""),
        loader1Id: relationId(vehicle.municipal_loader_1_id ?? false),
        loader1Name: relationName(vehicle.municipal_loader_1_id ?? false, ""),
        loader2Id: relationId(vehicle.municipal_loader_2_id ?? false),
        loader2Name: relationName(vehicle.municipal_loader_2_id ?? false, ""),
        stateLabel:
          vehicle.active === false
            ? "ÐÑ€Ñ…Ð¸Ð²Ð»Ð°ÑÐ°Ð½"
            :
          operationalStatusLabel ||
          stateLabel ||
          (isRepair ? "Ð—Ð°ÑÐ²Ð°Ñ€Ñ‚Ð°Ð¹" : isOperational ? "ÐÐ¶Ð¸Ð»Ð»Ð°Ð¶ Ð±Ð°Ð¹Ð³Ð°Ð°" : "Ð‘Ò¯Ñ€Ñ‚Ð³ÑÐ»Ñ‚ÑÐ¹"),
        operationalStatusKey,
        latestRepairState,
        isOperational,
        isRepair,
        isArchived,
        insurance: {
          company: vehicle.municipal_insurance_company || "",
          policyNumber: vehicle.municipal_insurance_policy_number || "",
          startDate: formatOptionalCompactDate(vehicle.municipal_insurance_date_start),
          endDate: formatOptionalCompactDate(vehicle.municipal_insurance_date_end),
          startDateValue: vehicle.municipal_insurance_date_start || "",
          endDateValue: vehicle.municipal_insurance_date_end || "",
          daysRemaining:
            typeof vehicle.municipal_insurance_days_remaining === "number"
              ? vehicle.municipal_insurance_days_remaining
              : 0,
          reminderDue: Boolean(vehicle.municipal_insurance_reminder_due),
          note: vehicle.municipal_insurance_note || "",
          attachmentCount: vehicle.municipal_insurance_attachment_ids?.length ?? 0,
        },
        inspection: {
          startDate: formatOptionalCompactDate(vehicle.municipal_inspection_date),
          endDate: formatOptionalCompactDate(vehicle.municipal_next_inspection_date),
          startDateValue: vehicle.municipal_inspection_date || "",
          endDateValue: vehicle.municipal_next_inspection_date || "",
          daysRemaining:
            typeof vehicle.municipal_inspection_days_remaining === "number"
              ? vehicle.municipal_inspection_days_remaining
              : 0,
          reminderDue: Boolean(vehicle.municipal_inspection_reminder_due),
          note: vehicle.municipal_inspection_note || "",
          attachmentCount: vehicle.municipal_inspection_attachment_ids?.length ?? 0,
        },
        driverHistory: latestItems(driverHistoryByVehicle.get(vehicle.id)),
        repairHistory: latestItems(repairHistoryByVehicle.get(vehicle.id), 10),
        weightReports: latestItems(weightReportResult.byVehicle.get(vehicle.id), 10),
        fuelReports: latestItems(fuelReportResult.byVehicle.get(vehicle.id), 10),
        procurementLinks: latestItems(procurementLinksByVehicle.get(vehicle.id), 8),
        crewAssignments: crewAssignmentsByVehicle.get(vehicle.id) ?? [],
      } satisfies FleetVehicleBoardItem;
    })
    .filter((vehicle) => !vehicle.isArchived && (vehicle.isOperational || vehicle.isRepair))
    .sort((left, right) => left.plate.localeCompare(right.plate, "mn"));

  const activeVehicles = allVehicles.filter(
    (vehicle) =>
      vehicle.isOperational &&
      !vehicle.isRepair,
  );
  const repairVehicles = allVehicles.filter((vehicle) => vehicle.isRepair);
  const todayKey = getTodayDateKey();
  const todayWeightKg = weightReportResult.records
    .filter((record) => record.report_date === todayKey && record.state !== "failed")
    .reduce((sum, record) => {
      const value = record.weight || 0;
      return sum + (record.unit === "ton" ? value * 1000 : value);
    }, 0);
  const todayFuelLiters = fuelReportResult.records
    .filter((record) => record.report_date === todayKey && record.state !== "failed")
    .reduce((sum, record) => sum + (record.fuel_liters || 0), 0);
  const fuelByVehicle = new Map<number, number>();
  for (const record of fuelReportResult.records) {
    const vehicleId = relationId(record.vehicle_id);
    if (!vehicleId || record.state === "failed") {
      continue;
    }
    fuelByVehicle.set(vehicleId, (fuelByVehicle.get(vehicleId) ?? 0) + (record.fuel_liters || 0));
  }
  const highestFuelVehicleId = [...fuelByVehicle.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const repairCountByVehicle = new Map(
    allVehicles.map((vehicle) => [vehicle.id, vehicle.repairHistory.length]),
  );
  const mostRepairedVehicleId = [...repairCountByVehicle.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const vehicleById = new Map(allVehicles.map((vehicle) => [vehicle.id, vehicle]));
  const failedImportCount =
    weightReportResult.records.filter((record) => record.state === "failed").length +
    fuelReportResult.records.filter((record) => record.state === "failed").length;

  const board = {
    allVehicles,
    activeVehicles,
    repairVehicles,
    driverOptions,
    loaderOptions,
    departmentOptions,
    modelOptions,
    vehicleTypeOptions,
    categoryOptions,
    totalVehicles: allVehicles.length,
    activeCount: activeVehicles.length,
    repairCount: repairVehicles.length,
    insuranceDueCount: allVehicles.filter((vehicle) => vehicle.insurance.reminderDue).length,
    inspectionDueCount: allVehicles.filter((vehicle) => vehicle.inspection.reminderDue).length,
    todayWeightLabel: formatWeight(todayWeightKg, "kg"),
    todayFuelLabel: formatLiters(todayFuelLiters),
    highestFuelVehicle: highestFuelVehicleId ? vehicleById.get(highestFuelVehicleId)?.plate ?? "" : "",
    mostRepairedVehicle: mostRepairedVehicleId ? vehicleById.get(mostRepairedVehicleId)?.plate ?? "" : "",
    failedImportCount,
  };
  writeCachedFleetVehicleBoard(connection, board);
  return board;
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

  const [projects, rawTasks] = await Promise.all([
    searchReadAll<OdooProjectRecord>(
      uid,
      "project.project",
      [],
      {
        fields: ["name", "user_id", "ops_department_id", "date_start", "date", "mfo_operation_type"],
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
  const tasks = rawTasks.filter((task) => !isRoadCleaningPhotoPlaceholderTaskName(task.name));

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
    console.warn("ops.task.report Ó©Ð³Ó©Ð³Ð´Ó©Ð» ÑƒÐ½ÑˆÐ¸Ñ…Ð°Ð´ Ð°Ð»Ð´Ð°Ð° Ð³Ð°Ñ€Ð»Ð°Ð°:", error);
    return [] as OdooReportRecord[];
  });

  const reportsByTaskId = new Map<number, OdooReportRecord[]>();
  for (const report of reports) {
    const taskId = Array.isArray(report.task_id) ? report.task_id[0] : null;
    if (!taskId) {
      continue;
    }
    const taskReports = reportsByTaskId.get(taskId) ?? [];
    taskReports.push(report);
    reportsByTaskId.set(taskId, taskReports);
  }
  const quantitySnapshotByTaskId = new Map<number, TaskQuantitySnapshot>(
    tasks.map((task) => [
      task.id,
      buildTaskQuantitySnapshot(task, reportsByTaskId.get(task.id) ?? []),
    ]),
  );
  const taskQuantitySnapshot = (task: OdooTaskRecord) =>
    quantitySnapshotByTaskId.get(task.id) ??
    buildTaskQuantitySnapshot(task, reportsByTaskId.get(task.id) ?? []);

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((task) => taskQuantitySnapshot(task).stageBucket === "done");
  const reviewTasks = tasks.filter((task) => taskQuantitySnapshot(task).stageBucket === "review");
  const activeTasks = tasks.filter((task) => {
    const bucket = taskQuantitySnapshot(task).stageBucket;
    return bucket === "todo" || bucket === "progress";
  });
  const overdueTasks = tasks.filter((task) => {
    if (!task.date_deadline) {
      return false;
    }
    const bucket = taskQuantitySnapshot(task).stageBucket;
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
      (task) => taskQuantitySnapshot(task).stageBucket === "done",
    );
    const departmentReview = departmentTasks.filter(
      (task) => taskQuantitySnapshot(task).stageBucket === "review",
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
    const taskSnapshots = projectTasks.map((task) => taskQuantitySnapshot(task));
    const completed = taskSnapshots.filter((snapshot) => snapshot.stageBucket === "done").length;
    const buckets = taskSnapshots.map((snapshot) => snapshot.stageBucket);
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
      managerId: relationId(project.user_id),
      manager: relationName(project.user_id),
      departmentName:
        projectTaskDepartments[0] ??
        projectDepartmentById.get(project.id) ??
        resolveNormalizedProjectDepartmentName(project),
      operationTypeLabel: operationTypeLabel(project.mfo_operation_type),
      stageLabel: STAGE_LABELS[stageBucket],
      stageBucket,
      openTasks: projectTasks.length - completed,
      completion: taskSnapshots.length
        ? Math.round(
            taskSnapshots.reduce((total, snapshot) => total + snapshot.progress, 0) /
              taskSnapshots.length,
          )
        : 0,
      deadline: formatCompactDate(project.date),
      href: `/projects/${project.id}`,
    } satisfies ProjectCard;
  });

  const liveTasks = activeTasks.map((task) => ({
    id: task.id,
    name: task.name,
    departmentName: resolveTaskDepartmentName(task, projectDepartmentById),
    projectId: Array.isArray(task.project_id) ? task.project_id[0] : null,
    projectName: relationName(task.project_id),
    stageLabel: STAGE_LABELS[taskQuantitySnapshot(task).stageBucket],
    stageBucket: taskQuantitySnapshot(task).stageBucket,
    deadline: formatCompactDate(task.date_deadline),
    scheduledDate: getDateKeyFromValue(task.mfo_shift_date || task.date_deadline || null),
    plannedQuantity: taskQuantitySnapshot(task).plannedQuantity,
    completedQuantity: taskQuantitySnapshot(task).completedQuantity,
    remainingQuantity: taskQuantitySnapshot(task).remainingQuantity,
    measurementUnit: resolveTaskMeasurementUnit(task),
    leaderId: relationId(task.ops_team_leader_id ?? false),
    leaderName: relationName(task.ops_team_leader_id ?? false),
    priorityLabel: priorityLabel(task.priority || ""),
    progress: taskQuantitySnapshot(task).progress,
    href: buildTaskHref(task.id, "/tasks"),
  }));

  const reviewQueue = reviewTasks.map((task) => ({
    id: task.id,
    name: task.name,
    departmentName: resolveTaskDepartmentName(task, projectDepartmentById),
    stageLabel: relationName(task.stage_id, STAGE_LABELS.review),
    deadline: formatCompactDate(task.date_deadline),
    projectId: Array.isArray(task.project_id) ? task.project_id[0] : null,
    projectName: relationName(task.project_id),
    leaderId: relationId(task.ops_team_leader_id ?? false),
    leaderName: relationName(task.ops_team_leader_id ?? false),
    progress: taskQuantitySnapshot(task).progress,
    href: buildTaskHref(task.id, "/review"),
  }));

  const reportAttachmentIdsByReportId = new Map<number, { imageIds: number[]; audioIds: number[] }>();
  for (const report of reports) {
    reportAttachmentIdsByReportId.set(report.id, {
      imageIds: [...(report.image_attachment_ids ?? [])],
      audioIds: [...(report.audio_attachment_ids ?? [])],
    });
  }

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
      console.warn("ir.attachment Ó©Ð³Ó©Ð³Ð´Ó©Ð» ÑƒÐ½ÑˆÐ¸Ñ…Ð°Ð´ Ð°Ð»Ð´Ð°Ð° Ð³Ð°Ñ€Ð»Ð°Ð°:", error);
    }
  }

  const reportIds = reports.map((report) => report.id);
  if (reportIds.length) {
    try {
      const fallbackAttachments = await searchReadAll<OdooAttachmentRecord>(
        uid,
        "ir.attachment",
        [["res_model", "=", "ops.task.report"], ["res_id", "in", reportIds]],
        {
          fields: ["name", "mimetype", "res_id"],
          order: "create_date asc, id asc",
        },
        connection,
        400,
      );

      for (const attachment of fallbackAttachments) {
        const reportId = typeof attachment.res_id === "number" ? attachment.res_id : 0;
        if (!reportId) {
          continue;
        }
        attachmentMap.set(attachment.id, attachment);
        const entry =
          reportAttachmentIdsByReportId.get(reportId) ?? { imageIds: [], audioIds: [] };
        const mimetype = String(attachment.mimetype || "").toLowerCase();
        if (mimetype.startsWith("image/") && !entry.imageIds.includes(attachment.id)) {
          entry.imageIds.push(attachment.id);
        }
        if (mimetype.startsWith("audio/") && !entry.audioIds.includes(attachment.id)) {
          entry.audioIds.push(attachment.id);
        }
        reportAttachmentIdsByReportId.set(reportId, entry);
      }
    } catch (error) {
      console.warn("ops.task.report Ñ…Ð°Ð²ÑÑ€Ð°Ð»Ñ‚Ñ‹Ð½ fallback ÑƒÐ½ÑˆÐ¸Ñ…Ð°Ð´ Ð°Ð»Ð´Ð°Ð° Ð³Ð°Ñ€Ð»Ð°Ð°:", error);
    }
  }

  const getReportImageIds = (report: OdooReportRecord) =>
    reportAttachmentIdsByReportId.get(report.id)?.imageIds ?? report.image_attachment_ids ?? [];
  const getReportAudioIds = (report: OdooReportRecord) =>
    reportAttachmentIdsByReportId.get(report.id)?.audioIds ?? report.audio_attachment_ids ?? [];
  const buildReportImages = (report: OdooReportRecord) =>
    getReportImageIds(report).map((attachmentId) => {
      const attachment = attachmentMap.get(attachmentId);
      return {
        id: attachmentId,
        name: attachment?.name || `image-${attachmentId}`,
        mimetype: attachment?.mimetype || "image/*",
        url: `/api/odoo/attachments/${attachmentId}`,
      };
    });
  const buildReportAudios = (report: OdooReportRecord) =>
    getReportAudioIds(report).map((attachmentId) => {
      const attachment = attachmentMap.get(attachmentId);
      return {
        id: attachmentId,
        name: attachment?.name || `audio-${attachmentId}`,
        mimetype: attachment?.mimetype || "audio/*",
        url: `/api/odoo/attachments/${attachmentId}`,
      };
    });

  const reportTaskMap = new Map(tasks.map((task) => [task.id, task]));
  const reportsFeed = reports.map((report) => {
    const taskId = Array.isArray(report.task_id) ? report.task_id[0] : null;
    const task = taskId ? reportTaskMap.get(taskId) : undefined;
    const images = buildReportImages(report);
    const audios = buildReportAudios(report);
    return {
      id: report.id,
      taskId,
      reporterId: relationId(report.reporter_id),
      reporter: relationName(report.reporter_id),
      taskName: relationName(report.task_id),
      departmentName: task
        ? resolveTaskDepartmentName(task, projectDepartmentById)
        : "Ð¢Ð¾Ð´Ð¾Ñ€Ñ…Ð¾Ð¹Ð³Ò¯Ð¹",
      projectId: task && Array.isArray(task.project_id) ? task.project_id[0] : null,
      projectName: task ? relationName(task.project_id) : "ÐÐ¶Ð¸Ð»Ð³Ò¯Ð¹",
      summary: htmlToPlainText(report.report_summary) || "Ð¢Ð°Ð¹Ð»Ð±Ð°Ñ€ Ð¾Ñ€ÑƒÑƒÐ»Ð°Ð°Ð³Ò¯Ð¹",
      text: htmlToPlainText(report.report_text),
      state: String(report.state || ""),
      stateLabel: reportStateLabel(report.state),
      stateBucket: reportStateBucket(report.state),
      rejectionReason: htmlToPlainText(report.rejection_reason),
      reportedQuantity: report.reported_quantity ?? 0,
      measurementUnit: resolveUnitLabel(
        report.task_measurement_unit_id,
        report.task_measurement_unit_code,
        task?.ops_measurement_unit,
      ),
      measurementUnitCode:
        report.task_measurement_unit_code || (task ? resolveTaskMeasurementCode(task) : ""),
      imageCount: Math.max(report.image_count ?? 0, images.length),
      audioCount: Math.max(report.audio_count ?? 0, audios.length),
      submittedAt: formatCompactDate(report.report_datetime),
      images,
      audios,
    } satisfies ReportFeedItem;
  });

  const workIdsByTaskId = new Map<number, number>();
  for (const task of tasks) {
    const workId = relationId(task.municipal_work_id ?? false);
    if (workId) {
      workIdsByTaskId.set(task.id, workId);
    }
  }
  const returnedWorkById = new Map<number, OdooWorkReturnRecord>();
  const workIds = Array.from(new Set(workIdsByTaskId.values()));
  if (workIds.length) {
    const workRecords = await searchReadAll<OdooWorkReturnRecord>(
      uid,
      "municipal.work",
      [["id", "in", workIds]],
      {
        fields: ["state", "rejection_reason"],
      },
      resolvedConnection,
      200,
    ).catch(() => [] as OdooWorkReturnRecord[]);
    for (const work of workRecords) {
      returnedWorkById.set(work.id, work);
    }
  }

  const returnReasonByTaskId = new Map<number, string>();
  const taskIds = tasks.map((task) => task.id).filter((id) => id > 0);
  if (taskIds.length) {
    const taskMessages = await searchReadAll<OdooTaskMessageRecord>(
      uid,
      "mail.message",
      [
        ["model", "=", "project.task"],
        ["res_id", "in", taskIds],
      ],
      {
        fields: ["res_id", "body", "date"],
        order: "date desc, id desc",
      },
      resolvedConnection,
      300,
    ).catch(() => [] as OdooTaskMessageRecord[]);

    for (const message of taskMessages) {
      const taskId = typeof message.res_id === "number" ? message.res_id : 0;
      if (!taskId || returnReasonByTaskId.has(taskId)) {
        continue;
      }
      const reason = extractTaskReturnReason(message.body);
      if (reason) {
        returnReasonByTaskId.set(taskId, reason);
      }
    }
  }

  const latestReportByTaskId = new Map<number, TaskDirectoryReportSummary>();
  for (const report of reportsFeed) {
    const taskId = reports.find((item) => item.id === report.id)?.task_id;
    const resolvedTaskId = Array.isArray(taskId) ? taskId[0] : null;
    if (!resolvedTaskId || latestReportByTaskId.has(resolvedTaskId)) {
      continue;
    }
    const workId = workIdsByTaskId.get(resolvedTaskId);
    const workReturn = workId ? returnedWorkById.get(workId) : undefined;
    const workReturnReason = htmlToPlainText(workReturn?.rejection_reason);
    const messageReturnReason = returnReasonByTaskId.get(resolvedTaskId) || "";
    const effectiveStateBucket =
      report.stateBucket === "problem" || reportStateBucket(workReturn?.state) === "problem"
        ? "problem"
        : report.stateBucket;
    latestReportByTaskId.set(resolvedTaskId, {
      id: report.id,
      reporter: report.reporter,
      submittedAt: report.submittedAt,
      state: report.state,
      stateLabel: report.stateLabel,
      stateBucket: effectiveStateBucket,
      summary: report.summary,
      text: report.text,
      reportedQuantity: report.reportedQuantity,
      measurementUnit: report.measurementUnit,
      rejectionReason: report.rejectionReason || workReturnReason || messageReturnReason,
      imageCount: report.imageCount,
      audioCount: report.audioCount,
      images: report.images,
      audios: report.audios,
    });
  }

  const taskDirectory = tasks
    .map((task) => {
      const quantitySnapshot = taskQuantitySnapshot(task);
      const stageBucket = quantitySnapshot.stageBucket;
      const statusKey = quantitySnapshot.statusKey;

      return {
        id: task.id,
        name: task.name,
        departmentName: resolveTaskDepartmentName(task, projectDepartmentById),
        projectId: Array.isArray(task.project_id) ? task.project_id[0] : null,
        projectName: relationName(task.project_id, "ÐÐ¶Ð¸Ð»Ð³Ò¯Ð¹"),
        stageLabel: STAGE_LABELS[stageBucket],
        stageBucket,
        createdDate: getDateKeyFromValue(task.create_date || null),
        createdAt: task.create_date || null,
        statusKey,
        statusLabel: getTaskStatusLabel(statusKey),
        deadline: formatCompactDate(task.date_deadline),
        deadlineDateTime: task.date_deadline || null,
        scheduledDate: getDateKeyFromValue(task.mfo_shift_date || task.date_deadline || null),
        leaderId: relationId(task.ops_team_leader_id ?? false),
        leaderName: relationName(task.ops_team_leader_id ?? false),
        priorityLabel: priorityLabel(task.priority || ""),
        progress: quantitySnapshot.progress,
        plannedQuantity: quantitySnapshot.plannedQuantity,
        completedQuantity: quantitySnapshot.completedQuantity,
        remainingQuantity: quantitySnapshot.remainingQuantity,
        measurementUnit: resolveTaskMeasurementUnit(task),
        operationTypeLabel: operationTypeLabel(task.mfo_operation_type),
        issueFlag: statusKey === "problem",
        assigneeIds: task.user_ids ?? [],
        latestReport: latestReportByTaskId.get(task.id),
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

  const teamLeaderMap = new Map<string, TeamLeaderCard>();
  for (const task of tasks) {
      const leaderName = relationName(task.ops_team_leader_id ?? false, "ÐžÐ½Ð¾Ð¾Ð³Ð¾Ð¾Ð³Ò¯Ð¹");
    const entry = teamLeaderMap.get(leaderName) ?? {
      name: leaderName,
      activeTasks: 0,
      reviewTasks: 0,
      averageCompletion: 0,
      squadSize: Math.max((task.user_ids?.length ?? 1) - 1, 0),
    };

    const snapshot = taskQuantitySnapshot(task);
    const bucket = snapshot.stageBucket;
    if (bucket === "review") {
      entry.reviewTasks += 1;
    }
    if (bucket === "todo" || bucket === "progress") {
      entry.activeTasks += 1;
    }
    entry.averageCompletion += snapshot.progress;
    entry.squadSize = Math.max(entry.squadSize, Math.max((task.user_ids?.length ?? 1) - 1, 0));
    teamLeaderMap.set(leaderName, entry);
  }

  const teamLeaders = Array.from(teamLeaderMap.values())
    .map((leader) => {
      const relatedTasks = tasks.filter(
        (task) => relationName(task.ops_team_leader_id ?? false, "ÐžÐ½Ð¾Ð¾Ð³Ð¾Ð¾Ð³Ò¯Ð¹") === leader.name,
      );
      const totalProgress = relatedTasks.reduce(
        (sum, task) => sum + taskQuantitySnapshot(task).progress,
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
      routeName: relationName(task.mfo_route_id ?? false, "ÐœÐ°Ñ€ÑˆÑ€ÑƒÑ‚Ð³Ò¯Ð¹"),
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
        label: "Ð˜Ð´ÑÐ²Ñ…Ñ‚ÑÐ¹ Ð´Ð°Ð°Ð»Ð³Ð°Ð²Ð°Ñ€",
        value: String(activeTasks.length),
        note: `${overdueTasks.length} Ð½ÑŒ Ñ…ÑƒÐ³Ð°Ñ†Ð°Ð° Ð´Ð°Ð²ÑÐ°Ð½`,
        tone: overdueTasks.length ? "red" : "slate",
      },
      {
        label: "Ð¥ÑÐ½Ð°Ð»Ñ‚Ñ‹Ð½ Ð´Ð°Ñ€Ð°Ð°Ð»Ð°Ð»",
        value: String(reviewTasks.length),
        note: "Ò®Ð¹Ð» Ð°Ð¶Ð¸Ð»Ð»Ð°Ð³Ð°Ð° Ñ…Ð°Ñ€Ð¸ÑƒÑ†ÑÐ°Ð½ Ð¼ÐµÐ½ÐµÐ¶ÐµÑ€ Ð±Ð°Ñ‚Ð°Ð»Ð³Ð°Ð°Ð¶ÑƒÑƒÐ»Ð°Ð»Ñ‚ Ñ…Ò¯Ð»ÑÑÐ¶ Ð±Ð°Ð¹Ð½Ð°",
        tone: "amber",
      },
      {
        label: "ÐÐ¸Ð¹Ñ‚ Ð³Ò¯Ð¹Ñ†ÑÑ‚Ð³ÑÐ»",
        value: `${completionRate}%`,
        note: `${doneTasks.length}/${totalTasks} Ð´Ð°Ð°Ð»Ð³Ð°Ð²Ð°Ñ€ Ð´ÑƒÑƒÑÑÐ°Ð½`,
        tone: "teal",
      },
      {
        label: "Ð¥ÑÐ¼Ð¶ÑÑÐ½Ð¸Ð¹ Ð±Ð¸ÐµÐ»ÑÐ»Ñ‚",
        value: completedQuantitySummary,
        note: "Ð¡Ñ‚Ð°Ð½Ð´Ð°Ñ€Ñ‚ Ð½ÑÐ³Ð¶Ð¸Ð¹Ð½ ÐºÐ¾Ð´Ð¾Ð¾Ñ€ Ð½ÑÐ³Ñ‚Ð³ÑÑÑÐ½",
        tone: "slate",
      },
    ],
    qualityMetrics: [
      {
        label: "Ð§Ð°Ð½Ð°Ñ€Ñ‹Ð½ Ð°Ð½Ñ…Ð°Ð°Ñ€ÑƒÑƒÐ»Ð³Ð°",
        value: String(qualitySourceTasks.length),
        note: "Ð¢Ð°Ð»Ð±Ð°Ñ€Ñ‹Ð½ Ð³Ò¯Ð¹Ñ†ÑÑ‚Ð³ÑÐ» Ð´ÑÑÑ€ Ð·Ð°ÑÐ°Ñ… ÑˆÐ°Ð°Ñ€Ð´Ð»Ð°Ð³Ð°Ñ‚Ð°Ð¹ Ð´Ð°Ð°Ð»Ð³Ð°Ð²Ð°Ñ€",
        tone: qualitySourceTasks.length ? "red" : "teal",
      },
      {
        label: "Ð—ÑƒÑ€Ð°Ð³ Ð´ÑƒÑ‚ÑÐ°Ð½ Ð´Ð°Ð°Ð»Ð³Ð°Ð²Ð°Ñ€",
        value: String(missingProofTasks.length),
        note: "Ó¨Ð¼Ð½Ó©, Ð´Ð°Ñ€Ð°Ð°Ñ… Ð·ÑƒÑ€Ð°Ð³ Ð±Ò¯Ñ€ÑÐ½ Ð±Ð¸Ñˆ",
        tone: missingProofTasks.length ? "amber" : "teal",
      },
      {
        label: "Ð¡Ð¸Ð½Ðº Ð°Ð½Ñ…Ð°Ð°Ñ€ÑƒÑƒÐ»Ð³Ð°",
        value: String(syncWarningTasks.length),
        note: "WRS ÑÑÐ²ÑÐ» Ð¶Ð¸Ð½Ð³Ð¸Ð¹Ð½ Ó©Ð³Ó©Ð³Ð´Ó©Ð» Ð±Ò¯Ñ€ÑÐ½ Ð±Ð¸Ñˆ",
        tone: syncWarningTasks.length ? "red" : "slate",
      },
      {
        label: "ÐœÐ°Ñ€ÑˆÑ€ÑƒÑ‚Ñ‹Ð½ Ð·Ó©Ñ€Ò¯Ò¯",
        value: String(deviationTasks.length),
        note: `${unresolvedQualityTasks.length} Ð´Ð°Ð°Ð»Ð³Ð°Ð²Ð°Ñ€ Ð½ÑÑÐ»Ñ‚Ñ‚ÑÐ¹ Ñ†ÑÐ³Ñ‚ÑÐ¹`,
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
        label: "Ð˜Ð´ÑÐ²Ñ…Ñ‚ÑÐ¹ Ð´Ð°Ð°Ð»Ð³Ð°Ð²Ð°Ñ€",
        value: "18",
        note: "3 Ð½ÑŒ Ñ…ÑƒÐ³Ð°Ñ†Ð°Ð° Ð´Ð°Ð²ÑÐ°Ð½",
        tone: "red",
      },
      {
        label: "Ð¥ÑÐ½Ð°Ð»Ñ‚Ñ‹Ð½ Ð´Ð°Ñ€Ð°Ð°Ð»Ð°Ð»",
        value: "4",
        note: "Ò®Ð¹Ð» Ð°Ð¶Ð¸Ð»Ð»Ð°Ð³Ð°Ð° Ñ…Ð°Ñ€Ð¸ÑƒÑ†ÑÐ°Ð½ Ð¼ÐµÐ½ÐµÐ¶ÐµÑ€ ÑˆÐ°Ð»Ð³Ð°Ð¶ Ð±Ð°Ð¹Ð½Ð°",
        tone: "amber",
      },
      {
        label: "ÐÐ¸Ð¹Ñ‚ Ð³Ò¯Ð¹Ñ†ÑÑ‚Ð³ÑÐ»",
        value: "64%",
        note: "18/28 Ð´Ð°Ð°Ð»Ð³Ð°Ð²Ð°Ñ€ Ð´ÑÑÑ€ Ð°Ñ…Ð¸Ñ† Ð±Ò¯Ñ€Ñ‚Ð³ÑÐ³Ð´ÑÑÐ½",
        tone: "teal",
      },
      {
        label: "Ð¥ÑÐ¼Ð¶ÑÑÐ½Ð¸Ð¹ Ð±Ð¸ÐµÐ»ÑÐ»Ñ‚",
        value: "713 Ð¼Ð¾Ð´",
        note: "Ó¨Ð½Ó©Ó©Ð´Ñ€Ð¸Ð¹Ð½ Ñ‚Ð°Ð¹Ð»Ð°Ð½Ð³Ð°Ð°Ñ Ð°Ð²Ñ‚Ð¾Ð¼Ð°Ñ‚Ð°Ð°Ñ€ Ñ‚Ð¾Ð¾Ñ†ÑÐ¾Ð½",
        tone: "slate",
      },
    ],
    qualityMetrics: [
      {
        label: "Ð§Ð°Ð½Ð°Ñ€Ñ‹Ð½ Ð°Ð½Ñ…Ð°Ð°Ñ€ÑƒÑƒÐ»Ð³Ð°",
        value: "5",
        note: "Ð¢Ð°Ð»Ð±Ð°Ñ€Ñ‹Ð½ Ð³Ò¯Ð¹Ñ†ÑÑ‚Ð³ÑÐ» Ð´ÑÑÑ€ Ð´Ð°Ñ…Ð¸Ð½ Ñ…ÑÐ½Ð°Ñ… Ð´Ð°Ð°Ð»Ð³Ð°Ð²Ð°Ñ€",
        tone: "red",
      },
      {
        label: "Ð—ÑƒÑ€Ð°Ð³ Ð´ÑƒÑ‚ÑÐ°Ð½ Ð´Ð°Ð°Ð»Ð³Ð°Ð²Ð°Ñ€",
        value: "2",
        note: "Ó¨Ð¼Ð½Ó© ÑÑÐ²ÑÐ» Ð´Ð°Ñ€Ð°Ð°Ñ… Ð·ÑƒÑ€Ð°Ð³ Ð±Ò¯Ñ€ÑÐ½ Ð±Ð¸Ñˆ",
        tone: "amber",
      },
      {
        label: "Ð¡Ð¸Ð½Ðº Ð°Ð½Ñ…Ð°Ð°Ñ€ÑƒÑƒÐ»Ð³Ð°",
        value: "1",
        note: "Ð–Ð¸Ð½Ð³Ð¸Ð¹Ð½ ÑÐ¸Ð½ÐºÐ¸Ð¹Ð³ Ð½ÑÐ³Ñ‚Ð»Ð°Ñ… ÑˆÐ°Ð°Ñ€Ð´Ð»Ð°Ð³Ð°Ñ‚Ð°Ð¹",
        tone: "red",
      },
      {
        label: "ÐœÐ°Ñ€ÑˆÑ€ÑƒÑ‚Ñ‹Ð½ Ð·Ó©Ñ€Ò¯Ò¯",
        value: "2",
        note: "Ð—Ó©Ñ€Ò¯Ò¯ ÑÑÐ²ÑÐ» Ñ…Ð°Ð°Ð³Ð´Ð°Ð°Ð³Ò¯Ð¹ Ñ†ÑÐ³ Ð¸Ð»ÑÑ€ÑÑÐ½",
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
        name: "2026 ÐœÐ¾Ð´ Ñ…ÑÐ»Ð±ÑÑ€Ð¶Ò¯Ò¯Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑƒÐ²Ð°Ð°Ñ€ÑŒ",
        manager: "BATAA",
        departmentName: "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ",
      stageLabel: "Ð¥ÑÐ½Ð°Ð³Ð´Ð°Ð¶ Ð±ÑƒÐ¹ Ð°Ð¶Ð¸Ð»",
        stageBucket: "review",
        openTasks: 14,
        completion: 71,
        deadline: "4-Ñ€ ÑÐ°Ñ€Ñ‹Ð½ 20, 18:00",
        href: "/projects/1",
      },
      {
        id: 2,
        name: "Ð¥Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ó©Ð³Ð»Ó©Ó©Ð½Ð¸Ð¹ Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚",
        manager: "ankhaa",
        departmentName: "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð·, Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ",
        stageLabel: "Ð¯Ð²Ð°Ð³Ð´Ð°Ð¶ Ð±ÑƒÐ¹ Ð°Ð¶Ð¸Ð»",
        stageBucket: "progress",
        openTasks: 5,
        completion: 62,
        deadline: "Ó¨Ð½Ó©Ó©Ð´Ó©Ñ€ 20:00",
        href: "/projects/2",
      },
      {
        id: 3,
        name: "Ð—Ð°Ð¼ Ñ‚Ð°Ð»Ð±Ð°Ð¹Ð½ ÑˆÓ©Ð½Ð¸Ð¹Ð½ Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ",
        manager: "ankhaa",
        departmentName: "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ",
        stageLabel: "Ð¥Ð¸Ð¹Ð³Ð´ÑÑ… Ð°Ð¶Ð¸Ð»",
        stageBucket: "todo",
        openTasks: 6,
        completion: 35,
        deadline: "4-Ñ€ ÑÐ°Ñ€Ñ‹Ð½ 17, 06:00",
        href: "/projects/3",
      },
    ],
    taskDirectory: [
      {
        id: 201,
        name: "5-Ñ€ Ñ…Ð¾Ñ€Ð¾Ð¾ - 32 Ð¼Ð¾Ð´Ð½Ñ‹ Ñ‚Ð°Ð¹Ð»Ð°Ð½",
        departmentName: "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ",
        projectName: "2026 ÐœÐ¾Ð´ Ñ…ÑÐ»Ð±ÑÑ€Ð¶Ò¯Ò¯Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑƒÐ²Ð°Ð°Ñ€ÑŒ",
      stageLabel: "Ð¥ÑÐ½Ð°Ð³Ð´Ð°Ð¶ Ð±ÑƒÐ¹ Ð°Ð¶Ð¸Ð»",
        stageBucket: "review",
        statusKey: "review",
        statusLabel: "Ð¨Ð°Ð»Ð³Ð°Ð¶ Ð±Ð°Ð¹Ð½Ð°",
        deadline: "Ó¨Ð½Ó©Ó©Ð´Ó©Ñ€ 16:30",
        scheduledDate: todayDateKey,
        leaderName: "suldee",
        priorityLabel: "Ó¨Ð½Ð´Ó©Ñ€",
        progress: 100,
        plannedQuantity: 32,
        completedQuantity: 32,
        remainingQuantity: 0,
        measurementUnit: "Ð¼Ð¾Ð´",
        operationTypeLabel: "Ð•Ñ€Ó©Ð½Ñ…Ð¸Ð¹ Ð°Ð¶Ð¸Ð»",
        issueFlag: false,
        href: buildTaskHref(201, "/tasks"),
      },
      {
        id: 202,
        name: "Ð¥Ð¾Ð³ Ñ‚ÑÑÐ²Ñ€Ð¸Ð¹Ð½ 2-Ñ€ Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚",
        departmentName: "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð·, Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ",
        projectName: "Ð¥Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ó©Ð³Ð»Ó©Ó©Ð½Ð¸Ð¹ Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚",
        stageLabel: "Ð¯Ð²Ð°Ð³Ð´Ð°Ð¶ Ð±ÑƒÐ¹ Ð°Ð¶Ð¸Ð»",
        stageBucket: "progress",
        statusKey: "problem",
        statusLabel: "ÐÑÑƒÑƒÐ´Ð°Ð»Ñ‚Ð°Ð¹",
        deadline: "Ó¨Ð½Ó©Ó©Ð´Ó©Ñ€ 19:00",
        scheduledDate: todayDateKey,
        leaderName: "sarangerel",
        priorityLabel: "Ð¯Ð°Ñ€Ð°Ð»Ñ‚Ð°Ð¹",
        progress: 88,
        plannedQuantity: 5,
        completedQuantity: 4,
        remainingQuantity: 1,
        measurementUnit: "Ð°Ñ‡Ð¸Ð»Ñ‚",
        operationTypeLabel: "Ð¥Ð¾Ð³ Ñ†ÑƒÐ³Ð»ÑƒÑƒÐ»Ð°Ð»Ñ‚",
        issueFlag: true,
        href: buildTaskHref(202, "/tasks"),
      },
      {
        id: 102,
        name: "7-Ñ€ Ñ…Ð¾Ñ€Ð¾Ð¾ - Ð¢Ó©Ð² Ð·Ð°Ð¼Ñ‹Ð½ Ð·Ð°Ñ…Ñ‹Ð½ Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ",
        departmentName: "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ",
        projectName: "Ð—Ð°Ð¼ Ñ‚Ð°Ð»Ð±Ð°Ð¹Ð½ ÑˆÓ©Ð½Ð¸Ð¹Ð½ Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ",
        stageLabel: "Ð¥Ð¸Ð¹Ð³Ð´ÑÑ… Ð°Ð¶Ð¸Ð»",
        stageBucket: "todo",
        statusKey: "planned",
        statusLabel: "Ð¢Ó©Ð»Ó©Ð²Ð»Ó©Ð³Ð´ÑÓ©Ð½",
        deadline: "ÐœÐ°Ñ€Ð³Ð°Ð°Ñˆ 06:00",
        scheduledDate: tomorrowDateKey,
        leaderName: "temuulen",
        priorityLabel: "Ð¯Ð°Ñ€Ð°Ð»Ñ‚Ð°Ð¹",
        progress: 0,
        plannedQuantity: 12,
        completedQuantity: 0,
        remainingQuantity: 12,
        measurementUnit: "ÐºÐ¼Â²",
        operationTypeLabel: "Ð“ÑƒÐ´Ð°Ð¼Ð¶ Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ",
        issueFlag: false,
        href: buildTaskHref(102, "/tasks"),
      },
      {
        id: 103,
        name: "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð· - 3 Ð¼Ð°ÑˆÐ¸Ð½Ð´ ÑƒÑ€ÑÐ³Ð°Ð» Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑ",
        departmentName: "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð·, Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ",
        projectName: "Ð¢ÐµÑ…Ð½Ð¸ÐºÐ¸Ð¹Ð½ Ó©Ð´Ó©Ñ€ Ñ‚ÑƒÑ‚Ð¼Ñ‹Ð½ Ð±ÑÐ»ÑÐ½ Ð±Ð°Ð¹Ð´Ð°Ð»",
        stageLabel: "Ð¯Ð²Ð°Ð³Ð´Ð°Ð¶ Ð±ÑƒÐ¹ Ð°Ð¶Ð¸Ð»",
        stageBucket: "progress",
        statusKey: "working",
        statusLabel: "ÐÐ¶Ð¸Ð»Ð»Ð°Ð¶ Ð±Ð°Ð¹Ð½Ð°",
        deadline: "Ó¨Ð½Ó©Ó©Ð´Ó©Ñ€ 17:30",
        scheduledDate: todayDateKey,
        leaderName: "bold",
        priorityLabel: "Ð”ÑƒÐ½Ð´",
        progress: 33,
        plannedQuantity: 3,
        completedQuantity: 1,
        remainingQuantity: 2,
        measurementUnit: "Ð¼Ð°ÑˆÐ¸Ð½",
        operationTypeLabel: "Ð•Ñ€Ó©Ð½Ñ…Ð¸Ð¹ Ð°Ð¶Ð¸Ð»",
        issueFlag: false,
        href: buildTaskHref(103, "/tasks"),
      },
    ],
    liveTasks: [
      {
        id: 101,
        departmentName: "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ",
        name: "1-Ñ€ Ñ…Ð¾Ñ€Ð¾Ð¾ - 20-Ñ€ Ð±Ð°Ð¹Ñ€Ð½Ñ‹ Ð°Ñ€ Ñ‚Ð°Ð»",
        projectName: "2026 ÐœÐ¾Ð´ Ñ…ÑÐ»Ð±ÑÑ€Ð¶Ò¯Ò¯Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑƒÐ²Ð°Ð°Ñ€ÑŒ",
        stageLabel: "Ð¯Ð²Ð°Ð³Ð´Ð°Ð¶ Ð±ÑƒÐ¹ Ð°Ð¶Ð¸Ð»",
        stageBucket: "progress",
        deadline: "Ó¨Ð½Ó©Ó©Ð´Ó©Ñ€ 18:00",
        scheduledDate: todayDateKey,
        plannedQuantity: 48,
        completedQuantity: 21,
        remainingQuantity: 27,
        measurementUnit: "Ð¼Ð¾Ð´",
        leaderName: "suldee",
        priorityLabel: "Ó¨Ð½Ð´Ó©Ñ€",
        progress: 44,
        href: buildTaskHref(101, "/tasks"),
      },
      {
        id: 102,
        departmentName: "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ",
        name: "7-Ñ€ Ñ…Ð¾Ñ€Ð¾Ð¾ - Ð¢Ó©Ð² Ð·Ð°Ð¼Ñ‹Ð½ Ð·Ð°Ñ…Ñ‹Ð½ Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ",
        projectName: "Ð—Ð°Ð¼ Ñ‚Ð°Ð»Ð±Ð°Ð¹Ð½ ÑˆÓ©Ð½Ð¸Ð¹Ð½ Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ",
        stageLabel: "Ð¥Ð¸Ð¹Ð³Ð´ÑÑ… Ð°Ð¶Ð¸Ð»",
        stageBucket: "todo",
        deadline: "ÐœÐ°Ñ€Ð³Ð°Ð°Ñˆ 06:00",
        scheduledDate: tomorrowDateKey,
        plannedQuantity: 12,
        completedQuantity: 0,
        remainingQuantity: 12,
        measurementUnit: "ÐºÐ¼Â²",
        leaderName: "temuulen",
        priorityLabel: "Ð¯Ð°Ñ€Ð°Ð»Ñ‚Ð°Ð¹",
        progress: 0,
        href: buildTaskHref(102, "/tasks"),
      },
      {
        id: 103,
        departmentName: "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð·, Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ",
        name: "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð· - 3 Ð¼Ð°ÑˆÐ¸Ð½Ð´ ÑƒÑ€ÑÐ³Ð°Ð» Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑ",
        projectName: "Ð¢ÐµÑ…Ð½Ð¸ÐºÐ¸Ð¹Ð½ Ó©Ð´Ó©Ñ€ Ñ‚ÑƒÑ‚Ð¼Ñ‹Ð½ Ð±ÑÐ»ÑÐ½ Ð±Ð°Ð¹Ð´Ð°Ð»",
        stageLabel: "Ð¯Ð²Ð°Ð³Ð´Ð°Ð¶ Ð±ÑƒÐ¹ Ð°Ð¶Ð¸Ð»",
        stageBucket: "progress",
        deadline: "Ó¨Ð½Ó©Ó©Ð´Ó©Ñ€ 17:30",
        scheduledDate: todayDateKey,
        plannedQuantity: 3,
        completedQuantity: 1,
        remainingQuantity: 2,
        measurementUnit: "Ð¼Ð°ÑˆÐ¸Ð½",
        leaderName: "bold",
        priorityLabel: "Ð”ÑƒÐ½Ð´",
        progress: 33,
        href: buildTaskHref(103, "/tasks"),
      },
    ],
    reviewQueue: [
        {
          id: 201,
          name: "5-Ñ€ Ñ…Ð¾Ñ€Ð¾Ð¾ - 32 Ð¼Ð¾Ð´Ð½Ñ‹ Ñ‚Ð°Ð¹Ð»Ð°Ð½",
          departmentName: "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ",
      stageLabel: "Ð¥ÑÐ½Ð°Ð³Ð´Ð°Ð¶ Ð±ÑƒÐ¹ Ð°Ð¶Ð¸Ð»",
          deadline: "Ó¨Ð½Ó©Ó©Ð´Ó©Ñ€ 16:30",
          projectName: "2026 ÐœÐ¾Ð´ Ñ…ÑÐ»Ð±ÑÑ€Ð¶Ò¯Ò¯Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑƒÐ²Ð°Ð°Ñ€ÑŒ",
          leaderName: "suldee",
          progress: 100,
        href: buildTaskHref(201, "/review"),
      },
        {
          id: 202,
          name: "Ð¥Ð¾Ð³ Ñ‚ÑÑÐ²Ñ€Ð¸Ð¹Ð½ 2-Ñ€ Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚",
          departmentName: "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð·, Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ",
      stageLabel: "Ð¥ÑÐ½Ð°Ð³Ð´Ð°Ð¶ Ð±ÑƒÐ¹ Ð°Ð¶Ð¸Ð»",
          deadline: "Ó¨Ð½Ó©Ó©Ð´Ó©Ñ€ 19:00",
          projectName: "Ð¥Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ó©Ð³Ð»Ó©Ó©Ð½Ð¸Ð¹ Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚",
          leaderName: "sarangerel",
          progress: 88,
        href: buildTaskHref(202, "/review"),
      },
    ],
    qualityAlerts: [
      {
        id: 401,
        name: "Ð¥Ð¾Ð³Ð¸Ð¹Ð½ 2-Ñ€ Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚",
        departmentName: "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð·, Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ",
        projectName: "Ó¨Ð³Ð»Ó©Ó©Ð½Ð¸Ð¹ Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²Ñ€Ð¸Ð¹Ð½ Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚",
        routeName: "2-Ñ€ Ñ‡Ð¸Ð³Ð»ÑÐ»",
        operationTypeLabel: "Ð¥Ð¾Ð³ Ñ†ÑƒÐ³Ð»ÑƒÑƒÐ»Ð°Ð»Ñ‚",
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
        name: "Ð¢Ó©Ð² Ð·Ð°Ð¼Ñ‹Ð½ Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ",
        departmentName: "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ",
        projectName: "Ð¨Ó©Ð½Ð¸Ð¹Ð½ Ð³ÑƒÐ´Ð°Ð¼Ð¶ Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ",
        routeName: "7-Ñ€ Ñ…Ð¾Ñ€Ð¾Ð¾Ð½Ñ‹ Ñ‡Ð¸Ð³Ð»ÑÐ»",
        operationTypeLabel: "Ð“ÑƒÐ´Ð°Ð¼Ð¶ Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ",
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
        departmentName: "ÐÐ¾Ð³Ð¾Ð¾Ð½ Ð±Ð°Ð¹Ð³ÑƒÑƒÐ»Ð°Ð¼Ð¶, Ñ†ÑÐ²ÑÑ€Ð»ÑÐ³ÑÑ Ò¯Ð¹Ð»Ñ‡Ð¸Ð»Ð³ÑÑÐ½Ð¸Ð¹ Ñ…ÑÐ»Ñ‚ÑÑ",
        reporter: "suldee",
        taskName: "1-Ñ€ Ñ…Ð¾Ñ€Ð¾Ð¾ - 20-Ñ€ Ð±Ð°Ð¹Ñ€Ð½Ñ‹ Ð°Ñ€ Ñ‚Ð°Ð»",
        projectName: "2026 ÐœÐ¾Ð´ Ñ…ÑÐ»Ð±ÑÑ€Ð¶Ò¯Ò¯Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑƒÐ²Ð°Ð°Ñ€ÑŒ",
        summary: "21 Ð¼Ð¾Ð´ Ñ…ÑÐ»Ð±ÑÑ€Ð¶Ò¯Ò¯Ð»Ð¶, 1 Ð·ÑƒÑ€Ð°Ð³, 1 Ð°ÑƒÐ´Ð¸Ð¾ Ñ‚Ð°Ð¹Ð»Ð°Ð½ Ñ…Ð°Ð²ÑÐ°Ñ€Ð³Ð°ÑÐ°Ð½.",
        text: "21 Ð¼Ð¾Ð´ Ñ…ÑÐ»Ð±ÑÑ€Ð¶Ò¯Ò¯Ð»Ð¶, 1 Ð·ÑƒÑ€Ð°Ð³, 1 Ð°ÑƒÐ´Ð¸Ð¾ Ñ‚Ð°Ð¹Ð»Ð°Ð½ Ñ…Ð°Ð²ÑÐ°Ñ€Ð³Ð°ÑÐ°Ð½.",
        state: "submitted",
        stateLabel: "Ð¢Ð°Ð¹Ð»Ð°Ð½ Ð¸Ð»Ð³ÑÑÑÑÐ½",
        stateBucket: "review",
        rejectionReason: "",
        reportedQuantity: 21,
        measurementUnit: "Ð¼Ð¾Ð´",
        measurementUnitCode: "tree",
        imageCount: 1,
        audioCount: 1,
        images: [],
        audios: [],
        submittedAt: "Ó¨Ð½Ó©Ó©Ð´Ó©Ñ€ 15:30",
      },
      {
        id: 302,
        departmentName: "ÐÐ²Ñ‚Ð¾ Ð±Ð°Ð°Ð·, Ñ…Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ñ…ÑÐ»Ñ‚ÑÑ",
        reporter: "sarangerel",
        taskName: "Ð¥Ð¾Ð³ Ñ‚ÑÑÐ²Ñ€Ð¸Ð¹Ð½ 2-Ñ€ Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚",
        projectName: "Ð¥Ð¾Ð³ Ñ‚ÑÑÐ²ÑÑ€Ð»ÑÐ»Ñ‚Ð¸Ð¹Ð½ Ó©Ð³Ð»Ó©Ó©Ð½Ð¸Ð¹ Ð¼Ð°Ñ€ÑˆÑ€ÑƒÑ‚",
        summary: "ÐœÐ°Ñ€ÑˆÑ€ÑƒÑ‚ Ð´ÑƒÑƒÑÑÐ°Ð½, Ð´Ð°Ñ…Ð¸Ð½ Ð°Ñ‡Ð¸Ð»Ñ‚ 18:00-Ð´ ÑÑ…ÑÐ»Ð½Ñ.",
        text: "ÐœÐ°Ñ€ÑˆÑ€ÑƒÑ‚ Ð´ÑƒÑƒÑÑÐ°Ð½, Ð´Ð°Ñ…Ð¸Ð½ Ð°Ñ‡Ð¸Ð»Ñ‚ 18:00-Ð´ ÑÑ…ÑÐ»Ð½Ñ.",
        state: "submitted",
        stateLabel: "Ð¢Ð°Ð¹Ð»Ð°Ð½ Ð¸Ð»Ð³ÑÑÑÑÐ½",
        stateBucket: "review",
        rejectionReason: "",
        reportedQuantity: 4,
        measurementUnit: "ÑƒÐ´Ð°Ð°",
        measurementUnitCode: "times",
        imageCount: 2,
        audioCount: 0,
        images: [],
        audios: [],
        submittedAt: "Ó¨Ð½Ó©Ó©Ð´Ó©Ñ€ 14:10",
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
  options: { allowFallback?: boolean } = {},
) {
  const connection = createOdooConnection(connectionOverrides);
  const cachedSnapshot = readCachedMunicipalSnapshot(connection);
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  const cacheKey = getMunicipalSnapshotCacheKey(connection);
  const canUsePendingSnapshot = options.allowFallback !== false;
  if (canUsePendingSnapshot) {
    const pendingSnapshot = municipalSnapshotPendingCache.get(cacheKey);
    if (pendingSnapshot) {
      return pendingSnapshot;
    }
  }

  const snapshotPromise = (async () => {
    try {
      const snapshot = await fetchLiveSnapshot(connection);
      writeCachedMunicipalSnapshot(connection, snapshot);
      return snapshot;
    } catch (error) {
      if (options.allowFallback === false) {
        throw error;
      }
      console.warn("Falling back to demo dashboard snapshot:", error);
      const fallback = buildFallbackSnapshot();
      writeCachedMunicipalSnapshot(connection, fallback);
      return fallback;
    }
  })().finally(() => {
    municipalSnapshotPendingCache.delete(cacheKey);
  });

  if (canUsePendingSnapshot) {
    municipalSnapshotPendingCache.set(cacheKey, snapshotPromise);
  }
  return snapshotPromise;
}
