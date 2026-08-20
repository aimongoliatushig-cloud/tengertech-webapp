import "server-only";

import { prepareUploadFromFile } from "@/lib/image-compress";
import type { AppSession } from "@/lib/auth";
import {
  compareHrDepartmentNames,
  compareHrDepartmentThenName,
  getHrEmployeeDepartmentDisplayName,
  getHrDepartmentDisplayName,
  getHrJobTitleDisplayName,
  getHrManagerDisplayName,
} from "@/lib/hr-department-order";
import {
  createOdooConnection,
  executeOdooKw,
  type HrEmployeeDocumentRecord,
  type HrEmployeeEducationRecord,
  type HrEmployeeDirectoryItem,
  type HrEmployeeEmergencyContact,
  type HrEmployeeFamilyMember,
  type HrEmployeeReward,
  type HrEmployeeTalentSkill,
  loadHrEmployeeDirectory,
} from "@/lib/odoo";
import { fixMojibakeText } from "@/lib/text-normalize";

type OdooRelation = [number, string] | false;

type CurrentEmployeeRecord = {
  id: number;
  name?: string;
  job_id?: OdooRelation;
  job_title?: string | false;
  department_id?: OdooRelation;
  user_id?: OdooRelation;
  x_role_key?: string | false;
  x_hr_role?: string | false;
  role_key?: string | false;
  mfo_field_role?: string | false;
  x_field_role?: string | false;
};

type CurrentUserRecord = {
  id: number;
  name?: string;
  login?: string;
  group_ids?: number[];
  ops_user_type?: string | false;
  x_role_key?: string | false;
  x_hr_role?: string | false;
};

type OdooGroupRecord = {
  id: number;
  name?: string | false;
  full_name?: string | false;
};

type OdooDictionaryRecord = {
  id: number;
  name: string;
  manager_id?: OdooRelation;
};

type HrTransferHistorySearchRecord = {
  id: number;
  employee_id?: OdooRelation;
  date?: string | false;
  old_department_id?: OdooRelation;
  new_department_id?: OdooRelation;
  old_job_id?: OdooRelation;
  new_job_id?: OdooRelation;
  old_manager_id?: OdooRelation;
  new_manager_id?: OdooRelation;
  note?: string | false;
};

type HrAttachmentSearchRecord = {
  id: number;
  name?: string | false;
  mimetype?: string | false;
  x_mn_document_type?: string | false;
};

type HrEmployeeDocumentAttachmentInput = {
  recordId: string;
  name: string;
  datas: string;
  mimetype: string;
  documentType?: string;
};

type HrEmployeeTransferSnapshot = {
  department_id?: OdooRelation;
  job_id?: OdooRelation;
  parent_id?: OdooRelation;
};

type HrEmployeeSingleSearchRecord = {
  id: number;
  name?: string | false;
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
  identification_id?: string | false;
  x_mn_registration_number?: string | false;
  private_phone?: string | false;
  private_email?: string | false;
  private_street?: string | false;
  private_street2?: string | false;
  private_city?: string | false;
  private_zip?: string | false;
  private_country_id?: OdooRelation;
  emergency_contact?: string | false;
  emergency_phone?: string | false;
  place_of_birth?: string | false;
  country_of_birth?: OdooRelation;
  country_id?: OdooRelation;
  marital?: string | false;
  spouse_complete_name?: string | false;
  spouse_birthdate?: string | false;
  children?: number | false;
  passport_id?: string | false;
  study_field?: string | false;
  study_school?: string | false;
  bank_account_id?: OdooRelation;
  work_location_id?: OdooRelation;
  address_id?: OdooRelation;
  resource_calendar_id?: OdooRelation;
  coach_id?: OdooRelation;
  contract_id?: OdooRelation;
  wage?: number | false;
  pay_category?: string | false;
  departure_date?: string | false;
  departure_reason_id?: OdooRelation;
  departure_description?: string | false;
  trial_date_end?: string | false;
  notes?: string | false;
  additional_note?: string | false;
  x_mn_employee_code?: string | false;
  x_mn_grade_rank?: string | false;
  x_mn_employment_status?: string | false;
  x_mn_missing_document_count?: number | false;
  x_mn_performance_score?: number | false;
  x_mn_task_completion_percent?: number | false;
  x_mn_discipline_score?: number | false;
};

type HrEmployeeFamilyMemberSearchRecord = {
  id: number;
  employee_id?: OdooRelation;
  related_employee_id?: OdooRelation;
  name?: string | false;
  birth_year?: string | false;
  school?: string | false;
  phone?: string | false;
  relation?: string | false;
  note?: string | false;
};

type HrEmployeeFamilyMemberEmployeeRecord = {
  id: number;
  name?: string | false;
  department_id?: OdooRelation;
  job_id?: OdooRelation;
  job_title?: string | false;
};

type HrEmployeeEmergencyContactSearchRecord = {
  id: number;
  employee_id?: OdooRelation;
  name?: string | false;
  relation?: string | false;
  phone?: string | false;
  address?: string | false;
  note?: string | false;
};

type HrEmployeeRewardSearchRecord = {
  id: number;
  employee_id?: OdooRelation;
  date?: string | false;
  name?: string | false;
  order_no?: string | false;
  note?: string | false;
};

type HrEmployeeTalentSkillSearchRecord = {
  id: number;
  employee_id?: OdooRelation;
  name?: string | false;
  skill_type?: string | false;
  level?: string | false;
  acquired_date?: string | false;
  note?: string | false;
};

type HrEmployeeDirectoryApiRecord = {
  id: number;
  name?: string;
  active?: boolean;
  departmentId?: number | null;
  departmentName?: string;
  jobId?: number | null;
  jobTitle?: string;
  workPhone?: string;
  mobilePhone?: string;
  workEmail?: string;
  userId?: number | null;
  userName?: string;
  photo?: string | false;
  photoUrl?: string;
  employeeCode?: string;
  gradeRank?: string;
  workType?: string;
  statusKey?: string;
  statusLabel?: string;
  managerId?: number | null;
  managerName?: string;
  startDate?: string;
  contractEndDate?: string;
  trialEndDate?: string;
  birthDate?: string;
  genderKey?: string;
  genderLabel?: string;
  educationLevel?: string;
  missingDocumentCount?: number;
  kpiScore?: number;
  taskCompletionPercent?: number;
  disciplineScore?: number;
};

type HrTimeoffRequestSearchRecord = {
  id: number;
  name?: string | false;
  employee_id?: OdooRelation;
  department_id?: OdooRelation;
  request_type?: string | false;
  date_from?: string | false;
  date_to?: string | false;
  duration_days?: number | false;
  order_no?: string | false;
  reason?: string | false;
  note?: string | false;
  hr_note?: string | false;
  rejection_reason?: string | false;
  state?: string | false;
  submitted_by?: OdooRelation;
  submitted_date?: string | false;
  reviewed_by?: OdooRelation;
  approved_by?: OdooRelation;
  rejected_by?: OdooRelation;
  attachment_ids?: number[];
};

type HrDisciplineSearchRecord = {
  id: number;
  employee_id?: OdooRelation;
  department_id?: OdooRelation;
  violation_type?: string | false;
  violation_date?: string | false;
  action_type?: string | false;
  state?: string | false;
  repeated?: boolean;
  repeated_violation_count?: number | false;
  explanation?: string | false;
  employee_explanation?: string | false;
  attachment_ids?: number[];
};

type HrClearanceSearchRecord = {
  id: number;
  name?: string | false;
  employee_id?: OdooRelation;
  department_id?: OdooRelation;
  job_id?: OdooRelation;
  saved_date?: string | false;
  section?: string | false;
  state?: string | false;
  note?: string | false;
  attachment_ids?: number[];
};

type HrReportFallbackAttachmentRecord = {
  id: number;
  name?: string | false;
  create_date?: string | false;
  create_uid?: OdooRelation;
  datas?: string | false;
  mimetype?: string | false;
};

type HrReportLine = {
  values?: unknown[];
};

type HrCompanyLogoRecord = {
  id: number;
  name?: string | false;
  logo?: string | false;
  logo_web?: string | false;
  image_1920?: string | false;
};

export type HrOption = {
  id: number;
  name: string;
};

export type HrSelectionOption = {
  id: string;
  name: string;
};

export type HrStats = {
  totalEmployees: number;
  activeEmployees: number;
  leaveToday: number;
  sickToday: number;
  businessTripToday: number;
  newEmployees: number;
  resignedEmployees: number;
  archivedEmployees: number;
  activeDiscipline: number;
  completedDiscipline: number;
  transfers: number;
  expiringContracts: number;
  missingAttachmentEmployees: number;
  pendingClearance: number;
};

export type HrTimeoffRequestType = "time_off" | "sick" | "annual_leave";
export type HrTimeoffRequestState = "draft" | "submitted" | "hr_review" | "approved" | "rejected" | "cancelled";

export type HrTimeoffRequest = {
  id: number;
  name: string;
  employeeId: number;
  employeeName: string;
  departmentId: number | null;
  departmentName: string;
  requestType: HrTimeoffRequestType;
  requestTypeLabel: string;
  dateFrom: string;
  dateTo: string;
  durationDays: number;
  orderNumber: string;
  reason: string;
  note: string;
  hrNote: string;
  rejectionReason: string;
  state: HrTimeoffRequestState;
  stateLabel: string;
  submittedBy: string;
  submittedDate: string;
  reviewedBy: string;
  approvedBy: string;
  rejectedBy: string;
  hasAttachment: boolean;
  attachmentIds: number[];
  canEdit: boolean;
  canApprove: boolean;
};

export type HrTimeoffDashboardData = {
  scope: "hr" | "department";
  departmentName: string;
  cards: {
    totalEmployees: number;
    activeEmployees: number;
    timeOffEmployees: number;
    annualLeaveEmployees: number;
    sickEmployees: number;
    archivedEmployees: number;
    pendingRequests: number;
    approvedRequests: number;
    rejectedRequests: number;
  };
  statusPie: Array<{ label: string; value: number }>;
  departmentBreakdown: Array<{
    departmentId: number;
    departmentName: string;
    totalEmployees: number;
    activeEmployees: number;
    timeOffEmployees: number;
    annualLeaveEmployees: number;
    sickEmployees: number;
    pendingRequests: number;
  }>;
  latestRequests: HrTimeoffRequest[];
};

export type HrDisciplineRecord = {
  id: number;
  employeeId: number | null;
  employeeName: string;
  departmentId: number | null;
  departmentName: string;
  violationType: string;
  violationTypeLabel: string;
  violationDate: string;
  actionType: string;
  actionTypeLabel: string;
  state: string;
  stateLabel: string;
  repeated: boolean;
  repeatedViolationCount: number;
  explanation: string;
  employeeExplanation: string;
  hasAttachment: boolean;
};

export type HrLeaveItem = {
  id: number;
  employeeId: number | null;
  employeeName: string;
  typeName: string;
  dateFrom: string;
  dateTo: string;
  dayCount: number;
  state: string;
  stateLabel: string;
  note: string;
  hasAttachment: boolean;
};

export type HrEmployeeCreateInput = {
  lastName?: string;
  firstName: string;
  registerNumber?: string;
  gender?: string;
  birthDate?: string;
  countryOfBirth?: string;
  nationality?: string;
  countryOfBirthId?: number;
  nationalityId?: number;
  phone?: string;
  email?: string;
  departmentId?: number;
  jobId?: number;
  jobTitle?: string;
  managerId?: number;
  startDate?: string;
  workType?: string;
  isFieldEmployee?: boolean;
  fieldRole?: string;
  workLocation?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  homeAddress?: string;
  birthPlace?: string;
  addressProvince?: string;
  addressDistrict?: string;
  addressSubdistrict?: string;
  familyStatus?: string;
  childrenCount?: number;
  childrenInfo?: string;
  childrenSchool?: string;
  bankName?: string;
  bankAccountNumber?: string;
  baseSalary?: string;
  payCategory?: string;
  taxNumber?: string;
  socialInsuranceStartDate?: string;
  annualLeaveNote?: string;
  talent?: string;
  skillLevel?: string;
  previousEmployment?: string;
  additionalDuty?: string;
  trialEndDate?: string;
  educationLevel?: string;
  educationRecords?: HrEmployeeEducationRecord[];
  documentRecords?: HrEmployeeDocumentRecord[];
  studyField?: string;
  studySchool?: string;
  educationAttachmentBase64?: string;
  educationAttachmentName?: string;
  educationAttachmentMimeType?: string;
  documentAttachments?: HrEmployeeDocumentAttachmentInput[];
  note?: string;
  profilePhotoBase64?: string;
};

export type HrEmployeeTransferInput = {
  employeeId: number;
  newDepartmentId?: number;
  newJobId?: number;
  newManagerId?: number;
  effectiveDate: string;
  orderNumber?: string;
  reason: string;
  files?: File[];
};

export type HrEmployeeTerminationInput = {
  employeeId: number;
  terminationDate: string;
  reason: string;
  orderNumber?: string;
  archiveNumber?: string;
  note?: string;
  files?: File[];
};

export type HrEmployeeTrialConfirmationInput = {
  employeeId: number;
  permanentDate: string;
  orderNumber: string;
  note?: string;
  files?: File[];
};

export type HrClearanceCreateInput = {
  employeeId: number;
  savedDate: string;
  section?: string;
  state?: string;
  note?: string;
  files?: File[];
};

export type HrClearanceRecord = {
  id: number;
  name: string;
  employeeId: number | null;
  employeeName: string;
  departmentId: number | null;
  departmentName: string;
  jobTitle: string;
  savedDate: string;
  section: string;
  sectionLabel: string;
  state: string;
  stateLabel: string;
  note: string;
  hasAttachment: boolean;
  attachmentIds: number[];
};

export type HrReportType =
  | "employee_list"
  | "department_employee"
  | "new_employee"
  | "resigned_employee"
  | "leave"
  | "sick"
  | "business_trip"
  | "discipline"
  | "transfer"
  | "order_contract"
  | "clearance"
  | "archive";

export type HrGeneratedReport = {
  id: number;
  name: string;
  reportType: HrReportType;
  reportTypeLabel: string;
  dateFrom: string;
  dateTo: string;
  generatedDate: string;
  generatedBy: string;
  departmentName: string;
  attachmentId: number | null;
  downloadUrl: string;
};

export type HrReportGenerateInput = {
  reportType: HrReportType;
  dateFrom: string;
  dateTo: string;
  departmentId?: number;
};

export type HrReportPdfPayload = {
  name: string;
  mimetype: string;
  datas: string;
};

export type HrEmployeeTransferRecord = {
  id: number;
  employeeId: number;
  employeeName: string;
  date: string;
  oldDepartmentName: string;
  newDepartmentName: string;
  oldJobName: string;
  newJobName: string;
  oldManagerName: string;
  newManagerName: string;
  note: string;
  attachmentId?: number;
  attachmentName?: string;
  attachmentUrl?: string;
};

export type HrLeaveCreateInput = {
  employeeId: number;
  leaveTypeId?: number;
  leaveTypeName?: string;
  dateFrom: string;
  dateTo: string;
  orderNumber?: string;
  note?: string;
  confirm?: boolean;
  files?: File[];
};

export type HrTimeoffRequestCreateInput = {
  employeeId: number;
  requestType: HrTimeoffRequestType;
  dateFrom: string;
  dateTo: string;
  durationDays?: number;
  reason: string;
  orderNumber?: string;
  note?: string;
  submit?: boolean;
  files?: File[];
};

export type HrDisciplineCreateInput = {
  employeeId: number;
  violationType: string;
  violationDate: string;
  actionType: string;
  explanation?: string;
  employeeExplanation?: string;
  files?: File[];
};

export type HrDisciplineUpdateInput = HrDisciplineCreateInput;

type HrLeaveAttachmentInput = {
  name: string;
  datas: string;
  mimetype: string;
};

const ADMIN_ROLES = new Set(["system_admin"]);
const HR_ROLE_KEYS = new Set(["hr_specialist", "hr_manager"]);
const HR_TEXT_TOKENS = ["хүний нөөц", "human resources", "hr specialist", "hr manager"];
const EXECUTIVE_HR_SCOPE_ROLES = new Set(["director", "general_manager"]);
const DEPARTMENT_HEAD_ROLES = new Set(["project_manager"]);
const DEPARTMENT_HEAD_TEXT_TOKENS = [
  "хэлтсийн дарга",
  "албаны дарга",
  "газрын дарга",
  "department head",
  "department manager",
];

function getRelationId(relation?: OdooRelation) {
  return Array.isArray(relation) ? relation[0] : null;
}

function getRelationName(relation?: OdooRelation, fallback = "") {
  return Array.isArray(relation) ? relation[1] : fallback;
}

function normalizeText(value: unknown) {
  return fixMojibakeText(String(value ?? "")).trim().toLocaleLowerCase("mn-MN");
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
  "dummy",
  "demo",
  "demo user",
  "sample",
  "bdbdj hdhd",
]);

function normalizeSystemAdminText(value: unknown) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function isSystemAdminEmployee(employee: HrEmployeeDirectoryItem) {
  const emailLocalPart = String(employee.workEmail || "").split("@")[0];
  return (
    SYSTEM_ADMIN_EMPLOYEE_TOKENS.has(normalizeSystemAdminText(employee.userName)) ||
    SYSTEM_ADMIN_EMPLOYEE_TOKENS.has(normalizeSystemAdminText(employee.name)) ||
    SYSTEM_ADMIN_EMPLOYEE_TOKENS.has(normalizeSystemAdminText(emailLocalPart))
  );
}

function isHiddenHrEmployee(employee: HrEmployeeDirectoryItem) {
  return isSystemAdminEmployee(employee) || normalizeSystemAdminText(employee.employeeCode) === "emp2600174";
}

function excludeSystemAdminEmployees(employees: HrEmployeeDirectoryItem[]) {
  return employees.filter((employee) => !isHiddenHrEmployee(employee));
}

function resolveHrDisplayDepartmentName(employeeName: string, departmentName: string, jobTitle?: string | false | null) {
  return getHrEmployeeDepartmentDisplayName(employeeName, departmentName, jobTitle);
}

function containsHrText(value: unknown) {
  const normalized = normalizeText(value);
  return HR_TEXT_TOKENS.some((token) => normalized.includes(normalizeText(token)));
}

function containsAnyText(value: unknown, tokens: string[]) {
  const normalized = normalizeText(value);
  return tokens.some((token) => normalized.includes(normalizeText(token)));
}

function isHrRoleKey(value: unknown) {
  return HR_ROLE_KEYS.has(normalizeText(value));
}

function isDepartmentHeadRoleKey(value: unknown) {
  return DEPARTMENT_HEAD_ROLES.has(normalizeText(value));
}

function isDepartmentHeadGroupName(value: unknown) {
  const normalized = normalizeText(value);
  if (DEPARTMENT_HEAD_TEXT_TOKENS.some((token) => normalized.includes(normalizeText(token)))) {
    return true;
  }
  return (
    normalized.includes("department manager") ||
    normalized.includes("department head") ||
    normalized.includes("хэлтсийн дарга") ||
    normalized.includes("албаны дарга")
  );
}

function getConnection(session: AppSession) {
  return {
    login: session.login,
    password: session.password,
  };
}

function detectImageMimeTypeFromBase64(value: string) {
  const prefix = value.slice(0, 24);
  if (prefix.startsWith("/9j/")) return "image/jpeg";
  if (prefix.startsWith("iVBORw0KGgo")) return "image/png";
  if (prefix.startsWith("UklGR")) return "image/webp";
  if (prefix.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
}

function imageDataUrlFromBase64(value?: string | false) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "false") return "";
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:${detectImageMimeTypeFromBase64(trimmed)};base64,${trimmed}`;
}

function normalizeEmployeeStatusLabel(statusKey?: string, statusLabel?: string, active?: boolean, trialEndDate?: string) {
  const key = (statusKey || (active === false ? "archived" : "active")).trim();
  const label = (statusLabel || "").trim();
  if (active === false || ["archived", "terminated"].includes(key) || label === "Архивласан" || label === "Чөлөөлөгдсөн") {
    return "Ажлаас чөлөөлсөн";
  }
  return getTrialAwareStatusLabel(key, label || "Идэвхтэй", trialEndDate);
}

function normalizeEmployeeTrialStatus(employee: HrEmployeeDirectoryItem): HrEmployeeDirectoryItem {
  const trialEndDate = employee.trialEndDate || getManagedNoteValue(employee.notes || employee.biography, "Туршилтын хугацаа дуусах");
  if (!trialEndDate && employee.statusKey !== "probation") {
    return employee;
  }
  const statusKey = employee.statusKey === "active" && trialEndDate ? "probation" : employee.statusKey;
  return {
    ...employee,
    statusKey,
    trialEndDate,
    statusLabel: normalizeEmployeeStatusLabel(statusKey, employee.statusLabel, employee.active, trialEndDate),
  };
}

function mapHrEmployeeDirectoryApiRecord(record: HrEmployeeDirectoryApiRecord): HrEmployeeDirectoryItem {
  const departmentName = record.departmentName || "Хэлтэсгүй";
  const jobTitle = getHrJobTitleDisplayName(record.name || "", record.jobTitle);
  const statusKey = record.statusKey || (record.active === false ? "archived" : "active");
  const trialEndDate = record.trialEndDate || "";
  return {
    id: record.id,
    name: record.name || `Ажилтан #${record.id}`,
    active: record.active !== false,
    departmentId: record.departmentId ?? null,
    departmentName: resolveHrDisplayDepartmentName(record.name || "", departmentName, jobTitle),
    jobId: record.jobId ?? null,
    jobTitle,
    workPhone: record.workPhone || "",
    mobilePhone: record.mobilePhone || "",
    workEmail: record.workEmail || "",
    userId: record.userId ?? null,
    userName: record.userName || "",
    photoUrl: record.photoUrl || imageDataUrlFromBase64(record.photo),
    employeeCode: record.employeeCode || `EMP-${String(record.id).padStart(5, "0")}`,
    gradeRank: record.gradeRank || "",
    workType: record.workType || "",
    statusKey,
    statusLabel: normalizeEmployeeStatusLabel(statusKey, record.statusLabel, record.active, trialEndDate),
    managerId: record.managerId ?? null,
    managerName: getHrManagerDisplayName(jobTitle, record.managerName || ""),
    startDate: record.startDate || "",
    contractEndDate: record.contractEndDate || "",
    trialEndDate,
    birthDate: record.birthDate || "",
    genderKey: record.genderKey || "",
    genderLabel: record.genderLabel || "",
    educationLevel: record.educationLevel || "",
    educationRecords: resolveEducationRecords(undefined, record.educationLevel),
    documentRecords: resolveDocumentRecords(undefined),
    missingDocumentCount: Number(record.missingDocumentCount || 0),
    kpiScore: Number(record.kpiScore || 0),
    taskCompletionPercent: Number(record.taskCompletionPercent || 0),
    disciplineScore: Number(record.disciplineScore || 0),
  };
}

function resolveDirectEmployeeStatus(record: HrEmployeeSingleSearchRecord) {
  const key = record.x_mn_employment_status || (record.active === false ? "archived" : "active");
  const labels: Record<string, string> = {
    active: "Идэвхтэй",
    probation: "Туршилт",
    leave: "Чөлөөтэй",
    annual_leave: "Ээлжийн амралттай",
    sick: "Өвчтэй",
    business_trip: "Томилолттой",
    suspended: "Түдгэлзсэн",
    terminated: "Ажлаас чөлөөлсөн",
    resigned: "Ажлаас гарсан",
    archived: "Ажлаас чөлөөлсөн",
    rehired: "Дахин авсан",
  };

  return { key, label: labels[key] ?? "Идэвхтэй" };
}

function resolveDirectEmployeeGenderLabel(value?: string | false) {
  const labels: Record<string, string> = {
    male: "Эрэгтэй",
    female: "Эмэгтэй",
    other: "Бусад",
  };
  return value ? (labels[value] ?? value) : "";
}

function cleanOdooLongText(value?: string | false) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function cleanOdooText(value?: string | false | null) {
  return typeof value === "string" ? value.trim() : "";
}

