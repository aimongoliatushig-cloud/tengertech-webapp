import { type ComponentProps, Suspense } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MapPin, Settings, Truck } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { ReportImageLightbox } from "@/app/_components/report-image-lightbox";
import { AutoBaseBoard } from "@/app/auto-base/auto-base-board";
import { AutoGarbageWorkBoard } from "@/app/dashboard-view";
import { LoadingShell } from "@/app/_components/loading-shell";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import dashboardStyles from "@/app/dashboard-view.module.css";
import styles from "@/app/workspace.module.css";
import {
  canAccessGarbageTransportSettings,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment, getTodayDateKey, isDirectiveTaskProject } from "@/lib/dashboard-scope";
import {
  DEPARTMENT_GROUPS,
  findDepartmentGroupByName,
  findDepartmentGroupByUnit,
  getAvailableUnits,
  matchesDepartmentGroup,
  normalizeOrganizationUnitName,
} from "@/lib/department-groups";
import {
  type DashboardSnapshot,
  type FleetVehicleBoardItem,
  loadFleetVehicleBoard,
  loadMunicipalSnapshot,
} from "@/lib/odoo";
import {
  filterProjectsForResponsibleMaster,
  filterTasksForResponsibleMaster,
} from "@/lib/master-scope";
import { loadWorkspaceNotificationCount } from "@/lib/workspace-notifications";
import { HIDE_OVERDUE_UI } from "@/lib/ui-feature-flags";

type PageProps = {
  searchParams?: Promise<{
    department?: string | string[];
    category?: string | string[];
    unit?: string | string[];
    quickAction?: string | string[];
    vehicle?: string | string[];
    autoPanel?: string | string[];
    dateFrom?: string | string[];
    dateTo?: string | string[];
    search?: string | string[];
    notice?: string | string[];
    error?: string | string[];
  }>;
};

type ProjectFilterKey = "all" | "planned" | "review" | "done" | "unfinished" | "overdue";
type QuickActionMode = "task" | "report" | "none";
type AutoGarbagePanelMode = "overview" | "weight" | "fuel";
type ProjectCardItem = DashboardSnapshot["projects"][number];
type TaskCardItem = DashboardSnapshot["taskDirectory"][number];
type ProjectsSession = Awaited<ReturnType<typeof requireSession>>;
type ProjectsAppMenuProps = ComponentProps<typeof AppMenu>;
type ProjectsWorkspaceHeaderProps = ComponentProps<typeof WorkspaceHeader>;
const AUTO_BASE_GROUP_NAME = "Авто бааз, хог тээвэрлэлтийн хэлтэс";
const AUTO_BASE_UNIT_NAME = "Авто бааз";
const WASTE_TRANSPORT_UNIT_NAME = "Хог тээвэрлэлт";

// Хог тээвэрлэлтийн операц эсэхийг ажлын төрлөөр нь тодорхойлно.
function isWasteTransportOperation(operationType?: string | null) {
  return operationType === "garbage" || operationType === "garbage_seasonal";
}

// "Авто бааз, хог тээвэрлэлт" хэлтэс доторх ажлыг хэлтсийн нэрээр биш,
// ажлын ТӨРЛӨӨР нь дэд нэгжид хуваарилна:
//   • Хог тээвэрлэлт → хог тээвэрлэх ажил (garbage / гэнэтийн)
//   • Авто бааз → машин засвар, худалдан авалт зэрэг бусад ажил
function matchesAutoBaseUnitWork(
  unit: string,
  project: { operationType?: string },
) {
  if (unit === WASTE_TRANSPORT_UNIT_NAME) {
    return isWasteTransportOperation(project.operationType);
  }
  if (unit === AUTO_BASE_UNIT_NAME) {
    return !isWasteTransportOperation(project.operationType);
  }
  return false;
}
const GREEN_SERVICE_GROUP_NAME = "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс";
const IMPROVEMENT_GROUP_NAME = "Тохижилтын хэлтэс";
const IMPROVEMENT_UNIT_NAME = "Тохижилт үйлчилгээ";
const GREEN_SERVICE_UNITS = [
  {
    label: "Ногоон байгууламж",
    note: "Мод, зүлэг, ногоон байгууламжийн арчилгаа",
    aliases: ["Ногоон байгууламж", "ногоон", "мод", "зүлэг", "ургамал", "усалгаа", "цэцэрлэг"],
  },
  {
    label: "Цэвэрлэгээ үйлчилгээ",
    note: "Зам талбай, нийтийн эзэмшлийн орчны цэвэрлэгээ үйлчилгээний ажил",
    aliases: ["Цэвэрлэгээ үйлчилгээ", "Зам талбайн цэвэрлэгээ", "цэвэрл", "зам талбай", "гудамж"],
  },
] as const;
const PROJECT_FILTERS: Array<{ key: ProjectFilterKey; label: string }> = [
  { key: "all", label: "Нийт захирамж, үүрэг даалгавар" },
  { key: "unfinished", label: "Дуусаагүй" },
  { key: "planned", label: "Төлөвлөсөн" },
  { key: "review", label: "Хянаж байгаа" },
  { key: "done", label: "Дууссан" },
];

/* legacy department groups kept commented during shared helper migration
  {
    name: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
    units: ["Авто бааз", "Хог тээвэрлэлт"],
    icon: "🚚",
  },
  {
    name: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
    units: ["Ногоон байгууламж", "Цэвэрлэгээ үйлчилгээ"],
    icon: "🌿",
  },
  {
    name: "Тохижилтын хэлтэс",
    units: ["Тохижилт үйлчилгээ"],
    icon: "🏙️",
  },
*/

function getDepartmentParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function normalizeDateFilter(value?: string | string[]) {
  const date = getDepartmentParam(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizeSearchFilter(value?: string | string[]) {
  return getDepartmentParam(value).trim().slice(0, 120);
}

function getTaskDateKey(task: TaskCardItem) {
  return task.scheduledDate || task.deadlineDateTime?.slice(0, 10) || "";
}

function normalizeProjectFilter(value: string): ProjectFilterKey {
  if (value === "progress") {
    return "planned";
  }
  if (value === "overdue") {
    return "overdue";
  }
  return PROJECT_FILTERS.some((item) => item.key === value) ? (value as ProjectFilterKey) : "all";
}

function normalizeQuickAction(value: string): QuickActionMode {
  if (value === "task" || value === "report") {
    return value;
  }

  return "none";
}

function normalizeAutoGarbagePanel(value: string): AutoGarbagePanelMode {
  if (value === "weight" || value === "fuel") {
    return value;
  }

  return "overview";
}

function StagePill({
  label,
  bucket,
}: {
  label: string;
  bucket: "todo" | "progress" | "review" | "done" | "unknown" | "problem";
}) {
  const tone =
    bucket === "problem"
      ? styles.stageProblem
      : bucket === "done"
      ? styles.stageDone
      : bucket === "review"
        ? styles.stageReview
        : bucket === "progress"
          ? styles.stageProgress
          : styles.stageTodo;

  return (
    <span className={`${styles.stagePill} ${tone}`} aria-label={label} title={label}>
      {label}
    </span>
  );
}

function getProjectStageRank(bucket: string) {
  switch (bucket) {
    case "review":
      return 0;
    case "progress":
      return 1;
    case "todo":
      return 2;
    case "unknown":
      return 3;
    case "done":
      return 4;
    default:
      return 5;
  }
}

function getProgressWidth(value: number) {
  if (value <= 0) {
    return "0%";
  }

  return `${Math.max(Math.min(value, 100), 6)}%`;
}

function formatShare(value: number, total: number) {
  if (!total) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

function normalizeUnitText(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function matchesUnitScope(
  unitName: string,
  departmentName?: string | null,
  projectName?: string | null,
  extraSearchText?: string | null,
) {
  const normalizedUnit = normalizeUnitText(unitName);
  const normalizedDepartment = normalizeUnitText(departmentName);
  const normalizedProject = normalizeUnitText(projectName);
  const normalizedExtra = normalizeUnitText(extraSearchText);
  const searchText = `${normalizedDepartment} ${normalizedProject} ${normalizedExtra}`.trim();

  if (!normalizedUnit || !searchText) {
    return false;
  }

  if (normalizedDepartment === normalizedUnit) {
    return true;
  }

  const unitGroup = findDepartmentGroupByUnit(unitName);
  const normalizedDepartmentGroupName = normalizeOrganizationUnitName(departmentName);
  if (
    unitGroup &&
    normalizedDepartmentGroupName &&
    normalizedDepartmentGroupName !== unitGroup.name
  ) {
    return false;
  }

  const greenServiceUnit = GREEN_SERVICE_UNITS.find(
    (unit) => normalizeUnitText(unit.label) === normalizedUnit,
  );

  if (!greenServiceUnit) {
    return normalizedDepartment.includes(normalizedUnit);
  }

  const unitSearchText =
    normalizedDepartment === normalizeUnitText(GREEN_SERVICE_GROUP_NAME)
      ? `${normalizedProject} ${normalizedExtra}`.trim()
      : searchText;

  return greenServiceUnit.aliases.some((alias) => unitSearchText.includes(normalizeUnitText(alias)));
}

function matchesGroupOrUnitScope(
  group: NonNullable<ReturnType<typeof findDepartmentGroupByName>>,
  departmentName?: string | null,
  projectName?: string | null,
  extraSearchText?: string | null,
) {
  if (matchesDepartmentGroup(group, departmentName)) {
    return true;
  }

  return getAvailableUnits(group).some((unit) =>
    matchesUnitScope(unit, departmentName, projectName, extraSearchText),
  );
}

function isGreenOrImprovementScope(groupName?: string | null, unitName?: string | null) {
  const normalizedGroup = normalizeOrganizationUnitName(groupName);
  const normalizedRawGroup = normalizeUnitText(groupName);
  const normalizedUnit = normalizeUnitText(unitName);
  const normalizedGreenGroup = normalizeUnitText(GREEN_SERVICE_GROUP_NAME);
  const normalizedImprovementGroup = normalizeUnitText(IMPROVEMENT_GROUP_NAME);

  return (
    normalizedRawGroup === normalizedGreenGroup ||
    normalizedRawGroup === normalizedImprovementGroup ||
    normalizedGroup === GREEN_SERVICE_GROUP_NAME ||
    normalizedGroup === IMPROVEMENT_GROUP_NAME ||
    normalizedUnit === normalizeUnitText(GREEN_SERVICE_UNITS[0].label) ||
    normalizedUnit === normalizeUnitText(IMPROVEMENT_UNIT_NAME)
  );
}

function ProjectListRow({
  project,
  href,
  actionLabel,
  hideDepartment = false,
  taskCount = 0,
}: {
  project: ProjectCardItem;
  href: string;
  actionLabel: string;
  hideDepartment?: boolean;
  taskCount?: number;
}) {
  const managerTitle = project.managerJobTitle || "Хариуцсан ажилтан";
  const metaParts = [
    hideDepartment ? null : `Алба нэгж: ${project.departmentName}`,
    `${managerTitle}: ${project.manager}`,
    project.operationTypeLabel,
    taskCount ? `Даалгавар: ${taskCount}` : null,
  ].filter(Boolean);

  return (
    <Link href={href} className={styles.reviewItem} title={actionLabel}>
      <div className={styles.projectListRowMain}>
        <div className={styles.projectListRowTop}>
          <h3>{project.name}</h3>
          <StagePill label={project.stageLabel} bucket={project.stageBucket} />
        </div>
        <p>{metaParts.join(" · ")}</p>
      </div>

      <div className={styles.reviewMeta}>
        <strong>{project.openTasks}</strong>
        <span>Нээлттэй даалгавар</span>
        <span>{project.deadline}</span>
      </div>

      <div className={styles.projectListProgress}>
        <div className={styles.projectListProgressScale}>
          <strong>{project.completion}%</strong>
        </div>
        <div
          className={`${styles.progressTrack} ${styles.projectListProgressTrack}`}
          aria-hidden
        >
          <span style={{ width: `${project.completion}%` }} />
        </div>
      </div>
    </Link>
  );
}

function OverdueTaskLink({
  task,
  hideDepartment = false,
}: {
  task: TaskCardItem;
  hideDepartment?: boolean;
}) {
  const metaParts = [
    hideDepartment ? null : `Алба нэгж: ${task.departmentName}`,
    `Ажил: ${task.projectName}`,
    task.leaderName ? `Хариуцсан: ${task.leaderName}` : null,
    task.operationTypeLabel,
  ].filter(Boolean);

  return (
    <Link href={task.href} className={styles.reviewItem}>
      <div className={styles.projectListRowMain}>
        <div className={styles.projectListRowTop}>
          <h3>{task.name}</h3>
          <StagePill label={task.statusLabel} bucket="problem" />
        </div>
        <p>{metaParts.join(" · ")}</p>
      </div>

      <div className={styles.reviewMeta}>
        <strong>{task.progress}%</strong>
        <span>Гүйцэтгэл</span>
        <span>{task.deadline || task.scheduledDate || "Хугацаа бүртгэлгүй"}</span>
      </div>
    </Link>
  );
}

function AutoBaseRepairVehicleCard({ vehicle }: { vehicle: FleetVehicleBoardItem }) {
  const latestRepair = vehicle.repairHistory[0] ?? null;
  const href = latestRepair?.id ? `/fleet-repair/requests/${latestRepair.id}` : "/fleet-repair/requests";
  const driverName = vehicle.responsibleDriverName || vehicle.fleetDriverName || "Оноогоогүй";
  const modelLabel = vehicle.modelName || vehicle.vehicleTypeName || vehicle.categoryName || vehicle.name;
  const repairState = vehicle.stateLabel || latestRepair?.stateLabel || "Засвартай";

  return (
    <Link href={href} className={dashboardStyles.inspectorVehicleCard}>
      <span className={dashboardStyles.inspectorVehicleImage}>
        {vehicle.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vehicle.imageUrl} alt={`${vehicle.plate} машин`} />
        ) : (
          <Truck aria-hidden />
        )}
        <span>{repairState}</span>
      </span>
      <span className={dashboardStyles.inspectorVehicleCardBody}>
        <strong>{vehicle.plate}</strong>
        <small>{modelLabel}</small>
        <span className={dashboardStyles.inspectorVehicleCardStats}>
          <span>
            <small>Жолооч</small>
            <b>{driverName}</b>
          </span>
          <span>
            <small>Засвар</small>
            <b>{vehicle.repairHistory.length || 1}</b>
          </span>
        </span>
        <span className={dashboardStyles.inspectorVehicleProgress}>
          <i style={{ inlineSize: "100%" }} />
          <em>Засвар</em>
        </span>
        <span className={styles.cardFooter}>
          <span className={styles.cardLinkLabel}>
            {latestRepair ? "Засварын хүсэлт харах" : "Засварын жагсаалт харах"}
          </span>
          <strong aria-hidden>→</strong>
        </span>
      </span>
    </Link>
  );
}

async function AppMenuWithNotificationCount({
  notificationCountPromise,
  ...props
}: ProjectsAppMenuProps & {
  notificationCountPromise: Promise<number>;
}) {
  const notificationCount = await notificationCountPromise;
  return <AppMenu {...props} notificationCount={notificationCount} />;
}

async function WorkspaceHeaderWithNotificationCount({
  notificationCountPromise,
  ...props
}: ProjectsWorkspaceHeaderProps & {
  notificationCountPromise: Promise<number>;
}) {
  const notificationCount = await notificationCountPromise;
  return <WorkspaceHeader {...props} notificationCount={notificationCount} />;
}

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: PageProps) {
  const session = await requireSession();

  return (
    <Suspense fallback={<LoadingShell />}>
      <ProjectsPageContent searchParams={searchParams} session={session} />
    </Suspense>
  );
}

async function ProjectsPageContent({
  searchParams,
  session,
}: PageProps & {
  session: ProjectsSession;
}) {
  const workerMode = isWorkerOnly(session);
  const connectionOverrides = {
    login: session.login,
    password: session.password,
  };
  const snapshotPromise = loadMunicipalSnapshot(connectionOverrides);
  const scopedDepartmentNamePromise = loadSessionDepartmentName(session);
  const paramsPromise: NonNullable<PageProps["searchParams"]> = searchParams ?? Promise.resolve({});

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const masterMode = isMasterRole(session.role);
  const seniorMasterMode = session.role === "senior_master";
  let scopedDepartmentName = await scopedDepartmentNamePromise;
  let snapshot: DashboardSnapshot | null = null;
  if (!scopedDepartmentName && workerMode) {
    snapshot = await snapshotPromise;
    const currentUserId = String(session.uid);
    scopedDepartmentName =
      snapshot.taskDirectory.find((task) =>
        (task.assigneeIds ?? []).some((assigneeId) => String(assigneeId) === currentUserId),
      )?.departmentName ?? null;
  }
  const transportInspectorMode =
    (session.role === "transport_inspector" || Boolean(session.groupFlags?.mfoInspector)) &&
    !session.groupFlags?.mfoManager &&
    !session.groupFlags?.mfoDispatcher &&
    !session.groupFlags?.municipalDepartmentHead;
  if (transportInspectorMode) {
    scopedDepartmentName = AUTO_BASE_GROUP_NAME;
  }
  const departmentScopedMode = Boolean(scopedDepartmentName);

  const params = (await paramsPromise) ?? {};
  const requestedDepartment = getDepartmentParam(params.department);
  const requestedUnit = getDepartmentParam(params.unit);
  if (
    transportInspectorMode &&
    requestedDepartment &&
    requestedDepartment !== AUTO_BASE_GROUP_NAME &&
    requestedDepartment !== AUTO_BASE_UNIT_NAME
  ) {
    redirect(`/projects?department=${encodeURIComponent(AUTO_BASE_GROUP_NAME)}`);
  }
  let activeFilter = normalizeProjectFilter(getDepartmentParam(params.category));
  const quickActionMode = normalizeQuickAction(getDepartmentParam(params.quickAction));
  const autoGarbagePanelMode = normalizeAutoGarbagePanel(getDepartmentParam(params.autoPanel));
  const selectedAutoBaseVehicleId = Number(getDepartmentParam(params.vehicle) ?? "");
  const autoBaseNotice = getDepartmentParam(params.notice) ?? "";
  const autoBaseError = getDepartmentParam(params.error) ?? "";
  const dateFrom = normalizeDateFilter(params.dateFrom);
  const dateTo = normalizeDateFilter(params.dateTo);
  const hasDateFilter = Boolean(dateFrom || dateTo);
  const searchFilter = normalizeSearchFilter(params.search);
  const normalizedSearchFilter = searchFilter.toLocaleLowerCase("mn-MN");
  const hasListFilter = hasDateFilter || Boolean(searchFilter) || activeFilter !== "all";

  const detectedGroup =
    departmentScopedMode
      ? findDepartmentGroupByName(scopedDepartmentName ?? "") ??
        findDepartmentGroupByUnit(scopedDepartmentName ?? "")
      : requestedDepartment && requestedDepartment !== "all"
        ? findDepartmentGroupByName(requestedDepartment) ??
          findDepartmentGroupByUnit(requestedDepartment)
        : null;

  const selectedGroup = detectedGroup;
  const isOverdueFilter = activeFilter === "overdue";
  const availableUnits = selectedGroup ? getAvailableUnits(selectedGroup) : [];

  const selectedUnit =
    requestedUnit && availableUnits.includes(requestedUnit)
      ? requestedUnit
      : requestedDepartment && availableUnits.includes(requestedDepartment)
        ? requestedDepartment
        : "";
  const isAutoBaseView = selectedGroup?.name === AUTO_BASE_GROUP_NAME;
  const showAutoBaseFleet = isAutoBaseView && selectedUnit === AUTO_BASE_UNIT_NAME;
  const showAutoBaseCombined = isAutoBaseView && !selectedUnit;
  const garbageTransportSettingsHref = "/settings/garbage-transport";
  const cleaningAreaSettingsHref = "/cleaning-areas";
  const canShowGarbageTransportSettings =
    isAutoBaseView &&
    canAccessGarbageTransportSettings(
      session,
      scopedDepartmentName ?? selectedGroup?.name ?? AUTO_BASE_GROUP_NAME,
    );
  const canShowCleaningAreaSettings =
    selectedGroup?.name === GREEN_SERVICE_GROUP_NAME && !workerMode;
  let fleetBoard: Awaited<ReturnType<typeof loadFleetVehicleBoard>> | null = null;
  let fleetLoadError = "";

  if (isAutoBaseView) {
    try {
      fleetBoard = await loadFleetVehicleBoard();
    } catch (error) {
      console.error("Fleet vehicle board could not be loaded for projects auto-base view:", error);
      fleetLoadError =
        "Авто баазын засвартай машинуудыг уншиж чадсангүй. Холболт болон эрхийн тохиргоог шалгана уу.";
    }
  }
  const autoBaseGroupForVehicles =
    selectedGroup?.name === AUTO_BASE_GROUP_NAME ? selectedGroup : findDepartmentGroupByName(AUTO_BASE_GROUP_NAME);
  const autoBaseRepairVehicles =
    fleetBoard?.repairVehicles.filter((vehicle) => {
      if (showAutoBaseFleet || showAutoBaseCombined) {
        return true;
      }

      if (!vehicle.departmentName) {
        return true;
      }

      return (
        matchesUnitScope(
          AUTO_BASE_UNIT_NAME,
          vehicle.departmentName,
          vehicle.name,
          `${vehicle.vehicleTypeName} ${vehicle.categoryName} ${vehicle.latestRepairState}`,
        ) || Boolean(autoBaseGroupForVehicles && matchesDepartmentGroup(autoBaseGroupForVehicles, vehicle.departmentName))
      );
    }) ?? [];

  if (!snapshot) {
    snapshot = await snapshotPromise;
  }
  const notificationCountPromise = loadWorkspaceNotificationCount(session, {
    snapshot,
    scopedDepartmentName,
  });

  const projectTaskSearchByName = new Map<string, string>();
  for (const task of snapshot.taskDirectory) {
    const currentText = projectTaskSearchByName.get(task.projectName) ?? "";
    projectTaskSearchByName.set(
      task.projectName,
      `${currentText} ${task.name} ${task.operationTypeLabel}`.trim(),
    );
  }

  const scopedTaskProjectNames = new Set(
    departmentScopedMode
      ? snapshot.taskDirectory
          .filter((task) => {
            const effectiveDepartmentName =
              !task.isDepartmentTask && task.assigneeDepartmentName
                ? task.assigneeDepartmentName
                : task.departmentName;
            return (
              filterByDepartment(
                [{ departmentName: effectiveDepartmentName }],
                scopedDepartmentName,
              ).length > 0
            );
          })
          .map((task) => task.projectName)
      : [],
  );

  let scopedProjects = snapshot.projects.filter((project) => {
    if (departmentScopedMode && isDirectiveTaskProject(project.name)) {
      return (
        project.managerId === session.uid || scopedTaskProjectNames.has(project.name)
      );
    }
    const projectSearchText =
      `${project.operationTypeLabel ?? ""} ${projectTaskSearchByName.get(project.name) ?? ""}`;

    if (selectedUnit) {
      if (isAutoBaseView) {
        return matchesAutoBaseUnitWork(selectedUnit, project);
      }
      return matchesUnitScope(
        selectedUnit,
        project.departmentName,
        project.name,
        projectSearchText,
      );
    }
    if (selectedGroup) {
      return matchesGroupOrUnitScope(
        selectedGroup,
        project.departmentName,
        project.name,
        projectSearchText,
      );
    }
    if (departmentScopedMode) {
      return filterByDepartment([project], scopedDepartmentName).length > 0;
    }
    return true;
  }).sort((left, right) => {
    if (masterMode) {
      const stageRankDiff =
        getProjectStageRank(left.stageBucket) - getProjectStageRank(right.stageBucket);
      if (stageRankDiff !== 0) {
        return stageRankDiff;
      }

      if (right.openTasks !== left.openTasks) {
        return right.openTasks - left.openTasks;
      }

      return left.name.localeCompare(right.name, "mn");
    }

    return right.completion - left.completion;
  });
  let scopedTasks = snapshot.taskDirectory.filter((task) => {
    if (selectedUnit) {
      return matchesUnitScope(
        selectedUnit,
        task.departmentName,
        task.projectName,
        task.operationTypeLabel,
      );
    }
    if (selectedGroup) {
      return matchesGroupOrUnitScope(
        selectedGroup,
        task.departmentName,
        task.projectName,
        task.operationTypeLabel,
      );
    }
    if (departmentScopedMode) {
      const effectiveDepartmentName =
        !task.isDepartmentTask && task.assigneeDepartmentName
          ? task.assigneeDepartmentName
          : task.departmentName;
      return (
        filterByDepartment(
          [{ departmentName: effectiveDepartmentName }],
          scopedDepartmentName,
        ).length > 0
      );
    }
    return true;
  });

  if (masterMode) {
    scopedTasks = filterTasksForResponsibleMaster(scopedTasks, scopedProjects, session);
    scopedProjects = filterProjectsForResponsibleMaster(scopedProjects, scopedTasks, session);
  }

  if (transportInspectorMode) {
    const currentUserId = String(session.uid);
    scopedTasks = scopedTasks.filter(
      (task) =>
        String(task.leaderId ?? "") === currentUserId ||
        (task.assigneeIds ?? []).some((assigneeId) => String(assigneeId) === currentUserId),
    );
    const inspectorProjectNames = new Set(scopedTasks.map((task) => task.projectName));
    scopedProjects = scopedProjects.filter(
      (project) =>
        String(project.managerId ?? "") === currentUserId || inspectorProjectNames.has(project.name),
    );
  }

  if (workerMode) {
    const currentUserId = String(session.uid);
    scopedTasks = scopedTasks.filter((task) =>
      (task.assigneeIds ?? []).some((assigneeId) => String(assigneeId) === currentUserId),
    );
    const workerProjectNames = new Set(scopedTasks.map((task) => task.projectName));
    scopedProjects = scopedProjects.filter((project) => workerProjectNames.has(project.name));
  }

  if (hasDateFilter) {
    scopedTasks = scopedTasks.filter((task) => {
      const taskDate = getTaskDateKey(task);
      if (!taskDate) return false;
      if (dateFrom && taskDate < dateFrom) return false;
      if (dateTo && taskDate > dateTo) return false;
      return true;
    });
    const datedProjectIds = new Set(
      scopedTasks
        .map((task) => task.projectId)
        .filter((projectId): projectId is number => typeof projectId === "number"),
    );
    const datedProjectNames = new Set(scopedTasks.map((task) => task.projectName));
    scopedProjects = scopedProjects.filter(
      (project) => datedProjectIds.has(project.id) || datedProjectNames.has(project.name),
    );
  }


  if (normalizedSearchFilter) {
    const directlyMatchedProjects = new Set(
      scopedProjects
        .filter((project) =>
          `${project.name} ${project.manager} ${project.departmentName}`
            .toLocaleLowerCase("mn-MN")
            .includes(normalizedSearchFilter),
        )
        .map((project) => project.id),
    );
    const directlyMatchedProjectNames = new Set(
      scopedProjects
        .filter((project) => directlyMatchedProjects.has(project.id))
        .map((project) => project.name),
    );
    scopedTasks = scopedTasks.filter((task) => {
      if (
        (typeof task.projectId === "number" && directlyMatchedProjects.has(task.projectId)) ||
        directlyMatchedProjectNames.has(task.projectName)
      ) {
        return true;
      }
      return `${task.name} ${task.projectName} ${task.leaderName} ${task.departmentName}`
        .toLocaleLowerCase("mn-MN")
        .includes(normalizedSearchFilter);
    });
    const matchedProjectIds = new Set(
      scopedTasks
        .map((task) => task.projectId)
        .filter((projectId): projectId is number => typeof projectId === "number"),
    );
    const matchedProjectNames = new Set(scopedTasks.map((task) => task.projectName));
    scopedProjects = scopedProjects.filter(
      (project) =>
        directlyMatchedProjects.has(project.id) ||
        matchedProjectIds.has(project.id) ||
        matchedProjectNames.has(project.name),
    );
  }

  const projectTasksById = new Map<number, TaskCardItem[]>();
  const projectTasksByName = new Map<string, TaskCardItem[]>();
  for (const task of scopedTasks) {
    if (typeof task.projectId === "number") {
      const list = projectTasksById.get(task.projectId);
      if (list) list.push(task);
      else projectTasksById.set(task.projectId, [task]);
    }
    if (task.projectName) {
      const named = projectTasksByName.get(task.projectName);
      if (named) named.push(task);
      else projectTasksByName.set(task.projectName, [task]);
    }
  }
  const resolveProjectTasks = (project: ProjectCardItem): TaskCardItem[] =>
    projectTasksById.get(project.id) ??
    projectTasksByName.get(project.name) ??
    [];

  const currentDateKey = getTodayDateKey();
  const overdueProjectNames = new Set(
    scopedTasks
      .filter(
        (task) =>
          task.scheduledDate &&
          task.scheduledDate < currentDateKey &&
          task.statusKey !== "verified",
      )
      .map((task) => task.projectName),
  );
  const overdueTasks = scopedTasks
    .filter(
      (task) =>
        task.scheduledDate &&
        task.scheduledDate < currentDateKey &&
        task.statusKey !== "verified",
    )
    .sort((left, right) => {
      const leftDate = left.scheduledDate || left.deadlineDateTime || "";
      const rightDate = right.scheduledDate || right.deadlineDateTime || "";
      if (leftDate !== rightDate) {
        return leftDate.localeCompare(rightDate);
      }

      return left.name.localeCompare(right.name, "mn");
    });

  const activeProjects = scopedProjects.filter((project) => {
        if (activeFilter === "all") {
          return true;
        }

        if (activeFilter === "planned") {
          return project.stageBucket === "todo" || project.stageBucket === "progress" || project.stageBucket === "unknown";
        }

        if (activeFilter === "review") {
          return project.stageBucket === "review" || project.stageBucket === "problem";
        }

        if (activeFilter === "done") {
          return project.stageBucket === "done";
        }

        if (activeFilter === "unfinished") {
          return project.stageBucket !== "done";
        }

        if (activeFilter === "overdue") {
          return overdueProjectNames.has(project.name);
        }

        return true;
      });

  const selectedDepartmentName = masterMode
    ? scopedDepartmentName ?? "Миний алба нэгж"
    : selectedUnit || selectedGroup?.name || "Бүх хэлтэс";
  const hideDepartmentInProjectCards = masterMode || Boolean(selectedUnit || selectedGroup);
  const masterProjectSectionLabel = seniorMasterMode ? "Нэгжийн бүх ажил" : "Миний хариуцсан ажил";
  const masterProjectSectionNote = seniorMasterMode
    ? "Ахлах мастер нэгжийн бүх мастер, бүх ажлын явцыг харна"
    : "Мастер зөвхөн өөрт хариуцуулсан ажил, тайланг харна";

  const projectCounts = {
    all: scopedProjects.length,
    planned: scopedProjects.filter(
      (project) => project.stageBucket === "todo" || project.stageBucket === "progress" || project.stageBucket === "unknown",
    ).length,
    review: scopedProjects.filter(
      (project) => project.stageBucket === "review" || project.stageBucket === "problem",
    ).length,
    done: scopedProjects.filter((project) => project.stageBucket === "done").length,
    unfinished: scopedProjects.filter((project) => project.stageBucket !== "done").length,
    overdue: overdueProjectNames.size,
  } satisfies Record<ProjectFilterKey, number>;

  const reviewProjectsCount = projectCounts.review;
  const doneProjectsCount = projectCounts.done;
  const openProjectsCount = projectCounts.planned + projectCounts.review;
  const overdueProjectsCount = overdueProjectNames.size;
  const totalOpenTaskCount = scopedProjects.reduce(
    (sum, project) => sum + project.openTasks,
    0,
  );
  const averageProjectCompletion = scopedProjects.length
    ? Math.round(
        scopedProjects.reduce((sum, project) => sum + project.completion, 0) /
          scopedProjects.length,
      )
    : 0;
  const averageTaskProgress = scopedTasks.length
    ? Math.round(
        scopedTasks.reduce((sum, task) => sum + task.progress, 0) / scopedTasks.length,
      )
    : 0;
  const openProjectShare = scopedProjects.length
    ? Math.round((openProjectsCount / scopedProjects.length) * 100)
    : 0;
  const insightProgressCards = [
    {
      key: "project",
      label: "Ажлын явц",
      value: averageProjectCompletion,
      note: "Нийт ажлын ерөнхий гүйцэтгэл.",
      cardClass: styles.masterInsightsProgressCardProject,
      unitLabel: "Ажил",
    },
    {
      key: "task",
      label: "Даалгаврын явц",
      value: averageTaskProgress,
      note: "Нээлттэй даалгаврын бодит явц.",
      cardClass: styles.masterInsightsProgressCardTask,
      unitLabel: "Даалгавар",
    },
  ] as const;
  const statusDistribution = [
    {
      key: "planned",
      label: "Төлөвлөсөн",
      count: projectCounts.planned,
      note: "Төлөвлөсөн болон хуваарилагдсан ажил",
      share: scopedProjects.length
        ? Math.round((projectCounts.planned / scopedProjects.length) * 100)
        : 0,
      toneClass: styles.masterInsightsStatusPlanned,
    },
    {
      key: "review",
      label: "Хянаж байгаа",
      count: reviewProjectsCount,
      note: "Хяналт, баталгаажуулалт хүлээж буй",
      share: scopedProjects.length
        ? Math.round((reviewProjectsCount / scopedProjects.length) * 100)
        : 0,
      toneClass: styles.masterInsightsStatusReview,
    },
    {
      key: "done",
      label: "Дууссан",
      count: doneProjectsCount,
      note: "Бүрэн дууссан ажил",
      share: scopedProjects.length
        ? Math.round((doneProjectsCount / scopedProjects.length) * 100)
        : 0,
      toneClass: styles.masterInsightsStatusProgress,
    },
  ] as const;
  const insightSummaryCards = [
    {
      label: "Нийт захирамж, үүрэг даалгавар",
      value: String(scopedProjects.length),
      note: "Бүртгэлтэй ажил",
    },
    {
      label: "Нийт даалгавар",
      value: String(scopedTasks.length),
      note: "Бүх даалгаврын нийлбэр",
    },
    {
      label: "Нээлттэй даалгавар",
      value: String(totalOpenTaskCount),
      note: "Хаагдаагүй даалгавар",
    },
  ] as const;
  const progressGap = averageTaskProgress - averageProjectCompletion;
  const progressGapLabel =
    progressGap === 0
      ? "Ажил, даалгаврын явц ижил түвшинд байна."
      : progressGap > 0
        ? `Даалгаврын явц ажлынхаас ${progressGap}% өндөр байна.`
        : `Ажлын явц даалгаврынхаас ${Math.abs(progressGap)}% өндөр байна.`;
  const buildScopedListHref = (filter: ProjectFilterKey, includeDate = true) => {
    const hrefParams = new URLSearchParams();
    if (selectedGroup?.name) {
      hrefParams.set("department", selectedGroup.name);
    }
    if (selectedUnit) {
      hrefParams.set("unit", selectedUnit);
    }
    if (filter !== "all") {
      hrefParams.set("category", filter);
    }
    if (quickActionMode !== "none") {
      hrefParams.set("quickAction", quickActionMode);
    }
    if (includeDate && dateFrom) hrefParams.set("dateFrom", dateFrom);
    if (includeDate && dateTo) hrefParams.set("dateTo", dateTo);
    if (includeDate && searchFilter) hrefParams.set("search", searchFilter);

    return `/projects${hrefParams.toString() ? `?${hrefParams.toString()}` : ""}`;
  };
  const clearListFilterParams = new URLSearchParams();
  if (selectedGroup?.name) clearListFilterParams.set("department", selectedGroup.name);
  if (selectedUnit) clearListFilterParams.set("unit", selectedUnit);
  if (quickActionMode !== "none") clearListFilterParams.set("quickAction", quickActionMode);
  const clearListFilterHref = `/projects${
    clearListFilterParams.toString() ? `?${clearListFilterParams.toString()}` : ""
  }`;
  const summaryCards = ([
    {
      label: "Нийт захирамж, үүрэг даалгавар",
      value: String(scopedProjects.length),
      delta: "100%",
      note: "Энэ нэгж дээр бүртгэлтэй бүх ажил",
      icon: "А",
      tone: styles.summaryCardSoft,
      href: buildScopedListHref("all"),
    },
    {
      label: "Төлөвлөсөн",
      value: String(projectCounts.planned),
      delta: formatShare(projectCounts.planned, scopedProjects.length),
      note: "Төлөвлөсөн болон хуваарилагдсан ажил",
      icon: "Т",
      tone: styles.summaryCardSoft,
      href: buildScopedListHref("planned"),
    },
    {
      label: "Хянаж байгаа",
      value: String(reviewProjectsCount),
      delta: formatShare(reviewProjectsCount, scopedProjects.length),
      note: "Баталгаажуулалт хүлээж буй ажил",
      icon: "Х",
      tone: styles.summaryCardReview,
      href: buildScopedListHref("review"),
    },
    {
      label: "Хугацаа хэтэрсэн",
      value: String(overdueProjectsCount),
      delta: formatShare(overdueProjectsCount, scopedProjects.length),
      note: "Хугацаа өнгөрсөн даалгавартай ажил",
      icon: "!",
      tone: styles.summaryCardUrgent,
      href: buildScopedListHref("overdue"),
    },
    {
      label: "Дууссан",
      value: String(doneProjectsCount),
      delta: formatShare(doneProjectsCount, scopedProjects.length),
      note: "Бүрэн дууссан ажил",
      icon: "Д",
      tone: styles.summaryCardPrimary,
      href: buildScopedListHref("done"),
    },
  ] as const).filter((card) => !HIDE_OVERDUE_UI || card.label !== "Хугацаа хэтэрсэн");
  const showServiceMiniDashboard =
    !showAutoBaseFleet &&
    !showAutoBaseCombined &&
    !masterMode &&
    !isOverdueFilter &&
    isGreenOrImprovementScope(selectedGroup?.name, selectedUnit);
  const serviceMiniSummaryCards = [
    ...summaryCards.slice(0, 5),
    {
      label: "Дундаж явц",
      value: `${averageProjectCompletion}%`,
      delta: `${averageTaskProgress}%`,
      note: "Ажил / даалгаврын дундаж явц",
      icon: "%",
      tone: styles.summaryCardPrimary,
      href: buildScopedListHref("all"),
    },
  ] as const;

  const filterTitle =
    activeFilter === "review"
      ? "Хянаж байгаа"
      : activeFilter === "done"
        ? "Дууссан"
      : activeFilter === "unfinished"
        ? "Дуусаагүй"
      : activeFilter === "overdue"
        ? "Хугацаа хэтэрсэн"
      : activeFilter === "planned"
        ? "Төлөвлөсөн"
        : "Бүх ажил";

  const filterNote =
    activeFilter === "review"
      ? "Хяналт, баталгаажуулалт хүлээж буй ажлуудыг харуулна"
      : activeFilter === "done"
        ? "Бүрэн дууссан ажлуудыг харуулна"
      : activeFilter === "unfinished"
        ? "Дуусаагүй болон гүйцэтгэл үргэлжилж байгаа ажлуудыг харуулна"
      : activeFilter === "overdue"
        ? "Хугацаа өнгөрсөн даалгавартай ажлуудыг харуулна"
      : activeFilter === "planned"
        ? "Төлөвлөсөн болон хуваарилагдсан ажлуудыг харуулна"
        : "Сонгосон алба нэгжийн төлөвлөсөн, хянаж байгаа болон дууссан бүх ажил харагдана";
  const selectionParams = new URLSearchParams();
  if (selectedGroup?.name) {
    selectionParams.set("department", selectedGroup.name);
  }
  if (selectedUnit) {
    selectionParams.set("unit", selectedUnit);
  }
  if (activeFilter !== "all") {
    selectionParams.set("category", activeFilter);
  }
  if (quickActionMode !== "none") {
    selectionParams.set("quickAction", quickActionMode);
  }
  if (dateFrom) selectionParams.set("dateFrom", dateFrom);
  if (dateTo) selectionParams.set("dateTo", dateTo);
  if (searchFilter) selectionParams.set("search", searchFilter);
  const selectionReturnTo = `/projects${selectionParams.toString() ? `?${selectionParams.toString()}` : ""}`;
  const quickActionMessage =
    quickActionMode === "task"
      ? "Эхлээд ажил сонгоод тухайн ажлын дотор шинэ даалгавар нэмнэ."
      : quickActionMode === "report"
        ? "Эхлээд ажил сонгоод, дараа нь даалгавар дээрээс тайлан оруулна."
        : "";
  const projectCardLabel =
    quickActionMode === "task"
      ? "Энэ ажил дээр даалгавар нэмэх"
      : quickActionMode === "report"
        ? "Даалгавар сонгох"
        : "Үүрэг даалгавар харах";
  const buildProjectHref = (projectHref: string) => {
    if (quickActionMode === "none") {
      return projectHref;
    }

    const hrefParams = new URLSearchParams();
    hrefParams.set("quickAction", quickActionMode);
    hrefParams.set("returnTo", selectionReturnTo);
    return `${projectHref}?${hrefParams.toString()}`;
  };
  const newWorkParams = new URLSearchParams();
  if (selectedUnit || selectedGroup?.name) {
    newWorkParams.set("department", selectedUnit || selectedGroup?.name || "");
  }
  const newWorkHref = `/projects/new${
    newWorkParams.toString() ? `?${newWorkParams.toString()}` : ""
  }`;
  const showCreateWorkButton =
    !masterMode &&
    !showAutoBaseFleet &&
    !isOverdueFilter &&
    canCreateProject &&
    !showAutoBaseCombined;
  const showCreateWorkButtonInUnitSection =
    showCreateWorkButton && Boolean(selectedGroup && availableUnits.length > 1);
  const shouldShowGreenServiceSections =
    !masterMode &&
    !showAutoBaseFleet &&
    !selectedUnit &&
    selectedGroup?.name === GREEN_SERVICE_GROUP_NAME;
  const greenServiceProjectSections = GREEN_SERVICE_UNITS.map((unit) => ({
    ...unit,
    projects: [] as ProjectCardItem[],
  }));
  const uncategorizedGreenServiceProjects: ProjectCardItem[] = [];

  if (shouldShowGreenServiceSections) {
    for (const project of activeProjects) {
      const section = greenServiceProjectSections.find((item) =>
        matchesUnitScope(
          item.label,
          project.departmentName,
          project.name,
          `${project.operationTypeLabel ?? ""} ${projectTaskSearchByName.get(project.name) ?? ""}`,
        ),
      );

      if (section) {
        section.projects.push(project);
      } else {
        uncategorizedGreenServiceProjects.push(project);
      }
    }
  }

  const roleLabel = getSessionRoleLabel(session);
  const appMenuProps: ProjectsAppMenuProps = {
    active: isOverdueFilter ? "none" : transportInspectorMode ? "projects" : masterMode ? "dashboard" : "projects",
    canCreateProject,
    canCreateTasks,
    canWriteReports,
    canViewQualityCenter,
    canUseFieldConsole,
    userName: session.name,
    userRole: session.role,
    roleLabel,
    groupFlags: session.groupFlags,
    masterMode,
    workerMode,
    departmentScopeName: scopedDepartmentName,
  };
  const workspaceHeaderProps: ProjectsWorkspaceHeaderProps = {
    title: isOverdueFilter ? "Хугацаа хэтэрсэн захирамж, үүрэг даалгавар" : masterMode ? "Хяналтын самбар" : "Захирамж, үүрэг даалгавар",
    subtitle: isOverdueFilter ? "Хугацаа өнгөрсөн даалгавартай ажлууд" : selectedDepartmentName,
    userName: session.name,
    roleLabel,
  };

  return (
    <main className={styles.shell}>
      <div className={styles.container} id="projects-top">
        <div className={styles.contentWithMenu}>
          <aside className={styles.menuColumn}>
            <Suspense fallback={<AppMenu {...appMenuProps} notificationCount={0} />}>
              <AppMenuWithNotificationCount
                {...appMenuProps}
                notificationCountPromise={notificationCountPromise}
              />
            </Suspense>
          </aside>

          <div className={styles.pageContent}>
            <Suspense fallback={<WorkspaceHeader {...workspaceHeaderProps} notificationCount={0} />}>
              <WorkspaceHeaderWithNotificationCount
                {...workspaceHeaderProps}
                notificationCountPromise={notificationCountPromise}
              />
            </Suspense>

            {isAutoBaseView ? (
              <section className={styles.departmentMediaStrip} aria-label="Авто бааз, хог тээвэрлэлтийн хэлтсийн зураг, газрын зураг">
                <div className={styles.departmentMapCard}>
                  <iframe
                    src="https://maps.google.com/maps?q=47.8864,106.9057&z=12&output=embed"
                    title="Хан-Уул дүүргийн Google газрын зураг"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                  <Link href="/waste-points/map" className={styles.departmentMapCaption}>
                    <span className={styles.departmentMapIcon}><MapPin size={22} aria-hidden /></span>
                    <span>
                      <strong>Хогийн цэгийн газрын зураг</strong>
                      <small>Бүртгэлтэй цэгүүдийг дэлгэрэнгүй харах →</small>
                    </span>
                  </Link>
                </div>
                <ReportImageLightbox
                  images={[{ id: "auto-base-projects-overview", url: "/department-work/auto-base-garbage-transport-overview.png", name: "Хог ачилт, тээвэрлэлтийн үйл ажиллагаа", alt: "Авто бааз, хог тээвэрлэлтийн хэлтсийн хог ачилт, тээвэрлэлтийн үйл ажиллагаа", caption: "Хог ачилт, тээвэрлэлтийн үйл ажиллагаа" }]}
                  gridClassName={styles.departmentOverviewLightbox}
                  triggerClassName={styles.departmentOverviewCard}
                  imageWidth={1536}
                  imageHeight={1024}
                  showCaption
                  viewerTitle="Авто бааз, хог тээвэрлэлтийн хэлтэс"
                />
              </section>
            ) : null}

            {isOverdueFilter ? (
              <div className={styles.buttonRow}>
                <Link href="/" className={styles.secondaryButton}>
                  <ArrowLeft aria-hidden />
                  Хяналтын самбар руу буцах
                </Link>
              </div>
            ) : null}

            {showCreateWorkButton && !showCreateWorkButtonInUnitSection ? (
              <div className={styles.buttonRow}>
                <Link href={newWorkHref} className={styles.primaryButton}>
                  Захирамж, үүрэг даалгавар нэмэх
                </Link>
              </div>
            ) : null}

            {quickActionMessage ? (
              <div className={`${styles.message} ${styles.noticeMessage}`}>
                {quickActionMessage}
              </div>
            ) : null}

            {selectedGroup && availableUnits.length > 1 ? (
              <section className={`${styles.workspaceSection} ${styles.dashboardWorkspaceSection}`}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span className={styles.sectionKicker}>Доторх нэгж</span>
                    <h2>{selectedGroup.name}</h2>
                    <small className={styles.sectionNote}>
                      Энэ хэлтэс доторх ажлыг нэгжээр нь салгаж харуулна.
                    </small>
                  </div>
                  {showCreateWorkButtonInUnitSection || canShowGarbageTransportSettings || canShowCleaningAreaSettings ? (
                    <div className={styles.sectionHeaderActions}>
                      {showCreateWorkButtonInUnitSection ? (
                        <Link href={newWorkHref} className={styles.primaryButton}>
                          Захирамж, үүрэг даалгавар нэмэх
                        </Link>
                      ) : null}
                      {canShowGarbageTransportSettings || canShowCleaningAreaSettings ? (
                        <Link
                          href={canShowCleaningAreaSettings ? cleaningAreaSettingsHref : garbageTransportSettingsHref}
                          className={styles.secondaryButton}
                        >
                          <Settings aria-hidden />
                          Тохиргоо
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className={styles.taskFilterRail}>
                  {(() => {
                    const hrefParams = new URLSearchParams();
                    hrefParams.set("department", selectedGroup.name);
                    if (quickActionMode !== "none") {
                      hrefParams.set("quickAction", quickActionMode);
                    }
                    if (dateFrom) hrefParams.set("dateFrom", dateFrom);
                    if (dateTo) hrefParams.set("dateTo", dateTo);
                    if (searchFilter) hrefParams.set("search", searchFilter);
                    if (activeFilter !== "all") hrefParams.set("category", activeFilter);

                    return (
                      <Link
                        href={`/projects?${hrefParams.toString()}`}
                        className={`${styles.taskFilterChip} ${
                          !selectedUnit ? styles.taskFilterChipActive : ""
                        }`}
                      >
                        <span>Бүгд</span>
                        <strong>
                          {
                            snapshot.projects.filter((project) =>
                              matchesGroupOrUnitScope(
                                selectedGroup,
                                project.departmentName,
                                project.name,
                                `${project.operationTypeLabel ?? ""} ${projectTaskSearchByName.get(project.name) ?? ""}`,
                              ),
                            ).length
                          }
                        </strong>
                      </Link>
                    );
                  })()}
                  {availableUnits.map((unit) => {
                    const hrefParams = new URLSearchParams();
                    hrefParams.set("department", selectedGroup.name);
                    hrefParams.set("unit", unit);
                    if (quickActionMode !== "none") {
                      hrefParams.set("quickAction", quickActionMode);
                    }
                    if (dateFrom) hrefParams.set("dateFrom", dateFrom);
                    if (dateTo) hrefParams.set("dateTo", dateTo);
                    if (searchFilter) hrefParams.set("search", searchFilter);
                    if (activeFilter !== "all") hrefParams.set("category", activeFilter);
                    return (
                      <Link
                        key={unit}
                        href={`/projects?${hrefParams.toString()}`}
                        className={`${styles.taskFilterChip} ${
                          selectedUnit === unit
                            ? styles.taskFilterChipActive
                            : ""
                        }`}
                      >
                        <span>{unit}</span>
                        <strong>
                          {snapshot.projects.filter((project) =>
                            isAutoBaseView
                              ? matchesAutoBaseUnitWork(unit, project)
                              : matchesUnitScope(
                                  unit,
                                  project.departmentName,
                                  project.name,
                                  `${project.operationTypeLabel ?? ""} ${projectTaskSearchByName.get(project.name) ?? ""}`,
                                ),
                          ).length}
                        </strong>
                      </Link>
                    );
                  })}
                  {isAutoBaseView && fleetBoard ? (
                    <span
                      className={`${styles.taskFilterChip} ${styles.taskFilterChipStatic}`}
                      aria-label="Нийт машин техник"
                    >
                      <span>Машин</span>
                      <strong>{fleetBoard.totalVehicles}</strong>
                    </span>
                  ) : null}
                </div>
              </section>
            ) : null}

            {showAutoBaseCombined && fleetBoard ? (
              <AutoGarbageWorkBoard
                dashboardTasks={scopedTasks}
                fleetBoard={fleetBoard}
                currentDateKey={currentDateKey}
                departmentScopeName={selectedGroup?.name ?? AUTO_BASE_GROUP_NAME}
                canCreateWork={canCreateProject || canCreateTasks}
                reportPanelMode={autoGarbagePanelMode}
                boardHref={`/projects?department=${encodeURIComponent(selectedGroup?.name ?? AUTO_BASE_GROUP_NAME)}`}
                workListHref={`/projects?department=${encodeURIComponent(selectedGroup?.name ?? AUTO_BASE_GROUP_NAME)}&unit=${encodeURIComponent("Хог тээвэрлэлт")}`}
              />
            ) : null}

            {!showAutoBaseCombined ? (
            <section className={`${styles.workspaceSection} ${styles.dashboardWorkspaceSection}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionKicker}>
                    {showAutoBaseFleet ? "Авто баазын самбар" : masterMode ? masterProjectSectionLabel : "Захирамж, үүрэг даалгаврын жагсаалт"}
                  </span>
                  <h2>{showAutoBaseFleet ? "Машин техникийн бүртгэл" : masterMode ? selectedDepartmentName : filterTitle}</h2>
                  <small className={styles.sectionNote}>
                    {showAutoBaseFleet
                      ? "Машины төлөв, засвар, даатгал, үзлэгийн нэгдсэн хяналт."
                      : masterMode
                        ? masterProjectSectionNote
                        : `${selectedDepartmentName} · ${filterNote}`}
                  </small>
                </div>
              </div>

              {!showAutoBaseFleet ? (
                <form method="get" action="/projects" className={styles.dateFilterBar}>
                  {departmentScopedMode ? (
                    selectedGroup?.name ? <input type="hidden" name="department" value={selectedGroup.name} /> : null
                  ) : (
                    <label className={styles.departmentFilterField}>
                      <span>Хэлтэс / алба</span>
                      <select name="department" defaultValue={selectedGroup?.name || "all"}>
                        <option value="all">Бүх хэлтэс</option>
                        {DEPARTMENT_GROUPS.map((department) => (
                          <option key={department.name} value={department.name}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {selectedUnit ? <input type="hidden" name="unit" value={selectedUnit} /> : null}
                  {quickActionMode !== "none" ? <input type="hidden" name="quickAction" value={quickActionMode} /> : null}
                  <label className={styles.dateFilterSearch}>
                    <span>Ажил, даалгаврын нэр</span>
                    <input
                      type="search"
                      name="search"
                      defaultValue={searchFilter}
                      placeholder="Нэрээр хайх"
                    />
                  </label>
                  <label>
                    <span>Төлөв</span>
                    <select name="category" defaultValue={activeFilter}>
                      <option value="all">Бүгд</option>
                      <option value="unfinished">Дуусаагүй</option>
                      <option value="done">Дууссан</option>
                      <option value="planned">Төлөвлөсөн</option>
                      <option value="review">Хянаж байгаа</option>
                      {!HIDE_OVERDUE_UI ? <option value="overdue">Хугацаа хэтэрсэн</option> : null}
                    </select>
                  </label>
                  <label>
                    <span>Эхлэх огноо</span>
                    <input type="date" name="dateFrom" defaultValue={dateFrom} max={dateTo || undefined} />
                  </label>
                  <label>
                    <span>Дуусах огноо</span>
                    <input type="date" name="dateTo" defaultValue={dateTo} min={dateFrom || undefined} />
                  </label>
                  <button type="submit" className={styles.primaryButton}>Шүүх</button>
                  {hasListFilter ? (
                    <Link href={clearListFilterHref} className={styles.secondaryButton}>
                      Шүүлтүүр арилгах
                    </Link>
                  ) : null}
                  <small>
                    {hasListFilter
                      ? `${activeProjects.length} ажил · ${scopedTasks.length} даалгавар шүүлтэд таарлаа.`
                      : "Нэр, төлөв болон гүйцэтгэх хугацаагаар ажил, үүрэг даалгаврыг шүүнэ."}
                  </small>
                </form>
              ) : null}

              {showServiceMiniDashboard ? (
                <div className={styles.serviceMiniDashboard}>
                  <div className={styles.serviceMiniMetricGrid}>
                    {serviceMiniSummaryCards.map((item) => (
                      <Link key={item.label} href={item.href} className={`${styles.serviceMiniMetric} ${item.tone}`}>
                        <span className={styles.serviceMiniMetricIcon}>{item.icon}</span>
                        <span className={styles.serviceMiniMetricBody}>
                          <small>{item.label}</small>
                          <strong>{item.value}</strong>
                          <em>{item.note}</em>
                        </span>
                      </Link>
                    ))}
                  </div>

                </div>
              ) : null}

              {isOverdueFilter ? (
                <div className={styles.unitProjectSections}>
                  <section className={styles.unitProjectSection}>
                    <div className={styles.unitProjectSectionHeader}>
                      <div>
                        <span className={styles.unitProjectSectionKicker}>Даалгавар</span>
                        <h3>Хугацаа хэтэрсэн даалгаврууд</h3>
                        <p>Хугацаа өнгөрсөн боловч бүрэн дуусаагүй даалгавруудыг тусад нь харуулна.</p>
                      </div>
                      <strong>{overdueTasks.length}</strong>
                    </div>

                    {overdueTasks.length ? (
                      <div className={styles.reviewList}>
                        {overdueTasks.map((task) => (
                          <OverdueTaskLink
                            key={task.id}
                            task={task}
                            hideDepartment={hideDepartmentInProjectCards}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyColumnState}>
                        Хугацаа хэтэрсэн даалгавар одоогоор алга байна.
                      </div>
                    )}
                  </section>

                  <section className={styles.unitProjectSection}>
                    <div className={styles.unitProjectSectionHeader}>
                      <div>
                        <span className={styles.unitProjectSectionKicker}>Захирамж, үүрэг даалгавар</span>
                        <h3>Хугацаа хэтэрсэн ажил</h3>
                        <p>Дотроо хугацаа хэтэрсэн даалгавартай ажлууд.</p>
                      </div>
                      <strong>{activeProjects.length}</strong>
                    </div>

                    {activeProjects.length ? (
                      <div className={styles.reviewList}>
                        {activeProjects.map((project) => (
                          <ProjectListRow
                            key={project.id}
                            project={project}
                            taskCount={resolveProjectTasks(project).length}
                            href={buildProjectHref(project.href)}
                            actionLabel={projectCardLabel}
                            hideDepartment={hideDepartmentInProjectCards}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyColumnState}>
                        Хугацаа хэтэрсэн даалгавартай ажил одоогоор алга байна.
                      </div>
                    )}
                  </section>
                </div>
              ) : !showAutoBaseFleet && masterMode ? (
                <div className={styles.masterInsightsGrid}>
                  <article className={styles.masterInsightsChart}>
                    <div className={styles.masterInsightsHeader}>
                      <div className={styles.masterInsightsTitleBlock}>
                        <span className={styles.masterInsightsKicker}>Явцын диаграм</span>
                        <h3>Нэгжийн ажлын зураг</h3>
                        <p>
                          Ажил, даалгаврын явц болон төлөвийн бүтцийг нэг дор харуулна.
                        </p>
                      </div>

                      <div className={styles.masterInsightsHighlight}>
                        <span>Нээлттэй ажил</span>
                        <strong>{openProjectsCount}</strong>
                        <small>{scopedProjects.length} ажлаас дуусаагүй нь</small>
                        <div className={styles.masterInsightsHighlightMeta}>
                          <span>Нээлттэй {totalOpenTaskCount}</span>
                          <span>Нээлттэй {openProjectShare}%</span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.masterInsightsBody}>
                      <div className={styles.masterInsightsProgressGrid}>
                        {insightProgressCards.map((item) => {
                          const degrees = Math.round((item.value / 100) * 360);

                          return (
                            <article
                              key={item.key}
                              className={`${styles.masterInsightsProgressCard} ${item.cardClass}`}
                            >
                              <div
                                className={styles.masterInsightsRing}
                                aria-hidden
                                style={{
                                  background: `conic-gradient(var(--insight-ring-strong) 0deg ${degrees}deg, var(--insight-ring-soft) ${degrees}deg 360deg)`,
                                }}
                              >
                                <div className={styles.masterInsightsRingInner}>
                                  <strong>{item.value}%</strong>
                                  <span>{item.unitLabel}</span>
                                </div>
                              </div>

                              <div className={styles.masterInsightsProgressCopy}>
                                <span>{item.label}</span>
                                <strong>{item.value}%</strong>
                                <small>{item.note}</small>
                                <div className={styles.masterInsightsTrack} aria-hidden>
                                  <span style={{ width: getProgressWidth(item.value) }} />
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      <article className={styles.masterInsightsStatusCard}>
                        <div className={styles.masterInsightsStatusHeader}>
                          <div>
                            <span className={styles.masterInsightsStatusKicker}>
                              Төлөвийн бүтэц
                            </span>
                            <strong>Ажлын төлөв</strong>
                          </div>
                          <small>{scopedProjects.length} ажил</small>
                        </div>

                        <div className={styles.masterInsightsStatusList}>
                          {statusDistribution.map((item) => (
                            <div
                              key={item.key}
                              className={`${styles.masterInsightsStatusItem} ${item.toneClass}`}
                            >
                              <div className={styles.masterInsightsStatusTop}>
                                <span>{item.label}</span>
                                <strong>{item.count}</strong>
                              </div>
                              <small>{item.note}</small>
                              <div className={styles.masterInsightsMiniTrack} aria-hidden>
                                <span style={{ width: getProgressWidth(item.share) }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    </div>

                    <div className={styles.masterInsightsMeta}>
                      {insightSummaryCards.map((item) => (
                        <div key={item.label} className={styles.masterInsightsMetaItem}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                          <small>{item.note}</small>
                        </div>
                      ))}
                    </div>
                  </article>

                  <div className={styles.masterInsightsSide}>
                    <article className={styles.masterInsightsStoryCard}>
                      <span className={styles.masterInsightsStoryKicker}>Өнөөдрийн зураг</span>
                      <h3>{selectedDepartmentName}</h3>
                      <p>
                        Ачаалал, хяналтын шат, нээлттэй даалгаврын байдлыг товч харуулна.
                      </p>

                      <div className={styles.masterInsightsStoryList}>
                        <div className={styles.masterInsightsStoryItem}>
                          <strong>Нээлттэй урсгал</strong>
                          <span>
                            {scopedProjects.length} ажлаас {openProjectsCount} нь нээлттэй байна.
                          </span>
                        </div>
                        <div className={styles.masterInsightsStoryItem}>
                          <strong>Хяналтын шат</strong>
                          <span>
                            {reviewProjectsCount > 0
                              ? `${reviewProjectsCount} ажил хяналт хүлээж байна.`
                              : "Хяналт хүлээж буй ажил алга."}
                          </span>
                        </div>
                        <div className={styles.masterInsightsStoryItem}>
                          <strong>Даалгаврын ачаалал</strong>
                          <span>
                            {scopedTasks.length} даалгавраас {totalOpenTaskCount} нь нээлттэй байна.
                          </span>
                        </div>
                      </div>

                      <div className={styles.masterInsightsStoryStats}>
                        <div className={styles.masterInsightsStoryStat}>
                          <span>Нээлттэй</span>
                          <strong>{totalOpenTaskCount}</strong>
                        </div>
                        <div className={styles.masterInsightsStoryStat}>
                          <span>Нийт даалгавар</span>
                          <strong>{scopedTasks.length}</strong>
                        </div>
                        <div className={styles.masterInsightsStoryStat}>
                          <span>Идэвхтэй хувь</span>
                          <strong>{openProjectShare}%</strong>
                        </div>
                      </div>

                      <div className={styles.masterInsightsDelta}>
                        <span>Харьцуулалт</span>
                        <strong>{progressGapLabel}</strong>
                      </div>
                    </article>
                  </div>
                </div>
              ) : null}

              {showAutoBaseFleet ? (
                fleetLoadError ? (
                  <div className={styles.emptyColumnState}>{fleetLoadError}</div>
                ) : fleetBoard ? (
                  <AutoBaseBoard
                    board={fleetBoard}
                    initialVehicleId={
                      Number.isFinite(selectedAutoBaseVehicleId) && selectedAutoBaseVehicleId > 0
                        ? selectedAutoBaseVehicleId
                        : null
                    }
                    notice={autoBaseNotice}
                    error={autoBaseError}
                  />
                ) : (
                  <div className={styles.emptyColumnState}>
                    Авто баазын машин техникийн мэдээлэл олдсонгүй.
                  </div>
                )
              ) : showAutoBaseCombined ? (
                <div className={styles.unitProjectSections}>
                  <section className={styles.unitProjectSection}>
                    <div className={styles.unitProjectSectionHeader}>
                      <div>
                        <span className={styles.unitProjectSectionKicker}>Захирамж, үүрэг даалгаврын жагсаалт</span>
                        <h3>Хог тээвэрлэлт болон бүртгэлтэй ажил</h3>
                        <p>Энэ хэлтэст бүртгэлтэй project ажлууд.</p>
                      </div>
                      <strong>{activeProjects.length}</strong>
                    </div>

                    {activeProjects.length ? (
                      <div className={styles.reviewList}>
                        {activeProjects.map((project) => (
                          <ProjectListRow
                            key={project.id}
                            project={project}
                            taskCount={resolveProjectTasks(project).length}
                            href={buildProjectHref(project.href)}
                            actionLabel={projectCardLabel}
                            hideDepartment={hideDepartmentInProjectCards}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyColumnState}>
                        Одоогоор энэ хэлтэс дээр бүртгэлтэй ажил алга байна.
                      </div>
                    )}
                  </section>

                  <section className={styles.unitProjectSection}>
                    <div className={styles.unitProjectSectionHeader}>
                      <div>
                        <span className={styles.unitProjectSectionKicker}>Авто баазын засвар</span>
                        <h3>Засвартай машинууд</h3>
                        <p>Худалдан авалт биш, авто бааз дээр засвартай байгаа машинууд.</p>
                      </div>
                      <strong>{autoBaseRepairVehicles.length}</strong>
                    </div>

                    {fleetLoadError ? (
                      <div className={styles.emptyColumnState}>{fleetLoadError}</div>
                    ) : autoBaseRepairVehicles.length ? (
                      <div className={dashboardStyles.inspectorVehicleScroller}>
                        {autoBaseRepairVehicles.map((vehicle) => (
                          <AutoBaseRepairVehicleCard key={vehicle.id} vehicle={vehicle} />
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyColumnState}>
                        Авто бааз дээр засвартай машин одоогоор алга.
                      </div>
                    )}
                  </section>
                </div>
              ) : shouldShowGreenServiceSections ? (
                <div className={styles.unitProjectSections}>
                  {greenServiceProjectSections.map((section) => (
                    <section key={section.label} className={styles.unitProjectSection}>
                      <div className={styles.unitProjectSectionHeader}>
                        <div>
                          <span className={styles.unitProjectSectionKicker}>Доторх хэсэг</span>
                          <h3>{section.label}</h3>
                          <p>{section.note}</p>
                        </div>
                        <strong>{section.projects.length}</strong>
                      </div>

                      {section.projects.length ? (
                        <div className={styles.reviewList}>
                          {section.projects.map((project) => (
                            <ProjectListRow
                              key={project.id}
                              project={project}
                              taskCount={resolveProjectTasks(project).length}
                              href={buildProjectHref(project.href)}
                              actionLabel={projectCardLabel}
                              hideDepartment={hideDepartmentInProjectCards}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className={styles.emptyColumnState}>
                          Одоогоор {section.label} дээр энэ ангиллын ажил алга байна.
                        </div>
                      )}
                    </section>
                  ))}

                  {uncategorizedGreenServiceProjects.length ? (
                    <section className={styles.unitProjectSection}>
                      <div className={styles.unitProjectSectionHeader}>
                        <div>
                          <span className={styles.unitProjectSectionKicker}>Нэмэлт</span>
                          <h3>Бусад ажил</h3>
                          <p>Доторх хэсэг нь тодорхойгүй бүртгэлүүд</p>
                        </div>
                        <strong>{uncategorizedGreenServiceProjects.length}</strong>
                      </div>

                      <div className={styles.reviewList}>
                        {uncategorizedGreenServiceProjects.map((project) => (
                          <ProjectListRow
                            key={project.id}
                            project={project}
                            taskCount={resolveProjectTasks(project).length}
                            href={buildProjectHref(project.href)}
                            actionLabel={projectCardLabel}
                            hideDepartment={hideDepartmentInProjectCards}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : activeProjects.length ? (
                <div className={styles.reviewList}>
                  {activeProjects.map((project) => (
                    <ProjectListRow
                      key={project.id}
                      project={project}
                      taskCount={resolveProjectTasks(project).length}
                      href={buildProjectHref(project.href)}
                      actionLabel={projectCardLabel}
                      hideDepartment={hideDepartmentInProjectCards}
                    />
                  ))}
                </div>
              ) : (
                <div className={styles.emptyColumnState}>
                  Одоогоор {selectedDepartmentName} дээр энэ ангиллын ажил алга байна.
                </div>
              )}
            </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
