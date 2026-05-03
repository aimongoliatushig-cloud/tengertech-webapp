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
  genderLabel?: string;
  educationLevel?: string;
  missingDocumentCount?: number;
  kpiScore?: number;
  taskCompletionPercent?: number;
  disciplineScore?: number;
};

export type HrOption = {
  id: number;
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
    genderLabel: record.genderLabel || "",
    educationLevel: record.educationLevel || "",
    missingDocumentCount: Number(record.missingDocumentCount || 0),
    kpiScore: Number(record.kpiScore || 0),
    taskCompletionPercent: Number(record.taskCompletionPercent || 0),
    disciplineScore: Number(record.disciplineScore || 0),
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
  if (session.groupFlags?.hrManager) {
    reasons.push("Odoo HR manager group");
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

  const isHr = reasons.length > 0;
  const isDepartmentHead = !isHr && departmentHeadReasons.length > 0;

  return {
    isHr,
    isDepartmentHead,
    canAccessHr: isHr || isDepartmentHead,
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
  return employees.find((employee) => employee.id === id) ?? null;
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
  data: Partial<HrEmployeeCreateInput & Pick<HrEmployeeDirectoryItem, "workPhone" | "mobilePhone" | "workEmail">>,
) {
  const desiredFields = ["work_phone", "mobile_phone", "work_email", "department_id", "job_id", "job_title", "parent_id", "active"];
  const fields = new Set(await getAvailableFields("hr.employee", desiredFields, session));
  const values: Record<string, unknown> = {};

  if (fields.has("work_phone") && data.workPhone !== undefined) values.work_phone = data.workPhone || false;
  if (fields.has("mobile_phone") && data.mobilePhone !== undefined) values.mobile_phone = data.mobilePhone || false;
  if (fields.has("work_email") && data.workEmail !== undefined) values.work_email = data.workEmail || false;
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

function isMissingTimeoffModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("municipal.hr.timeoff.request") || message.includes("get_hr_timeoff") || message.includes("not found");
}

export async function getTimeoffRequests(session: AppSession, filters: Record<string, unknown> = {}) {
  await requireHrAccess(session);
  try {
    const records = await executeOdooKw<Array<Partial<HrTimeoffRequest>>>(
      "municipal.hr.timeoff.request",
      "get_hr_timeoff_request_directory",
      [filters],
      {},
      getConnection(session),
    );
    return records.map(normalizeTimeoffRequest);
  } catch (error) {
    if (isMissingTimeoffModelError(error)) {
      console.warn("HR time off request model is not installed yet:", error);
      return [];
    }
    throw error;
  }
}

export async function getTimeoffDashboard(session: AppSession): Promise<HrTimeoffDashboardData> {
  const profile = await requireHrAccess(session);
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
  await requireHrAccess(session);
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
  await requireHrAccess(session);
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
    await requireHrAccess(session);
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
