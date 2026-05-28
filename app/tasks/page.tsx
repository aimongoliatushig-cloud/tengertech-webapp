import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Leaf,
  ListChecks,
  MapPin,
  Plus,
  Sun,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import {
  createTaskReportAction,
  deleteTaskReportAction,
  updateTaskReportAction,
} from "@/app/actions";
import shellStyles from "@/app/workspace.module.css";
import {
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
  getSessionRoleLabel,
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
import { loadMunicipalSnapshot, type DashboardSnapshot, type TaskDirectoryItem } from "@/lib/odoo";
import {
  filterProjectsForResponsibleMaster,
  filterTasksForResponsibleMaster,
} from "@/lib/master-scope";
import { loadWorkspaceNotificationSummary } from "@/lib/workspace-notifications";

import styles from "./tasks.module.css";
import { TaskReportModal } from "./[taskId]/task-report-modal";

type FilterKey = "all" | "working" | "review" | "problem" | "verified";
type MasterTabKey = "today" | "review";
type MasterStatusFilter = "all" | "todo" | "progress" | "review" | "done";
type QuickActionMode = "none" | "report";

type PageProps = {
  searchParams?: Promise<{
    department?: string | string[];
    filter?: string | string[];
    tab?: string | string[];
    quickAction?: string | string[];
    work?: string | string[];
    workId?: string | string[];
    q?: string | string[];
    status?: string | string[];
    employee?: string | string[];
  }>;
};

type SnapshotProject = Awaited<ReturnType<typeof loadMunicipalSnapshot>>["projects"][number];
type ReviewQueueItem = DashboardSnapshot["reviewQueue"][number];

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
  areaName: string;
  employeeName: string;
  areaM2: number;
  workDate: string;
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

function normalizeMasterTab(value: string, seniorMasterMode: boolean): MasterTabKey {
  return seniorMasterMode && value === "review" ? "review" : "today";
}

function normalizeMasterStatus(value: string): MasterStatusFilter {
  return value === "todo" || value === "progress" || value === "review" || value === "done"
    ? value
    : "all";
}

function normalizeQuickAction(value: string): QuickActionMode {
  return value === "report" ? "report" : "none";
}

function parseRoadCleaningProjectName(name: string) {
  const parts = name.split(" - ").map((part) => part.trim()).filter(Boolean);
  return {
    areaName: parts[0] ?? name,
    employeeName: parts[1] ?? "",
    workDate: parts[2] ?? "",
  };
}

function formatAreaM2(value: number) {
  if (!value) {
    return "—";
  }
  return `${new Intl.NumberFormat("mn-MN").format(Math.round(value))} м²`;
}

function getMasterStatusLabel(bucket: TodayProjectSummary["stageBucket"]) {
  if (bucket === "done") {
    return "Дууссан";
  }
  if (bucket === "review") {
    return "Хяналтанд";
  }
  if (bucket === "progress") {
    return "Ажиллаж буй";
  }
  return "Эхлээгүй";
}

function getMasterStatusFilter(bucket: TodayProjectSummary["stageBucket"]): MasterStatusFilter {
  if (bucket === "done" || bucket === "review" || bucket === "progress") {
    return bucket;
  }
  return "todo";
}

function getReviewTaskArea(task: Pick<ReviewQueueItem, "projectName">) {
  return parseRoadCleaningProjectName(task.projectName).areaName;
}

function getReviewTaskEmployee(task: Pick<ReviewQueueItem, "projectName" | "leaderName">) {
  return task.leaderName || parseRoadCleaningProjectName(task.projectName).employeeName;
}

function isTaskAssignedToInspector(task: TaskDirectoryItem, userId: number) {
  return Boolean(task.assigneeIds?.includes(userId) || task.inspectorUserId === userId);
}

function isInspectorSubmittedTask(task: TaskDirectoryItem, userId: number) {
  if (!isTaskAssignedToInspector(task, userId)) {
    return false;
  }

  return (
    task.statusKey === "review" ||
    task.statusKey === "problem" ||
    task.statusKey === "verified" ||
    Boolean(task.latestReport)
  );
}

function normalizeWorkName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("mn-MN");
}

