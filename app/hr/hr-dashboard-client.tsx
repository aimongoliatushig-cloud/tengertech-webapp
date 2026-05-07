"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ClipboardPlus,
  FileCheck2,
  FileWarning,
  HeartPulse,
  ShieldAlert,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { HrDisciplineRecord, HrTimeoffDashboardData, HrTimeoffRequest } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import styles from "./hr.module.css";

type DetailKind = "total" | "active" | "timeoff" | "sick" | "pending" | "approved" | "rejected";

type StatCard = {
  kind: DetailKind;
  label: string;
  value: number;
  icon: LucideIcon;
  note: string;
};

type ChartSlice = {
  label: string;
  value: number;
  color: string;
};

const STATUS_COLORS = ["#2e7d32", "#3f7ee8", "#f2ad13", "#7c6de8", "#9aa4b2", "#ef4d84", "#39b6c8"];

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatPercent(value: number, total: number) {
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

function conicGradient(slices: ChartSlice[]) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (!total) {
    return "#e8f1ea";
  }

  let current = 0;
  const stops = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const start = current;
      current += (slice.value / total) * 360;
      return `${slice.color} ${start}deg ${current}deg`;
    });
  return `conic-gradient(${stops.join(", ")})`;
}

function AnimatedPie({
  title,
  slices,
  centerLabel,
  centerValue,
  variant = "pie",
  sideContent,
  chartNote,
}: {
  title: string;
  slices: ChartSlice[];
  centerLabel: string;
  centerValue: string;
  variant?: "pie" | "donut";
  sideContent?: ReactNode;
  chartNote?: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const largestSlice = slices.reduce<ChartSlice | null>(
    (largest, slice) => (!largest || slice.value > largest.value ? slice : largest),
    null,
  );
  const defaultChartNote = largestSlice ? `${largestSlice.label}: ${formatPercent(largestSlice.value, total)}` : "0%";
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
          <strong>{chartNote ?? defaultChartNote}</strong>
        </div>
        <div className={styles.chartSideStack}>
          {sideContent}
          <div className={styles.chartLegend}>
            {slices.map((slice) => (
              <div key={slice.label} className={styles.chartLegendRow}>
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

function dayLabel(request?: HrTimeoffRequest) {
  if (!request) return "0 өдөр";
  return `${Math.max(1, Math.round(request.durationDays || 1))} өдөр`;
}

function StatusEmployeeRow({
  employee,
  request,
}: {
  employee: HrEmployeeDirectoryItem;
  request?: HrTimeoffRequest;
}) {
  return (
    <Link href={`/hr/employees/${employee.id}`} className={styles.detailRow}>
      <span>
        <strong>{employee.name}</strong>
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
}

function RequestRow({ request }: { request: HrTimeoffRequest }) {
  return (
    <Link href={`/hr/leaves?employeeId=${request.employeeId}`} className={styles.detailRow}>
      <span>
        <strong>{request.employeeName}</strong>
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

export function HrDashboardClient({
  accessMode,
  employees,
  requests,
  dashboard,
  disciplineRecords = [],
}: {
  accessMode: "hr" | "department";
  employees: HrEmployeeDirectoryItem[];
  requests: HrTimeoffRequest[];
  dashboard: HrTimeoffDashboardData | null;
  disciplineRecords?: HrDisciplineRecord[];
}) {
  const [detailKind, setDetailKind] = useState<DetailKind>("timeoff");
  const today = todayKey();

  const currentRequestByEmployee = useMemo(() => {
    const current = new Map<number, HrTimeoffRequest>();
    for (const request of requests) {
      if (!requestCoversToday(request, today)) continue;
      const previous = current.get(request.employeeId);
      if (!previous || request.requestType === "sick") {
        current.set(request.employeeId, request);
      }
    }
    return current;
  }, [requests, today]);

  const activeEmployees = employees.filter((employee) => !employeeIsInactive(employee) && !currentRequestByEmployee.has(employee.id));
  const timeoffEmployees = employees.filter((employee) => currentRequestByEmployee.get(employee.id)?.requestType === "time_off");
  const sickEmployees = employees.filter((employee) => currentRequestByEmployee.get(employee.id)?.requestType === "sick");
  const pendingRequests = requests.filter((request) => ["submitted", "hr_review"].includes(request.state));
  const approvedRequests = requests.filter((request) => request.state === "approved");
  const rejectedRequests = requests.filter((request) => request.state === "rejected");
  const cardsSource = dashboard?.cards;

  const cards: StatCard[] = [
    {
      kind: "total",
      label: "Нийт ажилтан",
      value: cardsSource?.totalEmployees ?? employees.length,
      icon: Users,
      note: accessMode === "hr" ? "Бүх хэлтэс" : "Миний хэлтэс",
    },
    {
      kind: "active",
      label: "Идэвхтэй",
      value: cardsSource?.activeEmployees ?? activeEmployees.length,
      icon: Activity,
      note: "Өнөөдрийн динамик төлөв",
    },
    {
      kind: "timeoff",
      label: "Чөлөөтэй",
      value: cardsSource?.timeOffEmployees ?? timeoffEmployees.length,
      icon: ClipboardPlus,
      note: "Батлагдсан хүсэлт хүчинтэй",
    },
    {
      kind: "sick",
      label: "Өвчтэй",
      value: cardsSource?.sickEmployees ?? sickEmployees.length,
      icon: HeartPulse,
      note: "Батлагдсан өвчтэй хүсэлт",
    },
    {
      kind: "pending",
      label: "Хүлээгдэж буй хүсэлт",
      value: cardsSource?.pendingRequests ?? pendingRequests.length,
      icon: FileWarning,
      note: "Илгээсэн / хүний нөөц шалгаж байна",
    },
    {
      kind: "approved",
      label: "Батлагдсан",
      value: cardsSource?.approvedRequests ?? approvedRequests.length,
      icon: FileCheck2,
      note: "Хүний нөөц баталсан",
    },
    {
      kind: "rejected",
      label: "Татгалзсан",
      value: cardsSource?.rejectedRequests ?? rejectedRequests.length,
      icon: ShieldAlert,
      note: "Хүний нөөц татгалзсан",
    },
  ];

  const statusSlices: ChartSlice[] = [
    { label: "Идэвхтэй ажилтан", value: cards[1].value, color: STATUS_COLORS[0] },
    { label: "Чөлөөтэй", value: cards[2].value, color: STATUS_COLORS[1] },
    { label: "Өвчтэй", value: cards[3].value, color: STATUS_COLORS[2] },
    { label: "Хүлээгдэж буй хүсэлт", value: cards[4].value, color: STATUS_COLORS[3] },
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

  const departmentBreakdown =
    dashboard?.departmentBreakdown?.length
      ? dashboard.departmentBreakdown
      : Array.from(
          employees.reduce((groups, employee) => {
            const name = employee.departmentName || "Хэлтэс бүртгээгүй";
            groups.set(name, (groups.get(name) ?? 0) + 1);
            return groups;
          }, new Map<string, number>()),
          ([departmentName, totalEmployees]) => ({
            departmentId: 0,
            departmentName,
            totalEmployees,
            activeEmployees: 0,
            timeOffEmployees: 0,
            sickEmployees: 0,
            pendingRequests: 0,
          }),
        );

  const departmentSlices: ChartSlice[] = departmentBreakdown
    .slice()
    .sort((left, right) => right.totalEmployees - left.totalEmployees)
    .slice(0, 7)
    .map((row, index) => ({
      label: row.departmentName,
      value: row.totalEmployees,
      color: STATUS_COLORS[index % STATUS_COLORS.length],
    }));

  const selectedCard = cards.find((card) => card.kind === detailKind) ?? cards[0];
  const detailContent = (() => {
    if (detailKind === "total") {
      return employees.map((employee) => <StatusEmployeeRow key={employee.id} employee={employee} />);
    }
    if (detailKind === "active") {
      return activeEmployees.map((employee) => <StatusEmployeeRow key={employee.id} employee={employee} />);
    }
    if (detailKind === "timeoff") {
      return timeoffEmployees.map((employee) => (
        <StatusEmployeeRow key={employee.id} employee={employee} request={currentRequestByEmployee.get(employee.id)} />
      ));
    }
    if (detailKind === "sick") {
      return sickEmployees.map((employee) => (
        <StatusEmployeeRow key={employee.id} employee={employee} request={currentRequestByEmployee.get(employee.id)} />
      ));
    }
    if (detailKind === "pending") {
      return pendingRequests.map((request) => <RequestRow key={request.id} request={request} />);
    }
    if (detailKind === "approved") {
      return approvedRequests.map((request) => <RequestRow key={request.id} request={request} />);
    }
    return rejectedRequests.map((request) => <RequestRow key={request.id} request={request} />);
  })();

  return (
    <>
      <div className={styles.chartGrid}>
        <AnimatedPie
          title="Сахилгын бүртгэлийн төрөл"
          slices={disciplineTypeSlices}
          centerLabel="Нийт"
          centerValue={`${disciplineRecords.length}`}
          variant="donut"
          chartNote={
            disciplineTypeSlices[0]
              ? `${disciplineTypeSlices[0].label}: ${formatPercent(disciplineTypeSlices[0].value, disciplineRecords.length)}`
              : "0%"
          }
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
                        <strong>{item.employeeName}</strong>
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
                        <strong>{item.employeeName}</strong>
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
        <AnimatedPie
          title="Хэлтсийн ажлын тоо"
          slices={departmentSlices}
          centerLabel="Ажилтан"
          centerValue={`${cards[0].value}`}
        />
        <AnimatedPie
          title="Чөлөөтэй, өвчтэй ажилтны харьцаа"
          slices={statusSlices.slice(0, 3)}
          centerLabel="Нийт"
          centerValue={`${cards[0].value}`}
          variant="donut"
        />
      </div>

      <section className={styles.statGrid}>
        {cards.map((card) => {
          const Icon = card.icon;
          const isActive = detailKind === card.kind;
          return (
            <button
              key={card.kind}
              type="button"
              className={`${styles.statCard} ${isActive ? styles.statCardSelected : ""}`}
              onClick={() => setDetailKind(card.kind)}
            >
              <span className={styles.statIcon}>
                <Icon aria-hidden />
              </span>
              <div>
                <small>{card.label}</small>
                <strong>{card.value}</strong>
                <p>{card.note}</p>
              </div>
            </button>
          );
        })}
      </section>

      <section className={styles.detailPanel}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.eyebrow}>Дэлгэрэнгүй жагсаалт</span>
            <h2>{selectedCard.label}</h2>
          </div>
          <p>Тоон дээр дарахад тухайн төлөвт багтсан ажилтан, хүсэлтийн дэлгэрэнгүй харагдана.</p>
        </div>
        <div className={styles.detailList}>
          {detailContent.length ? (
            detailContent
          ) : (
            <div className={styles.emptyState}>
              <strong>Одоогоор бүртгэл алга.</strong>
              <span>Сонгосон үзүүлэлтэд хамаарах ажилтан эсвэл хүсэлт байхгүй байна.</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
