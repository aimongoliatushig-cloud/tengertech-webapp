import { AppMenu } from "@/app/_components/app-menu";
import shellStyles from "@/app/workspace.module.css";
import { getRoleLabel, hasCapability, requireSession } from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getHrAccessProfile } from "@/lib/hr";

import styles from "./hr.module.css";

export const dynamic = "force-dynamic";

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const [scopedDepartmentName, hrProfile] = await Promise.all([
    loadSessionDepartmentName(session),
    getHrAccessProfile(session),
  ]);

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
            canViewHr={hrProfile.canAccessHr}
            userName={session.name}
            roleLabel={roleLabel}
            groupFlags={session.groupFlags}
            departmentScopeName={scopedDepartmentName}
          />
        </aside>

        <div className={shellStyles.pageContent}>
          {hrProfile.canAccessHr ? (
            children
          ) : (
            <section className={styles.accessDenied}>
              <span>Хүний нөөц</span>
              <h1>Танд хүний нөөцийн хэсэгт хандах эрх байхгүй байна.</h1>
              <p>
                Энэ хэсэг хүний нөөцийн мэргэжилтэн болон өөрийн хэлтсийн хүсэлт үүсгэх
                эрхтэй хэлтсийн даргад нээлттэй.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
