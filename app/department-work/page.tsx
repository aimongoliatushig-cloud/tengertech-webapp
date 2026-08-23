import Link from "next/link";
import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Building2,
  Flag,
  ShieldCheck,
  Leaf,
  Trash2,
  Truck,
  Wrench,
  Hammer,
  Search,
  UserRound,
  CalendarDays,
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

import styles from "./department-work.module.css";

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
type PeriodFilter = "all" | "today" | "week" | "month";
type GreenServiceUnit = "Ногоон байгууламж" | "Цэвэрлэгээ үйлчилгээ";
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
function normalizePeriod(value: string): PeriodFilter {
  return ["today", "week", "month"].includes(value) ? (value as PeriodFilter) : "all";
}
function normalizeGreenServiceUnit(value: string): GreenServiceUnit | "" {
  return value === "Ногоон байгууламж" || value === "Цэвэрлэгээ үйлчилгээ" ? value : "";
}
function matchesGreenServiceUnit(task: TaskDirectoryItem, unit: GreenServiceUnit) {
  const operationType = task.operationType.toLocaleLowerCase("mn-MN");
  const greenOperation = operationType === "green_maintenance";
  const cleaningOperation = ["street_cleaning", "road_area_cleaning"].includes(operationType);
  const taskName = task.name.toLocaleLowerCase("mn-MN");
  const nonRoadCleaningKeywords = ["малын сэг", "сэг зэм"];

  // Малын сэг зэм устгал, тээвэрлэлт нь зам талбайн цэвэрлэгээний
  // гүйцэтгэл биш тул энэ хоёр нэгжийн самбарт оруулахгүй.
  if (nonRoadCleaningKeywords.some((keyword) => taskName.includes(keyword))) return false;
  // Project names often contain the combined department title
  // ("Ногоон байгууламж, цэвэрлэгээ үйлчилгээ..."). Using that title for
  // keyword inference puts every green task into the cleaning unit as well.
  // Prefer the explicit operation type and only infer from the task itself.
  if (greenOperation) return unit === "Ногоон байгууламж";
  if (cleaningOperation) return unit === "Цэвэрлэгээ үйлчилгээ";

  const greenKeywords = ["ногоон байгууламж", "мод", "зүлэг", "ургамал", "усалгаа", "цэцэг"];
  const cleaningKeywords = ["зам талбай", "замын", "гудамж", "цэвэрлэгээ", "цэвэрлэх", "ариутгал"];
  const greenByName = greenKeywords.some((keyword) => taskName.includes(keyword));
  const cleaningByName = cleaningKeywords.some((keyword) => taskName.includes(keyword));

  // "Ногоон байгууламжийн түүвэр цэвэрлэгээ" шиг нэрэнд хоёр
  // түлхүүр зэрэг ордог. Ийм үед ногоон байгууламжийг давуу ангилна.
  if (greenByName) return unit === "Ногоон байгууламж";
  if (cleaningByName) return unit === "Цэвэрлэгээ үйлчилгээ";

  const label = task.operationTypeLabel.toLocaleLowerCase("mn-MN");
  const greenByLabel = greenKeywords.some((keyword) => label.includes(keyword));
  const cleaningByLabel = cleaningKeywords.some((keyword) => label.includes(keyword));
  return unit === "Ногоон байгууламж" ? greenByLabel : cleaningByLabel;
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
    search?: string | string[];
    dateFrom?: string | string[];
    dateTo?: string | string[];
    employee?: string | string[];
    period?: string | string[];
    unit?: string | string[];
  }>;
};

