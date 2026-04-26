import Link from "next/link";
import { redirect } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { generateSeasonalExecutionAction } from "@/app/actions";
import dashboardStyles from "@/app/page.module.css";
import workspaceStyles from "@/app/workspace.module.css";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { loadSeasonalPlanDetail } from "@/lib/workspace";

import styles from "../seasonal-detail.module.css";

type PageProps = {
  params: Promise<{
    planId: string;
  }>;
  searchParams?: Promise<{
    error?: string | string[];
    notice?: string | string[];
  }>;
};

function getParam(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function StagePill({ label, bucket }: { label: string; bucket: string }) {
  const tone =
    bucket === "done"
      ? dashboardStyles.stageDone
      : bucket === "progress"
        ? dashboardStyles.stageProgress
        : bucket === "review"
          ? dashboardStyles.stageReview
          : bucket === "problem"
            ? dashboardStyles.stageProblem
            : dashboardStyles.stageTodo;

  return (
    <span className={`${dashboardStyles.stagePill} ${tone}`} aria-label={label} title={label}>
      {label}
    </span>
  );
}

function stateBucket(state: string) {
  switch (state) {
    case "done":
      return "done";
    case "active":
      return "progress";
    case "approved":
      return "review";
    case "cancelled":
      return "problem";
    default:
      return "todo";
  }
}

export default async function SeasonalPlanDetailPage({ params, searchParams }: PageProps) {
  const session = await requireSession();
  if (isWorkerOnly(session)) {
    redirect("/");
  }

  const resolvedParams = await params;
  const planId = Number(resolvedParams.planId);
  const query = (await searchParams) ?? {};
  const errorMessage = getParam(query.error);
  const noticeMessage = getParam(query.notice);
  const masterMode = isMasterRole(session.role);

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");

  let plan;
  try {
    plan = await loadSeasonalPlanDetail(planId, {
      login: session.login,
      password: session.password,
    });
  } catch (error) {
    return (
      <main className={workspaceStyles.shell}>
        <div className={workspaceStyles.container}>
          <section className={workspaceStyles.emptyState}>
            <h2>Улирлын төлөвлөгөө нээгдсэнгүй</h2>
            <p>{error instanceof Error ? error.message : "Мэдээлэл уншихад алдаа гарлаа."}</p>
          </section>
        </div>
      </main>
    );
  }

  const generatedTaskCount = plan.lines.reduce(
    (sum, line) => sum + line.days.filter((day) => day.generatedTaskId).length,
    0,
  );

  return (
    <main className={workspaceStyles.shell}>
      <div className={workspaceStyles.container} id="seasonal-plan-top">
        <div className={workspaceStyles.contentWithMenu}>
          <aside className={workspaceStyles.menuColumn}>
            <AppMenu
              active={masterMode ? "dashboard" : "projects"}
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

          <div className={workspaceStyles.pageContent}>
            <WorkspaceHeader
              title="Улирлын хог ачилтын төлөвлөгөө"
              subtitle="Төлөвлөгөө, мөрийн хуваарь, өдрөөр гүйцэтгэл үүсгэх самбар"
              userName={session.name}
              roleLabel={getRoleLabel(session.role)}
              notificationCount={plan.conflictWarnings.length}
              notificationNote={
                plan.conflictWarnings.length
                  ? `${plan.conflictWarnings.length} давхцлын анхааруулга илэрсэн`
                  : "Давхцлын анхааруулга илрээгүй"
              }
            />

            {errorMessage ? (
              <div className={`${workspaceStyles.message} ${workspaceStyles.errorMessage}`}>
                {errorMessage}
              </div>
            ) : null}
            {noticeMessage ? (
              <div className={`${workspaceStyles.message} ${workspaceStyles.noticeMessage}`}>
                {noticeMessage}
              </div>
            ) : null}

            <section className={workspaceStyles.heroCard}>
              <span className={workspaceStyles.eyebrow}>Seasonal plan</span>
              <h1>{plan.name}</h1>
              <p>
                Энэ төлөвлөгөө нь өдөр тутмын тогтмол маршруттай холилдохгүйгээр улирлын хог
                ачилтын байршил, өдрүүд, гүйцэтгэлийн үүсгэлтийг тусад нь удирдана.
              </p>

              <div className={workspaceStyles.buttonRow}>
                <StagePill label={plan.stateLabel} bucket={stateBucket(plan.state)} />
                <Link href="/projects/new" className={workspaceStyles.smallLink}>
                  Шинэ төлөвлөгөө үүсгэх
                </Link>
                <Link href="/projects" className={workspaceStyles.smallLink}>
                  Ажлууд руу буцах
                </Link>
              </div>

              <div className={workspaceStyles.statsGrid}>
                <article className={workspaceStyles.statCard}>
                  <span>Хэлтэс</span>
                  <strong>{plan.departmentName}</strong>
                </article>
                <article className={workspaceStyles.statCard}>
                  <span>Огнооны хүрээ</span>
                  <strong>{plan.dateRangeLabel}</strong>
                </article>
                <article className={workspaceStyles.statCard}>
                  <span>Нийт тонн</span>
                  <strong>{plan.totalPlannedTonnageLabel}</strong>
                </article>
                <article className={workspaceStyles.statCard}>
                  <span>Үүсгэсэн ажил</span>
                  <strong>{generatedTaskCount}</strong>
                </article>
              </div>

              <div className={workspaceStyles.chipRow}>
                {plan.workDayLabels.map((label) => (
                  <span key={label} className={workspaceStyles.chip}>
                    {label}
                  </span>
                ))}
                <span className={workspaceStyles.chip}>{plan.lineCount} мөр</span>
                <span className={workspaceStyles.chip}>
                  {plan.totalPlannedVehicleCount} машин
                </span>
              </div>

              {plan.notes ? <p className={workspaceStyles.helperNote}>{plan.notes}</p> : null}
            </section>

            <section className={workspaceStyles.panel}>
              <div className={workspaceStyles.sectionHeader}>
                <div>
                  <span className={workspaceStyles.sectionKicker}>Өдрөөр үүсгэх</span>
                  <h2>Execution generation</h2>
                  <small className={workspaceStyles.sectionNote}>
                    Сонгосон өдрийн seasonal мөрүүдээс гүйцэтгэлийн task-ууд үүсгэнэ.
                  </small>
                </div>
              </div>

              <div className={styles.dayRail}>
                {plan.plannedDates.map((dateItem) => (
                  <article key={dateItem.dateKey} className={styles.dayCard}>
                    <div className={styles.dayCardTop}>
                      <strong>{dateItem.dateLabel}</strong>
                      <StagePill
                        label={
                          dateItem.generatedCount
                            ? `${dateItem.generatedCount} үүсгэсэн`
                            : "Хүлээгдэж байна"
                        }
                        bucket={dateItem.generatedCount ? "progress" : "todo"}
                      />
                    </div>

                    <p className={styles.dayMeta}>
                      Үүсгэсэн: {dateItem.generatedCount} · Үлдсэн: {dateItem.pendingCount}
                    </p>

                    <form action={generateSeasonalExecutionAction}>
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <input type="hidden" name="work_date" value={dateItem.dateKey} />
                      <button type="submit" className={workspaceStyles.primaryButton}>
                        Энэ өдөрт гүйцэтгэл үүсгэх
                      </button>
                    </form>
                  </article>
                ))}
              </div>
            </section>

            {plan.conflictWarnings.length ? (
              <section className={workspaceStyles.panel}>
                <div className={workspaceStyles.sectionHeader}>
                  <div>
                    <span className={workspaceStyles.sectionKicker}>Анхааруулга</span>
                    <h2>Давхцлын warning</h2>
                    <small className={workspaceStyles.sectionNote}>
                      Ижил өдөр, ижил машинтай regular эсвэл seasonal task олдсон.
                    </small>
                  </div>
                </div>

                <div className={styles.warningList}>
                  {plan.conflictWarnings.map((warning) => (
                    <article key={warning.id} className={styles.warningCard}>
                      <div className={styles.warningTop}>
                        <strong>{warning.vehicleName}</strong>
                        <StagePill label={warning.workDateLabel} bucket="problem" />
                      </div>
                      <p>{warning.note}</p>
                      <Link href={warning.taskHref}>{warning.taskName}</Link>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className={workspaceStyles.panel}>
              <div className={workspaceStyles.sectionHeader}>
                <div>
                  <span className={workspaceStyles.sectionKicker}>Мөрийн жагсаалт</span>
                  <h2>Байршил, машин, тонн</h2>
                  <small className={workspaceStyles.sectionNote}>
                    Зураг дээрх хүснэгтийн мөр бүр энд тусдаа seasonal line байдлаар хадгалагдана.
                  </small>
                </div>
              </div>

              <div className={styles.lineList}>
                {plan.lines.map((line) => (
                  <article key={line.id} className={styles.lineCard}>
                    <div className={styles.lineCardTop}>
                      <strong>
                        {line.sequence}. {line.khorooLabel || "Хороо"} · {line.locationName}
                      </strong>
                      <StagePill
                        label={`${line.days.filter((day) => day.generatedTaskId).length} үүсгэсэн`}
                        bucket={
                          line.days.some((day) => day.generatedTaskId) ? "progress" : "todo"
                        }
                      />
                    </div>

                    <div className={styles.lineBody}>
                      <div className={styles.lineMetaGrid}>
                        <div className={styles.lineMetaBox}>
                          <span>Төлөвлөсөн машин</span>
                          <strong>{line.plannedVehicleCountLabel}</strong>
                        </div>
                        <div className={styles.lineMetaBox}>
                          <span>Төлөвлөсөн тонн</span>
                          <strong>{line.plannedTonnageLabel}</strong>
                        </div>
                        <div className={styles.lineMetaBox}>
                          <span>Маршрут</span>
                          <strong>{line.routeName}</strong>
                        </div>
                        <div className={styles.lineMetaBox}>
                          <span>Байршлын тайлбар</span>
                          <strong>{line.remarks || "Тэмдэглэлгүй"}</strong>
                        </div>
                      </div>

                      <div className={styles.lineDayList}>
                        {line.days.map((day) => (
                          <div key={day.id} className={styles.lineDayChip}>
                            <div className={styles.miniRow}>
                              <strong>{day.workDateLabel}</strong>
                              <span>{day.statusLabel}</span>
                            </div>
                            <span>Машин: {day.assignedVehicleName}</span>
                            {day.generatedTaskHref ? (
                              <Link href={day.generatedTaskHref}>Үүсгэсэн task харах</Link>
                            ) : (
                              <span>Task үүсээгүй</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
