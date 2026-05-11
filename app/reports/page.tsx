import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { markTaskDoneAction } from "@/app/actions";
import dashboardStyles from "@/app/page.module.css";
import shellStyles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  filterByDepartment,
  filterTasksToDate,
  getTodayDateKey,
} from "@/lib/dashboard-scope";
import {
  DEPARTMENT_GROUPS,
  findDepartmentGroupByName,
  findDepartmentGroupByUnit,
  getAvailableUnits,
  matchesDepartmentGroup,
} from "@/lib/department-groups";
import { loadGarbageWeightLedger } from "@/lib/garbage-weight-ledger";
import {
  filterProjectsForResponsibleMaster,
  filterTasksForResponsibleMaster,
} from "@/lib/master-scope";
import { loadMunicipalSnapshot } from "@/lib/odoo";
import {
  createEmptyProcurementDashboard,
  isProcurementSetupError,
  loadProcurementDashboard,
} from "@/lib/procurement";

import styles from "./reports.module.css";

type PageProps = {
  searchParams?: Promise<{
    department?: string | string[];
    unit?: string | string[];
    report?: string | string[];
    period?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
  }>;
};

type FeedReport = {
  id: number;
  taskId?: number | null;
  reporterId?: number | null;
  reporter: string;
  taskName: string;
  departmentName: string;
  projectName: string;
  summary: string;
  reportedQuantity: number;
  measurementUnit: string;
  imageCount: number;
  audioCount: number;
  stateLabel: string;
  stateBucket: "review" | "done" | "problem" | "progress";
  submittedAt: string;
  images: {
    id: number;
    name: string;
    mimetype: string;
    url: string;
  }[];
  audios: {
    id: number;
    name: string;
    mimetype: string;
    url: string;
  }[];
};

type ReportGroup = {
  projectName: string;
  departmentName: string;
  reports: FeedReport[];
  latestSubmittedAt: string;
};

function getDepartmentParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function countReportsByUnits(unitNames: string[], reports: Array<{ departmentName: string }>) {
  return reports.filter((report) => unitNames.includes(report.departmentName)).length;
}

function countReportsByGroup(
  group: (typeof DEPARTMENT_GROUPS)[number],
  reports: Array<{ departmentName: string }>,
) {
  return reports.filter((report) => matchesDepartmentGroup(group, report.departmentName)).length;
}

