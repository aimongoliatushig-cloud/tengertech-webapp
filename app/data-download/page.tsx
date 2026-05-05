import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { DataDownloadClient } from "@/app/data-download/data-download-client";
import styles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DataDownloadPage() {
  const session = await requireSession();
  if (isWorkerOnly(session) || isMasterRole(session.role)) {
    redirect("/");
  }
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <div className={styles.contentWithMenu}>
          <aside className={styles.menuColumn}>
            <AppMenu
              active="data-download"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              groupFlags={session.groupFlags}
            />
          </aside>

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title="Өгөгдөл татах"
              subtitle="WRS болон Odoo хоорондын өдрийн тайлангийн таталт"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
            />

            <section className={styles.heroCard}>
              <span className={styles.eyebrow}>Өгөгдөл татах</span>
              <h1>WRS-ээс өдрийн тайлан татах</h1>
              <p>
                Огноо сонгоод таталтын урсгалыг шууд энэ дэлгэц дээр ажиллуулна. Дээд талд тайлбар,
                доор нь таталтын хэрэгсэл, үр дүн нь шууд харагдана.
              </p>
            </section>

            <DataDownloadClient />
          </div>
        </div>
      </div>
    </main>
  );
}