function mergeEmployeeManagedNotes(baseNotes: string, managedParts: Array<[string, string]>) {
  if (!managedParts.length) {
    return baseNotes.trim();
  }
  const labels = new Set(managedParts.map(([label]) => label));
  const unmanagedLines = baseNotes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !Array.from(labels).some((label) => line.startsWith(`${label}:`)));
  const managedLines = managedParts
    .map(([label, value]) => [label, value.trim()] as const)
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`);
  return [...unmanagedLines, ...managedLines].join("\n").trim();
}

function getManagedNoteValue(notes: string | undefined, label: string) {
  const prefix = `${label}:`;
  return String(notes || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length)
    .trim() || "";
}

const EDUCATION_RECORDS_NOTE_LABEL = "Боловсролын мөрүүд";
const DOCUMENT_RECORDS_NOTE_LABEL = "Баримт бичгийн мөрүүд";

function normalizeEducationRecords(records: HrEmployeeEducationRecord[]) {
  return records
    .map((record, index) => ({
      id: String(record.id || `education-${index + 1}`),
      level: cleanOdooText(record.level),
      field: cleanOdooText(record.field),
      school: cleanOdooText(record.school),
    }))
    .filter((record) => record.level || record.field || record.school);
}

function parseEducationRecordsFromNotes(notes: string | undefined) {
  const rawValue = getManagedNoteValue(notes, EDUCATION_RECORDS_NOTE_LABEL);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return normalizeEducationRecords(
      parsed.map((item, index) => {
        const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          id: String(record.id || `education-${index + 1}`),
          level: String(record.level ?? ""),
          field: String(record.field ?? ""),
          school: String(record.school ?? ""),
        };
      }),
    );
  } catch (error) {
    console.warn("HR education records note could not be parsed:", error);
    return [];
  }
}

function resolveEducationRecords(notes: string | undefined, level?: string | false, field?: string | false, school?: string | false) {
  const noteRecords = parseEducationRecordsFromNotes(notes);
  if (noteRecords.length) {
    return noteRecords;
  }

  return normalizeEducationRecords([
    {
      id: "education-1",
      level: cleanOdooText(level),
      field: cleanOdooText(field),
      school: cleanOdooText(school),
    },
  ]);
}

function serializeEducationRecordsForNote(records: HrEmployeeEducationRecord[]) {
  const normalizedRecords = normalizeEducationRecords(records);
  return normalizedRecords.length ? JSON.stringify(normalizedRecords) : "";
}

function normalizeDocumentRecords(records: HrEmployeeDocumentRecord[]) {
  return records
    .map((record, index) => ({
      id: String(record.id || `document-${index + 1}`),
      name: cleanOdooText(record.name),
      type: cleanOdooText(record.type),
      status: cleanOdooText(record.status),
      date: cleanOdooText(record.date),
      attachmentIds: Array.isArray(record.attachmentIds)
        ? record.attachmentIds.filter((attachmentId) => Number.isFinite(attachmentId) && attachmentId > 0)
        : [],
    }))
    .filter((record) => record.name || record.type || record.date || record.attachmentIds.length)
    .map((record) => ({
      ...record,
      status: record.status || "Бүртгэлтэй",
    }));
}

function parseDocumentRecordsFromNotes(notes: string | undefined) {
  const rawValue = getManagedNoteValue(notes, DOCUMENT_RECORDS_NOTE_LABEL);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return normalizeDocumentRecords(
      parsed.map((item, index) => {
        const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          id: String(record.id || `document-${index + 1}`),
          name: String(record.name ?? ""),
          type: String(record.type ?? ""),
          status: String(record.status ?? ""),
          date: String(record.date ?? ""),
          attachmentIds: Array.isArray(record.attachmentIds)
            ? record.attachmentIds.map(Number).filter((attachmentId) => Number.isFinite(attachmentId) && attachmentId > 0)
            : [],
        };
      }),
    );
  } catch (error) {
    console.warn("HR document records note could not be parsed:", error);
    return [];
  }
}

function resolveDocumentRecords(notes: string | undefined, fallbackRecords: HrEmployeeDocumentRecord[] = []) {
  const noteRecords = parseDocumentRecordsFromNotes(notes);
  if (noteRecords.length) {
    return noteRecords;
  }
  return normalizeDocumentRecords(fallbackRecords);
}

function serializeDocumentRecordsForNote(records: HrEmployeeDocumentRecord[]) {
  const normalizedRecords = normalizeDocumentRecords(records);
  return normalizedRecords.length ? JSON.stringify(normalizedRecords) : "";
}

function countMissingDocumentRecords(records: HrEmployeeDocumentRecord[]) {
  return normalizeDocumentRecords(records).filter((record) => normalizeText(record.status) === "дутуу").length;
}

function numberFromManagedNote(value: string) {
  const amount = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

// hr.employee.certificate / marital нь selection талбар (англи түлхүүртэй). Монгол
// шошгыг Odoo-ийн түлхүүр рүү буулгаж, буруу утга (KeyError) бичихээс сэргийлнэ.
const CERTIFICATE_KEY_BY_LABEL: Record<string, string> = {
  бакалавр: "bachelor",
  магистр: "master",
  доктор: "doctor",
  "доктор (ph.d)": "doctor",
  дэд: "doctor",
  "бүрэн дунд": "graduate",
  дунд: "graduate",
  "дунд боловсрол": "graduate",
  "бүрэн бус дунд": "graduate",
  "тусгай дунд": "graduate",
  "дипломын дээд": "graduate",
  "техник мэргэжлийн": "graduate",
  дээд: "bachelor",
  graduate: "graduate",
  bachelor: "bachelor",
  master: "master",
  doctor: "doctor",
  other: "other",
};
const CERTIFICATE_LABEL_BY_KEY: Record<string, string> = {
  graduate: "Дунд",
  bachelor: "Бакалавр",
  master: "Магистр",
  doctor: "Доктор",
  other: "Бусад",
};
function toCertificateKey(value?: string | false): string | false {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  return CERTIFICATE_KEY_BY_LABEL[raw.toLowerCase()] ?? "other";
}
function certificateLabelFromKey(value?: string | false): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return CERTIFICATE_LABEL_BY_KEY[raw.toLowerCase()] ?? raw;
}

const MARITAL_KEY_BY_LABEL: Record<string, string> = {
  "ганц бие": "single",
  гэрлээгүй: "single",
  гэрлэсэн: "married",
  "гэр бүлтэй": "married",
  "хамтран амьдрагч": "cohabitant",
  бэлэвсэн: "widower",
  бэлэвсэрсэн: "widower",
  салсан: "divorced",
  цуцалсан: "divorced",
  "гэр бүл цуцалсан": "divorced",
  single: "single",
  married: "married",
  cohabitant: "cohabitant",
  widower: "widower",
  divorced: "divorced",
};
function toMaritalKey(value?: string | false): string | false {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  return MARITAL_KEY_BY_LABEL[raw.toLowerCase()] ?? false;
}

function getUlaanbaatarDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isTrialEndDateExpired(trialEndDate?: string) {
  return Boolean(trialEndDate && /^\d{4}-\d{2}-\d{2}$/.test(trialEndDate) && trialEndDate <= getUlaanbaatarDateKey());
}

function getTrialAwareStatusLabel(statusKey: string, statusLabel: string, trialEndDate?: string) {
  if (statusKey === "probation") {
    return isTrialEndDateExpired(trialEndDate) ? "Туршилт дууссан" : "Туршилт";
  }
  return statusLabel;
}

function joinAddressParts(...parts: Array<string | false | undefined>) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function resolveMaritalStatusLabel(value?: string | false) {
  const labels: Record<string, string> = {
    single: "Ганц бие",
    married: "Гэрлэсэн",
    cohabitant: "Хамтран амьдрагчтай",
    widower: "Бэлэвсэн",
    divorced: "Салсан",
  };
  return value ? (labels[value] ?? value) : "";
}

const HR_FAMILY_RELATION_LABELS = {
  spouse: "Эхнэр / нөхөр",
  child: "Хүүхэд",
  father: "Аав",
  mother: "Ээж",
  parent: "Эцэг / эх",
  sibling: "Ах / эгч / дүү",
  other: "Бусад",
} as const;

type HrFamilyRelation = keyof typeof HR_FAMILY_RELATION_LABELS;

function normalizeFamilyRelation(value?: string | false): HrFamilyRelation {
  return value && value in HR_FAMILY_RELATION_LABELS ? (value as HrFamilyRelation) : "other";
}

function mapHrEmployeeFamilyMemberRecord(
  record: HrEmployeeFamilyMemberSearchRecord,
  employeesById: Map<number, HrEmployeeDirectoryItem>,
): HrEmployeeFamilyMember {
  const employeeId = getRelationId(record.employee_id) || 0;
  const relatedEmployeeId = getRelationId(record.related_employee_id) || 0;
  const relatedEmployee = employeesById.get(relatedEmployeeId);
  const relation = normalizeFamilyRelation(record.relation);
  const directName = cleanOdooText(record.name);

  return {
    id: record.id,
    employeeId,
    relatedEmployeeId,
    relatedEmployeeName: directName || relatedEmployee?.name || getRelationName(record.related_employee_id, "Бүртгээгүй"),
    relation,
    relationLabel: HR_FAMILY_RELATION_LABELS[relation],
    birthYear: cleanOdooText(record.birth_year),
    school: cleanOdooText(record.school),
    phone: cleanOdooText(record.phone),
    departmentName: relatedEmployee?.departmentName || "",
    jobTitle: relatedEmployee?.jobTitle || "",
    note: cleanOdooLongText(record.note),
  };
}

function mapHrFamilyMemberEmployeeRecord(record: HrEmployeeFamilyMemberEmployeeRecord): HrEmployeeDirectoryItem {
  const departmentName = getRelationName(record.department_id, "Хэлтэсгүй");
  const jobTitle = getHrJobTitleDisplayName(record.name || "", getRelationName(record.job_id) || record.job_title);

  return {
    id: record.id,
    name: cleanOdooText(record.name) || "Нэргүй",
    active: true,
    departmentId: getRelationId(record.department_id),
    departmentName,
    jobId: getRelationId(record.job_id),
    jobTitle,
    workEmail: "",
    workPhone: "",
    mobilePhone: "",
    userName: "",
    photoUrl: "",
    employeeCode: "",
    gradeRank: "",
    statusLabel: "Идэвхтэй",
    statusKey: "active",
    managerId: null,
    managerName: "",
    startDate: "",
    contractEndDate: "",
    birthDate: "",
    genderKey: "",
    genderLabel: "",
    educationLevel: "",
    missingDocumentCount: 0,
    kpiScore: 0,
    taskCompletionPercent: 0,
    disciplineScore: 0,
  };
}

function mapHrEmployeeSingleSearchRecord(record: HrEmployeeSingleSearchRecord): HrEmployeeDirectoryItem {
  const status = resolveDirectEmployeeStatus(record);
  const departmentName = getRelationName(record.department_id, "Хэлтэсгүй");
  const jobTitle = getHrJobTitleDisplayName(record.name || "", getRelationName(record.job_id) || record.job_title);
  const notes = cleanOdooLongText(record.additional_note ?? record.notes);
  const trialEndDate = record.trial_date_end || getManagedNoteValue(notes, "Туршилтын хугацаа дуусах");
  const workType = getManagedNoteValue(notes, "Ажиллах төрөл");
  const countryOfBirth = getManagedNoteValue(notes, "Төрсөн улс") || getRelationName(record.country_of_birth);
  const nationality = getManagedNoteValue(notes, "Иргэншил") || getRelationName(record.country_id);
  const bankName = getManagedNoteValue(notes, "Банк");
  const bankAccountNumber = getManagedNoteValue(notes, "Дансны дугаар");
  const baseSalary = getManagedNoteValue(notes, "Үндсэн цалин");
  const payCategoryFromNote = getManagedNoteValue(notes, "Цалингийн ангилал");
  const taxNumber = getManagedNoteValue(notes, "ТТД дугаар");
  const socialInsuranceStartDate = getManagedNoteValue(notes, "НД төлж эхэлсэн огноо");
  const statusKey = status.key === "active" && trialEndDate ? "probation" : status.key;

  return {
    id: record.id,
    name: record.name || `Ажилтан #${record.id}`,
    active: record.active !== false,
    departmentId: getRelationId(record.department_id),
    departmentName: resolveHrDisplayDepartmentName(record.name || "", departmentName, jobTitle),
    jobId: getRelationId(record.job_id),
    jobTitle,
    workPhone: record.work_phone || "",
    mobilePhone: record.mobile_phone || "",
    workEmail: record.work_email || "",
    userId: getRelationId(record.user_id),
    userName: getRelationName(record.user_id),
    photoUrl: imageDataUrlFromBase64(record.image_128 || record.avatar_128 || record.image_1920),
    photoLargeUrl: imageDataUrlFromBase64(record.image_1920 || record.image_128 || record.avatar_128),
    employeeCode: record.x_mn_employee_code || `EMP-${String(record.id).padStart(5, "0")}`,
    gradeRank: record.x_mn_grade_rank || "",
    workType,
    statusKey,
    statusLabel: normalizeEmployeeStatusLabel(statusKey, status.label, record.active, trialEndDate),
    managerId: getRelationId(record.parent_id),
    managerName: getHrManagerDisplayName(jobTitle, getRelationName(record.parent_id)),
    startDate: record.contract_date_start || "",
    contractEndDate: record.contract_date_end || "",
    trialEndDate,
    birthDate: record.birthday || "",
    genderKey: record.sex || "",
    genderLabel: resolveDirectEmployeeGenderLabel(record.sex),
    educationLevel: certificateLabelFromKey(record.certificate),
    educationRecords: resolveEducationRecords(notes, record.certificate, record.study_field, record.study_school),
    registerNumber: record.x_mn_registration_number || record.identification_id || "",
    privatePhone: record.private_phone || "",
    privateEmail: record.private_email || "",
    homeAddress: joinAddressParts(
      record.private_street,
      record.private_street2,
      record.private_city,
      record.private_zip,
      getRelationName(record.private_country_id),
    ),
    emergencyContact: record.emergency_contact || "",
    emergencyPhone: record.emergency_phone || "",
    placeOfBirth: record.place_of_birth || "",
    countryOfBirthId: getRelationId(record.country_of_birth),
    countryOfBirth,
    nationalityId: getRelationId(record.country_id),
    nationality,
    maritalStatus: resolveMaritalStatusLabel(record.marital),
    spouseName: record.spouse_complete_name || "",
    spouseBirthDate: record.spouse_birthdate || "",
    childrenCount: Number(record.children || 0),
    passportNumber: record.passport_id || "",
    studyField: record.study_field || "",
    studySchool: record.study_school || "",
    bankName,
    bankAccountNumber,
    bankAccount: getRelationName(record.bank_account_id) || [bankName, bankAccountNumber].filter(Boolean).join(" - "),
    baseSalary,
    workLocation: getRelationName(record.work_location_id),
    workAddress: getRelationName(record.address_id),
    workSchedule: getRelationName(record.resource_calendar_id),
    coachName: getRelationName(record.coach_id),
    contractName: getRelationName(record.contract_id),
    wage: Number(record.wage || 0) || numberFromManagedNote(baseSalary),
    payCategory: payCategoryFromNote || record.pay_category || "",
    taxNumber,
    socialInsuranceStartDate,
    departureDate: record.departure_date || "",
    departureReason: getRelationName(record.departure_reason_id),
    departureDescription: record.departure_description || "",
    biography: notes,
    notes,
    missingDocumentCount: Number(record.x_mn_missing_document_count || 0),
    documentRecords: resolveDocumentRecords(notes),
    kpiScore: Number(record.x_mn_performance_score || 0),
    taskCompletionPercent: Number(record.x_mn_task_completion_percent || 0),
    disciplineScore: Number(record.x_mn_discipline_score || 0),
  };
}

function getEmployeeDirectoryLeadershipRank(employee: HrEmployeeDirectoryItem) {
  const jobTitle = normalizeText(employee.jobTitle).replace(/\s+/g, " ");

  if (jobTitle.includes("дэд захирал") || jobTitle.includes("deputy director")) {
    return 1;
  }
  if (
    jobTitle === "захирал" ||
    jobTitle.includes("ерөнхий захирал") ||
    jobTitle.includes("гүйцэтгэх захирал") ||
    jobTitle.includes("захирал ") ||
    jobTitle.includes(" захирал") ||
    jobTitle.includes("director") ||
    jobTitle.includes("ceo")
  ) {
    return 0;
  }

  return 10;
}

function compareHrEmployeeDirectoryOrder(left: HrEmployeeDirectoryItem, right: HrEmployeeDirectoryItem) {
  const leadershipOrder = getEmployeeDirectoryLeadershipRank(left) - getEmployeeDirectoryLeadershipRank(right);
  return leadershipOrder || compareHrDepartmentThenName(left, right);
}

function sortHrEmployees(employees: HrEmployeeDirectoryItem[]) {
  return employees.sort(compareHrEmployeeDirectoryOrder);
}

async function getAvailableFields(
  model: string,
  desiredFields: string[],
  session: AppSession,
) {
  try {
    const fields = await executeOdooKw<Record<string, unknown>>(
      model,
      "fields_get",
      [desiredFields],
      { attributes: ["string", "type"] },
      getConnection(session),
    );
    return desiredFields.filter((field) => Boolean(fields[field]));
  } catch (error) {
    console.warn(`Odoo fields_get failed for ${model}:`, error);
    return desiredFields;
  }
}

function getInvalidOdooFieldName(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.match(/Invalid field '([^']+)'/)?.[1] ??
    message.match(/Unknown field '([^']+)'/)?.[1] ??
    null
  );
}

function isMissingOdooModelError(error: unknown, model: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(`Object ${model} doesn't exist`) || message.includes(`Model '${model}' does not exist`);
}

function isMissingHrCustomEmployeeApiError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("create_hr_custom_mn_employee") ||
    message.includes("update_hr_custom_mn_employee") ||
    message.includes("transfer_hr_custom_mn_employee") ||
    message.includes("terminate_hr_custom_mn_employee") ||
    message.includes("create_hr_custom_mn_discipline") ||
    message.includes("update_hr_custom_mn_discipline") ||
    message.includes("has no attribute") ||
    message.includes("not found")
  );
}

function getOdooResultId(result: unknown) {
  if (typeof result === "number") return result;
  if (result && typeof result === "object" && "id" in result) {
    const id = Number((result as { id?: unknown }).id);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }
  return 0;
}

async function searchReadFirstWithFieldFallback<T>(
  model: string,
  domain: unknown[],
  desiredFields: string[],
  session: AppSession,
  kwargs: Record<string, unknown> = {},
) {
  const fields = await getAvailableFields(model, desiredFields, session);
  const remainingFields = [...fields];

  while (remainingFields.length) {
    try {
      const records = await executeOdooKw<T[]>(
        model,
        "search_read",
        [domain],
        {
          ...kwargs,
          fields: remainingFields,
          limit: 1,
        },
        getConnection(session),
      );
      return records[0] ?? null;
    } catch (error) {
      const invalidField = getInvalidOdooFieldName(error);
      const fieldIndex = invalidField ? remainingFields.indexOf(invalidField) : -1;
      if (fieldIndex < 0 || remainingFields.length <= 1) {
        throw error;
      }
      remainingFields.splice(fieldIndex, 1);
    }
  }

  return null;
}

async function readCurrentEmployee(session: AppSession) {
  const desiredFields = [
    "name",
    "job_id",
    "job_title",
    "department_id",
    "user_id",
    "x_role_key",
    "x_hr_role",
    "role_key",
    "mfo_field_role",
    "x_field_role",
  ];
  return searchReadFirstWithFieldFallback<CurrentEmployeeRecord>(
    "hr.employee",
    [["user_id", "=", session.uid]],
    desiredFields,
    session,
    {
      context: { active_test: false },
    },
  ).catch((error) => {
      console.warn("Current employee HR access profile could not be loaded:", error);
      return null;
    });
}

async function readCurrentUser(session: AppSession) {
  const desiredFields = ["name", "login", "group_ids", "ops_user_type", "x_role_key", "x_hr_role"];
  return searchReadFirstWithFieldFallback<CurrentUserRecord>(
    "res.users",
    [["id", "=", session.uid]],
    desiredFields,
    session,
  ).catch((error) => {
      console.warn("Current user HR access profile could not be loaded:", error);
      return null;
    });
}

async function readGroupNames(groupIds: number[], session: AppSession) {
  if (!groupIds.length) {
    return [];
  }

  try {
    const groups = await executeOdooKw<OdooGroupRecord[]>(
      "res.groups",
      "read",
      [groupIds],
      { fields: ["name", "full_name"] },
      getConnection(session),
    );
    return groups.map((group) => [group.full_name, group.name].filter(Boolean).join(" "));
  } catch (error) {
    console.warn("Odoo group names could not be loaded for HR access:", error);
    return [];
  }
}

export async function getHrAccessProfile(session: AppSession) {
  if (
    session.role === "transport_inspector" ||
    (session.groupFlags?.mfoInspector && !session.groupFlags?.mfoManager && !session.groupFlags?.mfoDispatcher)
  ) {
    return {
      isHr: false,
      isDepartmentHead: false,
      canAccessHr: false,
      scope: "department" as const,
      reasons: [],
      departmentHeadReasons: [],
      employee: {
        id: null,
        name: session.name,
        jobTitle: "",
        departmentId: null,
        departmentName: "",
        fieldRole: "",
      },
      groupNames: [],
    };
  }

  const reasons: string[] = [];
  const departmentHeadReasons: string[] = [];
  const isExplicitDepartmentHead = Boolean(
    session.role === "project_manager" ||
      session.groupFlags?.municipalDepartmentHead ||
      session.groupFlags?.municipalManager ||
      session.groupFlags?.mfoManager ||
      session.groupFlags?.environmentManager ||
      session.groupFlags?.improvementManager
  );
  const isMasterOrOperationalLeader = Boolean(
    !isExplicitDepartmentHead &&
      (session.role === "senior_master" ||
        session.role === "team_leader" ||
        session.groupFlags?.municipalMaster ||
        session.groupFlags?.greenMaster ||
        session.groupFlags?.fleetRepairTeamLeader)
  );

  if (ADMIN_ROLES.has(String(session.role))) {
    reasons.push("admin");
  }
  if (HR_ROLE_KEYS.has(normalizeText(session.role))) {
    reasons.push("session HR role");
  }
  if (
    !isMasterOrOperationalLeader &&
    !isExplicitDepartmentHead &&
    (session.groupFlags?.hrUser || session.groupFlags?.hrManager || session.groupFlags?.municipalHr)
  ) {
    reasons.push("Odoo HR group flag");
  }

  const [employee, user] = await Promise.all([readCurrentEmployee(session), readCurrentUser(session)]);
  const groupNames = await readGroupNames(user?.group_ids ?? [], session);

  const jobName = getHrJobTitleDisplayName(employee?.name || session.name, getRelationName(employee?.job_id) || employee?.job_title);
  const departmentName = getRelationName(employee?.department_id);
  const roleKeys = [
    employee?.x_role_key,
    employee?.x_hr_role,
    employee?.role_key,
    user?.ops_user_type,
    user?.x_role_key,
    user?.x_hr_role,
  ];
  const sessionRole = normalizeText(session.role);

  if (containsHrText(jobName) || containsHrText(employee?.job_title)) {
    reasons.push("job title");
  }
  if (containsHrText(departmentName)) {
    reasons.push("department");
  }
  // "Хүний нөөцийн удирдлага / Хэлтсийн дарга" гэх мэт хэлтсийн даргын бүлэг
  // нь Odoo-ийн Employees аппын ангиллын нэрээрээ "Хүний нөөц" гэж эхэлдэг тул
  // бүх байгууллагын HR эрх гэж андуурахгүй — хэлтсийн даргын бүлгийг хасна.
  if (
    groupNames.some(
      (groupName) => containsHrText(groupName) && !isDepartmentHeadGroupName(groupName),
    )
  ) {
    reasons.push("HR group name");
  }
  if (
    groupNames.some((groupName) => {
      if (isDepartmentHeadGroupName(groupName)) {
        return false;
      }
      const normalized = normalizeText(groupName);
      return (
        normalized.includes("hr manager") ||
        normalized.includes("human resources manager") ||
        normalized.includes("хүний нөөцийн менежер") ||
        normalized.includes("хүний нөөцийн удирд")
      );
    })
  ) {
    reasons.push("HR manager group name");
  }
  if (roleKeys.some(isHrRoleKey)) {
    reasons.push("custom role key");
  }

  const hasExecutiveHrScope = Boolean(
    EXECUTIVE_HR_SCOPE_ROLES.has(sessionRole) ||
      session.groupFlags?.municipalDirector ||
      session.groupFlags?.fleetRepairCeo ||
      session.groupFlags?.fleetRepairGeneralManager ||
      session.groupFlags?.procurementCeo ||
      session.groupFlags?.procurementGeneralManager,
  );

  if (DEPARTMENT_HEAD_ROLES.has(String(session.role))) {
    departmentHeadReasons.push("project manager role");
  }
  if (
    session.groupFlags?.municipalDepartmentHead ||
    session.groupFlags?.municipalManager ||
    session.groupFlags?.mfoManager ||
    session.groupFlags?.environmentManager ||
    session.groupFlags?.improvementManager
  ) {
    departmentHeadReasons.push("department manager group flag");
  }
  if (
    containsAnyText(jobName, DEPARTMENT_HEAD_TEXT_TOKENS) ||
    containsAnyText(employee?.job_title, DEPARTMENT_HEAD_TEXT_TOKENS)
  ) {
    departmentHeadReasons.push("department head title");
  }
  if (groupNames.some(isDepartmentHeadGroupName) || roleKeys.some(isDepartmentHeadRoleKey)) {
    departmentHeadReasons.push("department manager group name");
  }

  const isHr = Boolean(
    ADMIN_ROLES.has(String(session.role)) ||
      HR_ROLE_KEYS.has(sessionRole) ||
      reasons.length > 0 ||
      (sessionRole !== "worker" &&
        !isMasterOrOperationalLeader &&
        !isExplicitDepartmentHead &&
        (session.groupFlags?.hrUser ||
          session.groupFlags?.hrManager ||
          session.groupFlags?.municipalHr))
  );
  const isDepartmentHead = Boolean(!isHr && !isMasterOrOperationalLeader && departmentHeadReasons.length > 0);
  const scope = (isHr || hasExecutiveHrScope ? "hr" : "department") as "hr" | "department";

  return {
    isHr,
    isDepartmentHead,
    canAccessHr: isHr || hasExecutiveHrScope || isDepartmentHead,
    scope,
    reasons,
    departmentHeadReasons,
    employee: {
      id: employee?.id ?? null,
      name: employee?.name ?? session.name,
      jobTitle: jobName || employee?.job_title || "",
      departmentId: getRelationId(employee?.department_id),
      departmentName: getHrDepartmentDisplayName(departmentName, jobName || employee?.job_title || ""),
      fieldRole: employee?.mfo_field_role || employee?.x_field_role || "",
    },
    groupNames,
  };
}

