import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { createTaskAction, createTaskReportAction, deleteProjectAction, updateProjectAction } from "@/app/actions";
import dashboardStyles from "@/app/page.module.css";
import styles from "@/app/workspace.module.css";
import {
  hasCapability,
  canSubmitWorkspaceReport,
  canDeleteWorkspaceItems,
  isMasterRole,
  isWorkerOnly,
  requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment } from "@/lib/dashboard-scope";
import { loadFleetVehicleBoard } from "@/lib/odoo";
import { isProcurementSetupError, loadProcurementRequests } from "@/lib/procurement";
import { isWorkspaceReportReviewerRole } from "@/lib/task-report-review-access";
import {
  hasProjectTaskLeader,
  loadDepartmentOptions,
  loadGarbagePointOptions,
  loadGarbageSubdistrictOptions,
  loadProjectDetail,
  loadProjectManagerOptions,
} from "@/lib/workspace";

import { ProjectTaskCreateModal } from "./project-task-create-modal";
import { ProjectTaskCreateForm } from "./project-task-create-form";
import { ProjectEditModal } from "./project-edit-modal";
import { TaskReportModal } from "@/app/tasks/[taskId]/task-report-modal";

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

export const dynamic = "force-dynamic";

type TaskFilterKey = "all" | "todo" | "review" | "overdue" | "done";
type QuickActionMode = "task" | "report" | "none";

const TASK_FILTERS: Array<{ key: TaskFilterKey; label: string }> = [
  { key: "all", label: "Бүгд" },
  { key: "todo", label: "Төлөвлөсөн" },
  { key: "review", label: "Хянаж байгаа" },
  { key: "done", label: "Дууссан" },
  { key: "overdue", label: "Хугацаа хэтэрсэн" },
];
const AUTO_BASE_HEAD_NAME_TOKENS = ["ц.эрдэнэбат", "ц эрдэнэбат", "эрдэнэбат"];

