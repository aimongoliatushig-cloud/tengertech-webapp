import { redirect } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  ClipboardList,
  FileText,
  Flag,
  MapPin,
  Settings,
  Truck,
  Users,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getRoleLabel, hasCapability, requireSession } from "@/lib/auth";
import { isAutoGarbageDepartment, normalizeDepartmentText } from "@/lib/department-permissions";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { loadRouteManagementData } from "@/lib/route-management";
import { loadTeamManagementData, loadTeamMemberOptions } from "@/lib/team-management";
import { loadWorkTypeOptions } from "@/lib/workspace";

import {
  archiveGarbageTransportPointAction,
  archiveGarbageTransportRouteAction,
  archiveGarbageTransportTeamAction,
  createGarbageTransportPointAction,
  createGarbageTransportRouteAction,
  createGarbageTransportTeamAction,
  createGarbageTransportVehicleAction,
  archiveGarbageTransportWorkTypeAction,
  createGarbageTransportWorkTypeAction,
  saveGarbageTransportPreferencesAction,
  updateGarbageTransportPointAction,
  updateGarbageTransportRouteAction,
} from "./actions";
import styles from "./garbage-settings.module.css";
import { PointManagementPanel } from "./point-management-panel";
import { RouteCreateForm, RouteEditForm } from "./route-create-form";
import { TeamCreateForm } from "./team-create-form";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type DepartmentRecord = {
  id: number;
  name: string;
  manager_id?: [number, string] | false;
  company_id?: [number, string] | false;
  active?: boolean;
};

const SETTING_TABS = [
  { href: "#general", label: "Ерөнхий", icon: Settings },
  { href: "#teams", label: "Баг", icon: Users },
  { href: "#vehicles", label: "Машин", icon: Truck },
  { href: "#routes", label: "Маршрут", icon: Flag },
  { href: "#points", label: "Хогийн цэг", icon: MapPin },
  { href: "#work-types", label: "Ажлын төрөл", icon: ClipboardList },
  { href: "#notifications", label: "Мэдэгдэл", icon: Bell },
];

const REQUIRED_WORK_TYPES = [
  "Өдөр тутмын хог ачилт",
  "Том оврын хог ачилт",
  "Дуудлагын хог ачилт",
  "Цэг цэвэрлэгээ",
  "Хогийн сав хоослох",
  "Гомдол шийдвэрлэх",
  "Онцгой цэвэрлэгээ",
];

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function isChecked(value: string | false | null | undefined, fallback = true) {
  if (value === undefined || value === null || value === false || value === "") {
    return fallback;
  }
  return value === "1" || value === "true";
}

function getConfigKey(name: string) {
  return `mfo.garbage_transport.${name}`;
}

const CONFIG_DEFAULTS: Record<string, string> = {
  report_template: "Фото + тайлбар + гүйцэтгэлийн тоо",
  measurement_unit: "рейс",
  notify_assign: "1",
  notify_due_soon: "1",
  notify_overdue_head: "1",
  notify_done_head: "1",
  notify_complaint: "1",
  photo_required: "1",
  location_required: "1",
  start_time_required: "0",
  end_time_required: "0",
  quantity_required: "0",
};

type GarbageConfigName = keyof typeof CONFIG_DEFAULTS;

type ConfigParameterRecord = {
  key: string;
  value: string | false;
};

async function loadConfigValues(connection: Partial<OdooConnection>) {
  const keys = (Object.keys(CONFIG_DEFAULTS) as GarbageConfigName[]).map(getConfigKey);
  const read = (overrides: Partial<OdooConnection>) =>
    executeOdooKw<ConfigParameterRecord[]>(
      "ir.config_parameter",
      "search_read",
      [[["key", "in", keys]]],
      {
        fields: ["key", "value"],
        limit: keys.length,
      },
      overrides,
    );

  let records: ConfigParameterRecord[] = [];
  try {
    records = await read(connection);
  } catch {
    try {
      records = await read({});
    } catch {
      records = [];
    }
  }

  const values = { ...CONFIG_DEFAULTS };
  for (const record of records) {
    const shortName = record.key.replace("mfo.garbage_transport.", "") as GarbageConfigName;
    if (shortName in values && record.value) {
      values[shortName] = String(record.value);
    }
  }

  return values;
}

