import "server-only";

import type { AppSession } from "@/lib/auth";
import { executeOdooKw, type HrEmployeeDirectoryItem, loadHrEmployeeDirectory } from "@/lib/odoo";

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
  groups_id?: number[];
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
  x_mn_employee_code?: string | false;
  x_mn_grade_rank?: string | false;
  x_mn_employment_status?: string | false;
  x_mn_missing_document_count?: number | false;
  x_mn_performance_score?: number | false;
  x_mn_task_completion_percent?: number | false;
  x_mn_discipline_score?: number | false;
};

type HrEmployeeDirectoryApiRecord = {
  id: number;
  name?: string;
  active?: boolean;
  departmentId?: number | null;
  departmentName?: string;
  jobTitle?: string;
  workPhone?: string;
  mobilePhone?: string;
  workEmail?: string;
  userName?: string;
  photo?: string | false;
  photoUrl?: string;
  employeeCode?: string;
  gradeRank?: string;
  statusKey?: string;
  statusLabel?: string;
  managerName?: string;
  startDate?: string;
  contractEndDate?: string;
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

export type HrTimeoffRequestType = "time_off" | "sick";
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
  note?: string;
};

export type HrEmployeeTransferInput = {
  employeeId: number;
  newDepartmentId?: number;
  newJobId?: number;
  newManagerId?: number;
  effectiveDate: string;
  reason: string;
  files?: File[];
};

export type HrEmployeeTerminationInput = {
  employeeId: number;
  terminationDate: string;
  reason: string;
  note?: string;
  files?: File[];
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
  note?: string;
  confirm?: boolean;
  files?: File[];
};

export type HrTimeoffRequestCreateInput = {
  employeeId: number;
  requestType: HrTimeoffRequestType;
  dateFrom: string;
  dateTo: string;
  reason: string;
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
  return String(value ?? "").trim().toLocaleLowerCase("mn-MN");
}

function containsHrText(value: unknown) {
  const normalized = normalizeText(value);
  return HR_TEXT_TOKENS.some((token) => normalized.includes(token));
}

function containsAnyText(value: unknown, tokens: string[]) {
  const normalized = normalizeText(value);
  return tokens.some((token) => normalized.includes(token));
}

function isHrRoleKey(value: unknown) {
  return HR_ROLE_KEYS.has(normalizeText(value));
}

function isDepartmentHeadRoleKey(value: unknown) {
  return DEPARTMENT_HEAD_ROLES.has(normalizeText(value));
}

