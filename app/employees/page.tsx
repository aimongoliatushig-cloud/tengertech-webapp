import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Flag,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import { createTaskAction } from "@/app/actions";
import shellStyles from "@/app/workspace.module.css";
import {
  getSessionRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { filterByDepartment, getTodayDateKey } from "@/lib/dashboard-scope";
import { loadMunicipalSnapshot, type DashboardSnapshot, type TaskDirectoryItem } from "@/lib/odoo";

import styles from "./employees.module.css";

export const dynamic = "force-dynamic";

function isTaskDone(task: TaskDirectoryItem) {
  return task.statusKey === "verified" || task.stageBucket === "done";
}
function isTaskReview(task: TaskDirectoryItem) {
  return (
    task.stageBucket === "review" ||
    task.statusKey === "review" ||
    task.statusKey === "problem"
  );
}
function isTaskOverdue(task: TaskDirectoryItem, todayKey: string) {
  return Boolean(
    task.scheduledDate && task.scheduledDate < todayKey && task.statusKey !== "verified",
  );
}
function isTaskInProgress(task: TaskDirectoryItem) {
  return (
    !isTaskDone(task) &&
    (task.stageBucket === "progress" ||
      task.stageBucket === "todo" ||
      task.stageBucket === "unknown")
  );
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const letters = parts.slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("mn-MN") ?? "");
  return letters.join("") || "?";
}

const DEPARTMENT_LEADER_TOKENS = ["хэлтэс", "алба", "бааз", "нэгж", "дарга", "менежер"];

function isIndividualAssignee(name: string, leaderId?: number | null) {
  if (leaderId == null) return false;
  const normalized = name.trim().toLocaleLowerCase("mn-MN");
  if (!normalized || normalized === "оноогоогүй") return false;
  return !DEPARTMENT_LEADER_TOKENS.some((token) => normalized.includes(token));
}

function mostCommon(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = value;
    }
  }
  return best;
}

type StatusFilter = "all" | "overdue" | "review" | "progress" | "done";
const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "Бүгд" },
  { key: "overdue", label: "Хугацаа хэтэрсэн" },
  { key: "review", label: "Батлах хүлээж" },
  { key: "progress", label: "Хийгдэж буй" },
  { key: "done", label: "Дууссан" },
];

function normalizeStatus(value: string): StatusFilter {
  return STATUS_FILTERS.some((filter) => filter.key === value)
    ? (value as StatusFilter)
    : "all";
}

function matchesStatus(task: TaskDirectoryItem, filter: StatusFilter, todayKey: string) {
  switch (filter) {
    case "overdue":
      return isTaskOverdue(task, todayKey);
    case "review":
      return isTaskReview(task);
    case "progress":
      return isTaskInProgress(task);
    case "done":
      return isTaskDone(task);
    default:
      return true;
  }
}

function getParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