export async function canAccessHr(session: AppSession) {
  const profile = await getHrAccessProfile(session);
  return profile.canAccessHr;
}

export async function requireHrAccess(session: AppSession) {
  const profile = await getHrAccessProfile(session);
  if (!profile.canAccessHr) {
    throw new Error("HR_ACCESS_DENIED");
  }
  return profile;
}

export async function requireHrSpecialistAccess(session: AppSession) {
  const profile = await getHrAccessProfile(session);
  if (!profile.isHr) {
    throw new Error("HR_ACCESS_DENIED");
  }
  return profile;
}

export async function requireDepartmentHeadTimeoffRequestAccess(session: AppSession, requestType?: HrTimeoffRequestType) {
  const profile = await getHrAccessProfile(session);
  // Cancellation does not carry a request type. HR users must still be able to
  // cancel a request they can review; creation remains limited to annual leave.
  if (profile.isHr && (!requestType || requestType === "annual_leave")) {
    return profile;
  }
  if (profile.isHr || !profile.isDepartmentHead) {
    throw new Error("HR_TIMEOFF_REQUESTER_ONLY");
  }
  return profile;
}

function scopeEmployeesForProfile(employees: HrEmployeeDirectoryItem[], profile: Awaited<ReturnType<typeof getHrAccessProfile>>) {
  if (profile.scope === "hr") {
    return employees;
  }
  const departmentId = profile.employee.departmentId;
  const departmentName = normalizeText(getHrDepartmentDisplayName(profile.employee.departmentName));
  return employees.filter((employee) => {
    if (departmentId && employee.departmentId) {
      return employee.departmentId === departmentId;
    }
    return departmentName ? normalizeText(getHrDepartmentDisplayName(employee.departmentName)) === departmentName : employee.id === profile.employee.id;
  });
}

export async function getEmployees(session: AppSession) {
  const profile = await requireHrAccess(session);
  const connection = getConnection(session);
  try {
    const records = await executeOdooKw<HrEmployeeDirectoryApiRecord[]>(
      "hr.employee",
      "get_hr_custom_mn_employee_directory",
      [],
      {},
      connection,
    );
    if (Array.isArray(records) && records.length > 0) {
      const employees = sortHrEmployees(scopeEmployeesForProfile(excludeSystemAdminEmployees(records.map(mapHrEmployeeDirectoryApiRecord).map(normalizeEmployeeTrialStatus)), profile));
      return applyCurrentTimeoffStatus(employees);
    }
  } catch (error) {
    console.warn("HR custom employee directory API unavailable, falling back to service account search_read:", error);
  }

  try {
    const employees = await loadHrEmployeeDirectory();
    if (employees.length > 0) {
      const scopedEmployees = sortHrEmployees(scopeEmployeesForProfile(excludeSystemAdminEmployees(employees.map(normalizeEmployeeTrialStatus)), profile));
      return applyCurrentTimeoffStatus(scopedEmployees);
    }
  } catch (error) {
    console.warn("HR service account employee directory could not be loaded, falling back to session search_read:", error);
  }

  const employees = await loadHrEmployeeDirectory(connection);
  const scopedEmployees = sortHrEmployees(scopeEmployeesForProfile(excludeSystemAdminEmployees(employees.map(normalizeEmployeeTrialStatus)), profile));
  return applyCurrentTimeoffStatus(scopedEmployees);
}

export async function getEmployeeFamilyMembers(
  session: AppSession,
  employeeId: number,
  employeeDirectory?: HrEmployeeDirectoryItem[],
): Promise<HrEmployeeFamilyMember[]> {
  const fields = await getAvailableFields(
    "hr.custom.mn.employee.family.member",
    ["employee_id", "related_employee_id", "name", "birth_year", "school", "phone", "relation", "note"],
    session,
  );

  try {
    const records = await executeOdooKw<HrEmployeeFamilyMemberSearchRecord[]>(
      "hr.custom.mn.employee.family.member",
      "search_read",
      [[["employee_id", "=", employeeId], ["active", "=", true]]],
      {
        fields,
        order: "relation asc, id asc",
      },
      getConnection(session),
    );

    const relatedEmployeeIds = records
      .map((record) => getRelationId(record.related_employee_id))
      .filter((id): id is number => Boolean(id));
    const employeesById = employeeDirectory
      ? new Map(employeeDirectory.map((employee) => [employee.id, employee]))
      : await getFamilyMemberEmployeeMap(session, relatedEmployeeIds);
    return records.map((record) => mapHrEmployeeFamilyMemberRecord(record, employeesById));
  } catch (error) {
    console.warn("HR employee family members could not be loaded:", error);
    return [];
  }
}

async function getFamilyMemberEmployeeMap(session: AppSession, ids: number[]) {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
  if (!uniqueIds.length) {
    return new Map<number, HrEmployeeDirectoryItem>();
  }

  const fields = await getAvailableFields("hr.employee", ["name", "department_id", "job_id", "job_title"], session);
  const records = await executeOdooKw<HrEmployeeFamilyMemberEmployeeRecord[]>(
    "hr.employee",
    "search_read",
    [[["id", "in", uniqueIds]]],
    {
      fields,
      limit: uniqueIds.length,
      context: { active_test: false },
    },
    getConnection(session),
  );

  return new Map(records.map((record) => [record.id, mapHrFamilyMemberEmployeeRecord(record)]));
}

function mapHrEmployeeEmergencyContactRecord(record: HrEmployeeEmergencyContactSearchRecord): HrEmployeeEmergencyContact {
  return {
    id: record.id,
    employeeId: getRelationId(record.employee_id) || 0,
    name: record.name || "",
    relation: record.relation || "",
    phone: record.phone || "",
    address: record.address || "",
    note: cleanOdooLongText(record.note),
  };
}

function mapHrEmployeeRewardRecord(record: HrEmployeeRewardSearchRecord): HrEmployeeReward {
  return {
    id: record.id,
    employeeId: getRelationId(record.employee_id) || 0,
    date: record.date || "",
    name: record.name || "",
    orderNo: record.order_no || "",
    note: cleanOdooLongText(record.note),
  };
}

function mapHrEmployeeTalentSkillRecord(record: HrEmployeeTalentSkillSearchRecord): HrEmployeeTalentSkill {
  return {
    id: record.id,
    employeeId: getRelationId(record.employee_id) || 0,
    name: record.name || "",
    type: record.skill_type || "",
    level: record.level || "",
    acquiredDate: record.acquired_date || "",
    note: cleanOdooLongText(record.note),
  };
}

export async function getEmployeeEmergencyContacts(
  session: AppSession,
  employeeId: number,
): Promise<HrEmployeeEmergencyContact[]> {
  try {
    const records = await executeOdooKw<HrEmployeeEmergencyContactSearchRecord[]>(
      "hr.custom.mn.employee.emergency.contact",
      "search_read",
      [[["employee_id", "=", employeeId], ["active", "=", true]]],
      {
        fields: ["employee_id", "name", "relation", "phone", "address", "note"],
        order: "sequence asc, id asc",
      },
      getConnection(session),
    );

    return records.map(mapHrEmployeeEmergencyContactRecord);
  } catch (error) {
    console.warn("HR employee emergency contacts could not be loaded:", error);
    return [];
  }
}

export async function getEmployeeRewards(session: AppSession, employeeId: number): Promise<HrEmployeeReward[]> {
  try {
    const records = await executeOdooKw<HrEmployeeRewardSearchRecord[]>(
      "hr.custom.mn.reward",
      "search_read",
      [[["employee_id", "=", employeeId]]],
      {
        fields: ["employee_id", "date", "name", "order_no", "note"],
        order: "date desc, id desc",
      },
      getConnection(session),
    );

    return records.map(mapHrEmployeeRewardRecord);
  } catch (error) {
    console.warn("HR employee rewards could not be loaded:", error);
    return [];
  }
}

export async function getEmployeeTalentSkills(session: AppSession, employeeId: number): Promise<HrEmployeeTalentSkill[]> {
  try {
    const records = await executeOdooKw<HrEmployeeTalentSkillSearchRecord[]>(
      "hr.custom.mn.employee.talent.skill",
      "search_read",
      [[["employee_id", "=", employeeId], ["active", "=", true]]],
      {
        fields: ["employee_id", "name", "skill_type", "level", "acquired_date", "note"],
        order: "sequence asc, id asc",
      },
      getConnection(session),
    );

    return records.map(mapHrEmployeeTalentSkillRecord);
  } catch (error) {
    console.warn("HR employee talent skills could not be loaded:", error);
    return [];
  }
}

async function getEmployeeEducationAttachmentIds(session: AppSession, employeeId: number) {
  const fields = await getAvailableFields("ir.attachment", ["name", "mimetype", "x_mn_document_type"], session);
  const records = await executeOdooKw<HrAttachmentSearchRecord[]>(
    "ir.attachment",
    "search_read",
    [[["res_model", "=", "hr.employee"], ["res_id", "=", employeeId]]],
    { fields, order: "id desc", limit: 50 },
    getConnection(session),
  ).catch((error) => {
    console.warn("HR education attachments could not be loaded:", error);
    return [];
  });
  return records
    .filter((attachment) => {
      const name = normalizeText(attachment.name);
      return (
        attachment.x_mn_document_type === "diploma" ||
        name.includes("боловсрол") ||
        name.includes("диплом") ||
        name.includes("diploma") ||
        name.includes("education")
      );
    })
    .map((attachment) => attachment.id);
}

export async function getEmployee(session: AppSession, id: number, listedEmployees?: HrEmployeeDirectoryItem[]) {
  const employees = listedEmployees ?? (await getEmployees(session));
  const listedEmployee = employees.find((employee) => employee.id === id);
  const profile = await requireHrAccess(session);
  const desiredFields = [
    "name",
    "active",
    "department_id",
    "job_id",
    "job_title",
    "mobile_phone",
    "work_email",
    "user_id",
    "image_128",
    "avatar_128",
    "image_1920",
    "parent_id",
    "contract_date_start",
    "contract_date_end",
    "trial_date_end",
    "birthday",
    "sex",
    "certificate",
    "identification_id",
    "x_mn_registration_number",
    "private_phone",
    "private_email",
    "private_street",
    "private_street2",
    "private_city",
    "private_zip",
    "private_country_id",
    "emergency_contact",
    "emergency_phone",
    "place_of_birth",
    "country_of_birth",
    "country_id",
    "marital",
    "spouse_complete_name",
    "spouse_birthdate",
    "children",
    "passport_id",
    "study_field",
    "study_school",
    "bank_account_id",
    "work_location_id",
    "address_id",
    "resource_calendar_id",
    "coach_id",
    "contract_id",
    "wage",
    "pay_category",
    "departure_date",
    "departure_reason_id",
    "departure_description",
    "additional_note",
    "x_mn_employee_code",
    "x_mn_grade_rank",
    "x_mn_employment_status",
    "x_mn_missing_document_count",
    "x_mn_performance_score",
    "x_mn_task_completion_percent",
    "x_mn_discipline_score",
  ];
  const fields = await getAvailableFields("hr.employee", desiredFields, session);

  const records = await executeOdooKw<HrEmployeeSingleSearchRecord[]>(
    "hr.employee",
    "search_read",
    [[["id", "=", id]]],
    {
      fields,
      limit: 1,
      context: { active_test: false },
    },
    getConnection(session),
  ).catch((error) => {
    console.warn(`HR employee ${id} could not be loaded directly:`, error);
    return [];
  });
  const employee = records[0] ? mapHrEmployeeSingleSearchRecord(records[0]) : null;
  const [familyMembers, emergencyContacts, rewards, talentSkills, educationAttachmentIds] = await Promise.all([
    getEmployeeFamilyMembers(session, id, employees),
    getEmployeeEmergencyContacts(session, id),
    getEmployeeRewards(session, id),
    getEmployeeTalentSkills(session, id),
    getEmployeeEducationAttachmentIds(session, id),
  ]);
  if (!employee) {
    return listedEmployee ? { ...listedEmployee, familyMembers, emergencyContacts, rewards, talentSkills, educationAttachmentIds } : null;
  }

  const scopedEmployee = scopeEmployeesForProfile([employee], profile)[0];
  if (!scopedEmployee) {
    return listedEmployee ? { ...listedEmployee, familyMembers, emergencyContacts, rewards, talentSkills, educationAttachmentIds } : null;
  }

  const mergedEmployee = listedEmployee
    ? {
        ...scopedEmployee,
        ...listedEmployee,
        birthDate: scopedEmployee.birthDate || listedEmployee.birthDate,
        genderKey: scopedEmployee.genderKey || listedEmployee.genderKey,
        genderLabel: scopedEmployee.genderLabel || listedEmployee.genderLabel,
        departmentId: scopedEmployee.departmentId ?? listedEmployee.departmentId,
        jobId: scopedEmployee.jobId ?? listedEmployee.jobId,
        managerId: scopedEmployee.managerId ?? listedEmployee.managerId,
        photoUrl: scopedEmployee.photoUrl || listedEmployee.photoUrl,
        familyMembers,
        emergencyContacts,
        rewards,
        talentSkills,
        educationAttachmentIds,
      }
    : { ...scopedEmployee, familyMembers, emergencyContacts, rewards, talentSkills, educationAttachmentIds };

  return {
    ...mergedEmployee,
    departmentName: resolveHrDisplayDepartmentName(
      mergedEmployee.name,
      mergedEmployee.departmentName,
      mergedEmployee.jobTitle,
    ),
  };
}

export async function createEmployeeFamilyMember(
  session: AppSession,
  employeeId: number,
  input: {
    relatedEmployeeId?: number | null;
    name?: string;
    birthYear?: string;
    school?: string;
    phone?: string;
    relation: string;
  },
): Promise<HrEmployeeFamilyMember> {
  await requireHrSpecialistAccess(session);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    throw new Error("HR_FAMILY_MEMBER_EMPLOYEE_REQUIRED");
  }
  const relatedEmployeeId =
    input.relatedEmployeeId && Number.isFinite(input.relatedEmployeeId) && input.relatedEmployeeId > 0
      ? input.relatedEmployeeId
      : null;
  const name = input.name?.trim() || "";
  if (!relatedEmployeeId && !name) {
    throw new Error("HR_FAMILY_MEMBER_NAME_REQUIRED");
  }
  if (relatedEmployeeId && employeeId === relatedEmployeeId) {
    throw new Error("HR_FAMILY_MEMBER_SELF_NOT_ALLOWED");
  }

  const employeesById = await getFamilyMemberEmployeeMap(
    session,
    relatedEmployeeId ? [employeeId, relatedEmployeeId] : [employeeId],
  );
  const employee = employeesById.get(employeeId);
  const relatedEmployee = relatedEmployeeId ? employeesById.get(relatedEmployeeId) : null;
  if (!employee || (relatedEmployeeId && !relatedEmployee)) {
    throw new Error("HR_FAMILY_MEMBER_RELATED_NOT_FOUND");
  }

  const relation = normalizeFamilyRelation(input.relation);
  const birthYear = input.birthYear?.trim() || "";
  const school = input.school?.trim() || "";
  const phone = input.phone?.trim() || "";
  const availableFields = new Set(
    await getAvailableFields(
      "hr.custom.mn.employee.family.member",
      ["employee_id", "related_employee_id", "name", "birth_year", "school", "phone", "relation", "note"],
      session,
    ),
  );
  const fallbackNote = [
    !availableFields.has("birth_year") && birthYear ? `Төрсөн он: ${birthYear}` : "",
    !availableFields.has("school") && school ? `Сургууль: ${school}` : "",
    !availableFields.has("phone") && phone ? `Утас: ${phone}` : "",
  ].filter(Boolean).join("\n");
  const values: Record<string, unknown> = {
    employee_id: employeeId,
    relation,
    note: fallbackNote || false,
  };
  if (availableFields.has("related_employee_id")) values.related_employee_id = relatedEmployeeId || false;
  if (availableFields.has("name")) values.name = name || relatedEmployee?.name || false;
  if (availableFields.has("birth_year")) values.birth_year = birthYear || false;
  if (availableFields.has("school")) values.school = school || false;
  if (availableFields.has("phone")) values.phone = phone || false;

  try {
    const createdId = await executeOdooKw<number>(
      "hr.custom.mn.employee.family.member",
      "create",
      [values],
      {},
      getConnection(session),
    );

    return {
      id: createdId,
      employeeId,
      relatedEmployeeId: relatedEmployee?.id || 0,
      relatedEmployeeName: name || relatedEmployee?.name || "",
      relation,
      relationLabel: HR_FAMILY_RELATION_LABELS[relation],
      birthYear,
      school,
      phone,
      departmentName: relatedEmployee?.departmentName || "",
      jobTitle: relatedEmployee?.jobTitle || "",
      note: "",
    };
  } catch (error) {
    const message = error instanceof Error ? normalizeText(error.message) : "";
    if (message.includes("unique") || message.includes("already") || message.includes("аль хэдийн")) {
      throw new Error("HR_FAMILY_MEMBER_DUPLICATE");
    }
    throw error;
  }
}

async function ensureEmployeeFamilyMember(
  session: AppSession,
  employeeId: number,
  memberId: number,
) {
  if (!Number.isFinite(employeeId) || employeeId <= 0 || !Number.isFinite(memberId) || memberId <= 0) {
    throw new Error("HR_FAMILY_MEMBER_NOT_FOUND");
  }

  const records = await executeOdooKw<Array<{ id: number; employee_id?: OdooRelation }>>(
    "hr.custom.mn.employee.family.member",
    "search_read",
    [[["id", "=", memberId]]],
    {
      fields: ["employee_id"],
      limit: 1,
      context: { active_test: false },
    },
    getConnection(session),
  );
  const record = records[0];
  if (!record || getRelationId(record.employee_id) !== employeeId) {
    throw new Error("HR_FAMILY_MEMBER_NOT_FOUND");
  }
  return record;
}

export async function updateEmployeeFamilyMember(
  session: AppSession,
  employeeId: number,
  memberId: number,
  input: {
    name?: string;
    birthYear?: string;
    school?: string;
    phone?: string;
    relation: string;
  },
): Promise<HrEmployeeFamilyMember> {
  await requireHrSpecialistAccess(session);
  await ensureEmployeeFamilyMember(session, employeeId, memberId);
  const name = input.name?.trim() || "";
  if (!name) {
    throw new Error("HR_FAMILY_MEMBER_NAME_REQUIRED");
  }

  const relation = normalizeFamilyRelation(input.relation);
  const birthYear = input.birthYear?.trim() || "";
  const school = input.school?.trim() || "";
  const phone = input.phone?.trim() || "";
  const availableFields = new Set(
    await getAvailableFields(
      "hr.custom.mn.employee.family.member",
      ["name", "birth_year", "school", "phone", "relation", "note"],
      session,
    ),
  );
  const fallbackNote = [
    !availableFields.has("birth_year") && birthYear ? `Төрсөн он: ${birthYear}` : "",
    !availableFields.has("school") && school ? `Сургууль: ${school}` : "",
    !availableFields.has("phone") && phone ? `Утас: ${phone}` : "",
  ].filter(Boolean).join("\n");
  const values: Record<string, unknown> = {
    relation,
    note: fallbackNote || false,
  };
  if (availableFields.has("name")) values.name = name;
  if (availableFields.has("birth_year")) values.birth_year = birthYear || false;
  if (availableFields.has("school")) values.school = school || false;
  if (availableFields.has("phone")) values.phone = phone || false;

  try {
    const updated = await executeOdooKw<boolean>(
      "hr.custom.mn.employee.family.member",
      "write",
      [[memberId], values],
      {},
      getConnection(session),
    );
    if (!updated) {
      throw new Error("HR_FAMILY_MEMBER_NOT_FOUND");
    }

    const familyMembers = await getEmployeeFamilyMembers(session, employeeId);
    return (
      familyMembers.find((member) => member.id === memberId) || {
        id: memberId,
        employeeId,
        relatedEmployeeId: 0,
        relatedEmployeeName: name,
        relation,
        relationLabel: HR_FAMILY_RELATION_LABELS[relation],
        birthYear,
        school,
        phone,
        departmentName: "",
        jobTitle: "",
        note: "",
      }
    );
  } catch (error) {
    const message = error instanceof Error ? normalizeText(error.message) : "";
    if (message.includes("unique") || message.includes("already") || message.includes("аль хэдийн")) {
      throw new Error("HR_FAMILY_MEMBER_DUPLICATE");
    }
    throw error;
  }
}

export async function deleteEmployeeFamilyMember(
  session: AppSession,
  employeeId: number,
  memberId: number,
) {
  await requireHrSpecialistAccess(session);
  await ensureEmployeeFamilyMember(session, employeeId, memberId);
  const availableFields = new Set(
    await getAvailableFields("hr.custom.mn.employee.family.member", ["active"], session),
  );
  const deleted = availableFields.has("active")
    ? await executeOdooKw<boolean>(
        "hr.custom.mn.employee.family.member",
        "write",
        [[memberId], { active: false }],
        {},
        getConnection(session),
      )
    : await executeOdooKw<boolean>(
        "hr.custom.mn.employee.family.member",
        "unlink",
        [[memberId]],
        {},
        getConnection(session),
      );

  if (!deleted) {
    throw new Error("HR_FAMILY_MEMBER_NOT_FOUND");
  }
  return { id: memberId, deleted: true };
}

