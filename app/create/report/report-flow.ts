import "server-only";

import type { AppSession } from "@/lib/auth";
import { isMasterRole, isWorkerOnly } from "@/lib/auth";
import { filterByDepartment, pickPrimaryDepartmentName } from "@/lib/dashboard-scope";
import { filterTasksForResponsibleMaster } from "@/lib/master-scope";
import { resolveManagerJobTitle } from "@/lib/manager-job-titles";
import { loadMunicipalSnapshot, type TaskDirectoryItem } from "@/lib/odoo";

type Snapshot = Awaited<ReturnType<typeof loadMunicipalSnapshot>>;
type SnapshotProject = Snapshot["projects"][number];

export type ReportProjectSummary = {
  id: number;
  name: string;
  manager: string;
  managerJobTitle?: string;
  departmentName: string;
  deadline: string;
  completion: number;
  href: string;
  taskCount: number;
  workingTaskCount: number;
  reviewTaskCount: number;
  problemTaskCount: number;
};

export function getScopedActiveReportTasks(snapshot: Snapshot, session: AppSession) {
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  const masterDepartmentName = masterMode
    ? pickPrimaryDepartmentName({
        taskDirectory: snapshot.taskDirectory,
        reports: snapshot.reports,
        projects: snapshot.projects,
        departments: snapshot.departments,
      })
    : null;
  const masterDepartmentProjects = masterDepartmentName
    ? filterByDepartment(snapshot.projects, masterDepartmentName)
    : snapshot.projects;

  const scopedTasks = workerMode
    ? snapshot.taskDirectory.filter((task) => task.assigneeIds?.includes(session.uid))
    : masterMode
      ? filterTasksForResponsibleMaster(
          masterDepartmentName
            ? filterByDepartment(snapshot.taskDirectory, masterDepartmentName)
            : snapshot.taskDirectory,
          masterDepartmentProjects,
          session,
        )
      : snapshot.taskDirectory;

  return scopedTasks.filter((task) => task.statusKey !== "verified");
}

export function buildReportProjectSummaries(
  projects: SnapshotProject[],
  tasks: TaskDirectoryItem[],
) {
  const projectByName = new Map(projects.map((project) => [project.name, project]));

  return Array.from(
    tasks.reduce<Map<number, ReportProjectSummary>>((accumulator, task) => {
      const linkedProject = projectByName.get(task.projectName);
      if (!linkedProject) {
        return accumulator;
      }

      const existing = accumulator.get(linkedProject.id) ?? {
        id: linkedProject.id,
        name: linkedProject.name,
        manager: linkedProject.manager,
        managerJobTitle: resolveManagerJobTitle(linkedProject.manager, linkedProject.managerJobTitle),
        departmentName: linkedProject.departmentName,
        deadline: linkedProject.deadline,
        completion: 0,
        href: linkedProject.href,
        taskCount: 0,
        workingTaskCount: 0,
        reviewTaskCount: 0,
        problemTaskCount: 0,
      };

      existing.taskCount += 1;
      existing.completion += task.progress;

      if (task.statusKey === "working") {
        existing.workingTaskCount += 1;
      } else if (task.statusKey === "review") {
        existing.reviewTaskCount += 1;
      } else if (task.statusKey === "problem") {
        existing.problemTaskCount += 1;
      }

      accumulator.set(linkedProject.id, existing);
      return accumulator;
    }, new Map()),
  )
    .map(([, project]) => ({
      ...project,
      completion: project.taskCount ? Math.round(project.completion / project.taskCount) : 0,
    }))
    .sort((left, right) => {
      const rank = (project: ReportProjectSummary) => {
        if (project.problemTaskCount > 0) {
          return 0;
        }

        if (project.reviewTaskCount > 0) {
          return 1;
        }

        if (project.workingTaskCount > 0) {
          return 2;
        }

        return 3;
      };

      const rankDiff = rank(left) - rank(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      if (right.taskCount !== left.taskCount) {
        return right.taskCount - left.taskCount;
      }

      return left.name.localeCompare(right.name, "mn");
    });
}
