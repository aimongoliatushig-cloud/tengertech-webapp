import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  canAccessAutoBaseOverview,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { loadFleetVehicleBoard } from "@/lib/odoo";
import { loadWorkspaceNotificationCount } from "@/lib/workspace-notifications";

import { AutoBaseBoard } from "./auto-base-board";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type AutoBasePageProps = {
  searchParams?: Promise<{
    vehicle?: string | string[];
    notice?: string | string[];
    error?: string | string[];
  }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AutoBasePage({ searchParams }: AutoBasePageProps) {
  const session = await requireSession();
  const roleLabel = getSessionRoleLabel(session);
  const masterMode = isMasterRole(session.role);
  const workerMode = isWorkerOnly(session);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const scopedDepartmentName = await loadSessionDepartmentName(session);

  if (!canAccessAutoBaseOverview(session, scopedDepartmentName)) {
    redirect("/");
  }

  const params = (await searchParams) ?? {};
  const selectedVehicleId = Number(firstParam(params.vehicle) ?? "");
  const notice = firstParam(params.notice) ?? "";
  const error = firstParam(params.error) ?? "";
  const notificationCount = await loadWorkspaceNotificationCount(session);

  let board = {
    allVehicles: [],
    activeVehicles: [],
    repairVehicles: [],
    driverOptions: [],
    loaderOptions: [],
    departmentOptions: [],
    modelOptions: [],
    vehicleTypeOptions: [],
    categoryOptions: [],
    totalVehicles: 0,
    activeCount: 0,
    repairCount: 0,
    insuranceDueCount: 0,
    inspectionDueCount: 0,
    todayWeightLabel: "0 кг",
    todayFuelLabel: "0 л",
    highestFuelVehicle: "",
    mostRepairedVehicle: "",
    failedImportCount: 0,
  } as Awaited<ReturnType<typeof loadFleetVehicleBoard>>;
  let loadError = "";

  try {
    board = await loadFleetVehicleBoard();
  } catch (error) {
    console.error("Fleet vehicle board could not be loaded:", error);
    loadError =
      "Авто баазын машины төлөвийг уншиж чадсангүй. Fleet эрх болон холболтын тохиргоог шалгана уу.";
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
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              notificationCount={notificationCount}
              masterMode={masterMode}
              workerMode={workerMode}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Авто баазын самбар"
              subtitle="Машины төлөв, засвар, даатгал, үзлэгийн нэгдсэн хяналт"
              userName={session.name}
              roleLabel={roleLabel}
              notificationCount={notificationCount}
            />

            {loadError ? (
              <section className={styles.errorCard}>
                <h2>Авто баазын самбар ачаалсангүй</h2>
                <p>{loadError}</p>
              </section>
            ) : null}

            <section className={styles.boardCard}>
              <AutoBaseBoard
                board={board}
                initialVehicleId={
                  Number.isFinite(selectedVehicleId) && selectedVehicleId > 0 ? selectedVehicleId : null
                }
                notice={notice}
                error={error}
              />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
