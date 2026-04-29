import "server-only";

import { normalizeDepartmentText } from "@/lib/department-permissions";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { loadDepartmentOptions } from "@/lib/workspace";

type Relation = [number, string] | false;

type EmployeeRecord = {
  id: number;
  name: string;
  job_title?: string | false;
  department_id?: Relation;
};

function relationName(value: Relation | undefined) {
  return Array.isArray(value) ? value[1] : "";
}

async function loadScopedDepartmentId(
  departmentName: string | null,
  connectionOverrides: Partial<OdooConnection>,
) {
  if (!departmentName) {
    return null;
  }

  const normalized = normalizeDepartmentText(departmentName);
  const departments = await loadDepartmentOptions(connectionOverrides);
  return departments.find((department) => normalizeDepartmentText(department.name) === normalized)
    ?.id ?? null;
}

export async function loadTeamMemberOptions(
  departmentName: string | null,
  connectionOverrides: Partial<OdooConnection> = {},
) {
  const departmentId = await loadScopedDepartmentId(departmentName, connectionOverrides);
  const domain: unknown[] = [["active", "=", true]];

  if (departmentId) {
    domain.push(["department_id", "=", departmentId]);
  }

  const employees = await executeOdooKw<EmployeeRecord[]>(
    "hr.employee",
    "search_read",
    [domain],
    {
      fields: ["name", "job_title", "department_id"],
      order: "department_id asc, name asc",
      limit: 300,
    },
    connectionOverrides,
  ).catch(() => []);

  const normalizedScope = normalizeDepartmentText(departmentName);
  const visibleEmployees = departmentId || !normalizedScope
    ? employees
    : employees.filter((employee) =>
        normalizeDepartmentText(relationName(employee.department_id)).includes(normalizedScope),
      );

  return visibleEmployees.map((employee) => {
    const jobTitle = employee.job_title || "";
    const department = relationName(employee.department_id);
    const meta = [jobTitle, department].filter(Boolean).join(" · ");

    return {
      id: employee.id,
      label: meta ? `${employee.name} (${meta})` : employee.name,
    };
  });
}
