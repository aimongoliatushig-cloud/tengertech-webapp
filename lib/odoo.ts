import "server-only";

import { getDateKeyFromValue, getTodayDateKey } from "@/lib/dashboard-scope";
import {
  CANONICAL_DEPARTMENT_NAMES,
  findDepartmentGroupByName,
  matchesDepartmentGroup,
  normalizeOrganizationUnitName,
} from "@/lib/department-groups";
import {
  compareHrDepartmentThenName,
  getHrEmployeeDepartmentDisplayName,
  getHrDepartmentDisplayName,
  getHrJobTitleDisplayName,
} from "@/lib/hr-department-order";
import type { RoleGroupFlags } from "@/lib/roles";
import { fixMojibakeText } from "@/lib/text-normalize";

type OdooRelation = [number, string] | false;

const DEFAULT_ODOO_RPC_TIMEOUT_MS = 8_000;
const configuredOdooRpcTimeoutMs = Number(process.env.ODOO_RPC_TIMEOUT_MS);
const ODOO_RPC_TIMEOUT_MS =
  Number.isFinite(configuredOdooRpcTimeoutMs) && configuredOdooRpcTimeoutMs > 0
    ? configuredOdooRpcTimeoutMs
    : DEFAULT_ODOO_RPC_TIMEOUT_MS;
const ODOO_AUTH_CACHE_TTL_MS = 5 * 60_000;
const ODOO_READ_RPC_CACHE_TTL_MS = 2 * 60_000;

function isRoadCleaningPhotoPlaceholderTaskName(value: string) {
  const normalized = value
    .trim()
    .toLocaleLowerCase("mn-MN")
    .replace(/\s+/g, " ");

  return (
    normalized.includes("өмнөх зураг") || normalized.includes("дараах зураг")
  );
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
  mfo_inspector_employee_id?: OdooRelation;
  ops_planned_quantity?: number;
  ops_completed_quantity?: number;
  ops_remaining_quantity?: number;
  ops_progress_percent?: number;
  ops_measurement_unit?: string | false;
  ops_measurement_unit_id?: OdooRelation;
  ops_measurement_unit_code?: string | false;
  priority?: string;
  date_deadline?: string | false;
  date_last_stage_update?: string | false;
  mfo_shift_date?: string | false;
  mfo_is_operation_project?: boolean;
  mfo_operation_type?: string | false;
  mfo_route_id?: OdooRelation;
  mfo_vehicle_id?: OdooRelation;
  mfo_driver_employee_id?: OdooRelation;
  mfo_collector_employee_ids?: number[];
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
  group_ids?: number[];
};

type OdooAuthEmployeeRecord = {
  id: number;
  name: string;
  job_id?: OdooRelation;
  job_title?: string | false;
  department_id?: OdooRelation;
};

type OdooGroupMembershipRecord = {
  id: number;
  implied_ids?: number[];
  trans_implied_ids?: number[];
};

type OdooExternalIdRecord = {
  module?: string | false;
  name?: string | false;
  res_id?: number | false;
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
  trial_date_end?: string | false;
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
  managerJobTitle?: string;
  departmentName: string;
  operationType?: string;
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
  inspectorEmployeeId?: number | null;
  inspectorName?: string;
  inspectorUserId?: number | null;
  priorityLabel: string;
  progress: number;
  href: string;
};

export type TaskStatusKey =
  | "planned"
  | "working"
  | "review"
  | "verified"
  | "problem";

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
  /** ops_department_id тодорхой тавигдсан = хэлтэст даалгасан ажил (систем данс руу). */
  isDepartmentTask?: boolean;
  /** Гүйцэтгэгчийн (assignee) жинхэнэ hr.department нэр — хэлтсээр scope хийхэд. */
  assigneeDepartmentName?: string;
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
  inspectorEmployeeId?: number | null;
  inspectorName?: string;
  inspectorUserId?: number | null;
  priorityLabel: string;
  progress: number;
  plannedQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  measurementUnit: string;
  operationType: string;
  operationTypeLabel: string;
  vehicleName?: string;
  driverName?: string;
  unresolvedStopCount?: number;
  missingProofStopCount?: number;
  deviationStopCount?: number;
  hasWeightWarning?: boolean;
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
  submittedDateKey?: string;
  submittedAt: string;
  // Даалгаврын эхлэх/товлосон огноо (ээлжийн огноо -> дуусах хугацаа -> үүссэн огноо).
  taskDateKey?: string;
  // Ажил дууссан огноо: даалгавар "Дууссан" төлөвт шилжсэн огноо (дуусаагүй бол хоосон).
  taskDoneDateKey?: string;
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
    employeeJobTitle?: string;
    groupFlags: RoleGroupFlags;
  };
};

function normalizeRoleTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function inferProcurementGroupFlagsFromTitle(
  value: string,
): Partial<RoleGroupFlags> {
  const title = normalizeRoleTitle(value);
  const isDepartmentHead =
    title.includes("хэлтсийн дарга") ||
    title.includes("хэлтэсийн дарга") ||
    title.includes("албаны дарга");
  const isPurchaseManager =
    title.includes("худалдан авалт") ||
    title.includes("худалдан авах") ||
    title.includes("хангамж");
  const isStorekeeper =
    title.includes("нярав") ||
    title.includes("агуулахын ажилтан") ||
    title.includes("storekeeper");
  const isGeneralAccountant =
    title.includes("ерөнхий ня-бо") ||
    title.includes("ерөнхий нябо") ||
    title.includes("ерөнхий ня бо") ||
    title.includes("ерөнхий нягтлан");
  const isAdministration =
    title.includes("бичиг хэргийн ажилтан") ||
    title.includes("бичиг хэрэг") ||
    title.includes("захиргааны ажилтан");
  const isLegalSpecialist =
    title.includes("хуулийн мэргэжилтэн") || title.includes("хуульч");

  return {
    municipalDepartmentHead: isDepartmentHead,
    procurementPurchaseManager: isPurchaseManager,
    procurementStorekeeper: isStorekeeper,
    procurementFinance: isGeneralAccountant,
    procurementAdministration: isAdministration,
    procurementLegal: isLegalSpecialist,
  };
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
    title.includes("хүний нөөц") ||
    title.includes("human resources") ||
    title.includes("hr specialist") ||
    title.includes("hr manager")
  ) {
    return title.includes("manager") || title.includes("менежер")
      ? "hr_manager"
      : "hr_specialist";
  }

  if (
    title.includes("захирал") ||
    title.includes("ceo") ||
    title.includes("director")
  ) {
    return "director";
  }

  if (
    title.includes("үйл ажиллагаа хариуцсан менежер") ||
    title.includes("ерөнхий менежер") ||
    title.includes("general manager")
  ) {
    return "general_manager";
  }

  if (
    title.includes("хэлтсийн дарга") ||
    title.includes("хэлтэсийн дарга") ||
    title.includes("албаны дарга")
  ) {
    return "project_manager";
  }

  if (
    title.includes("тээвэрлэлтийн хяналтын ажилтан") ||
    title.includes("тээврийн хяналтын ажилтан") ||
    title.includes("хог тээврийн хяналтын ажилтан") ||
    (title.includes("тээвэр") && title.includes("хяналт")) ||
    (title.includes("teever") && title.includes("hyanalt")) ||
    (title.includes("хяналтын ажилтан") &&
      (titleWithDepartment.includes("хог тээвэр") ||
        titleWithDepartment.includes("авто бааз")))
  ) {
    return "transport_inspector";
  }

  if (
    title.includes("ахлах мастер") ||
    title.includes("мастер") ||
    title.includes("даамал") ||
    title.includes("талбайн инженер") ||
    title.includes("talbain engineer") ||
    title.includes("field engineer")
  ) {
    return "senior_master";
  }

  return null;
}

function getEmployeeJobTitle(employee?: OdooAuthEmployeeRecord | null) {
  if (!employee) {
    return "";
  }

  const jobName = Array.isArray(employee.job_id) ? employee.job_id[1] : "";
  return (jobName || employee.job_title || "").trim();
}

function resolveAuthenticatedRole(
  explicitRole: string | false,
  employee?: OdooAuthEmployeeRecord | null,
) {
  const inferredRole = inferRoleFromEmployeeTitle(employee);
  if (inferredRole === "general_manager" || inferredRole === "transport_inspector") {
    return inferredRole;
  }

  const role = explicitRole || "worker";
  if (role && role !== "worker") {
    return role;
  }

  return inferredRole ?? role;
}

async function expandUserGroupIds(
  uid: number,
  groupIds: number[],
  connection: OdooConnection,
) {
  const allGroupIds = new Set(groupIds);
  let frontier = groupIds;

  while (frontier.length) {
    const groups = await executeKw<OdooGroupMembershipRecord[]>(
      uid,
      "res.groups",
      "search_read",
      [[["id", "in", frontier]]],
      {
        fields: ["implied_ids", "trans_implied_ids"],
        limit: frontier.length,
      },
      connection,
    );
    const next: number[] = [];

    for (const group of groups) {
      for (const impliedId of [
        ...(group.implied_ids ?? []),
        ...(group.trans_implied_ids ?? []),
      ]) {
        if (!allGroupIds.has(impliedId)) {
          allGroupIds.add(impliedId);
          next.push(impliedId);
        }
      }
    }

    frontier = next;
  }

  return Array.from(allGroupIds);
}

async function readUserGroupXmlIds(
  uid: number,
  user: OdooUserRecord,
  connection: OdooConnection,
) {
  if (!Array.isArray(user.group_ids)) {
    return null;
  }

  const directGroupIds = user.group_ids;
  if (!directGroupIds.length) {
    return new Set<string>();
  }

  try {
    const groupIds = await expandUserGroupIds(uid, directGroupIds, connection);
    const externalIds = await executeKw<OdooExternalIdRecord[]>(
      uid,
      "ir.model.data",
      "search_read",
      [
        [
          ["model", "=", "res.groups"],
          ["res_id", "in", groupIds],
        ],
      ],
      {
        fields: ["module", "name", "res_id"],
        limit: Math.max(groupIds.length * 3, 1),
      },
      connection,
    );

    return new Set(
      externalIds
        .map((record) =>
          record.module && record.name ? `${record.module}.${record.name}` : "",
        )
        .filter(Boolean),
    );
  } catch (error) {
    console.warn(
      "Fast group membership lookup failed; falling back to has_group:",
      error,
    );
    return null;
  }
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
  jobId?: number | null;
  jobTitle: string;
  workPhone: string;
  mobilePhone: string;
  workEmail: string;
  userId?: number | null;
  userName: string;
  photoUrl: string;
  photoLargeUrl?: string;
  employeeCode: string;
  gradeRank: string;
  workType?: string;
  statusKey: string;
  statusLabel: string;
  managerId?: number | null;
  managerName: string;
  startDate: string;
  contractEndDate: string;
  birthDate: string;
  genderKey: string;
  genderLabel: string;
  educationLevel: string;
  educationRecords?: HrEmployeeEducationRecord[];
  educationAttachmentIds?: number[];
  registerNumber?: string;
  privatePhone?: string;
  privateEmail?: string;
  homeAddress?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  placeOfBirth?: string;
  countryOfBirthId?: number | null;
  countryOfBirth?: string;
  nationalityId?: number | null;
  nationality?: string;
  maritalStatus?: string;
  spouseName?: string;
  spouseBirthDate?: string;
  childrenCount?: number;
  passportNumber?: string;
  studyField?: string;
  studySchool?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccount?: string;
  baseSalary?: string;
  workLocation?: string;
  workAddress?: string;
  workSchedule?: string;
  coachName?: string;
  categoryNames?: string[];
  departmentManagerName?: string;
  contractName?: string;
  wage?: number;
  payCategory?: string;
  taxNumber?: string;
  socialInsuranceStartDate?: string;
  departureDate?: string;
  departureReason?: string;
  departureDescription?: string;
  trialEndDate?: string;
  biography?: string;
  notes?: string;
  missingDocumentCount: number;
  kpiScore: number;
  taskCompletionPercent: number;
  disciplineScore: number;
  familyMembers?: HrEmployeeFamilyMember[];
  emergencyContacts?: HrEmployeeEmergencyContact[];
  rewards?: HrEmployeeReward[];
  talentSkills?: HrEmployeeTalentSkill[];
  documentRecords?: HrEmployeeDocumentRecord[];
};

export type HrEmployeeFamilyMember = {
  id: number;
  employeeId: number;
  relatedEmployeeId: number;
  relatedEmployeeName: string;
  relation: string;
  relationLabel: string;
  birthYear: string;
  school: string;
  phone: string;
  departmentName: string;
  jobTitle: string;
  note: string;
};

export type HrEmployeeEducationRecord = {
  id: string;
  level: string;
  field: string;
  school: string;
};

export type HrEmployeeDocumentRecord = {
  id: string;
  name: string;
  type: string;
  status: string;
  date: string;
  attachmentIds?: number[];
};

export type HrEmployeeEmergencyContact = {
  id: number;
  employeeId: number;
  name: string;
  relation: string;
  phone: string;
  address: string;
  note: string;
};

export type HrEmployeeReward = {
  id: number;
  employeeId: number;
  date: string;
  name: string;
  orderNo: string;
  note: string;
};

export type HrEmployeeTalentSkill = {
  id: number;
  employeeId: number;
  name: string;
  type: string;
  level: string;
  acquiredDate: string;
  note: string;
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
  x_vehicle_custom_name?: string | false;
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
  municipal_capacity?: string | false;
  municipal_import_date?: string | false;
  municipal_color?: string | false;
  municipal_manufactured_date?: string | false;
  municipal_seat_count?: number | false;
  x_municipal_operational_status?: string | false;
  x_gps_installed?: boolean;
  x_fuel_monitoring_installed?: boolean;
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
  municipal_insurance_contract_attachment_ids?: number[];
  municipal_inspection_date?: string | false;
  municipal_next_inspection_date?: string | false;
  municipal_inspection_days_remaining?: number;
  municipal_inspection_reminder_due?: boolean;
  municipal_inspection_note?: string | false;
  municipal_inspection_attachment_ids?: number[];
  municipal_front_photo_ids?: number[];
  municipal_rear_photo_ids?: number[];
  municipal_side_photo_ids?: number[];
  municipal_certificate_photo_ids?: number[];
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
  repair_note?: string | false;
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
  vehicle_license_plate?: string | false;
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
  vehicle_license_plate?: string | false;
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
  attachmentIds: number[];
  contractAttachmentCount?: number;
  contractAttachmentIds?: number[];
};

export type FleetVehicleAttachmentGroup = {
  key: string;
  label: string;
  ids: number[];
};

export type FleetVehiclePhotoGroup = FleetVehicleAttachmentGroup;

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
  repairNote: string;
  amountLabel: string;
  mechanicName: string;
  stateKey: string;
  stateLabel: string;
  procurementName: string;
  attachmentCount: number;
};

export type FleetVehicleDailyWeightItem = {
  id: number;
  vehicleId: number | null;
  vehiclePlate: string;
  vehicleName: string;
  reportDate: string;
  reportDateValue: string;
  weightTons: number;
  weightLabel: string;
  source: string;
  fetchedAt: string;
  fetchedAtValue: string;
  stateLabel: string;
  errorMessage: string;
};

export type FleetVehicleDailyFuelItem = {
  id: number;
  vehicleId: number | null;
  vehiclePlate: string;
  vehicleName: string;
  reportDate: string;
  reportDateValue: string;
  fuelLiters: number;
  fuelLabel: string;
  fuelType: string;
  source: string;
  fetchedAt: string;
  fetchedAtValue: string;
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
  gpsInstalled: boolean;
  fuelMonitoringInstalled: boolean;
  capacity: string;
  importedDate: string;
  importedDateValue: string;
  color: string;
  manufacturedDate: string;
  manufacturedDateValue: string;
  seatCountValue: string;
  seatCountLabel: string;
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
  photoGroups: FleetVehiclePhotoGroup[];
  documentGroups: FleetVehicleAttachmentGroup[];
  driverHistory: FleetVehicleDriverHistoryItem[];
  repairHistory: FleetVehicleRepairHistoryItem[];
  weightReports: FleetVehicleDailyWeightItem[];
  weightReportRows: FleetVehicleDailyWeightItem[];
  weightMonthTons: number;
  weightTotalTons: number;
  fuelReports: FleetVehicleDailyFuelItem[];
  fuelReportRows: FleetVehicleDailyFuelItem[];
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
  weightReportRows: FleetVehicleDailyWeightItem[];
  fuelReportRows: FleetVehicleDailyFuelItem[];
  highestFuelVehicle: string;
  mostRepairedVehicle: string;
  failedImportCount: number;
};

type StageBucket =
  | "todo"
  | "progress"
  | "review"
  | "done"
  | "problem"
  | "unknown";

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

