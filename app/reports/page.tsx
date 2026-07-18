import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Download,
  Eye,
  FileClock,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { SelectableReportImageGrid } from "./report-image-select";
import { ReportDownloadModal } from "./report-download-modal";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import {
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  filterByDepartment,
  getTodayDateKey,
} from "@/lib/dashboard-scope";
import {
  DEPARTMENT_GROUPS,
  type DepartmentGroupDefinition,
  findDepartmentGroupByName,
  findDepartmentGroupByUnit,
  getAvailableUnits,
} from "@/lib/department-groups";
import {
  filterProjectsForResponsibleMaster,
  filterTasksForResponsibleMaster,
} from "@/lib/master-scope";
import { loadMunicipalSnapshot } from "@/lib/odoo";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";
import {
  resolveReportPeriod,
  appendReportPeriodSearch,
  type ResolvedReportPeriod,
} from "@/lib/report-period";
import { isReportPlanningSpecialist, type RoleGroupFlags } from "@/lib/roles";

import { ReportPeriodBar } from "@/app/_components/report-period-bar";
import { canManageEvaluation } from "./evaluation/access";
import styles from "./reports.module.css";

type PageProps = {
  searchParams?: Promise<{
    department?: string | string[];
    unit?: string | string[];
    q?: string | string[];
    status?: string | string[];
    mode?: string | string[];
    month?: string | string[];
    year?: string | string[];
    date?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
    basis?: string | string[];
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
  submittedDateKey?: string;
  submittedAt: string;
  taskDateKey?: string;
  taskDoneDateKey?: string;
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

const REPORT_OPERATIONS_GROUP_NAMES = new Set([
  "Авто бааз, хог тээвэрлэлтийн хэлтэс",
  "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
  "Тохижилтын хэлтэс",
]);

const REPORT_DEPARTMENT_HINTS: Record<string, { eyebrow: string; note: string; initials: string }> = {
  "Авто бааз, хог тээвэрлэлтийн хэлтэс": {
    eyebrow: "Авто бааз",
    note: "Хог тээвэр, машин техник, рейс болон жингийн тайлан",
    initials: "АБ",
  },
  "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс": {
    eyebrow: "Ногоон байгууламж",
    note: "Ногоон байгууламж, цэвэрлэгээний ажлын гүйцэтгэл",
    initials: "НБ",
  },
  "Тохижилтын хэлтэс": {
    eyebrow: "Тохижилт",
    note: "Гудамж, зам талбай, засвар тохижилтын тайлан",
    initials: "ТХ",
  },
};

const REPORT_STATUS_FILTERS = [
  { key: "all", label: "Бүх төлөв" },
  { key: "progress", label: "Хүлээгдэж буй" },
  { key: "review", label: "Хяналт хийж байгаа" },
  { key: "done", label: "Баталгаажсан" },
  { key: "problem", label: "Буцаагдсан" },
] as const;

const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeReportDepartmentName(value?: string | null) {
  return (value ?? "").trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
}

function reportDepartmentMatchesGroup(
  group: DepartmentGroupDefinition,
  departmentName?: string | null,
) {
  const normalized = normalizeReportDepartmentName(departmentName);
  if (!normalized) {
    return false;
  }

  const exactNames = [group.name, ...group.units, ...group.aliases].map((name) =>
    normalizeReportDepartmentName(name),
  );
  if (exactNames.includes(normalized)) {
    return true;
  }

  const hasTransportSignal =
    normalized.includes("авто") ||
    normalized.includes("хог") ||
    normalized.includes("тээвэр") ||
    normalized.includes("машин");
  const hasCleaningSignal =
    normalized.includes("ногоон") ||
    normalized.includes("цэвэрл");
  const hasImprovementSignal =
    normalized.includes("тохижилт") ||
    normalized.includes("засвар") ||
    normalized.includes("гудамж") ||
    normalized.includes("зам талбай");

  if (group.name === "Авто бааз, хог тээвэрлэлтийн хэлтэс") {
    return hasTransportSignal;
  }
  if (group.name === "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс") {
    return !hasTransportSignal && hasCleaningSignal;
  }
  if (group.name === "Тохижилтын хэлтэс") {
    return !hasTransportSignal && !hasCleaningSignal && hasImprovementSignal;
  }

  return false;
}

function isOperationalReportDepartment(departmentName: string) {
  return DEPARTMENT_GROUPS.some(
    (group) =>
      REPORT_OPERATIONS_GROUP_NAMES.has(group.name) &&
      reportDepartmentMatchesGroup(group, departmentName),
  );
}

function getDepartmentParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function formatQuantity(value: number, unit: string) {
  if (!value) {
    return `0 ${unit}`;
  }

  return `${value} ${unit}`.trim();
}

function getReportUnitDisplayLabel(unit: string) {
  return unit === "Цэвэрлэгээ үйлчилгээ" ? "Зам талбайн цэвэрлэгээ" : unit;
}

function extractReportDateKey(report: Pick<FeedReport, "submittedAt" | "submittedDateKey" | "taskName">) {
  if (report.submittedDateKey && DATE_PARAM_PATTERN.test(report.submittedDateKey)) {
    return report.submittedDateKey;
  }

  if (report.submittedAt.startsWith("Өнөөдөр")) {
    return getTodayDateKey();
  }

  return (
    report.submittedAt.match(/\d{4}-\d{2}-\d{2}/)?.[0] ??
    report.taskName.match(/\d{4}-\d{2}-\d{2}/)?.[0] ??
    ""
  );
}

type ReportDateBasis = "report" | "task" | "done";

function extractReportPeriodDateKey(
  report: Pick<
    FeedReport,
    "submittedAt" | "submittedDateKey" | "taskName" | "taskDateKey" | "taskDoneDateKey"
  >,
  basis: ReportDateBasis,
) {
  // Даалгаврын огноогоор шүүхэд даалгаврын эхлэх/товлосон огноог хэрэглэнэ;
  // огноогүй даалгаварт тайлан илгээсэн огноо руу буцна.
  if (basis === "task" && report.taskDateKey && DATE_PARAM_PATTERN.test(report.taskDateKey)) {
    return report.taskDateKey;
  }
  // Ажил дууссан огноогоор шүүхэд даалгаврын "Дууссан" төлөвт шилжсэн огноог
  // хэрэглэнэ; дуусаагүй даалгаврын тайлан илгээсэн огноогоороо шүүгдэнэ.
  if (
    basis === "done" &&
    report.taskDoneDateKey &&
    DATE_PARAM_PATTERN.test(report.taskDoneDateKey)
  ) {
    return report.taskDoneDateKey;
  }
  return extractReportDateKey(report);
}

function isReportInPeriod(
  report: Pick<
    FeedReport,
    "submittedAt" | "submittedDateKey" | "taskName" | "taskDateKey" | "taskDoneDateKey"
  >,
  startDate: string,
  endDate: string,
  basis: ReportDateBasis = "report",
) {
  if (!startDate && !endDate) {
    return true;
  }

  const reportDate = extractReportPeriodDateKey(report, basis);
  if (!reportDate) {
    return false;
  }

  if (startDate && reportDate < startDate) {
    return false;
  }

  if (endDate && reportDate > endDate) {
    return false;
  }

  return true;
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
  const canViewAllReports = canViewAllWorkspaceReports(session);
  const canManageEval = canManageEvaluation(session);
  const reportOnlyMode = session.role === "report_specialist" || isReportPlanningSpecialist(session);
  const workerMode = isWorkerOnly(session);
  const reportRoleLabel = getSessionRoleLabel(session).toLocaleLowerCase("mn-MN");
  const reportFlags: Partial<RoleGroupFlags> = session.groupFlags || {};
  const departmentHeadLike =
    session.role === "project_manager" ||
    Boolean(reportFlags.municipalDepartmentHead) ||
    reportRoleLabel.includes("хэлтсийн дарга") ||
    reportRoleLabel.includes("хэлтэсийн дарга") ||
    reportRoleLabel.includes("албаны дарга");
  if (workerMode && !canViewAllReports) {
    redirect("/");
  }
  // Бүх тайлан харах эрхтэй (тайлан хариуцсан мэргэжилтэн, удирдлага г.м.)
  // хэрэглэгч өөрийн Odoo эрхээр project.task/тайланг уншиж чаддаггүй тул
  // (worker) snapshot хоосон гарч "тайлан алга" харагддаг. Ийм үед admin
  // эрхээр ачаалж, бодит тайлангуудыг харуулна.
  // Тайлан бол шинэлэг байх ёстой хуудас тул snapshot кэшийг (2 мин) алгасаж
  // Odoo-гоос шууд татна. Хянах самбар зэрэг бусад хуудас кэштэй хэвээр.
  const snapshotPromise = canViewAllReports
    ? loadMunicipalSnapshot({}, { skipCache: true })
    : loadMunicipalSnapshot(
        {
          login: session.login,
          password: session.password,
        },
        { skipCache: true },
      );
  const scopedDepartmentNamePromise = canViewAllReports && !departmentHeadLike
    ? Promise.resolve(null)
    : loadSessionDepartmentName(session);

  const canCreateProject = !reportOnlyMode && hasCapability(session, "create_projects");
  const canCreateTasks = !reportOnlyMode && hasCapability(session, "create_tasks");
  const canWriteReports = !reportOnlyMode && hasCapability(session, "write_workspace_reports");
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
  const reportSearchQuery = getDepartmentParam(params.q).trim();
  const requestedStatus = getDepartmentParam(params.status);
  const period: ResolvedReportPeriod = resolveReportPeriod({
    mode: getDepartmentParam(params.mode),
    month: getDepartmentParam(params.month),
    year: getDepartmentParam(params.year),
    date: getDepartmentParam(params.date),
    startDate: getDepartmentParam(params.startDate),
    endDate: getDepartmentParam(params.endDate),
  });
  const selectedStartDate = period.startDate;
  const selectedEndDate = period.endDate;
  const selectedPeriodLabel = period.periodLabel;
  const requestedBasis = getDepartmentParam(params.basis);
  const selectedDateBasis: ReportDateBasis =
    requestedBasis === "task" ? "task" : requestedBasis === "done" ? "done" : "report";
  const selectedStatus = REPORT_STATUS_FILTERS.some((item) => item.key === requestedStatus)
    ? requestedStatus
    : "all";

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
        : "";
  const matchesSelectedDepartment = (departmentName: string) =>
    selectedUnit
      ? departmentName === selectedUnit
      : selectedGroup
        ? reportDepartmentMatchesGroup(selectedGroup, departmentName)
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
  filteredReports = filteredReports.filter((report) => isOperationalReportDepartment(report.departmentName));
  filteredReviewQueue = filteredReviewQueue.filter((item) => isOperationalReportDepartment(item.departmentName));
  filteredTaskDirectory = filteredTaskDirectory.filter((task) => isOperationalReportDepartment(task.departmentName));
  filteredReports = filteredReports.filter((report) =>
    isReportInPeriod(report, selectedStartDate, selectedEndDate, selectedDateBasis),
  );
  if (selectedStartDate || selectedEndDate) {
    const periodTaskIds = new Set(
      filteredReports
        .map((report) => report.taskId)
        .filter((taskId): taskId is number => typeof taskId === "number"),
    );
    const periodProjectIds = new Set(
      filteredReports
        .map((report) => report.projectId)
        .filter((projectId): projectId is number => typeof projectId === "number"),
    );
    filteredReviewQueue = filteredReviewQueue.filter(
      (item) =>
        periodTaskIds.has(item.id) ||
        (typeof item.projectId === "number" && periodProjectIds.has(item.projectId)),
    );
    filteredTaskDirectory = filteredTaskDirectory.filter(
      (task) =>
        periodTaskIds.has(task.id) ||
        (typeof task.projectId === "number" && periodProjectIds.has(task.projectId)),
    );
  }
  const taskDirectoryById = new Map(filteredTaskDirectory.map((task) => [task.id, task]));
  const operationalReportGroups = DEPARTMENT_GROUPS.filter((group) =>
    REPORT_OPERATIONS_GROUP_NAMES.has(group.name),
  );
  const allOperationalReportCount = departmentScopedMode
    ? filteredReports.length
    : snapshot.reports.filter(
        (report) =>
          isOperationalReportDepartment(report.departmentName) &&
          isReportInPeriod(report, selectedStartDate, selectedEndDate, selectedDateBasis),
      ).length;
  const visibleReportGroups =
    departmentScopedMode && selectedGroup
      ? operationalReportGroups.filter((group) => group.name === selectedGroup.name)
      : operationalReportGroups;
  const preservedFilterParams = new URLSearchParams();
  if (reportSearchQuery) {
    preservedFilterParams.set("q", reportSearchQuery);
  }
  if (selectedStatus !== "all") {
    preservedFilterParams.set("status", selectedStatus);
  }
  if (selectedDateBasis !== "report") {
    preservedFilterParams.set("basis", selectedDateBasis);
  }
  appendReportPeriodSearch(preservedFilterParams, period);
  const preservedFilterQuery = preservedFilterParams.toString();
  const allDepartmentsHref = `/reports${preservedFilterQuery ? `?${preservedFilterQuery}` : ""}`;
  const normalizedReportSearchQuery = reportSearchQuery.toLocaleLowerCase("mn-MN");
  const reportMatchesCurrentFilters = (report: FeedReport) => {
    if (selectedStatus !== "all" && report.stateBucket !== selectedStatus) {
      return false;
    }
    if (!normalizedReportSearchQuery) {
      return true;
    }

    return [
      report.taskName,
      report.projectName,
      report.departmentName,
      report.reporter,
      report.summary,
      report.stateLabel,
    ].some((value) => value.toLocaleLowerCase("mn-MN").includes(normalizedReportSearchQuery));
  };
  const reportDepartmentCards = visibleReportGroups.map((group) => {
    const hrefParams = new URLSearchParams();
    hrefParams.set("department", group.name);
    if (reportSearchQuery) {
      hrefParams.set("q", reportSearchQuery);
    }
    if (selectedStatus !== "all") {
      hrefParams.set("status", selectedStatus);
    }
    if (selectedDateBasis !== "report") {
      hrefParams.set("basis", selectedDateBasis);
    }
    appendReportPeriodSearch(hrefParams, period);
    const groupReports = snapshot.reports.filter((report) =>
      reportDepartmentMatchesGroup(group, report.departmentName) &&
      isReportInPeriod(report, selectedStartDate, selectedEndDate, selectedDateBasis),
    );
    const groupReviewQueue = snapshot.reviewQueue.filter((item) =>
      reportDepartmentMatchesGroup(group, item.departmentName),
    );
    const hint = REPORT_DEPARTMENT_HINTS[group.name] ?? {
      eyebrow: group.name,
      note: "Хэлтсийн ажлын гүйцэтгэл, хавсралт болон хяналтын тайлан",
      initials: "Т",
    };

    return {
      group,
      href: `/reports?${hrefParams.toString()}`,
      reportCount: groupReports.length,
      reviewCount: groupReviewQueue.length,
      projectCount: new Set(groupReports.map((report) => report.projectName)).size,
      imageCount: groupReports.reduce((sum, report) => sum + report.imageCount, 0),
      isActive: selectedGroup?.name === group.name,
      ...hint,
    };
  });
  const unitFilterLinks = selectedGroup
    ? availableUnits.map((unit) => {
        const hrefParams = new URLSearchParams();
        hrefParams.set("department", selectedGroup.name);
        hrefParams.set("unit", unit);
        if (reportSearchQuery) {
          hrefParams.set("q", reportSearchQuery);
        }
        if (selectedStatus !== "all") {
          hrefParams.set("status", selectedStatus);
        }
        if (selectedDateBasis !== "report") {
          hrefParams.set("basis", selectedDateBasis);
        }
        appendReportPeriodSearch(hrefParams, period);
        const reportCount = filteredReports.filter(
          (report) => report.departmentName === unit && reportMatchesCurrentFilters(report),
        ).length;

        return {
          unit,
          href: `/reports?${hrefParams.toString()}`,
          reportCount,
          isActive: selectedUnit === unit,
        };
      })
    : [];
  const selectedGroupHref = selectedGroup
    ? (reportDepartmentCards.find((card) => card.group.name === selectedGroup.name)?.href ?? allDepartmentsHref)
    : allDepartmentsHref;
  const showScopedUnitOnlyPicker = Boolean(departmentScopedMode && selectedGroup && unitFilterLinks.length);
  const exportParams = new URLSearchParams();
  if (!departmentScopedMode && selectedGroup) {
    exportParams.set("department", selectedGroup.name);
  }
  if (!departmentScopedMode && selectedUnit) {
    exportParams.set("unit", selectedUnit);
  }
  if (selectedDateBasis !== "report") {
    exportParams.set("basis", selectedDateBasis);
  }
  appendReportPeriodSearch(exportParams, period);
  // Хугацааны bar болон toolbar хооронд бусад шүүлтийг (хэлтэс, нэгж, хайлт, төлөв) хадгална.
  const periodBarExtraParams: Record<string, string> = {};
  if (!departmentScopedMode && selectedGroup) {
    periodBarExtraParams.department = selectedGroup.name;
  }
  if (selectedUnit) {
    periodBarExtraParams.unit = selectedUnit;
  }
  if (reportSearchQuery) {
    periodBarExtraParams.q = reportSearchQuery;
  }
  if (selectedStatus !== "all") {
    periodBarExtraParams.status = selectedStatus;
  }
  if (selectedDateBasis !== "report") {
    periodBarExtraParams.basis = selectedDateBasis;
  }
  const visibleReportRows = filteredReports
    .filter(reportMatchesCurrentFilters)
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt) || right.id - left.id);
  const boardReportRows = visibleReportRows.slice(0, 100);
  // Татах modal-д шүүлтэд хамаарах тайлангуудын зургийг дамжуулна
  const reportsForDownload = visibleReportRows.map((report) => ({
    name: report.taskName || report.projectName,
    images: report.images.map((image) => ({ id: image.id, url: image.url, name: image.name })),
  }));
  const boardNewReportCount = filteredReports.filter(
    (report) => extractReportDateKey(report) === todayDateKey,
  ).length;
  const boardPendingCount = filteredReports.filter((report) => report.stateBucket === "progress").length;
  const boardReviewCount = filteredReports.filter((report) => report.stateBucket === "review").length;
  const boardApprovedCount = filteredReports.filter((report) => report.stateBucket === "done").length;
  const boardReturnedCount = filteredReports.filter((report) => report.stateBucket === "problem").length;
  const selectedDepartmentHint = selectedGroup ? REPORT_DEPARTMENT_HINTS[selectedGroup.name] : null;
  const selectedScopeTitle = selectedUnit || selectedDepartmentHint?.eyebrow || "Бүх ажлын тайлан";
  const selectedScopeNote =
    selectedDepartmentHint?.note ??
    "Авто бааз, ногоон байгууламж, тохижилтын бүх ажлын тайланг нэг урсгалаар харуулж байна";
  const reviewQueueRows = filteredReviewQueue.slice(0, 4);
  const getExportHref = (format: "csv" | "excel" | "word" | "json" | "pdf" | "pptx", reportId?: number) => {
    const params = new URLSearchParams(exportParams);
    params.set("format", format);
    if (reportSearchQuery) {
      params.set("q", reportSearchQuery);
    }
    if (selectedStatus !== "all") {
      params.set("status", selectedStatus);
    }
    if (reportId) {
      params.set("reportId", String(reportId));
    }
    return `/api/reports/export?${params.toString()}`;
  };

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
              canViewAllReports={canViewAllReports}
              userName={session.name}
              userRole={session.role}
              roleLabel={getSessionRoleLabel(session)}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              departmentScopeName={scopedDepartmentName}
              reportOnlyMode={reportOnlyMode}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title={reportOnlyMode ? "Тайлангийн төв" : "Тайлан"}
              subtitle={
                reportOnlyMode
                  ? "Хэлтэс бүрийн гүйцэтгэл, зурагтай нотолгоо, жингийн тайланг нэг дороос харна"
                  : "Өдрийн тайлан, зураг, аудио урсгал"
              }
              userName={session.name}
              roleLabel={getSessionRoleLabel(session)}
              notificationCount={filteredReviewQueue.length}
              notificationNote={`${filteredReviewQueue.length} даалгавар хяналт хүлээж байна`}
            />

            {canManageEval ? (
              <Link href="/reports/evaluation" className={styles.reportRegistryLaborLink}>
                <ClipboardCheck aria-hidden size={18} />
                <span>
                  <strong>Гүйцэтгэлийн үнэлгээ</strong>
                  <small>Зам талбайн цэвэрлэгээний сарын үнэлгээ (100 оноо) оруулж тайлан гаргах</small>
                </span>
              </Link>
            ) : null}

            <section className={styles.reportRegistryBoard}>
                <div className={styles.reportRegistryMetrics}>
                  <article className={`${styles.reportRegistryMetricCard} ${styles.reportRegistryMetricCardTotal}`}>
                    <span className={styles.reportRegistryMetricIcon}>
                      <ClipboardList aria-hidden />
                    </span>
                    <div>
                      <span>Нийт тайлан</span>
                      <strong>{filteredReports.length}</strong>
                      <small>{boardNewReportCount} шинэ тайлан</small>
                    </div>
                  </article>
                  <article className={`${styles.reportRegistryMetricCard} ${styles.reportRegistryMetricCardPending}`}>
                    <span className={styles.reportRegistryMetricIcon}>
                      <FileClock aria-hidden />
                    </span>
                    <div>
                      <span>Хүлээгдэж буй тайлан</span>
                      <strong>{boardPendingCount}</strong>
                      <small>{boardReviewCount} хяналт руу орсон</small>
                    </div>
                  </article>
                  <article className={`${styles.reportRegistryMetricCard} ${styles.reportRegistryMetricCardReview}`}>
                    <span className={styles.reportRegistryMetricIcon}>
                      <ShieldCheck aria-hidden />
                    </span>
                    <div>
                      <span>Хяналт хийж байгаа</span>
                      <strong>{boardReviewCount}</strong>
                      <small>{filteredReviewQueue.length} даалгавар хяналтад</small>
                    </div>
                  </article>
                  <article className={`${styles.reportRegistryMetricCard} ${styles.reportRegistryMetricCardApproved}`}>
                    <span className={styles.reportRegistryMetricIcon}>
                      <CheckCircle2 aria-hidden />
                    </span>
                    <div>
                      <span>Батлагдсан тайлан</span>
                      <strong>{boardApprovedCount}</strong>
                      <small>{filteredReports.length ? Math.round((boardApprovedCount / filteredReports.length) * 100) : 0}% баталгаажсан</small>
                    </div>
                  </article>
                  <article className={`${styles.reportRegistryMetricCard} ${styles.reportRegistryMetricCardReturned}`}>
                    <span className={styles.reportRegistryMetricIcon}>
                      <XCircle aria-hidden />
                    </span>
                    <div>
                      <span>Буцаагдсан тайлан</span>
                      <strong>{boardReturnedCount}</strong>
                      <small>Засвар шаардах тайлан</small>
                    </div>
                  </article>
                </div>

                <ReportPeriodBar basePath="/reports" period={period} extraParams={periodBarExtraParams} />

                <form className={styles.reportRegistryToolbar} action="/reports" method="get">
                  {exportParams.get("department") ? (
                    <input type="hidden" name="department" value={exportParams.get("department") ?? ""} />
                  ) : null}
                  {exportParams.get("unit") ? (
                    <input type="hidden" name="unit" value={exportParams.get("unit") ?? ""} />
                  ) : null}
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
                  <label className={styles.reportRegistrySearch}>
                    <Search aria-hidden />
                    <input
                      type="search"
                      name="q"
                      defaultValue={reportSearchQuery}
                      placeholder="Тайлан хайх..."
                    />
                  </label>
                  <label className={styles.reportRegistrySelect}>
                    <span>Төлөв</span>
                    <select name="status" defaultValue={selectedStatus}>
                      {REPORT_STATUS_FILTERS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.reportRegistrySelect}>
                    <span>Огнооны суурь</span>
                    <select name="basis" defaultValue={selectedDateBasis}>
                      <option value="report">Тайлан илгээсэн огноо</option>
                      <option value="task">Даалгаврын эхлэх огноо</option>
                      <option value="done">Ажил дууссан огноо</option>
                    </select>
                  </label>
                  <button type="submit" className={styles.reportRegistryFilterButton}>
                    <SlidersHorizontal aria-hidden />
                    Шүүх
                  </button>
                </form>

                <section className={styles.reportRegistryScopePanel} aria-label="Тайлангийн хамрах хүрээ">
                  {!showScopedUnitOnlyPicker ? (
                    <div className={styles.reportRegistryScopeHeader}>
                      <div>
                        <span>Сонгосон хэсэг</span>
                        <strong>{selectedScopeTitle}</strong>
                        <small>{selectedScopeNote}</small>
                      </div>
                      <strong>{visibleReportRows.length} тайлан</strong>
                    </div>
                  ) : null}

                  {!departmentScopedMode ? (
                    <div className={styles.reportRegistryDepartmentStrip}>
                      <Link
                        href={allDepartmentsHref}
                        className={`${styles.reportRegistryDepartmentTab} ${
                          !selectedGroup ? styles.reportRegistryDepartmentTabActive : ""
                        }`}
                      >
                        <span>Бүх ажлын тайлан</span>
                        <strong>{allOperationalReportCount}</strong>
                      </Link>
                      {reportDepartmentCards.map((card) => (
                        <Link
                          key={card.group.name}
                          href={card.href}
                          className={`${styles.reportRegistryDepartmentTab} ${
                            card.isActive ? styles.reportRegistryDepartmentTabActive : ""
                          }`}
                        >
                          <span>{card.eyebrow}</span>
                          <small>{card.note}</small>
                          <strong>{card.reportCount}</strong>
                        </Link>
                      ))}
                    </div>
                  ) : null}

                  {unitFilterLinks.length ? (
                    <div
                      className={`${styles.reportRegistryUnitStrip} ${
                        showScopedUnitOnlyPicker ? styles.reportRegistryUnitStripScoped : ""
                      }`}
                      aria-label="Нэгжээр нарийвчлах"
                    >
                      {!showScopedUnitOnlyPicker ? (
                        <Link
                          href={selectedGroupHref}
                          className={`${styles.reportRegistryUnitChip} ${
                            !selectedUnit ? styles.reportRegistryUnitChipActive : ""
                          }`}
                        >
                          Бүгд
                        </Link>
                      ) : null}
                      {unitFilterLinks.map((item) => (
                        <Link
                          key={item.unit}
                          href={item.href}
                          className={`${styles.reportRegistryUnitChip} ${
                            item.isActive ? styles.reportRegistryUnitChipActive : ""
                          }`}
                        >
                          {getReportUnitDisplayLabel(item.unit)}
                          <span>{item.reportCount}</span>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </section>

                {reviewQueueRows.length ? (
                  <section className={styles.reportRegistryReviewQueue} aria-label="Хяналт хүлээж буй ажил">
                    <div className={styles.reportRegistryReviewHeader}>
                      <div>
                        <span>Хяналт хүлээж буй ажил</span>
                        <strong>{filteredReviewQueue.length}</strong>
                      </div>
                      <small>Тайлан орсон боловч баталгаажуулалт дуусаагүй ажлууд</small>
                    </div>
                    <div className={styles.reportRegistryReviewList}>
                      {reviewQueueRows.map((item) => (
                        <Link key={item.id} href={item.href} className={styles.reportRegistryReviewCard}>
                          <strong>{item.name}</strong>
                          <span>{item.departmentName}</span>
                          <small>{item.projectName} · {item.progress}%</small>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div className={styles.reportRegistryContent}>
                  <div className={styles.reportRegistryTableCard}>
                    <div className={styles.reportRegistryTableHeader}>
                      <div>
                        <span>Тайлангийн жагсаалт</span>
                        <strong>{visibleReportRows.length}</strong>
                        <small>{selectedPeriodLabel}</small>
                      </div>
                      {visibleReportRows.length ? (
                        <ReportDownloadModal
                          reports={reportsForDownload}
                          hrefs={{
                            word: getExportHref("word"),
                            pdf: getExportHref("pdf"),
                            excel: getExportHref("excel"),
                          }}
                        />
                      ) : (
                        <small>{selectedScopeTitle}</small>
                      )}
                    </div>

                    <div className={styles.reportRegistryAccordion}>
                      <div className={styles.reportRegistryAccordionHeader} aria-hidden>
                        <span>№</span>
                        <span>Тайлангийн нэр</span>
                        <span>Хэлтэс</span>
                        <span>Төрөл</span>
                        <span>Илгээсэн огноо</span>
                        <span>Төлөв</span>
                      </div>
                      {boardReportRows.map((report, index) => {
                        const task = report.taskId ? taskDirectoryById.get(report.taskId) : undefined;
                        const taskHref = report.taskId ? `/tasks/${report.taskId}` : "/reports";
                        const statusClass =
                          report.stateBucket === "done"
                            ? styles.reportRegistryStatusDone
                            : report.stateBucket === "problem"
                              ? styles.reportRegistryStatusProblem
                              : report.stateBucket === "review"
                                ? styles.reportRegistryStatusReview
                                : styles.reportRegistryStatusProgress;

                        return (
                          <details key={report.id} className={styles.reportRegistryAccordionItem}>
                            <summary className={styles.reportRegistryAccordionSummary}>
                              <span className={styles.reportRegistryIndex}>{index + 1}</span>
                              <span className={styles.reportRegistryReportTitle}>
                                <strong>{report.taskName || report.projectName}</strong>
                                <small>{report.projectName}</small>
                              </span>
                              <span>{report.departmentName}</span>
                              <span>
                                <span className={styles.reportRegistryTypeBadge}>
                                  {task?.operationTypeLabel || "Гүйцэтгэлийн тайлан"}
                                </span>
                              </span>
                              <span>{formatSubmittedTime(report.submittedAt)}</span>
                              <span>
                                <span className={`${styles.reportRegistryStatusBadge} ${statusClass}`}>
                                  {reportStatusLabel(report)}
                                </span>
                              </span>
                              <span className={styles.reportRegistryTapHint}>Дэлгэрэнгүй харах</span>
                            </summary>

                            <div className={styles.reportRegistryDetailPanel}>
                              <div className={styles.reportRegistryDetailGrid}>
                                <article>
                                  <span>Илгээгч</span>
                                  <strong>{report.reporter}</strong>
                                </article>
                                <article>
                                  <span>Хэмжээ</span>
                                  <strong>{formatQuantity(report.reportedQuantity, report.measurementUnit)}</strong>
                                </article>
                                <article>
                                  <span>Хавсралт</span>
                                  <strong>{report.imageCount} зураг, {report.audioCount} аудио</strong>
                                </article>
                              </div>

                              <div className={styles.reportRegistryDetailText}>
                                <span>Тайлангийн агуулга</span>
                                <p>{report.summary || "Тайлангийн нэмэлт тайлбар ороогүй байна."}</p>
                              </div>

                              {report.images.length ? (
                                <SelectableReportImageGrid
                                  images={report.images.map((image) => ({
                                    id: image.id,
                                    url: image.url,
                                    name: image.name,
                                  }))}
                                  gridClassName={styles.reportRegistryAttachmentGrid}
                                />
                              ) : null}

                              {report.audios.length ? (
                                <div className={styles.reportRegistryAudioList}>
                                  {report.audios.map((audio) => (
                                    <div key={audio.id} className={styles.reportRegistryAudioCard}>
                                      <strong>{audio.name}</strong>
                                      <audio controls preload="none" src={audio.url} />
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              <div className={styles.reportRegistryDetailActions}>
                                <Link href={taskHref}>
                                  <Eye aria-hidden />
                                  Ажил нээх
                                </Link>
                                <a href={getExportHref("pdf", report.id)}>
                                  <Download aria-hidden />
                                  PDF татах
                                </a>
                                <a href={getExportHref("word", report.id)}>
                                  <Download aria-hidden />
                                  Word татах
                                </a>
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>

                    {!boardReportRows.length ? (
                      <div className={styles.reportRegistryEmpty}>
                        Сонгосон нөхцөлд таарах тайлан алга байна.
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
          </div>
        </div>
      </div>
    </main>
  );
}
