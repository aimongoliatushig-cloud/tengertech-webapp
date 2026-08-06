import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Building2,
  Flag,
  ShieldCheck,
} from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
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
import { DEPARTMENT_GROUPS, matchesDepartmentGroup } from "@/lib/department-groups";
import { loadMunicipalSnapshot, type DashboardSnapshot, type TaskDirectoryItem } from "@/lib/odoo";

import styles from "@/app/employees/employees.module.css";

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

function resolveDepartmentGroupName(departmentName?: string | null) {
  const raw = departmentName?.trim() || "";
  const group = DEPARTMENT_GROUPS.find((candidate) => matchesDepartmentGroup(candidate, raw));
  return group?.name ?? (raw || "Тодорхойгүй хэлтэс");
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

type DepartmentWorkPageProps = {
  searchParams?: Promise<{
    status?: string | string[];
    department?: string | string[];
  }>;
};

export default async function DepartmentWorkPage({ searchParams }: DepartmentWorkPageProps) {
  const session = await requireSession();
  const queryParams = (await searchParams) ?? {};
  const selectedStatus = normalizeStatus(getParam(queryParams.status));
  const departmentParam = getParam(queryParams.department).trim();

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
              active="department-work"
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
              title={departmentParam || "Хэлтсийн ажил"}
              subtitle={
                departmentParam
                  ? "Тухайн хэлтсийн ажил, даалгаврыг төслөөр нь"
                  : "Хэлтэс бүрийн ажил, даалгавар, явцыг нэг дороос"
              }
              userName={session.name}
              roleLabel={getSessionRoleLabel(session)}
              notificationCount={0}
              notificationNote="Хэлтсийн ачааллын нэгдсэн харагдац"
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
    console.error("Department work page data load failed:", error);
    return shell(
      <div className={styles.emptyState}>
        <h3>Мэдээлэл ачаалж чадсангүй</h3>
        <p>Odoo холболт түр саатсан байна. Хэсэг хугацааны дараа дахин оролдоно уу.</p>
      </div>,
    );
  }

  const todayKey = getTodayDateKey();
  const scopedTasks = scopedDepartmentName
    ? snapshot.taskDirectory.filter((task) => {
        const effectiveDepartmentName =
          !task.isDepartmentTask && task.assigneeDepartmentName
            ? task.assigneeDepartmentName
            : task.departmentName;
        return (
          filterByDepartment(
            [{ departmentName: effectiveDepartmentName }],
            scopedDepartmentName,
          ).length > 0
        );
      })
    : snapshot.taskDirectory;

  // When a department is selected, scope to it and group by project (ажил);
  // otherwise show every department grouped by department.
  const groupByProject = Boolean(departmentParam);
  const baseTasks = departmentParam
    ? filterByDepartment(scopedTasks, departmentParam)
    : scopedTasks;

  const groups = new Map<string, { name: string; tasks: TaskDirectoryItem[] }>();
  for (const task of baseTasks) {
    const name = groupByProject
      ? task.projectName?.trim() || "Ажилгүй даалгавар"
      : resolveDepartmentGroupName(task.departmentName);
    const group = groups.get(name);
    if (group) {
      group.tasks.push(task);
    } else {
      groups.set(name, { name, tasks: [task] });
    }
  }

  const departments = [...groups.values()]
    .map((group) => {
      const assigned = group.tasks.length;
      const done = group.tasks.filter(isTaskDone).length;
      const review = group.tasks.filter(isTaskReview).length;
      const overdue = group.tasks.filter((task) => isTaskOverdue(task, todayKey)).length;
      const inProgress = group.tasks.filter(isTaskInProgress).length;
      const progress = assigned
        ? Math.round(group.tasks.reduce((sum, task) => sum + (task.progress || 0), 0) / assigned)
        : 0;
      const projectCount = new Set(group.tasks.map((task) => task.projectName).filter(Boolean)).size;
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
        assigned,
        done,
        review,
        overdue,
        inProgress,
        progress,
        projectCount,
        visibleTasks,
      };
    })
    .filter((department) => department.visibleTasks.length > 0)
    .sort(
      (left, right) =>
        right.overdue - left.overdue ||
        right.review - left.review ||
        right.assigned - left.assigned,
    );

  const buildHref = (status: StatusFilter) => {
    const next = new URLSearchParams();
    if (departmentParam) next.set("department", departmentParam);
    if (status !== "all") next.set("status", status);
    const queryString = next.toString();
    return `/department-work${queryString ? `?${queryString}` : ""}`;
  };

  // Хянах самбарын хэлтсийн картан дээр харагддаг гүйцэтгэлийн хэсэг —
  // дарж ортол алга болдог байсныг энд мөн үзүүлнэ (ижил тооцоолол).
  const doneCount = baseTasks.filter(isTaskDone).length;
  const riskyCount = baseTasks.filter(
    (task) => isTaskOverdue(task, todayKey) || isTaskReview(task),
  ).length;
  const overallProgress = baseTasks.length
    ? Math.round(
        baseTasks.reduce((sum, task) => sum + (task.progress || 0), 0) / baseTasks.length,
      )
    : 0;

  // Нэгтгэл + статусын шүүлтийг нэг эгнээ, адил хэмжээтэй, дарж болох карт болгов.
  // Карт бүр дээр дарахад тухайн шүүлт рүү шилжинэ.
  const statCards: Array<{
    key: string;
    label: string;
    value: number;
    status: StatusFilter;
    icon: typeof Building2;
    tone: string;
  }> = [
    { key: "dept", label: groupByProject ? "Ажил" : "Хэлтэс", value: groups.size, status: "all", icon: Building2, tone: "" },
    { key: "all", label: "Бүгд", value: baseTasks.length, status: "all", icon: ClipboardList, tone: "" },
    { key: "overdue", label: "Хугацаа хэтэрсэн", value: baseTasks.filter((task) => isTaskOverdue(task, todayKey)).length, status: "overdue", icon: AlertTriangle, tone: "warn" },
    { key: "review", label: "Батлах хүлээж", value: baseTasks.filter(isTaskReview).length, status: "review", icon: ShieldCheck, tone: "warn" },
    { key: "progress", label: "Хийгдэж буй", value: baseTasks.filter(isTaskInProgress).length, status: "progress", icon: Clock3, tone: "" },
    { key: "done", label: "Дууссан", value: baseTasks.filter(isTaskDone).length, status: "done", icon: CheckCircle2, tone: "ok" },
  ];

  return shell(
    <div className={styles.page}>
      {departmentParam ? (
        <Link
          href="/department-work"
          style={{
            justifySelf: "start",
            color: "var(--brand-900)",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          ← Бүх хэлтэс
        </Link>
      ) : null}

      <section
        className={styles.summary}
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}
      >
        {statCards.map((item) => {
          const Icon = item.icon;
          const active = item.key !== "dept" && selectedStatus === item.status;
          return (
            <Link
              key={item.key}
              href={buildHref(item.status)}
              className={`${styles.stat} ${styles.statLink} ${item.tone ? styles[item.tone] : ""} ${active ? styles.statActive : ""}`}
            >
              <span className={styles.statIcon}>
                <Icon size={16} aria-hidden />
              </span>
              <strong className={styles.statValue}>{item.value}</strong>
              <span className={styles.statLabel}>{item.label}</span>
            </Link>
          );
        })}
      </section>

      {baseTasks.length ? (
        <section className={styles.progressCard}>
          <div className={styles.progressHead}>
            <span>Ажлын гүйцэтгэл</span>
            <strong>{overallProgress}%</strong>
          </div>
          <div className={styles.progressTrack}>
            <span className={styles.progressFill} style={{ width: `${overallProgress}%` }} />
          </div>
          <div className={styles.progressFoot}>
            <span>
              Хийгдсэн ажил <b>{doneCount} / {baseTasks.length}</b>
            </span>
            {riskyCount ? (
              <span className={styles.progressRisky}>{riskyCount} анхаарах</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {departments.length ? (
        <section className={styles.list}>
          {departments.map((department, index) => (
            <details
              key={`${department.name}-${index}`}
              className={styles.emp}
              open={selectedStatus !== "all" || index === 0}
            >
              <summary className={styles.empHead}>
                <span className={styles.avatar}>{initialsOf(department.name)}</span>
                <span className={styles.empIdentity}>
                  <span className={styles.empName}>
                    {department.name}
                    <ChevronDown size={15} className={styles.empChevron} aria-hidden />
                  </span>
                  <span className={styles.empRole}>
                    {groupByProject
                      ? `${department.assigned} даалгавар`
                      : `${department.projectCount} ажил · ${department.assigned} даалгавар`}
                  </span>
                </span>
                <span className={styles.empProgress}>
                  <span className={styles.empProgressTop}>
                    Гүйцэтгэл <b>{department.progress}%</b>
                  </span>
                  <span className={styles.empBar} aria-hidden>
                    <i style={{ width: `${department.progress}%` }} />
                  </span>
                </span>
                <span className={styles.empMini}>
                  <span>
                    Дууссан <b>{department.done}</b>
                  </span>
                  <span>
                    Хийгдэж буй <b>{department.inProgress}</b>
                  </span>
                  {department.overdue > 0 ? (
                    <span className={styles.miniWarn}>
                      Хэтэрсэн <b>{department.overdue}</b>
                    </span>
                  ) : (
                    <span className={styles.miniOk}>Асуудалгүй</span>
                  )}
                </span>
              </summary>

              <div className={styles.tasks}>
                {department.visibleTasks.map((task) => {
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
                          {task.leaderName ? (
                            <span className={styles.chip}>
                              <Flag size={11} aria-hidden />
                              {task.leaderName}
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
          <h3>Ажил алга</h3>
          <p>Сонгосон шүүлтэд таарах хэлтсийн ажил одоогоор алга байна.</p>
        </div>
      )}
    </div>,
  );
}
