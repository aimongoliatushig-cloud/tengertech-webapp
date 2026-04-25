import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import styles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { filterByDepartment, pickPrimaryDepartmentName } from "@/lib/dashboard-scope";
import {
  DEPARTMENT_GROUPS,
  findDepartmentGroupByName,
  findDepartmentGroupByUnit,
  getAvailableUnits,
  matchesDepartmentGroup,
} from "@/lib/department-groups";
import { loadMunicipalSnapshot } from "@/lib/odoo";

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
const PROJECT_FILTERS: Array<{ key: ProjectFilterKey; label: string }> = [
  { key: "all", label: "Бүгд" },
  { key: "progress", label: "Явагдаж буй ажил" },
  { key: "planned", label: "Төлөвлөж буй ажил" },
];

/* legacy department groups kept commented during shared helper migration
  {
    name: "Авто бааз, хог тээвэрлэлтийн хэлтэс",
    units: ["Авто бааз", "Хог тээвэрлэлт"],
    icon: "🚚",
  },
  {
    name: "Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс",
    units: ["Ногоон байгууламж", "Зам талбайн цэвэрлэгээ"],
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

/* local group helpers removed in favor of shared lib helpers */

function getDepartmentBadge(groupName: string, units: string[] = []) {
  const unitBadge = units
    .map((unit) => unit.trim()[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  if (unitBadge) {
    return unitBadge.toLocaleUpperCase("mn-MN");
  }

  return groupName
    .split(/[\s,]+/)
    .map((part) => part.trim()[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("mn-MN");
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
        : selectedGroup && availableUnits.length > 1
          ? (availableUnits[0] ?? "")
          : "";
  const isAutoBaseView =
    !masterMode && (requestedDepartment === "Авто бааз" || requestedUnit === "Авто бааз");

  const scopedProjects = (masterMode
    ? filterByDepartment(snapshot.projects, masterDepartmentName)
    : snapshot.projects.filter((project) => {
        if (selectedUnit) {
          return project.departmentName === selectedUnit;
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
    : [];

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
  const weightedCompletion = scopedProjects.length
    ? Math.round(
        totalOpenTaskCount > 0
          ? scopedProjects.reduce(
              (sum, project) => sum + project.completion * project.openTasks,
              0,
            ) / totalOpenTaskCount
          : scopedProjects.reduce((sum, project) => sum + project.completion, 0) /
              scopedProjects.length,
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
  const summaryCards = [
    {
      label: "Нийт ажил",
      value: String(scopedProjects.length),
      note: "Энэ нэгж дээр бүртгэлтэй бүх ажил",
      icon: "А",
      tone: styles.summaryCardSoft,
    },
    {
      label: "Идэвхтэй ажил",
      value: String(projectCounts.progress),
      note: "Яг одоо явж байгаа болон хяналтын шаттай ажил",
      icon: "И",
      tone: styles.summaryCardActive,
    },
    {
      label: "Хяналтад буй ажил",
      value: String(reviewProjectsCount),
      note: "Баталгаажуулалт хүлээж буй ажил",
      icon: "Х",
      tone: styles.summaryCardReview,
    },
    {
      label: "Нийт гүйцэтгэл",
      value: `${weightedCompletion}%`,
      note: `${totalOpenTaskCount} нээлттэй ажилбарт тулгуурлан тооцсон`,
      icon: "Г",
      tone: styles.summaryCardPrimary,
    },
  ] as const;
  const visibleSummaryCards = masterMode
    ? [summaryCards[0], summaryCards[1], summaryCards[3]]
    : summaryCards;

  const filterTitle =
    activeFilter === "progress"
      ? "Явагдаж буй ажил"
      : activeFilter === "planned"
        ? "Төлөвлөж буй ажил"
        : "Бүх ажил";

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
  const allProjectsHref = `/projects${
    (() => {
      const hrefParams = new URLSearchParams();
      if (activeFilter !== "all") {
        hrefParams.set("category", activeFilter);
      }
      if (quickActionMode !== "none") {
        hrefParams.set("quickAction", quickActionMode);
      }
      return hrefParams.toString() ? `?${hrefParams.toString()}` : "";
    })()
  }`;
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
              title={masterMode ? "Нэгжийн ажил" : "Ажлын сан"}
              subtitle={
                masterMode
                  ? "Өнөөдөр явах ажил, төслийн нэгдсэн жагсаалт"
                  : "Ажлын ерөнхий жагсаалт болон шүүлт"
              }
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={scopedProjects.length}
              notificationNote={`${scopedProjects.length} ажил, төсөл энэ хүрээнд байна`}
            />

            {!masterMode ? (
              <section className={styles.workspaceSection}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span className={styles.sectionKicker}>Хэлтсийн цэс</span>
                    <h2>Хэлтэс сонгох</h2>
                    <small className={styles.sectionNote}>
                      Эхлээд хэлтэс сонгоно. Дараа нь тухайн хэлтэс доторх ажлыг тусад нь шүүж харуулна.
                    </small>
                  </div>
                </div>

                <nav className={styles.departmentSelector} aria-label="Хэлтэс сонгох цэс">
                  <div className={styles.departmentTabBar}>
                    <Link
                      href={allProjectsHref}
                      className={`${styles.departmentTab} ${
                        !selectedGroup ? styles.departmentTabActive : ""
                      }`}
                      aria-current={!selectedGroup ? "page" : undefined}
                    >
                      <span className={styles.departmentTabLabel}>
                        <span className={styles.departmentTabIcon} aria-hidden>
                          Б
                        </span>
                        <span>Бүгд</span>
                      </span>
                      <strong>{snapshot.projects.length}</strong>
                    </Link>

                    {DEPARTMENT_GROUPS.map((group) => {
                      const isActive = group.name === selectedGroup?.name;
                      const departmentProjects = snapshot.projects.filter(
                        (project) => matchesDepartmentGroup(group, project.departmentName),
                      );
                      const groupUnits = getAvailableUnits(group);
                      const hrefParams = new URLSearchParams();
                      hrefParams.set("department", group.name);
                      if (activeFilter !== "all") {
                        hrefParams.set("category", activeFilter);
                      }
                      if (quickActionMode !== "none") {
                        hrefParams.set("quickAction", quickActionMode);
                      }

                      return (
                        <Link
                          key={group.name}
                          href={`/projects?${
                            (() => {
                              const params = new URLSearchParams(hrefParams);
                              const defaultUnit = groupUnits[0] ?? "";
                              if (defaultUnit) {
                                params.set("unit", defaultUnit);
                              }
                              return params.toString();
                            })()
                          }`}
                          className={`${styles.departmentTab} ${
                            isActive ? styles.departmentTabActive : ""
                          }`}
                          aria-current={isActive ? "page" : undefined}
                        >
                          <span className={styles.departmentTabLabel}>
                            <span className={styles.departmentTabIcon} aria-hidden>
                              {getDepartmentBadge(group.name, group.units)}
                            </span>
                            <span>{group.name}</span>
                          </span>
                          <strong>{departmentProjects.length}</strong>
                        </Link>
                      );
                    })}
                  </div>
                </nav>
              </section>
            ) : null}

            {selectedGroup && availableUnits.length > 1 ? (
              <section className={styles.workspaceSection}>
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
                          {
                            snapshot.projects.filter((project) => project.departmentName === unit)
                              .length
                          }
                        </strong>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section className={styles.workspaceSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionKicker}>
                    {masterMode ? "Нэгжийн ажил" : "Хэлтсийн ангилал"}
                  </span>
                  <h2>{selectedDepartmentName}</h2>
                  <small className={styles.sectionNote}>
                    {sectionNote}
                  </small>
                </div>
              </div>

              {quickActionMessage ? (
                <div className={`${styles.message} ${styles.noticeMessage}`}>
                  {quickActionMessage}
                </div>
              ) : null}

              {masterMode ? (
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

              {!masterMode ? (
                <>
                  <div className={styles.summaryShowcaseGrid}>
                {visibleSummaryCards.map((card) => (
                  <article key={card.label} className={`${styles.summaryShowcaseCard} ${card.tone}`}>
                    <div className={styles.summaryShowcaseTop}>
                      <span className={styles.summaryShowcaseIcon} aria-hidden>
                        {card.icon}
                      </span>
                      <span className={styles.summaryShowcaseLabel}>{card.label}</span>
                    </div>
                    <strong className={styles.summaryShowcaseValue}>{card.value}</strong>
                    <small className={styles.summaryShowcaseNote}>{card.note}</small>
                    {card.label === "Нийт гүйцэтгэл" ? (
                      <div className={styles.summaryShowcaseTrack} aria-hidden>
                        <span
                          className={styles.summaryShowcaseFill}
                          style={{ width: `${Math.max(weightedCompletion, 6)}%` }}
                        />
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>

                  <div className={styles.taskFilterRail}>
                {PROJECT_FILTERS.map((filter) => {
                  const hrefParams = new URLSearchParams();
                  if (selectedGroup?.name) {
                    hrefParams.set("department", selectedGroup.name);
                  }
                  if (selectedUnit) {
                    hrefParams.set("unit", selectedUnit);
                  }
                  if (filter.key !== "all") {
                    hrefParams.set("category", filter.key);
                  }
                  if (quickActionMode !== "none") {
                    hrefParams.set("quickAction", quickActionMode);
                  }

                  return (
                    <Link
                      key={filter.key}
                      href={`/projects${hrefParams.toString() ? `?${hrefParams.toString()}` : ""}`}
                      className={`${styles.taskFilterChip} ${
                        activeFilter === filter.key ? styles.taskFilterChipActive : ""
                      }`}
                    >
                      <span>{filter.label}</span>
                      <strong>{projectCounts[filter.key]}</strong>
                    </Link>
                  );
                })}
                    </div>
                </>
              ) : null}

              {activeProjects.length ? (
                <>
                  {!masterMode ? (
                    <div className={styles.sectionHeader}>
                      <div>
                        <span className={styles.sectionKicker}>{filterTitle}</span>
                        <h2>{selectedDepartmentName}</h2>
                        <small className={styles.sectionNote}>{filterNote}</small>
                      </div>
                    </div>
                  ) : null}

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
                        <Link
                          key={project.id}
                          href={buildProjectHref(project.href)}
                          className={styles.projectCard}
                        >
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
                            <span className={styles.cardLinkLabel}>{projectCardLabel}</span>
                            <strong aria-hidden>→</strong>
                          </div>
                        </Link>
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
