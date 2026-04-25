import type { CSSProperties, ReactNode } from "react";

import Image from "next/image";
import Link from "next/link";

import { getRoleLabel, hasCapability, isWorkerOnly, type AppSession } from "@/lib/auth";
import {
  buildDashboardModel,
  type DashboardActionRow,
  type DashboardComparisonCard,
  type DashboardItem,
  type DashboardSummaryCard,
  type StatusTone,
} from "@/lib/dashboard-model";
import { type FieldAssignment } from "@/lib/field-ops";
import { type DashboardSnapshot, type FleetVehicleBoard, type TaskStatusKey } from "@/lib/odoo";

import styles from "./page.module.css";

type DashboardViewProps = {
  session: AppSession;
  snapshot: DashboardSnapshot;
  todayAssignments: FieldAssignment[];
  fleetBoard: FleetVehicleBoard;
  fleetLoadError?: string;
};

type IconName =
  | "dashboard"
  | "clipboard"
  | "calendar"
  | "alert"
  | "truck"
  | "users"
  | "chart"
  | "document"
  | "bell"
  | "settings"
  | "check"
  | "clock"
  | "flag"
  | "leaf"
  | "chevron";

type SummaryMetric = {
  id: string;
  label: string;
  value: string;
  delta: string;
  note: string;
  tone: StatusTone;
  href: string;
  icon: IconName;
};

type DonutSegment = {
  label: string;
  value: number;
  color: string;
  tone: StatusTone;
};

type ScheduleItem = {
  id: string;
  title: string;
  start: number;
  span: number;
  color: string;
};

const STATUS_LABELS: Record<TaskStatusKey, string> = {
  planned: "Хүлээгдэж байна",
  working: "Явагдаж байна",
  review: "Шалгах",
  verified: "Дууссан",
  problem: "Асуудалтай",
};

const STATUS_COLORS: Record<TaskStatusKey | "overdue", string> = {
  planned: "#9aa69e",
  working: "#48a163",
  review: "#f0bd36",
  verified: "#2f8a4a",
  problem: "#e15241",
  overdue: "#e15241",
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function toneClass(tone: StatusTone) {
  switch (tone) {
    case "good":
      return styles.toneGood;
    case "attention":
      return styles.toneAttention;
    case "urgent":
      return styles.toneUrgent;
    case "muted":
      return styles.toneMuted;
    default:
      return styles.toneMuted;
  }
}

function parsePercent(value: string) {
  const parsed = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, parsed));
}

