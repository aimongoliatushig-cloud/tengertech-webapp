import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { createProjectAction } from "@/app/actions";
import styles from "@/app/workspace.module.css";
import {
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { pickPrimaryDepartmentName } from "@/lib/dashboard-scope";
import { loadMunicipalSnapshot } from "@/lib/odoo";
import {
  loadActiveGarbageVehicleOptions,
  loadDepartmentOptions,
  loadGarbagePointOptions,
  loadGarbageSubdistrictOptions,
  loadGarbageVehicleOptions,
  loadProjectManagerOptions,
  loadRoadCleaningAreaOptions,
  loadRoadCleaningEmployeeOptions,
} from "@/lib/workspace";

import { NewWorkForm } from "@/app/projects/new/new-work-form";

type PageProps = {
  searchParams?: Promise<{
    error?: string | string[];
    notice?: string | string[];
    department?: string | string[];
    vehicle?: string | string[];
    date?: string | string[];
  }>;
};

const AUTO_GARBAGE_DEPARTMENT_NAME = "Авто бааз, хог тээвэрлэлтийн хэлтэс";

function getMessage(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default async function NewProjectPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (isWorkerOnly(session)) {
    redirect("/");
  }

  const masterMode = isMasterRole(session.role);
  const transportInspectorMode = Boolean(
    session.role === "transport_inspector" ||
      (session.groupFlags?.mfoInspector &&
        !session.groupFlags?.mfoManager &&
        !session.groupFlags?.mfoDispatcher),
  );
  const shouldLockDepartment =
    session.role === "project_manager" ||
    transportInspectorMode ||
    masterMode ||
    Boolean(session.groupFlags?.mfoInspector);
  const params = (await searchParams) ?? {};
  const errorMessage = getMessage(params.error);
  const noticeMessage = getMessage(params.notice);
  const requestedDepartment = getMessage(params.department);
  const requestedVehicleId = getMessage(params.vehicle);
  const requestedShiftDate = getMessage(params.date);

  const [
    managerOptions,
    departmentOptions,
    garbageVehicleOptions,
    seasonalGarbageVehicleOptions,
    activeGarbageVehicleOptions,
    garbagePointOptions,
    garbageSubdistrictOptions,
    roadCleaningAreaOptions,
    roadCleaningEmployeeOptions,
    masterSnapshot,
    sessionDepartmentName,
  ] = await Promise.all([
    loadProjectManagerOptions({
      login: session.login,
      password: session.password,
    }),
    loadDepartmentOptions({
      login: session.login,
      password: session.password,
    }),
    loadGarbageVehicleOptions({
      login: session.login,
      password: session.password,
    }, { requireCurrentEmployeeScope: transportInspectorMode }),
    loadGarbageVehicleOptions({
      login: session.login,
      password: session.password,
    }, { ignoreCurrentEmployeeScope: true }),
    loadActiveGarbageVehicleOptions({
      login: session.login,
      password: session.password,
    }),
    loadGarbagePointOptions({
      login: session.login,
      password: session.password,
    }, { requireCurrentEmployeeScope: transportInspectorMode }),
    loadGarbageSubdistrictOptions({
      login: session.login,
      password: session.password,
    }),
    loadRoadCleaningAreaOptions({
      login: session.login,
      password: session.password,
    }),
    loadRoadCleaningEmployeeOptions({
      login: session.login,
      password: session.password,
    }),
    masterMode
      ? loadMunicipalSnapshot({
          login: session.login,
          password: session.password,
        })
      : Promise.resolve(null),
    shouldLockDepartment ? loadSessionDepartmentName(session) : Promise.resolve(null),
  ]);

  const masterDepartmentName =
    sessionDepartmentName ??
    (masterMode && masterSnapshot
      ? pickPrimaryDepartmentName({
          taskDirectory: masterSnapshot.taskDirectory,
          reports: masterSnapshot.reports,
          projects: masterSnapshot.projects,
          departments: masterSnapshot.departments,
        })
      : null);
  const lockedDepartmentOption =
    shouldLockDepartment && masterDepartmentName
      ? departmentOptions.find((option) => option.name === masterDepartmentName) ?? null
      : null;
  const effectiveRequestedDepartment =
    requestedDepartment || (requestedVehicleId ? AUTO_GARBAGE_DEPARTMENT_NAME : "");
  const initialDepartmentOption =
    !lockedDepartmentOption && effectiveRequestedDepartment
      ? departmentOptions.find(
          (option) =>
            option.name === effectiveRequestedDepartment ||
            option.label === effectiveRequestedDepartment ||
            option.name.includes(effectiveRequestedDepartment) ||
            option.label.includes(effectiveRequestedDepartment) ||
            effectiveRequestedDepartment.includes(option.name) ||
            effectiveRequestedDepartment.includes(option.label),
        ) ?? null
      : null;
  const initialGarbageVehicleId =
    requestedVehicleId &&
    garbageVehicleOptions.some((option) => String(option.id) === requestedVehicleId)
      ? requestedVehicleId
      : undefined;
  const initialGarbageShiftDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedShiftDate)
    ? requestedShiftDate
    : undefined;

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");

  return (
    <main className={styles.shell}>
      <div className={styles.container} id="create-project-top">
        <div className={styles.contentWithMenu}>
          <aside className={styles.menuColumn}>
            <AppMenu
              active="new-project"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              userRole={session.role}
              roleLabel={getSessionRoleLabel(session)}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              departmentScopeName={masterDepartmentName}
            />
          </aside>

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title={masterMode ? "Шинэ ажил" : "Ажил нэмэх"}
              subtitle="Шинэ ажлын мэдээлэл, хугацаа, хавсралтыг бүртгэх урсгал"
              userName={session.name}
              roleLabel={getSessionRoleLabel(session)}
            />

            {errorMessage ? (
              <div className={`${styles.message} ${styles.errorMessage}`}>{errorMessage}</div>
            ) : null}

            {noticeMessage ? (
              <div className={`${styles.message} ${styles.noticeMessage}`}>{noticeMessage}</div>
            ) : null}

            {!canCreateProject ? (
              <section className={styles.emptyState}>
                <h2>Ажил бүртгэх эрх алга</h2>
                <p>
                  Шинэ ажил нэмэх боломж одоогоор зөвхөн шаардлагатай эрхтэй хэрэглэгч дээр
                  нээлттэй байна.
                </p>
              </section>
            ) : (
              <section className={styles.formCard} id="project-form">
                <NewWorkForm
                  action={createProjectAction}
                  departmentOptions={departmentOptions}
                  managerOptions={managerOptions}
                  garbageVehicleOptions={garbageVehicleOptions}
                  seasonalGarbageVehicleOptions={seasonalGarbageVehicleOptions}
                  activeGarbageVehicleOptions={activeGarbageVehicleOptions}
                  garbagePointOptions={garbagePointOptions}
                  garbageSubdistrictOptions={garbageSubdistrictOptions}
                  roadCleaningAreaOptions={roadCleaningAreaOptions}
                  roadCleaningEmployeeOptions={roadCleaningEmployeeOptions}
                  lockedDepartmentId={
                    lockedDepartmentOption ? String(lockedDepartmentOption.id) : undefined
                  }
                  lockedDepartmentLabel={lockedDepartmentOption?.label}
                  initialDepartmentId={
                    initialDepartmentOption ? String(initialDepartmentOption.id) : undefined
                  }
                  initialGarbageVehicleId={initialGarbageVehicleId}
                  initialGarbageShiftDate={initialGarbageShiftDate}
                  currentUserId={session.uid}
                  lockRoadCleaningMasterToCurrentUser={masterMode}
                />
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
