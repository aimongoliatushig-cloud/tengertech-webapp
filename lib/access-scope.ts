import "server-only";

import type { AppSession } from "@/lib/auth";
import { normalizeOrganizationUnitName } from "@/lib/department-groups";
import { executeOdooKw } from "@/lib/odoo";
import { isMasterRole } from "@/lib/roles";

type EmployeeDepartmentRecord = {
  department_id: [number, string] | false;
};

export function shouldScopeToOwnDepartment(session: Pick<AppSession, "role">) {
  return session.role === "project_manager" || isMasterRole(session.role);
}

export async function loadSessionDepartmentName(session: AppSession) {
  if (!shouldScopeToOwnDepartment(session)) {
    return null;
  }

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

  return canonicalDepartmentName || rawDepartmentName.trim() || null;
}
