import Link from "next/link";
import { AlertTriangle, Bell, CheckCircle2, ClipboardList } from "lucide-react";

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
import { loadMunicipalSnapshot, type DashboardSnapshot } from "@/lib/odoo";
import { cn } from "@/lib/utils";

import styles from "./notifications.module.css";

type NotificationItem = {
  id: number;
  name: string;
  departmentName: string;
  projectName: string;
  stageLabel: string;
  href: string;
  progress: number;
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

function reasonLabel(reason: NotificationItem["reasons"][number]) {
  switch (reason) {
    case "new":
      return "Шинэ ажил";
    case "review":
      return "Хянах";
    case "overdue":
      return "Хугацаа хэтэрсэн";
    case "issue":
      return "Анхаарах";
  }
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

  const notificationsById = new Map<number, NotificationItem>();
  const ensureFromTask = (task: DashboardSnapshot["taskDirectory"][number]) => {
    const existing = notificationsById.get(task.id);
    if (existing) {
      return existing;
    }

    const item: NotificationItem = {
      id: task.id,
      name: task.name,
      departmentName: task.departmentName,
      projectName: task.projectName,
      stageLabel: task.stageLabel,
      href: task.href,
      progress: task.progress,
      reasons: [],
    };
    notificationsById.set(task.id, item);
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
      notificationsById.delete(task.id);
    }
  }

  for (const reviewTask of visibleReviewQueue) {
    const existingTask = visibleTasks.find((task) => task.id === reviewTask.id);
    const item = existingTask
      ? ensureFromTask(existingTask)
      : {
          id: reviewTask.id,
          name: reviewTask.name,
          departmentName: reviewTask.departmentName,
          projectName: reviewTask.projectName,
          stageLabel: reviewTask.stageLabel,
          href: reviewTask.href,
          progress: reviewTask.progress,
          reasons: [],
        };
    notificationsById.set(reviewTask.id, item);
    addReason(item, "review");
  }

  const notifications = Array.from(notificationsById.values()).sort((left, right) => {
    const priority = { issue: 4, overdue: 3, review: 2, new: 1 };
    const leftScore = Math.max(...left.reasons.map((reason) => priority[reason]));
    const rightScore = Math.max(...right.reasons.map((reason) => priority[reason]));
    return rightScore - leftScore || left.name.localeCompare(right.name, "mn");
  });
  const newCount = notifications.filter((item) => item.reasons.includes("new")).length;
  const reviewCount = notifications.filter((item) => item.reasons.includes("review")).length;
  const overdueCount = notifications.filter((item) => item.reasons.includes("overdue")).length;
  const notificationNote =
    notifications.length > 0
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
              masterMode={masterMode}
              workerMode={workerMode}
              notificationCount={notifications.length}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Мэдэгдэл"
              subtitle="Танд ирсэн шинэ ажил, хянах болон анхаарах зүйлс"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={notifications.length}
              notificationNote={notificationNote}
            />

            <section className={styles.notificationGrid}>
              <div className={styles.listHeader}>
                <div>
                  <h2>Мэдэгдлийн жагсаалт</h2>
                  <p>{scopedDepartmentName ?? "Бүх алба хэлтэс"} доторх танд харагдах мэдэгдэл.</p>
                </div>
              </div>

              {notifications.length ? (
                <div className={styles.notificationList}>
                  {notifications.map((item) => (
                    <Link key={item.id} href={item.href} className={styles.notificationCard}>
                      <span className={styles.iconBubble} aria-hidden>
                        {item.reasons.includes("overdue") || item.reasons.includes("issue") ? (
                          <AlertTriangle />
                        ) : item.reasons.includes("review") ? (
                          <ClipboardList />
                        ) : (
                          <Bell />
                        )}
                      </span>
                      <div>
                        <div className={styles.notificationTitle}>
                          <strong>{item.name}</strong>
                          {item.reasons.map((reason) => (
                            <span
                              key={reason}
                              className={cn(
                                styles.reasonPill,
                                (reason === "overdue" || reason === "issue") &&
                                  styles.reasonPillUrgent,
                              )}
                            >
                              {reasonLabel(reason)}
                            </span>
                          ))}
                        </div>
                        <p className={styles.notificationMeta}>
                          {item.departmentName} · {item.projectName} · {item.stageLabel}
                        </p>
                      </div>
                      <div className={styles.notificationProgress}>
                        <strong>{item.progress}%</strong>
                        <span>Явц</span>
                      </div>
                    </Link>
                  ))}
                </div>
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
