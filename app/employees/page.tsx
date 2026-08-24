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
import { loadAssignableUserOptions } from "@/lib/workspace";
import { HIDE_OVERDUE_UI } from "@/lib/ui-feature-flags";

import { EmployeePicker } from "./employee-picker";

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
  const scopedDepartmentName = await loadSessionDepartmentName(session);

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
              departmentScopeName={scopedDepartmentName}
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

  // Ажилтны лавлах (id → нэр) — гүйцэтгэгчийг таних, систем данс/бусдыг шүүхэд.
  const assignableUsers = await loadAssignableUserOptions({
    login: session.login,
    password: session.password,
  });
  const employeeNameById = new Map(assignableUsers.map((user) => [user.id, user.name] as const));

  // Даалгаврыг ЯГ ГҮЙЦЭТГЭХ ажилтнаар (user_ids/assignee) авна. Багийн ахлагч
  // (дарга) дор бүхэл хэлтсийнх нь ажил хуримтлагдахгүй. Зөвхөн бодит ажилтанд
  // оногдсон ажлыг үлдээж, систем данс руу орсон хэлтсийн даалгаврыг хасна.
  const personTasks = scopedTasks.filter((task) =>
    (task.assigneeIds ?? []).some((assigneeId) => employeeNameById.has(assigneeId)),
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

  // Хүн (user_id) → өөрийн харьяалагдах хэлтэс (HR-ийн department, эцэг замыг хассан)
  const personDepartmentById = new Map(
    assignableUsers
      .filter((user) => (user.departmentName ?? "").trim())
      .map((user) => {
        const full = (user.departmentName as string).trim();
        const leaf = full.includes("/") ? full.slice(full.lastIndexOf("/") + 1).trim() : full;
        return [user.id, leaf] as const;
      }),
  );
  const employeeOptionMap = new Map<number, string>();
  for (const task of personTasks) {
    if (task.leaderId != null && !employeeOptionMap.has(task.leaderId)) {
      employeeOptionMap.set(task.leaderId, task.leaderName);
    }
  }
  // Prefer the full assignable-user directory; fall back to existing assignees.
  const employeeOptions = assignableUsers.length
    ? assignableUsers.map((user) => ({
        id: user.id,
        name: user.name,
        jobTitle: user.jobTitle,
        departmentName: user.departmentName,
      }))
    : [...employeeOptionMap]
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));
  const projectOptions = [...snapshot.projects]
    .map((project) => ({ id: project.id, name: project.name }))
    .sort((left, right) => left.name.localeCompare(right.name, "mn-MN"));
  const canAssignTask = canCreateTasks && employeeOptions.length > 0 && projectOptions.length > 0;

  // Харуулахгүй байх хэсэг/ажилтнууд (жижиг үсгээр, дэд-мөрөөр таарна)
  const EXCLUDED_DEPARTMENTS = [
    "системийн админ",
    "хог тээвэр",
    "цэвэрлэгээ",
    "авто бааз",
    "ногоон",
  ];
  const EXCLUDED_PEOPLE = [
    "системийн админ",
    "уртбаяр",
    "эрдэнэбат",
    "эрдэнэбулга",
    "сонорбилэг",
    "батсуурь",
    "чулуун",
    "чимэдочир",
    "чимэд-очир",
    "амарсанаа",
    "ганзориг",
  ];
  const isExcludedDept = (name: string) => {
    const key = name.trim().toLowerCase();
    return EXCLUDED_DEPARTMENTS.some((needle) => key.includes(needle));
  };
  const isExcludedPerson = (name: string) => {
    const key = name.trim().toLowerCase();
    return EXCLUDED_PEOPLE.some((needle) => key.includes(needle));
  };

  // Гүйцэтгэгч (assignee) тус бүрээр бүлэглэнэ. Лавлахад байхгүй хэрэглэгч
  // (жиш. системийн данс руу оногдсон хэлтсийн даалгавар) энд орохгүй.
  const groups = new Map<number, { id: number; name: string; tasks: TaskDirectoryItem[] }>();
  for (const task of deptTasks) {
    for (const assigneeId of task.assigneeIds ?? []) {
      const name = employeeNameById.get(assigneeId);
      if (!name) continue;
      const group = groups.get(assigneeId);
      if (group) {
        group.tasks.push(task);
      } else {
        groups.set(assigneeId, { id: assigneeId, name, tasks: [task] });
      }
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
      // Хүний хэлтсийг өөрийнх нь HR харьяаллаар (task-ийн хэлтсээр биш) харуулна
      const department =
        personDepartmentById.get(group.id) ||
        mostCommon(group.tasks.map((task) => task.departmentName));
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
    .filter((employee) => employee.visibleTasks.length > 0 && !isExcludedPerson(employee.name))
    .sort(
      (left, right) =>
        right.overdue - left.overdue ||
        right.review - left.review ||
        right.assigned - left.assigned,
    );

  // Хэлтсийн ажил: бодит ажилтанд биш (систем данс руу) оногдсон, хэлтэстэй
  // даалгаврыг ажилтанд тараалгүй, ХЭЛТСЭЭР нь бүлэглэнэ.
  const departmentWork = scopedTasks.filter(
    (task) =>
      (task.assigneeIds?.length ?? 0) > 0 &&
      !(task.assigneeIds ?? []).some((assigneeId) => employeeNameById.has(assigneeId)) &&
      Boolean((task.departmentName ?? "").trim()) &&
      (!selectedDept || task.departmentName.trim() === selectedDept),
  );
  const deptGroupMap = new Map<string, TaskDirectoryItem[]>();
  for (const task of departmentWork) {
    const key = task.departmentName.trim();
    const arr = deptGroupMap.get(key);
    if (arr) arr.push(task);
    else deptGroupMap.set(key, [task]);
  }
  const departmentGroups = [...deptGroupMap.entries()]
    .map(([name, tasks]) => {
      const assigned = tasks.length;
      const done = tasks.filter(isTaskDone).length;
      const overdue = tasks.filter((task) => isTaskOverdue(task, todayKey)).length;
      const progress = assigned
        ? Math.round(tasks.reduce((sum, task) => sum + (task.progress || 0), 0) / assigned)
        : 0;
      const visibleTasks = (
        selectedStatus === "all"
          ? tasks
          : tasks.filter((task) => matchesStatus(task, selectedStatus, todayKey))
      ).sort((left, right) => {
        const rank = (task: TaskDirectoryItem) =>
          isTaskOverdue(task, todayKey) ? 0 : isTaskReview(task) ? 1 : isTaskDone(task) ? 3 : 2;
        return rank(left) - rank(right);
      });
      return { name, assigned, done, overdue, progress, visibleTasks };
    })
    .filter((group) => group.visibleTasks.length > 0 && !isExcludedDept(group.name))
    .sort((left, right) => right.overdue - left.overdue || right.assigned - left.assigned);

  // Картууд нь өөрсдөө статусын шүүлтүүр болно (доод статус-эгнээг давхардуулахгүй)
  const summary: Array<{
    key: string;
    label: string;
    value: number;
    icon: typeof Users;
    tone: string;
    status: StatusFilter | null;
  }> = [
    { key: "emp", label: "Ажилтан", value: employees.length, icon: Users, tone: "", status: null },
    { key: "assigned", label: "Даалгавар", value: deptTasks.length, icon: ClipboardList, tone: "", status: "all" },
    { key: "done", label: "Дууссан", value: deptTasks.filter(isTaskDone).length, icon: CheckCircle2, tone: "ok", status: "done" },
    { key: "prog", label: "Хийгдэж буй", value: deptTasks.filter(isTaskInProgress).length, icon: Clock3, tone: "", status: "progress" },
    { key: "over", label: "Хугацаа хэтэрсэн", value: deptTasks.filter((task) => isTaskOverdue(task, todayKey)).length, icon: AlertTriangle, tone: "warn", status: "overdue" },
    { key: "review", label: "Батлах хүлээж", value: deptTasks.filter(isTaskReview).length, icon: ShieldCheck, tone: "warn", status: "review" },
  ].filter((item) => !HIDE_OVERDUE_UI || item.status !== "overdue") as Array<{
    key: string;
    label: string;
    value: number;
    icon: typeof Users;
    tone: string;
    status: StatusFilter | null;
  }>;

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
                <EmployeePicker options={employeeOptions} />
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
                <input name="deadline" type="text" inputMode="numeric" placeholder="YYYY-MM-DD" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}" maxLength={10} />
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
          const toneClass = item.tone ? styles[item.tone] : "";
          const body = (
            <>
              <span className={styles.statIcon}>
                <Icon size={16} aria-hidden />
              </span>
              <strong className={styles.statValue}>{item.value}</strong>
              <span className={styles.statLabel}>{item.label}</span>
            </>
          );
          if (!item.status) {
            return (
              <div key={item.key} className={`${styles.stat} ${toneClass}`}>
                {body}
              </div>
            );
          }
          const active = selectedStatus === item.status;
          return (
            <Link
              key={item.key}
              href={buildHref({ status: item.status })}
              className={`${styles.stat} ${styles.statLink} ${toneClass} ${active ? styles.statActive : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {body}
            </Link>
          );
        })}
      </section>

      {employees.length ? (
        <section className={styles.list}>
          <h2 className={styles.groupHeading}>Ажилтны даалгавар</h2>
          {employees.map((employee, index) => (
            <details
              key={`${employee.name}-${index}`}
              className={styles.emp}
              open={selectedStatus !== "all" || Boolean(selectedDept)}
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
                  {!HIDE_OVERDUE_UI && employee.overdue > 0 ? (
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

      {departmentGroups.length ? (
        <section className={styles.list}>
          <h2 className={styles.groupHeading}>Хэлтсийн ажил</h2>
          {departmentGroups.map((group, index) => (
            <details
              key={group.name}
              className={styles.emp}
              open={selectedStatus !== "all" || Boolean(selectedDept)}
            >
              <summary className={styles.empHead}>
                <span className={styles.avatar}>{initialsOf(group.name)}</span>
                <span className={styles.empIdentity}>
                  <span className={styles.empName}>
                    {group.name}
                    <ChevronDown size={15} className={styles.empChevron} aria-hidden />
                  </span>
                  <span className={styles.empRole}>Хэлтэст даалгасан ажил</span>
                </span>
                <span className={styles.empProgress}>
                  <span className={styles.empProgressTop}>
                    Явц <b>{group.progress}%</b>
                  </span>
                  <span className={styles.empBar} aria-hidden>
                    <i style={{ width: `${group.progress}%` }} />
                  </span>
                </span>
                <span className={styles.empMini}>
                  <span>
                    Нийт <b>{group.assigned}</b>
                  </span>
                  <span>
                    Дууссан <b>{group.done}</b>
                  </span>
                  {!HIDE_OVERDUE_UI && group.overdue > 0 ? (
                    <span className={styles.miniWarn}>
                      Хэтэрсэн <b>{group.overdue}</b>
                    </span>
                  ) : (
                    <span className={styles.miniOk}>Асуудалгүй</span>
                  )}
                </span>
              </summary>

              <div className={styles.tasks}>
                {group.visibleTasks.map((task) => {
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
      ) : null}
    </div>,
  );
}
