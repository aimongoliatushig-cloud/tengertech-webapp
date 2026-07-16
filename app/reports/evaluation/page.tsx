import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2, Download } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import {
  hasCapability,
  isMasterRole,
  requireSession,
  getSessionRoleLabel,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canViewAllWorkspaceReports } from "@/lib/report-permissions";
import {
  DEFAULT_EVALUATOR_NAME,
  DEFAULT_EVALUATOR_ORG,
  EVAL_MAX_TOTAL,
  defaultEvalRows,
  isValidEvalMonth,
  loadEvalMonth,
  summarizeEval,
  type EvalRow,
} from "@/lib/road-cleaning-evaluation";

import { canManageEvaluation, resolveEvalDepartmentName } from "./access";
import { EvaluationEntryClient } from "./evaluation-entry-client";
import styles from "./evaluation.module.css";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    month?: string | string[];
    department?: string | string[];
    notice?: string | string[];
    error?: string | string[];
  }>;
};

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function currentMonthKey() {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
}

export default async function EvaluationReportPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const canViewAll = canViewAllWorkspaceReports(session);
  const canManage = canManageEvaluation(session);

  if (!canManage && !canViewAll) {
    redirect("/");
  }

  const scopedDepartmentName = await loadSessionDepartmentName(session);
  const params = (await searchParams) ?? {};
  const requestedDepartment = firstParam(params.department);
  const departmentName = resolveEvalDepartmentName({
    scopedDepartmentName,
    canViewAll,
    requestedDepartment,
  });

  const requestedMonth = firstParam(params.month);
  const month = isValidEvalMonth(requestedMonth) ? requestedMonth : currentMonthKey();
  const notice = firstParam(params.notice);
  const errorMessage = firstParam(params.error);

  const saved = await loadEvalMonth(departmentName, month);
  const rows: EvalRow[] = saved?.rows.length ? saved.rows : defaultEvalRows();
  const evaluatorOrg = saved?.evaluatorOrg || DEFAULT_EVALUATOR_ORG;
  const evaluatorName = saved?.evaluatorName || DEFAULT_EVALUATOR_NAME;
  const summary = summarizeEval(saved?.rows ?? []);

  const canEdit = canManage && hasCapability(session, "write_workspace_reports");

  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");
  const masterMode = isMasterRole(session.role);

  const exportParams = new URLSearchParams({ month, department: departmentName });
  const pdfHref = `/api/reports/evaluation-export?${exportParams.toString()}&format=pdf`;
  const excelHref = `/api/reports/evaluation-export?${exportParams.toString()}&format=excel`;

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="reports"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              canViewAllReports={canViewAll}
              userName={session.name}
              userRole={session.role}
              roleLabel={getSessionRoleLabel(session)}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              departmentScopeName={scopedDepartmentName}
            />
          </aside>

          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Гүйцэтгэлийн үнэлгээ"
              subtitle={`${departmentName} · зам талбайн цэвэрлэгээний сарын үнэлгээ`}
              userName={session.name}
              roleLabel={getSessionRoleLabel(session)}
            />

            {notice ? (
              <div className={`${styles.banner} ${styles.bannerNotice}`}>
                <CheckCircle2 size={18} aria-hidden /> {notice}
              </div>
            ) : null}
            {errorMessage ? (
              <div className={`${styles.banner} ${styles.bannerError}`}>
                <AlertCircle size={18} aria-hidden /> {errorMessage}
              </div>
            ) : null}

            <form method="get" action="/reports/evaluation" className={styles.toolbar}>
              <label className={styles.toolbarField}>
                <span>Сар</span>
                <input type="month" name="month" defaultValue={month} />
              </label>
              {canViewAll && !scopedDepartmentName ? (
                <input type="hidden" name="department" value={departmentName} />
              ) : null}
              <button type="submit" className={styles.toolbarButton}>
                Харах
              </button>
            </form>

            {saved?.rows.length ? (
              <div className={styles.summaryGrid}>
                <article className={`${styles.summaryCard} ${styles.summaryCardAccent}`}>
                  <span>Дундаж оноо</span>
                  <strong>
                    {summary.averageScore}
                    <small>/{EVAL_MAX_TOTAL}</small>
                  </strong>
                </article>
                <article className={styles.summaryCard}>
                  <span>Байршлын тоо</span>
                  <strong>{summary.locationCount}</strong>
                </article>
                <article className={styles.summaryCard}>
                  <span>Нийт талбай /м²/</span>
                  <strong>{summary.totalArea.toLocaleString("mn-MN")}</strong>
                </article>
              </div>
            ) : (
              <p className={styles.emptyHint}>
                Энэ сарын үнэлгээ хараахан хадгалагдаагүй байна. Байршил бүрийн оноог оруулж хадгална уу.
              </p>
            )}

            <EvaluationEntryClient
              month={month}
              department={departmentName}
              initialRows={rows}
              evaluatorOrg={evaluatorOrg}
              evaluatorName={evaluatorName}
              canEdit={canEdit}
            />

            {saved?.rows.length ? (
              <div className={styles.downloadRow}>
                <a className={styles.downloadButton} href={pdfHref}>
                  <Download size={16} aria-hidden /> PDF татах (албан загвар)
                </a>
                <a className={styles.downloadButton} href={excelHref}>
                  <Download size={16} aria-hidden /> Excel татах
                </a>
              </div>
            ) : null}

            {saved?.updatedBy ? (
              <p className={styles.readOnlyNote}>
                Сүүлд шинэчилсэн: {saved.updatedBy} · {saved.updatedAt}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
