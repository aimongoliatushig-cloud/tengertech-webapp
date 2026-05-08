import "server-only";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { type AppSession, isWorkerOnly } from "@/lib/auth";
import { filterByDepartment, getTodayDateKey } from "@/lib/dashboard-scope";
import { loadReadNotificationKeys } from "@/lib/notification-state";
import { loadMunicipalSnapshot, type DashboardSnapshot } from "@/lib/odoo";

type NotificationReason = "new" | "review" | "overdue" | "issue";

type WorkspaceNotificationRecord = {
  key: string;
  reasons: NotificationReason[];
};

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

function parseNotificationTimeMs(value?: string | null) {
  if (!value) {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function taskNotificationTimeMs(task: DashboardSnapshot["taskDirectory"][number]) {
  return (
    parseNotificationTimeMs(task.latestReport?.submittedAt) ||
    parseNotificationTimeMs(task.createdAt) ||
    parseNotificationTimeMs(task.createdDate)
  );
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
  return buildWorkspaceNotificationRecords(snapshot, session, scopedDepartmentName).length;
}

export function buildWorkspaceNotificationRecords(
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

  const notificationsById = new Map<
    string,
    {
      itemKey: string;
      sortTimeMs: number;
      reasons: NotificationReason[];
    }
  >();
  const ensureFromTask = (task: DashboardSnapshot["taskDirectory"][number]) => {
    const itemKey = workerMode ? `work:${task.projectId ?? task.projectName}` : `task:${task.id}`;
    const sortTimeMs = taskNotificationTimeMs(task);
    const existing = notificationsById.get(itemKey);

    if (existing) {
      if (sortTimeMs > existing.sortTimeMs) {
        existing.sortTimeMs = sortTimeMs;
      }
      return existing;
    }

    const item = {
      itemKey,
      sortTimeMs,
      reasons: [],
    };
    notificationsById.set(itemKey, item);
    return item;
  };

  for (const task of visibleTasks) {
    const item = ensureFromTask(task);
    if (task.createdDate === todayDateKey && task.statusKey !== "verified") {
      addReason(item.reasons, "new");
    }
    if (isOverdue(task, todayDateKey)) {
      addReason(item.reasons, "overdue");
    }
    if (task.issueFlag) {
      addReason(item.reasons, "issue");
    }
    if (!item.reasons.length) {
      notificationsById.delete(item.itemKey);
    }
  }

  for (const reviewTask of visibleReviewQueue) {
    const existingTask = visibleTasks.find((task) => task.id === reviewTask.id);
    const item = existingTask
      ? ensureFromTask(existingTask)
      : {
          itemKey: `review:${reviewTask.id}`,
          sortTimeMs: 0,
          reasons: [] as NotificationReason[],
        };
    addReason(item.reasons, "review");
    notificationsById.set(item.itemKey, item);
  }

  return Array.from(notificationsById.values()).map((item) => ({
    key: `${item.itemKey}:${item.sortTimeMs || "unknown"}`,
    reasons: item.reasons,
  })) satisfies WorkspaceNotificationRecord[];
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

  const summary = await loadWorkspaceNotificationSummary(session, {
    snapshot,
    scopedDepartmentName,
  });
  return summary.unreadCount;
}

export async function loadWorkspaceNotificationSummary(
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

  const notifications = buildWorkspaceNotificationRecords(snapshot, session, scopedDepartmentName);
  const readKeys = await loadReadNotificationKeys(
    session,
    notifications.map((item) => item.key),
  );
  const unreadNotifications = notifications.filter((item) => !readKeys.has(item.key));

  return {
    unreadCount: unreadNotifications.length,
    newCount: unreadNotifications.filter((item) => item.reasons.includes("new")).length,
    reviewCount: unreadNotifications.filter((item) => item.reasons.includes("review")).length,
    overdueCount: unreadNotifications.filter((item) => item.reasons.includes("overdue")).length,
    issueCount: unreadNotifications.filter((item) => item.reasons.includes("issue")).length,
  };
}
