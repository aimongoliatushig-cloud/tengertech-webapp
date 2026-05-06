import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/app/actions";
import dashboardStyles from "@/app/page.module.css";
import styles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment } from "@/lib/dashboard-scope";
import { loadProjectDetail } from "@/lib/workspace";

import { ProjectTaskCreateModal } from "./project-task-create-modal";
import { ProjectTaskEditModal } from "./project-task-edit-modal";

type PageProps = {
  params: Promise<{
    projectId: string;
  }>;
  searchParams?: Promise<{
    status?: string | string[];
    error?: string | string[];
    notice?: string | string[];
    returnTo?: string | string[];
    quickAction?: string | string[];
  }>;
};

type TaskFilterKey = "all" | "todo" | "progress" | "review" | "overdue" | "done";
type QuickActionMode = "task" | "report" | "none";

const TASK_FILTERS: Array<{ key: TaskFilterKey; label: string }> = [
  { key: "all", label: "Бүгд" },
  { key: "todo", label: "Төлөвлөсөн" },
  { key: "progress", label: "Гүйцэтгэж байгаа" },
  { key: "review", label: "Хянаж байгаа" },
  { key: "overdue", label: "Хугацаа хэтэрсэн" },
  { key: "done", label: "Дууссан" },
];

function getParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function normalizeFilter(value: string): TaskFilterKey {
  return TASK_FILTERS.some((item) => item.key === value) ? (value as TaskFilterKey) : "all";
}

function normalizeQuickAction(value: string): QuickActionMode {
  if (value === "task" || value === "report") {
    return value;
  }

  return "none";
}

function getProgressWidth(value: number) {
  if (value <= 0) {
    return "0%";
  }

  return `${Math.max(Math.min(value, 100), 6)}%`;
}

function isImageAttachment(attachment: { mimetype: string }) {
  return attachment.mimetype.toLowerCase().startsWith("image/");
}

function isPdfAttachment(attachment: { mimetype: string; name: string }) {
  const mimetype = attachment.mimetype.toLowerCase();
  return mimetype === "application/pdf" || attachment.name.toLowerCase().endsWith(".pdf");
}

