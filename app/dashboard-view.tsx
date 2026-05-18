import type { CSSProperties, ReactNode } from "react";

import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  CloudRain,
  CloudSnow,
  CloudSun,
  HeartPulse,
  Leaf,
  ListChecks,
  Plus,
  Recycle,
  ShieldCheck,
  Sun,
  Truck,
  UserCheck,
  UsersRound,
  Wind,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
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
import { type FieldAssignment } from "@/lib/field-ops";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";
import {
  type DashboardSnapshot,
  type FleetVehicleBoard,
  type HrDailyAttendanceSummary,
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
  showProcurementHomePanels?: boolean;
  procurementActionPanel?: ReactNode;
};

const DASHBOARD_IMAGES = {
  header: "/illustrations/green-city-hero.svg",
  operationsHero: "/illustrations/municipal-ops-hero.png",
  fleetTruck: "/illustrations/department-fleet-premium.webp",
  cleaningTruck: "/illustrations/department-street-cleaning-premium.webp",
  landscapingWorker: "/illustrations/department-landscaping-premium.webp",
  maintenanceWorker: "/illustrations/department-maintenance-premium.webp",
  overview: "/illustrations/green-park-banner.svg",
  seedling: "/illustrations/seedling-card.svg",
  landscape: "/illustrations/green-landscape-card.svg",
};

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
    timeZone: "Asia/Ulaanbaatar",
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

function isDepartmentHeadDashboard(session: AppSession) {
  const flags = session.groupFlags;

  return Boolean(
    session.role === "project_manager" ||
      flags?.municipalDepartmentHead ||
      flags?.municipalManager ||
      flags?.mfoManager ||
      flags?.environmentManager ||
      flags?.improvementManager ||
      flags?.fleetRepairManager,
  );
}

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

