import { type ComponentProps, Suspense } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Truck } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { LoadingShell } from "@/app/_components/loading-shell";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import dashboardStyles from "@/app/dashboard-view.module.css";
import styles from "@/app/workspace.module.css";
import {
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment, getTodayDateKey } from "@/lib/dashboard-scope";
import {
  findDepartmentGroupByName,
  findDepartmentGroupByUnit,
  getAvailableUnits,
  matchesDepartmentGroup,
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

type PageProps = {
  searchParams?: Promise<{
    department?: string | string[];
    category?: string | string[];
    unit?: string | string[];
    quickAction?: string | string[];
  }>;
};

type ProjectFilterKey = "all" | "progress" | "planned" | "overdue";
type QuickActionMode = "task" | "report" | "none";
type ProjectCardItem = DashboardSnapshot["projects"][number];
type ProjectsSession = Awaited<ReturnType<typeof requireSession>>;
type ProjectsAppMenuProps = ComponentProps<typeof AppMenu>;
type ProjectsWorkspaceHeaderProps = ComponentProps<typeof WorkspaceHeader>;
const AUTO_BASE_GROUP_NAME = "Авто бааз, хог тээвэрлэлтийн хэлтэс";
const AUTO_BASE_UNIT_NAME = "Авто бааз";
const GREEN_SERVICE_GROUP_NAME = "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс";
const GREEN_SERVICE_UNITS = [
  {
    label: "Ногоон байгууламж",
    note: "Мод, зүлэг, ногоон байгууламжийн арчилгаа болон тохижилтын ажил",
    aliases: ["Ногоон байгууламж", "ногоон", "мод", "зүлэг", "ургамал", "усалгаа", "цэцэрлэг"],
  },
  {
    label: "Цэвэрлэгээ үйлчилгээ",
    note: "Зам талбай, нийтийн эзэмшлийн орчны цэвэрлэгээ үйлчилгээний ажил",
    aliases: ["Цэвэрлэгээ үйлчилгээ", "Зам талбайн цэвэрлэгээ", "цэвэрл", "зам талбай", "гудамж"],
  },
] as const;
const PROJECT_FILTERS: Array<{ key: ProjectFilterKey; label: string }> = [
  { key: "all", label: "Нийт ажил" },
  { key: "progress", label: "Гүйцэтгэж байгаа" },
  { key: "planned", label: "Төлөвлөсөн" },
  { key: "overdue", label: "Хугацаа хэтэрсэн" },
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

function normalizeProjectFilter(value: string): ProjectFilterKey {
  return PROJECT_FILTERS.some((item) => item.key === value) ? (value as ProjectFilterKey) : "all";
}

function normalizeQuickAction(value: string): QuickActionMode {
  if (value === "task" || value === "report") {
    return value;
  }

  return "none";
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

function ProjectCardLink({
  project,
  href,
  actionLabel,
  hideDepartment = false,
}: {
  project: ProjectCardItem;
  href: string;
  actionLabel: string;
  hideDepartment?: boolean;
}) {
  const managerTitle = project.managerJobTitle || "Хариуцсан ажилтан";
  const metaParts = [
    hideDepartment ? null : `Алба нэгж: ${project.departmentName}`,
    `${managerTitle}: ${project.manager}`,
    project.operationTypeLabel,
  ].filter(Boolean);

  return (
    <Link href={href} className={styles.projectCard}>
      <div className={styles.projectCardTop}>
        <span>{project.deadline}</span>
        <StagePill label={project.stageLabel} bucket={project.stageBucket} />
      </div>

      <h3>{project.name}</h3>
      <p>{metaParts.join(" · ")}</p>

      <div className={styles.projectMeta}>
        <div>
          <span>Нээлттэй ажил</span>
          <strong>{project.openTasks}</strong>
        </div>
        <div>
          <span>Гүйцэтгэл</span>
          <strong>{project.completion}%</strong>
        </div>
      </div>

      <div className={styles.progressTrack}>
        <span style={{ width: `${project.completion}%` }} />
      </div>

      <div className={styles.cardFooter}>
        <span className={styles.cardLinkLabel}>{actionLabel}</span>
        <strong aria-hidden>→</strong>
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

  const detectedGroup =
    departmentScopedMode
      ? findDepartmentGroupByName(scopedDepartmentName ?? "") ??
        findDepartmentGroupByUnit(scopedDepartmentName ?? "")
      : requestedDepartment && requestedDepartment !== "all"
        ? findDepartmentGroupByName(requestedDepartment) ??
          findDepartmentGroupByUnit(requestedDepartment)
        : null;

  const selectedGroup = detectedGroup;
  if (selectedGroup) {
    activeFilter = "all";
  }
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
  let fleetBoard: Awaited<ReturnType<typeof loadFleetVehicleBoard>> | null = null;
  let fleetLoadError = "";

  if (isAutoBaseView) {
    try {
      fleetBoard = await loadFleetVehicleBoard(connectionOverrides);
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

  let scopedProjects = snapshot.projects.filter((project) => {
    const projectSearchText =
      `${project.operationTypeLabel ?? ""} ${projectTaskSearchByName.get(project.name) ?? ""}`;

    if (selectedUnit) {
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
      return filterByDepartment([task], scopedDepartmentName).length > 0;
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

  const activeProjects = masterMode
    ? scopedProjects
    : scopedProjects.filter((project) => {
        if (activeFilter === "all") {
          return true;
        }

        if (activeFilter === "progress") {
          return project.stageBucket === "progress" || project.stageBucket === "review";
        }

        if (activeFilter === "overdue") {
          return overdueProjectNames.has(project.name);
        }

        return project.stageBucket === "todo" || project.stageBucket === "unknown";
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
    progress: scopedProjects.filter(
      (project) => project.stageBucket === "progress" || project.stageBucket === "review",
    ).length,
    planned: scopedProjects.filter(
      (project) => project.stageBucket === "todo" || project.stageBucket === "unknown",
    ).length,
    overdue: scopedProjects.filter((project) => overdueProjectNames.has(project.name)).length,
  } satisfies Record<ProjectFilterKey, number>;

  const reviewProjectsCount = scopedProjects.filter(
    (project) => project.stageBucket === "review",
  ).length;
  const activeStageProjectsCount = scopedProjects.filter(
    (project) => project.stageBucket === "progress",
  ).length;
  const doneProjectsCount = scopedProjects.filter(
    (project) => project.stageBucket === "done",
  ).length;
  const overdueProjectsCount = scopedProjects.filter((project) =>
    overdueProjectNames.has(project.name),
  ).length;
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
  const activeProjectShare = scopedProjects.length
    ? Math.round((projectCounts.progress / scopedProjects.length) * 100)
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
      key: "progress",
      label: "Явж буй ажил",
      count: activeStageProjectsCount,
      note: "Талбай дээр яваа ажил",
      share: scopedProjects.length
        ? Math.round((activeStageProjectsCount / scopedProjects.length) * 100)
        : 0,
      toneClass: styles.masterInsightsStatusProgress,
    },
    {
      key: "review",
      label: "Шалгагдаж буй ажил",
      count: reviewProjectsCount,
      note: "Баталгаажуулалт хүлээж буй",
      share: scopedProjects.length
        ? Math.round((reviewProjectsCount / scopedProjects.length) * 100)
        : 0,
      toneClass: styles.masterInsightsStatusReview,
    },
    {
      key: "planned",
      label: "Төлөвлөсөн ажил",
      count: projectCounts.planned,
      note: "Эхлээгүй эсвэл хүлээгдэж буй",
      share: scopedProjects.length
        ? Math.round((projectCounts.planned / scopedProjects.length) * 100)
        : 0,
      toneClass: styles.masterInsightsStatusPlanned,
    },
  ] as const;
  const insightSummaryCards = [
    {
      label: "Нийт ажил",
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
  const buildScopedListHref = (filter: ProjectFilterKey) => {
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

    return `/projects${hrefParams.toString() ? `?${hrefParams.toString()}` : ""}`;
  };
  const summaryCards = [
    {
      label: "Нийт ажил",
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
      note: "Эхлээгүй эсвэл хүлээгдэж буй ажил",
      icon: "Т",
      tone: styles.summaryCardSoft,
      href: buildScopedListHref("planned"),
    },
    {
      label: "Гүйцэтгэж байгаа",
      value: String(activeStageProjectsCount),
      delta: formatShare(activeStageProjectsCount, scopedProjects.length),
      note: "Яг одоо явж байгаа ажил",
      icon: "Г",
      tone: styles.summaryCardActive,
      href: buildScopedListHref("progress"),
    },
    {
      label: "Хянаж байгаа",
      value: String(reviewProjectsCount),
      delta: formatShare(reviewProjectsCount, scopedProjects.length),
      note: "Баталгаажуулалт хүлээж буй ажил",
      icon: "Х",
      tone: styles.summaryCardReview,
      href: buildScopedListHref("progress"),
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
      href: buildScopedListHref("all"),
    },
  ] as const;
  void summaryCards;

  const filterTitle =
    activeFilter === "progress"
      ? "Гүйцэтгэж байгаа"
      : activeFilter === "overdue"
        ? "Хугацаа хэтэрсэн"
      : activeFilter === "planned"
        ? "Төлөвлөсөн"
        : "Бүх ажил";

  const filterNote =
    activeFilter === "progress"
      ? "Одоо хэрэгжиж байгаа болон хяналтын шатанд явж буй ажлуудыг харуулна"
      : activeFilter === "overdue"
        ? "Хугацаа өнгөрсөн даалгавартай ажлуудыг харуулна"
      : activeFilter === "planned"
        ? "Одоогоор эхлээгүй, төлөвлөсөн шатанд байгаа ажлуудыг харуулна"
        : "Сонгосон алба нэгжийн шинээр үүссэн, төлөвлөсөн, идэвхтэй болон дууссан бүх ажил харагдана";
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
        : "Ажлын даалгавар харах";
  const buildProjectHref = (projectHref: string) => {
    if (quickActionMode === "none") {
      return projectHref;
    }

    const hrefParams = new URLSearchParams();
    hrefParams.set("quickAction", quickActionMode);
    hrefParams.set("returnTo", selectionReturnTo);
    return `${projectHref}?${hrefParams.toString()}`;
  };
  const calendarPlanParams = new URLSearchParams();
  if (selectedUnit || selectedGroup?.name) {
    calendarPlanParams.set("department", selectedUnit || selectedGroup?.name || "");
  }
  const calendarPlanHref = `/tasks${
    calendarPlanParams.toString() ? `?${calendarPlanParams.toString()}` : ""
  }`;
  const newWorkParams = new URLSearchParams();
  if (selectedUnit || selectedGroup?.name) {
    newWorkParams.set("department", selectedUnit || selectedGroup?.name || "");
  }
  const newWorkHref = `/projects/new${
    newWorkParams.toString() ? `?${newWorkParams.toString()}` : ""
  }`;
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
    active: transportInspectorMode ? "projects" : masterMode ? "dashboard" : "projects",
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
    title: isOverdueFilter ? "Хугацаа хэтэрсэн ажил" : masterMode ? "Хяналтын самбар" : "Ажлын самбар",
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

            {!masterMode && !showAutoBaseFleet && !isOverdueFilter ? (
              <div className={styles.buttonRow}>
                {canCreateProject ? (
                  <Link href={newWorkHref} className={styles.primaryButton}>
                    Ажил нэмэх
                  </Link>
                ) : null}
                <Link href={calendarPlanHref} className={styles.secondaryButton}>
                  Календарь төлөвлөгөө
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
                </div>

                <div className={styles.taskFilterRail}>
                  {(() => {
                    const hrefParams = new URLSearchParams();
                    hrefParams.set("department", selectedGroup.name);
                    if (quickActionMode !== "none") {
                      hrefParams.set("quickAction", quickActionMode);
                    }

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
                            ).length +
                              (selectedGroup.name === AUTO_BASE_GROUP_NAME
                                ? autoBaseRepairVehicles.length
                                : 0)
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
                          {unit === AUTO_BASE_UNIT_NAME && fleetBoard
                            ? autoBaseRepairVehicles.length
                            : snapshot.projects.filter((project) =>
                                matchesUnitScope(
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
                </div>
              </section>
            ) : null}

            <section className={`${styles.workspaceSection} ${styles.dashboardWorkspaceSection}`}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionKicker}>
                    {showAutoBaseFleet ? "Авто баазын засвар" : masterMode ? masterProjectSectionLabel : "Ажлын жагсаалт"}
                  </span>
                  <h2>{showAutoBaseFleet ? "Засвартай машинууд" : masterMode ? selectedDepartmentName : filterTitle}</h2>
                  <small className={styles.sectionNote}>
                    {showAutoBaseFleet
                      ? "Авто баазын засвартай машинуудыг хяналтын самбарын машин карт шиг харуулна."
                      : masterMode
                        ? masterProjectSectionNote
                        : `${selectedDepartmentName} · ${filterNote}`}
                  </small>
                </div>
                {false && !masterMode && !showAutoBaseFleet ? (
                  <div className={styles.buttonRow}>
                    {canCreateProject ? (
                      <Link href={newWorkHref} className={styles.primaryButton}>
                        Ажил нэмэх
                      </Link>
                    ) : null}
                    <Link href={calendarPlanHref} className={styles.secondaryButton}>
                      Календар төлөвлөгөө
                    </Link>
                  </div>
                ) : null}
              </div>

              {!showAutoBaseFleet && masterMode ? (
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
                        <span>Идэвхтэй ажил</span>
                        <strong>{projectCounts.progress}</strong>
                        <small>{scopedProjects.length} ажлаас яг одоо идэвхтэй нь</small>
                        <div className={styles.masterInsightsHighlightMeta}>
                          <span>Нээлттэй {totalOpenTaskCount}</span>
                          <span>Идэвхтэй {activeProjectShare}%</span>
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
                          <strong>Идэвхтэй урсгал</strong>
                          <span>
                            {scopedProjects.length} ажлаас {projectCounts.progress} нь идэвхтэй байна.
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
                          <strong>{activeProjectShare}%</strong>
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
                )
              ) : showAutoBaseCombined ? (
                <div className={styles.unitProjectSections}>
                  <section className={styles.unitProjectSection}>
                    <div className={styles.unitProjectSectionHeader}>
                      <div>
                        <span className={styles.unitProjectSectionKicker}>Ажлын жагсаалт</span>
                        <h3>Хог тээвэрлэлт болон бүртгэлтэй ажил</h3>
                        <p>Энэ хэлтэст бүртгэлтэй project ажлууд.</p>
                      </div>
                      <strong>{activeProjects.length}</strong>
                    </div>

                    {activeProjects.length ? (
                      <div className={styles.projectRail}>
                        {activeProjects.map((project) => (
                          <ProjectCardLink
                            key={project.id}
                            project={project}
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
                        <div className={styles.projectRail}>
                          {section.projects.map((project) => (
                            <ProjectCardLink
                              key={project.id}
                              project={project}
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

                      <div className={styles.projectRail}>
                        {uncategorizedGreenServiceProjects.map((project) => (
                          <ProjectCardLink
                            key={project.id}
                            project={project}
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
                <>
                  {masterMode ? (
                    <div className={styles.reviewList}>
                      {activeProjects.map((project) => (
                        <Link
                          key={project.id}
                          href={buildProjectHref(project.href)}
                          className={styles.reviewItem}
                        >
                          <div className={styles.projectListRowMain}>
                            <div className={styles.projectListRowTop}>
                              <h3>{project.name}</h3>
                              <StagePill
                                label={project.stageLabel}
                                bucket={project.stageBucket}
                              />
                            </div>
                            <p>
                              {[
                                `${project.managerJobTitle || "Хариуцсан ажилтан"}: ${project.manager}`,
                                project.operationTypeLabel,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
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
                      ))}
                    </div>
                  ) : (
                    <div className={styles.projectRail}>
                      {activeProjects.map((project) => (
                        <ProjectCardLink
                          key={project.id}
                          project={project}
                          href={buildProjectHref(project.href)}
                          actionLabel={projectCardLabel}
                          hideDepartment={hideDepartmentInProjectCards}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.emptyColumnState}>
                  Одоогоор {selectedDepartmentName} дээр энэ ангиллын ажил алга байна.
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
