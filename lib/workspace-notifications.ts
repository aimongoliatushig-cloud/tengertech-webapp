import "server-only";

import { canAccessProcurementModule } from "@/lib/roles";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import { loadProcurementRequests, type ProcurementRequestSummary } from "@/lib/procurement";
import { type AppSession, isHrOnlyRole, isMasterRole, isWorkerOnly } from "@/lib/auth";
import type { RoleGroupFlags } from "@/lib/roles";
import { filterByDepartment, getTodayDateKey } from "@/lib/dashboard-scope";
import { loadReadNotificationKeys } from "@/lib/notification-state";
import { loadMunicipalSnapshot, type DashboardSnapshot } from "@/lib/odoo";

type NotificationReason = "new" | "review" | "overdue" | "issue";

type WorkspaceNotificationRecord = {
  key: string;
  reasons: NotificationReason[];
};

type WorkspaceNotificationSummary = {
  unreadCount: number;
  newCount: number;
  reviewCount: number;
  overdueCount: number;
  issueCount: number;
};

type CachedWorkspaceNotificationSummary = {
  expiresAt: number;
  value: WorkspaceNotificationSummary;
};

export type ProcurementNotificationRecord = {
  key: string;
  name: string;
  departmentName: string;
  projectName: string;
  stageLabel: string;
  href: string;
  progress: number;
  taskCount: number;
  sortTimeMs: number;
  reasons: NotificationReason[];
};

const WORKSPACE_NOTIFICATION_SUMMARY_CACHE_TTL_MS = 15_000;
const workspaceNotificationSummaryCache = new Map<string, CachedWorkspaceNotificationSummary>();
const workspaceNotificationSummaryPendingCache = new Map<string, Promise<WorkspaceNotificationSummary>>();

function normalizeTaskAssigneeId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeName(value?: string | null) {
  return (value || "").trim().toLocaleLowerCase("mn-MN");
}

