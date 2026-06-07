import "server-only";

import type { AppSession } from "@/lib/auth";
import { normalizeOrganizationUnitName } from "@/lib/department-groups";
import { executeOdooKw } from "@/lib/odoo";
import { isMasterRole } from "@/lib/roles";

type EmployeeDepartmentRecord = {
  department_id: [number, string] | false;
};

type CachedSessionDepartmentName = {
  expiresAt: number;
  value: string | null;
};

const SESSION_DEPARTMENT_NAME_CACHE_TTL_MS = 60_000;
const sessionDepartmentNameCache = new Map<string, CachedSessionDepartmentName>();

function getSessionDepartmentNameCacheKey(session: AppSession) {
  return `${session.uid}:${session.login}:${session.password}:${session.role}`;
}

function getFallbackDepartmentName(session: Pick<AppSession, "role">) {
  if (session.role === "system_admin") {
    return normalizeOrganizationUnitName("Удирдлага") || "Захиргааны алба";
  }

  return null;
}

export function shouldScopeToOwnDepartment(
  session: Pick<AppSession, "role"> & { groupFlags?: AppSession["groupFlags"] },
) {
  const flags = session.groupFlags;
  if (session.role === "project_manager" || Boolean(flags?.municipalDepartmentHead)) {
    return true;
  }

  if (
    session.role === "system_admin" ||
    session.role === "director" ||
    session.role === "general_manager" ||
    flags?.municipalManager ||
    flags?.municipalDirector ||
    flags?.fleetRepairCeo ||
    flags?.fleetRepairGeneralManager
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
    const employees = await executeOdooKw<EmployeeDepartmentRecord[]>(
      "hr.employee",
      "search_read",
      [[["user_id", "=", session.uid]]],
      {
        fields: ["department_id"],
        limit: 1,
      },
      {
        login: session.login,
        password: session.password,
      },
    );
    const departmentRelation = employees[0]?.department_id;
    const rawDepartmentName = Array.isArray(departmentRelation) ? departmentRelation[1] : "";
    const canonicalDepartmentName = normalizeOrganizationUnitName(rawDepartmentName);

    const departmentName =
      canonicalDepartmentName || rawDepartmentName.trim() || getFallbackDepartmentName(session);
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