export async function createEmployeeEmergencyContact(
  session: AppSession,
  employeeId: number,
  input: {
    name: string;
    relation?: string;
    phone: string;
    address?: string;
    note?: string;
  },
): Promise<HrEmployeeEmergencyContact> {
  await requireHrSpecialistAccess(session);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    throw new Error("HR_EMPLOYEE_REQUIRED");
  }
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name) {
    throw new Error("HR_EMERGENCY_CONTACT_NAME_REQUIRED");
  }
  if (!phone) {
    throw new Error("HR_EMERGENCY_CONTACT_PHONE_REQUIRED");
  }

  const emergencyContactModel = "hr.custom.mn.employee.emergency.contact";
  const values = {
    employee_id: employeeId,
    name,
    relation: input.relation?.trim() || false,
    phone,
    address: input.address?.trim() || false,
    note: input.note?.trim() || false,
  };

  let createdId: number | null = null;
  try {
    createdId = await executeOdooKw<number>(
      emergencyContactModel,
      "create",
      [values],
      {},
      getConnection(session),
    );
  } catch (error) {
    if (!isMissingOdooModelError(error, emergencyContactModel)) {
      throw error;
    }

    const employeeFields = await getAvailableFields("hr.employee", ["emergency_contact", "emergency_phone"], session);
    const fallbackValues: Record<string, string> = {};
    if (employeeFields.includes("emergency_contact")) fallbackValues.emergency_contact = name;
    if (employeeFields.includes("emergency_phone")) fallbackValues.emergency_phone = phone;
    if (!Object.keys(fallbackValues).length) {
      throw error;
    }

    await executeOdooKw<boolean>("hr.employee", "write", [[employeeId], fallbackValues], {}, getConnection(session));
  }

  const contacts = await getEmployeeEmergencyContacts(session, employeeId);
  return (
    contacts.find((contact) => contact.id === createdId) || {
      id: createdId ?? employeeId,
      employeeId,
      name,
      relation: input.relation?.trim() || "",
      phone,
      address: input.address?.trim() || "",
      note: input.note?.trim() || "",
    }
  );
}

export async function createEmployeeReward(
  session: AppSession,
  employeeId: number,
  input: {
    name: string;
    date?: string;
    orderNo?: string;
    note?: string;
  },
): Promise<HrEmployeeReward> {
  await requireHrSpecialistAccess(session);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    throw new Error("HR_EMPLOYEE_REQUIRED");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("HR_REWARD_NAME_REQUIRED");
  }

  const values: Record<string, string | number | boolean> = {
    employee_id: employeeId,
    name,
    order_no: input.orderNo?.trim() || false,
    note: input.note?.trim() || false,
  };
  if (input.date?.trim()) {
    values.date = input.date.trim();
  }

  const createdId = await executeOdooKw<number>(
    "hr.custom.mn.reward",
    "create",
    [values],
    {},
    getConnection(session),
  );

  const rewards = await getEmployeeRewards(session, employeeId);
  return (
    rewards.find((reward) => reward.id === createdId) || {
      id: createdId,
      employeeId,
      date: input.date?.trim() || "",
      name,
      orderNo: input.orderNo?.trim() || "",
      note: input.note?.trim() || "",
    }
  );
}

export async function createEmployeeTalentSkill(
  session: AppSession,
  employeeId: number,
  input: {
    name: string;
    type?: string;
    level?: string;
    acquiredDate?: string;
    note?: string;
  },
): Promise<HrEmployeeTalentSkill> {
  await requireHrSpecialistAccess(session);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    throw new Error("HR_EMPLOYEE_REQUIRED");
  }
  const name = input.name.trim();
  if (!name) {
    throw new Error("HR_TALENT_SKILL_NAME_REQUIRED");
  }

  const values: Record<string, string | number | boolean> = {
    employee_id: employeeId,
    name,
    skill_type: input.type?.trim() || false,
    level: input.level?.trim() || false,
    note: input.note?.trim() || false,
  };
  if (input.acquiredDate?.trim()) {
    values.acquired_date = input.acquiredDate.trim();
  }

  const createdId = await executeOdooKw<number>(
    "hr.custom.mn.employee.talent.skill",
    "create",
    [values],
    {},
    getConnection(session),
  );

  const talentSkills = await getEmployeeTalentSkills(session, employeeId);
  return (
    talentSkills.find((skill) => skill.id === createdId) || {
      id: createdId,
      employeeId,
      name,
      type: input.type?.trim() || "",
      level: input.level?.trim() || "",
      acquiredDate: input.acquiredDate?.trim() || "",
      note: input.note?.trim() || "",
    }
  );
}

export async function getDepartments(session: AppSession): Promise<HrOption[]> {
  const loadDepartments = () =>
    executeOdooKw<OdooDictionaryRecord[]>(
      "hr.department",
      "search_read",
      [[]],
      { fields: ["name"], order: "name asc", limit: 500 },
      getConnection(session),
    );

  return loadDepartments()
    .catch(async (error) => {
      // Odoo can briefly lose its PostgreSQL connection while the database
      // container is restarting. Do not render the employee form with an
      // empty department selector for a one-off infrastructure hiccup.
      console.warn("HR departments could not be loaded; retrying once:", error);
      await new Promise((resolve) => setTimeout(resolve, 300));
      return loadDepartments();
    })
    .then((records) =>
      records
        .map((record) => ({ id: record.id, name: record.name }))
        .sort((left, right) => compareHrDepartmentNames(left.name, right.name) || left.name.localeCompare(right.name, "mn")),
    )
    .catch((error) => {
      console.warn("HR departments could not be loaded:", error);
      return [];
    });
}

export type HrDepartmentNode = {
  id: number;
  name: string;
  managerName: string | null;
  memberCount: number;
  parentId: number | null;
  children: HrDepartmentNode[];
};

type HrDepartmentStructureRecord = {
  id: number;
  name: string;
  parent_id?: OdooRelation;
  manager_id?: OdooRelation;
  member_ids?: number[];
};

/**
 * Odoo-ийн hr.department эцэг-хүү шатлалыг (parent_id) модон бүтцээр буцаана.
 * Эцэг нь олдохгүй хэлтсийг дээд түвшин гэж үзнэ (Odoo-г хөндөхгүйгээр).
 */
export async function getDepartmentStructure(session: AppSession): Promise<HrDepartmentNode[]> {
  const records = await executeOdooKw<HrDepartmentStructureRecord[]>(
    "hr.department",
    "search_read",
    [[]],
    { fields: ["name", "parent_id", "manager_id", "member_ids"], order: "name asc", limit: 500 },
    getConnection(session),
  ).catch((error) => {
    console.warn("HR department structure could not be loaded:", error);
    return [] as HrDepartmentStructureRecord[];
  });

  const nodesById = new Map<number, HrDepartmentNode>();
  for (const record of records) {
    const managerName = Array.isArray(record.manager_id)
      ? fixMojibakeText(record.manager_id[1]) || null
      : null;
    nodesById.set(record.id, {
      id: record.id,
      name: fixMojibakeText(record.name) || record.name,
      managerName,
      memberCount: Array.isArray(record.member_ids) ? record.member_ids.length : 0,
      parentId: Array.isArray(record.parent_id) ? record.parent_id[0] : null,
      children: [],
    });
  }

  const roots: HrDepartmentNode[] = [];
  for (const node of nodesById.values()) {
    const parent = node.parentId != null ? nodesById.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: HrDepartmentNode[]) => {
    list.sort(
      (left, right) =>
        right.children.length - left.children.length ||
        right.memberCount - left.memberCount ||
        left.name.localeCompare(right.name, "mn"),
    );
    for (const node of list) {
      sortNodes(node.children);
    }
  };
  sortNodes(roots);

  return roots;
}

export type HrDepartmentJobCounts = {
  departmentId: number;
  departmentName: string;
  total: number;
  jobCounts: { title: string; count: number }[];
};

type HrEmployeeJobRecord = {
  id: number;
  department_id?: OdooRelation;
  job_id?: OdooRelation;
  job_title?: string | false;
};

/**
 * Идэвхтэй ажилтнуудыг хэлтэс тус бүрт албан тушаалаар (job_id/job_title)
 * бүлэглэн тоолж буцаана. Байгууллагын бүтэц дээр албан тушаал бүрийн
 * "бодит / орон тоо"-г харьцуулахад ашиглагдана.
 */
export async function getDepartmentJobCounts(session: AppSession): Promise<HrDepartmentJobCounts[]> {
  const readJobRecords = (connectionOverrides: { login?: string; password?: string }) =>
    executeOdooKw<HrEmployeeJobRecord[]>(
      "hr.employee",
      "search_read",
      [[["active", "=", true]]],
      { fields: ["department_id", "job_id", "job_title"], limit: 2000 },
      connectionOverrides,
    ).catch((error) => {
      console.warn("HR department job counts could not be loaded:", error);
      return [] as HrEmployeeJobRecord[];
    });

  // Эхлээд хэрэглэгчийн эрхээр. Уншиж чадаагүй бол (HR үзэгч hr.employee-г
  // өөрийн эрхээр уншдаггүй) admin эрхээр дахин уншиж, байгууллагын бүтэц дээр
  // бодит ажилтны тоог бүрэн харуулна.
  let employees = await readJobRecords(getConnection(session));
  if (!employees.length) {
    employees = await readJobRecords({});
  }

  const byDepartment = new Map<number, HrDepartmentJobCounts>();
  for (const employee of employees) {
    if (!Array.isArray(employee.department_id)) continue;
    const departmentId = employee.department_id[0];
    let bucket = byDepartment.get(departmentId);
    if (!bucket) {
      bucket = {
        departmentId,
        departmentName: fixMojibakeText(employee.department_id[1]) || employee.department_id[1],
        total: 0,
        jobCounts: [],
      };
      byDepartment.set(departmentId, bucket);
    }
    const rawTitle = Array.isArray(employee.job_id)
      ? employee.job_id[1]
      : typeof employee.job_title === "string"
        ? employee.job_title
        : "";
    const title = fixMojibakeText(rawTitle).trim() || "(албан тушаалгүй)";
    bucket.total += 1;
    const existing = bucket.jobCounts.find((entry) => entry.title === title);
    if (existing) {
      existing.count += 1;
    } else {
      bucket.jobCounts.push({ title, count: 1 });
    }
  }

  return [...byDepartment.values()];
}

export type HrHeadcountTrendPoint = {
  key: string;
  label: string;
  hires: number;
  leaves: number;
};

/**
 * Сүүлийн `months` сарын шинэ томилолт (contract_date_start) болон чөлөөлөлт
 * (departure_date)-ийг сараар тоолж буцаана. Архивласан ажилтныг оруулахын
 * тулд active_test=false контекст ашиглана.
 */
export async function getHeadcountTrend(session: AppSession, months = 6): Promise<HrHeadcountTrendPoint[]> {
  const readTrend = (connectionOverrides: { login?: string; password?: string }) =>
    executeOdooKw<{ contract_date_start?: string | false; departure_date?: string | false }[]>(
      "hr.employee",
      "search_read",
      [[]],
      {
        fields: ["contract_date_start", "departure_date"],
        context: { active_test: false },
        limit: 5000,
      },
      connectionOverrides,
    ).catch((error) => {
      console.warn("HR headcount trend could not be loaded:", error);
      return [] as { contract_date_start?: string | false; departure_date?: string | false }[];
    });

  // Эхлээд хэрэглэгчийн эрхээр; уншиж чадаагүй бол (бага эрхтэй HR үзэгч
  // hr.employee-г уншдаггүй) admin эрхээр — ингэснээр "Шинэ болон чөлөөлсөн"
  // график төхөөрөмжөөс үл хамааран бодит дата харуулна.
  let records = await readTrend(getConnection(session));
  if (!records.length) {
    records = await readTrend({});
  }

  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 1;
  const points: HrHeadcountTrendPoint[] = [];
  for (let index = 0; index < months; index += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    points.unshift({ key, label: `${month}-р`, hires: 0, leaves: 0 });
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }

  const byKey = new Map(points.map((point) => [point.key, point]));
  for (const record of records) {
    const started = typeof record.contract_date_start === "string" ? record.contract_date_start.slice(0, 7) : "";
    const hirePoint = started ? byKey.get(started) : undefined;
    if (hirePoint) hirePoint.hires += 1;
    const departed = typeof record.departure_date === "string" ? record.departure_date.slice(0, 7) : "";
    const leavePoint = departed ? byKey.get(departed) : undefined;
    if (leavePoint) leavePoint.leaves += 1;
  }

  return points;
}

export type EmployeeErpEvaluation = {
  hasLogin: boolean;
  login: string;
  roleKey: string;
  lastLoginDate: string;
  isInternal: boolean;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
};

// Ажилтны нэвтрэлт (res.users) болон даалгаврын гүйцэтгэлийг service (admin)
// эрхээр татна — worker хэрэглэгч өөрөө уншиж чаддаггүйг тойрч.
export async function loadEmployeeErpEvaluation(userId?: number | null): Promise<EmployeeErpEvaluation> {
  const empty: EmployeeErpEvaluation = {
    hasLogin: false,
    login: "",
    roleKey: "",
    lastLoginDate: "",
    isInternal: false,
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
  };
  if (!userId || !Number.isFinite(userId)) return empty;
  const service = createOdooConnection();
  const [users, tasks] = await Promise.all([
    executeOdooKw<Array<{ login?: string; ops_user_type?: string | false; login_date?: string | false; share?: boolean }>>(
      "res.users",
      "search_read",
      [[["id", "=", userId]]],
      { fields: ["login", "ops_user_type", "login_date", "share"], limit: 1 },
      service,
    ).catch(() => [] as Array<{ login?: string }>),
    executeOdooKw<Array<{ id: number; name?: string; project_id?: OdooRelation; stage_id?: OdooRelation }>>(
      "project.task",
      "search_read",
      [["|", ["user_ids", "in", [userId]], ["ops_team_leader_id", "=", userId]]],
      { fields: ["name", "project_id", "stage_id"], limit: 300 },
      service,
    ).catch(() => [] as Array<{ id: number }>),
  ]);
  const user = (users as Array<{ login?: string; ops_user_type?: string | false; login_date?: string | false; share?: boolean }>)[0];
  const realTasks = (tasks as Array<{ id: number; name?: string; project_id?: OdooRelation; stage_id?: OdooRelation }>).filter(
    (task) => Array.isArray(task.project_id) && !(task.name || "").trim().toLowerCase().startsWith("welcome"),
  );
  const completedTasks = realTasks.filter((task) => {
    const stage = (Array.isArray(task.stage_id) ? task.stage_id[1] : "").toLocaleLowerCase("mn-MN");
    return stage.includes("дууссан") || stage.includes("verified") || stage.includes("done") || stage.includes("баталсан");
  }).length;
  return {
    hasLogin: Boolean(user?.login),
    login: user?.login || "",
    roleKey: typeof user?.ops_user_type === "string" ? user.ops_user_type : "",
    lastLoginDate: typeof user?.login_date === "string" ? user.login_date.slice(0, 10) : "",
    isInternal: user ? user.share === false : false,
    totalTasks: realTasks.length,
    completedTasks,
    activeTasks: Math.max(0, realTasks.length - completedTasks),
  };
}

export type ErpScorecardEmployee = {
  name: string;
  jobTitle?: string;
  departmentName?: string;
  employeeCode?: string;
  registerNumber?: string;
  birthDate?: string;
  missingDocumentCount?: number;
  taskCompletionPercent?: number;
  gradeRank?: string;
  bankAccountNumber?: string;
  bankName?: string;
  taxNumber?: string;
  payCategory?: string;
  mobilePhone?: string;
  workPhone?: string;
  workEmail?: string;
  privateEmail?: string;
  photoUrl?: string;
};

// Нэвтэрсэн ажилтан ӨӨРИЙН профайлаа ERP дүгнэлтэд харуулахад хэрэгтэй өгөгдлийг
// service (admin) эрхээр татна — worker өөрөө hr.employee уншиж чаддаггүй.
export async function loadSelfEmployeeScorecard(userId?: number | null): Promise<ErpScorecardEmployee | null> {
  if (!userId || !Number.isFinite(userId)) return null;
  const records = await executeOdooKw<Array<Record<string, unknown>>>(
    "hr.employee",
    "search_read",
    [[["user_id", "=", userId]]],
    {
      fields: [
        "name", "job_id", "department_id", "birthday", "additional_note", "image_128",
        "x_mn_employee_code", "x_mn_registration_number", "x_mn_grade_rank",
        "x_mn_missing_document_count", "x_mn_task_completion_percent",
        "x_mn_bank_account_number", "x_mn_bank_name", "x_mn_tax_number",
        "mobile_phone", "work_phone", "work_email",
      ],
      limit: 1,
    },
    createOdooConnection(),
  ).catch(() => [] as Array<Record<string, unknown>>);
  const record = records[0];
  if (!record) return null;
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  const rel = (value: unknown) => (Array.isArray(value) ? String(value[1] ?? "") : "");
  const notes = cleanOdooLongText(str(record.additional_note));
  const image = str(record.image_128);
  return {
    name: fixMojibakeText(str(record.name)) || str(record.name),
    jobTitle: rel(record.job_id),
    departmentName: rel(record.department_id).split(" / ").pop() || "",
    employeeCode: str(record.x_mn_employee_code),
    registerNumber: str(record.x_mn_registration_number),
    birthDate: str(record.birthday),
    missingDocumentCount: Number(record.x_mn_missing_document_count || 0),
    taskCompletionPercent: Number(record.x_mn_task_completion_percent || 0),
    gradeRank: str(record.x_mn_grade_rank),
    bankAccountNumber: str(record.x_mn_bank_account_number) || getManagedNoteValue(notes, "Дансны дугаар"),
    bankName: str(record.x_mn_bank_name) || getManagedNoteValue(notes, "Банк"),
    taxNumber: str(record.x_mn_tax_number) || getManagedNoteValue(notes, "ТТД дугаар"),
    payCategory: getManagedNoteValue(notes, "Цалингийн ангилал"),
    mobilePhone: str(record.mobile_phone),
    workPhone: str(record.work_phone),
    workEmail: str(record.work_email),
    photoUrl: image.length > 100 ? `data:image/jpeg;base64,${image}` : "",
  };
}

export async function getJobs(session: AppSession): Promise<HrOption[]> {
  return executeOdooKw<OdooDictionaryRecord[]>(
    "hr.job",
    "search_read",
    [[]],
    { fields: ["name"], order: "name asc", limit: 500 },
    getConnection(session),
  )
    .then((records) => records.map((record) => ({ id: record.id, name: record.name })))
    .catch((error) => {
      console.warn("HR jobs could not be loaded:", error);
      return [];
    });
}

function isDirectorOrDepartmentHeadEmployee(employee: HrEmployeeDirectoryItem) {
  const jobTitle = normalizeText(employee.jobTitle).replace(/\s+/g, " ");
  return (
    jobTitle === "захирал" ||
    jobTitle.includes("захирал") ||
    jobTitle.includes("director") ||
    jobTitle.includes("ceo") ||
    jobTitle.includes("general manager") ||
    jobTitle.includes("хэлтсийн дарга") ||
    jobTitle.includes("хэлтэсийн дарга") ||
    jobTitle.includes("албаны дарга") ||
    jobTitle.includes("газрын дарга") ||
    jobTitle.includes("department head") ||
    jobTitle.includes("department manager")
  );
}

