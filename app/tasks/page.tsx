import Link from "next/link";

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
import {
  filterByDepartment,
  filterTasksToDate,
  getTodayDateKey,
  pickPrimaryDepartmentName,
} from "@/lib/dashboard-scope";
import { loadMunicipalSnapshot, type TaskDirectoryItem } from "@/lib/odoo";

import styles from "./tasks.module.css";

type FilterKey = "all" | "working" | "review" | "problem" | "verified";
type QuickActionMode = "none" | "report";

type PageProps = {
  searchParams?: Promise<{
    department?: string | string[];
    filter?: string | string[];
    quickAction?: string | string[];
  }>;
};

type SnapshotProject = Awaited<ReturnType<typeof loadMunicipalSnapshot>>["projects"][number];

type TodayProjectSummary = {
  id: number | string;
  name: string;
  manager: string;
  departmentName: string;
  deadline: string;
  completion: number;
  openTasks: number;
  href: string;
  todayTaskCount: number;
  workingTaskCount: number;
  reviewTaskCount: number;
  problemTaskCount: number;
  verifiedTaskCount: number;
  progressTotal: number;
  stageBucket: "todo" | "progress" | "review" | "done" | "unknown" | "problem";
  stageLabel: string;
};

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Бүгд" },
  { key: "working", label: "Ажиллаж байна" },
  { key: "review", label: "Хянагдаж байна" },
  { key: "problem", label: "Асуудалтай" },
  { key: "verified", label: "Баталгаажсан" },
];

function getParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function normalizeFilter(value: string): FilterKey {
  return FILTERS.some((item) => item.key === value) ? (value as FilterKey) : "all";
}

function normalizeQuickAction(value: string): QuickActionMode {
  return value === "report" ? "report" : "none";
}

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

function resolveTodayProjectStage(summary: Pick<
  TodayProjectSummary,
  "todayTaskCount" | "workingTaskCount" | "reviewTaskCount" | "problemTaskCount" | "verifiedTaskCount"
>) {
  if (summary.problemTaskCount > 0) {
    return { bucket: "problem" as const, label: "Асуудалтай" };
  }

  if (summary.reviewTaskCount > 0) {
    return { bucket: "review" as const, label: "Шалгагдах" };
  }

  if (summary.workingTaskCount > 0) {
    return { bucket: "progress" as const, label: "Явж байгаа" };
  }

  if (summary.todayTaskCount > 0 && summary.verifiedTaskCount === summary.todayTaskCount) {
    return { bucket: "done" as const, label: "Дууссан" };
  }

  return { bucket: "todo" as const, label: "Хийгдэх" };
}

function buildTodayProjectSummaries(
  tasks: TaskDirectoryItem[],
  projects: SnapshotProject[],
): TodayProjectSummary[] {
  const projectByName = new Map(projects.map((project) => [project.name, project]));

  return Array.from(
    tasks.reduce<Map<string, TodayProjectSummary>>((accumulator, task) => {
      const linkedProject = projectByName.get(task.projectName);
      const existing = accumulator.get(task.projectName) ?? {
        id: linkedProject?.id ?? `today-project-${task.projectName}`,
        name: task.projectName,
        manager: linkedProject?.manager ?? task.leaderName,
        departmentName: linkedProject?.departmentName ?? task.departmentName,
        deadline: linkedProject?.deadline ?? task.deadline,
        completion: linkedProject?.completion ?? 0,
        openTasks: linkedProject?.openTasks ?? 0,
        href: linkedProject?.href ?? task.href,
        todayTaskCount: 0,
        workingTaskCount: 0,
        reviewTaskCount: 0,
        problemTaskCount: 0,
        verifiedTaskCount: 0,
        progressTotal: 0,
        stageBucket: "todo" as const,
        stageLabel: "Хийгдэх",
      };

      existing.todayTaskCount += 1;
      existing.progressTotal += task.progress;

      if (task.statusKey === "working") {
        existing.workingTaskCount += 1;
      } else if (task.statusKey === "review") {
        existing.reviewTaskCount += 1;
      } else if (task.statusKey === "problem") {
        existing.problemTaskCount += 1;
      } else if (task.statusKey === "verified") {
        existing.verifiedTaskCount += 1;
      }

      accumulator.set(task.projectName, existing);
      return accumulator;
    }, new Map()),
  )
    .map(([, summary]) => {
      const stage = resolveTodayProjectStage(summary);
      const derivedCompletion = summary.todayTaskCount
        ? Math.round(summary.progressTotal / summary.todayTaskCount)
        : summary.completion;

      return {
        ...summary,
        completion: summary.completion || derivedCompletion,
        stageBucket: stage.bucket,
        stageLabel: stage.label,
      };
    })
    .sort((left, right) => {
      const priority = {
        problem: 0,
        review: 1,
        progress: 2,
        todo: 3,
        unknown: 4,
        done: 5,
      } satisfies Record<TodayProjectSummary["stageBucket"], number>;

      const bucketDiff = priority[left.stageBucket] - priority[right.stageBucket];
      if (bucketDiff !== 0) {
        return bucketDiff;
      }

      if (right.todayTaskCount !== left.todayTaskCount) {
        return right.todayTaskCount - left.todayTaskCount;
      }

      return left.name.localeCompare(right.name, "mn");
    });
}

