import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import shellStyles from "@/app/workspace.module.css";
import { hasCapability, isWorkerOnly, requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getHrAccessProfile } from "@/lib/hr";

export const dynamic = "force-dynamic";

const TRANSPORT_INSPECTOR_HOME =
  "/projects?department=%D0%90%D0%B2%D1%82%D0%BE%20%D0%B1%D0%B0%D0%B0%D0%B7%2C%20%D1%85%D0%BE%D0%B3%20%D1%82%D1%8D%D1%8D%D0%B2%D1%8D%D1%80%D0%BB%D1%8D%D0%BB%D1%82%D0%B8%D0%B9%D0%BD%20%D1%85%D1%8D%D0%BB%D1%82%D1%8D%D1%81";

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [scopedDepartmentName, hrProfile] = await Promise.all([
    loadSessionDepartmentName(session),
    getHrAccessProfile(session),
  ]);

  if (!hrProfile.canAccessHr) {
    const flags = session.groupFlags;
    if (
      session.role === "transport_inspector" ||
      (flags?.mfoInspector && !flags.mfoManager && !flags.mfoDispatcher)
    ) {
      redirect(TRANSPORT_INSPECTOR_HOME);
    }

    redirect(isWorkerOnly(session) ? "/tasks" : "/");
  }

  const roleLabel = getSessionRoleLabel(session);

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
            canViewHr={hrProfile.canAccessHr}
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
