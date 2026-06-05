import "server-only";

import { notifyPushEvent } from "@/lib/push-notifications";
import { executeOdooKw } from "@/lib/odoo";
import { loadDepartmentHeadUserIds } from "@/lib/notification-recipients";
import type { ProcurementPackage, ProcurementRequestDetail } from "@/lib/procurement";

type NotificationTarget = {
  userIds: number[];
  title: string;
  body: string;
  targetUrl: string;
};

type NotificationPayload = {
  title: string;
  body: string;
};

export type ProcurementNotificationAction =
  | "request_created"
  | "submit_quotations"
  | "prepare_order"
  | "start_contract_draft"
  | "start_order_draft"
  | "upload_order_draft"
  | "director_decision"
  | "attach_final_order"
  | "move_to_finance_review"
  | "record_package_ceo_order"
  | "mark_contract_signed"
  | "mark_paid"
  | "mark_received"
  | "mark_done"
  | "cancel";

type NotificationRecord = NotificationPayload & {
  action: string;
};

const ROLE_GROUPS = {
  storekeeper: "municipal_repair_workflow.group_procurement_storekeeper",
  finance: "municipal_repair_workflow.group_procurement_finance_user",
  administration: "municipal_repair_workflow.group_procurement_administration_user",
  legal: "municipal_repair_workflow.group_procurement_legal_user",
};

const PROCUREMENT_ACTION_TEMPLATES: Record<ProcurementNotificationAction, NotificationRecord> = {
  request_created: {
    action: "request_created",
    title: "Procurement request created",
    body: "{request}{package} - request has been sent for review.",
  },
  submit_quotations: {
    action: "submit_quotations",
    title: "Procurement quotations submitted",
    body: "{request}{package} - quotations were submitted for review.",
  },
  prepare_order: {
    action: "prepare_order",
    title: "Procurement order preparation",
    body: "{request}{package} - order preparation is ready for next review step.",
  },
  start_contract_draft: {
    action: "start_contract_draft",
    title: "Гэрээний төсөл эхэлсэн",
    body: "{request}{package} - гэрээний төсөл эхэллээ.",
  },
  start_order_draft: {
    action: "start_order_draft",
    title: "Тушаалын төсөл эхэлсэн",
    body: "{request}{package} - тушаалын төсөл эхэллээ.",
  },
  upload_order_draft: {
    action: "upload_order_draft",
    title: "Тушаалын төсөл гарсан",
    body: "{request}{package} - тушаалын төсөл хавсаргагдаж бичиг хэрэгт илгээгдлээ.",
  },
  director_decision: {
    action: "director_decision",
    title: "Director decision required",
    body: "{request}{package} - director decision was confirmed.",
  },
  attach_final_order: {
    action: "attach_final_order",
    title: "Final order attached",
    body: "{request}{package} - final order attachment has been uploaded.",
  },
  move_to_finance_review: {
    action: "move_to_finance_review",
    title: "Дараагийн шатанд илгээгдлээ",
    body: "{request}{package} - дараагийн хариуцсан ажилтанд илгээгдлээ.",
  },
  record_package_ceo_order: {
    action: "record_package_ceo_order",
    title: "Тушаал батлагдсан",
    body: "{request}{package} - батлагдсан тушаал бүртгэгдлээ.",
  },
  mark_contract_signed: {
    action: "mark_contract_signed",
    title: "Гэрээний шат шинэчлэгдлээ",
    body: "{request}{package} - гэрээний баримт бүртгэгдлээ.",
  },
  mark_paid: {
    action: "mark_paid",
    title: "Төлбөр төлөгдсөн",
    body: "{request}{package} - төлбөр төлөгдсөнийг баталгаажууллаа.",
  },
  mark_received: {
    action: "mark_received",
    title: "Goods received",
    body: "{request}{package} - goods were marked as received.",
  },
  mark_done: {
    action: "mark_done",
    title: "Procurement completed",
    body: "{request}{package} - procurement request was marked as done.",
  },
  cancel: {
    action: "cancel",
    title: "Procurement request cancelled",
    body: "{request}{package} - procurement request was cancelled.",
  },
};

