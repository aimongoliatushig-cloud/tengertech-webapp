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

import { buildReportProjectSummaries, getScopedActiveReportTasks } from "../report-flow";
import styles from "../report-picker.module.css";

type PageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

function StatusBadge({
  statusKey,
  statusLabel,
}: {
  statusKey: "planned" | "working" | "review" | "verified" | "problem";
  statusLabel: string;
}) {
  return (
    <span className={`${dashboardStyles.statusBadge} ${dashboardStyles[`status${statusKey}`]}`}>
      {statusLabel}
    </span>
  );
}

export const dynamic = "force-dynamic";

export default async function ReportTaskPickerPage({ params }: PageProps) {
  const session = await requireSession();
  const resolvedParams = await params;
  const projectId = Number(resolvedParams.projectId);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);

  if (!canWriteReports || !Number.isFinite(projectId) || projectId <= 0) {
    redirect("/create/report");
  }

  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });

  const activeTasks = getScopedActiveReportTasks(snapshot, session);
  const activeProjects = buildReportProjectSummaries(snapshot.projects, activeTasks);
  const project = activeProjects.find((item) => item.id === projectId);

  if (!project) {
    redirect("/create/report");
  }

  const projectTasks = activeTasks.filter((task) => task.projectName === project.name);
  const returnTo = `/create/report/${project.id}`;

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
              title="Тайлангийн ажилбар сонгох"
              subtitle="Сонгосон ажлын доторх ажилбаруудаас тайлангийн урсгал руу орно"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={projectTasks.length}
              notificationNote={`${projectTasks.length} ажилбар тайлан оруулах боломжтой байна`}
            />

            <section className={`${shellStyles.heroCard} ${styles.heroCard}`}>
              <span className={shellStyles.eyebrow}>Тайлангийн ажилбар</span>
              <h1>{project.name}</h1>
              <p>
                Доорх ажилбарын аль нэгийг сонгоход тайлангийн цонх шууд нээгдэнэ. Энэ
                дэлгэц дээр зөвхөн тайлан оруулах боломжтой ажилбарууд харагдана.
              </p>

              <div className={styles.heroActions}>
                <Link href="/create/report" className={shellStyles.smallLink}>
                  Ажил сонгох руу буцах
                </Link>
              </div>

              <div className={styles.heroMetaGrid}>
                <article className={styles.heroMetaCard}>
                  <span>Алба нэгж</span>
                  <strong>{project.departmentName}</strong>
                  <small>Тайлан оруулах хүрээ</small>
                </article>
                <article className={styles.heroMetaCard}>
                  <span>Ажилбар</span>
                  <strong>{projectTasks.length}</strong>
                  <small>Энэ ажлын идэвхтэй ажилбар</small>
                </article>
              </div>
            </section>

            <section className={styles.pickerSection}>
              <div className={styles.pickerHeader}>
                <div>
                  <span className={shellStyles.eyebrow}>Ажилбарын жагсаалт</span>
                  <h2>Тайлан оруулах ажилбараа сонго</h2>
                </div>
                <p>
                  Ажилбар дээр дарахад гүйцэтгэлийн тайлангийн цонх автоматаар нээгдэнэ.
                </p>
              </div>

              {projectTasks.length ? (
                <div className={styles.pickerList}>
                  {projectTasks.map((task) => (
                    <Link
                      key={task.id}
                      href={`${task.href}?composer=report&returnTo=${encodeURIComponent(returnTo)}`}
                      className={styles.pickerCard}
                    >
                      <div className={styles.pickerCardTop}>
                        <div className={styles.pickerIdentity}>
                          <strong>{task.name}</strong>
                          <span>{task.departmentName}</span>
                          <small>Ахлагч: {task.leaderName}</small>
                        </div>
                        <StatusBadge statusKey={task.statusKey} statusLabel={task.statusLabel} />
                      </div>

                      <div className={styles.pickerMetaGrid}>
                        <div className={styles.pickerStat}>
                          <span>Явц</span>
                          <strong>{task.progress}%</strong>
                        </div>
                        <div className={styles.pickerStat}>
                          <span>Хугацаа</span>
                          <strong>{task.deadline}</strong>
                        </div>
                        <div className={styles.pickerStat}>
                          <span>Төрөл</span>
                          <strong>{task.operationTypeLabel}</strong>
                        </div>
                        <div className={styles.pickerStat}>
                          <span>Тоо хэмжээ</span>
                          <strong>
                            {task.completedQuantity}/{task.plannedQuantity} {task.measurementUnit}
                          </strong>
                        </div>
                      </div>

                      <div className={styles.pickerCardFoot}>
                        <span className={styles.pickerFootNote}>
                          Төлөв: {task.stageLabel} • Тэргүүлэх түвшин: {task.priorityLabel}
                        </span>
                        <span className={styles.pickerCta}>Тайлан оруулах</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <h3>Ажилбар олдсонгүй</h3>
                  <p>
                    Энэ ажлын идэвхтэй ажилбар одоогоор алга байна. Өөр ажлыг сонгож
                    дахин орж үзнэ үү.
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
