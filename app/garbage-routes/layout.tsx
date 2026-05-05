import { AppMenu } from "@/app/_components/app-menu";
import shellStyles from "@/app/workspace.module.css";
import { getRoleLabel, hasCapability, requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GarbageRoutesLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="garbage-routes"
              canCreateProject={hasCapability(session, "create_projects")}
              canCreateTasks={hasCapability(session, "create_tasks")}
              canWriteReports={hasCapability(session, "write_workspace_reports")}
              canViewQualityCenter={hasCapability(session, "view_quality_center")}
              canUseFieldConsole={hasCapability(session, "use_field_console")}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              groupFlags={session.groupFlags}
              departmentScopeName="Авто бааз, хог тээвэрлэлтийн хэлтэс"
            />
          </aside>
          <div className={shellStyles.pageContent}>{children}</div>
        </div>
      </div>
    </main>
  );
}
