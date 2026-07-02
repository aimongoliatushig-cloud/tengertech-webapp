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
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { compareHrDepartmentNames } from "@/lib/hr-department-order";
import { formatEmployeeDisplayName } from "@/lib/hr-name";
import type { HrDisciplineRecord, HrTimeoffDashboardData, HrTimeoffRequest } from "@/lib/hr";
import type { HrEmployeeDirectoryItem } from "@/lib/odoo";

import { HR_NOTIFICATION_HREF } from "./constants";
import styles from "./hr.module.css";

type DetailKind = "total" | "active" | "leave" | "requests" | "trial";

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

function AnimatedPie({
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
}: {
  accessMode: "hr" | "department";
  employees: HrEmployeeDirectoryItem[];
  requests: HrTimeoffRequest[];
  dashboard: HrTimeoffDashboardData | null;
  disciplineRecords?: HrDisciplineRecord[];
}) {
  const [detailKind, setDetailKind] = useState<DetailKind>("leave");
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

  const cards: StatCard[] = [
    {
      kind: "total",
      label: "Нийт ажилтан",
      value: workforceEmployees.length,
      icon: Users,
      note: accessMode === "hr" ? "Идэвхтэй бүртгэл" : "Миний хэлтэс",
    },
    {
      kind: "active",
      label: "Идэвхтэй",
      value: activeEmployees.length,
      icon: Activity,
      note: "Өнөөдрийн динамик төлөв",
    },
    {
      kind: "leave",
      label: "Чөлөө, амралт",
      value: timeoffEmployees.length + annualLeaveEmployees.length + sickEmployees.length,
      icon: CalendarDays,
      note: "Чөлөө / ээлжийн амралт / өвчтэй",
    },
    {
      kind: "requests",
      label: "Хүсэлт",
      value:
        (cardsSource?.pendingRequests ?? pendingRequests.length) +
        (cardsSource?.approvedRequests ?? approvedRequests.length),
      icon: FileWarning,
      note: "Хүлээгдэж буй + батлагдсан",
    },
    {
      kind: "trial",
      label: "Туршилт",
      value: trialEmployees.length,
      icon: Hourglass,
      note: "Туршилтад байгаа болон дууссан",
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
      const key = String(employee.departmentId || employee.departmentName || "Хэлтэс бүртгээгүй");
      if (!rows.has(key)) {
        rows.set(key, {
          departmentId: employee.departmentId || 0,
          departmentName: employee.departmentName || "Хэлтэс бүртгээгүй",
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
      const key = String(request.departmentId || request.departmentName || "Хэлтэс бүртгээгүй");
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

  const selectedCard = cards.find((card) => card.kind === detailKind) ?? cards[0];
  const getDetailContent = (kind: DetailKind) => {
    if (kind === "total") {
      return workforceEmployees.map((employee) => <StatusEmployeeRow key={employee.id} employee={employee} />);
    }
    if (kind === "active") {
      return activeEmployees.map((employee) => <StatusEmployeeRow key={employee.id} employee={employee} />);
    }
    if (kind === "trial") {
      return [
        <DetailGroupHeader key="trial-in-progress-header" label="Туршилтад байгаа" value={trialInProgressEmployees.length} />,
        ...trialInProgressEmployees.map((employee) => <StatusEmployeeRow key={`trial-${employee.id}`} employee={employee} />),
        <DetailGroupHeader key="trial-ended-header" label="Туршилт дууссан" value={trialEndedEmployees.length} />,
        ...trialEndedEmployees.map((employee) => (
          <Fragment key={`trial-ended-${employee.id}`}>
            <StatusEmployeeRow employee={employee} actions={accessMode === "hr" ? renderTrialEndedActions(employee) : undefined} />
            {renderTrialEndedExtra(employee)}
          </Fragment>
        )),
      ];
    }
    if (kind === "leave") {
      return [
        <DetailGroupHeader key="leave-timeoff-header" label="Чөлөөтэй" value={timeoffEmployees.length} />,
        ...timeoffEmployees.map((employee) => (
          <StatusEmployeeRow key={`timeoff-${employee.id}`} employee={employee} request={currentRequestByEmployee.get(employee.id)} />
        )),
        <DetailGroupHeader key="leave-annual-header" label="Ээлжийн амралттай" value={annualLeaveEmployees.length} />,
        ...annualLeaveEmployees.map((employee) => (
          <StatusEmployeeRow key={`annual-${employee.id}`} employee={employee} request={currentRequestByEmployee.get(employee.id)} />
        )),
        <DetailGroupHeader key="leave-sick-header" label="Өвчтэй" value={sickEmployees.length} />,
        ...sickEmployees.map((employee) => (
          <StatusEmployeeRow key={`sick-${employee.id}`} employee={employee} request={currentRequestByEmployee.get(employee.id)} />
        )),
      ];
    }
    if (kind === "requests") {
      return [
        <DetailGroupHeader key="req-pending-header" label="Хүлээгдэж буй" value={pendingRequests.length} />,
        ...pendingRequests.map((request) => <RequestRow key={`pending-${request.id}`} request={request} />),
        <DetailGroupHeader key="req-approved-header" label="Батлагдсан" value={approvedRequests.length} />,
        ...approvedRequests.map((request) => <RequestRow key={`approved-${request.id}`} request={request} />),
      ];
    }
    return [];
  };
  const detailContent = getDetailContent(detailKind);

  // Эхний donut-д харагдах зүсмүүд ба тэдгээрийн нийлбэр (төв тоо зүсмүүдтэй нийцнэ).
  const statusChartSlices = statusSlices.slice(0, 3);
  const statusChartTotal = statusChartSlices.reduce((sum, slice) => sum + slice.value, 0);

  const chartsSection = (
    <div className={styles.chartGrid}>
      <AnimatedPie
        title="Идэвхтэй, чөлөөтэй, амралттай харьцаа"
        slices={statusChartSlices}
        centerLabel="Нийт"
        centerValue={`${statusChartTotal}`}
        variant="donut"
      />
      <AnimatedPie
        title="Хэлтсийн ажилтаны тоо"
        slices={departmentSlices}
        centerLabel="Ажилтан"
        centerValue={`${cards[0].value}`}
        variant="donut"
      />
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
    </div>
  );

  return (
    <>
      <div className={styles.statHeading}>
        <span className={styles.eyebrow}>Үндсэн үзүүлэлт</span>
        <p>Аль нэг тоон дээр дарж тухайн ажилтан, хүсэлтийн дэлгэрэнгүйг доор хараарай.</p>
      </div>

      <section className={styles.statGrid}>
        {cards.map((card) => {
          const Icon = card.icon;
          const isActive = detailKind === card.kind;
          const inlineDetailContent = getDetailContent(card.kind);
          return (
            <div
              key={card.kind}
              className={`${styles.statCardWrap} ${isActive ? styles.statCardWrapActive : ""}`}
            >
              <button
                type="button"
                className={`${styles.statCard} ${STAT_CARD_TONE_CLASS[card.kind]} ${isActive ? styles.statCardSelected : ""}`}
                onClick={() => setDetailKind(card.kind)}
                aria-expanded={isActive}
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
              <div className={styles.mobileInlineDetail}>
                <div className={styles.mobileInlineDetailHeader}>
                  <strong>{card.label}</strong>
                  <span>{card.value}</span>
                </div>
                <div className={styles.detailList}>
                  {inlineDetailContent.length ? (
                    inlineDetailContent
                  ) : (
                    <div className={styles.emptyState}>
                      <strong>Одоогоор бүртгэл алга.</strong>
                      <span>Сонгосон үзүүлэлтэд хамаарах ажилтан эсвэл хүсэлт байхгүй байна.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {detailKind === "requests" ? <PendingRequestQueue requests={pendingRequests} /> : null}

      <section className={`${styles.detailPanel} ${styles.desktopDetailPanel}`}>
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

      {chartsSection}
    </>
  );
}