export async function getManagers(session: AppSession): Promise<HrOption[]> {
  return getEmployees(session)
    .then((employees) =>
      employees
        .filter((employee) => employee.active && isDirectorOrDepartmentHeadEmployee(employee))
        .map((employee) => ({
          id: employee.id,
          name: [employee.name, employee.jobTitle].filter(Boolean).join(" · "),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, "mn")),
    )
    .catch((error) => {
      console.warn("HR managers could not be loaded:", error);
      return [];
    });
}

export async function getCountries(session: AppSession): Promise<HrOption[]> {
  return executeOdooKw<OdooDictionaryRecord[]>(
    "res.country",
    "search_read",
    [[]],
    { fields: ["name"], order: "name asc", limit: 300 },
    getConnection(session),
  )
    .then((records) => records.map((record) => ({ id: record.id, name: record.name })))
    .catch((error) => {
      console.warn("HR countries could not be loaded:", error);
      return [];
    });
}

async function resolveCountryIdByName(session: AppSession, value?: string) {
  const query = value?.trim();
  if (!query) return null;
  const normalizedQuery = normalizeText(query);
  return executeOdooKw<OdooDictionaryRecord[]>(
    "res.country",
    "search_read",
    [[["name", "ilike", query]]],
    { fields: ["name"], limit: 20 },
    getConnection(session),
  )
    .then((records) => {
      const exact = records.find((record) => normalizeText(record.name) === normalizedQuery);
      return exact?.id ?? null;
    })
    .catch((error) => {
      console.warn("HR country could not be resolved:", error);
      return null;
    });
}

export async function getLeaveTypes(session: AppSession): Promise<HrOption[]> {
  return executeOdooKw<Array<{ id: number; name: string }>>(
    "hr.leave.type",
    "search_read",
    [[]],
    { fields: ["name"], order: "name asc", limit: 100 },
    getConnection(session),
  )
    .then((records) => records.map((record) => ({ id: record.id, name: record.name })))
    .catch((error) => {
      console.warn("HR leave types could not be loaded:", error);
      return [];
    });
}

export async function createEmployee(session: AppSession, data: HrEmployeeCreateInput) {
  const desiredFields = [
    "name",
    "mobile_phone",
    "work_email",
    "department_id",
    "job_id",
    "job_title",
    "parent_id",
    "contract_date_start",
    "trial_date_end",
    "identification_id",
    "x_mn_registration_number",
    "x_mn_employment_status",
    "birthday",
    "sex",
    "active",
    "additional_note",
    "private_street",
    "private_street2",
    "private_city",
    "place_of_birth",
    "marital",
    "children",
    "emergency_contact",
    "emergency_phone",
    "country_of_birth",
    "country_id",
    "certificate",
    "study_field",
    "study_school",
    "wage",
    "pay_category",
    "x_mn_missing_document_count",
    "image_1920",
  ];
  const fields = new Set(await getAvailableFields("hr.employee", desiredFields, session));
  const name = [data.lastName, data.firstName].map((value) => value?.trim()).filter(Boolean).join(" ");
  const [countryOfBirthId, nationalityId] = await Promise.all([
    data.countryOfBirth ? resolveCountryIdByName(session, data.countryOfBirth) : Promise.resolve(data.countryOfBirthId ?? null),
    data.nationality ? resolveCountryIdByName(session, data.nationality) : Promise.resolve(data.nationalityId ?? null),
  ]);
  const noteParts = [
    data.note,
    data.educationRecords?.length ? `${EDUCATION_RECORDS_NOTE_LABEL}: ${serializeEducationRecordsForNote(data.educationRecords)}` : "",
    data.documentRecords?.length ? `${DOCUMENT_RECORDS_NOTE_LABEL}: ${serializeDocumentRecordsForNote(data.documentRecords)}` : "",
    data.workType ? `Ажиллах төрөл: ${data.workType}` : "",
    data.isFieldEmployee ? "Талбайн ажилтан: тийм" : "",
    data.fieldRole ? `Талбайн үүрэг: ${data.fieldRole}` : "",
    data.emergencyContact ? `Яаралтай холбоо: ${data.emergencyContact}` : "",
    data.emergencyPhone ? `Яаралтай утас: ${data.emergencyPhone}` : "",
    data.birthPlace ? `Төрсөн хот / аймаг / сум: ${data.birthPlace}` : "",
    data.countryOfBirth ? `Төрсөн улс: ${data.countryOfBirth}` : "",
    data.nationality ? `Иргэншил: ${data.nationality}` : "",
    data.addressProvince ? `Аймаг / Хот: ${data.addressProvince}` : "",
    data.addressDistrict ? `Сум / Дүүрэг: ${data.addressDistrict}` : "",
    data.addressSubdistrict ? `Баг / Хороо: ${data.addressSubdistrict}` : "",
    data.familyStatus ? `Гэр бүлийн байдал: ${data.familyStatus}` : "",
    data.childrenCount ? `Хүүхдийн тоо: ${data.childrenCount}` : "",
    data.childrenInfo ? `Хүүхдийн нас / мэдээлэл: ${data.childrenInfo}` : "",
    data.childrenSchool ? `Хүүхдүүдийн сургууль / цэцэрлэг: ${data.childrenSchool}` : "",
    data.bankName ? `Банк: ${data.bankName}` : "",
    data.bankAccountNumber ? `Дансны дугаар: ${data.bankAccountNumber}` : "",
    data.baseSalary ? `Үндсэн цалин: ${data.baseSalary}` : "",
    data.taxNumber ? `ТТД дугаар: ${data.taxNumber}` : "",
    data.socialInsuranceStartDate ? `НД төлж эхэлсэн огноо: ${data.socialInsuranceStartDate}` : "",
    data.annualLeaveNote ? `Ээлжийн амралт: ${data.annualLeaveNote}` : "",
    data.talent ? `Авьяас / спорт / урлаг: ${data.talent}` : "",
    data.skillLevel ? `Ур чадвар ба зэрэглэл: ${data.skillLevel}` : "",
    data.previousEmployment ? `Ажиллаж байсан байгууллагууд: ${data.previousEmployment}` : "",
    data.additionalDuty ? `Хавсран ажиллаж буй / нэмэлт ажил: ${data.additionalDuty}` : "",
    data.workType === "Туршилтаар" && data.trialEndDate ? `Туршилтын хугацаа дуусах: ${data.trialEndDate}` : "",
  ].filter(Boolean);
  const values: Record<string, unknown> = {};

  if (fields.has("name")) values.name = name || data.firstName;
  if (fields.has("mobile_phone")) values.mobile_phone = data.phone || false;
  if (fields.has("work_email")) values.work_email = data.email || false;
  if (fields.has("department_id") && data.departmentId) values.department_id = data.departmentId;
  if (fields.has("job_id") && data.jobId) values.job_id = data.jobId;
  if (fields.has("job_title") && data.jobTitle?.trim()) values.job_title = data.jobTitle.trim();
  if (fields.has("parent_id") && data.managerId) values.parent_id = data.managerId;
  if (fields.has("contract_date_start")) values.contract_date_start = data.startDate || false;
  if (fields.has("identification_id")) values.identification_id = data.registerNumber || false;
  if (fields.has("x_mn_registration_number")) values.x_mn_registration_number = data.registerNumber || false;
  if (fields.has("x_mn_employment_status")) values.x_mn_employment_status = data.workType === "Туршилтаар" ? "probation" : "active";
  if (fields.has("trial_date_end")) values.trial_date_end = data.workType === "Туршилтаар" ? data.trialEndDate || false : false;
  if (fields.has("birthday")) values.birthday = data.birthDate || false;
  if (fields.has("sex")) values.sex = data.gender || false;
  if (fields.has("active")) values.active = true;
  if (fields.has("additional_note")) values.additional_note = noteParts.join("\n") || false;
  if (fields.has("private_street")) values.private_street = data.homeAddress || false;
  if (fields.has("private_street2")) {
    values.private_street2 = [data.addressSubdistrict, data.addressDistrict]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(", ") || false;
  }
  if (fields.has("private_city")) values.private_city = data.addressProvince || data.addressDistrict || false;
  if (fields.has("place_of_birth")) values.place_of_birth = data.birthPlace || false;
  if (fields.has("country_of_birth") && countryOfBirthId) values.country_of_birth = countryOfBirthId;
  if (fields.has("country_id") && nationalityId) values.country_id = nationalityId;
  if (fields.has("marital") && data.familyStatus) values.marital = toMaritalKey(data.familyStatus);
  if (fields.has("children")) values.children = data.childrenCount || 0;
  if (fields.has("emergency_contact")) values.emergency_contact = data.emergencyContact || false;
  if (fields.has("emergency_phone")) values.emergency_phone = data.emergencyPhone || false;
  const primaryEducationRecord = data.educationRecords !== undefined ? normalizeEducationRecords(data.educationRecords)[0] : null;
  if (fields.has("certificate")) values.certificate = toCertificateKey(primaryEducationRecord?.level || data.educationLevel);
  if (fields.has("study_field")) values.study_field = primaryEducationRecord?.field || data.studyField || false;
  if (fields.has("study_school")) values.study_school = primaryEducationRecord?.school || data.studySchool || false;
  if (fields.has("wage") && data.baseSalary) values.wage = numberFromManagedNote(data.baseSalary);
  if (fields.has("pay_category")) values.pay_category = data.payCategory || false;
  if (fields.has("image_1920") && data.profilePhotoBase64) values.image_1920 = data.profilePhotoBase64;

  let createdId = 0;
  try {
    const result = await executeOdooKw<unknown>(
      "hr.employee",
      "create_hr_custom_mn_employee",
      [values],
      {},
      getConnection(session),
    );
    createdId = getOdooResultId(result);
  } catch (error) {
    if (!isMissingHrCustomEmployeeApiError(error)) {
      throw error;
    }
    console.warn("HR custom employee create API unavailable, falling back to direct hr.employee create:", error);
  }
  if (!createdId) {
    createdId = await executeOdooKw<number>(
      "hr.employee",
      "create",
      [values],
      {},
      getConnection(session),
    );
  }
  const documentRecordsForSave =
    data.documentRecords !== undefined
      ? await attachDocumentFilesToEmployeeRecords(session, createdId, data.documentRecords, data.documentAttachments)
      : undefined;
  if (documentRecordsForSave !== undefined) {
    const noteValue = mergeEmployeeManagedNotes(String(values.additional_note || ""), [
      [DOCUMENT_RECORDS_NOTE_LABEL, serializeDocumentRecordsForNote(documentRecordsForSave)],
    ]);
    const documentValues: Record<string, unknown> = {
      ...(fields.has("additional_note") ? { additional_note: noteValue || false } : {}),
      ...(fields.has("x_mn_missing_document_count")
        ? { x_mn_missing_document_count: countMissingDocumentRecords(documentRecordsForSave) }
        : {}),
    };
    if (Object.keys(documentValues).length) {
      await executeOdooKw<boolean>("hr.employee", "write", [[createdId], documentValues], {}, getConnection(session));
    }
  }
  await attachFilesToEmployee(session, createdId, educationAttachmentFromInput(data), "Боловсрол", "diploma");
  return getEmployee(session, createdId);
}

export async function updateEmployee(
  session: AppSession,
  id: number,
  data: Partial<
    HrEmployeeCreateInput &
      Pick<
        HrEmployeeDirectoryItem,
        | "name"
        | "employeeCode"
        | "mobilePhone"
        | "workEmail"
        | "birthDate"
        | "genderKey"
        | "registerNumber"
        | "privatePhone"
        | "privateEmail"
        | "homeAddress"
        | "emergencyContact"
        | "emergencyPhone"
        | "placeOfBirth"
        | "countryOfBirth"
        | "countryOfBirthId"
        | "nationality"
        | "nationalityId"
        | "maritalStatus"
        | "spouseName"
        | "spouseBirthDate"
        | "childrenCount"
        | "studyField"
        | "studySchool"
        | "educationLevel"
        | "payCategory"
        | "contractEndDate"
        | "trialEndDate"
        | "gradeRank"
        | "workType"
        | "notes"
        | "missingDocumentCount"
        | "kpiScore"
        | "taskCompletionPercent"
        | "disciplineScore"
        | "departureDate"
        | "departureDescription"
      >
      & {
        departmentId?: number | null;
        jobId?: number | null;
        managerId?: number | null;
        profilePhotoBase64?: string;
      }
  >,
) {
  const desiredFields = [
    "name",
    "mobile_phone",
    "work_email",
    "department_id",
    "job_id",
    "job_title",
    "parent_id",
    "contract_date_start",
    "contract_date_end",
    "trial_date_end",
    "x_mn_employee_code",
    "x_mn_grade_rank",
    "x_mn_employment_status",
    "birthday",
    "sex",
    "identification_id",
    "x_mn_registration_number",
    "private_phone",
    "private_email",
    "private_street",
    "private_street2",
    "private_city",
    "place_of_birth",
    "marital",
    "spouse_complete_name",
    "spouse_birthdate",
    "children",
    "emergency_contact",
    "emergency_phone",
    "country_of_birth",
    "country_id",
    "certificate",
    "study_field",
    "study_school",
    "wage",
    "pay_category",
    "departure_date",
    "departure_description",
    "additional_note",
    "x_mn_missing_document_count",
    "x_mn_performance_score",
    "x_mn_task_completion_percent",
    "x_mn_discipline_score",
    "image_1920",
    "active",
  ];
  const fields = new Set(await getAvailableFields("hr.employee", desiredFields, session));
  const values: Record<string, unknown> = {};
  const explicitName = [data.lastName, data.firstName].map((value) => value?.trim()).filter(Boolean).join(" ");
  const [resolvedCountryOfBirthId, resolvedNationalityId] = await Promise.all([
    data.countryOfBirth !== undefined ? resolveCountryIdByName(session, data.countryOfBirth) : Promise.resolve(data.countryOfBirthId ?? null),
    data.nationality !== undefined ? resolveCountryIdByName(session, data.nationality) : Promise.resolve(data.nationalityId ?? null),
  ]);
  const documentRecordsForSave =
    data.documentRecords !== undefined
      ? await attachDocumentFilesToEmployeeRecords(session, id, data.documentRecords, data.documentAttachments)
      : undefined;
  const managedNoteParts = [
    data.educationRecords !== undefined ? [EDUCATION_RECORDS_NOTE_LABEL, serializeEducationRecordsForNote(data.educationRecords)] : null,
    documentRecordsForSave !== undefined ? [DOCUMENT_RECORDS_NOTE_LABEL, serializeDocumentRecordsForNote(documentRecordsForSave)] : null,
    data.childrenInfo ? ["Хүүхдийн нас / мэдээлэл", data.childrenInfo] : null,
    data.childrenSchool ? ["Хүүхдүүдийн сургууль / цэцэрлэг", data.childrenSchool] : null,
    data.annualLeaveNote ? ["Ээлжийн амралт", data.annualLeaveNote] : null,
    data.bankName !== undefined ? ["Банк", data.bankName] : null,
    data.bankAccountNumber !== undefined ? ["Дансны дугаар", data.bankAccountNumber] : null,
    data.baseSalary !== undefined ? ["Үндсэн цалин", data.baseSalary] : null,
    data.payCategory !== undefined ? ["Цалингийн ангилал", data.payCategory] : null,
    data.taxNumber !== undefined ? ["ТТД дугаар", data.taxNumber] : null,
    data.socialInsuranceStartDate !== undefined ? ["НД төлж эхэлсэн огноо", data.socialInsuranceStartDate] : null,
    data.talent ? ["Авьяас / спорт / урлаг", data.talent] : null,
    data.skillLevel ? ["Ур чадвар ба зэрэглэл", data.skillLevel] : null,
    data.previousEmployment ? ["Ажиллаж байсан байгууллагууд", data.previousEmployment] : null,
    data.additionalDuty ? ["Хавсран ажиллаж буй / нэмэлт ажил", data.additionalDuty] : null,
    data.countryOfBirth !== undefined ? ["Төрсөн улс", data.countryOfBirth] : null,
    data.nationality !== undefined ? ["Иргэншил", data.nationality] : null,
    data.workType !== undefined ? ["Ажиллах төрөл", data.workType] : null,
    data.trialEndDate !== undefined ? ["Туршилтын хугацаа дуусах", data.trialEndDate] : null,
  ].filter((item): item is [string, string] => Boolean(item));

  if (fields.has("name") && (data.name !== undefined || explicitName)) {
    values.name = explicitName || data.name?.trim() || false;
  }
  if (fields.has("x_mn_employee_code") && data.employeeCode !== undefined) {
    values.x_mn_employee_code = data.employeeCode?.trim() || false;
  }
  if (fields.has("identification_id") && data.registerNumber !== undefined) {
    values.identification_id = data.registerNumber?.trim() || false;
  }
  if (fields.has("x_mn_registration_number") && data.registerNumber !== undefined) {
    values.x_mn_registration_number = data.registerNumber?.trim() || false;
  }
  if (fields.has("mobile_phone") && data.mobilePhone !== undefined) values.mobile_phone = data.mobilePhone || false;
  if (fields.has("work_email") && data.workEmail !== undefined) values.work_email = data.workEmail || false;
  if (fields.has("private_phone") && data.privatePhone !== undefined) values.private_phone = data.privatePhone || false;
  if (fields.has("private_email") && data.privateEmail !== undefined) values.private_email = data.privateEmail || false;
  if (fields.has("private_street") && data.homeAddress !== undefined) values.private_street = data.homeAddress || false;
  if (fields.has("private_street2") && (data.addressSubdistrict !== undefined || data.addressDistrict !== undefined)) {
    values.private_street2 = [data.addressSubdistrict, data.addressDistrict]
      .map((value) => value?.trim())
      .filter(Boolean)
      .join(", ") || false;
  }
  if (fields.has("private_city") && (data.addressProvince !== undefined || data.addressDistrict !== undefined)) {
    values.private_city = data.addressProvince || data.addressDistrict || false;
  }
  if (fields.has("place_of_birth") && (data.birthPlace !== undefined || data.placeOfBirth !== undefined)) {
    values.place_of_birth = data.birthPlace || data.placeOfBirth || false;
  }
  if (fields.has("country_of_birth") && (data.countryOfBirth !== undefined || data.countryOfBirthId !== undefined)) {
    values.country_of_birth = data.countryOfBirth !== undefined ? resolvedCountryOfBirthId || false : data.countryOfBirthId || false;
  }
  if (fields.has("country_id") && (data.nationality !== undefined || data.nationalityId !== undefined)) {
    values.country_id = data.nationality !== undefined ? resolvedNationalityId || false : data.nationalityId || false;
  }
  if (fields.has("birthday") && data.birthDate !== undefined) values.birthday = data.birthDate || false;
  if (fields.has("sex") && (data.genderKey !== undefined || data.gender !== undefined)) {
    values.sex = data.genderKey || data.gender || false;
  }
  if (fields.has("marital") && (data.familyStatus !== undefined || data.maritalStatus !== undefined)) {
    values.marital = toMaritalKey(data.familyStatus || data.maritalStatus);
  }
  if (fields.has("spouse_complete_name") && data.spouseName !== undefined) {
    values.spouse_complete_name = data.spouseName || false;
  }
  if (fields.has("spouse_birthdate") && data.spouseBirthDate !== undefined) {
    values.spouse_birthdate = data.spouseBirthDate || false;
  }
  if (fields.has("children") && data.childrenCount !== undefined) values.children = data.childrenCount || 0;
  if (fields.has("emergency_contact") && data.emergencyContact !== undefined) {
    values.emergency_contact = data.emergencyContact || false;
  }
  if (fields.has("emergency_phone") && data.emergencyPhone !== undefined) {
    values.emergency_phone = data.emergencyPhone || false;
  }
  const primaryEducationRecord = data.educationRecords !== undefined ? normalizeEducationRecords(data.educationRecords)[0] : null;
  if (fields.has("certificate") && (data.educationLevel !== undefined || data.educationRecords !== undefined)) {
    values.certificate = toCertificateKey(primaryEducationRecord?.level || data.educationLevel);
  }
  if (fields.has("study_field") && (data.studyField !== undefined || data.educationRecords !== undefined)) {
    values.study_field = primaryEducationRecord?.field || data.studyField || false;
  }
  if (fields.has("study_school") && (data.studySchool !== undefined || data.educationRecords !== undefined)) {
    values.study_school = primaryEducationRecord?.school || data.studySchool || false;
  }
  if (fields.has("wage") && data.baseSalary !== undefined) values.wage = data.baseSalary ? numberFromManagedNote(data.baseSalary) : 0;
  if (fields.has("pay_category") && data.payCategory !== undefined) values.pay_category = data.payCategory || false;
  if (fields.has("departure_date") && data.departureDate !== undefined) values.departure_date = data.departureDate || false;
  if (fields.has("departure_description") && data.departureDescription !== undefined) {
    values.departure_description = data.departureDescription || false;
  }
  if (fields.has("x_mn_missing_document_count") && (data.missingDocumentCount !== undefined || data.documentRecords !== undefined)) {
    values.x_mn_missing_document_count =
      documentRecordsForSave !== undefined ? countMissingDocumentRecords(documentRecordsForSave) : data.missingDocumentCount || 0;
  }
  if (fields.has("x_mn_performance_score") && data.kpiScore !== undefined) {
    values.x_mn_performance_score = data.kpiScore || 0;
  }
  if (fields.has("x_mn_task_completion_percent") && data.taskCompletionPercent !== undefined) {
    values.x_mn_task_completion_percent = data.taskCompletionPercent || 0;
  }
  if (fields.has("x_mn_discipline_score") && data.disciplineScore !== undefined) {
    values.x_mn_discipline_score = data.disciplineScore || 0;
  }
  if (fields.has("image_1920") && data.profilePhotoBase64 !== undefined) {
    values.image_1920 = data.profilePhotoBase64 || false;
  }
  if (fields.has("department_id") && data.departmentId !== undefined) values.department_id = data.departmentId || false;
  if (fields.has("job_id") && data.jobId !== undefined) values.job_id = data.jobId || false;
  if (fields.has("job_title") && data.jobTitle !== undefined) values.job_title = data.jobTitle || false;
  if (fields.has("parent_id") && data.managerId !== undefined) values.parent_id = data.managerId || false;
  if (fields.has("contract_date_start") && data.startDate !== undefined) {
    values.contract_date_start = data.startDate || false;
  }
  if (fields.has("contract_date_end") && data.contractEndDate !== undefined) {
    values.contract_date_end = data.contractEndDate || false;
  }
  if (fields.has("trial_date_end") && data.trialEndDate !== undefined) {
    values.trial_date_end = data.trialEndDate || false;
  }
  if (fields.has("x_mn_grade_rank") && data.gradeRank !== undefined) {
    values.x_mn_grade_rank = data.gradeRank?.trim() || false;
  }
  if (fields.has("x_mn_employment_status") && data.workType !== undefined) {
    values.x_mn_employment_status = data.workType === "Туршилтаар" || data.workType === "Түр" ? "probation" : "active";
  }
  if (fields.has("additional_note") && (data.notes !== undefined || data.note !== undefined || managedNoteParts.length)) {
    const baseNotes =
      data.notes !== undefined || data.note !== undefined
        ? data.notes ?? data.note ?? ""
        : (await getEmployee(session, id))?.notes || "";
    values.additional_note = mergeEmployeeManagedNotes(baseNotes, managedNoteParts) || false;
  }
  if (fields.has("active") && data.isFieldEmployee === false) values.active = false;

  if (!Object.keys(values).length) {
    await attachFilesToEmployee(session, id, educationAttachmentFromInput(data), "Боловсрол", "diploma");
    return getEmployee(session, id);
  }

  let updatedThroughCustomApi = false;
  try {
    const result = await executeOdooKw<unknown>(
      "hr.employee",
      "update_hr_custom_mn_employee",
      [id, values],
      {},
      getConnection(session),
    );
    updatedThroughCustomApi = getOdooResultId(result) === id;
  } catch (error) {
    // Custom API амжилтгүй болбол (байхгүй, эсвэл Odoo хувилбарын талбар/selection
    // зөрчил) шууд, тэсвэртэй write рүү шилжиж дахин оролдоно.
    console.warn("HR custom employee update API unavailable/failed, falling back to direct hr.employee write:", error);
  }
  if (!updatedThroughCustomApi) {
    // Odoo дээр байхгүй болсон талбарыг алдаанаас нь илрүүлэн хасаад дахин бичнэ.
    const writeValues: Record<string, unknown> = { ...values };
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        await executeOdooKw<boolean>("hr.employee", "write", [[id], writeValues], {}, getConnection(session));
        break;
      } catch (error) {
        const invalidField = getInvalidOdooFieldName(error);
        if (invalidField && Object.prototype.hasOwnProperty.call(writeValues, invalidField)) {
          console.warn(`hr.employee дээр '${invalidField}' талбар байхгүй тул хасаад дахин бичив.`);
          delete writeValues[invalidField];
          if (Object.keys(writeValues).length === 0) break;
          continue;
        }
        throw error;
      }
    }
  }
  await attachFilesToEmployee(session, id, educationAttachmentFromInput(data), "Боловсрол", "diploma");
  return getEmployee(session, id);
}

