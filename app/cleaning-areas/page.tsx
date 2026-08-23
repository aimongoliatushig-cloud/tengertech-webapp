import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import styles from "@/app/workspace.module.css";
import {
  archiveCleaningTeamAction,
  assignCleaningMasterAction,
  createCleaningAreaAction,
  createCleaningTeamAction,
  createTodayCleaningWorksAction,
  createRecurringWorkTemplateAction,
  updateCleaningTeamAction,
  importEcoRoadInspectionsAction,
} from "@/app/cleaning-areas/actions";
import { CleaningAreaForm } from "@/app/cleaning-areas/cleaning-area-form";
import { MasterAssignmentPanel } from "@/app/cleaning-areas/master-assignment-panel";
import { TeamMemberPicker } from "@/app/cleaning-areas/team-member-picker";
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
  loadRoadCleaningTeamOptions,
  type RoadCleaningEmployeeOption,
} from "@/lib/workspace";
import { loadEcoRoadInspections } from "@/lib/ecoroad-import";
import { executeOdooKw } from "@/lib/odoo";

type PageProps = {
  searchParams?: Promise<{
    error?: string | string[];
    notice?: string | string[];
  }>;
};

const GREEN_SERVICE_WORK_DASHBOARD_HREF =
  "/projects?department=%D0%9D%D0%BE%D0%B3%D0%BE%D0%BE%D0%BD%20%D0%B1%D0%B0%D0%B9%D0%B3%D1%83%D1%83%D0%BB%D0%B0%D0%BC%D0%B6%2C%20%D1%86%D1%8D%D0%B2%D1%8D%D1%80%D0%BB%D1%8D%D0%B3%D1%8D%D1%8D%20%D2%AF%D0%B9%D0%BB%D1%87%D0%B8%D0%BB%D0%B3%D1%8D%D1%8D%D0%BD%D0%B8%D0%B9%20%D1%85%D1%8D%D0%BB%D1%82%D1%8D%D1%81";

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

type NamedRecord = { id: number; name: string };
type RecurringTemplateRecord = {
  id: number;
  name: string;
  daily_planned_quantity: number;
  start_date: string | false;
  end_date: string | false;
  responsible_employee_id: [number, string] | false;
  generated_task_count: number;
  frequency: string;
  active: boolean;
};

async function loadRecurringWorkSetup(connection: { login: string; password: string }) {
  const call = async <T,>(model: string, domain: unknown[], fields: string[]) => {
    try {
      return await executeOdooKw<T[]>(model, "search_read", [domain], { fields, order: "name asc" }, connection);
    } catch {
      return executeOdooKw<T[]>(model, "search_read", [domain], { fields, order: "name asc" });
    }
  };
  const [templates, categories, units] = await Promise.all([
    call<RecurringTemplateRecord>("green.clean.work.template", [["work_kind", "=", "recurring"]], [
      "name", "frequency", "daily_planned_quantity", "start_date", "end_date", "responsible_employee_id", "generated_task_count", "active",
    ]).catch(() => []),
    call<NamedRecord>("green.clean.work.category", [["active", "=", true]], ["name"]).catch(() => []),
    call<NamedRecord>("green.clean.unit", [["active", "=", true]], ["name"]).catch(() => []),
  ]);
  return { templates, categories, units };
}