function normalizeName(value: string) {
  return (value || "").trim();
}

function uniqueIds(ids: Array<number | undefined | null>) {
  return Array.from(new Set(ids.filter((id): id is number => Number.isFinite(id))));
}

function replaceTemplate(template: string, request: ProcurementRequestDetail, pack?: ProcurementPackage | null) {
  const requestTitle = `${request.name} - ${normalizeName(request.title || "")}`;
  const packageLabel = pack ? ` (${normalizeName(pack.name || "")})` : "";
  return template.replace("{request}", requestTitle).replace("{package}", packageLabel);
}

function buildPackageTargetUrl(requestId: number, packageId?: number | null) {
  return packageId
    ? `/procurement/${requestId}?package_id=${packageId}#actions`
    : `/procurement/${requestId}`;
}

function createTarget(
  targetMap: Map<string, NotificationTarget>,
  targetUrl: string,
  title: string,
  body: string,
  userIds: Array<number | undefined | null>,
) {
  const normalized = uniqueIds(userIds);
  if (!normalized.length) {
    return;
  }

  const key = `${targetUrl}|${title}|${body}`;
  const existing = targetMap.get(key);
  if (existing) {
    existing.userIds = uniqueIds([...existing.userIds, ...normalized]);
    return;
  }

  targetMap.set(key, {
    userIds: normalized,
    title,
    body,
    targetUrl,
  });
}

function createFallbackTargetUrl(request: ProcurementRequestDetail, packageId?: number | null) {
  return buildPackageTargetUrl(request.id, packageId);
}

async function roleUserIds(role: keyof typeof ROLE_GROUPS) {
  const [module, name] = ROLE_GROUPS[role].split(".");
  const rows = await executeOdooKw<Array<{ res_id: number }>>(
    "ir.model.data",
    "search_read",
    [["module", "=", module], ["name", "=", name]],
    { fields: ["res_id"], limit: 1 },
  ).catch(() => []);
  const groupId = rows[0]?.res_id;
  if (!groupId) {
    return [];
  }

  const groups = await executeOdooKw<Array<{ all_user_ids?: number[] }>>(
    "res.groups",
    "read",
    [[groupId], ["all_user_ids"]],
  ).catch(() => []);
  return uniqueIds(groups[0]?.all_user_ids || []);
}

async function requestStorekeeperIds(request: ProcurementRequestDetail) {
  const assigned = uniqueIds([request.storekeeper?.id]);
  if (assigned.length) {
    return assigned;
  }

  return roleUserIds("storekeeper");
}

function currentPackage(request: ProcurementRequestDetail, packageId?: number | null) {
  if (!packageId) {
    return null;
  }

  return request.packages.find((pack) => pack.id === packageId) || null;
}

function currentActors(request: ProcurementRequestDetail) {
  return uniqueIds([
    request.current_responsible?.id,
    request.requester?.id,
    request.storekeeper?.id,
  ]);
}

function normalizePackages(packages: ProcurementPackage[] = []) {
  return packages.filter((value) => value && value.id);
}

function createPackageTargets(
  request: ProcurementRequestDetail,
  packages: ProcurementPackage[] | [],
  targetMap: Map<string, NotificationTarget>,
  template: NotificationRecord,
  recipients: Array<number | undefined | null>,
) {
  const normalizedRecipients = uniqueIds(recipients);
  if (!packages.length) {
    createTarget(
      targetMap,
      createFallbackTargetUrl(request),
      template.title,
      replaceTemplate(template.body, request),
      normalizedRecipients,
    );
    return;
  }

  for (const targetPackage of packages) {
    createTarget(
      targetMap,
      buildPackageTargetUrl(request.id, targetPackage.id),
      template.title,
      replaceTemplate(template.body, request, targetPackage),
      normalizedRecipients,
    );
  }
}

