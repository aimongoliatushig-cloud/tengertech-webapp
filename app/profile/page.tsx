import Link from "next/link";
import {
  Bell,
  ChevronRight,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { ProfileAvatar } from "@/app/_components/profile-avatar";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  getDeviceLabel,
  getSessionRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { isAutoGarbageDepartment } from "@/lib/department-permissions";
import { loadEmployeeErpEvaluation, loadSelfEmployeeScorecard } from "@/lib/hr";
import { executeOdooKw, type OdooConnection } from "@/lib/odoo";
import { EmployeeErpScorecard } from "@/app/hr/employee-erp-scorecard";
import { getPrimaryAppRole, type RoleGroupFlags } from "@/lib/roles";
import { loadRouteManagementData } from "@/lib/route-management";

import {
  changeProfilePasswordAction,
  createProfileCollectionPointAction,
  updateProfilePhotoAction,
} from "./actions";
import { ProfilePhotoUpload } from "./profile-photo-upload";
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

function getAppRoleLabel(appRole: ReturnType<typeof getPrimaryAppRole>) {
  switch (appRole) {
    case "admin":
      return "Системийн бүрэн эрх";
    case "executive":
      return "Удирдлагын хяналт";
    case "manager":
      return "Удирдлагын урсгал";
    case "dispatcher":
      return "Диспетчерийн урсгал";
    case "inspector":
      return "Хяналтын урсгал";
    case "leader":
      return "Удирдлагын урсгал";
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

function maskIpAddress(value?: string | null) {
  if (!value) {
    return "Бүртгэгдээгүй";
  }
  if (value.includes(":")) {
    return `${value.split(":").slice(0, 2).join(":")}:…`;
  }
  const parts = value.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
  }
  return value;
}

type ProfileImageRecord = {
  id: number;
  image_128?: string | false;
  avatar_128?: string | false;
  image_1920?: string | false;
  work_email?: string | false;
  mobile_phone?: string | false;
  work_phone?: string | false;
  email?: string | false;
  phone?: string | false;
  mobile?: string | false;
};

const MIN_REAL_PROFILE_IMAGE_BYTES = 1000;

function imageDataUrl(value?: string | false) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === "false" ||
    (!trimmed.startsWith("data:") && trimmed.length < MIN_REAL_PROFILE_IMAGE_BYTES)
  ) {
    return "";
  }

  return trimmed.startsWith("data:") ? trimmed : `data:image/png;base64,${trimmed}`;
}