function toNumber(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseInt(value.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findSummaryCard(
  cards: DashboardSummaryCard[],
  id: DashboardSummaryCard["id"],
) {
  return cards.find((card) => card.id === id) ?? null;
}

function formatPercent(value: number, total: number) {
  if (!total) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isOverdue(task: DashboardSnapshot["taskDirectory"][number], currentDateKey: string) {
  return Boolean(
    task.scheduledDate &&
      task.scheduledDate < currentDateKey &&
      task.statusKey !== "verified",
  );
}

function formatHeaderDate() {
  const now = new Date();
  const formatted = new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  }).format(now);

  return formatted.replace(/\//g, ".");
}

function monthLabel() {
  return new Intl.DateTimeFormat("mn-MN", {
    month: "long",
  }).format(new Date());
}

function iconPath(icon: IconName) {
  switch (icon) {
    case "dashboard":
      return (
        <>
          <path d="M4.5 5.5H10V11H4.5V5.5Z" />
          <path d="M14 5.5H19.5V11H14V5.5Z" />
          <path d="M4.5 15H10V20.5H4.5V15Z" />
          <path d="M14 15H19.5V20.5H14V15Z" />
        </>
      );
    case "clipboard":
      return (
        <>
          <path d="M8.5 5.5H6.8C5.80589 5.5 5 6.30589 5 7.3V18.2C5 19.1941 5.80589 20 6.8 20H17.2C18.1941 20 19 19.1941 19 18.2V7.3C19 6.30589 18.1941 5.5 17.2 5.5H15.5" />
          <path d="M8.5 6.5C8.5 5.67157 9.17157 5 10 5H14C14.8284 5 15.5 5.67157 15.5 6.5V7.5H8.5V6.5Z" />
          <path d="M8.5 12H15.5" />
          <path d="M8.5 15.5H14" />
        </>
      );
    case "calendar":
      return (
        <>
          <path d="M6 7.5H18C18.8284 7.5 19.5 8.17157 19.5 9V18C19.5 18.8284 18.8284 19.5 18 19.5H6C5.17157 19.5 4.5 18.8284 4.5 18V9C4.5 8.17157 5.17157 7.5 6 7.5Z" />
          <path d="M8 4.5V9.5" />
          <path d="M16 4.5V9.5" />
          <path d="M4.5 11H19.5" />
        </>
      );
    case "alert":
      return (
        <>
          <path d="M12 5.2L20 19H4L12 5.2Z" />
          <path d="M12 10V14" />
          <path d="M12 17H12.01" />
        </>
      );
    case "truck":
      return (
        <>
          <path d="M4.5 7H14.5V16H4.5V7Z" />
          <path d="M14.5 10H17.2L19.5 12.6V16H14.5V10Z" />
          <circle cx="8" cy="17.5" r="1.7" />
          <circle cx="16.5" cy="17.5" r="1.7" />
        </>
      );
    case "users":
      return (
        <>
          <path d="M9.2 11.2C10.6912 11.2 11.9 9.99117 11.9 8.5C11.9 7.00883 10.6912 5.8 9.2 5.8C7.70883 5.8 6.5 7.00883 6.5 8.5C6.5 9.99117 7.70883 11.2 9.2 11.2Z" />
          <path d="M4.8 19C5.45 16.4 7.1 15 9.2 15C11.3 15 12.95 16.4 13.6 19" />
          <path d="M15 11C16.1046 11 17 10.1046 17 9C17 7.89543 16.1046 7 15 7" />
          <path d="M15.2 15.2C16.9 15.5 18.15 16.7 18.7 18.5" />
        </>
      );
    case "chart":
      return (
        <>
          <path d="M5 19.5H19.5" />
          <path d="M7 16V11" />
          <path d="M12 16V7" />
          <path d="M17 16V10" />
        </>
      );
    case "document":
      return (
        <>
          <path d="M7.5 4.8H13.5L18 9.3V19.2H7.5V4.8Z" />
          <path d="M13.5 4.9V9.3H18" />
          <path d="M9.5 13H15.5" />
          <path d="M9.5 16H14.5" />
        </>
      );
    case "bell":
      return (
        <>
          <path d="M18 16H6L7.4 14.2V10.2C7.4 7.7 9.2 5.8 12 5.8C14.8 5.8 16.6 7.7 16.6 10.2V14.2L18 16Z" />
          <path d="M10.4 18C10.7 18.7 11.25 19.1 12 19.1C12.75 19.1 13.3 18.7 13.6 18" />
        </>
      );
    case "settings":
      return (
        <>
          <path d="M12 14.8C13.5464 14.8 14.8 13.5464 14.8 12C14.8 10.4536 13.5464 9.2 12 9.2C10.4536 9.2 9.2 10.4536 9.2 12C9.2 13.5464 10.4536 14.8 12 14.8Z" />
          <path d="M18.6 13.4V10.6L16.7 10.1C16.55 9.7 16.35 9.35 16.1 9L17.1 7.25L15.1 5.25L13.35 6.25C12.98 6.05 12.62 5.9 12.2 5.8L11.6 4H8.8L8.2 5.8C7.8 5.92 7.42 6.08 7.05 6.3L5.3 5.3L3.3 7.3L4.3 9.05C4.08 9.42 3.92 9.8 3.8 10.2L2 10.8V13.6L3.8 14.2C3.95 14.6 4.15 14.95 4.4 15.3L3.4 17.05L5.4 19.05L7.15 18.05C7.52 18.25 7.88 18.4 8.3 18.5L8.9 20.3H11.7L12.3 18.5C12.7 18.38 13.08 18.22 13.45 18L15.2 19L17.2 17L16.2 15.25C16.42 14.88 16.58 14.5 16.7 14.1L18.6 13.4Z" />
        </>
      );
    case "check":
      return <path d="M5.5 12.5L10 17L18.5 7.5" />;
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8.5V12.3L14.8 14" />
        </>
      );
    case "flag":
      return (
        <>
          <path d="M6.5 20V5.5" />
          <path d="M6.5 6H16.8L15.5 10L16.8 14H6.5" />
        </>
      );
    case "leaf":
      return (
        <>
          <path d="M18.5 5.5C13 5.5 8.2 8.2 7.2 14.2C11.7 14.8 17.8 12.9 18.5 5.5Z" />
          <path d="M7.3 14.1C6.3 15.2 5.6 16.5 5.2 18.5" />
          <path d="M8.8 12.8C11.6 12 13.7 10.4 15.5 7.8" />
        </>
      );
    case "chevron":
      return <path d="M9 6L15 12L9 18" />;
    default:
      return null;
  }
}

function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {iconPath(name)}
      </g>
    </svg>
  );
}

