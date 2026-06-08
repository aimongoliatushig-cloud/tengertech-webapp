import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import shellStyles from "@/app/workspace.module.css";
import { getSessionRoleLabel, hasCapability, isWorkerOnly, requireSession } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canAccessGeneralDashboard } from "@/lib/general-dashboard-access";
import { getHrAccessProfile } from "@/lib/hr";

export const dynamic = "force-dynamic";

const WORK_DASHBOARD_HOME = "/";

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [scopedDepartmentName, hrProfile] = await Promise.all([
    loadSessionDepartmentName(session),
    getHrAccessProfile(session),
  ]);
  const canViewGeneralDashboard = canAccessGeneralDashboard(session);

  if (!hrProfile.canAccessHr) {
    const flags = session.groupFlags;
    if (
      session.role === "transport_inspector" ||
      (flags?.mfoInspector && !flags.mfoManager && !flags.mfoDispatcher)
    ) {
      redirect(WORK_DASHBOARD_HOME);
    }

    redirect(isWorkerOnly(session) ? "/tasks" : WORK_DASHBOARD_HOME);
  }

  const roleLabel = getSessionRoleLabel(session);

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.contentWithMenu} suppressHydrationWarning>
        <aside className={shellStyles.menuColumn}>
          <AppMenu
            active="hr"
            canCreateProject={hasCapability(session, "create_projects")}
            canCreateTasks={hasCapability(session, "create_tasks")}
            canWriteReports={hasCapability(session, "write_workspace_reports")}
            canViewQualityCenter={hasCapability(session, "view_quality_center")}
            canUseFieldConsole={hasCapability(session, "use_field_console")}
            canViewHr={hrProfile.canAccessHr}
            canManageHr={hrProfile.isHr}
            canViewGeneralDashboard={canViewGeneralDashboard}
            userName={session.name}
            userRole={session.role}
            roleLabel={roleLabel}
            groupFlags={session.groupFlags}
            departmentScopeName={scopedDepartmentName}
          />
        </aside>

        <div className={shellStyles.pageContent}>{children}</div>
      </div>
    </main>
  );
}