function parseNotificationTimeMs(value?: string | null) {
  if (!value) {
    return 0;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isOverdue(task: DashboardSnapshot["taskDirectory"][number], todayDateKey: string) {
  return Boolean(
    task.scheduledDate &&
      task.scheduledDate < todayDateKey &&
      task.statusKey !== "verified",
  );
}

function isProcurementOverdue(item: ProcurementRequestSummary, todayDateKey: string) {
  if (!item.required_date) {
    return false;
  }

  const requiredDate = item.required_date.includes("T") ? item.required_date : `${item.required_date}T00:00:00`;
  const parsed = Date.parse(requiredDate);
  if (!Number.isFinite(parsed)) {
    return false;
  }

  return (
    Number.parseInt(todayDateKey.replace(/-/g, ""), 10) >
      Number.parseInt(item.required_date.replace(/-/g, ""), 10) &&
    !isProcurementFinal(item.state.code)
  );
}

function isProcurementFinal(stateCode: string) {
  return ["done", "cancelled", "rejected", "returned"].includes(stateCode);
}

function procurementProgressPercent(stateCode: string) {
  const map: Record<string, number> = {
    draft: 5,
    submitted: 15,
    quote: 20,
    quote_collection: 25,
    quotation_waiting: 28,
    quotations_ready: 32,
    admin_review: 40,
    ceo_decision: 45,
    ceo_order_uploaded: 50,
    finance_review: 55,
    director_approval: 60,
    order_waiting: 65,
    contract_waiting: 70,
    contract_review: 75,
    legal_contract_draft: 80,
    legal_final_contract: 84,
    payment: 88,
    payment_pending: 90,
    payment_waiting: 92,
    payment_recorded: 94,
    received: 96,
    done: 100,
  };

  return map[stateCode] ?? 50;
}

function procurementReasons(item: ProcurementRequestSummary, todayDateKey: string) {
  const reasons: NotificationReason[] = [];

  if (isProcurementOverdue(item, todayDateKey)) {
    reasons.push("overdue");
  }

  if (isProcurementFinal(item.state.code)) {
    return reasons;
  }

  if (["draft", "submitted", "quote", "quote_collection", "quotation_waiting"].includes(item.state.code)) {
    reasons.push("new");
  } else {
    reasons.push("review");
  }

  if (reasons.length === 0) {
    reasons.push("review");
  }

  return reasons;
}

function procurementNotificationVersion(item: ProcurementRequestSummary) {
  const values = [
    item.date_quotation_submitted,
    item.date_director_decision,
    item.date_order_issued,
    item.date_contract_signed,
    item.date_paid,
    item.date_received,
    item.required_date,
  ]
    .map(parseNotificationTimeMs)
    .filter(Boolean);

  if (!values.length) {
    return String(item.current_stage_age_days || 0);
  }

  return String(Math.max(...values));
}

function buildProcurementNotificationKey(item: ProcurementRequestSummary) {
  const stateCode = item.state.code || "unknown";
  const routeCode = pickProcurementNotificationRoute(item);
  return `procurement:${item.id}:${routeCode}:${stateCode}:${procurementNotificationVersion(item)}`;
}

function pickProcurementDepartmentName(item: ProcurementRequestSummary) {
  return item.department?.name || "-";
}

function pickProcurementProjectName(item: ProcurementRequestSummary) {
  return item.project?.name || item.task?.name || item.vehicle?.name || "Тодорхойгүй төсөл";
}

function pickProcurementNotificationRoute(item: ProcurementRequestSummary) {
  const activeRoute =
    item.packages?.find((pack) => pack.route_state?.code && pack.route_state.code === item.state.code)?.route_state
      ?.code || item.state.code || "unknown";
  return activeRoute || "unknown";
}

function mapProcurementNotificationItem(item: ProcurementRequestSummary, todayDateKey: string) {
  const reasons = procurementReasons(item, todayDateKey);
  if (!reasons.length) {
    return null;
  }

  const sortTimeMs = Math.max(
    parseNotificationTimeMs(item.date_quotation_submitted),
    parseNotificationTimeMs(item.date_director_decision),
    parseNotificationTimeMs(item.date_order_issued),
    parseNotificationTimeMs(item.date_contract_signed),
    parseNotificationTimeMs(item.date_paid),
    parseNotificationTimeMs(item.date_received),
    parseNotificationTimeMs(item.required_date),
  );

  const targetPackage = item.packages?.find((pack) => pack.route_state?.code === item.state.code);
  const packageId = targetPackage?.id;

  return {
    key: buildProcurementNotificationKey(item),
    name: `${item.name} - ${item.title}`,
    departmentName: pickProcurementDepartmentName(item),
    projectName: pickProcurementProjectName(item),
    stageLabel: item.state.label || item.state.code,
    href: packageId ? `/procurement/${item.id}?package_id=${packageId}#actions` : `/procurement/${item.id}`,
    progress: procurementProgressPercent(item.state.code),
    taskCount: 1,
    sortTimeMs,
    reasons,
  } satisfies ProcurementNotificationRecord;
}

function getProcurementScopes(session: AppSession) {
  const flags: Partial<RoleGroupFlags> = session.groupFlags || {};
  const isExecutive =
    Boolean(
      session.role === "director" ||
        session.role === "general_manager" ||
        session.groupFlags?.municipalManager ||
        session.groupFlags?.municipalDirector ||
        session.groupFlags?.fleetRepairCeo ||
        session.groupFlags?.fleetRepairGeneralManager ||
        session.groupFlags?.procurementGeneralManager,
    );
  const isDepartmentHead =
    session.role === "project_manager" || Boolean(session.groupFlags?.municipalDepartmentHead);
  const isWorker = Boolean(
    flags.procurementStorekeeper ||
      flags.procurementFinance ||
      flags.procurementAdministration ||
      flags.procurementLegal ||
      flags.procurementCeo ||
      flags.procurementPurchaseManager ||
      flags.fleetRepairPurchaser ||
      flags.fleetRepairFinance ||
      flags.fleetRepairAccounting ||
      flags.fleetRepairAdministration ||
      flags.opsStorekeeper,
  );

  const scope = isExecutive || isDepartmentHead || session.role === "system_admin" ? "all" : isWorker ? "assigned" : "mine";
  return { scope };
}

function getWorkspaceNotificationSummaryCacheKey(
  session: AppSession,
  snapshot: DashboardSnapshot,
  scopedDepartmentName: string | null,
) {
  return [
    session.uid,
    session.login,
    session.role,
    scopedDepartmentName ?? "",
    snapshot.generatedAt,
    snapshot.taskDirectory.length,
    snapshot.reviewQueue.length,
  ].join(":");
}

function addReason(reasons: NotificationReason[], reason: NotificationReason) {
  if (HIDE_OVERDUE_UI && reason === "overdue") return;
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function isAssignedToUser(task: DashboardSnapshot["taskDirectory"][number], userId: string) {
  return (task.assigneeIds ?? [])
    .map(normalizeTaskAssigneeId)
    .some((assigneeId) => assigneeId !== null && String(assigneeId) === userId);
}

function resolveWorkerDepartmentName(snapshot: DashboardSnapshot, session: AppSession) {
  if (!isWorkerOnly(session)) {
    return null;
  }

  const currentUserId = String(session.uid);
  return (
    snapshot.taskDirectory.find((task) => isAssignedToUser(task, currentUserId))
      ?.departmentName ?? null
  );
}

function taskNotificationTimeMs(task: DashboardSnapshot["taskDirectory"][number]) {
  return (
    parseNotificationTimeMs(task.latestReport?.submittedAt) ||
    parseNotificationTimeMs(task.createdAt) ||
    parseNotificationTimeMs(task.createdDate)
  );
}

export function countWorkspaceNotifications(
  snapshot: DashboardSnapshot,
  session: AppSession,
  scopedDepartmentName: string | null = null,
) {
  return buildWorkspaceNotificationRecords(snapshot, session, scopedDepartmentName).length;
}

export function buildWorkspaceNotificationRecords(
  snapshot: DashboardSnapshot,
  session: AppSession,
  scopedDepartmentName: string | null = null,
) {
  const todayDateKey = getTodayDateKey();
  const workerMode = isWorkerOnly(session);
  const hrPersonalTaskMode = isHrOnlyRole(session);
  const masterMode = isMasterRole(session.role);
  const currentUserId = String(session.uid);

  const departmentScopedTasks = scopedDepartmentName
    ? snapshot.taskDirectory.filter(
        (task) =>
          filterByDepartment([task], scopedDepartmentName).length > 0 ||
          isAssignedToUser(task, currentUserId),
      )
    : snapshot.taskDirectory;
  const groupedByWorkMode = workerMode || masterMode;
  const visibleTasks = workerMode
    ? departmentScopedTasks.filter((task) => isAssignedToUser(task, currentUserId))
    : departmentScopedTasks;
  const visibleTasksById = new Map(visibleTasks.map((task) => [task.id, task]));
  const visibleReviewQueue = workerMode
    ? []
    : scopedDepartmentName
      ? filterByDepartment(snapshot.reviewQueue, scopedDepartmentName)
      : snapshot.reviewQueue;

  const notificationsById = new Map<
    string,
    {
      itemKey: string;
      sortTimeMs: number;
      reasons: NotificationReason[];
    }
  >();

  const ensureFromTask = (task: DashboardSnapshot["taskDirectory"][number]) => {
    const itemKey = groupedByWorkMode ? `work:${task.projectId ?? task.projectName}` : `task:${task.id}`;
    const sortTimeMs = taskNotificationTimeMs(task);
    const existing = notificationsById.get(itemKey);

    if (existing) {
      if (sortTimeMs > existing.sortTimeMs) {
        existing.sortTimeMs = sortTimeMs;
      }
      return existing;
    }

    const item = {
      itemKey,
      sortTimeMs,
      reasons: [],
    };
    notificationsById.set(itemKey, item);
    return item;
  };

  for (const task of visibleTasks) {
    const item = ensureFromTask(task);
    const isActiveHrAssignment =
      hrPersonalTaskMode &&
      isAssignedToUser(task, currentUserId) &&
      task.statusKey !== "verified";
    if (isActiveHrAssignment || (task.createdDate === todayDateKey && task.statusKey !== "verified")) {
      addReason(item.reasons, "new");
    }
    if (isOverdue(task, todayDateKey)) {
      addReason(item.reasons, "overdue");
    }
    if (task.issueFlag) {
      addReason(item.reasons, "issue");
    }
    if (!item.reasons.length) {
      notificationsById.delete(item.itemKey);
    }
  }

  for (const reviewTask of visibleReviewQueue) {
    const existingTask = visibleTasksById.get(reviewTask.id);
    const reviewItemKey = groupedByWorkMode
      ? `work:${reviewTask.projectId ?? reviewTask.projectName}`
      : `review:${reviewTask.id}`;
    const item = existingTask
      ? ensureFromTask(existingTask)
      : notificationsById.get(reviewItemKey) ?? {
          itemKey: reviewItemKey,
          sortTimeMs: 0,
          reasons: [] as NotificationReason[],
        };
    addReason(item.reasons, "review");
    notificationsById.set(item.itemKey, item);
  }

  return Array.from(notificationsById.values()).map((item) => ({
    key: item.itemKey.startsWith("review:")
      ? item.itemKey
      : `${item.itemKey}:${item.sortTimeMs || "unknown"}`,
    reasons: item.reasons,
  })) satisfies WorkspaceNotificationRecord[];
}

export async function loadWorkspaceNotificationCount(
  session: AppSession,
  options: {
    snapshot?: DashboardSnapshot;
    scopedDepartmentName?: string | null;
  } = {},
) {
  const snapshot =
    options.snapshot ??
    (await loadMunicipalSnapshot({
      login: session.login,
      password: session.password,
    }));
  let scopedDepartmentName =
    "scopedDepartmentName" in options
      ? options.scopedDepartmentName ?? null
      : await loadSessionDepartmentName(session);

  if (!scopedDepartmentName) {
    scopedDepartmentName = resolveWorkerDepartmentName(snapshot, session);
  }

  const summary = await loadWorkspaceNotificationSummary(session, {
    snapshot,
    scopedDepartmentName,
  });
  return summary.unreadCount;
}

export async function loadWorkspaceNotificationSummary(
  session: AppSession,
  options: {
    snapshot?: DashboardSnapshot;
    scopedDepartmentName?: string | null;
  } = {},
) {
  const snapshot =
    options.snapshot ??
    (await loadMunicipalSnapshot({
      login: session.login,
      password: session.password,
    }));
  let scopedDepartmentName =
    "scopedDepartmentName" in options
      ? options.scopedDepartmentName ?? null
      : await loadSessionDepartmentName(session);

  if (!scopedDepartmentName) {
    scopedDepartmentName = resolveWorkerDepartmentName(snapshot, session);
  }

  const cacheKey = getWorkspaceNotificationSummaryCacheKey(
    session,
    snapshot,
    scopedDepartmentName,
  );
  const cached = workspaceNotificationSummaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  if (cached) {
    workspaceNotificationSummaryCache.delete(cacheKey);
  }

  const pending = workspaceNotificationSummaryPendingCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  const summaryPromise = (async () => {
    const notifications = buildWorkspaceNotificationRecords(snapshot, session, scopedDepartmentName);
    const readKeys = await loadReadNotificationKeys(
      session,
      notifications.map((item) => item.key),
    );
    const unreadNotifications = notifications.filter((item) => !readKeys.has(item.key));

    const summary = {
      unreadCount: unreadNotifications.length,
      newCount: unreadNotifications.filter((item) => item.reasons.includes("new")).length,
      reviewCount: unreadNotifications.filter((item) => item.reasons.includes("review")).length,
      overdueCount: unreadNotifications.filter((item) => item.reasons.includes("overdue")).length,
      issueCount: unreadNotifications.filter((item) => item.reasons.includes("issue")).length,
    };
    workspaceNotificationSummaryCache.set(cacheKey, {
      value: summary,
      expiresAt: Date.now() + WORKSPACE_NOTIFICATION_SUMMARY_CACHE_TTL_MS,
    });
    return summary;
  })().finally(() => {
    workspaceNotificationSummaryPendingCache.delete(cacheKey);
  });

  workspaceNotificationSummaryPendingCache.set(cacheKey, summaryPromise);
  return summaryPromise;
}

export async function loadProcurementNotificationRecords(
  session: AppSession,
  options: {
    scopedDepartmentName?: string | null;
    snapshot?: DashboardSnapshot;
  } = {},
): Promise<ProcurementNotificationRecord[]> {
  if (!canAccessProcurementModule(session)) {
    return [];
  }

  const todayDateKey = getTodayDateKey();
  const scopedDepartmentName =
    "scopedDepartmentName" in options
      ? options.scopedDepartmentName ?? null
      : await loadSessionDepartmentName(session);

  const { scope } = getProcurementScopes(session);
  const requestBundle = await loadProcurementRequests(
    {
      scope,
      limit: 200,
    },
    {
      login: session.login,
      password: session.password,
    },
  ).catch(() => ({
    items: [],
    pagination: { page: 1, limit: 1, total: 0, pages: 1 },
  }));

  const departmentFilteredItems = scopedDepartmentName
    ? requestBundle.items.filter((request) =>
        normalizeName(request.department?.name) === normalizeName(scopedDepartmentName),
      )
    : requestBundle.items;

  return departmentFilteredItems
    .map((item) => mapProcurementNotificationItem(item, todayDateKey))
    .filter((item): item is ProcurementNotificationRecord => Boolean(item));
}

export async function loadProcurementNotificationCount(session: AppSession) {
  if (!canAccessProcurementModule(session)) {
    return 0;
  }

  const records = await loadProcurementNotificationRecords(session).catch(() => []);
  if (!records.length) {
    return 0;
  }

  const readKeys = await loadReadNotificationKeys(
    session,
    records.map((record) => record.key),
  );
  return records.filter((record) => !readKeys.has(record.key)).length;
}
import { HIDE_OVERDUE_UI } from "@/lib/ui-feature-flags";
