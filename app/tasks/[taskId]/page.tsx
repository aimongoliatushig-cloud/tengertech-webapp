import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import {
  createTaskReportAction,
  markTaskDoneAction,
  returnTaskForChangesAction,
  submitTaskForReviewAction,
} from "@/app/actions";
import dashboardStyles from "@/app/page.module.css";
import shellStyles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment } from "@/lib/dashboard-scope";
import { loadMunicipalSnapshot } from "@/lib/odoo";
import { loadTaskDetail } from "@/lib/workspace";

import styles from "./task-detail.module.css";
import { TaskReportModal } from "./task-report-modal";

type PageProps = {
  params: Promise<{
    taskId: string;
  }>;
  searchParams?: Promise<{
    error?: string | string[];
    notice?: string | string[];
    returnTo?: string | string[];
    composer?: string | string[];
  }>;
};

function getMessage(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function StagePill({ label, bucket }: { label: string; bucket: string }) {
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

function formatQuantityLabel(value: number, unit: string) {
  return `${value} ${unit}`.trim();
}

export default async function TaskDetailPage({ params, searchParams }: PageProps) {
  const session = await requireSession();
  const resolvedParams = await params;
  const taskId = Number(resolvedParams.taskId);
  const query = (await searchParams) ?? {};
  const errorMessage = getMessage(query.error);
  const noticeMessage = getMessage(query.notice);
  const returnTo = getMessage(query.returnTo);
  const composer = getMessage(query.composer);
  const safeReturnTo = returnTo.startsWith("/") ? returnTo : "";
  const openReportComposer = composer === "report";
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  const fromCreateFlow = safeReturnTo.startsWith("/create");
  const useExecutiveLayout = !masterMode && safeReturnTo.startsWith("/tasks");
  const activeMenuKey = fromCreateFlow
    ? "new-project"
    : safeReturnTo.startsWith("/tasks")
    ? "tasks"
    : masterMode
      ? "dashboard"
      : "projects";
  const backHref = safeReturnTo || (workerMode || masterMode ? "/tasks" : "/projects");
  const backLabel =
    fromCreateFlow
      ? "Тайлангийн ажилбар сонгох руу буцах"
      : masterMode
      ? "Өнөөдрийн ажил руу буцах"
      : useExecutiveLayout || workerMode
        ? "Ажилбар руу буцах"
        : "Ажил руу буцах";

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");

  let task;
  try {
    task = await loadTaskDetail(taskId, {
      login: session.login,
      password: session.password,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ажилбарын мэдээлэл уншихад алдаа гарлаа.";

    return (
      <main className={shellStyles.shell}>
        <div className={shellStyles.container}>
          <div className={shellStyles.contentWithMenu}>
            <aside className={shellStyles.menuColumn}>
              <AppMenu
                active={activeMenuKey}
                variant={useExecutiveLayout ? "executive" : "default"}
                canCreateProject={canCreateProject}
                canCreateTasks={canCreateTasks}
                canWriteReports={canWriteReports}
                canViewQualityCenter={canViewQualityCenter}
                canUseFieldConsole={canUseFieldConsole}
                userName={session.name}
                roleLabel={getRoleLabel(session.role)}
                masterMode={masterMode}
                workerMode={workerMode}
                departmentScopeName={scopedDepartmentName}
              />
            </aside>

            <div className={shellStyles.pageContent}>
              <section className={styles.emptyState}>
                <h2>Ажилбарыг нээж чадсангүй</h2>
                <p>{message}</p>
                <div className={shellStyles.buttonRow}>
                  <Link href={backHref} className={shellStyles.smallLink}>
                    {backLabel}
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (workerMode || scopedDepartmentName) {
    const snapshot = await loadMunicipalSnapshot({
      login: session.login,
      password: session.password,
    });
    const directoryTask = snapshot.taskDirectory.find((item) => item.id === task.id);

    if (!directoryTask) {
      redirect("/tasks");
    }
    if (workerMode && !directoryTask.assigneeIds?.includes(session.uid)) {
      redirect("/tasks");
    }
    if (
      scopedDepartmentName &&
      filterByDepartment([directoryTask], scopedDepartmentName).length === 0
    ) {
      redirect("/tasks");
    }
  }

  const canWriteReport = !task.reportsLocked && hasCapability(session, "write_workspace_reports");
  const quantitySummary = `${task.completedQuantity}/${task.plannedQuantity} ${task.measurementUnit}`;
  const primaryActionLabel = task.canMarkDone
    ? "Ажилбарыг дуусгах"
    : task.canSubmitForReview
      ? masterMode
        ? "Тайлан илгээх"
        : "Шалгалтад илгээх"
      : canWriteReport
        ? "Гүйцэтгэлийн тайлан оруулах"
        : "Мэдээлэл харах";

  const helperText = task.canMarkDone
    ? "Ажилбар бүрэн дууссан бол дуусгах товчоор дараагийн шат руу шилжүүлнэ."
    : task.canSubmitForReview
      ? masterMode
        ? "Өдрийн тайлангаа багцлаад илгээхэд энэ ажилбарын тайлангийн урсгал дараагийн шат руу орно."
        : "Тайлангаа шалгаад баталгаажуулалт руу илгээж болно."
      : canWriteReport
        ? "Odoo ERP дээрхтэй адил гүйцэтгэлийн тайлангийн маягтаар тайлбар, зураг, аудиогоо нэг дороос оруулна."
        : "Одоогоор энэ ажилбарын мэдээллийг харах горим нээлттэй байна.";

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container} id="task-top">
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active={activeMenuKey}
              variant={useExecutiveLayout ? "executive" : "default"}
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              masterMode={masterMode}
              workerMode={workerMode}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Ажилбарын дэлгэрэнгүй"
              subtitle="Сонгосон ажилбарын тайлан ба гүйцэтгэлийн урсгал"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={task.reports.length}
              notificationNote={`${task.reports.length} тайлан энэ ажилбарт бүртгэгдсэн`}
            />

            {errorMessage ? (
              <div className={`${shellStyles.message} ${shellStyles.errorMessage}`}>{errorMessage}</div>
            ) : null}
            {noticeMessage ? (
              <div className={`${shellStyles.message} ${shellStyles.noticeMessage}`}>{noticeMessage}</div>
            ) : null}

            <section className={styles.summaryCard}>
              <div className={styles.summaryTop}>
                <div className={styles.titleBlock}>
                  <span className={styles.kicker}>Ажилбарын дэлгэрэнгүй</span>
                  <h1>{task.name}</h1>
                  <p className={styles.lead}>
                    {task.projectName} ажлын энэ ажилбарын төлөв, хариуцсан баг, тайлангийн урсгалыг
                    нэг дэлгэц дээр цэвэрхэн харуулна.
                  </p>
                </div>
                <StagePill label={task.stageLabel} bucket={task.stageBucket} />
              </div>

              <div className={styles.anchorRow}>
                <Link href={backHref} className={styles.anchorLink}>
                  {backLabel}
                </Link>
                <a href="#task-actions" className={styles.anchorLink}>
                  Үндсэн үйлдэл
                </a>
                <a href="#task-reports" className={styles.anchorLink}>
                  Тайлан
                </a>
              </div>

              <div className={styles.heroStats}>
                <article className={styles.heroStatCard}>
                  <span>Төлөв</span>
                  <strong>{task.stageLabel}</strong>
                </article>
                <article className={styles.heroStatCard}>
                  <span>Явц</span>
                  <strong>{task.progress}%</strong>
                </article>
                <article className={styles.heroStatCard}>
                  <span>Хугацаа</span>
                  <strong>{task.deadline}</strong>
                </article>
                <article className={styles.heroStatCard}>
                  <span>Тайлан</span>
                  <strong>{task.reports.length}</strong>
                </article>
              </div>
            </section>

            <section className={styles.pageGrid}>
              <div className={styles.mainColumn}>
                <section className={styles.sectionCard} id="task-info">
                  <div className={styles.sectionHead}>
                    <div>
                      <span className={styles.kicker}>Товч мэдээлэл</span>
                      <h2>Ажилбарын гол мэдээлэл</h2>
                    </div>
                    <p>Хамгийн хэрэгтэй үзүүлэлтүүдийг эхэнд нь харуулна.</p>
                  </div>

                  <div className={styles.infoGrid}>
                    <article className={styles.infoCard}>
                      <span>Ажил</span>
                      <strong>{task.projectName}</strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Мастер</span>
                      <strong>{task.teamLeaderName}</strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Төлөвлөсөн хэмжээ</span>
                      <strong>
                        {formatQuantityLabel(
                          task.plannedQuantity,
                          task.measurementUnit,
                        )}
                      </strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Гүйцэтгэсэн хэмжээ</span>
                      <strong>
                        {formatQuantityLabel(
                          task.completedQuantity,
                          task.measurementUnit,
                        )}
                      </strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Үлдэгдэл</span>
                      <strong>
                        {formatQuantityLabel(
                          task.remainingQuantity,
                          task.measurementUnit,
                        )}
                      </strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Эрэмбэ</span>
                      <strong>{task.priorityLabel}</strong>
                    </article>
                  </div>
                </section>

                <section className={styles.sectionCard}>
                  <div className={styles.sectionHead}>
                    <div>
                      <span className={styles.kicker}>Хариуцсан хүмүүс</span>
                      <h2>Багийн бүрэлдэхүүн</h2>
                    </div>
                  </div>

                  <div className={styles.chipRow}>
                    {task.assignees.length ? (
                      task.assignees.map((name) => (
                        <span key={name} className={styles.chip}>
                          {name}
                        </span>
                      ))
                    ) : (
                      <span className={styles.chip}>Хүн оноогоогүй</span>
                    )}
                  </div>
                </section>

                {task.description ? (
                  <section className={styles.sectionCard}>
                    <div className={styles.sectionHead}>
                      <div>
                        <span className={styles.kicker}>Тайлбар</span>
                        <h2>Ажилбарын тайлбар</h2>
                      </div>
                    </div>

                    <div className={styles.descriptionCard}>{task.description}</div>
                  </section>
                ) : null}

                <section className={styles.sectionCard} id="task-reports">
                  <div className={styles.sectionHead}>
                    <div>
                      <span className={styles.kicker}>Гүйцэтгэлийн тайлан</span>
                      <h2>Гүйцэтгэлийн тайлангууд</h2>
                    </div>
                    <p>Илгээсэн тайлан, зураг, аудиог доороос харна.</p>
                  </div>

                  {task.reports.length ? (
                    <div className={styles.reportList}>
                      {task.reports.map((report) => (
                        <article key={report.id} className={styles.reportCard}>
                          <div className={styles.reportCardTop}>
                            <div className={styles.metaGroup}>
                              <strong>{report.reporter}</strong>
                              <small>{report.submittedAt}</small>
                            </div>
                            <StagePill
                              label={formatQuantityLabel(
                                report.quantity,
                                task.measurementUnit,
                              )}
                              bucket="progress"
                            />
                          </div>

                          <div className={styles.reportMediaMeta}>
                            <span className={styles.chip}>{report.imageCount} зураг</span>
                            <span className={styles.chip}>{report.audioCount} аудио</span>
                          </div>

                          <div className={styles.reportBody}>
                            <strong className={styles.reportBodyLabel}>Тайлбар</strong>
                            <p>{report.text || report.summary}</p>
                          </div>

                          {report.images.length ? (
                            <div className={dashboardStyles.reportImageGrid}>
                              {report.images.map((image) => (
                                <a
                                  key={image.id}
                                  href={image.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={dashboardStyles.reportImageLink}
                                >
                                  <Image
                                    src={image.url}
                                    alt={`${task.name} - ${image.name}`}
                                    className={dashboardStyles.reportImage}
                                    width={320}
                                    height={240}
                                    unoptimized
                                  />
                                </a>
                              ))}
                            </div>
                          ) : null}

                          {report.audios.length ? (
                            <div className={dashboardStyles.reportAudioList}>
                              {report.audios.map((audio) => (
                                <div key={audio.id} className={dashboardStyles.reportAudioCard}>
                                  <strong>{audio.name}</strong>
                                  <audio
                                    controls
                                    preload="none"
                                    src={audio.url}
                                    className={dashboardStyles.reportAudioPlayer}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      <h2>Гүйцэтгэлийн тайлан алга</h2>
                      <p>Одоогоор энэ ажилбар дээр тайлан бүртгэгдээгүй байна.</p>
                    </div>
                  )}
                </section>
              </div>

              <div className={styles.sideColumn}>
                <aside className={`${styles.actionCard} ${styles.stickyCard}`} id="task-actions">
                  <span className={styles.kicker}>Үндсэн үйлдэл</span>
                  <strong className={styles.actionTitle}>{primaryActionLabel}</strong>
                  <p className={styles.actionLead}>{helperText}</p>

                  <div className={styles.actionStack}>
                    {task.canMarkDone ? (
                      <form action={markTaskDoneAction}>
                        <input type="hidden" name="task_id" value={task.id} />
                        <button type="submit" className={styles.actionButton}>
                          Ажилбарыг дуусгах
                        </button>
                      </form>
                    ) : null}

                    {task.canSubmitForReview ? (
                      <form action={submitTaskForReviewAction}>
                        <input type="hidden" name="task_id" value={task.id} />
                        <button
                          type="submit"
                          className={task.canMarkDone ? styles.secondaryButton : styles.actionButton}
                        >
                          {masterMode ? "Тайлан илгээх" : "Шалгалтад илгээх"}
                        </button>
                      </form>
                    ) : null}

                    {!task.canMarkDone && !task.canSubmitForReview && canWriteReport ? (
                      <TaskReportModal
                        action={createTaskReportAction}
                        taskId={task.id}
                        defaultOpen={openReportComposer}
                        quantityOptional={task.quantityOptional}
                        measurementUnit={task.measurementUnit}
                      />
                    ) : null}
                  </div>

                  <div className={styles.helperPanel}>
                    <small>Төлөв: {task.stageLabel}</small>
                    <small>Явц: {task.progress}%</small>
                    <small>Хэмжээ: {quantitySummary}</small>
                  </div>

                  {task.canReturnForChanges ? (
                    <form action={returnTaskForChangesAction} className={styles.returnBox}>
                      <input type="hidden" name="task_id" value={task.id} />
                      <label htmlFor="return_reason">Засвар шаардах шалтгаан</label>
                      <textarea
                        id="return_reason"
                        name="return_reason"
                        placeholder="Юуг засах ёстойг товч тодорхой бичнэ үү"
                        required
                      />
                      <button type="submit" className={styles.warningButton}>
                        Засвар нэхэж буцаах
                      </button>
                    </form>
                  ) : null}
                </aside>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
