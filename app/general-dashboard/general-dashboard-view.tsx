import type { CSSProperties } from "react";

import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  Leaf,
  Recycle,
  ShieldCheck,
  Sun,
  Truck,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { Card } from "@/app/_components/ui/card";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import styles from "@/app/general-dashboard/general-dashboard.module.css";
import shellStyles from "@/app/workspace.module.css";
import { getRoleLabel, hasCapability, type AppSession } from "@/lib/auth";
import { type DashboardSnapshot, type FleetVehicleBoard, type HrDailyAttendanceSummary } from "@/lib/odoo";
import { cn } from "@/lib/utils";
import { type WeatherSnapshot } from "@/lib/weather";

type GeneralDashboardViewProps = {
  session: AppSession;
  snapshot: DashboardSnapshot;
  fleetBoard: FleetVehicleBoard;
  hrAttendanceSummary: HrDailyAttendanceSummary;
  weather: WeatherSnapshot;
  canViewHr: boolean;
};

type Tone = "green" | "orange" | "blue" | "purple" | "red";

type Metric = {
  label: string;
  value: string;
  note?: string;
  progress: number;
  icon: LucideIcon;
  tone: Tone;
};

type DepartmentMetric = {
  name: string;
  progress: number;
  total: number;
  working: number;
  review: number;
  risky: number;
  icon: LucideIcon;
  tone: Tone;
};

