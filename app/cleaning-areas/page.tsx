import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import styles from "@/app/workspace.module.css";
import {
  assignCleaningMasterAction,
  createCleaningAreaAction,
  createTodayCleaningWorksAction,
} from "@/app/cleaning-areas/actions";
import { CleaningAreaForm } from "@/app/cleaning-areas/cleaning-area-form";
import { MasterAssignmentPanel } from "@/app/cleaning-areas/master-assignment-panel";
import {
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  loadGarbageSubdistrictOptions,
  loadRoadCleaningAreaOptions,
  loadRoadCleaningEmployeeOptions,
  type RoadCleaningEmployeeOption,
} from "@/lib/workspace";

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

function todayValue() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

function isCleaningEmployee(employee: RoadCleaningEmployeeOption) {
  const departmentName = normalize(employee.departmentName);
  const jobTitle = normalize(employee.jobTitle);
  return (
    (departmentName.includes("ногоон") ||
      departmentName.includes("цэвэрлэгээ") ||
      departmentName.includes("зам талбай")) &&
    jobTitle.includes("зам талбайн үйлчлэгч")
  );
}

function isCleaningMaster(employee: RoadCleaningEmployeeOption) {
  const departmentName = normalize(employee.departmentName);
  const jobTitle = normalize(employee.jobTitle);
  return (
    (departmentName.includes("ногоон") ||
      departmentName.includes("цэвэрлэгээ") ||
      departmentName.includes("зам талбай")) &&
    (jobTitle.includes("мастер") || jobTitle.includes("зам талбайн ахлах мастер"))
  );
}

const WORKING_DAY_OPTIONS = [
  { key: "monday", label: "Даваа" },
  { key: "tuesday", label: "Мягмар" },
  { key: "wednesday", label: "Лхагва" },
  { key: "thursday", label: "Пүрэв" },
  { key: "friday", label: "Баасан" },
  { key: "saturday", label: "Бямба" },
  { key: "sunday", label: "Ням" },
];

function formatWorkingDays(keys: string[]) {
  const labels = WORKING_DAY_OPTIONS.filter((option) => keys.includes(option.key)).map(
    (option) => option.label,
  );
  return labels.length === WORKING_DAY_OPTIONS.length ? "Өдөр бүр" : labels.join(", ");
}

