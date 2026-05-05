import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Leaf,
  Send,
  Sun,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { createTaskReportAction } from "@/app/actions";
import shellStyles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  filterByDepartment,
  filterTasksToDate,
  getTodayDateKey,
} from "@/lib/dashboard-scope";
import {
  DEPARTMENT_GROUPS,
  findDepartmentGroupByName,
  findDepartmentGroupByUnit,
  matchesDepartmentGroup,
} from "@/lib/department-groups";
import { loadGarbageWeeklyTemplates } from "@/lib/garbage-weekly-template-store";
import { expandGarbageWeeklyTemplatesToTasks } from "@/lib/garbage-weekly-template-tasks";
import { loadMunicipalSnapshot, type TaskDirectoryItem } from "@/lib/odoo";

import styles from "./tasks.module.css";
import { TaskReportModal } from "./[taskId]/task-report-modal";

type FilterKey = "all" | "working" | "review" | "problem" | "verified";
type QuickActionMode = "none" | "report";

type PageProps = {
  searchParams?: Promise<{
    department?: string | string[];
    filter?: string | string[];
    quickAction?: string | string[];
    work?: string | string[];
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

function formatWeekdayLabel(dateKey: string) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return { day: dateKey, weekday: "" };
  }

  return {
    day: new Intl.DateTimeFormat("mn-MN", { day: "numeric" }).format(parsed),
    weekday: new Intl.DateTimeFormat("mn-MN", { weekday: "short" }).format(parsed),
  };
}

function formatTimelineTime(value?: string | null) {
  if (!value) {
    return "Өдөр";
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "Өдөр";
  }

  return new Intl.DateTimeFormat("mn-MN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Ulaanbaatar",
  }).format(parsed);
}

function parseDateKey(dateKey: string) {
  const parsed = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getCalendarMonthLabel(dateKey: string) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "long",
  }).format(parsed);
}

function buildMonthCells(anchorDateKey: string) {
  const anchorDate = parseDateKey(anchorDateKey) ?? new Date();
  const firstDayOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const mondayOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const gridStart = addDays(firstDayOfMonth, -mondayOffset);
  const todayKey = getTodayDateKey();

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const dateKey = toDateKey(date);

    return {
      dateKey,
      dayNumber: date.getDate(),
      inMonth: date.getMonth() === anchorDate.getMonth(),
      isToday: dateKey === todayKey,
    };
  });
}

