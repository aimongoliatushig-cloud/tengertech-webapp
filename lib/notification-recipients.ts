import "server-only";

import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { fixMojibakeText } from "@/lib/text-normalize";

type Relation = [number, string] | false;

type DepartmentHeadEmployeeRecord = {
  name?: string | false;
  user_id?: Relation;
  department_id?: Relation;
  job_id?: Relation;
  job_title?: string | false;
  x_hr_role?: string | false;
  x_role_key?: string | false;
  role_key?: string | false;
};

type DepartmentRecord = {
  name?: string;
  manager_id?: Relation;
};

type EmployeeUserRecord = {
  user_id?: Relation;
  department_id?: Relation;
};

type UserRecord = {
  id: number;
  ops_user_type?: string | false;
};

const DEPARTMENT_HEAD_TEXT_TOKENS = [
  "хэлтсийн дарга",
  "албаны дарга",
  "тасгийн дарга",
  "дарга",
  "department head",
  "department manager",
  "project manager",
];

const DEPARTMENT_HEAD_ROLE_TOKENS = [
  "project_manager",
  "department_head",
  "department_manager",
  "municipal_department_head",
];
const AUTO_BASE_HEAD_NAME_TOKENS = ["ц.эрдэнэбат", "ц эрдэнэбат", "эрдэнэбат"];

function uniqueUserIds(values: Array<number | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is number => Number.isFinite(value ?? NaN) && Number(value) > 0)),
  );
}

function relationId(value: unknown) {
  if (Array.isArray(value)) {
    const id = Number(value[0]);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return null;
}

function relationName(value?: Relation) {
  return Array.isArray(value) ? value[1] : "";
}

function normalizeText(value: unknown) {
  return fixMojibakeText(String(value ?? "")).trim().toLocaleLowerCase("mn-MN");
}

function containsAnyToken(value: unknown, tokens: string[]) {
  const normalized = normalizeText(value);
  return Boolean(normalized && tokens.some((token) => normalized.includes(normalizeText(token))));
}

function isAutoBaseGarbageDepartmentName(value: unknown) {
  const normalized = normalizeText(value);
  const hasGarbageTransport =
    normalized.includes("хог") &&
    (normalized.includes("тээвэр") || normalized.includes("teever"));
  return (
    hasGarbageTransport ||
    (normalized.includes("авто") && normalized.includes("хог"))
  );
}

async function getAvailableFields(model: string, desiredFields: string[]) {
  try {
    const fields = await executeOdooKw<Record<string, unknown>>(
      model,
      "fields_get",
      [desiredFields],
      { attributes: ["string", "type"] },
    );
    return desiredFields.filter((field) => Boolean(fields[field]));
  } catch (error) {
    console.warn(`Notification recipient fields_get failed for ${model}:`, error);
    return desiredFields;
  }
}

async function loadDepartmentManagerUserIds(
  departmentId: number,
  connectionOverrides: Partial<OdooConnection>,
) {
  const fields = await getAvailableFields("hr.department", ["manager_id"]);
  if (!fields.includes("manager_id")) {
    return [];
  }

  const departments = await executeOdooKw<DepartmentRecord[]>(
    "hr.department",
    "search_read",
    [[["id", "=", departmentId]]],
    { fields, limit: 1, context: { active_test: false } },
    connectionOverrides,
  ).catch((error) => {
    console.warn("Department manager lookup failed:", error);
    return [];
  });
  const managerEmployeeId = relationId(departments[0]?.manager_id);
  if (!managerEmployeeId) {
    return [];
  }
  const employees = await executeOdooKw<EmployeeUserRecord[]>(
    "hr.employee",
    "search_read",
    [[["id", "=", managerEmployeeId]]],
    { fields: ["user_id"], limit: 1, context: { active_test: false } },
    connectionOverrides,
  ).catch((error) => {
    console.warn("Department manager user lookup failed:", error);
    return [];
  });
  return uniqueUserIds([relationId(employees[0]?.user_id)]);
}

/**
 * Хэлтсийн даргыг хүний нөөцөөс (hr.department.manager_id) шууд авч,
 * холбогдох хэрэглэгчийн { id, name }-ийг буцаана. Дарга бүртгэлгүй бол null.
 */
export async function loadDepartmentHeadUser(
  departmentId?: number | null,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<{ id: number; name: string } | null> {
  if (!departmentId || !Number.isFinite(departmentId) || departmentId <= 0) {
    return null;
  }
  const fields = await getAvailableFields("hr.department", ["manager_id"]);
  if (!fields.includes("manager_id")) {
    return null;
  }
  const departments = await executeOdooKw<DepartmentRecord[]>(
    "hr.department",
    "search_read",
    [[["id", "=", departmentId]]],
    { fields, limit: 1, context: { active_test: false } },
    connectionOverrides,
  ).catch((error) => {
    console.warn("Department head (HR) lookup failed:", error);
    return [] as DepartmentRecord[];
  });
  const managerEmployeeId = relationId(departments[0]?.manager_id);
  if (!managerEmployeeId) {
    return null;
  }
  const employees = await executeOdooKw<EmployeeUserRecord[]>(
    "hr.employee",
    "search_read",
    [[["id", "=", managerEmployeeId]]],
    { fields: ["user_id"], limit: 1, context: { active_test: false } },
    connectionOverrides,
  ).catch((error) => {
    console.warn("Department head (HR) user lookup failed:", error);
    return [] as EmployeeUserRecord[];
  });
  const userRelation = employees[0]?.user_id;
  const userId = relationId(userRelation);
  if (!userId) {
    return null;
  }
  return { id: userId, name: relationName(userRelation) || `Хэрэглэгч ${userId}` };
}

export async function loadEmployeeUserId(
  employeeId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return null;
  }

  const records = await executeOdooKw<EmployeeUserRecord[]>(
    "hr.employee",
    "search_read",
    [[["id", "=", employeeId]]],
    {
      fields: ["user_id"],
      limit: 1,
      context: { active_test: false },
    },
    connectionOverrides,
  ).catch((error) => {
    console.warn("Employee user lookup failed:", error);
    return [];
  });

  return relationId(records[0]?.user_id);
}

export async function loadEmployeeDepartmentId(
  employeeId: number,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return null;
  }

  const records = await executeOdooKw<EmployeeUserRecord[]>(
    "hr.employee",
    "search_read",
    [[["id", "=", employeeId]]],
    {
      fields: ["department_id"],
      limit: 1,
      context: { active_test: false },
    },
    connectionOverrides,
  ).catch((error) => {
    console.warn("Employee department lookup failed:", error);
    return [];
  });

  return relationId(records[0]?.department_id);
}