const PROCUREMENT_GROUP_XML_IDS = {
  purchaseManager:
    "municipal_repair_workflow.group_procurement_purchase_manager",
  storekeeper: "municipal_repair_workflow.group_procurement_storekeeper",
  finance: "municipal_repair_workflow.group_procurement_finance_user",
  administration:
    "municipal_repair_workflow.group_procurement_administration_user",
  legal: "municipal_repair_workflow.group_procurement_legal_user",
  ceo: "municipal_repair_workflow.group_procurement_ceo",
  generalManager: "municipal_repair_workflow.group_procurement_general_manager",
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

const HR_CUSTOM_MN_GROUP_XML_IDS = {
  officer: "hr_custom_mn.group_hr_custom_mn_officer",
  admin: "hr_custom_mn.group_hr_custom_mn_admin",
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
  improvementFieldEngineer:
    "municipal_environment_services.group_improvement_field_engineer",
  improvementEngineer:
    "municipal_environment_services.group_improvement_engineer",
  improvementManager:
    "municipal_environment_services.group_improvement_manager",
  environmentManager:
    "municipal_environment_services.group_environment_manager",
} as const;

const PUBLIC_SERVICE_GROUP_XML_IDS = {
  complaintManager:
    "municipal_public_services.group_municipal_complaint_manager",
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
  staleUntil: number;
  value: DashboardSnapshot;
};

type CachedFleetVehicleBoard = {
  expiresAt: number;
  staleUntil: number;
  value: FleetVehicleBoard;
};

type CachedOdooReadRpc = {
  expiresAt: number;
  value: unknown;
};

type CachedHrDailyAttendanceSummary = {
  expiresAt: number;
  staleUntil: number;
  value: HrDailyAttendanceSummary;
};

type CachedOdooModelReadAccess = {
  expiresAt: number;
  value: boolean;
};

const MUNICIPAL_SNAPSHOT_CACHE_TTL_MS = 2 * 60_000;
const FLEET_VEHICLE_BOARD_CACHE_TTL_MS = 60_000;
const DASHBOARD_STALE_CACHE_TTL_MS = 10 * 60_000;
const municipalSnapshotCache = new Map<string, CachedMunicipalSnapshot>();
const fleetVehicleBoardCache = new Map<string, CachedFleetVehicleBoard>();
const municipalSnapshotPendingCache = new Map<
  string,
  Promise<DashboardSnapshot>
>();
const fleetVehicleBoardPendingCache = new Map<
  string,
  Promise<FleetVehicleBoard>
>();
const odooReadRpcCache = new Map<string, CachedOdooReadRpc>();
const odooReadRpcPendingCache = new Map<string, Promise<unknown>>();
const hrDailyAttendanceSummaryCache = new Map<
  string,
  CachedHrDailyAttendanceSummary
>();
const hrDailyAttendanceSummaryPendingCache = new Map<
  string,
  Promise<HrDailyAttendanceSummary>
>();
const odooModelReadAccessCache = new Map<string, CachedOdooModelReadAccess>();

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

const VOLATILE_ODOO_READ_MODELS = new Set([
  "mfo.collection.point",
  "mfo.crew.team",
  "mfo.district",
  "mfo.route",
  "mfo.route.line",
  "mfo.subdistrict",
]);

function isCacheableOdooReadRequest(
  model: string,
  method: string,
  kwargs: Record<string, unknown>,
) {
  if (VOLATILE_ODOO_READ_MODELS.has(model)) {
    return false;
  }

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

function getOdooModelReadAccessCacheKey(
  uid: number,
  model: string,
  connection: OdooConnection,
) {
  return stableSerialize({
    connection: getOdooAuthCacheKey(connection),
    uid,
    model,
    access: "read",
  });
}

async function hasOdooModelReadAccess(
  uid: number,
  model: string,
  connection: OdooConnection,
) {
  const cacheKey = getOdooModelReadAccessCacheKey(uid, model, connection);
  const cached = odooModelReadAccessCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const value = await executeKw<boolean>(
    uid,
    model,
    "check_access_rights",
    ["read"],
    { raise_exception: false },
    connection,
  ).catch(() => false);

  odooModelReadAccessCache.set(cacheKey, {
    value: Boolean(value),
    expiresAt: Date.now() + ODOO_READ_RPC_CACHE_TTL_MS,
  });
  return Boolean(value);
}

export function clearOdooReadCaches(connection?: OdooConnection) {
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
    odooModelReadAccessCache.clear();
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
  for (const key of odooModelReadAccessCache.keys()) {
    if (key.includes(authKey)) {
      odooModelReadAccessCache.delete(key);
    }
  }
}

function readCachedMunicipalSnapshot(
  connection: OdooConnection,
  options: { allowStale?: boolean } = {},
) {
  const cacheKey = getMunicipalSnapshotCacheKey(connection);
  const cached = municipalSnapshotCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (cached.expiresAt <= now) {
    if (options.allowStale && cached.staleUntil > now) {
      return cleanSnapshotText(cached.value);
    }
    if (cached.staleUntil <= now) {
      municipalSnapshotCache.delete(cacheKey);
    }
    return null;
  }

  if (cached.staleUntil <= now) {
    municipalSnapshotCache.delete(cacheKey);
    return null;
  }

  return cleanSnapshotText(cached.value);
}

function writeCachedMunicipalSnapshot(
  connection: OdooConnection,
  value: DashboardSnapshot,
) {
  municipalSnapshotCache.set(getMunicipalSnapshotCacheKey(connection), {
    value,
    expiresAt: Date.now() + MUNICIPAL_SNAPSHOT_CACHE_TTL_MS,
    staleUntil: Date.now() + MUNICIPAL_SNAPSHOT_CACHE_TTL_MS + DASHBOARD_STALE_CACHE_TTL_MS,
  });
}

function readCachedFleetVehicleBoard(
  connection: OdooConnection,
  options: { allowStale?: boolean } = {},
) {
  const cacheKey = getMunicipalSnapshotCacheKey(connection);
  const cached = fleetVehicleBoardCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  const now = Date.now();
  if (cached.expiresAt <= now) {
    if (options.allowStale && cached.staleUntil > now) {
      return cached.value;
    }
    if (cached.staleUntil <= now) {
      fleetVehicleBoardCache.delete(cacheKey);
    }
    return null;
  }

  if (cached.staleUntil <= now) {
    fleetVehicleBoardCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function writeCachedFleetVehicleBoard(
  connection: OdooConnection,
  value: FleetVehicleBoard,
) {
  fleetVehicleBoardCache.set(getMunicipalSnapshotCacheKey(connection), {
    value,
    expiresAt: Date.now() + FLEET_VEHICLE_BOARD_CACHE_TTL_MS,
    staleUntil: Date.now() + FLEET_VEHICLE_BOARD_CACHE_TTL_MS + DASHBOARD_STALE_CACHE_TTL_MS,
  });
}

function readCachedOdooAuth(
  connection: OdooConnection,
): OdooAuthSession | null {
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
  garbage_seasonal: "Гэнэтийн ажил",
  street_cleaning: "Гудамж цэвэрлэгээ",
  green_maintenance: "Ногоон байгууламж",
};

const STAGE_LABELS: Record<StageBucket, string> = {
  todo: "Төлөвлөсөн",
  progress: "Төлөвлөсөн",
  review: "Хянаж байгаа",
  done: "Дууссан",
  problem: "Хянаж байгаа",
  unknown: "Төлөвлөсөн",
};

const TASK_STATUS_LABELS: Record<TaskStatusKey, string> = {
  planned: "Төлөвлөсөн",
  working: "Төлөвлөсөн",
  review: "Хянаж байгаа",
  verified: "Дууссан",
  problem: "Хянаж байгаа",
};

const UNKNOWN_DEPARTMENT = "Тодорхойгүй";
const AUTO_BASE_DEPARTMENT = "Авто бааз, хог тээвэрлэлтийн хэлтэс";
const AUTO_BASE_UNIT = "Авто бааз";
const WASTE_TRANSPORT_UNIT = "Хог тээвэрлэлт";
const GREEN_SERVICE_DEPARTMENT =
  "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс";
const GREEN_LANDSCAPE_UNIT = "Ногоон байгууламж";
const CLEANING_SERVICE_UNIT = "Цэвэрлэгээ үйлчилгээ";
const IMPROVEMENT_DEPARTMENT = "Тохижилтын хэлтэс";

const KNOWN_STAGE_MATCHERS: Array<[StageBucket, string[]]> = [
  ["todo", ["хийгдэх", "todo", "task"]],
  [
    "progress",
    [
      "явагдаж",
      "хийгдэж",
      "хийж байна",
      "ажиллаж",
      "progress",
      "hiihdej",
      "in progress",
    ],
  ],
  [
    "review",
    [
      "шалгагдаж",
      "хянагдаж",
      "review",
      "changes requested",
      "shalgagdaj",
      "shalgah",
      "hyanagdaj",
    ],
  ],
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
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint)
        ? String.fromCodePoint(codePoint)
        : match;
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

  const markerMatch = text.match(
    /Засвар\s+нэхэж\s+буцаасан\s+шалтгаан\s*:?\s*/i,
  );
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
  const markerIndex = description.toLowerCase().indexOf("тоо хэмжээ");
  if (markerIndex === -1) {
    return [];
  }

  const quantityText = description
    .slice(markerIndex)
    .replace(/^тоо хэмжээ\s*:?\s*/i, "");
  const matches = Array.from(
    quantityText.matchAll(
      /(?:^|\s)(?:\d+\.\s*)?(\d+(?:[.,]\d+)?)\s+([^\d\n]+?)(?=\s+\d+\.|\n|$)/gi,
    ),
  );

  return matches
    .map((match) => ({
      quantity: Number(match[1].replace(",", ".")),
      unit: match[2].trim().replace(/[.,;:]+$/, ""),
    }))
    .filter(
      (line) =>
        Number.isFinite(line.quantity) && line.quantity > 0 && line.unit,
    );
}

function extractReportQuantityLines(reportText: string): QuantityLine[] {
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
      (line): line is QuantityLine =>
        line !== null &&
        Number.isFinite(line.quantity) &&
        line.quantity >= 0 &&
        Boolean(line.unit),
    );
}

function buildTaskQuantitySnapshot(
  task: OdooTaskRecord,
  reports: OdooReportRecord[],
): TaskQuantitySnapshot {
  const rawStageBucket = getStageBucket(relationName(task.stage_id, ""));
  const taskStateBucket = reportStateBucket(task.state);
  const mfoStateBucket = reportStateBucket(task.mfo_state);
  const reportBuckets = reports.map((report) =>
    reportStateBucket(report.state),
  );
  const hasReturnedReport = reportBuckets.includes("problem");
  const forcedProblem =
    taskStateBucket === "problem" ||
    mfoStateBucket === "problem" ||
    hasReturnedReport;
  const forcedReview =
    !forcedProblem &&
    (mfoStateBucket === "review" ||
      taskStateBucket === "review" ||
      rawStageBucket === "review" ||
      reportBuckets.includes("review"));
  const plannedLines = extractTaskQuantityLines(
    htmlToPlainText(task.description),
  );
  if (!plannedLines.length && (task.ops_planned_quantity ?? 0) > 0) {
    plannedLines.push({
      quantity: task.ops_planned_quantity ?? 0,
      unit: resolveTaskMeasurementUnit(task) || "нэгж",
    });
  }

  const completedByUnit = new Map<string, number>();
  for (const report of reports) {
    const parsedLines = extractReportQuantityLines(
      report.report_text || report.report_summary || "",
    );
    if (parsedLines.length) {
      for (const line of parsedLines) {
        const key = normalizeQuantityUnit(line.unit);
        completedByUnit.set(
          key,
          (completedByUnit.get(key) ?? 0) + line.quantity,
        );
      }
      continue;
    }

    const reportedQuantity = report.reported_quantity ?? 0;
    if (reportedQuantity > 0 && plannedLines.length === 1) {
      const key = normalizeQuantityUnit(plannedLines[0].unit);
      completedByUnit.set(
        key,
        (completedByUnit.get(key) ?? 0) + reportedQuantity,
      );
    }
  }

  const quantityLines = plannedLines.map((line) => {
    const completedQuantity =
      completedByUnit.get(normalizeQuantityUnit(line.unit)) ?? 0;
    const cappedCompletedQuantity = Math.min(completedQuantity, line.quantity);
    const progress =
      line.quantity > 0 ? (cappedCompletedQuantity / line.quantity) * 100 : 0;

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
    (total, line) =>
      total + Math.min(line.completedQuantity ?? 0, line.quantity),
    0,
  );
  const fallbackCompletedQuantity = task.ops_completed_quantity ?? 0;
  const completedQuantity =
    rawStageBucket === "done" &&
    parsedCompletedQuantity <= 0 &&
    plannedQuantity > 0
      ? plannedQuantity
      : parsedCompletedQuantity > 0
        ? parsedCompletedQuantity
        : fallbackCompletedQuantity;
  const parsedProgress = quantityLines.length
    ? quantityLines.reduce((total, line) => total + (line.progress ?? 0), 0) /
      quantityLines.length
    : 0;
  const rawProgress = task.ops_progress_percent ?? 0;
  const progress =
    rawStageBucket === "done" && Math.max(parsedProgress, rawProgress) <= 0
      ? 100
      : Math.max(parsedProgress, rawProgress);
  const stageBucket = forcedProblem
    ? "problem"
    : forcedReview
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
            ? "planned"
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
        ? `${completedQuantity}/${plannedQuantity} ${resolveTaskMeasurementUnit(task) || "нэгж"}`
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
    "mfo_inspector_employee_id",
    "ops_planned_quantity",
    "ops_completed_quantity",
    "ops_remaining_quantity",
    "ops_progress_percent",
    "ops_measurement_unit",
    "ops_measurement_unit_id",
    "ops_measurement_unit_code",
    "priority",
    "date_deadline",
    "date_last_stage_update",
    "mfo_shift_date",
    "state",
    "mfo_is_operation_project",
    "mfo_operation_type",
    "mfo_route_id",
    "mfo_vehicle_id",
    "mfo_driver_employee_id",
    "mfo_collector_employee_ids",
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
    "mfo_inspector_employee_id",
    "ops_planned_quantity",
    "ops_completed_quantity",
    "ops_remaining_quantity",
    "ops_progress_percent",
    "ops_measurement_unit",
    "ops_measurement_unit_id",
    "ops_measurement_unit_code",
    "priority",
    "date_deadline",
    "date_last_stage_update",
    "mfo_shift_date",
    "state",
    "mfo_is_operation_project",
    "mfo_operation_type",
    "mfo_route_id",
    "mfo_vehicle_id",
    "mfo_driver_employee_id",
    "mfo_collector_employee_ids",
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
    "date_last_stage_update",
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
    "date_last_stage_update",
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
    "report_summary",
    "reported_quantity",
    "state",
    "rejection_reason",
  ],
  [
    "task_id",
    "reporter_id",
    "report_datetime",
    "report_summary",
    "reported_quantity",
  ],
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
    "trial_date_end",
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
  [
    "name",
    "active",
    "department_id",
    "job_id",
    "work_phone",
    "mobile_phone",
    "work_email",
    "user_id",
  ],
  [
    "name",
    "active",
    "department_id",
    "job_title",
    "work_phone",
    "mobile_phone",
    "work_email",
    "user_id",
  ],
  [
    "name",
    "active",
    "department_id",
    "work_phone",
    "mobile_phone",
    "work_email",
    "user_id",
  ],
  ["name", "active", "department_id"],
];

const HR_ATTENDANCE_EMPLOYEE_FIELD_VARIANTS: string[][] = [
  ["name", "active", "user_id", "work_email", "x_mn_employment_status"],
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
  [
    "employee_id",
    "state",
    "holiday_status_id",
    "request_date_from",
    "request_date_to",
  ],
  ["employee_id", "state", "holiday_status_id", "date_from", "date_to"],
  ["employee_id", "holiday_status_id"],
];

const FLEET_VEHICLE_FIELD_VARIANTS: string[][] = [
  [
    "name",
    "x_vehicle_custom_name",
    "license_plate",
    "image_128",
    "image_1920",
    "model_id",
    "category_id",
    "municipal_vehicle_type_id",
    "municipal_department_id",
    "municipal_responsible_driver_id",
    "municipal_loader_1_id",
    "municipal_loader_2_id",
    "municipal_capacity",
    "municipal_import_date",
    "municipal_color",
    "municipal_manufactured_date",
    "municipal_seat_count",
    "x_municipal_operational_status",
    "x_gps_installed",
    "x_fuel_monitoring_installed",
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
    "municipal_insurance_contract_attachment_ids",
    "municipal_inspection_date",
    "municipal_next_inspection_date",
    "municipal_inspection_days_remaining",
    "municipal_inspection_reminder_due",
    "municipal_inspection_note",
    "municipal_inspection_attachment_ids",
    "municipal_front_photo_ids",
    "municipal_rear_photo_ids",
    "municipal_side_photo_ids",
    "municipal_certificate_photo_ids",
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
    "municipal_insurance_contract_attachment_ids",
    "municipal_inspection_date",
    "municipal_next_inspection_date",
    "municipal_inspection_days_remaining",
    "municipal_inspection_reminder_due",
    "municipal_inspection_note",
    "municipal_inspection_attachment_ids",
    "municipal_front_photo_ids",
    "municipal_rear_photo_ids",
    "municipal_side_photo_ids",
    "municipal_certificate_photo_ids",
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
    "municipal_insurance_attachment_ids",
    "municipal_insurance_contract_attachment_ids",
    "municipal_inspection_attachment_ids",
    "municipal_front_photo_ids",
    "municipal_rear_photo_ids",
    "municipal_side_photo_ids",
    "municipal_certificate_photo_ids",
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
    "municipal_insurance_attachment_ids",
    "municipal_insurance_contract_attachment_ids",
    "municipal_inspection_attachment_ids",
    "municipal_front_photo_ids",
    "municipal_rear_photo_ids",
    "municipal_side_photo_ids",
    "municipal_certificate_photo_ids",
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
  [
    "name",
    "active",
    "operation_type",
    "vehicle_id",
    "driver_employee_id",
    "loader_employee_ids",
  ],
  [
    "name",
    "active",
    "operation_type",
    "vehicle_id",
    "driver_employee_id",
    "loader_ids",
  ],
  [
    "name",
    "active",
    "operation_type",
    "vehicle_id",
    "driver_employee_id",
    "employee_ids",
  ],
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
  "repair_note",
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
  "vehicle_license_plate",
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
  "vehicle_license_plate",
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

function cleanDisplayText(value: string) {
  return fixMojibakeText(value);
}

function relationName(relation: OdooRelation, fallback = "Оноогоогүй") {
  return cleanDisplayText(Array.isArray(relation) ? relation[1] : fallback);
}

function relationId(relation: OdooRelation) {
  return Array.isArray(relation) ? relation[0] : null;
}

function normalizeFleetClassificationText(value?: string | false | null) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("mn-MN")
    .replace(/\s+/g, " ");
}

function isHiddenFleetVehicleTypeName(value?: string | false | null) {
  return normalizeFleetClassificationText(value).startsWith("smoke type");
}

function isHiddenFleetSmokeText(value?: string | false | null) {
  return normalizeFleetClassificationText(value).includes("smoke");
}

function isHiddenFleetTestText(value?: string | false | null) {
  const normalized = normalizeFleetClassificationText(value);
  return (
    normalized.includes("шалгах төрөл") ||
    normalized.includes("шалгах марк") ||
    normalized.includes("туршилтын төрөл") ||
    normalized.startsWith("chk")
  );
}

function getFleetVehicleTypeDisplayName(value?: string | false | null) {
  const name = String(value || "").trim();
  const normalized = normalizeFleetClassificationText(name);

  if (normalized === "хог ачилт" || normalized === "хог ачит") {
    return "Хогны машин";
  }

  return name;
}

function getFleetModelDisplayName(value?: string | false | null) {
  return String(value || "")
    .split("/")
    .map((part) => part.trim())
    .filter(
      (part) =>
        part && normalizeFleetClassificationText(part) !== "бусад",
    )
    .join("/");
}

function getFleetVehicleDisplayName(
  value: string | false | null | undefined,
  plate: string | false | null | undefined,
  modelName: string,
) {
  const normalizedPlate = normalizeFleetClassificationText(plate);
  const name = String(value || "")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => {
      const normalizedPart = normalizeFleetClassificationText(part);
      return (
        part &&
        normalizedPart !== "бусад" &&
        (!normalizedPlate || normalizedPart !== normalizedPlate)
      );
    })
    .join("/");

  return name || modelName || String(plate || "").trim();
}

function normalizeFleetVehicleTypeOptions(options: FleetVehicleSelectOption[]) {
  const seen = new Set<string>();
  const normalizedOptions: FleetVehicleSelectOption[] = [];

  for (const option of options) {
    if (isHiddenFleetVehicleTypeName(option.name)) {
      continue;
    }
    if (isHiddenFleetTestText(option.name)) {
      continue;
    }

    const name = getFleetVehicleTypeDisplayName(option.name);
    const key = normalizeFleetClassificationText(name);
    if (!name || seen.has(key)) {
      continue;
    }

    normalizedOptions.push({
      ...option,
      name,
    });
    seen.add(key);
  }

  return normalizedOptions;
}

async function loadFleetVehicleDepartmentOptions(
  uid: number,
  connection: OdooConnection,
): Promise<FleetVehicleDepartmentOption[]> {
  return loadFleetVehicleRelationOptions(
    uid,
    connection,
    "municipal_department_id",
    (record) =>
      normalizeOrganizationUnitName(
        `${relationName(record.parent_id ?? false, "")} ${String(record.name || "")}`,
      ) ||
      normalizeOrganizationUnitName(String(record.name || "")) ||
      String(record.name || "").trim(),
  );
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
    console.warn(
      `Fleet vehicle relation for ${fieldName} could not be resolved:`,
      error,
    );
    return [];
  }

  if (!relationModel) {
    return [];
  }
  if (!(await hasOdooModelReadAccess(uid, relationModel, connection))) {
    return [];
  }

  const optionFieldNames = await loadAvailableOdooFieldNames(
    uid,
    relationModel,
    ["name", "parent_id", "active"],
    connection,
  );
  const hasParentField = optionFieldNames?.has("parent_id") ?? false;
  const hasActiveField = optionFieldNames?.has("active") ?? false;
  const loadOptions = (domain: unknown[]) =>
    searchReadAllWithFieldFallback<OdooNameOptionRecord>(
      uid,
      relationModel,
      domain,
      [hasParentField ? ["name", "parent_id"] : ["name"]],
      {
        order: "name asc",
      },
      connection,
    );

  const domain = hasActiveField ? [["active", "=", true]] : [];
  const records = await loadOptions(domain).catch((error) => {
    console.warn(
      `Fleet vehicle relation options for ${fieldName} could not be loaded:`,
      error,
    );
    return [];
  });
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
    return { key: "archived", label: "Ажлаас чөлөөлсөн" };
  }

  const status = employee.x_mn_employment_status || "active";
  const labels: Record<string, string> = {
    active: "Идэвхтэй",
    probation: "Туршилт",
    leave: "Чөлөөтэй",
    sick: "Өвчтэй",
    business_trip: "Томилолттой",
    suspended: "Түдгэлзсэн",
    terminated: "Ажлаас чөлөөлсөн",
    resigned: "Ажлаас гарсан",
    archived: "Ажлаас чөлөөлсөн",
    rehired: "Дахин авсан",
  };

  return {
    key: status,
    label: labels[status] ?? "Идэвхтэй",
  };
}

