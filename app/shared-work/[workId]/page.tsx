import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardList, Route, Save, Truck, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import {
  completeSharedDepartmentTaskAction,
  createSharedOperationalTaskAction,
  updateSharedDepartmentTaskAction,
} from "@/app/shared-work/actions";
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
  type SharedWorkOption,
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

function selectedOptions(options: SharedWorkOption[], ids: number[]) {
  const idSet = new Set(ids);
  return options.filter((option) => idSet.has(option.id));
}

function SelectMany({
  label,
  name,
  options,
  selectedIds,
}: {
  label: string;
  name: string;
  options: SharedWorkOption[];
  selectedIds: number[];
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select name={name} multiple size={Math.min(6, Math.max(3, options.length))} defaultValue={selectedIds.map(String)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}{option.note ? ` · ${option.note}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function DepartmentTaskPanel({
  workId,
  task,
  employees,
  vehicles,
  teams,
  routes,
}: {
  workId: number;
  task: SharedWorkDepartmentTask;
  employees: SharedWorkOption[];
  vehicles: SharedWorkOption[];
  teams: SharedWorkOption[];
  routes: SharedWorkOption[];
}) {
  const scopedEmployees = employees.filter((employee) => !employee.departmentId || employee.departmentId === task.departmentId);
  const scopedVehicles = vehicles.filter((vehicle) => !vehicle.departmentId || vehicle.departmentId === task.departmentId);
  const scopedRoutes = routes.filter((route) => !route.departmentId || route.departmentId === task.departmentId);
  const selectedEmployees = selectedOptions(employees, task.assignedEmployeeIds);
  const selectedVehicles = selectedOptions(vehicles, task.assignedVehicleIds);
  const selectedTeams = selectedOptions(teams, task.teamIds);
  const selectedRoutes = selectedOptions(routes, task.routeIds);

  return (
    <article className={styles.sharedWorkTaskPanel}>
      <div className={styles.sharedWorkTaskHeader}>
        <div>
          <span className={styles.kicker}>Хэлтсийн ажил</span>
          <h2>{task.departmentName}</h2>
          <p>{task.departmentHeadName}</p>
        </div>
        <span className={styles.sharedWorkTaskStatus}>{task.statusLabel}</span>
      </div>

      <div className={styles.sharedWorkProgressHeader}>
        <span>Явц</span>
        <strong>{task.progress}%</strong>
      </div>
      <div className={styles.progressTrack}>
        <span style={{ width: `${Math.max(Math.min(task.progress, 100), task.progress ? 8 : 0)}%` }} />
      </div>

      <div className={styles.sharedWorkAssignmentSummary}>
        <span>
          <UsersRound aria-hidden />
          {selectedEmployees.length ? selectedEmployees.map((item) => item.name).join(", ") : "Ажилтан оноогоогүй"}
        </span>
        <span>
          <Truck aria-hidden />
          {selectedVehicles.length ? selectedVehicles.map((item) => item.name).join(", ") : "Машин оноогоогүй"}
        </span>
        <span>
          <ClipboardList aria-hidden />
          {selectedTeams.length ? selectedTeams.map((item) => item.name).join(", ") : "Баг оноогоогүй"}
        </span>
        <span>
          <Route aria-hidden />
          {selectedRoutes.length ? selectedRoutes.map((item) => item.name).join(", ") : "Маршрут оноогоогүй"}
        </span>
      </div>

      <form action={updateSharedDepartmentTaskAction} className={styles.sharedWorkTaskForm}>
        <input type="hidden" name="shared_work_id" value={workId} />
        <input type="hidden" name="department_task_id" value={task.id} />
        <div className={styles.sharedWorkInlineGrid}>
          <label className={styles.field}>
            <span>Төлөв</span>
            <select name="status" defaultValue={task.status}>
              <option value="pending">Хүлээгдэж байгаа</option>
              <option value="planned">Төлөвлөсөн</option>
              <option value="in_progress">Явагдаж байгаа</option>
              <option value="blocked">Саатсан</option>
              <option value="completed">Дууссан</option>
              <option value="cancelled">Цуцлагдсан</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Явц /%/</span>
            <input name="progress_percent" type="number" min="0" max="100" defaultValue={task.progress} />
          </label>
        </div>
        <SelectMany label="Ажилтнууд" name="assigned_employee_ids" options={scopedEmployees} selectedIds={task.assignedEmployeeIds} />
        <SelectMany label="Машинууд" name="assigned_vehicle_ids" options={scopedVehicles} selectedIds={task.assignedVehicleIds} />
        <SelectMany label="Багууд" name="team_ids" options={teams} selectedIds={task.teamIds} />
        <SelectMany label="Маршрут" name="route_ids" options={scopedRoutes} selectedIds={task.routeIds} />
        <label className={styles.field}>
          <span>Тэмдэглэл</span>
          <textarea name="notes" rows={3} defaultValue={task.notes} />
        </label>
        <div className={styles.sharedWorkStickyActions}>
          <button type="submit" className={styles.primaryButton}>
            <Save aria-hidden />
            Хадгалах
          </button>
          <button formAction={completeSharedDepartmentTaskAction} className={styles.secondaryButton}>
            <CheckCircle2 aria-hidden />
            Дуусгах
          </button>
          <button formAction={createSharedOperationalTaskAction} className={styles.secondaryButton}>
            <ClipboardList aria-hidden />
            Дотоод даалгавар үүсгэх
          </button>
        </div>
      </form>
    </article>
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

        <section className={styles.sharedWorkTaskGrid}>
          {work.tasks.map((task) => (
            <DepartmentTaskPanel
              key={task.id}
              workId={work.id}
              task={task}
              employees={detail.employees}
              vehicles={detail.vehicles}
              teams={detail.teams}
              routes={detail.routes}
            />
          ))}
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