export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const params = (await searchParams) ?? {};
  const activeFilter = normalizeFilter(getParam(params.filter));
  const selectedFilter: FilterKey = isMasterRole(session.role) ? "all" : activeFilter;
  const requestedDepartment = getParam(params.department);
  const requestedQuickAction = normalizeQuickAction(getParam(params.quickAction));

  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  const quickActionMode: QuickActionMode =
    workerMode && canWriteReports ? requestedQuickAction : "none";
  const workerTasks = workerMode
    ? snapshot.taskDirectory.filter((task) => task.assigneeIds?.includes(session.uid))
    : [];
  const masterDepartmentName = masterMode
    ? pickPrimaryDepartmentName({
        taskDirectory: snapshot.taskDirectory,
        reports: snapshot.reports,
        projects: snapshot.projects,
        departments: snapshot.departments,
      })
    : null;
  const masterDepartmentTasks = masterMode
    ? filterByDepartment(snapshot.taskDirectory, masterDepartmentName)
    : [];
  const masterTodayTasks = masterMode
    ? filterTasksToDate(masterDepartmentTasks, getTodayDateKey())
    : [];
  const masterTodayProjects = masterMode
    ? buildTodayProjectSummaries(
        masterTodayTasks,
        filterByDepartment(snapshot.projects, masterDepartmentName),
      )
    : [];

  const selectedDepartment =
    !workerMode && !masterMode && requestedDepartment && requestedDepartment !== "all"
      ? snapshot.departments.find((department) => department.name === requestedDepartment) ?? null
      : null;

  const scopedProjects = workerMode
    ? Array.from(new Set(workerTasks.map((task) => task.projectName)))
    : masterMode
      ? filterByDepartment(snapshot.projects, masterDepartmentName)
    : snapshot.projects.filter(
        (project) => !selectedDepartment || project.departmentName === selectedDepartment.name,
      );
  const scopedTasks = workerMode
    ? workerTasks
    : masterMode
      ? masterTodayTasks
    : snapshot.taskDirectory.filter(
        (task) => !selectedDepartment || task.departmentName === selectedDepartment.name,
      );

  const counts: Record<FilterKey, number> = masterMode
    ? {
        all: masterTodayProjects.length,
        working: masterTodayProjects.filter((project) => project.stageBucket === "progress").length,
        review: masterTodayProjects.filter((project) => project.stageBucket === "review").length,
        problem: masterTodayProjects.filter((project) => project.stageBucket === "problem").length,
        verified: masterTodayProjects.filter((project) => project.stageBucket === "done").length,
      }
    : {
        all: scopedTasks.length,
        working: scopedTasks.filter((task) => task.statusKey === "working").length,
        review: scopedTasks.filter((task) => task.statusKey === "review").length,
        problem: scopedTasks.filter((task) => task.statusKey === "problem").length,
        verified: scopedTasks.filter((task) => task.statusKey === "verified").length,
      };

  const visibleTasks = scopedTasks.filter((task) => {
    if (selectedFilter === "all") {
      return true;
    }
    return task.statusKey === selectedFilter;
  });
  const visibleProjects = masterTodayProjects.filter((project) => {
    if (selectedFilter === "all") {
      return true;
    }

    if (selectedFilter === "working") {
      return project.stageBucket === "progress";
    }

    if (selectedFilter === "review") {
      return project.stageBucket === "review";
    }

    if (selectedFilter === "problem") {
      return project.stageBucket === "problem";
    }

    return project.stageBucket === "done";
  });

  const selectedDepartmentLabel = workerMode
    ? "Надад оноогдсон ажилбар"
    : masterMode
      ? masterDepartmentName ?? "Миний алба нэгж"
      : selectedDepartment?.name ?? "Бүх алба нэгж";

  const taskListParams = new URLSearchParams();
  if (!workerMode && selectedDepartment?.name) {
    taskListParams.set("department", selectedDepartment.name);
  }
  if (activeFilter !== "all") {
    taskListParams.set("filter", activeFilter);
  }
  if (quickActionMode !== "none") {
    taskListParams.set("quickAction", quickActionMode);
  }
  const taskListHref = taskListParams.toString() ? `/tasks?${taskListParams.toString()}` : "/tasks";
  const taskActionLabel = quickActionMode === "report" ? "Тайлан оруулах" : "Дэлгэрэнгүй харах";
  const buildTaskHref = (taskHref: string) => {
    if (quickActionMode !== "report") {
      return taskHref;
    }

    const hrefParams = new URLSearchParams();
    hrefParams.set("composer", "report");
    hrefParams.set("returnTo", taskListHref);
    return `${taskHref}?${hrefParams.toString()}`;
  };

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="tasks"
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
              title={masterMode ? "Өнөөдрийн ажил" : "Ажилбар"}
              subtitle={
                masterMode
                  ? "Өнөөдөр явах ажил, төслийн урсгал"
                  : workerMode
                    ? "Танд оноогдсон ажилбарын жагсаалт"
                    : "Хэлтсийн ажилбарын өдөр тутмын урсгал"
              }
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={masterMode ? visibleProjects.length : visibleTasks.length}
              notificationNote={
                masterMode
                  ? `${visibleProjects.length} ажил, төсөл өнөөдөр харагдаж байна`
                  : `${visibleTasks.length} ажилбар одоогоор харагдаж байна`
              }
            />

            <header className={styles.pageHeader}>
              <div className={styles.pageHeaderMain}>
                <div className={styles.titleBlock}>
                  <span className={styles.pageKicker}>
                    {workerMode ? "Миний урсгал" : masterMode ? "Мастерын урсгал" : "Бүх урсгал"}
                  </span>
                   <h1>
                     {workerMode
                       ? "Надад оноогдсон ажилбар"
                       : masterMode
                        ? "Өнөөдрийн ажил"
                        : "Бүх ажилбар"}
                   </h1>
                   <p>
                     {workerMode
                       ? "Зөвхөн танд хамаарах ажилбаруудыг эндээс харна. Төлөвөөр нь хурдан шүүж, дэлгэрэнгүй рүү шууд орж ажлаа үргэлжлүүлнэ."
                       : masterMode
                        ? "Мастер хэрэглэгчид зөвхөн өөрийн алба нэгжийн өнөөдөр явах ажил, төслүүд харагдана. Ажил дээр дарахад тухайн ажлын доторх ажилбар руу орно."
                        : "Odoo ERP дээр бүртгэгдсэн бүх ажилбарыг алба нэгж, ажил, төлөвөөр нь нэг дороос харуулна. Асуудалтай болон хяналт хүлээж буй ажилбаруудыг эхэнд нь ялгаж, дэлгэрэнгүй рүү шууд нээнэ."}
                   </p>
                </div>

                <div className={styles.userBlock}>
                  <span>Сүүлд шинэчлэгдсэн</span>
                  <strong>{snapshot.generatedAt}</strong>
                  <small>{selectedDepartmentLabel}</small>
                </div>
              </div>

              {!masterMode ? (
                <div className={styles.pageHeaderAside}>
                  {workerMode ? (
                    <div className={styles.userBlock}>
                      <span>Өнөөдрийн ажил</span>
                      <strong>{canUseFieldConsole ? "Маршрут нээх" : "Маршрутгүй"}</strong>
                      <small>
                        {canUseFieldConsole
                          ? "Өнөөдөрт оноогдсон маршрут, талбайн урсгал руу шууд орно."
                          : "Энэ хэрэглэгч дээр талбайн маршрут харах эрх идэвхгүй байна."}
                      </small>
                      {canUseFieldConsole ? (
                        <Link href="/field" className={styles.dateButton}>
                          Өнөөдрийн ажил
                        </Link>
                      ) : null}
                    </div>
                  ) : (
                    <form className={styles.dateFilterForm} method="get">
                      <label htmlFor="tasks-department">Алба нэгж</label>
                      <div className={styles.dateRow}>
                        <select
                          id="tasks-department"
                          name="department"
                          defaultValue={selectedDepartment?.name ?? "all"}
                          className={styles.dateInput}
                        >
                          <option value="all">Бүх алба нэгж</option>
                          {snapshot.departments.map((department) => (
                            <option key={department.name} value={department.name}>
                              {department.name}
                            </option>
                          ))}
                        </select>
                        <input type="hidden" name="filter" value={activeFilter} />
                        <button type="submit" className={styles.dateButton}>
                          Харах
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : null}
            </header>

            <section className={styles.summaryStrip}>
              <article className={styles.summaryCard}>
                <span>
                  {workerMode
                    ? "Харагдах хүрээ"
                    : masterMode
                      ? "Алба нэгж"
                      : "Сонгосон алба нэгж"}
                </span>
                <strong>{selectedDepartmentLabel}</strong>
                <small>
                  {workerMode
                    ? "Зөвхөн танд оноогдсон ажилбаруудыг харуулж байна"
                    : masterMode
                      ? "Мастер хэрэглэгчид зөвхөн өөрийн нэгжийн өнөөдөр явах ажил харагдана"
                    : `${snapshot.departments.length} алба нэгжээс шүүж байна`}
                </small>
              </article>
              <article className={styles.summaryCard}>
                <span>
                  {workerMode
                    ? "Надад оноогдсон ажилбар"
                    : masterMode
                      ? "Өнөөдөр явах ажил"
                      : "Нийт ажилбар"}
                </span>
                <strong>{counts.all}</strong>
                <small>
                  {workerMode
                    ? "Тухайн хэрэглэгчид оноогдсон нийт ажилбар"
                    : masterMode
                      ? "Өнөөдөр эхлэх эсвэл үргэлжлэх ажил, төслийн тоо"
                    : "Odoo ERP-ээс орж ирсэн бүх ажилбар"}
                </small>
              </article>
              <article className={styles.summaryCard}>
                <span>
                  {workerMode
                    ? "Холбогдсон ажил"
                    : masterMode
                      ? "Өнөөдрийн ажилбар"
                      : "Нийт ажил"}
                </span>
                <strong>{masterMode ? masterTodayTasks.length : scopedProjects.length}</strong>
                <small>
                  {workerMode
                    ? "Эдгээр ажилд таны ажилбарууд багтаж байна"
                    : masterMode
                      ? "Өнөөдөр эдгээр ажилд харагдах нийт ажилбар"
                      : "Энэ шүүлтэд хамаарах ажлууд"}
                </small>
              </article>
            </section>

            {quickActionMode === "report" ? (
              <div className={`${shellStyles.message} ${shellStyles.noticeMessage}`}>
                Тайлан оруулахын тулд эхлээд ажилбараа сонгоно. Дараагийн дэлгэц дээр тайлангийн
                цонх шууд нээгдэнэ.
              </div>
            ) : null}

            {!masterMode ? (
              <section className={styles.filterPanel}>
              <div className={styles.filterHeader}>
                <div>
                  <span className={styles.filterKicker}>Төлөвийн шүүлт</span>
                   <h2>
                     {workerMode
                       ? "Миний ажилбарын төлөв"
                       : masterMode
                        ? "Өнөөдрийн ажлыг төлөвөөр нь шүүх"
                        : "Ажлыг хурдан ангилж харах"}
                   </h2>
                </div>
                <p>
                  {workerMode
                    ? "Асуудалтай, хяналт хүлээж буй, баталгаажсан ажилбараа нэг товшилтоор ялгаж харна."
                    : masterMode
                      ? "Өнөөдөр явах ажил, төслүүдээ төлөвөөр нь ялгаад, дарахад доторх ажилбарын жагсаалт руу орно."
                      : "Эхлээд асуудалтай, дараа нь хяналт хүлээж буй ажилбаруудыг ялгаж харахад тохиромжтой."}
                </p>
              </div>

              <div className={styles.filterScroller}>
                {FILTERS.map((item) => {
                  const hrefParams = new URLSearchParams();
                  if (!workerMode && selectedDepartment?.name) {
                    hrefParams.set("department", selectedDepartment.name);
                  }
                  if (item.key !== "all") {
                    hrefParams.set("filter", item.key);
                  }
                  if (quickActionMode !== "none") {
                    hrefParams.set("quickAction", quickActionMode);
                  }

                  return (
                    <Link
                      key={item.key}
                      href={`/tasks?${hrefParams.toString()}`}
                      className={`${styles.filterChip} ${
                        activeFilter === item.key ? styles.filterChipActive : ""
                      }`}
                    >
                      <span>{item.label}</span>
                      <strong>{counts[item.key]}</strong>
                    </Link>
                  );
                })}
              </div>
              </section>
            ) : null}

            <section className={styles.taskSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.filterKicker}>
                    {workerMode
                      ? "Миний жагсаалт"
                      : masterMode
                        ? "Өнөөдрийн жагсаалт"
                        : "Ажлын жагсаалт"}
                  </span>
                  <h2>
                    {workerMode
                      ? "Надад хамаарах ажилбар"
                      : masterMode
                        ? "Өнөөдөр явах ажил"
                        : "Odoo-оос татсан бүх ажилбар"}
                  </h2>
                </div>
                <p>
                  {workerMode
                    ? `${visibleTasks.length} ажилбар танд одоогоор харагдаж байна`
                    : masterMode
                      ? `${visibleProjects.length} ажил, төсөл өнөөдөр энэ дэлгэц дээр харагдаж байна`
                    : `${visibleTasks.length} ажилбар одоогоор дэлгэц дээр харагдаж байна`}
                </p>
              </div>

              {masterMode ? (
                visibleProjects.length ? (
                  <div className={styles.projectList}>
                    {visibleProjects.map((project) => (
                      <Link
                        key={project.id}
                        href={`${project.href}?returnTo=/tasks`}
                        className={`${styles.taskCard} ${styles.projectCardLink}`}
                      >
                        <div className={styles.taskCardTop}>
                          <div className={styles.taskIdentity}>
                            <strong>{project.name}</strong>
                            <span>{project.departmentName}</span>
                          </div>
                          <StagePill label={project.stageLabel} bucket={project.stageBucket} />
                        </div>

                        <p className={styles.taskRoute}>Менежер: {project.manager}</p>

                        <div className={styles.taskInfoGrid}>
                          <div className={styles.taskInfoItem}>
                            <span>Өнөөдрийн ажилбар</span>
                            <strong>{project.todayTaskCount}</strong>
                          </div>
                          <div className={styles.taskInfoItem}>
                            <span>Нээлттэй ажилбар</span>
                            <strong>{project.openTasks}</strong>
                          </div>
                          <div className={styles.taskInfoItem}>
                            <span>Хугацаа</span>
                            <strong>{project.deadline}</strong>
                          </div>
                        </div>

                        <div className={styles.progressRow}>
                          <div className={styles.progressLabel}>
                            <span>Ажлын явц</span>
                            <strong>{project.completion}%</strong>
                          </div>
                          <div className={styles.progressTrack}>
                            <span style={{ width: `${project.completion}%` }} />
                          </div>
                        </div>

                        <div className={styles.projectCardFooter}>
                          <span className={styles.subtleNote}>
                            Явж байгаа {project.workingTaskCount} • Шалгагдах {project.reviewTaskCount}
                            {" "}• Асуудалтай {project.problemTaskCount}
                          </span>
                          <strong className={styles.projectOpenLabel}>Ажилбар харах</strong>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <h3>Өнөөдөр явах ажил олдсонгүй</h3>
                    <p>Өөр төлөв сонгох эсвэл ажлын жагсаалт руу орж шинэ ажил нээнэ үү.</p>
                  </div>
                )
              ) : visibleTasks.length ? (
                <>
                  <div className={styles.taskCardList}>
                    {visibleTasks.map((task) => (
                      <article key={task.id} className={styles.taskCard}>
                        <div className={styles.taskCardTop}>
                          <div className={styles.taskIdentity}>
                            <strong>{task.name}</strong>
                            <span>{task.projectName}</span>
                          </div>
                          <StatusBadge statusKey={task.statusKey} statusLabel={task.statusLabel} />
                        </div>

                        <p className={styles.taskRoute}>{task.departmentName}</p>

                        <div className={styles.taskInfoGrid}>
                          <div className={styles.taskInfoItem}>
                            <span>Ахлагч</span>
                            <strong>{task.leaderName}</strong>
                          </div>
                          <div className={styles.taskInfoItem}>
                            <span>Хугацаа</span>
                            <strong>{task.deadline}</strong>
                          </div>
                          <div className={styles.taskInfoItem}>
                            <span>Ангилал</span>
                            <strong>{task.operationTypeLabel}</strong>
                          </div>
                        </div>

                        <div className={styles.progressRow}>
                          <div className={styles.progressLabel}>
                            <span>Ажлын явц</span>
                            <strong>{task.progress}%</strong>
                          </div>
                          <div className={styles.progressTrack}>
                            <span style={{ width: `${task.progress}%` }} />
                          </div>
                        </div>

                        <div className={styles.cardActions}>
                          <Link href={buildTaskHref(task.href)} className={styles.primaryLink}>
                            {taskActionLabel}
                          </Link>
                          <span className={styles.subtleNote}>
                            {task.completedQuantity}/{task.plannedQuantity} {task.measurementUnit} •{" "}
                            {task.priorityLabel}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className={styles.tableShell}>
                    <table className={styles.taskTable}>
                      <thead>
                        <tr>
                          <th>Ажилбар</th>
                          <th>Алба нэгж</th>
                          <th>Ажил</th>
                          <th>Төлөв</th>
                          <th>Ахлагч</th>
                          <th>Явц</th>
                          <th>Дэлгэрэнгүй</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTasks.map((task) => (
                          <tr key={task.id}>
                            <td>
                              <strong>{task.name}</strong>
                            </td>
                            <td>{task.departmentName}</td>
                            <td>{task.projectName}</td>
                            <td>
                              <StatusBadge
                                statusKey={task.statusKey}
                                statusLabel={task.statusLabel}
                              />
                            </td>
                            <td>{task.leaderName}</td>
                            <td>
                              <div className={styles.tableProgress}>
                                <span>{task.progress}%</span>
                                <div className={styles.progressTrack}>
                                  <span style={{ width: `${task.progress}%` }} />
                                </div>
                              </div>
                            </td>
                            <td>
                              <Link href={buildTaskHref(task.href)} className={styles.inlineLink}>
                                {quickActionMode === "report" ? "Тайлан" : "Нээх"}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className={styles.emptyState}>
                  <h3>
                    {workerMode
                      ? "Танд тохирох ажилбар энэ шүүлтээр олдсонгүй"
                      : masterMode
                        ? "Өнөөдөрт харагдах ажилбар олдсонгүй"
                        : "Энэ шүүлтээр ажил олдсонгүй"}
                  </h3>
                  <p>
                    {workerMode
                      ? "Өөр төлөв сонгоод дахин шүүж үзнэ үү."
                      : masterMode
                        ? "Өөр төлөв сонгох эсвэл шинэ ажилбар нэмэхийн тулд ажлын жагсаалт руу орно уу."
                        : "Өөр алба нэгж эсвэл өөр төлөв сонгоод дахин шүүж үзнэ үү."}
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
