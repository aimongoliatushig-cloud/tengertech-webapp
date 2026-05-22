import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardList } from "lucide-react";
import { notFound } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { createSharedOperationalTaskAction } from "@/app/shared-work/actions";
import { SharedReportForm } from "@/app/shared-work/shared-report-form";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  getSessionRoleLabel,
  hasCapability,
  requireSession,
} from "@/lib/auth";
import {
  loadSharedWorkDetail,
  type SharedWorkDepartmentTask,
} from "@/lib/shared-work";
import { loadWorkspaceNotificationCount } from "@/lib/workspace-notifications";
import styles from "@/app/workspace.module.css";

type PageProps = {
  params: Promise<{ workId: string }>;
  searchParams?: Promise<{ notice?: string | string[]; error?: string | string[] }>;
};

function getParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: string) {
  if (!value) {
    return "Огноо тодорхойгүй";
  }
  return value.replace("T", " ").slice(0, 16);
}

function DepartmentProgressList({ tasks }: { tasks: SharedWorkDepartmentTask[] }) {
  return (
    <div className={styles.sharedWorkDepartmentOverview}>
      {tasks.map((task) => (
        <div key={task.id} className={styles.sharedWorkDepartmentOverviewRow}>
          <div>
            <strong>{task.departmentName}</strong>
            <span>{task.departmentHeadName || "Хэлтсийн дарга оноогоогүй"}</span>
          </div>
          <em>{task.statusLabel}</em>
          <div className={styles.sharedWorkProgressMini}>
            <span style={{ width: `${Math.max(Math.min(task.progress, 100), task.progress ? 8 : 0)}%` }} />
          </div>
          <b>{task.progress}%</b>
        </div>
      ))}
    </div>
  );
}

function CreateOperationalTaskForm({
  workId,
  tasks,
}: {
  workId: number;
  tasks: SharedWorkDepartmentTask[];
}) {
  return (
    <form action={createSharedOperationalTaskAction} className={styles.sharedWorkTaskForm}>
      <input type="hidden" name="shared_work_id" value={workId} />
      <div className={styles.sharedWorkInlineGrid}>
        <label className={styles.field}>
          <span>Даалгавар үүсгэх хэлтэс</span>
          <select name="department_task_id" required defaultValue="">
            <option value="" disabled>
              Хэлтэс сонгоно уу
            </option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.departmentName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.sharedWorkTaskPreview}>
        <ClipboardList aria-hidden />
        Сонгосон хэлтэст энэ хамтарсан ажлын дотоод даалгавар үүснэ.
      </div>
      <div className={styles.sharedWorkStickyActions}>
        <button type="submit" className={styles.primaryButton}>
          <ClipboardList aria-hidden />
          Даалгавар нэмэх
        </button>
      </div>
    </form>
  );
}

