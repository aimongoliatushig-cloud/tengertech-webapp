import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import styles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  getSessionRoleLabel,
  hasCapability,
  requireSession,
} from "@/lib/auth";
import {
  loadProcurementNotificationCount,
  loadWorkspaceNotificationCount,
} from "@/lib/workspace-notifications";

import { NotificationDiagnosticsClient } from "./notification-diagnostics-client";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const session = await requireSession();
  const departmentScopeName = await loadSessionDepartmentName(session);
  const [workspaceNotificationCount, procurementNotificationCount] = await Promise.all([
    loadWorkspaceNotificationCount(session, { scopedDepartmentName: departmentScopeName }).catch(() => 0),
    loadProcurementNotificationCount(session).catch(() => 0),
  ]);
  const notificationCount = workspaceNotificationCount + procurementNotificationCount;
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const roleLabel = getSessionRoleLabel(session);

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <div className={styles.contentWithMenu}>
          <aside className={styles.menuColumn}>
            <AppMenu
              active="notifications"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              notificationCount={notificationCount}
              departmentScopeName={departmentScopeName}
            />
          </aside>

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title="Мэдэгдлийн тохиргоо"
              subtitle="PWA notification, browser permission, service worker, push subscription, серверийн бүртгэлийг нэг дор шалгана."
              userName={session.name}
              roleLabel={roleLabel}
              notificationCount={notificationCount}
              notificationNote={
                notificationCount > 0
                  ? `${notificationCount} уншаагүй мэдэгдэл`
                  : "Шинэ мэдэгдэл алга"
              }
            />

            <NotificationDiagnosticsClient userId={session.uid} />
          </div>
        </div>
      </div>
    </main>
  );
}
