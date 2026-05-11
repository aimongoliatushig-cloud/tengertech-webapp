import "server-only";

import { type AppSession } from "@/lib/auth";
import { isMasterRole } from "@/lib/roles";

type MasterScopedProject = {
  id: number;
  managerId?: number | null;
};

type MasterScopedTask = {
  projectId?: number | null;
  leaderId?: number | null;
};

function isSameUser(left: number | string | null | undefined, right: number | string) {
  return left !== null && left !== undefined && String(left) === String(right);
}

export function filterTasksForResponsibleMaster<T extends MasterScopedTask>(
  tasks: T[],
  projects: MasterScopedProject[],
  session: AppSession,
) {
  if (!isMasterRole(session.role)) {
    return tasks;
  }
  if (session.role === "senior_master") {
    return tasks;
  }

  const currentUserId = String(session.uid);
  const ownedProjectIds = new Set(
    projects
      .filter((project) => isSameUser(project.managerId, currentUserId))
      .map((project) => project.id),
  );

  return tasks.filter(
    (task) =>
      isSameUser(task.leaderId, currentUserId) ||
      (typeof task.projectId === "number" && ownedProjectIds.has(task.projectId)),
  );
}

export function filterProjectsForResponsibleMaster<
  TProject extends MasterScopedProject,
  TTask extends MasterScopedTask,
>(projects: TProject[], tasks: TTask[], session: AppSession) {
  if (!isMasterRole(session.role)) {
    return projects;
  }
  if (session.role === "senior_master") {
    return projects;
  }

  const currentUserId = String(session.uid);
  const taskProjectIds = new Set(
    tasks
      .filter((task) => isSameUser(task.leaderId, currentUserId))
      .map((task) => task.projectId)
      .filter((projectId): projectId is number => typeof projectId === "number"),
  );

  return projects.filter(
    (project) => isSameUser(project.managerId, currentUserId) || taskProjectIds.has(project.id),
  );
}
