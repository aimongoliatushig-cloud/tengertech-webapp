import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ClipboardList, MoreVertical } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import {
  createTaskReportAction,
  deleteTaskReportAction,
  markTaskDoneAction,
  postTaskMessageAction,
  returnTaskForChangesAction,
  submitTaskForReviewAction,
  updateTaskReportAction,
} from "@/app/actions";
import dashboardStyles from "@/app/page.module.css";
import shellStyles from "@/app/workspace.module.css";
import {
  canSubmitWorkspaceReport,
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
import { OfficialReportExportModal } from "./official-report-export-modal";
import { TaskReportActions } from "./task-report-actions";
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

function addQueryMessage(href: string, key: "error" | "notice", message: string) {
  const [pathname, queryString = ""] = href.split("?");
  const params = new URLSearchParams(queryString);
  params.set(key, message);
  return `${pathname}?${params.toString()}`;
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

function messageKindLabel(kind: string) {
  switch (kind) {
    case "note":
      return "Тэмдэглэл";
    case "system":
      return "Даалгавар";
    default:
      return "Зурвас";
  }
}

function formatReportText(value: string) {
  return value.replace(
    /(^|\n)(\d+\.\s*)(\d+(?:[.,]\d+)?)\s+([^\d\n]+?)(?=\n\d+\.|\n\n|$)/g,
    (_match, prefix: string, marker: string, quantity: string, unit: string) =>
      `${prefix}${marker}${unit.trim()} ${quantity}`,
  );
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
      ? "Тайлангийн даалгавар сонгох руу буцах"
      : masterMode
      ? "Өнөөдрийн ажил руу буцах"
      : useExecutiveLayout || workerMode
        ? "Даалгавар руу буцах"
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
      error instanceof Error ? error.message : "Даалгаврын мэдээлэл уншихад алдаа гарлаа.";

    if (message.includes("Даалгавар олдсонгүй") || message.toLowerCase().includes("not found")) {
      redirect(addQueryMessage(backHref, "error", "Даалгавар олдсонгүй эсвэл танд харах эрх алга."));
    }

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
                groupFlags={session.groupFlags}
                masterMode={masterMode}
                workerMode={workerMode}
                departmentScopeName={scopedDepartmentName}
              />
            </aside>

            <div className={shellStyles.pageContent}>
              <section className={styles.emptyState}>
                <h2>Даалгаврыг нээж чадсангүй</h2>
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
    const isAssignedToSession = directoryTask.assigneeIds?.includes(session.uid) ?? false;
    if (workerMode && !isAssignedToSession) {
      redirect("/tasks");
    }
    if (
      scopedDepartmentName &&
      !isAssignedToSession &&
      filterByDepartment([directoryTask], scopedDepartmentName).length === 0
    ) {
      redirect("/tasks");
    }
  }

  const hasSubmittedReport = task.reports.length > 0;
  const isAssignedToCurrentUser = task.assigneeUserIds.includes(session.uid);
  const hasOwnSubmittedReport = task.reports.some((report) => report.reporterId === session.uid);
  const canManageReview =
    !workerMode &&
    !isAssignedToCurrentUser &&
    !hasOwnSubmittedReport &&
    (canViewQualityCenter || canCreateTasks || masterMode);
  const canMarkDone =
    canManageReview && !["done"].includes(task.stageBucket) && (task.canMarkDone || hasSubmittedReport);
  const canSubmitForReview =
    canManageReview && task.canSubmitForReview && !hasSubmittedReport;
  const canReturnForChanges =
    canManageReview &&
    !["done"].includes(task.stageBucket) &&
    (task.canReturnForChanges || hasSubmittedReport);
  const canWriteReport =
    !task.reportsLocked &&
    task.stageBucket !== "review" &&
    task.stageBucket !== "done" &&
    hasCapability(session, "write_workspace_reports");
  const quantitySummary =
    task.quantityLines.length
      ? `${task.completedQuantity}/${task.plannedQuantity} нэгж`
      : task.plannedQuantity > 0 && task.measurementUnit
      ? `${task.completedQuantity}/${task.plannedQuantity} ${task.measurementUnit}`
      : "";
  const quantityLines = task.quantityLines.length
    ? task.quantityLines
    : quantitySummary
      ? [{ quantity: task.plannedQuantity, unit: task.measurementUnit }]
      : [];
  const canOpenReportComposer = canWriteReport && canSubmitWorkspaceReport(session);
  const primaryActionLabel = canMarkDone
    ? "Даалгаврыг дуусгах"
    : canSubmitForReview
      ? masterMode
        ? "Тайлан илгээх"
        : "Шалгалтад илгээх"
      : canOpenReportComposer
        ? "Гүйцэтгэлийн тайлан оруулах"
        : "Мэдээлэл харах";

  const showReportComposer = !canMarkDone && !canSubmitForReview && canOpenReportComposer;
  const procurementCreateHref = `/procurement/new?task_id=${task.id}`;
  const actionPanel = (
    <aside className={styles.actionCard} id="task-actions">
      <span className={styles.kicker}>Үндсэн үйлдэл</span>
      <strong className={styles.actionTitle}>{primaryActionLabel}</strong>

      <div className={styles.actionStack}>
        <Link href={procurementCreateHref} className={styles.secondaryButton}>
          Худалдан авах хүсэлт үүсгэх
        </Link>

        {canMarkDone ? (
          <form action={markTaskDoneAction}>
            <input type="hidden" name="task_id" value={task.id} />
            <button type="submit" className={styles.actionButton}>
              Даалгаврыг дуусгах
            </button>
          </form>
        ) : null}

        {canSubmitForReview ? (
          <form action={submitTaskForReviewAction}>
            <input type="hidden" name="task_id" value={task.id} />
            <button
              type="submit"
              className={canMarkDone ? styles.secondaryButton : styles.actionButton}
            >
              {masterMode ? "Тайлан илгээх" : "Шалгалтад илгээх"}
            </button>
          </form>
        ) : null}

        {showReportComposer ? (
          <TaskReportModal
            action={createTaskReportAction}
            taskId={task.id}
            defaultOpen={false}
            quantityOptional={task.quantityOptional}
            measurementUnit={task.measurementUnit}
            quantityLines={quantityLines}
            requireQuantity={Boolean(quantitySummary)}
            simpleMobile={workerMode}
            workItemName={task.name}
          />
        ) : null}
      </div>

      <div className={styles.helperPanel}>
        <small>Төлөв: {task.stageLabel}</small>
        <small>Явц: {task.progress}%</small>
        {quantityLines.length ? (
          <small>
            Хэмжээ:{" "}
            {quantityLines
              .map((line) =>
                `${line.completedQuantity ?? 0}/${line.quantity} ${line.unit}`.trim(),
              )
              .join(", ")}
          </small>
        ) : null}
      </div>

      {canReturnForChanges ? (
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
  );

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
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              workerMode={workerMode}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <div className={workerMode ? styles.workerDetailDesktopHeader : undefined}>
              <WorkspaceHeader
                title={task.name}
                subtitle={task.projectName}
                userName={session.name}
                roleLabel={getRoleLabel(session.role)}
                notificationCount={task.reports.length}
                notificationNote="Тайлан"
              />
            </div>

            {workerMode ? (
              <header className={styles.workerDetailMobileHeader}>
                <Link href={backHref} aria-label={backLabel} className={styles.workerDetailIconButton}>
                  <ArrowLeft size={22} strokeWidth={2.4} aria-hidden="true" />
                </Link>
                <strong>Даалгаврын дэлгэрэнгүй</strong>
                <Link href="/profile" aria-label="Тохиргоо" className={styles.workerDetailIconButton}>
                  <MoreVertical size={22} strokeWidth={2.4} aria-hidden="true" />
                </Link>
              </header>
            ) : null}

            {errorMessage ? (
              <div className={`${shellStyles.message} ${shellStyles.errorMessage}`}>{errorMessage}</div>
            ) : null}
            {noticeMessage ? (
              <div className={`${shellStyles.message} ${shellStyles.noticeMessage}`}>{noticeMessage}</div>
            ) : null}

            <section className={styles.summaryCard}>
              {workerMode ? (
                <div className={styles.workerDetailMobileHero}>
                  <div className={styles.workerDetailHeroIcon} aria-hidden="true">
                    <ClipboardList size={30} strokeWidth={2.3} />
                  </div>
                  <div className={styles.workerDetailHeroMeta}>
                    <span>ID: {task.id}</span>
                    <StagePill label={task.stageLabel} bucket={task.stageBucket} />
                  </div>
                </div>
              ) : null}
              <div className={styles.summaryTop}>
                <div className={styles.titleBlock}>
                  <span className={styles.kicker}>Даалгавар</span>
                  <h1>{task.name}</h1>
                  <span className={styles.taskProjectName}>{task.projectName}</span>
                </div>
                <div className={styles.heroActionGroup}>
                  <StagePill label={task.stageLabel} bucket={task.stageBucket} />
                  {showReportComposer ? (
                    <TaskReportModal
                      action={createTaskReportAction}
                      taskId={task.id}
                      defaultOpen={openReportComposer}
                      quantityOptional={task.quantityOptional}
                      measurementUnit={task.measurementUnit}
                      quantityLines={quantityLines}
                      variant="hero"
                      requireQuantity={Boolean(quantitySummary)}
                      simpleMobile={workerMode}
                      workItemName={task.name}
                    />
                  ) : null}
                </div>
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
                <a href="#task-chatter" className={styles.anchorLink}>
                  Зурвас
                </a>
                <OfficialReportExportModal
                  taskId={task.id}
                  items={task.reports.map((report) => ({
                    id: report.id,
                    title: task.name,
                    reporter: report.reporter,
                    submittedAt: report.submittedAt,
                    summary: report.summary || report.text,
                  }))}
                />
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
                  <strong>
                    {workerMode ? (
                      <CalendarDays size={18} strokeWidth={2.3} aria-hidden="true" />
                    ) : null}
                    {task.deadline}
                  </strong>
                </article>
                <article className={styles.heroStatCard}>
                  <span>Тайлан</span>
                  <strong>{task.reports.length}</strong>
                </article>
              </div>

              {quantityLines.length ? (
                <section className={styles.quantityOverview}>
                  <div>
                    <span className={styles.kicker}>Хэмжих нэгж</span>
                    <strong>Гүйцэтгэл / төлөвлөсөн хэмжээ</strong>
                  </div>
                  <div className={styles.quantityChipList}>
                    {quantityLines.map((line, index) => (
                      <span key={`${line.unit}-${index}`} className={styles.quantityChip}>
                        <strong>{line.completedQuantity ?? 0}/{line.quantity}</strong>
                        {line.unit}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}
            </section>

            <section className={styles.pageGrid}>
              <div className={styles.mainColumn}>
                {task.description ? (
                  <section className={styles.sectionCard}>
                    <div className={styles.sectionHead}>
                      <div>
                        <span className={styles.kicker}>Тайлбар</span>
                        <h2>Даалгаврын тайлбар</h2>
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
                  </div>

                  <div className={styles.inlineReportComposer}>
                    <div>
                      <strong>Гүйцэтгэлийн тайлан оруулах</strong>
                      <p>
                        Хийсэн ажлын тайлбар, тоо хэмжээ, зураг болон аудио нотолгоогоо эндээс
                        илгээнэ.
                      </p>
                    </div>
                    {canOpenReportComposer ? (
                      <TaskReportModal
                        action={createTaskReportAction}
                        taskId={task.id}
                        defaultOpen={false}
                        quantityOptional={task.quantityOptional}
                        measurementUnit={task.measurementUnit}
                        quantityLines={quantityLines}
                        requireQuantity={Boolean(quantitySummary)}
                        simpleMobile={workerMode}
                        workItemName={task.name}
                      />
                    ) : (
                      <span className={styles.reportUnavailable}>
                        Энэ төлөв дээр тайлан нэмэх эрх нээгдээгүй байна.
                      </span>
                    )}
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
                            {quantitySummary ? (
                              <StagePill
                                label={formatQuantityLabel(
                                  report.quantity,
                                  task.measurementUnit,
                                )}
                                bucket="progress"
                              />
                            ) : null}
                          </div>

                          <div className={styles.reportMediaMeta}>
                            <span className={styles.chip}>{report.imageCount} зураг</span>
                            <span className={styles.chip}>{report.audioCount} аудио</span>
                          </div>

                          <div className={styles.reportBody}>
                            <strong className={styles.reportBodyLabel}>Тайлбар</strong>
                            <p>{formatReportText(report.text || report.summary)}</p>
                          </div>

                          {report.reporterId === session.uid && canSubmitWorkspaceReport(session) ? (
                            <TaskReportActions
                              taskId={task.id}
                              reportId={report.id}
                              reportText={report.text || report.summary}
                              reportedQuantity={report.quantity}
                              images={report.images}
                              audios={report.audios}
                              updateAction={updateTaskReportAction}
                              deleteAction={deleteTaskReportAction}
                            />
                          ) : null}

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
                      <p>Одоогоор энэ даалгавар дээр тайлан бүртгэгдээгүй байна.</p>
                    </div>
                  )}
                </section>
                {actionPanel}
              </div>

              <div className={styles.sideColumn}>
                <aside className={styles.chatterCard}>
                  <div className={styles.chatterTop}>
                    <div>
                      <span className={styles.kicker}>Хариуцсан бүрэлдэхүүн</span>
                      <strong className={styles.actionTitle}>Баг ба ажилчид</strong>
                    </div>
                    <span className={styles.chatterCount}>{task.assignees.length}</span>
                  </div>

                  <div className={styles.helperPanel}>
                    <small>Ахлагч: {task.teamLeaderName || "Сонгоогүй"}</small>
                    {task.crewTeamName ? <small>Баг: {task.crewTeamName}</small> : null}
                  </div>

                  {task.assignees.length ? (
                    <div className={styles.messageTimeline}>
                      {task.assignees.map((assignee) => (
                        <article key={assignee} className={styles.messageItem}>
                          <div className={styles.messageAvatar} aria-hidden="true">
                            {assignee.slice(0, 1)}
                          </div>
                          <div className={styles.messageContent}>
                            <div className={styles.messageMeta}>
                              <strong>{assignee}</strong>
                            </div>
                            <span className={styles.messageKind}>Гүйцэтгэгч</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.chatterEmpty}>
                      Энэ даалгаварт хариуцсан ажилтан эсвэл багийн гишүүд хараахан оноогдоогүй байна.
                    </div>
                  )}
                </aside>

                <aside className={styles.chatterCard} id="task-chatter">
                  <div className={styles.chatterTop}>
                    <div>
                      <span className={styles.kicker}>Odoo chatter</span>
                      <strong className={styles.actionTitle}>Зурвас ба тэмдэглэл</strong>
                    </div>
                    <span className={styles.chatterCount}>{task.messages.length}</span>
                  </div>

                  <form action={postTaskMessageAction} className={styles.chatterComposer}>
                    <input type="hidden" name="task_id" value={task.id} />
                    <label htmlFor="message_body" className={styles.modalField}>
                      <span>Даалгавар дээр үлдээх текст</span>
                      <textarea
                        id="message_body"
                        name="message_body"
                        placeholder="Зурвас эсвэл дотоод тэмдэглэл бичнэ үү"
                        rows={4}
                      />
                    </label>
                    <div className={styles.messageAttachmentInputs}>
                      <label>
                        <span>Зураг хавсаргах</span>
                        <input name="message_images" type="file" accept="image/*" multiple />
                      </label>
                      <label>
                        <span>Аудио бичлэг / файл</span>
                        <input name="message_audio" type="file" accept="audio/*" capture />
                      </label>
                    </div>
                    <div className={styles.chatterActions}>
                      <button
                        type="submit"
                        name="message_kind"
                        value="message"
                        className={styles.actionButton}
                      >
                        Зурвас илгээх
                      </button>
                      <button
                        type="submit"
                        name="message_kind"
                        value="note"
                        className={styles.secondaryButton}
                      >
                        Тэмдэглэл хөтлөх
                      </button>
                    </div>
                  </form>

                  {task.messages.length ? (
                    <div className={styles.messageTimeline}>
                      {task.messages.map((message) => (
                        <article
                          key={message.id}
                          className={`${styles.messageItem} ${
                            message.kind === "note"
                              ? styles.messageItemNote
                              : message.kind === "system"
                                ? styles.messageItemSystem
                                : ""
                          }`}
                        >
                          <div className={styles.messageAvatar} aria-hidden="true">
                            {message.author.slice(0, 1)}
                          </div>
                          <div className={styles.messageContent}>
                            <div className={styles.messageMeta}>
                              <strong>{message.author}</strong>
                              <span>{message.postedAt}</span>
                            </div>
                            <span className={styles.messageKind}>
                              {messageKindLabel(message.kind)}
                            </span>
                            {message.body ? <p>{message.body}</p> : null}
                            {message.attachments.length ? (
                              <div className={styles.messageAttachments}>
                                {message.attachments.map((attachment) =>
                                  attachment.mimetype.startsWith("image/") ? (
                                    <a
                                      key={attachment.id}
                                      href={attachment.url}
                                      className={styles.messageImageLink}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <Image
                                        src={attachment.url}
                                        alt={attachment.name}
                                        width={180}
                                        height={120}
                                      />
                                    </a>
                                  ) : attachment.mimetype.startsWith("audio/") ? (
                                    <div key={attachment.id} className={styles.messageAudioItem}>
                                      <strong>{attachment.name}</strong>
                                      <audio controls preload="none" src={attachment.url} />
                                    </div>
                                  ) : (
                                    <a
                                      key={attachment.id}
                                      href={attachment.url}
                                      className={styles.messageFileLink}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {attachment.name}
                                    </a>
                                  ),
                                )}
                              </div>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.chatterEmpty}>
                      Энэ даалгавар дээр зурвас, тэмдэглэл хараахан алга.
                    </div>
                  )}
                </aside>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
