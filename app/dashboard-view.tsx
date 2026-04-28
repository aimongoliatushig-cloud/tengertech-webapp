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
  UserX,
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
  type TaskStatusKey,
} from "@/lib/odoo";
import { cn } from "@/lib/utils";

type DashboardViewProps = {
  session: AppSession;
  snapshot: DashboardSnapshot;
  todayAssignments: FieldAssignment[];
  fleetBoard: FleetVehicleBoard;
  fleetLoadError?: string;
  hrAttendanceSummary: HrDailyAttendanceSummary;
  departmentScopeName?: string | null;
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

const STATUS_LABELS: Record<TaskStatusKey, string> = {
  planned: "Төлөвлөсөн",
  working: "Гүйцэтгэж байгаа",
  review: "Хянаж байгаа",
  verified: "Дууссан",
  problem: "Асуудалтай",
};

const STATUS_DOT: Record<StatusTone, string> = {
  good: "bg-[#2E7D32]",
  attention: "bg-[#F4B000]",
  urgent: "bg-[#EF4444]",
  muted: "bg-slate-400",
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

function ringStyle(value: number, color = "#2E7D32"): CSSProperties {
  const normalized = clampPercent(value);

  return {
    background: `conic-gradient(${color} ${normalized * 3.6}deg, rgba(165,214,167,.32) 0deg)`,
  };
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
            <span>{metric.helper}</span>
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
}: {
  snapshot: DashboardSnapshot;
  tasks: DashboardSnapshot["taskDirectory"];
}) {
  const autoDepartment =
    snapshot.departments.find((department) => department.name.includes("Авто")) ??
    snapshot.departments[0];
  const departmentName = autoDepartment?.name ?? "Авто бааз, хог тээвэрлэлтийн хэлтэс";
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

function TaskCard({
  task,
  currentDateKey,
}: {
  task: DashboardSnapshot["taskDirectory"][number];
  currentDateKey: string;
}) {
  const tone = statusTone(task, currentDateKey);

  return (
    <Link href={task.href} className="group block">
      <Card className="grid min-h-[156px] gap-3 p-3.5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(27,73,38,0.11)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-[0.72rem] font-extrabold text-[#5E6E64]">
              <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[tone])} />
              <span>{task.statusLabel || STATUS_LABELS[task.statusKey]}</span>
            </div>
            <h3 className="text-base font-extrabold leading-snug tracking-normal text-[#111B15]">
              {task.name}
            </h3>
            <p className="mt-1 text-xs font-semibold leading-4 text-[#6B7280]">
              Алба нэгж: {task.departmentName} · Менежер: {task.leaderName || "Бүртгэлгүй"}
            </p>
          </div>
          <Badge tone={tone === "urgent" ? "red" : tone === "attention" ? "amber" : "green"}>
            {tone === "muted" ? "Төлөвлөсөн" : task.statusLabel || STATUS_LABELS[task.statusKey]}
          </Badge>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--ds-radius-card)] bg-[#F2F8F2] p-2.5">
              <span className="block text-xs font-semibold text-[#7A897E]">Нээлттэй ажил</span>
              <strong className="mt-1.5 block text-xl tracking-normal text-[#111B15]">
                {task.plannedQuantity || 0}
              </strong>
            </div>
            <div className="rounded-[var(--ds-radius-card)] bg-[#F2F8F2] p-2.5">
              <span className="block text-xs font-semibold text-[#7A897E]">Гүйцэтгэл</span>
              <strong className="mt-1.5 block text-xl tracking-normal text-[#111B15]">
                {clampPercent(task.progress)}%
              </strong>
            </div>
          </div>
          <ProgressRing value={task.progress} />
        </div>

        <div className="grid gap-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-[#E6ECE7]">
            <span
              className="block h-full rounded-full bg-[#2E7D32]"
              style={{ width: `${clampPercent(task.progress)}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[0.72rem] font-semibold text-[#7A897E]">
            <span>Эхлэх: {task.scheduledDate || "-"}</span>
            <span>Дуусах: {task.deadline || "-"}</span>
          </div>
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
  total,
}: {
  completed: number;
  working: number;
  review: number;
  overdue: number;
  total: number;
}) {
  const completedShare = percent(completed, total);
  const unclassified = Math.max(
    0,
    total - completed - working - review - overdue,
  );
  const performanceRows = [
    { label: "Дууссан", value: completed, tone: "good" as StatusTone },
    { label: "Явагдаж буй", value: working, tone: "good" as StatusTone },
    { label: "Хүлээгдэж буй", value: review, tone: "attention" as StatusTone },
    { label: "Хугацаа хэтэрсэн", value: overdue, tone: "urgent" as StatusTone },
    ...(unclassified
      ? [{ label: "Төлөвлөгдсөн", value: unclassified, tone: "muted" as StatusTone }]
      : []),
  ];

  return (
    <Card className={cn("p-4", dashboardStyles.softPanel, dashboardStyles.metricsCard)}>
      <div className={dashboardStyles.analyticsCardHeader}>
        <div>
          <CardTitle className="text-[1.125rem] font-semibold">Ажил гүйцэтгэлийн харагдац</CardTitle>
          <p className={dashboardStyles.metricsSummary}>Нийт ажлын гүйцэтгэл: {completedShare}%</p>
        </div>
      </div>

      <div className={dashboardStyles.performancePanel}>
        <ProgressRing value={completedShare} size="lg" />
        <div className={dashboardStyles.progressLegend}>
          {performanceRows.map(({ label, value, tone }) => {
            const rate = percent(Number(value), total);
            return (
              <div key={label} className={dashboardStyles.progressLegendRow}>
                <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_DOT[tone])} />
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
  const chartWidth = 180;
  const chartLeft = 10;
  const chartRight = 176;
  const chartTop = 12;
  const chartBottom = 86;
  const chartHeight = chartBottom - chartTop;
  const activityValues = values.map((point) =>
    Math.min(4, Math.round((clampPercent(point.completion) + clampPercent(point.overdue)) / 25)),
  );
  const toActivityPolyline = () =>
    activityValues
      .map((activity, index) => {
        const x = values.length === 1 ? chartLeft : chartLeft + (index / (values.length - 1)) * (chartRight - chartLeft);
        const y = chartBottom - activity * (chartHeight / 4);
        return `${x},${y}`;
      })
      .join(" ");
  const totalActivity = activityValues.reduce((sum, value) => sum + value, 0);
  const hasActivity = activityValues.some((value) => value > 0);
  const weekdayLabels = ["Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба", "Ням"];
  const gridLines = [
    { value: 4, y: chartTop },
    { value: 3, y: chartTop + chartHeight * 0.25 },
    { value: 2, y: chartTop + chartHeight * 0.5 },
    { value: 1, y: chartTop + chartHeight * 0.75 },
    { value: 0, y: chartBottom },
  ];

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
            points={toActivityPolyline()}
            fill="none"
            stroke="#2E7D32"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          {values.map((point, index) => {
            const x = values.length === 1 ? chartLeft : chartLeft + (index / (values.length - 1)) * (chartRight - chartLeft);
            const activityY = chartBottom - activityValues[index] * (chartHeight / 4);

            return (
              <g key={point.id}>
                <circle cx={x} cy={activityY} r="2.15" fill="#2E7D32" />
                <text x={x} y="97" textAnchor="middle" className="fill-[#526157] text-[4px] font-semibold">
                  {weekdayLabels[index]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Card>
  );
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
      label: "Тасалсан",
      value: summary.absentToday,
      icon: UserX,
      className: "bg-red-50 text-red-600",
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
        {summary.leaveToday ? <span className="basis-full text-[#2E7D32]">Чөлөөтэй {summary.leaveToday}</span> : null}
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
  const quickActions = [
    { label: "Шинэ ажил үүсгэх", href: "/create", icon: Plus },
    { label: "Ажлын жагсаалт", href: "/projects", icon: ListChecks },
    { label: "Тайлан харах", href: canWriteReports ? "/reports" : "/review", icon: BarChart3 },
    { label: "Календарь харах", href: "/tasks?view=today", icon: CalendarDays },
  ];

  return (
    <aside className={dashboardStyles.rightRail}>
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

      <Card className={cn(dashboardStyles.softPanel, dashboardStyles.sideCard)}>
        <CardTitle className={dashboardStyles.sideCardTitle}>{systemInfoTitle}</CardTitle>
        <div className={dashboardStyles.systemList}>
          {systemInfoRows.map(([label, value]) => (
            <div key={String(label)} className={dashboardStyles.systemRow}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </Card>

      <HrAttendanceCard summary={hrAttendanceSummary} />

      <Card className={cn(dashboardStyles.softPanel, dashboardStyles.sideCard)}>
        <CardTitle className={dashboardStyles.sideCardTitle}>Цаг агаар</CardTitle>
        <div className={dashboardStyles.weatherContent}>
          <Sun className={dashboardStyles.weatherIcon} />
          <div>
            <span className={dashboardStyles.weatherCity}>Улаанбаатар</span>
            <strong className={dashboardStyles.weatherTemp}>18°C</strong>
            <small className={dashboardStyles.weatherNote}>Бага үүлтэй</small>
          </div>
          <div className={dashboardStyles.weatherBadge}>
            Сайн
            <br />
            AQI 38
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
}: DashboardViewProps) {
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const workerMode = isWorkerOnly(session);
  const roleLabel = getRoleLabel(session.role);
  const currentDateKey = todayKey();
  const model = buildDashboardModel({
    session,
    snapshot,
    todayAssignments,
  });
  const scopeLabel = departmentScopeName ?? model.scopeLabel;
  const showFleetSummary =
    !departmentScopeName ||
    departmentScopeName.includes("Авто") ||
    departmentScopeName.includes("Хог") ||
    departmentScopeName.includes("хог");

  const scopedTasks = workerMode
    ? snapshot.taskDirectory.filter((task) => {
        const currentUserId = String(session.uid);
        return (task.assigneeIds ?? []).some(
          (assigneeId) => String(normalizeTaskAssigneeId(assigneeId)) === currentUserId,
        );
      })
    : snapshot.taskDirectory;
  const dashboardTasks = scopedTasks.length ? scopedTasks : snapshot.taskDirectory;
  const totalTasks = dashboardTasks.length || snapshot.totalTasks || 0;
  const completedTasks = dashboardTasks.filter((task) => task.statusKey === "verified").length;
  const workingTasks = dashboardTasks.filter((task) => task.statusKey === "working").length;
  const reviewTasks = dashboardTasks.filter((task) => task.statusKey === "review").length;
  const plannedTasks = dashboardTasks.filter((task) => task.statusKey === "planned").length;
  const overdueTasks = dashboardTasks.filter((task) => isOverdue(task, currentDateKey)).length;
  const newIncomingTasks = dashboardTasks.filter((task) => isNewIncomingTask(task, currentDateKey)).length;
  const attentionCount = countNotificationTasks(dashboardTasks, currentDateKey);
  const notificationNote =
    attentionCount > 0
      ? `${newIncomingTasks} шинэ ажил, ${reviewTasks} хянах, ${overdueTasks} хугацаа хэтэрсэн`
      : "Шинэ ажил, хянах зүйл алга";
  const sortedTasks = [...dashboardTasks].sort((left, right) => {
    const leftTone = statusTone(left, currentDateKey);
    const rightTone = statusTone(right, currentDateKey);
    const score = { urgent: 4, attention: 3, good: 2, muted: 1 };
    return score[rightTone] - score[leftTone] || right.progress - left.progress;
  });
  const visibleTasks = sortedTasks.slice(0, 4);
  const taskGridClassName = cn(
    dashboardStyles.taskListBody,
    visibleTasks.length > 1 && "xl:grid-cols-2",
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
      href: "/tasks?filter=planned",
      icon: CalendarDays,
      tone: "good",
      short: "T",
    },
    {
      label: "Гүйцэтгэж байгаа",
      value: String(workingTasks),
      helper: "Яг одоо явагдаж буй",
      progress: percent(workingTasks, totalTasks),
      href: "/tasks?filter=working",
      icon: Clock3,
      tone: "good",
      short: "G",
    },
    {
      label: "Хянаж байгаа",
      value: String(reviewTasks),
      helper: "Баталгаажуулалт хүлээж буй",
      progress: percent(reviewTasks, totalTasks),
      href: "/review",
      icon: ShieldCheck,
      tone: "attention",
      short: "H",
    },
    {
      label: "Хугацаа хэтэрсэн",
      value: String(overdueTasks),
      helper: "Хугацаа өнгөрсөн ажилбар",
      progress: percent(overdueTasks, totalTasks),
      href: "/tasks?filter=overdue",
      icon: AlertTriangle,
      tone: overdueTasks ? "urgent" : "muted",
      short: "!",
    },
    {
      label: "Дууссан",
      value: String(completedTasks),
      helper: "Бүрэн дууссан ажил",
      progress: percent(completedTasks, totalTasks),
      href: "/reports",
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
            userName={session.name}
            roleLabel={roleLabel}
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
              <section className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6", dashboardStyles.statGrid)}>
                {statCards.map((metric) => (
                  <StatCard key={metric.label} metric={metric} />
                ))}
              </section>

              <MobilePriorityPanel canWriteReports={canWriteReports} />

              {fleetLoadError ? (
                <Card className="border-amber-200 bg-amber-50/85 p-4 text-sm font-semibold text-amber-800">
                  {fleetLoadError}
                </Card>
              ) : null}

              <div className={dashboardStyles.departmentPanel}>
                <DepartmentOverview snapshot={snapshot} tasks={dashboardTasks} />
              </div>

              <Card className={dashboardStyles.taskListCard}>
                <CardHeader className={dashboardStyles.taskListHeader}>
                  <div className={dashboardStyles.taskListHeaderText}>
                    <CardDescription className={dashboardStyles.taskListKicker}>
                      Ажлын жагсаалт
                    </CardDescription>
                    <CardTitle>Нийт ажил</CardTitle>
                    <CardDescription>
                      {scopeLabel} · Сонгосон алба нэгжийн бүх ажлыг нэг дор харуулна
                    </CardDescription>
                  </div>
                  <Link
                    href="/tasks"
                    className={dashboardStyles.taskListAction}
                  >
                    Календар төлөвлөгөө
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </CardHeader>

                <div className={taskGridClassName}>
                  {visibleTasks.map((task) => (
                    <TaskCard key={task.id} task={task} currentDateKey={currentDateKey} />
                  ))}
                  {!visibleTasks.length ? (
                    <div className={cn("col-span-full", dashboardStyles.taskListEmpty)}>
                      <span className={dashboardStyles.taskListEmptyIcon}>
                        <ClipboardList />
                      </span>
                      <span className="mt-2 block text-[#1F2B24]">Одоогоор ажил бүртгэгдээгүй байна.</span>
                      <small className="mt-1 block font-medium text-[#8A978E]">Шинэ ажил үүсгэж эхлээрэй.</small>
                    </div>
                  ) : null}
                </div>
              </Card>

              <div className={cn("grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]", dashboardStyles.analyticsSection)}>
                <CompletionDonut
                  completed={completedTasks}
                  working={workingTasks}
                  review={reviewTasks}
                  overdue={overdueTasks}
                  total={totalTasks}
                />
                <WeeklyLineChart points={model.trendPoints} />
              </div>

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