function dayCount(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function leaveStateLabel(state: string) {
  switch (state) {
    case "draft":
      return "Ноорог";
    case "confirm":
      return "Илгээсэн";
    case "validate":
    case "validate1":
      return "Баталгаажсан";
    case "refuse":
      return "Цуцлагдсан";
    default:
      return state || "Тодорхойгүй";
  }
}

export async function getLeaves(session: AppSession): Promise<HrLeaveItem[]> {
  const fields = await getAvailableFields(
    "hr.leave",
    ["employee_id", "holiday_status_id", "request_date_from", "request_date_to", "date_from", "date_to", "name", "state", "message_attachment_count"],
    session,
  );

  return executeOdooKw<Array<Record<string, unknown>>>(
    "hr.leave",
    "search_read",
    [[]],
    {
      fields,
      order: "request_date_from desc, id desc",
      limit: 200,
      context: { active_test: false },
    },
    getConnection(session),
  )
    .then((records) =>
      records.map((record) => {
        const employee = record.employee_id as OdooRelation;
        const type = record.holiday_status_id as OdooRelation;
        const dateFrom = String(record.request_date_from || record.date_from || "");
        const dateTo = String(record.request_date_to || record.date_to || "");
        const state = String(record.state || "");

        return {
          id: Number(record.id),
          employeeId: getRelationId(employee),
          employeeName: getRelationName(employee, "Ажилтан сонгоогүй"),
          typeName: getRelationName(type, "Чөлөө"),
          dateFrom,
          dateTo,
          dayCount: dayCount(dateFrom, dateTo),
          state,
          stateLabel: leaveStateLabel(state),
          note: String(record.name || ""),
          hasAttachment: Number(record.message_attachment_count || 0) > 0,
        };
      }),
    )
    .catch((error) => {
      console.warn("HR leaves could not be loaded:", error);
      return [];
    });
}

export async function createLeave(session: AppSession, data: HrLeaveCreateInput) {
  const leaveTypes = data.leaveTypeId ? [] : await getLeaveTypes(session);
  const holidayStatusId = data.leaveTypeId ?? leaveTypes[0]?.id;
  if (!holidayStatusId && !data.leaveTypeName) {
    throw new Error("Чөлөөний төрөл олдсонгүй.");
  }
  const attachments: HrLeaveAttachmentInput[] = [];
  if (data.files?.length) {
    for (const file of data.files) {
      if (!file.size) continue;
      const prepared = await prepareUploadFromFile(file);
      attachments.push({
        name: prepared.filename,
        datas: prepared.base64,
        mimetype: prepared.mimeType,
      });
    }
  }

  try {
    const result = await executeOdooKw<{ id: number }>(
      "hr.employee",
      "create_hr_custom_mn_leave",
      [
        {
          employeeId: data.employeeId,
          leaveTypeId: holidayStatusId,
          leaveTypeName: data.leaveTypeName,
          dateFrom: data.dateFrom,
          dateTo: data.dateTo,
          note: data.note,
          confirm: data.confirm,
          attachments,
        },
      ],
      {},
      getConnection(session),
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const canFallback = message.includes("create_hr_custom_mn_leave") || message.includes("not found");
    if (!canFallback) {
      throw error;
    }
    console.warn("HR custom leave API unavailable, falling back to direct hr.leave create:", error);
  }

  const fields = new Set(
    await getAvailableFields(
      "hr.leave",
      ["employee_id", "holiday_status_id", "request_date_from", "request_date_to", "name"],
      session,
    ),
  );
  if (!holidayStatusId) {
    throw new Error("Чөлөөний төрөл олдсонгүй.");
  }
  const values: Record<string, unknown> = {};
  if (fields.has("employee_id")) values.employee_id = data.employeeId;
  if (fields.has("holiday_status_id")) values.holiday_status_id = holidayStatusId;
  if (fields.has("request_date_from")) values.request_date_from = data.dateFrom;
  if (fields.has("request_date_to")) values.request_date_to = data.dateTo;
  if (fields.has("name")) values.name = data.note || data.leaveTypeName || "HR чөлөөний бүртгэл";

  const leaveId = await executeOdooKw<number>("hr.leave", "create", [values], {}, getConnection(session));

  if (attachments.length) {
    for (const attachment of attachments) {
      await executeOdooKw<number>(
        "ir.attachment",
        "create",
        [
          {
            name: attachment.name,
            datas: attachment.datas,
            res_model: "hr.leave",
            res_id: leaveId,
            mimetype: attachment.mimetype,
          },
        ],
        {},
        getConnection(session),
      ).catch((error) => console.warn("HR leave attachment could not be saved:", error));
    }
  }

  if (data.confirm) {
    await executeOdooKw<boolean>("hr.leave", "action_confirm", [[leaveId]], {}, getConnection(session)).catch((error) =>
      console.warn("HR leave confirm action failed:", error),
    );
  }

  return { id: leaveId };
}

function emptyTimeoffDashboard(scope: "hr" | "department", departmentName = ""): HrTimeoffDashboardData {
  return {
    scope,
    departmentName,
    cards: {
      totalEmployees: 0,
      activeEmployees: 0,
      timeOffEmployees: 0,
      annualLeaveEmployees: 0,
      sickEmployees: 0,
      archivedEmployees: 0,
      pendingRequests: 0,
      approvedRequests: 0,
      rejectedRequests: 0,
    },
    statusPie: [
      { label: "Идэвхтэй", value: 0 },
      { label: "Чөлөөтэй", value: 0 },
      { label: "Ээлжийн амралттай", value: 0 },
      { label: "Өвчтэй", value: 0 },
    ],
    departmentBreakdown: [],
    latestRequests: [],
  };
}

function normalizeTimeoffRequestType(value: unknown): HrTimeoffRequestType {
  if (value === "sick") return "sick";
  if (value === "annual_leave") return "annual_leave";
  return "time_off";
}

function timeoffRequestTypeLabel(type: HrTimeoffRequestType) {
  if (type === "sick") return "Өвчтэй";
  if (type === "annual_leave") return "Ээлжийн амралт";
  return "Чөлөө";
}

function timeoffStatusPriority(type: HrTimeoffRequestType) {
  if (type === "sick") return 3;
  if (type === "annual_leave") return 2;
  return 1;
}

const CURRENT_TIMEOFF_STATUS_LABELS: Record<HrTimeoffRequestType, string> = {
  time_off: "Чөлөөтэй",
  annual_leave: "Ээлжийн амралттай",
  sick: "Өвчтэй",
};

function employeeCanReceiveDynamicTimeoffStatus(employee: HrEmployeeDirectoryItem) {
  return employee.active && !["archived", "terminated", "resigned"].includes(employee.statusKey || "");
}

async function applyCurrentTimeoffStatus(employees: HrEmployeeDirectoryItem[]): Promise<HrEmployeeDirectoryItem[]> {
  const employeeIds = employees.filter(employeeCanReceiveDynamicTimeoffStatus).map((employee) => employee.id);
  if (!employeeIds.length) {
    return employees;
  }

  const today = getTodayKey();
  const employeeIdSet = new Set(employeeIds);
  const statusByEmployee = new Map<number, HrTimeoffRequestType>();

  function rememberStatus(employeeId: number, requestType: HrTimeoffRequestType) {
    if (!employeeIdSet.has(employeeId)) return;
    const previous = statusByEmployee.get(employeeId);
    if (!previous || timeoffStatusPriority(requestType) > timeoffStatusPriority(previous)) {
      statusByEmployee.set(employeeId, requestType);
    }
  }

  function applyStatusOverlay() {
    if (!statusByEmployee.size) {
      return employees;
    }
    return employees.map((employee) => {
      const requestType = statusByEmployee.get(employee.id);
      if (!requestType || !employeeCanReceiveDynamicTimeoffStatus(employee)) {
        return employee;
      }
      return {
        ...employee,
        statusKey: requestType === "time_off" ? "leave" : requestType,
        statusLabel: CURRENT_TIMEOFF_STATUS_LABELS[requestType],
      };
    });
  }

  try {
    const records = await executeOdooKw<Array<Partial<HrTimeoffRequest>>>(
      "municipal.hr.timeoff.request",
      "get_hr_timeoff_request_directory",
      [{ state: "approved", limit: 500 }],
      {},
    );
    for (const record of records) {
      const request = normalizeTimeoffRequest(record);
      if (request.state === "approved" && request.dateFrom <= today && request.dateTo >= today) {
        rememberStatus(request.employeeId, request.requestType);
      }
    }
    if (statusByEmployee.size) {
      return applyStatusOverlay();
    }
  } catch (error) {
    if (!isMissingTimeoffModelError(error)) {
      console.warn("HR current time off status directory overlay failed:", error);
    }
  }

  try {
    const records = await executeOdooKw<HrTimeoffRequestSearchRecord[]>(
      "municipal.hr.timeoff.request",
      "search_read",
      [
        [
          ["employee_id", "in", employeeIds],
          ["state", "=", "approved"],
          ["date_from", "<=", today],
          ["date_to", ">=", today],
        ],
      ],
      {
        fields: ["employee_id", "request_type", "state", "date_from", "date_to"],
        limit: 500,
      },
    );
    for (const record of records) {
      const employeeId = getRelationId(record.employee_id);
      if (!employeeId) continue;
      rememberStatus(employeeId, normalizeTimeoffRequestType(record.request_type));
    }
    return applyStatusOverlay();
  } catch (error) {
    if (!isMissingTimeoffModelError(error)) {
      console.warn("HR current time off status overlay failed:", error);
    }
    return employees;
  }
}

async function filesToAttachments(files?: File[]): Promise<HrLeaveAttachmentInput[]> {
  const attachments: HrLeaveAttachmentInput[] = [];
  for (const file of files ?? []) {
    if (!file.size) continue;
    const prepared = await prepareUploadFromFile(file);
    attachments.push({
      name: prepared.filename,
      datas: prepared.base64,
      mimetype: prepared.mimeType,
    });
  }
  return attachments;
}

function educationAttachmentFromInput(data: Pick<HrEmployeeCreateInput, "educationAttachmentBase64" | "educationAttachmentName" | "educationAttachmentMimeType">) {
  if (!data.educationAttachmentBase64) {
    return [];
  }
  return [
    {
      name: data.educationAttachmentName || "Боловсролын баримт",
      datas: data.educationAttachmentBase64,
      mimetype: data.educationAttachmentMimeType || "application/octet-stream",
    },
  ];
}

async function attachDocumentFilesToEmployeeRecords(
  session: AppSession,
  employeeId: number,
  records: HrEmployeeDocumentRecord[],
  documentAttachments?: HrEmployeeDocumentAttachmentInput[],
) {
  const normalizedRecords = normalizeDocumentRecords(records);
  if (!normalizedRecords.length || !documentAttachments?.length) {
    return normalizedRecords;
  }

  const recordsById = new Map(normalizedRecords.map((record) => [record.id, record]));
  for (const attachment of documentAttachments) {
    const record = recordsById.get(attachment.recordId);
    if (!record) continue;

    const attachmentIds = await attachFilesToEmployee(
      session,
      employeeId,
      [{
        name: attachment.name,
        datas: attachment.datas,
        mimetype: attachment.mimetype,
      }],
      record.name || attachment.documentType || "Баримт бичиг",
      attachment.documentType || record.type || "document",
    );
    record.attachmentIds = Array.from(new Set([...(record.attachmentIds || []), ...attachmentIds]));
  }

  return normalizeDocumentRecords(normalizedRecords);
}

async function attachFilesToEmployee(
  session: AppSession,
  employeeId: number,
  attachments: HrLeaveAttachmentInput[],
  prefix: string,
  documentType?: string,
) {
  if (!attachments.length) {
    return [];
  }
  const attachmentIds: number[] = [];
  const attachmentFields = new Set(await getAvailableFields("ir.attachment", ["x_mn_document_type"], session));
  for (const attachment of attachments) {
    const values: Record<string, unknown> = {
      name: `${prefix} - ${attachment.name}`,
      datas: attachment.datas,
      res_model: "hr.employee",
      res_id: employeeId,
      mimetype: attachment.mimetype,
    };
    if (documentType && attachmentFields.has("x_mn_document_type")) {
      values.x_mn_document_type = documentType;
    }
    const attachmentId = await executeOdooKw<number>(
      "ir.attachment",
      "create",
      [values],
      {},
      getConnection(session),
    );
    attachmentIds.push(attachmentId);
  }
  return attachmentIds;
}

async function attachFilesToTransferHistory(
  session: AppSession,
  historyId: number,
  attachments: HrLeaveAttachmentInput[],
  prefix: string,
) {
  const ids: number[] = [];
  for (const attachment of attachments) {
    const attachmentId = await executeOdooKw<number>(
      "ir.attachment",
      "create",
      [
        {
          name: `${prefix} - ${attachment.name}`,
          datas: attachment.datas,
          res_model: "hr.custom.mn.employee.history",
          res_id: historyId,
          mimetype: attachment.mimetype,
        },
      ],
      {},
      getConnection(session),
    );
    ids.push(attachmentId);
  }
  return ids;
}

function normalizeTransferHistory(
  record: HrTransferHistorySearchRecord,
  attachmentsByHistoryId: Map<number, HrAttachmentSearchRecord[]>,
): HrEmployeeTransferRecord {
  const attachments = attachmentsByHistoryId.get(record.id) ?? [];
  const firstAttachment = attachments[0];
  return {
    id: record.id,
    employeeId: getRelationId(record.employee_id) || 0,
    employeeName: getRelationName(record.employee_id, "Ажилтан бүртгээгүй"),
    date: String(record.date || "").slice(0, 10),
    oldDepartmentName: getRelationName(record.old_department_id, "-"),
    newDepartmentName: getRelationName(record.new_department_id, "-"),
    oldJobName: getRelationName(record.old_job_id, "-"),
    newJobName: getRelationName(record.new_job_id, "-"),
    oldManagerName: getRelationName(record.old_manager_id, "-"),
    newManagerName: getRelationName(record.new_manager_id, "-"),
    note: String(record.note || ""),
    attachmentId: firstAttachment?.id,
    attachmentName: firstAttachment?.name || (firstAttachment ? `Хавсралт #${firstAttachment.id}` : ""),
    attachmentUrl: firstAttachment ? `/api/odoo/attachments/${firstAttachment.id}` : "",
  };
}

async function readEmployeeTransferSnapshot(session: AppSession, employeeId: number) {
  const fields = await getAvailableFields("hr.employee", ["department_id", "job_id", "parent_id"], session);
  const records = await executeOdooKw<HrEmployeeTransferSnapshot[]>(
    "hr.employee",
    "search_read",
    [[["id", "=", employeeId]]],
    { fields, limit: 1, context: { active_test: false } },
    getConnection(session),
  );
  return records[0] ?? {};
}

export async function getEmployeeTransfers(session: AppSession): Promise<HrEmployeeTransferRecord[]> {
  await requireHrSpecialistAccess(session);
  const records = await executeOdooKw<HrTransferHistorySearchRecord[]>(
    "hr.custom.mn.employee.history",
    "search_read",
    [[["action_type", "=", "transfer"]]],
    {
      fields: [
        "employee_id",
        "date",
        "old_department_id",
        "new_department_id",
        "old_job_id",
        "new_job_id",
        "old_manager_id",
        "new_manager_id",
        "note",
      ],
      order: "date desc, id desc",
      limit: 300,
    },
    getConnection(session),
  ).catch((error) => {
    console.warn("HR transfer history could not be loaded:", error);
    return [];
  });
  const historyIds = records.map((record) => record.id);
  const attachments = historyIds.length
    ? await executeOdooKw<Array<HrAttachmentSearchRecord & { res_id?: number }>>(
        "ir.attachment",
        "search_read",
        [[["res_model", "=", "hr.custom.mn.employee.history"], ["res_id", "in", historyIds]]],
        { fields: ["name", "res_id"], order: "id asc" },
        getConnection(session),
      ).catch((error) => {
        console.warn("HR transfer history attachments could not be loaded:", error);
        return [];
      })
    : [];
  const attachmentsByHistoryId = new Map<number, HrAttachmentSearchRecord[]>();
  for (const attachment of attachments) {
    if (!attachment.res_id) continue;
    const list = attachmentsByHistoryId.get(attachment.res_id) ?? [];
    list.push({ id: attachment.id, name: attachment.name });
    attachmentsByHistoryId.set(attachment.res_id, list);
  }
  return records.map((record) => normalizeTransferHistory(record, attachmentsByHistoryId));
}

function ensureDateOrder(value: string, label: string) {
  if (!value) {
    throw new Error(`${label} заавал оруулна уу.`);
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} зөв огноо биш байна.`);
  }
}

function formatHrOrderNumberLine(orderNumber?: string) {
  const value = orderNumber?.trim();
  return value ? `Тушаалын дугаар: ${value}` : "";
}

export async function createEmployeeTransfer(session: AppSession, data: HrEmployeeTransferInput) {
  await requireHrSpecialistAccess(session);
  if (!data.employeeId) {
    throw new Error("Ажилтан заавал сонгоно уу.");
  }
  if (!data.newDepartmentId && !data.newJobId && !data.newManagerId) {
    throw new Error("Шинэ хэлтэс, албан тушаал эсвэл удирдлагаас дор хаяж нэгийг сонгоно уу.");
  }
  ensureDateOrder(data.effectiveDate, "Хүчинтэй огноо");
  if (!data.reason.trim()) {
    throw new Error("Шалтгаан заавал оруулна уу.");
  }

  const [employee, oldSnapshot] = await Promise.all([
    getEmployee(session, data.employeeId),
    readEmployeeTransferSnapshot(session, data.employeeId),
  ]);
  const fields = new Set(await getAvailableFields("hr.employee", ["department_id", "job_id", "parent_id"], session));
  const values: Record<string, unknown> = {};
  if (fields.has("department_id") && data.newDepartmentId) values.department_id = data.newDepartmentId;
  if (fields.has("job_id") && data.newJobId) values.job_id = data.newJobId;
  if (fields.has("parent_id") && data.newManagerId) values.parent_id = data.newManagerId;

  const changedValues = Object.fromEntries(
    Object.entries(values).filter(([field, value]) => getRelationId(oldSnapshot[field as keyof HrEmployeeTransferSnapshot]) !== Number(value)),
  );
  if (!Object.keys(changedValues).length) {
    throw new Error("Сонгосон хэлтэс, албан тушаал, удирдлага одоогийн мэдээлэлтэй ижил байна.");
  }

  const attachments = await filesToAttachments(data.files);
  const transferDetailNote = [data.reason, formatHrOrderNumberLine(data.orderNumber)].filter(Boolean).join("\n");
  let historyId = 0;
  try {
    const result = await executeOdooKw<unknown>(
      "hr.employee",
      "transfer_hr_custom_mn_employee",
      [
        {
          employeeId: data.employeeId,
          values: changedValues,
          effectiveDate: data.effectiveDate,
          reason: data.reason,
          orderNumber: data.orderNumber,
          attachments,
        },
      ],
      {},
      getConnection(session),
    );
    historyId = getOdooResultId(result);
  } catch (error) {
    if (!isMissingHrCustomEmployeeApiError(error)) {
      throw error;
    }
    console.warn("HR custom employee transfer API unavailable, falling back to direct employee write/history:", error);
  }
  if (!historyId) {
    if (Object.keys(changedValues).length) {
      await executeOdooKw<boolean>("hr.employee", "write", [[data.employeeId], changedValues], {}, getConnection(session));
    }
    const newSnapshot = await readEmployeeTransferSnapshot(session, data.employeeId);
    historyId = await executeOdooKw<number>(
      "hr.custom.mn.employee.history",
      "create",
      [
        {
          employee_id: data.employeeId,
          action_type: "transfer",
          date: `${data.effectiveDate} 00:00:00`,
          old_department_id: getRelationId(oldSnapshot.department_id) || false,
          new_department_id: getRelationId(newSnapshot.department_id) || false,
          old_job_id: getRelationId(oldSnapshot.job_id) || false,
          new_job_id: getRelationId(newSnapshot.job_id) || false,
          old_manager_id: getRelationId(oldSnapshot.parent_id) || false,
          new_manager_id: getRelationId(newSnapshot.parent_id) || false,
          note: transferDetailNote,
        },
      ],
      {},
      getConnection(session),
    );
    await attachFilesToTransferHistory(session, historyId, attachments, `Шилжилт хөдөлгөөн ${data.effectiveDate}`);
    await attachFilesToEmployee(session, data.employeeId, attachments, `Шилжилт хөдөлгөөн ${data.effectiveDate}`);
  }
  const updatedEmployee = await getEmployee(session, data.employeeId);

  return {
    id: historyId,
    employeeId: data.employeeId,
    employeeName: employee?.name || "Ажилтан",
    date: data.effectiveDate,
    oldDepartmentName: employee?.departmentName || "-",
    newDepartmentName: updatedEmployee?.departmentName || "-",
    oldJobName: employee?.jobTitle || "-",
    newJobName: updatedEmployee?.jobTitle || "-",
    oldManagerName: employee?.managerName || "-",
    newManagerName: updatedEmployee?.managerName || "-",
    note: transferDetailNote,
  };
}

export async function terminateEmployee(session: AppSession, data: HrEmployeeTerminationInput) {
  await requireHrSpecialistAccess(session);
  if (!data.employeeId) {
    throw new Error("Ажилтан заавал сонгоно уу.");
  }
  ensureDateOrder(data.terminationDate, "Ажлаас чөлөөлсөн огноо");
  if (!data.reason.trim()) {
    throw new Error("Ажлаас чөлөөлөх шалтгаан заавал оруулна уу.");
  }

  const terminationDetailNote = [
    formatHrOrderNumberLine(data.orderNumber),
    data.archiveNumber?.trim() ? `Чөлөөлсөн архивын дугаар: ${data.archiveNumber.trim()}` : "",
    data.note?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n");

  const fields = new Set(
    await getAvailableFields(
      "hr.employee",
      ["active", "departure_date", "departure_description", "x_mn_employment_status", "contract_date_end"],
      session,
    ),
  );
  const values: Record<string, unknown> = {};
  if (fields.has("active")) values.active = false;
  if (fields.has("x_mn_employment_status")) values.x_mn_employment_status = "terminated";
  if (fields.has("departure_date")) values.departure_date = data.terminationDate;
  if (fields.has("contract_date_end")) values.contract_date_end = data.terminationDate;
  if (fields.has("departure_description")) {
    values.departure_description = [data.reason, terminationDetailNote].filter(Boolean).join("\n");
  }

  if (!Object.keys(values).length) {
    throw new Error("Ажилтныг ажлаас чөлөөлөх талбар олдсонгүй.");
  }

  const attachments = await filesToAttachments(data.files);
  let terminatedThroughCustomApi = false;
  try {
    const result = await executeOdooKw<unknown>(
      "hr.employee",
      "terminate_hr_custom_mn_employee",
      [
        {
          employeeId: data.employeeId,
          values,
          terminationDate: data.terminationDate,
          reason: data.reason,
          note: terminationDetailNote,
          attachments,
        },
      ],
      {},
      getConnection(session),
    );
    terminatedThroughCustomApi = getOdooResultId(result) === data.employeeId;
  } catch (error) {
    if (!isMissingHrCustomEmployeeApiError(error)) {
      throw error;
    }
    console.warn("HR custom employee terminate API unavailable, falling back to direct employee write:", error);
  }
  if (!terminatedThroughCustomApi) {
    await executeOdooKw<boolean>("hr.employee", "write", [[data.employeeId], values], {}, getConnection(session));
    await attachFilesToEmployee(
      session,
      data.employeeId,
      attachments,
      `Ажлаас чөлөөлөх ${data.terminationDate}`,
    );
  }

  return getEmployee(session, data.employeeId);
}

export async function confirmTrialEmployee(session: AppSession, data: HrEmployeeTrialConfirmationInput) {
  await requireHrSpecialistAccess(session);
  if (!data.employeeId) {
    throw new Error("Ажилтан заавал сонгоно уу.");
  }
  ensureDateOrder(data.permanentDate, "Жинхэлсэн огноо");
  if (!data.orderNumber.trim()) {
    throw new Error("Жинхлэх тушаалын дугаар заавал оруулна уу.");
  }

  const noteParts = [
    "Туршилтын хугацаа дууссаны дараа жинхэлсэн.",
    `Жинхэлсэн огноо: ${data.permanentDate}`,
    formatHrOrderNumberLine(data.orderNumber),
    data.note?.trim() || "",
  ].filter(Boolean);
  const existingEmployee = await getEmployee(session, data.employeeId);
  const notes = [existingEmployee?.notes || "", noteParts.join("\n")].filter(Boolean).join("\n");

  const updatedEmployee = await updateEmployee(session, data.employeeId, {
    startDate: data.permanentDate,
    workType: "Үндсэн",
    trialEndDate: "",
    notes,
  });

  const attachments = await filesToAttachments(data.files);
  await attachFilesToEmployee(session, data.employeeId, attachments, `Жинхлэх тушаал ${data.permanentDate}`, "appointment_order");

  return updatedEmployee;
}

function normalizeTimeoffRequest(record: Partial<HrTimeoffRequest>): HrTimeoffRequest {
  const requestType = normalizeTimeoffRequestType(record.requestType);
  return {
    id: Number(record.id || 0),
    name: record.name || "",
    employeeId: Number(record.employeeId || 0),
    employeeName: record.employeeName || "Ажилтан сонгоогүй",
    departmentId: record.departmentId ?? null,
    departmentName: getHrDepartmentDisplayName(record.departmentName || "Хэлтэсгүй"),
    requestType,
    requestTypeLabel: record.requestTypeLabel || timeoffRequestTypeLabel(requestType),
    dateFrom: record.dateFrom || "",
    dateTo: record.dateTo || "",
    durationDays: Number(record.durationDays || dayCount(record.dateFrom || "", record.dateTo || "")),
    orderNumber: record.orderNumber || "",
    reason: record.reason || "",
    note: record.note || "",
    hrNote: record.hrNote || "",
    rejectionReason: record.rejectionReason || "",
    state: record.state || "draft",
    stateLabel: record.stateLabel || timeoffStateLabel(record.state || "draft"),
    submittedBy: record.submittedBy || "",
    submittedDate: record.submittedDate || "",
    reviewedBy: record.reviewedBy || "",
    approvedBy: record.approvedBy || "",
    rejectedBy: record.rejectedBy || "",
    hasAttachment: Boolean(record.hasAttachment),
    attachmentIds: Array.isArray(record.attachmentIds) ? record.attachmentIds : [],
    canEdit: Boolean(record.canEdit),
    canApprove: Boolean(record.canApprove),
  };
}

function normalizeTimeoffSearchRecord(record: HrTimeoffRequestSearchRecord): HrTimeoffRequest {
  const requestType = normalizeTimeoffRequestType(record.request_type);
  const state = (record.state || "draft") as HrTimeoffRequestState;
  const dateFrom = String(record.date_from || "");
  const dateTo = String(record.date_to || "");

  return {
    id: Number(record.id || 0),
    name: String(record.name || ""),
    employeeId: getRelationId(record.employee_id) || 0,
    employeeName: getRelationName(record.employee_id, "Ажилтан сонгоогүй"),
    departmentId: getRelationId(record.department_id),
    departmentName: getHrDepartmentDisplayName(getRelationName(record.department_id, "Хэлтэсгүй")),
    requestType,
    requestTypeLabel: timeoffRequestTypeLabel(requestType),
    dateFrom,
    dateTo,
    durationDays: Number(record.duration_days || dayCount(dateFrom, dateTo)),
    orderNumber: String(record.order_no || ""),
    reason: String(record.reason || ""),
    note: String(record.note || ""),
    hrNote: String(record.hr_note || ""),
    rejectionReason: String(record.rejection_reason || ""),
    state,
    stateLabel: timeoffStateLabel(state),
    submittedBy: getRelationName(record.submitted_by),
    submittedDate: String(record.submitted_date || ""),
    reviewedBy: getRelationName(record.reviewed_by),
    approvedBy: getRelationName(record.approved_by),
    rejectedBy: getRelationName(record.rejected_by),
    hasAttachment: Boolean(record.attachment_ids?.length),
    attachmentIds: Array.isArray(record.attachment_ids) ? record.attachment_ids : [],
    canEdit: !["approved", "rejected", "cancelled"].includes(state),
    canApprove: false,
  };
}

async function scopeTimeoffRequestsForProfile(
  session: AppSession,
  requests: HrTimeoffRequest[],
  profile: Awaited<ReturnType<typeof getHrAccessProfile>>,
) {
  if (profile.scope === "hr") {
    return requests;
  }
  const employees = await getEmployees(session);
  const employeeIds = new Set(employees.map((employee) => employee.id));
  const departmentId = profile.employee.departmentId;
  const departmentName = normalizeText(getHrDepartmentDisplayName(profile.employee.departmentName));

  return requests.filter((request) => {
    if (employeeIds.has(request.employeeId)) {
      return true;
    }
    if (departmentId && request.departmentId) {
      return request.departmentId === departmentId;
    }
    return departmentName ? normalizeText(getHrDepartmentDisplayName(request.departmentName)) === departmentName : false;
  });
}

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function requestCoversToday(request: HrTimeoffRequest, today: string) {
  return request.state === "approved" && request.dateFrom <= today && request.dateTo >= today;
}

function buildScopedTimeoffDashboard(
  employees: HrEmployeeDirectoryItem[],
  requests: HrTimeoffRequest[],
  scope: "hr" | "department",
  departmentName = "",
): HrTimeoffDashboardData {
  const today = getTodayKey();
  const currentByEmployee = new Map<number, HrTimeoffRequestType>();

  for (const request of requests) {
    if (!requestCoversToday(request, today)) continue;
    const previous = currentByEmployee.get(request.employeeId);
    if (!previous || timeoffStatusPriority(request.requestType) > timeoffStatusPriority(previous)) {
      currentByEmployee.set(request.employeeId, request.requestType);
    }
  }

  let activeEmployees = 0;
  let timeOffEmployees = 0;
  let annualLeaveEmployees = 0;
  let sickEmployees = 0;
  let archivedEmployees = 0;
  const departmentRows = new Map<string, HrTimeoffDashboardData["departmentBreakdown"][number]>();

  for (const employee of employees) {
    const key = String(employee.departmentId || employee.departmentName || "Хэлтэсгүй");
    if (!departmentRows.has(key)) {
      departmentRows.set(key, {
        departmentId: employee.departmentId || 0,
        departmentName: employee.departmentName || "Хэлтэсгүй",
        totalEmployees: 0,
        activeEmployees: 0,
        timeOffEmployees: 0,
        annualLeaveEmployees: 0,
        sickEmployees: 0,
        pendingRequests: 0,
      });
    }
    const dynamicStatus = currentByEmployee.get(employee.id);
    if (!employee.active || ["archived", "terminated", "resigned"].includes(employee.statusKey)) {
      archivedEmployees += 1;
      continue;
    }

    const row = departmentRows.get(key)!;
    row.totalEmployees += 1;

    if (dynamicStatus === "sick") {
      sickEmployees += 1;
      row.sickEmployees += 1;
    } else if (dynamicStatus === "annual_leave") {
      annualLeaveEmployees += 1;
      row.annualLeaveEmployees += 1;
    } else if (dynamicStatus === "time_off") {
      timeOffEmployees += 1;
      row.timeOffEmployees += 1;
    } else {
      activeEmployees += 1;
      row.activeEmployees += 1;
    }
  }

  for (const request of requests) {
    if (!["submitted", "hr_review"].includes(request.state)) continue;
    const key = String(request.departmentId || request.departmentName || "Хэлтэсгүй");
    const row = departmentRows.get(key);
    if (row) {
      row.pendingRequests += 1;
    }
  }

  return {
    scope,
    departmentName,
    cards: {
      totalEmployees: activeEmployees + timeOffEmployees + annualLeaveEmployees + sickEmployees,
      activeEmployees,
      timeOffEmployees,
      annualLeaveEmployees,
      sickEmployees,
      archivedEmployees,
      pendingRequests: requests.filter((request) => ["submitted", "hr_review"].includes(request.state)).length,
      approvedRequests: requests.filter((request) => request.state === "approved").length,
      rejectedRequests: requests.filter((request) => request.state === "rejected").length,
    },
    statusPie: [
      { label: "Идэвхтэй", value: activeEmployees },
      { label: "Чөлөөтэй", value: timeOffEmployees },
      { label: "Ээлжийн амралттай", value: annualLeaveEmployees },
      { label: "Өвчтэй", value: sickEmployees },
    ],
    departmentBreakdown: Array.from(departmentRows.values()).sort((left, right) =>
      compareHrDepartmentNames(left.departmentName, right.departmentName),
    ),
    latestRequests: requests.slice(0, 10),
  };
}

function timeoffStateLabel(state: string) {
  switch (state) {
    case "draft":
      return "Ноорог";
    case "submitted":
      return "Илгээсэн";
    case "hr_review":
      return "HR шалгаж байна";
    case "approved":
      return "Батлагдсан";
    case "rejected":
      return "Татгалзсан";
    case "cancelled":
      return "Цуцлагдсан";
    default:
      return state || "Тодорхойгүй";
  }
}

function normalizeSelectionOptions(value: unknown): HrSelectionOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!Array.isArray(item) || item.length < 2) {
        return null;
      }
      const id = String(item[0] ?? "").trim();
      const name = String(item[1] ?? "").trim();
      return id && name ? { id, name } : null;
    })
    .filter((item): item is HrSelectionOption => Boolean(item));
}

export async function getDisciplineActionOptions(session: AppSession): Promise<HrSelectionOption[]> {
  try {
    const fields = await executeOdooKw<Record<string, { selection?: unknown }>>(
      "municipal.discipline",
      "fields_get",
      [["action_type"]],
      { attributes: ["string", "type", "selection"] },
      getConnection(session),
    );
    const options = normalizeSelectionOptions(fields.action_type?.selection);
    if (options.length) {
      return options;
    }
  } catch (error) {
    console.warn("Odoo discipline action_type selection could not be loaded:", error);
  }

  return [
    { id: "warning", name: "Сануулга" },
    { id: "deduction", name: "20% цалингийн суутгал" },
    { id: "termination_proposal", name: "Ажлаас чөлөөлөх санал" },
  ];
}

export async function getDisciplineViolationOptions(session: AppSession): Promise<HrSelectionOption[]> {
  try {
    const fields = await executeOdooKw<Record<string, { selection?: unknown }>>(
      "municipal.discipline",
      "fields_get",
      [["violation_type"]],
      { attributes: ["string", "type", "selection"] },
      getConnection(session),
    );
    const options = normalizeSelectionOptions(fields.violation_type?.selection).filter((option) => option.id !== "attendance");
    if (options.length) {
      return options;
    }
  } catch (error) {
    console.warn("Odoo discipline violation_type selection could not be loaded:", error);
  }

  return [
    { id: "safety", name: "ХАБЭА" },
    { id: "quality", name: "Чанар" },
    { id: "behavior", name: "Ёс зүй" },
    { id: "property", name: "Эд хөрөнгө" },
    { id: "no_report", name: "Тайлан өгөөгүй" },
    { id: "returned_report", name: "Тайлан буцаагдсан" },
    { id: "other", name: "Бусад" },
  ];
}

function disciplineStateLabel(state: string) {
  switch (state) {
    case "draft":
      return "Хүчинтэй";
    case "hr_review":
      return "Хүний нөөцийн хяналт";
    case "manager_review":
      return "Шууд удирдлагын хяналт";
    case "employee_explanation":
      return "Ажилтны тайлбар";
    case "admin_review":
      return "Захиргааны хяналт";
    case "approved":
      return "Хүчинтэй";
    case "archived":
      return "Ажлаас чөлөөлсөн";
    case "cancelled":
      return "Цуцлагдсан";
    default:
      return state || "Тодорхойгүй";
  }
}

export async function getDisciplineRecords(session: AppSession): Promise<HrDisciplineRecord[]> {
  const profile = await requireHrAccess(session);
  const [violationOptions, actionOptions] = await Promise.all([
    getDisciplineViolationOptions(session),
    getDisciplineActionOptions(session),
  ]);
  const violationLabels = new Map(violationOptions.map((option) => [option.id, option.name]));
  const actionLabels = new Map(actionOptions.map((option) => [option.id, option.name]));

  return executeOdooKw<HrDisciplineSearchRecord[]>(
    "municipal.discipline",
    "search_read",
    [[["state", "!=", "cancelled"]]],
    {
      fields: [
        "employee_id",
        "department_id",
        "violation_type",
        "violation_date",
        "action_type",
        "state",
        "repeated",
        "repeated_violation_count",
        "explanation",
        "employee_explanation",
        "attachment_ids",
      ],
      order: "violation_date desc, id desc",
      limit: 300,
    },
    getConnection(session),
  )
      .then((records) => {
        const mappedRecords = records.map((record) => {
          const violationType = String(record.violation_type || "");
          const actionType = String(record.action_type || "");
          const state = String(record.state || "approved") === "draft" ? "approved" : String(record.state || "approved");
        return {
          id: record.id,
          employeeId: getRelationId(record.employee_id),
          employeeName: getRelationName(record.employee_id, "Ажилтан бүртгээгүй"),
          departmentId: getRelationId(record.department_id),
          departmentName: getHrDepartmentDisplayName(getRelationName(record.department_id, "Хэлтэс бүртгээгүй")),
          violationType,
          violationTypeLabel: violationLabels.get(violationType) || (violationType === "attendance" ? "Ирц" : violationType) || "Тодорхойгүй",
          violationDate: String(record.violation_date || ""),
          actionType,
          actionTypeLabel: actionLabels.get(actionType) || actionType || "Тодорхойгүй",
          state,
          stateLabel: disciplineStateLabel(state),
          repeated: Boolean(record.repeated),
          repeatedViolationCount: Number(record.repeated_violation_count || 0),
          explanation: String(record.explanation || ""),
          employeeExplanation: String(record.employee_explanation || ""),
            hasAttachment: Boolean(record.attachment_ids?.length),
          };
        });

        if (profile.scope === "hr") {
          return mappedRecords;
        }

        const departmentId = profile.employee.departmentId;
        const departmentName = normalizeText(getHrDepartmentDisplayName(profile.employee.departmentName));
        return mappedRecords.filter((record) => {
          if (departmentId && record.departmentId) {
            return record.departmentId === departmentId;
          }
          return departmentName ? normalizeText(getHrDepartmentDisplayName(record.departmentName)) === departmentName : false;
        });
      })
    .catch((error) => {
      console.warn("HR discipline records could not be loaded:", error);
      return [];
    });
}

export async function createDiscipline(session: AppSession, data: HrDisciplineCreateInput) {
  await requireHrSpecialistAccess(session);
  const attachments = await filesToAttachments(data.files);
  const currentUser = await readCurrentUser(session).catch(() => null);
  const values: Record<string, unknown> = {
    employee_id: data.employeeId,
    violation_type: data.violationType,
    violation_date: data.violationDate,
    action_type: data.actionType,
    state: "approved",
    approved_by: currentUser?.id || false,
    explanation: data.explanation || false,
    employee_explanation: data.employeeExplanation || false,
  };

  if (data.actionType === "deduction" || data.actionType.includes("20")) {
    values.deduction_percent = 20;
  }

  let disciplineId = 0;
  try {
    const result = await executeOdooKw<unknown>(
      "hr.employee",
      "create_hr_custom_mn_discipline",
      [{ values, attachments }],
      {},
      getConnection(session),
    );
    disciplineId = getOdooResultId(result);
  } catch (error) {
    if (!isMissingHrCustomEmployeeApiError(error)) {
      throw error;
    }
    console.warn("HR custom discipline create API unavailable, falling back to direct municipal.discipline create:", error);
  }
  if (!disciplineId) {
    disciplineId = await executeOdooKw<number>(
      "municipal.discipline",
      "create",
      [values],
      {},
      getConnection(session),
    );
    await attachFilesToDiscipline(session, disciplineId, attachments);
  }

  return { id: disciplineId };
}

export async function updateDiscipline(session: AppSession, disciplineId: number, data: HrDisciplineUpdateInput) {
  await requireHrSpecialistAccess(session);
  const attachments = await filesToAttachments(data.files);
  const currentUser = await readCurrentUser(session).catch(() => null);
  const values: Record<string, unknown> = {
    employee_id: data.employeeId,
    violation_type: data.violationType,
    violation_date: data.violationDate,
    action_type: data.actionType,
    state: "approved",
    approved_by: currentUser?.id || false,
    explanation: data.explanation || false,
    employee_explanation: data.employeeExplanation || false,
  };

  if (data.actionType === "deduction" || data.actionType.includes("20")) {
    values.deduction_percent = 20;
  } else {
    values.deduction_percent = 0;
  }

  let updatedThroughCustomApi = false;
  try {
    const result = await executeOdooKw<unknown>(
      "hr.employee",
      "update_hr_custom_mn_discipline",
      [disciplineId, { values, attachments }],
      {},
      getConnection(session),
    );
    updatedThroughCustomApi = getOdooResultId(result) === disciplineId;
  } catch (error) {
    if (!isMissingHrCustomEmployeeApiError(error)) {
      throw error;
    }
    console.warn("HR custom discipline update API unavailable, falling back to direct municipal.discipline write:", error);
  }
  if (!updatedThroughCustomApi) {
    await executeOdooKw<boolean>(
      "municipal.discipline",
      "write",
      [[disciplineId], values],
      {},
      getConnection(session),
    );
    await attachFilesToDiscipline(session, disciplineId, attachments);
  }

  return { id: disciplineId };
}

export async function deleteDiscipline(session: AppSession, disciplineId: number) {
  await requireHrSpecialistAccess(session);
  try {
    await executeOdooKw<boolean>(
      "municipal.discipline",
      "unlink",
      [[disciplineId]],
      {},
      getConnection(session),
    );
  } catch (error) {
    if (!isOdooAccessError(error)) {
      throw error;
    }
    await executeOdooKw<boolean>(
      "municipal.discipline",
      "write",
      [[disciplineId], { state: "cancelled" }],
      {},
      getConnection(session),
    );
  }
  return { id: disciplineId };
}

function isOdooAccessError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLocaleLowerCase("en-US");
  return (
    normalized.includes("access denied") ||
    normalized.includes("access error") ||
    normalized.includes("not allowed") ||
    normalized.includes("эрх хүрэлцэхгүй") ||
    normalized.includes("зөвшөөрөгдөөгүй")
  );
}

async function attachFilesToDiscipline(
  session: AppSession,
  disciplineId: number,
  attachments: Awaited<ReturnType<typeof filesToAttachments>>,
) {
  if (!attachments.length) {
    return;
  }

  const attachmentIds: number[] = [];
  for (const attachment of attachments) {
    const attachmentId = await executeOdooKw<number>(
      "ir.attachment",
      "create",
      [
        {
          name: attachment.name,
          datas: attachment.datas,
          res_model: "municipal.discipline",
          res_id: disciplineId,
          mimetype: attachment.mimetype,
        },
      ],
      {},
      getConnection(session),
    );
    attachmentIds.push(attachmentId);
  }

  if (attachmentIds.length) {
    await executeOdooKw<boolean>(
      "municipal.discipline",
      "write",
      [[disciplineId], { attachment_ids: attachmentIds.map((id) => [4, id]) }],
      {},
      getConnection(session),
    );
  }
}

function isMissingTimeoffModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("municipal.hr.timeoff.request") || message.includes("get_hr_timeoff") || message.includes("not found");
}

export async function getTimeoffRequests(session: AppSession, filters: Record<string, unknown> = {}) {
  const profile = await requireHrAccess(session);
  let requests: HrTimeoffRequest[] = [];
  try {
    const records = await executeOdooKw<Array<Partial<HrTimeoffRequest>>>(
      "municipal.hr.timeoff.request",
      "get_hr_timeoff_request_directory",
      [filters],
      {},
      getConnection(session),
    );
    requests = records.map(normalizeTimeoffRequest);
  } catch (error) {
    if (!isMissingTimeoffModelError(error)) {
      console.warn("HR custom time off request API failed, falling back to search_read:", error);
    } else {
      console.warn("HR time off request model API is not installed yet:", error);
    }
  }

  if (!requests.length) {
    const readRequests = (connectionOverrides: Partial<ReturnType<typeof getConnection>> = {}) =>
      executeOdooKw<HrTimeoffRequestSearchRecord[]>(
        "municipal.hr.timeoff.request",
        "search_read",
        [[]],
        {
          fields: [
            "name",
            "employee_id",
            "department_id",
            "request_type",
            "date_from",
            "date_to",
            "duration_days",
            "order_no",
            "reason",
            "note",
            "hr_note",
            "rejection_reason",
            "state",
            "submitted_by",
            "submitted_date",
            "reviewed_by",
            "approved_by",
            "rejected_by",
            "attachment_ids",
          ],
          order: "submitted_date desc, id desc",
          limit: 300,
          context: { active_test: false },
        },
        connectionOverrides,
      );

    try {
      const records = await readRequests(getConnection(session));
      requests = records.map(normalizeTimeoffSearchRecord);
    } catch (error) {
      if (!isMissingTimeoffModelError(error)) {
        console.warn("HR time off request session search_read failed, retrying with service account:", error);
      }
      try {
        const records = await readRequests();
        requests = records.map(normalizeTimeoffSearchRecord);
      } catch (serviceError) {
        if (isMissingTimeoffModelError(serviceError)) {
          return [];
        }
        console.warn("HR time off request service search_read failed:", serviceError);
        return [];
      }
    }
  }

  return scopeTimeoffRequestsForProfile(session, requests, profile);
}

export async function getTimeoffDashboard(session: AppSession): Promise<HrTimeoffDashboardData> {
  const profile = await requireHrAccess(session);
  if (profile.scope !== "hr") {
    const [employees, requests] = await Promise.all([getEmployees(session), getTimeoffRequests(session)]);
    return buildScopedTimeoffDashboard(employees, requests, "department", getHrDepartmentDisplayName(profile.employee.departmentName));
  }

  try {
    const dashboard = await executeOdooKw<HrTimeoffDashboardData>(
      "municipal.hr.timeoff.request",
      "get_hr_timeoff_dashboard_data",
      [],
      {},
      getConnection(session),
    );
    return {
      ...emptyTimeoffDashboard(profile.scope, getHrDepartmentDisplayName(profile.employee.departmentName)),
      ...dashboard,
      cards: {
        ...emptyTimeoffDashboard(profile.scope).cards,
        ...(dashboard.cards || {}),
      },
      latestRequests: (dashboard.latestRequests || []).map(normalizeTimeoffRequest),
    };
  } catch (error) {
    if (!isMissingTimeoffModelError(error)) {
      console.warn("HR time off dashboard could not be loaded:", error);
    }
  }

  const employees = await getEmployees(session);
  const activeEmployees = employees.filter((employee) => employee.active && !["archived", "terminated", "resigned"].includes(employee.statusKey));
  return {
    ...emptyTimeoffDashboard(profile.scope, getHrDepartmentDisplayName(profile.employee.departmentName)),
    cards: {
      ...emptyTimeoffDashboard(profile.scope).cards,
      totalEmployees: activeEmployees.length,
      activeEmployees: activeEmployees.length,
      archivedEmployees: employees.length - activeEmployees.length,
    },
    statusPie: [
      { label: "Идэвхтэй", value: activeEmployees.length },
      { label: "Чөлөөтэй", value: 0 },
      { label: "Ээлжийн амралттай", value: 0 },
      { label: "Өвчтэй", value: 0 },
    ],
  };
}

export async function createTimeoffRequest(session: AppSession, data: HrTimeoffRequestCreateInput) {
  const profile = await requireDepartmentHeadTimeoffRequestAccess(session, data.requestType);
  const attachments = await filesToAttachments(data.files);
  try {
    const result = await executeOdooKw<Partial<HrTimeoffRequest>>(
      "municipal.hr.timeoff.request",
      "create_hr_timeoff_request",
      [
        {
          employeeId: data.employeeId,
          requestType: data.requestType,
          dateFrom: data.dateFrom,
          dateTo: data.dateTo,
          durationDays: data.durationDays,
          orderNumber: data.orderNumber,
          reason: data.reason,
          note: data.note,
          submit: data.submit,
          autoApprove: profile.isHr && data.requestType === "annual_leave",
          attachments,
        },
      ],
      {},
      getConnection(session),
    );
    return normalizeTimeoffRequest(result);
  } catch (error) {
    if (isMissingTimeoffModelError(error)) {
      throw new Error("hr_custom_mn module шинэчлэгдээгүй байна. VPS дээр module upgrade/reload хийсний дараа хүсэлт илгээнэ үү.");
    }
    throw error;
  }
}

export async function updateTimeoffRequest(session: AppSession, requestId: number, data: HrTimeoffRequestCreateInput) {
  await requireDepartmentHeadTimeoffRequestAccess(session, data.requestType);
  const attachments = await filesToAttachments(data.files);
  try {
    const result = await executeOdooKw<Partial<HrTimeoffRequest>>(
      "municipal.hr.timeoff.request",
      "update_hr_timeoff_request",
      [
        [requestId],
        {
          requestType: data.requestType,
          dateFrom: data.dateFrom,
          dateTo: data.dateTo,
          durationDays: data.durationDays,
          orderNumber: data.orderNumber,
          reason: data.reason,
          note: data.note,
          submit: data.submit,
          attachments,
        },
      ],
      {},
      getConnection(session),
    );
    return normalizeTimeoffRequest(result);
  } catch (error) {
    if (isMissingTimeoffModelError(error)) {
      throw new Error("hr_custom_mn module шинэчлэгдээгүй байна. VPS дээр module upgrade/reload хийсний дараа хүсэлт засна уу.");
    }
    throw error;
  }
}

export async function actionTimeoffRequest(
  session: AppSession,
  requestId: number,
  action: "hr_review" | "approve" | "reject" | "cancel",
  payload: { hrNote?: string; rejectionReason?: string } = {},
) {
  if (action === "approve" || action === "reject" || action === "hr_review") {
    await requireHrSpecialistAccess(session);
  } else {
    await requireDepartmentHeadTimeoffRequestAccess(session);
  }
  const result = await executeOdooKw<Partial<HrTimeoffRequest>>(
    "municipal.hr.timeoff.request",
    "action_hr_timeoff_request",
    [requestId, action, payload],
    {},
    getConnection(session),
  );
  return normalizeTimeoffRequest(result);
}

export async function deleteTimeoffRequest(session: AppSession, requestId: number) {
  await requireHrAccess(session);
  return executeOdooKw<boolean>(
    "municipal.hr.timeoff.request",
    "delete_hr_timeoff_request",
    [requestId],
    {},
    getConnection(session),
  );
}

function clearanceStateLabel(state: string) {
  switch (state) {
    case "draft":
      return "Ноорог";
    case "submitted":
      return "Илгээсэн";
    case "pending":
      return "Хүлээгдэж байна";
    case "approved":
      return "Баталгаажсан";
    case "incomplete":
      return "Дутуу";
    case "done":
      return "Дууссан";
    default:
      return state || "Тодорхойгүй";
  }
}

function clearanceSectionLabel(section: string) {
  switch (section) {
    case "warehouse":
      return "Нярав";
    case "it":
      return "IT";
    case "finance":
      return "Санхүү";
    case "manager":
      return "Шууд удирдлага";
    case "hr":
      return "HR";
    default:
      return section || "Тодорхойгүй";
  }
}

function normalizeClearanceRecord(record: Partial<HrClearanceRecord>): HrClearanceRecord {
  const state = record.state || "draft";
  const section = record.section || "hr";
  return {
    id: Number(record.id || 0),
    name: record.name || "",
    employeeId: record.employeeId ?? null,
    employeeName: record.employeeName || "Ажилтан бүртгээгүй",
    departmentId: record.departmentId ?? null,
    departmentName: getHrDepartmentDisplayName(record.departmentName || "Хэлтэс бүртгээгүй"),
    jobTitle: record.jobTitle || "",
    savedDate: record.savedDate || "",
    section,
    sectionLabel: record.sectionLabel || clearanceSectionLabel(section),
    state,
    stateLabel: record.stateLabel || clearanceStateLabel(state),
    note: record.note || "",
    hasAttachment: Boolean(record.hasAttachment),
    attachmentIds: record.attachmentIds || [],
  };
}

function normalizeClearanceSearchRecord(record: HrClearanceSearchRecord): HrClearanceRecord {
  const state = String(record.state || "draft");
  const section = String(record.section || "hr");
  return {
    id: record.id,
    name: String(record.name || ""),
    employeeId: getRelationId(record.employee_id),
    employeeName: getRelationName(record.employee_id, "Ажилтан бүртгээгүй"),
    departmentId: getRelationId(record.department_id),
    departmentName: getHrDepartmentDisplayName(getRelationName(record.department_id, "Хэлтэс бүртгээгүй")),
    jobTitle: getRelationName(record.job_id),
    savedDate: String(record.saved_date || ""),
    section,
    sectionLabel: clearanceSectionLabel(section),
    state,
    stateLabel: clearanceStateLabel(state),
    note: String(record.note || ""),
    hasAttachment: Boolean(record.attachment_ids?.length),
    attachmentIds: record.attachment_ids || [],
  };
}

function isMissingClearanceModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("municipal.hr.clearance.sheet") || message.includes("get_hr_clearance_sheet") || message.includes("not found");
}

export async function getClearanceRecords(session: AppSession): Promise<HrClearanceRecord[]> {
  await requireHrSpecialistAccess(session);
  try {
    const records = await executeOdooKw<Array<Partial<HrClearanceRecord>>>(
      "municipal.hr.clearance.sheet",
      "get_hr_clearance_sheet_directory",
      [{ limit: 300 }],
      {},
      getConnection(session),
    );
    return records.map(normalizeClearanceRecord);
  } catch (error) {
    if (!isMissingClearanceModelError(error)) {
      console.warn("HR clearance directory API failed, falling back to search_read:", error);
    }
  }

  try {
    const records = await executeOdooKw<HrClearanceSearchRecord[]>(
      "municipal.hr.clearance.sheet",
      "search_read",
      [[]],
      {
        fields: ["name", "employee_id", "department_id", "job_id", "saved_date", "section", "state", "note", "attachment_ids"],
        order: "saved_date desc, id desc",
        limit: 300,
        context: { active_test: false },
      },
      getConnection(session),
    );
    return records.map(normalizeClearanceSearchRecord);
  } catch (error) {
    if (isMissingClearanceModelError(error)) {
      return [];
    }
    console.warn("HR clearance search_read failed:", error);
    return [];
  }
}

export async function createClearanceRecord(session: AppSession, data: HrClearanceCreateInput) {
  await requireHrSpecialistAccess(session);
  if (!data.employeeId) {
    throw new Error("Ажилтан заавал сонгоно уу.");
  }
  ensureDateOrder(data.savedDate, "Хадгалсан огноо");
  const attachments = await filesToAttachments(data.files);

  try {
    const result = await executeOdooKw<Partial<HrClearanceRecord>>(
      "municipal.hr.clearance.sheet",
      "create_hr_clearance_sheet",
      [
        {
          employeeId: data.employeeId,
          savedDate: data.savedDate,
          section: data.section || "hr",
          state: data.state || "draft",
          note: data.note || "",
          attachments,
        },
      ],
      {},
      getConnection(session),
    );
    return normalizeClearanceRecord(result);
  } catch (error) {
    if (isMissingClearanceModelError(error)) {
      throw new Error("hr_custom_mn module шинэчлэгдээгүй байна. VPS дээр module upgrade/reload хийсний дараа тойрох хуудас хадгална уу.");
    }
    throw error;
  }
}

export async function deleteClearanceRecord(session: AppSession, clearanceId: number) {
  await requireHrSpecialistAccess(session);
  if (!clearanceId) {
    throw new Error("Тойрох хуудасны дугаар буруу байна.");
  }

  const deleted = await executeOdooKw<boolean>(
    "municipal.hr.clearance.sheet",
    "unlink",
    [[clearanceId]],
    {},
  );

  if (!deleted) {
    throw new Error("Тойрох хуудас устгахад алдаа гарлаа.");
  }

  return { id: clearanceId, deleted: true };
}

function normalizeGeneratedReport(record: Partial<HrGeneratedReport>): HrGeneratedReport {
  return {
    id: Number(record.id || 0),
    name: record.name || "",
    reportType: (record.reportType || "employee_list") as HrReportType,
    reportTypeLabel: record.reportTypeLabel || "HR тайлан",
    dateFrom: record.dateFrom || "",
    dateTo: record.dateTo || "",
    generatedDate: record.generatedDate || "",
    generatedBy: record.generatedBy || "",
    departmentName: record.departmentName ? getHrDepartmentDisplayName(record.departmentName) : "",
    attachmentId: record.attachmentId ?? null,
    downloadUrl: record.downloadUrl || (record.id ? `/api/hr/reports/${record.id}/download` : ""),
  };
}

function isMissingHrReportArchiveModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("municipal.hr.report.archive") || message.includes("get_hr_report_archive") || message.includes("not found");
}

const HR_REPORT_LABELS: Record<HrReportType, string> = {
  employee_list: "Ажилтны жагсаалт",
  department_employee: "Хэлтэс тус бүрийн ажилтны тайлан",
  new_employee: "Шинээр орсон ажилтны тайлан",
  resigned_employee: "Ажлаас гарсан ажилтны тайлан",
  leave: "Чөлөөний тайлан",
  sick: "Өвчтэй ажилтны тайлан",
  business_trip: "Томилолтын тайлан",
  discipline: "Сахилгын тайлан",
  transfer: "Шилжилт хөдөлгөөний тайлан",
  order_contract: "Тушаал, гэрээний тайлан",
  clearance: "Тойрох хуудасны тайлан",
  archive: "Ажлаас чөлөөлсөн байдлын тайлан",
};

const FALLBACK_HR_REPORT_PREFIX = "HR_REPORT_ARCHIVE";
const FALLBACK_HR_REPORT_MODEL = "hr.custom.mn.report.wizard";

function fallbackWizardReportType(reportType: HrReportType) {
  const map: Partial<Record<HrReportType, string>> = {
    employee_list: "employee_master",
    department_employee: "department_structure",
    new_employee: "employee_master",
    resigned_employee: "employee_master",
    leave: "leave",
    sick: "leave",
    business_trip: "employee_master",
    discipline: "employee_master",
    transfer: "employee_master",
    order_contract: "missing_document",
    clearance: "employee_master",
    archive: "employee_master",
  };
  return map[reportType] || "employee_master";
}

function fallbackReportName(data: HrReportGenerateInput) {
  return `${FALLBACK_HR_REPORT_PREFIX}__${data.reportType}__${data.dateFrom}__${data.dateTo}__${HR_REPORT_LABELS[data.reportType]}.pdf`;
}

function parseFallbackReportAttachment(record: HrReportFallbackAttachmentRecord): HrGeneratedReport | null {
  const name = String(record.name || "");
  if (!name.startsWith(`${FALLBACK_HR_REPORT_PREFIX}__`)) {
    return null;
  }
  const [, reportType, dateFrom, dateTo, ...labelParts] = name.replace(/\.pdf$/i, "").split("__");
  const normalizedType = (reportType || "employee_list") as HrReportType;
  return normalizeGeneratedReport({
    id: record.id,
    name: labelParts.join("__") || HR_REPORT_LABELS[normalizedType] || name,
    reportType: normalizedType,
    reportTypeLabel: HR_REPORT_LABELS[normalizedType] || "HR тайлан",
    dateFrom: dateFrom || "",
    dateTo: dateTo || "",
    generatedDate: String(record.create_date || ""),
    generatedBy: getRelationName(record.create_uid),
    attachmentId: record.id,
    downloadUrl: `/api/hr/reports/${record.id}/download?fallback=attachment`,
  });
}

function normalizePdfPayload(result: unknown): string {
  if (Array.isArray(result)) {
    const first = result[0];
    if (typeof first === "string") {
      return first;
    }
    if (first && typeof first === "object" && "data" in first && typeof first.data === "string") {
      return first.data;
    }
  }
  if (typeof result === "string") {
    return result;
  }
  throw new Error("Odoo PDF render response буруу байна.");
}

async function fetchFallbackReportPdfOverHttp(session: AppSession, wizardId: number) {
  const connection = createOdooConnection(getConnection(session));
  const baseUrl = connection.url.replace(/\/+$/, "");
  const authResponse = await fetch(`${baseUrl}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: {
        db: connection.db,
        login: connection.login,
        password: connection.password,
      },
      id: `hr-report-auth-${Date.now()}`,
    }),
  });
  if (!authResponse.ok) {
    throw new Error(`Odoo web session нээхэд HTTP ${authResponse.status} алдаа гарлаа.`);
  }
  const authPayload = (await authResponse.json()) as { result?: { uid?: number }; error?: { message?: string } };
  if (!authPayload.result?.uid) {
    throw new Error(authPayload.error?.message || "Odoo web session нээж чадсангүй.");
  }
  const cookie = authResponse.headers.get("set-cookie")?.split(";")[0] || "";
  const pdfResponse = await fetch(`${baseUrl}/report/pdf/hr_custom_mn.report_hr_custom_mn_generic/${wizardId}`, {
    headers: cookie ? { Cookie: cookie } : {},
    cache: "no-store",
  });
  if (!pdfResponse.ok) {
    throw new Error(`Odoo PDF татахад HTTP ${pdfResponse.status} алдаа гарлаа.`);
  }
  return Buffer.from(await pdfResponse.arrayBuffer()).toString("base64");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function readCompanyForFallbackPdf(session: AppSession) {
  const companies = await executeOdooKw<HrCompanyLogoRecord[]>(
    "res.company",
    "search_read",
    [[]],
    { fields: ["name", "logo", "logo_web"], limit: 1 },
    getConnection(session),
  ).catch(() => []);
  return companies[0] || null;
}