const TONE_COLORS: Record<Tone, string> = {
  green: "#078251",
  orange: "#f58a07",
  blue: "#1677d2",
  purple: "#453f99",
  red: "#ef4444",
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percent(value: number, total: number) {
  return total ? clampPercent((value / total) * 100) : 0;
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

function ringStyle(value: number, tone: Tone): CSSProperties {
  const color = TONE_COLORS[tone];

  return {
    background: `conic-gradient(${color} ${clampPercent(value) * 3.6}deg, #e5e7eb 0deg)`,
  };
}

function Ring({ value, tone, large = false }: { value: number; tone: Tone; large?: boolean }) {
  return (
    <span className={cn(styles.ring, large && styles.largeRing)} style={ringStyle(value, tone)}>
      <span className={styles.ringInner}>
        {large ? (
          <>
            <strong>{clampPercent(value)}%</strong>
            <small>Гүйцэтгэл</small>
          </>
        ) : null}
      </span>
    </span>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon;
  const color = TONE_COLORS[metric.tone];

  return (
    <Card className={styles.metricCard}>
      <div className={styles.metricTop}>
        <span className={styles.metricIcon} style={{ color, backgroundColor: `${color}16` }}>
          <Icon />
        </span>
        <strong>{metric.label}</strong>
      </div>
      <div className={styles.metricBody}>
        <div>
          <span className={styles.metricValue}>{metric.value}</span>
          {metric.note ? <small className={styles.metricNote}>{metric.note}</small> : null}
        </div>
        {metric.progress > 0 && metric.progress < 100 ? <Ring value={metric.progress} tone={metric.tone} /> : null}
      </div>
    </Card>
  );
}

function DepartmentCard({ department }: { department: DepartmentMetric }) {
  const Icon = department.icon;
  const color = TONE_COLORS[department.tone];

  return (
    <Card className={styles.departmentCard} style={{ borderColor: `${color}2e` }}>
      <div className={styles.departmentTop} style={{ color }}>
        <Icon />
        <strong>{department.name}</strong>
      </div>
      <Ring value={department.progress} tone={department.tone} large />
      <div className={styles.departmentStats}>
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
      <div className={styles.departmentFooter}>
        <span>Эрсдэлтэй / хугацаа хэтэрсэн</span>
        <strong>{department.risky}</strong>
      </div>
    </Card>
  );
}

function WeatherPanel({ weather }: { weather: WeatherSnapshot }) {
  return (
    <Card className={styles.weatherPanel}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>7 хоногийн цаг агаар</h2>
          <p>{weather.city} хотын ажлын төлөвлөлтөд ашиглах урьдчилсан мэдээ</p>
        </div>
        <div className={styles.weatherNow}>
          <Sun />
          <strong>{weather.temperature === null ? "--" : weather.temperature}°C</strong>
          <span>{weather.condition}</span>
        </div>
      </div>
      <div className={styles.weatherGrid}>
        {weather.weeklyForecast.map((day) => (
          <div key={day.date} className={styles.weatherDay}>
            <span>{day.weekday}</span>
            <Sun />
            <strong>
              {day.temperatureMax === null ? "--" : day.temperatureMax}° / {day.temperatureMin === null ? "--" : day.temperatureMin}°
            </strong>
            <small>{day.condition}</small>
            <small>{day.precipitationChance === null ? "Тунадас --" : `Тунадас ${day.precipitationChance}%`}</small>
          </div>
        ))}
      </div>
      {!weather.weeklyForecast.length ? (
        <div className={styles.noticeCard}>Цаг агаарын 7 хоногийн дата ачаалагдсангүй.</div>
      ) : null}
    </Card>
  );
}

function buildDepartmentMetrics(snapshot: DashboardSnapshot, currentDateKey: string): DepartmentMetric[] {
  const tasks = snapshot.taskDirectory;
  const matchedDepartment = (keywords: string[]) =>
    snapshot.departments.find((department) =>
      keywords.some((keyword) => department.name.includes(keyword) || department.label.includes(keyword)),
    );
  const matchedTasks = (keywords: string[]) =>
    tasks.filter((task) =>
      keywords.some((keyword) => task.departmentName.includes(keyword) || task.operationTypeLabel.includes(keyword)),
    );
  const buildDepartment = (
    name: string,
    keywords: string[],
    icon: LucideIcon,
    tone: Tone,
  ): DepartmentMetric => {
    const departmentTasks = matchedTasks(keywords);
    const department = matchedDepartment(keywords);
    const total = departmentTasks.length || department?.openTasks || 0;
    const progress = department
      ? clampPercent(department.completion)
      : total
        ? Math.round(departmentTasks.reduce((sum, task) => sum + clampPercent(task.progress), 0) / total)
        : 0;

    return {
      name,
      progress,
      total,
      working: departmentTasks.filter((task) => task.statusKey === "working").length,
      review: departmentTasks.filter((task) => task.statusKey === "review").length || department?.reviewTasks || 0,
      risky: departmentTasks.filter((task) => task.issueFlag || isOverdue(task, currentDateKey)).length,
      icon,
      tone,
    };
  };

  return [
    buildDepartment("Авто бааз, хог тээвэрлэлт", ["Авто", "Хог", "хог", "тээвэр"], Truck, "blue"),
    buildDepartment("Гудамж цэвэрлэгээ", ["Гудамж", "цэвэр"], Recycle, "orange"),
    buildDepartment("Ногоон байгууламж", ["Ногоон", "мод", "зүлэг"], Leaf, "green"),
    buildDepartment("Тохижилт үйлчилгээ", ["Тохижилт", "үйлчилгээ"], Wrench, "purple"),
  ];
}

export function GeneralDashboardView({
  session,
  snapshot,
  fleetBoard,
  hrAttendanceSummary,
  weather,
  canViewHr,
}: GeneralDashboardViewProps) {
  const roleLabel = getRoleLabel(session.role);
  const currentDateKey = todayKey();
  const tasks = snapshot.taskDirectory;
  const totalTasks = tasks.length || snapshot.totalTasks || 0;
  const completedTasks = tasks.filter((task) => task.statusKey === "verified" || task.progress >= 100).length;
  const workingTasks = tasks.filter((task) => task.statusKey === "working").length;
  const reviewTasks = tasks.filter((task) => task.statusKey === "review").length;
  const overdueTasks = tasks.filter((task) => isOverdue(task, currentDateKey)).length;
  const progress = totalTasks
    ? Math.round(tasks.reduce((sum, task) => sum + clampPercent(task.progress), 0) / totalTasks)
    : snapshot.departments.length
      ? Math.round(snapshot.departments.reduce((sum, department) => sum + clampPercent(department.completion), 0) / snapshot.departments.length)
      : 0;
  const metrics: Metric[] = [
    { label: "нийт гүйцэтгэл", value: `${progress}%`, progress, icon: CheckCircle2, tone: "green" },
    { label: "хянах ажил", value: String(reviewTasks), progress: percent(reviewTasks, totalTasks), icon: ShieldCheck, tone: "blue" },
    {
      label: "хүний нөөцийн ашиглалт",
      value: `${percent(hrAttendanceSummary.workingToday, hrAttendanceSummary.totalEmployees)}%`,
      progress: percent(hrAttendanceSummary.workingToday, hrAttendanceSummary.totalEmployees),
      icon: UsersRound,
      tone: "green",
    },
    {
      label: "техникийн ашиглалт",
      value: `${percent(fleetBoard.activeCount, fleetBoard.totalVehicles)}%`,
      progress: percent(fleetBoard.activeCount, fleetBoard.totalVehicles),
      icon: Truck,
      tone: "purple",
    },
    { label: "хугацаа хэтэрсэн ажил", value: `${percent(overdueTasks, totalTasks)}%`, progress: percent(overdueTasks, totalTasks), icon: Clock3, tone: "orange" },
    { label: "идэвхтэй ажил", value: String(Math.max(totalTasks - completedTasks, workingTasks + reviewTasks)), progress: 100, icon: ClipboardList, tone: "green" },
  ];
  const departmentMetrics = buildDepartmentMetrics(snapshot, currentDateKey);

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.contentWithMenu}>
        <aside className={shellStyles.menuColumn}>
          <AppMenu
            active="dashboard"
            canCreateProject={hasCapability(session, "create_projects")}
            canCreateTasks={hasCapability(session, "create_tasks")}
            canWriteReports={hasCapability(session, "write_workspace_reports")}
            canViewQualityCenter={hasCapability(session, "view_quality_center")}
            canUseFieldConsole={hasCapability(session, "use_field_console")}
            canViewHr={canViewHr}
            canViewGeneralDashboard
            userName={session.name}
            roleLabel={roleLabel}
            groupFlags={session.groupFlags}
            workerMode={false}
            notificationCount={reviewTasks + overdueTasks}
          />
        </aside>

        <div className={cn(shellStyles.pageContent, styles.page)}>
          <WorkspaceHeader
            title="Ерөнхий хяналтын самбар"
            subtitle="Бүх хэлтсийн ажлын нэгдсэн бодит тойм"
            userName={session.name}
            roleLabel={roleLabel}
            notificationCount={reviewTasks + overdueTasks}
            notificationNote={`${reviewTasks + overdueTasks} анхаарах ажил байна`}
          />

          <section className={styles.metricGrid}>
            {metrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </section>

          {!snapshot.generatedAt ? (
            <div className={styles.noticeCard}>Дата ачаалагдсангүй. Demo тоо харуулахгүйгээр хоосон төлөв үзүүлж байна.</div>
          ) : null}

          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Хэлтсүүдийн ажлын нөхцөл байдал</h2>
              </div>
            </div>
            <div className={styles.departmentGrid}>
              {departmentMetrics.map((department) => (
                <DepartmentCard key={department.name} department={department} />
              ))}
            </div>
          </section>

          <WeatherPanel weather={weather} />
        </div>
      </div>
    </main>
  );
}