async function buildTargets(
  action: ProcurementNotificationAction,
  request: ProcurementRequestDetail,
  packageId?: number | null,
): Promise<NotificationTarget[]> {
  const template = PROCUREMENT_ACTION_TEMPLATES[action];
  const targetPackage = currentPackage(request, packageId);
  const packages = normalizePackages(request.packages);
  const targetPackages = targetPackage ? [targetPackage] : packages;
  const actorIds = currentActors(request);

  const [financeUsers, adminUsers, legalUsers] = await Promise.all([
    roleUserIds("finance"),
    roleUserIds("administration"),
    roleUserIds("legal"),
  ]);

  const targetMap = new Map<string, NotificationTarget>();

  if (action === "request_created") {
    const [resolvedStorekeeperIds] = await Promise.all([requestStorekeeperIds(request)]);
    const recipients = uniqueIds([...actorIds, ...resolvedStorekeeperIds, ...financeUsers]);

    createTarget(
      targetMap,
      createFallbackTargetUrl(request),
      template.title,
      replaceTemplate(template.body, request),
      recipients,
    );
    return Array.from(targetMap.values());
  }

  if (action === "submit_quotations") {
    const recipients = targetPackages.length
      ? targetPackages.flatMap((targetPackage) =>
          targetPackage.is_over_threshold
            ? [...adminUsers, ...actorIds]
            : [...financeUsers, ...actorIds],
        )
      : [...financeUsers, ...actorIds, ...adminUsers];

    createPackageTargets(request, targetPackages, targetMap, template, uniqueIds(recipients));
    return Array.from(targetMap.values());
  }

  if (action === "prepare_order") {
    const recipients = uniqueIds([...financeUsers, ...adminUsers, ...actorIds]);
    createPackageTargets(request, targetPackages, targetMap, template, recipients);
    return Array.from(targetMap.values());
  }

  if (action === "director_decision") {
    const recipients = uniqueIds([...legalUsers, ...adminUsers, ...actorIds]);
    createPackageTargets(request, targetPackages, targetMap, template, recipients);
    return Array.from(targetMap.values());
  }

  if (action === "attach_final_order") {
    const recipients = uniqueIds([...financeUsers, ...adminUsers, ...actorIds]);
    createPackageTargets(request, targetPackages, targetMap, template, recipients);
    return Array.from(targetMap.values());
  }

  if (action === "move_to_finance_review") {
    const lowPackages = request.packages.filter(
      (item) =>
        !item.is_over_threshold &&
        item.payment_status?.code !== "payment_recorded" &&
        item.route_state?.code === "finance_review",
    );
    const highPackages = request.packages.filter(
      (item) =>
        item.is_over_threshold &&
        item.payment_status?.code !== "payment_recorded" &&
        ["legal_contract_draft", "legal_final_contract", "ceo_order_uploaded"].includes(item.route_state?.code || ""),
    );

    if (lowPackages.length) {
      for (const targetPackage of lowPackages) {
        createTarget(
          targetMap,
          buildPackageTargetUrl(request.id, targetPackage.id),
          template.title,
          replaceTemplate(template.body, request, targetPackage),
          uniqueIds([...financeUsers, ...actorIds]),
        );
      }
    }
    if (highPackages.length) {
      for (const targetPackage of highPackages) {
        createTarget(
          targetMap,
          buildPackageTargetUrl(request.id, targetPackage.id),
          "Хуулийн мэргэжилтэнд илгээгдлээ",
          replaceTemplate(
            "{request}{package} - гэрээ, тушаалын төсөл боловсруулах шатанд ирлээ.",
            request,
            targetPackage,
          ),
          uniqueIds([...legalUsers, ...actorIds]),
        );
      }
    }

    if (!lowPackages.length && !highPackages.length) {
      createTarget(
        targetMap,
        createFallbackTargetUrl(request),
        template.title,
        replaceTemplate(template.body, request),
        uniqueIds([...financeUsers, ...adminUsers, ...actorIds]),
      );
    }

    return Array.from(targetMap.values());
  }

  if (action === "record_package_ceo_order") {
    const recipients = uniqueIds([...legalUsers, ...adminUsers, ...actorIds]);
    createPackageTargets(request, targetPackages, targetMap, template, recipients);
    return Array.from(targetMap.values());
  }

  if (action === "start_contract_draft" || action === "start_order_draft") {
    const recipients = uniqueIds([...legalUsers, ...actorIds]);
    createPackageTargets(request, targetPackages, targetMap, template, recipients);
    return Array.from(targetMap.values());
  }

  if (action === "upload_order_draft") {
    const recipients = uniqueIds([...adminUsers, ...actorIds]);
    createPackageTargets(request, targetPackages, targetMap, template, recipients);
    return Array.from(targetMap.values());
  }

  if (action === "mark_contract_signed") {
    const financePackages = targetPackages.filter((item) => item.route_state?.code === "payment_pending");
    if (financePackages.length) {
      createPackageTargets(request, financePackages, targetMap, template, uniqueIds([...financeUsers, ...actorIds]));
    }
    if (!financePackages.length) {
      createPackageTargets(request, targetPackages, targetMap, template, uniqueIds([...legalUsers, ...financeUsers, ...actorIds]));
    }
    return Array.from(targetMap.values());
  }

  if (action === "mark_paid") {
    const recipients = uniqueIds([
      ...financeUsers,
      ...adminUsers,
      ...(await requestStorekeeperIds(request)),
      ...actorIds,
    ]);
    createPackageTargets(request, targetPackages, targetMap, template, recipients);
    return Array.from(targetMap.values());
  }

  if (action === "mark_received") {
    const departmentHeadIds = await loadDepartmentHeadUserIds(request.department?.id);
    const recipients = uniqueIds([
      ...financeUsers,
      ...adminUsers,
      request.requester?.id,
      ...departmentHeadIds,
      ...actorIds,
    ]);
    createPackageTargets(request, targetPackages, targetMap, template, recipients);
    return Array.from(targetMap.values());
  }

  if (action === "mark_done") {
    const departmentHeadIds = await loadDepartmentHeadUserIds(request.department?.id);
    const recipients = uniqueIds([
      ...financeUsers,
      ...adminUsers,
      request.requester?.id,
      ...departmentHeadIds,
      ...actorIds,
    ]);
    createPackageTargets(request, targetPackages, targetMap, template, recipients);
    return Array.from(targetMap.values());
  }

  if (action === "cancel") {
    const recipients = uniqueIds([...actorIds, ...financeUsers, ...adminUsers, ...legalUsers]);
    createPackageTargets(request, targetPackages, targetMap, template, recipients);
    return Array.from(targetMap.values());
  }

  return [];
}