async function loadCurrentProfileInfo(
  session: Awaited<ReturnType<typeof requireSession>>,
  connection: Partial<OdooConnection>,
) {
  const fields = [
    "id",
    "image_128",
    "avatar_128",
    "image_1920",
    "work_email",
    "mobile_phone",
    "work_phone",
  ];
  const employees = await executeOdooKw<ProfileImageRecord[]>(
    "hr.employee",
    "search_read",
    [[["user_id", "=", session.uid]]],
    { fields, limit: 1 },
    connection,
  ).catch(() => []);
  const employeeImage = imageDataUrl(
    employees[0]?.image_128 || employees[0]?.avatar_128 || employees[0]?.image_1920,
  );
  const employeeEmail = employees[0]?.work_email || "";
  const employeePhone = employees[0]?.mobile_phone || employees[0]?.work_phone || "";

  if (employeeImage || employeeEmail || employeePhone) {
    return {
      imageUrl: employeeImage,
      email: employeeEmail,
      phone: employeePhone,
    };
  }

  const users = await executeOdooKw<ProfileImageRecord[]>(
    "res.users",
    "search_read",
    [[["id", "=", session.uid]]],
    { fields: ["id", "image_128", "avatar_128", "image_1920", "email", "phone", "mobile"], limit: 1 },
    connection,
  ).catch(() => []);

  return {
    imageUrl: imageDataUrl(users[0]?.image_128 || users[0]?.avatar_128 || users[0]?.image_1920),
    email: users[0]?.email || session.login || "",
    phone: users[0]?.mobile || users[0]?.phone || "",
  };
}

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = (await searchParams) || {};
  const notice = getValue(params.notice);
  const error = getValue(params.error);

  const roleLabel = getSessionRoleLabel(session);
  const masterMode = isMasterRole(session.role);
  const workerMode = isWorkerOnly(session);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const departmentScopeName = await loadSessionDepartmentName(session);
  const groupFlags: Partial<RoleGroupFlags> = session.groupFlags || {};
  const isMasterOrOperationalLeader = Boolean(
    masterMode ||
      groupFlags.municipalMaster ||
      groupFlags.greenMaster ||
      groupFlags.fleetRepairTeamLeader
  );
  const canViewHrDirectory = Boolean(
    new Set(["system_admin", "director", "general_manager"]).has(String(session.role)) ||
      (!isMasterOrOperationalLeader &&
        (groupFlags.hrUser || groupFlags.hrManager || groupFlags.municipalHr)),
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
  const canManageCollectionPoints = Boolean(
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
  const showFullProfile = !workerMode;
  const [routeManagementData, profileInfo, selfScorecardEmployee, erpEvaluation] = await Promise.all([
    showFullProfile && canManageCollectionPoints
      ? loadRouteManagementData(connectionOverrides)
      : Promise.resolve(null),
    loadCurrentProfileInfo(session, connectionOverrides),
    loadSelfEmployeeScorecard(session.uid).catch(() => null),
    loadEmployeeErpEvaluation(session.uid).catch(() => ({
      hasLogin: false,
      login: "",
      roleKey: "",
      lastLoginDate: "",
      isInternal: false,
      totalTasks: 0,
      activeTasks: 0,
      completedTasks: 0,
    })),
  ]);
  const profileImageUrl = profileInfo.imageUrl;
  const erpScorecard = selfScorecardEmployee ? (
    <EmployeeErpScorecard employee={selfScorecardEmployee} evaluation={erpEvaluation} />
  ) : null;

  const appRoleLabel = getAppRoleLabel(
    getPrimaryAppRole({
      role: session.role,
      groupFlags: session.groupFlags,
    }),
  );
  const renderProfileAvatar = (compact = false) => (
    <ProfileAvatar
      src={profileImageUrl}
      alt={`${session.name} профайл зураг`}
      className={`${styles.avatarFrame} ${compact ? styles.avatarFrameCompact : ""}`}
      imageClassName={styles.avatarImage}
      iconClassName={styles.avatarIcon}
    />
  );
  const profilePhotoForm = (
    <form id="profile-photo" action={updateProfilePhotoAction} className={styles.profilePhotoForm}>
      <label className={styles.photoField}>
        <span>Профайл зураг</span>
        <input name="profile_photo" type="file" accept="image/jpeg,image/png,image/webp" required />
      </label>
      <button type="submit" className={styles.primaryMiniButton}>
        Зураг хадгалах
      </button>
      <small>JPG, PNG, WebP зураг 5MB хүртэл оруулна.</small>
    </form>
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
          label: "Миний даалгавар",
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
            label: "Захирамж, үүрэг даалгаврын жагсаалт",
            note: "Ажил, төслийн ерөнхий урсгал",
          },
    canManageCollectionPoints
      ? {
          href: "#collection-point-settings",
          label: "Хогийн цэг нэмэх",
          note: "Бүртгэлтэй хогийн цэгийг харж, шинээр нэмнэ",
        }
      : null,
    canUseFieldConsole
      ? {
          href: "/field",
          label: "Талбарын ажил",
          note: "Талбайн ажлаа нээнэ",
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
      label: "Захирамж, үүрэг даалгавар нээх",
      note: "Төсөл, ажил шинээр бүртгэж эхлүүлэх",
      enabled: canCreateProject,
    },
    {
      label: "Даалгавар нэмэх",
      note: "Одоо байгаа ажлын дотор шинэ даалгавар нээх",
      enabled: canCreateTasks,
    },
    {
      label: "Хогийн цэг нэмэх",
      note: "Авто бааз, хог тээвэрлэлтийн хэлтсийн даргад нээлттэй",
      enabled: canManageCollectionPoints,
    },
    {
      label: "Тайлан оруулах",
      note: "Даалгавар дээр тайлан үүсгэж илгээх",
      enabled: canWriteReports,
    },
    {
      label: "Чанарын төв үзэх",
      note: "Чанар, хяналтын урсгал нээх",
      enabled: canViewQualityCenter,
    },
    {
      label: "Талбарын ажил ашиглах",
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
  const profileEmail = profileInfo.email || session.login;
  const profilePhone = profileInfo.phone || "Утас бүртгээгүй";
  const mobileAccountRows = [
    { href: "#profile-photo", label: "Хувийн мэдээлэл", icon: UserRound },
  ];
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
              canViewHr={canViewHrDirectory}
              userName={session.name}
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              workerMode={workerMode}
              departmentScopeName={departmentScopeName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <div className={styles.desktopProfileHeader}>
            <WorkspaceHeader
              title={workerMode ? "Тохиргоо" : "Профайл"}
              subtitle={
                workerMode
                  ? "Системээс гарах, нууц үг солих болон нэвтэрсэн төхөөрөмжөө шалгах"
                  : "Таны бүртгэл, эрх, ажлын урсгалын товч мэдээлэл"
              }
              userName={session.name}
              roleLabel={roleLabel}
              userImageUrl={profileImageUrl}
              notificationCount={workerMode ? 0 : enabledCapabilityCount}
              notificationNote={
                workerMode
                  ? "Аюулгүй байдлын үндсэн тохиргоо"
                  : `${enabledCapabilityCount} боломж одоо нээлттэй байна`
              }
            />
            </div>

            <section className={styles.mobileProfileScreen}>
              <div className={styles.mobileProfileTopbar}>
                <button type="button" className={styles.mobileIconButton} aria-label="Цэс нээх">
                  <Menu aria-hidden />
                </button>
                <h1>Профайл</h1>
                <div className={styles.mobileTopbarActions}>
                  <Link className={styles.mobileBellButton} href="/notifications" aria-label="Мэдэгдэл харах">
                    <Bell aria-hidden />
                    {enabledCapabilityCount > 0 ? <span>{enabledCapabilityCount}</span> : null}
                  </Link>
                  <ProfileAvatar
                    src={profileImageUrl}
                    className={styles.mobileUserBadge}
                    imageClassName={styles.mobileUserBadgeImage}
                    iconClassName={styles.mobileUserBadgeIcon}
                    aria-hidden
                  />
                </div>
              </div>

              {notice ? <p className={styles.noticeMessage}>{notice}</p> : null}
              {error ? <p className={styles.errorMessage}>{error}</p> : null}

              <article className={styles.mobileProfileCard}>
                <ProfilePhotoUpload
                  action={updateProfilePhotoAction}
                  imageUrl={profileImageUrl}
                  userName={session.name}
                />
                <div className={styles.mobileProfileIdentity}>
                  <h2>{session.name}</h2>
                  <p>{roleLabel}</p>
                  <span>
                    <Mail aria-hidden />
                    {profileEmail}
                  </span>
                  <span>
                    <Phone aria-hidden />
                    {profilePhone}
                  </span>
                </div>
                <ChevronRight className={styles.mobileProfileChevron} aria-hidden />
              </article>

              {erpScorecard}

              <div className={styles.mobileSettingsGroup}>
                <h2>Хувийн мэдээлэл</h2>
                <div className={styles.mobileSettingsCard}>
                  {mobileAccountRows.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.label} href={item.href} className={styles.mobileSettingsRow}>
                        <Icon aria-hidden />
                        <span>{item.label}</span>
                        <ChevronRight aria-hidden />
                      </Link>
                    );
                  })}
                  <details className={styles.mobileSettingsDisclosure}>
                    <summary className={styles.mobileSettingsRow}>
                      <LockKeyhole aria-hidden />
                      <span>Нууц үг өөрчлөх</span>
                      <ChevronRight className={styles.mobileDisclosureChevron} aria-hidden />
                    </summary>
                    <div className={styles.mobileSettingsPanel}>
                      <div className={styles.mobilePanelHeader}>
                        <LockKeyhole aria-hidden />
                        <div>
                          <h2>Нууц үг солих</h2>
                          <p>Шинэ нууц үг хамгийн багадаа 8 тэмдэгттэй байна.</p>
                        </div>
                      </div>
                      <form action={changeProfilePasswordAction} className={styles.mobilePasswordForm}>
                        <label className={styles.mobileField}>
                          <span>Одоогийн нууц үг</span>
                          <input name="current_password" type="password" autoComplete="current-password" required />
                        </label>
                        <label className={styles.mobileField}>
                          <span>Шинэ нууц үг</span>
                          <input name="new_password" type="password" autoComplete="new-password" minLength={8} required />
                        </label>
                        <label className={styles.mobileField}>
                          <span>Шинэ нууц үг давтах</span>
                          <input name="confirm_password" type="password" autoComplete="new-password" minLength={8} required />
                        </label>
                        <button type="submit" className={styles.mobilePrimaryButton}>
                          Нууц үг солих
                        </button>
                      </form>
                    </div>
                  </details>
                  <details className={styles.mobileSettingsDisclosure}>
                    <summary className={styles.mobileSettingsRow}>
                      <ShieldCheck aria-hidden />
                      <span>Бүртгэлтэй төхөөрөмж</span>
                      <ChevronRight className={styles.mobileDisclosureChevron} aria-hidden />
                    </summary>
                    <div className={styles.mobileSettingsPanel}>
                      <div className={styles.mobilePanelHeader}>
                        <ShieldCheck aria-hidden />
                        <div>
                          <h2>Бүртгэлтэй төхөөрөмж</h2>
                          <p>Одоогийн нэвтрэлтийн төхөөрөмж болон IP мэдээлэл.</p>
                        </div>
                      </div>
                      <div className={styles.mobileSecurityList}>
                        <span>
                          <small>Төхөөрөмж</small>
                          <strong>{session.deviceLabel || getDeviceLabel(session.userAgent)}</strong>
                        </span>
                        <span>
                          <small>IP хаяг</small>
                          <strong>{maskIpAddress(session.loginIp)}</strong>
                        </span>
                        <span>
                          <small>Төлөв</small>
                          <strong>Идэвхтэй</strong>
                        </span>
                      </div>
                    </div>
                  </details>
                </div>
              </div>

              <div className={styles.mobileSettingsGroup}>
                <h2>Бусад</h2>
                <form action="/auth/logout" method="post" className={styles.mobileLogoutForm}>
                  <button type="submit" className={styles.mobileLogoutRow}>
                    <LogOut aria-hidden />
                    <span>Гарах</span>
                    <ChevronRight aria-hidden />
                  </button>
                </form>
              </div>
            </section>

            <div className={styles.desktopProfileContent}>
            {erpScorecard}
            {workerMode ? (
              <>
                {notice ? <p className={styles.noticeMessage}>{notice}</p> : null}
                {error ? <p className={styles.errorMessage}>{error}</p> : null}

                <section className={`${styles.sectionCard} ${styles.workerSettingsCard}`}>
                  <div className={styles.profilePhotoPanel}>
                    {renderProfileAvatar(true)}
                    <div className={styles.profilePhotoCopy}>
                      <span className={styles.eyebrow}>Хувийн зураг</span>
                      <h2>{session.name}</h2>
                      <p>Өөрийн профайл дээр харагдах зураг шинэчилнэ.</p>
                      {profilePhotoForm}
                    </div>
                  </div>
                </section>

                <section id="password-settings" className={`${styles.sectionCard} ${styles.workerSettingsCard}`}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <span className={styles.eyebrow}>Аюулгүй байдал</span>
                      <h2>Нууц үг солих</h2>
                    </div>
                    <p>Шинэ нууц үг 8-аас дээш тэмдэгттэй байна.</p>
                  </div>

                  <form action={changeProfilePasswordAction} className={styles.passwordForm}>
                    <label className={styles.field}>
                      <span>Одоогийн нууц үг</span>
                      <input
                        name="current_password"
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <div className={styles.twoColumnFields}>
                      <label className={styles.field}>
                        <span>Шинэ нууц үг</span>
                        <input
                          name="new_password"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          required
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Шинэ нууц үг давтах</span>
                        <input
                          name="confirm_password"
                          type="password"
                          autoComplete="new-password"
                          minLength={8}
                          required
                        />
                      </label>
                    </div>
                    <button type="submit" className={styles.primaryMiniButton}>
                      Нууц үг солих
                    </button>
                  </form>
                </section>

                <section className={`${styles.sectionCard} ${styles.workerSettingsCard}`}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <span className={styles.eyebrow}>Нэвтрэлтийн лог</span>
                      <h2>Миний эрхээр орсон төхөөрөмж</h2>
                    </div>
                    <p>Одоогийн нэвтрэлтийн төхөөрөмж, IP болон цаг.</p>
                  </div>

                  <div className={styles.sessionList}>
                    <article className={styles.sessionCard}>
                      <div>
                        <strong>{session.deviceLabel || getDeviceLabel(session.userAgent)}</strong>
                        <small>{session.userAgent || "User agent бүртгэгдээгүй"}</small>
                      </div>
                      <div className={styles.sessionMetaGrid}>
                        <span>
                          <small>Нэвтэрсэн цаг</small>
                          <strong>{formatSessionStart(session.issuedAt)}</strong>
                        </span>
                        <span>
                          <small>IP хаяг</small>
                          <strong>{maskIpAddress(session.loginIp)}</strong>
                        </span>
                        <span>
                          <small>Төлөв</small>
                          <strong>Идэвхтэй</strong>
                        </span>
                      </div>
                    </article>
                  </div>
                </section>

                <section className={`${styles.logoutCard} ${styles.workerSettingsCard}`}>
                  <div>
                    <span className={styles.eyebrow}>Сесс</span>
                    <h2>Системээс гарах</h2>
                    <p>Энэ төхөөрөмжийг өөр хүн ашиглах бол системээс гарна уу.</p>
                  </div>

                  <form action="/auth/logout" method="post">
                    <button type="submit" className={styles.logoutButton}>
                      Гарах
                    </button>
                  </form>
                </section>
              </>
            ) : (
            <>
            <section className={`${shellStyles.heroCard} ${styles.heroCard}`}>
              <div className={styles.identityBlock}>
                {renderProfileAvatar()}
                <div className={styles.identityCopy}>
                  <span className={styles.eyebrow}>Хувийн бүртгэл</span>
                  <h1>{session.name}</h1>
                  <p>{roleLabel}</p>
                </div>
                <span className={styles.rolePill}>{appRoleLabel}</span>
              </div>

              {profilePhotoForm}

              <div className={styles.summaryGrid}>
                <article className={styles.summaryCard}>
                  <span>Нэвтрэх нэр</span>
                  <strong>{session.login}</strong>
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

            <section id="collection-point-settings" className={styles.sectionCard}>
              <div className={styles.settingsHero}>
                <div>
                  <span className={styles.eyebrow}>Тохиргооны үйлдэл</span>
                  <h2>Хогийн цэг</h2>
                  <p>
                    Авто бааз, хог тээвэрлэлтийн хэлтсийн эрхтэй хэрэглэгч хогийн цэгийн
                    бүртгэлийг харж, шинээр нэмэх боломжтой.
                  </p>
                </div>
                <div className={styles.settingsStats}>
                  <span><strong>{routeManagementData?.points.length ?? 0}</strong> хогийн цэг</span>
                </div>
              </div>

              {notice ? <p className={styles.noticeMessage}>{notice}</p> : null}
              {error ? <p className={styles.errorMessage}>{error}</p> : null}

              <div className={styles.settingsNav} aria-label="Тохиргооны хэсгүүд">
                <a href="#settings-points" aria-disabled={!canManageCollectionPoints}>
                  <strong>Хогийн цэг</strong>
                  <span>Цэгийн бүртгэл</span>
                </a>
              </div>

              <div id="settings-points" className={styles.managementPanel}>
                <div className={styles.managementHeader}>
                  <div>
                    <span className={styles.formBadge}>Хогийн цэг</span>
                    <h3>Хогийн цэгийн бүртгэл</h3>
                    <p>Бүртгэлтэй хогийн цэгүүдийг эндээс харж, шинээр нэмнэ.</p>
                  </div>
                  <span className={styles.routeCount}>{routeManagementData?.points.length ?? 0} цэг</span>
                </div>

                {canManageCollectionPoints && routeManagementData ? (
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
                        <p>Хогийн цэгийн нэр, хороо, хаягийн мэдээллийг бүртгэнэ.</p>
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

            <section id="password-settings" className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Аюулгүй байдал</span>
                  <h2>Нууц үг солих</h2>
                </div>
                <p>Одоогийн нууц үгээ баталгаажуулаад шинэ нууц үгээ тохируулна.</p>
              </div>

              <form action={changeProfilePasswordAction} className={styles.passwordForm}>
                <label className={styles.field}>
                  <span>Одоогийн нууц үг</span>
                  <input
                    name="current_password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <div className={styles.twoColumnFields}>
                  <label className={styles.field}>
                    <span>Шинэ нууц үг</span>
                    <input
                      name="new_password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Шинэ нууц үг давтах</span>
                    <input
                      name="confirm_password"
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </label>
                </div>
                <button type="submit" className={styles.primaryMiniButton}>
                  Нууц үг солих
                </button>
              </form>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Нэвтрэлтийн лог</span>
                  <h2>Миний эрхээр орсон төхөөрөмж</h2>
                </div>
                <p>Энэ web app дээрх одоогийн session-ийн төхөөрөмж, IP болон нэвтэрсэн цаг.</p>
              </div>

              <div className={styles.sessionList}>
                <article className={styles.sessionCard}>
                  <div>
                    <strong>{session.deviceLabel || getDeviceLabel(session.userAgent)}</strong>
                    <small>{session.userAgent || "User agent бүртгэгдээгүй"}</small>
                  </div>
                  <div className={styles.sessionMetaGrid}>
                    <span>
                      <small>Нэвтэрсэн цаг</small>
                      <strong>{formatSessionStart(session.issuedAt)}</strong>
                    </span>
                    <span>
                      <small>IP хаяг</small>
                      <strong>{maskIpAddress(session.loginIp)}</strong>
                    </span>
                    <span>
                      <small>Төлөв</small>
                      <strong>Идэвхтэй</strong>
                    </span>
                  </div>
                </article>
              </div>
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
            </>
            )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
