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

export type HrOption = {
  id: number;
  name: string;
};

export type HrStats = {
  totalEmployees: number;
  activeEmployees: number;
  leaveToday: number;
  sickToday: number;
  archivedEmployees: number;
  pendingClearance: number;
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

const ADMIN_ROLES = new Set(["system_admin"]);
const HR_ROLE_KEYS = new Set(["hr_specialist", "hr_manager"]);
const HR_TEXT_TOKENS = ["хүний нөөц", "human resources", "hr specialist", "hr manager"];

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

function isHrRoleKey(value: unknown) {
  return HR_ROLE_KEYS.has(normalizeText(value));
}

function getConnection(session: AppSession) {
  return {
    login: session.login,
    password: session.password,
  };
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

  return {
    isHr: reasons.length > 0,
    reasons,
    employee: {
      id: employee?.id ?? null,
      name: employee?.name ?? session.name,
      jobTitle: jobName || employee?.job_title || "",
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

export async function getEmployees(session: AppSession) {
  return loadHrEmployeeDirectory(getConnection(session));
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
  return executeOdooKw<Array<{ id: number; name: string }>>(
    "hr.employee",
    "search_read",
    [[]],
    { fields: ["name"], order: "name asc", limit: 500, context: { active_test: true } },
    getConnection(session),
  )
    .then((records) => records.map((record) => ({ id: record.id, name: record.name })))
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
    "active",
    "notes",
    "private_street",
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
  if (fields.has("active")) values.active = true;
  if (fields.has("notes")) values.notes = noteParts.join("\n") || false;
  if (fields.has("private_street")) values.private_street = data.workLocation || false;

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
  if (!holidayStatusId) {
    throw new Error("Чөлөөний төрөл Odoo дээр олдсонгүй.");
  }

  const fields = new Set(
    await getAvailableFields(
      "hr.leave",
      ["employee_id", "holiday_status_id", "request_date_from", "request_date_to", "name"],
      session,
    ),
  );
  const values: Record<string, unknown> = {};
  if (fields.has("employee_id")) values.employee_id = data.employeeId;
  if (fields.has("holiday_status_id")) values.holiday_status_id = holidayStatusId;
  if (fields.has("request_date_from")) values.request_date_from = data.dateFrom;
  if (fields.has("request_date_to")) values.request_date_to = data.dateTo;
  if (fields.has("name")) values.name = data.note || data.leaveTypeName || "HR чөлөөний бүртгэл";

  const leaveId = await executeOdooKw<number>("hr.leave", "create", [values], {}, getConnection(session));

  if (data.files?.length) {
    for (const file of data.files) {
      if (!file.size) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      await executeOdooKw<number>(
        "ir.attachment",
        "create",
        [
          {
            name: file.name,
            datas: buffer.toString("base64"),
            res_model: "hr.leave",
            res_id: leaveId,
            mimetype: file.type || "application/octet-stream",
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

export async function getHrStats(session: AppSession): Promise<HrStats> {
  const [employees, leaves] = await Promise.all([getEmployees(session), getLeaves(session)]);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const activeEmployees = employees.filter((employee) => employee.active);
  const archivedEmployees = employees.filter((employee) => !employee.active);
  const todayLeaves = leaves.filter((leave) => leave.dateFrom <= today && leave.dateTo >= today);
  const sickToday = todayLeaves.filter((leave) => containsHrText(leave.typeName) || normalizeText(leave.typeName).includes("өвч"));

  return {
    totalEmployees: employees.length,
    activeEmployees: activeEmployees.length,
    leaveToday: todayLeaves.length,
    sickToday: sickToday.length,
    archivedEmployees: archivedEmployees.length,
    pendingClearance: 0,
  };
}
