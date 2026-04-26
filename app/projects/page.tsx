import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { AutoBaseBoard } from "@/app/auto-base/auto-base-board";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import styles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { filterByDepartment, getTodayDateKey, pickPrimaryDepartmentName } from "@/lib/dashboard-scope";
import {
  findDepartmentGroupByName,
  findDepartmentGroupByUnit,
  getAvailableUnits,
  matchesDepartmentGroup,
} from "@/lib/department-groups";
import { type DashboardSnapshot, loadFleetVehicleBoard, loadMunicipalSnapshot } from "@/lib/odoo";

type PageProps = {
  searchParams?: Promise<{
    department?: string | string[];
    category?: string | string[];
    unit?: string | string[];
    quickAction?: string | string[];
  }>;
};

type ProjectFilterKey = "all" | "progress" | "planned";
type QuickActionMode = "task" | "report" | "none";
type ProjectCardItem = DashboardSnapshot["projects"][number];

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

function matchesUnitScope(unitName: string, departmentName?: string | null, projectName?: string | null) {
  const normalizedUnit = normalizeUnitText(unitName);
  const normalizedDepartment = normalizeUnitText(departmentName);
  const normalizedProject = normalizeUnitText(projectName);
  const searchText = `${normalizedDepartment} ${normalizedProject}`.trim();

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
      ? normalizedProject
      : searchText;

  return greenServiceUnit.aliases.some((alias) => unitSearchText.includes(normalizeUnitText(alias)));
}

