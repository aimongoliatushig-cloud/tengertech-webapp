import { AppMenu } from "@/app/_components/app-menu";
import { getRoleLabel, hasCapability, requireSession } from "@/lib/auth";
import shellStyles from "@/app/workspace.module.css";

export const dynamic = "force-dynamic";

export default async function FleetRepairLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="fleet-repair"
              canCreateProject={hasCapability(session, "create_projects")}
              canCreateTasks={hasCapability(session, "create_tasks")}
              canWriteReports={hasCapability(session, "write_workspace_reports")}
              canViewQualityCenter={hasCapability(session, "view_quality_center")}
              canUseFieldConsole={hasCapability(session, "use_field_console")}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              departmentScopeName="Авто бааз, хог тээвэрлэлтийн хэлтэс"
            />
          </aside>

          <div className={shellStyles.pageContent}>{children}</div>
        </div>
      </div>
    </main>
  );
}
