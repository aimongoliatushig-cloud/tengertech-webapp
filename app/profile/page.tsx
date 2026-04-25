import Link from "next/link";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { getPrimaryAppRole } from "@/lib/roles";

import styles from "./profile.module.css";

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

export default async function ProfilePage() {
  const session = await requireSession();
  const roleLabel = getRoleLabel(session.role);
  const masterMode = isMasterRole(session.role);
  const workerMode = isWorkerOnly(session);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const canViewHrDirectory = new Set(["system_admin", "director", "general_manager"]).has(
    String(session.role),
  );

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
    canUseFieldConsole
      ? {
          href: "/field",
          label: "Талбарын ажил",
          note: "Маршрут ба талбайн ажлаа нээнэ",
        }
      : null,
    {
      href: "/procurement",
      label: "Худалдан авалт",
      note: "Хүсэлт ба шатны явцаа хянана",
    },
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
          note: "Чанарын хяналттай холбоотой мэдээлэл",
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
              masterMode={masterMode}
              workerMode={workerMode}
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
                  <span>Нээлттэй хэсэг</span>
                  <strong>{quickLinks.length}</strong>
                  <small>Танд шууд ажиллах боломжтой хэсгүүд</small>
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
                <p>Профайлаас шууд орох хамгийн их хэрэглэдэг хэсгүүд.</p>
              </div>

              <div className={styles.linkGrid}>
                {quickLinks.map((item) => (
                  <Link key={item.href} href={item.href} className={styles.linkCard}>
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
                <p className={styles.emptyNote}>Одоогоор нэмэлт group эрх идэвхжээгүй байна.</p>
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