function resolveProjectStage(taskCounts: Record<TaskFilterKey, number>) {
  if (taskCounts.all > 0 && taskCounts.done === taskCounts.all) {
    return { bucket: "done", label: "Дууссан ажил" } as const;
  }

  if (taskCounts.review > 0) {
    return { bucket: "review", label: "Хянаж байгаа ажил" } as const;
  }

  if (taskCounts.progress > 0) {
    return { bucket: "progress", label: "Гүйцэтгэж байгаа ажил" } as const;
  }

  if (taskCounts.overdue > 0) {
    return { bucket: "problem", label: "Хугацаа хэтэрсэн ажил" } as const;
  }

  return { bucket: "todo", label: "Төлөвлөсөн ажил" } as const;
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

export default async function ProjectDetailPage({ params, searchParams }: PageProps) {
  const session = await requireSession();
  if (isWorkerOnly(session)) {
    redirect("/");
  }

  const resolvedParams = await params;
  const projectId = Number(resolvedParams.projectId);
  const query = (await searchParams) ?? {};
  const activeFilter = normalizeFilter(getParam(query.status));
  const errorMessage = getParam(query.error);
  const noticeMessage = getParam(query.notice);
  const returnTo = getParam(query.returnTo);
  const quickActionMode = normalizeQuickAction(getParam(query.quickAction));
  const safeReturnTo = returnTo.startsWith("/") ? returnTo : "";
  const masterMode = isMasterRole(session.role);
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  const activeMenuKey = safeReturnTo.startsWith("/tasks")
    ? "tasks"
    : masterMode
      ? "dashboard"
      : "projects";
  const fallbackReturnTo =
    quickActionMode !== "none" ? `/projects?quickAction=${quickActionMode}` : "/projects";
  const backHref = safeReturnTo || fallbackReturnTo;
  const backLabel = safeReturnTo.startsWith("/tasks")
    ? "Өнөөдрийн ажил руу буцах"
    : quickActionMode === "task"
      ? "Ажил сонгох руу буцах"
      : quickActionMode === "report"
        ? "Тайлангийн ажил сонгох руу буцах"
    : masterMode
      ? "Нэгжийн самбар руу буцах"
      : "Ажлууд руу буцах";

  let project;
  try {
    project = await loadProjectDetail(projectId, {
      login: session.login,
      password: session.password,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ажлыг уншихад алдаа гарлаа.";

    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <section className={styles.emptyState}>
            <h2>Ажил нээгдсэнгүй</h2>
            <p>{message}</p>
          </section>
        </div>
      </main>
    );
  }

  if (
    scopedDepartmentName &&
    filterByDepartment([{ departmentName: project.departmentName }], scopedDepartmentName).length === 0
  ) {
    redirect("/projects");
  }

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const taskCounts = {
    all: project.tasks.length,
    todo: project.tasks.filter(
      (task) => task.stageBucket === "todo" || task.stageBucket === "unknown",
    ).length,
    progress: project.tasks.filter((task) => task.stageBucket === "progress").length,
    review: project.tasks.filter((task) => task.stageBucket === "review").length,
    overdue: project.tasks.filter((task) => task.isOverdue).length,
    done: project.tasks.filter((task) => task.stageBucket === "done").length,
  } satisfies Record<TaskFilterKey, number>;

  const visibleTasks = project.tasks.filter((task) => {
    if (activeFilter === "all") {
      return true;
    }

    if (activeFilter === "todo") {
      return task.stageBucket === "todo" || task.stageBucket === "unknown";
    }
    if (activeFilter === "overdue") {
      return task.isOverdue;
    }

    return task.stageBucket === activeFilter;
  });
  const stageSummary = resolveProjectStage(taskCounts);
  const activeTaskCount = taskCounts.progress + taskCounts.review;
  const completionDegrees = Math.round((project.completion / 100) * 360);
  const taskBreakdown = [
    {
      key: "todo",
      label: "Төлөвлөсөн",
      count: taskCounts.todo,
      share: taskCounts.all ? Math.round((taskCounts.todo / taskCounts.all) * 100) : 0,
      toneClass: styles.projectHeroBreakdownTodo,
    },
    {
      key: "progress",
      label: "Гүйцэтгэж байгаа",
      count: taskCounts.progress,
      share: taskCounts.all ? Math.round((taskCounts.progress / taskCounts.all) * 100) : 0,
      toneClass: styles.projectHeroBreakdownProgress,
    },
    {
      key: "review",
      label: "Хянаж байгаа",
      count: taskCounts.review,
      share: taskCounts.all ? Math.round((taskCounts.review / taskCounts.all) * 100) : 0,
      toneClass: styles.projectHeroBreakdownReview,
    },
    {
      key: "overdue",
      label: "Хугацаа хэтэрсэн",
      count: taskCounts.overdue,
      share: taskCounts.all ? Math.round((taskCounts.overdue / taskCounts.all) * 100) : 0,
      toneClass: styles.projectHeroBreakdownProblem,
    },
    {
      key: "done",
      label: "Дууссан",
      count: taskCounts.done,
      share: taskCounts.all ? Math.round((taskCounts.done / taskCounts.all) * 100) : 0,
      toneClass: styles.projectHeroBreakdownDone,
    },
  ] as const;

  return (
    <main className={styles.shell}>
      <div className={styles.container} id="project-top">
        <div className={styles.contentWithMenu}>
          <aside className={styles.menuColumn}>
            <AppMenu
              active={activeMenuKey}
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title="Ажлын дэлгэрэнгүй"
              subtitle="Сонгосон ажлын гол хяналт ба даалгаврын урсгал"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={activeTaskCount}
              notificationNote={`${activeTaskCount} идэвхтэй даалгавар одоогоор явж байна`}
            />

            {errorMessage ? (
              <div className={`${styles.message} ${styles.errorMessage}`}>{errorMessage}</div>
            ) : null}
            {noticeMessage ? (
              <div className={`${styles.message} ${styles.noticeMessage}`}>{noticeMessage}</div>
            ) : null}

            <section className={styles.heroCard}>
              <span className={styles.eyebrow}>
                {quickActionMode === "task"
                  ? "Даалгавар нэмэх"
                  : quickActionMode === "report"
                    ? "Тайлан оруулах"
                    : masterMode
                      ? "Ажил нэмэх урсгал"
                      : "Ажлын даалгавар"}
              </span>
              <h1>{project.name}</h1>
              <p>
                {quickActionMode === "task"
                  ? "Энэ ажлыг сонгосон тул одоо шууд шинэ даалгавар нэмж болно."
                  : quickActionMode === "report"
                    ? "Энэ ажлын доторх даалгавруудаас нэгийг сонгоод тайлан оруулах цонх руу орно."
                  : masterMode
                  ? "Мастер хэрэглэгч энэ ажлын хүрээнд шинэ даалгавар нээж, өнөөдрийн урсгалаа тайлантай нь хамт удирдана."
                  : "Энэ дэлгэц дээр зөвхөн тухайн ажлын даалгаврууд харагдана. Тухайн даалгавар дээр дарж дараагийн дэлгэрэнгүй рүү орно."}
              </p>

              <div className={styles.projectHeroGrid}>
                <article className={styles.projectHeroFeatureCard}>
                  <div className={styles.projectHeroFeatureTop}>
                    <div>
                      <span className={styles.projectHeroKicker}>Гүйцэтгэлийн диаграм</span>
                      <h2>Ажлын ерөнхий зураглал</h2>
                    </div>
                    <StagePill label={stageSummary.label} bucket={stageSummary.bucket} />
                  </div>

                  <div className={styles.projectHeroFeatureBody}>
                    <div
                      className={styles.projectHeroRing}
                      aria-hidden
                      style={{
                        background: `conic-gradient(var(--brand-700) 0deg ${completionDegrees}deg, rgba(95, 117, 99, 0.12) ${completionDegrees}deg 360deg)`,
                      }}
                    >
                      <div className={styles.projectHeroRingInner}>
                        <strong>{project.completion}%</strong>
                        <span>Гүйцэтгэл</span>
                      </div>
                    </div>

                    <div className={styles.projectHeroBreakdown}>
                      {taskBreakdown.map((item) => (
                        <div key={item.key} className={styles.projectHeroBreakdownItem}>
                          <div className={styles.projectHeroBreakdownHead}>
                            <span>{item.label}</span>
                            <strong>{item.count}</strong>
                            <small>{item.share}%</small>
                          </div>
                          <div
                            className={`${styles.projectHeroBreakdownTrack} ${item.toneClass}`}
                            aria-hidden
                          >
                            <span style={{ width: getProgressWidth(item.share) }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>

                <div className={styles.projectHeroAside}>
                  <article className={styles.projectHeroInfoCard}>
                    <span className={styles.projectHeroCardLabel}>Хариуцсан хүрээ</span>
                    <div className={styles.projectHeroInfoGrid}>
                      <div>
                        <span>Алба нэгж</span>
                        <strong>{project.departmentName}</strong>
                      </div>
                      <div>
                        <span>Менежер</span>
                        <strong>{project.managerName || "Тодорхойгүй"}</strong>
                      </div>
                      <div>
                        <span>Эхлэх огноо</span>
                        <strong>{project.startDate}</strong>
                      </div>
                      <div>
                        <span>Дуусах огноо</span>
                        <strong>{project.deadline}</strong>
                      </div>
                    </div>
                  </article>

                  <article className={styles.projectHeroSignalCard}>
                    <span className={styles.projectHeroCardLabel}>Өнөөдрийн төвлөрөх зүйл</span>
                    <div className={styles.projectHeroSignalMain}>
                      <strong>{activeTaskCount}</strong>
                      <span>идэвхтэй даалгавар</span>
                    </div>
                    <div className={styles.projectHeroSignalRow}>
                      <div className={styles.projectHeroSignalPill}>
                        <span>Нийт</span>
                        <strong>{project.taskCount}</strong>
                      </div>
                      <div className={styles.projectHeroSignalPill}>
                        <span>Шалгах</span>
                        <strong>{project.reviewCount}</strong>
                      </div>
                      <div className={styles.projectHeroSignalPill}>
                        <span>Дууссан</span>
                        <strong>{taskCounts.done}</strong>
                      </div>
                    </div>
                  </article>
                </div>
              </div>

              <div className={styles.buttonRow}>
                <Link href={backHref} className={styles.smallLink}>
                  {backLabel}
                </Link>
                <a
                  href={`/api/workspace-report/export?type=project&id=${project.id}&format=word`}
                  className={styles.secondaryButton}
                >
                  Word тайлан татах
                </a>
                <a
                  href={`/api/workspace-report/export?type=project&id=${project.id}&format=pdf`}
                  className={styles.secondaryButton}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF хэвлэх
                </a>
              </div>
            </section>

            {project.description || project.attachments.length ? (
              <section className={`${styles.sectionCard} ${styles.projectDetailCompact}`}>
                <div className={styles.compactSectionHeader}>
                  <div>
                    <span className={styles.eyebrow}>Хавсралт ба тайлбар</span>
                    <h2>Ажлын дэлгэрэнгүй мэдээлэл</h2>
                  </div>
                  <span className={styles.compactCountPill}>
                    {project.attachments.length} файл
                  </span>
                </div>

                <div className={styles.projectDetailCompactGrid}>
                  <div className={styles.descriptionCard}>
                    <span className={styles.compactLabel}>Тайлбар</span>
                    <p>{project.description || "Тайлбар бүртгээгүй байна."}</p>
                  </div>

                  {project.attachments.length ? (
                    <details className={styles.attachmentDisclosure}>
                      <summary className={styles.attachmentDisclosureSummary}>
                        <span>Дэлгэрэнгүй хавсралт харах</span>
                        <small>{project.attachments.length} файл</small>
                      </summary>

                      <div className={styles.attachmentDetailPanel}>
                        <div className={styles.attachmentDetailDescription}>
                          <span className={styles.compactLabel}>Тайлбар</span>
                          <p>{project.description || "Тайлбар бүртгээгүй байна."}</p>
                        </div>

                        <div className={styles.attachmentPreviewList}>
                          {project.attachments.map((attachment) => {
                            if (isImageAttachment(attachment)) {
                              return (
                                <a
                                  key={attachment.id}
                                  href={attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.attachmentPreviewCard}
                                >
                                  <div className={styles.attachmentPreviewHeader}>
                                    <strong>{attachment.name}</strong>
                                    <small>{attachment.mimetype}</small>
                                  </div>
                                  <span className={styles.attachmentImageFrame}>
                                    <Image
                                      src={attachment.url}
                                      alt={attachment.name}
                                      fill
                                      unoptimized
                                      sizes="(max-width: 720px) 100vw, 50vw"
                                      className={styles.attachmentImagePreview}
                                    />
                                  </span>
                                </a>
                              );
                            }

                            if (isPdfAttachment(attachment)) {
                              return (
                                <div key={attachment.id} className={styles.attachmentPreviewCard}>
                                  <div className={styles.attachmentPreviewHeader}>
                                    <strong>{attachment.name}</strong>
                                    <a
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={styles.attachmentOpenLink}
                                    >
                                      Нээх
                                    </a>
                                  </div>
                                  <iframe
                                    src={attachment.url}
                                    title={attachment.name}
                                    className={styles.attachmentPdfPreview}
                                  />
                                </div>
                              );
                            }

                            return (
                              <a
                                key={attachment.id}
                                href={attachment.url}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.documentCard}
                              >
                                <strong>{attachment.name}</strong>
                                <small>{attachment.mimetype}</small>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    </details>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section className={masterMode ? styles.masterTaskBoard : styles.panelGrid}>
              <section className={styles.panel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span className={styles.eyebrow}>Ажлын самбар</span>
                    <h2>
                      {quickActionMode === "report"
                        ? "Тайлан оруулах даалгавар сонгох"
                        : masterMode
                          ? "Ажил дээрх өнөөдрийн урсгал"
                          : "Ажлын даалгаврууд"}
                    </h2>
                  </div>

                  {canCreateTasks && quickActionMode !== "report" ? (
                    <ProjectTaskCreateModal
                      action={createTaskAction}
                      projectId={project.id}
                      departmentName={project.departmentName}
                      departmentHeadName={project.managerName}
                      departmentHeadId={project.managerId}
                      deadline={project.deadline}
                      masterMode={masterMode}
                      departmentUserOptions={project.departmentUserOptions}
                      crewTeamOptions={project.crewTeamOptions}
                      allUnitOptions={project.allUnitOptions}
                      defaultUnitId={project.defaultUnitId}
                      allowedUnitSummary={project.allowedUnitSummary}
                      defaultOpen={Boolean(errorMessage) || quickActionMode === "task"}
                    />
                  ) : (
                    <p>
                      {quickActionMode === "report"
                        ? "Доорх даалгаврын аль нэгийг сонгоод тайлангийн цонх руу орно."
                        : masterMode
                        ? "Доорх даалгавар бүр дээр дарж тайлангийн урсгал руу орно."
                        : "Доорх даалгавар бүр дээр дарахад тухайн даалгаврын дэлгэрэнгүй нээгдэнэ."}
                    </p>
                  )}
                </div>

                <div className={styles.taskFilterRail}>
                  {TASK_FILTERS.map((filter) => {
                    const hrefParams = new URLSearchParams();
                    if (filter.key !== "all") {
                      hrefParams.set("status", filter.key);
                    }
                    if (quickActionMode !== "none") {
                      hrefParams.set("quickAction", quickActionMode);
                    }
                    if (safeReturnTo) {
                      hrefParams.set("returnTo", safeReturnTo);
                    }
                    const href = `/projects/${project.id}${
                      hrefParams.toString() ? `?${hrefParams.toString()}` : ""
                    }`;

                    return (
                      <Link
                        key={filter.key}
                        href={href}
                        className={`${styles.taskFilterChip} ${
                          activeFilter === filter.key ? styles.taskFilterChipActive : ""
                        }`}
                      >
                        <span>{filter.label}</span>
                        <strong>{taskCounts[filter.key]}</strong>
                      </Link>
                    );
                  })}
                </div>

                {visibleTasks.length ? (
                  <div className={styles.projectTaskFlowList}>
                    {visibleTasks.map((task, index) => {
                      const taskHref =
                        quickActionMode === "report"
                          ? `${task.href}?composer=report&returnTo=${encodeURIComponent(
                              `/projects/${project.id}?quickAction=report&returnTo=${encodeURIComponent(
                                backHref,
                              )}`,
                            )}`
                          : task.href;

                      return (
                        <article key={task.id} className={styles.projectTaskFlowItem}>
                          <Link href={taskHref} className={styles.projectTaskFlowLink}>
                          <span className={styles.projectTaskNumber}>{index + 1}</span>
                          <div className={styles.projectTaskMain}>
                            <div className={styles.projectTaskTitleRow}>
                            <div>
                              <h3>{task.name}</h3>
                              <p>
                                Хариуцсан ажилтан: {task.teamLeaderName}
                                {task.teamLeaderJobTitle ? ` · ${task.teamLeaderJobTitle}` : ""}
                              </p>
                            </div>
                            <StagePill label={task.stageLabel} bucket={task.stageBucket} />
                          </div>

                          <div className={styles.projectTaskMetaGrid}>
                            {task.quantitySummary ? (
                              <div className={styles.projectTaskQuantityCell}>
                                <strong>Хэмжээ:</strong>
                                {task.quantitySummaryLines.map((line) => (
                                  <span key={line}>{line}</span>
                                ))}
                              </div>
                            ) : null}
                            <span>Хугацаа: {task.deadline}</span>
                          </div>

                          <div className={styles.projectTaskProgressTrack}>
                            <span style={{ width: getProgressWidth(task.progress) }} />
                          </div>
                          </div>
                        </Link>

                        {canCreateTasks ? (
                          <div className={styles.projectTaskFlowActions}>
                            <ProjectTaskEditModal
                              action={updateTaskAction}
                              projectId={project.id}
                              taskId={task.id}
                              taskName={task.name}
                              deadlineValue={task.deadlineValue}
                            />
                            <form action={deleteTaskAction}>
                              <input type="hidden" name="project_id" value={project.id} />
                              <input type="hidden" name="task_id" value={task.id} />
                              <button type="submit" className={styles.dangerButton}>
                                Устгах
                              </button>
                            </form>
                          </div>
                        ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <h2>Даалгавар алга</h2>
                    <p>Энэ төлөв дээр харагдах даалгавар одоогоор алга байна.</p>
                  </div>
                )}
              </section>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
