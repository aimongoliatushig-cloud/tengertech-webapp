import Link from "next/link";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { isAutoGarbageDepartment } from "@/lib/department-permissions";
import { getPrimaryAppRole, type RoleGroupFlags } from "@/lib/roles";
import { loadRouteManagementData } from "@/lib/route-management";
import { loadTeamManagementData, loadTeamMemberOptions } from "@/lib/team-management";

import {
  archiveProfileTeamAction,
  createProfileCollectionPointAction,
  createProfileRouteAction,
  createProfileTeamAction,
} from "./actions";
import styles from "./profile.module.css";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type QuickLink = {
  href: string;
  label: string;
  note: string;
};

type CapabilityCard = {
  label: string;
  note: string;
  enabled: boolean;
};

function getValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function getInitials(userName: string) {
  const parts = userName
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "ХТ";
  }

  return parts
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("mn-MN");
}

function getAppRoleLabel(appRole: ReturnType<typeof getPrimaryAppRole>) {
  switch (appRole) {
    case "admin":
      return "Системийн бүрэн эрх";
    case "executive":
      return "Удирдлагын хяналт";
    case "manager":
      return "Менежерийн урсгал";
    case "dispatcher":
      return "Диспетчерийн урсгал";
    case "inspector":
      return "Хяналтын урсгал";
    case "leader":
      return "Багийн удирдлагын урсгал";
    default:
      return "Талбарын урсгал";
  }
}

