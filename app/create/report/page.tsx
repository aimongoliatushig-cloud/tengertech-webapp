import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import dashboardStyles from "@/app/page.module.css";
import shellStyles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { loadMunicipalSnapshot } from "@/lib/odoo";

import { buildReportProjectSummaries, getScopedActiveReportTasks } from "./report-flow";
import styles from "./report-picker.module.css";

function StagePill({
  label,
  bucket,
}: {
  label: string;
  bucket: "todo" | "progress" | "review" | "done" | "unknown" | "problem";
}) {
  const tone =
    bucket === "problem"
      ? dashboardStyles.stageProblem
      : bucket === "done"
        ? dashboardStyles.stageDone
        : bucket === "review"
          ? dashboardStyles.stageReview
          : bucket === "progress"
            ? dashboardStyles.stageProgress
            : dashboardStyles.stageTodo;

  return (
    <span
      className={`${dashboardStyles.stagePill} ${tone}`}
      aria-label={label}
      title={label}
    >
      {label}
    </span>
  );
}

function getProjectStage(project: {
  problemTaskCount: number;
  reviewTaskCount: number;
  workingTaskCount: number;
}) {
  if (project.problemTaskCount > 0) {
    return { bucket: "problem" as const, label: "Асуудалтай" };
  }

  if (project.reviewTaskCount > 0) {
    return { bucket: "review" as const, label: "Шалгагдаж буй" };
  }

  if (project.workingTaskCount > 0) {
    return { bucket: "progress" as const, label: "Явж буй" };
  }

  return { bucket: "todo" as const, label: "Төлөвлөсөн" };
}

export const dynamic = "force-dynamic";

export default async function ReportProjectPickerPage() {
  const session = await requireSession();
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);

  if (!canWriteReports) {
    redirect("/create");
  }

  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });

  const activeTasks = getScopedActiveReportTasks(snapshot, session);
  const activeProjects = buildReportProjectSummaries(snapshot.projects, activeTasks);

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
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              workerMode={workerMode}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Тайлангийн ажил сонгох"
              subtitle="Зөвхөн идэвхтэй ажлуудаас сонгоод дараагийн алхамд даалгавар руу орно"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={activeProjects.length}
              notificationNote={`${activeProjects.length} идэвхтэй ажил тайлангийн урсгалд нээлттэй байна`}
            />

            <section className={`${shellStyles.heroCard} ${styles.heroCard}`}>
              <span className={shellStyles.eyebrow}>Тайлан оруулах урсгал</span>
              <h1>Ажил сонгоно</h1>
              <p>
                Энэ дэлгэц дээр зөвхөн идэвхтэй ажил харагдана. Ажил дээр дарахад тухайн
                ажлын тайлан оруулах боломжтой даалгавруудын жагсаалт руу шууд орно.
              </p>

              <div className={styles.heroActions}>
                <Link href="/create" className={shellStyles.smallLink}>
                  Нэмэх төв рүү буцах
                </Link>
              </div>

              <div className={styles.heroMetaGrid}>
                <article className={styles.heroMetaCard}>
                  <span>Идэвхтэй ажил</span>
                  <strong>{activeProjects.length}</strong>
                  <small>Тайлангийн дараагийн алхам руу орох ажил</small>
                </article>
                <article className={styles.heroMetaCard}>
                  <span>Нээлттэй даалгавар</span>
                  <strong>{activeTasks.length}</strong>
                  <small>Тайлан хүлээж байгаа нийт даалгавар</small>
                </article>
              </div>
            </section>

            <section className={styles.pickerSection}>
              <div className={styles.pickerHeader}>
                <div>
                  <span className={shellStyles.eyebrow}>Идэвхтэй ажил</span>
                  <h2>Тайлан оруулах ажлаа сонго</h2>
                </div>
                <p>
                  Нэг ажлыг сонгосны дараа зөвхөн тэр ажлын доторх даалгаврууд харагдана.
                </p>
              </div>

              {activeProjects.length ? (
                <div className={styles.pickerList}>
                  {activeProjects.map((project) => {
                    const stage = getProjectStage(project);

                    return (
                      <Link
                        key={project.id}
                        href={`/create/report/${project.id}`}
                        className={styles.pickerCard}
                      >
                        <div className={styles.pickerCardTop}>
                          <div className={styles.pickerIdentity}>
                            <strong>{project.name}</strong>
                            <span>{project.departmentName}</span>
                            <small>Менежер: {project.manager}</small>
                          </div>
                          <StagePill label={stage.label} bucket={stage.bucket} />
                        </div>

                        <div className={styles.pickerMetaGrid}>
                          <div className={styles.pickerStat}>
                            <span>Нээлттэй даалгавар</span>
                            <strong>{project.taskCount}</strong>
                          </div>
                          <div className={styles.pickerStat}>
                            <span>Шалгагдаж буй</span>
                            <strong>{project.reviewTaskCount}</strong>
                          </div>
                          <div className={styles.pickerStat}>
                            <span>Явц</span>
                            <strong>{project.completion}%</strong>
                          </div>
                          <div className={styles.pickerStat}>
                            <span>Хугацаа</span>
                            <strong>{project.deadline}</strong>
                          </div>
                        </div>

                        <div className={styles.pickerCardFoot}>
                          <span className={styles.pickerFootNote}>
                            Явж буй {project.workingTaskCount} • Шалгагдаж буй{" "}
                            {project.reviewTaskCount} • Асуудалтай {project.problemTaskCount}
                          </span>
                          <span className={styles.pickerCta}>Даалгавар сонгох</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h3>Тайлан оруулах идэвхтэй ажил алга</h3>
                  <p>
                    Одоогоор нээлттэй ажил олдсонгүй. Дараа дахин шалгах эсвэл өөр урсгал
                    сонгож болно.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
