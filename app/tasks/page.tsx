import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  Grid2X2,
  Leaf,
  List,
  ListChecks,
  MapPin,
  Plus,
  Search,
  Sun,
  Trash2,
  Trees,
  Truck,
  Wrench,
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
  normalizeOrganizationUnitName,
} from "@/lib/department-groups";
import { loadMunicipalSnapshot, type DashboardSnapshot, type TaskDirectoryItem } from "@/lib/odoo";
import {
  filterProjectsForResponsibleMaster,
  filterTasksForResponsibleMaster,
} from "@/lib/master-scope";
import { loadWorkspaceNotificationSummary } from "@/lib/workspace-notifications";
import { HIDE_OVERDUE_UI } from "@/lib/ui-feature-flags";

import styles from "./tasks.module.css";
import { TaskReportModal } from "./[taskId]/task-report-modal";

type FilterKey = "all" | "planned" | "review" | "verified";
type MasterTabKey = "today" | "review";
type MasterStatusFilter = "all" | "todo" | "overdue" | "review" | "done";
type QuickActionMode = "none" | "report";
type TaskCategoryKey = "green" | "cleaning" | "waste" | "repair" | "improvement";

const TASK_CATEGORIES = [
  { key: "green", label: "Ногоон байгууламж", keywords: ["ногоон", "мод", "зүлэг"], icon: Trees, tone: "green" },
  { key: "cleaning", label: "Цэвэрлэгээ", keywords: ["цэвэрлэгээ", "зам талбай"], icon: Trash2, tone: "blue" },
  { key: "waste", label: "Хог тээвэр", keywords: ["хог", "тээвэр"], icon: Truck, tone: "orange" },
  { key: "repair", label: "Техник, засвар", keywords: ["техник", "засвар"], icon: Wrench, tone: "purple" },
  { key: "improvement", label: "Тохижилт", keywords: ["тохижилт"], icon: Leaf, tone: "teal" },
] as const;