function normalizeHrStatusText(value?: string | false | null) {
  return (typeof value === "string" ? value : "").trim().toLowerCase();
}

const SYSTEM_ADMIN_EMPLOYEE_TOKENS = new Set([
  "admin",
  "administrator",
  "system administrator",
  "odoo admin",
  "odoo administrator",
  "админ",
  "администратор",
  "систем админ",
  "системийн админ",
  "систем администратор",
  "test",
  "test test",
  "dummy",
  "demo",
  "demo user",
  "sample",
  "bdbdj hdhd",
]);

function normalizeHrAdminText(value?: string | false | null) {
  return fixMojibakeText(String(value ?? ""))
    .trim()
    .toLocaleLowerCase("mn-MN")
    .replace(/\s+/g, " ");
}

function isSystemAdminEmployeeRecord(employee: OdooEmployeeRecord) {
  const userName = normalizeHrAdminText(
    relationName(employee.user_id ?? false, ""),
  );
  const employeeName = normalizeHrAdminText(employee.name);
  const emailLocalPart = normalizeHrAdminText(
    String(employee.work_email || "").split("@")[0],
  );
  return (
    SYSTEM_ADMIN_EMPLOYEE_TOKENS.has(userName) ||
    SYSTEM_ADMIN_EMPLOYEE_TOKENS.has(employeeName) ||
    SYSTEM_ADMIN_EMPLOYEE_TOKENS.has(emailLocalPart)
  );
}

function isHiddenHrEmployeeRecord(employee: OdooEmployeeRecord) {
  return (
    isSystemAdminEmployeeRecord(employee) ||
    normalizeHrAdminText(employee.x_mn_employee_code) === "emp2600174"
  );
}

function resolveHrDisplayDepartmentName(
  employeeName: string,
  departmentName: string,
  jobTitle?: string | false | null,
) {
  return getHrEmployeeDepartmentDisplayName(
    employeeName,
    departmentName,
    jobTitle,
  );
}

function isWorkingHrStatus(employee: OdooEmployeeRecord) {
  const status = resolveHrEmploymentStatus(employee).key;
  return (
    employee.active !== false &&
    ["active", "probation", "rehired"].includes(status)
  );
}

function includesAnyToken(value: string, tokens: string[]) {
  return tokens.some((token) => value.includes(token));
}

function isSickHrText(value?: string | false | null) {
  const normalized = normalizeHrStatusText(value);
  return includesAnyToken(normalized, [
    "sick",
    "ill",
    "medical",
    "ovch",
    "emneleg",
    "өвч",
    "эмнэл",
  ]);
}

