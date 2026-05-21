import Link from "next/link";
import { CalendarDays, CheckCircle2, CirclePlus, MapPin, UsersRound } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { createSharedWorkAction } from "@/app/shared-work/actions";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  getSessionRoleLabel,
  hasCapability,
  requireSession,
} from "@/lib/auth";
import {
  loadSharedWorkBoard,
  type SharedWorkFilter,
  type SharedWorkItem,
} from "@/lib/shared-work";
import { loadWorkspaceNotificationCount } from "@/lib/workspace-notifications";
import styles from "@/app/workspace.module.css";

type PageProps = {
  searchParams?: Promise<{
    view?: string | string[];
    notice?: string | string[];
    error?: string | string[];
  }>;
};

const FILTERS: Array<{ key: SharedWorkFilter; label: string; href: string }> = [
  { key: "all", label: "Бүгд", href: "/shared-work" },
  { key: "mine", label: "Миний хэлтсийн ажил", href: "/shared-work?view=mine" },
  { key: "progress", label: "Явагдаж байгаа", href: "/shared-work?view=progress" },
  { key: "completed", label: "Дууссан", href: "/shared-work?view=completed" },
  { key: "reports", label: "Тайлан", href: "/shared-work?view=reports" },
];

function getParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeFilter(value: string): SharedWorkFilter {
  return FILTERS.some((filter) => filter.key === value) ? (value as SharedWorkFilter) : "all";
}

function formatDate(value: string) {
  if (!value) {
    return "Огноо тодорхойгүй";
  }
  return value.replace("T", " ").slice(0, 16);
}

function StatusBadge({ work }: { work: SharedWorkItem }) {
  return (
    <span className={`${styles.sharedWorkBadge} ${styles[`sharedWorkBadge_${work.statusTone}`]}`}>
      {work.statusLabel}
    </span>
  );
}

function SharedWorkCard({ work }: { work: SharedWorkItem }) {
  return (
    <article className={styles.sharedWorkCard}>
      <Link href={`/shared-work/${work.id}`} className={styles.sharedWorkCardLink}>
        <div className={styles.sharedWorkCardTop}>
          <span>{work.code}</span>
          <StatusBadge work={work} />
        </div>
        <h2>{work.name}</h2>
        <div className={styles.sharedWorkMetaGrid}>
          <span>
            <MapPin aria-hidden />
            {work.locationText || "Байршил оруулаагүй"}
          </span>
          <span>
            <CalendarDays aria-hidden />
            {formatDate(work.plannedStartDate)}
          </span>
          <span>
            <UsersRound aria-hidden />
            {work.involvedDepartments.length} хэлтэс
          </span>
        </div>
        <div className={styles.sharedWorkDepartmentChips}>
          {work.involvedDepartments.slice(0, 5).map((department) => (
            <span key={department}>{department}</span>
          ))}
        </div>
        <div className={styles.sharedWorkProgressHeader}>
          <span>Нийт явц</span>
          <strong>{work.progress}%</strong>
        </div>
        <div className={styles.progressTrack}>
          <span style={{ width: `${Math.max(Math.min(work.progress, 100), work.progress ? 8 : 0)}%` }} />
        </div>
        <div className={styles.sharedWorkRows}>
          {work.tasks.map((task) => (
            <div key={task.id} className={styles.sharedWorkProgressRow}>
              <span>{task.departmentName}</span>
              <strong>{task.progress}%</strong>
            </div>
          ))}
        </div>
      </Link>
    </article>
  );
}