type PageProps = {
  searchParams?: Promise<{
    department?: string | string[];
    filter?: string | string[];
    view?: string | string[];
    tab?: string | string[];
    quickAction?: string | string[];
    work?: string | string[];
    workId?: string | string[];
    q?: string | string[];
    status?: string | string[];
    employee?: string | string[];
    category?: string | string[];
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
  { key: "planned", label: "Төлөвлөсөн" },
  { key: "review", label: "Хянаж байгаа" },
  { key: "verified", label: "Дууссан" },
];

type TaskViewKey = "list" | "calendar" | "detail";
const TASK_VIEWS: Array<{ key: TaskViewKey; label: string }> = [
  { key: "list", label: "Жагсаалт" },
  { key: "calendar", label: "Календарь" },
  { key: "detail", label: "Дэлгэрэнгүй" },
];

function normalizeView(value: string): TaskViewKey {
  return TASK_VIEWS.some((view) => view.key === value)
    ? (value as TaskViewKey)
    : "list";
}

const TASK_CALENDAR_WEEKDAYS = ["Да", "Мя", "Лх", "Пү", "Ба", "Бя", "Ня"];
const TASK_CALENDAR_MONTH_NAMES = [
  "1-р сар",
  "2-р сар",
  "3-р сар",
  "4-р сар",
  "5-р сар",
  "6-р сар",
  "7-р сар",
  "8-р сар",
  "9-р сар",
  "10-р сар",
  "11-р сар",
  "12-р сар",
];

type TaskMonthCell = { day: number; dateKey: string } | null;

function buildTaskMonthCells(year: number, month0: number): TaskMonthCell[] {
  const first = new Date(Date.UTC(year, month0, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: TaskMonthCell[] = [];
  for (let i = 0; i < startWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, dateKey });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function getParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function normalizeFilter(value: string): FilterKey {
  if (value === "working") {
    return "planned";
  }
  if (value === "problem") {
    return "review";
  }
  return FILTERS.some((item) => item.key === value) ? (value as FilterKey) : "all";
}

function normalizeMasterTab(value: string, seniorMasterMode: boolean): MasterTabKey {
  return seniorMasterMode && value === "review" ? "review" : "today";
}

function normalizeMasterStatus(value: string): MasterStatusFilter {
  if (value === "progress") {
    return "todo";
  }
  return value === "todo" || value === "overdue" || value === "review" || value === "done"
    ? value
    : "all";
}

function getVisibleTaskFilterKey(
  task: Pick<TaskDirectoryItem, "statusKey">,
): Exclude<FilterKey, "all"> {
  if (task.statusKey === "verified") {
    return "verified";
  }
  if (task.statusKey === "review" || task.statusKey === "problem") {
    return "review";
  }
  return "planned";
}

function getVisibleProjectFilterKey(
  project: Pick<TodayProjectSummary, "stageBucket">,
): Exclude<FilterKey, "all"> {
  if (project.stageBucket === "done") {
    return "verified";
  }
  if (project.stageBucket === "review" || project.stageBucket === "problem") {
    return "review";
  }
  return "planned";
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
  if (bucket === "review" || bucket === "problem") {
    return "Хянаж байгаа";
  }
  return "Төлөвлөсөн";
}

function getMasterStatusFilter(bucket: TodayProjectSummary["stageBucket"]): MasterStatusFilter {
  if (bucket === "done") {
    return "done";
  }
  if (bucket === "review" || bucket === "problem") {
    return "review";
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
    return "Дууссан";
  }
  if (task.statusKey === "review") {
    return "Илгээсэн";
  }
  if (task.statusKey === "problem") {
    return "Засах";
  }
  return "Тайлан оруулах";
}

function workerTaskReturnReason(task: TaskDirectoryItem) {
  if (task.statusKey !== "problem") {
    return "";
  }
  return task.latestReport?.rejectionReason?.trim() || "Засвар нэхэж буцаасан байна.";
}

function workerTaskBlockedReportReason() {
  return "";
}

function workerTaskVisibleNote(task: TaskDirectoryItem) {
  return workerTaskReturnReason(task) || workerTaskBlockedReportReason();
}

function workerTaskVisibleActionLabel(task: TaskDirectoryItem) {
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
    return { bucket: "problem" as const, label: "Хянаж байгаа" };
  }

  if (summary.reviewTaskCount > 0) {
    return { bucket: "review" as const, label: "Хянаж байгаа" };
  }

  if (summary.workingTaskCount > 0) {
    return { bucket: "progress" as const, label: "Төлөвлөсөн" };
  }

  if (summary.todayTaskCount > 0 && summary.verifiedTaskCount === summary.todayTaskCount) {
    return { bucket: "done" as const, label: "Дууссан" };
  }

  return { bucket: "todo" as const, label: "Төлөвлөсөн" };
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
        stageLabel: "Төлөвлөсөн",
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

      if (task.statusKey === "working" || task.statusKey === "planned") {
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
  const requestedCategory = getParam(params.category);
  const selectedTaskCategory: TaskCategoryKey | "" = TASK_CATEGORIES.some((category) => category.key === requestedCategory)
    ? requestedCategory as TaskCategoryKey
    : "";
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
    Boolean(
      session.role === "transport_inspector" ||
        (session.groupFlags?.mfoInspector &&
          !session.groupFlags?.mfoManager &&
          !session.groupFlags?.mfoDispatcher &&
          !session.groupFlags?.municipalDepartmentHead &&
          !session.groupFlags?.municipalManager),
    );

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
        planned: masterDashboardProjects.filter((project) => getVisibleProjectFilterKey(project) === "planned").length,
        review: masterDashboardProjects.filter((project) => getVisibleProjectFilterKey(project) === "review").length,
        verified: masterDashboardProjects.filter((project) => getVisibleProjectFilterKey(project) === "verified").length,
      }
    : {
        all: scopedTasks.length,
        planned: scopedTasks.filter((task) => getVisibleTaskFilterKey(task) === "planned").length,
        review: scopedTasks.filter((task) => getVisibleTaskFilterKey(task) === "review").length,
        verified: scopedTasks.filter((task) => getVisibleTaskFilterKey(task) === "verified").length,
      };

  const normalizedTaskSearch = masterSearchQuery.toLocaleLowerCase("mn-MN");
  const matchesTaskCategory = (task: (typeof scopedTasks)[number], categoryKey: TaskCategoryKey) => {
    const category = TASK_CATEGORIES.find((item) => item.key === categoryKey);
    if (!category) return true;
    const searchableText = `${task.departmentName} ${task.projectName} ${task.operationTypeLabel}`
      .toLocaleLowerCase("mn-MN");
    return category.keywords.some((keyword) => searchableText.includes(keyword));
  };
  const visibleTasks = scopedTasks.filter((task) => {
    if (selectedFilter === "all") {
      // Continue with the shared text/status filters below.
    } else if (getVisibleTaskFilterKey(task) !== selectedFilter) {
      return false;
    }
    const matchesSearch =
      !normalizedTaskSearch ||
      [task.name, task.projectName, task.departmentName, task.leaderName]
        .join(" ")
        .toLocaleLowerCase("mn-MN")
        .includes(normalizedTaskSearch);
    const matchesCategory = !selectedTaskCategory || matchesTaskCategory(task, selectedTaskCategory);
    const matchesStatus =
      masterStatusFilter === "all" ||
      (masterStatusFilter === "done" && task.statusKey === "verified") ||
      (masterStatusFilter === "review" && (task.statusKey === "review" || task.statusKey === "problem")) ||
      (masterStatusFilter === "overdue" && task.statusKey !== "verified" && Boolean(task.scheduledDate) && (task.scheduledDate ?? "") < todayDateKey) ||
      (masterStatusFilter === "todo" && task.statusKey !== "verified" && task.statusKey !== "review" && task.statusKey !== "problem");
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const dashboardOverdueTasks = scopedTasks.filter(
    (task) => task.statusKey !== "verified" && Boolean(task.scheduledDate) && (task.scheduledDate ?? "") < todayDateKey,
  );
  const dashboardInProgressTasks = scopedTasks.filter(
    (task) => task.statusKey !== "verified" && task.statusKey !== "review" && task.statusKey !== "problem",
  );
  const dashboardReviewTasks = scopedTasks.filter(
    (task) => task.statusKey === "review" || task.statusKey === "problem",
  );
  const dashboardDoneTasks = scopedTasks.filter((task) => task.statusKey === "verified");
  const dashboardProgress = scopedTasks.length
    ? Math.round(scopedTasks.reduce((total, task) => total + task.progress, 0) / scopedTasks.length)
    : 0;
  const dashboardCategories = TASK_CATEGORIES.map((category) => ({
    ...category,
    tasks: scopedTasks.filter((task) => matchesTaskCategory(task, category.key)),
  }));
  const dashboardUpcomingTasks = [...scopedTasks]
    .filter((task) => task.statusKey !== "verified" && Boolean(task.scheduledDate))
    .sort((left, right) => (left.scheduledDate ?? "").localeCompare(right.scheduledDate ?? ""))
    .slice(0, 5);

  const activeView: TaskViewKey = normalizeView(getParam(params.view));
  const tasksByDeadline = new Map<string, typeof visibleTasks>();
  for (const task of visibleTasks) {
    const dateKey = task.scheduledDate || "";
    if (!dateKey) {
      continue;
    }
    const bucket = tasksByDeadline.get(dateKey);
    if (bucket) {
      bucket.push(task);
    } else {
      tasksByDeadline.set(dateKey, [task]);
    }
  }
  const undatedTaskCount = visibleTasks.filter((task) => !task.scheduledDate).length;
  const taskMonthCounts = new Map<string, number>();
  for (const [dateKey, bucket] of tasksByDeadline) {
    const monthKey = dateKey.slice(0, 7);
    taskMonthCounts.set(monthKey, (taskMonthCounts.get(monthKey) ?? 0) + bucket.length);
  }
  let taskAnchorMonthKey = "";
  let taskAnchorBest = -1;
  for (const [monthKey, count] of taskMonthCounts) {
    if (
      count > taskAnchorBest ||
      (count === taskAnchorBest && monthKey < taskAnchorMonthKey)
    ) {
      taskAnchorBest = count;
      taskAnchorMonthKey = monthKey;
    }
  }
  const taskCalendarCells: TaskMonthCell[] = taskAnchorMonthKey
    ? buildTaskMonthCells(
        Number(taskAnchorMonthKey.slice(0, 4)),
        Number(taskAnchorMonthKey.slice(5, 7)) - 1,
      )
    : [];
  const taskCalendarMonthLabel = taskAnchorMonthKey
    ? `${taskAnchorMonthKey.slice(0, 4)} оны ${TASK_CALENDAR_MONTH_NAMES[Number(taskAnchorMonthKey.slice(5, 7)) - 1]}`
    : "";
  const buildTaskViewHref = (view: TaskViewKey) => {
    const linkParams = new URLSearchParams();
    if (selectedDepartmentParam) {
      linkParams.set("department", selectedDepartmentParam);
    }
    if (activeFilter !== "all") {
      linkParams.set("filter", activeFilter);
    }
    if (view !== "list") {
      linkParams.set("view", view);
    }
    const queryString = linkParams.toString();
    return `/tasks${queryString ? `?${queryString}` : ""}`;
  };

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

    return getVisibleProjectFilterKey(project) === selectedFilter;
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
  const departmentFilterOptions = Array.from(new Set([
    ...DEPARTMENT_GROUPS.map((group) => group.name),
    ...snapshot.departments
      .map((department) => normalizeOrganizationUnitName(department.name) || department.name.trim())
      .filter(Boolean),
  ]));
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
                    <small>Явц {workerAverageProgress}% · Хянаж байгаа {workerReviewTaskCount}</small>
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

            {!workerMode && !inspectorMobileMode && masterMode ? (
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
                          <span><i className={styles.legendWorking} /> Төлөвлөсөн</span>
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
                        : "Бүх даалгаврыг алба нэгж, ажил, төлөвөөр нь нэг дороос харуулна. Хянаж байгаа даалгавруудыг эхэнд нь ялгаж, дэлгэрэнгүй рүү шууд нээнэ."}
                  </p>
                </div>
              </div>
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
                <section className={styles.taskDashboard} aria-label="Даалгаврын нэгдсэн үзүүлэлт">
                  <div className={styles.taskKpiGrid}>
                    {[
                      { label: "Нийт ажил", value: counts.all, note: "Бүх даалгавар", icon: ClipboardCheck, tone: "neutral", status: "all" },
                      { label: "Хийгдэж буй", value: dashboardInProgressTasks.length, note: "Явцтай", icon: Clock3, tone: "active", status: "todo" },
                      { label: "Хугацаа хэтэрсэн", value: dashboardOverdueTasks.length, note: "Анхаарах", icon: AlertTriangle, tone: "danger", status: "overdue" },
                      { label: "Батлах хүлээж буй", value: dashboardReviewTasks.length, note: "Шийдвэр гарах", icon: FileCheck2, tone: "review", status: "review" },
                      { label: "Дууссан", value: dashboardDoneTasks.length, note: "Бүрэн дууссан", icon: CheckCircle2, tone: "done", status: "done" },
                    ].filter((item) => !HIDE_OVERDUE_UI || item.status !== "overdue").map((item) => {
                      const Icon = item.icon;
                      const cardParams = new URLSearchParams();
                      if (selectedDepartmentParam) cardParams.set("department", selectedDepartmentParam);
                      if (item.status !== "all") cardParams.set("status", item.status);
                      const cardHref = cardParams.toString() ? `/tasks?${cardParams.toString()}` : "/tasks";
                      return (
                        <Link
                          key={item.label}
                          href={cardHref}
                          className={`${styles.taskKpi} ${styles.taskKpiLink} ${styles[`taskKpi${item.tone}`]} ${masterStatusFilter === item.status ? styles.taskKpiSelected : ""}`}
                          aria-current={masterStatusFilter === item.status ? "page" : undefined}
                        >
                          <Icon size={25} strokeWidth={2.2} aria-hidden="true" />
                          <div><strong>{item.value}</strong><span>{item.label}</span><small>{item.note}</small></div>
                        </Link>
                      );
                    })}
                  </div>
                  <div className={styles.taskProgressOverview}>
                    <div><span>Нийт гүйцэтгэл</span><strong>{dashboardProgress}%</strong><small>{dashboardDoneTasks.length} / {counts.all} ажил дууссан</small></div>
                    <span className={styles.taskProgressTrack}><i style={{ width: `${dashboardProgress}%` }} /></span>
                    <ClipboardCheck size={50} strokeWidth={1.4} aria-hidden="true" />
                  </div>
                  <div className={styles.taskCategorySection}>
                    <strong>Ажлын ангилал</strong>
                    <div className={styles.taskCategoryGrid}>
                      {dashboardCategories.map((category) => {
                        const Icon = category.icon;
                        const progress = category.tasks.length
                          ? Math.round(category.tasks.reduce((sum, task) => sum + task.progress, 0) / category.tasks.length)
                          : 0;
                        const categoryParams = new URLSearchParams();
                        if (selectedDepartmentParam) categoryParams.set("department", selectedDepartmentParam);
                        if (masterStatusFilter !== "all") categoryParams.set("status", masterStatusFilter);
                        categoryParams.set("category", category.key);
                        return (
                          <Link
                            key={category.label}
                            href={`/tasks?${categoryParams.toString()}`}
                            className={`${styles.taskCategoryCard} ${styles.taskCategoryLink} ${styles[`taskCategory${category.tone}`]} ${selectedTaskCategory === category.key ? styles.taskCategorySelected : ""}`}
                            aria-current={selectedTaskCategory === category.key ? "page" : undefined}
                          >
                            <Icon size={24} strokeWidth={2.1} aria-hidden="true" />
                            <div><strong>{category.label}</strong><small>{category.tasks.length} ажил</small></div>
                            <span><i style={{ width: `${progress}%` }} /></span><b>{progress}%</b>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )
            ) : null}

            {!workerMode && !inspectorMobileMode ? (
            <section className={styles.filterPanel} aria-label="Ажлын төлөвөөр шүүх">
              {seniorMasterMode ? (
                <div className={styles.filterScroller}>
                  {([
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
                  })}
                </div>
              ) : null}
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
                      <option value="todo">Төлөвлөсөн</option>
                      <option value="review">Хянаж байгаа</option>
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
              ) : (
                <form className={styles.taskDashboardFilters} method="get" aria-label="Даалгавар шүүх">
                  {selectedTaskCategory ? <input type="hidden" name="category" value={selectedTaskCategory} /> : null}
                  <label className={styles.taskSearchField}>
                    <Search size={17} aria-hidden="true" />
                    <input name="q" type="search" defaultValue={masterSearchQuery} placeholder="Ажил, даалгавар хайх..." />
                  </label>
                  {!departmentScopedMode ? (
                    <select name="department" defaultValue={selectedDepartmentParam || "all"} aria-label="Хэлтэс">
                      <option value="all">Хэлтэс: Бүгд</option>
                      {departmentFilterOptions.map((departmentName) => <option key={departmentName} value={departmentName}>{departmentName}</option>)}
                    </select>
                  ) : null}
                  <select name="status" defaultValue={masterStatusFilter} aria-label="Төлөв">
                    <option value="all">Төлөв: Бүгд</option><option value="todo">Хийгдэж буй</option>{!HIDE_OVERDUE_UI ? <option value="overdue">Хугацаа хэтэрсэн</option> : null}<option value="review">Батлах хүлээж буй</option><option value="done">Дууссан</option>
                  </select>
                  <input type="hidden" name="filter" value={activeFilter} />
                  <button type="submit" className={styles.dateButton}>Шүүх</button>
                  <span className={styles.taskViewIcons} aria-label="Харагдац"><List size={17} /><Grid2X2 size={17} /></span>
                </form>
              )}
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
                              <span>Захирамж, үүрэг даалгавар</span>
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
                              Хянаж байгаа
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
                              const blockedReportReason = workerTaskBlockedReportReason();
                              const visibleNote = workerTaskVisibleNote(task);

                              return (
                                <TaskReportModal
                                  key={task.id}
                                  action={createTaskReportAction}
                                  updateAction={updateTaskReportAction}
                                  deleteAction={deleteTaskReportAction}
                                  taskId={Number(task.id)}
                                  simpleMobile
                                  measurementUnit={task.measurementUnit}
                                  requireQuantity={Boolean(task.plannedQuantity)}
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
                                  enableLocation={task.departmentName.toLocaleLowerCase("mn-MN").includes("ногоон байгууламж") && task.departmentName.toLocaleLowerCase("mn-MN").includes("цэвэрлэгээ үйлчилгээ")}
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
                                        {workerTaskVisibleActionLabel(task)}
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
                                Хянаж байгаа
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
                            <span className={`${styles.masterStatusBadge} ${styles.masterStatusReview}`}>Хянаж байгаа</span>
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
              <div className={styles.taskDashboardBody}>
              <section className={styles.taskSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span className={styles.filterKicker}>
                      {inspectorMobileMode ? "Жолоочоос ирсэн тайлан" : "Даалгаврын жагсаалт"}
                    </span>
                    <h2>{selectedDepartmentLabel}</h2>
                    <p>{visibleTasks.length} даалгаврыг төлөв, хугацаа, гүйцэтгэлээр харуулж байна.</p>
                  </div>
                </div>

                {!inspectorMobileMode ? (
                  <div className={`${styles.filterScroller} ${styles.taskViewSwitch}`}>
                    {TASK_VIEWS.map((view) => (
                      <Link
                        key={view.key}
                        href={buildTaskViewHref(view.key)}
                        className={`${styles.filterChip} ${
                          activeView === view.key ? styles.filterChipActive : ""
                        }`}
                      >
                        <span>{view.label}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}

                {!visibleTasks.length ? (
                  <div className={styles.emptyState}>
                    <h3>{inspectorMobileMode ? "Хянах тайлан алга" : "Даалгавар алга"}</h3>
                    <p>
                      {inspectorMobileMode
                        ? "Танд оноогдсон, жолоочоос ирсэн тайлан одоогоор алга."
                        : "Сонгосон шүүлтэд таарах даалгавар одоогоор харагдахгүй байна."}
                    </p>
                  </div>
                ) : !inspectorMobileMode && activeView === "calendar" ? (
                  <div className={styles.taskViewCalendar}>
                    <div className={styles.taskViewCalendarHead}>
                      <strong>{taskCalendarMonthLabel || "Хугацаа тодорхойгүй"}</strong>
                      <span>{visibleTasks.length - undatedTaskCount} даалгавар</span>
                    </div>
                    {taskCalendarCells.length ? (
                      <>
                        <div className={styles.taskViewCalendarWeekdays}>
                          {TASK_CALENDAR_WEEKDAYS.map((weekday) => (
                            <span key={weekday}>{weekday}</span>
                          ))}
                        </div>
                        <div className={styles.taskViewCalendarGrid}>
                          {taskCalendarCells.map((cell, cellIndex) =>
                            cell ? (
                              <div key={cell.dateKey} className={styles.taskViewCalendarCell}>
                                <span className={styles.taskViewCalendarDay}>{cell.day}</span>
                                {(tasksByDeadline.get(cell.dateKey) ?? []).map((task) => (
                                  <Link
                                    key={task.id}
                                    href={buildTaskHref(task.href)}
                                    title={task.name}
                                    className={styles.taskViewCalendarTask}
                                  >
                                    {task.name}
                                  </Link>
                                ))}
                              </div>
                            ) : (
                              <div
                                key={`task-calendar-empty-${cellIndex}`}
                                className={`${styles.taskViewCalendarCell} ${styles.taskViewCalendarCellEmpty}`}
                              />
                            ),
                          )}
                        </div>
                      </>
                    ) : (
                      <p className={styles.taskViewCalendarNote}>
                        Хугацаа тэмдэглэсэн даалгавар алга байна.
                      </p>
                    )}
                    {undatedTaskCount ? (
                      <div className={styles.taskViewCalendarUndated}>
                        <span>Хугацаа тэмдэглээгүй {undatedTaskCount} даалгавар</span>
                      </div>
                    ) : null}
                  </div>
                ) : !inspectorMobileMode && activeView === "list" ? (
                  <ul className={styles.taskViewCompactList}>
                    {visibleTasks.map((task, index) => {
                      const overdue = !HIDE_OVERDUE_UI && task.statusKey !== "verified" && Boolean(task.scheduledDate) && (task.scheduledDate ?? "") < todayDateKey;
                      return (
                      <li key={task.id} className={styles[`taskRowTone${index % 5}`]}>
                        <Link href={buildTaskHref(task.href)} className={styles.taskViewCompactItem}>
                          <span className={styles.taskRowIcon} aria-hidden="true"><ClipboardCheck size={18} /></span>
                          <span className={styles.taskViewCompactName} title={task.name}>
                            <strong>{task.name}</strong>
                            <small>{task.projectName} · {task.departmentName}</small>
                          </span>
                          <span className={styles.taskRowDetail}>
                            <small>Хариуцагч</small><strong>{task.leaderName || "Сонгоогүй"}</strong>
                          </span>
                          <span className={styles.taskRowDetail}>
                            <small>Хугацаа</small><strong>{task.deadline}</strong>
                            {overdue ? <em>Хугацаа хэтэрсэн</em> : null}
                          </span>
                          <span className={styles.taskRowProgress}>
                            <b>{task.progress}%</b><span><i style={{ width: `${task.progress}%` }} /></span>
                          </span>
                          <span className={styles.taskViewCompactMeta}>
                            <span className={styles.statusChip}>{task.statusLabel}</span>
                            <ChevronRight size={17} aria-hidden="true" />
                          </span>
                        </Link>
                      </li>
                    );})}
                  </ul>
                ) : (
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
                )}
              </section>
              {!inspectorMobileMode ? (
                <aside className={styles.taskDashboardAside}>
                  <section>
                    <div className={styles.taskAsideTitle}><div><span>Ойрын хугацааны ажлууд</span><small>Хугацаагаар эрэмбэлсэн</small></div><Clock3 size={20} /></div>
                    <div className={styles.taskUpcomingList}>
                      {dashboardUpcomingTasks.length ? dashboardUpcomingTasks.map((task) => (
                        <Link key={`upcoming-${task.id}`} href={buildTaskHref(task.href)}>
                          <time>{task.scheduledDate?.slice(8, 10) || "—"}<small>{task.scheduledDate?.slice(5, 7) || ""}-р сар</small></time>
                          <span><strong>{task.name}</strong><small>{task.leaderName || task.departmentName}</small></span>
                          <ChevronRight size={16} />
                        </Link>
                      )) : <p>Ойрын хугацаатай ажил алга.</p>}
                    </div>
                  </section>
                  <section className={styles.taskWorkloadCard}>
                    <span>Сонгосон хүрээний явц</span><strong>{dashboardProgress}%</strong>
                    <div><i style={{ width: `${dashboardProgress}%` }} /></div>
                    <small>{dashboardInProgressTasks.length} ажил хийгдэж байна</small>
                  </section>
                </aside>
              ) : null}
              </div>
            )}


          </div>
        </div>
      </div>
    </main>
  );
}
