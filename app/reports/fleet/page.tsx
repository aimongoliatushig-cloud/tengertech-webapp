import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Fuel, Scale } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import {
  hasCapability,
  isMasterRole,
  requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { loadFleetFuelWeightReport, type FleetFuelWeightReportType } from "@/lib/odoo";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";
import { canViewGarbageWeightReports } from "@/lib/roles";

import styles from "./fleet-report.module.css";

export const dynamic = "force-dynamic";

type ReportMode = "month" | "year" | "day" | "range";

type PageProps = {
  searchParams?: Promise<{
    type?: string | string[];
    mode?: string | string[];
    month?: string | string[];
    year?: string | string[];
    date?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
  }>;
};

const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Ulaanbaatar";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;
const YEAR_KEY_PATTERN = /^\d{4}$/;

function firstParam(value?: string | string[]) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function todayDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function shiftMonthKey(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftDayKey(dateKey: string, delta: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  return shifted.toISOString().slice(0, 10);
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year} оны ${month}-р сар`;
}

function buildMonthOptions(currentMonthKey: string, selectedMonthKey: string, count = 24) {
  const keys = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    keys.add(shiftMonthKey(currentMonthKey, -index));
  }
  keys.add(selectedMonthKey);
  return Array.from(keys)
    .sort((left, right) => (left < right ? 1 : -1))
    .map((value) => ({ value, label: monthLabel(value) }));
}

type ResolvedPeriod = {
  type: FleetFuelWeightReportType;
  mode: ReportMode;
  month: string;
  year: string;
  date: string;
  startDate: string;
  endDate: string;
  periodLabel: string;
};

function resolvePeriod(params: {
  type: string;
  mode: string;
  month: string;
  year: string;
  date: string;
  startDate: string;
  endDate: string;
}): ResolvedPeriod {
  const today = todayDateKey();
  const type: FleetFuelWeightReportType = params.type === "weight" ? "weight" : "fuel";
  const mode: ReportMode = ["month", "year", "day", "range"].includes(params.mode)
    ? (params.mode as ReportMode)
    : "month";

  const month = MONTH_KEY_PATTERN.test(params.month) ? params.month : today.slice(0, 7);
  const year = YEAR_KEY_PATTERN.test(params.year) ? params.year : today.slice(0, 4);
  const date = DATE_KEY_PATTERN.test(params.date) ? params.date : today;

  let startDate = "";
  let endDate = "";
  let periodLabel = "";

  if (mode === "month") {
    const [y, m] = month.split("-").map(Number);
    startDate = `${month}-01`;
    endDate = `${month}-${String(lastDayOfMonth(y, m - 1)).padStart(2, "0")}`;
    periodLabel = monthLabel(month);
  } else if (mode === "year") {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
    periodLabel = `${year} он`;
  } else if (mode === "day") {
    startDate = date;
    endDate = date;
    periodLabel = date;
  } else {
    const requestedStart = DATE_KEY_PATTERN.test(params.startDate) ? params.startDate : `${today.slice(0, 7)}-01`;
    const requestedEnd = DATE_KEY_PATTERN.test(params.endDate) ? params.endDate : today;
    startDate = requestedStart <= requestedEnd ? requestedStart : requestedEnd;
    endDate = requestedStart <= requestedEnd ? requestedEnd : requestedStart;
    periodLabel = startDate === endDate ? startDate : `${startDate} - ${endDate}`;
  }

  return { type, mode, month, year, date, startDate, endDate, periodLabel };
}

function buildHref(period: ResolvedPeriod, overrides: Partial<ResolvedPeriod>) {
  const next = { ...period, ...overrides };
  const search = new URLSearchParams();
  search.set("type", next.type);
  search.set("mode", next.mode);
  if (next.mode === "month") {
    search.set("month", next.month);
  } else if (next.mode === "year") {
    search.set("year", next.year);
  } else if (next.mode === "day") {
    search.set("date", next.date);
  } else {
    search.set("startDate", next.startDate);
    search.set("endDate", next.endDate);
  }
  return `/reports/fleet?${search.toString()}`;
}

const MODE_TABS: { key: ReportMode; label: string }[] = [
  { key: "month", label: "Сараар" },
  { key: "year", label: "Жилээр" },
  { key: "day", label: "Өдрөөр" },
  { key: "range", label: "Хугацаагаар" },
];

export default async function FleetFuelWeightReportPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (!canViewGarbageWeightReports(session)) {
    redirect("/");
  }

  const roleLabel = getSessionRoleLabel(session);
  const masterMode = isMasterRole(session.role);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const canViewAllReports = canViewAllWorkspaceReports(session);
  const scopedDepartmentName = await loadSessionDepartmentName(session);

  const rawParams = (await searchParams) ?? {};
  const period = resolvePeriod({
    type: firstParam(rawParams.type),
    mode: firstParam(rawParams.mode),
    month: firstParam(rawParams.month),
    year: firstParam(rawParams.year),
    date: firstParam(rawParams.date),
    startDate: firstParam(rawParams.startDate),
    endDate: firstParam(rawParams.endDate),
  });

  let report: Awaited<ReturnType<typeof loadFleetFuelWeightReport>> | null = null;
  let loadError = "";
  try {
    report = await loadFleetFuelWeightReport(
      { type: period.type, startDate: period.startDate, endDate: period.endDate },
      { login: session.login, password: session.password },
    );
  } catch (error) {
    console.error("Fleet fuel/weight report could not be loaded:", error);
    loadError = "Тайлангийн мэдээллийг уншиж чадсангүй. Холболт болон эрхээ шалгана уу.";
  }

  const isFuel = period.type === "fuel";
  const typeLabel = isFuel ? "Шатахуун" : "Жин";
  const unitLabel = report?.unitLabel ?? (isFuel ? "л" : "тонн");
  const summary = report?.summary;
  const rows = report?.rows ?? [];

  const exportParams = new URLSearchParams({
    type: period.type,
    startDate: period.startDate,
    endDate: period.endDate,
  });
  const excelHref = `/api/reports/fleet-export?${exportParams.toString()}&format=excel`;
  const csvHref = `/api/reports/fleet-export?${exportParams.toString()}&format=csv`;

  const monthOptions = buildMonthOptions(todayDateKey().slice(0, 7), period.month);
  // Хэлтсийн мэдээлэл байхгүй (бүгд хоосон) бол "—"-ээр дүүрсэн баганыг нуунa.
  const showDepartmentColumn = rows.some((row) => row.departmentName.trim().length > 0);
  const showStep = period.mode === "month" || period.mode === "year" || period.mode === "day";
  const prevHref = buildHref(
    period,
    period.mode === "month"
      ? { month: shiftMonthKey(period.month, -1) }
      : period.mode === "year"
        ? { year: String(Number(period.year) - 1) }
        : { date: shiftDayKey(period.date, -1) },
  );
  const nextHref = buildHref(
    period,
    period.mode === "month"
      ? { month: shiftMonthKey(period.month, 1) }
      : period.mode === "year"
        ? { year: String(Number(period.year) + 1) }
        : { date: shiftDayKey(period.date, 1) },
  );

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="reports-fleet"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              canViewAllReports={canViewAllReports}
              canViewGarbageWeightReports
              userName={session.name}
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Шатахуун ба жингийн тайлан"
              subtitle="Авто баазын шатахуун зарцуулалт болон хогийн жинг сар, жилээр нэгтгэн харах"
              userName={session.name}
              roleLabel={roleLabel}
            />

            <section className={styles.board}>
              <div className={styles.controls}>
                <div className={styles.typeTabs} role="tablist" aria-label="Тайлангийн төрөл">
                  <Link
                    href={buildHref(period, { type: "fuel" })}
                    className={`${styles.typeTab} ${isFuel ? styles.typeTabActive : ""}`}
                  >
                    <Fuel aria-hidden size={18} />
                    Шатахуун
                  </Link>
                  <Link
                    href={buildHref(period, { type: "weight" })}
                    className={`${styles.typeTab} ${!isFuel ? styles.typeTabActive : ""}`}
                  >
                    <Scale aria-hidden size={18} />
                    Жин
                  </Link>
                </div>

                <div className={styles.exportActions}>
                  <a href={excelHref}>
                    <Download aria-hidden size={16} />
                    Excel татах
                  </a>
                  <a href={csvHref}>
                    <Download aria-hidden size={16} />
                    CSV татах
                  </a>
                </div>
              </div>

              <div className={styles.periodBar}>
                <div className={styles.modeTabs}>
                  {MODE_TABS.map((tab) => (
                    <Link
                      key={tab.key}
                      href={buildHref(period, { mode: tab.key })}
                      className={`${styles.modeTab} ${period.mode === tab.key ? styles.modeTabActive : ""}`}
                    >
                      {tab.label}
                    </Link>
                  ))}
                </div>

                <div className={styles.periodPicker}>
                  {showStep ? (
                    <Link href={prevHref} className={styles.stepButton} aria-label="Өмнөх">
                      ◀
                    </Link>
                  ) : null}
                  <strong className={styles.periodLabel}>{period.periodLabel}</strong>
                  {showStep ? (
                    <Link href={nextHref} className={styles.stepButton} aria-label="Дараах">
                      ▶
                    </Link>
                  ) : null}
                </div>

                <form className={styles.periodForm} action="/reports/fleet" method="get">
                  <input type="hidden" name="type" value={period.type} />
                  <input type="hidden" name="mode" value={period.mode} />
                  {period.mode === "month" ? (
                    <select name="month" defaultValue={period.month} aria-label="Сар сонгох">
                      {monthOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {period.mode === "year" ? (
                    <input
                      type="number"
                      name="year"
                      min={2020}
                      max={2100}
                      defaultValue={period.year}
                      aria-label="Жил сонгох"
                    />
                  ) : null}
                  {period.mode === "day" ? (
                    <input type="date" name="date" defaultValue={period.date} aria-label="Өдөр сонгох" />
                  ) : null}
                  {period.mode === "range" ? (
                    <>
                      <input type="date" name="startDate" defaultValue={period.startDate} aria-label="Эхлэх өдөр" />
                      <input type="date" name="endDate" defaultValue={period.endDate} aria-label="Дуусах өдөр" />
                    </>
                  ) : null}
                  <button type="submit">Харах</button>
                </form>
              </div>

              {loadError ? (
                <div className={styles.errorCard}>{loadError}</div>
              ) : (
                <>
                  <div className={styles.summaryGrid}>
                    <article className={styles.summaryCard}>
                      <span>Нийт {typeLabel.toLocaleLowerCase("mn-MN")}</span>
                      <strong>{summary?.totalLabel ?? `0 ${unitLabel}`}</strong>
                      <small>{period.periodLabel}</small>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Машины тоо</span>
                      <strong>{summary?.matchedVehicleCount ?? 0}</strong>
                      <small>{summary?.rowCount ?? 0} бүртгэлийн мөр</small>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Өдрийн дундаж</span>
                      <strong>{summary?.dayAverageLabel ?? `0 ${unitLabel}`}</strong>
                      <small>{summary?.dayCount ?? 0} өдрийн дата</small>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Хамгийн их</span>
                      <strong>{summary?.topVehicleTotalLabel || "—"}</strong>
                      <small>{summary?.topVehicleLabel || "Дата алга"}</small>
                    </article>
                  </div>

                  {summary && summary.unmatchedCount > 0 ? (
                    <div className={styles.warningCard}>
                      {summary.unmatchedCount} бүртгэл авто баазын машинтай таараагүй байна. Улсын дугаарыг
                      тулгаж засна уу.
                    </div>
                  ) : null}

                  <div className={styles.tableCard}>
                    <div
                      className={`${styles.tableHeader}${
                        showDepartmentColumn ? "" : ` ${styles.noDepartment}`
                      }`}
                    >
                      <span>№</span>
                      <span>Машин</span>
                      <span>Хэлтэс</span>
                      <span className={styles.alignEnd}>Нийт ({unitLabel})</span>
                      <span className={styles.alignEnd}>Мөр</span>
                    </div>

                    {rows.length ? (
                      rows.map((row, index) => {
                        const daily = isFuel ? row.fuelDaily : row.weightDaily;
                        return (
                          <details key={row.vehicleKey} className={styles.vehicleRow}>
                            <summary
                              className={`${styles.vehicleSummary}${
                                showDepartmentColumn ? "" : ` ${styles.noDepartment}`
                              }`}
                            >
                              <span className={styles.rowIndex}>{index + 1}</span>
                              <span className={styles.vehicleName}>
                                <strong>{row.vehicleLabel}</strong>
                                {row.vehiclePlate && row.vehiclePlate !== row.vehicleLabel ? (
                                  <small>{row.vehiclePlate}</small>
                                ) : null}
                                {!row.matched ? <small className={styles.unmatchedTag}>Таараагүй</small> : null}
                              </span>
                              <span>{row.departmentName || "—"}</span>
                              <span className={`${styles.alignEnd} ${styles.totalCell}`}>{row.totalLabel}</span>
                              <span className={styles.alignEnd}>{row.rowCount}</span>
                            </summary>
                            <div className={styles.dailyPanel}>
                              {daily.length ? (
                                <table className={styles.dailyTable}>
                                  <thead>
                                    <tr>
                                      <th>Огноо</th>
                                      <th className={styles.alignEnd}>{isFuel ? "Литр" : "Жин"}</th>
                                      <th>Эх сурвалж</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {daily.map((item) => (
                                      <tr key={item.id}>
                                        <td>{item.reportDateValue || item.reportDate}</td>
                                        <td className={styles.alignEnd}>
                                          {isFuel
                                            ? (item as (typeof row.fuelDaily)[number]).fuelLabel
                                            : (item as (typeof row.weightDaily)[number]).weightLabel}
                                        </td>
                                        <td>{item.source}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className={styles.dailyEmpty}>Өдрийн задаргаа алга.</p>
                              )}
                            </div>
                          </details>
                        );
                      })
                    ) : (
                      <div className={styles.empty}>
                        Сонгосон хугацаанд {typeLabel.toLocaleLowerCase("mn-MN")}ний тайлан бүртгэгдээгүй байна.
                      </div>
                    )}
                  </div>

                  {report?.latestReportDate ? (
                    <p className={styles.footnote}>
                      Хамгийн сүүлд импортолсон огноо: {report.latestReportDate}
                    </p>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
