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
import { loadSessionEmployeeDepartmentName } from "@/lib/access-scope";
import { pickPrimaryDepartmentName } from "@/lib/dashboard-scope";
import { loadMunicipalSnapshot } from "@/lib/odoo";
import {
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

function findDepartmentOptionByName(
  departmentOptions: Awaited<ReturnType<typeof loadDepartmentOptions>>,
  departmentName: string | null,
) {
  const normalizedDepartmentName = (departmentName ?? "").trim().toLowerCase();
  if (!normalizedDepartmentName) {
    return null;
  }

  return (
    departmentOptions.find((option) => {
      const names = [option.name, option.label]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
      return names.some(
        (value) =>
          value === normalizedDepartmentName ||
          value.includes(normalizedDepartmentName) ||
          normalizedDepartmentName.includes(value),
      );
    }) ?? null
  );
}

export default async function NewProjectPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (isWorkerOnly(session)) {
    redirect("/");
  }

  const masterMode = isMasterRole(session.role);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateSharedWork =
    session.role === "director" ||
    session.role === "general_manager" ||
    session.role === "system_admin";
  const departmentHeadMode = Boolean(
    session.role === "project_manager" || session.groupFlags?.municipalDepartmentHead,
  );
  const transportInspectorMode = Boolean(
    (session.role === "transport_inspector" ||
      (session.groupFlags?.mfoInspector &&
        !session.groupFlags?.mfoManager &&
        !session.groupFlags?.mfoDispatcher)) &&
      !departmentHeadMode,
  );
  const shouldLockDepartment = canCreateProject && !canCreateSharedWork;
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
    }, {
      requireCurrentEmployeeScope: transportInspectorMode,
      requireGarbageTransportDepartment: true,
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
    shouldLockDepartment ? loadSessionEmployeeDepartmentName(session) : Promise.resolve(null),
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
      ? findDepartmentOptionByName(departmentOptions, masterDepartmentName)
      : null;
  const missingLockedDepartment =
    canCreateProject && shouldLockDepartment && !lockedDepartmentOption;
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

  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");

  return (
    <main className={`${styles.shell} ${styles.createProjectShell}`}>
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
              hideMobileTopBar
            />
          </aside>

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title={masterMode ? "Зам талбайн цэвэрлэгээний ажил нэмэх" : "Ажил нэмэх"}
              subtitle={
                masterMode
                  ? "Мөр бүрээс нэг ажил үүсэж, стандарт 4 даалгавар автоматаар нэмэгдэнэ"
                  : "Шинэ ажлын мэдээлэл, хугацаа, хавсралтыг бүртгэх урсгал"
              }
              userName={session.name}
              roleLabel={getSessionRoleLabel(session)}
            />

            {errorMessage ? (
              <div className={`${styles.message} ${styles.errorMessage}`}>{errorMessage}</div>
            ) : null}

            {noticeMessage ? (
              <div className={`${styles.message} ${styles.noticeMessage}`}>{noticeMessage}</div>
            ) : null}

            {missingLockedDepartment ? (
              <section className={styles.emptyState}>
                <h2>Хэлтэс тодорхойгүй байна</h2>
                <p>
                  Таны ажилтны мэдээлэл дээр харьяалах хэлтэс тохируулагдаагүй байна. Админд
                  хандаж ажилтны хэлтсийн тохиргоогоо шалгуулна уу.
                </p>
              </section>
            ) : !canCreateProject ? (
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
                  disableSharedWork={!canCreateSharedWork}
                />
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