async function loadDepartmentRecord(
  departmentName: string | null,
  connection: Partial<OdooConnection>,
) {
  const normalized = normalizeDepartmentText(departmentName);
  const departments = await executeOdooKw<DepartmentRecord[]>(
    "hr.department",
    "search_read",
    [[["active", "in", [true, false]]]],
    {
      fields: ["name", "manager_id", "company_id", "active"],
      order: "name asc",
      limit: 120,
    },
    connection,
  ).catch(() => []);

  return (
    departments.find((department) => normalizeDepartmentText(department.name) === normalized) ??
    departments.find((department) => isAutoGarbageDepartment(department.name)) ??
    null
  );
}

export default async function GarbageTransportSettingsPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = (await searchParams) || {};
  const notice = getValue(params.notice);
  const error = getValue(params.error);
  const departmentScopeName = await loadSessionDepartmentName(session);
  const canAccess =
    String(session.role) === "system_admin" ||
    (String(session.role) === "project_manager" && isAutoGarbageDepartment(departmentScopeName));

  if (!canAccess) {
    redirect("/");
  }

  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const [
    routeData,
    teamData,
    memberOptions,
    workTypes,
    departmentRecord,
    settings,
  ] = await Promise.all([
    loadRouteManagementData(connectionOverrides),
    loadTeamManagementData(departmentScopeName, connectionOverrides),
    loadTeamMemberOptions(departmentScopeName, connectionOverrides),
    loadWorkTypeOptions(connectionOverrides).catch(() => []),
    loadDepartmentRecord(departmentScopeName, connectionOverrides),
    loadConfigValues(connectionOverrides),
  ]);
  const {
    report_template: reportTemplate,
    notify_assign: notifyAssign,
    notify_due_soon: notifyDueSoon,
    notify_overdue_head: notifyOverdueHead,
    notify_done_head: notifyDoneHead,
    notify_complaint: notifyComplaint,
  } = settings;

  const roleLabel = getRoleLabel(session.role);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const departmentName =
    departmentScopeName || departmentRecord?.name || "Авто бааз, хог тээвэрлэлтийн хэлтэс";
  const departmentHead = Array.isArray(departmentRecord?.manager_id)
    ? departmentRecord.manager_id[1]
    : session.name;
  const organizationName = Array.isArray(departmentRecord?.company_id)
    ? departmentRecord.company_id[1]
    : "Хот тохижилт үйлчилгээний төв ОНӨААТҮГ";
  const vehicleIds = new Set(routeData.vehicles.map((vehicle) => vehicle.id));
  const vehicleRows = routeData.vehicles.map((vehicle) => ({
    id: vehicle.id,
    label: vehicle.label,
  }));
  const garbageWorkTypes = workTypes.filter((workType) => workType.operationType === "garbage");
  const extraGarbageWorkTypes = garbageWorkTypes.filter((workType) =>
    !REQUIRED_WORK_TYPES.some((name) =>
      normalizeDepartmentText(workType.name).includes(normalizeDepartmentText(name)),
    ),
  );
  const statCards = [
    { label: "Баг", value: teamData.totalTeams, detail: "Хог тээврийн баг" },
    { label: "Машин", value: vehicleRows.length || vehicleIds.size, detail: "Хог тээвэрт ашиглах" },
    { label: "Маршрут", value: routeData.routes.length, detail: "Идэвхтэй маршрут" },
    { label: "Хогийн цэг", value: routeData.points.length, detail: "Бүртгэлтэй цэг" },
  ];

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="garbage-settings"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={roleLabel}
              departmentScopeName={departmentScopeName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Хог тээвэрлэлтийн тохиргоо"
              subtitle={`${departmentName} · зөвхөн энэ хэлтсийн тохиргоо`}
              userName={session.name}
              roleLabel={roleLabel}
              notificationCount={routeData.routes.length + teamData.totalTeams}
              notificationNote="Хог тээвэрлэлтийн баг, машин, маршрут, цэгийн тохиргоо"
            />

            <section className={styles.hero}>
              <div>
                <span className={styles.eyebrow}>Department settings</span>
                <h1>Хог тээвэрлэлтийн тохиргоо</h1>
                <p>
                  Энэ хэсэг нь зөвхөн хог тээвэрлэлтийн хэлтэст хамаарах баг, машин,
                  маршрут, хогийн цэг болон гүйцэтгэлийн дүрмийг удирдана.
                </p>
              </div>
              <div className={styles.heroStats}>
                {statCards.map((card) => (
                  <article key={card.label}>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                    <small>{card.detail}</small>
                  </article>
                ))}
              </div>
            </section>

            {notice ? <p className={styles.noticeMessage}>{notice}</p> : null}
            {error ? <p className={styles.errorMessage}>{error}</p> : null}

            <div className={styles.settingsTabs}>
              <nav className={styles.tabBar} aria-label="Хог тээвэрлэлтийн тохиргооны хэсгүүд">
                {SETTING_TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <a key={tab.href} href={tab.href}>
                      <Icon aria-hidden />
                      <span>{tab.label}</span>
                    </a>
                  );
                })}
              </nav>

              <div className={styles.tabPanels}>
            <section id="general" className={`${styles.sectionCard} ${styles.tabPanel}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Ерөнхий тохиргоо</span>
                  <h2>Хэлтсийн үндсэн мэдээлэл</h2>
                </div>
                <CheckCircle2 aria-hidden className={styles.sectionIcon} />
              </div>

              <form action={saveGarbageTransportPreferencesAction} className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Хэлтсийн нэр</span>
                  <input value={departmentName} readOnly />
                </label>
                <label className={styles.field}>
                  <span>Хэлтсийн дарга</span>
                  <input value={departmentHead} readOnly />
                </label>
                <label className={styles.field}>
                  <span>Харьяалах байгууллага</span>
                  <input value={organizationName} readOnly />
                </label>
                <label className={styles.checkField}>
                  <input name="is_active" type="checkbox" defaultChecked={departmentRecord?.active ?? true} />
                  <input name="is_active_present" type="hidden" value="1" />
                  <span>Идэвхтэй хэлтэс</span>
                </label>
                <label className={styles.field}>
                  <span>Тайлангийн загвар</span>
                  <input name="report_template" defaultValue={reportTemplate || ""} />
                </label>
                <button type="submit" className={styles.primaryButton}>Ерөнхий тохиргоо хадгалах</button>
              </form>
            </section>

            <section id="teams" className={`${styles.sectionCard} ${styles.tabPanel}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Багийн тохиргоо</span>
                  <h2>Хог тээврийн багууд</h2>
                </div>
                <span className={styles.countPill}>{teamData.totalTeams} баг</span>
              </div>

              <div className={styles.teamLayout}>
                <TeamCreateForm
                  action={createGarbageTransportTeamAction}
                  memberOptions={memberOptions}
                  vehicles={routeData.vehicles}
                />

                <div className={styles.teamListHeader}>
                  <h3>Одоогийн багууд</h3>
                  <span className={styles.countPill}>{teamData.totalTeams} баг</span>
                </div>

                <div className={`${styles.cardList} ${styles.teamCards}`}>
                  {teamData.teams.length ? (
                    teamData.teams.map((team) => (
                      <article key={team.id} className={styles.listCard}>
                        <div>
                          <strong>{team.name}</strong>
                          <small>{team.vehicleName || "Машин холбогдоогүй"}</small>
                        </div>
                        <p>{team.memberNames.length ? team.memberNames.slice(0, 5).join(", ") : "Гишүүн сонгоогүй"}</p>
                        <div className={styles.metaRow}>
                          <span>{team.memberIds.length} ажилтан</span>
                          <span>{team.departmentName || departmentName}</span>
                        </div>
                        <form action={archiveGarbageTransportTeamAction}>
                          <input type="hidden" name="team_id" value={team.id} />
                          <button type="submit" className={styles.ghostDanger}>Идэвхгүй болгох</button>
                        </form>
                      </article>
                    ))
                  ) : (
                    <p className={styles.emptyState}>Одоогоор хог тээврийн баг бүртгэгдээгүй байна.</p>
                  )}
                </div>
              </div>
            </section>

            <section id="vehicles" className={`${styles.sectionCard} ${styles.tabPanel}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Машины тохиргоо</span>
                  <h2>Хог тээврийн машинууд</h2>
                </div>
                <span className={styles.countPill}>{vehicleRows.length} машин</span>
              </div>

              <div className={styles.managerGrid}>
                <div className={styles.cardList}>
                  {vehicleRows.length ? (
                    vehicleRows.map((vehicle) => (
                      <article key={vehicle.id} className={styles.listCard}>
                        <div>
                          <strong>{vehicle.label}</strong>
                          <small>Маршрут дээр ашиглах машин</small>
                        </div>
                        <div className={styles.metaRow}>
                          <span>Бэлэн</span>
                          <span>Хог тээвэр</span>
                        </div>
                        <p>Жолооч, туслах ажилтныг машины тохиргооноос онооно.</p>
                      </article>
                    ))
                  ) : (
                    <p className={styles.emptyState}>Хог тээвэрт оноосон машин хараахан алга.</p>
                  )}
                </div>

                <form action={createGarbageTransportVehicleAction} className={styles.formPanel}>
                  <span className={styles.eyebrow}>Машин нэмэх</span>
                  <label className={styles.field}>
                    <span>Улсын дугаар</span>
                    <input name="vehicle_plate" placeholder="Жишээ: УБА 1234" required />
                  </label>
                  <label className={styles.field}>
                    <span>Машины төрөл</span>
                    <input name="vehicle_type" placeholder="Жишээ: Шахдаг тэвштэй" />
                  </label>
                  <label className={styles.field}>
                    <span>Даац</span>
                    <input name="vehicle_capacity" placeholder="Жишээ: 8 тонн" />
                  </label>
                  <label className={styles.field}>
                    <span>Жолооч</span>
                    <select name="driver_employee_id" defaultValue="">
                      <option value="">Сонгохгүй</option>
                      {memberOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>{employee.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Туслах ажилтан</span>
                    <select name="helper_employee_id" defaultValue="">
                      <option value="">Сонгохгүй</option>
                      {memberOptions.map((employee) => (
                        <option key={employee.id} value={employee.id}>{employee.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Одоогийн төлөв</span>
                    <select name="vehicle_status" defaultValue="ready">
                      <option value="ready">Бэлэн</option>
                      <option value="in_service">Ажилд гарсан</option>
                      <option value="repair">Засвартай</option>
                      <option value="paused">Түр зогссон</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Даатгал / үзлэгийн хугацаа</span>
                    <input name="inspection_date" type="date" />
                  </label>
                  <label className={styles.field}>
                    <span>Түлшний төрөл</span>
                    <select name="fuel_type" defaultValue="">
                      <option value="">Сонгохгүй</option>
                      <option value="diesel">Дизель</option>
                      <option value="gasoline">Бензин</option>
                      <option value="electric">Цахилгаан</option>
                      <option value="hybrid">Хосолсон</option>
                    </select>
                  </label>
                  <button type="submit" className={styles.primaryButton}>Машин нэмэх</button>
                </form>
              </div>
            </section>

            <section id="routes" className={`${styles.sectionCard} ${styles.tabPanel}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Маршрутын тохиргоо</span>
                  <h2>Маршрут</h2>
                </div>
                <span className={styles.countPill}>{routeData.routes.length} маршрут</span>
              </div>

              <div className={styles.routeLayout}>
                <RouteCreateForm
                  action={createGarbageTransportRouteAction}
                  points={routeData.points}
                />

                <div className={styles.routeListHeader}>
                  <h3>Одоогийн маршрутууд</h3>
                  <span className={styles.countPill}>{routeData.routes.length} маршрут</span>
                </div>

                <div className={styles.tableList}>
                  {routeData.routes.length ? (
                    routeData.routes.map((route) => (
                      <article key={route.id} className={styles.routeManageCard}>
                        <div className={styles.routeCardHeader}>
                          <div>
                            <strong>{route.name}</strong>
                            <small>
                              {route.pointNames.slice(0, 4).join(", ") ||
                                route.subdistrictNames ||
                                "Цэг холбогдоогүй"}
                            </small>
                          </div>
                          <span>{route.pointCount} цэг</span>
                          <form action={archiveGarbageTransportRouteAction}>
                            <input type="hidden" name="route_id" value={route.id} />
                            <button type="submit" className={styles.ghostDanger}>Устгах</button>
                          </form>
                        </div>
                        <details className={styles.routeEditDetails}>
                          <summary>Засах</summary>
                          <RouteEditForm
                            action={updateGarbageTransportRouteAction}
                            points={routeData.points}
                            route={{
                              id: route.id,
                              name: route.name,
                              pointIds: route.pointIds,
                            }}
                          />
                        </details>
                      </article>
                    ))
                  ) : (
                    <p className={styles.emptyState}>Одоогоор маршрут бүртгэгдээгүй байна.</p>
                  )}
                </div>
              </div>
            </section>

            <section id="points" className={`${styles.sectionCard} ${styles.tabPanel}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Хогийн цэгийн тохиргоо</span>
                  <h2>Хогийн цэгүүд</h2>
                </div>
                <span className={styles.countPill}>{routeData.points.length} цэг</span>
              </div>

              <PointManagementPanel
                createAction={createGarbageTransportPointAction}
                updateAction={updateGarbageTransportPointAction}
                archiveAction={archiveGarbageTransportPointAction}
                points={routeData.points}
                subdistricts={routeData.subdistricts}
              />
            </section>

            <section id="work-types" className={`${styles.sectionCard} ${styles.tabPanel}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Ажлын төрөл</span>
                  <h2>Хог тээвэрлэлтийн ажлын төрлүүд</h2>
                </div>
                <FileText aria-hidden className={styles.sectionIcon} />
              </div>
              <form action={createGarbageTransportWorkTypeAction} className={styles.inlineCreateForm}>
                <label className={styles.field}>
                  <span>Шинэ ажлын төрөл</span>
                  <input name="work_type_name" placeholder="Жишээ: Хогийн сав угаах" required />
                </label>
                <button type="submit" className={styles.primaryButton}>Ажлын төрөл нэмэх</button>
              </form>
              <div className={styles.workTypeGrid}>
                {REQUIRED_WORK_TYPES.map((name) => {
                  const existingWorkType = garbageWorkTypes.find((workType) =>
                    normalizeDepartmentText(workType.name).includes(normalizeDepartmentText(name)),
                  );
                  return (
                    <article key={name} className={styles.workTypeCard}>
                      <strong>{name}</strong>
                      <div className={styles.workTypeActions}>
                        <span className={existingWorkType ? styles.stateReady : styles.stateMuted}>
                          {existingWorkType ? "Идэвхтэй" : "Одоогоор байхгүй"}
                        </span>
                        {existingWorkType ? (
                          <form action={archiveGarbageTransportWorkTypeAction}>
                            <input type="hidden" name="work_type_id" value={existingWorkType.id} />
                            <button type="submit" className={styles.ghostDanger}>Хасах</button>
                          </form>
                        ) : (
                          <form action={createGarbageTransportWorkTypeAction}>
                            <input type="hidden" name="work_type_name" value={name} />
                            <button type="submit" className={styles.lightButton}>Нэмэх</button>
                          </form>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {extraGarbageWorkTypes.length ? (
                <div className={styles.extraWorkTypes}>
                  <h3>Нэмэлт ажлын төрлүүд</h3>
                  <div className={styles.metaRow}>
                    {extraGarbageWorkTypes.map((workType) => (
                      <form key={workType.id} action={archiveGarbageTransportWorkTypeAction} className={styles.extraWorkTypeChip}>
                        <input type="hidden" name="work_type_id" value={workType.id} />
                        <span>{workType.name}</span>
                        <button type="submit" aria-label={`${workType.name} хасах`}>×</button>
                      </form>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section id="notifications" className={`${styles.sectionCard} ${styles.tabPanel}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Мэдэгдлийн тохиргоо</span>
                  <h2>Хог тээвэрлэлтийн мэдэгдэл</h2>
                </div>
                <Bell aria-hidden className={styles.sectionIcon} />
              </div>
              <form action={saveGarbageTransportPreferencesAction} className={styles.criteriaGrid}>
                {[
                  ["notify_assign", "Ажил онооход мэдэгдэл илгээх", notifyAssign],
                  ["notify_due_soon", "Хугацаа дөхөхөд мэдэгдэл илгээх", notifyDueSoon],
                  ["notify_overdue_head", "Хугацаа хэтэрвэл хэлтсийн даргад мэдэгдэх", notifyOverdueHead],
                  ["notify_done_head", "Ажил дуусахад даргад мэдэгдэх", notifyDoneHead],
                  ["notify_complaint", "Гомдол ирэхэд мэдэгдэх", notifyComplaint],
                ].map(([name, label, value]) => (
                  <label key={name} className={styles.checkField}>
                    <input name={name} type="checkbox" defaultChecked={isChecked(value)} />
                    <input name={`${name}_present`} type="hidden" value="1" />
                    <span>{label}</span>
                  </label>
                ))}
                <button type="submit" className={styles.primaryButton}>Мэдэгдэл хадгалах</button>
              </form>
            </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
