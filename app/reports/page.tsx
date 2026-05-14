import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { markTaskDoneAction } from "@/app/actions";
import dashboardStyles from "@/app/page.module.css";
import shellStyles from "@/app/workspace.module.css";
import {
  canAccessProcurementModule,
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { loadSessionDepartmentName, loadSessionEmployeeDepartmentName } from "@/lib/access-scope";
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
import { loadGarbageWeightLedger, type GarbageWeightProofImage } from "@/lib/garbage-weight-ledger";
import {
  filterProjectsForResponsibleMaster,
  filterTasksForResponsibleMaster,
} from "@/lib/master-scope";
import { loadFleetVehicleBoard, loadMunicipalSnapshot } from "@/lib/odoo";
import {
  createEmptyProcurementDashboard,
  isProcurementSetupError,
  loadProcurementDashboard,
} from "@/lib/procurement";
import type { RoleGroupFlags } from "@/lib/roles";
import { loadGarbageVehicleOptions } from "@/lib/workspace";

import { GarbageVehicleSelect } from "./garbage-vehicle-select";
import styles from "./reports.module.css";

function canViewAllGarbageWeightReports(session: Awaited<ReturnType<typeof requireSession>>) {
  const flags: Partial<RoleGroupFlags> = session.groupFlags || {};
  return Boolean(
    session.role === "system_admin" ||
      session.role === "director" ||
      session.role === "general_manager" ||
      flags.municipalDirector ||
      flags.municipalManager ||
      flags.mfoManager ||
      flags.mfoDispatcher ||
      flags.fleetRepairManager ||
      flags.fleetRepairGeneralManager ||
      flags.fleetRepairCeo
  );
}

type PageProps = {
  searchParams?: Promise<{
    department?: string | string[];
    unit?: string | string[];
    report?: string | string[];
    period?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
    vehicle?: string | string[];
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

function groupReportsByProject(reports: FeedReport[]) {
  return Array.from(
    reports.reduce<Map<string, ReportGroup>>((accumulator, report) => {
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
}

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

function formatTonLabel(value: number) {
  return `${new Intl.NumberFormat("mn-MN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 1000)} тонн`;
}

function formatMoneyLabel(value: number) {
  return `${new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: 0,
  }).format(Math.round(value))} ₮`;
}

function dateKeyFromValue(value?: string | null) {
  const candidate = value?.slice(0, 10) ?? "";
  return isDateKey(candidate) ? candidate : "";
}

function repairDateKey(
  repair: Awaited<ReturnType<typeof loadFleetVehicleBoard>>["allVehicles"][number]["repairHistory"][number],
) {
  return (
    dateKeyFromValue(repair.requestDateValue) ||
    dateKeyFromValue(repair.repairStartedAtValue) ||
    dateKeyFromValue(repair.repairDoneAtValue)
  );
}

function isOpenRepairState(stateKey: string, stateLabel: string) {
  const normalized = `${stateKey} ${stateLabel}`.toLocaleLowerCase("mn-MN");
  return ![
    "done",
    "vehicle_returned",
    "cancelled",
    "дууссан",
    "буцаасан",
    "цуцлагдсан",
  ].some((token) => normalized.includes(token));
}

function isEmergencyWorkText(value: string) {
  const normalized = value.toLocaleLowerCase("mn-MN");
  return normalized.includes("гэнэтийн") || normalized.includes("garbage_seasonal");
}

function normalizeVehicleLookup(value: string) {
  return value.toLocaleUpperCase("mn-MN").replace(/\s+/g, "");
}

function normalizeScopeLookup(value: string) {
  return value.toLocaleLowerCase("mn-MN").replace(/[,\s]+/g, " ").trim();
}

function extractReportVehicleLabel(report: Pick<FeedReport, "taskName" | "projectName">) {
  const source = report.taskName || report.projectName;
  const firstPart = source.split(" - ")[0]?.split("/")[0]?.trim();
  return firstPart || "Машин тодорхойгүй";
}

function extractReportPointName(report: Pick<FeedReport, "taskName" | "summary">) {
  const parts = report.taskName.split(" - ").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    const pointParts = parts.slice(1).filter((part) => !/^\d{4}-\d{2}-\d{2}$/.test(part));
    return pointParts.join(" - ") || report.summary || report.taskName;
  }

  return report.summary || report.taskName;
}

function extractReportDateKey(report: Pick<FeedReport, "submittedAt" | "taskName">) {
  return (
    report.submittedAt.match(/\d{4}-\d{2}-\d{2}/)?.[0] ??
    report.taskName.match(/\d{4}-\d{2}-\d{2}/)?.[0] ??
    ""
  );
}

function formatSubmittedTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value || "Цаг бүртгэгдээгүй";
  }

  return new Intl.DateTimeFormat("mn-MN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
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
  const requestedVehicle = getDepartmentParam(params.vehicle);

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

  const groupedReports = groupReportsByProject(filteredReports);
  const taskDirectoryById = new Map(filteredTaskDirectory.map((task) => [task.id, task]));
  const emergencyTasks = filteredTaskDirectory.filter((task) =>
    isEmergencyWorkText(`${task.operationTypeLabel} ${task.projectName} ${task.name}`),
  );
  const emergencyTaskIds = new Set(emergencyTasks.map((task) => task.id));
  const emergencyReports = filteredReports.filter((report) => {
    if (report.taskId && emergencyTaskIds.has(report.taskId)) {
      return true;
    }
    return isEmergencyWorkText(`${report.projectName} ${report.taskName} ${report.summary}`);
  });
  const emergencyGroupedReports = groupReportsByProject(emergencyReports);
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
  const canViewProcurementReport = canAccessProcurementModule(session);
  const canViewFleetRepairReport = Boolean(
    isGarbageTransportView ||
      session.groupFlags?.fleetRepairAny ||
      session.groupFlags?.fleetRepairManager ||
      session.groupFlags?.fleetRepairGeneralManager ||
      session.groupFlags?.fleetRepairCeo ||
      session.role === "system_admin" ||
      session.role === "director" ||
      session.role === "general_manager",
  );
  const showFleetRepairReportType = isGarbageTransportView && canViewFleetRepairReport;
  const availableReportTypes = [
    "garbage",
    ...(showFleetRepairReportType ? ["repair"] : []),
    "emergency",
    ...(canViewProcurementReport ? ["procurement"] : []),
    "work",
  ];
  const defaultReportType = isGarbageTransportView ? "garbage" : "work";
  const selectedReportType = availableReportTypes.includes(requestedReport)
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
  const displayedGroupedReports =
    selectedReportType === "emergency" ? emergencyGroupedReports : groupedReports;

  let garbageWeightLedger = null as Awaited<ReturnType<typeof loadGarbageWeightLedger>> | null;
  let garbageWeightError = "";
  let garbageFleetVehicleOptions = [] as Awaited<ReturnType<typeof loadGarbageVehicleOptions>>;
  const canViewAllGarbageWeight = canViewAllGarbageWeightReports(session);
  let garbageWeightScopeName: string | null = null;
  if (selectedReportType === "garbage") {
    garbageWeightScopeName = canViewAllGarbageWeight
      ? null
      : await loadSessionEmployeeDepartmentName(session);

    try {
      if (!canViewAllGarbageWeight && !garbageWeightScopeName) {
        garbageWeightError = "Хэрэглэгчийн хэлтсийг тодорхойлж чадсангүй.";
      } else {
        garbageWeightLedger = await loadGarbageWeightLedger(
          {
            login: session.login,
            password: session.password,
          },
          { maxDays: 90, scopedDepartmentName: garbageWeightScopeName },
        );
      }
    } catch (error) {
      console.error("Garbage transport weight ledger could not be loaded:", error);
      garbageWeightError =
        "Хог тээвэрлэлтийн жингийн мэдээллийг уншиж чадсангүй.";
    }

    try {
      garbageFleetVehicleOptions = isGarbageTransportView
        ? await loadGarbageVehicleOptions(
            {
              login: session.login,
              password: session.password,
            },
            { ignoreCurrentEmployeeScope: true },
          )
        : [];
    } catch (error) {
      console.warn("Garbage vehicle options for report could not be loaded:", error);
    }
  }

  let procurementDashboard = createEmptyProcurementDashboard();
  let procurementReportError = "";
  if (canViewProcurementReport && selectedReportType === "procurement") {
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
      ? "Худалдан авалтын модуль идэвхгүй байна."
      : "Худалдан авалтын тайлангийн мэдээллийг уншиж чадсангүй.";
  }
  }

  let fleetRepairBoard = null as Awaited<ReturnType<typeof loadFleetVehicleBoard>> | null;
  let fleetRepairReportError = "";
  if (showFleetRepairReportType && selectedReportType === "repair") {
    try {
      fleetRepairBoard = await loadFleetVehicleBoard();
    } catch (error) {
      console.error("Fleet repair report could not be loaded:", error);
      fleetRepairReportError = "Авто баазын засварын тайланг уншиж чадсангүй.";
    }
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
      departmentName: string;
      driverNames: Set<string>;
      proofImages: GarbageWeightProofImage[];
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
        for (const driverName of row.driverNames) {
          existing.driverNames.add(driverName);
        }
        for (const image of row.proofImages) {
          if (
            !existing.proofImages.some((existingImage) => existingImage.id === image.id) &&
            existing.proofImages.length < 6
          ) {
            existing.proofImages.push(image);
          }
        }
      } else {
        selectedGarbageVehicleTotals.set(row.vehicleKey, {
          vehicleName: row.vehicleName,
          primaryLabel: row.primaryLabel,
          departmentName: row.departmentName,
          driverNames: new Set(row.driverNames),
          proofImages: [...row.proofImages],
          kg: row.kg,
          taskCount: row.taskCount,
          dates: new Set([day.dateKey]),
        });
      }
    }
  }

  const selectedGarbageVehicleRows = Array.from(selectedGarbageVehicleTotals.entries())
    .map(([vehicleKey, row]) => ({ vehicleKey, ...row }))
    .sort((left, right) => right.kg - left.kg);
  const garbageReportVehicleOptions = new Map<
    string,
    {
      key: string;
      label: string;
      detail: string;
      lookup: string;
      driverName?: string;
      loaderNames?: string[];
    }
  >();
  const garbageFleetScopeLookup = garbageWeightScopeName ? normalizeScopeLookup(garbageWeightScopeName) : "";
  const visibleGarbageFleetVehicleOptions = garbageFleetVehicleOptions.filter((vehicle) => {
    if (!garbageFleetScopeLookup || !vehicle.departmentName) {
      return true;
    }
    return normalizeScopeLookup(vehicle.departmentName) === garbageFleetScopeLookup;
  });
  for (const row of selectedGarbageVehicleRows) {
    garbageReportVehicleOptions.set(row.vehicleKey, {
      key: row.vehicleKey,
      label: row.primaryLabel,
      detail: row.vehicleName,
      lookup: normalizeVehicleLookup(`${row.primaryLabel} ${row.vehicleName}`),
    });
  }
  for (const vehicle of visibleGarbageFleetVehicleOptions) {
    const key = String(vehicle.id);
    const label = vehicle.plate || vehicle.label || `Машин #${vehicle.id}`;
    if (!garbageReportVehicleOptions.has(key)) {
      garbageReportVehicleOptions.set(key, {
      key,
      label,
      detail: vehicle.departmentName || "Авто баазын бүртгэлтэй машин",
      lookup: normalizeVehicleLookup(`${label} ${vehicle.label}`),
      driverName: vehicle.driverName,
      loaderNames: vehicle.loaderNames,
    });
  }
  }
  for (const report of filteredReports) {
    const label = extractReportVehicleLabel(report);
    const key = `report-${normalizeVehicleLookup(label)}`;
    if (!garbageReportVehicleOptions.has(key)) {
      garbageReportVehicleOptions.set(key, {
        key,
        label,
        detail: "Тайлангаас илэрсэн машин",
        lookup: normalizeVehicleLookup(label),
      });
    }
  }
  const garbageReportVehicleList = Array.from(garbageReportVehicleOptions.values());
  const selectedGarbageVehicleKey =
    requestedVehicle && garbageReportVehicleOptions.has(requestedVehicle)
      ? requestedVehicle
      : (garbageReportVehicleList[0]?.key ?? "");
  const selectedGarbageVehicleOption =
    garbageReportVehicleOptions.get(selectedGarbageVehicleKey) ?? garbageReportVehicleList[0] ?? null;
  const selectedGarbageFleetVehicle =
    visibleGarbageFleetVehicleOptions.find((vehicle) => String(vehicle.id) === selectedGarbageVehicleKey) ??
    visibleGarbageFleetVehicleOptions.find((vehicle) =>
      selectedGarbageVehicleOption
        ? normalizeVehicleLookup(`${vehicle.plate} ${vehicle.label}`).includes(selectedGarbageVehicleOption.lookup) ||
          selectedGarbageVehicleOption.lookup.includes(normalizeVehicleLookup(vehicle.plate || vehicle.label))
        : false,
    ) ??
    null;
  const selectedGarbageVehicleRow =
    selectedGarbageVehicleRows.find((row) => row.vehicleKey === selectedGarbageVehicleKey) ??
    selectedGarbageVehicleRows.find((row) =>
      selectedGarbageVehicleOption
        ? normalizeVehicleLookup(`${row.primaryLabel} ${row.vehicleName}`).includes(selectedGarbageVehicleOption.lookup)
        : false,
    ) ??
    null;
  const selectedGarbageVehicleDayItems = selectedGarbageDayItems
    .map((day) => ({
      ...day,
      rows: day.rows.filter((row) =>
        selectedGarbageVehicleRow
          ? row.vehicleKey === selectedGarbageVehicleRow.vehicleKey
          : selectedGarbageVehicleOption
            ? normalizeVehicleLookup(`${row.primaryLabel} ${row.vehicleName}`).includes(selectedGarbageVehicleOption.lookup)
            : false,
      ),
    }))
    .filter((day) => day.rows.length);
  const selectedGarbageVehicleTotalKg = selectedGarbageVehicleDayItems.reduce(
    (sum, day) => sum + day.rows.reduce((daySum, row) => daySum + row.kg, 0),
    0,
  );
  const selectedGarbageVehicleRecordCount = selectedGarbageVehicleDayItems.reduce(
    (sum, day) => sum + day.rows.reduce((daySum, row) => daySum + row.taskCount, 0),
    0,
  );
  const selectedGarbageTripReports = filteredReports
    .filter((report) => {
      if (!selectedGarbageVehicleOption) {
        return false;
      }
      const reportVehicleLookup = normalizeVehicleLookup(extractReportVehicleLabel(report));
      return (
        reportVehicleLookup === selectedGarbageVehicleOption.lookup ||
        selectedGarbageVehicleOption.lookup.includes(reportVehicleLookup) ||
        normalizeVehicleLookup(report.taskName).includes(selectedGarbageVehicleOption.lookup)
      );
    })
    .filter((report) => {
      const dateKey = extractReportDateKey(report);
      return !dateKey || (dateKey >= selectedStartDate && dateKey <= selectedEndDate);
    })
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
    .slice(0, 12);
  const selectedGarbageTopVehicle = selectedGarbageVehicleRow;
  const selectedGarbageProofImages = (
    selectedGarbageTripReports.length
      ? selectedGarbageTripReports.flatMap((report) =>
          report.images.map((image) => ({
            id: image.id,
            name: image.name,
            url: image.url,
            proofType: "",
            capturedAt: report.submittedAt,
            uploaderName: report.reporter,
          })),
        )
      : (selectedGarbageVehicleRow?.proofImages ?? [])
  )
    .filter(
      (image, index, images) => images.findIndex((candidate) => candidate.id === image.id) === index,
    )
    .slice(0, 6);
  const classifiedBeforeProofImages = selectedGarbageProofImages.filter((image) => {
    const type = image.proofType.toLocaleLowerCase("mn-MN");
    return type.includes("before") || type.includes("start") || type.includes("өмнө");
  });
  const classifiedAfterProofImages = selectedGarbageProofImages.filter((image) => {
    const type = image.proofType.toLocaleLowerCase("mn-MN");
    return type.includes("after") || type.includes("done") || type.includes("дараа");
  });
  const selectedGarbageBeforeProofImages = (
    classifiedBeforeProofImages.length ? classifiedBeforeProofImages : selectedGarbageProofImages.slice(0, 3)
  ).slice(0, 3);
  const selectedGarbageAfterProofImages = (
    classifiedAfterProofImages.length ? classifiedAfterProofImages : selectedGarbageProofImages.slice(3, 6)
  ).slice(0, 3);
  const selectedGarbageDriverLabel =
    (selectedGarbageVehicleRow ? Array.from(selectedGarbageVehicleRow.driverNames) : [])
      .filter(Boolean)
      .slice(0, 2)
      .join(", ") ||
    selectedGarbageVehicleOption?.driverName ||
    selectedGarbageFleetVehicle?.driverName ||
    "Бүртгэгдээгүй";
  const selectedGarbageLoaderLabel =
    (
      selectedGarbageVehicleOption?.loaderNames?.filter(Boolean).join(", ") ||
      selectedGarbageFleetVehicle?.loaderNames?.filter(Boolean).join(", ")
    ) || "Бүртгэгдээгүй";
  const selectedGarbageVehicleLabel =
    selectedGarbageTopVehicle?.primaryLabel ||
    selectedGarbageVehicleOption?.label ||
    selectedGarbageFleetVehicle?.plate ||
    "Бүртгэлгүй";
  const selectedGarbageTripCount =
    selectedGarbageTripReports.length || selectedGarbageVehicleRecordCount;
  const selectedGarbagePointCount = selectedGarbageTripReports.length;
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
  const repairVehicleOptions = fleetRepairBoard?.allVehicles ?? [];
  const selectedRepairVehicleId =
    requestedVehicle && requestedVehicle !== "all" && Number.isFinite(Number(requestedVehicle))
      ? Number(requestedVehicle)
      : 0;
  const selectedRepairVehicle =
    selectedRepairVehicleId > 0
      ? repairVehicleOptions.find((vehicle) => vehicle.id === selectedRepairVehicleId) ?? null
      : null;
  const allRepairReportRows = repairVehicleOptions
    .flatMap((vehicle) =>
      vehicle.repairHistory.map((repair) => ({
        ...repair,
        vehicleId: vehicle.id,
        vehiclePlate: vehicle.plate,
        vehicleName: vehicle.name,
        vehicleModel: vehicle.modelName || vehicle.vehicleTypeName || vehicle.categoryName,
        vehicleStateLabel: vehicle.stateLabel,
        dateKey: repairDateKey(repair),
      })),
    )
    .sort((left, right) => {
      const leftDate = left.dateKey || left.requestDateValue || "";
      const rightDate = right.dateKey || right.requestDateValue || "";
      return rightDate.localeCompare(leftDate) || right.id - left.id;
    });
  const selectedRepairReportRows = allRepairReportRows.filter((repair) => {
    if (selectedRepairVehicleId > 0 && repair.vehicleId !== selectedRepairVehicleId) {
      return false;
    }
    return repair.dateKey ? repair.dateKey >= selectedStartDate && repair.dateKey <= selectedEndDate : true;
  });
  const activeRepairRows = selectedRepairReportRows.filter((repair) =>
    isOpenRepairState(repair.stateKey, repair.stateLabel),
  );
  const doneRepairRows = selectedRepairReportRows.filter(
    (repair) => !isOpenRepairState(repair.stateKey, repair.stateLabel),
  );
  const repairReportVehicleCount = new Set(selectedRepairReportRows.map((repair) => repair.vehicleId)).size;
  const repairReportAmount = selectedRepairReportRows.reduce((sum, repair) => sum + repair.amount, 0);
  const repairReportAttachmentCount = selectedRepairReportRows.reduce(
    (sum, repair) => sum + repair.attachmentCount,
    0,
  );
  const repairSummaryCards = [
    {
      title: "Сонгосон машин",
      value: selectedRepairVehicle?.plate || "Бүх машин",
      note: selectedRepairVehicle?.name || "Авто баазын бүх засварын бүртгэл",
    },
    {
      title: "Засварын мөр",
      value: String(selectedRepairReportRows.length),
      note: selectedRangeLabel,
    },
    {
      title: "Засвартай машин",
      value: String(fleetRepairBoard?.repairCount ?? activeRepairRows.length),
      note: "Одоо засварын төлөвтэй",
    },
    {
      title: "Нийт зардал",
      value: formatMoneyLabel(repairReportAmount),
      note: "Сонгосон хугацааны дүн",
    },
    {
      title: "Дууссан засвар",
      value: String(doneRepairRows.length),
      note: "Хаагдсан / буцаасан төлөв",
    },
    {
      title: "Хавсралт",
      value: String(repairReportAttachmentCount),
      note: "Зураг, баримтын тоо",
    },
  ] as const;
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
              userRole={session.role}
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

            {!isGarbageTransportView ? (
              <>
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
              {isGarbageTransportView && selectedReportType === "repair" ? (
                repairSummaryCards.map((card) => (
                  <article key={card.title} className={styles.summaryCard}>
                    <span>{card.title}</span>
                    <strong>{card.value}</strong>
                    <small>{card.note}</small>
                  </article>
                ))
              ) : isGarbageTransportView && selectedReportType === "emergency" ? (
                <>
                  <article className={styles.summaryCard}>
                    <span>Гэнэтийн ажил</span>
                    <strong>{emergencyTasks.length}</strong>
                    <small>Сонгосон хүрээнд бүртгэлтэй</small>
                  </article>
                  <article className={styles.summaryCard}>
                    <span>Гэнэтийн тайлан</span>
                    <strong>{emergencyReports.length}</strong>
                    <small>{emergencyGroupedReports.length} ажлын багц</small>
                  </article>
                  <article className={styles.summaryCard}>
                    <span>Хяналт</span>
                    <strong>{emergencyTasks.filter((task) => task.stageBucket === "review").length}</strong>
                    <small>Шалгалт хүлээж буй ажил</small>
                  </article>
                </>
              ) : isGarbageTransportView ? (
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
              {selectedReportType === "emergency" ? (
                <>
                  <article className={styles.summaryCard}>
                    <span>Гэнэтийн ажил</span>
                    <strong>{emergencyTasks.length}</strong>
                    <small>Сонгосон хүрээнд бүртгэлтэй</small>
                  </article>
                  <article className={styles.summaryCard}>
                    <span>Гэнэтийн тайлан</span>
                    <strong>{emergencyReports.length}</strong>
                    <small>{emergencyGroupedReports.length} ажлын багц</small>
                  </article>
                  <article className={styles.summaryCard}>
                    <span>Хяналт</span>
                    <strong>{emergencyTasks.filter((task) => task.stageBucket === "review").length}</strong>
                    <small>Шалгалт хүлээж буй ажил</small>
                  </article>
                  <article className={styles.summaryCard}>
                    <span>Зураг</span>
                    <strong>{emergencyReports.reduce((sum, report) => sum + report.imageCount, 0)}</strong>
                    <small>Гэнэтийн ажлын хавсралт</small>
                  </article>
                </>
              ) : (
                <>
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
                    report: "emergency",
                    period: activePeriodKey,
                    startDate: selectedStartDate,
                    endDate: selectedEndDate,
                  })}
                  className={`${styles.reportTypeCard} ${
                    selectedReportType === "emergency" ? styles.reportTypeCardActive : ""
                  }`}
                >
                  <span>Гэнэтийн ажлын тайлан</span>
                  <strong>{emergencyReports.length} тайлан</strong>
                  <small>{emergencyTasks.length} гэнэтийн ажил дээр бүртгэгдсэн</small>
                </Link>
                {showFleetRepairReportType ? (
                  <Link
                    href={getReportHref({
                      report: "repair",
                      period: activePeriodKey,
                      startDate: selectedStartDate,
                      endDate: selectedEndDate,
                    })}
                    className={`${styles.reportTypeCard} ${
                      selectedReportType === "repair" ? styles.reportTypeCardActive : ""
                    }`}
                  >
                    <span>Авто баазын засвар</span>
                    <strong>
                      {selectedReportType === "repair"
                        ? `${selectedRepairReportRows.length} засвар`
                        : "Засварын тайлан"}
                    </strong>
                    <small>Машин, механик, сэлбэг, зардлын нэгтгэл</small>
                  </Link>
                ) : null}
                {canViewProcurementReport ? (
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
                ) : null}
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

              </>
            ) : null}

            {isGarbageTransportView ? (
              <div className={styles.garbageReportShell}>
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
                    <span>Хог тээврийн тайлан</span>
                    <strong>{formatKgLabel(selectedGarbageVehicleTotalKg || selectedGarbageTotalKg)}</strong>
                    <small>Машин, цэг, жолоочийн зурагтай жингийн тайлан</small>
                  </Link>
                  {showFleetRepairReportType ? (
                    <Link
                      href={getReportHref({
                        report: "repair",
                        period: activePeriodKey,
                        startDate: selectedStartDate,
                        endDate: selectedEndDate,
                        vehicle: selectedRepairVehicleId ? String(selectedRepairVehicleId) : "all",
                      })}
                      className={`${styles.reportTypeCard} ${
                        selectedReportType === "repair" ? styles.reportTypeCardActive : ""
                      }`}
                    >
                      <span>Авто баазын засвар</span>
                      <strong>
                        {selectedReportType === "repair"
                          ? `${selectedRepairReportRows.length} засвар`
                          : "Засварын тайлан"}
                    </strong>
                    <small>Машин, механик, сэлбэг, зардлын тайлан</small>
                  </Link>
                ) : null}
                  <Link
                    href={getReportHref({
                      report: "emergency",
                      period: activePeriodKey,
                      startDate: selectedStartDate,
                      endDate: selectedEndDate,
                    })}
                    className={`${styles.reportTypeCard} ${
                      selectedReportType === "emergency" ? styles.reportTypeCardActive : ""
                    }`}
                  >
                    <span>Гэнэтийн ажлын тайлан</span>
                    <strong>{emergencyReports.length} тайлан</strong>
                    <small>{emergencyTasks.length} ажил, шуурхай үүссэн тайлан</small>
                  </Link>
                </div>

                {selectedReportType === "repair" ? (
                  <section className={`${styles.reportPanel} ${styles.autoBasePanel}`}>
                    <div className={styles.reportPanelHeader}>
                      <div className={styles.reportPanelTitle}>
                        <span className={styles.reportPanelIcon}>АБ</span>
                        <div>
                          <h2>Авто баазын засварын тайлан</h2>
                          <p>Машин, засварын ажил, механик, сэлбэг болон зардлыг нэг дор харуулна</p>
                        </div>
                      </div>
                      <div className={styles.reportPanelBadge}>
                        <span>Хамрах хугацаа</span>
                        <strong>{selectedRangeLabel}</strong>
                      </div>
                    </div>

                    {fleetRepairReportError ? (
                      <div className={styles.weightError}>{fleetRepairReportError}</div>
                    ) : null}

                    <form className={styles.repairControlBar} action="/reports" method="get">
                      {exportParams.get("department") ? (
                        <input type="hidden" name="department" value={exportParams.get("department") ?? ""} />
                      ) : null}
                      {exportParams.get("unit") ? (
                        <input type="hidden" name="unit" value={exportParams.get("unit") ?? ""} />
                      ) : null}
                      <input type="hidden" name="report" value="repair" />
                      <input type="hidden" name="period" value="custom" />
                      <label className={styles.transportControlField}>
                        <span>Машин сонгох</span>
                        <select name="vehicle" defaultValue={selectedRepairVehicleId || "all"}>
                          <option value="all">Бүх машин</option>
                          {repairVehicleOptions.map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicle.plate} {vehicle.name !== vehicle.plate ? `- ${vehicle.name}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={styles.transportControlField}>
                        <span>Эхлэх огноо</span>
                        <input type="date" name="startDate" defaultValue={selectedStartDate} />
                      </label>
                      <label className={styles.transportControlField}>
                        <span>Дуусах огноо</span>
                        <input type="date" name="endDate" defaultValue={selectedEndDate} />
                      </label>
                      <div className={styles.transportTypeControl}>
                        <span>Хурдан сонголт</span>
                        <div className={styles.transportTypeButtons}>
                          <Link
                            href={getReportHref({
                              report: "repair",
                              period: "today",
                              vehicle: selectedRepairVehicleId ? String(selectedRepairVehicleId) : "all",
                            })}
                            className={`${styles.transportTypeButton} ${
                              activePeriodKey === "today" ? styles.transportTypeButtonActive : ""
                            }`}
                          >
                            Өдөр
                          </Link>
                          <Link
                            href={getReportHref({
                              report: "repair",
                              period: "week",
                              vehicle: selectedRepairVehicleId ? String(selectedRepairVehicleId) : "all",
                            })}
                            className={`${styles.transportTypeButton} ${
                              activePeriodKey === "week" ? styles.transportTypeButtonActive : ""
                            }`}
                          >
                            7 хоног
                          </Link>
                          <Link
                            href={getReportHref({
                              report: "repair",
                              period: "month",
                              vehicle: selectedRepairVehicleId ? String(selectedRepairVehicleId) : "all",
                            })}
                            className={`${styles.transportTypeButton} ${
                              activePeriodKey === "month" ? styles.transportTypeButtonActive : ""
                            }`}
                          >
                            Энэ сар
                          </Link>
                        </div>
                      </div>
                      <div className={styles.transportDateActions}>
                        <button type="submit">Харах</button>
                        <Link className={styles.transportDownloadButton} href="/auto-base">
                          Машины бүртгэл
                        </Link>
                      </div>
                    </form>

                    <div className={styles.transportKpiGrid}>
                      <article className={styles.transportKpiCard}>
                        <span>Нийт засвар</span>
                        <strong>{selectedRepairReportRows.length}</strong>
                        <small>{repairReportVehicleCount} машин хамрагдсан</small>
                      </article>
                      <article className={styles.transportKpiCard}>
                        <span>Нээлттэй засвар</span>
                        <strong>{activeRepairRows.length}</strong>
                        <small>{fleetRepairBoard?.repairCount ?? 0} машин засвартай</small>
                      </article>
                      <article className={styles.transportKpiCard}>
                        <span>Нийт зардал</span>
                        <strong>{formatMoneyLabel(repairReportAmount)}</strong>
                        <small>{repairReportAttachmentCount} хавсралттай</small>
                      </article>
                    </div>

                    <div className={styles.repairReportGrid}>
                      <article className={styles.transportInfoCard}>
                        <span className={styles.kicker}>Сонгосон машин</span>
                        <div className={styles.transportFieldGrid}>
                          <div className={styles.transportField}>
                            <span>Машин</span>
                            <strong>{selectedRepairVehicle?.plate || "Бүх машин"}</strong>
                          </div>
                          <div className={styles.transportField}>
                            <span>Загвар / төрөл</span>
                            <strong>
                              {selectedRepairVehicle?.modelName ||
                                selectedRepairVehicle?.vehicleTypeName ||
                                "Бүх төрлийн машин"}
                            </strong>
                          </div>
                          <div className={styles.transportField}>
                            <span>Жолооч</span>
                            <strong>
                              {selectedRepairVehicle?.responsibleDriverName ||
                                selectedRepairVehicle?.fleetDriverName ||
                                "Бүртгэгдээгүй"}
                            </strong>
                          </div>
                          <div className={styles.transportField}>
                            <span>Одоогийн төлөв</span>
                            <strong>{selectedRepairVehicle?.stateLabel || "Нэгдсэн тайлан"}</strong>
                          </div>
                        </div>
                      </article>

                      <article className={styles.transportMachineCard}>
                        <span className={styles.kicker}>Засвартай машинууд</span>
                        {fleetRepairBoard?.repairVehicles.length ? (
                          <div className={styles.repairVehicleList}>
                            {fleetRepairBoard.repairVehicles.slice(0, 8).map((vehicle) => (
                              <Link
                                key={vehicle.id}
                                href={getReportHref({
                                  report: "repair",
                                  period: activePeriodKey,
                                  startDate: selectedStartDate,
                                  endDate: selectedEndDate,
                                  vehicle: String(vehicle.id),
                                })}
                                className={styles.repairVehicleItem}
                              >
                                <strong>{vehicle.plate}</strong>
                                <span>{vehicle.stateLabel}</span>
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <div className={styles.noProofText}>Одоогоор засвартай машин алга байна.</div>
                        )}
                      </article>
                    </div>

                    <div className={styles.dailyWeightPanel}>
                      <div className={styles.dailyWeightHeader}>
                        <div>
                          <span className={styles.kicker}>Засварын мөрүүд</span>
                          <h3>Огноо, машин, засварын ажил, механик, зардал</h3>
                        </div>
                        <strong>{formatMoneyLabel(repairReportAmount)}</strong>
                      </div>

                      {selectedRepairReportRows.length ? (
                        <div className={styles.repairTable}>
                          <div className={styles.repairTableHead}>
                            <span>№</span>
                            <span>Огноо</span>
                            <span>Машин</span>
                            <span>Засварын ажил</span>
                            <span>Механик</span>
                            <span>Төлөв</span>
                            <span>Зардал</span>
                          </div>
                          {selectedRepairReportRows.map((repair, index) => (
                            <Link
                              key={`${repair.vehicleId}-${repair.id}`}
                              href={`/fleet-repair/requests/${repair.id}`}
                              className={styles.repairTableRow}
                            >
                              <span>{index + 1}</span>
                              <span>
                                {repair.dateKey ? formatDateLabel(repair.dateKey) : repair.requestDate || "Огноогүй"}
                              </span>
                              <strong>{repair.vehiclePlate}</strong>
                              <span>
                                <strong>{repair.name}</strong>
                                <small>
                                  {repair.description ||
                                    repair.damageType ||
                                    repair.partsNote ||
                                    "Засварын тайлбар бүртгэгдээгүй"}
                                </small>
                              </span>
                              <span>{repair.mechanicName || "Оноогоогүй"}</span>
                              <span className={styles.repairStatusPill}>{repair.stateLabel || "Төлөвгүй"}</span>
                              <strong>{repair.amountLabel}</strong>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.weightEmpty}>
                          Сонгосон хугацаа, машин дээр засварын бүртгэл алга байна.
                        </div>
                      )}
                    </div>
                  </section>
                ) : null}

                {selectedReportType === "emergency" ? (
                  <section className={`${styles.reportPanel} ${styles.transportPanel}`}>
                    <div className={styles.reportPanelHeader}>
                      <div className={styles.reportPanelTitle}>
                        <span className={styles.reportPanelIcon}>ГА</span>
                        <div>
                          <h2>Гэнэтийн ажлын тайлан</h2>
                          <p>Шуурхай үүсгэсэн ажил, орсон тайлан, зураг болон хяналтын төлөвийг нэг дор харуулна</p>
                        </div>
                      </div>
                      <div className={styles.reportPanelBadge}>
                        <span>Нийт тайлан</span>
                        <strong>{emergencyReports.length}</strong>
                      </div>
                    </div>

                    <div className={styles.transportKpiGrid}>
                      <article className={styles.transportKpiCard}>
                        <span>Гэнэтийн ажил</span>
                        <strong>{emergencyTasks.length}</strong>
                        <small>Сонгосон хүрээнд бүртгэлтэй</small>
                      </article>
                      <article className={styles.transportKpiCard}>
                        <span>Орсон тайлан</span>
                        <strong>{emergencyReports.length}</strong>
                        <small>{emergencyGroupedReports.length} ажлын багц</small>
                      </article>
                      <article className={styles.transportKpiCard}>
                        <span>Хяналт хүлээж буй</span>
                        <strong>
                          {emergencyTasks.filter((task) => task.stageBucket === "review").length}
                        </strong>
                        <small>Менежерийн шийдвэр хүлээж буй ажил</small>
                      </article>
                    </div>

                    {emergencyGroupedReports.length ? (
                      <div className={styles.emergencyReportStack}>
                        {emergencyGroupedReports.map((group) => (
                          <article key={`${group.departmentName}-${group.projectName}`} className={styles.emergencyGroupCard}>
                            <div className={styles.emergencyGroupHeader}>
                              <div>
                                <span className={styles.kicker}>{group.departmentName}</span>
                                <h3>{group.projectName}</h3>
                              </div>
                              <strong>{group.reports.length} тайлан</strong>
                            </div>
                            <div className={styles.workflowList}>
                              {group.reports.slice(0, 5).map((report) => (
                                <article key={report.id} className={styles.workflowItem}>
                                  <div className={styles.workflowItemTop}>
                                    <div>
                                      <strong>{report.taskName}</strong>
                                      <p>{report.submittedAt}</p>
                                    </div>
                                    <span className={styles.workflowItemBadge}>{reportStatusLabel(report)}</span>
                                  </div>
                                  <div className={styles.workflowItemMeta}>
                                    <span>Илгээгч: {report.reporter}</span>
                                    <span>Зураг: {report.imageCount}</span>
                                    {report.taskId ? (
                                      <Link href={`/tasks/${report.taskId}`} className={styles.reportActionLink}>
                                        Дэлгэрэнгүй
                                      </Link>
                                    ) : null}
                                  </div>
                                </article>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.weightEmpty}>
                        Энэ хүрээнд гэнэтийн ажлын тайлан одоогоор бүртгэгдээгүй байна.
                      </div>
                    )}
                  </section>
                ) : null}

                {selectedReportType === "garbage" ? (
                <section className={`${styles.reportPanel} ${styles.transportPanel}`}>
                  <div className={styles.reportPanelHeader}>
                    <div className={styles.reportPanelTitle}>
                      <span className={styles.reportPanelIcon}>ХТ</span>
                      <div>
                        <h2>Хог тээвэрлэлтийн тайлан</h2>
                        <p>Машин сонгон өдөр / 7 хоногийн тайланг цаг, цэг, жолоочийн зурагтай нь харна</p>
                      </div>
                    </div>
                    <div className={styles.reportPanelBadge}>
                      <span>Хамрах хугацаа</span>
                      <strong>{selectedRangeLabel}</strong>
                    </div>
                  </div>

                  <form className={styles.transportControlBar} action="/reports" method="get">
                    {exportParams.get("department") ? (
                      <input type="hidden" name="department" value={exportParams.get("department") ?? ""} />
                    ) : null}
                    {exportParams.get("unit") ? (
                      <input type="hidden" name="unit" value={exportParams.get("unit") ?? ""} />
                    ) : null}
                    <input type="hidden" name="report" value="garbage" />
                    <input type="hidden" name="period" value={activePeriodKey} />
                    {activePeriodKey === "custom" ? (
                      <>
                        <input type="hidden" name="startDate" value={selectedStartDate} />
                        <input type="hidden" name="endDate" value={selectedEndDate} />
                      </>
                    ) : null}
                    <label className={styles.transportControlField}>
                      <span>Машин сонгох</span>
                      <GarbageVehicleSelect
                        name="vehicle"
                        value={selectedGarbageVehicleKey}
                        options={garbageReportVehicleList.map((vehicle) => ({
                          key: vehicle.key,
                          label: vehicle.label,
                          detail: vehicle.detail,
                        }))}
                        emptyLabel="Машин бүртгэлгүй"
                      />
                      <select aria-hidden="true" disabled hidden defaultValue={selectedGarbageVehicleKey}>
                        {garbageReportVehicleList.length ? (
                          garbageReportVehicleList.map((vehicle) => (
                            <option key={vehicle.key} value={vehicle.key}>
                              {vehicle.label} {vehicle.detail ? `(${vehicle.detail})` : ""}
                            </option>
                          ))
                        ) : (
                          <option value="">Машин бүртгэлгүй</option>
                        )}
                      </select>
                    </label>
                    <div className={styles.transportTypeControl}>
                      <span>Тайлангийн төрөл</span>
                      <div className={styles.transportTypeButtons}>
                        <Link
                          href={getReportHref({
                            report: "garbage",
                            period: "today",
                            vehicle: selectedGarbageVehicleKey,
                          })}
                          className={`${styles.transportTypeButton} ${
                            activePeriodKey === "today" ? styles.transportTypeButtonActive : ""
                          }`}
                        >
                          Өдрийн тайлан
                        </Link>
                        <Link
                          href={getReportHref({
                            report: "garbage",
                            period: "week",
                            vehicle: selectedGarbageVehicleKey,
                          })}
                          className={`${styles.transportTypeButton} ${
                            activePeriodKey === "week" ? styles.transportTypeButtonActive : ""
                          }`}
                        >
                          7 хоногийн тайлан
                        </Link>
                      </div>
                    </div>
                    <label className={styles.transportControlField}>
                      <span>Огноо</span>
                      <input type="date" value={selectedStartDate} readOnly />
                    </label>
                    <div className={styles.transportDateActions}>
                      <button type="submit">Харах</button>
                      <a
                        className={styles.transportDownloadButton}
                        href={getGarbageWeightReportHref(selectedStartDate, selectedEndDate)}
                        target="_blank"
                      >
                        Тайлан татах
                      </a>
                    </div>
                  </form>

                  <div className={styles.transportKpiGrid}>
                    <article className={styles.transportKpiCard}>
                      <span>Нийт аялал (рейс)</span>
                      <strong>{selectedGarbageTripCount}</strong>
                      <small>Тайлан орсон мөр</small>
                    </article>
                    <article className={styles.transportKpiCard}>
                      <span>Тайлан орсон цэг</span>
                      <strong>{selectedGarbagePointCount}</strong>
                      <small>Сонгосон машины цэгийн тоо</small>
                    </article>
                    <article className={styles.transportKpiCard}>
                      <span>Нийт тээвэрлэсэн жин</span>
                      <strong>{formatTonLabel(selectedGarbageVehicleTotalKg)}</strong>
                      <small>{formatKgLabel(selectedGarbageVehicleTotalKg)}</small>
                    </article>
                  </div>

                  <div className={styles.transportReportGrid}>
                    <article className={styles.transportInfoCard}>
                      <span className={styles.kicker}>Тээвэрлэлтийн мэдээлэл</span>
                      <div className={styles.transportFieldGrid}>
                        <div className={styles.transportField}>
                          <span>Огноо</span>
                          <strong>{selectedRangeLabel}</strong>
                        </div>
                        <div className={styles.transportField}>
                          <span>Жолооч</span>
                          <strong>{selectedGarbageDriverLabel}</strong>
                        </div>
                        <div className={styles.transportField}>
                          <span>Машин / техник</span>
                          <strong>{selectedGarbageVehicleLabel}</strong>
                        </div>
                        <div className={styles.transportField}>
                          <span>Ачигч</span>
                          <strong>{selectedGarbageLoaderLabel}</strong>
                        </div>
                        <div className={styles.transportField}>
                          <span>Нийт жин</span>
                          <strong>{formatTonLabel(selectedGarbageVehicleTotalKg)}</strong>
                        </div>
                        <div className={styles.transportField}>
                          <span>Нийт рейс / ажил</span>
                          <strong>{selectedGarbageTripCount}</strong>
                        </div>
                        <div className={styles.transportField}>
                          <span>Тайлбар</span>
                          <strong>{selectedGarbageVehicleOption?.label || "Машин сонгоогүй"}</strong>
                        </div>
                      </div>
                    </article>

                    <article className={styles.transportMachineCard}>
                      <span className={styles.kicker}>Тээвэрлэсэн машинууд</span>
                      {selectedGarbageVehicleRows.length ? (
                        <div className={styles.machineTable}>
                          <div className={styles.machineTableHead}>
                            <span>№</span>
                            <span>Машины дугаар</span>
                            <span>Жолооч</span>
                            <span>Жин</span>
                          </div>
                          {selectedGarbageVehicleRows.slice(0, 6).map((row, index) => (
                            <div key={row.primaryLabel} className={styles.machineTableRow}>
                              <span>{index + 1}</span>
                              <strong>{row.primaryLabel}</strong>
                              <span>{Array.from(row.driverNames).join(", ") || "Бүртгэлгүй"}</span>
                              <strong>{formatKgLabel(row.kg)}</strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.noProofText}>Машины жин бүртгэгдээгүй байна.</div>
                      )}
                      <div className={styles.transportTotalGrid}>
                        <div>
                          <span>Нийт рейс</span>
                          <strong>{selectedGarbageTripCount}</strong>
                        </div>
                        <div>
                          <span>Сонгосон машин</span>
                          <strong>{selectedGarbageVehicleOption ? 1 : 0}</strong>
                        </div>
                        <div>
                          <span>Нийт жин</span>
                          <strong>{formatTonLabel(selectedGarbageVehicleTotalKg)}</strong>
                        </div>
                      </div>
                    </article>

                    <article className={styles.transportProofCard}>
                      <span className={styles.kicker}>Жолоочоос ирсэн гэрэл зураг</span>
                      {selectedGarbageProofImages.length ? (
                        <div className={styles.transportProofGroups}>
                          <div>
                            <strong>Ачаа ачихаас өмнө</strong>
                            <div className={styles.transportProofGrid}>
                              {selectedGarbageBeforeProofImages.map((image) => (
                                <a
                                  key={image.id}
                                  href={image.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.transportProofLink}
                                >
                                  <Image
                                    src={image.url}
                                    alt={image.name}
                                    width={180}
                                    height={120}
                                    unoptimized
                                  />
                                </a>
                              ))}
                            </div>
                          </div>
                          <div>
                            <strong>Ачаа ачсаны дараа</strong>
                            {selectedGarbageAfterProofImages.length ? (
                              <div className={styles.transportProofGrid}>
                                {selectedGarbageAfterProofImages.map((image) => (
                                  <a
                                    key={image.id}
                                    href={image.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.transportProofLink}
                                  >
                                    <Image
                                      src={image.url}
                                      alt={image.name}
                                      width={180}
                                      height={120}
                                      unoptimized
                                    />
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <div className={styles.proofEmptyBox}>Дараах зураг бүртгэгдээгүй.</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className={styles.proofEmptyBox}>Одоогоор зураг ирээгүй байна.</div>
                      )}
                    </article>
                  </div>

                  <div className={styles.dailyWeightPanel}>
                    <div className={styles.dailyWeightHeader}>
                      <div>
                        <span className={styles.kicker}>Аялал (рейс)-ын тойм</span>
                        <h3>Тайлан орсон цаг, цэгийн нэр, зураг</h3>
                      </div>
                      <strong>{formatTonLabel(selectedGarbageVehicleTotalKg)}</strong>
                    </div>

                    {selectedGarbageTripReports.length ? (
                      <div className={styles.dailyWeightTable}>
                        <div className={styles.dailyWeightTableHead}>
                          <span>№</span>
                          <span>Тайлан орсон цаг</span>
                          <span>Цэгийн нэр</span>
                          <span>Тайлбар</span>
                          <span>Өмнөх зураг</span>
                          <span>Дараах зураг</span>
                        </div>
                        {selectedGarbageTripReports.map((report, index) => {
                          const beforeImage = report.images[0] ?? null;
                          const afterImage = report.images[1] ?? null;

                          return (
                            <div key={report.id} className={styles.dailyWeightTableRow}>
                              <span>{index + 1}</span>
                              <span>{formatSubmittedTime(report.submittedAt)}</span>
                              <strong>{extractReportPointName(report)}</strong>
                              <span>{report.summary || reportStatusLabel(report)}</span>
                              {beforeImage ? (
                                <a
                                  href={beforeImage.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.tripPhotoLink}
                                >
                                  <Image
                                    src={beforeImage.url}
                                    alt={beforeImage.name}
                                    width={180}
                                    height={86}
                                    unoptimized
                                  />
                                </a>
                              ) : (
                                <span className={styles.tripPhotoPlaceholder}>Зураггүй</span>
                              )}
                              {afterImage ? (
                                <a
                                  href={afterImage.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.tripPhotoLink}
                                >
                                  <Image
                                    src={afterImage.url}
                                    alt={afterImage.name}
                                    width={180}
                                    height={86}
                                    unoptimized
                                  />
                                </a>
                              ) : (
                                <span className={styles.tripPhotoPlaceholder}>Зураггүй</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={styles.weightEmpty}>
                        Сонгосон машин дээр тайлан орсон цэг одоогоор алга байна.
                      </div>
                    )}
                  </div>
                </section>
                ) : null}
              </div>
            ) : null}

            {!isGarbageTransportView && canViewProcurementReport ? (
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
            ) : null}

            {!isGarbageTransportView ? (
              <>
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

            {displayedGroupedReports.length ? (
              <section className={styles.projectStack}>
                {displayedGroupedReports.map((group) => (
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
                <h2>
                  {selectedReportType === "emergency"
                    ? "Гэнэтийн ажлын тайлан алга"
                    : "Энэ хүрээнд тайлан алга"}
                </h2>
                <p>
                  {selectedReportType === "emergency"
                    ? "Гэнэтийн ажил үүсч тайлан илгээгдэхэд энд гарч ирнэ."
                    : "Өөр хэлтэс эсвэл доторх нэгж сонгож үзнэ үү."}
                </p>
              </section>
            )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