export default async function SharedWorkDetailPage({ params, searchParams }: PageProps) {
  const [{ workId }, query, session] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as Awaited<NonNullable<PageProps["searchParams"]>>),
    requireSession(),
  ]);
  const id = Number(workId);
  if (!Number.isFinite(id) || id <= 0) {
    notFound();
  }

  const roleLabel = getSessionRoleLabel(session);
  const [detail, notificationCount, departmentScopeName] = await Promise.all([
    loadSharedWorkDetail(session, id),
    loadWorkspaceNotificationCount(session),
    loadSessionDepartmentName(session),
  ]);
  const { work } = detail;
  if (!work) {
    notFound();
  }

  const notice = getParam(query.notice);
  const error = getParam(query.error);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");

  return (
    <div className={styles.workspaceShell}>
      <AppMenu
        active="shared-work"
        canCreateProject={canCreateProject}
        canCreateTasks={canCreateTasks}
        canWriteReports={canWriteReports}
        canViewQualityCenter={canViewQualityCenter}
        canUseFieldConsole={canUseFieldConsole}
        canViewAllReports={canWriteReports}
        userName={session.name}
        userRole={session.role}
        roleLabel={roleLabel}
        workerMode={session.role === "worker"}
        masterMode={session.role === "senior_master" || session.role === "team_leader"}
        notificationCount={notificationCount}
        departmentScopeName={departmentScopeName}
        groupFlags={session.groupFlags}
      />
      <main className={styles.workspaceMain}>
        <WorkspaceHeader
          title={work.name}
          subtitle={`${work.code} · ${work.statusLabel}`}
          userName={session.name}
          roleLabel={roleLabel}
          notificationCount={notificationCount}
        />

        <Link href="/shared-work" className={styles.secondaryButton}>
          <ArrowLeft aria-hidden />
          Хамтарсан ажил руу буцах
        </Link>

        {notice ? <p className={styles.noticeBanner}>{notice}</p> : null}
        {error ? <p className={styles.errorCard}>{error}</p> : null}

        <section className={styles.sharedWorkDetailHero}>
          <div>
            <span className={styles.kicker}>{work.priorityLabel}</span>
            <h1>{work.name}</h1>
            <p>{work.description || "Тайлбар оруулаагүй"}</p>
            <div className={styles.sharedWorkMetaGrid}>
              <span>{work.locationText || "Байршил оруулаагүй"}</span>
              <span>{formatDate(work.plannedStartDate)} - {formatDate(work.plannedEndDate)}</span>
              <span>{work.involvedDepartments.join(", ")}</span>
            </div>
          </div>
          <div className={styles.sharedWorkDetailProgress}>
            <strong>{work.progress}%</strong>
            <span>{work.statusLabel}</span>
          </div>
        </section>

        <section className={styles.formCard}>
          <div className={styles.sharedWorkSectionHeader}>
            <div>
              <span className={styles.kicker}>Хамрах хэлтэс</span>
              <h2>Энэ нэг ажилд оролцож буй хэлтсүүд</h2>
            </div>
            <span className={styles.sharedWorkTaskStatus}>
              <CheckCircle2 aria-hidden />
              {work.tasks.length} хэлтэс
            </span>
          </div>
          <DepartmentProgressList tasks={work.tasks} />
        </section>

        <section className={styles.formCard}>
          <div className={styles.sharedWorkSectionHeader}>
            <div>
              <span className={styles.kicker}>Даалгавар</span>
              <h2>Оролцогч хэлтэст даалгавар нэмэх</h2>
            </div>
          </div>
          <CreateOperationalTaskForm workId={work.id} tasks={work.tasks} />
        </section>

        <section className={styles.formCard}>
          <div className={styles.sharedWorkSectionHeader}>
            <div>
              <span className={styles.kicker}>Талбарын тайлан</span>
              <h2>Тайлан, зураг нэмэх</h2>
            </div>
          </div>
          <SharedReportForm workId={work.id} tasks={work.tasks} />
        </section>

        <section className={styles.formCard}>
          <div className={styles.sharedWorkSectionHeader}>
            <div>
              <span className={styles.kicker}>Тайлангууд</span>
              <h2>Оруулсан мэдээлэл</h2>
            </div>
          </div>
          <div className={styles.sharedWorkReportList}>
            {work.reports.map((report) => (
              <article key={report.id} className={styles.sharedWorkReportItem}>
                <strong>{report.departmentTaskName}</strong>
                <span>{report.employeeName} · {formatDate(report.createdAt)}</span>
                <p>{report.note}</p>
                {report.imageIds.length ? (
                  <div className={styles.sharedWorkImageGrid}>
                    {report.imageIds.map((imageId) => (
                      <Image
                        key={imageId}
                        src={`/api/odoo/attachments/${imageId}`}
                        alt="Тайлангийн зураг"
                        width={240}
                        height={160}
                        unoptimized
                      />
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {!work.reports.length ? <p className={styles.emptyState}>Тайлан одоогоор алга.</p> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