function ringStyle(segments: DonutSegment[]): CSSProperties {
  const total = segments.reduce((sum, segment) => sum + Math.max(segment.value, 0), 0);

  if (!total) {
    return {
      background: "conic-gradient(#e8eee8 0% 100%)",
    };
  }

  let cursor = 0;
  const stops = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const start = cursor;
      const end = cursor + (segment.value / total) * 100;
      cursor = end;
      return `${segment.color} ${start}% ${end}%`;
    });

  return {
    background: `conic-gradient(${stops.join(", ")}, #e8eee8 ${cursor}% 100%)`,
  };
}

function scheduleBarStyle(item: ScheduleItem): CSSProperties {
  return {
    "--schedule-start": String(item.start),
    "--schedule-span": String(item.span),
    "--schedule-color": item.color,
  } as CSSProperties;
}

function panelRowsFromItems(items: DashboardItem[]) {
  return items.slice(0, 4).map((item) => ({
    id: item.id,
    title: item.title,
    meta: item.subtitle,
    status: item.statusLabel,
    tone: item.tone,
    href: item.href,
  }));
}

function rowFromAction(row: DashboardActionRow) {
  return {
    id: row.id,
    title: row.title,
    meta: row.timeLabel,
    status: row.statusLabel,
    tone: row.tone,
    href: row.href,
  };
}

