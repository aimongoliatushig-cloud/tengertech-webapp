import type { CSSProperties, ReactNode } from "react";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  CloudRain,
  CloudSnow,
  CloudSun,
  Fuel,
  HeartPulse,
  Leaf,
  ListChecks,
  MapPinned,
  Plus,
  Recycle,
  ShieldCheck,
  Sun,
  Truck,
  UserCheck,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkerTaskTable } from "@/app/_components/worker-task-table";
import { Badge } from "@/app/_components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/_components/ui/card";
import { DashboardInspectorVehiclePanel } from "@/app/dashboard-inspector-vehicle-panel";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import dashboardStyles from "@/app/dashboard-view.module.css";
import shellStyles from "@/app/workspace.module.css";
import { getSessionRoleLabel, hasCapability, isMasterRole, isWorkerOnly, type AppSession } from "@/lib/auth";
import { buildDashboardModel, type StatusTone } from "@/lib/dashboard-model";
import { filterByDepartment } from "@/lib/dashboard-scope";
import { normalizeOrganizationUnitName } from "@/lib/department-groups";
import { type FieldAssignment } from "@/lib/field-ops";
import { isGreenOrImprovementVehicleScope } from "@/lib/fleet-vehicle-board-scope";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";
import { canViewGarbageWeightReports } from "@/lib/roles";
import {
  type AssignedTaskItem,
  type AssignedTaskStatusKey,
  type DashboardSnapshot,
  type FleetVehicleBoard,
  type HrDailyAttendanceSummary,
  type TaskStatusKey,
} from "@/lib/odoo";
import { cn } from "@/lib/utils";
import { fixMojibakeText } from "@/lib/text-normalize";
import { type WeatherSnapshot } from "@/lib/weather";
import { type GarbagePointOption, type GarbageVehicleOption } from "@/lib/workspace";

type DashboardViewProps = {
  session: AppSession;
  snapshot: DashboardSnapshot;
  todayAssignments: FieldAssignment[];
  assignedGarbageVehicles?: GarbageVehicleOption[];
  assignedGarbagePointOptions?: GarbagePointOption[];
  garbageDepartmentId?: number | null;
  fleetBoard: FleetVehicleBoard;
  fleetLoadError?: string;
  hrAttendanceSummary: HrDailyAttendanceSummary;
  departmentScopeName?: string | null;
  weather: WeatherSnapshot;
  canViewHr?: boolean;
  canViewGeneralDashboard?: boolean;
  notificationCount?: number;
  notificationNote?: string;
  assignedTasks?: AssignedTaskItem[];
  showProcurementHomePanels?: boolean;
  procurementActionPanel?: ReactNode;
  wastePointSummary?: WastePointSummary;
};

type WastePointSummary = {
  total: number;
  active: number;
  full: number;
  maintenance: number;
  inactive: number;
  khorooCount: number;
  available: boolean;
};

const DASHBOARD_IMAGES = {
  header: "/illustrations/green-city-hero.svg",
  operationsHero: "/illustrations/municipal-ops-hero.png",
  fleetTruck: "/illustrations/department-fleet-premium.webp",
  cleaningTruck: "/illustrations/department-street-cleaning-premium.webp",
  landscapingWorker: "/illustrations/department-landscaping-premium.webp",
  maintenanceWorker: "/illustrations/department-maintenance-premium.webp",
  seedling: "/illustrations/seedling-card.svg",
  landscape: "/illustrations/green-landscape-card.svg",
};