function normalizeProjectText(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

function isAutoBaseGarbageDepartmentName(value?: string | null) {
  const normalized = normalizeProjectText(value);
  const hasGarbageTransport =
    normalized.includes("хог") &&
    (normalized.includes("тээвэр") || normalized.includes("teever"));
  return (
    hasGarbageTransport ||
    (normalized.includes("авто") && normalized.includes("хог"))
  );
}

function isPreferredAutoBaseHeadName(value?: string | null) {
  const normalized = normalizeProjectText(value);
  return AUTO_BASE_HEAD_NAME_TOKENS.some((token) => normalized.includes(normalizeProjectText(token)));
}

function getParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function normalizeFilter(value: string): TaskFilterKey {
  if (value === "progress") {
    return "todo";
  }
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
    return { bucket: "done", label: "Дууссан" } as const;
  }

  if (taskCounts.review > 0) {
    return { bucket: "review", label: "Хянаж байгаа" } as const;
  }

  if (taskCounts.overdue > 0) {
    return { bucket: "problem", label: "Хянаж байгаа" } as const;
  }

  return { bucket: "todo", label: "Төлөвлөсөн" } as const;
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

function taskCardToneClass(bucket: string) {
  switch (bucket) {
    case "problem":
      return styles.projectTaskFlowItemProblem;
    case "done":
      return styles.projectTaskFlowItemDone;
    case "review":
      return styles.projectTaskFlowItemReview;
    case "progress":
      return styles.projectTaskFlowItemProgress;
    default:
      return styles.projectTaskFlowItemTodo;
  }
}

function isPhotoFirstReportTask(operationType: string) {
  return operationType === "garbage" || operationType === "garbage_seasonal" || operationType === "road_area_cleaning";
}

function isRoadAreaCleaningProject(operationType: string) {
  return operationType === "road_area_cleaning" || operationType === "street_cleaning";
}

function isRoadAreaCleaningTask(task: { name: string; operationType: string }) {
  const normalizedName = task.name.trim().toLowerCase();
  return (
    isRoadAreaCleaningProject(task.operationType) ||
    normalizedName.includes("явган зам") ||
    normalizedName.includes("замын нүх") ||
    normalizedName.includes("хогийн сав") ||
    normalizedName.includes("жижиг хог") ||
    normalizedName.includes("шарилж") ||
    normalizedName.includes("зарын хуудас")
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
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };

  let project;
  try {
    project = await loadProjectDetail(projectId, connectionOverrides);
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
  if (masterMode && session.role !== "senior_master") {
    const currentUserId = String(session.uid);
    const managesProject = project.managerId !== null && String(project.managerId) === currentUserId;
    const leadsProjectTask =
      !managesProject && (await hasProjectTaskLeader(project.id, session.uid, connectionOverrides));

    if (!managesProject && !leadsProjectTask) {
      redirect("/projects");
    }
  }

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canDeleteWorkspace = canDeleteWorkspaceItems(session);
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const canOpenQuickReport = canWriteReports && canSubmitWorkspaceReport(session);
  const canEditProject = canCreateProject;
  const canReviewProjectReports = isWorkspaceReportReviewerRole(
    session,
    Boolean(
      scopedDepartmentName &&
        filterByDepartment([{ departmentName: project.departmentName }], scopedDepartmentName).length,
    ),
  );
  const isGarbageRouteProject = project.operationType === "garbage";
  const isRoadAreaCleaning =
    isRoadAreaCleaningProject(project.operationType) || project.tasks.some((task) => isRoadAreaCleaningTask(task));
  const canShowTaskCreateComposer = canCreateTasks && quickActionMode !== "report";
  const shouldLoadTaskCreateOptions = canShowTaskCreateComposer;
  const [projectManagerOptions, projectDepartmentOptions] = await Promise.all([
    canEditProject || shouldLoadTaskCreateOptions
      ? loadProjectManagerOptions(connectionOverrides)
      : Promise.resolve([]),
    canEditProject ? loadDepartmentOptions(connectionOverrides) : Promise.resolve([]),
  ]);
  const projectEditManagerOptions =
    project.managerId && !projectManagerOptions.some((manager) => manager.id === project.managerId)
      ? [
          {
            id: project.managerId,
            name: project.managerName,
            login: "",
            role: "project_manager",
            departmentName: project.departmentName,
            jobTitle: project.managerJobTitle,
          },
          ...projectManagerOptions,
        ]
      : projectManagerOptions;
  const projectEditDepartmentOptions =
    project.departmentId && !projectDepartmentOptions.some((department) => department.id === project.departmentId)
      ? [
          {
            id: project.departmentId,
            name: project.departmentName,
            label: project.departmentName,
          },
          ...projectDepartmentOptions,
        ]
      : projectDepartmentOptions;
  const garbageSourceTask =
    project.tasks.find((task) => task.vehicleId) ??
    project.tasks.find((task) => task.driverEmployeeId || task.collectorEmployeeIds.length) ??
    null;
  const [
    subdistrictOptions,
    garbagePointOptions,
    garbageLoaderOptions,
    procurementBundle,
  ] = await Promise.all([
    shouldLoadTaskCreateOptions
      ? loadGarbageSubdistrictOptions(connectionOverrides).catch(() => [])
      : Promise.resolve([]),
    shouldLoadTaskCreateOptions && isGarbageRouteProject
      ? loadGarbagePointOptions(connectionOverrides, {
          requireCurrentEmployeeScope: session.role === "transport_inspector",
        }).catch(() => [])
      : Promise.resolve([]),
    shouldLoadTaskCreateOptions && isGarbageRouteProject
      ? loadFleetVehicleBoard(connectionOverrides)
          .then((board) => board.loaderOptions)
          .catch(() => [])
      : Promise.resolve([]),
    loadProcurementRequests(
      { project_id: project.id, limit: 5 },
      connectionOverrides,
    ).catch((error) => {
      if (!isProcurementSetupError(error)) {
        console.warn("Project procurement links could not be loaded:", error);
      }
      return { items: [], pagination: { page: 1, limit: 5, total: 0, pages: 1 } };
    }),
  ]);
  const procurementItems = procurementBundle.items;
  const procurementCreateHref = `/procurement/new?project_id=${project.id}`;
  const taskCounts = {
    all: project.tasks.length,
    todo: project.tasks.filter(
      (task) => task.stageBucket === "todo" || task.stageBucket === "progress" || task.stageBucket === "unknown",
    ).length,
    review: project.tasks.filter((task) => task.stageBucket === "review" || task.stageBucket === "problem").length,
    overdue: project.tasks.filter((task) => task.isOverdue).length,
    done: project.tasks.filter((task) => task.stageBucket === "done").length,
  } satisfies Record<TaskFilterKey, number>;

  const visibleTasks = project.tasks.filter((task) => {
    if (activeFilter === "all") {
      return true;
    }

    if (activeFilter === "todo") {
      return task.stageBucket === "todo" || task.stageBucket === "progress" || task.stageBucket === "unknown";
    }
    if (activeFilter === "overdue") {
      return task.isOverdue;
    }

    return task.stageBucket === activeFilter;
  });
  const stageSummary = resolveProjectStage(taskCounts);
  const activeTaskCount = taskCounts.todo + taskCounts.review;
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
  const taskCreateVehicleContext = garbageSourceTask
    ? {
        vehicleId: garbageSourceTask.vehicleId,
        vehicleName: garbageSourceTask.vehicleName,
        driverEmployeeId: garbageSourceTask.driverEmployeeId,
        driverName: garbageSourceTask.driverName,
        collectorEmployeeIds: garbageSourceTask.collectorEmployeeIds,
        collectorNames: garbageSourceTask.collectorNames,
      }
    : null;
  const preferredAutoBaseHead = isAutoBaseGarbageDepartmentName(project.departmentName)
    ? [...project.departmentUserOptions, ...projectEditManagerOptions].find((manager) =>
        isPreferredAutoBaseHeadName(`${manager.name} ${manager.login} ${manager.departmentName ?? ""}`),
      ) ?? null
    : null;
  const taskDepartmentHeadName = preferredAutoBaseHead?.name ?? project.managerName;
  const taskDepartmentHeadId = preferredAutoBaseHead?.id ?? project.managerId;
  const taskCreateBaseProps = {
    action: createTaskAction,
    projectId: project.id,
    departmentName: project.departmentName,
    departmentHeadName: taskDepartmentHeadName,
    departmentHeadId: taskDepartmentHeadId,
    deadline: project.deadline,
    masterMode,
    departmentUserOptions: project.departmentUserOptions,
    crewTeamOptions: project.crewTeamOptions,
    allUnitOptions: project.allUnitOptions,
    defaultUnitId: project.defaultUnitId,
    allowedUnitSummary: project.allowedUnitSummary,
    operationType: project.operationType,
    garbagePointOptions,
    subdistrictOptions,
    garbageLoaderOptions,
    garbageVehicleContext: taskCreateVehicleContext,
  };

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
              userRole={session.role}
              roleLabel={getSessionRoleLabel(session)}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title="Ажлын дэлгэрэнгүй"
              userName={session.name}
              roleLabel={getSessionRoleLabel(session)}
              notificationCount={activeTaskCount}
              notificationNote={`${activeTaskCount} нээлттэй даалгавар байна`}
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

              <div className={styles.projectHeroGrid}>
                <article className={styles.projectHeroFeatureCard}>
                  <div className={styles.projectHeroFeatureTop}>
                    <div>
                      <span className={styles.projectHeroKicker}>Төлөвийн тойм</span>
                      <h2>Ажлын ерөнхий зураглал</h2>
                    </div>
                    <span className={styles.projectHeroStagePill}>
                      <StagePill label={stageSummary.label} bucket={stageSummary.bucket} />
                    </span>
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

                {project.description || project.attachments.length ? (
                  <div className={styles.projectHeroAside}>
                    <article className={`${styles.projectHeroInfoCard} ${styles.projectHeroAttachmentCard}`}>
                      <div className={styles.projectHeroAttachmentHeader}>
                        <span className={styles.projectHeroCardLabel}>Хавсралт ба тайлбар</span>
                        <span className={styles.compactCountPill}>
                          {project.attachments.length} файл
                        </span>
                      </div>

                      <div className={styles.descriptionCard}>
                        <span className={styles.compactLabel}>Тайлбар</span>
                        <p>{project.description || "Тайлбар бүртгээгүй байна."}</p>
                      </div>

                      {project.attachments.length ? (
                        <details className={styles.attachmentDisclosure}>
                          <summary className={styles.attachmentDisclosureSummary}>
                            <span>Хавсралт харах</span>
                            <small>{project.attachments.length} файл</small>
                          </summary>

                          <div className={styles.attachmentDetailPanel}>
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
                    </article>
                  </div>
                ) : null}
              </div>

              <div className={styles.projectActionBar} aria-label="Ажлын үндсэн үйлдлүүд">
                <div className={styles.projectActionGroup}>
                  <Link href={backHref} className={styles.smallLink} title={backLabel}>
                    Жагсаалт руу буцах
                  </Link>
                </div>

                {canEditProject || canDeleteWorkspace ? (
                  <div className={styles.projectActionGroup}>
                    {canEditProject ? (
                      <ProjectEditModal
                        action={updateProjectAction}
                        projectId={project.id}
                        name={project.name}
                        managerId={project.managerId}
                        departmentId={project.departmentId}
                        startDate={project.startDate}
                        deadline={project.deadline}
                        description={project.description}
                        managerOptions={projectEditManagerOptions}
                        departmentOptions={projectEditDepartmentOptions}
                        canEditDepartment={!scopedDepartmentName}
                      />
                    ) : null}
                    {canDeleteWorkspace ? (
                      <form action={deleteProjectAction} className={styles.inlineProjectActionForm}>
                        <input type="hidden" name="project_id" value={project.id} />
                        <button type="submit" className={styles.dangerButton}>
                          Ажил архивлах
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}

                <div className={styles.projectActionGroup}>
                  <a
                    href={`/api/workspace-report/export?type=project&id=${project.id}&format=word`}
                    className={styles.secondaryButton}
                  >
                    Word файл татах
                  </a>
                  <a
                    href={`/api/workspace-report/export?type=project&id=${project.id}&format=pdf`}
                    className={styles.secondaryButton}
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDF-ээр нээх
                  </a>
                </div>
              </div>
            </section>

            <section className={`${styles.sectionCard} ${styles.projectDetailCompact} ${styles.projectProcurementCompact}`}>
              <div className={styles.compactSectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Худалдан авалт</span>
                  <h2>Энэ ажилтай холбоотой худалдан авалт</h2>
                </div>
                <Link href={procurementCreateHref} className={styles.secondaryButton}>
                  Хүсэлт үүсгэх
                </Link>
              </div>

              {procurementItems.length ? (
                <div className={styles.projectDetailCompactGrid}>
                  {procurementItems.map((item) => (
                    <Link key={item.id} href={`/procurement/${item.id}`} className={styles.descriptionCard}>
                      <span className={styles.compactLabel}>{item.name}</span>
                      <strong>{item.title}</strong>
                      <p>
                        {item.state.label} · {item.payment_status.label} · {item.receipt_status.label}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className={styles.descriptionCard}>
                  <span className={styles.compactLabel}>Одоогоор хүсэлт алга</span>
                  <p>Энэ ажлаас материал, сэлбэг, үйлчилгээ авах шаардлагатай бол эндээс шууд хүсэлт үүсгэнэ.</p>
                </div>
              )}
            </section>

            <section
              className={`${masterMode ? styles.masterTaskBoard : styles.panelGrid} ${
                canShowTaskCreateComposer ? styles.projectTaskBoardWithComposer : ""
              }`}
            >
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

                  {canShowTaskCreateComposer ? (
                    <div className={styles.mobileTaskCreateAction}>
                      <ProjectTaskCreateModal
                      {...taskCreateBaseProps}
                      defaultOpen={Boolean(errorMessage) || quickActionMode === "task"}
                      />
                    </div>
                  ) : (
                    <p>
                      {quickActionMode === "report"
                        ? "Доорх даалгаврын аль нэгийг сонгоод тайлангийн цонх руу орно."
                        : isRoadAreaCleaning
                          ? "Доорх даалгавар дээр дарахад гүйцэтгэлийн тайлангийн цонх шууд нээгдэнэ."
                        : masterMode
                        ? "Доорх даалгавар бүр дээр дарж тайлангийн урсгал руу орно."
                        : "Доорх даалгавар бүр дээр дарахад тухайн даалгаврын дэлгэрэнгүй нээгдэнэ."}
                    </p>
                  )}
                </div>

                <div className={`${styles.taskFilterRail} ${styles.projectTaskFilterRail}`}>
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
                      const reviewHref = `${task.href}?returnTo=${encodeURIComponent(
                        `/projects/${project.id}`,
                      )}#task-reports`;
                      const canReviewTaskFromBoard =
                        canReviewProjectReports && task.reportCount > 0 && task.stageBucket !== "done";
                      const canReportFromBoard =
                        (quickActionMode === "report" || isRoadAreaCleaning) &&
                        canOpenQuickReport &&
                        isRoadAreaCleaningTask(task) &&
                        !task.reportsLocked &&
                        task.stageBucket !== "review" &&
                        task.stageBucket !== "done";
                      const photoFirstReportTask =
                        isPhotoFirstReportTask(task.operationType) || isRoadAreaCleaningTask(task);
                      const taskDescription = task.description.trim();
                      const taskCardContent = (
                        <>
                          <span className={styles.projectTaskNumber}>{index + 1}</span>
                          <div className={styles.projectTaskMain}>
                            <div className={styles.projectTaskTitleRow}>
                              <div>
                                <h3>{task.name}</h3>
                                {taskDescription ? (
                                  <p className={styles.projectTaskDescription}>
                                    Тайлбар: {taskDescription}
                                  </p>
                                ) : null}
                                <p>
                                  Хариуцсан ажилтан: {task.teamLeaderName}
                                  {task.teamLeaderJobTitle ? ` · ${task.teamLeaderJobTitle}` : ""}
                                </p>
                                {task.assignees.length || task.vehicleName || task.driverName || task.collectorNames.length ? (
                                  <p>
                                    {task.assignees.length ? `Оноосон: ${task.assignees.join(", ")}` : ""}
                                    {task.vehicleName ? `${task.assignees.length ? " · " : ""}Машин: ${task.vehicleName}` : ""}
                                    {task.driverName ? `${task.assignees.length || task.vehicleName ? " · " : ""}Жолооч: ${task.driverName}` : ""}
                                    {task.collectorNames.length
                                      ? `${task.assignees.length || task.vehicleName || task.driverName ? " · " : ""}Ачигч: ${task.collectorNames.join(", ")}`
                                      : ""}
                                  </p>
                                ) : null}
                              </div>
                            </div>

                            <div className={styles.projectTaskMetaGrid}>
                              <div className={styles.projectTaskStateCell}>
                                <small>Төлөв</small>
                                <div className={styles.projectTaskStateRow}>
                                  <StagePill label={task.stageLabel} bucket={task.stageBucket} />
                                  {task.reportCount ? (
                                    <span className={styles.projectTaskReportCount}>
                                      {task.reportCount} тайлан
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {task.quantitySummary ? (
                                <div className={styles.projectTaskQuantityCell}>
                                  <strong>Гүйцэтгэл:</strong>
                                  {task.quantitySummaryLines.map((line) => (
                                    <span key={line}>{line}</span>
                                  ))}
                                </div>
                              ) : null}
                              <span>Хугацаа: {task.deadline}</span>
                            </div>

                            <div className={styles.projectTaskProgressLabel}>
                              <span>Явц</span>
                              <strong>{task.progress}%</strong>
                            </div>
                            <div className={styles.projectTaskProgressTrack}>
                              <span style={{ width: getProgressWidth(task.progress) }} />
                            </div>
                          </div>
                        </>
                      );

                      return (
                        <article
                          key={task.id}
                          className={`${styles.projectTaskFlowItem} ${taskCardToneClass(task.stageBucket)}`}
                        >
                          {canReportFromBoard ? (
                            <TaskReportModal
                              action={createTaskReportAction}
                              taskId={task.id}
                              quantityOptional={task.quantityOptional}
                              measurementUnit={task.measurementUnit}
                              quantityLines={task.quantityLines}
                              requireQuantity={Boolean(task.quantitySummary)}
                              reportTextRequired={!photoFirstReportTask}
                              simpleMobile={photoFirstReportTask}
                              workItemName={task.name}
                              parentWorkInfo={{
                                workName: project.name,
                                areaName: project.name.split(" - ")[0] || project.name,
                                areaM2: task.plannedQuantity || task.quantitySummary || "",
                                employeeName: task.assignees[0] || task.teamLeaderName || "",
                              }}
                              returnTo={`/projects/${project.id}`}
                              triggerClassName={`${styles.projectTaskFlowLink} ${styles.projectTaskFlowButton}`}
                              triggerContent={taskCardContent}
                            />
                          ) : (
                            <Link href={task.href} className={styles.projectTaskFlowLink}>
                              {taskCardContent}
                            </Link>
                          )}

                        {canReviewTaskFromBoard ? (
                          <div className={styles.projectTaskFlowActions}>
                            <Link href={reviewHref} className={styles.projectTaskReviewButton}>
                              Шалгах
                            </Link>
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
              {canShowTaskCreateComposer ? (
                <aside className={styles.projectTaskComposerPanel}>
                  <div className={styles.projectTaskComposerHeader}>
                    <span className={styles.eyebrow}>Шинэ даалгавар</span>
                    <h2>{masterMode ? "Өнөөдрийн даалгавар нэмэх" : "Даалгавар үүсгэх"}</h2>
                    <p>Баруун талын зайд шууд бөглөөд нэмнэ. Гар утсан дээр энэ хэсэг popup хэлбэрээр нээгдэнэ.</p>
                  </div>
                  <ProjectTaskCreateForm
                    {...taskCreateBaseProps}
                    className={styles.sideTaskCreateForm}
                    footerClassName={styles.sideTaskCreateActions}
                  />
                </aside>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