export default async function SharedWorkPage({ searchParams }: PageProps) {
  const [params, session] = await Promise.all([
    searchParams ?? Promise.resolve({} as Awaited<NonNullable<PageProps["searchParams"]>>),
    requireSession(),
  ]);
  const filter = normalizeFilter(getParam(params.view));
  const roleLabel = getSessionRoleLabel(session);
  const [board, notificationCount, departmentScopeName] = await Promise.all([
    loadSharedWorkBoard(session, filter),
    loadWorkspaceNotificationCount(session),
    loadSessionDepartmentName(session),
  ]);
  const notice = getParam(params.notice);
  const error = getParam(params.error);
  const canCreate = hasCapability(session, "create_projects");
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
          title="Хамтарсан ажил"
          subtitle="Олон хэлтэс хамтрах мастер ажил болон хэлтэс тус бүрийн явцыг нэгтгэн харуулна."
          userName={session.name}
          roleLabel={roleLabel}
          notificationCount={notificationCount}
        />

        <section className={styles.sharedWorkHero}>
          <div>
            <span className={styles.kicker}>Coordination layer</span>
            <h1>Нэг мастер ажил, хэлтэс бүр өөрийн даалгавартай</h1>
            <p>
              Хамтарсан ажил үүсгэхэд сонгосон хэлтэс бүр дээр тусдаа хэлтсийн ажил автоматаар үүснэ.
            </p>
          </div>
          <div className={styles.sharedWorkHeroStats}>
            <strong>{board.works.length}</strong>
            <span>ажил</span>
            <strong>{board.works.reduce((sum, work) => sum + work.tasks.length, 0)}</strong>
            <span>хэлтсийн даалгавар</span>
          </div>
        </section>

        {notice ? <p className={styles.noticeBanner}>{notice}</p> : null}
        {error ? <p className={styles.errorCard}>{error}</p> : null}

        <nav className={styles.sharedWorkFilterBar} aria-label="Хамтарсан ажлын шүүлтүүр">
          {FILTERS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`${styles.filterChip} ${filter === item.key ? styles.filterChipActive : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {canCreate ? (
          <section className={styles.formCard}>
            <div className={styles.sharedWorkSectionHeader}>
              <div>
                <span className={styles.kicker}>Шинэ хамтарсан ажил</span>
                <h2>Мастер ажил үүсгэх</h2>
              </div>
            </div>
            <form action={createSharedWorkAction} className={styles.sharedWorkCreateForm}>
              <div className={styles.sharedWorkInlineGrid}>
                <label className={styles.field}>
                  <span>Ажлын нэр</span>
                  <input name="name" placeholder="Их цэвэрлэгээ" required />
                </label>
                <label className={styles.field}>
                  <span>Байршил</span>
                  <input name="location_text" placeholder="3-р хороо, үерийн далан" />
                </label>
              </div>
              <label className={styles.field}>
                <span>Тайлбар</span>
                <textarea name="description" rows={3} placeholder="Хэлтсүүдийн хамтран гүйцэтгэх ерөнхий хүрээ" />
              </label>
              <div className={styles.sharedWorkInlineGrid}>
                <label className={styles.field}>
                  <span>Эрэмбэ</span>
                  <select name="priority" defaultValue="1">
                    <option value="0">Энгийн</option>
                    <option value="1">Чухал</option>
                    <option value="2">Яаралтай</option>
                    <option value="3">Маш яаралтай</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Эхлэх огноо</span>
                  <input type="datetime-local" name="planned_start_date" />
                </label>
                <label className={styles.field}>
                  <span>Дуусах огноо</span>
                  <input type="datetime-local" name="planned_end_date" />
                </label>
              </div>
              <div>
                <div className={styles.sharedWorkSectionHeader}>
                  <div>
                    <span className={styles.kicker}>Оролцох хэлтэс</span>
                    <h2>Хэлтэс сонгох</h2>
                  </div>
                </div>
                <div className={styles.sharedWorkDepartmentPicker}>
                  {board.departments.map((department) => (
                    <label key={department.id} className={styles.sharedWorkDepartmentCard}>
                      <input type="checkbox" name="department_ids" value={department.id} />
                      <span>
                        <strong>{department.name}</strong>
                        <small>{department.note}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <label className={styles.field}>
                <span>Хавсралт</span>
                <input type="file" name="attachments" multiple />
              </label>
              <div className={styles.sharedWorkTaskPreview}>
                <CheckCircle2 aria-hidden />
                Сонгосон хэлтэс бүр дээр нэг хэлтсийн ажил автоматаар үүснэ.
              </div>
              <button className={styles.primaryButton} type="submit">
                <CirclePlus aria-hidden />
                Хамтарсан ажил үүсгэх
              </button>
            </form>
          </section>
        ) : null}

        {filter === "reports" ? (
          <section className={styles.formCard}>
            <div className={styles.sharedWorkSectionHeader}>
              <div>
                <span className={styles.kicker}>Тайлан</span>
                <h2>Сүүлийн тайлангууд</h2>
              </div>
            </div>
            <div className={styles.sharedWorkReportList}>
              {board.reports.map((report) => (
                <article key={report.id} className={styles.sharedWorkReportItem}>
                  <strong>{report.departmentTaskName}</strong>
                  <span>{report.employeeName} · {formatDate(report.createdAt)}</span>
                  <p>{report.note}</p>
                </article>
              ))}
              {!board.reports.length ? <p className={styles.emptyState}>Тайлан одоогоор алга.</p> : null}
            </div>
          </section>
        ) : (
          <section className={styles.sharedWorkGrid}>
            {board.works.map((work) => (
              <SharedWorkCard key={work.id} work={work} />
            ))}
            {!board.works.length ? (
              <div className={styles.emptyState}>
                {board.source === "uninstalled"
                  ? "shared.work model хараахан идэвхжээгүй байна. Odoo module upgrade хийсний дараа өгөгдөл гарна."
                  : "Хамтарсан ажил одоогоор алга."}
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}
