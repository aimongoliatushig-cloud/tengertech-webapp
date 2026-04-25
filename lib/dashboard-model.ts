import type { AppSession } from "@/lib/auth";
import {
  filterByDepartment,
  filterTasksToDate,
  getTodayDateKey,
  pickPrimaryDepartmentName,
} from "@/lib/dashboard-scope";
import type { FieldAssignment } from "@/lib/field-ops";
import type { DashboardSnapshot } from "@/lib/odoo";
import { getPrimaryAppRole } from "@/lib/roles";

export type DashboardVariant = "executive" | "manager" | "leader" | "worker";
export type StatusTone = "good" | "attention" | "urgent" | "muted";

export type DashboardLinkChip = {
  id: string;
  label: string;
  href: string;
  value: string;
  tone: StatusTone;
};

export type DashboardSummaryCard = {
  id: string;
  label: string;
  value: string;
  note: string;
  tone: StatusTone;
  href: string;
};

export type DashboardItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string[];
  statusLabel: string;
  tone: StatusTone;
  href: string;
  actionLabel: string;
  progress?: number;
  value?: string;
};

export type DashboardSection = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  href: string;
  tone: StatusTone;
  emptyTitle: string;
  emptyBody: string;
  items: DashboardItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
};

export type DashboardFocusSection = {
  title: string;
  description: string;
  primaryItem: DashboardItem | null;
  secondaryItems: DashboardItem[];
};

export type DashboardComparisonCard = {
  id: string;
  title: string;
  subtitle: string;
  metric: string;
  note: string;
  tone: StatusTone;
  href: string;
};

export type DashboardActionRow = {
  id: string;
  title: string;
  timeLabel: string;
  statusLabel: string;
  tone: StatusTone;
  href: string;
  buttonLabel: string;
  heat: number;
};

export type DashboardTrendPoint = {
  id: string;
  label: string;
  completion: number;
  overdue: number;
};

export type DashboardSourceNotice = {
  title: string;
  body: string;
  href: string;
  actionLabel: string;
};

export type DashboardModel = {
  variant: DashboardVariant;
  eyebrow: string;
  title: string;
  description: string;
  emphasis: string;
  scopeLabel: string;
  updatedAt: string;
  alertCount: number;
  summaryCards: DashboardSummaryCard[];
  quickFilters: DashboardLinkChip[];
  focusSection: DashboardFocusSection;
  actionSections: DashboardSection[];
  supportSections: DashboardSection[];
  comparisonTitle: string;
  comparisonDescription: string;
  comparisonActionLabel: string;
  comparisonHref: string;
  comparisonCards: DashboardComparisonCard[];
  overdueRows: DashboardActionRow[];
  reviewRows: DashboardActionRow[];
  trendPoints: DashboardTrendPoint[];
  mobileActions: DashboardLinkChip[];
  sourceNotice?: DashboardSourceNotice;
};

type SnapshotTask = DashboardSnapshot["taskDirectory"][number];
type SnapshotReview = DashboardSnapshot["reviewQueue"][number];
type SnapshotQuality = DashboardSnapshot["qualityAlerts"][number];
type SnapshotReport = DashboardSnapshot["reports"][number];
type SnapshotProject = DashboardSnapshot["projects"][number];
type SnapshotDepartment = DashboardSnapshot["departments"][number];
type SnapshotTeamLeader = DashboardSnapshot["teamLeaders"][number];

type WorkerProjectSummary = {
  projectName: string;
  departmentName: string;
  totalTasks: number;
  activeTasks: number;
  reviewTasks: number;
  completedTasks: number;
};

type ScopedCollections = {
  scopeLabel: string;
  tasks: SnapshotTask[];
  reviews: SnapshotReview[];
  qualityAlerts: SnapshotQuality[];
  reports: SnapshotReport[];
  projects: SnapshotProject[];
  liveTasks: DashboardSnapshot["liveTasks"];
  departments: SnapshotDepartment[];
  teamLeaders: SnapshotTeamLeader[];
  workerProjects: WorkerProjectSummary[];
};

const ITEM_LIMIT = 4;
const COMPARISON_LIMIT = 4;
const ACTION_ROW_LIMIT = 5;
const TREND_DAY_COUNT = 7;

function resolveVariant(session: AppSession): DashboardVariant {
  const role = getPrimaryAppRole({
    role: session.role,
    groupFlags: session.groupFlags,
  });

  if (role === "admin" || role === "executive") {
    return "executive";
  }

  if (role === "manager" || role === "dispatcher" || role === "inspector") {
    return "manager";
  }

  if (role === "leader") {
    return "leader";
  }

  return "worker";
}

