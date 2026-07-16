import type { ReactNode } from "react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import {
  getSessionRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  type AppSession,
} from "@/lib/auth";

// Хогийн цэгийн бүх хуудсанд ашиглах нэгдсэн shell (цэс + толгой).
export function WasteShell({
  session,
  scopedDepartmentName,
  title,
  subtitle,
  children,
}: {
  session: AppSession;
  scopedDepartmentName: string | null;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const roleLabel = getSessionRoleLabel(session);

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="garbage-points"
              canCreateProject={hasCapability(session, "create_projects")}
              canCreateTasks={hasCapability(session, "create_tasks")}
              canWriteReports={hasCapability(session, "write_workspace_reports")}
              canViewQualityCenter={hasCapability(session, "view_quality_center")}
              canUseFieldConsole={hasCapability(session, "use_field_console")}
              userName={session.name}
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              masterMode={isMasterRole(session.role)}
              workerMode={isWorkerOnly(session)}
              departmentScopeName={scopedDepartmentName}
              notificationCount={0}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title={title}
              subtitle={subtitle}
              userName={session.name}
              roleLabel={roleLabel}
            />
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
