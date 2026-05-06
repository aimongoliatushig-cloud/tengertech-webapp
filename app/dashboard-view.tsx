import type { CSSProperties } from "react";

import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
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
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import dashboardStyles from "@/app/dashboard-view.module.css";
import shellStyles from "@/app/workspace.module.css";
import { getRoleLabel, hasCapability, isWorkerOnly, type AppSession } from "@/lib/auth";
import { buildDashboardModel, type StatusTone } from "@/lib/dashboard-model";
import { type FieldAssignment } from "@/lib/field-ops";
import {
  type DashboardSnapshot,
  type FleetVehicleBoard,
  type HrDailyAttendanceSummary,
} from "@/lib/odoo";
import { cn } from "@/lib/utils";
import { type WeatherSnapshot } from "@/lib/weather";

type DashboardViewProps = {
  session: AppSession;
  snapshot: DashboardSnapshot;
  todayAssignments: FieldAssignment[];
  fleetBoard: FleetVehicleBoard;
  fleetLoadError?: string;
  hrAttendanceSummary: HrDailyAttendanceSummary;
  departmentScopeName?: string | null;
  weather: WeatherSnapshot;
  canViewHr?: boolean;
};

type DashboardStat = {
  label: string;
  value: string;
  helper: string;
  progress: number;
  href: string;
  icon: LucideIcon;
  tone: StatusTone;
  short: string;
};

const DASHBOARD_IMAGES = {
  header: "/illustrations/green-city-hero.svg",
  overview: "/illustrations/green-park-banner.svg",
  seedling: "/illustrations/seedling-card.svg",
  landscape: "/illustrations/green-landscape-card.svg",
};

const STAT_TONE: Record<StatusTone, string> = {
  good: "bg-emerald-50 text-[#2E7D32]",
  attention: "bg-amber-50 text-amber-700",
  urgent: "bg-red-50 text-red-600",
  muted: "bg-slate-100 text-slate-600",
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
  if (project.stageLabel && project.stageLabel !== "Тодорхойгүй") {
    return project.stageLabel;
  }

  if (project.stageBucket === "done" || project.completion >= 100) {
    return "Дууссан";
  }
  if (project.stageBucket === "progress" || project.completion > 0) {
    return "Явагдаж буй";
  }
  if (project.stageBucket === "review") {
    return "Хянаж байгаа";
  }
  return "Төлөвлөгдсөн";
}