function normalizeIdParam(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function workerTaskActionLabel(task: TaskDirectoryItem) {
  if (task.statusKey === "verified") {
    return "Баталгаажсан";
  }
  if (task.statusKey === "review") {
    return "Илгээсэн";
  }
  if (task.statusKey === "problem") {
    return "Засах";
  }
  return "Тайлан";
}

function workerTaskReturnReason(task: TaskDirectoryItem) {
  if (task.statusKey !== "problem") {
    return "";
  }
  return task.latestReport?.rejectionReason?.trim() || "Засвар нэхэж буцаасан байна.";
}

function isFutureWorkerTask(task: TaskDirectoryItem, todayDateKey: string) {
  return Boolean(task.scheduledDate && task.scheduledDate > todayDateKey);
}

function workerTaskBlockedReportReason(task: TaskDirectoryItem, todayDateKey: string) {
  if (!isFutureWorkerTask(task, todayDateKey)) {
    return "";
  }
  return "Тайланг төлөвлөсөн өдөр оруулна.";
}

function workerTaskVisibleNote(task: TaskDirectoryItem, todayDateKey: string) {
  return workerTaskReturnReason(task) || workerTaskBlockedReportReason(task, todayDateKey);
}

function workerTaskVisibleActionLabel(task: TaskDirectoryItem, todayDateKey: string) {
  if (isFutureWorkerTask(task, todayDateKey)) {
    return "Хүлээгдэж байна";
  }
  return workerTaskActionLabel(task);
}

function getWorkerExistingReport(task: TaskDirectoryItem) {
  if (!task.latestReport) {
    return undefined;
  }
  if (task.statusKey !== "problem") {
    return task.latestReport;
  }
  return {
    ...task.latestReport,
    stateBucket: "problem" as const,
    rejectionReason: task.latestReport.rejectionReason?.trim() || "",
  };
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
    return "Огноо";
  }

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return "Огноо";
  }

  return new Intl.DateTimeFormat("mn-MN", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Ulaanbaatar",
  }).format(parsed);
}

function isGarbageTransportTask(task: TaskDirectoryItem) {
  return task.operationType === "garbage" || task.operationType === "garbage_seasonal";
}

function garbagePointIssueCount(task: TaskDirectoryItem) {
  return (
    (task.unresolvedStopCount ?? 0) +
    (task.missingProofStopCount ?? 0) +
    (task.deviationStopCount ?? 0)
  );
}

function garbagePointSummary(task: TaskDirectoryItem) {
  if (!isGarbageTransportTask(task)) {
    return task.operationTypeLabel || "Даалгавар";
  }

  const issueCount = garbagePointIssueCount(task);
  if (issueCount > 0) {
    return `${issueCount} цэг анхаарах`;
  }

  const roundedQuantity = Math.round(task.plannedQuantity || 0);
  if (roundedQuantity > 0 && task.measurementUnit.includes("цэг")) {
    return `${roundedQuantity} хогийн цэг`;
  }

  return "Хогийн цэгүүд";
}