async function renderFallbackPdfWithPlaywright(
  session: AppSession,
  title: string,
  dateFrom: string,
  dateTo: string,
  headers: string[],
  rows: HrReportLine[],
) {
  const { chromium } = await import("playwright");
  const company = await readCompanyForFallbackPdf(session);
  const logo = company?.logo || company?.logo_web || "";
  const html = `<!doctype html>
<html lang="mn">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 landscape; margin: 14mm; }
    * { box-sizing: border-box; }
    html, body, table, th, td, h1, p, div, span { font-family: Arial, sans-serif !important; }
    body { margin: 0; color: #1f2b25; font-size: 12pt; }
    header { display: block; margin-bottom: 16px; }
    .logo { width: 64px; height: 64px; object-fit: contain; }
    .placeholder { display: grid; width: 64px; height: 64px; place-items: center; border: 1px solid #cfd8d1; color: #2e7d32; font-weight: 700; }
    h1 { margin: 0 0 6px; font-size: 16pt; line-height: 1.2; }
    .meta { color: #526257; font-size: 12pt; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { padding: 7px 6px; border: 1px solid #d9e3dc; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #eef7ef; color: #244d2f; font-weight: 700; }
    tbody tr:nth-child(even) td { background: #f8fbf8; }
    footer { margin-top: 12px; color: #66766b; font-size: 12pt; }
  </style>
</head>
<body>
  <header>
    ${logo ? `<img class="logo" src="data:image/png;base64,${logo}" alt="Лого" />` : `<div class="placeholder">Лого</div>`}
  </header>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta"><strong>Хугацаа:</strong> ${escapeHtml(dateFrom)} - ${escapeHtml(dateTo)}</div>
  <table>
    <thead>
      <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${
        rows.length
          ? rows
              .map((line) => `<tr>${(line.values || []).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`)
              .join("")
          : `<tr><td colspan="${Math.max(headers.length, 1)}">Бүртгэл олдсонгүй.</td></tr>`
      }
    </tbody>
  </table>
  <footer>Тайлан гаргасан огноо: ${escapeHtml(new Date().toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar" }))}</footer>
</body>
</html>`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", landscape: true, printBackground: true });
    return Buffer.from(pdf).toString("base64");
  } finally {
    await browser.close();
  }
}

