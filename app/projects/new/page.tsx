import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { createProjectAction } from "@/app/actions";
import styles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { pickPrimaryDepartmentName } from "@/lib/dashboard-scope";
import { loadMunicipalSnapshot } from "@/lib/odoo";
import {
  loadDepartmentOptions,
  loadGarbageRouteOptions,
  loadGarbageVehicleOptions,
  loadProjectManagerOptions,
  loadWorkTypeOptions,
} from "@/lib/workspace";

import { NewWorkForm } from "@/app/projects/new/new-work-form";

type PageProps = {
  searchParams?: Promise<{
    error?: string | string[];
    notice?: string | string[];
  }>;
};

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
  const params = (await searchParams) ?? {};
  const errorMessage = getMessage(params.error);
  const noticeMessage = getMessage(params.notice);

  const [
    managerOptions,
    departmentOptions,
    garbageVehicleOptions,
    garbageRouteOptions,
    workTypeOptions,
    masterSnapshot,
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
    }),
    loadGarbageRouteOptions({
      login: session.login,
      password: session.password,
    }),
    loadWorkTypeOptions({
      login: session.login,
      password: session.password,
    }),
    masterMode
      ? loadMunicipalSnapshot({
          login: session.login,
          password: session.password,
        })
      : Promise.resolve(null),
  ]);

  const masterDepartmentName =
    masterMode && masterSnapshot
      ? pickPrimaryDepartmentName({
          taskDirectory: masterSnapshot.taskDirectory,
          reports: masterSnapshot.reports,
          projects: masterSnapshot.projects,
          departments: masterSnapshot.departments,
        })
      : null;
  const lockedDepartmentOption =
    masterMode && masterDepartmentName
      ? departmentOptions.find((option) => option.name === masterDepartmentName) ?? null
      : null;

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
              roleLabel={getRoleLabel(session.role)}
              masterMode={masterMode}
            />
          </aside>

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title={masterMode ? "Шинэ ажил" : "Ажил нэмэх"}
              subtitle="Odoo руу шинэ ажил бүртгэх урсгал"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
            />

            <section className={styles.heroCard}>
              <span className={styles.eyebrow}>Ажил бүртгэх</span>
              <h1>{masterMode ? "Шинэ ажил үүсгэх" : "Шинэ ажил нэмэх"}</h1>
              <p>
                {masterMode
                  ? "Мастер хэрэглэгч зөвхөн өөрийн харьяалах алба нэгж дээр шинэ ажил үүсгэнэ. Хэлтэс автоматаар сонгогдсон тул нэр, хугацаа, шаардлагатай мэдээллээ оруулахад хангалттай."
                  : "Энгийн ажил дээр нэрээ гараар оруулна. Харин хог тээвэрлэлтийн үед машин, маршрут, огноо сонгоход нэг ажил автоматаар үүсэж, тухайн маршрутын хог ачих цэг бүр тусдаа ажилбар болж нэмэгдэнэ."}
              </p>
            </section>

            {errorMessage ? (
              <div className={`${styles.message} ${styles.errorMessage}`}>{errorMessage}</div>
            ) : null}

            {noticeMessage ? (
              <div className={`${styles.message} ${styles.noticeMessage}`}>{noticeMessage}</div>
            ) : null}

            {masterMode && lockedDepartmentOption ? (
              <div className={`${styles.message} ${styles.noticeMessage}`}>
                Таны харьяалах алба нэгж автоматаар сонгогдсон байна.
              </div>
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
                  garbageRouteOptions={garbageRouteOptions}
                  workTypeOptions={workTypeOptions}
                  lockedDepartmentId={
                    lockedDepartmentOption ? String(lockedDepartmentOption.id) : undefined
                  }
                  lockedDepartmentLabel={lockedDepartmentOption?.label}
                />
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