function taskProofSummary(task: TaskDirectoryItem) {
  const report = task.latestReport;
  if (!report) {
    return "Нотолгоо хүлээгдэж байна";
  }

  const parts = [
    report.imageCount ? `${report.imageCount} зураг` : "",
    report.audioCount ? `${report.audioCount} аудио` : "",
  ].filter(Boolean);

  if (isGarbageTransportTask(task) && task.completedQuantity > 0) {
    parts.push(`${Math.round(task.completedQuantity * 10) / 10} ${task.measurementUnit}`);
  }

  return parts.length ? parts.join(" · ") : "Тайлан ирсэн";
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
      const projectParts = parseRoadCleaningProjectName(task.projectName);
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
        areaName: projectParts.areaName,
        employeeName: projectParts.employeeName || task.leaderName,
        areaM2: 0,
        workDate: projectParts.workDate || task.scheduledDate || task.deadline,
        stageLabel: "Хийгдэх",
      };

      existing.todayTaskCount += 1;
      existing.progressTotal += task.progress;
      existing.areaM2 = Math.max(existing.areaM2, Number(task.plannedQuantity) || 0);
      if (!existing.employeeName) {
        existing.employeeName = task.leaderName;
      }
      if (!existing.workDate) {
        existing.workDate = task.scheduledDate || task.deadline;
      }

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
  const requestedWorkId = normalizeIdParam(getParam(params.workId));
  const masterSearchQuery = getParam(params.q).trim();
  const masterStatusFilter = normalizeMasterStatus(getParam(params.status));
  const masterEmployeeFilter = getParam(params.employee).trim();
  const requestedWorkNameKey = normalizeWorkName(requestedWorkName);
  const hasRequestedWorkerWork = Boolean(requestedWorkId || requestedWorkNameKey);
  const todayDateKey = getTodayDateKey();
  const calendarAnchorDateKey = todayDateKey;
  const calendarBaseCells = buildMonthCells(calendarAnchorDateKey);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const canCreateFromCalendar = canCreateProject || canCreateTasks;
  const calendarCreateHref = canCreateProject ? "/projects/new" : "/create";
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  const seniorMasterMode = session.role === "senior_master";
  const masterTab = normalizeMasterTab(getParam(params.tab), seniorMasterMode);
  const inspectorMobileMode =
    !workerMode &&
    !masterMode &&
    Boolean(session.role === "transport_inspector" || session.groupFlags?.mfoInspector);

  let snapshot: DashboardSnapshot;
  let scopedDepartmentName: Awaited<ReturnType<typeof loadSessionDepartmentName>>;
  const scopedDepartmentNamePromise = loadSessionDepartmentName(session);

  try {
    [snapshot, scopedDepartmentName] = await Promise.all([
      loadMunicipalSnapshot(
        {
          login: session.login,
          password: session.password,
        },
        { allowFallback: false },
      ),
      scopedDepartmentNamePromise,
    ]);
  } catch (error) {
    console.error("Tasks page data load failed:", error);

    return (
      <main className={shellStyles.shell}>
        <div className={shellStyles.container}>
          <div className={shellStyles.contentWithMenu}>
            <aside className={shellStyles.menuColumn}>
              <AppMenu
                active="tasks"
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
                workerMode={workerMode}
                notificationCount={0}
              />
            </aside>

            <div className={shellStyles.pageContent}>
              <WorkspaceHeader
                title="Даалгавар"
                subtitle="Танд оноогдсон даалгаврын жагсаалт"
                userName={session.name}
                roleLabel={getSessionRoleLabel(session)}
                notificationCount={0}
                notificationNote="Мэдээлэл түр ачаалсангүй"
              />

              <section className={styles.taskSection}>
                <div className={styles.emptyState}>
                  <h3>Ажлын мэдээлэл түр ачаалсангүй</h3>
                  <p>Мэдээлэл авахад хугацаа хэтэрлээ. Дахин ачаалаад үзнэ үү.</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    );
  }
  const notificationSummaryPromise = loadWorkspaceNotificationSummary(session, {
    snapshot,
    scopedDepartmentName,
  });
  const sourceTaskDirectory = snapshot.taskDirectory;

  const selectedFilter: FilterKey = workerMode || masterMode ? "all" : activeFilter;
  const notificationSummary = await notificationSummaryPromise;
  const taskNotificationNote =
    notificationSummary.unreadCount > 0
      ? `${notificationSummary.newCount} шинэ ажил, ${notificationSummary.reviewCount} хянах, ${notificationSummary.overdueCount} хугацаа хэтэрсэн`
      : "Шинэ мэдэгдэл алга";
  const departmentScopedMode = Boolean(scopedDepartmentName);
  const quickActionMode: QuickActionMode =
    workerMode && canWriteReports ? requestedQuickAction : "none";
  const assignedWorkerTasks = workerMode
    ? sourceTaskDirectory.filter((task) => task.assigneeIds?.includes(session.uid))
    : [];
  const workerTasks = workerMode
    ? hasRequestedWorkerWork
      ? assignedWorkerTasks
      : filterTasksToDate(assignedWorkerTasks, todayDateKey)
    : [];
  const inspectorSubmittedTasks = inspectorMobileMode
    ? sourceTaskDirectory.filter((task) => isInspectorSubmittedTask(task, session.uid))
    : [];
  const inspectorTodayCreatedTasks = inspectorMobileMode
    ? sourceTaskDirectory
        .filter(
          (task) =>
            isTaskAssignedToInspector(task, session.uid) &&
            task.createdDate === todayDateKey &&
            !isInspectorSubmittedTask(task, session.uid),
        )
        .slice(0, 3)
    : [];
  const visibleWorkerTasks =
    workerMode && hasRequestedWorkerWork
      ? workerTasks.filter(
          (task) =>
            (requestedWorkId !== null && task.projectId === requestedWorkId) ||
            (requestedWorkNameKey && normalizeWorkName(task.projectName) === requestedWorkNameKey),
        )
      : workerTasks;
  const masterDepartmentProjects = masterMode
    ? filterByDepartment(snapshot.projects, scopedDepartmentName)
    : [];
  const masterDepartmentTasks = masterMode
    ? filterByDepartment(sourceTaskDirectory, scopedDepartmentName)
    : [];
  const personalMasterTasks = masterMode
    ? filterTasksForResponsibleMaster(masterDepartmentTasks, masterDepartmentProjects, session)
    : [];
  const personalMasterProjects = masterMode
    ? filterProjectsForResponsibleMaster(masterDepartmentProjects, masterDepartmentTasks, session)
    : [];
  const masterTodayTasks = masterMode
    ? filterTasksToDate(masterDepartmentTasks, todayDateKey)
    : [];
  const personalMasterTodayTasks = masterMode
    ? filterTasksToDate(personalMasterTasks, todayDateKey)
    : [];
  const masterTodayProjects = masterMode
    ? buildTodayProjectSummaries(
        masterTodayTasks,
        masterDepartmentProjects,
      )
    : [];
  const personalMasterTodayProjects = masterMode
    ? buildTodayProjectSummaries(personalMasterTodayTasks, personalMasterProjects)
    : [];
  const seniorMasterReviewTasks = seniorMasterMode
    ? filterByDepartment(snapshot.reviewQueue, scopedDepartmentName)
    : [];
  const showingMasterReviewTab = seniorMasterMode && masterTab === "review";
  const masterDashboardProjects = seniorMasterMode ? masterTodayProjects : personalMasterTodayProjects;

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
      ? masterDepartmentProjects
      : inspectorMobileMode
        ? snapshot.projects.filter((project) =>
            inspectorSubmittedTasks.some((task) => task.projectId === project.id || task.projectName === project.name),
          )
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
      : inspectorMobileMode
        ? inspectorSubmittedTasks
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
        all: masterDashboardProjects.length,
        working: masterDashboardProjects.filter((project) => project.stageBucket === "progress").length,
        review: masterDashboardProjects.filter((project) => project.stageBucket === "review").length,
        problem: masterDashboardProjects.filter((project) => project.stageBucket === "problem").length,
        verified: masterDashboardProjects.filter((project) => project.stageBucket === "done").length,
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
  const inspectorFilterHref = (filter: FilterKey) => {
    const linkParams = new URLSearchParams();
    if (selectedDepartmentParam) {
      linkParams.set("department", selectedDepartmentParam);
    }
    if (filter !== "all") {
      linkParams.set("filter", filter);
    }
    return linkParams.toString() ? `/tasks?${linkParams.toString()}` : "/tasks";
  };
  const inspectorPriorityTasks = inspectorMobileMode ? visibleTasks : scopedTasks.slice(0, 4);
  const visibleProjects = masterDashboardProjects.filter((project) => {
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
  const normalizedMasterSearch = masterSearchQuery.toLocaleLowerCase("mn-MN");
  const masterEmployeeOptions = Array.from(
    new Set(masterDashboardProjects.map((project) => project.employeeName).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, "mn"));
  const masterFilteredProjects = visibleProjects.filter((project) => {
    const matchesSearch =
      !normalizedMasterSearch ||
      [project.name, project.areaName, project.employeeName, project.departmentName]
        .join(" ")
        .toLocaleLowerCase("mn-MN")
        .includes(normalizedMasterSearch);
    const matchesStatus =
      masterStatusFilter === "all" || getMasterStatusFilter(project.stageBucket) === masterStatusFilter;
    const matchesEmployee = !masterEmployeeFilter || project.employeeName === masterEmployeeFilter;
    return matchesSearch && matchesStatus && matchesEmployee;
  });
  const masterAverageProgress = masterDashboardProjects.length
    ? Math.round(
        masterDashboardProjects.reduce((total, project) => total + project.completion, 0) /
          masterDashboardProjects.length,
      )
    : 0;
  const masterDoneProjectCount = masterDashboardProjects.filter(
    (project) => project.stageBucket === "done",
  ).length;
  const masterReviewCount = seniorMasterMode
    ? seniorMasterReviewTasks.length
    : masterDashboardProjects.filter((project) => project.stageBucket === "review").length;
  const filteredSeniorMasterReviewTasks = seniorMasterReviewTasks.filter((task) => {
    const parsedProject = parseRoadCleaningProjectName(task.projectName);
    const taskEmployee = getReviewTaskEmployee(task);
    const matchesSearch =
      !normalizedMasterSearch ||
      [task.projectName, task.name, parsedProject.areaName, taskEmployee]
        .join(" ")
        .toLocaleLowerCase("mn-MN")
        .includes(normalizedMasterSearch);
    const matchesStatus = masterStatusFilter === "all" || masterStatusFilter === "review";
    const matchesEmployee = !masterEmployeeFilter || taskEmployee === masterEmployeeFilter;
    return matchesSearch && matchesStatus && matchesEmployee;
  });

  const selectedDepartmentLabel = workerMode
    ? requestedWorkName || "Надад оноогдсон даалгавар"
    : masterMode
      ? scopedDepartmentName ?? "Миний алба нэгж"
      : inspectorMobileMode
        ? "Миний хянах тайлан"
      : scopedDepartmentName || selectedDepartmentUnit || selectedDepartmentGroup?.name || selectedDepartment?.name || "Бүх алба хэлтэс";
  const masterFlowKicker = seniorMasterMode ? "Ахлах мастерын хяналт" : "Мастерын ажил";
  const masterFlowDescription = seniorMasterMode
    ? "Ахлах мастер өөрийн алба нэгжийн өнөөдөр явах бүх ажил, бүх мастерийн тайланг нэг дор хянана."
    : "Мастер зөвхөн өөрт хариуцуулсан өнөөдрийн ажил, багийн тайлангаа хянана.";
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
  if (workerMode && requestedWorkId !== null) {
    taskListParams.set("workId", String(requestedWorkId));
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
              userRole={session.role}
              roleLabel={getSessionRoleLabel(session)}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              workerMode={workerMode}
              notificationCount={notificationSummary.unreadCount}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div
            className={`${shellStyles.pageContent} ${
              inspectorMobileMode ? styles.inspectorMobilePage : workerMode ? styles.workerMobilePage : ""
            }`}
          >
            {!workerMode && !inspectorMobileMode ? (
              <WorkspaceHeader
                title={masterMode ? "Ажил" : "Даалгавар"}
                subtitle={
                  showingMasterReviewTab
                    ? "Хяналт хүлээж буй тайлантай даалгаврууд"
                    : masterMode
                    ? "Өнөөдрийн зам талбайн цэвэрлэгээний ажил"
                    : workerMode
                      ? "Танд оноогдсон даалгаврын жагсаалт"
                      : "Хэлтсийн даалгаврын өдөр тутмын урсгал"
                }
                userName={session.name}
                roleLabel={getSessionRoleLabel(session)}
                notificationCount={notificationSummary.unreadCount}
                notificationNote={taskNotificationNote}
              />
            ) : null}

            {workerMode ? (
              <section className={styles.workerMobileHome} aria-label="Ажилтны mobile нүүр">
                <div className={styles.workerMobileTop}>
                  <Image
                    src="/logo.png"
                    alt="Хот тохижилт үйлчилгээний төв"
                    width={156}
                    height={54}
                    className={styles.workerMobileLogo}
                    style={{ width: "156px", height: "auto" }}
                    priority
                  />
                  <Link
                    href="/notifications"
                    className={styles.workerMobileNotice}
                    aria-label={`${notificationSummary.unreadCount} мэдэгдэл харах`}
                  >
                    <Bell size={21} strokeWidth={2.35} aria-hidden="true" />
                    {notificationSummary.unreadCount ? (
                      <span>{notificationSummary.unreadCount}</span>
                    ) : null}
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
                      getSessionRoleLabel(session)}
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

            {inspectorMobileMode ? (
              <section className={styles.inspectorMobileHome} aria-label="Хяналтын ажилтны mobile нүүр">
                <div className={styles.inspectorMobileTop}>
                  <div>
                    <span>Хяналтын ажилтан</span>
                    <h1>Хянах ажил</h1>
                  </div>
                </div>

                <div className={styles.inspectorPriorityList}>
                  <div className={styles.inspectorPriorityHead}>
                    <span>Жолоочоос ирсэн тайлан</span>
                    <Link href={inspectorFilterHref("all")}>Бүгд</Link>
                  </div>
                  {inspectorPriorityTasks.length ? (
                    inspectorPriorityTasks.map((task) => (
                      <Link key={`inspector-mobile-${task.id}`} href={buildTaskHref(task.href)} className={styles.inspectorPriorityCard}>
                        <div>
                          <strong>{task.name}</strong>
                          <small>
                            {task.vehicleName || "Машин сонгоогүй"}
                            {task.driverName ? ` · ${task.driverName}` : ""}
                          </small>
                        </div>
                        <span>{task.statusLabel}</span>
                        <p>
                          <MapPin size={14} strokeWidth={2.3} aria-hidden="true" />
                          {garbagePointSummary(task)}
                        </p>
                      </Link>
                    ))
                  ) : (
                    <div className={styles.inspectorEmptyMobile}>Өнөөдөр шалгах даалгавар алга.</div>
                  )}
                </div>

                {inspectorTodayCreatedTasks.length ? (
                  <div className={styles.inspectorTodayCreated}>
                    <div className={styles.inspectorPriorityHead}>
                      <span>Өнөөдөр үүсгэсэн ажил</span>
                      <Link href="/">Нүүр</Link>
                    </div>
                    {inspectorTodayCreatedTasks.map((task) => (
                      <Link
                        key={`inspector-created-${task.id}`}
                        href={buildTaskHref(task.href)}
                        className={styles.inspectorTodayCreatedCard}
                      >
                        <div>
                          <strong>{task.name}</strong>
                          <small>
                            {task.vehicleName || "Машин сонгоогүй"}
                            {task.driverName ? ` · ${task.driverName}` : ""}
                          </small>
                        </div>
                        <span>{task.statusLabel}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {!workerMode && !inspectorMobileMode ? (
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
                          <Plus size={16} aria-hidden="true" />
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
                              {cell.plan.total > 0 ? (
                                <strong>{cell.plan.total}</strong>
                              ) : canCreateFromCalendar ? (
                                <Link
                                  href={calendarCreateHref}
                                  className={styles.calendarDayQuickCreate}
                                  aria-label={`${cell.dateKey} өдөр ажил нэмэх`}
                                  title="Ажил нэмэх"
                                >
                                  <Plus size={15} aria-hidden="true" />
                                </Link>
                              ) : null}
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
                                  {item.total > 0 ? (
                                    <em>{item.total}</em>
                                  ) : canCreateFromCalendar ? (
                                    <Link
                                      href={calendarCreateHref}
                                      className={styles.calendarDayQuickCreate}
                                      aria-label={`${item.dateKey} өдөр ажил нэмэх`}
                                      title="Ажил нэмэх"
                                    >
                                      <Plus size={15} aria-hidden="true" />
                                    </Link>
                                  ) : null}
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

            {!workerMode && !inspectorMobileMode ? (
            <header className={styles.pageHeader}>
              <div className={styles.pageHeaderMain}>
                <div className={styles.titleBlock}>
                  <span className={styles.pageKicker}>
                    {workerMode ? "Миний урсгал" : masterMode ? "Зам талбайн цэвэрлэгээ" : "Бүх урсгал"}
                  </span>
                   <h1>
                     {workerMode
                       ? "Надад оноогдсон даалгавар"
                       : masterMode
                        ? "Ажил"
                        : "Бүх даалгавар"}
                   </h1>
                   <p>
                     {workerMode
                       ? "Зөвхөн танд хамаарах даалгавруудыг эндээс харна. Төлөвөөр нь хурдан шүүж, дэлгэрэнгүй рүү шууд орж ажлаа үргэлжлүүлнэ."
                       : showingMasterReviewTab
                         ? "Ахлах мастерийн нэгжид хяналт хүлээж буй тайлантай ажлууд энд харагдана."
                       : masterMode
                         ? masterFlowDescription
                        : "Бүх даалгаврыг алба нэгж, ажил, төлөвөөр нь нэг дороос харуулна. Асуудалтай болон хяналт хүлээж буй даалгавруудыг эхэнд нь ялгаж, дэлгэрэнгүй рүү шууд нээнэ."}
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
                      <strong>{canUseFieldConsole ? "Өнөөдрийн ажил нээх" : "Талбайн ажилгүй"}</strong>
                      <small>
                        {canUseFieldConsole
                          ? "Өнөөдөрт оноогдсон хогийн цэг, талбайн урсгал руу шууд орно."
                          : "Энэ хэрэглэгч дээр талбайн ажил харах эрх идэвхгүй байна."}
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

            {!workerMode && !inspectorMobileMode ? (
              masterMode ? (
                <section className={`${styles.summaryStrip} ${styles.masterKpiGrid}`}>
                  <article className={styles.masterKpiCard}>
                    <span className={styles.masterKpiIcon} aria-hidden="true">
                      <ListChecks size={18} strokeWidth={2.4} />
                    </span>
                    <div>
                      <small>Өнөөдрийн ажил</small>
                      <strong>{masterDashboardProjects.length}</strong>
                      <em>{seniorMasterMode ? "Нэгжийн бүх ажил" : "Танд хамаарах ажил"}</em>
                    </div>
                  </article>
                  <article className={styles.masterKpiCard}>
                    <span className={styles.masterKpiIcon} aria-hidden="true">
                      <CheckCircle2 size={18} strokeWidth={2.4} />
                    </span>
                    <div>
                      <small>Гүйцэтгэл</small>
                      <strong>{masterAverageProgress}%</strong>
                      <em>Дундаж явц</em>
                    </div>
                  </article>
                  <article className={styles.masterKpiCard}>
                    <span className={styles.masterKpiIcon} aria-hidden="true">
                      <Bell size={18} strokeWidth={2.4} />
                    </span>
                    <div>
                      <small>Хяналт хүлээж буй</small>
                      <strong>{masterReviewCount}</strong>
                      <em>{seniorMasterMode ? "Тайлан" : "Ажил"}</em>
                    </div>
                  </article>
                  <article className={styles.masterKpiCard}>
                    <span className={styles.masterKpiIcon} aria-hidden="true">
                      <ClipboardCheck size={18} strokeWidth={2.4} />
                    </span>
                    <div>
                      <small>Дууссан</small>
                      <strong>{masterDoneProjectCount}</strong>
                      <em>Бүрэн хаагдсан ажил</em>
                    </div>
                  </article>
                </section>
              ) : (
                <section className={styles.summaryStrip}>
                  <article className={styles.summaryCard}>
                    <span>Сонгосон алба нэгж</span>
                    <strong>{selectedDepartmentLabel}</strong>
                    <small>{`${snapshot.departments.length} алба нэгжээс шүүж байна`}</small>
                  </article>
                  <article className={styles.summaryCard}>
                    <span>Нийт даалгавар</span>
                    <strong>{counts.all}</strong>
                    <small>Бүх даалгавар</small>
                  </article>
                  <article className={styles.summaryCard}>
                    <span>Нийт ажил</span>
                    <strong>{scopedProjects.length}</strong>
                    <small>Энэ шүүлтэд хамаарах ажлууд</small>
                  </article>
                </section>
              )
            ) : null}

            {!workerMode && !inspectorMobileMode ? (
            <section className={styles.filterPanel} aria-label="Ажлын төлөвөөр шүүх">
              <div className={styles.filterScroller}>
                {seniorMasterMode ? (
                  ([
                    { key: "today", label: "Өнөөдрийн ажил", count: masterDashboardProjects.length },
                    { key: "review", label: "Хянах ажил", count: seniorMasterReviewTasks.length },
                  ] satisfies Array<{ key: MasterTabKey; label: string; count: number }>).map((tab) => {
                    const params = new URLSearchParams();
                    if (selectedDepartmentParam) {
                      params.set("department", selectedDepartmentParam);
                    }
                    if (tab.key === "review") {
                      params.set("tab", "review");
                    }
                    const href = params.toString() ? `/tasks?${params.toString()}` : "/tasks";

                    return (
                      <Link
                        key={tab.key}
                        href={href}
                        className={`${styles.filterChip} ${
                          masterTab === tab.key ? styles.filterChipActive : ""
                        }`}
                      >
                        <span>{tab.label}</span>
                        <strong>{tab.count}</strong>
                      </Link>
                    );
                  })
                ) : FILTERS.map((filter) => {
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
              {masterMode ? (
                <form className={styles.masterFilterForm} method="get" aria-label="Ажил шүүх">
                  {selectedDepartmentParam ? (
                    <input type="hidden" name="department" value={selectedDepartmentParam} />
                  ) : null}
                  {showingMasterReviewTab ? <input type="hidden" name="tab" value="review" /> : null}
                  <label className={styles.masterFilterField}>
                    <span>Хайх</span>
                    <input
                      name="q"
                      type="search"
                      defaultValue={masterSearchQuery}
                      placeholder="Ажил, талбай, ажилтан..."
                    />
                  </label>
                  <label className={styles.masterFilterField}>
                    <span>Төлөв</span>
                    <select name="status" defaultValue={masterStatusFilter}>
                      <option value="all">Бүгд</option>
                      <option value="todo">Эхлээгүй</option>
                      <option value="progress">Ажиллаж буй</option>
                      <option value="review">Хяналтанд</option>
                      <option value="done">Дууссан</option>
                    </select>
                  </label>
                  <label className={styles.masterFilterField}>
                    <span>Ажилтан</span>
                    <select name="employee" defaultValue={masterEmployeeFilter}>
                      <option value="">Бүгд</option>
                      {masterEmployeeOptions.map((employee) => (
                        <option key={employee} value={employee}>
                          {employee}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className={styles.dateButton}>
                    Шүүх
                  </button>
                </form>
              ) : null}
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

                          <div className={styles.workerLineListHeader}>
                            <span>{work.tasks.length} даалгавар</span>
                            <small>Даалгаврын төлөв</small>
                          </div>
                          <div className={styles.workerLineList}>
                            {work.tasks.map((task, index) => {
                              const blockedReportReason = workerTaskBlockedReportReason(task, todayDateKey);
                              const visibleNote = workerTaskVisibleNote(task, todayDateKey);

                              return (
                                <TaskReportModal
                                  key={task.id}
                                  action={createTaskReportAction}
                                  updateAction={updateTaskReportAction}
                                  deleteAction={deleteTaskReportAction}
                                  taskId={Number(task.id)}
                                  simpleMobile
                                  workItemName={task.name}
                                  parentWorkInfo={{
                                    workName: task.projectName,
                                    areaName: parseRoadCleaningProjectName(task.projectName).areaName,
                                    areaM2: task.plannedQuantity || "",
                                    employeeName: task.leaderName,
                                  }}
                                  reportTextRequired={!isGarbageTransportTask(task)}
                                  existingReport={getWorkerExistingReport(task)}
                                  triggerClassName={styles.workerLineItem}
                                  triggerDisabled={Boolean(blockedReportReason)}
                                  triggerDisabledReason={blockedReportReason}
                                  triggerContent={
                                    <>
                                      <span className={styles.workerTaskNumber}>{index + 1}</span>
                                      <div>
                                        <strong>{task.name}</strong>
                                        <small>
                                          <Clock3 size={14} strokeWidth={2.3} aria-hidden="true" />
                                          {task.deadline} · {task.statusLabel}
                                        </small>
                                        {visibleNote ? (
                                          <em
                                            className={
                                              blockedReportReason
                                                ? styles.workerFutureReportReason
                                                : styles.workerReturnReason
                                            }
                                          >
                                            {visibleNote}
                                          </em>
                                        ) : null}
                                      </div>
                                      <span className={styles.workerLineAction}>
                                        <CheckCircle2 size={16} strokeWidth={2.4} aria-hidden="true" />
                                        {workerTaskVisibleActionLabel(task, todayDateKey)}
                                      </span>
                                    </>
                                  }
                                />
                              );
                            })}
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
                    <span className={styles.filterKicker}>
                      {showingMasterReviewTab ? "Ахлах мастерын хяналт" : masterFlowKicker}
                    </span>
                    <h2>{showingMasterReviewTab ? "Хяналт хүлээж буй тайлан" : "Өнөөдрийн ажил"}</h2>
                    <p>
                      {showingMasterReviewTab
                        ? "Илгээгдсэн тайланг ажил, талбай, ажилтнаар нь хурдан шүүнэ."
                        : "Ажил бүрийг талбай, ажилтан, хэмжээ, явцаар нь нэг мөрөнд харуулж байна."}
                    </p>
                  </div>
                  {canCreateProject && !showingMasterReviewTab ? (
                    <Link href="/projects/new" className={styles.primaryLink}>
                      <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
                      Ажил нэмэх
                    </Link>
                  ) : null}
                </div>

                {showingMasterReviewTab ? (
                  filteredSeniorMasterReviewTasks.length ? (
                    <>
                      <div className={styles.masterTableShell}>
                        <div className={styles.masterTable}>
                          <div className={styles.masterTableHeader}>
                            <span>Ажлын нэр</span>
                            <span>Талбай</span>
                            <span>Ажилтан</span>
                            <span>М²</span>
                            <span>Огноо</span>
                            <span>Гүйцэтгэл</span>
                            <span>Төлөв</span>
                          </div>
                          {filteredSeniorMasterReviewTasks.map((task) => (
                            <Link
                              key={`review-row-${task.id}`}
                              href={`/tasks/${task.id}?returnTo=${encodeURIComponent("/tasks?tab=review")}#task-reports`}
                              className={styles.masterTableRow}
                            >
                              <strong>{task.name}</strong>
                              <span>{getReviewTaskArea(task)}</span>
                              <span>{getReviewTaskEmployee(task) || "—"}</span>
                              <span>{formatAreaM2(0)}</span>
                              <span>{task.deadline}</span>
                              <span className={styles.masterProgressCell}>
                                <em>{task.progress}%</em>
                                <b>
                                  <i style={{ width: `${Math.max(0, Math.min(task.progress, 100))}%` }} />
                                </b>
                              </span>
                              <span className={`${styles.masterStatusBadge} ${styles.masterStatusReview}`}>
                                Хяналтанд
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                      <div className={styles.masterMobileCards}>
                        {filteredSeniorMasterReviewTasks.map((task) => (
                          <Link
                            key={`review-card-${task.id}`}
                            href={`/tasks/${task.id}?returnTo=${encodeURIComponent("/tasks?tab=review")}#task-reports`}
                            className={styles.masterWorkCard}
                          >
                            <div>
                              <strong>{task.name}</strong>
                              <span>{getReviewTaskArea(task)}</span>
                            </div>
                            <small>{getReviewTaskEmployee(task) || "Ажилтан"} · {task.deadline}</small>
                            <div className={styles.masterCardProgress}>
                              <b><i style={{ width: `${Math.max(0, Math.min(task.progress, 100))}%` }} /></b>
                              <em>{task.progress}%</em>
                            </div>
                            <span className={`${styles.masterStatusBadge} ${styles.masterStatusReview}`}>Хяналтанд</span>
                          </Link>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={styles.emptyState}>
                      <h3>Хяналт хүлээж буй тайлан алга</h3>
                      <p>Одоогоор энэ шүүлтэд таарах илгээгдсэн тайлан байхгүй байна.</p>
                    </div>
                  )
                ) : masterFilteredProjects.length ? (
                  <>
                    <div className={styles.masterTableShell}>
                      <div className={styles.masterTable}>
                        <div className={styles.masterTableHeader}>
                          <span>Ажлын нэр</span>
                          <span>Талбай</span>
                          <span>Ажилтан</span>
                          <span>М²</span>
                          <span>Огноо</span>
                          <span>Гүйцэтгэл</span>
                          <span>Төлөв</span>
                        </div>
                        {masterFilteredProjects.map((project) => (
                          <Link key={project.id} href={project.href} className={styles.masterTableRow}>
                            <strong>{project.name}</strong>
                            <span>{project.areaName}</span>
                            <span>{project.employeeName || project.manager || "—"}</span>
                            <span>{formatAreaM2(project.areaM2)}</span>
                            <span>{project.workDate || project.deadline}</span>
                            <span className={styles.masterProgressCell}>
                              <em>{project.completion}%</em>
                              <b>
                                <i style={{ width: `${Math.max(0, Math.min(project.completion, 100))}%` }} />
                              </b>
                            </span>
                            <span className={`${styles.masterStatusBadge} ${styles[`masterStatus${project.stageBucket}`]}`}>
                              {getMasterStatusLabel(project.stageBucket)}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                    <div className={styles.masterMobileCards}>
                      {masterFilteredProjects.map((project) => (
                        <Link key={`card-${project.id}`} href={project.href} className={styles.masterWorkCard}>
                          <div>
                            <strong>{project.name}</strong>
                            <span>{project.areaName}</span>
                          </div>
                          <small>{project.employeeName || project.manager || "Ажилтан"} · {formatAreaM2(project.areaM2)}</small>
                          <div className={styles.masterCardProgress}>
                            <b><i style={{ width: `${Math.max(0, Math.min(project.completion, 100))}%` }} /></b>
                            <em>{project.completion}%</em>
                          </div>
                          <span className={`${styles.masterStatusBadge} ${styles[`masterStatus${project.stageBucket}`]}`}>
                            {getMasterStatusLabel(project.stageBucket)}
                          </span>
                          <span className={styles.masterCardAction}>Тайлан илгээх</span>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <h3>Өнөөдөр оноогдсон ажил алга</h3>
                    <p>Сонгосон шүүлтэд таарах зам талбайн цэвэрлэгээний ажил харагдахгүй байна.</p>
                  </div>
                )}
              </section>
            ) : (
              <section className={styles.taskSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span className={styles.filterKicker}>
                      {inspectorMobileMode ? "Жолоочоос ирсэн тайлан" : "Даалгаврын жагсаалт"}
                    </span>
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
                        {isGarbageTransportTask(task) ? (
                          <div className={styles.inspectorTaskMeta}>
                            <span>
                              <MapPin size={15} strokeWidth={2.3} aria-hidden="true" />
                              {garbagePointSummary(task)}
                            </span>
                            <span>
                              <ListChecks size={15} strokeWidth={2.3} aria-hidden="true" />
                              {taskProofSummary(task)}
                            </span>
                          </div>
                        ) : null}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <h3>{inspectorMobileMode ? "Хянах тайлан алга" : "Даалгавар алга"}</h3>
                    <p>
                      {inspectorMobileMode
                        ? "Танд оноогдсон, жолоочоос ирсэн тайлан одоогоор алга."
                        : "Сонгосон шүүлтэд таарах даалгавар одоогоор харагдахгүй байна."}
                    </p>
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