export async function notifyProcurementStageChanged(
  action: ProcurementNotificationAction,
  request: ProcurementRequestDetail,
  packageId?: number | null,
) {
  try {
    const targets = await buildTargets(action, request, packageId);
    if (!targets.length) {
      console.warn("Procurement notification target resolution returned no entries", {
        action,
        requestId: request.id,
        packageId: packageId || null,
      });
      return [];
    }

    const normalizedTargets = targets.filter((target) => target.userIds.length > 0);
    if (!normalizedTargets.length) {
      console.warn("Procurement notification had empty resolved user list", {
        action,
        requestId: request.id,
        packageId: packageId || null,
      });
      return [];
    }

    const results = [];
    for (const target of normalizedTargets) {
      const userIds = uniqueIds(target.userIds);
      if (!userIds.length) {
        console.warn("Procurement notification target had no users after dedupe", {
          action,
          requestId: request.id,
          targetUrl: target.targetUrl,
        });
        continue;
      }

      if (!target.targetUrl) {
        console.warn("Procurement notification target had empty target url", {
          action,
          requestId: request.id,
          packageId: packageId || null,
        });
        continue;
      }

      results.push(
        await notifyPushEvent({
          eventType: "procurement_stage_changed",
          title: target.title,
          body: target.body,
          targetUrl: target.targetUrl,
          userIds,
        }),
      );
    }

    if (!results.length) {
      console.warn("Procurement notification was blocked due to empty user list", {
        action,
        requestId: request.id,
        packageId: packageId || null,
      });
    }

    return results;
  } catch (error) {
    console.warn("Procurement stage notification failed:", error);
    return [];
  }
}