function formatSessionStart(value: number) {
  return new Intl.DateTimeFormat("mn-MN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ulaanbaatar",
  }).format(value);
}

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = (await searchParams) || {};
  const notice = getValue(params.notice);
  const error = getValue(params.error);

  const roleLabel = getRoleLabel(session.role);
  const masterMode = isMasterRole(session.role);
  const workerMode = isWorkerOnly(session);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const departmentScopeName = await loadSessionDepartmentName(session);
  const groupFlags: Partial<RoleGroupFlags> = session.groupFlags || {};
  const canViewHrDirectory = Boolean(
    new Set(["system_admin", "director", "general_manager"]).has(String(session.role)) ||
      groupFlags.hrUser ||
      groupFlags.hrManager ||
      groupFlags.municipalHr,
  );
  const canUseProcurement = Boolean(
    new Set(["system_admin", "director", "general_manager"]).has(String(session.role)) ||
      groupFlags.opsStorekeeper ||
      groupFlags.fleetRepairPurchaser ||
      groupFlags.fleetRepairFinance ||
      groupFlags.fleetRepairAccounting ||
      groupFlags.fleetRepairManager ||
      groupFlags.fleetRepairCeo,
  );
  const canCreateTeam = Boolean(
    new Set(["system_admin", "project_manager", "senior_master", "team_leader"]).has(
      String(session.role),
    ) ||
      groupFlags.mfoManager ||
      groupFlags.mfoDispatcher ||
      groupFlags.municipalDepartmentHead ||
      groupFlags.environmentManager ||
      groupFlags.improvementManager,
  );
  const canCreateRoute = Boolean(
    isAutoGarbageDepartment(departmentScopeName) &&
      (String(session.role) === "project_manager" ||
        groupFlags.mfoManager ||
        groupFlags.mfoDispatcher ||
        groupFlags.municipalDepartmentHead),
  );
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const routeManagementData = canCreateRoute
    ? await loadRouteManagementData(connectionOverrides)
    : null;
  const teamMemberOptions = canCreateTeam
    ? await loadTeamMemberOptions(departmentScopeName, connectionOverrides)
    : [];
  const teamManagementData = canCreateTeam
    ? await loadTeamManagementData(departmentScopeName, connectionOverrides)
    : { teams: [], totalTeams: 0 };

  const appRoleLabel = getAppRoleLabel(
    getPrimaryAppRole({
      role: session.role,
      groupFlags: session.groupFlags,
    }),
  );

  const quickLinks: QuickLink[] = [
    {
      href: "/",
      label: "Хяналтын самбар",
      note: "Өдөр тутмын гол мэдээллээ харна",
    },
    workerMode
      ? {
          href: "/tasks",
          label: "Миний ажилбар",
          note: "Надад оноогдсон ажлуудаа харна",
        }
      : masterMode
        ? {
            href: "/tasks",
            label: "Өнөөдрийн ажил",
            note: "Өдрийн гүйцэтгэлийн жагсаалт",
          }
        : {
            href: "/projects",
            label: "Ажлын жагсаалт",
            note: "Ажил, төслийн ерөнхий урсгал",
          },
    canCreateTeam
      ? {
          href: "#team-route-settings",
          label: "Баг үүсгэх",
          note: "Өөрийн алба нэгжийн багийг нэмнэ",
        }
      : null,
    canCreateRoute
      ? {
          href: "#team-route-settings",
          label: "Маршрут үүсгэх",
          note: "Хог ачилт, авто баазын маршрутыг нэмнэ",
        }
      : null,
    canUseFieldConsole
      ? {
          href: "/field",
          label: "Талбарын ажил",
          note: "Маршрут ба талбайн ажлаа нээнэ",
        }
      : null,
    canUseProcurement
      ? {
          href: "/procurement",
          label: "Худалдан авалт",
          note: "Хүсэлт ба шатны явцаа хянана",
        }
      : null,
    canWriteReports
      ? {
          href: "/reports",
          label: "Тайлан",
          note: "Илгээсэн болон хүлээгдэж буй тайлан",
        }
      : null,
    canViewQualityCenter
      ? {
          href: "/quality",
          label: "Чанарын төв",
          note: "Чанар, хяналтын урсгал нээнэ",
        }
      : null,
    canViewHrDirectory
      ? {
          href: "/hr",
          label: "Хүний нөөц",
          note: "Ажилтны бүртгэл ба холбоос",
        }
      : null,
  ].filter((item): item is QuickLink => Boolean(item));

  const capabilities: CapabilityCard[] = [
    {
      label: "Шинэ ажил нээх",
      note: "Төсөл, ажил шинээр бүртгэж эхлүүлэх",
      enabled: canCreateProject,
    },
    {
      label: "Ажилбар нэмэх",
      note: "Одоо байгаа ажлын дотор шинэ ажилбар нээх",
      enabled: canCreateTasks,
    },
    {
      label: "Баг үүсгэх",
      note: "Өөрийн алба нэгжид гүйцэтгэлийн баг нэмэх",
      enabled: canCreateTeam,
    },
    {
      label: "Маршрут үүсгэх",
      note: "Зөвхөн Авто бааз, хог тээвэрлэлтийн хэлтсийн даргад нээлттэй",
      enabled: canCreateRoute,
    },
    {
      label: "Тайлан оруулах",
      note: "Ажилбар дээр тайлан үүсгэж илгээх",
      enabled: canWriteReports,
    },
    {
      label: "Чанарын төв үзэх",
      note: "Чанар, хяналтын урсгал нээх",
      enabled: canViewQualityCenter,
    },
    {
      label: "Талбарын маршрут ашиглах",
      note: "Гар утасны талбарын горимоор ажиллах",
      enabled: canUseFieldConsole,
    },
  ];

  const enabledCapabilityCount = capabilities.filter((item) => item.enabled).length;
  const enabledFlags = [
    session.groupFlags?.mfoManager ? "Менежерийн нэмэлт эрх" : null,
    session.groupFlags?.mfoDispatcher ? "Диспетчерийн нэмэлт эрх" : null,
    session.groupFlags?.mfoInspector ? "Хяналтын нэмэлт эрх" : null,
    session.groupFlags?.mfoMobile ? "Гар утасны нэмэлт урсгал" : null,
  ].filter((item): item is string => Boolean(item));

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="profile"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              workerMode={workerMode}
              departmentScopeName={departmentScopeName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Профайл"
              subtitle="Таны бүртгэл, эрх, ажлын урсгалын товч мэдээлэл"
              userName={session.name}
              roleLabel={roleLabel}
              notificationCount={enabledCapabilityCount}
              notificationNote={`${enabledCapabilityCount} боломж одоо нээлттэй байна`}
            />

            <section className={`${shellStyles.heroCard} ${styles.heroCard}`}>
              <div className={styles.identityBlock}>
                <span className={styles.avatar}>{getInitials(session.name)}</span>
                <div className={styles.identityCopy}>
                  <span className={styles.eyebrow}>Хувийн бүртгэл</span>
                  <h1>{session.name}</h1>
                  <p>{roleLabel}</p>
                </div>
                <span className={styles.rolePill}>{appRoleLabel}</span>
              </div>

              <div className={styles.summaryGrid}>
                <article className={styles.summaryCard}>
                  <span>Нэвтрэх нэр</span>
                  <strong>{session.login}</strong>
                  <small>Odoo-той холбогдож буй хэрэглэгчийн нэр</small>
                </article>

                <article className={styles.summaryCard}>
                  <span>Алба нэгж</span>
                  <strong>{departmentScopeName || "Бүх алба"}</strong>
                  <small>Энэ эрхээр харагдах үндсэн хамрах хүрээ</small>
                </article>

                <article className={styles.summaryCard}>
                  <span>Нэмэлт боломж</span>
                  <strong>{enabledCapabilityCount}</strong>
                  <small>Одоогийн эрх дээр нээгдсэн үйлдлүүд</small>
                </article>

                <article className={styles.summaryCard}>
                  <span>Сесс эхэлсэн</span>
                  <strong>{formatSessionStart(session.issuedAt)}</strong>
                  <small>Энэ нэвтрэлтийн хугацаа</small>
                </article>
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Шуурхай холбоос</span>
                  <h2>Танд хэрэгтэй үндсэн хэсгүүд</h2>
                </div>
                <p>Профайлаас шууд орох хамгийн их хэрэглэгддэг хэсгүүд.</p>
              </div>

              <div className={styles.linkGrid}>
                {quickLinks.map((item) => (
                  <Link key={`${item.href}-${item.label}`} href={item.href} className={styles.linkCard}>
                    <div className={styles.linkCopy}>
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </div>
                    <span className={styles.linkArrow} aria-hidden>
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section id="team-route-settings" className={styles.sectionCard}>
              <div className={styles.settingsHero}>
                <div>
                  <span className={styles.eyebrow}>Тохиргооны үйлдэл</span>
                  <h2>Баг, хогийн цэг, маршрут</h2>
                  <p>
                    Алба нэгжийн багийг шууд жагсаалтаар харж, шинээр нэмэх болон идэвхгүй болгох боломжтой.
                    Хогийн цэг, маршрут нь зөвхөн Авто бааз, хог тээвэрлэлтийн хэлтсийн эрхтэй хэрэглэгч дээр нээгдэнэ.
                  </p>
                </div>
                <div className={styles.settingsStats}>
                  <span><strong>{teamManagementData.totalTeams}</strong> баг</span>
                  <span><strong>{routeManagementData?.points.length ?? 0}</strong> хогийн цэг</span>
                  <span><strong>{routeManagementData?.routes.length ?? 0}</strong> маршрут</span>
                </div>
              </div>

              {notice ? <p className={styles.noticeMessage}>{notice}</p> : null}
              {error ? <p className={styles.errorMessage}>{error}</p> : null}

              <div className={styles.settingsNav} aria-label="Тохиргооны хэсгүүд">
                <a href="#settings-teams">
                  <strong>Баг</strong>
                  <span>Жагсаалт, гишүүд, нэмэх</span>
                </a>
                <a href="#settings-points" aria-disabled={!canCreateRoute}>
                  <strong>Хогийн цэг</strong>
                  <span>Цэгийн бүртгэл</span>
                </a>
                <a href="#settings-routes" aria-disabled={!canCreateRoute}>
                  <strong>Маршрут</strong>
                  <span>Машин, баг, цэг холбох</span>
                </a>
              </div>

              <div id="settings-teams" className={styles.managementPanel}>
                <div className={styles.managementHeader}>
                  <div>
                    <span className={styles.formBadge}>Баг</span>
                    <h3>Багийн жагсаалт</h3>
                    <p>Таны алба нэгжид холбоотой идэвхтэй багууд болон гишүүдийг харуулна.</p>
                  </div>
                  <span className={styles.routeCount}>{teamManagementData.totalTeams} баг</span>
                </div>

                {canCreateTeam ? (
                  <div className={styles.teamBoard}>
                    <div className={styles.teamList}>
                      {teamManagementData.teams.length ? (
                        teamManagementData.teams.map((team) => (
                          <article key={team.id} className={styles.teamCard}>
                            <div>
                              <strong>{team.name}</strong>
                              <small>{team.departmentName || departmentScopeName || "Алба нэгж тодорхойгүй"}</small>
                            </div>
                            <div className={styles.teamMetaGrid}>
                              <span>{team.memberIds.length} гишүүн</span>
                              <span>{team.vehicleName || "Машин холбоогүй"}</span>
                            </div>
                            <p>
                              {team.memberNames.length
                                ? team.memberNames.slice(0, 4).join(", ")
                                : "Гишүүн сонгоогүй байна."}
                            </p>
                            <form action={archiveProfileTeamAction}>
                              <input type="hidden" name="team_id" value={team.id} />
                              <button type="submit" className={styles.subtleDangerButton}>
                                Жагсаалтаас хасах
                              </button>
                            </form>
                          </article>
                        ))
                      ) : (
                        <p className={styles.emptyNote}>Одоогоор баг бүртгэгдээгүй байна. Баруун талын form-оор шинэ баг нэмээрэй.</p>
                      )}
                    </div>

                    <form action={createProfileTeamAction} className={styles.miniForm}>
                      <div>
                        <span className={styles.formBadge}>Нэмэх</span>
                        <h3>Шинэ баг үүсгэх</h3>
                        <p>Баг таны одоогийн алба нэгжтэй автоматаар холбогдоно.</p>
                      </div>
                      <label className={styles.field}>
                        <span>Багийн нэр</span>
                        <input name="team_name" type="text" placeholder="Жишээ: Өглөөний ээлжийн баг" required />
                      </label>
                      <label className={styles.field}>
                        <span>Багийн гишүүд</span>
                        <select
                          name="member_ids"
                          multiple
                          size={Math.min(Math.max(teamMemberOptions.length, 4), 8)}
                        >
                          {teamMemberOptions.map((employee) => (
                            <option key={employee.id} value={employee.id}>
                              {employee.label}
                            </option>
                          ))}
                        </select>
                        <small>Ctrl дарж олон ажилтан сонгоно.</small>
                      </label>
                      <button type="submit" className={styles.primaryMiniButton}>Баг үүсгэх</button>
                    </form>
                  </div>
                ) : (
                  <article className={styles.lockedCard}>
                    <span className={styles.formBadge}>Баг</span>
                    <h3>Баг удирдах эрх хаалттай</h3>
                    <p>Энэ хэсэг хэлтсийн дарга, мастер болон системийн админд нээлттэй.</p>
                  </article>
                )}
              </div>

              <div id="settings-points" className={styles.managementPanel}>
                <div className={styles.managementHeader}>
                  <div>
                    <span className={styles.formBadge}>Хогийн цэг</span>
                    <h3>Хогийн цэгийн бүртгэл</h3>
                    <p>Маршрут үүсгэхдээ сонгох хогийн цэгүүдийг эндээс харж, нэмнэ.</p>
                  </div>
                  <span className={styles.routeCount}>{routeManagementData?.points.length ?? 0} цэг</span>
                </div>

                {canCreateRoute && routeManagementData ? (
                  <div className={styles.teamBoard}>
                    <div className={styles.teamList}>
                      {routeManagementData.points.length ? (
                        routeManagementData.points.slice(0, 12).map((point) => (
                          <article key={point.id} className={styles.teamCard}>
                            <div>
                              <strong>{point.name}</strong>
                              <small>{point.subdistrictName || "Хороо тодорхойгүй"}</small>
                            </div>
                            <p>{point.address || "Хаяг, тайлбар нэмэгдээгүй."}</p>
                          </article>
                        ))
                      ) : (
                        <p className={styles.emptyNote}>Одоогоор хогийн цэг бүртгэгдээгүй байна.</p>
                      )}
                    </div>

                    <form action={createProfileCollectionPointAction} className={styles.miniForm}>
                      <div>
                        <span className={styles.formBadge}>Нэмэх</span>
                        <h3>Хогийн цэг нэмэх</h3>
                        <p>Цэг нэмээд дараа нь маршрутад сонгож холбоно.</p>
                      </div>
                      <label className={styles.field}>
                        <span>Цэгийн нэр</span>
                        <input name="point_name" type="text" placeholder="Жишээ: 8-р хороо - 20-р хогийн цэг" required />
                      </label>
                      <label className={styles.field}>
                        <span>Хороо</span>
                        <select name="subdistrict_id" required defaultValue="">
                          <option value="" disabled>Хороо сонгох</option>
                          {routeManagementData.subdistricts.map((subdistrict) => (
                            <option key={subdistrict.id} value={subdistrict.id}>{subdistrict.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.field}>
                        <span>Хаяг</span>
                        <input name="point_address" type="text" placeholder="Нэмэлт хаяг, тайлбар" />
                      </label>
                      <button type="submit" className={styles.primaryMiniButton}>Хогийн цэг нэмэх</button>
                    </form>
                  </div>
                ) : (
                  <article className={styles.lockedCard}>
                    <span className={styles.formBadge}>Хогийн цэг</span>
                    <h3>Хогийн цэг нэмэх эрх хаалттай</h3>
                    <p>Энэ хэсэг зөвхөн Авто бааз, хог тээвэрлэлтийн хэлтсийн даргад нээлттэй.</p>
                  </article>
                )}
              </div>

              <div id="settings-routes" className={styles.managementPanel}>
                <div className={styles.managementHeader}>
                  <div>
                    <span className={styles.formBadge}>Маршрут</span>
                    <h3>Маршрутын жагсаалт</h3>
                    <p>Odoo дээр бүртгэлтэй маршрутуудыг жагсаалтаар харуулж байна.</p>
                  </div>
                  <span className={styles.routeCount}>{routeManagementData?.routes.length ?? 0} маршрут</span>
                </div>

                {canCreateRoute && routeManagementData ? (
                  <div className={styles.routeManager}>
                    <div className={styles.routeTable}>
                      <div className={styles.routeTableHead}>
                        <span>Маршрут</span>
                        <span>Төсөл</span>
                        <span>Хогийн цэг</span>
                      </div>
                      {routeManagementData.routes.length ? (
                        routeManagementData.routes.map((route) => (
                          <article key={route.id} className={styles.routeRow}>
                            <strong>{route.name}</strong>
                            <span>{route.projectName || "-"}</span>
                            <small>
                              {route.pointCount} цэг
                              {route.pointNames.length ? [" · ", route.pointNames.slice(0, 3).join(", ")].join("") : ""}
                            </small>
                          </article>
                        ))
                      ) : (
                        <p className={styles.emptyNote}>Одоогоор маршрут бүртгэгдээгүй байна.</p>
                      )}
                    </div>

                    <form action={createProfileRouteAction} className={styles.routeCreateForm}>
                      <div className={styles.routeListHeader}>
                        <div>
                          <span className={styles.formBadge}>Нэмэх</span>
                          <h3>Маршрут нэмэх</h3>
                          <p>Машин, баг болон хогийн цэгүүдийг сонгоход маршрут Odoo дээр үүснэ.</p>
                        </div>
                      </div>
                      <div className={styles.formGrid}>
                        <label className={styles.field}>
                          <span>Маршрутын нэр</span>
                          <input name="route_name" type="text" placeholder="Жишээ: Хог тээвэрлэлт - 8 хороо" required />
                        </label>
                        <label className={styles.field}>
                          <span>Машин</span>
                          <select name="vehicle_id" required defaultValue="">
                            <option value="" disabled>Машин сонгох</option>
                            {routeManagementData.vehicles.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.field}>
                          <span>Баг</span>
                          <select name="team_id" required defaultValue="">
                            <option value="" disabled>Баг сонгох</option>
                            {routeManagementData.teams.map((team) => (
                              <option key={team.id} value={team.id}>{team.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.field}>
                          <span>Хогийн цэгүүд</span>
                          <select name="point_ids" multiple required size={Math.min(Math.max(routeManagementData.points.length, 4), 8)}>
                            {routeManagementData.points.map((point) => (
                              <option key={point.id} value={point.id}>{point.name}</option>
                            ))}
                          </select>
                          <small>Ctrl дарж хэд хэдэн цэг сонгоно.</small>
                        </label>
                      </div>
                      <button type="submit" className={styles.primaryMiniButton}>Маршрут нэмэх</button>
                    </form>
                  </div>
                ) : (
                  <article className={styles.lockedCard}>
                    <span className={styles.formBadge}>Маршрут</span>
                    <h3>Маршрут үүсгэх эрх хязгаартай</h3>
                    <p>Энэ хэсэг зөвхөн Авто бааз, хог тээвэрлэлтийн хэлтсийн даргаар нэвтрэхэд идэвхжинэ.</p>
                  </article>
                )}
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Эрхийн тойм</span>
                  <h2>Одоо ашиглаж болох үйлдлүүд</h2>
                </div>
                <p>Таны role болон нэмэлт group flag дээр үндэслэсэн боломжууд.</p>
              </div>

              <div className={styles.capabilityList}>
                {capabilities.map((item) => (
                  <article key={item.label} className={styles.capabilityCard}>
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </div>
                    <span
                      className={`${styles.capabilityState} ${
                        item.enabled ? styles.capabilityStateActive : styles.capabilityStateMuted
                      }`}
                    >
                      {item.enabled ? "Нээлттэй" : "Хаалттай"}
                    </span>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Нэмэлт тэмдэглэгээ</span>
                  <h2>Group эрхийн төлөв</h2>
                </div>
                <p>Тусгай урсгалууд дээр нээгдсэн нэмэлт эрхүүд энд харагдана.</p>
              </div>

              {enabledFlags.length ? (
                <div className={styles.flagList}>
                  {enabledFlags.map((item) => (
                    <span key={item} className={styles.flagChip}>
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className={styles.emptyNote}>
                  Одоогоор нэмэлт group эрх идэвхжээгүй байна.
                </p>
              )}
            </section>

            <section className={styles.logoutCard}>
              <div>
                <span className={styles.eyebrow}>Сесс</span>
                <h2>Энэ төхөөрөмжөөс гарах</h2>
                <p>Хэрэв энэ төхөөрөмжийг өөр хүн ашиглах бол гараад үлдээнэ үү.</p>
              </div>

              <form action="/auth/logout" method="post">
                <button type="submit" className={styles.logoutButton}>
                  Гарах
                </button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