export async function loadDepartmentHeadUserIds(
  departmentId?: number | null,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  if (!departmentId || !Number.isFinite(departmentId) || departmentId <= 0) {
    return [];
  }

  const departmentRecords = await executeOdooKw<DepartmentRecord[]>(
    "hr.department",
    "search_read",
    [[["id", "=", departmentId]]],
    { fields: ["name"], limit: 1, context: { active_test: false } },
    connectionOverrides,
  ).catch((error) => {
    console.warn("Department name lookup failed:", error);
    return [];
  });
  const isAutoBaseDepartment = isAutoBaseGarbageDepartmentName(departmentRecords[0]?.name);

  const desiredFields = ["name", "department_id", "user_id", "job_id", "job_title", "x_hr_role", "x_role_key", "role_key"];
  const fields = await getAvailableFields("hr.employee", desiredFields);
  const employees = await executeOdooKw<DepartmentHeadEmployeeRecord[]>(
    "hr.employee",
    "search_read",
    [[["department_id", "=", departmentId], ["user_id", "!=", false]]],
    {
      fields,
      limit: 300,
      context: { active_test: false },
    },
    connectionOverrides,
  ).catch((error) => {
    console.warn("Department head employee recipient lookup failed:", error);
    return [];
  });

  const departmentUserIds = uniqueUserIds(employees.map((employee) => relationId(employee.user_id)));
  const titleMatchedUserIds = employees
    .filter((employee) => {
      return (
        containsAnyToken(relationName(employee.job_id), DEPARTMENT_HEAD_TEXT_TOKENS) ||
        containsAnyToken(employee.job_title, DEPARTMENT_HEAD_TEXT_TOKENS) ||
        containsAnyToken(employee.x_role_key, DEPARTMENT_HEAD_ROLE_TOKENS) ||
        containsAnyToken(employee.role_key, DEPARTMENT_HEAD_ROLE_TOKENS) ||
        containsAnyToken(employee.x_hr_role, DEPARTMENT_HEAD_ROLE_TOKENS)
      );
    })
    .map((employee) => relationId(employee.user_id));
  const preferredAutoBaseHeadUserIds = isAutoBaseDepartment
    ? employees
        .filter((employee) =>
          containsAnyToken(
            `${employee.name || ""} ${relationName(employee.user_id)} ${relationName(employee.department_id)}`,
            AUTO_BASE_HEAD_NAME_TOKENS,
          ),
        )
        .map((employee) => relationId(employee.user_id))
    : [];

  const roleUsers = departmentUserIds.length
    ? await executeOdooKw<UserRecord[]>(
        "res.users",
        "search_read",
        [[["id", "in", departmentUserIds], ["share", "=", false]]],
        { fields: ["ops_user_type"], limit: departmentUserIds.length },
        connectionOverrides,
      ).catch((error) => {
        console.warn("Department head user role lookup failed:", error);
        return [];
      })
    : [];
  const roleMatchedUserIds = roleUsers
    .filter((user) => containsAnyToken(user.ops_user_type, DEPARTMENT_HEAD_ROLE_TOKENS))
    .map((user) => user.id);
  const managerUserIds = await loadDepartmentManagerUserIds(departmentId, connectionOverrides);

  return uniqueUserIds([...preferredAutoBaseHeadUserIds, ...managerUserIds, ...titleMatchedUserIds, ...roleMatchedUserIds]);
}