function buildWeekDateKeys(anchorDateKey: string) {
  const anchorDate = parseDateKey(anchorDateKey) ?? new Date();
  const mondayOffset = (anchorDate.getDay() + 6) % 7;
  const weekStart = addDays(anchorDate, -mondayOffset);

  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(weekStart, index)));
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
  const requestedDepartment = getParam(params.department);
  const requestedQuickAction = normalizeQuickAction(getParam(params.quickAction));
  const requestedWorkName = getParam(params.work).trim();
  const calendarAnchorDateKey = getTodayDateKey();
  const calendarBaseCells = buildMonthCells(calendarAnchorDateKey);
  const calendarRangeStart = calendarBaseCells[0]?.dateKey ?? calendarAnchorDateKey;
  const calendarRangeEnd = calendarBaseCells[calendarBaseCells.length - 1]?.dateKey ?? calendarAnchorDateKey;

  const [snapshot, garbageWeeklyTemplates] = await Promise.all([
    loadMunicipalSnapshot(
      {
        login: session.login,
        password: session.password,
      },
      { allowFallback: false },
    ),
    loadGarbageWeeklyTemplates(),
  ]);
  const sourceTaskDirectory = [
    ...snapshot.taskDirectory,
    ...expandGarbageWeeklyTemplatesToTasks(garbageWeeklyTemplates, calendarRangeStart, calendarRangeEnd),
  ];

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const canCreateFromCalendar = canCreateProject || canCreateTasks;
  const calendarCreateHref = canCreateProject ? "/projects/new" : "/create";
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  const selectedFilter: FilterKey = workerMode || masterMode ? "all" : activeFilter;
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  const departmentScopedMode = Boolean(scopedDepartmentName);
  const quickActionMode: QuickActionMode =
    workerMode && canWriteReports ? requestedQuickAction : "none";
  const workerTasks = workerMode
    ? filterTasksToDate(
        sourceTaskDirectory.filter((task) => task.assigneeIds?.includes(session.uid)),
        getTodayDateKey(),
      )
    : [];
  const visibleWorkerTasks =
    workerMode && requestedWorkName
      ? workerTasks.filter((task) => task.projectName === requestedWorkName)
      : workerTasks;
  const masterDepartmentTasks = masterMode
    ? filterByDepartment(sourceTaskDirectory, scopedDepartmentName)
    : [];
  const masterTodayTasks = masterMode
    ? filterTasksToDate(masterDepartmentTasks, getTodayDateKey())
    : [];
  const masterTodayProjects = masterMode
    ? buildTodayProjectSummaries(
        masterTodayTasks,
        filterByDepartment(snapshot.projects, scopedDepartmentName),
      )
    : [];

  const selectedDepartment =
    !workerMode && !masterMode && !departmentScopedMode && requestedDepartment && requestedDepartment !== "all"
      ? snapshot.departments.find((department) => department.name === requestedDepartment) ?? null
      : null;
  const requestedDepartmentGroup =
    !workerMode && !masterMode && !departmentScopedMode && requestedDepartment && requestedDepartment !== "all"
      ? findDepartmentGroupByName(requestedDepartment)
      : null;
  const requestedUnitGroup =
    !workerMode && !masterMode && !departmentScopedMode && requestedDepartment && requestedDepartment !== "all"
      ? findDepartmentGroupByUnit(requestedDepartment)
      : null;
  const selectedDepartmentUnit =
    requestedUnitGroup?.units.includes(requestedDepartment) ? requestedDepartment : "";
  const selectedDepartmentGroup =
    !workerMode && !masterMode && !departmentScopedMode && requestedDepartment && requestedDepartment !== "all"
      ? requestedDepartmentGroup ?? (!selectedDepartment && !selectedDepartmentUnit ? requestedUnitGroup : null)
      : null;
  const selectedDepartmentParam =
    scopedDepartmentName || selectedDepartmentUnit || selectedDepartmentGroup?.name || selectedDepartment?.name || "";

  const scopedProjects = workerMode
    ? Array.from(new Set(visibleWorkerTasks.map((task) => task.projectName)))
    : masterMode
      ? filterByDepartment(snapshot.projects, scopedDepartmentName)
      : departmentScopedMode
        ? filterByDepartment(snapshot.projects, scopedDepartmentName)
      : snapshot.projects.filter((project) => {
          if (selectedDepartmentUnit) {
            return project.departmentName === selectedDepartmentUnit;
          }
          if (selectedDepartmentGroup) {
            return matchesDepartmentGroup(selectedDepartmentGroup, project.departmentName);
          }
          return !selectedDepartment || project.departmentName === selectedDepartment.name;
        });
  const scopedTasks = workerMode
    ? visibleWorkerTasks
    : masterMode
      ? masterTodayTasks
      : departmentScopedMode
        ? filterByDepartment(sourceTaskDirectory, scopedDepartmentName)
      : sourceTaskDirectory.filter((task) => {
          if (selectedDepartmentUnit) {
            return task.departmentName === selectedDepartmentUnit;
          }
          if (selectedDepartmentGroup) {
            return matchesDepartmentGroup(selectedDepartmentGroup, task.departmentName);
          }
          return !selectedDepartment || task.departmentName === selectedDepartment.name;
        });

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
    ? requestedWorkName || "Надад оноогдсон даалгавар"
    : masterMode
      ? scopedDepartmentName ?? "Миний алба нэгж"
      : scopedDepartmentName || selectedDepartmentUnit || selectedDepartmentGroup?.name || selectedDepartment?.name || "Бүх алба хэлтэс";
  const calendarPlanItems = Array.from(
    scopedTasks
      .filter((task) => task.scheduledDate)
      .reduce<
        Map<
          string,
          {
            dateKey: string;
            total: number;
            working: number;
            review: number;
            verified: number;
            tasks: TaskDirectoryItem[];
          }
        >
      >((accumulator, task) => {
        const dateKey = task.scheduledDate ?? "";
        const existing = accumulator.get(dateKey) ?? {
          dateKey,
          total: 0,
          working: 0,
          review: 0,
          verified: 0,
          tasks: [],
        };

        existing.total += 1;
        existing.tasks.push(task);
        if (task.statusKey === "working") {
          existing.working += 1;
        } else if (task.statusKey === "review") {
          existing.review += 1;
        } else if (task.statusKey === "verified") {
          existing.verified += 1;
        }
        accumulator.set(dateKey, existing);
        return accumulator;
      }, new Map())
      .values(),
  )
    .map((item) => ({
      ...item,
      tasks: item.tasks.sort((left, right) => {
        const leftTime = left.deadlineDateTime ?? "";
        const rightTime = right.deadlineDateTime ?? "";
        return leftTime.localeCompare(rightTime) || left.name.localeCompare(right.name, "mn");
      }),
    }))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  const calendarPlanByDate = new Map(calendarPlanItems.map((item) => [item.dateKey, item]));
  const emptyCalendarItem = (dateKey: string) => ({
    dateKey,
    total: 0,
    working: 0,
    review: 0,
    verified: 0,
    tasks: [] as TaskDirectoryItem[],
  });
  const monthCalendarCells = calendarBaseCells.map((cell) => ({
    ...cell,
    plan: calendarPlanByDate.get(cell.dateKey) ?? emptyCalendarItem(cell.dateKey),
  }));
  const weekCalendarItems = buildWeekDateKeys(calendarAnchorDateKey).map(
    (dateKey) => calendarPlanByDate.get(dateKey) ?? emptyCalendarItem(dateKey),
  );

  const taskListParams = new URLSearchParams();
  if (!workerMode && selectedDepartmentParam) {
    taskListParams.set("department", selectedDepartmentParam);
  }
  if (!workerMode && activeFilter !== "all") {
    taskListParams.set("filter", activeFilter);
  }
  if (quickActionMode !== "none") {
    taskListParams.set("quickAction", quickActionMode);
  }
  if (workerMode && requestedWorkName) {
    taskListParams.set("work", requestedWorkName);
  }
  const taskListHref = taskListParams.toString() ? `/tasks?${taskListParams.toString()}` : "/tasks";
  const buildTaskHref = (taskHref: string) => {
    if (quickActionMode !== "report") {
      return taskHref;
    }

    const hrefParams = new URLSearchParams();
    hrefParams.set("composer", "report");
    hrefParams.set("returnTo", taskListHref);
    return `${taskHref}?${hrefParams.toString()}`;
  };
  const projectByName = new Map(snapshot.projects.map((project) => [project.name, project]));
  const workerWorkGroups = workerMode
    ? Array.from(
        visibleTasks
          .reduce<
            Map<
              string,
              {
                name: string;
                departmentName: string;
                manager: string;
                href: string;
                tasks: TaskDirectoryItem[];
              }
            >
          >((groups, task) => {
            const project = projectByName.get(task.projectName);
            const existing = groups.get(task.projectName) ?? {
              name: task.projectName,
              departmentName: project?.departmentName ?? task.departmentName,
              manager: project?.manager ?? task.leaderName,
              href: project?.href ?? task.href,
              tasks: [],
            };

            existing.tasks.push(task);
            groups.set(task.projectName, existing);
            return groups;
          }, new Map())
          .values(),
      ).map((group) => ({
        ...group,
        tasks: group.tasks.sort((left, right) => {
          const leftTime = left.deadlineDateTime ?? "";
          const rightTime = right.deadlineDateTime ?? "";
          return leftTime.localeCompare(rightTime) || left.name.localeCompare(right.name, "mn");
        }),
      }))
    : [];
  const workerDoneTaskCount = workerMode
    ? visibleWorkerTasks.filter((task) => task.statusKey === "verified").length
    : 0;
  const workerReviewTaskCount = workerMode
    ? visibleWorkerTasks.filter((task) => task.statusKey === "review").length
    : 0;
  const workerOpenTaskCount = workerMode
    ? Math.max(visibleWorkerTasks.length - workerDoneTaskCount, 0)
    : 0;
  const workerAverageProgress =
    workerMode && visibleWorkerTasks.length
      ? Math.round(
          visibleWorkerTasks.reduce((total, task) => total + task.progress, 0) /
            visibleWorkerTasks.length,
        )
      : 0;
  const primaryWorkerWork = workerWorkGroups[0] ?? null;

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
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              workerMode={workerMode}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <div className={workerMode ? styles.workerDesktopHeader : undefined}>
              <WorkspaceHeader
                title={masterMode ? "Өнөөдрийн ажил" : "Даалгавар"}
                subtitle={
                  masterMode
                    ? "Өнөөдөр явах ажил, төслийн урсгал"
                    : workerMode
                      ? "Танд оноогдсон даалгаврын жагсаалт"
                      : "Хэлтсийн даалгаврын өдөр тутмын урсгал"
                }
                userName={session.name}
                roleLabel={getRoleLabel(session.role)}
                notificationCount={masterMode ? visibleProjects.length : visibleTasks.length}
                notificationNote={
                  masterMode
                    ? `${visibleProjects.length} ажил, төсөл өнөөдөр харагдаж байна`
                    : `${visibleTasks.length} даалгавар одоогоор харагдаж байна`
                }
              />
            </div>

            {workerMode ? (
              <section className={styles.workerMobileHome} aria-label="Ажилтны mobile нүүр">
                <div className={styles.workerMobileTop}>
                  <Image
                    src="/logo.png"
                    alt="Хот тохижилт үйлчилгээний төв"
                    width={156}
                    height={54}
                    className={styles.workerMobileLogo}
                    priority
                  />
                  <Link
                    href="/notifications"
                    className={styles.workerMobileNotice}
                    aria-label={`${visibleTasks.length} мэдэгдэл харах`}
                  >
                    <Bell size={21} strokeWidth={2.35} aria-hidden="true" />
                    {visibleTasks.length ? <span>{visibleTasks.length}</span> : null}
                  </Link>
                </div>

                <div className={styles.workerGreeting}>
                  <span>Сайн байна уу,</span>
                  <h1>
                    {session.name}
                    <Leaf size={22} strokeWidth={2.4} aria-hidden="true" />
                  </h1>
                  <p>
                    {scopedDepartmentName ||
                      primaryWorkerWork?.departmentName ||
                      getRoleLabel(session.role)}
                  </p>
                </div>

                <article className={styles.workerDepartmentHero}>
                  <div>
                    <span>Доторх нэгж</span>
                    <strong>
                      {scopedDepartmentName || primaryWorkerWork?.departmentName || "Миний ажлын нэгж"}
                    </strong>
                    <p>Энэ нэгж дотор танд оноогдсон ажлууд нэг дор харагдана.</p>
                    <Link href="/tasks" className={styles.workerHeroPill}>
                      Бүгд <strong>{workerWorkGroups.length}</strong>
                      <ChevronRight size={16} strokeWidth={2.5} aria-hidden="true" />
                    </Link>
                  </div>
                  <span className={styles.workerHeroScene} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </article>

                <section className={styles.workerWeatherCard} aria-label="Өнөөдрийн богино тойм">
                  <div>
                    <span>Өнөөдөр</span>
                    <strong>
                      <Sun size={28} strokeWidth={2.3} aria-hidden="true" />
                      {visibleWorkerTasks.length} даалгавар
                    </strong>
                    <small>Явц {workerAverageProgress}% · Хянагдаж буй {workerReviewTaskCount}</small>
                  </div>
                  <span className={styles.workerAqiBadge}>Нээлттэй {workerOpenTaskCount}</span>
                </section>
              </section>
            ) : null}

            {!workerMode ? (
              <section className={styles.calendarPanel}>
                <div className={styles.filterHeader}>
                  <div>
                    <span className={styles.filterKicker}>Календар төлөвлөгөө</span>
                    <h2>{selectedDepartmentLabel}</h2>
                  </div>
                </div>

                {calendarPlanItems.length ? (
                  <div className={styles.calendarTimelineBoard}>
                    <input
                      className={`${styles.calendarViewInput} ${styles.calendarMonthToggle}`}
                      type="radio"
                      name="calendar-view"
                      id="calendar-view-month"
                      defaultChecked
                    />
                    <input
                      className={`${styles.calendarViewInput} ${styles.calendarWeekToggle}`}
                      type="radio"
                      name="calendar-view"
                      id="calendar-view-week"
                    />
                    <div className={styles.calendarToolbar}>
                      <div className={styles.calendarViewControls} aria-label="Календарын харагдац">
                        <label htmlFor="calendar-view-month">Сар</label>
                        <label htmlFor="calendar-view-week">7 хоног</label>
                      </div>
                      {canCreateFromCalendar ? (
                        <Link href={calendarCreateHref} className={styles.calendarCreateButton}>
                          Ажил нэмэх
                        </Link>
                      ) : null}
                    </div>

                    <div className={styles.calendarViewPanels}>
                    <section className={`${styles.workCalendar} ${styles.calendarViewPanel} ${styles.calendarMonthPanel}`}>
                      <div className={styles.workCalendarTop}>
                        <div className={styles.workCalendarBrand}>
                          <span className={styles.workCalendarLogo} aria-hidden="true">◷</span>
                          <div>
                            <span>Сарын календарь</span>
                            <h3>{getCalendarMonthLabel(calendarAnchorDateKey)}</h3>
                          </div>
                        </div>
                        <div className={styles.calendarLegend}>
                          <span><i className={styles.legendWorking} /> Явж байгаа</span>
                          <span><i className={styles.legendReview} /> Хянах</span>
                          <span><i className={styles.legendDone} /> Дууссан</span>
                        </div>
                      </div>

                      <div className={styles.monthCalendar} aria-label="Сарын ажлын календарь">
                        {["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"].map((day) => (
                          <span key={day} className={styles.monthWeekday}>{day}</span>
                        ))}
                        {monthCalendarCells.map((cell) => (
                          <article
                            key={cell.dateKey}
                            className={`${styles.monthDay} ${!cell.inMonth ? styles.monthDayMuted : ""} ${
                              cell.isToday ? styles.monthDayToday : ""
                            }`}
                          >
                            <div className={styles.monthDayHeader}>
                              <span>{cell.dayNumber}</span>
                              {cell.plan.total > 0 ? <strong>{cell.plan.total}</strong> : null}
                            </div>
                            <div className={styles.monthDayTasks}>
                              {cell.plan.tasks.slice(0, 2).map((task) => (
                                <Link
                                  key={`month-${cell.dateKey}-${task.id}`}
                                  href={buildTaskHref(task.href)}
                                  className={`${styles.monthTask} ${styles[`monthTask${task.statusKey}`]}`}
                                >
                                  <span>{task.name}</span>
                                  <small>{formatTimelineTime(task.deadlineDateTime)}</small>
                                </Link>
                              ))}
                              {cell.plan.tasks.length > 2 ? (
                                <a href={`#calendar-day-${cell.dateKey}`} className={styles.monthMore}>
                                  +{cell.plan.tasks.length - 2} даалгавар
                                </a>
                              ) : cell.plan.tasks.length === 0 && canCreateFromCalendar ? (
                                <Link href={calendarCreateHref} className={styles.calendarEmptyCreate}>
                                  Ажил нэмэх
                                </Link>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className={`${styles.weekCalendar} ${styles.calendarViewPanel} ${styles.calendarWeekPanel}`}>
                      <div className={styles.weekCalendarTop}>
                        <div className={styles.weekCalendarTitle}>
                          <span className={styles.filterKicker}>7 хоног</span>
                          <h3>Долоо хоногийн календарь</h3>
                        </div>
                      </div>

                      <div className={styles.weekGridCalendar} aria-label="Долоо хоногийн ажлын календарь">
                        {weekCalendarItems.map((item) => (
                          <article key={`week-${item.dateKey}`} id={`calendar-day-${item.dateKey}`} className={styles.weekDayCard}>
                            {(() => {
                              const label = formatWeekdayLabel(item.dateKey);

                              return (
                                <div className={styles.weekDayHeader}>
                                  <div>
                                    <strong>{label.day}</strong>
                                    <span>{label.weekday}</span>
                                  </div>
                                  {item.total > 0 ? <em>{item.total}</em> : null}
                                </div>
                              );
                            })()}

                            <div className={styles.weekDayTasks}>
                              {item.tasks.length ? (
                                item.tasks.map((task) => (
                                  <Link
                                    key={`${item.dateKey}-${task.id}`}
                                    href={buildTaskHref(task.href)}
                                    className={`${styles.weekTask} ${styles[`monthTask${task.statusKey}`]}`}
                                  >
                                    <span>{task.name}</span>
                                    <small>{formatTimelineTime(task.deadlineDateTime)} • Явц {task.progress}%</small>
                                  </Link>
                                ))
                              ) : canCreateFromCalendar ? (
                                <Link href={calendarCreateHref} className={styles.weekEmptyCreate}>
                                  Ажил нэмэх
                                </Link>
                              ) : (
                                <span className={styles.weekEmpty}>Даалгавар алга</span>
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                    </div>
                  </div>
                ) : (
                  <div className={styles.calendarEmpty}>
                    Энэ хүрээнд огноотой календарь төлөвлөгөө одоогоор алга байна.
                  </div>
                )}
              </section>
            ) : null}

            {!workerMode ? (
            <header className={styles.pageHeader}>
              <div className={styles.pageHeaderMain}>
                <div className={styles.titleBlock}>
                  <span className={styles.pageKicker}>
                    {workerMode ? "Миний урсгал" : masterMode ? "Мастерын урсгал" : "Бүх урсгал"}
                  </span>
                   <h1>
                     {workerMode
                       ? "Надад оноогдсон даалгавар"
                       : masterMode
                        ? "Өнөөдрийн ажил"
                        : "Бүх даалгавар"}
                   </h1>
                   <p>
                     {workerMode
                       ? "Зөвхөн танд хамаарах даалгавруудыг эндээс харна. Төлөвөөр нь хурдан шүүж, дэлгэрэнгүй рүү шууд орж ажлаа үргэлжлүүлнэ."
                       : masterMode
                        ? "Мастер хэрэглэгчид зөвхөн өөрийн алба нэгжийн өнөөдөр явах ажил, төслүүд харагдана. Ажил дээр дарахад тухайн ажлын доторх даалгавар руу орно."
                        : "Odoo ERP дээр бүртгэгдсэн бүх даалгаврыг алба нэгж, ажил, төлөвөөр нь нэг дороос харуулна. Асуудалтай болон хяналт хүлээж буй даалгавруудыг эхэнд нь ялгаж, дэлгэрэнгүй рүү шууд нээнэ."}
                   </p>
                </div>

                <div className={styles.userBlock}>
                  <span>Сүүлд шинэчлэгдсэн</span>
                  <strong>{snapshot.generatedAt}</strong>
                  <small>{selectedDepartmentLabel}</small>
                </div>
              </div>

              {!masterMode && !departmentScopedMode ? (
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
                          defaultValue={selectedDepartmentParam || "all"}
                          className={styles.dateInput}
                        >
                          <option value="all">Бүх алба хэлтэс</option>
                          {DEPARTMENT_GROUPS.map((group) => (
                            <option key={group.name} value={group.name}>
                              {group.name}
                            </option>
                          ))}
                          {DEPARTMENT_GROUPS.flatMap((group) =>
                            group.units.map((unit) => (
                              <option key={`${group.name}:${unit}`} value={unit}>
                                {unit}
                              </option>
                            )),
                          )}
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
            ) : null}

            {!workerMode ? (
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
                    ? "Зөвхөн танд оноогдсон даалгавруудыг харуулж байна"
                    : masterMode
                      ? "Мастер хэрэглэгчид зөвхөн өөрийн нэгжийн өнөөдөр явах ажил харагдана"
                    : `${snapshot.departments.length} алба нэгжээс шүүж байна`}
                </small>
              </article>
              <article className={styles.summaryCard}>
                <span>
                  {workerMode
                    ? "Надад оноогдсон даалгавар"
                    : masterMode
                      ? "Өнөөдөр явах ажил"
                      : "Нийт даалгавар"}
                </span>
                <strong>{counts.all}</strong>
                <small>
                  {workerMode
                    ? "Тухайн хэрэглэгчид оноогдсон нийт даалгавар"
                    : masterMode
                      ? "Өнөөдөр эхлэх эсвэл үргэлжлэх ажил, төслийн тоо"
                    : "Odoo ERP-ээс орж ирсэн бүх даалгавар"}
                </small>
              </article>
              <article className={styles.summaryCard}>
                <span>
                  {workerMode
                    ? "Холбогдсон ажил"
                    : masterMode
                      ? "Өнөөдрийн даалгавар"
                      : "Нийт ажил"}
                </span>
                <strong>{masterMode ? masterTodayTasks.length : scopedProjects.length}</strong>
                <small>
                  {workerMode
                    ? "Эдгээр ажилд таны даалгаврууд багтаж байна"
                    : masterMode
                      ? "Өнөөдөр эдгээр ажилд харагдах нийт даалгавар"
                      : "Энэ шүүлтэд хамаарах ажлууд"}
                </small>
              </article>
            </section>
            ) : null}

            {!workerMode ? (
            <section className={styles.filterPanel} aria-label="Ажлын төлөвөөр шүүх">
              <div className={styles.filterScroller}>
                {FILTERS.map((filter) => {
                  const params = new URLSearchParams();
                  if (!workerMode && selectedDepartmentParam) {
                    params.set("department", selectedDepartmentParam);
                  }
                  if (filter.key !== "all") {
                    params.set("filter", filter.key);
                  }
                  if (quickActionMode !== "none") {
                    params.set("quickAction", quickActionMode);
                  }
                  const href = params.toString() ? `/tasks?${params.toString()}` : "/tasks";

                  return (
                    <Link
                      key={filter.key}
                      href={href}
                      className={`${styles.filterChip} ${
                        selectedFilter === filter.key ? styles.filterChipActive : ""
                      }`}
                    >
                      <span>{filter.label}</span>
                      <strong>{counts[filter.key]}</strong>
                    </Link>
                  );
                })}
              </div>
            </section>
            ) : null}

            {workerMode ? (
              <section className={`${styles.taskSection} ${styles.workerWorkSection}`}>
                <div className={`${styles.sectionHeader} ${styles.workerHeroHeader}`}>
                  <div>
                    <span className={styles.filterKicker}>Ажилчны урсгал</span>
                    <h2>Миний ажлууд</h2>
                    <p>Өнөөдрийн оноогдсон ажил ба тайлангийн дараалал.</p>
                  </div>
                  <div className={styles.workerHeroSummary} aria-label="Ажилтны өнөөдрийн тойм">
                    <span>
                      <strong>{workerWorkGroups.length}</strong>
                      ажил
                    </span>
                    <span>
                      <strong>{visibleWorkerTasks.length}</strong>
                      даалгавар
                    </span>
                  </div>
                </div>

                {workerWorkGroups.length ? (
                  <div className={styles.workerWorkList}>
                    {workerWorkGroups.map((work) => {
                      const reviewCount = work.tasks.filter((task) => task.statusKey === "review").length;
                      const doneCount = work.tasks.filter((task) => task.statusKey === "verified").length;
                      const openCount = Math.max(work.tasks.length - doneCount, 0);
                      const nextTask = work.tasks.find((task) => task.statusKey !== "verified") ?? work.tasks[0];
                      const progress = work.tasks.length
                        ? Math.round(
                            work.tasks.reduce((total, task) => total + task.progress, 0) /
                              work.tasks.length,
                          )
                        : 0;

                      return (
                        <article key={work.name} className={styles.workerWorkCard}>
                          <div className={styles.workerWorkTop}>
                            <span className={styles.workerWorkIcon} aria-hidden="true">
                              <ClipboardCheck size={22} strokeWidth={2.4} />
                            </span>
                            <div className={styles.taskIdentity}>
                              <span>Ажил</span>
                              <strong>{work.name}</strong>
                              <small>{work.departmentName}</small>
                            </div>
                            <span className={styles.workerProgressBadge}>{progress}%</span>
                          </div>

                          <div className={styles.workerWorkStats}>
                            <span>
                              <strong>{openCount}</strong>
                              хийх
                            </span>
                            <span>
                              <strong>{reviewCount}</strong>
                              Хянагдаж буй
                            </span>
                            <span>
                              <strong>{doneCount}</strong>
                              Дууссан
                            </span>
                          </div>

                          {nextTask ? (
                            <TaskReportModal
                              action={createTaskReportAction}
                              taskId={Number(nextTask.id)}
                              simpleMobile
                              workItemName={nextTask.name}
                              triggerClassName={styles.workerPrimaryTask}
                              triggerContent={
                                <>
                                  <span className={styles.workerPrimaryIcon} aria-hidden="true">
                                    <Send size={18} strokeWidth={2.5} />
                                  </span>
                                  <span>
                                    <small>Дараагийн даалгавар</small>
                                    <strong>{nextTask.name}</strong>
                                  </span>
                                  <ChevronRight size={20} strokeWidth={2.4} aria-hidden="true" />
                                </>
                              }
                            />
                          ) : null}

                          <div className={styles.workerLineListHeader}>
                            <span>{work.tasks.length} даалгавар</span>
                            <small>Тайлан хүлээж буй даалгавар</small>
                          </div>
                          <div className={styles.workerLineList}>
                            {work.tasks.map((task, index) => (
                              <TaskReportModal
                                key={task.id}
                                action={createTaskReportAction}
                                taskId={Number(task.id)}
                                simpleMobile
                                workItemName={task.name}
                                triggerClassName={styles.workerLineItem}
                                triggerContent={
                                  <>
                                    <span className={styles.workerTaskNumber}>{index + 1}</span>
                                    <div>
                                      <strong>{task.name}</strong>
                                      <small>
                                        <Clock3 size={14} strokeWidth={2.3} aria-hidden="true" />
                                        {task.deadline} · {task.statusLabel}
                                      </small>
                                    </div>
                                    <span className={styles.workerLineAction}>
                                      <CheckCircle2 size={16} strokeWidth={2.4} aria-hidden="true" />
                                      Тайлан
                                    </span>
                                  </>
                                }
                              />
                            ))}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <h3>Одоогоор ажил алга</h3>
                    <p>Танд оноосон ажил орж ирэхэд энд даалгавруудтайгаа харагдана.</p>
                  </div>
                )}
              </section>
            ) : masterMode ? (
              <section className={styles.taskSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span className={styles.filterKicker}>Мастерын урсгал</span>
                    <h2>Өнөөдрийн ажлууд</h2>
                  </div>
                </div>

                {visibleProjects.length ? (
                  <div className={styles.projectList}>
                    {visibleProjects.map((project) => (
                      <Link key={project.id} href={project.href} className={`${styles.taskCard} ${styles.projectCardLink}`}>
                        <div className={styles.taskCardTop}>
                          <div className={styles.taskIdentity}>
                            <span>{project.departmentName}</span>
                            <strong>{project.name}</strong>
                          </div>
                          <span className={styles.statusChip}>{project.stageLabel}</span>
                        </div>
                        <div className={styles.taskInfoGrid}>
                          <span className={styles.taskInfoItem}>
                            <span>Даалгавар</span>
                            <strong>{project.todayTaskCount}</strong>
                          </span>
                          <span className={styles.taskInfoItem}>
                            <span>Нээлттэй</span>
                            <strong>{project.openTasks}</strong>
                          </span>
                          <span className={styles.taskInfoItem}>
                            <span>Гүйцэтгэл</span>
                            <strong>{project.completion}%</strong>
                          </span>
                        </div>
                        <span className={styles.projectOpenLabel}>Даалгаврууд харах</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <h3>Өнөөдөр ажил алга</h3>
                    <p>Сонгосон шүүлтэд таарах ажил одоогоор харагдахгүй байна.</p>
                  </div>
                )}
              </section>
            ) : (
              <section className={styles.taskSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span className={styles.filterKicker}>Даалгаврын жагсаалт</span>
                    <h2>{selectedDepartmentLabel}</h2>
                  </div>
                </div>

                {visibleTasks.length ? (
                  <div className={styles.taskCardList}>
                    {visibleTasks.map((task) => (
                      <Link key={task.id} href={buildTaskHref(task.href)} className={`${styles.taskCard} ${styles.projectCardLink}`}>
                        <div className={styles.taskCardTop}>
                          <div className={styles.taskIdentity}>
                            <span>{task.projectName}</span>
                            <strong>{task.name}</strong>
                          </div>
                          <span className={styles.statusChip}>{task.statusLabel}</span>
                        </div>
                        <div className={styles.taskInfoGrid}>
                          <span className={styles.taskInfoItem}>
                            <span>Хугацаа</span>
                            <strong>{task.deadline}</strong>
                          </span>
                          <span className={styles.taskInfoItem}>
                            <span>Хариуцагч</span>
                            <strong>{task.leaderName || "Сонгоогүй"}</strong>
                          </span>
                          <span className={styles.taskInfoItem}>
                            <span>Явц</span>
                            <strong>{task.progress}%</strong>
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <h3>Даалгавар алга</h3>
                    <p>Сонгосон шүүлтэд таарах даалгавар одоогоор харагдахгүй байна.</p>
                  </div>
                )}
              </section>
            )}


          </div>
        </div>
      </div>
    </main>
  );
}