function isAbsentHrText(value?: string | false | null) {
  const normalized = normalizeHrStatusText(value);
  return includesAnyToken(normalized, [
    "absent",
    "no show",
    "tas",
    "ireegui",
    "тас",
    "ирээгүй",
  ]);
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

function getPreviousDateKey(dateKey: string) {
  const previousDate = ulaanbaatarDayStart(dateKey);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  return getTodayDateKey(previousDate);
}

function getDateKeyDaysAgo(dateKey: string, days: number) {
  const date = ulaanbaatarDayStart(dateKey);
  date.setUTCDate(date.getUTCDate() - Math.max(0, days));
  return getTodayDateKey(date);
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

function formatCompactDateOnly(value?: string | false) {
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
  ширхэг: "pcs",
  ш: "pcs",
  pcs: "pcs",
  piece: "pcs",
  pieces: "pcs",
  кг: "kg",
  kg: "kg",
  kilogram: "kg",
  тн: "tn",
  tn: "tn",
  ton: "tn",
  метр: "m",
  м: "m",
  m: "m",
  км: "km",
  km: "km",
  м2: "m2",
  "м²": "m2",
  sqm: "m2",
  м3: "m3",
  "м³": "m3",
  мкуб: "m3",
  m3: "m3",
  литр: "liter",
  л: "liter",
  liter: "liter",
  удаа: "times",
  рейс: "times",
  times: "times",
  цэг: "point",
  point: "point",
  машин: "vehicle",
  vehicle: "vehicle",
  мод: "tree",
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

  const rawLegacyValue =
    typeof legacyValue === "string" ? legacyValue.trim() : "";
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
  return (
    task.ops_measurement_unit_code ||
    resolveUnitCodeFromText(task.ops_measurement_unit)
  );
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

  const visible = orderedTotals
    .slice(0, 3)
    .map((item) => formatQuantity(item.value, item.label));
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

  if (
    haystack.includes("хог") ||
    haystack.includes("маршрут") ||
    haystack.includes("ачилт")
  ) {
    return WASTE_TRANSPORT_UNIT;
  }
  if (
    haystack.includes("авто") ||
    haystack.includes("машин") ||
    haystack.includes("техник")
  ) {
    return AUTO_BASE_UNIT;
  }

  if (haystack.includes("тохижилт") || haystack.includes("засвар")) {
    return IMPROVEMENT_DEPARTMENT;
  }

  if (
    haystack.includes("мод") ||
    haystack.includes("ногоон") ||
    haystack.includes("зүлэг")
  ) {
    return GREEN_LANDSCAPE_UNIT;
  }
  if (
    haystack.includes("зам") ||
    haystack.includes("талбай") ||
    haystack.includes("цэвэрлэгээ") ||
    haystack.includes("гудамж")
  ) {
    return CLEANING_SERVICE_UNIT;
  }

  const canonicalName = normalizeOrganizationUnitName(text);
  if (canonicalName) {
    return canonicalName;
  }

  return UNKNOWN_DEPARTMENT;
}

function departmentUnitFromOperationType(operationType?: string | false) {
  if (operationType === "garbage" || operationType === "garbage_seasonal") {
    return WASTE_TRANSPORT_UNIT;
  }
  if (operationType === "street_cleaning") {
    return CLEANING_SERVICE_UNIT;
  }
  if (operationType === "green_maintenance") {
    return GREEN_LANDSCAPE_UNIT;
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

function exactGreenServiceUnitFromDepartmentName(departmentName: string) {
  const normalized = departmentName.trim().toLowerCase().replace(/\s+/g, " ");

  if (normalized === GREEN_LANDSCAPE_UNIT.toLowerCase()) {
    return GREEN_LANDSCAPE_UNIT;
  }
  if (
    normalized === CLEANING_SERVICE_UNIT.toLowerCase() ||
    normalized === "зам талбайн цэвэрлэгээ" ||
    normalized === "зам талбайн цэвэрлэгээний хэлтэс"
  ) {
    return CLEANING_SERVICE_UNIT;
  }

  return null;
}

function isGreenServiceScopedInference(departmentName?: string | null) {
  return (
    departmentName === GREEN_LANDSCAPE_UNIT ||
    departmentName === CLEANING_SERVICE_UNIT ||
    departmentName === IMPROVEMENT_DEPARTMENT
  );
}

function normalizeDepartmentUnitName(
  departmentName?: string | null,
  options: {
    operationType?: string | false;
    labelText?: string | null;
  } = {},
) {
  const normalizedDepartment = (departmentName ?? "").trim();
  const inferredFromOperation = departmentUnitFromOperationType(
    options.operationType,
  );
  const inferredFromDepartment =
    exactAutoBaseUnitFromDepartmentName(normalizedDepartment);
  const inferredGreenServiceUnit =
    exactGreenServiceUnitFromDepartmentName(normalizedDepartment);
  const inferredFromText = inferDepartmentUnitFromText(options.labelText ?? "");
  const knownInferredFromText =
    inferredFromText !== UNKNOWN_DEPARTMENT ? inferredFromText : null;

  if (!normalizedDepartment) {
    return inferredFromOperation || knownInferredFromText || UNKNOWN_DEPARTMENT;
  }

  const canonicalDepartment =
    normalizeOrganizationUnitName(normalizedDepartment);
  if (canonicalDepartment === AUTO_BASE_DEPARTMENT) {
    return (
      inferredFromOperation ||
      knownInferredFromText ||
      inferredFromDepartment ||
      canonicalDepartment
    );
  }

  if (canonicalDepartment === GREEN_SERVICE_DEPARTMENT) {
    const greenServiceOperationInference = isGreenServiceScopedInference(
      inferredFromOperation,
    )
      ? inferredFromOperation
      : null;
    const greenServiceTextInference = isGreenServiceScopedInference(
      knownInferredFromText,
    )
      ? knownInferredFromText
      : null;

    return (
      greenServiceOperationInference ||
      inferredGreenServiceUnit ||
      greenServiceTextInference ||
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
    task as Pick<
      OdooTaskRecord,
      "name" | "project_id" | "ops_department_id" | "mfo_operation_type"
    >,
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
  return normalizeDepartmentUnitName(
    relationName(project.ops_department_id, fallback),
    {
      labelText: project.name,
    },
  );
}

function resolveNormalizedTaskDepartmentName(
  task: Pick<
    OdooTaskRecord,
    "name" | "project_id" | "ops_department_id" | "mfo_operation_type"
  >,
  projectDepartmentById: Map<number, string>,
) {
  const directDepartmentName = relationName(
    task.ops_department_id ?? false,
    "",
  ).trim();
  if (directDepartmentName) {
    return normalizeDepartmentUnitName(directDepartmentName, {
      operationType: task.mfo_operation_type,
      labelText: `${task.name} ${relationName(task.project_id, "")}`,
    });
  }

  const projectId = Array.isArray(task.project_id) ? task.project_id[0] : null;
  if (projectId && projectDepartmentById.get(projectId)) {
    return normalizeDepartmentUnitName(
      projectDepartmentById.get(projectId) as string,
      {
        operationType: task.mfo_operation_type,
        labelText: `${task.name} ${relationName(task.project_id, "")}`,
      },
    );
  }

  const inferredFromOperation = departmentUnitFromOperationType(
    task.mfo_operation_type,
  );
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

function getTaskStatusKey(
  task: Pick<
    OdooTaskRecord,
    "stage_id" | "mfo_quality_exception_count" | "mfo_weight_sync_warning"
  >,
): TaskStatusKey {
  if (
    (task.mfo_quality_exception_count ?? 0) > 0 ||
    task.mfo_weight_sync_warning
  ) {
    return "problem";
  }

  switch (getStageBucket(relationName(task.stage_id, ""))) {
    case "progress":
      return "planned";
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

function reportStateBucket(
  state?: string | false,
): TaskDirectoryReportSummary["stateBucket"] {
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

function imageDataUrl(value?: string | false) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("data:")
    ? trimmed
    : `data:image/png;base64,${trimmed}`;
}

function resolveDepartmentLabel(name: string) {
  return (
    DEPARTMENT_LABELS[name as keyof typeof DEPARTMENT_LABELS] ??
    "Ажлын харьяалал"
  );
}

function resolveDepartmentAccent(name: string) {
  return (
    DEPARTMENT_ACCENTS[name as keyof typeof DEPARTMENT_ACCENTS] ??
    "var(--tone-slate)"
  );
}

function resolveDepartmentIcon(name: string) {
  const departmentGroup = findDepartmentGroupByName(name);
  if (departmentGroup) {
    return departmentGroup.icon;
  }

  const normalized = name.trim().toLowerCase();

  if (normalized.includes("санхүү")) {
    return "â‚®";
  }

  if (normalized.includes("захиргаа") || normalized.includes("удирдлага")) {
    return "ðŸ¢";
  }

  if (
    normalized.includes("авто") ||
    normalized.includes("машин") ||
    normalized.includes("техник")
  ) {
    return "ðŸšš";
  }

  if (
    normalized.includes("хог") ||
    normalized.includes("ачилт") ||
    normalized.includes("маршрут")
  ) {
    return "â™»ï¸";
  }

  if (
    normalized.includes("ногоон") ||
    normalized.includes("мод") ||
    normalized.includes("зүлэг")
  ) {
    return "ðŸŒ¿";
  }

  if (
    normalized.includes("зам") ||
    normalized.includes("цэвэрлэгээ") ||
    normalized.includes("гудамж")
  ) {
    return "ðŸ§¹";
  }

  if (
    normalized.includes("тохижилт") ||
    normalized.includes("үйлчилгээ") ||
    normalized.includes("засвар")
  ) {
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
    throw new Error(
      `Odoo JSON-RPC хүсэлт HTTP ${response.status} алдаатай дууслаа.`,
    );
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
    throw new Error(getOdooRpcErrorMessage(payload.error));
  }

  return payload.result as T;
}

function getOdooRpcErrorMessage(error: {
  message?: string;
  data?: {
    message?: string;
    debug?: string;
  };
}) {
  const debugMessage = extractOdooDebugErrorMessage(error.data?.debug);
  if (debugMessage) {
    return debugMessage;
  }
  return error.data?.message ?? error.message ?? "Odoo JSON-RPC алдаа тодорхойгүй байна.";
}

function extractOdooDebugErrorMessage(debug?: string) {
  if (!debug) return "";
  const lines = debug
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const exceptionLine = [...lines].reverse().find((line) =>
    /(?:odoo\.exceptions\.)?(?:UserError|ValidationError|AccessError):/.test(line),
  );
  if (exceptionLine) {
    return exceptionLine
      .replace(/^.*?(?:UserError|ValidationError|AccessError):\s*/, "")
      .trim();
  }
  const raisedMessageLine = [...lines].reverse().find((line) =>
    /raise\s+(?:UserError|ValidationError|AccessError)\(["']/.test(line),
  );
  const quoted = raisedMessageLine?.match(/["']([^"']+)["']/)?.[1]?.trim();
  if (quoted) return quoted;
  const cyrillicLine = [...lines].reverse().find((line) =>
    /[\u0400-\u04ff]/.test(line) && !line.startsWith("File ") && !line.toLowerCase().includes("traceback"),
  );
  return cyrillicLine ?? "";
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
  const auth = await authenticateWithFallback(
    createOdooConnection({ login, password }),
  );
  if (!auth) {
    return null;
  }
  const { uid, connection } = auth;

  const readAuthenticatedUser = async (fields: string[]) =>
    executeKw<OdooUserRecord[]>(
      uid,
      "res.users",
      "search_read",
      [[["id", "=", uid]]],
      {
        fields,
        limit: 1,
      },
      connection,
    );
  const users = await readAuthenticatedUser([
    "name",
    "login",
    "ops_user_type",
    "group_ids",
  ])
    .catch(() => readAuthenticatedUser(["name", "login", "ops_user_type"]))
    .catch(() => readAuthenticatedUser(["name", "login", "group_ids"]))
    .catch(() => readAuthenticatedUser(["name", "login"]));

  const user = users[0];
  if (!user) {
    return null;
  }

  const [userGroupXmlIds, employee] = await Promise.all([
    readUserGroupXmlIds(uid, user, connection),
    executeKw<OdooAuthEmployeeRecord[]>(
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
      .catch(() => null),
  ]);

  const hasGroup = (xmlId: string) =>
    userGroupXmlIds
      ? userGroupXmlIds.has(xmlId)
      : executeKw<boolean>(
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
    procurementPurchaseManager,
    procurementStorekeeper,
    procurementFinance,
    procurementAdministration,
    procurementLegal,
    procurementCeo,
    procurementGeneralManager,
    hrCustomOfficer,
    hrCustomAdmin,
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
    hasGroup(PROCUREMENT_GROUP_XML_IDS.purchaseManager),
    hasGroup(PROCUREMENT_GROUP_XML_IDS.storekeeper),
    hasGroup(PROCUREMENT_GROUP_XML_IDS.finance),
    hasGroup(PROCUREMENT_GROUP_XML_IDS.administration),
    hasGroup(PROCUREMENT_GROUP_XML_IDS.legal),
    hasGroup(PROCUREMENT_GROUP_XML_IDS.ceo),
    hasGroup(PROCUREMENT_GROUP_XML_IDS.generalManager),
    hasGroup(HR_CUSTOM_MN_GROUP_XML_IDS.officer),
    hasGroup(HR_CUSTOM_MN_GROUP_XML_IDS.admin),
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

  const explicitRole =
    typeof user.ops_user_type === "string" ? user.ops_user_type : "";
  const hasExplicitOperationalRole = Boolean(
    explicitRole && explicitRole !== "worker",
  );
  const inferredRole = systemAdmin
    ? "system_admin"
    : resolveAuthenticatedRole(user.ops_user_type ?? false, employee);
  const groupFallbackRole = hasExplicitOperationalRole
    ? null
    : municipalDirector || fleetRepairCeo
      ? "director"
      : municipalManager
        ? "general_manager"
      : hrCustomAdmin
        ? "hr_manager"
        : municipalHr || hrCustomOfficer
          ? "hr_specialist"
          : municipalDepartmentHead ||
              mfoManager ||
              mfoDispatcher ||
              environmentManager ||
              improvementManager ||
              fleetRepairManager
            ? "project_manager"
            : municipalHse
              ? "hse_officer"
              : municipalPublicRelations
                ? "public_relations"
                : municipalInspector ||
                    (mfoInspector && !mfoManager && !mfoDispatcher)
                  ? "transport_inspector"
                  : municipalMaster || greenMaster || fleetRepairTeamLeader
                    ? "team_leader"
                    : null;
  const role = systemAdmin
    ? "system_admin"
    : (groupFallbackRole ?? inferredRole);
  const titleGroupFlags = inferProcurementGroupFlagsFromTitle(
    [
      Array.isArray(employee?.job_id) ? employee.job_id[1] : "",
      employee?.job_title || "",
    ].join(" "),
  );
  const effectiveMunicipalDepartmentHead =
    municipalDepartmentHead || Boolean(titleGroupFlags.municipalDepartmentHead);
  const effectiveProcurementPurchaseManager =
    procurementPurchaseManager ||
    Boolean(titleGroupFlags.procurementPurchaseManager);
  const effectiveProcurementStorekeeper =
    procurementStorekeeper || Boolean(titleGroupFlags.procurementStorekeeper);
  const effectiveProcurementFinance =
    procurementFinance || Boolean(titleGroupFlags.procurementFinance);
  const effectiveProcurementAdministration =
    procurementAdministration ||
    Boolean(titleGroupFlags.procurementAdministration);
  const effectiveProcurementLegal =
    procurementLegal || Boolean(titleGroupFlags.procurementLegal);

  return {
    uid,
    user: {
      name: user.name,
      login: user.login,
      role,
      employeeJobTitle: getEmployeeJobTitle(employee),
      groupFlags: {
        municipalWorker,
        municipalMaster,
        municipalInspector,
        municipalDepartmentHead: effectiveMunicipalDepartmentHead,
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
        procurementPurchaseManager: effectiveProcurementPurchaseManager,
        procurementStorekeeper: effectiveProcurementStorekeeper,
        procurementFinance: effectiveProcurementFinance,
        procurementAdministration: effectiveProcurementAdministration,
        procurementLegal: effectiveProcurementLegal,
        procurementCeo,
        procurementGeneralManager,
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

  const requestPromise = executeKwUncached<T>(
    uid,
    model,
    method,
    methodArgs,
    kwargs,
    connection,
  )
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
    const fields = Array.isArray(positionalFields)
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
      [
        connection.db,
        uid,
        connection.password,
        model,
        "search",
        [domain],
        searchKw,
      ],
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
    [
      connection.db,
      uid,
      connection.password,
      model,
      method,
      methodArgs,
      kwargs,
    ],
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
  const availableFields = await loadAvailableOdooFieldNames(
    uid,
    model,
    Array.from(new Set(fieldVariants.flat())),
    connection,
  );
  const variantsToTry = availableFields
    ? fieldVariants
        .map((fields) => fields.filter((field) => availableFields.has(field)))
        .filter((fields) => fields.length > 0)
        .filter(
          (fields, index, variants) =>
            variants.findIndex(
              (variant) => variant.join("\0") === fields.join("\0"),
            ) === index,
        )
    : fieldVariants;

  for (const fields of variantsToTry.length ? variantsToTry : fieldVariants) {
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

  throw lastError instanceof Error
    ? lastError
    : new Error(`${model} мэдээлэл уншихад алдаа гарлаа.`);
}

async function loadAvailableOdooFieldNames(
  uid: number,
  model: string,
  fieldNames: string[],
  connection: OdooConnection,
) {
  const uniqueFieldNames = Array.from(new Set(fieldNames.filter(Boolean)));
  if (!uniqueFieldNames.length) {
    return null;
  }

  try {
    const metadata = await executeKw<Record<string, OdooFieldMetadata>>(
      uid,
      model,
      "fields_get",
      [uniqueFieldNames],
      {
        attributes: ["string"],
      },
      connection,
    );
    return new Set(Object.keys(metadata));
  } catch (error) {
    console.warn(`${model} field metadata could not be loaded:`, error);
    return null;
  }
}

export async function loadHrEmployeeDirectory(
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<HrEmployeeDirectoryItem[]> {
  const auth = await authenticateWithFallback(
    createOdooConnection(connectionOverrides),
  );
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
    .filter((employee) => !isHiddenHrEmployeeRecord(employee))
    .map((employee) => {
      const status = resolveHrEmploymentStatus(employee);
      const departmentName = normalizeDepartmentUnitName(
        relationName(employee.department_id ?? false, UNKNOWN_DEPARTMENT),
      );
      const jobTitle = getHrJobTitleDisplayName(
        employee.name,
        relationName(employee.job_id ?? false, "") || employee.job_title,
      );

      return {
        id: employee.id,
        name: employee.name,
        active: employee.active !== false,
        departmentId: Array.isArray(employee.department_id)
          ? employee.department_id[0]
          : null,
        departmentName: resolveHrDisplayDepartmentName(
          employee.name,
          departmentName,
          jobTitle,
        ),
        jobTitle,
        workPhone: employee.work_phone || "",
        mobilePhone: employee.mobile_phone || "",
        workEmail: employee.work_email || "",
        userId: Array.isArray(employee.user_id) ? employee.user_id[0] : null,
        userName: relationName(employee.user_id ?? false, ""),
        photoUrl: imageDataUrl(
          employee.image_128 || employee.avatar_128 || employee.image_1920,
        ),
        employeeCode:
          employee.x_mn_employee_code ||
          `EMP-${String(employee.id).padStart(5, "0")}`,
        gradeRank: employee.x_mn_grade_rank || "",
        workType: "",
        statusKey: status.key,
        statusLabel: status.label,
        managerName: relationName(employee.parent_id ?? false, ""),
        startDate: employee.contract_date_start || "",
        contractEndDate: employee.contract_date_end || "",
        trialEndDate: employee.trial_date_end || "",
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
    .sort(compareHrDepartmentThenName);
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

  throw lastError instanceof Error
    ? lastError
    : new Error("HR leave records could not be loaded.");
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
  if (cached && cached.staleUntil > Date.now()) {
    if (!hrDailyAttendanceSummaryPendingCache.has(cacheKey)) {
      const refreshPromise = fetchLiveHrDailyAttendanceSummary(
        requestedConnection,
      )
        .catch((error) => {
          console.warn("HR attendance stale refresh failed:", error);
          return cached.value;
        })
        .finally(() => {
          hrDailyAttendanceSummaryPendingCache.delete(cacheKey);
        });
      hrDailyAttendanceSummaryPendingCache.set(cacheKey, refreshPromise);
    }
    return cached.value;
  }
  if (cached) {
    hrDailyAttendanceSummaryCache.delete(cacheKey);
  }

  const pending = hrDailyAttendanceSummaryPendingCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  const summaryPromise = fetchLiveHrDailyAttendanceSummary(
    requestedConnection,
  ).finally(() => {
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
  const tomorrowStartUtc = formatOdooDateTimeBoundary(
    ulaanbaatarDayStart(tomorrow),
  );

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

  const hrEmployees = employees.filter(
    (employee) => !isHiddenHrEmployeeRecord(employee),
  );
  const activeEmployeeIds = new Set(
    hrEmployees
      .filter((employee) => employee.active !== false)
      .map((employee) => employee.id),
  );
  const totalEmployees = activeEmployeeIds.size;

  let attendanceRecords: OdooHrAttendanceRecord[] = [];
  let leaveRecords: OdooHrLeaveRecord[] = [];
  let hasAttendanceSource = false;

  const [canReadAttendance, canReadLeave] = await Promise.all([
    hasOdooModelReadAccess(uid, "hr.attendance", connection),
    hasOdooModelReadAccess(uid, "hr.leave", connection),
  ]);

  if (canReadAttendance) {
    try {
      attendanceRecords = await loadTodayHrAttendanceRecords(
        uid,
        connection,
        todayStartUtc,
        tomorrowStartUtc,
      );
      hasAttendanceSource = true;
    } catch (error) {
      console.warn(
        "HR attendance records could not be loaded for dashboard:",
        error,
      );
    }
  }

  if (canReadLeave) {
    try {
      leaveRecords = await loadTodayHrLeaveRecords(
        uid,
        connection,
        today,
        todayStartUtc,
        tomorrowStartUtc,
      );
      hasAttendanceSource = true;
    } catch (error) {
      console.warn("HR leave records could not be loaded for dashboard:", error);
    }
  }

  const workingEmployeeIds = new Set(
    attendanceRecords
      .map((record) => relationId(record.employee_id))
      .filter(
        (id): id is number =>
          typeof id === "number" && activeEmployeeIds.has(id),
      ),
  );
  const sickEmployeeIds = new Set<number>();
  const leaveEmployeeIds = new Set<number>();

  for (const record of leaveRecords) {
    const employeeId = relationId(record.employee_id);
    if (
      !employeeId ||
      !activeEmployeeIds.has(employeeId) ||
      workingEmployeeIds.has(employeeId)
    ) {
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
    hrDailyAttendanceSummaryCache.set(
      getMunicipalSnapshotCacheKey(connection),
      {
        value: summary,
        expiresAt: Date.now() + ODOO_READ_RPC_CACHE_TTL_MS,
        staleUntil: Date.now() + ODOO_READ_RPC_CACHE_TTL_MS + DASHBOARD_STALE_CACHE_TTL_MS,
      },
    );
    return summary;
  }

  const fallbackWorking = hrEmployees.filter(isWorkingHrStatus).length;
  const fallbackSick = hrEmployees.filter((employee) =>
    isSickHrText(employee.x_mn_employment_status),
  ).length;
  const fallbackAbsent = hrEmployees.filter((employee) =>
    isAbsentHrText(employee.x_mn_employment_status),
  ).length;

  const summary: HrDailyAttendanceSummary = {
    totalEmployees,
    workingToday: fallbackWorking,
    absentToday: fallbackAbsent,
    sickToday: fallbackSick,
    leaveToday: 0,
    generatedAt: new Date().toISOString(),
    source: hrEmployees.length ? "employee_status" : "empty",
  };
  hrDailyAttendanceSummaryCache.set(getMunicipalSnapshotCacheKey(connection), {
    value: summary,
    expiresAt: Date.now() + ODOO_READ_RPC_CACHE_TTL_MS,
    staleUntil: Date.now() + ODOO_READ_RPC_CACHE_TTL_MS + DASHBOARD_STALE_CACHE_TTL_MS,
  });
  return summary;
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
  return Array.from(
    new Set(values.filter((value): value is number => Boolean(value))),
  );
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

function namesFromIds(
  ids: number[] | undefined,
  employeeNames: Map<number, string>,
) {
  return (ids ?? [])
    .map((id) => employeeNames.get(id))
    .filter((name): name is string => Boolean(name));
}

async function loadCrewAssignmentsByVehicle(
  uid: number,
  connection: OdooConnection,
) {
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
    const employeeNames = await loadEmployeeNameMap(
      uid,
      employeeIds,
      connection,
    );
    const byVehicle = new Map<number, FleetVehicleCrewAssignment[]>();

    for (const team of assignedCrewTeams) {
      const vehicleId = relationId(team.vehicle_id ?? false);
      if (!vehicleId) {
        continue;
      }

      const driverRelation =
        team.driver_employee_id || team.mfo_driver_employee_id || false;
      const driverId = relationId(driverRelation);
      const driverName = relationName(driverRelation, "");
      const driverNames = driverName
        ? [driverName]
        : driverId
          ? namesFromIds([driverId], employeeNames)
          : [];
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

const FLEET_OPERATIONAL_STATUS_LABELS: Record<string, string> = {
  available: "Ажиллаж байгаа",
  assigned: "Ажиллаж байгаа",
  in_repair: "Засвартай",
  broken: "Эвдэрсэн",
  retired: "Ашиглалтаас гарсан",
  inactive: "Идэвхгүй",
};
const FLEET_NON_OPERATIONAL_STATUS_KEYS = new Set([
  "inactive",
  "retired",
  "broken",
  "in_repair",
]);

const FLEET_IMPORT_STATE_LABELS: Record<string, string> = {
  success: "Амжилттай",
  failed: "Алдаатай",
};

const FLEET_REPAIR_STATE_LABELS: Record<string, string> = {
  new: "Үүссэн",
  new_request: "Шинэ хүсэлт",
  request: "Хүсэлт",
  requested: "Хүсэлт",
  diagnosed: "Оношилсон",
  waiting_parts: "Сэлбэг хүлээж байна",
  waiting_approval: "Баталгаа хүлээж байна",
  approved: "Батлагдсан",
  in_repair: "Засварт байгаа",
  under_repair: "Засварт байгаа",
  repair: "Засвар",
  done: "Дууссан",
  completed: "Дууссан",
  vehicle_returned: "Машин буцаасан",
  returned: "Буцаасан",
  rejected: "Буцаасан",
  cancelled: "Цуцлагдсан",
  cancel: "Цуцлагдсан",
};

function resolveFleetRepairStateLabel(value?: string | false) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  return FLEET_REPAIR_STATE_LABELS[normalized] || raw;
}

const FLEET_PROCUREMENT_STATE_LABELS: Record<string, string> = {
  draft: "Ноорог",
  quote: "3 үнийн санал",
  finance_review: "Санхүүгийн хяналт",
  director_approval: "Захирлын баталгаа",
  contract_review: "Гэрээний хяналт",
  payment: "Төлбөр",
  received: "Хүлээн авсан",
  done: "Дууссан",
  cancelled: "Цуцлагдсан",
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
  }).format(value || 0)} л`;
}

function formatWeight(value?: number, unit?: string | false) {
  const normalizedUnit = unit === "ton" ? "тонн" : "кг";
  return `${new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: normalizedUnit === "тонн" ? 2 : 0,
  }).format(value || 0)} ${normalizedUnit}`;
}

function weightRecordToTons(value?: number, unit?: string | false) {
  const normalized = Number.isFinite(value) ? Math.max(0, value || 0) : 0;
  const unitText = String(unit || "").toLocaleLowerCase("mn-MN");

  if (
    unitText === "ton" ||
    unitText.includes("тон") ||
    unitText.includes("тн")
  ) {
    return normalized;
  }

  return normalized / 1000;
}

function formatOptionalCompactDate(value?: string | false) {
  if (!value) {
    return "";
  }
  return formatCompactDate(value);
}

function formatOptionalCalendarDate(value?: string | false) {
  if (!value) {
    return "";
  }

  const dateParts = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateParts) {
    return value;
  }

  return `${dateParts[1]}.${dateParts[2]}.${dateParts[3]}`;
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

function garbageReportVehiclePlate(record: {
  vehicle_id?: OdooRelation;
  vehicle_license_plate?: string | false;
}) {
  return (
    String(record.vehicle_license_plate || "").trim() ||
    relationName(record.vehicle_id ?? false, "") ||
    "Улсын дугааргүй"
  );
}

function garbageReportVehicleName(record: {
  vehicle_id?: OdooRelation;
  vehicle_license_plate?: string | false;
}) {
  const raw = relationName(record.vehicle_id ?? false, "");
  if (!raw) {
    return "Авто баазад таараагүй";
  }
  const plate =
    typeof record.vehicle_license_plate === "string"
      ? record.vehicle_license_plate.trim()
      : "";
  // Odoo-гийн машины нэр нь "ангилал/марк/модель/дугаар" бүтэцтэй бөгөөд
  // тодорхойгүй түвшин "Бусад" болдог тул "Бусад/Бусад/..." давхарлаж гардаг.
  // Утга агуулаагүй "Бусад" хэсгүүдийг хасаж, зэрэгцээ давхардлыг цэгцэлнэ.
  const parts = raw
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part.toLocaleLowerCase("mn-MN") !== "бусад");
  const deduped = parts.filter(
    (part, index) =>
      index === 0 ||
      part.toLocaleLowerCase("mn-MN") !== parts[index - 1].toLocaleLowerCase("mn-MN"),
  );
  return deduped.join(" / ") || plate || "Авто баазад таараагүй";
}

function toFleetWeightReportItem(
  record: OdooGarbageWeightReportRecord,
): FleetVehicleDailyWeightItem {
  const vehicleId = relationId(record.vehicle_id);
  return {
    id: record.id,
    vehicleId,
    vehiclePlate: garbageReportVehiclePlate(record),
    vehicleName: garbageReportVehicleName(record),
    reportDate: formatOptionalCompactDate(record.report_date),
    reportDateValue:
      typeof record.report_date === "string" ? record.report_date : "",
    weightTons: weightRecordToTons(record.weight, record.unit),
    // Өдрийн задаргааг нийт дүнтэй ижил нэгжээр (тонн) харуулж, кг/тонны зөрүүг арилгана.
    weightLabel: formatWeight(weightRecordToTons(record.weight, record.unit), "ton"),
    source: record.source || "Гадны систем",
    fetchedAt: formatOptionalCompactDate(record.fetched_at),
    fetchedAtValue:
      typeof record.fetched_at === "string" ? record.fetched_at : "",
    stateLabel:
      FLEET_IMPORT_STATE_LABELS[String(record.state || "")] ||
      String(record.state || ""),
    errorMessage: record.error_message || "",
  };
}

function toFleetFuelReportItem(
  record: OdooGarbageFuelReportRecord,
): FleetVehicleDailyFuelItem {
  const vehicleId = relationId(record.vehicle_id);
  return {
    id: record.id,
    vehicleId,
    vehiclePlate: garbageReportVehiclePlate(record),
    vehicleName: garbageReportVehicleName(record),
    reportDate: formatOptionalCompactDate(record.report_date),
    reportDateValue:
      typeof record.report_date === "string" ? record.report_date : "",
    fuelLiters: record.fuel_liters || 0,
    fuelLabel: formatLiters(record.fuel_liters),
    fuelType: record.fuel_type || "",
    source: record.source || "Гадны систем",
    fetchedAt: formatOptionalCompactDate(record.fetched_at),
    fetchedAtValue:
      typeof record.fetched_at === "string" ? record.fetched_at : "",
    stateLabel:
      FLEET_IMPORT_STATE_LABELS[String(record.state || "")] ||
      String(record.state || ""),
    errorMessage: record.error_message || "",
  };
}

async function safeSearchReadFleetModel<T>(
  uid: number,
  model: string,
  domain: unknown[],
  fields: string[],
  kwargs: Record<string, unknown>,
  connection: OdooConnection,
) {
  if (!(await hasOdooModelReadAccess(uid, model, connection))) {
    return [];
  }

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
  const records =
    await safeSearchReadFleetModel<OdooVehicleDriverHistoryRecord>(
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
      driverName: relationName(record.driver_id, "Оноогоогүй"),
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
    const stateKey = String(record.state || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    appendMapItem(byVehicle, relationId(record.vehicle_id), {
      id: record.id,
      name: record.name || `Засвар #${record.id}`,
      requestDate: formatOptionalCalendarDate(record.request_date),
      dateRange: formatDateRange(
        record.repair_started_at,
        record.repair_done_at,
      ),
      damageType: record.damage_type || "",
      description:
        record.issue_summary ||
        record.issue_description ||
        record.description ||
        "",
      partsNote: record.parts_note || "",
      repairNote: record.repair_note || "",
      amountLabel: formatMoneyLabel(
        record.amount_total || record.actual_cost || 0,
      ),
      mechanicName: relationName(record.mechanic_id ?? false, ""),
      stateKey,
      stateLabel: resolveFleetRepairStateLabel(stateKey),
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
  const reportSinceDate = getDateKeyDaysAgo(getTodayDateKey(), 370);
  const records = await safeSearchReadFleetModel<OdooGarbageWeightReportRecord>(
    uid,
    "municipal.garbage.weight.report",
    [
      ["report_date", ">=", reportSinceDate],
      "|",
      ["vehicle_id", "in", vehicleIds],
      ["vehicle_id", "=", false],
    ],
    VEHICLE_WEIGHT_REPORT_FIELDS,
    { order: "report_date desc, id desc" },
    connection,
  );
  const byVehicle = new Map<number, FleetVehicleDailyWeightItem[]>();
  const items = records.map(toFleetWeightReportItem);
  for (const record of records) {
    if (record.state === "failed") {
      continue;
    }
    appendMapItem(
      byVehicle,
      relationId(record.vehicle_id),
      toFleetWeightReportItem(record),
    );
  }
  return { records, items, byVehicle };
}

async function loadFuelReportsByVehicle(
  uid: number,
  vehicleIds: number[],
  connection: OdooConnection,
) {
  const reportSinceDate = getDateKeyDaysAgo(getTodayDateKey(), 370);
  const records = await safeSearchReadFleetModel<OdooGarbageFuelReportRecord>(
    uid,
    "municipal.garbage.fuel.report",
    [
      ["report_date", ">=", reportSinceDate],
      "|",
      ["vehicle_id", "in", vehicleIds],
      ["vehicle_id", "=", false],
    ],
    VEHICLE_FUEL_REPORT_FIELDS,
    { order: "report_date desc, id desc" },
    connection,
  );
  const byVehicle = new Map<number, FleetVehicleDailyFuelItem[]>();
  const items = records.map(toFleetFuelReportItem);
  for (const record of records) {
    if (record.state === "failed") {
      continue;
    }
    appendMapItem(
      byVehicle,
      relationId(record.vehicle_id),
      toFleetFuelReportItem(record),
    );
  }
  return { records, items, byVehicle };
}

export type FleetFuelWeightReportType = "fuel" | "weight";

export type FleetFuelWeightReportVehicleRow = {
  vehicleKey: string;
  vehicleId: number | null;
  vehicleLabel: string;
  vehiclePlate: string;
  departmentName: string;
  total: number;
  totalLabel: string;
  rowCount: number;
  matched: boolean;
  weightDaily: FleetVehicleDailyWeightItem[];
  fuelDaily: FleetVehicleDailyFuelItem[];
};

export type FleetFuelWeightReport = {
  type: FleetFuelWeightReportType;
  startDate: string;
  endDate: string;
  unitLabel: string;
  rows: FleetFuelWeightReportVehicleRow[];
  summary: {
    total: number;
    totalLabel: string;
    vehicleCount: number;
    matchedVehicleCount: number;
    unmatchedCount: number;
    dayCount: number;
    dayAverage: number;
    dayAverageLabel: string;
    topVehicleLabel: string;
    topVehicleTotalLabel: string;
    rowCount: number;
  };
  latestReportDate: string;
};

async function loadFleetReportVehicleMeta(
  uid: number,
  connection: OdooConnection,
) {
  const vehicles = await safeSearchReadFleetModel<{
    id: number;
    license_plate?: string | false;
    municipal_department_id?: OdooRelation;
  }>(
    uid,
    "fleet.vehicle",
    [],
    ["id", "license_plate", "municipal_department_id"],
    { context: { active_test: false }, limit: 2000 },
    connection,
  );
  const departmentByVehicle = new Map<number, string>();
  const plateByVehicle = new Map<number, string>();
  for (const vehicle of vehicles) {
    departmentByVehicle.set(
      vehicle.id,
      relationName(vehicle.municipal_department_id ?? false, ""),
    );
    const plate =
      typeof vehicle.license_plate === "string" ? vehicle.license_plate.trim() : "";
    if (plate) {
      plateByVehicle.set(vehicle.id, plate);
    }
  }
  return { departmentByVehicle, plateByVehicle };
}

export async function loadFleetFuelWeightReport(
  input: {
    type: FleetFuelWeightReportType;
    startDate: string;
    endDate: string;
  },
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<FleetFuelWeightReport> {
  const { type } = input;
  const startDate = input.startDate;
  const endDate = input.endDate >= input.startDate ? input.endDate : input.startDate;
  const unitLabel = type === "fuel" ? "л" : "тонн";

  const requestedConnection = createOdooConnection(connectionOverrides);
  const auth = await authenticateWithFallback(requestedConnection);
  if (!auth) {
    throw new Error("Odoo authentication failed");
  }
  const { uid, connection } = auth;

  const { departmentByVehicle, plateByVehicle } = await loadFleetReportVehicleMeta(
    uid,
    connection,
  );

  const rowsByKey = new Map<string, FleetFuelWeightReportVehicleRow>();
  const reportDateSet = new Set<string>();
  let latestReportDate = "";

  const ensureRow = (
    vehicleId: number | null,
    vehicleLabel: string,
    vehiclePlate: string,
  ): FleetFuelWeightReportVehicleRow => {
    const key = vehicleId ? `v:${vehicleId}` : "unmatched";
    const existing = rowsByKey.get(key);
    if (existing) {
      return existing;
    }
    const departmentName = vehicleId
      ? departmentByVehicle.get(vehicleId) ?? ""
      : "";
    const created: FleetFuelWeightReportVehicleRow = {
      vehicleKey: key,
      vehicleId,
      // Жин/түлшний тайланд машиныг зөвхөн улсын дугаараар нь харуулна.
      // Авто баазын бүртгэлийн жинхэнэ улсын дугаарыг эхэлж, дараа нь тайланд
      // хадгалагдсан дугаарыг сонгоно.
      vehicleLabel: vehicleId
        ? plateByVehicle.get(vehicleId) || vehiclePlate || vehicleLabel || `#${vehicleId}`
        : "Авто баазад таараагүй",
      vehiclePlate,
      departmentName,
      total: 0,
      totalLabel: "",
      rowCount: 0,
      matched: Boolean(vehicleId),
      weightDaily: [],
      fuelDaily: [],
    };
    rowsByKey.set(key, created);
    return created;
  };

  const trackReportDate = (reportDateValue: string) => {
    if (!reportDateValue) {
      return;
    }
    reportDateSet.add(reportDateValue);
    if (reportDateValue > latestReportDate) {
      latestReportDate = reportDateValue;
    }
  };

  if (type === "fuel") {
    const records = await safeSearchReadFleetModel<OdooGarbageFuelReportRecord>(
      uid,
      "municipal.garbage.fuel.report",
      [
        ["report_date", ">=", startDate],
        ["report_date", "<=", endDate],
      ],
      VEHICLE_FUEL_REPORT_FIELDS,
      { order: "report_date desc, id desc" },
      connection,
    );
    for (const record of records) {
      if (record.state === "failed") {
        continue;
      }
      const item = toFleetFuelReportItem(record);
      const row = ensureRow(item.vehicleId, item.vehicleName, item.vehiclePlate);
      row.total += item.fuelLiters;
      row.rowCount += 1;
      row.fuelDaily.push(item);
      trackReportDate(item.reportDateValue);
    }
  } else {
    const records = await safeSearchReadFleetModel<OdooGarbageWeightReportRecord>(
      uid,
      "municipal.garbage.weight.report",
      [
        ["report_date", ">=", startDate],
        ["report_date", "<=", endDate],
      ],
      VEHICLE_WEIGHT_REPORT_FIELDS,
      { order: "report_date desc, id desc" },
      connection,
    );
    for (const record of records) {
      if (record.state === "failed") {
        continue;
      }
      const item = toFleetWeightReportItem(record);
      const row = ensureRow(item.vehicleId, item.vehicleName, item.vehiclePlate);
      row.total += item.weightTons;
      row.rowCount += 1;
      row.weightDaily.push(item);
      trackReportDate(item.reportDateValue);
    }
  }

  const formatTotal = (value: number) =>
    type === "fuel" ? formatLiters(value) : formatWeight(value, "ton");

  const rows = Array.from(rowsByKey.values())
    .map((row) => ({
      ...row,
      total: Math.round(row.total * 100) / 100,
      totalLabel: formatTotal(row.total),
    }))
    .sort((left, right) => {
      if (left.matched !== right.matched) {
        return left.matched ? -1 : 1;
      }
      return right.total - left.total;
    });

  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const matchedRows = rows.filter((row) => row.matched);
  const dayCount = reportDateSet.size;
  const dayAverage = dayCount ? total / dayCount : 0;
  const topRow = matchedRows[0];

  return {
    type,
    startDate,
    endDate,
    unitLabel,
    rows,
    summary: {
      total: Math.round(total * 100) / 100,
      totalLabel: formatTotal(total),
      vehicleCount: rows.length,
      matchedVehicleCount: matchedRows.length,
      unmatchedCount: rows.filter((row) => !row.matched).length,
      dayCount,
      dayAverage: Math.round(dayAverage * 100) / 100,
      dayAverageLabel: formatTotal(dayAverage),
      topVehicleLabel: topRow?.vehicleLabel ?? "",
      topVehicleTotalLabel: topRow ? formatTotal(topRow.total) : "",
      rowCount: rows.reduce((sum, row) => sum + row.rowCount, 0),
    },
    latestReportDate,
  };
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
      name: record.name || `Худалдан авалт #${record.id}`,
      repairName: relationName(record.repair_id ?? false, ""),
      amountLabel: formatMoneyLabel(record.amount_total),
      stateLabel:
        FLEET_PROCUREMENT_STATE_LABELS[String(record.state || "")] ||
        String(record.state || ""),
    });
  }
  return byVehicle;
}

function latestItems<T>(items: T[] | undefined, limit = 8) {
  return (items ?? []).slice(0, limit);
}

function toFleetStaffOption(
  employee: OdooEmployeeRecord,
): FleetVehicleDriverOption {
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

function sortFleetRoleStaffOptions(
  left: FleetVehicleDriverOption,
  right: FleetVehicleDriverOption,
  isPreferred: (option: FleetVehicleDriverOption) => boolean,
) {
  const leftPreferred = isPreferred(left);
  const rightPreferred = isPreferred(right);
  if (leftPreferred !== rightPreferred) {
    return leftPreferred ? -1 : 1;
  }
  return sortFleetStaffOptions(left, right);
}

function isDriverStaffOption(option: FleetVehicleDriverOption) {
  const titleText = normalizeRoleTitle(option.jobTitle);
  return (
    titleText.includes("жолооч") ||
    titleText.includes("driver") ||
    titleText.includes("chauffeur")
  );
}

function isLoaderStaffOption(option: FleetVehicleDriverOption) {
  const titleText = normalizeRoleTitle(option.jobTitle);
  return titleText.includes("ачигч") || titleText.includes("loader");
}

async function loadFleetDriverOptions(
  uid: number,
  connection: OdooConnection,
  vehicles: OdooFleetVehicleRecord[] = [],
): Promise<FleetVehicleDriverOption[]> {
  try {
    const assignedDriverIds = new Set(
      vehicles
        .map((vehicle) =>
          relationId(vehicle.municipal_responsible_driver_id ?? false),
        )
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
      .filter(
        (employee) =>
          employee.active !== false || assignedDriverIds.has(employee.id),
      )
      .map(toFleetStaffOption)
      .sort((left, right) =>
        sortFleetRoleStaffOptions(left, right, isDriverStaffOption),
      );
  } catch (error) {
    console.warn(
      "HR employee driver options could not be loaded for auto-base board:",
      error,
    );
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
      .filter(
        (employee) =>
          employee.active !== false || assignedLoaderIds.has(employee.id),
      )
      .map(toFleetStaffOption)
      .sort((left, right) =>
        sortFleetRoleStaffOptions(left, right, isLoaderStaffOption),
      );
  } catch (error) {
    console.warn(
      "HR employee loader options could not be loaded for auto-base board:",
      error,
    );
    return [];
  }
}

function mergeFleetStaffOptions(
  primary: FleetVehicleDriverOption[],
  fallback: FleetVehicleDriverOption[],
  isPreferred: (option: FleetVehicleDriverOption) => boolean,
) {
  const optionsById = new Map<number, FleetVehicleDriverOption>();
  for (const option of [...primary, ...fallback]) {
    optionsById.set(option.id, option);
  }
  return Array.from(optionsById.values()).sort((left, right) =>
    sortFleetRoleStaffOptions(left, right, isPreferred),
  );
}

async function loadBroaderFleetStaffOptions(
  requestedUid: number,
  requestedConnection: OdooConnection,
  vehicles: OdooFleetVehicleRecord[],
) {
  const requestedDriverPromise = loadFleetDriverOptions(
    requestedUid,
    requestedConnection,
    vehicles,
  );
  const requestedLoaderPromise = loadFleetLoaderOptions(
    requestedUid,
    requestedConnection,
    vehicles,
  );
  const serviceConnection = createOdooConnection();

  if (
    serviceConnection.url === requestedConnection.url &&
    serviceConnection.db === requestedConnection.db &&
    serviceConnection.login === requestedConnection.login &&
    serviceConnection.password === requestedConnection.password
  ) {
    const [driverOptions, loaderOptions] = await Promise.all([
      requestedDriverPromise,
      requestedLoaderPromise,
    ]);
    return { driverOptions, loaderOptions };
  }

  const serviceAuthPromise = authenticateWithFallback(serviceConnection).catch(
    (error) => {
      console.warn("Fleet staff service connection auth failed:", error);
      return null;
    },
  );
  const [requestedDriverOptions, requestedLoaderOptions, serviceAuth] =
    await Promise.all([
      requestedDriverPromise,
      requestedLoaderPromise,
      serviceAuthPromise,
    ]);

  if (!serviceAuth) {
    return {
      driverOptions: requestedDriverOptions,
      loaderOptions: requestedLoaderOptions,
    };
  }

  const [serviceDriverOptions, serviceLoaderOptions] = await Promise.all([
    loadFleetDriverOptions(serviceAuth.uid, serviceAuth.connection, vehicles),
    loadFleetLoaderOptions(serviceAuth.uid, serviceAuth.connection, vehicles),
  ]);

  return {
    driverOptions: mergeFleetStaffOptions(
      requestedDriverOptions,
      serviceDriverOptions,
      isDriverStaffOption,
    ),
    loaderOptions: mergeFleetStaffOptions(
      requestedLoaderOptions,
      serviceLoaderOptions,
      isLoaderStaffOption,
    ),
  };
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
  const staleBoard = readCachedFleetVehicleBoard(requestedConnection, {
    allowStale: true,
  });
  if (staleBoard) {
    if (!fleetVehicleBoardPendingCache.has(cacheKey)) {
      const refreshPromise = fetchLiveFleetVehicleBoard(requestedConnection)
        .catch((error) => {
          console.warn("Fleet vehicle board stale refresh failed:", error);
          return staleBoard;
        })
        .finally(() => {
          fleetVehicleBoardPendingCache.delete(cacheKey);
        });
      fleetVehicleBoardPendingCache.set(cacheKey, refreshPromise);
    }
    return staleBoard;
  }

  const pendingBoard = fleetVehicleBoardPendingCache.get(cacheKey);
  if (pendingBoard) {
    return pendingBoard;
  }

  const boardPromise = fetchLiveFleetVehicleBoard(requestedConnection).finally(
    () => {
      fleetVehicleBoardPendingCache.delete(cacheKey);
    },
  );
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
    fleetStaffOptions,
    departmentOptions,
    modelOptions,
    rawVehicleTypeOptions,
    rawCategoryOptions,
  ] = await Promise.all([
    loadCrewAssignmentsByVehicle(uid, connection),
    loadDriverHistoryByVehicle(uid, vehicleIds, connection),
    loadRepairHistoryByVehicle(uid, vehicleIds, connection),
    loadWeightReportsByVehicle(uid, vehicleIds, connection),
    loadFuelReportsByVehicle(uid, vehicleIds, connection),
    loadProcurementLinksByVehicle(uid, vehicleIds, connection),
    loadBroaderFleetStaffOptions(uid, connection, vehicles),
    loadFleetVehicleDepartmentOptions(uid, connection),
    loadFleetVehicleRelationOptions(uid, connection, "model_id"),
    loadFleetVehicleRelationOptions(
      uid,
      connection,
      "municipal_vehicle_type_id",
    ),
    loadFleetVehicleRelationOptions(uid, connection, "category_id"),
  ]);

  const todayKey = getTodayDateKey();
  const { driverOptions, loaderOptions } = fleetStaffOptions;
  const currentMonthKey = todayKey.slice(0, 7);
  const vehicleTypeOptions = normalizeFleetVehicleTypeOptions(
    rawVehicleTypeOptions,
  );
  const categoryOptions = normalizeFleetVehicleTypeOptions(rawCategoryOptions);

  const allVehicles = vehicles
    .map((vehicle) => {
      const vehicleWeightReports =
        weightReportResult.byVehicle.get(vehicle.id) ?? [];
      const vehicleWeightMonthTons = vehicleWeightReports
        .filter((report) => report.reportDate.startsWith(currentMonthKey))
        .reduce((sum, report) => sum + report.weightTons, 0);
      const vehicleWeightTotalTons = vehicleWeightReports.reduce(
        (sum, report) => sum + report.weightTons,
        0,
      );
      const stateLabel = relationName(vehicle.state_id ?? false, "");
      const rawLatestRepairState = vehicle.latest_repair_state || "";
      const latestRepairState = resolveFleetRepairStateLabel(rawLatestRepairState);
      const operationalStatusKey = vehicle.x_municipal_operational_status || "";
      const operationalStatusLabel =
        FLEET_OPERATIONAL_STATUS_LABELS[operationalStatusKey] || "";
      const rawDepartmentName = relationName(
        vehicle.municipal_department_id ?? false,
        "",
      );
      const rawCategoryName = relationName(vehicle.category_id ?? false, "");
      const rawVehicleTypeName = relationName(
        vehicle.municipal_vehicle_type_id ?? false,
        "",
      );
      const displayCategoryName =
        getFleetVehicleTypeDisplayName(rawCategoryName);
      const displayVehicleTypeName =
        getFleetVehicleTypeDisplayName(rawVehicleTypeName) ||
        displayCategoryName;
      const firstAttachmentIds = (ids?: number[]) => (ids?.[0] ? [ids[0]] : []);
      const seatCountValue =
        typeof vehicle.municipal_seat_count === "number" &&
        vehicle.municipal_seat_count > 0
          ? String(Math.trunc(vehicle.municipal_seat_count))
          : "";
      const isRepair =
        Boolean(vehicle.vehicle_downtime_open) ||
        operationalStatusKey === "in_repair" ||
        operationalStatusKey === "broken" ||
        isRepairStatusLabel(stateLabel) ||
        isRepairStatusLabel(rawLatestRepairState) ||
        isRepairStatusLabel(latestRepairState);
      const isArchived = vehicle.active === false;
      const isExplicitlyNonOperational =
        FLEET_NON_OPERATIONAL_STATUS_KEYS.has(operationalStatusKey);
      const isOperational =
        !isArchived &&
        !isExplicitlyNonOperational &&
        (vehicle.mfo_active_for_ops !== false ||
          operationalStatusKey === "available" ||
          operationalStatusKey === "assigned");

      const plate = vehicle.license_plate || vehicle.name || `Машин #${vehicle.id}`;
      const modelName = getFleetModelDisplayName(
        relationName(vehicle.model_id ?? false, ""),
      );

      return {
        id: vehicle.id,
        plate,
        name:
          String(vehicle.x_vehicle_custom_name || "").trim() ||
          getFleetVehicleDisplayName(vehicle.name, plate, modelName),
        imageUrl: vehicle.municipal_front_photo_ids?.[0]
          ? `/api/odoo/attachments/${vehicle.municipal_front_photo_ids[0]}`
          : imageDataUrl(
              vehicle.image_128 || vehicle.avatar_128 || vehicle.image_1920,
            ),
        modelId: relationId(vehicle.model_id ?? false),
        modelName,
        categoryId: relationId(vehicle.category_id ?? false),
        categoryName: displayCategoryName,
        vehicleTypeId: relationId(vehicle.municipal_vehicle_type_id ?? false),
        vehicleTypeName: displayVehicleTypeName,
        departmentId: relationId(vehicle.municipal_department_id ?? false),
        departmentName:
          normalizeOrganizationUnitName(rawDepartmentName) || rawDepartmentName,
        vin: vehicle.vin_sn || "",
        odometerLabel:
          typeof vehicle.odometer === "number" &&
          Number.isFinite(vehicle.odometer)
            ? `${Math.round(vehicle.odometer).toLocaleString("mn-MN")} км`
            : "",
        odometerValue:
          typeof vehicle.odometer === "number" &&
          Number.isFinite(vehicle.odometer)
            ? String(Math.round(vehicle.odometer))
            : "",
        fuelTypeKey: vehicle.fuel_type || "",
        fuelTypeLabel: resolveFleetFuelTypeLabel(vehicle.fuel_type || ""),
        gpsInstalled: Boolean(vehicle.x_gps_installed),
        fuelMonitoringInstalled: Boolean(vehicle.x_fuel_monitoring_installed),
        capacity: vehicle.municipal_capacity || "",
        importedDate: formatOptionalCalendarDate(vehicle.municipal_import_date),
        importedDateValue: vehicle.municipal_import_date || "",
        color: vehicle.municipal_color || "",
        manufacturedDate: formatOptionalCalendarDate(
          vehicle.municipal_manufactured_date,
        ),
        manufacturedDateValue: vehicle.municipal_manufactured_date || "",
        seatCountValue,
        seatCountLabel: seatCountValue,
        fleetDriverName: relationName(vehicle.driver_id ?? false, ""),
        responsibleDriverId: relationId(
          vehicle.municipal_responsible_driver_id ?? false,
        ),
        responsibleDriverName: relationName(
          vehicle.municipal_responsible_driver_id ?? false,
          "",
        ),
        loader1Id: relationId(vehicle.municipal_loader_1_id ?? false),
        loader1Name: relationName(vehicle.municipal_loader_1_id ?? false, ""),
        loader2Id: relationId(vehicle.municipal_loader_2_id ?? false),
        loader2Name: relationName(vehicle.municipal_loader_2_id ?? false, ""),
        stateLabel:
          vehicle.active === false
            ? "Архивласан"
            : isRepair
              ? operationalStatusLabel ||
                stateLabel ||
                latestRepairState ||
                "Засвартай"
              : operationalStatusLabel ||
                stateLabel ||
                (isOperational ? "Ажиллаж байгаа" : "Бүртгэлтэй"),
        operationalStatusKey,
        latestRepairState,
        isOperational,
        isRepair,
        isArchived,
        insurance: {
          company: vehicle.municipal_insurance_company || "",
          policyNumber: vehicle.municipal_insurance_policy_number || "",
          startDate: formatOptionalCalendarDate(
            vehicle.municipal_insurance_date_start,
          ),
          endDate: formatOptionalCalendarDate(
            vehicle.municipal_insurance_date_end,
          ),
          startDateValue: vehicle.municipal_insurance_date_start || "",
          endDateValue: vehicle.municipal_insurance_date_end || "",
          daysRemaining:
            typeof vehicle.municipal_insurance_days_remaining === "number"
              ? vehicle.municipal_insurance_days_remaining
              : 0,
          reminderDue: Boolean(vehicle.municipal_insurance_reminder_due),
          note: vehicle.municipal_insurance_note || "",
          attachmentCount: firstAttachmentIds(
            vehicle.municipal_insurance_attachment_ids,
          ).length,
          attachmentIds: firstAttachmentIds(
            vehicle.municipal_insurance_attachment_ids,
          ),
          contractAttachmentCount: firstAttachmentIds(
            vehicle.municipal_insurance_contract_attachment_ids,
          ).length,
          contractAttachmentIds: firstAttachmentIds(
            vehicle.municipal_insurance_contract_attachment_ids,
          ),
        },
        inspection: {
          startDate: formatOptionalCalendarDate(
            vehicle.municipal_inspection_date,
          ),
          endDate: formatOptionalCalendarDate(
            vehicle.municipal_next_inspection_date,
          ),
          startDateValue: vehicle.municipal_inspection_date || "",
          endDateValue: vehicle.municipal_next_inspection_date || "",
          daysRemaining:
            typeof vehicle.municipal_inspection_days_remaining === "number"
              ? vehicle.municipal_inspection_days_remaining
              : 0,
          reminderDue: Boolean(vehicle.municipal_inspection_reminder_due),
          note: vehicle.municipal_inspection_note || "",
          attachmentCount: firstAttachmentIds(
            vehicle.municipal_inspection_attachment_ids,
          ).length,
          attachmentIds: firstAttachmentIds(
            vehicle.municipal_inspection_attachment_ids,
          ),
        },
        photoGroups: [
          {
            key: "front",
            label: "Урд талаас",
            ids: firstAttachmentIds(vehicle.municipal_front_photo_ids),
          },
          {
            key: "rear",
            label: "Ард талаас",
            ids: firstAttachmentIds(vehicle.municipal_rear_photo_ids),
          },
          {
            key: "side",
            label: "Хажуу талаас",
            ids: firstAttachmentIds(vehicle.municipal_side_photo_ids),
          },
          {
            key: "certificate",
            label: "Гэрчилгээ",
            ids: firstAttachmentIds(vehicle.municipal_certificate_photo_ids),
          },
        ],
        documentGroups: [
          {
            key: "insurance",
            label: "Даатгалын баримт",
            ids: firstAttachmentIds(vehicle.municipal_insurance_attachment_ids),
          },
          {
            key: "insurance-contract",
            label: "Даатгалын гэрээ",
            ids: firstAttachmentIds(
              vehicle.municipal_insurance_contract_attachment_ids,
            ),
          },
          {
            key: "inspection",
            label: "Улсын үзлэгийн баримт",
            ids: firstAttachmentIds(
              vehicle.municipal_inspection_attachment_ids,
            ),
          },
        ],
        driverHistory: latestItems(driverHistoryByVehicle.get(vehicle.id)),
        repairHistory: latestItems(repairHistoryByVehicle.get(vehicle.id), 10),
        weightReports: weightReportResult.byVehicle.get(vehicle.id) ?? [],
        weightReportRows: [],
        weightMonthTons: vehicleWeightMonthTons,
        weightTotalTons: vehicleWeightTotalTons,
        fuelReports: fuelReportResult.byVehicle.get(vehicle.id) ?? [],
        fuelReportRows: [],
        procurementLinks: latestItems(
          procurementLinksByVehicle.get(vehicle.id),
          8,
        ),
        crewAssignments: crewAssignmentsByVehicle.get(vehicle.id) ?? [],
      } satisfies FleetVehicleBoardItem;
    })
    .filter(
      (vehicle) =>
        !isHiddenFleetVehicleTypeName(vehicle.categoryName) &&
        !isHiddenFleetVehicleTypeName(vehicle.vehicleTypeName) &&
        !isHiddenFleetSmokeText(vehicle.name) &&
        !isHiddenFleetSmokeText(vehicle.plate) &&
        !isHiddenFleetSmokeText(vehicle.modelName) &&
        !isHiddenFleetTestText(vehicle.name) &&
        !isHiddenFleetTestText(vehicle.plate) &&
        !isHiddenFleetTestText(vehicle.modelName) &&
        !isHiddenFleetTestText(vehicle.categoryName) &&
        !isHiddenFleetTestText(vehicle.vehicleTypeName),
    )
    .sort((left, right) => left.plate.localeCompare(right.plate, "mn"));

  const activeVehicles = allVehicles.filter(
    (vehicle) => vehicle.isOperational && !vehicle.isRepair,
  );
  const vehicleByIdForReports = new Map(
    allVehicles.map((vehicle) => [vehicle.id, vehicle]),
  );
  const weightReportRows = weightReportResult.items.map((report) => {
    const vehicle = report.vehicleId
      ? vehicleByIdForReports.get(report.vehicleId)
      : null;
    return {
      ...report,
      vehiclePlate: vehicle?.plate || report.vehiclePlate,
      vehicleName: vehicle?.modelName || vehicle?.name || report.vehicleName,
    };
  });
  const fuelReportRows = fuelReportResult.items.map((report) => {
    const vehicle = report.vehicleId
      ? vehicleByIdForReports.get(report.vehicleId)
      : null;
    return {
      ...report,
      vehiclePlate: vehicle?.plate || report.vehiclePlate,
      vehicleName: vehicle?.modelName || vehicle?.name || report.vehicleName,
    };
  });
  const repairVehicles = allVehicles.filter((vehicle) => vehicle.isRepair);
  const previousDateKey = getPreviousDateKey(todayKey);
  const todayWeightRecords = weightReportResult.records.filter(
    (record) => record.report_date === todayKey && record.state !== "failed",
  );
  const displayedWeightRecords = todayWeightRecords.length
    ? todayWeightRecords
    : weightReportResult.records.filter(
        (record) =>
          record.report_date === previousDateKey && record.state !== "failed",
      );
  const todayWeightKg = displayedWeightRecords.reduce((sum, record) => {
    const value = record.weight || 0;
    return sum + (record.unit === "ton" ? value * 1000 : value);
  }, 0);
  const todayFuelLiters = fuelReportResult.records
    .filter(
      (record) => record.report_date === todayKey && record.state !== "failed",
    )
    .reduce((sum, record) => sum + (record.fuel_liters || 0), 0);
  const fuelByVehicle = new Map<number, number>();
  for (const record of fuelReportResult.records) {
    const vehicleId = relationId(record.vehicle_id);
    if (!vehicleId || record.state === "failed") {
      continue;
    }
    fuelByVehicle.set(
      vehicleId,
      (fuelByVehicle.get(vehicleId) ?? 0) + (record.fuel_liters || 0),
    );
  }
  const highestFuelVehicleId = [...fuelByVehicle.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];
  const repairCountByVehicle = new Map(
    allVehicles.map((vehicle) => [vehicle.id, vehicle.repairHistory.length]),
  );
  const mostRepairedVehicleId = [...repairCountByVehicle.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];
  const vehicleById = new Map(
    allVehicles.map((vehicle) => [vehicle.id, vehicle]),
  );
  const failedImportCount =
    weightReportResult.records.filter((record) => record.state === "failed")
      .length +
    fuelReportResult.records.filter((record) => record.state === "failed")
      .length;

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
    insuranceDueCount: allVehicles.filter(
      (vehicle) => vehicle.insurance.reminderDue,
    ).length,
    inspectionDueCount: allVehicles.filter(
      (vehicle) => vehicle.inspection.reminderDue,
    ).length,
    todayWeightLabel: formatWeight(todayWeightKg, "kg"),
    todayFuelLabel: formatLiters(todayFuelLiters),
    weightReportRows,
    fuelReportRows,
    highestFuelVehicle: highestFuelVehicleId
      ? (vehicleById.get(highestFuelVehicleId)?.plate ?? "")
      : "",
    mostRepairedVehicle: mostRepairedVehicleId
      ? (vehicleById.get(mostRepairedVehicleId)?.plate ?? "")
      : "",
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
  const auth = await authenticateWithFallback(
    createOdooConnection(connectionOverrides),
  );
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

async function fetchLiveSnapshot(
  connection: OdooConnection,
): Promise<DashboardSnapshot> {
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
        fields: [
          "name",
          "user_id",
          "ops_department_id",
          "date_start",
          "date",
          "mfo_operation_type",
        ],
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
  const tasks = rawTasks.filter(
    (task) => !isRoadCleaningPhotoPlaceholderTaskName(task.name),
  );

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
    console.warn("ops.task.report мэдээлэл уншихад алдаа гарлаа:", error);
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
  const doneTasks = tasks.filter(
    (task) => taskQuantitySnapshot(task).stageBucket === "done",
  );
  const reviewTasks = tasks.filter(
    (task) => taskQuantitySnapshot(task).stageBucket === "review",
  );
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
  const matchesDepartmentBucket = (
    bucketName: string,
    itemDepartmentName: string,
  ) => {
    const bucketGroup = findDepartmentGroupByName(bucketName);

    return bucketGroup
      ? matchesDepartmentGroup(bucketGroup, itemDepartmentName)
      : itemDepartmentName === bucketName;
  };
  const projectManagerUserIds = Array.from(
    new Set(
      projects
        .map((project) => relationId(project.user_id))
        .filter((userId): userId is number => Boolean(userId)),
    ),
  );
  const projectManagerEmployees = projectManagerUserIds.length
    ? await executeKw<OdooEmployeeRecord[]>(
        uid,
        "hr.employee",
        "search_read",
        [[["user_id", "in", projectManagerUserIds]]],
        {
          fields: ["user_id", "job_id", "job_title"],
          limit: projectManagerUserIds.length,
        },
        resolvedConnection,
      ).catch(() => [] as OdooEmployeeRecord[])
    : [];
  const managerJobTitleByUserId = new Map<number, string>();
  for (const employee of projectManagerEmployees) {
    const userId = relationId(employee.user_id ?? false);
    const jobTitle = getEmployeeJobTitle(employee);
    if (userId && jobTitle) {
      managerJobTitleByUserId.set(userId, jobTitle);
    }
  }

  const inspectorEmployeeIds = Array.from(
    new Set(
      tasks
        .map((task) => relationId(task.mfo_inspector_employee_id ?? false))
        .filter((employeeId): employeeId is number => Boolean(employeeId)),
    ),
  );
  const inspectorEmployees = inspectorEmployeeIds.length
    ? await executeKw<OdooEmployeeRecord[]>(
        uid,
        "hr.employee",
        "search_read",
        [[["id", "in", inspectorEmployeeIds]]],
        {
          fields: ["name", "user_id"],
          limit: inspectorEmployeeIds.length,
        },
        resolvedConnection,
      ).catch(() => [] as OdooEmployeeRecord[])
    : [];
  const inspectorUserIdByEmployeeId = new Map<number, number>();
  for (const employee of inspectorEmployees) {
    const userId = relationId(employee.user_id ?? false);
    if (userId) {
      inspectorUserIdByEmployeeId.set(employee.id, userId);
    }
  }

  // Гүйцэтгэгчийн (assignee) жинхэнэ hr.department. Даалгаврыг ХЭН гүйцэтгэж
  // байгаа хүний хэлтсээр scope хийхэд ашиглана — учир нь захирлын үүрэг
  // даалгаврын төсөл нэг хэлтэст холбогдсон ч гишүүд нь өөр хэлтсийнх байж
  // болох тул төслийн хэлтсээр scope хийвэл өөр хэлтсийн даргад алдагддаг.
  const assigneeUserIds = Array.from(
    new Set(
      tasks.flatMap((task) =>
        Array.isArray(task.user_ids) ? task.user_ids : [],
      ),
    ),
  );
  const assigneeEmployees = assigneeUserIds.length
    ? await executeKw<OdooEmployeeRecord[]>(
        uid,
        "hr.employee",
        "search_read",
        [[["user_id", "in", assigneeUserIds]]],
        {
          fields: ["user_id", "department_id"],
          limit: assigneeUserIds.length,
        },
        resolvedConnection,
      ).catch(() => [] as OdooEmployeeRecord[])
    : [];
  const assigneeDepartmentByUserId = new Map<number, string>();
  for (const employee of assigneeEmployees) {
    const userId = relationId(employee.user_id ?? false);
    const departmentName = relationName(employee.department_id ?? false, "").trim();
    if (userId && departmentName && !assigneeDepartmentByUserId.has(userId)) {
      assigneeDepartmentByUserId.set(
        userId,
        normalizeDepartmentUnitName(departmentName),
      );
    }
  }
  const resolveAssigneeDepartmentName = (userIds?: number[]) => {
    for (const assigneeId of userIds ?? []) {
      const departmentName = assigneeDepartmentByUserId.get(assigneeId);
      if (departmentName) {
        return departmentName;
      }
    }
    return "";
  };

  const departments = departmentSourceNames.map((department) => {
    const departmentTasks = tasks.filter((task) => {
      const departmentName = resolveNormalizedTaskDepartmentName(
        task,
        projectDepartmentById,
      );
      return matchesDepartmentBucket(department, departmentName);
    });
    const departmentDone = departmentTasks.filter(
      (task) => taskQuantitySnapshot(task).stageBucket === "done",
    );
    const departmentReview = departmentTasks.filter(
      (task) => taskQuantitySnapshot(task).stageBucket === "review",
    );
    const departmentProgressTotal = departmentTasks.reduce(
      (total, task) => total + taskQuantitySnapshot(task).progress,
      0,
    );

    return {
      name: department,
      label: resolveDepartmentLabel(department),
      icon: resolveDepartmentIcon(department),
      accent: resolveDepartmentAccent(department),
      openTasks: departmentTasks.length - departmentDone.length,
      reviewTasks: departmentReview.length,
      completion: departmentTasks.length
        ? Math.round(departmentProgressTotal / departmentTasks.length)
        : 0,
    };
  });

  const projectsWithStats = projects.map((project) => {
    const projectTasks = tasks.filter(
      (task) =>
        Array.isArray(task.project_id) && task.project_id[0] === project.id,
    );
    const projectTaskDepartments = projectTasks
      .map((task) =>
        resolveNormalizedTaskDepartmentName(task, projectDepartmentById),
      )
      .filter((departmentName) => departmentName !== UNKNOWN_DEPARTMENT);
    const taskSnapshots = projectTasks.map((task) =>
      taskQuantitySnapshot(task),
    );
    const completed = taskSnapshots.filter(
      (snapshot) => snapshot.stageBucket === "done",
    ).length;
    const buckets = taskSnapshots.map((snapshot) => snapshot.stageBucket);
    const stageBucket = buckets.includes("review")
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
      managerJobTitle:
        managerJobTitleByUserId.get(relationId(project.user_id) ?? 0) || "",
      departmentName:
        projectTaskDepartments[0] ??
        projectDepartmentById.get(project.id) ??
        resolveNormalizedProjectDepartmentName(project),
      operationType: project.mfo_operation_type || "",
      operationTypeLabel: operationTypeLabel(project.mfo_operation_type),
      stageLabel: STAGE_LABELS[stageBucket],
      stageBucket,
      openTasks: projectTasks.length - completed,
      completion: taskSnapshots.length
        ? Math.round(
            taskSnapshots.reduce(
              (total, snapshot) => total + snapshot.progress,
              0,
            ) / taskSnapshots.length,
          )
        : 0,
      deadline: formatCompactDateOnly(project.date),
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
    deadline: formatCompactDateOnly(task.date_deadline),
    scheduledDate: getDateKeyFromValue(
      task.mfo_shift_date || task.date_deadline || null,
    ),
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
    deadline: formatCompactDateOnly(task.date_deadline),
    projectId: Array.isArray(task.project_id) ? task.project_id[0] : null,
    projectName: relationName(task.project_id),
    leaderId: relationId(task.ops_team_leader_id ?? false),
    leaderName: relationName(task.ops_team_leader_id ?? false),
    progress: taskQuantitySnapshot(task).progress,
    href: buildTaskHref(task.id, "/review"),
  }));

  const reportAttachmentIdsByReportId = new Map<
    number,
    { imageIds: number[]; audioIds: number[] }
  >();
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
      console.warn("ir.attachment мэдээлэл уншихад алдаа гарлаа:", error);
    }
  }

  const reportIds = reports.map((report) => report.id);
  if (reportIds.length) {
    try {
      const fallbackAttachments = await searchReadAll<OdooAttachmentRecord>(
        uid,
        "ir.attachment",
        [
          ["res_model", "=", "ops.task.report"],
          ["res_id", "in", reportIds],
        ],
        {
          fields: ["name", "mimetype", "res_id"],
          order: "create_date asc, id asc",
        },
        connection,
        400,
      );

      for (const attachment of fallbackAttachments) {
        const reportId =
          typeof attachment.res_id === "number" ? attachment.res_id : 0;
        if (!reportId) {
          continue;
        }
        attachmentMap.set(attachment.id, attachment);
        const entry = reportAttachmentIdsByReportId.get(reportId) ?? {
          imageIds: [],
          audioIds: [],
        };
        const mimetype = String(attachment.mimetype || "").toLowerCase();
        if (
          mimetype.startsWith("image/") &&
          !entry.imageIds.includes(attachment.id)
        ) {
          entry.imageIds.push(attachment.id);
        }
        if (
          mimetype.startsWith("audio/") &&
          !entry.audioIds.includes(attachment.id)
        ) {
          entry.audioIds.push(attachment.id);
        }
        reportAttachmentIdsByReportId.set(reportId, entry);
      }
    } catch (error) {
      console.warn(
        "ops.task.report хавсралтын fallback уншихад алдаа гарлаа:",
        error,
      );
    }
  }

  const getReportImageIds = (report: OdooReportRecord) =>
    reportAttachmentIdsByReportId.get(report.id)?.imageIds ??
    report.image_attachment_ids ??
    [];
  const getReportAudioIds = (report: OdooReportRecord) =>
    reportAttachmentIdsByReportId.get(report.id)?.audioIds ??
    report.audio_attachment_ids ??
    [];
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
    const taskIsDone = Boolean(
      task &&
        (task.state === "1_done" ||
          getStageBucket(relationName(task.stage_id, "")) === "done"),
    );
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
        : "Тодорхойгүй",
      projectId:
        task && Array.isArray(task.project_id) ? task.project_id[0] : null,
      projectName: task ? relationName(task.project_id) : "Ажилгүй",
      summary: htmlToPlainText(report.report_summary) || "Тайлбар оруулаагүй",
      text: htmlToPlainText(report.report_text || report.report_summary),
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
        report.task_measurement_unit_code ||
        (task ? resolveTaskMeasurementCode(task) : ""),
      imageCount: Math.max(report.image_count ?? 0, images.length),
      audioCount: Math.max(report.audio_count ?? 0, audios.length),
      submittedDateKey: getDateKeyFromValue(report.report_datetime) ?? "",
      submittedAt: formatCompactDate(report.report_datetime),
      taskDateKey:
        getDateKeyFromValue(
          task?.mfo_shift_date || task?.date_deadline || task?.create_date || null,
        ) ?? "",
      // Дууссан ажлын огноо: энэ байгууллагад "Хийгдэх хугацаа" нь ажил бодитоор
      // хийгдсэн өдрийг заадаг тул түүнийг тэргүүлж, дараа нь ээлжийн огноо,
      // эцэст нь "Дууссан" шатанд шилжсэн системийн огноог хэрэглэнэ.
      taskDoneDateKey: taskIsDone
        ? getDateKeyFromValue(
            task?.date_deadline ||
              task?.mfo_shift_date ||
              task?.date_last_stage_update ||
              null,
          ) ?? ""
        : "",
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
      report.stateBucket === "problem" ||
      reportStateBucket(workReturn?.state) === "problem"
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
      rejectionReason:
        report.rejectionReason || workReturnReason || messageReturnReason,
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
      const inspectorEmployeeId = relationId(
        task.mfo_inspector_employee_id ?? false,
      );

      return {
        id: task.id,
        name: task.name,
        departmentName: resolveTaskDepartmentName(task, projectDepartmentById),
        isDepartmentTask: Boolean(relationId(task.ops_department_id ?? false)),
        assigneeDepartmentName: resolveAssigneeDepartmentName(task.user_ids),
        projectId: Array.isArray(task.project_id) ? task.project_id[0] : null,
        projectName: relationName(task.project_id, "Ажилгүй"),
        stageLabel: STAGE_LABELS[stageBucket],
        stageBucket,
        createdDate: getDateKeyFromValue(task.create_date || null),
        createdAt: task.create_date || null,
        statusKey,
        statusLabel: getTaskStatusLabel(statusKey),
        deadline: formatCompactDateOnly(task.date_deadline),
        deadlineDateTime: task.date_deadline || null,
        scheduledDate: getDateKeyFromValue(
          task.mfo_shift_date || task.date_deadline || null,
        ),
        leaderId: relationId(task.ops_team_leader_id ?? false),
        leaderName: relationName(task.ops_team_leader_id ?? false),
        inspectorEmployeeId,
        inspectorName: relationName(
          task.mfo_inspector_employee_id ?? false,
          "",
        ),
        inspectorUserId: inspectorEmployeeId
          ? (inspectorUserIdByEmployeeId.get(inspectorEmployeeId) ?? null)
          : null,
        priorityLabel: priorityLabel(task.priority || ""),
        progress: quantitySnapshot.progress,
        plannedQuantity: quantitySnapshot.plannedQuantity,
        completedQuantity: quantitySnapshot.completedQuantity,
        remainingQuantity: quantitySnapshot.remainingQuantity,
        measurementUnit: resolveTaskMeasurementUnit(task),
        operationType: task.mfo_operation_type || "",
        operationTypeLabel: operationTypeLabel(task.mfo_operation_type),
        vehicleName: relationName(task.mfo_vehicle_id ?? false, ""),
        driverName: relationName(task.mfo_driver_employee_id ?? false, ""),
        unresolvedStopCount: task.mfo_unresolved_stop_count ?? 0,
        missingProofStopCount: task.mfo_missing_proof_stop_count ?? 0,
        deviationStopCount: task.mfo_route_deviation_stop_count ?? 0,
        hasWeightWarning: Boolean(task.mfo_weight_sync_warning),
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

      const statusDiff =
        statusPriority[left.statusKey] - statusPriority[right.statusKey];
      if (statusDiff !== 0) {
        return statusDiff;
      }

      return left.name.localeCompare(right.name, "mn");
    });

  const teamLeaderMap = new Map<string, TeamLeaderCard>();
  for (const task of tasks) {
    const leaderName = relationName(
      task.ops_team_leader_id ?? false,
      "Оноогоогүй",
    );
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
    entry.squadSize = Math.max(
      entry.squadSize,
      Math.max((task.user_ids?.length ?? 1) - 1, 0),
    );
    teamLeaderMap.set(leaderName, entry);
  }

  const teamLeaders = Array.from(teamLeaderMap.values())
    .map((leader) => {
      const relatedTasks = tasks.filter(
        (task) =>
          relationName(task.ops_team_leader_id ?? false, "Оноогоогүй") ===
          leader.name,
      );
      const totalProgress = relatedTasks.reduce(
        (sum, task) => sum + taskQuantitySnapshot(task).progress,
        0,
      );
      return {
        ...leader,
        averageCompletion: relatedTasks.length
          ? Math.round(totalProgress / relatedTasks.length)
          : 0,
      };
    })
    .sort((left, right) => right.activeTasks - left.activeTasks)
    .slice(0, 4);

  const qualitySourceTasks = tasks.filter(
    (task) =>
      task.mfo_is_operation_project &&
      (task.mfo_quality_exception_count ?? 0) > 0,
  );
  const missingProofTasks = qualitySourceTasks.filter(
    (task) => (task.mfo_missing_proof_stop_count ?? 0) > 0,
  );
  const syncWarningTasks = qualitySourceTasks.filter(
    (task) => task.mfo_weight_sync_warning,
  );
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

  const completionRate = totalTasks
    ? Math.round(
        tasks.reduce(
          (sum, task) => sum + taskQuantitySnapshot(task).progress,
          0,
        ) / totalTasks,
      )
    : 0;
  const completedQuantitySummary = buildQuantityMetricSummary(tasks);

  return {
    source: "live",
    generatedAt: formatSyncDate(new Date()),
    odooBaseUrl: resolvedConnection.url,
    totalTasks,
    metrics: [
      {
        label: "Идэвхтэй даалгавар",
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
        note: `${doneTasks.length}/${totalTasks} даалгавар дууссан`,
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
        note: "Талбарын гүйцэтгэл дээр засах шаардлагатай даалгавар",
        tone: qualitySourceTasks.length ? "red" : "teal",
      },
      {
        label: "Зураг дутсан даалгавар",
        value: String(missingProofTasks.length),
        note: "Өмнө, дараах зураг бүрэн биш",
        tone: missingProofTasks.length ? "amber" : "teal",
      },
      {
        label: "Синк анхааруулга",
        value: String(syncWarningTasks.length),
        note: "WRS эсвэл жингийн мэдээлэл бүрэн биш",
        tone: syncWarningTasks.length ? "red" : "slate",
      },
      {
        label: "Маршрутын зөрүү",
        value: String(deviationTasks.length),
        note: `${unresolvedQualityTasks.length} даалгавар нээлттэй цэгтэй`,
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
        label: "Идэвхтэй даалгавар",
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
        note: "18/28 даалгавар дээр ахиц бүртгэгдсэн",
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
        note: "Талбарын гүйцэтгэл дээр дахин хянах даалгавар",
        tone: "red",
      },
      {
        label: "Зураг дутсан даалгавар",
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
        stageLabel: "Хянаж байгаа",
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
        stageLabel: "Төлөвлөсөн",
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
        stageLabel: "Төлөвлөсөн",
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
        stageLabel: "Хянаж байгаа",
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
        operationType: "green_maintenance",
        operationTypeLabel: "Ерөнхий ажил",
        issueFlag: false,
        href: buildTaskHref(201, "/tasks"),
      },
      {
        id: 202,
        name: "Хог тээврийн 2-р маршрут",
        departmentName: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
        projectName: "Хог тээвэрлэлтийн өглөөний маршрут",
        stageLabel: "Төлөвлөсөн",
        stageBucket: "progress",
        statusKey: "problem",
        statusLabel: "Хянаж байгаа",
        deadline: "Өнөөдөр 19:00",
        scheduledDate: todayDateKey,
        leaderName: "sarangerel",
        priorityLabel: "Яаралтай",
        progress: 88,
        plannedQuantity: 5,
        completedQuantity: 4,
        remainingQuantity: 1,
        measurementUnit: "ачилт",
        operationType: "garbage",
        operationTypeLabel: "Хог цуглуулалт",
        issueFlag: true,
        href: buildTaskHref(202, "/tasks"),
      },
      {
        id: 102,
        name: "7-р хороо - Төв замын захын цэвэрлэгээ",
        departmentName: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
        projectName: "Зам талбайн шөнийн цэвэрлэгээ",
        stageLabel: "Төлөвлөсөн",
        stageBucket: "todo",
        statusKey: "planned",
        statusLabel: "Төлөвлөсөн",
        deadline: "Маргааш 06:00",
        scheduledDate: tomorrowDateKey,
        leaderName: "temuulen",
        priorityLabel: "Яаралтай",
        progress: 0,
        plannedQuantity: 12,
        completedQuantity: 0,
        remainingQuantity: 12,
        measurementUnit: "км²",
        operationType: "street_cleaning",
        operationTypeLabel: "Гудамж цэвэрлэгээ",
        issueFlag: false,
        href: buildTaskHref(102, "/tasks"),
      },
      {
        id: 103,
        name: "Авто бааз - 3 машинд урсгал үйлчилгээ",
        departmentName: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
        projectName: "Техникийн өдөр тутмын бэлэн байдал",
        stageLabel: "Төлөвлөсөн",
        stageBucket: "progress",
        statusKey: "planned",
        statusLabel: "Төлөвлөсөн",
        deadline: "Өнөөдөр 17:30",
        scheduledDate: todayDateKey,
        leaderName: "bold",
        priorityLabel: "Дунд",
        progress: 33,
        plannedQuantity: 3,
        completedQuantity: 1,
        remainingQuantity: 2,
        measurementUnit: "машин",
        operationType: "",
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
        stageLabel: "Төлөвлөсөн",
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
        stageLabel: "Төлөвлөсөн",
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
        stageLabel: "Төлөвлөсөн",
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
        stageLabel: "Хянаж байгаа",
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
        stageLabel: "Хянаж байгаа",
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
        text: "21 мод хэлбэржүүлж, 1 зураг, 1 аудио тайлан хавсаргасан.",
        state: "submitted",
        stateLabel: "Тайлан илгээсэн",
        stateBucket: "review",
        rejectionReason: "",
        reportedQuantity: 21,
        measurementUnit: "мод",
        measurementUnitCode: "tree",
        imageCount: 1,
        audioCount: 1,
        submittedDateKey: todayDateKey,
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
        text: "Маршрут дууссан, дахин ачилт 18:00-д эхэлнэ.",
        state: "submitted",
        stateLabel: "Тайлан илгээсэн",
        stateBucket: "review",
        rejectionReason: "",
        reportedQuantity: 4,
        measurementUnit: "удаа",
        measurementUnitCode: "times",
        imageCount: 2,
        audioCount: 0,
        submittedDateKey: todayDateKey,
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

function cleanSnapshotText<T>(value: T): T {
  if (typeof value === "string") {
    return cleanDisplayText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cleanSnapshotText(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        cleanSnapshotText(item),
      ]),
    ) as T;
  }
  return value;
}

export type AssignedTaskStatusKey = "planned" | "doing" | "review" | "done";

export type AssignedTaskItem = {
  id: number;
  name: string;
  projectName: string;
  departmentName: string;
  deadline: string;
  statusKey: AssignedTaskStatusKey;
  statusLabel: string;
  href: string;
};

// Odoo-гийн stage нэрийг ажилтанд ойлгомжтой 4 төлөвт хөрвүүлнэ.
function deriveAssignedTaskStatus(stageName: string): {
  key: AssignedTaskStatusKey;
  label: string;
} {
  const raw = (stageName || "").trim();
  const s = raw.toLocaleLowerCase("mn-MN");
  if (
    s.includes("дууссан") ||
    s.includes("verified") ||
    s.includes("done") ||
    s.includes("баталсан") ||
    s.includes("хүлээн авсан") ||
    s.includes("хаагдсан") ||
    s.includes("биелсэн")
  ) {
    return { key: "done", label: raw || "Дууссан" };
  }
  if (
    // "Шалгаж байна", "Шалгагдаж буй ажил"
    s.includes("шалга") ||
    s.includes("хянаж") ||
    s.includes("review") ||
    s.includes("хүлээгдэж")
  ) {
    return { key: "review", label: raw || "Шалгаж байна" };
  }
  if (
    // "Гүйцэтгэж байна", "Явагдаж буй ажил", "Хэрэгжиж байна"
    s.includes("хийгдэж") ||
    s.includes("гүйцэтгэж") ||
    s.includes("явагд") ||
    s.includes("хэрэгжиж") ||
    s.includes("явц") ||
    s.includes("эхэлсэн") ||
    s.includes("progress")
  ) {
    return { key: "doing", label: raw || "Хийгдэж байна" };
  }
  return { key: "planned", label: raw || "Төлөвлөсөн" };
}

const ASSIGNED_STATUS_SORT: Record<AssignedTaskStatusKey, number> = {
  doing: 0,
  review: 1,
  planned: 2,
  done: 3,
};

// Хэрэглэгчид (uid) оногдсон даалгаврыг service (admin) эрхээр татна.
// Worker/нярав өөрийн эрхээр project.task-ийг уншиж чаддаггүй тул нүүр дээр
// оногдсон даалгавар харагдахгүй байсныг энэ замаар найдвартай харуулна.
// Дууссан даалгаврыг мөн оруулж, төлөвөөр нь эрэмбэлж буцаана.
export async function loadUserAssignedTasks(uid: number): Promise<AssignedTaskItem[]> {
  if (!uid || !Number.isFinite(uid)) return [];
  const records = await executeOdooKw<
    Array<{
      id: number;
      name?: string;
      project_id?: OdooRelation;
      ops_department_id?: OdooRelation;
      date_deadline?: string | false;
      stage_id?: OdooRelation;
    }>
  >(
    "project.task",
    "search_read",
    [["|", ["user_ids", "in", [uid]], ["ops_team_leader_id", "=", uid]]],
    {
      fields: ["name", "project_id", "ops_department_id", "date_deadline", "stage_id"],
      order: "date_deadline asc, id desc",
      limit: 100,
    },
    createOdooConnection(),
  ).catch((error) => {
    console.warn("loadUserAssignedTasks failed:", error);
    return [] as Array<{ id: number }>;
  });
  return (records as Array<{
    id: number;
    name?: string;
    project_id?: OdooRelation;
    ops_department_id?: OdooRelation;
    date_deadline?: string | false;
    stage_id?: OdooRelation;
  }>)
    .filter((record) => {
      // Odoo-гийн default "Welcome ...!" onboarding таск (төсөлгүй) болон
      // цуцалсан даалгаврыг хасна. Дууссаныг харуулна (төлөвөөр нь ялгана).
      if (!Array.isArray(record.project_id)) return false;
      if ((record.name || "").trim().toLowerCase().startsWith("welcome")) return false;
      const stage = relationName(record.stage_id ?? false, "").toLocaleLowerCase("mn-MN");
      return !stage.includes("цуцал");
    })
    .map((record) => {
      const status = deriveAssignedTaskStatus(relationName(record.stage_id ?? false, ""));
      return {
        id: record.id,
        name: (record.name || "").trim() || "Нэргүй даалгавар",
        projectName: relationName(record.project_id ?? false, ""),
        departmentName: relationName(record.ops_department_id ?? false, ""),
        deadline: typeof record.date_deadline === "string" ? record.date_deadline.slice(0, 10) : "",
        statusKey: status.key,
        statusLabel: status.label,
        href: `/tasks/${record.id}`,
      };
    })
    .sort((a, b) => ASSIGNED_STATUS_SORT[a.statusKey] - ASSIGNED_STATUS_SORT[b.statusKey]);
}

export async function loadMunicipalSnapshot(
  connectionOverrides: Partial<OdooConnection> = {},
  options: { allowFallback?: boolean; skipCache?: boolean } = {},
) {
  const connection = createOdooConnection(connectionOverrides);
  // skipCache: тайлангийн хуудас шиг шинэлэг байх ёстой газарт кэш (2 мин) болон
  // stale давхаргыг алгасаж, Odoo-гоос шууд татна. Үр дүнг кэшэд бичсэн хэвээр
  // тул бусад хуудсууд (хянах самбар) хурдан хэвээр ажиллана.
  if (!options.skipCache) {
    const cachedSnapshot = readCachedMunicipalSnapshot(connection);
    if (cachedSnapshot) {
      return cachedSnapshot;
    }
  }

  const cacheKey = getMunicipalSnapshotCacheKey(connection);
  const staleSnapshot = options.skipCache
    ? null
    : readCachedMunicipalSnapshot(connection, { allowStale: true });
  if (staleSnapshot) {
    if (!municipalSnapshotPendingCache.has(cacheKey)) {
      const refreshPromise = (async () => {
        try {
          const snapshot = cleanSnapshotText(await fetchLiveSnapshot(connection));
          writeCachedMunicipalSnapshot(connection, snapshot);
          return snapshot;
        } catch (error) {
          console.warn("Municipal snapshot stale refresh failed:", error);
          return staleSnapshot;
        }
      })().finally(() => {
        municipalSnapshotPendingCache.delete(cacheKey);
      });
      municipalSnapshotPendingCache.set(cacheKey, refreshPromise);
    }
    return staleSnapshot;
  }

  const canUsePendingSnapshot = options.allowFallback !== false;
  if (canUsePendingSnapshot) {
    const pendingSnapshot = municipalSnapshotPendingCache.get(cacheKey);
    if (pendingSnapshot) {
      return pendingSnapshot;
    }
  }

  const snapshotPromise = (async () => {
    try {
      const snapshot = cleanSnapshotText(await fetchLiveSnapshot(connection));
      writeCachedMunicipalSnapshot(connection, snapshot);
      return snapshot;
    } catch (error) {
      if (options.allowFallback === false) {
        throw error;
      }
      console.warn("Falling back to demo dashboard snapshot:", error);
      const fallback = cleanSnapshotText(buildFallbackSnapshot());
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
