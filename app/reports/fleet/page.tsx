import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Fuel, Gauge, Scale } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { ReportPeriodBar } from "@/app/_components/report-period-bar";
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
import { resolveReportPeriod, buildReportPeriodHref } from "@/lib/report-period";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";
import { canViewGarbageWeightReports } from "@/lib/roles";
import { compareHrDepartmentNames } from "@/lib/hr-department-order";

import styles from "./fleet-report.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    type?: string | string[];
    mode?: string | string[];
    month?: string | string[];
    year?: string | string[];
    date?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
    department?: string | string[];
    vehicle?: string | string[];
  }>;
};

function firstParam(value?: string | string[]) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

export default async function FleetFuelWeightReportPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  if (!canViewGarbageWeightReports(session, scopedDepartmentName)) {
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

  const rawParams = (await searchParams) ?? {};
  const requestedType = firstParam(rawParams.type);
  const type: FleetFuelWeightReportType = requestedType === "weight" || requestedType === "distance" ? requestedType : "fuel";
  const period = resolveReportPeriod({
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
      { type, startDate: period.startDate, endDate: period.endDate },
      { login: session.login, password: session.password },
    );
  } catch (error) {
    console.error("Fleet fuel/weight report could not be loaded:", error);
    loadError = "Тайлангийн мэдээллийг уншиж чадсангүй. Холболт болон эрхээ шалгана уу.";
  }

  const isFuel = type === "fuel";
  const isDistance = type === "distance";
  const typeLabel = isFuel ? "Шатахуун" : isDistance ? "Туулсан км" : "Жин";
  const unitLabel = report?.unitLabel ?? (isFuel ? "л" : isDistance ? "км" : "тонн");
  const summary = report?.summary;
  const allRows = [...(report?.rows ?? [])].sort((left, right) => {
    const departmentOrder = compareHrDepartmentNames(left.departmentName, right.departmentName);
    return departmentOrder || left.vehicleLabel.localeCompare(right.vehicleLabel, "mn", { numeric: true });
  });

  // Хэлтэс ба машинаар шүүх
  const departmentOptions = Array.from(
    new Set(allRows.map((row) => row.departmentName.trim()).filter(Boolean)),
  ).sort(compareHrDepartmentNames);
  const requestedDepartment = firstParam(rawParams.department);
  const selectedDepartment = departmentOptions.includes(requestedDepartment) ? requestedDepartment : "";
  const vehicleQuery = firstParam(rawParams.vehicle);
  const vehicleNeedle = vehicleQuery.trim().toLocaleLowerCase("mn-MN");
  const rows = allRows.filter((row) => {
    if (selectedDepartment && row.departmentName.trim() !== selectedDepartment) {
      return false;
    }
    if (
      vehicleNeedle &&
      !`${row.vehicleLabel} ${row.vehiclePlate}`.toLocaleLowerCase("mn-MN").includes(vehicleNeedle)
    ) {
      return false;
    }
    return true;
  });
  const isFiltered = Boolean(selectedDepartment || vehicleNeedle);

  // Шүүсэн үед дүгнэлт картыг шүүсэн жагсаалтаар дахин тооцоолно
  const numberFmt = (value: number) => value.toLocaleString("mn-MN", { maximumFractionDigits: 1 });
  const filteredTotal = rows.reduce((sum, row) => sum + (row.total ?? 0), 0);
  const filteredRowCount = rows.reduce((sum, row) => sum + row.rowCount, 0);
  const filteredTop = rows.length
    ? rows.reduce((max, row) => (row.total > max.total ? row : max), rows[0])
    : null;
  const dayCount = summary?.dayCount ?? 0;
  const cardTotal = isFiltered ? `${numberFmt(filteredTotal)} ${unitLabel}` : summary?.totalLabel ?? `0 ${unitLabel}`;
  const cardVehicleCount = isFiltered ? rows.length : summary?.matchedVehicleCount ?? 0;
  const cardRowCount = isFiltered ? filteredRowCount : summary?.rowCount ?? 0;
  const cardDayAverage = isFiltered
    ? `${numberFmt(dayCount ? filteredTotal / dayCount : filteredTotal)} ${unitLabel}`
    : summary?.dayAverageLabel ?? `0 ${unitLabel}`;
  const cardTopTotal = isFiltered ? filteredTop?.totalLabel ?? "—" : summary?.topVehicleTotalLabel || "—";
  const cardTopLabel = isFiltered ? filteredTop?.vehicleLabel ?? "Дата алга" : summary?.topVehicleLabel || "Дата алга";

  const exportParams = new URLSearchParams({
    type,
    startDate: period.startDate,
    endDate: period.endDate,
  });
  if (selectedDepartment) {
    exportParams.set("department", selectedDepartment);
  }
  if (vehicleQuery.trim()) {
    exportParams.set("vehicle", vehicleQuery.trim());
  }
  const excelHref = `/api/reports/fleet-export?${exportParams.toString()}&format=excel`;
  const csvHref = `/api/reports/fleet-export?${exportParams.toString()}&format=csv`;

  // Хэлтсийн шүүлтийн "Цэвэрлэх" холбоос (хугацаа, төрөл хадгална)
  const clearFilterParams = new URLSearchParams({ type, mode: period.mode });
  if (period.mode === "month") clearFilterParams.set("month", period.month);
  else if (period.mode === "year") clearFilterParams.set("year", period.year);
  else if (period.mode === "day") clearFilterParams.set("date", period.date);
  else {
    clearFilterParams.set("startDate", period.startDate);
    clearFilterParams.set("endDate", period.endDate);
  }
  const clearFilterHref = `/reports/fleet?${clearFilterParams.toString()}`;

  // Хэлтсийн мэдээлэл байхгүй (бүгд хоосон) бол "—"-ээр дүүрсэн баганыг нуунa.
  const showDepartmentColumn = rows.some((row) => row.departmentName.trim().length > 0);

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
                    href={buildReportPeriodHref("/reports/fleet", period, {}, { type: "fuel" })}
                    className={`${styles.typeTab} ${isFuel ? styles.typeTabActive : ""}`}
                  >
                    <Fuel aria-hidden size={18} />
                    Шатахуун
                  </Link>
                  <Link
                    href={buildReportPeriodHref("/reports/fleet", period, {}, { type: "weight" })}
                    className={`${styles.typeTab} ${type === "weight" ? styles.typeTabActive : ""}`}
                  >
                    <Scale aria-hidden size={18} />
                    Жин
                  </Link>
                  <Link
                    href={buildReportPeriodHref("/reports/fleet", period, {}, { type: "distance" })}
                    className={`${styles.typeTab} ${isDistance ? styles.typeTabActive : ""}`}
                  >
                    <Gauge aria-hidden size={18} />
                    Туулсан км
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

              <ReportPeriodBar basePath="/reports/fleet" period={period} extraParams={{ type }} />

              {allRows.length || isFiltered ? (
                <form className={styles.filterBar} action="/reports/fleet" method="get">
                  <input type="hidden" name="type" value={type} />
                  <input type="hidden" name="mode" value={period.mode} />
                  {period.mode === "month" ? <input type="hidden" name="month" value={period.month} /> : null}
                  {period.mode === "year" ? <input type="hidden" name="year" value={period.year} /> : null}
                  {period.mode === "day" ? <input type="hidden" name="date" value={period.date} /> : null}
                  {period.mode === "range" ? (
                    <>
                      <input type="hidden" name="startDate" value={period.startDate} />
                      <input type="hidden" name="endDate" value={period.endDate} />
                    </>
                  ) : null}
                  <label className={styles.filterField}>
                    <span>Хэлтэс</span>
                    <select name="department" defaultValue={selectedDepartment}>
                      <option value="">Бүх хэлтэс</option>
                      {departmentOptions.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.filterField}>
                    <span>Машин</span>
                    <input
                      type="search"
                      name="vehicle"
                      defaultValue={vehicleQuery}
                      placeholder="Нэр эсвэл улсын дугаар"
                    />
                  </label>
                  <button type="submit" className={styles.filterButton}>
                    Шүүх
                  </button>
                  {isFiltered ? (
                    <a className={styles.filterClear} href={clearFilterHref}>
                      Цэвэрлэх
                    </a>
                  ) : null}
                </form>
              ) : null}

              {loadError ? (
                <div className={styles.errorCard}>{loadError}</div>
              ) : (
                <>
                  <div className={styles.summaryGrid}>
                    <article className={styles.summaryCard}>
                      <span>Нийт {typeLabel.toLocaleLowerCase("mn-MN")}</span>
                      <strong>{cardTotal}</strong>
                      <small>{isFiltered ? `${period.periodLabel} · шүүсэн` : period.periodLabel}</small>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Машины тоо</span>
                      <strong>{cardVehicleCount}</strong>
                      <small>{cardRowCount} бүртгэлийн мөр</small>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Өдрийн дундаж</span>
                      <strong>{cardDayAverage}</strong>
                      <small>{dayCount} өдрийн дата</small>
                    </article>
                    <article className={styles.summaryCard}>
                      <span>Хамгийн их</span>
                      <strong>{cardTopTotal}</strong>
                      <small>{cardTopLabel}</small>
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
                        const daily = isFuel ? row.fuelDaily : isDistance ? row.distanceDaily : row.weightDaily;
                        return (
                          <details key={row.vehicleKey} className={styles.vehicleRow}>
                            <summary
                              className={`${styles.vehicleSummary}${
                                showDepartmentColumn ? "" : ` ${styles.noDepartment}`
                              }`}
                            >
                              <span className={styles.rowIndex}>{index + 1}</span>
                              <span className={styles.vehicleName}>
                                <span className={styles.vehicleIdentity}>
                                  {row.vehicleImageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={row.vehicleImageUrl} alt={`${row.vehicleLabel} машины зураг`} />
                                  ) : (
                                    <span className={styles.vehicleImagePlaceholder} aria-hidden>
                                      <Gauge size={18} />
                                    </span>
                                  )}
                                  <strong>{row.vehicleLabel}</strong>
                                </span>
                                <small>Төрөл: {row.vehicleTypeName}</small>
                                {!row.matched && row.vehiclePlate && row.vehiclePlate !== row.vehicleLabel ? (
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
                                      <th className={styles.alignEnd}>{isFuel ? "Литр" : isDistance ? "Туулсан км" : "Жин (тонн)"}</th>
                                      <th>{isDistance ? "Одометр" : "Эх сурвалж"}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {daily.map((item) => (
                                      <tr key={item.id}>
                                        <td>{isDistance ? (item as (typeof row.distanceDaily)[number]).date : (item as (typeof row.fuelDaily)[number] | (typeof row.weightDaily)[number]).reportDateValue || (item as (typeof row.fuelDaily)[number] | (typeof row.weightDaily)[number]).reportDate}</td>
                                        <td className={styles.alignEnd}>
                                          {isFuel
                                            ? (item as (typeof row.fuelDaily)[number]).fuelLabel
                                            : isDistance
                                              ? (item as (typeof row.distanceDaily)[number]).traveledLabel
                                              : (item as (typeof row.weightDaily)[number]).weightLabel}
                                        </td>
                                        <td>{isDistance ? (item as (typeof row.distanceDaily)[number]).odometerLabel : (item as (typeof row.fuelDaily)[number] | (typeof row.weightDaily)[number]).source}</td>
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
