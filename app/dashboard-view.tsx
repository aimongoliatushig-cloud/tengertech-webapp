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

function isOverdue(task: DashboardSnapshot["taskDirectory"][number], currentDateKey: string) {
  return Boolean(
    task.scheduledDate &&
      task.scheduledDate < currentDateKey &&
      task.statusKey !== "verified",
  );
}

function statusTone(task: DashboardSnapshot["taskDirectory"][number], currentDateKey: string): StatusTone {
  if (task.issueFlag || isOverdue(task, currentDateKey) || task.statusKey === "problem") {
    return "urgent";
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
      <Card className="grid h-full min-h-[112px] content-between p-3.5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(27,73,38,0.12)]">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <span className="block text-[0.72rem] font-semibold leading-4 text-[#6B7280]">
              {metric.label}
            </span>
            <strong className="mt-1.5 block text-2xl font-extrabold leading-none tracking-normal text-[#111B15]">
              {metric.value}
            </strong>
          </div>
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-[var(--ds-radius-card)]",
              STAT_TONE[metric.tone],
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[0.7rem]">
          <strong
            className={cn(
              "font-extrabold",
              metric.tone === "urgent" ? "text-red-600" : "text-[#2E7D32]",
            )}
          >
            {metric.progress}%
          </strong>
          <span className="min-w-0 flex-1 leading-4 text-[#6B7280]">{metric.helper}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E8F3E8]">
          <span
            className={cn(
              "block h-full rounded-full transition-all duration-700",
              metric.tone === "urgent" ? "bg-red-500" : "bg-[#2E7D32]",
            )}
            style={{ width: `${metric.progress}%` }}
          />
        </div>
      </Card>
    </Link>
  );
}