type EmployeesPageProps = {
  searchParams?: Promise<{ status?: string | string[]; dept?: string | string[] }>;
};

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const session = await requireSession();
  const queryParams = (await searchParams) ?? {};
  const selectedStatus = normalizeStatus(getParam(queryParams.status));
  const selectedDept = getParam(queryParams.dept).trim();
  const workerMode = isWorkerOnly(session);
  const masterMode = isMasterRole(session.role);
  const canCreateProject = hasCapability(session, "create_projects");
  const canCreateTasks = hasCapability(session, "create_tasks");
  const canWriteReports = hasCapability(session, "write_workspace_reports");
  const canViewQualityCenter = hasCapability(session, "view_quality_center");
  const canUseFieldConsole = hasCapability(session, "use_field_console");

  const shell = (content: React.ReactNode) => (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="employees"
              canCreateProject={canCreateProject}
              canCreateTasks={canCreateTasks}
              canWriteReports={canWriteReports}
              canViewQualityCenter={canViewQualityCenter}
              canUseFieldConsole={canUseFieldConsole}
              userName={session.name}
              userRole={session.role}
              roleLabel={getSessionRoleLabel(session)}
              groupFlags={session.groupFlags}
              masterMode={masterMode}
              workerMode={workerMode}
              notificationCount={0}
            />
          </aside>
          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="Ажилтны даалгавар"
              subtitle="Тодорхой ажилтанд оноосон даалгавар, явц, гүйцэтгэл (хэлтсийн ажлаас тусад нь)"
              userName={session.name}
              roleLabel={getSessionRoleLabel(session)}
              notificationCount={0}
              notificationNote="Ажилтны ачааллын нэгдсэн харагдац"
            />
            {content}
          </div>
        </div>
      </div>
    </main>
  );

  let snapshot: DashboardSnapshot;
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  try {
    snapshot = await loadMunicipalSnapshot(
      { login: session.login, password: session.password },
      { allowFallback: true },
    );
  } catch (error) {
    console.error("Employees page data load failed:", error);
    return shell(
      <div className={styles.emptyState}>
        <h3>Мэдээлэл ачаалж чадсангүй</h3>
        <p>Odoo холболт түр саатсан байна. Хэсэг хугацааны дараа дахин оролдоно уу.</p>
      </div>,
    );
  }

  const todayKey = getTodayDateKey();
  const scopedTasks = scopedDepartmentName
    ? filterByDepartment(snapshot.taskDirectory, scopedDepartmentName)
    : snapshot.taskDirectory;

  // Only tasks assigned to a specific individual (excludes department-level
  // or unassigned work — those stay on the department/project views).
  const personTasks = scopedTasks.filter((task) =>
    isIndividualAssignee(task.leaderName, task.leaderId),
  );

  const departmentOptions = [
    ...new Set(personTasks.map((task) => task.departmentName).filter(Boolean)),
  ].sort((left, right) => left.localeCompare(right, "mn-MN"));
  const deptTasks = selectedDept
    ? personTasks.filter((task) => task.departmentName === selectedDept)
    : personTasks;

  const buildHref = (patch: { status?: StatusFilter; dept?: string }) => {
    const next = new URLSearchParams();
    const status = patch.status ?? selectedStatus;
    const dept = patch.dept ?? selectedDept;
    if (status !== "all") next.set("status", status);
    if (dept) next.set("dept", dept);
    const queryString = next.toString();
    return `/employees${queryString ? `?${queryString}` : ""}`;
  };

  const employeeOptionMap = new Map<number, string>();
  for (const task of personTasks) {
    if (task.leaderId != null && !employeeOptionMap.has(task.leaderId)) {
      employeeOptionMap.set(task.leaderId, task.leaderName);
    }
  }
  const employeeOptions = [...employeeOptionMap]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));
  const projectOptions = [...snapshot.projects]
    .map((project) => ({ id: project.id, name: project.name }))
    .sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));
  const canAssignTask = canCreateTasks && employeeOptions.length > 0 && projectOptions.length > 0;

  const groups = new Map<string, { name: string; tasks: TaskDirectoryItem[] }>();
  for (const task of deptTasks) {
    const name = task.leaderName?.trim() || "Оноогоогүй";
    const key = task.leaderId != null ? `id:${task.leaderId}` : `nm:${name}`;
    const group = groups.get(key);
    if (group) {
      group.tasks.push(task);
    } else {
      groups.set(key, { name, tasks: [task] });
    }
  }

  const employees = [...groups.values()]
    .map((group) => {
      const assigned = group.tasks.length;
      const done = group.tasks.filter(isTaskDone).length;
      const review = group.tasks.filter(isTaskReview).length;
      const overdue = group.tasks.filter((task) => isTaskOverdue(task, todayKey)).length;
      const inProgress = group.tasks.filter(isTaskInProgress).length;
      const progress = assigned
        ? Math.round(group.tasks.reduce((sum, task) => sum + (task.progress || 0), 0) / assigned)
        : 0;
      const department = mostCommon(group.tasks.map((task) => task.departmentName));
      const tasks = [...group.tasks].sort((left, right) => {
        const rank = (task: TaskDirectoryItem) =>
          isTaskOverdue(task, todayKey) ? 0 : isTaskReview(task) ? 1 : isTaskDone(task) ? 3 : 2;
        return rank(left) - rank(right);
      });
      const visibleTasks =
        selectedStatus === "all"
          ? tasks
          : tasks.filter((task) => matchesStatus(task, selectedStatus, todayKey));
      return {
        name: group.name,
        department,
        assigned,
        done,
        review,
        overdue,
        inProgress,
        progress,
        tasks,
        visibleTasks,
      };
    })
    .filter((employee) => employee.visibleTasks.length > 0)
    .sort(
      (left, right) =>
        right.overdue - left.overdue ||
        right.review - left.review ||
        right.assigned - left.assigned,
    );

  const summary = [
    { key: "emp", label: "Ажилтан", value: employees.length, icon: Users, tone: "" },
    { key: "assigned", label: "Даалгавар", value: deptTasks.length, icon: ClipboardList, tone: "" },
    { key: "done", label: "Дууссан", value: deptTasks.filter(isTaskDone).length, icon: CheckCircle2, tone: "ok" },
    { key: "prog", label: "Хийгдэж буй", value: deptTasks.filter(isTaskInProgress).length, icon: Clock3, tone: "" },
    { key: "over", label: "Хугацаа хэтэрсэн", value: deptTasks.filter((task) => isTaskOverdue(task, todayKey)).length, icon: AlertTriangle, tone: "warn" },
    { key: "review", label: "Батлах хүлээж", value: deptTasks.filter(isTaskReview).length, icon: ShieldCheck, tone: "warn" },
  ];

  return shell(
    <div className={styles.page}>
      {canAssignTask ? (
        <details className={styles.assign}>
          <summary className={styles.assignSummary}>
            <span className={styles.assignSummaryIcon}>
              <Plus size={16} aria-hidden />
            </span>
            Ажилтанд үүрэг даалгавар оноох
            <ChevronDown size={15} className={styles.assignChevron} aria-hidden />
          </summary>
          <form action={createTaskAction} className={styles.assignForm}>
            <div className={styles.assignGrid}>
              <label className={styles.assignField}>
                <span>Ажилтан</span>
                <select name="team_leader_id" required defaultValue="">
                  <option value="" disabled>
                    Сонгох
                  </option>
                  {employeeOptions.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.assignField}>
                <span>Ажил (төсөл)</span>
                <select name="project_id" required defaultValue="">
                  <option value="" disabled>
                    Сонгох
                  </option>
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.assignField}>
                <span>Даалгаврын нэр</span>
                <input name="name" required placeholder="Жишээ: 15-р хороо мод услах" />
              </label>
              <label className={styles.assignField}>
                <span>Хугацаа</span>
                <input name="deadline" type="date" />
              </label>
            </div>
            <button type="submit" className={styles.assignBtn}>
              <Plus size={15} aria-hidden />
              Даалгавар оноох
            </button>
          </form>
        </details>
      ) : null}

      <section className={styles.summary}>
        {summary.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className={`${styles.stat} ${item.tone ? styles[item.tone] : ""}`}>
              <span className={styles.statIcon}>
                <Icon size={16} aria-hidden />
              </span>
              <strong className={styles.statValue}>{item.value}</strong>
              <span className={styles.statLabel}>{item.label}</span>
            </div>
          );
        })}
      </section>

      <div className={styles.filters}>
        {departmentOptions.length > 1 ? (
          <div className={styles.filterRow}>
            <Link
              href={buildHref({ dept: "" })}
              className={`${styles.filterChip} ${selectedDept ? "" : styles.filterChipActive}`}
            >
              Бүх хэлтэс
            </Link>
            {departmentOptions.map((dept) => (
              <Link
                key={dept}
                href={buildHref({ dept })}
                className={`${styles.filterChip} ${selectedDept === dept ? styles.filterChipActive : ""}`}
              >
                {dept}
              </Link>
            ))}
          </div>
        ) : null}
        <div className={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => {
            const count =
              filter.key === "all"
                ? deptTasks.length
                : deptTasks.filter((task) => matchesStatus(task, filter.key, todayKey)).length;
            return (
              <Link
                key={filter.key}
                href={buildHref({ status: filter.key })}
                className={`${styles.filterChip} ${selectedStatus === filter.key ? styles.filterChipActive : ""}`}
              >
                <span>{filter.label}</span>
                <b>{count}</b>
              </Link>
            );
          })}
        </div>
      </div>

      {employees.length ? (
        <section className={styles.list}>
          {employees.map((employee, index) => (
            <details
              key={`${employee.name}-${index}`}
              className={styles.emp}
              open={selectedStatus !== "all" || Boolean(selectedDept) || index === 0}
            >
              <summary className={styles.empHead}>
                <span className={styles.avatar}>{initialsOf(employee.name)}</span>
                <span className={styles.empIdentity}>
                  <span className={styles.empName}>
                    {employee.name}
                    <ChevronDown size={15} className={styles.empChevron} aria-hidden />
                  </span>
                  <span className={styles.empRole}>{employee.department || "Хэлтэс тодорхойгүй"}</span>
                </span>
                <span className={styles.empProgress}>
                  <span className={styles.empProgressTop}>
                    Өнөөдрийн явц <b>{employee.progress}%</b>
                  </span>
                  <span className={styles.empBar} aria-hidden>
                    <i style={{ width: `${employee.progress}%` }} />
                  </span>
                </span>
                <span className={styles.empMini}>
                  <span>
                    Оногдсон <b>{employee.assigned}</b>
                  </span>
                  <span>
                    Дууссан <b>{employee.done}</b>
                  </span>
                  {employee.overdue > 0 ? (
                    <span className={styles.miniWarn}>
                      Хэтэрсэн <b>{employee.overdue}</b>
                    </span>
                  ) : (
                    <span className={styles.miniOk}>Асуудалгүй</span>
                  )}
                </span>
              </summary>

              <div className={styles.tasks}>
                {employee.visibleTasks.map((task) => {
                  const bucket = isTaskOverdue(task, todayKey)
                    ? "over"
                    : isTaskDone(task)
                      ? "done"
                      : isTaskReview(task)
                        ? "review"
                        : "progress";
                  return (
                    <Link key={task.id} href={task.href} className={styles.taskRow}>
                      <span className={`${styles.taskDot} ${styles[`dot_${bucket}`]}`} aria-hidden />
                      <span className={styles.taskMain}>
                        <span className={styles.taskName} title={task.name}>
                          {task.name}
                        </span>
                        <span className={styles.taskChips}>
                          <span className={`${styles.pill} ${styles[`pill_${bucket}`]}`}>
                            {task.statusLabel}
                          </span>
                          {task.priorityLabel ? (
                            <span className={styles.chip}>
                              <Flag size={11} aria-hidden />
                              {task.priorityLabel}
                            </span>
                          ) : null}
                          {task.projectName ? (
                            <span className={styles.chip}>{task.projectName}</span>
                          ) : null}
                        </span>
                      </span>
                      <span className={styles.taskMeta}>
                        <b>{task.progress}%</b>
                        <span>{task.deadline || "Хугацаагүй"}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </details>
          ))}
        </section>
      ) : (
        <div className={styles.emptyState}>
          <h3>Ажилтан алга</h3>
          <p>Одоогоор даалгавар оноогдсон ажилтан харагдахгүй байна.</p>
        </div>
      )}
    </div>,
  );
}