function isDepartmentHeadGroupName(value: unknown) {
  const normalized = normalizeText(value);
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

function imageDataUrlFromBase64(value?: string | false) {
  return value ? `data:image/png;base64,${value}` : "";
}

function mapHrEmployeeDirectoryApiRecord(record: HrEmployeeDirectoryApiRecord): HrEmployeeDirectoryItem {
  return {
    id: record.id,
    name: record.name || `Ажилтан #${record.id}`,
    active: record.active !== false,
    departmentId: record.departmentId ?? null,
    departmentName: record.departmentName || "Хэлтэсгүй",
    jobTitle: record.jobTitle || "Албан тушаал бүртгээгүй",
    workPhone: record.workPhone || "",
    mobilePhone: record.mobilePhone || "",
    workEmail: record.workEmail || "",
    userName: record.userName || "",
    photoUrl: record.photoUrl || imageDataUrlFromBase64(record.photo),
    employeeCode: record.employeeCode || `EMP-${String(record.id).padStart(5, "0")}`,
    gradeRank: record.gradeRank || "",
    statusKey: record.statusKey || (record.active === false ? "archived" : "active"),
    statusLabel: record.statusLabel || (record.active === false ? "Архивласан" : "Идэвхтэй"),
    managerName: record.managerName || "",
    startDate: record.startDate || "",
    contractEndDate: record.contractEndDate || "",
    birthDate: record.birthDate || "",
    genderKey: record.genderKey || "",
    genderLabel: record.genderLabel || "",
    educationLevel: record.educationLevel || "",
    missingDocumentCount: Number(record.missingDocumentCount || 0),
    kpiScore: Number(record.kpiScore || 0),
    taskCompletionPercent: Number(record.taskCompletionPercent || 0),
    disciplineScore: Number(record.disciplineScore || 0),
  };
}

function resolveDirectEmployeeStatus(record: HrEmployeeSingleSearchRecord) {
  if (record.active === false) {
    return { key: "archived", label: "Архивласан" };
  }

  const key = record.x_mn_employment_status || "active";
  const labels: Record<string, string> = {
    active: "Идэвхтэй",
    probation: "Туршилт",
    leave: "Чөлөөтэй",
    sick: "Өвчтэй",
    business_trip: "Томилолттой",
    suspended: "Түдгэлзсэн",
    terminated: "Чөлөөлөгдсөн",
    resigned: "Ажлаас гарсан",
    archived: "Архивласан",
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

function mapHrEmployeeSingleSearchRecord(record: HrEmployeeSingleSearchRecord): HrEmployeeDirectoryItem {
  const status = resolveDirectEmployeeStatus(record);

  return {
    id: record.id,
    name: record.name || `Ажилтан #${record.id}`,
    active: record.active !== false,
    departmentId: getRelationId(record.department_id),
    departmentName: getRelationName(record.department_id, "Хэлтэсгүй"),
    jobTitle: getRelationName(record.job_id) || record.job_title || "Албан тушаал бүртгээгүй",
    workPhone: record.work_phone || "",
    mobilePhone: record.mobile_phone || "",
    workEmail: record.work_email || "",
    userName: getRelationName(record.user_id),
    photoUrl: imageDataUrlFromBase64(record.image_128 || record.avatar_128 || record.image_1920),
    employeeCode: record.x_mn_employee_code || `EMP-${String(record.id).padStart(5, "0")}`,
    gradeRank: record.x_mn_grade_rank || "",
    statusKey: status.key,
    statusLabel: status.label,
    managerName: getRelationName(record.parent_id),
    startDate: record.contract_date_start || "",
    contractEndDate: record.contract_date_end || "",
    birthDate: record.birthday || "",
    genderKey: record.sex || "",
    genderLabel: resolveDirectEmployeeGenderLabel(record.sex),
    educationLevel: record.certificate || "",
    missingDocumentCount: Number(record.x_mn_missing_document_count || 0),
    kpiScore: Number(record.x_mn_performance_score || 0),
    taskCompletionPercent: Number(record.x_mn_task_completion_percent || 0),
    disciplineScore: Number(record.x_mn_discipline_score || 0),
  };
}

function sortHrEmployees(employees: HrEmployeeDirectoryItem[]) {
  return employees.sort((left, right) => {
    const departmentOrder = left.departmentName.localeCompare(right.departmentName, "mn");
    return departmentOrder || left.name.localeCompare(right.name, "mn");
  });
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
  const fields = await getAvailableFields("hr.employee", desiredFields, session);

  return executeOdooKw<CurrentEmployeeRecord[]>(
    "hr.employee",
    "search_read",
    [[["user_id", "=", session.uid]]],
    {
      fields,
      limit: 1,
      context: { active_test: false },
    },
    getConnection(session),
  )
    .then((records) => records[0] ?? null)
    .catch((error) => {
      console.warn("Current employee HR access profile could not be loaded:", error);
      return null;
    });
}

async function readCurrentUser(session: AppSession) {
  const desiredFields = ["name", "login", "groups_id", "ops_user_type", "x_role_key", "x_hr_role"];
  const fields = await getAvailableFields("res.users", desiredFields, session);

  return executeOdooKw<CurrentUserRecord[]>(
    "res.users",
    "search_read",
    [[["id", "=", session.uid]]],
    { fields, limit: 1 },
    getConnection(session),
  )
    .then((records) => records[0] ?? null)
    .catch((error) => {
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
  const reasons: string[] = [];
  const departmentHeadReasons: string[] = [];

  if (ADMIN_ROLES.has(String(session.role))) {
    reasons.push("admin");
  }
  if (HR_ROLE_KEYS.has(normalizeText(session.role))) {
    reasons.push("session HR role");
  }
  if (session.groupFlags?.hrUser || session.groupFlags?.hrManager || session.groupFlags?.municipalHr) {
    reasons.push("Odoo HR group flag");
  }

  const [employee, user] = await Promise.all([readCurrentEmployee(session), readCurrentUser(session)]);
  const groupNames = await readGroupNames(user?.groups_id ?? [], session);

  const jobName = getRelationName(employee?.job_id);
  const departmentName = getRelationName(employee?.department_id);
  const roleKeys = [
    employee?.x_role_key,
    employee?.x_hr_role,
    employee?.role_key,
    user?.ops_user_type,
    user?.x_role_key,
    user?.x_hr_role,
  ];

  if (containsHrText(jobName) || containsHrText(employee?.job_title)) {
    reasons.push("job title");
  }
  if (containsHrText(departmentName)) {
    reasons.push("department");
  }
  if (
    groupNames.some((groupName) => {
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

  const sessionRole = normalizeText(session.role);
  const isHr = Boolean(
    ADMIN_ROLES.has(String(session.role)) ||
      HR_ROLE_KEYS.has(sessionRole) ||
      (sessionRole !== "worker" &&
        (session.groupFlags?.hrUser ||
          session.groupFlags?.hrManager ||
          session.groupFlags?.municipalHr))
  );
  const isDepartmentHead = !isHr && departmentHeadReasons.length > 0;

  return {
    isHr,
    isDepartmentHead,
    canAccessHr: isHr,
    scope: isHr ? "hr" : "department",
    reasons,
    departmentHeadReasons,
    employee: {
      id: employee?.id ?? null,
      name: employee?.name ?? session.name,
      jobTitle: jobName || employee?.job_title || "",
      departmentId: getRelationId(employee?.department_id),
      departmentName,
      fieldRole: employee?.mfo_field_role || employee?.x_field_role || "",
    },
    groupNames,
  };
}

export async function canAccessHr(session: AppSession) {
  const profile = await getHrAccessProfile(session);
  return profile.isHr;
}

export async function requireHrAccess(session: AppSession) {
  const profile = await getHrAccessProfile(session);
  if (!profile.isHr) {
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

export async function requireDepartmentHeadTimeoffRequestAccess(session: AppSession) {
  const profile = await getHrAccessProfile(session);
  if (profile.isHr || !profile.isDepartmentHead) {
    throw new Error("HR_TIMEOFF_REQUESTER_ONLY");
  }
  return profile;
}

function scopeEmployeesForProfile(employees: HrEmployeeDirectoryItem[], profile: Awaited<ReturnType<typeof getHrAccessProfile>>) {
  if (profile.isHr) {
    return employees;
  }
  const departmentId = profile.employee.departmentId;
  const departmentName = normalizeText(profile.employee.departmentName);
  return employees.filter((employee) => {
    if (departmentId && employee.departmentId) {
      return employee.departmentId === departmentId;
    }
    return departmentName ? normalizeText(employee.departmentName) === departmentName : employee.id === profile.employee.id;
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
      return sortHrEmployees(scopeEmployeesForProfile(records.map(mapHrEmployeeDirectoryApiRecord), profile));
    }
  } catch (error) {
    console.warn("HR custom employee directory API unavailable, falling back to service account search_read:", error);
  }

  try {
    const employees = await loadHrEmployeeDirectory();
    if (employees.length > 0) {
      return sortHrEmployees(scopeEmployeesForProfile(employees, profile));
    }
  } catch (error) {
    console.warn("HR service account employee directory could not be loaded, falling back to session search_read:", error);
  }

  return loadHrEmployeeDirectory(connection).then((employees) => sortHrEmployees(scopeEmployeesForProfile(employees, profile)));
}

export async function getEmployee(session: AppSession, id: number) {
  const employees = await getEmployees(session);
  const listedEmployee = employees.find((employee) => employee.id === id);
  const profile = await requireHrAccess(session);
  const desiredFields = [
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
    "avatar_128",
    "image_1920",
    "parent_id",
    "contract_date_start",
    "contract_date_end",
    "birthday",
    "sex",
    "certificate",
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
  if (!employee) {
    return listedEmployee ?? null;
  }

  const scopedEmployee = scopeEmployeesForProfile([employee], profile)[0];
  if (!scopedEmployee) {
    return listedEmployee ?? null;
  }

  return listedEmployee
    ? {
        ...scopedEmployee,
        ...listedEmployee,
        birthDate: scopedEmployee.birthDate || listedEmployee.birthDate,
        genderKey: scopedEmployee.genderKey || listedEmployee.genderKey,
        genderLabel: scopedEmployee.genderLabel || listedEmployee.genderLabel,
        photoUrl: scopedEmployee.photoUrl || listedEmployee.photoUrl,
      }
    : scopedEmployee;
}

export async function getDepartments(session: AppSession): Promise<HrOption[]> {
  return executeOdooKw<OdooDictionaryRecord[]>(
    "hr.department",
    "search_read",
    [[]],
    { fields: ["name"], order: "name asc", limit: 500 },
    getConnection(session),
  )
    .then((records) => records.map((record) => ({ id: record.id, name: record.name })))
    .catch((error) => {
      console.warn("HR departments could not be loaded:", error);
      return [];
    });
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

export async function getManagers(session: AppSession): Promise<HrOption[]> {
  return getEmployees(session)
    .then((employees) =>
      employees
        .filter((employee) => employee.active)
        .map((employee) => ({ id: employee.id, name: employee.name }))
        .sort((left, right) => left.name.localeCompare(right.name, "mn")),
    )
    .catch((error) => {
      console.warn("HR managers could not be loaded:", error);
      return [];
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
    "work_phone",
    "mobile_phone",
    "work_email",
    "department_id",
    "job_id",
    "job_title",
    "parent_id",
    "contract_date_start",
    "identification_id",
    "x_mn_registration_number",
    "x_mn_employment_status",
    "birthday",
    "sex",
    "active",
    "notes",
    "private_street",
    "emergency_contact",
    "emergency_phone",
  ];
  const fields = new Set(await getAvailableFields("hr.employee", desiredFields, session));
  const name = [data.lastName, data.firstName].map((value) => value?.trim()).filter(Boolean).join(" ");
  const noteParts = [
    data.note,
    data.workType ? `Ажиллах төрөл: ${data.workType}` : "",
    data.isFieldEmployee ? "Талбайн ажилтан: тийм" : "",
    data.fieldRole ? `Талбайн үүрэг: ${data.fieldRole}` : "",
    data.workLocation ? `Ажиллах байршил: ${data.workLocation}` : "",
    data.emergencyContact ? `Яаралтай холбоо: ${data.emergencyContact}` : "",
    data.emergencyPhone ? `Яаралтай утас: ${data.emergencyPhone}` : "",
  ].filter(Boolean);
  const values: Record<string, unknown> = {};

  if (fields.has("name")) values.name = name || data.firstName;
  if (fields.has("work_phone")) values.work_phone = data.phone || false;
  if (fields.has("mobile_phone")) values.mobile_phone = data.phone || false;
  if (fields.has("work_email")) values.work_email = data.email || false;
  if (fields.has("department_id") && data.departmentId) values.department_id = data.departmentId;
  if (fields.has("job_id") && data.jobId) values.job_id = data.jobId;
  if (fields.has("job_title")) values.job_title = data.jobTitle || false;
  if (fields.has("parent_id") && data.managerId) values.parent_id = data.managerId;
  if (fields.has("contract_date_start")) values.contract_date_start = data.startDate || false;
  if (fields.has("identification_id")) values.identification_id = data.registerNumber || false;
  if (fields.has("x_mn_registration_number")) values.x_mn_registration_number = data.registerNumber || false;
  if (fields.has("x_mn_employment_status")) values.x_mn_employment_status = "active";
  if (fields.has("birthday")) values.birthday = data.birthDate || false;
  if (fields.has("sex")) values.sex = data.gender || false;
  if (fields.has("active")) values.active = true;
  if (fields.has("notes")) values.notes = noteParts.join("\n") || false;
  if (fields.has("private_street")) values.private_street = data.homeAddress || data.workLocation || false;
  if (fields.has("emergency_contact")) values.emergency_contact = data.emergencyContact || false;
  if (fields.has("emergency_phone")) values.emergency_phone = data.emergencyPhone || false;

  const createdId = await executeOdooKw<number>(
    "hr.employee",
    "create",
    [values],
    {},
    getConnection(session),
  );
  return getEmployee(session, createdId);
}

export async function updateEmployee(
  session: AppSession,
  id: number,
  data: Partial<
    HrEmployeeCreateInput &
      Pick<
        HrEmployeeDirectoryItem,
        "name" | "employeeCode" | "workPhone" | "mobilePhone" | "workEmail" | "birthDate" | "genderKey"
      >
  >,
) {
  const desiredFields = [
    "name",
    "work_phone",
    "mobile_phone",
    "work_email",
    "department_id",
    "job_id",
    "job_title",
    "parent_id",
    "x_mn_employee_code",
    "birthday",
    "sex",
    "active",
  ];
  const fields = new Set(await getAvailableFields("hr.employee", desiredFields, session));
  const values: Record<string, unknown> = {};

  if (fields.has("name") && data.name !== undefined) values.name = data.name?.trim() || false;
  if (fields.has("x_mn_employee_code") && data.employeeCode !== undefined) {
    values.x_mn_employee_code = data.employeeCode?.trim() || false;
  }
  if (fields.has("work_phone") && data.workPhone !== undefined) values.work_phone = data.workPhone || false;
  if (fields.has("mobile_phone") && data.mobilePhone !== undefined) values.mobile_phone = data.mobilePhone || false;
  if (fields.has("work_email") && data.workEmail !== undefined) values.work_email = data.workEmail || false;
  if (fields.has("birthday") && data.birthDate !== undefined) values.birthday = data.birthDate || false;
  if (fields.has("sex") && (data.genderKey !== undefined || data.gender !== undefined)) {
    values.sex = data.genderKey || data.gender || false;
  }
  if (fields.has("department_id") && data.departmentId) values.department_id = data.departmentId;
  if (fields.has("job_id") && data.jobId) values.job_id = data.jobId;
  if (fields.has("job_title") && data.jobTitle !== undefined) values.job_title = data.jobTitle || false;
  if (fields.has("parent_id") && data.managerId) values.parent_id = data.managerId;
  if (fields.has("active") && data.isFieldEmployee === false) values.active = false;

  if (!Object.keys(values).length) {
    return getEmployee(session, id);
  }

  await executeOdooKw<boolean>("hr.employee", "write", [[id], values], {}, getConnection(session));
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
    throw new Error("Чөлөөний төрөл Odoo дээр олдсонгүй.");
  }
  const attachments: HrLeaveAttachmentInput[] = [];
  if (data.files?.length) {
    for (const file of data.files) {
      if (!file.size) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      attachments.push({
        name: file.name,
        datas: buffer.toString("base64"),
        mimetype: file.type || "application/octet-stream",
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
    throw new Error("Чөлөөний төрөл Odoo дээр олдсонгүй.");
  }
  const values: Record<string, unknown> = {};
  if (fields.has("employee_id")) values.employee_id = data.employeeId;
  if (fields.has("holiday_status_id")) values.holiday_status_id = holidayStatusId;
  if (fields.has("request_date_from")) values.request_date_from = data.dateFrom;
  if (fields.has("request_date_to")) values.request_date_to = data.dateTo;
  if (fields.has("name")) values.name = data.note || data.leaveTypeName || "Хүний нөөцийн чөлөөний бүртгэл";

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
      sickEmployees: 0,
      archivedEmployees: 0,
      pendingRequests: 0,
      approvedRequests: 0,
      rejectedRequests: 0,
    },
    statusPie: [
      { label: "Идэвхтэй", value: 0 },
      { label: "Чөлөөтэй", value: 0 },
      { label: "Өвчтэй", value: 0 },
    ],
    departmentBreakdown: [],
    latestRequests: [],
  };
}

async function filesToAttachments(files?: File[]): Promise<HrLeaveAttachmentInput[]> {
  const attachments: HrLeaveAttachmentInput[] = [];
  for (const file of files ?? []) {
    if (!file.size) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    attachments.push({
      name: file.name,
      datas: buffer.toString("base64"),
      mimetype: file.type || "application/octet-stream",
    });
  }
  return attachments;
}

async function attachFilesToEmployee(
  session: AppSession,
  employeeId: number,
  attachments: HrLeaveAttachmentInput[],
  prefix: string,
) {
  for (const attachment of attachments) {
    await executeOdooKw<number>(
      "ir.attachment",
      "create",
      [
        {
          name: `${prefix} - ${attachment.name}`,
          datas: attachment.datas,
          res_model: "hr.employee",
          res_id: employeeId,
          mimetype: attachment.mimetype,
        },
      ],
      {},
      getConnection(session),
    );
  }
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

  if (Object.keys(values).length) {
    await executeOdooKw<boolean>("hr.employee", "write", [[data.employeeId], values], {}, getConnection(session));
  }

  const attachments = await filesToAttachments(data.files);
  const [updatedEmployee, newSnapshot] = await Promise.all([
    getEmployee(session, data.employeeId),
    readEmployeeTransferSnapshot(session, data.employeeId),
  ]);
  const historyId = await executeOdooKw<number>(
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
        note: data.reason,
      },
    ],
    {},
    getConnection(session),
  );
  await attachFilesToTransferHistory(session, historyId, attachments, `Шилжилт хөдөлгөөн ${data.effectiveDate}`);
  await attachFilesToEmployee(session, data.employeeId, attachments, `Шилжилт хөдөлгөөн ${data.effectiveDate}`);

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
    note: data.reason,
  };
}

export async function terminateEmployee(session: AppSession, data: HrEmployeeTerminationInput) {
  await requireHrSpecialistAccess(session);
  if (!data.employeeId) {
    throw new Error("Ажилтан заавал сонгоно уу.");
  }
  ensureDateOrder(data.terminationDate, "Ажлаас гарсан огноо");
  if (!data.reason.trim()) {
    throw new Error("Ажлаас гарах шалтгаан заавал оруулна уу.");
  }

  const fields = new Set(
    await getAvailableFields(
      "hr.employee",
      ["active", "departure_date", "departure_description"],
      session,
    ),
  );
  const values: Record<string, unknown> = {};
  if (fields.has("active")) values.active = false;
  if (fields.has("departure_date")) values.departure_date = data.terminationDate;
  if (fields.has("departure_description")) {
    values.departure_description = [data.reason, data.note].filter(Boolean).join("\n");
  }

  if (!Object.keys(values).length) {
    throw new Error("Odoo дээр ажилтныг архивлах талбар олдсонгүй.");
  }

  await executeOdooKw<boolean>("hr.employee", "write", [[data.employeeId], values], {}, getConnection(session));
  const attachments = await filesToAttachments(data.files);
  await attachFilesToEmployee(
    session,
    data.employeeId,
    attachments,
    `Ажлаас чөлөөлөх ${data.terminationDate}`,
  );

  return getEmployee(session, data.employeeId);
}

function normalizeTimeoffRequest(record: Partial<HrTimeoffRequest>): HrTimeoffRequest {
  return {
    id: Number(record.id || 0),
    name: record.name || "",
    employeeId: Number(record.employeeId || 0),
    employeeName: record.employeeName || "Ажилтан сонгоогүй",
    departmentId: record.departmentId ?? null,
    departmentName: record.departmentName || "Хэлтэсгүй",
    requestType: record.requestType === "sick" ? "sick" : "time_off",
    requestTypeLabel: record.requestTypeLabel || (record.requestType === "sick" ? "Өвчтэй" : "Чөлөө"),
    dateFrom: record.dateFrom || "",
    dateTo: record.dateTo || "",
    durationDays: Number(record.durationDays || dayCount(record.dateFrom || "", record.dateTo || "")),
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
  const requestType = record.request_type === "sick" ? "sick" : "time_off";
  const state = (record.state || "draft") as HrTimeoffRequestState;
  const dateFrom = String(record.date_from || "");
  const dateTo = String(record.date_to || "");

  return {
    id: Number(record.id || 0),
    name: String(record.name || ""),
    employeeId: getRelationId(record.employee_id) || 0,
    employeeName: getRelationName(record.employee_id, "Ажилтан сонгоогүй"),
    departmentId: getRelationId(record.department_id),
    departmentName: getRelationName(record.department_id, "Хэлтэсгүй"),
    requestType,
    requestTypeLabel: requestType === "sick" ? "Өвчтэй" : "Чөлөө",
    dateFrom,
    dateTo,
    durationDays: Number(record.duration_days || dayCount(dateFrom, dateTo)),
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
  if (profile.isHr) {
    return requests;
  }
  const employees = await getEmployees(session);
  const employeeIds = new Set(employees.map((employee) => employee.id));
  const departmentId = profile.employee.departmentId;
  const departmentName = normalizeText(profile.employee.departmentName);

  return requests.filter((request) => {
    if (employeeIds.has(request.employeeId)) {
      return true;
    }
    if (departmentId && request.departmentId) {
      return request.departmentId === departmentId;
    }
    return departmentName ? normalizeText(request.departmentName) === departmentName : false;
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
  const currentByEmployee = new Map<number, "time_off" | "sick">();

  for (const request of requests) {
    if (!requestCoversToday(request, today)) continue;
    if (request.requestType === "sick") {
      currentByEmployee.set(request.employeeId, "sick");
    } else if (currentByEmployee.get(request.employeeId) !== "sick") {
      currentByEmployee.set(request.employeeId, "time_off");
    }
  }

  let activeEmployees = 0;
  let timeOffEmployees = 0;
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
        sickEmployees: 0,
        pendingRequests: 0,
      });
    }
    const row = departmentRows.get(key)!;
    row.totalEmployees += 1;

    const dynamicStatus = currentByEmployee.get(employee.id);
    if (!employee.active || ["archived", "terminated", "resigned"].includes(employee.statusKey)) {
      archivedEmployees += 1;
    } else if (dynamicStatus === "sick") {
      sickEmployees += 1;
      row.sickEmployees += 1;
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
      totalEmployees: employees.length,
      activeEmployees,
      timeOffEmployees,
      sickEmployees,
      archivedEmployees,
      pendingRequests: requests.filter((request) => ["submitted", "hr_review"].includes(request.state)).length,
      approvedRequests: requests.filter((request) => request.state === "approved").length,
      rejectedRequests: requests.filter((request) => request.state === "rejected").length,
    },
    statusPie: [
      { label: "Идэвхтэй", value: activeEmployees },
      { label: "Чөлөөтэй", value: timeOffEmployees },
      { label: "Өвчтэй", value: sickEmployees },
    ],
    departmentBreakdown: Array.from(departmentRows.values()).sort((left, right) =>
      left.departmentName.localeCompare(right.departmentName, "mn"),
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
      return "Хүний нөөц шалгаж байна";
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
    { id: "termination_proposal", name: "Ажлаас халах санал" },
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
      return "Менежерийн хяналт";
    case "employee_explanation":
      return "Ажилтны тайлбар";
    case "admin_review":
      return "Захиргааны хяналт";
    case "approved":
      return "Хүчинтэй";
    case "archived":
      return "Архивласан";
    case "cancelled":
      return "Цуцлагдсан";
    default:
      return state || "Тодорхойгүй";
  }
}

export async function getDisciplineRecords(session: AppSession): Promise<HrDisciplineRecord[]> {
  await requireHrAccess(session);
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
    .then((records) =>
      records.map((record) => {
        const violationType = String(record.violation_type || "");
        const actionType = String(record.action_type || "");
        const state = String(record.state || "approved") === "draft" ? "approved" : String(record.state || "approved");
        return {
          id: record.id,
          employeeId: getRelationId(record.employee_id),
          employeeName: getRelationName(record.employee_id, "Ажилтан бүртгээгүй"),
          departmentId: getRelationId(record.department_id),
          departmentName: getRelationName(record.department_id, "Хэлтэс бүртгээгүй"),
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
      }),
    )
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

  const disciplineId = await executeOdooKw<number>(
    "municipal.discipline",
    "create",
    [values],
    {},
    getConnection(session),
  );

  await attachFilesToDiscipline(session, disciplineId, attachments);

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

  await executeOdooKw<boolean>(
    "municipal.discipline",
    "write",
    [[disciplineId], values],
    {},
    getConnection(session),
  );
  await attachFilesToDiscipline(session, disciplineId, attachments);

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
  if (!profile.isHr) {
    const [employees, requests] = await Promise.all([getEmployees(session), getTimeoffRequests(session)]);
    return buildScopedTimeoffDashboard(employees, requests, "department", profile.employee.departmentName);
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
      ...emptyTimeoffDashboard(profile.isHr ? "hr" : "department", profile.employee.departmentName),
      ...dashboard,
      cards: {
        ...emptyTimeoffDashboard(profile.isHr ? "hr" : "department").cards,
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
    ...emptyTimeoffDashboard(profile.isHr ? "hr" : "department", profile.employee.departmentName),
    cards: {
      ...emptyTimeoffDashboard(profile.isHr ? "hr" : "department").cards,
      totalEmployees: employees.length,
      activeEmployees: activeEmployees.length,
      archivedEmployees: employees.length - activeEmployees.length,
    },
    statusPie: [
      { label: "Идэвхтэй", value: activeEmployees.length },
      { label: "Чөлөөтэй", value: 0 },
      { label: "Өвчтэй", value: 0 },
    ],
  };
}

export async function createTimeoffRequest(session: AppSession, data: HrTimeoffRequestCreateInput) {
  await requireDepartmentHeadTimeoffRequestAccess(session);
  const attachments = await filesToAttachments(data.files);
  if (data.submit && !attachments.length) {
    throw new Error("Хүсэлт илгээхийн тулд хавсралтын зураг заавал оруулна уу.");
  }
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
      throw new Error("hr_custom_mn module шинэчлэгдээгүй байна. VPS дээр module upgrade/reload хийсний дараа хүсэлт илгээнэ үү.");
    }
    throw error;
  }
}

export async function updateTimeoffRequest(session: AppSession, requestId: number, data: HrTimeoffRequestCreateInput) {
  await requireDepartmentHeadTimeoffRequestAccess(session);
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

export async function getHrStats(session: AppSession): Promise<HrStats> {
  const [employees, timeoffDashboard, activeDiscipline, completedDiscipline] = await Promise.all([
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
    pendingClearance: 0,
  };
}