function ProjectCardLink({
  project,
  href,
  actionLabel,
}: {
  project: ProjectCardItem;
  href: string;
  actionLabel: string;
}) {
  return (
    <Link href={href} className={styles.projectCard}>
      <div className={styles.projectCardTop}>
        <span>{project.deadline}</span>
        <StagePill label={project.stageLabel} bucket={project.stageBucket} />
      </div>

      <h3>{project.name}</h3>
      <p>
        Алба нэгж: {project.departmentName} · Менежер: {project.manager}
      </p>

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

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (isWorkerOnly(session)) {
    redirect("/");
  }
  const snapshot = await loadMunicipalSnapshot({
    login: session.login,
    password: session.password,
  });

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const masterMode = isMasterRole(session.role);

  const params = (await searchParams) ?? {};
  const requestedDepartment = getDepartmentParam(params.department);
  const requestedUnit = getDepartmentParam(params.unit);
  const activeFilter = normalizeProjectFilter(getDepartmentParam(params.category));
  const quickActionMode = normalizeQuickAction(getDepartmentParam(params.quickAction));
  const masterDepartmentName = masterMode
    ? pickPrimaryDepartmentName({
        taskDirectory: snapshot.taskDirectory,
        reports: snapshot.reports,
        projects: snapshot.projects,
        departments: snapshot.departments,
      })
    : null;

  const detectedGroup =
    !masterMode && requestedDepartment && requestedDepartment !== "all"
      ? findDepartmentGroupByName(requestedDepartment) ??
        findDepartmentGroupByUnit(requestedDepartment)
      : null;

  const selectedGroup = detectedGroup;
  const availableUnits = selectedGroup ? getAvailableUnits(selectedGroup) : [];

  const selectedUnit =
    requestedUnit && availableUnits.includes(requestedUnit)
      ? requestedUnit
      : requestedDepartment && availableUnits.includes(requestedDepartment)
        ? requestedDepartment
        : "";
  const isAutoBaseView =
    !masterMode &&
    selectedGroup?.name === AUTO_BASE_GROUP_NAME;
  const showAutoBaseFleet = isAutoBaseView && selectedUnit === AUTO_BASE_UNIT_NAME;
  let fleetBoard: Awaited<ReturnType<typeof loadFleetVehicleBoard>> | null = null;
  let fleetLoadError = "";

  if (isAutoBaseView) {
    try {
      fleetBoard = await loadFleetVehicleBoard({
        login: session.login,
        password: session.password,
      });
    } catch (error) {
      console.error("Fleet vehicle board could not be loaded for projects auto-base view:", error);
      fleetLoadError =
        "Авто баазын машины жагсаалтыг Odoo Fleet-ээс уншиж чадсангүй. Fleet эрх болон Odoo холболтын тохиргоог шалгана уу.";
    }
  }

  const scopedProjects = (masterMode
    ? filterByDepartment(snapshot.projects, masterDepartmentName)
    : snapshot.projects.filter((project) => {
        if (selectedUnit) {
          return matchesUnitScope(selectedUnit, project.departmentName, project.name);
        }
        if (selectedGroup) {
          return matchesDepartmentGroup(selectedGroup, project.departmentName);
        }
        return true;
      })
  ).sort((left, right) => {
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
  const scopedTasks = masterMode
    ? filterByDepartment(snapshot.taskDirectory, masterDepartmentName)
    : snapshot.taskDirectory.filter((task) => {
        if (selectedUnit) {
          return matchesUnitScope(selectedUnit, task.departmentName, task.projectName);
        }
        if (selectedGroup) {
          return matchesDepartmentGroup(selectedGroup, task.departmentName);
        }
        return true;
      });

  const activeProjects = masterMode
    ? scopedProjects
    : scopedProjects.filter((project) => {
        if (activeFilter === "all") {
          return true;
        }

        if (activeFilter === "progress") {
          return project.stageBucket === "progress" || project.stageBucket === "review";
        }

        return project.stageBucket === "todo" || project.stageBucket === "unknown";
      });

  const selectedDepartmentName = masterMode
    ? masterDepartmentName ?? "Миний алба нэгж"
    : selectedUnit || selectedGroup?.name || "Бүх хэлтэс";

  const projectCounts = {
    all: scopedProjects.length,
    progress: scopedProjects.filter(
      (project) => project.stageBucket === "progress" || project.stageBucket === "review",
    ).length,
    planned: scopedProjects.filter(
      (project) => project.stageBucket === "todo" || project.stageBucket === "unknown",
    ).length,
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
      label: "Ажилбарын явц",
      value: averageTaskProgress,
      note: "Нээлттэй ажилбарын бодит явц.",
      cardClass: styles.masterInsightsProgressCardTask,
      unitLabel: "Ажилбар",
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
      label: "Нийт ажилбар",
      value: String(scopedTasks.length),
      note: "Бүх ажилбарын нийлбэр",
    },
    {
      label: "Нээлттэй ажилбар",
      value: String(totalOpenTaskCount),
      note: "Хаагдаагүй ажилбар",
    },
  ] as const;
  const progressGap = averageTaskProgress - averageProjectCompletion;
  const progressGapLabel =
    progressGap === 0
      ? "Ажил, ажилбарын явц ижил түвшинд байна."
      : progressGap > 0
        ? `Ажилбарын явц ажлынхаас ${progressGap}% өндөр байна.`
        : `Ажлын явц ажилбарынхаас ${Math.abs(progressGap)}% өндөр байна.`;
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
      note: "Хугацаа өнгөрсөн ажилбартай ажил",
      icon: "!",
      tone: styles.summaryCardUrgent,
      href: buildScopedListHref("all"),
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
  const visibleSummaryCards = summaryCards;

  const filterTitle =
    activeFilter === "progress"
      ? "Гүйцэтгэж байгаа"
      : activeFilter === "planned"
        ? "Төлөвлөсөн"
        : "Нийт ажил";

  const filterNote =
    activeFilter === "progress"
      ? "Одоо хэрэгжиж байгаа болон хяналтын шатанд явж буй ажлуудыг харуулна"
      : activeFilter === "planned"
        ? "Одоогоор эхлээгүй, төлөвлөсөн шатанд байгаа ажлуудыг харуулна"
        : "Сонгосон алба нэгжийн бүх ажлыг нэг дор харуулна";
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
      ? "Эхлээд ажил сонгоод тухайн ажлын дотор шинэ ажилбар нэмнэ."
      : quickActionMode === "report"
        ? "Эхлээд ажил сонгоод, дараа нь ажилбар дээрээс тайлан оруулна."
        : "";
  const sectionNote =
    quickActionMode === "task"
      ? "Ажил сонгоод дармагц ажилбар нэмэх цонх руу орно."
      : quickActionMode === "report"
        ? "Ажил сонгоод доторх ажилбараас тайлан оруулах урсгал руу орно."
        : masterMode
          ? "Ажил дээр дарахад тухайн ажлаас шинэ ажилбар нээх болон өнөөдрийн урсгал руу орно."
          : "Ажил дээр дарахад тухайн ажлын ажилбарууд нээгдэнэ";
  const projectCardLabel =
    quickActionMode === "task"
      ? "Энэ ажил дээр ажилбар нэмэх"
      : quickActionMode === "report"
        ? "Ажилбар сонгох"
        : "Ажлын ажилбар харах";
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
        matchesUnitScope(item.label, project.departmentName, project.name),
      );

      if (section) {
        section.projects.push(project);
      } else {
        uncategorizedGreenServiceProjects.push(project);
      }
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.container} id="projects-top">
        <div className={styles.contentWithMenu}>
          <aside className={styles.menuColumn}>
            <AppMenu
              active={masterMode ? "dashboard" : isAutoBaseView ? "auto-base" : "projects"}
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              masterMode={masterMode}
            />
          </aside>

          <div className={styles.pageContent}>
            <WorkspaceHeader
              title={masterMode ? "Хяналтын самбар" : "Ажлын самбар"}
              subtitle={selectedDepartmentName}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={
                showAutoBaseFleet && fleetBoard ? fleetBoard.totalVehicles : scopedProjects.length
              }
              notificationNote={
                showAutoBaseFleet && fleetBoard
                  ? `${fleetBoard.totalVehicles} машин Odoo Fleet дээр бүртгэлтэй байна`
                  : `${scopedProjects.length} ажил, төсөл энэ хүрээнд байна`
              }
            />

            <section className={styles.summaryShowcaseGrid} aria-label="Нийт үзүүлэлт">
              {visibleSummaryCards.map((card) => (
                <Link
                  key={card.label}
                  href={card.href}
                  className={`${styles.summaryShowcaseCard} ${card.tone}`}
                >
                  <div className={styles.summaryShowcaseCopy}>
                    <span className={styles.summaryShowcaseLabel}>{card.label}</span>
                    <strong className={styles.summaryShowcaseValue}>{card.value}</strong>
                  </div>
                  <span className={styles.summaryShowcaseIcon} aria-hidden>
                    {card.icon}
                  </span>
                  <div className={styles.summaryShowcaseMeta}>
                    <b>{card.delta}</b>
                    <small>{card.note}</small>
                  </div>
                </Link>
              ))}
            </section>

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
                    if (activeFilter !== "all") {
                      hrefParams.set("category", activeFilter);
                    }
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
                              matchesDepartmentGroup(selectedGroup, project.departmentName),
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
                    if (activeFilter !== "all") {
                      hrefParams.set("category", activeFilter);
                    }
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
                            ? fleetBoard.totalVehicles
                            : snapshot.projects.filter((project) =>
                                matchesDepartmentGroup(selectedGroup, project.departmentName) &&
                                matchesUnitScope(unit, project.departmentName, project.name),
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
                    {showAutoBaseFleet ? "Машины жагсаалт" : masterMode ? "Нэгжийн ажил" : "Ажлын жагсаалт"}
                  </span>
                  <h2>{showAutoBaseFleet ? "Бүх машин" : masterMode ? selectedDepartmentName : filterTitle}</h2>
                  <small className={styles.sectionNote}>
                    {showAutoBaseFleet
                      ? "Odoo Fleet дээр бүртгэлтэй авто баазын бүх машиныг харуулна"
                      : masterMode
                        ? sectionNote
                        : `${selectedDepartmentName} · ${filterNote}`}
                  </small>
                </div>
                {!masterMode && !showAutoBaseFleet ? (
                  <Link href={calendarPlanHref} className={styles.secondaryButton}>
                    Календар төлөвлөгөө
                  </Link>
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
                          Ажил, ажилбарын явц болон төлөвийн бүтцийг нэг дор харуулна.
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
                        Ачаалал, хяналтын шат, нээлттэй ажилбарын байдлыг товч харуулна.
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
                          <strong>Ажилбарын ачаалал</strong>
                          <span>
                            {scopedTasks.length} ажилбараас {totalOpenTaskCount} нь нээлттэй байна.
                          </span>
                        </div>
                      </div>

                      <div className={styles.masterInsightsStoryStats}>
                        <div className={styles.masterInsightsStoryStat}>
                          <span>Нээлттэй</span>
                          <strong>{totalOpenTaskCount}</strong>
                        </div>
                        <div className={styles.masterInsightsStoryStat}>
                          <span>Нийт ажилбар</span>
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
                ) : fleetBoard ? (
                  <AutoBaseBoard board={fleetBoard} />
                ) : (
                  <div className={styles.emptyColumnState}>
                    Авто баазын машины жагсаалт Odoo-оос ирээгүй байна.
                  </div>
                )
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
                              Алба нэгж: {project.departmentName} · Менежер:{" "}
                              {project.manager}
                            </p>
                          </div>

                          <div className={styles.reviewMeta}>
                            <strong>{project.openTasks}</strong>
                            <span>Нээлттэй ажилбар</span>
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