function formatQuantity(value: number, unit: string) {
  if (!value) {
    return `0 ${unit}`;
  }

  return `${value} ${unit}`.trim();
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfMonthDateKey(dateKey: string) {
  return `${dateKey.slice(0, 8)}01`;
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeDateRange(startDate: string, endDate: string) {
  if (startDate <= endDate) {
    return { startDate, endDate };
  }

  return { startDate: endDate, endDate: startDate };
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatRangeLabel(startDate: string, endDate: string) {
  if (startDate === endDate) {
    return formatDateLabel(startDate);
  }

  return `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`;
}

function formatKgLabel(value: number) {
  return `${new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} кг`;
}

function formatMoneyLabel(value: number) {
  return `${new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} ₮`;
}

function reportStatusLabel(report: Pick<FeedReport, "stateBucket" | "stateLabel">) {
  switch (report.stateBucket) {
    case "done":
      return "Баталгаажсан";
    case "problem":
      return "Засвар шаардсан";
    case "review":
      return "Хяналт хүлээж байна";
    default:
      return report.stateLabel || "Тайлан орсон";
  }
}

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const workerMode = isWorkerOnly(session);
  if (workerMode) {
    redirect("/");
  }
  const snapshotPromise = loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });
  const scopedDepartmentNamePromise = loadSessionDepartmentName(session);

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const masterMode = isMasterRole(session.role);
  const seniorMasterMode = session.role === "senior_master";
  const [snapshot, scopedDepartmentName] = await Promise.all([
    snapshotPromise,
    scopedDepartmentNamePromise,
  ]);
  const departmentScopedMode = Boolean(scopedDepartmentName);

  const params = (await searchParams) ?? {};
  const requestedDepartment = getDepartmentParam(params.department);
  const requestedUnit = getDepartmentParam(params.unit);
  const requestedReport = getDepartmentParam(params.report);
  const requestedPeriod = getDepartmentParam(params.period);
  const requestedStartDate = getDepartmentParam(params.startDate);
  const requestedEndDate = getDepartmentParam(params.endDate);

  const selectedGroup =
    departmentScopedMode
      ? findDepartmentGroupByName(scopedDepartmentName ?? "") ??
        findDepartmentGroupByUnit(scopedDepartmentName ?? "")
      : requestedDepartment && requestedDepartment !== "all"
        ? findDepartmentGroupByName(requestedDepartment) ??
          findDepartmentGroupByUnit(requestedDepartment)
        : null;
  const availableUnits = selectedGroup ? getAvailableUnits(selectedGroup) : [];
  const selectedUnit =
    requestedUnit && availableUnits.includes(requestedUnit)
      ? requestedUnit
      : requestedDepartment && availableUnits.includes(requestedDepartment)
        ? requestedDepartment
        : availableUnits.length === 1
          ? (availableUnits[0] ?? "")
          : "";
  const matchesSelectedDepartment = (departmentName: string) =>
    selectedUnit
      ? departmentName === selectedUnit
      : selectedGroup
        ? matchesDepartmentGroup(selectedGroup, departmentName)
        : true;
  const todayDateKey = getTodayDateKey();

  let filteredReports = departmentScopedMode
    ? filterByDepartment(snapshot.reports, scopedDepartmentName)
    : snapshot.reports.filter((report) => matchesSelectedDepartment(report.departmentName));

  let filteredReviewQueue = departmentScopedMode
    ? filterByDepartment(snapshot.reviewQueue, scopedDepartmentName)
    : snapshot.reviewQueue.filter((item) => matchesSelectedDepartment(item.departmentName));
  let filteredTaskDirectory = departmentScopedMode
    ? filterByDepartment(snapshot.taskDirectory, scopedDepartmentName)
    : snapshot.taskDirectory.filter((task) => matchesSelectedDepartment(task.departmentName));
  if (masterMode) {
    const candidateProjects = departmentScopedMode
      ? filterByDepartment(snapshot.projects, scopedDepartmentName)
      : snapshot.projects.filter((project) => matchesSelectedDepartment(project.departmentName));
    const masterTasks = filterTasksForResponsibleMaster(
      filteredTaskDirectory,
      candidateProjects,
      session,
    );
    const masterProjects = filterProjectsForResponsibleMaster(candidateProjects, masterTasks, session);
    const masterProjectIds = new Set(masterProjects.map((project) => project.id));
    const masterTaskIds = new Set(masterTasks.map((task) => task.id));

    filteredTaskDirectory = masterTasks;
    filteredReviewQueue = filterTasksForResponsibleMaster(filteredReviewQueue, masterProjects, session);
    filteredReports = filteredReports.filter((report) =>
      seniorMasterMode
        ? masterProjectIds.has(report.projectId ?? -1)
        : masterTaskIds.has(report.taskId ?? -1),
    );
  }
  const todayScopedTasks = filterTasksToDate(filteredTaskDirectory, todayDateKey);
  const todayActiveTasks = todayScopedTasks.filter(
    (task) => task.stageBucket === "todo" || task.stageBucket === "progress",
  );
  const todayReviewTasks = todayScopedTasks.filter((task) => task.stageBucket === "review");
  const todayDoneTasks = todayScopedTasks.filter((task) => task.stageBucket === "done");
  const todayAverageProgress = todayActiveTasks.length
    ? Math.round(
        todayActiveTasks.reduce((sum, task) => sum + task.progress, 0) /
          todayActiveTasks.length,
      )
    : 0;

  const groupedReports = Array.from(
    filteredReports.reduce<Map<string, ReportGroup>>((accumulator, report) => {
      const groupKey = `${report.departmentName}::${report.projectName}`;
      const existing = accumulator.get(groupKey);
      if (existing) {
        existing.reports.push(report);
        return accumulator;
      }

      accumulator.set(groupKey, {
        projectName: report.projectName,
        departmentName: report.departmentName,
        reports: [report],
        latestSubmittedAt: report.submittedAt,
      });
      return accumulator;
    }, new Map()),
  )
    .map(([, group]) => ({
      ...group,
      reports: group.reports.sort((left, right) => right.id - left.id),
    }))
    .sort((left, right) => right.reports[0].id - left.reports[0].id);
  const taskDirectoryById = new Map(filteredTaskDirectory.map((task) => [task.id, task]));
  const canReviewReports = !workerMode && (canViewQualityCenter || canCreateTasks || masterMode);

  const selectedDepartmentName = masterMode
    ? scopedDepartmentName ?? "Миний алба нэгж"
    : selectedUnit || selectedGroup?.name || "Бүх хэлтэс";
  const masterReportTitle = seniorMasterMode ? "Нэгжийн тайлангийн хяналт" : "Миний хариуцсан тайлан";
  const masterReportDescription = seniorMasterMode
    ? "Ахлах мастер өөрийн алба нэгжийн бүх мастерийн илгээсэн тайланг ажлаар нь бүлэглэж хянана."
    : "Мастер зөвхөн өөрт хариуцуулсан ажил, багийн илгээсэн тайланг ажлаар нь бүлэглэж хянана.";
  const totalImages = filteredReports.reduce((sum, report) => sum + report.imageCount, 0);
  const totalAudios = filteredReports.reduce((sum, report) => sum + report.audioCount, 0);
  const isGarbageTransportView =
    selectedUnit === "Хог тээвэрлэлт" ||
    (!selectedUnit &&
      selectedDepartmentName === "Авто бааз, хог тээвэрлэлтийн хэлтэс");
  const reportPeriodOptions = [
    {
      key: "today",
      label: "Өнөөдөр",
      startDate: todayDateKey,
      endDate: todayDateKey,
      hint: "Өнөөдрийн таталтын дүн",
    },
    {
      key: "week",
      label: "Энэ 7 хоног",
      startDate: shiftDateKey(todayDateKey, -6),
      endDate: todayDateKey,
      hint: "Сүүлийн 7 өдрийн дүн",
    },
    {
      key: "month",
      label: "Энэ сар",
      startDate: startOfMonthDateKey(todayDateKey),
      endDate: todayDateKey,
      hint: "Сарын эхнээс өнөөдрийг хүртэл",
    },
  ] as const;
  const defaultReportType = isGarbageTransportView ? "garbage" : "work";
  const selectedReportType = ["garbage", "procurement", "work"].includes(requestedReport)
    ? requestedReport
    : defaultReportType;
  const selectedPeriodOption = reportPeriodOptions.find((option) => option.key === requestedPeriod);
  const customRange =
    isDateKey(requestedStartDate) && isDateKey(requestedEndDate)
      ? normalizeDateRange(requestedStartDate, requestedEndDate)
      : null;
  const selectedDateRange = customRange ?? selectedPeriodOption ?? reportPeriodOptions[0];
  const selectedStartDate = selectedDateRange.startDate;
  const selectedEndDate = selectedDateRange.endDate;
  const selectedRangeLabel = formatRangeLabel(selectedStartDate, selectedEndDate);
  const activePeriodKey = customRange ? "custom" : selectedPeriodOption?.key ?? "today";

  let garbageWeightLedger = null as Awaited<ReturnType<typeof loadGarbageWeightLedger>> | null;
  let garbageWeightError = "";

  try {
    garbageWeightLedger = await loadGarbageWeightLedger({
        login: session.login,
        password: session.password,
      }, { maxDays: 90 });
    } catch (error) {
      console.error("Garbage transport weight ledger could not be loaded:", error);
      garbageWeightError =
        "Хог тээвэрлэлтийн жингийн мэдээллийг Odoo-оос уншиж чадсангүй.";
    }

  let procurementDashboard = createEmptyProcurementDashboard();
  let procurementReportError = "";
  try {
    procurementDashboard = await loadProcurementDashboard(
      { limit: 100 },
      {
        login: session.login,
        password: session.password,
      },
    );
  } catch (error) {
    console.error("Procurement report summary could not be loaded:", error);
    procurementReportError = isProcurementSetupError(error)
      ? "Худалдан авалтын модуль Odoo дээр идэвхгүй байна."
      : "Худалдан авалтын тайлангийн мэдээллийг Odoo-оос уншиж чадсангүй.";
  }

  const garbageSummaryCards = [
    {
      title: masterMode ? "Алба нэгж" : "Сонгосон хүрээ",
      value: selectedDepartmentName,
      note: masterMode
        ? seniorMasterMode
          ? "Нэгжийн жингийн тайлангийн хүрээ"
          : "Хариуцсан ажлын жингийн тайлан"
        : "Жингээр харагдах багц",
    },
    {
      title: "Энэ сар",
      value: garbageWeightLedger?.thisMonth.kgLabel || "0 кг",
      note: garbageWeightLedger?.thisMonth.rangeLabel || "Энэ сарын дүн",
    },
    {
      title: "Өмнөх долоо хоног",
      value: garbageWeightLedger?.previousWeek.kgLabel || "0 кг",
      note: garbageWeightLedger?.previousWeek.rangeLabel || "Өмнөх 7 хоног",
    },
    {
      title: "Өчигдөр",
      value: garbageWeightLedger?.yesterday.kgLabel || "0 кг",
      note: garbageWeightLedger?.yesterday.rangeLabel || "Өмнөх өдөр",
    },
    {
      title: "Сүүлийн 1 сар",
      value: garbageWeightLedger?.lastMonth.kgLabel || "0 кг",
      note: garbageWeightLedger?.lastMonth.rangeLabel || "Сүүлийн 1 сарын дүн",
    },
    {
      title: "Нийт жин",
      value: garbageWeightLedger?.totalLabel || "0 кг",
      note: garbageWeightLedger?.rangeLabel || "Харагдаж буй хугацаа",
    },
  ] as const;

  const garbageOverviewCards = [
    {
      title: "Өнөөдөр",
      value: garbageWeightLedger?.today.kgLabel || "0 кг",
      note: garbageWeightLedger?.today.rangeLabel || "Өнөөдрийн дүн",
    },
    {
      title: "Энэ сар",
      value: garbageWeightLedger?.thisMonth.kgLabel || "0 кг",
      note: garbageWeightLedger?.thisMonth.rangeLabel || "Энэ сарын дүн",
    },
    {
      title: "Сүүлийн 1 сар",
      value: garbageWeightLedger?.lastMonth.kgLabel || "0 кг",
      note: garbageWeightLedger?.lastMonth.rangeLabel || "Сүүлийн 1 сарын дүн",
    },
  ] as const;
  const selectedGarbageDayItems =
    garbageWeightLedger?.dayItems.filter(
      (day) => day.dateKey >= selectedStartDate && day.dateKey <= selectedEndDate,
    ) ?? [];
  const selectedGarbageTotalKg = selectedGarbageDayItems.reduce(
    (sum, day) => sum + day.totalKg,
    0,
  );
  const selectedGarbageVehicleKeys = new Set<string>();
  const selectedGarbageVehicleTotals = new Map<
    string,
    {
      vehicleName: string;
      primaryLabel: string;
      routeName: string;
      kg: number;
      taskCount: number;
      dates: Set<string>;
    }
  >();
  let selectedGarbageRecordCount = 0;

  for (const day of selectedGarbageDayItems) {
    for (const row of day.rows) {
      selectedGarbageRecordCount += 1;
      selectedGarbageVehicleKeys.add(row.vehicleKey);
      const existing = selectedGarbageVehicleTotals.get(row.vehicleKey);
      if (existing) {
        existing.kg += row.kg;
        existing.taskCount += row.taskCount;
        existing.dates.add(day.dateKey);
        if (!existing.routeName && row.routeName) {
          existing.routeName = row.routeName;
        }
      } else {
        selectedGarbageVehicleTotals.set(row.vehicleKey, {
          vehicleName: row.vehicleName,
          primaryLabel: row.primaryLabel,
          routeName: row.routeName,
          kg: row.kg,
          taskCount: row.taskCount,
          dates: new Set([day.dateKey]),
        });
      }
    }
  }

  const selectedGarbageVehicleRows = Array.from(selectedGarbageVehicleTotals.values())
    .sort((left, right) => right.kg - left.kg)
    .slice(0, 8);
  const selectedProcurementItems = procurementDashboard.items.filter((item) => {
    const candidateDates = [
      item.required_date,
      item.payment_date,
      item.date_paid,
      item.date_received,
      item.date_quotation_submitted,
    ];
    return candidateDates.some((date) => {
      const dateKey = typeof date === "string" ? date.slice(0, 10) : "";
      return isDateKey(dateKey) && dateKey >= selectedStartDate && dateKey <= selectedEndDate;
    });
  });
  const procurementTotalAmount = selectedProcurementItems.reduce(
    (sum, item) => sum + (item.selected_supplier_total || item.amount_approx_total || 0),
    0,
  );
  const procurementPaidAmount = selectedProcurementItems.reduce(
    (sum, item) => sum + (item.paid_amount || 0),
    0,
  );
  const procurementPendingCount = selectedProcurementItems.filter((item) => !item.received).length;
  const procurementDelayedCount = selectedProcurementItems.filter((item) => item.is_delayed).length;
  const procurementHighValueCount = selectedProcurementItems.filter(
    (item) => item.is_over_threshold,
  ).length;
  const exportParams = new URLSearchParams();
  if (!departmentScopedMode && selectedGroup) {
    exportParams.set("department", selectedGroup.name);
  }
  if (!departmentScopedMode && selectedUnit) {
    exportParams.set("unit", selectedUnit);
  }
  const exportQuery = exportParams.toString();
  const getReportHref = (updates: Record<string, string>) => {
    const hrefParams = new URLSearchParams(exportParams);
    for (const [key, value] of Object.entries(updates)) {
      hrefParams.set(key, value);
    }
    return `/reports?${hrefParams.toString()}`;
  };
  const getExportHref = (format: "csv" | "excel" | "json") =>
    `/api/reports/export?format=${format}${exportQuery ? `&${exportQuery}` : ""}`;
  const getGarbageWeightReportHref = (startDate: string, endDate = startDate) =>
    `/api/garbage-transport/weight-report?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container} id="reports-top">
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="reports"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Тайлан"
              subtitle="Өдрийн тайлан, зураг, аудио урсгал"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={filteredReviewQueue.length}
              notificationNote={`${filteredReviewQueue.length} даалгавар хяналт хүлээж байна`}
            />

            <header className={styles.pageHeader}>
              <div className={styles.titleBlock}>
                <span className={styles.kicker}>Тайлан</span>
                <h1>{masterMode ? masterReportTitle : "Хэлтсийн тайлан"}</h1>
                <p>
                  {masterMode
                    ? masterReportDescription
                    : "Эхлээд хэлтсээ сонгоно. Дараа нь доторх нэгжээ сонгоод, тухайн нэгжийн ажлуудаар тайланг бүлэглэж харуулна."}
                </p>
              </div>

              <div className={styles.pageAside}>
                <div className={styles.dateMeta}>
                  <span>Сүүлд шинэчлэгдсэн</span>
                  <strong>{snapshot.generatedAt}</strong>
                  <small>{masterMode ? selectedDepartmentName : getRoleLabel(session.role)}</small>
                </div>
                <div className={styles.exportActions} aria-label="Тайлан экспортлох">
                  <a className={styles.exportButton} href={getExportHref("excel")}>
                    Excel
                  </a>
                  <a className={styles.exportButton} href={getExportHref("csv")}>
                    CSV
                  </a>
                  <a className={styles.exportButton} href={getExportHref("json")}>
                    JSON
                  </a>
                </div>
              </div>
            </header>

            {!departmentScopedMode ? (
              <section className={styles.sectionCard}>
                <div className={dashboardStyles.sectionHeader}>
                  <div>
                    <span className={dashboardStyles.kicker}>Хэлтсийн шүүлт</span>
                    <h2>Тайлан харах хэлтэс</h2>
                    <small className={dashboardStyles.sectionNote}>
                      Тайланг эхлээд хэлтсээр, дараа нь хэлтэс доторх нэгжээр шүүнэ
                    </small>
                  </div>
                </div>

                <nav className={styles.departmentFilterGrid} aria-label="Хэлтэс сонгох">
                  <div className={styles.departmentFilterInner}>
                    <Link
                      href="/reports"
                      className={`${styles.departmentFilterCard} ${
                        !selectedGroup ? styles.departmentFilterCardActive : ""
                      }`}
                      aria-current={!selectedGroup ? "page" : undefined}
                    >
                      <span className={styles.departmentFilterLabel}>
                        <span className={styles.departmentFilterIcon} aria-hidden>
                          🏢
                        </span>
                        <span>Бүгд</span>
                      </span>
                      <strong>{snapshot.reports.length}</strong>
                    </Link>

                    {DEPARTMENT_GROUPS.map((group) => {
                      const isActive = selectedGroup?.name === group.name;
                      const reportCount = countReportsByGroup(group, snapshot.reports);
                      const groupUnits = getAvailableUnits(group);
                      const hrefParams = new URLSearchParams();
                      hrefParams.set("department", group.name);
                      if (groupUnits[0]) {
                        hrefParams.set("unit", groupUnits[0]);
                      }

                      return (
                        <Link
                          key={group.name}
                          href={`/reports?${hrefParams.toString()}`}
                          className={`${styles.departmentFilterCard} ${
                            isActive ? styles.departmentFilterCardActive : ""
                          }`}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <span className={styles.departmentFilterLabel}>
                            <span className={styles.departmentFilterIcon} aria-hidden>
                              {group.icon}
                            </span>
                            <span>{group.name}</span>
                          </span>
                          <strong>{reportCount}</strong>
                        </Link>
                      );
                    })}
                  </div>
                </nav>
              </section>
            ) : null}

            {selectedGroup && availableUnits.length > 1 ? (
              <section className={styles.sectionCard}>
                <div className={dashboardStyles.sectionHeader}>
                  <div>
                    <span className={dashboardStyles.kicker}>Доторх нэгж</span>
                    <h2>{selectedGroup.name}</h2>
                    <small className={dashboardStyles.sectionNote}>
                      Энэ хэлтэс доторх тайланг нэгж тус бүрээр нь харуулна
                    </small>
                  </div>
                </div>

                <div className={shellStyles.taskFilterRail}>
                  {availableUnits.map((unit) => {
                    const hrefParams = new URLSearchParams();
                    hrefParams.set("department", selectedGroup.name);
                    hrefParams.set("unit", unit);

                    return (
                      <Link
                        key={unit}
                        href={`/reports?${hrefParams.toString()}`}
                        className={`${shellStyles.taskFilterChip} ${
                          selectedUnit === unit ? shellStyles.taskFilterChipActive : ""
                        }`}
                      >
                        <span>{unit}</span>
                        <strong>{countReportsByUnits([unit], snapshot.reports)}</strong>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className={styles.summaryStrip}>
              {isGarbageTransportView ? (
                garbageSummaryCards.map((card) => (
                  <article key={card.title} className={styles.summaryCard}>
                    <span>{card.title}</span>
                    <strong>{card.value}</strong>
                    <small>{card.note}</small>
                  </article>
                ))
              ) : (
                <>
              <article className={styles.summaryCard}>
                <span>{masterMode ? "Алба нэгж" : "Сонгосон хүрээ"}</span>
                <strong>{selectedDepartmentName}</strong>
                <small>
                  {masterMode
                    ? "Зөвхөн энэ нэгжийн тайлангийн урсгал харагдаж байна"
                    : "Одоо харагдаж буй тайлангийн багц"}
                </small>
              </article>
              <article className={styles.summaryCard}>
                <span>Ажил</span>
                <strong>{groupedReports.length}</strong>
                <small>Тайлан орсон ажлууд</small>
              </article>
              <article className={styles.summaryCard}>
                <span>Орсон тайлан</span>
                <strong>{filteredReports.length}</strong>
                <small>Бүртгэгдсэн нийт тайлан</small>
              </article>
              {!masterMode ? (
                <article className={styles.summaryCard}>
                  <span>Хянах даалгавар</span>
                  <strong>{filteredReviewQueue.length}</strong>
                  <small>Хяналт хүлээж буй даалгавар</small>
                </article>
              ) : null}
              <article className={styles.summaryCard}>
                <span>Зураг</span>
                <strong>{totalImages}</strong>
                <small>Хавсаргасан зураг</small>
              </article>
              <article className={styles.summaryCard}>
                <span>Аудио</span>
                <strong>{totalAudios}</strong>
                <small>Хавсаргасан аудио</small>
              </article>
                </>
              )}
            </section>

            <section className={styles.reportHub}>
              <div className={styles.reportHubHeader}>
                <div>
                  <span className={styles.kicker}>Тайлан татах төв</span>
                  <h2>Хугацаа, төрлөө сонгоод тайлангаа нэг дор авна</h2>
                  <p>
                    Хог тээврийн жинг машин тус бүрээр нэгтгэж, худалдан авалтын хүсэлтийн явцыг
                    тухайн сонгосон хугацаагаар харуулна.
                  </p>
                </div>
                <div className={styles.weightMetaCard}>
                  <span>Сонгосон хугацаа</span>
                  <strong>{selectedRangeLabel}</strong>
                  <small>{customRange ? "Гараар сонгосон огноо" : "Шуурхай хугацааны сонголт"}</small>
                </div>
              </div>

              <div className={styles.periodRail}>
                {reportPeriodOptions.map((option) => (
                  <Link
                    key={option.key}
                    href={getReportHref({ report: selectedReportType, period: option.key })}
                    className={`${styles.periodButton} ${
                      activePeriodKey === option.key ? styles.periodButtonActive : ""
                    }`}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.hint}</span>
                  </Link>
                ))}
              </div>

              <form className={styles.rangeForm} action="/reports" method="get">
                {exportParams.get("department") ? (
                  <input type="hidden" name="department" value={exportParams.get("department") ?? ""} />
                ) : null}
                {exportParams.get("unit") ? (
                  <input type="hidden" name="unit" value={exportParams.get("unit") ?? ""} />
                ) : null}
                <input type="hidden" name="report" value={selectedReportType} />
                <input type="hidden" name="period" value="custom" />
                <label>
                  <span>Эхлэх огноо</span>
                  <input type="date" name="startDate" defaultValue={selectedStartDate} />
                </label>
                <label>
                  <span>Дуусах огноо</span>
                  <input type="date" name="endDate" defaultValue={selectedEndDate} />
                </label>
                <button type="submit">Хугацаагаар харах</button>
              </form>

              <div className={styles.reportTypeGrid}>
                <Link
                  href={getReportHref({
                    report: "garbage",
                    period: activePeriodKey,
                    startDate: selectedStartDate,
                    endDate: selectedEndDate,
                  })}
                  className={`${styles.reportTypeCard} ${
                    selectedReportType === "garbage" ? styles.reportTypeCardActive : ""
                  }`}
                >
                  <span>Хогийн жин</span>
                  <strong>{formatKgLabel(selectedGarbageTotalKg)}</strong>
                  <small>{selectedGarbageVehicleKeys.size} машин, {selectedGarbageRecordCount} мөр</small>
                </Link>
                <Link
                  href={getReportHref({
                    report: "procurement",
                    period: activePeriodKey,
                    startDate: selectedStartDate,
                    endDate: selectedEndDate,
                  })}
                  className={`${styles.reportTypeCard} ${
                    selectedReportType === "procurement" ? styles.reportTypeCardActive : ""
                  }`}
                >
                  <span>Худалдан авалт</span>
                  <strong>{selectedProcurementItems.length} хүсэлт</strong>
                  <small>{formatMoneyLabel(procurementTotalAmount)} дүнтэй</small>
                </Link>
                <Link
                  href={getReportHref({
                    report: "work",
                    period: activePeriodKey,
                    startDate: selectedStartDate,
                    endDate: selectedEndDate,
                  })}
                  className={`${styles.reportTypeCard} ${
                    selectedReportType === "work" ? styles.reportTypeCardActive : ""
                  }`}
                >
                  <span>Ажлын тайлан</span>
                  <strong>{filteredReports.length} тайлан</strong>
                  <small>{groupedReports.length} ажил дээр бүртгэгдсэн</small>
                </Link>
              </div>
            </section>

            {!isGarbageTransportView ? (
              <section className={styles.sectionCard}>
                <div className={dashboardStyles.sectionHeader}>
                  <div>
                    <span className={dashboardStyles.kicker}>Хог тээвэрлэлтийн жин</span>
                    <h2>Өнөөдөр, энэ сарын ачилт</h2>
                    <small className={dashboardStyles.sectionNote}>
                      Бүх тайлан дундаас хог тээвэрлэлтийн кг-ийг товч харуулна
                    </small>
                  </div>
                </div>

                {garbageWeightError ? (
                  <div className={styles.weightError}>{garbageWeightError}</div>
                ) : null}

                <div className={styles.weightSummaryGrid}>
                  {garbageOverviewCards.map((card) => (
                    <article key={card.title} className={styles.weightSummaryCard}>
                      <span>{card.title}</span>
                      <strong>{card.value}</strong>
                      <small>{card.note}</small>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {isGarbageTransportView ? (
              <section className={styles.sectionCard}>
                <div className={styles.weightSectionHeader}>
                  <div>
                    <span className={styles.kicker}>Жингийн тайлан</span>
                    <h2>Машин, өдрийн тээвэрлэлтийн жин</h2>
                    <p>
                      Odoo дээр орсон хог тээвэрлэлтийн жинг машиныг өдөр өдрөөр нь
                      нэгтгэн харуулна.
                    </p>
                  </div>
                  <div className={styles.weightMetaCard}>
                    <span>Хамрах хугацаа</span>
                    <strong>{garbageWeightLedger?.rangeLabel || "Мэдээлэл алга"}</strong>
                    <small>{garbageWeightLedger?.generatedAtLabel || snapshot.generatedAt}</small>
                  </div>
                </div>

                <div className={styles.weightReportToolbar}>
                  <div className={styles.weightToolbarText}>
                    <strong>Сонгосон хугацааны тайлан</strong>
                    <span>{selectedRangeLabel}</span>
                  </div>
                  <div className={styles.exportActions} aria-label="Хог тээврийн жингийн тайлан">
                    <a
                      className={styles.exportButton}
                      href={getGarbageWeightReportHref(selectedStartDate, selectedEndDate)}
                      target="_blank"
                    >
                      Excel татах
                    </a>
                    <a
                      className={styles.exportButton}
                      href={getReportHref({ report: "garbage", period: "today" })}
                    >
                      Өнөөдөр
                    </a>
                    <a
                      className={styles.exportButton}
                      href={getReportHref({ report: "garbage", period: "month" })}
                    >
                      Энэ сар
                    </a>
                  </div>
                </div>

                {garbageWeightError ? (
                  <div className={styles.weightError}>{garbageWeightError}</div>
                ) : null}

                <div className={styles.weightSummaryGrid}>
                  <article className={styles.weightSummaryCard}>
                    <span>Нийт жин</span>
                    <strong>{formatKgLabel(selectedGarbageTotalKg)}</strong>
                    <small>{selectedRangeLabel}</small>
                  </article>
                  <article className={styles.weightSummaryCard}>
                    <span>Огноо</span>
                    <strong>{selectedGarbageDayItems.length}</strong>
                    <small>Жин бүртгэгдсэн өдөр</small>
                  </article>
                  <article className={styles.weightSummaryCard}>
                    <span>Машин</span>
                    <strong>{selectedGarbageVehicleKeys.size}</strong>
                    <small>Жин орсон техник</small>
                  </article>
                  <article className={styles.weightSummaryCard}>
                    <span>Мөр</span>
                    <strong>{selectedGarbageRecordCount}</strong>
                    <small>Өдөр-машины нэгтгэсэн бичлэг</small>
                  </article>
                </div>

                {selectedGarbageVehicleRows.length ? (
                  <div className={styles.vehicleAggregateGrid}>
                    {selectedGarbageVehicleRows.map((row) => (
                      <article key={row.primaryLabel} className={styles.vehicleAggregateCard}>
                        <span>{row.primaryLabel}</span>
                        <strong>{formatKgLabel(row.kg)}</strong>
                        <small>
                          {row.dates.size} өдөр, {row.taskCount} ажил
                        </small>
                      </article>
                    ))}
                  </div>
                ) : null}

                {selectedGarbageDayItems.length ? (
                  <div className={styles.weightDayStack}>
                    {selectedGarbageDayItems.map((day) => (
                      <article key={day.dateKey} className={styles.weightDayCard}>
                        <div className={styles.weightDayHeader}>
                          <div>
                            <span className={styles.kicker}>Огноо</span>
                            <h3>{day.dateLabel}</h3>
                          </div>
                          <strong>{day.totalLabel}</strong>
                        </div>

                        <div className={styles.weightVehicleList}>
                          {day.rows.map((row) => (
                            <article key={`${day.dateKey}-${row.vehicleKey}`} className={styles.weightVehicleRow}>
                              <div className={styles.weightVehicleMeta}>
                                <strong>{row.primaryLabel}</strong>
                                <span>
                                  {row.plate && row.vehicleName !== row.plate
                                    ? row.vehicleName
                                    : row.routeName}
                                </span>
                              </div>
                              <div className={styles.weightVehicleValue}>
                                <strong>{row.kgLabel}</strong>
                                <span>{row.taskCount} ажил</span>
                              </div>
                            </article>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.weightEmpty}>
                    Odoo дээр одоогоор хог тээвэрлэлтийн жингийн бүртгэл алга байна.
                  </div>
                )}
              </section>
            ) : null}

            <section className={styles.sectionCard}>
              <div className={styles.weightSectionHeader}>
                <div>
                  <span className={styles.kicker}>Худалдан авалтын тайлан</span>
                  <h2>Хүсэлт, төлбөр, хүлээн авалтын нэгтгэл</h2>
                  <p>
                    Сонгосон хугацаанд шаардлагатай огноо, төлбөр, хүлээн авалт бүртгэгдсэн
                    худалдан авалтын хүсэлтүүдийг дүнгээр нь харуулна.
                  </p>
                </div>
                <div className={styles.weightMetaCard}>
                  <span>Системийн нийт тойм</span>
                  <strong>{procurementDashboard.metrics.total} хүсэлт</strong>
                  <small>{procurementDashboard.metrics.delayed} хоцорсон, {procurementDashboard.metrics.payment_pending} төлбөр хүлээгдэж байна</small>
                </div>
              </div>

              {procurementReportError ? (
                <div className={styles.weightError}>{procurementReportError}</div>
              ) : null}

              <div className={styles.procurementReportGrid}>
                <article className={styles.procurementMetricCard}>
                  <span>Сонгосон хугацааны хүсэлт</span>
                  <strong>{selectedProcurementItems.length}</strong>
                  <small>{selectedRangeLabel}</small>
                </article>
                <article className={styles.procurementMetricCard}>
                  <span>Нийт дүн</span>
                  <strong>{formatMoneyLabel(procurementTotalAmount)}</strong>
                  <small>Сонгосон нийлүүлэгч эсвэл ойролцоо дүн</small>
                </article>
                <article className={styles.procurementMetricCard}>
                  <span>Төлсөн дүн</span>
                  <strong>{formatMoneyLabel(procurementPaidAmount)}</strong>
                  <small>{procurementPendingCount} хүсэлт хүлээгдэж байна</small>
                </article>
                <article className={styles.procurementMetricCard}>
                  <span>1 саяас дээш</span>
                  <strong>{procurementHighValueCount}</strong>
                  <small>{procurementDelayedCount} хоцорсон хүсэлт</small>
                </article>
              </div>

              {selectedProcurementItems.length ? (
                <div className={styles.procurementList}>
                  {selectedProcurementItems.slice(0, 6).map((item) => (
                    <article key={item.id} className={styles.procurementListItem}>
                      <div>
                        <strong>{item.title || item.name}</strong>
                        <span>{item.department?.name || "Алба нэгж тодорхойгүй"}</span>
                      </div>
                      <div>
                        <strong>{formatMoneyLabel(item.selected_supplier_total || item.amount_approx_total || 0)}</strong>
                        <span>{item.state.label}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.weightEmpty}>
                  Сонгосон хугацаанд худалдан авалтын хүсэлт бүртгэгдээгүй байна.
                </div>
              )}
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.workflowHeader}>
                <div>
                  <span className={styles.kicker}>Өнөөдрийн явц</span>
                  <h2>Өнөөдөр явагдаж буй ажил</h2>
                  <p>
                    Үйл ажиллагаа хариуцсан менежерийн шалгалтад орохоос өмнөх явц, шалгалт
                    хүлээж буй ажил, бүрэн баталгаажсан ажлыг тусад нь харуулна.
                  </p>
                </div>
                <div className={styles.workflowMetaCard}>
                  <span>Өнөөдрийн дундаж явц</span>
                  <strong>{todayAverageProgress}%</strong>
                  <small>{todayScopedTasks.length} даалгаврын нийлбэр төлөв</small>
                </div>
              </div>

              <div className={styles.workflowSummaryGrid}>
                <article className={styles.workflowSummaryCard}>
                  <span>Өнөөдрийн ажил</span>
                  <strong>{todayScopedTasks.length}</strong>
                  <small>Өнөөдрийн огноонд төлөвлөгдсөн нийт даалгавар</small>
                </article>
                <article className={styles.workflowSummaryCard}>
                  <span>Явж буй</span>
                  <strong>{todayActiveTasks.length}</strong>
                  <small>Шалгалтад хараахан ороогүй даалгавар</small>
                </article>
                <article className={styles.workflowSummaryCard}>
                  <span>Шалгалт хүлээж буй</span>
                  <strong>{todayReviewTasks.length}</strong>
                  <small>Үйл ажиллагаа хариуцсан менежерийн шийдвэр хүлээж буй даалгавар</small>
                </article>
                <article className={styles.workflowSummaryCard}>
                  <span>Бүрэн дууссан</span>
                  <strong>{todayDoneTasks.length}</strong>
                  <small>Баталгаажиж хаагдсан даалгавар</small>
                </article>
              </div>

              <div className={styles.workflowColumns}>
                <article className={styles.workflowColumn}>
                  <div className={styles.workflowColumnHeader}>
                    <div>
                      <span className={styles.kicker}>Явж буй</span>
                      <h3>Шалгалтаас өмнөх явц</h3>
                    </div>
                    <strong>{todayActiveTasks.length}</strong>
                  </div>
                  {todayActiveTasks.length ? (
                    <div className={styles.workflowList}>
                      {todayActiveTasks.map((task) => (
                        <article key={task.id} className={styles.workflowItem}>
                          <div className={styles.workflowItemTop}>
                            <div>
                              <strong>{task.name}</strong>
                              <p>{task.projectName}</p>
                            </div>
                            <span className={styles.workflowItemBadge}>{task.progress}%</span>
                          </div>
                          <div className={styles.workflowItemMeta}>
                            <span>{task.leaderName || "Хариуцагчгүй"}</span>
                            <span>
                              {formatQuantity(task.completedQuantity, task.measurementUnit)}
                            </span>
                          </div>
                          <div className={styles.workflowTrack} aria-hidden>
                            <span style={{ width: `${Math.max(task.progress, 4)}%` }} />
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.workflowEmpty}>
                      Өнөөдрийн явж буй ажил одоогоор алга байна.
                    </div>
                  )}
                </article>

                <article className={styles.workflowColumn}>
                  <div className={styles.workflowColumnHeader}>
                    <div>
                      <span className={styles.kicker}>Шалгалт</span>
                      <h3>Үйл ажиллагаа хариуцсан менежер хүлээж буй</h3>
                    </div>
                    <strong>{todayReviewTasks.length}</strong>
                  </div>
                  {todayReviewTasks.length ? (
                    <div className={styles.workflowList}>
                      {todayReviewTasks.map((task) => (
                        <article key={task.id} className={styles.workflowItem}>
                          <div className={styles.workflowItemTop}>
                            <div>
                              <strong>{task.name}</strong>
                              <p>{task.projectName}</p>
                            </div>
                            <span className={styles.workflowItemBadge}>Шалгалт</span>
                          </div>
                          <div className={styles.workflowItemMeta}>
                            <span>{task.leaderName || "Хариуцагчгүй"}</span>
                            <span>{task.stageLabel}</span>
                          </div>
                          <div className={styles.workflowTrack} aria-hidden>
                            <span style={{ width: "100%" }} />
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.workflowEmpty}>
                      Үйл ажиллагаа хариуцсан менежерийн шалгалт хүлээж буй ажил алга байна.
                    </div>
                  )}
                </article>

                <article className={styles.workflowColumn}>
                  <div className={styles.workflowColumnHeader}>
                    <div>
                      <span className={styles.kicker}>Дууссан</span>
                      <h3>Бүрэн баталгаажсан</h3>
                    </div>
                    <strong>{todayDoneTasks.length}</strong>
                  </div>
                  {todayDoneTasks.length ? (
                    <div className={styles.workflowList}>
                      {todayDoneTasks.map((task) => (
                        <article key={task.id} className={styles.workflowItem}>
                          <div className={styles.workflowItemTop}>
                            <div>
                              <strong>{task.name}</strong>
                              <p>{task.projectName}</p>
                            </div>
                            <span className={styles.workflowItemBadge}>100%</span>
                          </div>
                          <div className={styles.workflowItemMeta}>
                            <span>{task.leaderName || "Хариуцагчгүй"}</span>
                            <span>{task.stageLabel}</span>
                          </div>
                          <div className={styles.workflowTrack} aria-hidden>
                            <span style={{ width: "100%" }} />
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.workflowEmpty}>
                      Өнөөдрийн баталгаажсан ажил одоогоор алга байна.
                    </div>
                  )}
                </article>
              </div>
            </section>

            {groupedReports.length ? (
              <section className={styles.projectStack}>
                {groupedReports.map((group) => (
                  <article key={`${group.departmentName}-${group.projectName}`} className={styles.projectSection}>
                    <div className={styles.projectHeader}>
                      <div>
                        <span className={styles.kicker}>{group.departmentName}</span>
                        <h2>{group.projectName}</h2>
                        <p>{group.reports.length} тайлан орсон ажил</p>
                      </div>
                      <div className={styles.projectMeta}>
                        <div>
                          <span>Сүүлд орсон</span>
                          <strong>{group.latestSubmittedAt}</strong>
                        </div>
                        <div>
                          <span>Тайлан</span>
                          <strong>{group.reports.length}</strong>
                        </div>
                      </div>
                    </div>

                    <div className={styles.reportList}>
                      {group.reports.map((report) => {
                        const task = report.taskId ? taskDirectoryById.get(report.taskId) : undefined;
                        const canFinishReview =
                          canReviewReports &&
                          Boolean(task) &&
                          task?.stageBucket !== "done" &&
                          (task?.stageBucket === "review" || report.stateBucket === "review") &&
                          !(task?.assigneeIds?.includes(session.uid) ?? false) &&
                          report.reporterId !== session.uid;
                        const taskHref = report.taskId
                          ? `/tasks/${report.taskId}?returnTo=${encodeURIComponent("/reports")}#task-actions`
                          : "";

                        return (
                        <article key={report.id} className={styles.reportCard}>
                          <div className={styles.reportTop}>
                            <div>
                              <strong>{report.taskName}</strong>
                              <p>{report.submittedAt}</p>
                            </div>
                            <span className={styles.reportStamp}>{reportStatusLabel(report)}</span>
                          </div>

                          <div className={styles.reportMeta}>
                            <span>Илгээгч: {report.reporter}</span>
                            <span>
                              Хэмжээ: {formatQuantity(report.reportedQuantity, report.measurementUnit)}
                            </span>
                            <span>Зураг: {report.imageCount}</span>
                            <span>Аудио: {report.audioCount}</span>
                          </div>

                          <div className={styles.summaryBox}>{report.summary}</div>

                          <div className={styles.reportActions}>
                            {taskHref ? (
                              <Link href={taskHref} className={styles.reportActionLink}>
                                Ажил шалгах
                              </Link>
                            ) : null}
                            {canFinishReview && report.taskId ? (
                              <form action={markTaskDoneAction}>
                                <input type="hidden" name="task_id" value={report.taskId} />
                                <button type="submit" className={styles.reportDoneButton}>
                                  Ажил хянаж дуусгах
                                </button>
                              </form>
                            ) : null}
                          </div>

                          {report.images.length ? (
                            <div className={dashboardStyles.reportImageGrid}>
                              {report.images.map((image) => (
                                <a
                                  key={image.id}
                                  href={image.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={dashboardStyles.reportImageLink}
                                >
                                  <Image
                                    src={image.url}
                                    alt={`${report.taskName} - ${image.name}`}
                                    className={dashboardStyles.reportImage}
                                    width={320}
                                    height={240}
                                    unoptimized
                                  />
                                </a>
                              ))}
                            </div>
                          ) : null}

                          {report.audios.length ? (
                            <div className={dashboardStyles.reportAudioList}>
                              {report.audios.map((audio) => (
                                <div key={audio.id} className={dashboardStyles.reportAudioCard}>
                                  <strong>{audio.name}</strong>
                                  <audio
                                    controls
                                    preload="none"
                                    src={audio.url}
                                    className={dashboardStyles.reportAudioPlayer}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </article>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </section>
            ) : (
              <section className={styles.emptyState}>
                <span className={styles.kicker}>Хоосон төлөв</span>
                <h2>Энэ хүрээнд тайлан алга</h2>
                <p>Өөр хэлтэс эсвэл доторх нэгж сонгож үзнэ үү.</p>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