function ProgressRing({ value, size = "sm" }: { value: number; size?: "sm" | "lg" }) {
  return (
    <div
      className={cn("grid shrink-0 place-items-center rounded-full p-1", size === "lg" ? "h-28 w-28" : "h-14 w-14")}
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

  return (
    <Card className="overflow-hidden p-0">
      <div
        className="min-h-[158px] bg-cover p-4"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(246,251,246,.96) 0%, rgba(246,251,246,.78) 44%, rgba(246,251,246,.24) 100%), linear-gradient(180deg, rgba(246,251,246,.18), rgba(46,125,50,.06)), url(${DASHBOARD_IMAGES.overview})`,
          backgroundPosition: "center right",
        }}
      >
        <Badge className="bg-white/72 text-[#2E7D32]">Доторх нэгж</Badge>
        <h2 className="mt-2.5 max-w-2xl text-xl font-extrabold leading-tight tracking-normal text-[#111B15]">
          {departmentName}
        </h2>
        <p className="mt-1.5 max-w-xl text-xs font-semibold leading-4 text-[#5E6E64]">
          Энэ хэлтэс доторх ажлыг нэгжээр харуулна.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["Бүгд", total, true],
            ["Авто бааз", autoBaseCount, false],
            ["Хог тээвэрлэлт", wasteCount || total, false],
          ].map(([label, value, active]) => (
            <span
              key={String(label)}
              className={cn(
                "inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-xs font-extrabold shadow-sm",
                active
                  ? "bg-[#2E7D32] text-white"
                  : "border border-[#DCEFDA] bg-white/78 text-[#1B1B1B]",
              )}
            >
              {label}
              <small
                className={cn(
                  "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[0.68rem]",
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

  return (
    <Card className="p-4">
      <CardTitle className="text-base">Ажил гүйцэтгэлийн харагдац</CardTitle>
      <div className="mt-4 grid items-center gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
        <ProgressRing value={completedShare} size="lg" />
        <div className="grid gap-3 text-xs">
          {[
            ["Дууссан", completed, "good"],
            ["Явагдаж буй", working, "good"],
            ["Хүлээгдэж буй", review, "attention"],
            ["Хугацаа хэтэрсэн", overdue, "urgent"],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="flex items-center gap-3">
              <span className={cn("h-3 w-3 rounded-full", STATUS_DOT[tone as StatusTone])} />
              <span className="flex-1 text-[#5E6E64]">{label}</span>
              <strong>{value}</strong>
              <small className="text-[#7A897E]">({percent(Number(value), total)}%)</small>
            </div>
          ))}
        </div>
      </div>
    </Card>
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
  const toPolyline = (key: "completion" | "overdue") =>
    values
      .map((point, index) => {
        const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
        const y = 92 - clampPercent(point[key]) * 0.78;
        return `${x},${y}`;
      })
      .join(" ");

  return (
    <Card className="p-4">
      <CardTitle className="text-base">Сүүлийн 7 хоногийн идэвх</CardTitle>
      <div className="mt-3 rounded-[var(--ds-radius-card)] bg-[#F6FBF6]/80 p-3">
        <svg viewBox="0 0 100 100" className="h-36 w-full overflow-visible">
          {[22, 40, 58, 76].map((line) => (
            <line
              key={line}
              x1="0"
              x2="100"
              y1={line}
              y2={line}
              stroke="rgba(107,114,128,.18)"
              strokeDasharray="4 4"
            />
          ))}
          <polyline
            points={toPolyline("completion")}
            fill="none"
            stroke="#2E7D32"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
          <polyline
            points={toPolyline("overdue")}
            fill="none"
            stroke="#EF4444"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
          {values.map((point, index) => {
            const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
            return (
              <g key={point.id}>
                <circle cx={x} cy={92 - clampPercent(point.completion) * 0.78} r="1.8" fill="#2E7D32" />
                <circle cx={x} cy={92 - clampPercent(point.overdue) * 0.78} r="1.8" fill="#EF4444" />
                <text x={x} y="104" textAnchor="middle" className="fill-[#6B7280] text-[4px] font-semibold">
                  {point.label}
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
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Хүний нөөц</CardTitle>
          <CardDescription>Өнөөдрийн ирц</CardDescription>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--ds-radius-card)] bg-[#E7F5E7] text-[#2E7D32]">
          <UsersRound className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.label} className="rounded-[var(--ds-radius-card)] bg-[#F6FBF6] p-2.5">
              <span className={cn("mb-2 grid h-7 w-7 place-items-center rounded-lg", item.className)}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <strong className="block text-xl leading-none tracking-normal text-[#111B15]">
                {item.value}
              </strong>
              <span className="mt-1 block text-[0.68rem] font-bold leading-3 text-[#6B7280]">
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#6B7280]">
        <span>Нийт ажилтан</span>
        <strong className="text-[#111B15]">{summary.totalEmployees}</strong>
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
}: {
  totalTasks: number;
  completedTasks: number;
  workingTasks: number;
  fleetBoard: FleetVehicleBoard;
  alertCount: number;
  canWriteReports: boolean;
  hrAttendanceSummary: HrDailyAttendanceSummary;
}) {
  const quickActions = [
    { label: "Шинэ ажил үүсгэх", href: "/create", icon: Plus },
    { label: "Ажлын жагсаалт", href: "/projects", icon: ListChecks },
    { label: "Тайлан харах", href: canWriteReports ? "/reports" : "/review", icon: BarChart3 },
    { label: "Календарь харах", href: "/tasks?view=today", icon: CalendarDays },
  ];

  return (
    <aside className="grid content-start gap-3">
      <Card className="p-4">
        <CardTitle className="text-base">Түргэн холбоосууд</CardTitle>
        <div className="mt-3 grid gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="flex min-h-8 items-center gap-2 rounded-[var(--ds-radius-card)] bg-[#EDF6ED] px-3 text-xs font-extrabold text-[#1B1B1B] transition hover:-translate-y-0.5 hover:bg-[#DCEFDA]"
              >
                <Icon className="h-4 w-4 text-[#2E7D32]" />
                {action.label}
              </Link>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div
          className="min-h-[104px] bg-cover bg-center p-4 text-right"
          style={{
            backgroundImage:
              `linear-gradient(90deg, rgba(246,251,246,.9), rgba(246,251,246,.54)), url(${DASHBOARD_IMAGES.seedling})`,
          }}
        >
          <Leaf className="mb-3 ml-auto h-8 w-8 text-[#A5B82E]" />
          <p className="text-xs font-extrabold leading-5 text-[#334238]">
            Өнөөдрийн уриа
            <br />
            “Байгалиа хайрлая, ирээдүйгээ хамгаалъя.”
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <CardTitle className="text-base">Системийн мэдээлэл</CardTitle>
        <div className="mt-3 grid gap-2.5 text-xs">
          {[
            ["Хэрэглэгч", 128],
            ["Нийт ажил", totalTasks],
            ["Идэвхтэй ажил", workingTasks],
            ["Дууссан ажил", completedTasks],
            ["Анхаарах", alertCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex items-center justify-between">
              <span className="text-[#6B7280]">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </Card>

      <HrAttendanceCard summary={hrAttendanceSummary} />

      <Card className="p-4">
        <CardTitle className="text-base">Цаг агаар</CardTitle>
        <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <Sun className="h-9 w-9 text-amber-400" />
          <div>
            <span className="block text-xs text-[#6B7280]">Улаанбаатар</span>
            <strong className="text-xl tracking-normal">18°C</strong>
            <small className="block text-[#6B7280]">Бага үүлтэй</small>
          </div>
          <div className="rounded-[var(--ds-radius-card)] bg-[#E7F5E7] px-2.5 py-2 text-center text-[0.7rem] font-extrabold text-[#2E7D32]">
            Сайн
            <br />
            AQI 38
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div
          className="min-h-[130px] bg-cover bg-center p-4 text-white"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(27,73,38,.1), rgba(17,42,26,.72)), url(${DASHBOARD_IMAGES.landscape})`,
          }}
        >
          <Recycle className="h-7 w-7 text-[#A5D6A7]" />
          <h3 className="mt-8 text-base font-extrabold leading-tight">Ногоон хот - ирээдүйн үнэ цэнэ</h3>
        </div>
      </Card>

      <Card className="p-4">
        <CardTitle className="text-base">Техник</CardTitle>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-[var(--ds-radius-card)] bg-[#F2F8F2] p-3">
            <Truck className="mb-2 h-4 w-4 text-[#2E7D32]" />
            <strong className="block text-xl">{fleetBoard.totalVehicles}</strong>
            <span className="text-[#6B7280]">Нийт</span>
          </div>
          <div className="rounded-[var(--ds-radius-card)] bg-[#F2F8F2] p-3">
            <Wind className="mb-2 h-4 w-4 text-[#2E7D32]" />
            <strong className="block text-xl">{fleetBoard.activeCount}</strong>
            <span className="text-[#6B7280]">Ажиллаж буй</span>
          </div>
        </div>
      </Card>
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

  const scopedTasks = workerMode
    ? snapshot.taskDirectory.filter((task) => task.assigneeIds?.includes(session.uid))
    : snapshot.taskDirectory;
  const dashboardTasks = scopedTasks.length ? scopedTasks : snapshot.taskDirectory;
  const totalTasks = dashboardTasks.length || snapshot.totalTasks || 0;
  const completedTasks = dashboardTasks.filter((task) => task.statusKey === "verified").length;
  const workingTasks = dashboardTasks.filter((task) => task.statusKey === "working").length;
  const reviewTasks = dashboardTasks.filter((task) => task.statusKey === "review").length;
  const plannedTasks = dashboardTasks.filter((task) => task.statusKey === "planned").length;
  const overdueTasks = dashboardTasks.filter((task) => isOverdue(task, currentDateKey)).length;
  const attentionCount = overdueTasks + reviewTasks + dashboardTasks.filter((task) => task.issueFlag).length;
  const sortedTasks = [...dashboardTasks].sort((left, right) => {
    const leftTone = statusTone(left, currentDateKey);
    const rightTone = statusTone(right, currentDateKey);
    const score = { urgent: 4, attention: 3, good: 2, muted: 1 };
    return score[rightTone] - score[leftTone] || right.progress - left.progress;
  });
  const visibleTasks = sortedTasks.slice(0, 4);
  const taskGridClassName = cn("mt-4 grid gap-3", visibleTasks.length > 1 && "xl:grid-cols-2");

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
          />
        </aside>

        <div className={shellStyles.pageContent}>
          <WorkspaceHeader
            title={`Сайн байна уу, ${session.name}`}
            subtitle={model.scopeLabel}
            userName={session.name}
            roleLabel={roleLabel}
            notificationCount={attentionCount}
            backgroundImage={DASHBOARD_IMAGES.header}
          />

          <div className="relative z-20 mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
            <div className="grid min-w-0 gap-4">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {statCards.map((metric) => (
                  <StatCard key={metric.label} metric={metric} />
                ))}
              </section>

              {fleetLoadError ? (
                <Card className="border-amber-200 bg-amber-50/85 p-4 text-sm font-semibold text-amber-800">
                  {fleetLoadError}
                </Card>
              ) : null}

              <DepartmentOverview snapshot={snapshot} tasks={dashboardTasks} />

              <Card className="p-4">
                <CardHeader className="flex-wrap gap-3">
                  <div>
                    <CardDescription className="font-extrabold uppercase tracking-normal">
                      Ажлын жагсаалт
                    </CardDescription>
                    <CardTitle>Нийт ажил</CardTitle>
                    <CardDescription>
                      {model.scopeLabel} · Сонгосон алба нэгжийн бүх ажлыг нэг дор харуулна
                    </CardDescription>
                  </div>
                  <Link
                    href="/tasks"
                    className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#E4F2E4] px-3.5 text-xs font-extrabold text-[#2E7D32] transition hover:-translate-y-0.5 hover:bg-[#DCEFDA]"
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
                    <div className="col-span-full rounded-2xl border border-dashed border-[#A5D6A7]/70 bg-[#F6FBF6] p-8 text-center text-sm font-semibold text-[#6B7280]">
                      Одоогоор ажил бүртгэгдээгүй байна.
                    </div>
                  ) : null}
                </div>
              </Card>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <CompletionDonut
                  completed={completedTasks}
                  working={workingTasks}
                  review={reviewTasks}
                  overdue={overdueTasks}
                  total={totalTasks}
                />
                <WeeklyLineChart points={model.trendPoints} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
                <Card className="p-4">
                  <CardTitle className="text-base">Хурдан статистик</CardTitle>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      ["Өнөөдрийн ажил", snapshot.liveTasks.length, percent(snapshot.liveTasks.length, totalTasks)],
                      ["Энэ 7 хоног", model.trendPoints.reduce((sum, point) => sum + point.completion, 0), 0],
                      ["Энэ сар", completedTasks, percent(completedTasks, totalTasks)],
                    ].map(([label, value, rate]) => (
                      <div key={String(label)} className="rounded-[var(--ds-radius-card)] bg-[#F2F8F2] p-3">
                        <CalendarDays className="mb-2 h-4 w-4 text-[#2E7D32]" />
                        <span className="block text-xs text-[#6B7280]">{label}</span>
                        <strong className="mt-1 block text-xl tracking-normal">{value}</strong>
                        <small className="font-extrabold text-[#2E7D32]">↑ {rate}%</small>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-4">
                  <CardTitle className="text-base">Техник, тоног төхөөрөмж</CardTitle>
                  <div className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
                    <Truck className="h-8 w-8 text-[#2E7D32]" />
                    <div>
                      <strong className="block text-3xl tracking-normal">{fleetBoard.totalVehicles}</strong>
                      <span className="text-[#6B7280]">Нийт техник</span>
                    </div>
                  </div>
                  <Link
                    href="/auto-base"
                    className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-[#2E7D32]"
                  >
                    Авто бааз
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Card>
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