const DASHBOARD_TIME_ZONE = "Asia/Ulaanbaatar";

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percent(value: number, total: number) {
  if (!total) {
    return 0;
  }

  return clampPercent((value / total) * 100);
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isTransportInspectorDashboard(session: AppSession) {
  return Boolean(
    session.role === "transport_inspector" ||
      (session.groupFlags?.mfoInspector &&
        !session.groupFlags?.mfoManager &&
        !session.groupFlags?.mfoDispatcher &&
        !session.groupFlags?.municipalDepartmentHead),
  );
}

function normalizeDashboardRoleText(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

function dashboardRoleLooksDepartmentHead(value?: string | null) {
  const text = normalizeDashboardRoleText(value);
  return (
    text.includes("хэлтсийн дарга") ||
    text.includes("хэлтэсийн дарга") ||
    text.includes("албаны дарга")
  );
}

function isDepartmentHeadDashboard(session: AppSession) {
  const flags = session.groupFlags;

  return Boolean(
    session.role === "project_manager" ||
      flags?.municipalDepartmentHead ||
      dashboardRoleLooksDepartmentHead(session.employeeJobTitle) ||
      dashboardRoleLooksDepartmentHead(session.displayRoleLabel) ||
      dashboardRoleLooksDepartmentHead(getSessionRoleLabel(session)) ||
      flags?.mfoManager ||
      flags?.environmentManager ||
      flags?.improvementManager ||
      flags?.fleetRepairManager,
  );
}

function formatMnDate(iso?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!match) return "";
  return `${match[1]} оны ${Number(match[2])}-р сарын ${Number(match[3])}`;
}

// Оногдсон даалгаврын төлөв бүрийн шошго ба өнгө (нүүр хуудасны карт).
const ASSIGNED_STATUS_META: Record<
  AssignedTaskStatusKey,
  { label: string; pill: string; dot: string }
> = {
  planned: {
    label: "Төлөвлөсөн",
    pill: "bg-[#EEF2F1] text-[#516156]",
    dot: "bg-[#94A79A]",
  },
  doing: {
    label: "Хийгдэж байна",
    pill: "bg-[#FEF3C7] text-[#B45309]",
    dot: "bg-[#F59E0B]",
  },
  review: {
    label: "Шалгаж байна",
    pill: "bg-[#DBEAFE] text-[#1D4ED8]",
    dot: "bg-[#3B82F6]",
  },
  done: {
    label: "Дууссан",
    pill: "bg-[#DCFCE7] text-[#15803D]",
    dot: "bg-[#22C55E]",
  },
};

function normalizeTaskAssigneeId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isSameDashboardUser(
  left: number | string | null | undefined,
  right: number | string,
) {
  return left !== null && left !== undefined && String(left) === String(right);
}

function isOverdue(task: DashboardSnapshot["taskDirectory"][number], currentDateKey: string) {
  return Boolean(
    task.scheduledDate &&
      task.scheduledDate < currentDateKey &&
      task.statusKey !== "verified",
  );
}

function isDoneTask(task: DashboardSnapshot["taskDirectory"][number]) {
  return task.statusKey === "verified" || task.stageBucket === "done" || task.progress >= 100;
}

function isNewIncomingTask(task: DashboardSnapshot["taskDirectory"][number], currentDateKey: string) {
  return Boolean(task.createdDate === currentDateKey && task.statusKey !== "verified");
}

function countNotificationTasks(
  tasks: DashboardSnapshot["taskDirectory"],
  currentDateKey: string,
) {
  const taskIds = new Set<number>();

  for (const task of tasks) {
    if (
      isNewIncomingTask(task, currentDateKey) ||
      isOverdue(task, currentDateKey) ||
      task.statusKey === "review" ||
      task.issueFlag
    ) {
      taskIds.add(task.id);
    }
  }

  return taskIds.size;
}

function countTaskWorkItems(tasks: DashboardSnapshot["taskDirectory"]) {
  return new Set(
    tasks
      .map((task) => task.projectId ?? task.id)
      .filter((id): id is number => typeof id === "number"),
  ).size;
}

function dashboardTaskBucket(
  task: DashboardSnapshot["taskDirectory"][number],
  currentDateKey: string,
): "done" | "working" | "review" | "overdue" | "planned" {
  if (task.statusKey === "review") {
    return "review";
  }
  if (task.statusKey === "verified") {
    return "done";
  }
  if (isOverdue(task, currentDateKey)) {
    return "overdue";
  }
  if (task.statusKey === "working" || task.progress > 0) {
    return "working";
  }

  return "planned";
}

function dashboardTaskStats(tasks: DashboardSnapshot["taskDirectory"], currentDateKey: string) {
  const stats = {
    total: tasks.length,
    completed: 0,
    working: 0,
    review: 0,
    overdue: 0,
    planned: 0,
    progress: 0,
  };

  for (const task of tasks) {
    const bucket = dashboardTaskBucket(task, currentDateKey);
    if (bucket === "done") {
      stats.completed += 1;
    } else {
      stats[bucket] += 1;
    }
    stats.progress += clampPercent(task.progress);
  }

  stats.progress = stats.total ? Math.round(stats.progress / stats.total) : 0;

  return stats;
}

function statusTone(task: DashboardSnapshot["taskDirectory"][number], currentDateKey: string): StatusTone {
  if (task.issueFlag || isOverdue(task, currentDateKey) || task.statusKey === "problem") {
    return "urgent";
  }
  if (isNewIncomingTask(task, currentDateKey)) {
    return "attention";
  }
  if (task.statusKey === "review") {
    return "attention";
  }
  if (task.statusKey === "working" || task.statusKey === "verified") {
    return "good";
  }
  return "muted";
}

function projectTone(project: DashboardSnapshot["projects"][number]): StatusTone {
  if (project.stageBucket === "review") {
    return "attention";
  }
  if (project.stageBucket === "progress" || project.stageBucket === "done") {
    return "good";
  }
  return "muted";
}

function projectDisplayStageLabel(project: DashboardSnapshot["projects"][number]) {
  const stageLabel = fixMojibakeText(project.stageLabel || "");
  if (stageLabel && stageLabel !== "Тодорхойгүй") {
    return stageLabel;
  }

  if (project.stageBucket === "done") {
    return "Дууссан";
  }
  if (project.stageBucket === "review") {
    return "Хянаж байгаа";
  }
  return "Төлөвлөсөн";
}

function projectListIcon(project: DashboardSnapshot["projects"][number]): LucideIcon {
  const text = fixMojibakeText(
    `${project.name} ${project.departmentName} ${project.operationTypeLabel ?? ""}`,
  ).toLowerCase();

  if (text.includes("хог") || text.includes("тээвэр")) {
    return Truck;
  }
  if (text.includes("ногоон") || text.includes("мод") || text.includes("цэцэг") || text.includes("зүлэг")) {
    return Leaf;
  }
  if (text.includes("цэвэр") || text.includes("тохиж")) {
    return Recycle;
  }

  return ClipboardList;
}

function ProjectListIcon({ project }: { project: DashboardSnapshot["projects"][number] }) {
  const icon = projectListIcon(project);

  if (icon === Truck) {
    return <Truck />;
  }
  if (icon === Leaf) {
    return <Leaf />;
  }
  if (icon === Recycle) {
    return <Recycle />;
  }

  return <ClipboardList />;
}

type ProjectStatusFilterKey = "planned" | "review" | "done";

function projectMatchesStatusFilter(
  project: DashboardSnapshot["projects"][number],
  filter: ProjectStatusFilterKey,
) {
  if (filter === "planned") {
    return project.stageBucket === "todo" || project.stageBucket === "progress" || project.stageBucket === "unknown";
  }
  if (filter === "review") {
    return project.stageBucket === "review" || project.stageBucket === "problem";
  }
  if (filter === "done") {
    return project.stageBucket === "done";
  }

  return false;
}

function projectStatusFilterChips(projects: DashboardSnapshot["projects"]) {
  const planned = projects.filter(
    (project) =>
      project.stageBucket === "todo" || project.stageBucket === "progress" || project.stageBucket === "unknown",
  ).length;
  const review = projects.filter((project) => project.stageBucket === "review" || project.stageBucket === "problem").length;
  const done = projects.filter((project) => project.stageBucket === "done").length;

  return [
    { key: "planned" as const, label: "Төлөвлөсөн", count: planned, tone: "muted" },
    { key: "review" as const, label: "Хянаж байгаа", count: review, tone: "amber" },
    { key: "done" as const, label: "Дууссан", count: done, tone: "green" },
  ];
}

function ringStyle(value: number, color = "#2E7D32"): CSSProperties {
  const normalized = clampPercent(value);

  return {
    background: `conic-gradient(${color} ${normalized * 3.6}deg, rgba(165,214,167,.32) 0deg)`,
  };
}

function hasDashboardWork(project: DashboardSnapshot["projects"][number]) {
  return project.openTasks > 0 || project.completion > 0 || project.stageBucket === "done";
}

type WorkerWorkSummary = {
  name: string;
  departmentName: string;
  manager: string;
  managerJobTitle?: string;
  href: string;
  taskCount: number;
  reviewCount: number;
  doneCount: number;
  progress: number;
  tone: StatusTone;
};

function buildWorkerWorkSummaries(
  tasks: DashboardSnapshot["taskDirectory"],
  projects: DashboardSnapshot["projects"],
  currentDateKey: string,
) {
  const projectByName = new Map(projects.map((project) => [project.name, project]));
  const score = { urgent: 4, attention: 3, good: 2, muted: 1 };

  return Array.from(
    tasks
      .reduce<
        Map<
          string,
          {
            name: string;
            departmentName: string;
            manager: string;
            managerJobTitle?: string;
            tasks: DashboardSnapshot["taskDirectory"];
          }
        >
      >((groups, task) => {
        const project = projectByName.get(task.projectName);
        const existing = groups.get(task.projectName) ?? {
          name: task.projectName,
          departmentName: project?.departmentName ?? task.departmentName,
          manager: project?.manager ?? task.leaderName,
          managerJobTitle: project?.managerJobTitle,
          tasks: [],
        };

        existing.tasks.push(task);
        groups.set(task.projectName, existing);
        return groups;
      }, new Map())
      .values(),
  )
    .map<WorkerWorkSummary>((work) => {
      const tones = work.tasks.map((task) => statusTone(task, currentDateKey));
      const tone = tones.reduce<StatusTone>(
        (current, nextTone) => (score[nextTone] > score[current] ? nextTone : current),
        "muted",
      );
      const taskCount = work.tasks.length;

      return {
        name: work.name,
        departmentName: work.departmentName,
        manager: work.manager,
        managerJobTitle: work.managerJobTitle,
        href: `/tasks?work=${encodeURIComponent(work.name)}`,
        taskCount,
        reviewCount: work.tasks.filter((task) => task.statusKey === "review").length,
        doneCount: work.tasks.filter((task) => task.statusKey === "verified").length,
        progress: taskCount
          ? Math.round(work.tasks.reduce((total, task) => total + task.progress, 0) / taskCount)
          : 0,
        tone,
      };
    })
    .sort(
      (left, right) =>
        score[right.tone] - score[left.tone] ||
        right.taskCount - left.taskCount ||
        left.name.localeCompare(right.name, "mn"),
    );
}

function ProgressRing({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  return (
    <div
      className={cn("grid shrink-0 place-items-center rounded-full p-1", size === "lg" ? "h-[132px] w-[132px]" : "h-14 w-14")}
      style={ringStyle(value)}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-white/92 text-center shadow-inner">
        <strong
          className={cn(
            "font-extrabold leading-none tracking-normal text-[#111B15]",
            size === "lg" ? "text-2xl" : "text-sm",
          )}
        >
          {clampPercent(value)}%
        </strong>
      </div>
    </div>
  );
}

function WorkerWorkCard({ work }: { work: WorkerWorkSummary }) {
  const badgeTone =
    work.tone === "urgent" ? "red" : work.tone === "attention" ? "amber" : work.tone === "good" ? "green" : "slate";
  const workName = fixMojibakeText(work.name);
  const departmentName = fixMojibakeText(work.departmentName);
  const managerName = fixMojibakeText(work.manager || "Бүртгэлгүй");
  const managerTitle = fixMojibakeText(work.managerJobTitle || "Хариуцсан ажилтан");

  return (
    <Link href={work.href} className={dashboardStyles.projectListLink}>
      <Card className={dashboardStyles.projectListCard}>
        <div className={dashboardStyles.projectListTop}>
          <span className={dashboardStyles.projectListIcon}>
            <ClipboardList />
          </span>
          <Badge tone={badgeTone}>{work.taskCount} даалгавар</Badge>
        </div>

        <div className={dashboardStyles.projectListContent}>
          <h3 className={dashboardStyles.projectListTitle} title={workName}>
            {workName}
          </h3>
          <p className={dashboardStyles.projectListMeta}>
            Алба нэгж: {departmentName} · {managerTitle}: {managerName}
          </p>
        </div>

        <div className={dashboardStyles.projectListDivider} />

        <div className={dashboardStyles.projectListMetrics}>
          <div className={dashboardStyles.projectListMetric}>
            <span>Даалгавар</span>
            <strong>{work.taskCount}</strong>
          </div>
          <div className={dashboardStyles.projectListMetric}>
            <span>Гүйцэтгэл</span>
            <strong>{clampPercent(work.progress)}%</strong>
          </div>
          <ProgressRing value={work.progress} />
        </div>
      </Card>
    </Link>
  );
}

function ProjectCard({ project }: { project: DashboardSnapshot["projects"][number] }) {
  const tone = projectTone(project);
  const badgeTone = tone === "urgent" ? "red" : tone === "attention" ? "amber" : tone === "good" ? "green" : "slate";
  const projectName = fixMojibakeText(project.name);
  const departmentName = fixMojibakeText(project.departmentName);
  const managerName = fixMojibakeText(project.manager || "Бүртгэлгүй");
  const managerTitle = fixMojibakeText(project.managerJobTitle || "Хариуцсан ажилтан");

  return (
    <Link href={project.href} className={dashboardStyles.projectListLink}>
      <Card className={dashboardStyles.projectListCard}>
        <div className={dashboardStyles.projectListTop}>
          <span
            className={cn(
              dashboardStyles.projectListIcon,
              tone === "attention" && dashboardStyles.projectListIconAmber,
              tone === "muted" && dashboardStyles.projectListIconMuted,
            )}
          >
            <ProjectListIcon project={project} />
          </span>
          <Badge tone={badgeTone}>{projectDisplayStageLabel(project)}</Badge>
        </div>

        <div className={dashboardStyles.projectListContent}>
          <h3 className={dashboardStyles.projectListTitle} title={projectName}>
            {projectName}
          </h3>
          <p className={dashboardStyles.projectListMeta}>
            Алба нэгж: {departmentName} · {managerTitle}: {managerName}
          </p>
        </div>

        <div className={dashboardStyles.projectListDivider} />

        <div className={dashboardStyles.projectListMetrics}>
          <div className={dashboardStyles.projectListMetric}>
            <span>Даалгавар</span>
            <strong>{project.openTasks || 0}</strong>
          </div>
          <div className={dashboardStyles.projectListMetric}>
            <span>Гүйцэтгэл</span>
            <strong>{clampPercent(project.completion)}%</strong>
          </div>
          <ProgressRing value={project.completion} />
        </div>
      </Card>
    </Link>
  );
}

function CompletionDonut({
  completed,
  working,
  review,
  overdue,
  planned,
  total,
  progress,
}: {
  completed: number;
  working: number;
  review: number;
  overdue: number;
  planned: number;
  total: number;
  progress: number;
}) {
  const unclassified = Math.max(
    0,
    total - completed - working - review - overdue - planned,
  );
  const performanceRows = [
    { label: "Төлөвлөсөн", value: planned + working, color: "#9AA7B4" },
    { label: "Хянаж байгаа", value: review, color: "#F4B000" },
    { label: "Хугацаа хэтэрсэн", value: overdue, color: "#EF4444" },
    { label: "Дууссан", value: completed, color: "#2E7D32" },
    ...(unclassified
      ? [{ label: "Тодорхойгүй", value: unclassified, color: "#D6DAD7" }]
      : []),
  ];
  const donutStyle = segmentedDonutStyle(
    [
      { value: completed, color: "#2E7D32" },
      { value: review, color: "#F4B000" },
      { value: overdue, color: "#EF4444" },
      { value: planned + working, color: "#9AA7B4" },
      { value: unclassified, color: "#D6DAD7" },
    ],
    total,
  );

  return (
    <Card className={cn("p-4", dashboardStyles.softPanel, dashboardStyles.metricsCard)}>
      <div className={dashboardStyles.analyticsCardHeader}>
        <div>
          <CardTitle className="text-[1.125rem] font-semibold">Ажил гүйцэтгэлийн харагдац</CardTitle>
          <p className={dashboardStyles.metricsSummary}>Нийт даалгаврын гүйцэтгэл: {clampPercent(progress)}%</p>
        </div>
      </div>

      <div className={dashboardStyles.performancePanel}>
        <div className={dashboardStyles.segmentedDonut} style={donutStyle}>
          <div className={dashboardStyles.donutCenter}>
            <strong>{clampPercent(progress)}%</strong>
            <span>Гүйцэтгэл</span>
          </div>
        </div>
        <div className={dashboardStyles.progressLegend}>
          {performanceRows.map(({ label, value, color }) => {
            const rate = percent(Number(value), total);
            return (
              <div key={label} className={dashboardStyles.progressLegendRow}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                <span className={cn(dashboardStyles.legendLabel, "text-[#526157]")}>{label}</span>
                <strong className={dashboardStyles.legendValue}>{value}</strong>
                <span className={dashboardStyles.legendPercent}>({rate}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function segmentedDonutStyle(parts: Array<{ value: number; color: string }>, total: number): CSSProperties {
  if (!total) {
    return {
      background: "conic-gradient(#E7ECE8 0deg 360deg)",
    };
  }

  let cursor = 0;
  const segments = parts
    .filter((part) => part.value > 0)
    .map((part) => {
      const start = cursor;
      const end = cursor + (part.value / total) * 360;
      cursor = end;
      return `${part.color} ${start}deg ${end}deg`;
    });

  if (cursor < 360) {
    segments.push(`#E7ECE8 ${cursor}deg 360deg`);
  }

  return {
    background: `conic-gradient(${segments.join(", ")})`,
  };
}

function MobilePriorityPanel({ canWriteReports }: { canWriteReports: boolean }) {
  const quickActions = [
    { label: "Захирамж, үүрэг даалгавар үүсгэх", href: "/create", icon: Plus },
    { label: "Захирамж, үүрэг даалгаврын жагсаалт", href: "/projects", icon: ListChecks },
    { label: "Тайлан харах", href: canWriteReports ? "/reports" : "/review", icon: BarChart3 },
    { label: "Календар харах", href: "/tasks?view=today", icon: CalendarDays },
  ];

  return (
    <div className={dashboardStyles.mobilePriorityPanel}>
      <Card className={cn(dashboardStyles.softPanel, dashboardStyles.sideCard)}>
        <CardTitle className={dashboardStyles.sideCardTitle}>Түргэн холбоосууд</CardTitle>
        <div className={dashboardStyles.sideQuickGrid}>
          {quickActions.map((action) => {
            const Icon = action.icon;

            return (
              <Link key={action.label} href={action.href} className={dashboardStyles.sideQuickAction}>
                <span className={dashboardStyles.sideQuickIcon}>
                  <Icon />
                </span>
                <span>{action.label}</span>
              </Link>
            );
          })}
        </div>
      </Card>

      <Card className={cn(dashboardStyles.softPanel, dashboardStyles.quoteCard)}>
        <div
          className={dashboardStyles.quotePanel}
          style={{
            backgroundImage:
              `linear-gradient(90deg, rgba(246,251,246,.9), rgba(246,251,246,.54)), url(${DASHBOARD_IMAGES.seedling})`,
          }}
        >
          <Leaf className={dashboardStyles.quoteLeaf} />
          <p className={dashboardStyles.quoteText}>
            Өнөөдрийн уриа
            <br />
            “Байгалиа хайрлая, ирээдүйгээ хамгаалъя.”
          </p>
        </div>
      </Card>
    </div>
  );
}

function WeeklyLineChart({ points }: { points: ReturnType<typeof buildDashboardModel>["trendPoints"] }) {
  const values = points.length
    ? points
    : Array.from({ length: 7 }, (_, index) => ({
        id: String(index),
        label: `${index + 1}`,
        completion: 0,
        overdue: 0,
      }));
  const chartWidth = 220;
  const chartLeft = 20;
  const chartRight = 214;
  const chartTop = 10;
  const chartBottom = 82;
  const chartHeight = chartBottom - chartTop;
  const completedValues = values.map((point) => clampPercent(point.completion));
  const plannedValues = values.map((point) =>
    clampPercent(Math.max(point.completion, point.completion + Math.max(12, point.overdue * 0.25))),
  );
  const toPolyline = (series: number[]) =>
    series
      .map((activity, index) => {
        const x = values.length === 1 ? chartLeft : chartLeft + (index / (values.length - 1)) * (chartRight - chartLeft);
        const y = chartBottom - (clampPercent(activity) / 100) * chartHeight;
        return `${x},${y}`;
      })
      .join(" ");
  const totalActivity = Math.round(completedValues.reduce((sum, value) => sum + value, 0) / Math.max(1, completedValues.length));
  const hasActivity = completedValues.some((value) => value > 0) || plannedValues.some((value) => value > 0);
  const weekdayLabels = ["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];
  const gridLines = [100, 80, 60, 40, 20, 0].map((value) => ({
    value,
    y: chartBottom - (value / 100) * chartHeight,
  }));

  return (
    <Card className={cn("p-4", dashboardStyles.softPanel, dashboardStyles.metricsCard)}>
      <div className={dashboardStyles.weeklyHeader}>
        <CardTitle className="text-[1.125rem] font-semibold">Сүүлийн 7 хоногийн идэвх</CardTitle>
        <p className={dashboardStyles.metricsSummary}>Нийт идэвх: {Math.round(totalActivity)}</p>
      </div>
      <div className={dashboardStyles.weeklyChartWrap}>
        {!hasActivity ? <p className={dashboardStyles.weeklyEmptyHint}>Одоогоор идэвх бүртгэгдээгүй</p> : null}
        <svg viewBox={`0 0 ${chartWidth} 100`} className={cn("h-44 w-full", hasActivity ? "" : "opacity-55")}>
          {gridLines.map((line) => (
            <g key={`grid-${line.value}`}>
              <text x="1.5" y={line.y + 1.5} className="fill-[#64756B] text-[4px] font-semibold">
                {line.value}
              </text>
              <line
                x1={chartLeft}
                x2={chartWidth}
                y1={line.y}
                y2={line.y}
                stroke="rgba(100, 116, 139, 0.18)"
                strokeDasharray="3 4"
              />
            </g>
          ))}
          <polyline
            points={toPolyline(plannedValues)}
            fill="none"
            stroke="#9AA3A9"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <polyline
            points={toPolyline(completedValues)}
            fill="none"
            stroke="#2E7D32"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          {values.map((point, index) => {
            const x = values.length === 1 ? chartLeft : chartLeft + (index / (values.length - 1)) * (chartRight - chartLeft);
            const completedY = chartBottom - (completedValues[index] / 100) * chartHeight;
            const plannedY = chartBottom - (plannedValues[index] / 100) * chartHeight;

            return (
              <g key={point.id}>
                <circle cx={x} cy={plannedY} r="1.9" fill="#9AA3A9" />
                <circle cx={x} cy={completedY} r="2.15" fill="#2E7D32" />
                <text x={x} y="97" textAnchor="middle" className="fill-[#526157] text-[4px] font-semibold">
                  {weekdayLabels[index]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className={dashboardStyles.weeklyLegend}>
        <span><i className="bg-[#9AA3A9]" />Төлөвлөсөн</span>
        <span><i className="bg-[#2E7D32]" />Гүйцэтгэсэн</span>
      </div>
    </Card>
  );
}

function DepartmentPerformanceCard({ departments }: { departments: DashboardSnapshot["departments"] }) {
  const rows = departments
    .filter((department) => department.openTasks > 0 || department.completion > 0)
    .slice(0, 5);

  if (!rows.length) {
    return null;
  }

  return (
    <Card className={cn(dashboardStyles.softPanel, dashboardStyles.departmentPerformanceCard)}>
      <div className={dashboardStyles.departmentPerformanceHeader}>
        <CardTitle className="text-[1.125rem] font-semibold">Хэлтэс тус бүрийн гүйцэтгэл</CardTitle>
        <span>Хувиар</span>
      </div>
      <div className={dashboardStyles.departmentPerformanceList}>
        {rows.map((department) => {
          const fixedDepartmentName = fixMojibakeText(department.name);
          const fixedDepartmentLabel = fixMojibakeText(department.label || department.name);
          const Icon = departmentIcon(fixedDepartmentName);
          const value = clampPercent(department.completion);

          return (
            <div key={department.name} className={dashboardStyles.departmentPerformanceRow}>
              <span className={dashboardStyles.departmentPerformanceIcon}>
                <Icon />
              </span>
              <span className={dashboardStyles.departmentPerformanceName}>{fixedDepartmentLabel}</span>
              <span className={dashboardStyles.departmentPerformanceTrack}>
                <span style={{ width: `${value}%` }} />
              </span>
              <strong>{value}%</strong>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function departmentIcon(name: string): LucideIcon {
  if (name.includes("Хог") || name.includes("Авто")) {
    return Truck;
  }
  if (name.includes("Ногоон")) {
    return Leaf;
  }
  if (name.includes("Нийтийн")) {
    return UsersRound;
  }
  if (name.includes("Тохиж")) {
    return Recycle;
  }
  return ClipboardList;
}

function HrAttendanceCard({ summary }: { summary: HrDailyAttendanceSummary }) {
  const items = [
    {
      label: "Ажиллаж байна",
      value: summary.workingToday,
      icon: UserCheck,
      className: "bg-[#E7F5E7] text-[#2E7D32]",
    },
    {
      label: "Чөлөөтэй",
      value: summary.leaveToday,
      icon: Clock3,
      className: "bg-sky-50 text-sky-700",
    },
    {
      label: "Өвчтэй",
      value: summary.sickToday,
      icon: HeartPulse,
      className: "bg-amber-50 text-amber-700",
    },
  ];

  return (
    <Card className={cn(dashboardStyles.softPanel, dashboardStyles.sideCard)}>
      <div className={dashboardStyles.sideCardHeader}>
        <div>
          <CardTitle className={dashboardStyles.sideCardTitle}>Хүний нөөц</CardTitle>
          <CardDescription className={dashboardStyles.sideCardDescription}>Өнөөдрийн ирц</CardDescription>
        </div>
        <span className={dashboardStyles.sideHeaderIcon}>
          <UsersRound />
        </span>
      </div>

      <div className={dashboardStyles.sideMiniGrid}>
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.label} className={dashboardStyles.sideMiniItem}>
              <span className={cn(dashboardStyles.sideMiniIcon, item.className)}>
                <Icon />
              </span>
              <strong className={dashboardStyles.sideMiniValue}>
                {item.value}
              </strong>
              <span className={dashboardStyles.sideMiniLabel}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className={dashboardStyles.sideCardFooter}>
        <span>Нийт ажилтан</span>
        <strong>{summary.totalEmployees}</strong>
      </div>
    </Card>
  );
}

function RightPanel({
  totalTasks,
  completedTasks,
  workingTasks,
  fleetBoard,
  alertCount,
  canWriteReports,
  hrAttendanceSummary,
  departmentScopeName,
  showFleetSummary,
  showHrSummary,
  showWeatherSummary,
  showExecutiveSloganPanel,
  workerMode,
  weather,
}: {
  totalTasks: number;
  completedTasks: number;
  workingTasks: number;
  fleetBoard: FleetVehicleBoard;
  alertCount: number;
  canWriteReports: boolean;
  hrAttendanceSummary: HrDailyAttendanceSummary;
  departmentScopeName?: string | null;
  showFleetSummary: boolean;
  showHrSummary: boolean;
  showWeatherSummary: boolean;
  showExecutiveSloganPanel: boolean;
  workerMode: boolean;
  weather: WeatherSnapshot;
}) {
  const systemInfoTitle = departmentScopeName ? "Алба нэгжийн мэдээлэл" : "Системийн мэдээлэл";
  const systemInfoRows: Array<[string, number]> = departmentScopeName
    ? [
        ["Ажилтан", hrAttendanceSummary.totalEmployees],
        ["Нийт ажил", totalTasks],
        ["Нээлттэй ажил", workingTasks],
        ["Дууссан ажил", completedTasks],
        ["Анхаарах", alertCount],
      ]
    : [
        ["Хэрэглэгч", 128],
        ["Нийт ажил", totalTasks],
        ["Нээлттэй ажил", workingTasks],
        ["Дууссан ажил", completedTasks],
        ["Анхаарах", alertCount],
      ];
  const visibleSystemInfoRows = showHrSummary
    ? systemInfoRows
    : systemInfoRows.filter((_, index) => index !== 0);
  const quickActions = [
    { label: "Захирамж, үүрэг даалгавар үүсгэх", href: "/create", icon: Plus },
    { label: "Захирамж, үүрэг даалгаврын жагсаалт", href: "/projects", icon: ListChecks },
    { label: "Тайлан харах", href: canWriteReports ? "/reports" : "/review", icon: BarChart3 },
    { label: "Календарь харах", href: "/tasks?view=today", icon: CalendarDays },
  ];

  return (
    <aside className={dashboardStyles.rightRail}>
      {!workerMode ? (
        <Card className={cn(dashboardStyles.softPanel, dashboardStyles.sideCard)}>
        <CardTitle className={dashboardStyles.sideCardTitle}>Түргэн холбоосууд</CardTitle>
        <div className={dashboardStyles.sideQuickGrid}>
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className={dashboardStyles.sideQuickAction}
              >
                <span className={dashboardStyles.sideQuickIcon}>
                  <Icon />
                </span>
                <span>{action.label}</span>
              </Link>
            );
          })}
        </div>
        </Card>
      ) : null}

      {showExecutiveSloganPanel ? (
        <ExecutiveSloganPanel />
      ) : (
        <Card className={cn(dashboardStyles.softPanel, dashboardStyles.quoteCard)}>
        <div
          className={dashboardStyles.quotePanel}
          style={{
            backgroundImage:
              `linear-gradient(90deg, rgba(246,251,246,.9), rgba(246,251,246,.54)), url(${DASHBOARD_IMAGES.seedling})`,
          }}
        >
          <Leaf className={dashboardStyles.quoteLeaf} />
          <p className={dashboardStyles.quoteText}>
            Өнөөдрийн уриа
            <br />
            “Байгалиа хайрлая, ирээдүйгээ хамгаалъя.”
          </p>
        </div>
        </Card>
      )}

      {!workerMode ? (
        <>
          <Card className={cn(dashboardStyles.softPanel, dashboardStyles.sideCard)}>
            <CardTitle className={dashboardStyles.sideCardTitle}>{systemInfoTitle}</CardTitle>
            <div className={dashboardStyles.systemList}>
              {visibleSystemInfoRows.map(([label, value]) => (
                <div key={String(label)} className={dashboardStyles.systemRow}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </Card>

          {showFleetSummary ? (
            <Card className={cn(dashboardStyles.softPanel, dashboardStyles.sideCard)}>
              <CardTitle className={dashboardStyles.sideCardTitle}>Өнөөдрийн ачсан хог</CardTitle>
              <p className={dashboardStyles.sideCardDescription}>
                Машинаар татагдсан жингийн бүртгэлээс нэгтгэн харуулна.
              </p>
              <div className={cn(dashboardStyles.sideMiniGrid, dashboardStyles.sideMiniGridTwo)}>
                <div className={dashboardStyles.sideMiniItem}>
                  <span className={cn(dashboardStyles.sideMiniIcon, "bg-[#E7F5E7] text-[#2E7D32]")}>
                    <Recycle />
                  </span>
                  <strong className={dashboardStyles.sideMiniValue}>{fleetBoard.todayWeightLabel}</strong>
                  <span className={dashboardStyles.sideMiniLabel}>Ачсан жин</span>
                </div>
                <div className={dashboardStyles.sideMiniItem}>
                  <span className={cn(dashboardStyles.sideMiniIcon, "bg-[#E7F5E7] text-[#2E7D32]")}>
                    <Truck />
                  </span>
                  <strong className={dashboardStyles.sideMiniValue}>{fleetBoard.activeCount}</strong>
                  <span className={dashboardStyles.sideMiniLabel}>Ажиллаж буй машин</span>
                </div>
              </div>
            </Card>
          ) : null}

          {showHrSummary ? <HrAttendanceCard summary={hrAttendanceSummary} /> : null}
        </>
      ) : null}

      {showWeatherSummary ? (
        <Card className={cn(dashboardStyles.softPanel, dashboardStyles.sideCard)}>
          <CardTitle className={dashboardStyles.sideCardTitle}>Цаг агаар</CardTitle>
          <div className={dashboardStyles.weatherContent}>
            <Sun className={dashboardStyles.weatherIcon} />
            <div>
              <span className={dashboardStyles.weatherCity}>{weather.city}</span>
              <strong className={dashboardStyles.weatherTemp}>
                {weather.temperature === null ? "--" : weather.temperature}°C
              </strong>
              <small className={dashboardStyles.weatherNote}>
                {weather.condition}
                {weather.windSpeed !== null ? ` · Салхи ${weather.windSpeed} км/ц` : ""}
              </small>
            </div>
            <div className={dashboardStyles.weatherBadge}>
              {weather.aqiLabel}
              <br />
              AQI {weather.aqi ?? "--"}
            </div>
          </div>
        </Card>
      ) : null}

    </aside>
  );
}

type ExecutiveMetric = {
  label: string;
  value: string;
  valueLabel?: string;
  note?: string;
  progress: number;
  /* Хувь (%) илэрхийлдэг үзүүлэлт дээр л ring зурна — тоон үзүүлэлт дээр
     заримдаа гарч, заримдаа гардаггүй байсныг жигдэлсэн. */
  showRing?: boolean;
  href: string;
  icon: LucideIcon;
  tone: "green" | "orange" | "blue" | "purple" | "red" | "teal";
};

type ExecutiveDepartmentMetric = {
  name: string;
  progress: number;
  total: number;
  working: number;
  review: number;
  todayDone: number;
  todayTotal: number;
  risky: number;
  href: string;
  icon: LucideIcon;
  tone: ExecutiveMetric["tone"];
  image: string;
  imagePosition: string;
};

type ExecutiveActivityRow = {
  id: string;
  title: string;
  detail: string;
  time: string;
  href: string;
  icon: LucideIcon;
  tone: ExecutiveMetric["tone"];
};

const EXECUTIVE_TONE_COLORS: Record<ExecutiveMetric["tone"], string> = {
  green: "#078251",
  orange: "#f58a07",
  blue: "#1677d2",
  purple: "#453f99",
  red: "#ef4444",
  teal: "#0f8f78",
};

const EXECUTIVE_TONE_SOFT_COLORS: Record<ExecutiveMetric["tone"], string> = {
  green: "#e8f6ed",
  orange: "#fff3e6",
  blue: "#eaf4ff",
  purple: "#f0efff",
  red: "#feeceb",
  teal: "#e5f7f3",
};

type AutoGarbageLeaderboardRow = {
  key: string;
  plate: string;
  modelName: string;
  driverName: string;
  taskCount: number;
  weightTons: number;
  reportDate: string;
  fetchedAt: string;
  fetchedAtValue: string;
  dataSourceLabel: string;
  progress: number;
};

type AutoGarbageFuelRow = {
  key: string;
  plate: string;
  modelName: string;
  fuelLiters: number;
  fuelType: string;
  reportDate: string;
  fetchedAt: string;
  fetchedAtValue: string;
  progress: number;
};

type AutoGarbageWeightReportRow = {
  key: string;
  vehicleId: number | null;
  plate: string;
  modelName: string;
  reportDate: string;
  reportDateValue: string;
  fetchedAt: string;
  fetchedAtValue: string;
  weightTons: number;
  weightLabel: string;
  source: string;
  stateLabel: string;
  errorMessage: string;
};

type AutoGarbageFuelReportRow = {
  key: string;
  vehicleId: number | null;
  plate: string;
  modelName: string;
  reportDate: string;
  reportDateValue: string;
  fetchedAt: string;
  fetchedAtValue: string;
  fuelLiters: number;
  fuelLabel: string;
  fuelType: string;
  source: string;
  stateLabel: string;
  errorMessage: string;
};

type AutoGarbageReportPanelMode = "overview" | "weight" | "fuel";

type AutoGarbageTaskCard = {
  task: DashboardSnapshot["taskDirectory"][number];
  tasks: DashboardSnapshot["taskDirectory"];
  title: string;
  href: string;
  workDate: string;
  leaderName: string;
  progress: number;
  vehiclePlate: string;
  vehicleModel: string;
  routeLabel: string;
  weightTons: number;
  taskCount: number;
  statusLabel: string;
  statusTone: "green" | "orange" | "blue" | "muted";
};

type AutoGarbageTaskGroup = {
  key: string;
  tasks: DashboardSnapshot["taskDirectory"];
  primaryTask: DashboardSnapshot["taskDirectory"][number];
  vehicle: FleetVehicleBoard["allVehicles"][number] | null;
  plate: string;
  plateKey: string;
  workDate: string;
};

function dashboardCleanText(value: string | null | undefined) {
  return fixMojibakeText(value ?? "").trim();
}

function dashboardSearchText(value: string | null | undefined) {
  return normalizeOrganizationUnitName(dashboardCleanText(value)).toLocaleLowerCase("mn-MN");
}

function isAutoGarbageDashboardScope(departmentScopeName: string | null | undefined) {
  const scopeName = dashboardSearchText(departmentScopeName);

  return Boolean(
    scopeName &&
      ((scopeName.includes("авто") && scopeName.includes("хог")) ||
        (scopeName.includes("авто") && scopeName.includes("тээвэр")) ||
        scopeName.includes("хог тээвэр")),
  );
}

function isAutoGarbageTask(
  task: DashboardSnapshot["taskDirectory"][number],
  departmentScopeName: string | null | undefined,
) {
  if (isAutoGarbageDashboardScope(departmentScopeName)) {
    const departmentName = dashboardSearchText(task.departmentName);
    const combinedText = [
      task.departmentName,
      task.operationType,
      task.operationTypeLabel,
      task.projectName,
      task.name,
    ]
      .map(dashboardSearchText)
      .join(" ");

    return (
      !departmentName ||
      departmentName.includes("авто") ||
      departmentName.includes("хог") ||
      combinedText.includes("хог") ||
      combinedText.includes("ачилт") ||
      combinedText.includes("цуглуулалт") ||
      combinedText.includes("тээвэр")
    );
  }

  const combinedText = [
    task.departmentName,
    task.operationType,
    task.operationTypeLabel,
    task.projectName,
    task.name,
  ]
    .map(dashboardSearchText)
    .join(" ");

  return (
    combinedText.includes("хог") ||
    combinedText.includes("ачилт") ||
    combinedText.includes("цуглуулалт") ||
    combinedText.includes("тээвэрлэлт")
  );
}

function isAutoGarbageVehicle(vehicle: FleetVehicleBoard["allVehicles"][number]) {
  const text = [
    vehicle.departmentName,
    vehicle.name,
    vehicle.modelName,
    vehicle.categoryName,
    vehicle.vehicleTypeName,
  ]
    .map(dashboardSearchText)
    .join(" ");

  return text.includes("хог") || text.includes("тээвэр") || text.includes("авто");
}

function parseWeightLabelToTons(value: string | null | undefined) {
  const normalized = dashboardCleanText(value).toLocaleLowerCase("mn-MN");
  const numericMatch = normalized.replace(/\s+/g, "").match(/-?\d+(?:[,.]\d+)?/);
  const parsedValue = numericMatch ? Number.parseFloat(numericMatch[0].replace(",", ".")) : 0;

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 0;
  }

  if (normalized.includes("кг") || normalized.includes("kg")) {
    return parsedValue / 1000;
  }

  return parsedValue;
}

function taskWeightToTons(task: DashboardSnapshot["taskDirectory"][number]) {
  const reportQuantity = task.latestReport?.reportedQuantity ?? 0;
  const completedQuantity = task.completedQuantity ?? 0;
  const quantity = reportQuantity > 0 ? reportQuantity : completedQuantity;
  const unitName = dashboardSearchText(task.latestReport?.measurementUnit || task.measurementUnit);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }

  if (unitName.includes("кг") || unitName.includes("kg")) {
    return quantity / 1000;
  }

  if (
    unitName.includes("тн") ||
    unitName.includes("тон") ||
    unitName.includes("ton") ||
    unitName.includes("жин")
  ) {
    return quantity;
  }

  return 0;
}

function compactVehicleKey(value: string | null | undefined) {
  return dashboardCleanText(value)
    .toLocaleUpperCase("mn-MN")
    .replace(/[^0-9A-ZА-ЯӨҮЁ]/g, "");
}

function extractVehiclePlateFromText(value: string | null | undefined) {
  const plateMatch = dashboardCleanText(value)
    .toLocaleUpperCase("mn-MN")
    .match(/\d{3,5}\s*[A-ZА-ЯӨҮЁ]{2,4}/u);

  return plateMatch?.[0].replace(/\s+/g, "") ?? "";
}

function taskVehicleSearchText(task: DashboardSnapshot["taskDirectory"][number]) {
  return [
    task.name,
    task.projectName,
    task.latestReport?.summary,
    task.latestReport?.text,
  ]
    .map(dashboardCleanText)
    .join(" ");
}

function resolveTaskPlate(task: DashboardSnapshot["taskDirectory"][number]) {
  return extractVehiclePlateFromText(taskVehicleSearchText(task));
}

function findTaskVehicle(
  task: DashboardSnapshot["taskDirectory"][number],
  vehicles: FleetVehicleBoard["allVehicles"],
) {
  const taskPlateKey = compactVehicleKey(resolveTaskPlate(task));

  if (!taskPlateKey) {
    return null;
  }

  return (
    vehicles.find((vehicle) => {
      const vehiclePlateKey = compactVehicleKey(
        extractVehiclePlateFromText(vehicle.plate) ||
          extractVehiclePlateFromText(vehicle.name) ||
          vehicle.plate,
      );
      return vehiclePlateKey && (taskPlateKey.includes(vehiclePlateKey) || vehiclePlateKey.includes(taskPlateKey));
    }) ?? null
  );
}

function resolveTaskVehicleSummary(
  task: DashboardSnapshot["taskDirectory"][number],
  vehicles: FleetVehicleBoard["allVehicles"],
) {
  const vehicle = findTaskVehicle(task, vehicles);
  const taskPlate = resolveTaskPlate(task);
  const plate =
    extractVehiclePlateFromText(vehicle?.plate) ||
    extractVehiclePlateFromText(vehicle?.name) ||
    taskPlate ||
    dashboardCleanText(vehicle?.plate || vehicle?.name || "Машин тодорхойгүй");

  return {
    vehicle,
    plate,
    plateKey: compactVehicleKey(plate),
  };
}

function groupAutoGarbageTasks(
  tasks: DashboardSnapshot["taskDirectory"],
  vehicles: FleetVehicleBoard["allVehicles"],
) {
  const groups = new Map<string, AutoGarbageTaskGroup>();

  for (const task of tasks) {
    const { vehicle, plate, plateKey } = resolveTaskVehicleSummary(task, vehicles);
    const workDate = task.scheduledDate || task.createdDate || "";
    const groupKey = plateKey && workDate ? `${plateKey}:${workDate}` : `task:${task.id}`;
    const currentGroup = groups.get(groupKey);

    if (currentGroup) {
      currentGroup.tasks.push(task);
      if (task.progress > currentGroup.primaryTask.progress) {
        currentGroup.primaryTask = task;
      }
      continue;
    }

    groups.set(groupKey, {
      key: groupKey,
      tasks: [task],
      primaryTask: task,
      vehicle,
      plate,
      plateKey,
      workDate,
    });
  }

  return Array.from(groups.values());
}

function autoGarbageGroupProgress(tasks: DashboardSnapshot["taskDirectory"]) {
  const planned = tasks.reduce((sum, task) => sum + Math.max(0, task.plannedQuantity || 0), 0);
  const completed = tasks.reduce((sum, task) => sum + Math.max(0, task.completedQuantity || 0), 0);

  if (planned > 0) {
    return clampPercent((completed / planned) * 100);
  }

  return clampPercent(Math.max(...tasks.map((task) => task.progress), 0));
}

function autoGarbageGroupStatus(tasks: DashboardSnapshot["taskDirectory"]): Pick<AutoGarbageTaskCard, "statusLabel" | "statusTone"> {
  if (
    tasks.some(
      (task) =>
        task.issueFlag ||
        task.statusKey === "problem" ||
        task.hasWeightWarning ||
        Boolean(task.unresolvedStopCount || task.missingProofStopCount || task.deviationStopCount),
    )
  ) {
    return { statusLabel: "Анхаарах", statusTone: "orange" };
  }

  const firstReviewTask = tasks.find((task) => task.statusKey === "review");
  if (firstReviewTask) {
    return {
      statusLabel: dashboardCleanText(firstReviewTask.statusLabel || firstReviewTask.stageLabel || "Хянаж байгаа"),
      statusTone: "green",
    };
  }

  const firstWorkingTask = tasks.find((task) => task.statusKey === "working");
  if (firstWorkingTask) {
    return {
      statusLabel: dashboardCleanText(firstWorkingTask.statusLabel || firstWorkingTask.stageLabel || "Төлөвлөсөн"),
      statusTone: "green",
    };
  }

  if (tasks.every(isDoneTask)) {
    return {
      statusLabel: dashboardCleanText(tasks[0]?.statusLabel || tasks[0]?.stageLabel || "Дууссан"),
      statusTone: "green",
    };
  }

  if (autoGarbageGroupProgress(tasks) > 0) {
    return {
      statusLabel: "Төлөвлөсөн",
      statusTone: "green",
    };
  }

  const uniqueStatusLabels = Array.from(
    new Set(tasks.map((task) => dashboardCleanText(task.statusLabel || task.stageLabel)).filter(Boolean)),
  );

  return {
    statusLabel: uniqueStatusLabels.length === 1 ? uniqueStatusLabels[0] : "Төлөвлөсөн",
    statusTone: "muted",
  };
}

function autoGarbageGroupTitle(group: AutoGarbageTaskGroup) {
  if (group.tasks.length <= 1) {
    return dashboardCleanText(group.primaryTask.name || group.primaryTask.projectName || "Хог тээврийн ажил");
  }

  const dateLabel = group.workDate || group.primaryTask.scheduledDate || group.primaryTask.createdDate || "";
  return `${dashboardCleanText(group.plate)} - ${dateLabel} - ${group.tasks.length} цэг`;
}

function formatAutoGarbageDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return dashboardCleanText(value);
  }

  return `${year} оны ${Number(month)}-р сарын ${Number(day)}`;
}

function formatTons(value: number) {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  const formatted = new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: normalized >= 10 ? 1 : 2,
  }).format(normalized);

  return `${formatted} тн`;
}

function formatFuelLiters(value: number) {
  const normalized = Number.isFinite(value) ? Math.max(0, value) : 0;
  const formatted = new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: normalized >= 100 ? 0 : 1,
  }).format(normalized);

  return `${formatted} л`;
}

function fetchedTimeValue(value: string | null | undefined) {
  const cleaned = dashboardCleanText(value);
  if (!cleaned) {
    return 0;
  }

  const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(cleaned);
  const normalized = /^\d{4}-\d{2}-\d{2}\s+\d/.test(cleaned) && !hasExplicitTimezone
    ? `${cleaned.replace(" ", "T")}Z`
    : cleaned;
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function formatAutoGarbageNumericDate(value: string | null | undefined, fallback = "") {
  const cleaned = dashboardCleanText(value);
  if (!cleaned) {
    return fallback;
  }

  const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(cleaned);
  const normalized =
    /^\d{4}-\d{2}-\d{2}$/.test(cleaned)
      ? `${cleaned}T12:00:00+08:00`
      : /^\d{4}-\d{2}-\d{2}\s+\d/.test(cleaned) && !hasExplicitTimezone
        ? `${cleaned.replace(" ", "T")}Z`
        : cleaned;
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return cleaned;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(parsed);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const year = parts.find((part) => part.type === "year")?.value;

  return month && day && year ? `${month}.${day}.${year}` : cleaned;
}

function formatFetchedAt(value: string | null | undefined, fallback = "") {
  return formatAutoGarbageNumericDate(value, fallback);
}

function reportDateKey(report: { reportDateValue?: string; reportDate?: string }) {
  const rawValue = dashboardCleanText(report.reportDateValue);
  if (/^\d{4}-\d{2}-\d{2}/.test(rawValue)) {
    return rawValue.slice(0, 10);
  }

  return dashboardCleanText(report.reportDate);
}

function latestFetchedReport<T extends { fetchedAtValue?: string; fetchedAt?: string }>(reports: T[]) {
  return reports.reduce<T | null>((latest, report) => {
    if (!latest) {
      return report;
    }

    const latestTime = fetchedTimeValue(latest.fetchedAtValue || latest.fetchedAt);
    const reportTime = fetchedTimeValue(report.fetchedAtValue || report.fetchedAt);

    return reportTime > latestTime ? report : latest;
  }, null);
}

function latestFetchedAtLabel(rows: Array<{ fetchedAtValue?: string; fetchedAt?: string }>) {
  const latest = latestFetchedReport(rows);
  return latest ? formatFetchedAt(latest.fetchedAtValue || latest.fetchedAt) : "";
}

function reportFetchedLabel(row: { reportDate?: string; fetchedAt?: string; fetchedAtValue?: string }) {
  if (!row.fetchedAt) {
    return "Татсан огноо алга";
  }

  const reportDate = dashboardCleanText(row.reportDate);
  const fetchedAt = formatFetchedAt(row.fetchedAtValue || row.fetchedAt);

  return reportDate ? `Тайлан: ${reportDate} · Татсан: ${fetchedAt}` : `Татсан: ${fetchedAt}`;
}

function isFailedReport(row: { stateLabel?: string; errorMessage?: string }) {
  const stateText = dashboardCleanText(row.stateLabel).toLocaleLowerCase("mn-MN");
  return Boolean(row.errorMessage || stateText.includes("алда") || stateText.includes("failed"));
}

function AutoGarbageReportStatus({
  row,
}: {
  row: { stateLabel?: string; errorMessage?: string };
}) {
  const failed = isFailedReport(row);

  return (
    <span
      className={dashboardStyles.autoGarbageReportState}
      data-state={failed ? "failed" : "success"}
    >
      {row.stateLabel || (failed ? "Алдаатай" : "Татагдсан")}
    </span>
  );
}

function AutoGarbageReportTimeCell({
  row,
}: {
  row: { reportDate?: string; reportDateValue?: string; fetchedAt?: string; fetchedAtValue?: string };
}) {
  const reportDate = formatAutoGarbageNumericDate(row.reportDateValue || row.reportDate, "-");

  return (
    <span className={dashboardStyles.autoGarbageReportTime}>
      <small>Тайлангийн огноо</small>
      <strong>{reportDate}</strong>
      <small>Татсан огноо</small>
      <strong>{formatFetchedAt(row.fetchedAtValue || row.fetchedAt, "-")}</strong>
    </span>
  );
}

function sortByFetchedAtDesc<T extends { fetchedAtValue?: string; fetchedAt?: string; reportDate?: string }>(
  left: T,
  right: T,
) {
  const fetchedDiff =
    fetchedTimeValue(right.fetchedAtValue || right.fetchedAt) -
    fetchedTimeValue(left.fetchedAtValue || left.fetchedAt);

  if (fetchedDiff) {
    return fetchedDiff;
  }

  return dashboardCleanText(right.reportDate).localeCompare(dashboardCleanText(left.reportDate), "mn-MN");
}

function buildAutoGarbageBoardModel({
  tasks,
  fleetBoard,
  currentDateKey,
  departmentScopeName,
}: {
  tasks: DashboardSnapshot["taskDirectory"];
  fleetBoard: FleetVehicleBoard;
  currentDateKey: string;
  departmentScopeName: string | null | undefined;
}) {
  const matchedTasks = tasks.filter((task) => isAutoGarbageTask(task, departmentScopeName));
  const boardTasks = matchedTasks.length ? matchedTasks : tasks;
  const autoVehicles = fleetBoard.allVehicles.filter(isAutoGarbageVehicle);
  const reportVehicles = fleetBoard.allVehicles.filter(
    (vehicle) =>
      vehicle.weightMonthTons > 0 ||
      vehicle.weightTotalTons > 0 ||
      vehicle.weightReports.length > 0 ||
      vehicle.fuelReports.length > 0,
  );
  const boardVehicleById = new Map(
    [...autoVehicles, ...reportVehicles].map((vehicle) => [vehicle.id, vehicle] as const),
  );
  const boardVehicles = boardVehicleById.size ? Array.from(boardVehicleById.values()) : fleetBoard.allVehicles;
  const vehicleDisplayInfo = (vehicle: FleetVehicleBoard["allVehicles"][number]) => {
    const plate =
      extractVehiclePlateFromText(vehicle.plate) ||
      extractVehiclePlateFromText(vehicle.name) ||
      dashboardCleanText(vehicle.plate || vehicle.name);

    return {
      plate,
      modelName: dashboardCleanText(vehicle.modelName || vehicle.name || "Машин"),
    };
  };
  const taskWeightByPlate = new Map<string, number>();
  const taskCountByPlate = new Map<string, number>();

  for (const task of boardTasks) {
    const vehicle = findTaskVehicle(task, boardVehicles);
    const plate =
      extractVehiclePlateFromText(vehicle?.plate) ||
      extractVehiclePlateFromText(vehicle?.name) ||
      resolveTaskPlate(task);
    const plateKey = compactVehicleKey(plate);

    if (!plateKey) {
      continue;
    }

    taskCountByPlate.set(plateKey, (taskCountByPlate.get(plateKey) ?? 0) + 1);
    taskWeightByPlate.set(plateKey, (taskWeightByPlate.get(plateKey) ?? 0) + taskWeightToTons(task));
  }

  const initialLeaderboardRows = boardVehicles.map((vehicle) => {
    const { plate: displayPlate } = vehicleDisplayInfo(vehicle);
    const plateKey = compactVehicleKey(displayPlate);
    const weightReportSource = vehicle.weightReports;
    const latestWeightReport = latestFetchedReport(weightReportSource) ?? weightReportSource[0] ?? null;
    const reportTons = weightReportSource.reduce(
      (sum, report) => sum + (report.weightTons || parseWeightLabelToTons(report.weightLabel)),
      0,
    );
    const taskTons = taskWeightByPlate.get(plateKey) ?? 0;
    const weightTons = Math.max(reportTons, taskTons);
    const dataSourceLabel =
      reportTons >= taskTons && reportTons > 0
        ? "Жингийн бүртгэлээс"
        : taskTons > 0
          ? "Ажлын тайлангаас"
          : "Мэдээлэл алга";

    return {
      key: plateKey || String(vehicle.id),
      plate: displayPlate,
      modelName: dashboardCleanText(vehicle.modelName || vehicle.name || "Машин"),
      driverName: dashboardCleanText(vehicle.responsibleDriverName || vehicle.fleetDriverName || "Жолооч бүртгээгүй"),
      taskCount: taskCountByPlate.get(plateKey) ?? 0,
      weightTons,
      reportDate: latestWeightReport?.reportDate ?? "",
      fetchedAt: latestWeightReport?.fetchedAt ?? "",
      fetchedAtValue: latestWeightReport?.fetchedAtValue ?? "",
      dataSourceLabel,
      progress: 0,
    } satisfies AutoGarbageLeaderboardRow;
  });

  for (const [plateKey, taskTons] of taskWeightByPlate) {
    if (initialLeaderboardRows.some((row) => row.key === plateKey)) {
      continue;
    }

    initialLeaderboardRows.push({
      key: plateKey,
      plate: plateKey,
      modelName: "Бүртгэлтэй машин",
      driverName: "Жолооч бүртгээгүй",
      taskCount: taskCountByPlate.get(plateKey) ?? 0,
      weightTons: taskTons,
      reportDate: "",
      fetchedAt: "",
      fetchedAtValue: "",
      dataSourceLabel: "Ажлын тайлангаас",
      progress: 0,
    });
  }

  const maxWeight = Math.max(...initialLeaderboardRows.map((row) => row.weightTons), 0);
  const leaderboardRows = initialLeaderboardRows
    .map((row) => ({
      ...row,
      progress: maxWeight > 0 ? clampPercent((row.weightTons / maxWeight) * 100) : 0,
    }))
    .sort((left, right) => right.weightTons - left.weightTons || right.taskCount - left.taskCount);

  const initialFuelRows = boardVehicles.map((vehicle) => {
    const { plate: displayPlate, modelName } = vehicleDisplayInfo(vehicle);
    const todayReports = vehicle.fuelReports.filter((report) => reportDateKey(report) === currentDateKey);
    const reportSource = todayReports.length ? todayReports : vehicle.fuelReports;
    const latestFuelReport = latestFetchedReport(reportSource) ?? reportSource[0] ?? null;
    const fuelLiters = reportSource.reduce((sum, report) => sum + Math.max(0, report.fuelLiters || 0), 0);
    const fuelTypes = Array.from(
      new Set(
        reportSource
          .map((report) => dashboardCleanText(report.fuelType))
          .filter(Boolean),
      ),
    );

    return {
      key: compactVehicleKey(displayPlate) || String(vehicle.id),
      plate: displayPlate,
      modelName,
      fuelLiters,
      fuelType: fuelTypes.join(", ") || "Төрөл бүртгээгүй",
      reportDate: latestFuelReport?.reportDate ?? "",
      fetchedAt: latestFuelReport?.fetchedAt ?? "",
      fetchedAtValue: latestFuelReport?.fetchedAtValue ?? "",
      progress: 0,
    } satisfies AutoGarbageFuelRow;
  });

  const weightReportRows = fleetBoard.weightReportRows
    .map((report) => ({
      key: `weight-${report.id}`,
      vehicleId: report.vehicleId,
      plate: dashboardCleanText(report.vehiclePlate),
      modelName: dashboardCleanText(report.vehicleName),
      reportDate: report.reportDate,
      reportDateValue: report.reportDateValue ?? "",
      fetchedAt: report.fetchedAt,
      fetchedAtValue: report.fetchedAtValue ?? "",
      weightTons: report.weightTons || parseWeightLabelToTons(report.weightLabel),
      weightLabel: report.weightLabel,
      source: dashboardCleanText(report.source || "Гадны систем"),
      stateLabel: dashboardCleanText(report.stateLabel),
      errorMessage: dashboardCleanText(report.errorMessage),
    } satisfies AutoGarbageWeightReportRow))
    .sort(sortByFetchedAtDesc);

  const fuelReportRows = fleetBoard.fuelReportRows
    .map((report) => ({
      key: `fuel-${report.id}`,
      vehicleId: report.vehicleId,
      plate: dashboardCleanText(report.vehiclePlate),
      modelName: dashboardCleanText(report.vehicleName),
      reportDate: report.reportDate,
      reportDateValue: report.reportDateValue ?? "",
      fetchedAt: report.fetchedAt,
      fetchedAtValue: report.fetchedAtValue ?? "",
      fuelLiters: Math.max(0, report.fuelLiters || 0),
      fuelLabel: report.fuelLabel,
      fuelType: dashboardCleanText(report.fuelType || "Төрөл бүртгээгүй"),
      source: dashboardCleanText(report.source || "Гадны систем"),
      stateLabel: dashboardCleanText(report.stateLabel),
      errorMessage: dashboardCleanText(report.errorMessage),
    } satisfies AutoGarbageFuelReportRow))
    .sort(sortByFetchedAtDesc);

  const maxFuelLiters = Math.max(...initialFuelRows.map((row) => row.fuelLiters), 0);
  const fuelRows = initialFuelRows
    .map((row) => ({
      ...row,
      progress: maxFuelLiters > 0 ? clampPercent((row.fuelLiters / maxFuelLiters) * 100) : 0,
    }))
    .sort((left, right) => right.fuelLiters - left.fuelLiters);

  const taskCards = groupAutoGarbageTasks(boardTasks, boardVehicles)
    .sort((left, right) => {
      const leftDate = left.workDate || left.primaryTask.scheduledDate || left.primaryTask.createdDate || "";
      const rightDate = right.workDate || right.primaryTask.scheduledDate || right.primaryTask.createdDate || "";
      return rightDate.localeCompare(leftDate) || autoGarbageGroupProgress(right.tasks) - autoGarbageGroupProgress(left.tasks);
    })
    .slice(0, 4)
    .map((group) => {
      const { primaryTask: task, tasks: groupTasks, vehicle, plate, plateKey } = group;
      const fallbackWeight =
        plateKey
          ? leaderboardRows.find((row) => row.key === plateKey || row.key.includes(plateKey) || plateKey.includes(row.key))
              ?.weightTons ?? 0
          : 0;
      const groupWeight = groupTasks.reduce((sum, item) => sum + taskWeightToTons(item), 0);
      const openTaskCount = groupTasks.filter((item) => !isDoneTask(item)).length || groupTasks.length;
      const status = autoGarbageGroupStatus(groupTasks);
      const groupProgress = autoGarbageGroupProgress(groupTasks);

      return {
        task,
        tasks: groupTasks,
        title: autoGarbageGroupTitle(group),
        href: task.projectId ? `/projects/${task.projectId}` : task.href,
        workDate: group.workDate || task.scheduledDate || task.createdDate || "",
        leaderName: dashboardCleanText(task.leaderName || "Оноогоогүй"),
        progress: groupProgress,
        vehiclePlate: dashboardCleanText(plate),
        vehicleModel: dashboardCleanText(vehicle?.modelName || vehicle?.name || task.operationTypeLabel || "Хог тээвэр"),
        routeLabel: groupTasks.length > 1
          ? `${groupTasks.length} даалгавар нэгтгэсэн`
          : dashboardCleanText(task.projectName || task.operationTypeLabel || "Маршрут бүртгээгүй"),
        weightTons: groupWeight || fallbackWeight,
        taskCount: openTaskCount,
        statusLabel: status.statusLabel,
        statusTone: status.statusTone,
      } satisfies AutoGarbageTaskCard;
    });

  const stats = dashboardTaskStats(boardTasks, currentDateKey);
  const boardVehicleIds = new Set(boardVehicles.map((vehicle) => vehicle.id));
  const unmatchedWeightReportTons = weightReportRows
    .filter((row) => !isFailedReport(row) && (!row.vehicleId || !boardVehicleIds.has(row.vehicleId)))
    .reduce((sum, row) => sum + row.weightTons, 0);
  const totalTons = leaderboardRows.reduce((sum, row) => sum + row.weightTons, 0) + unmatchedWeightReportTons;
  const totalFuelLiters = fuelRows.reduce((sum, row) => sum + row.fuelLiters, 0);
  const latestWeightFetchedAt = latestFetchedAtLabel(weightReportRows);
  const latestFuelFetchedAt = latestFetchedAtLabel(fuelReportRows);

  return {
    tasks: boardTasks,
    taskCards,
    leaderboardRows,
    fuelRows,
    weightReportRows,
    fuelReportRows,
    stats,
    totalTons,
    totalFuelLiters,
    latestWeightFetchedAt,
    latestFuelFetchedAt,
  };
}

function ExecutiveRing({
  value,
  tone,
  size = "sm",
}: {
  value: number;
  tone: ExecutiveMetric["tone"];
  size?: "sm" | "lg";
}) {
  const color = EXECUTIVE_TONE_COLORS[tone];
  return (
    <span
      className={cn(
        dashboardStyles.executiveRing,
        size === "lg" && dashboardStyles.executiveRingLarge,
      )}
      style={{
        background: `conic-gradient(${color} ${clampPercent(value) * 3.6}deg, #e5e7eb 0deg)`,
      }}
    >
      <span>
        {size === "lg" ? (
          <>
            <strong>{clampPercent(value)}%</strong>
            <small>Гүйцэтгэл</small>
          </>
        ) : null}
      </span>
    </span>
  );
}

function ExecutiveMetricCard({ metric }: { metric: ExecutiveMetric }) {
  const Icon = metric.icon;
  const color = EXECUTIVE_TONE_COLORS[metric.tone];

  return (
    <Link
      href={metric.href}
      className={dashboardStyles.executiveMetricCard}
      aria-label={`${metric.label} дэлгэрэнгүй харах`}
    >
      <div className={dashboardStyles.executiveMetricHeader}>
        <span
          className={dashboardStyles.executiveMetricIcon}
          style={{ color, backgroundColor: `${color}16` }}
        >
          <Icon />
        </span>
        <strong>{metric.label}</strong>
      </div>
      <div className={dashboardStyles.executiveMetricBody}>
        <div>
          <span className={dashboardStyles.executiveMetricValue}>{metric.value}</span>
          {metric.valueLabel ? (
            <small className={dashboardStyles.executiveMetricValueLabel}>{metric.valueLabel}</small>
          ) : null}
          {metric.note ? (
            <small className={dashboardStyles.executiveMetricNote}>{metric.note}</small>
          ) : null}
        </div>
        {metric.showRing ? (
          <ExecutiveRing value={metric.progress} tone={metric.tone} />
        ) : null}
      </div>
      <span className={dashboardStyles.executiveCardAction}>Дэлгэрэнгүй</span>
    </Link>
  );
}

function ExecutiveDepartmentCard({ department }: { department: ExecutiveDepartmentMetric }) {
  const Icon = department.icon;
  const color = EXECUTIVE_TONE_COLORS[department.tone];
  const softColor = EXECUTIVE_TONE_SOFT_COLORS[department.tone];
  const style = {
    "--department-accent": color,
    "--department-accent-soft": softColor,
    borderColor: `${color}2e`,
  } as CSSProperties;

  return (
    <Link
      href={department.href}
      className={dashboardStyles.executiveDepartmentCard}
      style={style}
      aria-label={`${department.name} ажлуудыг харах`}
    >
      <div className={dashboardStyles.executiveDepartmentTop}>
        <div className={dashboardStyles.executiveDepartmentHeader}>
          <span className={dashboardStyles.executiveDepartmentIcon}>
            <Icon />
          </span>
          <div className={dashboardStyles.executiveDepartmentTitleBlock}>
            <strong>{department.name}</strong>
          </div>
        </div>
        <div
          className={dashboardStyles.executiveDepartmentVisual}
          style={{
            backgroundImage:
              `linear-gradient(115deg, rgba(255,255,255,.32) 0%, rgba(255,255,255,.08) 48%, rgba(255,255,255,0) 100%), url(${department.image})`,
            backgroundPosition: department.imagePosition,
          }}
          aria-hidden
        />
      </div>
      <div className={dashboardStyles.executiveDepartmentStats}>
        <div>
          <span>Нийт</span>
          <strong>{department.total}</strong>
        </div>
        <div>
          <span>Явцад</span>
          <strong>{department.working}</strong>
        </div>
        <div className={department.review > 0 ? dashboardStyles.statAlert : undefined}>
          <span>Хянах</span>
          <strong>{department.review}</strong>
        </div>
      </div>
      <div className={dashboardStyles.executiveDepartmentProgress}>
        <span>
          Ажлын гүйцэтгэл
          <strong>{department.progress}%</strong>
        </span>
        <i>
          <b style={{ inlineSize: `${clampPercent(department.progress)}%` }} />
        </i>
      </div>
      <div className={dashboardStyles.executiveDepartmentFooter}>
        <span>
          Хийгдсэн ажил
          <strong>{department.todayDone} / {department.todayTotal}</strong>
        </span>
        <em
          className={
            department.risky > 0
              ? dashboardStyles.footerWarn
              : dashboardStyles.footerOk
          }
        >
          {department.risky > 0 ? `${department.risky} анхаарах` : "Асуудалгүй"}
        </em>
      </div>
      <span className={cn(dashboardStyles.executiveCardAction, dashboardStyles.executiveDepartmentAction)}>
        Дэлгэрэнгүй
        <ChevronRight aria-hidden />
      </span>
    </Link>
  );
}

function AutoGarbageMetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone: ExecutiveMetric["tone"];
  href?: string;
}) {
  const color = EXECUTIVE_TONE_COLORS[tone];
  const content = (
    <>
      <span
        className={dashboardStyles.autoGarbageMetricIcon}
        style={{ color, backgroundColor: `${color}16` }}
      >
        <Icon aria-hidden />
      </span>
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{helper}</em>
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(dashboardStyles.autoGarbageMetricCard, dashboardStyles.autoGarbageMetricCardLink)}
        aria-label={`${label} дэлгэрэнгүй харах`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={dashboardStyles.autoGarbageMetricCard}>
      {content}
    </div>
  );
}

function AutoGarbageTaskCardView({ card }: { card: AutoGarbageTaskCard }) {
  const taskDate = card.workDate || card.task.scheduledDate || card.task.createdDate || "";
  const progress = clampPercent(card.progress);

  return (
    <Link href={card.href} className={dashboardStyles.autoGarbageTaskCard}>
      <div className={dashboardStyles.autoGarbageTaskTop}>
        <time>
          {formatAutoGarbageDate(taskDate) || "Огноо бүртгээгүй"}
        </time>
        <span
          className={dashboardStyles.autoGarbageStatusBadge}
          data-tone={card.statusTone}
        >
          {card.statusLabel}
        </span>
      </div>

      <h3>{dashboardCleanText(card.title)}</h3>
      <p>
        Тээвэрлэлтийн хяналтын ажилтан: {card.leaderName} · {card.vehicleModel}
      </p>

      <div className={dashboardStyles.autoGarbageCardStats}>
        <span>
          <small>Нээлттэй ажил</small>
          <strong>{card.taskCount}</strong>
        </span>
        <span>
          <small>Гүйцэтгэл</small>
          <strong>{progress}%</strong>
        </span>
      </div>

      <div className={dashboardStyles.autoGarbageProgressTrack}>
        <i style={{ inlineSize: `${progress}%` }} />
      </div>

      <div className={dashboardStyles.autoGarbageTaskFooter}>
        <span>Үүрэг даалгавар харах</span>
        <ChevronRight aria-hidden />
      </div>
    </Link>
  );
}

function AutoGarbageReportTabs({
  mode,
  overviewHref,
  weightHref,
  fuelHref,
}: {
  mode: AutoGarbageReportPanelMode;
  overviewHref: string;
  weightHref: string;
  fuelHref: string;
}) {
  return (
    <div className={dashboardStyles.autoGarbageReportTabs} aria-label="Машины тайлангийн таб">
      <Link
        href={overviewHref}
        className={mode === "overview" ? dashboardStyles.autoGarbageReportTabActive : undefined}
      >
        Товч
      </Link>
      <Link
        href={weightHref}
        className={mode === "weight" ? dashboardStyles.autoGarbageReportTabActive : undefined}
      >
        Ачсан тонн
      </Link>
      <Link
        href={fuelHref}
        className={mode === "fuel" ? dashboardStyles.autoGarbageReportTabActive : undefined}
      >
        Шатахуун
      </Link>
    </div>
  );
}

function AutoGarbageWeightRows({
  rows,
}: {
  rows: AutoGarbageLeaderboardRow[];
}) {
  return (
    <div className={dashboardStyles.autoGarbageLeaderboard}>
      {rows.length ? rows.map((row, index) => (
        <div key={row.key} className={dashboardStyles.autoGarbageLeaderRow}>
          <span className={dashboardStyles.autoGarbageLeaderRank}>{index + 1}</span>
          <span className={dashboardStyles.autoGarbageLeaderInfo}>
            <strong>{row.plate}</strong>
            <small>{row.modelName} · {row.dataSourceLabel}</small>
            <small>{reportFetchedLabel(row)}</small>
          </span>
          <span className={dashboardStyles.autoGarbageLeaderBar} aria-hidden>
            <i style={{ inlineSize: `${row.progress}%` }} />
          </span>
          <strong className={dashboardStyles.autoGarbageLeaderValue}>
            {formatTons(row.weightTons)}
          </strong>
        </div>
      )) : (
        <p className={dashboardStyles.autoGarbageEmptyText}>Машины жингийн бүртгэл хараахан алга.</p>
      )}
    </div>
  );
}

function AutoGarbageFuelRows({
  rows,
}: {
  rows: AutoGarbageFuelRow[];
}) {
  return (
    <div className={dashboardStyles.autoGarbageLeaderboard}>
      {rows.length ? rows.map((row, index) => (
        <div key={row.key} className={dashboardStyles.autoGarbageLeaderRow}>
          <span className={dashboardStyles.autoGarbageLeaderRank}>{index + 1}</span>
          <span className={dashboardStyles.autoGarbageLeaderInfo}>
            <strong>{row.plate}</strong>
            <small>{row.modelName} · {row.fuelType}</small>
            <small>{reportFetchedLabel(row)}</small>
          </span>
          <span className={dashboardStyles.autoGarbageLeaderBar} data-tone="fuel" aria-hidden>
            <i style={{ inlineSize: `${row.progress}%` }} />
          </span>
          <strong className={dashboardStyles.autoGarbageLeaderValue}>
            {formatFuelLiters(row.fuelLiters)}
          </strong>
        </div>
      )) : (
        <p className={dashboardStyles.autoGarbageEmptyText}>Машины шатахууны бүртгэл хараахан алга.</p>
      )}
    </div>
  );
}

function AutoGarbageWeightReportRows({
  rows,
}: {
  rows: AutoGarbageWeightReportRow[];
}) {
  return (
    <div className={dashboardStyles.autoGarbageReportList}>
      {rows.length ? (
        <div className={dashboardStyles.autoGarbageReportHeader} aria-hidden>
          <span>Машин</span>
          <span>Огноо</span>
          <span>Төлөв</span>
          <span>Жин</span>
        </div>
      ) : null}
      {rows.length ? rows.map((row) => (
        <div
          key={row.key}
          className={dashboardStyles.autoGarbageReportRow}
          data-state={isFailedReport(row) ? "failed" : "success"}
        >
          <span className={dashboardStyles.autoGarbageReportInfo}>
            <strong>{row.plate}</strong>
            <small>{row.modelName}</small>
            <small>{row.source}</small>
            {row.errorMessage ? <em>{row.errorMessage}</em> : null}
          </span>
          <AutoGarbageReportTimeCell row={row} />
          <AutoGarbageReportStatus row={row} />
          <strong className={dashboardStyles.autoGarbageReportValue}>
            {row.weightLabel || formatTons(row.weightTons)}
          </strong>
        </div>
      )) : (
        <p className={dashboardStyles.autoGarbageEmptyText}>Татагдсан жингийн тайлан алга.</p>
      )}
    </div>
  );
}

function AutoGarbageFuelReportRows({
  rows,
}: {
  rows: AutoGarbageFuelReportRow[];
}) {
  return (
    <div className={dashboardStyles.autoGarbageReportList}>
      {rows.length ? (
        <div className={dashboardStyles.autoGarbageReportHeader} aria-hidden>
          <span>Машин</span>
          <span>Огноо</span>
          <span>Төлөв</span>
          <span>Литр</span>
        </div>
      ) : null}
      {rows.length ? rows.map((row) => (
        <div
          key={row.key}
          className={dashboardStyles.autoGarbageReportRow}
          data-state={isFailedReport(row) ? "failed" : "success"}
        >
          <span className={dashboardStyles.autoGarbageReportInfo}>
            <strong>{row.plate}</strong>
            <small>{row.modelName}</small>
            <small>{row.fuelType} · {row.source}</small>
            {row.errorMessage ? <em>{row.errorMessage}</em> : null}
          </span>
          <AutoGarbageReportTimeCell row={row} />
          <AutoGarbageReportStatus row={row} />
          <strong className={dashboardStyles.autoGarbageReportValue}>
            {row.fuelLabel || formatFuelLiters(row.fuelLiters)}
          </strong>
        </div>
      )) : (
        <p className={dashboardStyles.autoGarbageEmptyText}>Татагдсан шатахууны тайлан алга.</p>
      )}
    </div>
  );
}

function AutoGarbageLeaderboardPanel({
  weightRows,
  fuelRows,
  weightReportRows,
  fuelReportRows,
  totalTons,
  totalFuelLiters,
  latestWeightFetchedAt,
  latestFuelFetchedAt,
  panelMode,
  overviewHref,
  weightHref,
  fuelHref,
}: {
  weightRows: AutoGarbageLeaderboardRow[];
  fuelRows: AutoGarbageFuelRow[];
  weightReportRows: AutoGarbageWeightReportRow[];
  fuelReportRows: AutoGarbageFuelReportRow[];
  totalTons: number;
  totalFuelLiters: number;
  latestWeightFetchedAt: string;
  latestFuelFetchedAt: string;
  panelMode: AutoGarbageReportPanelMode;
  overviewHref: string;
  weightHref: string;
  fuelHref: string;
}) {
  const previewLimit = 5;
  const shownWeightRows = panelMode === "weight" ? weightRows : weightRows.slice(0, previewLimit);
  const shownFuelRows = panelMode === "fuel" ? fuelRows : fuelRows.slice(0, previewLimit);
  const averageTons = weightRows.length ? totalTons / weightRows.length : 0;
  const averageFuelLiters = fuelRows.length ? totalFuelLiters / fuelRows.length : 0;
  const showWeightPanel = panelMode !== "fuel";
  const showFuelPanel = panelMode !== "weight";
  const showWeightReports = panelMode === "weight";
  const showFuelReports = panelMode === "fuel";

  return (
    <aside className={dashboardStyles.autoGarbageSidePanels}>
      <AutoGarbageReportTabs
        mode={panelMode}
        overviewHref={overviewHref}
        weightHref={weightHref}
        fuelHref={fuelHref}
      />
      {showWeightPanel ? (
        <section className={dashboardStyles.autoGarbageLeaderPanel}>
          <div className={dashboardStyles.autoGarbagePanelHeader}>
            <div>
              <h3>{showWeightReports ? "Татагдсан жингийн тайлангууд" : "Машин тус бүрийн ачсан тонн"}</h3>
              <p>
                {showWeightReports
                  ? "WRS-ээс татагдсан бүх мөр тайланг татсан цагаар нь харуулав."
                  : "Жингийн бүртгэл болон ажлын тайлангаас нэгтгэв."}
              </p>
            </div>
            <span>{showWeightReports ? `${weightReportRows.length} тайлан` : "12 сар"}</span>
          </div>

          {showWeightReports ? (
            <AutoGarbageWeightReportRows rows={weightReportRows} />
          ) : (
            <AutoGarbageWeightRows rows={shownWeightRows} />
          )}
          {!showWeightReports && weightRows.length > previewLimit ? (
            <Link href={weightHref} className={dashboardStyles.autoGarbagePanelShowAll}>
              Бүгдийг харах
              <ChevronRight aria-hidden />
            </Link>
          ) : null}
        </section>
      ) : null}

      {showFuelPanel ? (
        <section className={dashboardStyles.autoGarbageLeaderPanel}>
          <div className={dashboardStyles.autoGarbagePanelHeader}>
            <div>
              <h3>{showFuelReports ? "Татагдсан шатахууны тайлангууд" : "Машин тус бүрийн шатахуун"}</h3>
              <p>
                {showFuelReports
                  ? "Gaiham-аас татагдсан бүх мөр тайланг татсан цагаар нь харуулав."
                  : "Шатахууны бүртгэлээс машинаар нь нэгтгэв."}
              </p>
            </div>
            <span>{showFuelReports ? `${fuelReportRows.length} тайлан` : "12 сар"}</span>
          </div>

          {showFuelReports ? (
            <AutoGarbageFuelReportRows rows={fuelReportRows} />
          ) : (
            <AutoGarbageFuelRows rows={shownFuelRows} />
          )}
          {!showFuelReports && fuelRows.length > previewLimit ? (
            <Link href={fuelHref} className={dashboardStyles.autoGarbagePanelShowAll}>
              Бүгдийг харах
              <ChevronRight aria-hidden />
            </Link>
          ) : null}
        </section>
      ) : null}

      <section className={dashboardStyles.autoGarbageSummaryPanel}>
        <div>
          <small>Ачсан тонн</small>
          <strong>{formatTons(totalTons)}</strong>
          <em>{latestWeightFetchedAt ? `Татсан: ${latestWeightFetchedAt}` : "Татсан огноо алга"}</em>
        </div>
        <div>
          <small>Машины дундаж тонн</small>
          <strong>{formatTons(averageTons)}</strong>
        </div>
        <div>
          <small>Шатахуун</small>
          <strong>{formatFuelLiters(totalFuelLiters)}</strong>
          <em>{latestFuelFetchedAt ? `Татсан: ${latestFuelFetchedAt}` : "Татсан огноо алга"}</em>
        </div>
        <div>
          <small>Дундаж шатахуун</small>
          <strong>{formatFuelLiters(averageFuelLiters)}</strong>
        </div>
      </section>
    </aside>
  );
}

export function AutoGarbageWorkBoard({
  dashboardTasks,
  fleetBoard,
  currentDateKey,
  departmentScopeName,
  canCreateWork,
  reportPanelMode = "overview",
  boardHref = "/projects",
  workListHref = "/projects",
}: {
  dashboardTasks: DashboardSnapshot["taskDirectory"];
  fleetBoard: FleetVehicleBoard;
  currentDateKey: string;
  departmentScopeName: string | null | undefined;
  canCreateWork: boolean;
  reportPanelMode?: AutoGarbageReportPanelMode;
  boardHref?: string;
  workListHref?: string;
}) {
  const model = buildAutoGarbageBoardModel({
    tasks: dashboardTasks,
    fleetBoard,
    currentDateKey,
    departmentScopeName,
  });
  const attentionCount = model.stats.review + model.stats.overdue + model.stats.planned;
  const overviewHref = boardHref;
  const weightHref = `${boardHref}${boardHref.includes("?") ? "&" : "?"}autoPanel=weight`;
  const fuelHref = `${boardHref}${boardHref.includes("?") ? "&" : "?"}autoPanel=fuel`;

  return (
    <section className={dashboardStyles.autoGarbageBoard}>
      <div className={dashboardStyles.autoGarbageHeader}>
        <div>
          <h2>Захирамж, үүрэг даалгаврын жагсаалт</h2>
          <p>Авто бааз, хог тээвэрлэлтийн хэлтэс · Нийт {model.tasks.length} ажил</p>
        </div>
        <div className={dashboardStyles.autoGarbageToolbar}>
          {canCreateWork ? (
            <Link href="/create" className={dashboardStyles.autoGarbagePrimaryButton}>
              <Plus aria-hidden />
              Захирамж, үүрэг даалгавар
            </Link>
          ) : null}
        </div>
      </div>

      <div className={dashboardStyles.autoGarbageMetricGrid}>
        <AutoGarbageMetricCard
          label="Нийт захирамж, үүрэг даалгавар"
          value={String(model.stats.total)}
          helper="Бүгд"
          icon={ClipboardList}
          tone="blue"
        />
        <AutoGarbageMetricCard
          label="Хийгдэж буй ажил"
          value={String(model.stats.working)}
          helper={`${percent(model.stats.working, model.stats.total)}%`}
          icon={Wrench}
          tone="purple"
        />
        <AutoGarbageMetricCard
          label="Дууссан ажил"
          value={String(model.stats.completed)}
          helper={`${percent(model.stats.completed, model.stats.total)}%`}
          icon={CheckCircle2}
          tone="green"
        />
        <AutoGarbageMetricCard
          label="Анхаарах ажил"
          value={String(attentionCount)}
          helper={`${percent(attentionCount, model.stats.total)}%`}
          icon={Clock3}
          tone="orange"
        />
        <AutoGarbageMetricCard
          label="Ачсан тонн"
          value={formatTons(model.totalTons)}
          helper={model.latestWeightFetchedAt ? `Татсан: ${model.latestWeightFetchedAt}` : "Татсан огноо алга"}
          icon={Recycle}
          tone="teal"
          href={weightHref}
        />
        <AutoGarbageMetricCard
          label="Шатахуун"
          value={formatFuelLiters(model.totalFuelLiters)}
          helper={model.latestFuelFetchedAt ? `Татсан: ${model.latestFuelFetchedAt}` : "Татсан огноо алга"}
          icon={Fuel}
          tone="orange"
          href={fuelHref}
        />
      </div>

      <div className={dashboardStyles.autoGarbageLayout}>
        <div className={dashboardStyles.autoGarbageTasksColumn}>
          {model.taskCards.length ? model.taskCards.map((card) => (
            <AutoGarbageTaskCardView key={card.task.id} card={card} />
          )) : (
            <div className={dashboardStyles.autoGarbageEmptyState}>
              <Recycle aria-hidden />
              <strong>Хог тээврийн ажил бүртгэгдээгүй байна.</strong>
              <span>Ажил үүсэх үед энд машинаар нь ангилж харагдана.</span>
            </div>
          )}
          <Link href={workListHref} className={dashboardStyles.autoGarbageShowAll}>
            Бүгдийг харах
            <ChevronRight aria-hidden />
          </Link>
        </div>

        <AutoGarbageLeaderboardPanel
          weightRows={model.leaderboardRows}
          fuelRows={model.fuelRows}
          weightReportRows={model.weightReportRows}
          fuelReportRows={model.fuelReportRows}
          totalTons={model.totalTons}
          totalFuelLiters={model.totalFuelLiters}
          latestWeightFetchedAt={model.latestWeightFetchedAt}
          latestFuelFetchedAt={model.latestFuelFetchedAt}
          panelMode={reportPanelMode}
          overviewHref={overviewHref}
          weightHref={weightHref}
          fuelHref={fuelHref}
        />
      </div>
    </section>
  );
}

function buildExecutiveDepartmentMetrics({
  snapshot,
  tasks,
  currentDateKey,
  departmentScopeName = null,
}: {
  snapshot: DashboardSnapshot;
  tasks: DashboardSnapshot["taskDirectory"];
  currentDateKey: string;
  departmentScopeName?: string | null;
}): ExecutiveDepartmentMetric[] {
  const matchedDepartment = (keywords: string[]) =>
    snapshot.departments.find((department) =>
      keywords.some((keyword) => department.name.includes(keyword) || department.label.includes(keyword)),
    );
  const matchedTasks = (keywords: string[], departmentName?: string) =>
    tasks.filter((task) => {
      const normalizedTaskDepartment = normalizeOrganizationUnitName(task.departmentName);
      if (
        departmentName &&
        normalizedTaskDepartment &&
        normalizedTaskDepartment !== departmentName
      ) {
        return false;
      }

      return keywords.some((keyword) =>
        task.departmentName.includes(keyword) ||
        task.operationTypeLabel.includes(keyword) ||
        task.projectName.includes(keyword) ||
        task.name.includes(keyword),
      );
    });
  const matchedProjects = (keywords: string[], departmentName?: string) =>
    snapshot.projects.filter((project) => {
      const normalizedProjectDepartment = normalizeOrganizationUnitName(project.departmentName);
      if (
        departmentName &&
        normalizedProjectDepartment &&
        normalizedProjectDepartment !== departmentName
      ) {
        return false;
      }

      return keywords.some((keyword) =>
        project.departmentName.includes(keyword) ||
        (project.operationTypeLabel ?? "").includes(keyword) ||
        project.name.includes(keyword),
      );
    });
  const countTaskProjects = (departmentTasks: DashboardSnapshot["taskDirectory"]) =>
    new Set(
      departmentTasks
        .map((task) => task.projectId)
        .filter((projectId): projectId is number => typeof projectId === "number"),
    ).size;
  const countRiskyProjects = (departmentTasks: DashboardSnapshot["taskDirectory"]) =>
    new Set(
      departmentTasks
        .filter((task) => task.issueFlag || isOverdue(task, currentDateKey))
        .map((task) => task.projectId ?? task.id)
        .filter((id): id is number => typeof id === "number"),
    ).size;
  const departmentProgress = (
    keywords: string[],
    departmentTasks: DashboardSnapshot["taskDirectory"],
    departmentProjects: DashboardSnapshot["projects"],
  ) => {
    const matchedDepartment = snapshot.departments.find((department) =>
      keywords.some((keyword) => department.name.includes(keyword) || department.label.includes(keyword)),
    );
    if (departmentProjects.length) {
      return Math.round(
        departmentProjects.reduce((sum, project) => sum + clampPercent(project.completion), 0) /
          departmentProjects.length,
      );
    }
    if (matchedDepartment) {
      return clampPercent(matchedDepartment.completion);
    }
    return departmentTasks.length
      ? Math.round(departmentTasks.reduce((sum, task) => sum + clampPercent(task.progress), 0) / departmentTasks.length)
      : 0;
  };
  const buildDepartment = (
    name: string,
    keywords: string[],
    icon: LucideIcon,
    tone: ExecutiveMetric["tone"],
    image: string,
    imagePosition = "center",
    hrefDepartmentName?: string,
  ) => {
    const departmentTasks = matchedTasks(keywords, hrefDepartmentName);
    const departmentProjects = matchedProjects(keywords, hrefDepartmentName);
    const department = matchedDepartment(keywords);
    const total = departmentProjects.length || countTaskProjects(departmentTasks);
    const working = departmentProjects.length
      ? departmentProjects.filter(
          (project) => project.stageBucket === "todo" || project.stageBucket === "progress" || project.stageBucket === "unknown",
        ).length
      : departmentTasks.filter((task) => task.statusKey === "planned" || task.statusKey === "working").length;
    const review = departmentProjects.length
      ? departmentProjects.filter((project) => project.stageBucket === "review" || project.stageBucket === "problem").length
      : departmentTasks.filter((task) => task.statusKey === "review" || task.statusKey === "problem").length;
    const done = departmentProjects.length
      ? departmentProjects.filter((project) => project.stageBucket === "done").length
      : departmentTasks.filter(isDoneTask).length;
    const risky = countRiskyProjects(departmentTasks);

    return {
      name,
      progress: departmentProgress(keywords, departmentTasks, departmentProjects),
      total,
      working,
      review: departmentProjects.length ? review : review || department?.reviewTasks || 0,
      todayDone: done,
      todayTotal: total,
      risky,
      // Цэсний "Хэлтэс, нэгжүүд"-тэй ижил хуудас руу — хэлтсийн дотоод бүтэц
      // (Ажил + Даалгавар + Хүний нөөц) хаанаас орсноос үл хамаарч ижил байна.
      href: `/department-work?department=${encodeURIComponent(hrefDepartmentName || department?.name || name)}`,
      icon,
      tone,
      image,
      imagePosition,
    };
  };

  const metrics = [
    buildDepartment(
      "Авто бааз, хог тээвэрлэлтийн хэлтэс",
      ["Авто", "Хог", "хог", "тээвэр"],
      Truck,
      "blue",
      DASHBOARD_IMAGES.fleetTruck,
      "center",
    ),
    buildDepartment(
      "Ногоон байгууламж, цэвэрлэгээ",
      ["Ногоон", "мод", "зүлэг", "ургамал", "усалгаа", "цэцэрлэг", "Зам", "талбай", "Гудамж", "цэвэр"],
      Leaf,
      "green",
      DASHBOARD_IMAGES.landscapingWorker,
      "center",
      "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
    ),
    buildDepartment(
      "Тохижилт үйлчилгээ",
      ["Тохижилт"],
      Wrench,
      "teal",
      DASHBOARD_IMAGES.maintenanceWorker,
      "center",
      "Тохижилтын хэлтэс",
    ),
  ];

  if (!departmentScopeName) {
    return metrics;
  }

  const scopedMetrics = metrics.filter((metric) => {
    const metricMatchesScope =
      filterByDepartment([{ departmentName: metric.name }], departmentScopeName).length > 0;
    const departmentMatchesScope = snapshot.departments.some(
      (department) =>
        filterByDepartment([{ departmentName: department.name }], departmentScopeName).length > 0 &&
        filterByDepartment([{ departmentName: department.name }], metric.name).length > 0,
    );

    return metricMatchesScope || departmentMatchesScope;
  });

  if (scopedMetrics.length) {
    return scopedMetrics;
  }

  return snapshot.departments.map((department) => {
    const departmentTasks = filterByDepartment(tasks, department.name);
    const departmentProjects = filterByDepartment(snapshot.projects, department.name);
    const total = departmentProjects.length || countTaskProjects(departmentTasks);
    const working = departmentProjects.length
      ? departmentProjects.filter(
          (project) => project.stageBucket === "todo" || project.stageBucket === "progress" || project.stageBucket === "unknown",
        ).length
      : departmentTasks.filter((task) => task.statusKey === "planned" || task.statusKey === "working").length;
    const review = departmentProjects.length
      ? departmentProjects.filter((project) => project.stageBucket === "review" || project.stageBucket === "problem").length
      : departmentTasks.filter((task) => task.statusKey === "review" || task.statusKey === "problem").length;
    const done = departmentProjects.length
      ? departmentProjects.filter((project) => project.stageBucket === "done").length
      : departmentTasks.filter(isDoneTask).length;
    const risky = countRiskyProjects(departmentTasks);

    return {
      name: department.label || department.name,
      progress:
        (departmentProjects.length
          ? Math.round(
              departmentProjects.reduce((sum, project) => sum + clampPercent(project.completion), 0) /
                departmentProjects.length,
            )
          : department.completion) ||
        (total
          ? Math.round(
              departmentTasks.reduce((sum, task) => sum + clampPercent(task.progress), 0) / total,
            )
          : 0),
      total,
      working,
      review: departmentProjects.length ? review : review || department.reviewTasks || 0,
      todayDone: done,
      todayTotal: total,
      risky,
      href: `/department-work?department=${encodeURIComponent(department.name)}`,
      icon: departmentIcon(department.name),
      tone: "green",
      image: DASHBOARD_IMAGES.landscapingWorker,
      imagePosition: "center",
    };
  });
}

function formatExecutiveActivityTime(value: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getExecutiveWeatherIcon(condition: string): LucideIcon {
  if (condition.includes("Бороо")) {
    return CloudRain;
  }
  if (condition.includes("Цас")) {
    return CloudSnow;
  }
  if (condition.includes("үүл") || condition.includes("Манан")) {
    return CloudSun;
  }
  return Sun;
}

function buildExecutiveActivityRows(
  snapshot: DashboardSnapshot,
  tasks: DashboardSnapshot["taskDirectory"],
): ExecutiveActivityRow[] {
  const reportRows = snapshot.reports
    .slice(0, 5)
    .map((report) => ({
      id: `report-${report.id}`,
      title: `${fixMojibakeText(report.reporter || "Ажилтан")} тайлан илгээлээ`,
      detail: fixMojibakeText(report.taskName || report.projectName || report.summary || "Ажлын тайлан"),
      time: formatExecutiveActivityTime(report.submittedAt),
      href: report.taskId ? `/tasks/${report.taskId}` : "/reports",
      icon: ClipboardList,
      tone: report.stateBucket === "problem" ? "red" : report.stateBucket === "review" ? "blue" : "green",
    } satisfies ExecutiveActivityRow));

  if (reportRows.length) {
    return reportRows;
  }

  return tasks
    .slice()
    .sort((left, right) => String(right.createdAt || right.createdDate || "").localeCompare(String(left.createdAt || left.createdDate || "")))
    .slice(0, 5)
    .map((task) => ({
      id: `task-${task.id}`,
      title: fixMojibakeText(task.name),
      detail: fixMojibakeText(task.departmentName || task.projectName),
      time: formatExecutiveActivityTime(task.createdAt || task.createdDate || ""),
      href: task.href,
      icon: ClipboardList,
      tone: task.issueFlag ? "red" : task.statusKey === "review" ? "blue" : "green",
    } satisfies ExecutiveActivityRow));
}

function ExecutiveHeroBanner({
  alertCount,
  weather,
}: {
  alertCount: number;
  weather: WeatherSnapshot;
}) {
  const normalDay = alertCount === 0;
  const forecastDays = weather.weeklyForecast.length
    ? weather.weeklyForecast.slice(0, 7)
    : [
        {
          date: weather.observedAt || "",
          weekday: "Өнөө",
          condition: weather.condition,
          temperatureMax: weather.temperature,
          temperatureMin: null,
          precipitationChance: null,
        },
      ];

  return (
    <section
      className={dashboardStyles.executiveHero}
      style={{
        backgroundImage:
          `linear-gradient(90deg, rgba(236,248,238,.98) 0%, rgba(236,248,238,.9) 32%, rgba(236,248,238,.24) 54%, rgba(236,248,238,0) 78%), url(${DASHBOARD_IMAGES.operationsHero})`,
      }}
    >
      <div className={dashboardStyles.executiveHeroContent}>
        <span
          className={cn(
            dashboardStyles.executiveHeroStatusIcon,
            !normalDay && dashboardStyles.executiveHeroStatusIconWarn,
          )}
          aria-hidden
        >
          {normalDay ? <CheckCircle2 /> : <Clock3 />}
        </span>
        <div>
          <h2>Хот тохижилтын үйл ажиллагааны хяналтын самбар</h2>
          <p>Хог тээвэр, зам талбайн цэвэрлэгээ, ногоон байгууламж болон техник, ажилтны өдөр тутмын үйл ажиллагааг бодит цагийн мэдээллээр хянаж байна.</p>
        </div>
      </div>

      <div className={dashboardStyles.executiveHeroForecast} aria-label="7 хоногийн цаг агаар">
        <div className={dashboardStyles.executiveHeroForecastHeader}>
          <span>7 хоногийн цаг агаар</span>
          <strong>{weather.temperature === null ? "--" : weather.temperature}°C</strong>
        </div>
        <div className={dashboardStyles.executiveHeroForecastDays}>
          {forecastDays.map((day) => {
            const Icon = getExecutiveWeatherIcon(day.condition);
            return (
              <span key={`${day.date}-${day.weekday}`} className={dashboardStyles.executiveHeroForecastDay}>
                <small>{day.weekday}</small>
                <Icon aria-hidden />
                <strong>
                  {day.temperatureMax === null ? "--" : day.temperatureMax}°
                </strong>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ExecutiveActivityPanel({ rows }: { rows: ExecutiveActivityRow[] }) {
  return (
    <Card className={dashboardStyles.executiveSidePanel}>
      <div className={dashboardStyles.executiveSideHeader}>
        <h2>Сүүлийн үйл ажиллагаа</h2>
        <Link href="/notifications">Бүгдийг харах</Link>
      </div>
      <div className={dashboardStyles.executiveSideList}>
        {rows.length ? rows.map((row) => {
          const Icon = row.icon;
          const color = EXECUTIVE_TONE_COLORS[row.tone];

          return (
            <Link key={row.id} href={row.href} className={dashboardStyles.executiveSideRow}>
              <span className={dashboardStyles.executiveSideIcon} style={{ color, backgroundColor: `${color}14` }}>
                <Icon />
              </span>
              <span>
                <strong>{row.title}</strong>
                <small>{row.detail}</small>
              </span>
              <time>{row.time}</time>
            </Link>
          );
        }) : (
          <p className={dashboardStyles.executiveSideEmpty}>Сүүлийн үйл ажиллагаа бүртгэгдээгүй байна.</p>
        )}
      </div>
    </Card>
  );
}

function ExecutiveSloganPanel() {
  return (
    <section
      className={dashboardStyles.executiveSloganPanel}
      style={{
        backgroundImage:
          `linear-gradient(180deg, rgba(8,64,38,.08), rgba(8,64,38,.72)), url(${DASHBOARD_IMAGES.landscape})`,
      }}
      aria-label="Байгаль хамгаалах уриа"
    >
      <span>
        <Leaf aria-hidden />
      </span>
      <h2>Байгалиа хайрлая, ирээдүйгээ хамгаалъя</h2>
      <p>Ногоон хотын өдөр бүрийн үйл ажиллагаа ирээдүйн амьдрах орчны төлөө.</p>
    </section>
  );
}

// Нээлттэй (дуусгаагүй) даалгаврыг яаралтай байдлаар нь эрэмбэлж буцаана.
function openTasksFor(
  tasks: DashboardSnapshot["taskDirectory"],
  currentDateKey: string,
) {
  const score: Record<StatusTone, number> = { urgent: 4, attention: 3, good: 2, muted: 1 };
  return tasks
    .filter((task) => !isDoneTask(task))
    .sort((left, right) => {
      const toneDiff =
        score[statusTone(right, currentDateKey)] - score[statusTone(left, currentDateKey)];
      if (toneDiff !== 0) {
        return toneDiff;
      }
      const leftDate = left.scheduledDate || left.deadline || "";
      const rightDate = right.scheduledDate || right.deadline || "";
      return leftDate.localeCompare(rightDate);
    });
}

// Дашбоард дээрх товч карт — дарвал /tasks хуудас (даалгаврын жагсаалт) нээгдэнэ.
function OpenTasksSummaryCard({
  tasks,
  currentDateKey,
  href = "/tasks",
  className,
}: {
  tasks: DashboardSnapshot["taskDirectory"];
  currentDateKey: string;
  href?: string;
  className?: string;
}) {
  const openTasks = openTasksFor(tasks, currentDateKey);
  const overdueCount = openTasks.filter((task) => isOverdue(task, currentDateKey)).length;
  const reviewCount = openTasks.filter(
    (task) => task.statusKey === "review" || task.statusKey === "problem",
  ).length;

  return (
    <Link href={href} className={cn(dashboardStyles.openTasksSummaryLink, className)}>
      <Card className={dashboardStyles.openTasksSummaryCard}>
        <span className={dashboardStyles.openTasksSummaryIcon}>
          <ClipboardList />
        </span>
        <div className={dashboardStyles.openTasksSummaryText}>
          <CardTitle>Нээлттэй даалгавар</CardTitle>
          <CardDescription>Дарж бүх даалгаврыг жагсаалтаар нээнэ.</CardDescription>
        </div>
        <div className={dashboardStyles.openTasksSummaryStats}>
          <div className={dashboardStyles.openTasksSummaryStat}>
            <strong>{openTasks.length}</strong>
            <span>Нээлттэй</span>
          </div>
          <div className={dashboardStyles.openTasksSummaryStat}>
            <strong className={overdueCount ? "text-[#EF4444]" : undefined}>{overdueCount}</strong>
            <span>Хэтэрсэн</span>
          </div>
          <div className={dashboardStyles.openTasksSummaryStat}>
            <strong className={reviewCount ? "text-[#B45309]" : undefined}>{reviewCount}</strong>
            <span>Хянах</span>
          </div>
        </div>
        <ChevronRight className={dashboardStyles.openTasksSummaryChevron} />
      </Card>
    </Link>
  );
}

// Ажилтан (worker/нярав) нэвтэрхэд харах хувийн нүүр хуудас: 4 KPI хайрцаг,
// даалгаврын хүснэгт (шүүлттэй), баруун талд түргэн үйлдэл, мэдэгдэл, уриа.
function WorkerHomeView({
  session,
  roleLabel,
  scopeLabel,
  canCreateProject,
  canCreateTasks,
  canWriteReports,
  canViewQualityCenter,
  canUseFieldConsole,
  canViewHr,
  notificationCount,
  notificationNote,
  assignedTasks,
  currentDateKey,
  departmentScopeName,
  procurementActionPanel,
}: {
  session: AppSession;
  roleLabel: string;
  scopeLabel: string;
  canCreateProject: boolean;
  canCreateTasks: boolean;
  canWriteReports: boolean;
  canViewQualityCenter: boolean;
  canUseFieldConsole: boolean;
  canViewHr: boolean;
  notificationCount: number;
  notificationNote: string;
  assignedTasks: AssignedTaskItem[];
  currentDateKey: string;
  departmentScopeName: string | null;
  procurementActionPanel: ReactNode;
}) {
  const canViewAllReports = canViewAllWorkspaceReports(session);
  const canViewWeightReports = canViewGarbageWeightReports(session, departmentScopeName);

  const total = assignedTasks.length;
  // Хувийн (хэлтэсгүй) ба хэлтэст даалгасан даалгаврыг тусад нь ялгана.
  const personalTasks = assignedTasks.filter((task) => !task.departmentName);
  const departmentTasks = assignedTasks.filter((task) => task.departmentName);
  const doneCount = assignedTasks.filter((task) => task.statusKey === "done").length;
  const activeCount = total - doneCount;
  const overdueCount = assignedTasks.filter(
    (task) => task.statusKey !== "done" && task.deadline && task.deadline < currentDateKey,
  ).length;

  const completionPct = total ? Math.round((doneCount / total) * 100) : 0;
  const kpis: Array<{
    key: string;
    label: string;
    value: string;
    icon: LucideIcon;
    iconBg: string;
    iconFg: string;
  }> = [
    {
      key: "total",
      label: "Нийт даалгавар",
      value: String(total),
      icon: ClipboardList,
      iconBg: "bg-[#EEF1EF]",
      iconFg: "text-[#16241b]",
    },
    {
      key: "open",
      label: "Нээлттэй",
      value: String(activeCount),
      icon: Clock3,
      iconBg: "bg-[#E8EEFD]",
      iconFg: "text-[#2563EB]",
    },
    {
      key: "overdue",
      label: "Хугацаа хэтэрсэн",
      value: String(overdueCount),
      icon: AlertTriangle,
      iconBg: "bg-[#FBE9E9]",
      iconFg: "text-[#DC2626]",
    },
    {
      key: "done",
      label: "Дууссан",
      value: String(doneCount),
      icon: CheckCircle2,
      iconBg: "bg-[#E7F3E8]",
      iconFg: "text-[#2E7D32]",
    },
    {
      key: "pct",
      label: "Гүйцэтгэлийн хувь",
      value: `${completionPct}%`,
      icon: BarChart3,
      iconBg: "bg-[#FCF0DC]",
      iconFg: "text-[#E8820A]",
    },
  ];


  // Даалгаврын төлвийн доуннат — бодит оногдсон даалгавраас тооцно.
  const statusCounts: Record<AssignedTaskStatusKey, number> = { planned: 0, doing: 0, review: 0, done: 0 };
  for (const task of assignedTasks) {
    statusCounts[task.statusKey] += 1;
  }
  const donutData = [
    { key: "done", label: "Дууссан", value: statusCounts.done, color: "#2E7D32" },
    { key: "doing", label: "Хийгдэж байна", value: statusCounts.doing, color: "#E8820A" },
    { key: "review", label: "Шалгаж байна", value: statusCounts.review, color: "#E8820A" },
    { key: "planned", label: "Төлөвлөсөн", value: statusCounts.planned, color: "#2563EB" },
  ].filter((segment) => segment.value > 0);
  let donutAcc = 0;
  const donutSegs = donutData.map((segment) => {
    const pct = total ? (segment.value / total) * 100 : 0;
    const seg = {
      ...segment,
      dash: `${pct.toFixed(2)} ${(100 - pct).toFixed(2)}`,
      offset: Number((-donutAcc).toFixed(2)),
    };
    donutAcc += pct;
    return seg;
  });

  // Ирэх 6 сарын ачаалал — даалгаврын date_deadline-аас бодитоор тооцно.
  const [curYear, curMonth] = currentDateKey.split("-").map((part) => Number(part));
  const monthlyLoad = Array.from({ length: 6 }, (_, index) => {
    let month = (curMonth || 1) + index;
    let year = curYear || 0;
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    const key = `${year}-${String(month).padStart(2, "0")}`;
    return {
      key,
      label: `${month}-р сар`,
      isCurrent: index === 0,
      count: assignedTasks.filter((task) => (task.deadline || "").slice(0, 7) === key).length,
    };
  });
  const monthlyMax = Math.max(1, ...monthlyLoad.map((m) => m.count));
  const monthlyTotal = monthlyLoad.reduce((sum, m) => sum + m.count, 0);

  // Нэгдсэн дизайн систем: бүх карт → 16px радиус, 24px padding, нэг shadow, нэг border.
  const CARD =
    "rounded-2xl border border-[#E7EBE8] bg-white p-6 shadow-[0_1px_2px_rgba(20,40,30,0.04),0_1px_3px_rgba(20,40,30,0.06)]";
  const CARD_TITLE = "text-base font-semibold text-[#16241b]";

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.contentWithMenu}>
        <aside className={shellStyles.menuColumn}>
          <AppMenu
            active="dashboard"
            canCreateProject={canCreateProject}
            canCreateTasks={canCreateTasks}
            canWriteReports={canWriteReports}
            canViewQualityCenter={canViewQualityCenter}
            canUseFieldConsole={canUseFieldConsole}
            canViewAllReports={canViewAllReports}
            canViewGarbageWeightReports={canViewWeightReports}
            canViewHr={canViewHr}
            userName={session.name}
            userRole={session.role}
            roleLabel={roleLabel}
            groupFlags={session.groupFlags}
            workerMode
            notificationCount={notificationCount}
            departmentScopeName={departmentScopeName}
          />
        </aside>

        <div className={shellStyles.pageContent}>
          <WorkspaceHeader
            title={`Сайн байна уу, ${session.name}`}
            subtitle={scopeLabel}
            userName={session.name}
            roleLabel={roleLabel}
            notificationCount={notificationCount}
            notificationNote={notificationNote}
            backgroundImage={DASHBOARD_IMAGES.header}
            showUserMenu={false}
          />

          <div className="relative z-20 mt-1 flex flex-col gap-8">
            {/* KPI band — 5 тэнцүү карт (нягт) */}
            <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {kpis.map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <div
                    key={kpi.key}
                    className={cn(CARD.replace("p-6", "p-3.5"), "flex flex-col items-center text-center transition-colors hover:border-[#D6DBD8]")}
                  >
                    <span className={cn("mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg", kpi.iconBg, kpi.iconFg)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="text-[24px] font-bold leading-none tracking-tight tabular-nums text-[#16241b]">
                      {kpi.value}
                    </div>
                    <div className="mt-1 text-[12px] font-medium text-[#57655C]">{kpi.label}</div>
                  </div>
                );
              })}
            </section>

            {/* 12-баганат агуулгын grid */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              {/* Миний даалгавар — голлуулсан, бүтэн мөр */}
              <div className="mx-auto flex w-full min-w-0 max-w-[1040px] flex-col gap-6 xl:col-span-12">
                {procurementActionPanel ? (
                  <div className={dashboardStyles.procurementTaskPanel}>{procurementActionPanel}</div>
                ) : null}

                {total ? (
                  <>
                    {personalTasks.length ? (
                      <WorkerTaskTable
                        tasks={personalTasks}
                        title="Миний даалгавар"
                        currentDateKey={currentDateKey}
                        allHref="/tasks"
                        maxRows={5}
                      />
                    ) : null}
                    {departmentTasks.length ? (
                      <WorkerTaskTable
                        tasks={departmentTasks}
                        title="Хэлтсийн даалгавар"
                        currentDateKey={currentDateKey}
                        allHref="/tasks"
                        maxRows={5}
                      />
                    ) : null}
                  </>
                ) : (
                  <section className={cn(CARD, "text-center")}>
                    <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F2F8F3] text-[#4A9A5D]">
                      <ClipboardList className="h-6 w-6" />
                    </span>
                    <p className="text-sm font-semibold text-[#1F2B24]">Одоогоор оногдсон даалгавар алга.</p>
                    <p className="mt-1 text-xs font-medium text-[#8A978E]">Шинэ даалгавар оногдоход энд харагдана.</p>
                  </section>
                )}
              </div>

              {/* Даалгаврын төлөв — 5 багана */}
              <section className={cn(CARD, "xl:col-span-5")}>
                <h3 className={cn(CARD_TITLE, "mb-5")}>Даалгаврын төлөв</h3>
                {total ? (
                  <div className="flex items-center gap-6">
                    <div className="relative h-[150px] w-[150px] shrink-0">
                      <svg viewBox="0 0 140 140" className="h-full w-full" role="img" aria-label={`Гүйцэтгэл ${completionPct} хувь`}>
                        <g transform="rotate(-90 70 70)" fill="none" strokeWidth="15" pathLength="100">
                          <circle cx="70" cy="70" r="54" stroke="#EDF0EE" />
                          {donutSegs.map((segment) => (
                            <circle
                              key={segment.key}
                              cx="70"
                              cy="70"
                              r="54"
                              stroke={segment.color}
                              strokeDasharray={segment.dash}
                              strokeDashoffset={segment.offset}
                            />
                          ))}
                        </g>
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <b className="text-3xl font-bold tabular-nums text-[#16241b]">{completionPct}%</b>
                        <span className="text-[11px] font-medium text-[#8A978E]">Гүйцэтгэл</span>
                      </div>
                    </div>
                    <div className="grid flex-1 gap-3">
                      {donutData.map((segment) => (
                        <div key={segment.key} className="flex items-center gap-2.5 text-sm text-[#57655C]">
                          <span className="h-3 w-3 rounded-[4px]" style={{ background: segment.color }} />
                          {segment.label}
                          <b className="ml-auto tabular-nums text-[#16241b]">{segment.value}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm font-medium text-[#8A978E]">Даалгавар байхгүй тул төлөв харагдахгүй.</p>
                )}
              </section>

              {/* Ирэх ачаалал — 7 багана */}
              <section className={cn(CARD, "xl:col-span-7")}>
                <div className="mb-5 flex items-center gap-2">
                  <h3 className={CARD_TITLE}>Ирэх ачаалал</h3>
                  <span className="ml-auto text-[13px] font-medium text-[#8A978E]">Хугацаа тавьсан даалгавар · сараар</span>
                </div>
                {monthlyTotal ? (
                  <div className="flex h-[180px] items-end gap-4">
                    {monthlyLoad.map((month) => (
                      <div key={month.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2.5">
                        <span className="text-sm font-bold tabular-nums text-[#16241b]">{month.count || ""}</span>
                        <div
                          className={cn(
                            "w-full max-w-[56px] rounded-t-lg",
                            month.count ? "bg-[#2563EB]" : "bg-[#EDF0EE]",
                          )}
                          style={{ height: `${month.count ? Math.max(6, (month.count / monthlyMax) * 100) : 3}%` }}
                        />
                        <span className={cn("text-[12px]", month.isCurrent ? "font-bold text-[#16241b]" : "text-[#8A978E]")}>
                          {month.label}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm font-medium text-[#8A978E]">Хугацаа тавьсан даалгавар алга.</p>
                )}
              </section>

              {/* Өдрийн уриа — нам, нэг мөрт хэсэг */}
              <section className="flex items-center gap-3 rounded-2xl border border-[#E7EBE8] bg-white px-6 py-4 xl:col-span-12">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EEF1EF] text-[#2E7D32]">
                  <Leaf className="h-[18px] w-[18px]" />
                </span>
                <p className="text-sm text-[#57655C]">
                  <span className="font-semibold text-[#16241b]">Өдрийн уриа</span>
                  <span className="mx-2 text-[#C7CFCA]">·</span>
                  “Байгалиа хайрлая, ирээдүйгээ хамгаалъя.”
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function ExecutiveDashboardView({
  session,
  roleLabel,
  canCreateProject,
  canCreateTasks,
  canWriteReports,
  canViewQualityCenter,
  canUseFieldConsole,
  canViewHr,
  notificationCount,
  notificationNote,
  totalTasks,
  completedTasks,
  workingTasks,
  reviewTasks,
  overdueTasks,
  currentDateKey,
  workItemStats,
  dashboardTasks,
  snapshot,
  fleetBoard,
  hrAttendanceSummary,
  weather,
  title = "Ерөнхий хяналтын самбар",
  subtitle = "Бүх хэлтсийн ажлын нэгдсэн тойм",
  departmentSectionTitle = "Хэлтсүүдийн ажлын нөхцөл байдал",
  departmentScopeName = null,
  showDepartmentPerformance = true,
  assignedTasks = [],
  wastePointSummary,
}: {
  session: AppSession;
  roleLabel: string;
  canCreateProject: boolean;
  canCreateTasks: boolean;
  canWriteReports: boolean;
  canViewQualityCenter: boolean;
  canUseFieldConsole: boolean;
  canViewHr: boolean;
  notificationCount: number;
  notificationNote: string;
  totalTasks: number;
  completedTasks: number;
  workingTasks: number;
  reviewTasks: number;
  overdueTasks: number;
  currentDateKey: string;
  workItemStats: ReturnType<typeof dashboardTaskStats>;
  dashboardTasks: DashboardSnapshot["taskDirectory"];
  snapshot: DashboardSnapshot;
  fleetBoard: FleetVehicleBoard;
  hrAttendanceSummary: HrDailyAttendanceSummary;
  weather: WeatherSnapshot;
  title?: string;
  subtitle?: string;
  departmentSectionTitle?: string;
  departmentScopeName?: string | null;
  showDepartmentPerformance?: boolean;
  assignedTasks?: AssignedTaskItem[];
  wastePointSummary?: WastePointSummary;
}) {
  const canViewAllReports = canViewAllWorkspaceReports(session);
  const canViewWeightReports = canViewGarbageWeightReports(session, departmentScopeName);
  const overallProgress = workItemStats.progress || percent(completedTasks, totalTasks);
  const fleetUsage = percent(fleetBoard.activeCount, fleetBoard.totalVehicles);
  const activeTasks = Math.max(0, totalTasks - completedTasks);
  const scopedProjectsHref = (category?: string) => {
    const params = new URLSearchParams();
    if (departmentScopeName) {
      params.set("department", departmentScopeName);
    }
    if (category) {
      params.set("category", category);
    }
    const query = params.toString();
    return query ? `/projects?${query}` : "/projects";
  };
  const fleetBoardHref = (() => {
    if (!isGreenOrImprovementVehicleScope(departmentScopeName)) {
      return "/auto-base";
    }

    const params = new URLSearchParams();
    params.set("department", departmentScopeName ?? "");
    return `/auto-base?${params.toString()}`;
  })();
  const conclusionIssueCount = reviewTasks + overdueTasks + fleetBoard.repairCount;
  const conclusionTone = overdueTasks > 0 || fleetBoard.repairCount > 0
    ? "warning"
    : reviewTasks > 0
      ? "attention"
      : "normal";
  const conclusionTitle = conclusionTone === "warning"
    ? "Шуурхай анхаарах"
    : conclusionTone === "attention"
      ? "Хяналт шаардлагатай"
      : "Хэвийн";
  const metrics: ExecutiveMetric[] = [
    {
      label: "нийт гүйцэтгэл",
      value: `${overallProgress}%`,
      progress: overallProgress,
      showRing: true,
      href: showDepartmentPerformance ? "#department-performance" : scopedProjectsHref(),
      icon: CheckCircle2,
      tone: "green",
    },
    {
      label: "хянах ажил",
      value: String(reviewTasks),
      progress: percent(reviewTasks, totalTasks),
      href: "/review",
      icon: ShieldCheck,
      tone: "blue",
    },
    {
      label: "хүний нөөц",
      value: String(hrAttendanceSummary.totalEmployees),
      valueLabel: "Идэвхтэй ажилтан",
      note: `Өвчтэй: ${hrAttendanceSummary.sickToday} · Чөлөөтэй: ${hrAttendanceSummary.leaveToday}`,
      progress: percent(hrAttendanceSummary.totalEmployees, hrAttendanceSummary.totalEmployees),
      href: "/hr",
      icon: UsersRound,
      tone: "green",
    },
    {
      label: "техникийн ашиглалт",
      value: `${fleetUsage}%`,
      progress: fleetUsage,
      showRing: true,
      href: fleetBoardHref,
      icon: Truck,
      tone: "purple",
    },
    {
      label: "хугацаа хэтэрсэн ажил",
      value: String(overdueTasks),
      valueLabel: "Ажил",
      progress: 0,
      href: scopedProjectsHref("overdue"),
      icon: Clock3,
      tone: "orange",
    },
    {
      label: "нээлттэй ажил",
      value: String(activeTasks),
      progress: 100,
      href: scopedProjectsHref(),
      icon: ClipboardList,
      tone: "green",
    },
    ...(wastePointSummary?.available
      ? [{
          label: "хогийн цэг",
          value: String(wastePointSummary.total),
          valueLabel: `${wastePointSummary.khorooCount} хороонд бүртгэлтэй`,
          note: `Хэвийн: ${wastePointSummary.active} · Дүүрсэн: ${wastePointSummary.full} · Засварт: ${wastePointSummary.maintenance}`,
          progress: percent(wastePointSummary.active, wastePointSummary.total),
          href: "/waste-points/list",
          icon: MapPinned,
          tone: "green" as const,
        }]
      : []),
    {
      label: "автомат дүгнэлт",
      value: String(conclusionIssueCount),
      valueLabel: conclusionTitle,
      note: conclusionIssueCount > 0
        ? `Хугацаа хэтэрсэн: ${overdueTasks} · Хянах: ${reviewTasks} · Засварт: ${fleetBoard.repairCount}`
        : "Онцгой эрсдэл илрээгүй",
      progress: conclusionIssueCount > 0 ? 0 : 100,
      href: overdueTasks > 0 ? scopedProjectsHref("overdue") : reviewTasks > 0 ? "/review" : scopedProjectsHref(),
      icon: conclusionTone === "normal" ? CheckCircle2 : AlertTriangle,
      tone: conclusionTone === "warning" ? "orange" : conclusionTone === "attention" ? "blue" : "green",
    },
  ];
  const departmentMetrics = buildExecutiveDepartmentMetrics({
    snapshot,
    tasks: dashboardTasks,
    currentDateKey,
    departmentScopeName,
  });
  const activityRows = buildExecutiveActivityRows(snapshot, dashboardTasks);
  const alertCount = reviewTasks + overdueTasks + fleetBoard.repairCount;

  return (
    <main className={cn(shellStyles.shell, dashboardStyles.executiveShell)}>
      <div className={shellStyles.contentWithMenu}>
        <aside className={shellStyles.menuColumn}>
          <AppMenu
            active="dashboard"
            canCreateProject={canCreateProject}
            canCreateTasks={canCreateTasks}
            canWriteReports={canWriteReports}
            canViewQualityCenter={canViewQualityCenter}
            canUseFieldConsole={canUseFieldConsole}
            canViewAllReports={canViewAllReports}
            canViewGarbageWeightReports={canViewWeightReports}
            canViewHr={canViewHr}
            canViewGeneralDashboard={showDepartmentPerformance && !departmentScopeName}
            userName={session.name}
            userRole={session.role}
            roleLabel={roleLabel}
            groupFlags={session.groupFlags}
            workerMode={false}
            notificationCount={notificationCount}
            departmentScopeName={departmentScopeName}
          />
        </aside>

        <div className={shellStyles.pageContent}>
          <WorkspaceHeader
            title={title}
            subtitle={subtitle}
            userName={session.name}
            roleLabel={roleLabel}
            notificationCount={notificationCount}
            notificationNote={notificationNote}
          />

          <ExecutiveHeroBanner
            alertCount={alertCount}
            weather={weather}
          />

          <section className={dashboardStyles.executiveMetricGrid}>
            {metrics.map((metric) => (
              <ExecutiveMetricCard key={metric.label} metric={metric} />
            ))}
          </section>

          <OpenTasksSummaryCard
            tasks={dashboardTasks}
            currentDateKey={currentDateKey}
            className="mb-5"
          />

          {departmentScopeName && fleetBoard.totalVehicles > 0 ? (
            <section className={dashboardStyles.departmentVehicleSection} id="department-vehicles">
              <div className={dashboardStyles.executiveSectionHeader}>
                <div>
                  <h2>Хэлтсийн машин техник</h2>
                  <p>
                    Нийт {fleetBoard.totalVehicles} машин · Идэвхтэй {fleetBoard.activeCount}
                    {fleetBoard.repairCount ? ` · Засварт ${fleetBoard.repairCount}` : ""}
                  </p>
                </div>
                <Link href={fleetBoardHref} className={dashboardStyles.departmentVehicleLink}>
                  Бүгдийг харах
                </Link>
              </div>
              <div className={dashboardStyles.departmentVehicleGrid}>
                {fleetBoard.allVehicles.slice(0, 12).map((vehicle) => (
                  <article key={vehicle.id} className={dashboardStyles.departmentVehicleCard}>
                    <strong>{vehicle.plate || vehicle.name}</strong>
                    <span>{vehicle.modelName || vehicle.name}</span>
                    <small>
                      {vehicle.responsibleDriverName ||
                        vehicle.fleetDriverName ||
                        "Жолооч оноогоогүй"}
                    </small>
                    <span
                      className={cn(
                        dashboardStyles.departmentVehicleStatus,
                        vehicle.isRepair && dashboardStyles.departmentVehicleStatusRepair,
                      )}
                    >
                      {vehicle.isRepair ? "Засварт" : vehicle.stateLabel || "Идэвхтэй"}
                    </span>
                  </article>
                ))}
              </div>
              {fleetBoard.allVehicles.length > 12 ? (
                <p className={dashboardStyles.departmentVehicleMore}>
                  +{fleetBoard.allVehicles.length - 12} бусад машиныг «Бүгдийг харах» дээрээс үзнэ.
                </p>
              ) : null}
            </section>
          ) : null}

          <div className={dashboardStyles.executiveOperationsGrid}>
            {showDepartmentPerformance ? (
              <section id="department-performance" className={dashboardStyles.executiveSection}>
                <div className={dashboardStyles.executiveSectionHeader}>
                  <div>
                    <h2>{departmentSectionTitle}</h2>
                    <p>{notificationNote}</p>
                  </div>
                </div>
                <div className={dashboardStyles.executiveDepartmentGrid}>
                  {departmentMetrics.map((department) => (
                    <ExecutiveDepartmentCard key={department.name} department={department} />
                  ))}
                </div>
              </section>
            ) : null}

            <aside className={dashboardStyles.executiveSideColumn}>
              <ExecutiveSloganPanel />
              <ExecutiveActivityPanel rows={activityRows} />
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

export function DashboardView({
  session,
  snapshot,
  todayAssignments,
  assignedGarbageVehicles = [],
  assignedGarbagePointOptions = [],
  garbageDepartmentId = null,
  fleetBoard,
  fleetLoadError = "",
  hrAttendanceSummary,
  departmentScopeName = null,
  weather,
  canViewHr = false,
  canViewGeneralDashboard = false,
  notificationCount,
  notificationNote,
  assignedTasks = [],
  showProcurementHomePanels = false,
  procurementActionPanel,
  wastePointSummary,
}: DashboardViewProps) {
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewAllReports = canViewAllWorkspaceReports(session);
  const canViewWeightReports = canViewGarbageWeightReports(session, departmentScopeName);
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  const transportInspectorMode = isTransportInspectorDashboard(session);
  const showHrSummary = Boolean(canViewHr && !workerMode);
  const showWeatherSummary = Boolean((!workerMode || showProcurementHomePanels) && !transportInspectorMode);
  const roleLabel = getSessionRoleLabel(session);
  const currentDateKey = todayKey();
  const model = buildDashboardModel({
    session,
    snapshot,
    todayAssignments,
  });
  const scopeLabel = departmentScopeName ?? model.scopeLabel;
  const showFleetSummary = Boolean(
    !departmentScopeName ||
    departmentScopeName.includes("Авто") ||
    departmentScopeName.includes("Хог") ||
      departmentScopeName.includes("хог") ||
      session.groupFlags?.mfoManager ||
      session.groupFlags?.mfoDispatcher ||
      session.groupFlags?.mfoInspector ||
      session.groupFlags?.mfoDriver ||
      session.groupFlags?.fleetRepairAny,
  );

  const scopedTasks = workerMode
    ? snapshot.taskDirectory.filter((task) => {
        const currentUserId = String(session.uid);
        return (task.assigneeIds ?? []).some(
          (assigneeId) => String(normalizeTaskAssigneeId(assigneeId)) === currentUserId,
        );
      })
    : snapshot.taskDirectory;
  const dashboardTasks = workerMode
    ? scopedTasks
    : scopedTasks.length
      ? scopedTasks
      : snapshot.taskDirectory;
  // Нэвтэрсэн ажилтанд оногдсон дуусаагүй даалгаврууд — service эрхээр татсан
  // (worker/нярав өөрийн эрхээр project.task уншиж чаддаггүйг тойрсон).
  const myAssignedTasks = assignedTasks;
  const assignedStatusCounts: Record<AssignedTaskStatusKey, number> = {
    planned: 0,
    doing: 0,
    review: 0,
    done: 0,
  };
  for (const task of myAssignedTasks) {
    assignedStatusCounts[task.statusKey] += 1;
  }
  const assignedDoneCount = assignedStatusCounts.done;
  const assignedActiveCount = myAssignedTasks.length - assignedDoneCount;
  const assignedOverdueCount = myAssignedTasks.filter(
    (task) => task.statusKey !== "done" && task.deadline && task.deadline < currentDateKey,
  ).length;
  const assignedSummaryChips = [
    { key: "all", label: "Нийт", count: myAssignedTasks.length, dot: "bg-[#4A9A5D]" },
    { key: "doing", label: ASSIGNED_STATUS_META.doing.label, count: assignedStatusCounts.doing, dot: ASSIGNED_STATUS_META.doing.dot },
    { key: "review", label: ASSIGNED_STATUS_META.review.label, count: assignedStatusCounts.review, dot: ASSIGNED_STATUS_META.review.dot },
    { key: "done", label: ASSIGNED_STATUS_META.done.label, count: assignedDoneCount, dot: ASSIGNED_STATUS_META.done.dot },
  ].filter((chip) => chip.key === "all" || chip.count > 0);
  const dashboardProjects = snapshot.projects.filter(hasDashboardWork);
  const workItemStats = dashboardTaskStats(dashboardTasks, currentDateKey);
  const totalTasks = workerMode
    ? dashboardTasks.length
    : dashboardProjects.length || snapshot.totalTasks || 0;
  const completedTasks = workerMode
    ? dashboardTasks.filter((task) => task.statusKey === "verified").length
    : dashboardProjects.filter((project) => project.stageBucket === "done").length;
  const workingTasks = workerMode
    ? dashboardTasks.filter((task) => task.statusKey !== "verified").length
    : dashboardProjects.filter((project) => project.stageBucket !== "done").length;
  const reviewTasks = workerMode
    ? dashboardTasks.filter((task) => task.statusKey === "review" || task.statusKey === "problem").length
    : dashboardProjects.filter((project) => project.stageBucket === "review" || project.stageBucket === "problem").length;
  const overdueTaskItems = dashboardTasks.filter((task) => isOverdue(task, currentDateKey));
  const overdueTasks = workerMode ? overdueTaskItems.length : countTaskWorkItems(overdueTaskItems);
  const newIncomingTaskItems = dashboardTasks.filter((task) => isNewIncomingTask(task, currentDateKey));
  const newIncomingTasks = workerMode ? newIncomingTaskItems.length : countTaskWorkItems(newIncomingTaskItems);
  const notificationTaskItems = dashboardTasks.filter(
    (task) =>
      isNewIncomingTask(task, currentDateKey) ||
      isOverdue(task, currentDateKey) ||
      task.statusKey === "review" ||
      task.issueFlag,
  );
  const computedAttentionCount = workerMode
    ? countNotificationTasks(dashboardTasks, currentDateKey)
    : countTaskWorkItems(notificationTaskItems);
  const attentionCount = notificationCount ?? computedAttentionCount;
  const effectiveNotificationNote =
    notificationNote ??
    (attentionCount > 0
      ? `${newIncomingTasks} шинэ ажил, ${reviewTasks} хянах, ${overdueTasks} хугацаа хэтэрсэн`
      : "Шинэ ажил, хянах зүйл алга");
  const sortedProjects = [...dashboardProjects].sort((left, right) => {
    const leftTone = projectTone(left);
    const rightTone = projectTone(right);
    const score = { urgent: 4, attention: 3, good: 2, muted: 1 };
    return score[rightTone] - score[leftTone] || right.completion - left.completion;
  });
  const currentUserId = String(session.uid);
  const currentMasterProjectIds = new Set(
    dashboardProjects
      .filter((project) => isSameDashboardUser(project.managerId, currentUserId))
      .map((project) => project.id),
  );
  const currentMasterTasks = masterMode
    ? dashboardTasks.filter(
        (task) =>
          isSameDashboardUser(task.leaderId, currentUserId) ||
          (typeof task.projectId === "number" && currentMasterProjectIds.has(task.projectId)),
      )
    : [];
  const currentMasterTaskProjectIds = new Set(
    currentMasterTasks
      .map((task) => task.projectId)
      .filter((projectId): projectId is number => typeof projectId === "number"),
  );
  const currentMasterProjects = masterMode
    ? sortedProjects.filter(
        (project) =>
          isSameDashboardUser(project.managerId, currentUserId) ||
          currentMasterTaskProjectIds.has(project.id),
      )
    : [];
  const workerWorkSummaries = workerMode
    ? buildWorkerWorkSummaries(dashboardTasks, snapshot.projects, currentDateKey)
    : [];
  const visibleWorkerWorks = workerWorkSummaries;
  const visibleProjects = masterMode ? sortedProjects : sortedProjects.slice(0, 3);
  const visibleWorkItems = workerMode ? visibleWorkerWorks.length : visibleProjects.length;
  const hasProcurementActionPanel = Boolean(procurementActionPanel);
  // Worker-ийн өөрийн эрхээр татсан snapshot хоосон байхад (нярав г.м.) "Ажлын
  // жагсаалт" карт хоосон гарч, дээрх "Миний даалгавар" картыг давхардуулдаг.
  // Оногдсон даалгавар байгаа, гэхдээ энэ картад харуулах контент байхгүй үед нуулгана.
  const hideDuplicateWorkerWorkList = Boolean(
    workerMode &&
      !hasProcurementActionPanel &&
      visibleWorkItems === 0 &&
      myAssignedTasks.length > 0,
  );
  const projectStatusChips = projectStatusFilterChips(sortedProjects);
  const projectStatusSections = projectStatusChips.map((chip) => ({
    ...chip,
    projects: sortedProjects.filter((project) => projectMatchesStatusFilter(project, chip.key)),
  }));
  const taskGridClassName = cn(
    dashboardStyles.taskListBody,
    workerMode && visibleWorkItems > 1 && "xl:grid-cols-2",
    !workerMode && visibleWorkItems > 1 && "lg:grid-cols-2 2xl:grid-cols-3",
  );
  const currentMasterGridClassName = cn(
    dashboardStyles.taskListBody,
    currentMasterProjects.length > 1 && "lg:grid-cols-2 2xl:grid-cols-3",
  );

  const hasDepartmentScope = Boolean(departmentScopeName);
  const departmentHeadDashboardMode =
    hasDepartmentScope &&
    !workerMode &&
    !transportInspectorMode &&
    isDepartmentHeadDashboard(session);
  const executiveDashboardMode =
    canViewGeneralDashboard && !workerMode && !departmentHeadDashboardMode;

  if (executiveDashboardMode || departmentHeadDashboardMode) {
    const scopedDashboardTitle = departmentHeadDashboardMode
      ? "Хяналтын самбар"
      : undefined;
    const scopedDashboardSubtitle = departmentHeadDashboardMode
      ? `${scopeLabel} · Ажил, хүний нөөц, машин техникийн нэгтгэсэн тойм`
      : undefined;
    const scopedDepartmentSectionTitle = departmentHeadDashboardMode
      ? "Хэлтсийн ажлын нөхцөл байдал"
      : undefined;

    return (
      <ExecutiveDashboardView
        session={session}
        roleLabel={roleLabel}
        canCreateProject={canCreateProject}
        canCreateTasks={canCreateTasks}
        canWriteReports={canWriteReports}
        canViewQualityCenter={canViewQualityCenter}
        canUseFieldConsole={canUseFieldConsole}
        canViewHr={canViewHr}
        notificationCount={attentionCount}
        notificationNote={effectiveNotificationNote}
        totalTasks={totalTasks}
        completedTasks={completedTasks}
        workingTasks={workingTasks}
        reviewTasks={reviewTasks}
        overdueTasks={overdueTasks}
        currentDateKey={currentDateKey}
        workItemStats={workItemStats}
        dashboardTasks={dashboardTasks}
        snapshot={snapshot}
        fleetBoard={fleetBoard}
        hrAttendanceSummary={hrAttendanceSummary}
        weather={weather}
        title={scopedDashboardTitle}
        subtitle={scopedDashboardSubtitle}
        departmentSectionTitle={scopedDepartmentSectionTitle}
        departmentScopeName={departmentScopeName}
        showDepartmentPerformance
        assignedTasks={myAssignedTasks}
        wastePointSummary={wastePointSummary}
      />
    );
  }

  if (workerMode && !masterMode) {
    return (
      <WorkerHomeView
        session={session}
        roleLabel={roleLabel}
        scopeLabel={scopeLabel}
        canCreateProject={canCreateProject}
        canCreateTasks={canCreateTasks}
        canWriteReports={canWriteReports}
        canViewQualityCenter={canViewQualityCenter}
        canUseFieldConsole={canUseFieldConsole}
        canViewHr={canViewHr}
        notificationCount={attentionCount}
        notificationNote={effectiveNotificationNote}
        assignedTasks={myAssignedTasks}
        currentDateKey={currentDateKey}
        departmentScopeName={departmentScopeName}
        procurementActionPanel={procurementActionPanel}
      />
    );
  }

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.contentWithMenu}>
        <aside className={shellStyles.menuColumn}>
          <AppMenu
            active="dashboard"
            canCreateProject={canCreateProject}
            canCreateTasks={canCreateTasks}
            canWriteReports={canWriteReports}
            canViewQualityCenter={canViewQualityCenter}
            canUseFieldConsole={canUseFieldConsole}
            canViewAllReports={canViewAllReports}
            canViewGarbageWeightReports={canViewWeightReports}
            canViewHr={canViewHr}
            canViewGeneralDashboard={canViewGeneralDashboard}
            userName={session.name}
            userRole={session.role}
            roleLabel={roleLabel}
            groupFlags={session.groupFlags}
            workerMode={workerMode}
            notificationCount={attentionCount}
            departmentScopeName={departmentScopeName}
          />
        </aside>

        <div className={shellStyles.pageContent}>
          <WorkspaceHeader
            title={transportInspectorMode ? "Даалгавар үүсгэх" : `Сайн байна уу, ${session.name}`}
            subtitle={transportInspectorMode ? "Машин, хороо, хогийн цэг сонгох" : scopeLabel}
            userName={session.name}
            roleLabel={roleLabel}
            notificationCount={attentionCount}
            notificationNote={effectiveNotificationNote}
            backgroundImage={DASHBOARD_IMAGES.header}
            showUserMenu={!workerMode}
          />

          {showProcurementHomePanels ? (
            <ExecutiveHeroBanner alertCount={attentionCount} weather={weather} />
          ) : null}

          <div
            className={cn(
              "relative z-20 grid gap-4",
              !transportInspectorMode && "xl:grid-cols-[minmax(0,1fr)_360px]",
              dashboardStyles.dashboardMainGrid,
              transportInspectorMode && dashboardStyles.dashboardMainGridInspector,
            )}
          >
            <div className={cn("grid min-w-0 gap-4", dashboardStyles.dashboardPrimaryColumn)}>
              {fleetLoadError ? (
                <Card className="border-amber-200 bg-amber-50/85 p-4 text-sm font-semibold text-amber-800">
                  {fleetLoadError}
                </Card>
              ) : null}

              {transportInspectorMode ? (
                <DashboardInspectorVehiclePanel
                  vehicles={assignedGarbageVehicles}
                  garbagePointOptions={assignedGarbagePointOptions}
                  departmentId={garbageDepartmentId}
                  tasks={dashboardTasks}
                  fleetBoard={fleetBoard}
                />
              ) : null}

              {masterMode ? (
                <Card className={dashboardStyles.taskListCard}>
                  <CardHeader className={dashboardStyles.taskListHeader}>
                    <div className={dashboardStyles.taskListHeaderText}>
                      <CardTitle>Миний хариуцсан ажил</CardTitle>
                      <CardDescription>
                        Таны нэр дээр хариуцагчаар бүртгэгдсэн ажил, даалгаврууд.
                      </CardDescription>
                    </div>
                    <Badge tone={currentMasterProjects.length ? "green" : "slate"}>
                      {currentMasterProjects.length} ажил
                    </Badge>
                  </CardHeader>

                  <div className={currentMasterGridClassName}>
                    {currentMasterProjects.map((project) => (
                      <ProjectCard key={`mine-${project.id}`} project={project} />
                    ))}
                    {!currentMasterProjects.length ? (
                      <div className={cn("col-span-full", dashboardStyles.taskListEmpty)}>
                        <span className={dashboardStyles.taskListEmptyIcon}>
                          <UserCheck />
                        </span>
                        <span className="mt-2 block text-[#1F2B24]">Танд хариуцсан ажил бүртгэгдээгүй байна.</span>
                        <small className="mt-1 block font-medium text-[#8A978E]">Нийт ажлын жагсаалтаас алба нэгжийн ажлуудаа харж болно.</small>
                      </div>
                    ) : null}
                  </div>
                </Card>
              ) : null}

              {myAssignedTasks.length ? (
                <Card className={dashboardStyles.taskListCard}>
                  <CardHeader className={dashboardStyles.taskListHeader}>
                    <div className={dashboardStyles.taskListHeaderText}>
                      <CardTitle>Миний даалгавар</CardTitle>
                      <CardDescription>
                        {assignedActiveCount > 0
                          ? `Хийж гүйцэтгэх ${assignedActiveCount} даалгавар байна. Гүйцэтгэсний дараа тайлан оруулна.`
                          : "Оногдсон бүх даалгаврыг гүйцэтгэсэн байна."}
                      </CardDescription>
                    </div>
                    <Badge tone="green">{myAssignedTasks.length}</Badge>
                  </CardHeader>

                  <div className="mb-3 flex flex-wrap gap-2">
                    {assignedSummaryChips.map((chip) => (
                      <span
                        key={chip.key}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#E4EFE7] bg-white px-3 py-1 text-xs font-semibold text-[#3f5147]"
                      >
                        <span className={cn("h-2 w-2 rounded-full", chip.dot)} />
                        {chip.label}
                        <b className="text-[#16241b]">{chip.count}</b>
                      </span>
                    ))}
                    {assignedOverdueCount > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEE2E2] px-3 py-1 text-xs font-semibold text-[#b91c1c]">
                        <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                        Хугацаа хэтэрсэн
                        <b>{assignedOverdueCount}</b>
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-2.5">
                    {myAssignedTasks.map((task, index) => {
                      const status = ASSIGNED_STATUS_META[task.statusKey];
                      const isDone = task.statusKey === "done";
                      const overdue = !isDone && Boolean(task.deadline && task.deadline < currentDateKey);
                      const dateLabel = formatMnDate(task.deadline);
                      return (
                        <Link
                          key={`assigned-${task.id}`}
                          href={task.href}
                          className={cn(
                            "flex items-center gap-3 rounded-2xl border p-3 transition",
                            isDone
                              ? "border-[#E8EFE9] bg-[#F6FBF7] hover:border-[#22C55E]"
                              : "border-[#E4EFE7] bg-white hover:border-[#2e7d32] hover:shadow-[0_6px_18px_rgba(46,125,50,0.10)]",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black",
                              isDone
                                ? "bg-[rgba(34,197,94,0.14)] text-[#15803d]"
                                : "bg-[rgba(74,154,93,0.12)] text-[#1b5e20]",
                            )}
                          >
                            {isDone ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong
                              className={cn(
                                "block truncate text-sm font-semibold",
                                isDone ? "text-[#5b6b60]" : "text-[#16241b]",
                              )}
                            >
                              {task.name}
                            </strong>
                            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                                  status.pill,
                                )}
                              >
                                <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                                {task.statusLabel || status.label}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 text-xs",
                                  overdue ? "font-semibold text-[#dc2626]" : "text-[#6b7a72]",
                                )}
                              >
                                <Clock3 className="h-3.5 w-3.5 shrink-0" />
                                {dateLabel || "Хугацаа заагаагүй"}
                                {overdue ? " · хугацаа хэтэрсэн" : ""}
                              </span>
                            </span>
                          </span>
                          {isDone ? (
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[rgba(34,197,94,0.12)] px-3 py-2 text-xs font-extrabold text-[#15803d]">
                              <CheckCircle2 className="h-4 w-4" />
                              Гүйцэтгэсэн
                            </span>
                          ) : (
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[rgba(46,125,65,0.10)] px-3 py-2 text-xs font-extrabold text-[#1b5e20]">
                              <CheckCircle2 className="h-4 w-4" />
                              Тайлан оруулах
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </Card>
              ) : null}

              {hideDuplicateWorkerWorkList ? null : (
              <Card className={dashboardStyles.taskListCard}>
                <CardHeader className={dashboardStyles.taskListHeader}>
                  <div className={dashboardStyles.taskListHeaderText}>
                    <CardTitle>{masterMode ? "Алба нэгжийн бүх захирамж, үүрэг даалгавар" : "Захирамж, үүрэг даалгаврын жагсаалт"}</CardTitle>
                    {masterMode ? (
                      <CardDescription>
                        Энэ хэсэгт нэгжийн нийт ажил харагдана. Мастер бүр нэг нэгнийхээ ажлын явцыг хянаж болно.
                      </CardDescription>
                    ) : null}
                  </div>
                </CardHeader>

                {procurementActionPanel ? (
                  <div className={dashboardStyles.procurementTaskPanel}>
                    {procurementActionPanel}
                  </div>
                ) : null}

                {workerMode ? (
                  <div className={taskGridClassName}>
                    {visibleWorkerWorks.map((work) => (
                      <WorkerWorkCard key={work.name} work={work} />
                    ))}
                    {!visibleWorkItems && !hasProcurementActionPanel ? (
                      <div className={cn("col-span-full", dashboardStyles.taskListEmpty)}>
                        <span className={dashboardStyles.taskListEmptyIcon}>
                          <ClipboardList />
                        </span>
                        <span className="mt-2 block text-[#1F2B24]">Одоогоор ажил бүртгэгдээгүй байна.</span>
                        <small className="mt-1 block font-medium text-[#8A978E]">Шинэ ажил үүсгэж эхлээрэй.</small>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className={dashboardStyles.taskListFilterShell}>
                    {projectStatusChips.map((chip) => (
                      <input
                        key={chip.key}
                        type="radio"
                        id={`dashboard-project-filter-${chip.key}`}
                        name="dashboard-project-filter"
                        className={dashboardStyles.taskListFilterInput}
                      />
                    ))}
                  <div className={dashboardStyles.taskListFilters}>
                    {projectStatusChips.map((chip) => (
                      <label
                        key={chip.label}
                        htmlFor={`dashboard-project-filter-${chip.key}`}
                        className={cn(
                          dashboardStyles.taskListFilterChip,
                          chip.tone === "amber" && dashboardStyles.taskListFilterChipAmber,
                          chip.tone === "muted" && dashboardStyles.taskListFilterChipMuted,
                        )}
                      >
                        <span className={dashboardStyles.taskListFilterDot} />
                        {chip.label}
                        <small>{chip.count}</small>
                      </label>
                    ))}
                  </div>
                    <div className={dashboardStyles.taskListFilterPanels}>
                      <div
                        className={cn(
                          taskGridClassName,
                          dashboardStyles.taskListFilterPanel,
                          dashboardStyles.taskListFilterPanelDefault,
                        )}
                      >
                        {visibleProjects.map((project) => (
                          <ProjectCard key={project.id} project={project} />
                        ))}
                        {!visibleProjects.length && !hasProcurementActionPanel ? (
                          <div className={cn("col-span-full", dashboardStyles.taskListEmpty)}>
                            <span className={dashboardStyles.taskListEmptyIcon}>
                              <ClipboardList />
                            </span>
                            <span className="mt-2 block text-[#1F2B24]">Одоогоор ажил бүртгэгдээгүй байна.</span>
                            <small className="mt-1 block font-medium text-[#8A978E]">Шинэ ажил үүсгэж эхлээрэй.</small>
                          </div>
                        ) : null}
                      </div>

                      {projectStatusSections.map((section) => (
                        <div
                          key={section.key}
                          className={cn(
                            taskGridClassName,
                            dashboardStyles.taskListBodyScrollable,
                            dashboardStyles.taskListFilterPanel,
                            section.key === "review" && dashboardStyles.taskListFilterPanelPending,
                            section.key === "done" && dashboardStyles.taskListFilterPanelDone,
                            section.key === "planned" && dashboardStyles.taskListFilterPanelPlanned,
                          )}
                        >
                          {section.projects.map((project) => (
                            <ProjectCard key={project.id} project={project} />
                          ))}
                          {!section.projects.length ? (
                            <div className={cn("col-span-full", dashboardStyles.taskListEmpty)}>
                              <span className={dashboardStyles.taskListEmptyIcon}>
                                <ClipboardList />
                              </span>
                              <span className="mt-2 block text-[#1F2B24]">{section.label} ажил алга.</span>
                              <small className="mt-1 block font-medium text-[#8A978E]">Өөр төлөв сонгоод шалгана уу.</small>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
              )}

              <OpenTasksSummaryCard tasks={dashboardTasks} currentDateKey={currentDateKey} />

              {!workerMode ? <MobilePriorityPanel canWriteReports={canWriteReports} /> : null}

              {!workerMode ? (
                <>
                  <div className={cn("grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]", dashboardStyles.analyticsSection)}>
                    <CompletionDonut
                      completed={workItemStats.completed}
                      working={workItemStats.working}
                      review={workItemStats.review}
                      overdue={workItemStats.overdue}
                      planned={workItemStats.planned}
                      total={workItemStats.total}
                      progress={workItemStats.progress}
                    />
                    <WeeklyLineChart points={model.trendPoints} />
                  </div>

                  <DepartmentPerformanceCard departments={snapshot.departments} />

                  <div className={cn("grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]", dashboardStyles.summaryGrid)}>
                    <Card className={cn(dashboardStyles.softPanel, dashboardStyles.quickStatsCard)}>
                      <CardTitle className={dashboardStyles.quickStatsTitle}>Хурдан статистик</CardTitle>
                      <div className={dashboardStyles.quickStatsGrid}>
                        {[
                          ["Өнөөдрийн ажил", snapshot.liveTasks.length, percent(snapshot.liveTasks.length, totalTasks)],
                          ["Энэ 7 хоног", model.trendPoints.reduce((sum, point) => sum + point.completion, 0), 0],
                          ["Энэ сар", completedTasks, percent(completedTasks, totalTasks)],
                        ].map(([label, value, rate]) => (
                          <div key={String(label)} className={dashboardStyles.quickStatItem}>
                            <CalendarDays className={dashboardStyles.quickStatIcon} />
                            <span className={dashboardStyles.quickStatLabel}>{label}</span>
                            <strong className={dashboardStyles.quickStatValue}>{value}</strong>
                            <small className={dashboardStyles.quickStatRate}>↑ {rate}%</small>
                          </div>
                        ))}
                      </div>
                    </Card>

                    {showFleetSummary ? (
                      <Card className={cn(dashboardStyles.softPanel, dashboardStyles.fleetSummaryCard)}>
                        <CardTitle className={dashboardStyles.fleetSummaryTitle}>Техник, тоног төхөөрөмж</CardTitle>
                        <div className={dashboardStyles.fleetSummaryBody}>
                          <Truck className={dashboardStyles.fleetSummaryIcon} />
                          <div>
                            <strong className={dashboardStyles.fleetSummaryValue}>{fleetBoard.totalVehicles}</strong>
                            <span className={dashboardStyles.fleetSummaryLabel}>Нийт техник</span>
                          </div>
                        </div>
                        <Link
                          href="/auto-base"
                          className={dashboardStyles.fleetSummaryLink}
                        >
                          Авто бааз
                          <ChevronRight />
                        </Link>
                      </Card>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            <RightPanel
              totalTasks={totalTasks}
              completedTasks={completedTasks}
              workingTasks={workingTasks}
              fleetBoard={fleetBoard}
              alertCount={attentionCount}
              canWriteReports={canWriteReports}
              hrAttendanceSummary={hrAttendanceSummary}
              departmentScopeName={departmentScopeName}
              showFleetSummary={showFleetSummary}
              showHrSummary={showHrSummary}
              showWeatherSummary={showWeatherSummary}
              showExecutiveSloganPanel={showProcurementHomePanels}
              workerMode={workerMode}
              weather={weather}
            />
          </div>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 pb-2 text-xs font-semibold text-[#7A897E]">
            <span>© 2026 Хот тохижилт үйлчилгээний төв ОНӨААТҮГ. Бүх эрх хуулиар хамгаалагдсан.</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