function normalizeDateFilter(value?: string | string[]) {
  const date = getParam(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

export default async function DepartmentWorkPage({ searchParams }: DepartmentWorkPageProps) {
  const session = await requireSession();
  const queryParams = (await searchParams) ?? {};
  const selectedStatus = normalizeStatus(getParam(queryParams.status));
  const requestedDepartment = getParam(queryParams.department).trim();
  const departmentParam = requestedDepartment === "all" ? "" : requestedDepartment;
  const searchFilter = getParam(queryParams.search).trim().slice(0, 120);
  const normalizedSearchFilter = searchFilter.toLocaleLowerCase("mn-MN");
  const dateFrom = normalizeDateFilter(queryParams.dateFrom);
  const dateTo = normalizeDateFilter(queryParams.dateTo);
  const employeeFilter = getParam(queryParams.employee).trim();
  const periodFilter = normalizePeriod(getParam(queryParams.period));
  const selectedUnit = normalizeGreenServiceUnit(getParam(queryParams.unit));
  const hasListFilter = Boolean(
    searchFilter || dateFrom || dateTo || employeeFilter || periodFilter !== "all" || selectedStatus !== "all",
  );

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
              title={selectedUnit || departmentParam || "Хэлтсийн ажил"}
              subtitle={
                selectedUnit
                  ? `${selectedUnit} нэгжийн захирамж, үүрэг даалгавар, гүйцэтгэл`
                  : departmentParam
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
  const departmentTasks = departmentParam
    ? filterByDepartment(scopedTasks, departmentParam)
    : scopedTasks;
  const unitTasks = selectedUnit
    ? departmentTasks.filter((task) => matchesGreenServiceUnit(task, selectedUnit))
    : departmentTasks;
  const baseTasks = unitTasks.filter((task) => {
    if (normalizedSearchFilter) {
      const searchText = `${task.name} ${task.projectName} ${task.leaderName} ${task.departmentName}`
        .toLocaleLowerCase("mn-MN");
      if (!searchText.includes(normalizedSearchFilter)) return false;
    }
    if (dateFrom || dateTo) {
      const taskDate = task.scheduledDate || task.deadlineDateTime?.slice(0, 10) || "";
      if (!taskDate) return false;
      if (dateFrom && taskDate < dateFrom) return false;
      if (dateTo && taskDate > dateTo) return false;
    }
    if (employeeFilter && task.leaderName !== employeeFilter) return false;
    if (periodFilter !== "all") {
      const taskDate = task.scheduledDate || task.deadlineDateTime?.slice(0, 10) || "";
      if (!taskDate) return false;
      const today = new Date(`${todayKey}T00:00:00`);
      const target = new Date(`${taskDate}T00:00:00`);
      const dayDiff = Math.floor((target.getTime() - today.getTime()) / 86_400_000);
      if (periodFilter === "today" && dayDiff !== 0) return false;
      if (periodFilter === "week" && (dayDiff < 0 || dayDiff > 7)) return false;
      if (periodFilter === "month" && (target.getFullYear() !== today.getFullYear() || target.getMonth() !== today.getMonth())) return false;
    }
    return true;
  });

  const employeeOptions = Array.from(new Set(unitTasks.map((task) => task.leaderName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "mn"));

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
    if (selectedUnit) next.set("unit", selectedUnit);
    if (status !== "all") next.set("status", status);
    if (searchFilter) next.set("search", searchFilter);
    if (dateFrom) next.set("dateFrom", dateFrom);
    if (dateTo) next.set("dateTo", dateTo);
    if (employeeFilter) next.set("employee", employeeFilter);
    if (periodFilter !== "all") next.set("period", periodFilter);
    const queryString = next.toString();
    return `/department-work${queryString ? `?${queryString}` : ""}`;
  };

  const clearFilterParams = new URLSearchParams();
  if (departmentParam || scopedDepartmentName) clearFilterParams.set("department", departmentParam || scopedDepartmentName || "");
  if (selectedUnit) clearFilterParams.set("unit", selectedUnit);
  const clearFilterHref = `/department-work${
    clearFilterParams.toString() ? `?${clearFilterParams.toString()}` : ""
  }`;

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

  const categoryDefinitions = [
    { key: "green", label: "Ногоон байгууламж", keywords: ["ногоон", "мод", "зүлэг", "цэцэг", "усал"], icon: Leaf, tone: "green" },
    { key: "cleaning", label: "Цэвэрлэгээ", keywords: ["цэвэр", "талбай", "явган", "ариутгал"], icon: Trash2, tone: "blue" },
    { key: "garbage", label: "Хог тээвэр", keywords: ["хог", "тээвэр", "маршрут"], icon: Truck, tone: "orange" },
    { key: "repair", label: "Техник, засвар", keywords: ["засвар", "техник", "машин", "тоноглол"], icon: Wrench, tone: "purple" },
    { key: "improvement", label: "Тохижилт", keywords: ["тохиж", "сандал", "хашаа", "гэрэлтүүл"], icon: Hammer, tone: "teal" },
  ] as const;
  const visibleCategoryDefinitions = selectedUnit === "Ногоон байгууламж"
    ? categoryDefinitions.filter((category) => category.key === "green")
    : selectedUnit === "Цэвэрлэгээ үйлчилгээ"
      ? categoryDefinitions.filter((category) => category.key === "cleaning")
      : categoryDefinitions;
  const categoryStats = visibleCategoryDefinitions.map((category) => {
    const tasks = baseTasks.filter((task) => {
      if (category.key === "green") return matchesGreenServiceUnit(task, "Ногоон байгууламж");
      if (category.key === "cleaning") return matchesGreenServiceUnit(task, "Цэвэрлэгээ үйлчилгээ");
      const text = `${task.name} ${task.projectName}`.toLocaleLowerCase("mn-MN");
      return category.keywords.some((keyword) => text.includes(keyword));
    });
    const progress = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + (task.progress || 0), 0) / tasks.length) : 0;
    return { ...category, count: tasks.length, progress };
  }).filter((category) => category.count > 0);

  const upcomingTasks = [...unitTasks]
    .filter((task) => !isTaskDone(task) && Boolean(task.scheduledDate || task.deadlineDateTime))
    .sort((a, b) => (a.scheduledDate || a.deadlineDateTime || "").localeCompare(b.scheduledDate || b.deadlineDateTime || ""))
    .slice(0, 5);
  const myTasks = unitTasks.filter((task) => task.leaderName && task.leaderName === session.name);
  const myDone = myTasks.filter(isTaskDone).length;
  const myProgress = myTasks.length ? Math.round(myDone / myTasks.length * 100) : 0;

  // Нэгтгэл + статусын шүүлтийг нэг эгнээ, адил хэмжээтэй, дарж болох карт болгов.
  // Карт бүр дээр дарахад тухайн шүүлт рүү шилжинэ.
  const statCards: Array<{
    key: string;
    label: string;
    value: number;
    icon: typeof Building2;
    tone: string;
  }> = [
    { key: "dept", label: groupByProject ? "Захирамж, үүрэг даалгавар" : "Хэлтэс", value: groups.size, icon: Building2, tone: "" },
    { key: "all", label: "Бүгд", value: baseTasks.length, icon: ClipboardList, tone: "" },
    { key: "overdue", label: "Хугацаа хэтэрсэн", value: baseTasks.filter((task) => isTaskOverdue(task, todayKey)).length, icon: AlertTriangle, tone: "warn" },
    { key: "review", label: "Батлах хүлээж", value: baseTasks.filter(isTaskReview).length, icon: ShieldCheck, tone: "warn" },
    { key: "progress", label: "Хийгдэж буй", value: baseTasks.filter(isTaskInProgress).length, icon: Clock3, tone: "" },
    { key: "done", label: "Дууссан", value: baseTasks.filter(isTaskDone).length, icon: CheckCircle2, tone: "ok" },
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

      {selectedUnit === "Цэвэрлэгээ үйлчилгээ" ? (
        <section className={styles.roadResponsibility} aria-labelledby="road-responsibility-title">
          <div className={styles.roadResponsibilityHeading}>
            <div>
              <span>Хариуцсан зам талбай</span>
              <h2 id="road-responsibility-title">
                Яармагийн давхар гүүр, Наадамчдын зам, Нүхтийн зам
              </h2>
            </div>
            <strong>Нийт урт 326,400 м</strong>
          </div>
          <a
            className={styles.roadResponsibilityImageLink}
            href="/department-work/naadamchid-road-responsibility.png"
            aria-label="Хариуцсан замын зургийг бүтэн хэмжээгээр нээх"
          >
            <Image
              className={styles.roadResponsibilityImage}
              src="/department-work/naadamchid-road-responsibility.png"
              alt="Яармагийн давхар гүүр, Наадамчдын зам, Нүхтийн замын хариуцсан хэсгийн зураг"
              width={1578}
              height={997}
              sizes="(max-width: 720px) 100vw, (max-width: 1200px) 90vw, 1200px"
              priority
            />
          </a>
          <div className={styles.roadLengthGrid} aria-label="Замын хэсгийн урт">
            <span><b>Яармагийн давхар гүүр</b>97,500 м</span>
            <span><b>Наадамчдын зам</b>190,400 м</span>
            <span><b>Нүхтийн зам</b>38,500 м</span>
          </div>
        </section>
      ) : null}

      {departmentParam === "Тохижилтын хэлтэс" ? (
        <section className={styles.roadResponsibility} aria-labelledby="improvement-overview-title">
          <div className={styles.roadResponsibilityHeading}>
            <div>
              <span>Хэлтсийн танилцуулга</span>
              <h2 id="improvement-overview-title">Тохижилтын хэлтсийн гүйцэтгэх үйл ажиллагаа</h2>
            </div>
            <strong>Хариуцсан 8 хороо</strong>
          </div>
          <a
            className={styles.roadResponsibilityImageLink}
            href="/department-work/improvement-department-overview.png"
            aria-label="Тохижилтын хэлтсийн танилцуулгыг бүтэн хэмжээгээр нээх"
          >
            <Image
              className={styles.roadResponsibilityImage}
              src="/department-work/improvement-department-overview.png"
              alt="Тохижилтын хэлтсийн хариуцсан хороод, гүйцэтгэх үйл ажиллагаа, ажлын үе шат"
              width={1536}
              height={1024}
              sizes="(max-width: 720px) 100vw, (max-width: 1200px) 90vw, 900px"
              priority
            />
          </a>
        </section>
      ) : null}

      <form method="get" action="/department-work" className={shellStyles.dateFilterBar}>
        {selectedUnit ? <input type="hidden" name="unit" value={selectedUnit} /> : null}
        {scopedDepartmentName || departmentParam ? (
          <input type="hidden" name="department" value={departmentParam || scopedDepartmentName || ""} />
        ) : (
          <label className={shellStyles.departmentFilterField}>
            <span>Хэлтэс / алба</span>
            <select name="department" defaultValue={departmentParam || "all"}>
              <option value="all">Бүх хэлтэс</option>
              {DEPARTMENT_GROUPS.map((department) => (
                <option key={department.name} value={department.name}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={shellStyles.dateFilterSearch}>
          <span>Ажил, даалгаврын нэр</span>
          <span className={styles.searchWrap}><Search size={15} aria-hidden /><input type="search" name="search" defaultValue={searchFilter} placeholder="Ажил, даалгавар хайх..." /></span>
        </label>
        <label><span>Хариуцагч</span><select name="employee" defaultValue={employeeFilter}><option value="">Бүгд</option>{employeeOptions.map((employee) => <option key={employee} value={employee}>{employee}</option>)}</select></label>
        <label>
          <span>Төлөв</span>
          <select name="status" defaultValue={selectedStatus}>
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.key} value={filter.key}>{filter.label}</option>
            ))}
          </select>
        </label>
        <label><span>Хугацаа</span><select name="period" defaultValue={periodFilter}><option value="all">Бүгд</option><option value="today">Өнөөдөр</option><option value="week">7 хоног</option><option value="month">Энэ сар</option></select></label>
        <label>
          <span>Эхлэх огноо</span>
          <input type="date" name="dateFrom" defaultValue={dateFrom} max={dateTo || undefined} />
        </label>
        <label>
          <span>Дуусах огноо</span>
          <input type="date" name="dateTo" defaultValue={dateTo} min={dateFrom || undefined} />
        </label>
        <button type="submit" className={shellStyles.primaryButton}>Шүүх</button>
        {hasListFilter ? (
          <Link href={clearFilterHref} className={shellStyles.secondaryButton}>Шүүлтүүр арилгах</Link>
        ) : null}
        <small>{baseTasks.length} даалгавар шүүлтэд таарлаа.</small>
      </form>

      <section
        className={styles.summary}
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}
      >
        {statCards.map((item) => {
          const Icon = item.icon;
          const cardStatus = item.key === "dept" ? "all" : item.key as StatusFilter;
          const isActive = item.key !== "dept" && selectedStatus === cardStatus;
          return (
            <Link
              key={item.key}
              href={buildHref(cardStatus)}
              className={`${styles.stat} ${styles.statLink} ${item.tone ? styles[item.tone] : ""} ${isActive ? styles.statActive : ""}`}
              aria-current={isActive ? "page" : undefined}
              title={`${item.label}: ${item.value}`}
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

      {categoryStats.length && !selectedUnit && !departmentParam ? <section className={styles.categorySection}><h2>Ажлын ангилал</h2><div className={styles.categoryGrid}>{categoryStats.map((category) => { const Icon = category.icon; return <article key={category.key} className={`${styles.categoryCard} ${styles[`category_${category.tone}`]}`}><span className={styles.categoryIcon}><Icon size={22} aria-hidden /></span><span><strong>{category.label}</strong><small>{category.count} ажил</small></span><b>{category.progress}%</b><span className={styles.categoryTrack}><i style={{ width: `${category.progress}%` }} /></span></article>; })}</div></section> : null}

      <div className={styles.boardGrid}>
      {departments.length ? (
        <section className={styles.list}><div className={styles.listHeading}><div><h2>Даалгаврын жагсаалт</h2><span>{baseTasks.length} нийт ажил</span></div></div>
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
      <aside className={styles.insightColumn}>
        <section className={styles.sideCard}><div className={styles.sideHeading}><div><CalendarDays size={17} aria-hidden /><h2>Ойрын хугацааны ажлууд</h2></div><span>{upcomingTasks.length}</span></div><div className={styles.upcomingList}>{upcomingTasks.length ? upcomingTasks.map((task, index) => { const date = task.scheduledDate || task.deadlineDateTime?.slice(0,10) || ""; return <Link key={task.id} href={task.href} className={styles.upcomingItem}><i className={styles[`accent_${["green","blue","purple","orange","teal"][index % 5]}`]} /><time><b>{date.slice(8,10) || "—"}</b><small>{date.slice(5,7)}-р сар</small></time><span><strong>{task.name}</strong><small>{task.departmentName}</small></span><b>›</b></Link>; }) : <p className={styles.muted}>Ойрын хугацааны ажил алга.</p>}</div><Link href={buildHref("all")} className={styles.viewAll}>Бүгдийг харах</Link></section>
        <section className={styles.sideCard}><div className={styles.sideHeading}><div><UserRound size={17} aria-hidden /><h2>Миний ажлын явц</h2></div></div><div className={styles.personalProgress}><div className={styles.progressRing} style={{ "--progress": `${myProgress * 3.6}deg` } as React.CSSProperties}><span>{myProgress}%</span></div><ul><li><b>{myTasks.length}</b> ажил ногдсон</li><li><b>{myDone}</b> ажил дууссан</li><li><b>{Math.max(myTasks.length - myDone, 0)}</b> ажил явагдаж буй</li></ul></div></section>
      </aside>
      </div>
    </div>,
  );
}