function DashboardSidebar({
  alertCount,
  canCreateProject,
  canCreateTasks,
  canWriteReports,
  canUseFieldConsole,
  canViewQualityCenter,
}: {
  alertCount: number;
  canCreateProject: boolean;
  canCreateTasks: boolean;
  canWriteReports: boolean;
  canUseFieldConsole: boolean;
  canViewQualityCenter: boolean;
}) {
  const items = [
    {
      label: "Хяналтын самбар",
      href: "/",
      icon: "dashboard" as const,
      active: true,
    },
    {
      label: "Ажлын төлөв",
      href: "/tasks",
      icon: "clipboard" as const,
    },
    {
      label: "Төлөвлөгөөт ажил",
      href: canCreateProject || canCreateTasks ? "/create" : "/projects",
      icon: "calendar" as const,
    },
    {
      label: "Яаралтай ажил",
      href: canViewQualityCenter ? "/quality" : "/tasks?filter=overdue",
      icon: "alert" as const,
    },
    {
      label: "Календарь",
      href: "/tasks?view=today",
      icon: "calendar" as const,
    },
    {
      label: "Техник, тоног төхөөрөмж",
      href: "/auto-base",
      icon: "truck" as const,
    },
    {
      label: "Ажилтнууд",
      href: "/hr",
      icon: "users" as const,
    },
    {
      label: "Тайлан, статистик",
      href: canWriteReports ? "/reports" : "/review",
      icon: "chart" as const,
    },
    {
      label: "Баримт бичиг",
      href: "/data-download",
      icon: "document" as const,
    },
    {
      label: "Мэдэгдэл",
      href: canUseFieldConsole ? "/field" : "/review",
      icon: "bell" as const,
      badge: alertCount,
    },
    {
      label: "Тохиргоо",
      href: "/profile",
      icon: "settings" as const,
    },
  ];

  return (
    <nav className={styles.dashboardSidebar} aria-label="Хяналтын цэс">
      <Link href="/" className={styles.sidebarBrand}>
        <Image
          src="/logo.png"
          alt="Эко ариун"
          width={118}
          height={42}
          className={styles.sidebarLogo}
          priority
          unoptimized
        />
        <span>Орчны үйлчилгээний нэгдсэн төв</span>
      </Link>

      <div className={styles.sidebarNav}>
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cx(styles.sidebarLink, item.active && styles.sidebarLinkActive)}
            aria-current={item.active ? "page" : undefined}
          >
            <span className={styles.sidebarIcon}>
              <Icon name={item.icon} className={styles.dashboardIcon} />
            </span>
            <span className={styles.sidebarLabel}>{item.label}</span>
            {item.badge ? <span className={styles.sidebarBadge}>{item.badge}</span> : null}
          </Link>
        ))}
      </div>

      <div className={styles.sidebarHelp}>
        <Icon name="bell" className={styles.dashboardIcon} />
        <div>
          <span>24/7 дэмжлэг</span>
          <strong>7000-1234</strong>
        </div>
      </div>
    </nav>
  );
}

function MetricCard({ metric }: { metric: SummaryMetric }) {
  return (
    <Link
      href={metric.href}
      className={cx(styles.metricCard, toneClass(metric.tone))}
    >
      <div className={styles.metricCopy}>
        <span>{metric.label}</span>
        <strong>{metric.value}</strong>
      </div>
      <span className={styles.metricIcon}>
        <Icon name={metric.icon} className={styles.dashboardIcon} />
      </span>
      <div className={styles.metricFoot}>
        <b>{metric.delta}</b>
        <small>{metric.note}</small>
      </div>
    </Link>
  );
}

function PanelHeader({
  title,
  action,
  count,
}: {
  title: string;
  action?: ReactNode;
  count?: number;
}) {
  return (
    <div className={styles.panelHeader}>
      <h2>{title}</h2>
      {typeof count === "number" ? <span className={styles.panelCount}>{count}</span> : action}
    </div>
  );
}

function LegendList({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div className={styles.legendList}>
      {segments.map((segment) => (
        <div key={segment.label} className={styles.legendRow}>
          <span
            className={styles.legendDot}
            style={{ backgroundColor: segment.color }}
          />
          <span>{segment.label}</span>
          <strong>{segment.value}</strong>
          <small>{formatPercent(segment.value, total)}</small>
        </div>
      ))}
    </div>
  );
}

