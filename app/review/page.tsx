import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import dashboardStyles from "@/app/page.module.css";
import shellStyles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import {
  DEPARTMENT_GROUPS,
  findDepartmentGroupByName,
  findDepartmentGroupByUnit,
  getDepartmentGroupLabel,
  matchesDepartmentGroup,
} from "@/lib/department-groups";
import { loadMunicipalSnapshot } from "@/lib/odoo";

import reviewStyles from "./review.module.css";

type PageProps = {
  searchParams?: Promise<{
    department?: string | string[];
  }>;
};

type ReviewScope = {
  name: string;
  label: string;
  icon: string;
  accent: string;
  kind: "group" | "unit";
  totalTasks: number;
  activeTasks: number;
  reviewTasks: number;
  doneTasks: number;
  completion: number;
};

function getDepartmentParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
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
      ? dashboardStyles.stageProblem
      : bucket === "done"
      ? dashboardStyles.stageDone
      : bucket === "review"
        ? dashboardStyles.stageReview
        : bucket === "progress"
          ? dashboardStyles.stageProgress
          : dashboardStyles.stageTodo;

  return (
    <span
      className={`${dashboardStyles.stagePill} ${tone}`}
      aria-label={label}
      title={label}
    >
      {label}
    </span>
  );
}

function createUnitScope(
  name: string,
  fallback?: {
    label?: string;
    icon?: string;
    accent?: string;
  },
): ReviewScope {
  return {
    name,
    label: fallback?.label ?? name,
    icon: fallback?.icon ?? "🏢",
    accent: fallback?.accent ?? "var(--tone-slate)",
    kind: "unit",
    totalTasks: 0,
    activeTasks: 0,
    reviewTasks: 0,
    doneTasks: 0,
    completion: 0,
  };
}

function scopeMatches(scope: ReviewScope, departmentName?: string | null) {
  const normalized = (departmentName ?? "").trim();
  if (!normalized) {
    return false;
  }

  if (scope.kind === "group") {
    const group =
      findDepartmentGroupByName(scope.name) ?? findDepartmentGroupByUnit(scope.name);
    return group ? matchesDepartmentGroup(group, normalized) : normalized === scope.name;
  }

  return normalized === scope.name;
}