async function buildNextFallbackReportData(session: AppSession, data: HrReportGenerateInput): Promise<[HrReportLine[], string[]]> {
  if (data.reportType === "leave" || data.reportType === "sick") {
    const requestType: HrTimeoffRequestType = data.reportType === "sick" ? "sick" : "time_off";
    const requests = await getTimeoffRequests(session, { requestType, departmentId: data.departmentId || undefined });
    const filtered = requests.filter((request) => {
      if (data.dateFrom && request.dateTo < data.dateFrom) return false;
      if (data.dateTo && request.dateFrom > data.dateTo) return false;
      return true;
    });
    return [
      filtered.map((request) => ({
        values: [
          request.employeeName,
          request.departmentName,
          request.dateFrom,
          request.dateTo,
          request.durationDays,
          request.stateLabel,
          request.reason || request.note,
        ],
      })),
      ["Ажилтан", "Хэлтэс", "Эхлэх", "Дуусах", "Нийт өдөр", "Төлөв", "Шалтгаан"],
    ];
  }

  const employees = await getEmployees(session);
  const filteredEmployees = data.departmentId
    ? employees.filter((employee) => employee.departmentId === data.departmentId)
    : employees;
  return [
    filteredEmployees.map((employee) => ({
      values: [
        employee.employeeCode,
        employee.name,
        employee.departmentName,
        employee.jobTitle,
        employee.mobilePhone,
        employee.workEmail,
        employee.statusLabel,
      ],
    })),
    ["Код", "Овог нэр", "Хэлтэс", "Албан тушаал", "Утас", "И-мэйл", "Төлөв"],
  ];
}

async function getFallbackGeneratedHrReports(
  session: AppSession,
  filters: { reportType?: string; dateFrom?: string; dateTo?: string } = {},
) {
  const domain: unknown[] = [
    ["res_model", "=", FALLBACK_HR_REPORT_MODEL],
    ["name", "ilike", `${FALLBACK_HR_REPORT_PREFIX}__`],
  ];
  if (filters.reportType) {
    domain.push(["name", "ilike", `${FALLBACK_HR_REPORT_PREFIX}__${filters.reportType}__`]);
  }
  const records = await executeOdooKw<HrReportFallbackAttachmentRecord[]>(
    "ir.attachment",
    "search_read",
    [domain],
    {
      fields: ["name", "create_date", "create_uid", "mimetype"],
      order: "create_date desc, id desc",
      limit: 500,
    },
    getConnection(session),
  );
  return records
    .map(parseFallbackReportAttachment)
    .filter((record): record is HrGeneratedReport => Boolean(record))
    .filter((record) => {
      if (filters.dateFrom && record.dateTo < filters.dateFrom) return false;
      if (filters.dateTo && record.dateFrom > filters.dateTo) return false;
      return true;
    });
}

async function generateFallbackHrReport(session: AppSession, data: HrReportGenerateInput) {
  const wizardId = await executeOdooKw<number>(
    "hr.custom.mn.report.wizard",
    "create",
    [
      {
        report_type: fallbackWizardReportType(data.reportType),
        output_format: "pdf",
        date_from: data.dateFrom,
        date_to: data.dateTo,
        department_id: data.departmentId || false,
      },
    ],
    {},
    getConnection(session),
  );
  let datas = "";
  if (data.reportType === "leave" || data.reportType === "sick") {
    const reportData = await buildNextFallbackReportData(session, data);
    datas = await renderFallbackPdfWithPlaywright(
      session,
      HR_REPORT_LABELS[data.reportType],
      data.dateFrom,
      data.dateTo,
      reportData[1],
      reportData[0],
    );
  } else {
    try {
      const rendered = await executeOdooKw<unknown>(
        "ir.actions.report",
        "_render_qweb_pdf",
        ["hr_custom_mn.report_hr_custom_mn_generic", [wizardId]],
        {},
        getConnection(session),
      );
      datas = normalizePdfPayload(rendered);
    } catch (error) {
      console.warn("HR fallback report RPC render failed, retrying over Odoo HTTP report route:", error);
      try {
        datas = await fetchFallbackReportPdfOverHttp(session, wizardId);
      } catch (httpError) {
        console.warn("HR fallback report HTTP render failed, rendering PDF in Next server:", httpError);
        let reportData: [HrReportLine[], string[]];
        try {
          reportData = await executeOdooKw<[HrReportLine[], string[]]>(
            "hr.custom.mn.report.wizard",
            "get_report_lines",
            [[wizardId]],
            {},
            getConnection(session),
          );
        } catch (linesError) {
          console.warn("HR fallback report wizard lines failed, rendering from Next data:", linesError);
          reportData = await buildNextFallbackReportData(session, data);
        }
        datas = await renderFallbackPdfWithPlaywright(
          session,
          HR_REPORT_LABELS[data.reportType],
          data.dateFrom,
          data.dateTo,
          reportData[1] || [],
          reportData[0] || [],
        );
      }
    }
  }
  const name = fallbackReportName(data);
  const attachmentId = await executeOdooKw<number>(
    "ir.attachment",
    "create",
    [
      {
        name,
        type: "binary",
        datas,
        mimetype: "application/pdf",
        res_model: FALLBACK_HR_REPORT_MODEL,
        res_id: wizardId,
      },
    ],
    {},
    getConnection(session),
  );
  return normalizeGeneratedReport({
    id: attachmentId,
    name: HR_REPORT_LABELS[data.reportType],
    reportType: data.reportType,
    reportTypeLabel: HR_REPORT_LABELS[data.reportType],
    dateFrom: data.dateFrom,
    dateTo: data.dateTo,
    attachmentId,
    downloadUrl: `/api/hr/reports/${attachmentId}/download?fallback=attachment`,
  });
}

export async function getGeneratedHrReports(
  session: AppSession,
  filters: { reportType?: string; dateFrom?: string; dateTo?: string } = {},
): Promise<HrGeneratedReport[]> {
  await requireHrSpecialistAccess(session);
  try {
    const records = await executeOdooKw<Array<Partial<HrGeneratedReport>>>(
      "municipal.hr.report.archive",
      "get_hr_report_archive_directory",
      [{ ...filters, limit: 500 }],
      {},
      getConnection(session),
    );
    return records.map(normalizeGeneratedReport);
  } catch (error) {
    if (isMissingHrReportArchiveModelError(error)) {
      return getFallbackGeneratedHrReports(session, filters).catch(() => []);
    }
    console.warn("HR generated report archive could not be loaded:", error);
    return [];
  }
}

export async function generateHrReport(session: AppSession, data: HrReportGenerateInput) {
  await requireHrSpecialistAccess(session);
  ensureDateOrder(data.dateFrom, "Эхлэх огноо");
  ensureDateOrder(data.dateTo, "Дуусах огноо");
  if (data.dateTo < data.dateFrom) {
    throw new Error("Дуусах огноо эхлэх огнооноос өмнө байж болохгүй.");
  }
  try {
    const report = await executeOdooKw<Partial<HrGeneratedReport>>(
      "municipal.hr.report.archive",
      "generate_hr_report_archive",
      [
        {
          reportType: data.reportType,
          dateFrom: data.dateFrom,
          dateTo: data.dateTo,
          departmentId: data.departmentId || false,
        },
      ],
      {},
      getConnection(session),
    );
    return normalizeGeneratedReport(report);
  } catch (error) {
    if (isMissingHrReportArchiveModelError(error)) {
      return generateFallbackHrReport(session, data);
    }
    throw error;
  }
}

export async function deleteGeneratedHrReport(session: AppSession, reportId: number) {
  await requireHrSpecialistAccess(session);
  if (!reportId) {
    throw new Error("Тайлангийн дугаар буруу байна.");
  }
  let deleted = false;
  try {
    deleted = await executeOdooKw<boolean>("municipal.hr.report.archive", "unlink", [[reportId]], {}, getConnection(session));
  } catch (error) {
    if (!isMissingHrReportArchiveModelError(error)) {
      throw error;
    }
    deleted = await executeOdooKw<boolean>("ir.attachment", "unlink", [[reportId]], {}, getConnection(session));
  }
  if (!deleted) {
    throw new Error("Тайлан устгахад алдаа гарлаа.");
  }
  return { id: reportId, deleted: true };
}

export async function getGeneratedHrReportPdf(session: AppSession, reportId: number): Promise<HrReportPdfPayload> {
  await requireHrSpecialistAccess(session);
  if (!reportId) {
    throw new Error("Тайлангийн дугаар буруу байна.");
  }
  try {
    return await executeOdooKw<HrReportPdfPayload>(
      "municipal.hr.report.archive",
      "get_pdf_payload",
      [[reportId]],
      {},
      getConnection(session),
    );
  } catch (error) {
    if (!isMissingHrReportArchiveModelError(error)) {
      throw error;
    }
    const attachments = await executeOdooKw<HrReportFallbackAttachmentRecord[]>(
      "ir.attachment",
      "search_read",
      [[["id", "=", reportId], ["name", "ilike", `${FALLBACK_HR_REPORT_PREFIX}__`]]],
      { fields: ["name", "mimetype", "datas"], limit: 1 },
      getConnection(session),
    );
    const attachment = attachments[0];
    if (!attachment?.datas) {
      throw new Error("PDF файл олдсонгүй.");
    }
    return {
      name: String(attachment.name || "hr-report.pdf"),
      mimetype: String(attachment.mimetype || "application/pdf"),
      datas: String(attachment.datas),
    };
  }
}

export async function getHrStats(session: AppSession): Promise<HrStats> {
  const [employees, timeoffDashboard, activeDiscipline, completedDiscipline, pendingClearance] = await Promise.all([
    getEmployees(session),
    getTimeoffDashboard(session),
    executeOdooKw<number>(
      "municipal.discipline",
      "search_count",
      [[["state", "not in", ["cancelled", "archived", "approved"]]]],
      {},
      getConnection(session),
    ).catch(() => 0),
    executeOdooKw<number>(
      "municipal.discipline",
      "search_count",
      [[["state", "in", ["approved", "archived"]]]],
      {},
      getConnection(session),
    ).catch(() => 0),
    executeOdooKw<number>(
      "municipal.hr.clearance.sheet",
      "search_count",
      [[["state", "in", ["submitted", "pending", "incomplete"]]]],
      {},
      getConnection(session),
    ).catch(() => 0),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const monthStart = today.slice(0, 8) + "01";
  const activeEmployees = employees.filter((employee) => employee.active);
  const resignedEmployees = employees.filter((employee) => ["resigned", "terminated"].includes(employee.statusKey));
  const archivedEmployees = employees.filter((employee) => !employee.active || employee.statusKey === "archived");
  const newEmployees = employees.filter((employee) => employee.startDate && employee.startDate >= monthStart);
  const expiringContracts = activeEmployees.filter((employee) => {
    if (!employee.contractEndDate) return false;
    const end = new Date(`${employee.contractEndDate}T00:00:00`);
    const now = new Date(`${today}T00:00:00`);
    if (Number.isNaN(end.getTime())) return false;
    return end >= now && end.getTime() - now.getTime() <= 60 * 86_400_000;
  });
  const missingAttachmentEmployees = activeEmployees.filter((employee) => employee.missingDocumentCount > 0);

  return {
    totalEmployees: employees.length,
    activeEmployees: timeoffDashboard.cards.activeEmployees || activeEmployees.length,
    leaveToday: timeoffDashboard.cards.timeOffEmployees,
    sickToday: timeoffDashboard.cards.sickEmployees,
    businessTripToday: 0,
    newEmployees: newEmployees.length,
    resignedEmployees: resignedEmployees.length,
    archivedEmployees: archivedEmployees.length,
    activeDiscipline,
    completedDiscipline,
    transfers: 0,
    expiringContracts: expiringContracts.length,
    missingAttachmentEmployees: missingAttachmentEmployees.length,
    pendingClearance,
  };
}
