import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { getRoleLabel, hasCapability, requireSession } from "@/lib/auth";
import { loadFleetVehicleBoard } from "@/lib/odoo";

import { AutoBaseBoard } from "./auto-base-board";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function AutoBasePage() {
  const session = await requireSession();
  const allowedRoles = new Set(["system_admin", "director", "general_manager"]);

  if (!allowedRoles.has(String(session.role))) {
    redirect("/");
  }

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");

  let board = {
    activeVehicles: [],
    repairVehicles: [],
    totalVehicles: 0,
    activeCount: 0,
    repairCount: 0,
  } as Awaited<ReturnType<typeof loadFleetVehicleBoard>>;
  let loadError = "";

  try {
    board = await loadFleetVehicleBoard({
      login: session.login,
      password: session.password,
    });
  } catch (error) {
    console.error("Fleet vehicle board could not be loaded:", error);
    loadError =
      "Авто баазын машины төлөвийг Odoo-оос уншиж чадсангүй. Fleet эрх болон холболтын тохиргоог шалгана уу.";
  }

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="auto-base"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Авто бааз"
              subtitle="Идэвхтэй болон засагдаж буй машинуудын бодит төлөв"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={board.totalVehicles}
              notificationNote={`${board.activeCount} идэвхтэй, ${board.repairCount} засагдаж буй машин байна`}
            />

            {loadError ? (
              <section className={styles.errorCard}>
                <h2>Авто баазын самбар ачаалсангүй</h2>
                <p>{loadError}</p>
              </section>
            ) : null}

            <section className={styles.boardCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Машины төлөв</span>
                  <h1>Авто баазын самбар</h1>
                </div>
                <p>
                  Гар утсан дээр эхлээд ангиллаа сонгож, дараа нь тухайн төлөвт
                  байгаа машины жагсаалтыг төвлөрүүлж харна.
                </p>
              </div>

              <AutoBaseBoard board={board} />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
