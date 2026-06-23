import "server-only";

import type { AppSession } from "@/lib/auth";
import { normalizeOrganizationUnitName } from "@/lib/department-groups";
import { executeOdooKw } from "@/lib/odoo";
import { isMasterRole } from "@/lib/roles";

type EmployeeDepartmentRecord = {
  id: number;
  name?: string;
  department_id: [number, string] | false;
  work_phone?: string | false;
  mobile_phone?: string | false;
  user_id?: [number, string] | false;
};

type CachedSessionDepartmentName = {
  expiresAt: number;
  value: string | null;
};

const SESSION_DEPARTMENT_NAME_CACHE_TTL_MS = 60_000;
const SESSION_DEPARTMENT_SCOPE_CACHE_VERSION = 2;
const sessionDepartmentNameCache = new Map<string, CachedSessionDepartmentName>();

function getSessionDepartmentNameCacheKey(session: AppSession) {
  return [
    SESSION_DEPARTMENT_SCOPE_CACHE_VERSION,
    session.uid,
    session.login,
    session.password,
    session.role,
    session.employeeJobTitle ?? "",
    session.displayRoleLabel ?? "",
  ].join(":");
}

function getFallbackDepartmentName(session: Pick<AppSession, "role">) {
  if (session.role === "system_admin") {
    return normalizeOrganizationUnitName("Удирдлага") || "Захиргааны алба";
  }

  return null;
}

function normalizeScopeRoleText(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

function isDepartmentHeadTitle(value?: string | null) {
  const text = normalizeScopeRoleText(value);
  return (
    text.includes("хэлтсийн дарга") ||
    text.includes("хэлтэсийн дарга") ||
    text.includes("албаны дарга") ||
    text.includes("department head")
  );
}

function getDepartmentNameFromEmployees(
  employees: EmployeeDepartmentRecord[],
  session: AppSession,
  options: { allowAmbiguousMatch?: boolean } = {},
) {
  const recordsWithDepartment = employees.filter((employee) =>
    Array.isArray(employee.department_id),
  );
  const exactUserRecord = recordsWithDepartment.find((employee) => {
    const userRelation = employee.user_id;
    return Array.isArray(userRelation) && userRelation[0] === session.uid;
  });

  // user_id яг таарсан ажилтан байвал түүнийг авна. Эс бөгөөс зөвхөн ганц л
  // бичлэг буцсан (эргэлзээгүй) тохиолдолд эсвэл дуудагч зөвшөөрсөн үед л авна —
  // өөр хүний хэлтэс рүү санамсаргүй scope болохоос сэргийлнэ.
  let employee = exactUserRecord;
  if (!employee && (recordsWithDepartment.length === 1 || options.allowAmbiguousMatch)) {
    employee = recordsWithDepartment[0];
  }
  if (!employee) {
    return null;
  }

  const departmentRelation = employee.department_id;
  const rawDepartmentName = Array.isArray(departmentRelation) ? departmentRelation[1] : "";
  const canonicalDepartmentName = normalizeOrganizationUnitName(rawDepartmentName);

  return canonicalDepartmentName || rawDepartmentName.trim() || null;
}

async function loadEmployeeDepartmentRecords(
  domain: unknown[],
  connectionOverrides: { login?: string; password?: string } = {},
) {
  return executeOdooKw<EmployeeDepartmentRecord[]>(
    "hr.employee",
    "search_read",
    [domain],
    {
      fields: ["id", "name", "department_id", "work_phone", "mobile_phone", "user_id"],
      limit: 5,
    },
    connectionOverrides,
  );
}

async function loadFallbackEmployeeDepartmentName(session: AppSession) {
  const login = session.login.trim();
  const name = session.name.trim();
  const fallbackDomains: unknown[][] = [
    [["user_id", "=", session.uid]],
  ];

  if (login) {
    fallbackDomains.push([
      "|",
      ["work_phone", "ilike", login],
      ["mobile_phone", "ilike", login],
    ]);
  }

  if (name) {
    fallbackDomains.push([["name", "=", name]]);
  }

  for (const domain of fallbackDomains) {
    const employees = await loadEmployeeDepartmentRecords(domain, {
      login: session.login,
      password: session.password,
    }).catch(() => []);
    const departmentName = getDepartmentNameFromEmployees(employees, session);
    if (departmentName) {
      return departmentName;
    }
  }

  return null;
}

export function shouldScopeToOwnDepartment(
  session: Pick<AppSession, "role" | "employeeJobTitle" | "displayRoleLabel"> & {
    groupFlags?: AppSession["groupFlags"];
  },
) {
  const flags = session.groupFlags;
  const looksDepartmentHead =
    isDepartmentHeadTitle(session.employeeJobTitle) ||
    isDepartmentHeadTitle(session.displayRoleLabel);
  const hasDepartmentHeadScope =
    session.role === "project_manager" ||
    Boolean(flags?.municipalDepartmentHead) ||
    looksDepartmentHead;

  if (
    session.role === "system_admin" ||
    session.role === "director" ||
    session.role === "general_manager" ||
    flags?.municipalDirector ||
    flags?.fleetRepairCeo ||
    flags?.fleetRepairGeneralManager
  ) {
    return false;
  }

  if (hasDepartmentHeadScope) {
    return true;
  }

  // Бүх хэлтсийн тайлан харах эрхтэй менежерүүд (canViewAllWorkspaceReports-той
  // нийцүүлэн) хэлтэст scope болохгүй — өмнө mfoManager/mfoDispatcher/fleetRepairManager
  // нар scope болж байгаад тайлан харах эрхтэйгээ зөрчиж байсан.
  if (
    flags?.municipalManager ||
    flags?.mfoManager ||
    flags?.mfoDispatcher ||
    flags?.fleetRepairManager
  ) {
    return false;
  }

  return (
    session.role === "worker" ||
    isMasterRole(session.role)
  );
}

export async function loadSessionEmployeeDepartmentName(session: AppSession) {
  const cacheKey = getSessionDepartmentNameCacheKey(session);
  const cached = sessionDepartmentNameCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  if (cached) {
    sessionDepartmentNameCache.delete(cacheKey);
  }

  try {
    const employees = await loadEmployeeDepartmentRecords(
      [["user_id", "=", session.uid]],
      {
        login: session.login,
        password: session.password,
      },
    ).catch(() => []);
    const departmentName =
      getDepartmentNameFromEmployees(employees, session, { allowAmbiguousMatch: true }) ||
      await loadFallbackEmployeeDepartmentName(session) ||
      getFallbackDepartmentName(session);
    sessionDepartmentNameCache.set(cacheKey, {
      value: departmentName,
      expiresAt: Date.now() + SESSION_DEPARTMENT_NAME_CACHE_TTL_MS,
    });
    return departmentName;
  } catch (error) {
    console.warn("Session department scope could not be loaded:", error);
    return getFallbackDepartmentName(session);
  }
}

export async function loadSessionDepartmentName(session: AppSession) {
  if (!shouldScopeToOwnDepartment(session)) {
    return null;
  }

  return loadSessionEmployeeDepartmentName(session);
}
