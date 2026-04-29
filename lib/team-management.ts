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

type OdooFieldMap = Record<string, { type?: string }>;

type CrewTeamRecord = {
  id: number;
  name: string;
  active?: boolean;
  operation_type?: string | false;
  department_id?: Relation;
  ops_department_id?: Relation;
  vehicle_id?: Relation;
  collector_employee_ids?: number[];
  member_employee_ids?: number[];
  member_ids?: number[];
  employee_ids?: number[];
  loader_employee_ids?: number[];
  loader_ids?: number[];
  mfo_loader_employee_ids?: number[];
  mfo_loader_ids?: number[];
};

export type TeamManagementData = {
  teams: Array<{
    id: number;
    name: string;
    operationType: string;
    departmentName: string;
    vehicleName: string;
    memberIds: number[];
    memberNames: string[];
  }>;
  totalTeams: number;
};

const TEAM_MEMBER_FIELDS = [
  "collector_employee_ids",
  "member_employee_ids",
  "member_ids",
  "employee_ids",
  "loader_employee_ids",
  "loader_ids",
  "mfo_loader_employee_ids",
  "mfo_loader_ids",
] as const;

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

async function getModelFields(model: string, connectionOverrides: Partial<OdooConnection>) {
  return executeOdooKw<OdooFieldMap>(
    model,
    "fields_get",
    [],
    { attributes: ["type"] },
    connectionOverrides,
  ).catch(() => null);
}

function pickExistingFields(fields: OdooFieldMap | null, candidates: string[]) {
  if (!fields) {
    return candidates;
  }
  return candidates.filter((fieldName) => fields[fieldName]);
}

function getTeamMemberIds(team: CrewTeamRecord) {
  const ids = new Set<number>();

  for (const fieldName of TEAM_MEMBER_FIELDS) {
    const value = team[fieldName];
    if (!Array.isArray(value)) {
      continue;
    }

    for (const id of value) {
      if (Number.isInteger(id) && id > 0) {
        ids.add(id);
      }
    }
  }

  return Array.from(ids);
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

export async function loadTeamManagementData(
  departmentName: string | null,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<TeamManagementData> {
  const [departmentId, teamFields] = await Promise.all([
    loadScopedDepartmentId(departmentName, connectionOverrides),
    getModelFields("mfo.crew.team", connectionOverrides),
  ]);

  const teamFieldNames = pickExistingFields(teamFields, [
    "name",
    "active",
    "operation_type",
    "department_id",
    "ops_department_id",
    "vehicle_id",
    ...TEAM_MEMBER_FIELDS,
  ]);

  const domain: unknown[] = [["active", "=", true]];
  const hasDepartmentField = Boolean(teamFields?.department_id);
  const hasOpsDepartmentField = Boolean(teamFields?.ops_department_id);

  if (departmentId && hasDepartmentField && hasOpsDepartmentField) {
    domain.push("|", ["department_id", "=", departmentId], ["ops_department_id", "=", departmentId]);
  } else if (departmentId && hasDepartmentField) {
    domain.push(["department_id", "=", departmentId]);
  } else if (departmentId && hasOpsDepartmentField) {
    domain.push(["ops_department_id", "=", departmentId]);
  }

  const teams = await executeOdooKw<CrewTeamRecord[]>(
    "mfo.crew.team",
    "search_read",
    [domain],
    {
      fields: teamFieldNames,
      order: "name asc",
      limit: 300,
    },
    connectionOverrides,
  ).catch(() => []);

  const normalizedScope = normalizeDepartmentText(departmentName);
  const scopedTeams = departmentId || !normalizedScope
    ? teams
    : teams.filter((team) => {
        const departmentNames = [
          relationName(team.department_id),
          relationName(team.ops_department_id),
        ].map((name) => normalizeDepartmentText(name));
        return departmentNames.some((name) => name.includes(normalizedScope));
      });

  const allMemberIds = Array.from(
    new Set(scopedTeams.flatMap((team) => getTeamMemberIds(team))),
  );

  const employees = allMemberIds.length
    ? await executeOdooKw<EmployeeRecord[]>(
        "hr.employee",
        "search_read",
        [[["id", "in", allMemberIds]]],
        {
          fields: ["name"],
          limit: allMemberIds.length,
        },
        connectionOverrides,
      ).catch(() => [])
    : [];

  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.name]));

  const mappedTeams = scopedTeams.map((team) => {
    const memberIds = getTeamMemberIds(team);

    return {
      id: team.id,
      name: team.name,
      operationType: team.operation_type || "",
      departmentName: relationName(team.department_id) || relationName(team.ops_department_id),
      vehicleName: relationName(team.vehicle_id),
      memberIds,
      memberNames: memberIds
        .map((id) => employeeNames.get(id))
        .filter((name): name is string => Boolean(name)),
    };
  });

  return {
    teams: mappedTeams,
    totalTeams: mappedTeams.length,
  };
}