function TodayOverview({
  todayCount,
  segments,
  items,
}: {
  todayCount: number;
  segments: DonutSegment[];
  items: DashboardItem[];
}) {
  return (
    <section className={cx(styles.dashboardPanel, styles.todayPanel)}>
      <PanelHeader title="Өнөөдрийн тойм" />
      <div className={styles.todayBody}>
        <div className={styles.donutWrap}>
          <div className={styles.donutChart} style={ringStyle(segments)}>
            <div className={styles.donutCenter}>
              <span>Өнөөдрийн ажил</span>
              <strong>{todayCount}</strong>
              <small>Ажил</small>
            </div>
          </div>
        </div>
        <LegendList segments={segments} />
      </div>

      <div className={styles.highlightList}>
        <span>Өнөөдрийн гол ажил</span>
        {(items.length ? items : []).slice(0, 3).map((item) => (
          <Link key={item.id} href={item.href} className={styles.highlightItem}>
            <Icon name="check" className={styles.dashboardIcon} />
            <span>{item.title}</span>
          </Link>
        ))}
        {!items.length ? (
          <div className={styles.emptyCompact}>Өнөөдрийн ажил одоогоор алга.</div>
        ) : null}
      </div>
    </section>
  );
}

function AttentionPanel({
  alertCount,
  rows,
}: {
  alertCount: number;
  rows: Array<{
    id: string;
    title: string;
    meta: string;
    status: string;
    tone: StatusTone;
    href: string;
  }>;
}) {
  return (
    <section className={cx(styles.dashboardPanel, styles.attentionPanel)}>
      <PanelHeader title="Яаралтай анхаарах" count={alertCount} />
      <div className={styles.attentionRows}>
        {rows.slice(0, 4).map((row, index) => (
          <Link key={`${row.id}-${index}`} href={row.href} className={styles.attentionRow}>
            <span className={cx(styles.rowIndex, toneClass(row.tone))}>{index + 1}</span>
            <div>
              <strong>{row.title}</strong>
              <small>{row.meta}</small>
            </div>
            <span className={cx(styles.rowStatus, toneClass(row.tone))}>{row.status}</span>
          </Link>
        ))}
        {!rows.length ? (
          <div className={styles.emptyCompact}>Яаралтай анхаарах мөр бүртгэгдээгүй.</div>
        ) : null}
      </div>
      <Link href="/quality" className={styles.panelLink}>
        Бүгдийг харах
        <Icon name="chevron" className={styles.dashboardIcon} />
      </Link>
    </section>
  );
}

function WeekPlanPanel({ items }: { items: DashboardItem[] }) {
  return (
    <section className={cx(styles.dashboardPanel, styles.weekPanel)}>
      <PanelHeader title="Дараах 7 хоногийн төлөв" />
      <span className={styles.panelSubtle}>Өнөөдрөөс эхлэх ажилбарууд</span>
      <div className={styles.weekRows}>
        {items.slice(0, 4).map((item, index) => (
          <Link key={item.id} href={item.href} className={styles.weekRow}>
            <span className={styles.dayPill}>{21 + index}</span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
            </div>
          </Link>
        ))}
        {!items.length ? (
          <div className={styles.emptyCompact}>Ирэх 7 хоногийн төлөв хоосон байна.</div>
        ) : null}
      </div>
      <Link href="/tasks" className={styles.panelLink}>
        Бүгдийг харах
        <Icon name="chevron" className={styles.dashboardIcon} />
      </Link>
    </section>
  );
}

function PerformancePanel({
  completion,
  segments,
}: {
  completion: number;
  segments: DonutSegment[];
}) {
  return (
    <section className={cx(styles.dashboardPanel, styles.performancePanel)}>
      <PanelHeader title="Ажлын гүйцэтгэлийн хувь" />
      <div className={styles.performanceBody}>
        <div className={styles.performanceRing} style={ringStyle(segments)}>
          <div className={styles.performanceCenter}>
            <strong>{completion}%</strong>
            <span>нийт гүйцэтгэл</span>
          </div>
        </div>
        <LegendList segments={segments} />
      </div>
    </section>
  );
}