function dashboardTaskBucket(
  task: DashboardSnapshot["taskDirectory"][number],
  currentDateKey: string,
): "done" | "working" | "review" | "overdue" | "planned" {
  if (task.statusKey === "verified" || task.progress >= 100) {
    return "done";
  }
  if (task.statusKey === "review") {
    return "review";
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
  if (project.stageBucket === "progress" || project.stageBucket === "done" || project.completion >= 100) {
    return "good";
  }
  return "muted";
}

function projectDisplayStageLabel(project: DashboardSnapshot["projects"][number]) {
  const stageLabel = fixMojibakeText(project.stageLabel || "");
  if (stageLabel && stageLabel !== "Тодорхойгүй") {
    return stageLabel;
  }

  if (project.stageBucket === "done" || project.completion >= 100) {
    return "Дууссан";
  }
  if (project.stageBucket === "progress" || project.completion > 0) {
    return "Гүйцэтгэж байгаа";
  }
  if (project.stageBucket === "review") {
    return "Хянаж байгаа";
  }
  return "Төлөвлөгдсөн";
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

type ProjectStatusFilterKey = "progress" | "pending" | "done" | "planned";

function projectMatchesStatusFilter(
  project: DashboardSnapshot["projects"][number],
  filter: ProjectStatusFilterKey,
) {
  if (filter === "progress") {
    return project.stageBucket === "progress";
  }
  if (filter === "pending") {
    return project.stageBucket === "review" || project.stageBucket === "todo";
  }
  if (filter === "done") {
    return project.stageBucket === "done" || project.completion >= 100;
  }

  return (
    project.stageBucket !== "progress" &&
    project.stageBucket !== "review" &&
    project.stageBucket !== "done" &&
    project.completion < 100
  );
}

function projectStatusFilterChips(projects: DashboardSnapshot["projects"]) {
  const active = projects.filter((project) => project.stageBucket === "progress").length;
  const pending = projects.filter((project) => project.stageBucket === "review" || project.stageBucket === "todo").length;
  const done = projects.filter((project) => project.stageBucket === "done" || project.completion >= 100).length;
  const planned = projects.filter(
    (project) =>
      project.stageBucket !== "progress" &&
      project.stageBucket !== "review" &&
      project.stageBucket !== "done" &&
      project.completion < 100,
  ).length;

  return [
    { key: "planned" as const, label: "Төлөвлөгдсөн", count: planned, tone: "muted" },
    { key: "progress" as const, label: "Гүйцэтгэж байгаа", count: active, tone: "green" },
    { key: "pending" as const, label: "Хүлээгдэж буй", count: pending, tone: "amber" },
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
            tasks: DashboardSnapshot["taskDirectory"];
          }
        >
      >((groups, task) => {
        const project = projectByName.get(task.projectName);
        const existing = groups.get(task.projectName) ?? {
          name: task.projectName,
          departmentName: project?.departmentName ?? task.departmentName,
          manager: project?.manager ?? task.leaderName,
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

function DepartmentOverview({
  snapshot,
  departmentScopeName,
}: {
  snapshot: DashboardSnapshot;
  departmentScopeName?: string | null;
}) {
  const autoDepartment =
    (departmentScopeName
      ? snapshot.departments.find((department) => department.name === departmentScopeName)
      : null) ??
    snapshot.departments.find((department) => department.name.includes("Авто")) ??
    snapshot.departments[0];
  const departmentName =
    departmentScopeName ?? autoDepartment?.name ?? "Авто бааз, хог тээвэрлэлтийн хэлтэс";
  const fixedDepartmentName = fixMojibakeText(departmentName);

  return (
    <Card className={cn(dashboardStyles.softPanel, dashboardStyles.departmentCard)}>
      <div
        className={dashboardStyles.departmentHero}
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(246,251,246,.96) 0%, rgba(246,251,246,.78) 44%, rgba(246,251,246,.24) 100%), linear-gradient(180deg, rgba(246,251,246,.18), rgba(46,125,50,.06)), url(${DASHBOARD_IMAGES.overview})`,
        }}
      >
        <Badge className={dashboardStyles.departmentBadge}>Хэлтэс</Badge>
        <h2 className={dashboardStyles.departmentTitle}>
          {fixedDepartmentName}
        </h2>
        <p className={dashboardStyles.departmentDescription}>
          Цэвэр цэмцгэр, ногоон орчны ажлыг нэг дор харуулна.
        </p>
      </div>
    </Card>
  );
}

function WorkerWorkCard({ work }: { work: WorkerWorkSummary }) {
  const badgeTone =
    work.tone === "urgent" ? "red" : work.tone === "attention" ? "amber" : work.tone === "good" ? "green" : "slate";
  const workName = fixMojibakeText(work.name);
  const departmentName = fixMojibakeText(work.departmentName);
  const managerName = fixMojibakeText(work.manager || "Бүртгэлгүй");

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
          <h3 className={dashboardStyles.projectListTitle}>{workName}</h3>
          <p className={dashboardStyles.projectListMeta}>
            Алба нэгж: {departmentName} · Менежер: {managerName}
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
          <h3 className={dashboardStyles.projectListTitle}>{projectName}</h3>
          <p className={dashboardStyles.projectListMeta}>
            Алба нэгж: {departmentName} · Менежер: {managerName}
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
    { label: "Төлөвлөгдсөн", value: planned, color: "#9AA7B4" },
    { label: "Гүйцэтгэж байгаа", value: working, color: "#2F8A96" },
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
      { value: working, color: "#2F8A96" },
      { value: review, color: "#F4B000" },
      { value: overdue, color: "#EF4444" },
      { value: planned, color: "#9AA7B4" },
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
    { label: "Шинэ ажил үүсгэх", href: "/create", icon: Plus },
    { label: "Ажлын жагсаалт", href: "/projects", icon: ListChecks },
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
        <span><i className="bg-[#9AA3A9]" />Төлөвлөгдсөн</span>
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
        ["Идэвхтэй ажил", workingTasks],
        ["Дууссан ажил", completedTasks],
        ["Анхаарах", alertCount],
      ]
    : [
        ["Хэрэглэгч", 128],
        ["Нийт ажил", totalTasks],
        ["Идэвхтэй ажил", workingTasks],
        ["Дууссан ажил", completedTasks],
        ["Анхаарах", alertCount],
      ];
  const visibleSystemInfoRows = showHrSummary
    ? systemInfoRows
    : systemInfoRows.filter((_, index) => index !== 0);
  const quickActions = [
    { label: "Шинэ ажил үүсгэх", href: "/create", icon: Plus },
    { label: "Ажлын жагсаалт", href: "/projects", icon: ListChecks },
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

      <Card className={cn(dashboardStyles.softPanel, dashboardStyles.landscapeCard)}>
        <div
          className={dashboardStyles.landscapePanel}
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(27,73,38,.1), rgba(17,42,26,.72)), url(${DASHBOARD_IMAGES.landscape})`,
          }}
        >
          <Recycle className={dashboardStyles.landscapeIcon} />
          <h3 className={dashboardStyles.landscapeTitle}>Ногоон хот - ирээдүйн үнэ цэнэ</h3>
        </div>
      </Card>

      {showFleetSummary ? (
        <Card className={cn(dashboardStyles.softPanel, dashboardStyles.sideCard)}>
          <CardTitle className={dashboardStyles.sideCardTitle}>Техник</CardTitle>
          <div className={cn(dashboardStyles.sideMiniGrid, dashboardStyles.sideMiniGridTwo)}>
            <div className={dashboardStyles.sideMiniItem}>
              <span className={cn(dashboardStyles.sideMiniIcon, "bg-[#E7F5E7] text-[#2E7D32]")}>
                <Truck />
              </span>
              <strong className={dashboardStyles.sideMiniValue}>{fleetBoard.totalVehicles}</strong>
              <span className={dashboardStyles.sideMiniLabel}>Нийт</span>
            </div>
            <div className={dashboardStyles.sideMiniItem}>
              <span className={cn(dashboardStyles.sideMiniIcon, "bg-[#E7F5E7] text-[#2E7D32]")}>
                <Wind />
              </span>
              <strong className={dashboardStyles.sideMiniValue}>{fleetBoard.activeCount}</strong>
              <span className={dashboardStyles.sideMiniLabel}>Ажиллаж буй</span>
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
        {metric.progress > 0 && metric.progress < 100 ? (
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
          <span>Нийт ажил</span>
          <strong>{department.total}</strong>
        </div>
        <div>
          <span>Ажиллаж буй</span>
          <strong>{department.working}</strong>
        </div>
        <div>
          <span>Хянах ажил</span>
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
          Өнөөдрийн ажил
          <strong>{department.working} / {department.total}</strong>
        </span>
        <em>{department.risky} анхаарах</em>
      </div>
      <span className={cn(dashboardStyles.executiveCardAction, dashboardStyles.executiveDepartmentAction)}>
        Дэлгэрэнгүй
        <ChevronRight aria-hidden />
      </span>
    </Link>
  );
}

function buildExecutiveDepartmentMetrics({
  snapshot,
  tasks,
  currentDateKey,
}: {
  snapshot: DashboardSnapshot;
  tasks: DashboardSnapshot["taskDirectory"];
  currentDateKey: string;
}): ExecutiveDepartmentMetric[] {
  const matchedDepartment = (keywords: string[]) =>
    snapshot.departments.find((department) =>
      keywords.some((keyword) => department.name.includes(keyword) || department.label.includes(keyword)),
    );
  const matchedTasks = (keywords: string[]) =>
    tasks.filter((task) =>
      keywords.some((keyword) =>
        task.departmentName.includes(keyword) ||
        task.operationTypeLabel.includes(keyword) ||
        task.projectName.includes(keyword) ||
        task.name.includes(keyword),
      ),
    );
  const departmentProgress = (keywords: string[], departmentTasks: DashboardSnapshot["taskDirectory"]) => {
    const matchedDepartment = snapshot.departments.find((department) =>
      keywords.some((keyword) => department.name.includes(keyword) || department.label.includes(keyword)),
    );
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
  ) => {
    const departmentTasks = matchedTasks(keywords);
    const department = matchedDepartment(keywords);
    const total = departmentTasks.length || department?.openTasks || 0;
    const working = departmentTasks.filter((task) => task.statusKey === "working").length;
    const review = departmentTasks.filter((task) => task.statusKey === "review").length;
    const risky = departmentTasks.filter((task) => task.issueFlag || isOverdue(task, currentDateKey)).length;

    return {
      name,
      progress: departmentProgress(keywords, departmentTasks),
      total,
      working,
      review: review || department?.reviewTasks || 0,
      risky,
      href: `/projects?department=${encodeURIComponent(department?.name || name)}&category=progress`,
      icon,
      tone,
      image,
      imagePosition,
    };
  };

  return [
    buildDepartment(
      "Авто бааз, хог тээвэрлэлт",
      ["Авто", "Хог", "хог", "тээвэр"],
      Truck,
      "blue",
      DASHBOARD_IMAGES.fleetTruck,
      "center",
    ),
    buildDepartment(
      "Зам талбай цэвэрлэгээ",
      ["Зам", "талбай", "Гудамж", "цэвэр"],
      Recycle,
      "orange",
      DASHBOARD_IMAGES.cleaningTruck,
      "center",
    ),
    buildDepartment(
      "Ногоон байгууламж",
      ["Ногоон", "мод", "зүлэг", "ургамал", "усалгаа", "цэцэрлэг"],
      Leaf,
      "green",
      DASHBOARD_IMAGES.landscapingWorker,
      "center",
    ),
    buildDepartment(
      "Тохижилт үйлчилгээ",
      ["Тохижилт", "үйлчилгээ"],
      Wrench,
      "teal",
      DASHBOARD_IMAGES.maintenanceWorker,
      "center",
    ),
  ];
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
          <h2>{normalDay ? "Өнөөдрийн үйл ажиллагаа хэвийн" : "Өнөөдрийн үйл ажиллагаанд анхаарах зүйл байна"}</h2>
          <p>Хотын өнгө үзэмж, цэвэр цэмцгэр байдал, ногоон байгууламж, хог тээвэрлэлтийн явцыг нэг дор хянаж байна.</p>
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
}) {
  const canViewAllReports = canViewAllWorkspaceReports(session);
  const overallProgress = workItemStats.progress || percent(completedTasks, totalTasks);
  const fleetUsage = percent(fleetBoard.activeCount, fleetBoard.totalVehicles);
  const overdueRate = percent(overdueTasks, totalTasks);
  const activeTasks = Math.max(totalTasks - completedTasks, workingTasks + reviewTasks);
  const metrics: ExecutiveMetric[] = [
    {
      label: "нийт гүйцэтгэл",
      value: `${overallProgress}%`,
      progress: overallProgress,
      href: showDepartmentPerformance ? "#department-performance" : "/projects",
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
      href: canViewHr ? "/hr/employees" : "/hr",
      icon: UsersRound,
      tone: "green",
    },
    {
      label: "техникийн ашиглалт",
      value: `${fleetUsage}%`,
      progress: fleetUsage,
      href: "/auto-base",
      icon: Truck,
      tone: "purple",
    },
    {
      label: "хугацаа хэтэрсэн ажил",
      value: `${overdueRate}%`,
      progress: overdueRate,
      href: "/projects?category=overdue",
      icon: Clock3,
      tone: "orange",
    },
    {
      label: "идэвхтэй ажил",
      value: String(activeTasks),
      progress: 100,
      href: "/projects?category=progress",
      icon: ClipboardList,
      tone: "green",
    },
  ];
  const departmentMetrics = buildExecutiveDepartmentMetrics({
    snapshot,
    tasks: dashboardTasks,
    currentDateKey,
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
  showProcurementHomePanels = false,
  procurementActionPanel,
}: DashboardViewProps) {
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewAllReports = canViewAllWorkspaceReports(session);
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
  const dashboardProjects = snapshot.projects.filter(hasDashboardWork);
  const workItemStats = dashboardTaskStats(dashboardTasks, currentDateKey);
  const totalTasks = workerMode
    ? dashboardTasks.length
    : dashboardProjects.length || snapshot.totalTasks || 0;
  const completedTasks = workerMode
    ? dashboardTasks.filter((task) => task.statusKey === "verified").length
    : dashboardProjects.filter((project) => project.stageBucket === "done" || project.completion >= 100).length;
  const workingTasks = workerMode
    ? dashboardTasks.filter((task) => task.statusKey === "working").length
    : dashboardProjects.filter((project) => project.stageBucket === "progress").length;
  const reviewTasks = workerMode
    ? dashboardTasks.filter((task) => task.statusKey === "review").length
    : dashboardProjects.filter((project) => project.stageBucket === "review").length;
  const overdueTasks = workerMode
    ? dashboardTasks.filter((task) => isOverdue(task, currentDateKey)).length
    : 0;
  const newIncomingTasks = dashboardTasks.filter((task) => isNewIncomingTask(task, currentDateKey)).length;
  const computedAttentionCount = countNotificationTasks(dashboardTasks, currentDateKey);
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

  const executiveDashboardMode = canViewGeneralDashboard && !workerMode;
  const departmentHeadDashboardMode =
    !executiveDashboardMode &&
    !workerMode &&
    !transportInspectorMode &&
    isDepartmentHeadDashboard(session);

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
            title={`Сайн байна уу, ${session.name}`}
            subtitle={scopeLabel}
            userName={session.name}
            roleLabel={roleLabel}
            notificationCount={attentionCount}
            notificationNote={effectiveNotificationNote}
            backgroundImage={DASHBOARD_IMAGES.header}
          />

          {showProcurementHomePanels ? (
            <ExecutiveHeroBanner alertCount={attentionCount} weather={weather} />
          ) : null}

          <div className={cn("relative z-20 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]", dashboardStyles.dashboardMainGrid)}>
            <div className={cn("grid min-w-0 gap-4", dashboardStyles.dashboardPrimaryColumn)}>
              {fleetLoadError ? (
                <Card className="border-amber-200 bg-amber-50/85 p-4 text-sm font-semibold text-amber-800">
                  {fleetLoadError}
                </Card>
              ) : null}

              <div className={dashboardStyles.departmentPanel}>
                <DepartmentOverview
                  snapshot={snapshot}
                  departmentScopeName={departmentScopeName}
                />
              </div>

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

              <Card className={dashboardStyles.taskListCard}>
                <CardHeader className={dashboardStyles.taskListHeader}>
                  <div className={dashboardStyles.taskListHeaderText}>
                    <CardTitle>{masterMode ? "Алба нэгжийн бүх ажил" : "Ажлын жагсаалт"}</CardTitle>
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
                            section.key === "progress" && dashboardStyles.taskListFilterPanelProgress,
                            section.key === "pending" && dashboardStyles.taskListFilterPanelPending,
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
