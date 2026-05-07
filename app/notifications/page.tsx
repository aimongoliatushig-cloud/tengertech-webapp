import { CheckCircle2 } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { filterByDepartment, getTodayDateKey } from "@/lib/dashboard-scope";
import { loadReadNotificationKeys } from "@/lib/notification-state";
import { loadMunicipalSnapshot, type DashboardSnapshot } from "@/lib/odoo";

import { NotificationList, type NotificationListItem } from "./notification-list";
import styles from "./notifications.module.css";

type NotificationItem = {
  key: string;
  name: string;
  departmentName: string;
  projectName: string;
  stageLabel: string;
  href: string;
  progress: number;
  taskCount: number;
  sortTimeMs: number;
  timeLabel: string;
  reasons: Array<"new" | "review" | "overdue" | "issue">;
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

function addReason(item: NotificationItem, reason: NotificationItem["reasons"][number]) {
  if (!item.reasons.includes(reason)) {
    item.reasons.push(reason);
  }
}

function notificationPriority(item: NotificationItem) {
  const priority = { issue: 4, overdue: 3, review: 2, new: 1 };
  return Math.max(...item.reasons.map((reason) => priority[reason]));
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

function formatNotificationTime(sortTimeMs: number, nowMs: number) {
  if (!sortTimeMs) {
    return "Огноо тодорхойгүй";
  }

  const diffMs = Math.max(0, nowMs - sortTimeMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) {
    return "Саяхан";
  }

  if (diffMs < hourMs) {
    return `${Math.floor(diffMs / minuteMs)} минутын өмнө`;
  }

  if (diffMs < dayMs) {
    return `${Math.floor(diffMs / hourMs)} цагийн өмнө`;
  }

  if (diffMs < 7 * dayMs) {
    return `${Math.floor(diffMs / dayMs)} өдрийн өмнө`;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    month: "long",
    day: "numeric",
  }).format(new Date(sortTimeMs));
}

function getRequestTimeMs() {
  return Date.now();
}

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await requireSession();
  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });

  let scopedDepartmentName = await loadSessionDepartmentName(session);
  if (!scopedDepartmentName && isWorkerOnly(session)) {
    const currentUserId = String(session.uid);
    scopedDepartmentName =
      snapshot.taskDirectory.find((task) =>
        (task.assigneeIds ?? []).some((assigneeId) => String(assigneeId) === currentUserId),
      )?.departmentName ?? null;
  }

  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const todayDateKey = getTodayDateKey();
  const nowMs = getRequestTimeMs();
  const currentUserId = String(session.uid);
  const isAssignedToCurrentUser = (task: DashboardSnapshot["taskDirectory"][number]) =>
    (task.assigneeIds ?? [])
      .map(normalizeTaskAssigneeId)
      .some((assigneeId) => assigneeId !== null && String(assigneeId) === currentUserId);

  const departmentScopedTasks = scopedDepartmentName
    ? snapshot.taskDirectory.filter(
        (task) =>
          filterByDepartment([task], scopedDepartmentName).length > 0 ||
          isAssignedToCurrentUser(task),
      )
    : snapshot.taskDirectory;
  const visibleTasks = workerMode
    ? departmentScopedTasks.filter(isAssignedToCurrentUser)
    : departmentScopedTasks;
  const visibleReviewQueue = workerMode
    ? []
    : scopedDepartmentName
      ? filterByDepartment(snapshot.reviewQueue, scopedDepartmentName)
      : snapshot.reviewQueue;
  const workerWorkStats = workerMode
    ? visibleTasks.reduce<Map<string, { taskCount: number; progressTotal: number }>>((groups, task) => {
        const existing = groups.get(task.projectName) ?? { taskCount: 0, progressTotal: 0 };
        existing.taskCount += 1;
        existing.progressTotal += task.progress;
        groups.set(task.projectName, existing);
        return groups;
      }, new Map())
    : new Map<string, { taskCount: number; progressTotal: number }>();

  const notificationsById = new Map<string, NotificationItem>();
  const ensureFromTask = (task: DashboardSnapshot["taskDirectory"][number]) => {
    const itemKey = workerMode ? `work:${task.projectId ?? task.projectName}` : `task:${task.id}`;
    const sortTimeMs = taskNotificationTimeMs(task);
    const notificationKey = `${itemKey}:${sortTimeMs || "unknown"}`;
    const existing = notificationsById.get(itemKey);
    if (existing) {
      if (sortTimeMs > existing.sortTimeMs) {
        existing.key = notificationKey;
        existing.sortTimeMs = sortTimeMs;
        existing.timeLabel = formatNotificationTime(sortTimeMs, nowMs);
      }
      return existing;
    }
    const workStats = workerWorkStats.get(task.projectName);
    const taskCount = workerMode ? (workStats?.taskCount ?? 1) : 1;
    const progress =
      workerMode && workStats?.taskCount
        ? Math.round(workStats.progressTotal / workStats.taskCount)
        : task.progress;

    const item: NotificationItem = {
      key: notificationKey,
      name: workerMode ? task.projectName : task.name,
      departmentName: task.departmentName,
      projectName: task.projectName,
      stageLabel: workerMode ? "Ажлын мэдэгдэл" : task.stageLabel,
      href: workerMode ? `/tasks?work=${encodeURIComponent(task.projectName)}` : task.href,
      progress,
      taskCount,
      sortTimeMs,
      timeLabel: formatNotificationTime(sortTimeMs, nowMs),
      reasons: [],
    };
    notificationsById.set(itemKey, item);
    return item;
  };

  for (const task of visibleTasks) {
    const item = ensureFromTask(task);
    if (task.createdDate === todayDateKey && task.statusKey !== "verified") {
      addReason(item, "new");
    }
    if (isOverdue(task, todayDateKey)) {
      addReason(item, "overdue");
    }
    if (task.issueFlag) {
      addReason(item, "issue");
    }
    if (!item.reasons.length) {
      notificationsById.delete(
        workerMode ? `work:${task.projectId ?? task.projectName}` : `task:${task.id}`,
      );
    }
  }

  for (const reviewTask of visibleReviewQueue) {
    const existingTask = visibleTasks.find((task) => task.id === reviewTask.id);
    const item = existingTask
      ? ensureFromTask(existingTask)
      : {
          key: `review:${reviewTask.id}`,
          name: reviewTask.name,
          departmentName: reviewTask.departmentName,
          projectName: reviewTask.projectName,
          stageLabel: reviewTask.stageLabel,
          href: reviewTask.href,
          progress: reviewTask.progress,
          taskCount: 1,
          sortTimeMs: 0,
          timeLabel: formatNotificationTime(0, nowMs),
          reasons: [],
        };
    notificationsById.set(item.key, item);
    addReason(item, "review");
  }

  const notifications = Array.from(notificationsById.values()).sort((left, right) => {
    const leftScore = notificationPriority(left);
    const rightScore = notificationPriority(right);
    return (
      right.sortTimeMs - left.sortTimeMs ||
      rightScore - leftScore ||
      left.name.localeCompare(right.name, "mn")
    );
  });
  const readKeys = await loadReadNotificationKeys(
    session,
    notifications.map((item) => item.key),
  );
  const notificationItems: NotificationListItem[] = notifications.map((item) => ({
    ...item,
    isRead: readKeys.has(item.key),
  }));
  const unreadNotifications = notificationItems.filter((item) => !item.isRead);
  const unreadCount = unreadNotifications.length;
  const newCount = unreadNotifications.filter((item) => item.reasons.includes("new")).length;
  const reviewCount = unreadNotifications.filter((item) => item.reasons.includes("review")).length;
  const overdueCount = unreadNotifications.filter((item) => item.reasons.includes("overdue")).length;
  const notificationNote =
    unreadCount > 0
      ? `${newCount} шинэ ажил, ${reviewCount} хянах, ${overdueCount} хугацаа хэтэрсэн`
      : "Шинэ мэдэгдэл алга";

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="notifications"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              workerMode={workerMode}
              notificationCount={unreadCount}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Мэдэгдэл"
              subtitle="Танд ирсэн шинэ ажил, хянах болон анхаарах зүйлс"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={unreadCount}
              notificationNote={notificationNote}
            />

            <section className={styles.notificationGrid}>
              <div className={styles.listHeader}>
                <div>
                  <h2>Мэдэгдлийн жагсаалт</h2>
                  <p>{scopedDepartmentName ?? "Бүх алба хэлтэс"} доторх танд харагдах мэдэгдэл.</p>
                </div>
              </div>

              {notificationItems.length ? (
                <NotificationList items={notificationItems} workerMode={workerMode} />
              ) : (
                <article className={styles.emptyCard}>
                  <CheckCircle2 aria-hidden />
                  <strong>Одоогоор шинэ мэдэгдэл алга</strong>
                  <span>Шинэ ажил эсвэл хянах зүйл ирэхэд энд харагдана.</span>
                </article>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