function EquipmentPanel({
  board,
  loadError,
}: {
  board: FleetVehicleBoard;
  loadError?: string;
}) {
  const sampleVehicles = [
    ...board.activeVehicles.slice(0, 2),
    ...board.repairVehicles.slice(0, 2),
  ].slice(0, 3);

  return (
    <section className={cx(styles.dashboardPanel, styles.equipmentPanel)}>
      <PanelHeader
        title="Техник, тоног төхөөрөмж"
        action={
          <Link href="/auto-base" className={styles.panelLink}>
            Авто бааз
            <Icon name="chevron" className={styles.dashboardIcon} />
          </Link>
        }
      />
      <div className={styles.equipmentHero}>
        <span className={styles.metricIcon}>
          <Icon name="truck" className={styles.dashboardIcon} />
        </span>
        <div>
          <strong>{board.totalVehicles}</strong>
          <span>Нийт техник</span>
        </div>
      </div>
      <div className={styles.statusRows}>
        <div>
          <span>Ажиллаж байгаа</span>
          <strong>{board.activeCount}</strong>
        </div>
        <div>
          <span>Засвартай</span>
          <strong>{board.repairCount}</strong>
        </div>
      </div>

      {loadError ? (
        <div className={styles.emptyCompact}>{loadError}</div>
      ) : sampleVehicles.length ? (
        <div className={styles.vehicleMiniList}>
          {sampleVehicles.map((vehicle) => (
            <Link key={vehicle.id} href="/auto-base" className={styles.vehicleMiniRow}>
              <strong>{vehicle.plate}</strong>
              <span>{vehicle.isRepair ? vehicle.latestRepairState || "Засварт" : vehicle.stateLabel || "Идэвхтэй"}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.emptyCompact}>Бүртгэлтэй техник олдсонгүй.</div>
      )}
    </section>
  );
}

function ScheduleBoard({
  items,
}: {
  items: ScheduleItem[];
}) {
  const labels = ["18 Бям", "19 Ням", "20 Даваа", "21 Мяг", "22 Лха", "23 Пүр", "24 Баа", "25 Бям"];

  return (
    <section className={cx(styles.dashboardPanel, styles.schedulePanel)}>
      <PanelHeader
        title="Төлөвлөгөөт ажлын хуваарь"
        action={
          <Link href="/projects" className={styles.panelLink}>
            Бүгдийг харах
            <Icon name="chevron" className={styles.dashboardIcon} />
          </Link>
        }
      />
      <div className={styles.scheduleGrid}>
        <div className={styles.scheduleHead}>
          <span>Ажлын нэр</span>
          <div className={styles.scheduleMonth}>{monthLabel()}</div>
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {items.map((item) => (
          <div key={item.id} className={styles.scheduleRow}>
            <span>{item.title}</span>
            <div className={styles.scheduleTrack}>
              <i style={scheduleBarStyle(item)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComparisonFallbackItems(cards: DashboardComparisonCard[]) {
  return cards.slice(0, 4).map((card) => ({
    id: card.id,
    title: card.title,
    subtitle: card.subtitle,
    statusLabel: card.metric,
    tone: card.tone,
    href: card.href,
    meta: [card.note],
    actionLabel: "Нээх",
  })) satisfies DashboardItem[];
}

export function DashboardView({
  session,
  snapshot,
  todayAssignments,
  fleetBoard,
  fleetLoadError = "",
}: DashboardViewProps) {
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const workerMode = isWorkerOnly(session);
  const roleLabel = getRoleLabel(session.role);
  const model = buildDashboardModel({
    session,
    snapshot,
    todayAssignments,
  });

  const todayCard = findSummaryCard(model.summaryCards, "today");
  const overdueCard = findSummaryCard(model.summaryCards, "overdue");
  const reviewCard = findSummaryCard(model.summaryCards, "review");
  const riskCard = findSummaryCard(model.summaryCards, "risk");
  const completionCard = findSummaryCard(model.summaryCards, "completion");
  const currentDateKey = todayKey();
  const scopedTasks =
    workerMode
      ? snapshot.taskDirectory.filter((task) => task.assigneeIds?.includes(session.uid))
      : snapshot.taskDirectory;
  const dashboardTasks = scopedTasks.length ? scopedTasks : snapshot.taskDirectory;
  const totalTasks = dashboardTasks.length || snapshot.totalTasks || 0;
  const completedTasks = dashboardTasks.filter((task) => task.statusKey === "verified").length;
  const workingTasks = dashboardTasks.filter((task) => task.statusKey === "working").length;
  const reviewTasks = dashboardTasks.filter((task) => task.statusKey === "review").length;
  const plannedTasks = dashboardTasks.filter((task) => task.statusKey === "planned").length;
  const problemTasks = dashboardTasks.filter((task) => task.statusKey === "problem").length;
  const overdueTasks = dashboardTasks.filter((task) => isOverdue(task, currentDateKey)).length;
  const activeTasks = workingTasks + reviewTasks + plannedTasks;
  const completion = parsePercent(completionCard?.value ?? "0%");
  const todayCount = toNumber(todayCard?.value);
  const alertCount =
    toNumber(overdueCard?.value) + toNumber(reviewCard?.value) + toNumber(riskCard?.value);
  const activeTodaySection = model.actionSections.find((section) => section.id === "activeToday");
  const urgentSection = model.actionSections.find((section) => section.id === "urgent");
  const reviewSection = model.actionSections.find((section) => section.id === "review");
  const pendingSection = model.actionSections.find((section) => section.id === "pending");
  const activeTodayItems = activeTodaySection?.items ?? [];
  const nextWeekItems =
    pendingSection?.items.length
      ? pendingSection.items
      : activeTodayItems.length
        ? activeTodayItems
        : ComparisonFallbackItems(model.comparisonCards);
  const attentionRows = [
    ...panelRowsFromItems(urgentSection?.items ?? []),
    ...model.overdueRows.map(rowFromAction),
    ...panelRowsFromItems(reviewSection?.items ?? []),
    ...model.reviewRows.map(rowFromAction),
  ];
  const uniqueAttentionRows = Array.from(
    new Map(attentionRows.map((row) => [row.id, row])).values(),
  );
  const topMetrics: SummaryMetric[] = [
    {
      id: "total",
      label: "Нийт ажил",
      value: String(totalTasks),
      delta: "100%",
      note: "бүгд",
      tone: "good",
      href: "/projects",
      icon: "clipboard",
    },
    {
      id: "done",
      label: "Гүйцэтгэсэн ажил",
      value: String(completedTasks),
      delta: formatPercent(completedTasks, totalTasks),
      note: "хугацаандаа",
      tone: "good",
      href: "/tasks?filter=verified",
      icon: "check",
    },
    {
      id: "active",
      label: "Явагдаж байгаа",
      value: String(activeTasks),
      delta: formatPercent(activeTasks, totalTasks),
      note: "ажиллаж байна",
      tone: "attention",
      href: "/tasks",
      icon: "clock",
    },
    {
      id: "overdue",
      label: "Хугацаа хэтэрсэн",
      value: String(overdueTasks || toNumber(overdueCard?.value)),
      delta: formatPercent(overdueTasks || toNumber(overdueCard?.value), totalTasks),
      note: "яаралтай анхаар",
      tone: overdueTasks || toNumber(overdueCard?.value) ? "urgent" : "muted",
      href: "/tasks?filter=overdue",
      icon: "alert",
    },
    {
      id: "closed",
      label: "Дууссан",
      value: String(completedTasks),
      delta: formatPercent(completedTasks, totalTasks),
      note: "энэ сар",
      tone: "good",
      href: "/reports",
      icon: "flag",
    },
  ];
  const todaySegments: DonutSegment[] = [
    {
      label: "Дууссан",
      value: Math.max(completedTasks, 0),
      color: "#4dae68",
      tone: "good",
    },
    {
      label: "Явагдаж байгаа",
      value: Math.max(workingTasks + reviewTasks, 0),
      color: "#f0bd36",
      tone: "attention",
    },
    {
      label: "Хүлээгдэж байгаа",
      value: Math.max(plannedTasks, 0),
      color: "#5a93d8",
      tone: "muted",
    },
  ];
  const performanceSegments: DonutSegment[] = [
    {
      label: STATUS_LABELS.verified,
      value: completedTasks,
      color: STATUS_COLORS.verified,
      tone: "good",
    },
    {
      label: STATUS_LABELS.working,
      value: workingTasks,
      color: STATUS_COLORS.working,
      tone: "good",
    },
    {
      label: STATUS_LABELS.review,
      value: reviewTasks,
      color: STATUS_COLORS.review,
      tone: "attention",
    },
    {
      label: "Хугацаа хэтэрсэн",
      value: overdueTasks || problemTasks,
      color: STATUS_COLORS.overdue,
      tone: "urgent",
    },
  ];
  const scheduleSource =
    dashboardTasks.length
      ? dashboardTasks
      : snapshot.projects.slice(0, 4).map((project) => ({
          id: project.id,
          name: project.name,
          statusKey: "working" as TaskStatusKey,
        }));
  const scheduleItems: ScheduleItem[] = scheduleSource.slice(0, 4).map((item, index) => ({
    id: String(item.id),
    title: item.name,
    start: index + 1,
    span: Math.min(4, 2 + (index % 3)),
    color: STATUS_COLORS["statusKey" in item ? item.statusKey : "working"] ?? STATUS_COLORS.working,
  }));

  return (
    <main className={styles.shell}>
      <div className={styles.layoutGrid}>
        <aside className={styles.sideRail}>
          <DashboardSidebar
            alertCount={alertCount}
            canCreateProject={canCreateProject}
            canCreateTasks={canCreateTasks}
            canWriteReports={canWriteReports}
            canUseFieldConsole={canUseFieldConsole}
            canViewQualityCenter={canViewQualityCenter}
          />
        </aside>

        <div className={styles.mainColumn}>
          <header className={styles.dashboardHeader}>
            <div>
              <h1>Хяналтын самбар</h1>
              <span>{model.scopeLabel}</span>
            </div>
            <div className={styles.headerActions}>
              <div className={styles.datePill}>
                <span>{formatHeaderDate()}</span>
                <Icon name="calendar" className={styles.dashboardIcon} />
              </div>
              <div className={styles.notificationButton} aria-label="Мэдэгдэл">
                <Icon name="bell" className={styles.dashboardIcon} />
                {alertCount ? <span>{alertCount}</span> : null}
              </div>
              <Link href="/profile" className={styles.headerUser}>
                <span>{session.name}</span>
                <small>{roleLabel}</small>
              </Link>
            </div>
          </header>

          {model.sourceNotice ? (
            <section className={styles.sourceNotice}>
              <div className={styles.sourceCopy}>
                <strong>{model.sourceNotice.title}</strong>
                <p className={styles.sourceNoticeBody}>{model.sourceNotice.body}</p>
              </div>
              <Link href={model.sourceNotice.href} className={styles.noticeLink}>
                {model.sourceNotice.actionLabel}
              </Link>
            </section>
          ) : null}

          <section className={styles.metricGrid} aria-label="Нийт үзүүлэлт">
            {topMetrics.map((metric) => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </section>

          <section className={styles.dashboardContentGrid}>
            <TodayOverview
              todayCount={todayCount}
              segments={todaySegments}
              items={activeTodayItems}
            />
            <AttentionPanel alertCount={alertCount} rows={uniqueAttentionRows} />
            <WeekPlanPanel items={nextWeekItems} />
            <PerformancePanel completion={completion} segments={performanceSegments} />
            <EquipmentPanel
              board={fleetBoard}
              loadError={fleetLoadError}
            />
          </section>

          <ScheduleBoard items={scheduleItems} />
        </div>
      </div>
    </main>
  );
}
