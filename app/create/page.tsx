import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import styles from "@/app/create/create.module.css";
import shellStyles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";

type ActionCard = {
  key: "project" | "task" | "report";
  title: string;
  note: string;
  href: string;
  accent: string;
  badge: string;
  icon: string;
};

export const dynamic = "force-dynamic";

export default async function CreateHubPage() {
  const session = await requireSession();
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");

  const actionCards: ActionCard[] = [
    ...(canCreateProject
      ? [
          {
            key: "project",
            title: "Ажил нэмэх",
            note: "Шинэ ажил, төсөл бүртгэж ажлын үндсэн урсгалыг нээнэ.",
            href: "/projects/new",
            accent: styles.actionProject,
            badge: "Шинэ ажил",
            icon: "＋",
          } satisfies ActionCard,
        ]
      : []),
    ...(canCreateTasks
      ? [
          {
            key: "task",
            title: "Ажилбар нэмэх",
            note: "Эхлээд ажлаа сонгоод тухайн ажлын дотор шинэ ажилбар нээнэ.",
            href: "/projects?quickAction=task",
            accent: styles.actionTask,
            badge: "Ажил сонгоно",
            icon: "≣",
          } satisfies ActionCard,
        ]
      : []),
    ...(canWriteReports
      ? [
          {
            key: "report",
            title: "Тайлан оруулах",
            note: workerMode
              ? "Эхлээд идэвхтэй ажлаа сонгоод, дараа нь тухайн ажлын ажилбараас тайлангийн цонх руу орно."
              : "Зөвхөн идэвхтэй ажлууд харагдаж, тэр ажлаас тайлан оруулах ажилбараа сонгоно.",
            href: "/create/report",
            accent: styles.actionReport,
            badge: "Ажил сонгоно",
            icon: "○",
          } satisfies ActionCard,
        ]
      : []),
  ];

  if (!actionCards.length) {
    redirect("/");
  }

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="new-project"
              variant={!masterMode && session.role === "general_manager" ? "executive" : "default"}
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              masterMode={masterMode}
              workerMode={workerMode}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Нэмэх төв"
              subtitle="Шинэ ажил, ажилбар, тайлангийн эхлэлийг эндээс сонгоно"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={actionCards.length}
              notificationNote={`${actionCards.length} боломжит үйлдэл нээлттэй байна`}
            />

            <section className={`${shellStyles.heroCard} ${styles.heroCard}`}>
              <span className={shellStyles.eyebrow}>Нэмэх урсгал</span>
              <h1>Ямар үйлдэл хийх вэ?</h1>
              <p>
                {workerMode
                  ? "Танд нээлттэй байгаа тайлангийн урсгалыг эндээс шууд эхлүүлнэ. Ажилбараа сонгоод тайлангаа оруулахад хангалттай."
                  : masterMode
                    ? "Өөрийн алба нэгжийн шинэ ажил, ажилбар, тайлангийн зөв урсгалыг эндээс нэг товшилтоор сонгоно."
                    : "Шинэ ажил, ажилбар, тайлангийн аль урсгал руу орохоо эндээс сонгоно."}
              </p>

              <div className={styles.heroMetaGrid}>
                <article className={styles.heroMetaCard}>
                  <span>Нээлттэй үйлдэл</span>
                  <strong>{actionCards.length}</strong>
                  <small>Таны эрхэд таарсан сонголтууд</small>
                </article>
                <article className={styles.heroMetaCard}>
                  <span>Таны түвшин</span>
                  <strong>{getRoleLabel(session.role)}</strong>
                  <small>{session.name}</small>
                </article>
              </div>
            </section>

            <section className={styles.actionGrid} aria-label="Нэмэх сонголтууд">
              {actionCards.map((item) => (
                <Link key={item.key} href={item.href} className={`${styles.actionCard} ${item.accent}`}>
                  <div className={styles.actionCardTop}>
                    <span className={styles.actionIcon} aria-hidden>
                      {item.icon}
                    </span>
                    <span className={styles.actionBadge}>{item.badge}</span>
                  </div>

                  <div className={styles.actionCopy}>
                    <strong>{item.title}</strong>
                    <p>{item.note}</p>
                  </div>

                  <div className={styles.actionFoot}>
                    <span>Үргэлжлүүлэх</span>
                    <strong aria-hidden>→</strong>
                  </div>
                </Link>
              ))}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