function buildWorkerProjects(tasks: SnapshotTask[]): WorkerProjectSummary[] {
  return Array.from(
    tasks.reduce<Map<string, WorkerProjectSummary>>((accumulator, task) => {
      const existing = accumulator.get(task.projectName) ?? {
        projectName: task.projectName,
        departmentName: task.departmentName,
        totalTasks: 0,
        activeTasks: 0,
        reviewTasks: 0,
        completedTasks: 0,
      };

      existing.totalTasks += 1;
      if (task.statusKey === "review") {
        existing.reviewTasks += 1;
      }
      if (task.statusKey === "verified") {
        existing.completedTasks += 1;
      } else {
        existing.activeTasks += 1;
      }

      accumulator.set(task.projectName, existing);
      return accumulator;
    }, new Map()),
  )
    .map(([, project]) => project)
    .sort((left, right) => {
      if (right.activeTasks !== left.activeTasks) {
        return right.activeTasks - left.activeTasks;
      }
      return left.projectName.localeCompare(right.projectName, "mn");
    });
}

function dedupeItems(items: DashboardItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function isOverdueTask(task: SnapshotTask, todayKey: string) {
  return Boolean(
    task.scheduledDate &&
      task.scheduledDate < todayKey &&
      task.statusKey !== "verified",
  );
}

function calculateCompletion(tasks: SnapshotTask[]) {
  const planned = tasks.reduce((sum, task) => sum + Math.max(task.plannedQuantity, 0), 0);
  const completed = tasks.reduce(
    (sum, task) => sum + Math.max(Math.min(task.completedQuantity, task.plannedQuantity || task.completedQuantity), 0),
    0,
  );

  if (planned > 0) {
    return Math.round((completed / planned) * 100);
  }

  if (!tasks.length) {
    return 0;
  }

  return Math.round(
    tasks.reduce((sum, task) => sum + Math.max(task.progress, 0), 0) / tasks.length,
  );
}

function clampPercentage(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toneWeight(tone: StatusTone) {
  switch (tone) {
    case "urgent":
      return 88;
    case "attention":
      return 66;
    case "good":
      return 44;
    default:
      return 28;
  }
}

function buildHeatValue(tone: StatusTone, progress?: number) {
  const progressPenalty =
    typeof progress === "number" ? (100 - clampPercentage(progress)) * 0.32 : 0;
  return clampPercentage(toneWeight(tone) + progressPenalty);
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function recentDateKeys(todayKey: string, count: number) {
  const [year, month, day] = todayKey.split("-").map(Number);
  const endDate = new Date(Date.UTC(year, month - 1, day));

  return Array.from({ length: count }, (_, index) => {
    const current = new Date(endDate);
    current.setUTCDate(endDate.getUTCDate() - (count - index - 1));
    return toDateKey(current);
  });
}

function formatTrendLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("mn-MN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function buildTrendPoints(tasks: SnapshotTask[], todayKey: string): DashboardTrendPoint[] {
  return recentDateKeys(todayKey, TREND_DAY_COUNT).map((dateKey) => {
    const dayTasks = tasks.filter((task) => task.scheduledDate === dateKey);
    const completion = dayTasks.length ? calculateCompletion(dayTasks) : 0;
    const overdueCount = dayTasks.filter(
      (task) => dateKey < todayKey && task.statusKey !== "verified",
    ).length;

    return {
      id: dateKey,
      label: formatTrendLabel(dateKey),
      completion,
      overdue: dayTasks.length
        ? clampPercentage((overdueCount / dayTasks.length) * 100)
        : 0,
    };
  });
}

function toneFromTask(task: SnapshotTask, todayKey: string): StatusTone {
  if (task.issueFlag || isOverdueTask(task, todayKey)) {
    return "urgent";
  }
  if (task.statusKey === "review") {
    return "attention";
  }
  if (task.statusKey === "working" || task.statusKey === "verified") {
    return "good";
  }
  return "muted";
}

function toneFromStageBucket(
  bucket: DashboardSnapshot["projects"][number]["stageBucket"],
): StatusTone {
  if (bucket === "review") {
    return "attention";
  }
  if (bucket === "progress" || bucket === "done") {
    return "good";
  }
  return "muted";
}

function toneFromDepartment(item: SnapshotDepartment): StatusTone {
  if (item.reviewTasks > 0) {
    return "attention";
  }
  if (item.openTasks > 12) {
    return "urgent";
  }
  if (item.completion >= 75) {
    return "good";
  }
  return "muted";
}

function toneFromLeader(item: SnapshotTeamLeader): StatusTone {
  if (item.reviewTasks > 0) {
    return "attention";
  }
  if (item.activeTasks > 4) {
    return "urgent";
  }
  if (item.averageCompletion >= 70) {
    return "good";
  }
  return "muted";
}

function toneFromWorkerProject(item: WorkerProjectSummary): StatusTone {
  if (item.reviewTasks > 0) {
    return "attention";
  }
  if (item.activeTasks > 3) {
    return "urgent";
  }
  if (item.completedTasks === item.totalTasks && item.totalTasks > 0) {
    return "good";
  }
  return "muted";
}

function buildScope(snapshot: DashboardSnapshot, session: AppSession, variant: DashboardVariant): ScopedCollections {
  if (variant === "worker") {
    const assignedTasks = snapshot.taskDirectory.filter((task) =>
      task.assigneeIds?.includes(session.uid),
    );
    const taskIds = new Set(assignedTasks.map((task) => task.id));
    const projectNames = new Set(assignedTasks.map((task) => task.projectName));
    const departmentNames = new Set(assignedTasks.map((task) => task.departmentName));
    const taskNames = new Set(assignedTasks.map((task) => task.name));
    const workerProjects = buildWorkerProjects(assignedTasks);

    return {
      scopeLabel: assignedTasks[0]?.departmentName ?? "Надад оноогдсон ажил",
      tasks: assignedTasks,
      reviews: snapshot.reviewQueue.filter(
        (item) => taskIds.has(item.id) || projectNames.has(item.projectName),
      ),
      qualityAlerts: snapshot.qualityAlerts.filter(
        (item) => taskIds.has(item.id) || projectNames.has(item.projectName),
      ),
      reports: snapshot.reports.filter(
        (report) =>
          report.reporter === session.name ||
          projectNames.has(report.projectName) ||
          taskNames.has(report.taskName),
      ),
      projects: snapshot.projects.filter((project) => projectNames.has(project.name)),
      liveTasks: snapshot.liveTasks.filter(
        (task) => taskIds.has(task.id) || projectNames.has(task.projectName),
      ),
      departments: snapshot.departments.filter((department) =>
        departmentNames.has(department.name),
      ),
      teamLeaders: [],
      workerProjects,
    };
  }

  const primaryDepartmentName =
    variant === "executive"
      ? null
      : pickPrimaryDepartmentName({
          taskDirectory: snapshot.taskDirectory,
          reports: snapshot.reports,
          projects: snapshot.projects,
          departments: snapshot.departments,
        });

  const tasks = primaryDepartmentName
    ? filterByDepartment(snapshot.taskDirectory, primaryDepartmentName)
    : snapshot.taskDirectory;
  const reviews = primaryDepartmentName
    ? filterByDepartment(snapshot.reviewQueue, primaryDepartmentName)
    : snapshot.reviewQueue;
  const qualityAlerts = primaryDepartmentName
    ? filterByDepartment(snapshot.qualityAlerts, primaryDepartmentName)
    : snapshot.qualityAlerts;
  const reports = primaryDepartmentName
    ? filterByDepartment(snapshot.reports, primaryDepartmentName)
    : snapshot.reports;
  const projects = primaryDepartmentName
    ? filterByDepartment(snapshot.projects, primaryDepartmentName)
    : snapshot.projects;
  const liveTasks = primaryDepartmentName
    ? filterByDepartment(snapshot.liveTasks, primaryDepartmentName)
    : snapshot.liveTasks;
  const departments = primaryDepartmentName
    ? snapshot.departments.filter((department) => department.name === primaryDepartmentName)
    : snapshot.departments;
  const leaderNames = new Set(tasks.map((task) => task.leaderName));
  const teamLeaders =
    variant === "executive"
      ? snapshot.teamLeaders
      : snapshot.teamLeaders.filter((leader) => leaderNames.has(leader.name));

  return {
    scopeLabel: primaryDepartmentName ?? "Бүх алба хэлтэс",
    tasks,
    reviews,
    qualityAlerts,
    reports,
    projects,
    liveTasks,
    departments,
    teamLeaders,
    workerProjects: [],
  };
}

function buildTaskItem(task: SnapshotTask, todayKey: string, actionLabel = "Дэлгэрэнгүй"): DashboardItem {
  return {
    id: `task-${task.id}`,
    title: task.name,
    subtitle: `${task.departmentName} · ${task.projectName}`,
    meta: [
      task.deadline,
      `Хариуцагч: ${task.leaderName}`,
      `${task.completedQuantity}/${task.plannedQuantity} ${task.measurementUnit}`,
    ],
    statusLabel: task.statusLabel,
    tone: toneFromTask(task, todayKey),
    href: task.href,
    actionLabel,
    progress: task.progress,
    value: `${task.progress}%`,
  };
}

function buildReviewItem(item: SnapshotReview): DashboardItem {
  return {
    id: `review-${item.id}`,
    title: item.name,
    subtitle: `${item.departmentName} · ${item.projectName}`,
    meta: [item.deadline, `Хариуцагч: ${item.leaderName}`, `${item.progress}% бэлэн`],
    statusLabel: item.stageLabel,
    tone: "attention",
    href: item.href,
    actionLabel: "Шалгах",
    progress: item.progress,
    value: `${item.progress}%`,
  };
}

function buildQualityItem(item: SnapshotQuality): DashboardItem {
  const signals = [
    `${item.exceptionCount} зөрчил`,
    item.hasWeightWarning ? "Жингийн анхааруулга" : "Чанарын мөр",
    item.operationTypeLabel,
  ];

  return {
    id: `quality-${item.id}`,
    title: item.name,
    subtitle: `${item.departmentName} · ${item.routeName}`,
    meta: signals,
    statusLabel: "Яаралтай",
    tone: "urgent",
    href: item.href,
    actionLabel: "Шалгах",
    value: `${item.exceptionCount}`,
  };
}

function buildReportItem(item: SnapshotReport): DashboardItem {
  return {
    id: `report-${item.id}`,
    title: item.taskName,
    subtitle: `${item.reporter} · ${item.departmentName}`,
    meta: [
      item.submittedAt,
      `${item.reportedQuantity} ${item.measurementUnit}`,
      `${item.imageCount} зураг`,
    ],
    statusLabel: "Илгээсэн",
    tone: "muted",
    href: "/reports",
    actionLabel: "Дэлгэрэнгүй",
  };
}

function buildProjectItem(item: SnapshotProject): DashboardItem {
  return {
    id: `project-${item.id}`,
    title: item.name,
    subtitle: `${item.departmentName} · Менежер: ${item.manager}`,
    meta: [
      item.deadline,
      `Нээлттэй: ${item.openTasks}`,
      `Гүйцэтгэл: ${item.completion}%`,
    ],
    statusLabel: item.stageLabel,
    tone: toneFromStageBucket(item.stageBucket),
    href: item.href,
    actionLabel: "Дэлгэрэнгүй",
    progress: item.completion,
    value: `${item.completion}%`,
  };
}

function buildAssignmentItem(item: FieldAssignment): DashboardItem {
  const tone: StatusTone =
    item.issueCount > 0 || item.skippedStopCount > 0
      ? "urgent"
      : item.state === "submitted"
        ? "attention"
        : item.state === "verified"
          ? "good"
          : "good";

  return {
    id: `assignment-${item.id}`,
    title: item.routeName,
    subtitle: `${item.districtName} · ${item.vehicleName}`,
    meta: [
      item.shiftTypeLabel,
      `${item.completedStopCount}/${item.stopCount} цэг`,
      `Жолооч: ${item.driverName}`,
    ],
    statusLabel: item.stateLabel,
    tone,
    href: `/field?taskId=${item.id}`,
    actionLabel: "Өнөөдрийн ажлыг нээх",
    progress: item.progressPercent,
    value: `${item.progressPercent}%`,
  };
}

function buildActionRow(item: DashboardItem): DashboardActionRow {
  return {
    id: item.id,
    title: item.title,
    timeLabel: item.meta[0] ?? item.subtitle,
    statusLabel: item.statusLabel,
    tone: item.tone,
    href: item.href,
    buttonLabel: item.actionLabel,
    heat: buildHeatValue(item.tone, item.progress),
  };
}

function pickHeadline(variant: DashboardVariant) {
  switch (variant) {
    case "executive":
      return {
        eyebrow: "Нэгдсэн хяналт",
        title: "Нэгдсэн ажиллагааны самбар",
        description: "Шийдвэр гаргалтад хамгийн эхэнд харагдах эрсдэл, саатал, баталгаажуулалтыг төвд нь гаргав.",
        emphasis: "Эрсдэл, саатал, баталгаажуулалт",
      };
    case "manager":
      return {
        eyebrow: "Хэлтсийн хяналт",
        title: "Хэлтсийн ажиллагааны самбар",
        description: "Хоцорсон ажил, багийн гүйцэтгэл, шалгах тайланг унших биш хийх дарааллаар байрлууллаа.",
        emphasis: "Хоцролт, багийн явц, хяналт",
      };
    case "leader":
      return {
        eyebrow: "Өдрийн урсгал",
        title: "Өдөр тутмын удирдлагын самбар",
        description: "Өнөөдрийн ажил, тайлан, саатлыг нэг хараад хөдөлж эхлэхээр зохион байгууллаа.",
        emphasis: "Өнөөдрийн ажил, тайлан, саатал",
      };
    case "worker":
      return {
        eyebrow: "Хувийн урсгал",
        title: "Миний ажлын самбар",
        description: "Одоо хийх ажил, илгээх тайлан, өдөр дундах явцыг илүү ойлгомжтой болголоо.",
        emphasis: "Яг одоо хийх ажил",
      };
    default:
      return {
        eyebrow: "Нэгдсэн хяналт",
        title: "Ажлын самбар",
        description: "",
        emphasis: "",
      };
  }
}

export function buildDashboardModel(input: {
  session: AppSession;
  snapshot: DashboardSnapshot;
  todayAssignments?: FieldAssignment[];
}) {
  const { session, snapshot } = input;
  const todayAssignments = input.todayAssignments ?? [];
  const variant = resolveVariant(session);
  const todayKey = getTodayDateKey();
  const headline = pickHeadline(variant);
  const scoped = buildScope(snapshot, session, variant);
  const overdueTasks = scoped.tasks.filter((task) => isOverdueTask(task, todayKey));
  const riskTaskIds = new Set([
    ...scoped.qualityAlerts.map((item) => item.id),
    ...scoped.tasks.filter((task) => task.issueFlag).map((task) => task.id),
  ]);
  const pendingTasks = scoped.tasks.filter((task) => task.statusKey === "planned");
  const todayTasks = filterTasksToDate(
    scoped.tasks.filter((task) => task.statusKey !== "verified"),
    todayKey,
  );
  const activeTodayTasks = filterTasksToDate(scoped.liveTasks, todayKey);
  const completion = calculateCompletion(scoped.tasks);
  const todayCount =
    variant === "worker" && todayAssignments.length ? todayAssignments.length : todayTasks.length;
  const reviewCount = scoped.reviews.length;
  const riskCount = riskTaskIds.size;
  const alertCount = overdueTasks.length + riskCount + reviewCount;

  const summaryCardsSource: DashboardSummaryCard[] = [
    {
      id: "today",
      label: "Өнөөдрийн ажил",
      value: String(todayCount),
      note:
        variant === "worker"
          ? "Өнөөдөр танд шууд харагдах ажил, маршрут"
          : "Өнөөдөр анхаарах идэвхтэй ажил",
      tone: todayCount ? "good" : "muted",
      href: variant === "worker" && todayAssignments.length ? "/field" : "/tasks?view=today",
    },
    {
      id: "overdue",
      label: "Хоцорсон ажил",
      value: String(overdueTasks.length),
      note: overdueTasks.length
        ? "Хугацаа давсан эсвэл шилжиж үлдсэн ажил"
        : "Хугацаа давсан ажил алга",
      tone: overdueTasks.length ? "urgent" : "muted",
      href: "/tasks?filter=overdue",
    },
    {
      id: "review",
      label: "Шалгах / Батлах",
      value: String(reviewCount),
      note: reviewCount
        ? "Шалгалт, баталгаажуулалт хүлээж буй тайлан"
        : "Одоогоор шалгах тайлан алга",
      tone: reviewCount ? "attention" : "muted",
      href: "/review",
    },
    {
      id: "risk",
      label: "Яаралтай анхаарах",
      value: String(riskCount),
      note: riskCount
        ? "Чанарын анхааруулга эсвэл асуудалтай ажил"
        : "Эрсдэлийн дохио алга",
      tone: riskCount ? "urgent" : "muted",
      href: "/quality",
    },
    {
      id: "completion",
      label: "Гүйцэтгэлийн хувь",
      value: `${completion}%`,
      note: scoped.tasks.length
        ? `${scoped.tasks.length} ажил дээр тооцсон дундаж явц`
        : "Холбогдох ажил олдсонгүй",
      tone: completion >= 80 ? "good" : completion >= 50 ? "attention" : "muted",
      href: "/reports",
    },
  ];

  const summaryOrder =
    ["overdue", "risk", "review", "today", "completion"];

  const summaryCards = summaryOrder
    .map((id) => summaryCardsSource.find((item) => item.id === id))
    .filter((item): item is DashboardSummaryCard => Boolean(item));

  const urgentItems = dedupeItems([
    ...scoped.qualityAlerts.slice(0, ITEM_LIMIT).map(buildQualityItem),
    ...overdueTasks.slice(0, ITEM_LIMIT).map((task) => buildTaskItem(task, todayKey, "Нээх")),
  ]).slice(0, ITEM_LIMIT);

  const reviewItems = scoped.reviews.slice(0, ITEM_LIMIT).map(buildReviewItem);
  const overdueRows = overdueTasks
    .slice(0, ACTION_ROW_LIMIT)
    .map((task) => buildTaskItem(task, todayKey, "Шалгах"))
    .map(buildActionRow);
  const reviewRows = scoped.reviews
    .slice(0, ACTION_ROW_LIMIT)
    .map(buildReviewItem)
    .map(buildActionRow);
  const pendingItems = pendingTasks.slice(0, ITEM_LIMIT).map((task) =>
    buildTaskItem(task, todayKey, "Төлөвлөгөөг харах"),
  );
  const trendPoints = buildTrendPoints(scoped.tasks, todayKey);
  const todayActiveItems =
    variant === "worker" && todayAssignments.length
      ? todayAssignments.slice(0, ITEM_LIMIT).map(buildAssignmentItem)
      : activeTodayTasks.slice(0, ITEM_LIMIT).map((task) => {
          const tone: StatusTone =
            task.stageBucket === "review" ? "attention" : "good";

          return {
            id: `today-${task.id}`,
            title: task.name,
            subtitle: `${task.departmentName} · ${task.projectName}`,
            meta: [
              task.deadline,
              `Хариуцагч: ${task.leaderName}`,
              `${task.completedQuantity}/${task.plannedQuantity} ${task.measurementUnit}`,
            ],
            statusLabel: task.stageLabel,
            tone,
            href: task.href,
            actionLabel: "Нээх",
            progress: task.progress,
            value: `${task.progress}%`,
          } satisfies DashboardItem;
        });

  const nextActionCandidates = dedupeItems([
    ...(variant === "worker" ? todayAssignments.map(buildAssignmentItem) : []),
    ...urgentItems,
    ...reviewItems,
    ...todayTasks.slice(0, ITEM_LIMIT).map((task) => buildTaskItem(task, todayKey, "Нээх")),
    ...pendingItems,
  ]).slice(0, 5);

  const focusSection: DashboardFocusSection = {
    title: "Одоо анхаарах зүйл",
    description:
      variant === "executive"
        ? "Шийдвэр шаардах ажил эхэнд, унших түүх доор байрлана."
        : variant === "manager"
          ? "Хэлтэс яг одоо хаана саатаж байгааг эхэлж харуулна."
          : variant === "leader"
            ? "Өнөөдрийн багийн урсгалыг эхлүүлэх дарааллыг гаргав."
            : "Таны дараагийн хийх ажил эхний дэлгэц дээр харагдана.",
    primaryItem: nextActionCandidates[0] ?? null,
    secondaryItems: nextActionCandidates.slice(1),
  };

  const actionSections: DashboardSection[] = [
    {
      id: "urgent",
      title: "Яаралтай ажлууд",
      description: "Хугацаа, эрсдэл, тасалдал төвлөрсөн ажил.",
      actionLabel: "Бүгдийг харах",
      href: "/quality",
      tone: "urgent",
      emptyTitle: "Яаралтай ажил алга",
      emptyBody: "Шуурхай хариу шаардсан ажил одоогоор бүртгэгдээгүй байна.",
      items: urgentItems,
    },
    {
      id: "review",
      title: "Шалгах тайлангууд",
      description: "Шийдвэр, баталгаажуулалт хүлээж буй урсгал.",
      actionLabel: "Шалгалт руу орох",
      href: "/review",
      tone: "attention",
      emptyTitle: "Шалгах тайлан алга",
      emptyBody: "Одоогоор хяналт хүлээж буй тайлан байхгүй байна.",
      items: reviewItems,
    },
    {
      id: "pending",
      title: "Хүлээгдэж буй ажил",
      description: "Эхлүүлэх, дахин оноох, товлох шаардлагатай ажил.",
      actionLabel: "Төлөвлөгөөг нээх",
      href: "/tasks",
      tone: "muted",
      emptyTitle: "Хүлээгдэж буй ажил алга",
      emptyBody: "Төлөвлөгдсөн боловч эхлээгүй ажил одоогоор алга.",
      items: pendingItems,
    },
    {
      id: "activeToday",
      title: "Өнөөдрийн идэвхтэй ажлууд",
      description: "Өнөөдөр бодитоор хөдөлж буй ажилбар, маршрут.",
      actionLabel: variant === "worker" ? "Өдрийн ажлыг нээх" : "Өнөөдрийн ажлыг харах",
      href: variant === "worker" && todayAssignments.length ? "/field" : "/tasks?view=today",
      tone: "good",
      emptyTitle: "Өнөөдрийн идэвхтэй ажил алга",
      emptyBody: "Өнөөдөр идэвхтэй явагдаж буй ажил одоогоор харагдахгүй байна.",
      items: todayActiveItems,
    },
  ];

  const supportSections: DashboardSection[] = [
    {
      id: "reports",
      title: "Сүүлийн тайлангууд",
      description: "Сүүлд илгээсэн тайланг хурдан шалгах зориулалттай.",
      actionLabel: "Тайлан руу орох",
      href: "/reports",
      tone: "muted",
      emptyTitle: "Тайлан харагдахгүй байна",
      emptyBody: "Сүүлийн тайлангийн урсгалд одоогоор бүртгэл алга.",
      items: scoped.reports.slice(0, ITEM_LIMIT).map(buildReportItem),
    },
    {
      id: "projects",
      title: "Сүүлийн ажлууд",
      description: "Сүүлийн идэвхтэй төслүүдийг тайлангаас тусад нь харуулна.",
      actionLabel: "Ажил руу орох",
      href: "/projects",
      tone: "muted",
      emptyTitle: "Ажил харагдахгүй байна",
      emptyBody: "Холбогдох ажлын жагсаалт одоогоор олдсонгүй.",
      items: scoped.projects.slice(0, ITEM_LIMIT).map(buildProjectItem),
    },
    {
      id: "reviewFeed",
      title: "Хяналтын мөр",
      description: "Шалгалтын нарийвчилсан мөрийг нээж үзнэ.",
      actionLabel: "Хяналтын мөр рүү орох",
      href: "/review",
      tone: "attention",
      emptyTitle: "Хяналтын мөр хоосон байна",
      emptyBody: "Одоогоор хяналтын мөр дээр шинэ урсгал үүсээгүй байна.",
      items: scoped.reviews.slice(0, ITEM_LIMIT).map(buildReviewItem),
      collapsible: true,
      defaultOpen: variant === "executive",
    },
    {
      id: "qualityFeed",
      title: "Чанарын анхааруулга",
      description: "Дэлгэрэнгүй шалтгаан, чиглэл, зөрчлийн тоог энд үлдээв.",
      actionLabel: "Чанарын хэсэг рүү орох",
      href: "/quality",
      tone: "urgent",
      emptyTitle: "Чанарын дохио алга",
      emptyBody: "Чанарын анхааруулга одоогоор бүртгэгдээгүй байна.",
      items: scoped.qualityAlerts.slice(0, ITEM_LIMIT).map(buildQualityItem),
      collapsible: true,
      defaultOpen: false,
    },
  ];

  let comparisonTitle = "Алба нэгжийн товч мэдээлэл";
  let comparisonDescription =
    "Энэ хэсэг нь доод түвшинд байрлаж, зөвхөн чиг хандлага харахад тусална.";
  let comparisonActionLabel = "Дэлгэрэнгүй харах";
  let comparisonHref = "/projects";
  let comparisonCards: DashboardComparisonCard[] = [];

  if (variant === "executive") {
    comparisonTitle = "Алба нэгжийн товч мэдээлэл";
    comparisonDescription = "Хэлтсүүдийн ачаалал, шалгалт, гүйцэтгэлийг нэг мөрнөөс харуулна.";
    comparisonActionLabel = "Нэгжийн ажлыг нээх";
    comparisonHref = "/projects";
    comparisonCards = scoped.departments
      .slice()
      .sort((left, right) => right.openTasks - left.openTasks)
      .slice(0, COMPARISON_LIMIT)
      .map((item) => ({
        id: `department-${item.name}`,
        title: item.name,
        subtitle: item.label,
        metric: `${item.completion}%`,
        note: `Нээлттэй ${item.openTasks} · Шалгалт ${item.reviewTasks}`,
        tone: toneFromDepartment(item),
        href: `/projects?department=${encodeURIComponent(item.name)}`,
      }));
  } else if (variant === "manager" || variant === "leader") {
    comparisonTitle = "Багийн товч мэдээлэл";
    comparisonDescription = "Багийн ачаалал, хяналт, дундаж явцыг удирдлагын түвшинд харуулна.";
    comparisonActionLabel = "Ажилбарын жагсаалт руу орох";
    comparisonHref = "/tasks";
    comparisonCards = (scoped.teamLeaders.length ? scoped.teamLeaders : snapshot.teamLeaders)
      .slice(0, COMPARISON_LIMIT)
      .map((item) => ({
        id: `leader-${item.name}`,
        title: item.name,
        subtitle: "Багийн ахлагч",
        metric: `${item.averageCompletion}%`,
        note: `Идэвхтэй ${item.activeTasks} · Шалгах ${item.reviewTasks} · Баг ${item.squadSize}`,
        tone: toneFromLeader(item),
        href: "/tasks",
      }));
  } else {
    comparisonTitle = "Надад хамаарах ажлын товч мэдээлэл";
    comparisonDescription = "Танд холбогдсон ажлыг жижиг бүлгүүдээр нь харахад зориулсан хэсэг.";
    comparisonActionLabel = "Ажилбар руу орох";
    comparisonHref = "/tasks";
    comparisonCards = scoped.workerProjects.slice(0, COMPARISON_LIMIT).map((item) => {
      const completionRate = item.totalTasks
        ? Math.round((item.completedTasks / item.totalTasks) * 100)
        : 0;

      return {
        id: `worker-project-${item.projectName}`,
        title: item.projectName,
        subtitle: item.departmentName,
        metric: `${completionRate}%`,
        note: `Идэвхтэй ${item.activeTasks} · Хяналт ${item.reviewTasks}`,
        tone: toneFromWorkerProject(item),
        href: "/tasks",
      };
    });
  }

  if (!comparisonCards.length) {
    comparisonCards = scoped.projects.slice(0, COMPARISON_LIMIT).map((item) => ({
      id: `fallback-project-${item.id}`,
      title: item.name,
      subtitle: item.departmentName,
      metric: `${item.completion}%`,
      note: `Нээлттэй ${item.openTasks} · ${item.stageLabel}`,
      tone: toneFromStageBucket(item.stageBucket),
      href: item.href,
    }));
  }

  const quickFilters: DashboardLinkChip[] = [
    {
      id: "quick-today",
      label: "Өнөөдөр",
      href: variant === "worker" && todayAssignments.length ? "/field" : "/tasks?view=today",
      value: String(todayCount),
      tone: todayCount ? "good" : "muted",
    },
    {
      id: "quick-overdue",
      label: "Хоцролт",
      href: "/tasks?filter=overdue",
      value: String(overdueTasks.length),
      tone: overdueTasks.length ? "urgent" : "muted",
    },
    {
      id: "quick-review",
      label: "Шалгалт",
      href: "/review",
      value: String(reviewCount),
      tone: reviewCount ? "attention" : "muted",
    },
    {
      id: "quick-risk",
      label: "Эрсдэл",
      href: "/quality",
      value: String(riskCount),
      tone: riskCount ? "urgent" : "muted",
    },
    {
      id: "quick-history",
      label: variant === "executive" ? "Нэгжүүд" : variant === "worker" ? "Тайлан" : "Баг",
      href: variant === "executive" ? "/projects" : variant === "worker" ? "/reports" : "/tasks",
      value:
        variant === "executive"
          ? String(scoped.departments.length)
          : variant === "worker"
            ? String(scoped.reports.length)
            : String(comparisonCards.length),
      tone: "muted",
    },
  ];

  return {
    variant,
    eyebrow: headline.eyebrow,
    title: headline.title,
    description: headline.description,
    emphasis: headline.emphasis,
    scopeLabel: scoped.scopeLabel,
    updatedAt: snapshot.generatedAt,
    alertCount,
    summaryCards,
    quickFilters,
    focusSection,
    actionSections,
    supportSections,
    comparisonTitle,
    comparisonDescription,
    comparisonActionLabel,
    comparisonHref,
    comparisonCards,
    overdueRows,
    reviewRows,
    trendPoints,
    mobileActions: quickFilters.slice(0, 3),
    sourceNotice:
      snapshot.source === "demo"
        ? {
            title: "Системийн бодит өгөгдөл бүрэн ирээгүй байж магадгүй.",
            body: "Түр нөөц мэдээлэл ашиглаж байгаа тул өнөөдрийн ажил, шалгалт, тайлангийн мөрийг давхар нягтална уу.",
            href: "/data-download",
            actionLabel: "Өгөгдөл шалгах",
          }
        : undefined,
  } satisfies DashboardModel;
}