function projectListIcon(project: DashboardSnapshot["projects"][number]): LucideIcon {
  const text = `${project.name} ${project.departmentName} ${project.operationTypeLabel ?? ""}`.toLowerCase();

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
    { key: "progress" as const, label: "Явагдаж буй", count: active, tone: "green" },
    { key: "pending" as const, label: "Хүлээгдэж буй", count: pending, tone: "amber" },
    { key: "done" as const, label: "Дууссан", count: done, tone: "green" },
    { key: "planned" as const, label: "Төлөвлөгдсөн", count: planned, tone: "muted" },
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

function StatCard({ metric }: { metric: DashboardStat }) {
  const Icon = metric.icon;

  return (
    <Link href={metric.href} className="group block">
      <Card className={dashboardStyles.statCard}>
        <div className={dashboardStyles.statCardTop}>
          <div className={dashboardStyles.statCardText}>
            <span className={dashboardStyles.statCardLabel}>
              {metric.label}
            </span>
            <strong className={dashboardStyles.statCardNumber}>
              {metric.value}
            </strong>
          </div>
          <span
            className={cn(
              dashboardStyles.statCardIcon,
              STAT_TONE[metric.tone],
            )}
          >
            <Icon />
          </span>
        </div>
        <div className={dashboardStyles.statCardBottom}>
          <div className={dashboardStyles.statCardHelper}>
            <strong
              className={cn(
                dashboardStyles.statCardPercent,
                metric.tone === "urgent" ? "text-red-600" : "text-[#2E7D32]",
              )}
            >
              {metric.progress}%
            </strong>
          </div>
          <div className={dashboardStyles.statCardProgress}>
            <span
              className={cn(
                dashboardStyles.statCardProgressFill,
                metric.tone === "urgent" ? "bg-red-500" : "bg-[#2E7D32]",
              )}
              style={{ width: `${metric.progress}%` }}
            />
          </div>
        </div>
      </Card>
    </Link>
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
  tasks,
  departmentScopeName,
}: {
  snapshot: DashboardSnapshot;
  tasks: DashboardSnapshot["taskDirectory"];
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
  const autoBaseCount = tasks.filter((task) => task.departmentName.includes("Авто бааз")).length;
  const wasteCount = tasks.filter(
    (task) => task.departmentName.includes("Хог") || task.departmentName.includes("хог"),
  ).length;
  const total = tasks.length || autoDepartment?.openTasks || 0;
  const isAutoWasteDepartment =
    departmentName.includes("Авто") || departmentName.includes("Хог") || departmentName.includes("хог");
  const departmentChips: Array<[string, number, boolean]> = isAutoWasteDepartment
    ? [
        ["Бүгд", total, true],
        ["Авто бааз", autoBaseCount, false],
        ["Хог тээвэрлэлт", wasteCount || total, false],
      ]
    : [["Бүгд", total, true]];

  return (
    <Card className={cn(dashboardStyles.softPanel, dashboardStyles.departmentCard)}>
      <div
        className={dashboardStyles.departmentHero}
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(246,251,246,.96) 0%, rgba(246,251,246,.78) 44%, rgba(246,251,246,.24) 100%), linear-gradient(180deg, rgba(246,251,246,.18), rgba(46,125,50,.06)), url(${DASHBOARD_IMAGES.overview})`,
        }}
      >
        <Badge className={dashboardStyles.departmentBadge}>Доторх нэгж</Badge>
        <h2 className={dashboardStyles.departmentTitle}>
          {departmentName}
        </h2>
        <p className={dashboardStyles.departmentDescription}>
          Энэ хэлтэс доторх ажлыг нэгжээр харуулна.
        </p>
        <div className={dashboardStyles.departmentChips}>
          {departmentChips.map(([label, value, active]) => (
            <span
              key={String(label)}
              className={cn(
                dashboardStyles.departmentChip,
                active
                  ? "bg-[#2E7D32] text-white"
                  : "border border-[#DCEFDA] bg-white/86 text-[#1B1B1B]",
              )}
            >
              {label}
              <small
                className={cn(
                  dashboardStyles.departmentChipCount,
                  active ? "bg-white/24 text-white" : "bg-[#E8F4E8] text-[#2E7D32]",
                )}
              >
                {value}
              </small>
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function WorkerWorkCard({ work }: { work: WorkerWorkSummary }) {
  const badgeTone =
    work.tone === "urgent" ? "red" : work.tone === "attention" ? "amber" : work.tone === "good" ? "green" : "slate";

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
          <h3 className={dashboardStyles.projectListTitle}>{work.name}</h3>
          <p className={dashboardStyles.projectListMeta}>
            Алба нэгж: {work.departmentName} · Менежер: {work.manager || "Бүртгэлгүй"}
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
          <h3 className={dashboardStyles.projectListTitle}>{project.name}</h3>
          <p className={dashboardStyles.projectListMeta}>
            Алба нэгж: {project.departmentName} · Менежер: {project.manager || "Бүртгэлгүй"}
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
          const Icon = departmentIcon(department.name);
          const value = clampPercent(department.completion);

          return (
            <div key={department.name} className={dashboardStyles.departmentPerformanceRow}>
              <span className={dashboardStyles.departmentPerformanceIcon}>
                <Icon />
              </span>
              <span className={dashboardStyles.departmentPerformanceName}>{department.label || department.name}</span>
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

          {showHrSummary ? <HrAttendanceCard summary={hrAttendanceSummary} /> : null}
        </>
      ) : null}

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

export function DashboardView({
  session,
  snapshot,
  todayAssignments,
  fleetBoard,
  fleetLoadError = "",
  hrAttendanceSummary,
  departmentScopeName = null,
  weather,
  canViewHr = false,
}: DashboardViewProps) {
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const workerMode = isWorkerOnly(session);
  const showHrSummary = Boolean(canViewHr && !workerMode);
  const roleLabel = getRoleLabel(session.role);
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
  const plannedTasks = workerMode
    ? dashboardTasks.filter((task) => task.statusKey === "planned").length
    : dashboardProjects.filter((project) => project.stageBucket === "todo" || project.stageBucket === "unknown").length;
  const overdueTasks = workerMode
    ? dashboardTasks.filter((task) => isOverdue(task, currentDateKey)).length
    : 0;
  const newIncomingTasks = dashboardTasks.filter((task) => isNewIncomingTask(task, currentDateKey)).length;
  const attentionCount = countNotificationTasks(dashboardTasks, currentDateKey);
  const notificationNote =
    attentionCount > 0
      ? `${newIncomingTasks} шинэ ажил, ${reviewTasks} хянах, ${overdueTasks} хугацаа хэтэрсэн`
      : "Шинэ ажил, хянах зүйл алга";
  const sortedProjects = [...dashboardProjects].sort((left, right) => {
    const leftTone = projectTone(left);
    const rightTone = projectTone(right);
    const score = { urgent: 4, attention: 3, good: 2, muted: 1 };
    return score[rightTone] - score[leftTone] || right.completion - left.completion;
  });
  const workerWorkSummaries = workerMode
    ? buildWorkerWorkSummaries(dashboardTasks, snapshot.projects, currentDateKey)
    : [];
  const visibleWorkerWorks = workerWorkSummaries.slice(0, 4);
  const visibleProjects = sortedProjects.slice(0, 3);
  const visibleWorkItems = workerMode ? visibleWorkerWorks.length : visibleProjects.length;
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

  const statCards: DashboardStat[] = [
    {
      label: "Нийт ажил",
      value: String(totalTasks),
      helper: "Энэ нэгж дээр бүртгэсэн",
      progress: 100,
      href: "/projects",
      icon: ClipboardList,
      tone: "good",
      short: "A",
    },
    {
      label: "Төлөвлөсөн",
      value: String(plannedTasks),
      helper: "Эхлээгүй эсвэл хүлээгдэж буй",
      progress: percent(plannedTasks, totalTasks),
      href: workerMode ? "/tasks?filter=planned" : "/projects",
      icon: CalendarDays,
      tone: "good",
      short: "T",
    },
    {
      label: "Гүйцэтгэж байгаа",
      value: String(workingTasks),
      helper: "Яг одоо явагдаж буй",
      progress: percent(workingTasks, totalTasks),
      href: workerMode ? "/tasks?filter=working" : "/projects",
      icon: Clock3,
      tone: "good",
      short: "G",
    },
    {
      label: "Хянаж байгаа",
      value: String(reviewTasks),
      helper: "Баталгаажуулалт хүлээж буй",
      progress: percent(reviewTasks, totalTasks),
      href: workerMode ? "/review" : "/projects",
      icon: ShieldCheck,
      tone: "attention",
      short: "H",
    },
    {
      label: "Хугацаа хэтэрсэн",
      value: String(overdueTasks),
      helper: workerMode ? "Хугацаа өнгөрсөн даалгавар" : "Хугацаа өнгөрсөн ажил",
      progress: percent(overdueTasks, totalTasks),
      href: workerMode ? "/tasks?filter=overdue" : "/projects",
      icon: AlertTriangle,
      tone: overdueTasks ? "urgent" : "muted",
      short: "!",
    },
    {
      label: "Дууссан",
      value: String(completedTasks),
      helper: "Бүрэн дууссан ажил",
      progress: percent(completedTasks, totalTasks),
      href: workerMode ? "/reports" : "/projects",
      icon: CheckCircle2,
      tone: "good",
      short: "D",
    },
  ];

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
            canViewHr={canViewHr}
            userName={session.name}
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
            notificationNote={notificationNote}
            backgroundImage={DASHBOARD_IMAGES.header}
          />

          <div className="relative z-20 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid min-w-0 gap-4">
              {!workerMode ? (
                <section className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6", dashboardStyles.statGrid)}>
                  {statCards.map((metric) => (
                    <StatCard key={metric.label} metric={metric} />
                  ))}
                </section>
              ) : null}

              {!workerMode ? <MobilePriorityPanel canWriteReports={canWriteReports} /> : null}

              {fleetLoadError ? (
                <Card className="border-amber-200 bg-amber-50/85 p-4 text-sm font-semibold text-amber-800">
                  {fleetLoadError}
                </Card>
              ) : null}

              <div className={dashboardStyles.departmentPanel}>
                <DepartmentOverview
                  snapshot={snapshot}
                  tasks={dashboardTasks}
                  departmentScopeName={departmentScopeName}
                />
              </div>

              <Card className={dashboardStyles.taskListCard}>
                <CardHeader className={dashboardStyles.taskListHeader}>
                  <div className={dashboardStyles.taskListHeaderText}>
                    <CardTitle>Ажлын жагсаалт</CardTitle>
                  </div>
                </CardHeader>

                {workerMode ? (
                  <div className={taskGridClassName}>
                    {visibleWorkerWorks.map((work) => (
                      <WorkerWorkCard key={work.name} work={work} />
                    ))}
                    {!visibleWorkItems ? (
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
                        {!visibleProjects.length ? (
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
              workerMode={workerMode}
              weather={weather}
            />
          </div>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 pb-2 text-xs font-semibold text-[#7A897E]">
            <span>© 2026 Хот тохижилт үйлчилгээний төв ОНӨААТҮГ. Бүх эрх хуулиар хамгаалагдсан.</span>
            <span>ERP System v2.0.0</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
