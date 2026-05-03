import "server-only";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { type AppSession, isWorkerOnly } from "@/lib/auth";
import { filterByDepartment, getTodayDateKey } from "@/lib/dashboard-scope";
import { loadMunicipalSnapshot, type DashboardSnapshot } from "@/lib/odoo";

type NotificationReason = "new" | "review" | "overdue" | "issue";

function normalizeTaskAssigneeId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isOverdue(task: DashboardSnapshot["taskDirectory"][number], todayDateKey: string) {
  return Boolean(
    task.scheduledDate &&
      task.scheduledDate < todayDateKey &&
      task.statusKey !== "verified",
  );
}

function addReason(reasons: NotificationReason[], reason: NotificationReason) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function isAssignedToUser(task: DashboardSnapshot["taskDirectory"][number], userId: string) {
  return (task.assigneeIds ?? [])
    .map(normalizeTaskAssigneeId)
    .some((assigneeId) => assigneeId !== null && String(assigneeId) === userId);
}

function resolveWorkerDepartmentName(snapshot: DashboardSnapshot, session: AppSession) {
  if (!isWorkerOnly(session)) {
    return null;
  }

  const currentUserId = String(session.uid);
  return (
    snapshot.taskDirectory.find((task) => isAssignedToUser(task, currentUserId))
      ?.departmentName ?? null
  );
}

export function countWorkspaceNotifications(
  snapshot: DashboardSnapshot,
  session: AppSession,
  scopedDepartmentName: string | null = null,
) {
  const todayDateKey = getTodayDateKey();
  const workerMode = isWorkerOnly(session);
  const currentUserId = String(session.uid);

  const departmentScopedTasks = scopedDepartmentName
    ? snapshot.taskDirectory.filter(
        (task) =>
          filterByDepartment([task], scopedDepartmentName).length > 0 ||
          isAssignedToUser(task, currentUserId),
      )
    : snapshot.taskDirectory;
  const visibleTasks = workerMode
    ? departmentScopedTasks.filter((task) => isAssignedToUser(task, currentUserId))
    : departmentScopedTasks;
  const visibleReviewQueue = workerMode
    ? []
    : scopedDepartmentName
      ? filterByDepartment(snapshot.reviewQueue, scopedDepartmentName)
      : snapshot.reviewQueue;

  const notificationsById = new Map<number, NotificationReason[]>();

  for (const task of visibleTasks) {
    const reasons: NotificationReason[] = [];
    if (task.createdDate === todayDateKey && task.statusKey !== "verified") {
      addReason(reasons, "new");
    }
    if (isOverdue(task, todayDateKey)) {
      addReason(reasons, "overdue");
    }
    if (task.issueFlag) {
      addReason(reasons, "issue");
    }
    if (reasons.length) {
      notificationsById.set(task.id, reasons);
    }
  }

  for (const reviewTask of visibleReviewQueue) {
    const reasons = notificationsById.get(reviewTask.id) ?? [];
    addReason(reasons, "review");
    notificationsById.set(reviewTask.id, reasons);
  }

  return notificationsById.size;
}

export async function loadWorkspaceNotificationCount(
  session: AppSession,
  options: {
    snapshot?: DashboardSnapshot;
    scopedDepartmentName?: string | null;
  } = {},
) {
  const snapshot =
    options.snapshot ??
    (await loadMunicipalSnapshot({
      login: session.login,
      password: session.password,
    }));
  let scopedDepartmentName =
    "scopedDepartmentName" in options
      ? options.scopedDepartmentName ?? null
      : await loadSessionDepartmentName(session);

  if (!scopedDepartmentName) {
    scopedDepartmentName = resolveWorkerDepartmentName(snapshot, session);
  }

  return countWorkspaceNotifications(snapshot, session, scopedDepartmentName);
}