function recurringFrequencyLabel(value: string) {
  if (value === "weekdays") return "Пүрэв гараг бүр";
  if (value === "semi_monthly") return "Сар бүрийн 15, 30-нд";
  if (value === "daily") return "Өдөр бүр";
  if (value === "weekly") return "7 хоног бүр";
  if (value === "monthly") return "Сар бүр";
  return "Тогтмол давтамжтай";
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
  const [areaOptions, employeeOptions, subdistrictOptions, teamOptions, sessionDepartmentName, ecoRoadInspections, recurringSetup] =
    await Promise.all([
      loadRoadCleaningAreaOptions(connectionOverrides),
      loadRoadCleaningEmployeeOptions(connectionOverrides),
      loadGarbageSubdistrictOptions(connectionOverrides).catch(() => []),
      loadRoadCleaningTeamOptions(connectionOverrides).catch(() => []),
      loadSessionDepartmentName(session),
      loadEcoRoadInspections(),
      loadRecurringWorkSetup(connectionOverrides),
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
  const teamLeaderOptions = Array.from(
    new Map([...masterOptions, ...cleanerOptions].map((employee) => [employee.id, employee])).values(),
  ).sort((left, right) => left.name.localeCompare(right.name, "mn"));
  const teamMemberOptions = cleanerOptions.map((employee) => ({
    id: employee.id,
    name: employee.name,
    jobTitle: employee.jobTitle,
    departmentName: employee.departmentName,
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

            <div className={styles.buttonRow}>
              <Link href={GREEN_SERVICE_WORK_DASHBOARD_HREF} className={styles.secondaryButton}>
                <ArrowLeft aria-hidden />
                Ажлын самбар руу буцах
              </Link>
            </div>

            {errorMessage ? (
              <div className={`${styles.message} ${styles.errorMessage}`}>{errorMessage}</div>
            ) : null}
            {noticeMessage ? (
              <div className={`${styles.message} ${styles.noticeMessage}`}>{noticeMessage}</div>
            ) : null}

            <section id="ecoroad" className={styles.formCard}>
              <span className={styles.formBadge}>Eco Road</span>
              <h2>Зам талбайн хяналтын үзлэг</h2>
              <p>
                Нийт <b>{ecoRoadInspections.length}</b> үзлэг импортлогдсон.
              </p>
              <form action={importEcoRoadInspectionsAction} className={styles.buttonRow}>
                <button type="submit" className={styles.primaryButton}>Eco Road-оос импортлох</button>
              </form>
              <div className={styles.settingsList}>
                {ecoRoadInspections.slice(0, 8).map((inspection) => (
                  <article key={inspection.id} className={styles.settingsListItem}>
                    <div className={styles.settingsListHeader}>
                      <div>
                        <strong>{inspection.submittedBy || "Тодорхойгүй ажилтан"}</strong>
                        <small>{inspection.submittedAt ? new Date(inspection.submittedAt).toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar" }) : "Огноогүй"}</small>
                      </div>
                      <b>{inspection.adjustedScore}/100</b>
                    </div>
                    <p>{inspection.responsibilities.join(" · ") || "Үйлчилгээ тодорхойгүй"}</p>
                    <small>{inspection.photoCount} зураг · {inspection.gps.latitude !== null ? "GPS бүртгэлтэй" : "GPS байхгүй"} · {inspection.violationCount} зөрчил</small>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.formCard}>
              <span className={styles.formBadge}>Өдөр тутмын ажил</span>
              <h2>Өнөөдрийн цэвэрлэгээний ажил үүсгэх</h2>
              <form action={createTodayCleaningWorksAction} className={styles.buttonRow}>
                <button type="submit" className={styles.primaryButton}>
                  Өнөөдрийн ажил үүсгэх
                </button>
              </form>
            </section>

            <section id="recurring-work" className={styles.formCard}>
              <span className={styles.formBadge}>Ажлын загвар</span>
              <h2>Өдөр тутам давтагдах ажил</h2>
              <p>Энд нэг удаа бүртгэсэн ажил өдөр бүр автоматаар тусдаа даалгавар болж үүснэ.</p>

              {canCreateTasks ? (
                <form action={createRecurringWorkTemplateAction} className={styles.createWorkForm}>
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label htmlFor="recurring_name">Ажлын нэр</label>
                      <input id="recurring_name" name="name" required placeholder="Жишээ: Зам талбай цэвэрлэх" />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="recurring_category">Ангилал</label>
                      <select id="recurring_category" name="category_id" required>
                        <option value="">Сонгох</option>
                        {recurringSetup.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="recurring_unit">Хэмжих нэгж</label>
                      <select id="recurring_unit" name="unit_id" required>
                        <option value="">Сонгох</option>
                        {recurringSetup.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label htmlFor="recurring_quantity">Өдрийн төлөвлөгөөт хэмжээ</label>
                      <input id="recurring_quantity" name="daily_planned_quantity" type="number" min="0" step="0.01" defaultValue="0" />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="recurring_employee">Хариуцсан ажилтан</label>
                      <select id="recurring_employee" name="responsible_employee_id">
                        <option value="">Дараа сонгох</option>
                        {employeeOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="recurring_start">Эхлэх огноо</label>
                      <input id="recurring_start" name="start_date" type="date" defaultValue={todayValue()} required />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="recurring_end">Дуусах огноо</label>
                      <input id="recurring_end" name="end_date" type="date" />
                    </div>
                  </div>
                  <div className={styles.buttonRow}>
                    <label><input type="checkbox" name="requires_photo" defaultChecked /> Зураг шаардана</label>
                    <label><input type="checkbox" name="requires_gps" defaultChecked /> GPS шаардана</label>
                    <label><input type="checkbox" name="requires_approval" defaultChecked /> Батлах шаардлагатай</label>
                    <button type="submit" className={styles.primaryButton}>Загвар хадгалах</button>
                  </div>
                </form>
              ) : null}

              <div className={styles.settingsList}>
                {recurringSetup.templates.map((item) => (
                  <article key={item.id} className={styles.settingsListItem}>
                    <div className={styles.settingsListHeader}>
                      <div>
                        <strong>{item.name}</strong>
                        <span>{item.responsible_employee_id ? item.responsible_employee_id[1] : "Хариуцагч сонгоогүй"}</span>
                      </div>
                      <b>{item.generated_task_count} ажил</b>
                    </div>
                    <small>
                      {recurringFrequencyLabel(item.frequency)} · {item.daily_planned_quantity || 0} · {item.start_date || "Эхлэх огноогүй"}
                      {item.end_date ? ` – ${item.end_date}` : ""} · {item.active ? "Идэвхтэй" : "Идэвхгүй"}
                    </small>
                  </article>
                ))}
              </div>
            </section>

            <section id="teams" className={styles.formCard}>
              <span className={styles.formBadge}>Баг</span>

              <form action={createCleaningTeamAction} className={styles.createWorkForm}>
                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label htmlFor="team_name">Багийн нэр</label>
                    <input id="team_name" name="team_name" type="text" placeholder="Жишээ: 2-р баг" required />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="team_leader_id">Багийн ахлагч / мастер</label>
                    <select id="team_leader_id" name="team_leader_id">
                      <option value="">Сонгохгүй</option>
                      {teamLeaderOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {[employee.name, employee.jobTitle].filter(Boolean).join(" · ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="service_area">Хариуцах хэсэг</label>
                    <input id="service_area" name="service_area" type="text" placeholder="Жишээ: 2-3 хороо" />
                  </div>
                </div>

                <TeamMemberPicker label="Багийн гишүүд" options={teamMemberOptions} />

                <div className={styles.buttonRow}>
                  <button type="submit" className={styles.primaryButton}>
                    Баг нэмэх
                  </button>
                </div>
              </form>

              <div className={styles.settingsList}>
                {teamOptions.length ? (
                  teamOptions.map((team) => (
                    <article key={team.id} className={styles.settingsListItem}>
                      <div className={styles.settingsListHeader}>
                        <div>
                          <strong>{team.name}</strong>
                          <span>
                            {[
                              team.serviceArea ? `Хэсэг: ${team.serviceArea}` : "",
                              team.leaderName ? `Ахлагч: ${team.leaderName}` : "Ахлагч сонгоогүй",
                              team.memberNames.length ? `Гишүүд: ${team.memberNames.join(", ")}` : "Гишүүн сонгоогүй",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                      </div>

                      <form action={updateCleaningTeamAction} className={styles.createWorkForm}>
                        <input type="hidden" name="team_id" value={team.id} />
                        <div className={styles.fieldRow}>
                          <div className={styles.field}>
                            <label htmlFor={`team_name_${team.id}`}>Багийн нэр</label>
                            <input id={`team_name_${team.id}`} name="team_name" type="text" defaultValue={team.name} required />
                          </div>
                          <div className={styles.field}>
                            <label htmlFor={`team_leader_id_${team.id}`}>Багийн ахлагч / мастер</label>
                            <select id={`team_leader_id_${team.id}`} name="team_leader_id" defaultValue={team.leaderId ? String(team.leaderId) : ""}>
                              <option value="">Сонгохгүй</option>
                              {teamLeaderOptions.map((employee) => (
                                <option key={employee.id} value={employee.id}>
                                  {[employee.name, employee.jobTitle].filter(Boolean).join(" · ")}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className={styles.field}>
                            <label htmlFor={`service_area_${team.id}`}>Хариуцах хэсэг</label>
                            <input id={`service_area_${team.id}`} name="service_area" type="text" defaultValue={team.serviceArea} />
                          </div>
                        </div>

                        <TeamMemberPicker
                          label="Багийн гишүүд"
                          options={teamMemberOptions}
                          defaultSelectedIds={team.memberIds}
                        />

                        <div className={styles.buttonRow}>
                          <button type="submit" className={styles.secondaryButton}>
                            Баг засах
                          </button>
                          <button type="submit" formAction={archiveCleaningTeamAction} className={styles.dangerButton}>
                            Баг устгах
                          </button>
                        </div>
                      </form>
                    </article>
                  ))
                ) : (
                  <div className={styles.emptyState}>Бүртгэлтэй баг одоогоор алга.</div>
                )}
              </div>
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
