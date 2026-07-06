"use client";

import { Fragment, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  CalendarDays,
  Check,
  FileWarning,
  Hourglass,
  Network,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import {
  compareHrDepartmentNames,
  getHrDepartmentDisplayName,
  getHrEmployeeDepartmentDisplayName,
} from "@/lib/hr-department-order";
import { formatEmployeeDisplayName } from "@/lib/hr-name";
import type { HrDepartmentJobCounts, HrDisciplineRecord, HrHeadcountTrendPoint, HrTimeoffDashboardData, HrTimeoffRequest } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import { HR_NOTIFICATION_HREF } from "./constants";
import { OrgChart } from "./org-chart";
import styles from "./hr.module.css";

type DetailKind = "total" | "active" | "leave" | "requests" | "trial";

type StatCard = {
  kind: DetailKind;
  label: string;
  value: number;
  icon: LucideIcon;
  note: string;
  href: string;
};

export type ChartSlice = {
  label: string;
  value: number;
  color: string;
};

export const STATUS_COLORS = [
  "#16a34a",
  "#2563eb",
  "#f59e0b",
  "#8b5cf6",
  "#f43f5e",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#a855f7",
  "#14b8a6",
  "#ef4444",
  "#eab308",
];

const STAT_CARD_TONE_CLASS: Record<DetailKind, string> = {
  total: styles.statCardTotal,
  active: styles.statCardActive,
  leave: styles.statCardTimeoff,
  requests: styles.statCardPending,
  trial: styles.statCardTrial,
};

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function formatPercent(value: number, total: number) {
  if (!total) return "0%";
  const percent = (value / total) * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

function requestCoversToday(request: HrTimeoffRequest, today: string) {
  return request.state === "approved" && request.dateFrom <= today && request.dateTo >= today;
}

function employeeIsInactive(employee: HrEmployeeDirectoryItem) {
  return !employee.active || ["archived", "terminated", "resigned"].includes(employee.statusKey);
}

function employeeIsListedActive(employee: HrEmployeeDirectoryItem) {
  return !employeeIsInactive(employee) && !["probation", "leave", "annual_leave", "sick", "business_trip"].includes(employee.statusKey);
}

function employeeTrialHasEnded(employee: HrEmployeeDirectoryItem, today: string) {
  return Boolean(employee.trialEndDate && /^\d{4}-\d{2}-\d{2}$/.test(employee.trialEndDate) && employee.trialEndDate <= today);
}

const CHART_SEPARATOR_COLOR = "rgba(255, 255, 255, 0.92)";

function conicGradient(slices: ChartSlice[]) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (!total) {
    return "#e8f1ea";
  }

  const visibleSlices = slices.filter((slice) => slice.value > 0);
  // Зүсэм олон бол хооронд нь нимгэн цагаан зай тавьж сегмент болгоно.
  const gap = visibleSlices.length > 1 ? 2.4 : 0;
  const half = gap / 2;

  let current = 0;
  const stops = visibleSlices.map((slice) => {
    const start = current;
    current += (slice.value / total) * 360;
    const fillStart = Math.min(start + half, current);
    const fillEnd = Math.max(current - half, fillStart);
    const segments = [`${slice.color} ${fillStart}deg ${fillEnd}deg`];
    if (gap > 0) {
      segments.push(`${CHART_SEPARATOR_COLOR} ${fillEnd}deg ${current}deg`);
    }
    return segments.join(", ");
  });
  return `conic-gradient(${stops.join(", ")})`;
}

export function AnimatedPie({
  title,
  slices,
  centerLabel,
  centerValue,
  variant = "pie",
  sideContent,
}: {
  title: string;
  slices: ChartSlice[];
  centerLabel: string;
  centerValue: string;
  variant?: "pie" | "donut";
  sideContent?: ReactNode;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const chartStyle = {
    "--chart-gradient": conicGradient(slices),
  } as CSSProperties;

  return (
    <section className={styles.chartPanel}>
      <h2>{title}</h2>
      <div className={styles.chartBody}>
        <div className={styles.chartFigure}>
          <div className={variant === "donut" ? styles.donutChart : styles.pieChart} style={chartStyle}>
            <div className={styles.chartCenter}>
              <span>{centerLabel}</span>
              <strong>{centerValue}</strong>
            </div>
          </div>
        </div>
        <div className={styles.chartSideStack}>
          {sideContent}
          <div className={styles.chartLegend}>
            {slices.map((slice, index) => (
              <div key={`${slice.label}-${index}`} className={styles.chartLegendRow}>
                <span style={{ background: slice.color }} />
                <em>{slice.label}</em>
                <strong>
                  {slice.value} ({formatPercent(slice.value, total)})
                </strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrendLineChart({
  title,
  data,
}: {
  title: string;
  data: HrHeadcountTrendPoint[];
}) {
  const width = 340;
  const height = 168;
  const padX = 26;
  const padTop = 16;
  const padBottom = 26;
  const maxValue = Math.max(1, ...data.map((point) => Math.max(point.hires, point.leaves)));
  const count = data.length;
  const x = (index: number) => (count <= 1 ? padX : padX + (index * (width - 2 * padX)) / (count - 1));
  const y = (value: number) => padTop + (1 - value / maxValue) * (height - padTop - padBottom);
  const buildLine = (key: "hires" | "leaves") =>
    data.map((point, index) => `${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  const series: { key: "hires" | "leaves"; color: string; label: string }[] = [
    { key: "hires", color: "#16a34a", label: "Шинэ томилолт" },
    { key: "leaves", color: "#ef4444", label: "Чөлөөлсөн" },
  ];

  return (
    <section className={styles.chartPanel}>
      <h2>{title}</h2>
      <div className={styles.trendChart}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" preserveAspectRatio="xMidYMid meet">
          {[0, 0.5, 1].map((ratio) => {
            const gy = padTop + ratio * (height - padTop - padBottom);
            return (
              <line
                key={ratio}
                x1={padX}
                y1={gy}
                x2={width - padX}
                y2={gy}
                stroke="rgba(15,23,42,0.08)"
                strokeWidth={1}
              />
            );
          })}
          {series.map((line) => (
            <polyline
              key={line.key}
              points={buildLine(line.key)}
              fill="none"
              stroke={line.color}
              strokeWidth={2.4}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {series.map((line) =>
            data.map((point, index) => (
              <circle
                key={`${line.key}-${index}`}
                cx={x(index)}
                cy={y(point[line.key])}
                r={3}
                fill="#fff"
                stroke={line.color}
                strokeWidth={2}
              />
            )),
          )}
          {data.map((point, index) => (
            <text
              key={`label-${index}`}
              x={x(index)}
              y={height - 8}
              textAnchor="middle"
              fontSize={10}
              fill="#6b7a72"
            >
              {point.label}
            </text>
          ))}
        </svg>
        <div className={styles.chartLegend}>
          {series.map((line) => {
            const total = data.reduce((sum, point) => sum + point[line.key], 0);
            return (
              <div key={line.key} className={styles.chartLegendRow}>
                <span style={{ background: line.color }} />
                <em>{line.label}</em>
                <strong>{total}</strong>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function AgeBarChart({
  title,
  buckets,
  averageAge,
}: {
  title: string;
  buckets: { label: string; value: number }[];
  averageAge: number;
}) {
  const maxValue = Math.max(1, ...buckets.map((bucket) => bucket.value));
  return (
    <section className={styles.chartPanel}>
      <h2>{title}</h2>
      <div className={styles.barChart}>
        {buckets.map((bucket, index) => (
          <div key={bucket.label} className={styles.barCol}>
            <span className={styles.barValue}>{bucket.value}</span>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{
                  height: `${(bucket.value / maxValue) * 100}%`,
                  background: STATUS_COLORS[index % STATUS_COLORS.length],
                }}
              />
            </div>
            <span className={styles.barLabel}>{bucket.label}</span>
          </div>
        ))}
      </div>
      <p className={styles.barCaption}>
        Дундаж нас: <strong>{averageAge ? averageAge : "—"}</strong>
      </p>
    </section>
  );
}

function dayLabel(request?: HrTimeoffRequest) {
  if (!request) return "0 өдөр";
  return `${Math.max(1, Math.round(request.durationDays || 1))} өдөр`;
}

function timeoffPriority(request: HrTimeoffRequest) {
  if (request.requestType === "sick") return 3;
  if (request.requestType === "annual_leave") return 2;
  return 1;
}

function rowInitials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("mn-MN") ?? "");
  return letters.join("") || "?";
}

function StatusEmployeeRow({
  employee,
  request,
  actions,
}: {
  employee: HrEmployeeDirectoryItem;
  request?: HrTimeoffRequest;
  actions?: ReactNode;
}) {
  const rowLink = (
    <Link
      href={`/hr/employees/${employee.id}`}
      className={`${styles.detailRow} ${styles.detailRowPerson}`}
    >
      <span className={styles.detailRowAvatar} aria-hidden>
        {employee.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={employee.photoUrl} alt="" className={styles.detailRowAvatarImg} />
        ) : (
          rowInitials(employee.name)
        )}
      </span>
      <span>
        <strong>{formatEmployeeDisplayName(employee.name)}</strong>
        <small>
          {employee.departmentName || "Хэлтэс бүртгээгүй"} · {employee.jobTitle || "Албан тушаал бүртгээгүй"}
        </small>
      </span>
      {request ? (
        <em>
          {request.dateFrom} - {request.dateTo} · {dayLabel(request)}
        </em>
      ) : (
        <em>{employee.statusLabel || "Идэвхтэй"}</em>
      )}
    </Link>
  );

  if (!actions) {
    return rowLink;
  }

  return (
    <div className={styles.detailRowWithActions}>
      {rowLink}
      <div className={styles.detailRowActions}>{actions}</div>
    </div>
  );
}

function RequestRow({ request }: { request: HrTimeoffRequest }) {
  return (
    <Link href={`/hr/leaves?employeeId=${request.employeeId}`} className={styles.detailRow}>
      <span>
        <strong>{formatEmployeeDisplayName(request.employeeName)}</strong>
        <small>
          {request.departmentName || "Хэлтэс бүртгээгүй"} · {request.requestTypeLabel}
        </small>
      </span>
      <em>
        {request.dateFrom} - {request.dateTo} · {dayLabel(request)}
      </em>
    </Link>
  );
}

function DetailGroupHeader({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.detailGroupHeader}>
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

function TrialConfirmationForm({
  employee,
  pending,
  message,
  today,
  onSubmit,
  onCancel,
}: {
  employee: HrEmployeeDirectoryItem;
  pending: boolean;
  message?: { text: string; isError: boolean };
  today: string;
  onSubmit: (event: FormEvent<HTMLFormElement>, employeeId: number) => void;
  onCancel: () => void;
}) {
  return (
    <form className={styles.trialActionForm} onSubmit={(event) => onSubmit(event, employee.id)}>
      <div className={styles.trialActionFormHeader}>
        <strong>{formatEmployeeDisplayName(employee.name)} - жинхлэх</strong>
        <button type="button" className={styles.trialActionGhostButton} onClick={onCancel} disabled={pending}>
          Болих
        </button>
      </div>
      <label>
        <span>Жинхэлсэн огноо</span>
        <input name="permanentDate" type="date" defaultValue={today} required />
      </label>
      <label>
        <span>Тушаалын дугаар</span>
        <input name="orderNumber" required placeholder="Ж: A/01" />
      </label>
      <label>
        <span>Тушаалын файл</span>
        <input name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" />
      </label>
      <label className={styles.trialActionFormWide}>
        <span>Тайлбар</span>
        <textarea name="note" rows={2} placeholder="Заавал биш" />
      </label>
      {message ? (
        <p className={message.isError ? styles.trialActionError : styles.trialActionSuccess}>{message.text}</p>
      ) : null}
      <div className={styles.trialActionFormActions}>
        <button className={styles.trialPromoteButton} disabled={pending}>
          <Check aria-hidden />
          <span>{pending ? "Жинхэлж байна..." : "Жинхлэх"}</span>
        </button>
      </div>
    </form>
  );
}

function PendingRequestQueue({ requests }: { requests: HrTimeoffRequest[] }) {
  const submittedCount = requests.filter((request) => request.state === "submitted").length;
  const reviewCount = requests.filter((request) => request.state === "hr_review").length;
  const visibleRequests = requests.slice(0, 4);

  return (
    <section className={styles.pendingQueuePanel}>
      <div className={styles.pendingQueueHeader}>
        <div>
          <span className={styles.eyebrow}>Хяналт хүлээж буй</span>
          <h2>Хүлээгдэж буй хүсэлтүүд</h2>
          <p>Шинээр ирсэн болон HR шалгалтад орсон чөлөө, өвчтэй хүсэлтүүдийг түрүүлж хянана.</p>
        </div>
        <div className={styles.pendingQueueStats}>
          <span>
            <strong>{requests.length}</strong>
            <small>нийт</small>
          </span>
          <span>
            <strong>{submittedCount}</strong>
            <small>шинэ</small>
          </span>
          <span>
            <strong>{reviewCount}</strong>
            <small>шалгаж байна</small>
          </span>
        </div>
      </div>

      {visibleRequests.length ? (
        <div className={styles.pendingRequestGrid}>
          {visibleRequests.map((request) => (
            <Link key={request.id} href={`/hr/leaves?state=${request.state}`} className={styles.pendingRequestCard}>
              <div>
                <strong>{formatEmployeeDisplayName(request.employeeName)}</strong>
                <span>{request.departmentName || "Хэлтэс бүртгээгүй"}</span>
              </div>
              <p>
                {request.requestTypeLabel} · {request.dateFrom} - {request.dateTo} · {dayLabel(request)}
              </p>
              <footer>
                <em>{request.stateLabel}</em>
                <small>{request.hasAttachment ? "Хавсралттай" : "Хавсралтгүй"}</small>
              </footer>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.pendingQueueEmpty}>
          <strong>Одоогоор хүлээгдэж буй хүсэлт алга.</strong>
          <span>Шинэ хүсэлт ирэхэд энэ хэсэгт шууд харагдана.</span>
        </div>
      )}

      <div className={styles.pendingQueueActions}>
        <Link href={HR_NOTIFICATION_HREF}>Шинэ хүсэлтүүдийг хянах</Link>
        <Link href="/hr/leaves">Бүх хүсэлт харах</Link>
      </div>
    </section>
  );
}

export function HrDashboardClient({
  accessMode,
  employees,
  requests,
  dashboard,
  disciplineRecords = [],
  departmentJobCounts = [],
  headcountTrend = [],
}: {
  accessMode: "hr" | "department";
  employees: HrEmployeeDirectoryItem[];
  requests: HrTimeoffRequest[];
  dashboard: HrTimeoffDashboardData | null;
  disciplineRecords?: HrDisciplineRecord[];
  departmentJobCounts?: HrDepartmentJobCounts[];
  headcountTrend?: HrHeadcountTrendPoint[];
}) {
  const router = useRouter();
  const [trialActionEmployeeId, setTrialActionEmployeeId] = useState<number | null>(null);
  const [trialActionPendingEmployeeId, setTrialActionPendingEmployeeId] = useState<number | null>(null);
  const [trialActionMessage, setTrialActionMessage] = useState<{ employeeId: number; text: string; isError: boolean } | null>(null);
  const today = todayKey();

  const currentRequestByEmployee = useMemo(() => {
    const current = new Map<number, HrTimeoffRequest>();
    for (const request of requests) {
      if (!requestCoversToday(request, today)) continue;
      const previous = current.get(request.employeeId);
      if (!previous || timeoffPriority(request) > timeoffPriority(previous)) {
        current.set(request.employeeId, request);
      }
    }
    return current;
  }, [requests, today]);

  const workforceEmployees = employees.filter((employee) => !employeeIsInactive(employee));
  const activeEmployees = workforceEmployees.filter((employee) => employeeIsListedActive(employee) && !currentRequestByEmployee.has(employee.id));
  const trialEmployees = workforceEmployees.filter((employee) => employee.statusKey === "probation");
  const trialEndedEmployees = trialEmployees.filter((employee) => employeeTrialHasEnded(employee, today));
  const trialInProgressEmployees = trialEmployees.filter((employee) => !employeeTrialHasEnded(employee, today));
  const timeoffEmployees = workforceEmployees.filter((employee) => currentRequestByEmployee.get(employee.id)?.requestType === "time_off");
  const annualLeaveEmployees = workforceEmployees.filter((employee) => currentRequestByEmployee.get(employee.id)?.requestType === "annual_leave");
  const sickEmployees = workforceEmployees.filter((employee) => currentRequestByEmployee.get(employee.id)?.requestType === "sick");
  const pendingRequests = requests.filter((request) => ["submitted", "hr_review"].includes(request.state));
  const approvedRequests = requests.filter((request) => request.state === "approved");
  const cardsSource = dashboard?.cards;

  // Нэмэлт үзүүлэлт: насны бүтэц, дундаж нас, хүйс
  const currentYear = Number(today.slice(0, 4));
  const employeeAges = workforceEmployees
    .map((employee) => {
      const birthYear = Number((employee.birthDate || "").slice(0, 4));
      return birthYear > 1900 && currentYear ? currentYear - birthYear : null;
    })
    .filter((age): age is number => age !== null && age > 14 && age < 100);
  const averageAge = employeeAges.length
    ? Math.round(employeeAges.reduce((sum, age) => sum + age, 0) / employeeAges.length)
    : 0;
  const AGE_BUCKET_DEFS: { label: string; min: number; max: number }[] = [
    { label: "18-25", min: 18, max: 25 },
    { label: "26-35", min: 26, max: 35 },
    { label: "36-45", min: 36, max: 45 },
    { label: "46-55", min: 46, max: 55 },
    { label: "56+", min: 56, max: 200 },
  ];
  const ageBuckets = AGE_BUCKET_DEFS.map((bucket) => ({
    label: bucket.label,
    value: employeeAges.filter((age) => age >= bucket.min && age <= bucket.max).length,
  }));
  const maleCount = workforceEmployees.filter((employee) => employee.genderKey === "male").length;
  const femaleCount = workforceEmployees.filter((employee) => employee.genderKey === "female").length;
  const genderSlices: ChartSlice[] = [
    { label: "Эрэгтэй", value: maleCount, color: "#2563eb" },
    { label: "Эмэгтэй", value: femaleCount, color: "#ec4899" },
  ];
  // Зөвхөн үйлдвэрлэлийн 3 хэлтэс (Захиргаа, Санхүү, Удирдлага-г оруулахгүй)
  const DEPARTMENT_POSITION_EXCLUDE = ["захиргаа", "санхүү", "удирдлага"];
  const departmentPositionCharts = departmentJobCounts
    .filter((bucket) => bucket.total > 0)
    .filter((bucket) => {
      const name = bucket.departmentName.toLowerCase();
      return !DEPARTMENT_POSITION_EXCLUDE.some((keyword) => name.includes(keyword));
    })
    .slice()
    .sort((left, right) => right.total - left.total)
    .map((bucket) => ({
      name: bucket.departmentName.split(" / ").pop() || bucket.departmentName,
      total: bucket.total,
      slices: bucket.jobCounts
        .slice()
        .sort((left, right) => {
          // Хэлтсийн даргыг эхэнд, дараа нь тоогоор
          const leftHead = /дарга/i.test(left.title) ? 0 : 1;
          const rightHead = /дарга/i.test(right.title) ? 0 : 1;
          return leftHead - rightHead || right.count - left.count;
        })
        .map((entry, index) => ({
          label: entry.title,
          value: entry.count,
          color: STATUS_COLORS[index % STATUS_COLORS.length],
        })),
    }));

  const cards: StatCard[] = [
    {
      kind: "total",
      label: "Нийт ажилтан",
      value: workforceEmployees.length,
      icon: Users,
      note: accessMode === "hr" ? "Идэвхтэй бүртгэл" : "Миний хэлтэс",
      href: "/hr/employees?status=__all__",
    },
    {
      kind: "active",
      label: "Идэвхтэй",
      value: activeEmployees.length,
      icon: Activity,
      note: "Өнөөдрийн динамик төлөв",
      href: "/hr/employees?status=Идэвхтэй",
    },
    {
      kind: "leave",
      label: "Чөлөө, амралт",
      value: timeoffEmployees.length + annualLeaveEmployees.length + sickEmployees.length,
      icon: CalendarDays,
      note: "Чөлөө / ээлжийн амралт / өвчтэй",
      href: "/hr/sick",
    },
    {
      kind: "requests",
      label: "Хүсэлт",
      value:
        (cardsSource?.pendingRequests ?? pendingRequests.length) +
        (cardsSource?.approvedRequests ?? approvedRequests.length),
      icon: FileWarning,
      note: "Хүлээгдэж буй + батлагдсан",
      href: "/hr/leaves",
    },
    {
      kind: "trial",
      label: "Туршилт",
      value: trialEmployees.length,
      icon: Hourglass,
      note: "Туршилтад байгаа болон дууссан",
      href: "/hr/employees?status=Туршилт",
    },
  ];

  const statusSlices: ChartSlice[] = [
    { label: "Идэвхтэй ажилтан", value: activeEmployees.length, color: STATUS_COLORS[0] },
    { label: "Чөлөөтэй", value: timeoffEmployees.length, color: STATUS_COLORS[1] },
    { label: "Ээлжийн амралттай", value: annualLeaveEmployees.length, color: STATUS_COLORS[2] },
    { label: "Өвчтэй", value: sickEmployees.length, color: STATUS_COLORS[3] },
    { label: "Хүлээгдэж буй хүсэлт", value: pendingRequests.length, color: STATUS_COLORS[4] },
  ];

  const disciplineTypeSlices: ChartSlice[] = Array.from(
    disciplineRecords.reduce((groups, record) => {
      const label = record.violationTypeLabel || "Бусад";
      groups.set(label, (groups.get(label) ?? 0) + 1);
      return groups;
    }, new Map<string, number>()),
    ([label, value]) => ({ label, value }),
  )
    .sort((left, right) => right.value - left.value)
    .slice(0, 7)
    .map((slice, index) => ({
      ...slice,
      color: STATUS_COLORS[index % STATUS_COLORS.length],
    }));

  const disciplineEmployeeLeaders = Array.from(
    disciplineRecords
      .reduce((groups, record) => {
        const key = String(record.employeeId || record.employeeName || "unknown");
        const current = groups.get(key) ?? {
          employeeId: record.employeeId,
          employeeName: record.employeeName || "Ажилтан бүртгээгүй",
          departmentName: record.departmentName || "Хэлтэс бүртгээгүй",
          count: 0,
        };
        current.count += 1;
        groups.set(key, current);
        return groups;
      }, new Map<string, { employeeId: number | null; employeeName: string; departmentName: string; count: number }>())
      .values(),
  )
    .sort((left, right) => right.count - left.count || left.employeeName.localeCompare(right.employeeName, "mn"))
    .slice(0, 5);

  const departmentBreakdown = (() => {
    const rows = new Map<string, HrTimeoffDashboardData["departmentBreakdown"][number]>();
    for (const employee of workforceEmployees) {
      // Түүхий departmentId биш, КАНОНЧИЛСОН хэлтсийн нэрээр бүлэглэнэ. Эс бол
      // нэг departmentId доторх ажилтнууд (жиш. Захиргааны алба) тухайн бүлгийн
      // эхний ажилтны нэрээр (Нарангоо → "Дотоод хяналт") бүхэлдээ шошголдог.
      // "Дотоод хяналт" (1 хүн) нь Захиргааны албаны ажилтан тул Захиргаа руу
      // бүтнээр нэгтгэж, тусад нь зүсэм гаргахгүй.
      const canonicalDepartment = getHrEmployeeDepartmentDisplayName(
        employee.name,
        employee.departmentName || "Хэлтэс бүртгээгүй",
        employee.jobTitle,
      );
      const key = canonicalDepartment === "Дотоод хяналт" ? "Захиргаа" : canonicalDepartment;
      if (!rows.has(key)) {
        rows.set(key, {
          departmentId: employee.departmentId || 0,
          departmentName: key,
          totalEmployees: 0,
          activeEmployees: 0,
          timeOffEmployees: 0,
          annualLeaveEmployees: 0,
          sickEmployees: 0,
          pendingRequests: 0,
        });
      }
      const row = rows.get(key)!;
      const requestType = currentRequestByEmployee.get(employee.id)?.requestType;
      row.totalEmployees += 1;
      if (requestType === "sick") {
        row.sickEmployees += 1;
      } else if (requestType === "annual_leave") {
        row.annualLeaveEmployees += 1;
      } else if (requestType === "time_off") {
        row.timeOffEmployees += 1;
      } else if (employeeIsListedActive(employee)) {
        row.activeEmployees += 1;
      }
    }
    for (const request of pendingRequests) {
      const canonical = getHrDepartmentDisplayName(request.departmentName || "Хэлтэс бүртгээгүй");
      const key = canonical === "Дотоод хяналт" ? "Захиргаа" : canonical;
      const row = rows.get(key);
      if (row) row.pendingRequests += 1;
    }
    return Array.from(rows.values());
  })();

  const departmentSlices: ChartSlice[] = departmentBreakdown
    .slice()
    .sort((left, right) => compareHrDepartmentNames(left.departmentName, right.departmentName))
    .slice(0, 7)
    .map((row, index) => ({
      label: row.departmentName,
      value: row.totalEmployees,
      color: STATUS_COLORS[index % STATUS_COLORS.length],
    }));

  async function submitTrialConfirmation(event: FormEvent<HTMLFormElement>, employeeId: number) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setTrialActionPendingEmployeeId(employeeId);
    setTrialActionMessage(null);

    try {
      const response = await fetch(`/api/hr/employees/${employeeId}/confirm-trial`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Ажилтныг жинхлэхэд алдаа гарлаа.");
      }

      setTrialActionEmployeeId(null);
      setTrialActionMessage({ employeeId, text: "Ажилтан жинхлэгдлээ.", isError: false });
      router.refresh();
    } catch (error) {
      setTrialActionMessage({
        employeeId,
        text: error instanceof Error ? error.message : "Ажилтныг жинхлэхэд алдаа гарлаа.",
        isError: true,
      });
    } finally {
      setTrialActionPendingEmployeeId(null);
    }
  }

  function renderTrialEndedActions(employee: HrEmployeeDirectoryItem) {
    const isFormOpen = trialActionEmployeeId === employee.id;

    return (
      <div className={styles.trialActionButtons}>
        <button
          type="button"
          className={styles.trialPromoteButton}
          onClick={() => {
            setTrialActionEmployeeId(isFormOpen ? null : employee.id);
            setTrialActionMessage(null);
          }}
          disabled={Boolean(trialActionPendingEmployeeId)}
        >
          <Check aria-hidden />
          <span>Жинхлэх</span>
        </button>
        <Link className={styles.trialRejectButton} href={`/hr/archive?employeeId=${employee.id}`}>
          <XCircle aria-hidden />
          <span>Татгалзах</span>
        </Link>
      </div>
    );
  }

  function renderTrialEndedExtra(employee: HrEmployeeDirectoryItem) {
    const isPending = trialActionPendingEmployeeId === employee.id;
    const message = trialActionMessage?.employeeId === employee.id ? trialActionMessage : undefined;
    if (trialActionEmployeeId === employee.id) {
      return (
        <div className={styles.trialActionRow}>
          <TrialConfirmationForm
            employee={employee}
            pending={isPending}
            message={message}
            today={today}
            onSubmit={submitTrialConfirmation}
            onCancel={() => setTrialActionEmployeeId(null)}
          />
        </div>
      );
    }
    if (!message) {
      return null;
    }
    return (
      <p className={`${styles.trialActionInlineMessage} ${message.isError ? styles.trialActionError : styles.trialActionSuccess}`}>
        {message.text}
      </p>
    );
  }

  // Эхний donut-д харагдах зүсмүүд ба тэдгээрийн нийлбэр (төв тоо зүсмүүдтэй нийцнэ).
  const statusChartSlices = statusSlices.slice(0, 3);
  const statusChartTotal = statusChartSlices.reduce((sum, slice) => sum + slice.value, 0);

  const chartsSection = (
    <div className={styles.chartGrid}>
      <AnimatedPie
        title="Байгууллагын ажилтаны тоо"
        slices={departmentSlices}
        centerLabel="Ажилтан"
        centerValue={`${cards[0].value}`}
        variant="donut"
      />
      <AnimatedPie
        title="Идэвхтэй, чөлөөтэй, амралттай харьцаа"
        slices={statusChartSlices}
        centerLabel="Нийт"
        centerValue={`${statusChartTotal}`}
        variant="donut"
      />
      <AnimatedPie
        title="Хүйсийн харьцаа"
        slices={genderSlices}
        centerLabel="Нийт"
        centerValue={`${maleCount + femaleCount}`}
        variant="donut"
      />
      <TrendLineChart title="Шинэ болон чөлөөлсөн ажилтан (сүүлийн 6 сар)" data={headcountTrend} />
      <AnimatedPie
        title="Сахилгын бүртгэлийн төрөл"
        slices={disciplineTypeSlices}
        centerLabel="Нийт"
        centerValue={`${disciplineRecords.length}`}
        variant="donut"
        sideContent={
          <div className={styles.chartTopList}>
            <div className={styles.chartTopListHeader}>
              <strong>Top 5 ажилтан</strong>
              <span>Нийт {disciplineRecords.length} бүртгэл</span>
            </div>
            {disciplineEmployeeLeaders.length ? (
              disciplineEmployeeLeaders.map((item, index) =>
                item.employeeId ? (
                  <Link key={item.employeeId} href={`/hr/employees/${item.employeeId}`} className={styles.chartTopRow}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{formatEmployeeDisplayName(item.employeeName)}</strong>
                      <small>{item.departmentName}</small>
                    </div>
                    <em>
                      {item.count} ({formatPercent(item.count, disciplineRecords.length)})
                    </em>
                  </Link>
                ) : (
                  <div key={item.employeeName} className={styles.chartTopRow}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{formatEmployeeDisplayName(item.employeeName)}</strong>
                      <small>{item.departmentName}</small>
                    </div>
                    <em>
                      {item.count} ({formatPercent(item.count, disciplineRecords.length)})
                    </em>
                  </div>
                ),
              )
            ) : (
              <p>Одоогоор сахилгын бүртгэл алга.</p>
            )}
          </div>
        }
      />
      <AgeBarChart title="Насны бүтэц" buckets={ageBuckets} averageAge={averageAge} />
    </div>
  );

  return (
    <>
      <div className={styles.statHeading}>
        <span className={styles.eyebrow}>Үндсэн үзүүлэлт</span>
        <p>Аль нэг үзүүлэлт дээр дарж дэлгэрэнгүй жагсаалт руу шилжинэ.</p>
      </div>

      <section className={styles.statGrid}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.kind}
              href={card.href}
              className={`${styles.statCard} ${STAT_CARD_TONE_CLASS[card.kind]}`}
            >
              <span className={styles.statIcon}>
                <Icon aria-hidden />
              </span>
              <div>
                <small>{card.label}</small>
                <strong>{card.value}</strong>
                <p>{card.note}</p>
              </div>
            </Link>
          );
        })}
      </section>

      {chartsSection}

      {departmentPositionCharts.length > 0 ? (
        <>
          <div className={styles.statHeading}>
            <span className={styles.eyebrow}>Хэлтсийн бүтэц</span>
            <p>Хэлтэс тус бүрийн ажилтныг албан тушаалаар харуулав.</p>
          </div>
          <div className={styles.chartGrid}>
            {departmentPositionCharts.map((department) => (
              <AnimatedPie
                key={department.name}
                title={department.name}
                slices={department.slices}
                centerLabel="Ажилтан"
                centerValue={`${department.total}`}
                variant="donut"
              />
            ))}
          </div>
        </>
      ) : null}

      {departmentJobCounts.length > 0 ? (
        <section className={styles.orgSection}>
          <header className={styles.orgSectionHead}>
            <span className={styles.orgSectionIcon}>
              <Network aria-hidden size={16} />
            </span>
            <div>
              <h2>Байгууллагын бүтэц</h2>
              <p>Батлагдсан орон тоо ба бодит томилолт. Албан тушаал бүрийн бодит/орон тоог Odoo-гоос амьдаар харьцуулна.</p>
            </div>
          </header>
          <OrgChart jobCounts={departmentJobCounts} />
        </section>
      ) : null}
    </>
  );
}
