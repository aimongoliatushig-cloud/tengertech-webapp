import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import shellStyles from "@/app/workspace.module.css";
import { getRoleLabel, hasCapability, isWorkerOnly, requireSession } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getHrAccessProfile } from "@/lib/hr";

export const dynamic = "force-dynamic";

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [scopedDepartmentName, hrProfile] = await Promise.all([
    loadSessionDepartmentName(session),
    getHrAccessProfile(session),
  ]);

  if (!hrProfile.isHr) {
    redirect(isWorkerOnly(session) ? "/tasks" : "/");
  }

  const roleLabel = getRoleLabel(session.role);

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.contentWithMenu}>
        <aside className={shellStyles.menuColumn}>
          <AppMenu
            active="hr"
            canCreateProject={hasCapability(session, "create_projects")}
            canCreateTasks={hasCapability(session, "create_tasks")}
            canWriteReports={hasCapability(session, "write_workspace_reports")}
            canViewQualityCenter={hasCapability(session, "view_quality_center")}
            canUseFieldConsole={hasCapability(session, "use_field_console")}
            canViewHr={hrProfile.isHr}
            userName={session.name}
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