export default async function CleaningAreasPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (isWorkerOnly(session)) {
    redirect("/");
  }

  const params = (await searchParams) ?? {};
  const errorMessage = getMessage(params.error);
  const noticeMessage = getMessage(params.notice);
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const [areaOptions, employeeOptions, subdistrictOptions, sessionDepartmentName] =
    await Promise.all([
      loadRoadCleaningAreaOptions(connectionOverrides),
      loadRoadCleaningEmployeeOptions(connectionOverrides),
      loadGarbageSubdistrictOptions(connectionOverrides).catch(() => []),
      loadSessionDepartmentName(session),
    ]);

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const masterOptions = employeeOptions.filter(isCleaningMaster);
  const cleanerOptions = employeeOptions.filter(isCleaningEmployee);
  const visibleAreas = areaOptions.slice().sort((left, right) =>
    left.name.localeCompare(right.name, "mn"),
  );
  const areaCountsByEmployee = new Map<number, number>();
  for (const area of visibleAreas) {
    if (area.employeeId) {
      areaCountsByEmployee.set(area.employeeId, (areaCountsByEmployee.get(area.employeeId) ?? 0) + 1);
    }
  }
  const employeeIdsByMaster = new Map<number, Set<number>>();
  for (const area of visibleAreas) {
    if (!area.masterId || !area.employeeId) {
      continue;
    }
    const current = employeeIdsByMaster.get(area.masterId) ?? new Set<number>();
    current.add(area.employeeId);
    employeeIdsByMaster.set(area.masterId, current);
  }
  const masterAssignmentOptions = masterOptions.map((master) => ({
    id: master.id,
    name: master.name,
    jobTitle: master.jobTitle,
    departmentName: master.departmentName,
    assignedEmployeeIds: Array.from(employeeIdsByMaster.get(master.id) ?? []),
  }));
  const cleanerAssignmentOptions = cleanerOptions.map((employee) => ({
    id: employee.id,
    name: employee.name,
    jobTitle: employee.jobTitle,
    areaCount: areaCountsByEmployee.get(employee.id) ?? 0,
  }));

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <div className={styles.contentWithMenu}>
          <aside className={styles.menuColumn}>
            <AppMenu
              active="cleaning-areas"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              userRole={session.role}
              roleLabel={getSessionRoleLabel(session)}
              groupFlags={session.groupFlags}
              masterMode={isMasterRole(session.role)}
              departmentScopeName={sessionDepartmentName}
            />
          </aside>

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title="Цэвэрлэх талбай"
              subtitle="Зам талбайн өдөр тутмын цэвэрлэгээний талбай, мастер, ажилтны оноолт"
              userName={session.name}
              roleLabel={getSessionRoleLabel(session)}
            />

            {errorMessage ? (
              <div className={`${styles.message} ${styles.errorMessage}`}>{errorMessage}</div>
            ) : null}
            {noticeMessage ? (
              <div className={`${styles.message} ${styles.noticeMessage}`}>{noticeMessage}</div>
            ) : null}

            <section className={styles.formCard}>
              <span className={styles.formBadge}>Өдөр тутмын ажил</span>
              <h2>Өнөөдрийн цэвэрлэгээний ажил үүсгэх</h2>
              <form action={createTodayCleaningWorksAction} className={styles.buttonRow}>
                <button type="submit" className={styles.primaryButton}>
                  Өнөөдрийн ажил үүсгэх
                </button>
              </form>
            </section>

            <section className={styles.formCard}>
              <span className={styles.formBadge}>Талбай бүртгэх</span>
              <h1>Цэвэрлэх талбай нэмэх</h1>
              <CleaningAreaForm
                action={createCleaningAreaAction}
                workDate={todayValue()}
                areas={visibleAreas.map((area) => ({
                  id: area.id,
                  name: area.name,
                  khorooName: area.khorooName,
                  streetName: area.streetName,
                  areaM2: area.areaM2,
                  employeeId: area.employeeId,
                  workingDayKeys: area.workingDayKeys,
                }))}
                subdistricts={subdistrictOptions}
                cleaners={cleanerOptions.map((employee) => ({
                  id: employee.id,
                  name: employee.name,
                  jobTitle: employee.jobTitle,
                  departmentName: employee.departmentName,
                }))}
                workingDays={WORKING_DAY_OPTIONS}
              />
            </section>

            <section className={styles.formCard}>
              <span className={styles.formBadge}>Мастерын хэсэг</span>
              <h2>Мастерт ажилтан оноох</h2>
              <MasterAssignmentPanel
                action={assignCleaningMasterAction}
                workDate={todayValue()}
                masters={masterAssignmentOptions}
                cleaners={cleanerAssignmentOptions}
              />
            </section>

            <section className={styles.formCard}>
              <span className={styles.formBadge}>{visibleAreas.length} талбай</span>
              <h2>Бүртгэлтэй цэвэрлэх талбай</h2>
              <div className={styles.panelGrid}>
                {visibleAreas.map((area) => (
                  <article key={area.id} className={styles.lockedFieldValue}>
                    <strong>{area.name}</strong>
                    <span>
                      {[
                        area.khorooName || area.streetName || "Хороо оруулаагүй",
                        area.areaM2 ? `${area.areaM2} мкв` : "мкв оруулаагүй",
                        formatWorkingDays(area.workingDayKeys),
                        area.masterName ? `Мастер: ${area.masterName}` : "Мастер оноогоогүй",
                        area.employeeName
                          ? `Ажилтан: ${area.employeeName}`
                          : "Ажилтан оноогоогүй",
                      ].join(" · ")}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