export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: PageProps) {
  const session = await requireSession();
  if (isWorkerOnly(session) || isMasterRole(session.role)) {
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

  const scopeMap = new Map<string, ReviewScope>();
  for (const department of snapshot.departments) {
    scopeMap.set(
      department.name,
      createUnitScope(department.name, {
        label: department.label,
        icon: department.icon,
        accent: department.accent,
      }),
    );
  }

  const allDepartmentNames = new Set<string>();
  for (const department of snapshot.departments) {
    allDepartmentNames.add(department.name);
  }
  for (const task of snapshot.taskDirectory) {
    allDepartmentNames.add(task.departmentName);
  }
  for (const item of snapshot.reviewQueue) {
    allDepartmentNames.add(item.departmentName);
  }
  for (const project of snapshot.projects) {
    allDepartmentNames.add(project.departmentName);
  }

  for (const group of DEPARTMENT_GROUPS) {
    const hasMatch = Array.from(allDepartmentNames).some((name) =>
      matchesDepartmentGroup(group, name),
    );
    if (!hasMatch) {
      continue;
    }

    scopeMap.set(group.name, {
      name: group.name,
      label: getDepartmentGroupLabel(group),
      icon: group.icon,
      accent: group.accent,
      kind: "group",
      totalTasks: 0,
      activeTasks: 0,
      reviewTasks: 0,
      doneTasks: 0,
      completion: 0,
    });
  }

  const scopes = Array.from(scopeMap.values()).map((scope) => {
    const scopeTasks = snapshot.taskDirectory.filter((task) =>
      scopeMatches(scope, task.departmentName),
    );
    const activeTasks = scopeTasks.filter(
      (task) => task.stageBucket === "todo" || task.stageBucket === "progress",
    );
    const reviewTasks = scopeTasks.filter((task) => task.stageBucket === "review");
    const doneTasks = scopeTasks.filter((task) => task.stageBucket === "done");

    return {
      ...scope,
      totalTasks: scopeTasks.length,
      activeTasks: activeTasks.length,
      reviewTasks: reviewTasks.length,
      doneTasks: doneTasks.length,
      completion: scopeTasks.length
        ? Math.round((doneTasks.length / scopeTasks.length) * 100)
        : 0,
    };
  });

  const orderedScopes: ReviewScope[] = [];
  const appended = new Set<string>();
  for (const department of snapshot.departments) {
    const groupedScope =
      findDepartmentGroupByName(department.name) ?? findDepartmentGroupByUnit(department.name);
    const groupedScopeName = groupedScope?.name ?? null;

    if (groupedScopeName) {
      const scope = scopes.find((item) => item.name === groupedScopeName);
      if (scope && !appended.has(scope.name)) {
        orderedScopes.push(scope);
        appended.add(scope.name);
      }
      continue;
    }

    const scope = scopes.find((item) => item.name === department.name);
    if (scope && !appended.has(scope.name)) {
      orderedScopes.push(scope);
      appended.add(scope.name);
    }
  }

  for (const scope of scopes) {
    if (!appended.has(scope.name)) {
      orderedScopes.push(scope);
      appended.add(scope.name);
    }
  }

  const params = (await searchParams) ?? {};
  const requestedDepartment = getDepartmentParam(params.department);
  const selectedScope =
    orderedScopes.find((scope) => scope.name === requestedDepartment) ??
    (() => {
      const groupedScope =
        findDepartmentGroupByName(requestedDepartment) ??
        findDepartmentGroupByUnit(requestedDepartment);
      if (!groupedScope) {
        return null;
      }
      return orderedScopes.find((scope) => scope.name === groupedScope.name) ?? null;
    })() ??
    orderedScopes.find((scope) => scope.reviewTasks > 0) ??
    orderedScopes[0];

  const scopedTasks = snapshot.taskDirectory.filter((task) =>
    selectedScope ? scopeMatches(selectedScope, task.departmentName) : false,
  );
  const activeTasks = scopedTasks
    .filter((task) => task.stageBucket === "todo" || task.stageBucket === "progress")
    .sort((left, right) => right.progress - left.progress || left.name.localeCompare(right.name, "mn"));
  const visibleReviewTasks = snapshot.reviewQueue.filter((item) =>
    selectedScope ? scopeMatches(selectedScope, item.departmentName) : false,
  );
  const reviewedTasks = scopedTasks
    .filter((task) => task.stageBucket === "done")
    .sort((left, right) => right.progress - left.progress || left.name.localeCompare(right.name, "mn"));
  const scopedProjects = snapshot.projects.filter((project) =>
    selectedScope ? scopeMatches(selectedScope, project.departmentName) : false,
  );

  const totalWorkflowCount =
    activeTasks.length + visibleReviewTasks.length + reviewedTasks.length;
  const decisionRate =
    visibleReviewTasks.length + reviewedTasks.length
      ? Math.round(
          (reviewedTasks.length / (visibleReviewTasks.length + reviewedTasks.length)) * 100,
        )
      : 0;
  const averageProgress = scopedTasks.length
    ? Math.round(
        scopedTasks.reduce((sum, task) => sum + task.progress, 0) / scopedTasks.length,
      )
    : 0;

  const flowStages = [
    {
      key: "active",
      label: "Хяналтаас өмнө",
      count: activeTasks.length,
      share: totalWorkflowCount ? Math.round((activeTasks.length / totalWorkflowCount) * 100) : 0,
      tone: reviewStyles.flowStageActive,
      note: "Явж буй болон дуусаагүй ажил",
    },
    {
      key: "review",
      label: "Хянах",
      count: visibleReviewTasks.length,
      share: totalWorkflowCount
        ? Math.round((visibleReviewTasks.length / totalWorkflowCount) * 100)
        : 0,
      tone: reviewStyles.flowStageReview,
      note: "Ерөнхий менежерийн шийдвэр хүлээж буй",
    },
    {
      key: "done",
      label: "Хянасан",
      count: reviewedTasks.length,
      share: totalWorkflowCount ? Math.round((reviewedTasks.length / totalWorkflowCount) * 100) : 0,
      tone: reviewStyles.flowStageDone,
      note: "Баталгаажиж хаагдсан ажил",
    },
  ] as const;

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container} id="review-top">
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="review"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Хяналт"
              subtitle="Шалгах, батлах урсгалын нэгтгэсэн самбар"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={visibleReviewTasks.length}
              notificationNote={`${visibleReviewTasks.length} ажилбар шийдвэр хүлээж байна`}
            />

            <section className={shellStyles.heroCard}>
              <span className={shellStyles.eyebrow}>Хяналтын урсгал</span>
              <h1>Хянах болон хянасан ажлууд</h1>
              <p>
                Нэгжээ сонгоод хяналтаас өмнөх ажил, яг одоо шийдвэр хүлээж буй ажил,
                мөн аль хэдийн баталгаажсан ажлыг нэг дор урсгалаар харна.
              </p>

              <div className={shellStyles.statsGrid}>
                <article className={shellStyles.statCard}>
                  <span>Сонгосон алба нэгж</span>
                  <strong>{selectedScope?.name ?? "Тодорхойгүй"}</strong>
                </article>
                <article className={shellStyles.statCard}>
                  <span>Хянах ажлууд</span>
                  <strong>{visibleReviewTasks.length}</strong>
                </article>
                <article className={shellStyles.statCard}>
                  <span>Хянасан ажлууд</span>
                  <strong>{reviewedTasks.length}</strong>
                </article>
                <article className={shellStyles.statCard}>
                  <span>Явж буй ажлууд</span>
                  <strong>{activeTasks.length}</strong>
                </article>
              </div>

              <div className={reviewStyles.heroInsightGrid}>
                <article className={reviewStyles.flowCard}>
                  <div className={reviewStyles.cardHeader}>
                    <div>
                      <span className={reviewStyles.kicker}>Хяналтын зураглал</span>
                      <h2>{selectedScope?.name ?? "Ажлын урсгал"}</h2>
                    </div>
                    <strong>{totalWorkflowCount}</strong>
                  </div>

                  <div className={reviewStyles.flowTrack} aria-hidden>
                    {flowStages.some((stage) => stage.count > 0) ? (
                      flowStages.map((stage) =>
                        stage.count ? (
                          <span
                            key={stage.key}
                            className={`${reviewStyles.flowSegment} ${stage.tone}`}
                            style={{ flexGrow: stage.count }}
                          />
                        ) : null,
                      )
                    ) : (
                      <span className={reviewStyles.flowSegmentEmpty} />
                    )}
                  </div>

                  <div className={reviewStyles.flowLegend}>
                    {flowStages.map((stage) => (
                      <article key={stage.key} className={reviewStyles.flowLegendItem}>
                        <span className={`${reviewStyles.flowDot} ${stage.tone}`} aria-hidden />
                        <div>
                          <strong>{stage.label}</strong>
                          <small>{stage.note}</small>
                        </div>
                        <div className={reviewStyles.flowLegendMeta}>
                          <strong>{stage.count}</strong>
                          <span>{stage.share}%</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>

                <article className={reviewStyles.decisionCard}>
                  <div className={reviewStyles.cardHeader}>
                    <div>
                      <span className={reviewStyles.kicker}>Шийдвэрийн төлөв</span>
                      <h2>Хяналтын товч зураг</h2>
                    </div>
                  </div>

                  <div className={reviewStyles.decisionStat}>
                    <span>Баталгаажуулалтын хувь</span>
                    <strong>{decisionRate}%</strong>
                    <small>Хянасан болон хүлээгдэж буй ажлын харьцаагаар тооцсон</small>
                  </div>

                  <div className={reviewStyles.decisionMiniGrid}>
                    <article className={reviewStyles.miniStat}>
                      <span>Нийт ажил</span>
                      <strong>{scopedProjects.length}</strong>
                    </article>
                    <article className={reviewStyles.miniStat}>
                      <span>Дундаж явц</span>
                      <strong>{averageProgress}%</strong>
                    </article>
                    <article className={reviewStyles.miniStat}>
                      <span>Нээлттэй үлдэгдэл</span>
                      <strong>{selectedScope?.activeTasks ?? 0}</strong>
                    </article>
                    <article className={reviewStyles.miniStat}>
                      <span>Нийт мөр</span>
                      <strong>{selectedScope?.totalTasks ?? 0}</strong>
                    </article>
                  </div>
                </article>
              </div>
            </section>

            <section className={dashboardStyles.projectsSection}>
              <div className={dashboardStyles.sectionHeader}>
                <div>
                  <span className={dashboardStyles.kicker}>Алба нэгжийн шүүлт</span>
                  <h2>Ямар нэгжийн хяналтыг харах вэ</h2>
                  <small className={dashboardStyles.sectionNote}>
                    Нэг удаад зөвхөн нэг алба нэгжийн урсгал, хянах ажил, хянасан ажлыг харуулна
                  </small>
                </div>
              </div>

              <nav
                className={dashboardStyles.departmentSelector}
                aria-label="Алба нэгж сонгох цэс"
              >
                <div className={dashboardStyles.departmentTabBar}>
                  {orderedScopes.map((scope) => {
                    const isActive = scope.name === selectedScope?.name;

                    return (
                      <Link
                        key={scope.name}
                        href={`/review?department=${encodeURIComponent(scope.name)}`}
                        className={`${dashboardStyles.departmentTab} ${
                          isActive ? dashboardStyles.departmentTabActive : ""
                        }`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <span className={dashboardStyles.departmentTabLabel}>
                          <span className={dashboardStyles.departmentTabIcon} aria-hidden>
                            {scope.icon}
                          </span>
                          <span>{scope.name}</span>
                        </span>
                        <strong>{scope.reviewTasks}</strong>
                      </Link>
                    );
                  })}
                </div>
              </nav>
            </section>

            {selectedScope ? (
              <section className={dashboardStyles.projectsSection}>
                <div className={dashboardStyles.selectedDepartmentHeader}>
                  <div>
                    <span
                      className={dashboardStyles.departmentAccentBadge}
                      style={{ background: selectedScope.accent }}
                    />
                    <h2>{selectedScope.name}</h2>
                    <p className={dashboardStyles.selectedDepartmentNote}>
                      {selectedScope.label}
                    </p>
                  </div>

                  <div className={dashboardStyles.projectMetaSummary}>
                    <div>
                      <span>Хянах</span>
                      <strong>{visibleReviewTasks.length}</strong>
                    </div>
                    <div>
                      <span>Хянасан</span>
                      <strong>{reviewedTasks.length}</strong>
                    </div>
                    <div>
                      <span>Явж буй</span>
                      <strong>{activeTasks.length}</strong>
                    </div>
                    <div>
                      <span>Гүйцэтгэл</span>
                      <strong>{selectedScope.completion}%</strong>
                    </div>
                  </div>
                </div>

                <div className={reviewStyles.reviewBoard}>
                  <article className={reviewStyles.reviewLane}>
                    <div className={reviewStyles.laneHeader}>
                      <div>
                        <span className={reviewStyles.kicker}>Хяналтаас өмнө</span>
                        <h3>Явж буй ажлууд</h3>
                      </div>
                      <strong>{activeTasks.length}</strong>
                    </div>

                    {activeTasks.length ? (
                      <div className={reviewStyles.laneList}>
                        {activeTasks.map((task) => (
                          <Link key={task.id} href={task.href} className={reviewStyles.laneItem}>
                            <div className={reviewStyles.laneItemTop}>
                              <div>
                                <strong>{task.name}</strong>
                                <p>{task.projectName}</p>
                              </div>
                              <StagePill label={task.stageLabel} bucket={task.stageBucket} />
                            </div>
                            <div className={reviewStyles.laneMeta}>
                              <span>{task.leaderName || "Хариуцагчгүй"}</span>
                              <span>{task.deadline}</span>
                              <span>{task.progress}%</span>
                            </div>
                            <div className={reviewStyles.progressTrack} aria-hidden>
                              <span
                                className={reviewStyles.progressFillActive}
                                style={{ width: `${Math.max(task.progress, 4)}%` }}
                              />
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className={dashboardStyles.emptyColumnState}>
                        Одоогоор хяналтаас өмнөх явж буй ажил алга байна.
                      </div>
                    )}
                  </article>

                  <article className={reviewStyles.reviewLane}>
                    <div className={reviewStyles.laneHeader}>
                      <div>
                        <span className={reviewStyles.kicker}>Хянах</span>
                        <h3>Шийдвэр хүлээж буй</h3>
                      </div>
                      <strong>{visibleReviewTasks.length}</strong>
                    </div>

                    {visibleReviewTasks.length ? (
                      <div className={reviewStyles.laneList}>
                        {visibleReviewTasks.map((item) => (
                          <Link key={item.id} href={item.href} className={reviewStyles.laneItem}>
                            <div className={reviewStyles.laneItemTop}>
                              <div>
                                <strong>{item.name}</strong>
                                <p>{item.projectName}</p>
                              </div>
                              <StagePill label={item.stageLabel} bucket="review" />
                            </div>
                            <div className={reviewStyles.laneMeta}>
                              <span>{item.leaderName || "Хариуцагчгүй"}</span>
                              <span>{item.deadline}</span>
                              <span>{item.progress}%</span>
                            </div>
                            <div className={reviewStyles.progressTrack} aria-hidden>
                              <span
                                className={reviewStyles.progressFillReview}
                                style={{ width: `${Math.max(item.progress, 4)}%` }}
                              />
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className={dashboardStyles.emptyColumnState}>
                        Одоогоор шийдвэр хүлээж буй хяналтын ажил алга байна.
                      </div>
                    )}
                  </article>

                  <article className={reviewStyles.reviewLane}>
                    <div className={reviewStyles.laneHeader}>
                      <div>
                        <span className={reviewStyles.kicker}>Хянасан</span>
                        <h3>Баталгаажсан ажлууд</h3>
                      </div>
                      <strong>{reviewedTasks.length}</strong>
                    </div>

                    {reviewedTasks.length ? (
                      <div className={reviewStyles.laneList}>
                        {reviewedTasks.map((task) => (
                          <Link key={task.id} href={task.href} className={reviewStyles.laneItem}>
                            <div className={reviewStyles.laneItemTop}>
                              <div>
                                <strong>{task.name}</strong>
                                <p>{task.projectName}</p>
                              </div>
                              <StagePill label={task.stageLabel} bucket="done" />
                            </div>
                            <div className={reviewStyles.laneMeta}>
                              <span>{task.leaderName || "Хариуцагчгүй"}</span>
                              <span>{task.deadline}</span>
                              <span>{task.progress}%</span>
                            </div>
                            <div className={reviewStyles.progressTrack} aria-hidden>
                              <span
                                className={reviewStyles.progressFillDone}
                                style={{ width: `${Math.max(task.progress, 4)}%` }}
                              />
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className={dashboardStyles.emptyColumnState}>
                        Одоогоор баталгаажиж хаагдсан ажил алга байна.
                      </div>
                    )}
                  </article>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
