import "server-only";

import type { AppSession } from "@/lib/auth";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";

type Relation = [number, string] | false;

type TaskProjectRecord = {
  project_id: Relation;
};

type ProjectDepartmentRecord = {
  ops_department_id?: Relation;
};

type EmployeeDepartmentRecord = {
  department_id: Relation;
};

export type TaskReportReviewAccess = {
  projectDepartmentId: number | null;
  userDepartmentId: number | null;
};

function relationId(value: Relation | undefined) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return null;
}

function normalizeTitle(value?: string | null) {
  return (value ?? "").toLocaleLowerCase("mn-MN").trim();
}

function isOperationsManager(session: Pick<AppSession, "role" | "employeeJobTitle">) {
  const jobTitle = normalizeTitle(session.employeeJobTitle);
  return (
    session.role === "general_manager" ||
    jobTitle.includes("үйл ажиллагаа хариуцсан менежер") ||
    jobTitle.includes("ерөнхий менежер")
  );
}

export function isWorkspaceReportReviewerRole(
  session: Pick<AppSession, "role" | "employeeJobTitle" | "groupFlags">,
  sameDepartment: boolean,
) {
  if (isOperationsManager(session)) {
    return true;
  }

  if (!sameDepartment) {
    return false;
  }

  return Boolean(
    session.role === "senior_master" ||
      session.role === "project_manager" ||
      session.groupFlags?.municipalDepartmentHead,
  );
}

export function canReviewWorkspaceTaskReport(
  session: Pick<AppSession, "role" | "employeeJobTitle" | "groupFlags">,
  input: TaskReportReviewAccess & {
    hasOwnSubmittedReport: boolean;
  },
) {
  if (input.hasOwnSubmittedReport) {
    return false;
  }

  const sameDepartment =
    Boolean(input.projectDepartmentId) &&
    Boolean(input.userDepartmentId) &&
    input.projectDepartmentId === input.userDepartmentId;

  return isWorkspaceReportReviewerRole(session, sameDepartment);
}

async function readTaskReportReviewAccess(
  taskId: number,
  userId: number,
  connectionOverrides: Partial<OdooConnection>,
): Promise<TaskReportReviewAccess> {
  const tasks = await executeOdooKw<TaskProjectRecord[]>(
    "project.task",
    "search_read",
    [[["id", "=", taskId]]],
    {
      fields: ["project_id"],
      limit: 1,
    },
    connectionOverrides,
  );
  const projectId = relationId(tasks[0]?.project_id);

  const [projects, employees] = await Promise.all([
    projectId
      ? executeOdooKw<ProjectDepartmentRecord[]>(
          "project.project",
          "search_read",
          [[["id", "=", projectId]]],
          {
            fields: ["ops_department_id"],
            limit: 1,
          },
          connectionOverrides,
        ).catch(() => [])
      : Promise.resolve([]),
    executeOdooKw<EmployeeDepartmentRecord[]>(
      "hr.employee",
      "search_read",
      [[["user_id", "=", userId]]],
      {
        fields: ["department_id"],
        limit: 1,
      },
      connectionOverrides,
    ).catch(() => []),
  ]);

  const project = projects[0] ?? null;
  return {
    projectDepartmentId: relationId(project?.ops_department_id),
    userDepartmentId: relationId(employees[0]?.department_id),
  };
}

export async function loadTaskReportReviewAccess(
  taskId: number,
  userId: number,
  connectionOverrides: Partial<OdooConnection> = {},
): Promise<TaskReportReviewAccess> {
  try {
    return await readTaskReportReviewAccess(taskId, userId, connectionOverrides);
  } catch (error) {
    if (!connectionOverrides.login && !connectionOverrides.password) {
      throw error;
    }
    return readTaskReportReviewAccess(taskId, userId, {});
  }
}
