import "server-only";

import { notifyPushEvent } from "@/lib/push-notifications";
import { executeOdooKw } from "@/lib/odoo";
import { loadDepartmentHeadUserIds } from "@/lib/notification-recipients";
import type { ProcurementPackage, ProcurementRequestDetail } from "@/lib/procurement";

export type ProcurementNotificationAction =
  | "request_created"
  | "move_to_finance_review"
  | "record_package_ceo_order"
  | "mark_contract_signed"
  | "mark_paid"
  | "mark_received"
  | "mark_done"
  | "cancel";

type NotificationTarget = {
  userIds: number[];
  title: string;
  body: string;
  targetUrl: string;
};

const ROLE_GROUPS = {
  storekeeper: "municipal_repair_workflow.group_procurement_storekeeper",
  finance: "municipal_repair_workflow.group_procurement_finance_user",
  administration: "municipal_repair_workflow.group_procurement_administration_user",
  legal: "municipal_repair_workflow.group_procurement_legal_user",
};

function uniqueIds(ids: Array<number | undefined | null>) {
  return Array.from(new Set(ids.filter((id): id is number => Boolean(id))));
}

function packageTargetUrl(requestId: number, packageId?: number | null) {
  return packageId ? `/procurement/${requestId}?package_id=${packageId}#actions` : `/procurement/${requestId}`;
}

function packageNames(packages: ProcurementPackage[]) {
  if (!packages.length) return "";
  if (packages.length === 1) return packages[0].name;
  return `${packages.length} багц`;
}

async function roleUserIds(role: keyof typeof ROLE_GROUPS) {
  const [module, name] = ROLE_GROUPS[role].split(".");
  const rows = await executeOdooKw<Array<{ res_id: number }>>(
    "ir.model.data",
    "search_read",
    [[["module", "=", module], ["name", "=", name]]],
    { fields: ["res_id"], limit: 1 },
  ).catch(() => []);
  const groupId = rows[0]?.res_id;
  if (!groupId) return [];
  const groups = await executeOdooKw<Array<{ all_user_ids?: number[] }>>(
    "res.groups",
    "read",
    [[groupId], ["all_user_ids"]],
  ).catch(() => []);
  return uniqueIds(groups[0]?.all_user_ids || []);
}

async function requestStorekeeperIds(request: ProcurementRequestDetail) {
  const assigned = uniqueIds([request.storekeeper?.id]);
  return assigned.length ? assigned : roleUserIds("storekeeper");
}

function currentPackage(request: ProcurementRequestDetail, packageId?: number | null) {
  if (!packageId) return null;
  return request.packages.find((pack) => pack.id === packageId) || null;
}

async function buildTargets(
  action: ProcurementNotificationAction,
  request: ProcurementRequestDetail,
  packageId?: number | null,
): Promise<NotificationTarget[]> {
  const titleBase = `${request.name} - ${request.title}`;
  const pack = currentPackage(request, packageId);
  if (action === "request_created") {
    return [
      {
        userIds: await requestStorekeeperIds(request),
        title: "Шинэ худалдан авах хүсэлт ирлээ",
        body: `${titleBase} няравын шатанд ирлээ.`,
        targetUrl: packageTargetUrl(request.id),
      },
    ];
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
        ["admin_review", "ceo_decision", "ceo_order_uploaded"].includes(item.route_state?.code || ""),
    );
    const targets: NotificationTarget[] = [];
    if (lowPackages.length) {
      targets.push({
        userIds: await roleUserIds("finance"),
        title: "Төлбөрийн хяналтанд багц ирлээ",
        body: `${titleBase}: ${packageNames(lowPackages)} төлбөрийн шатанд ирлээ.`,
        targetUrl: packageTargetUrl(request.id, lowPackages[0].id),
      });
    }
    if (highPackages.length) {
      targets.push({
        userIds: await roleUserIds("administration"),
        title: "Захирлын тушаал шаардсан багц ирлээ",
        body: `${titleBase}: ${packageNames(highPackages)} 1 саяас дээш процесс руу ирлээ.`,
        targetUrl: packageTargetUrl(request.id, highPackages[0].id),
      });
    }
    return targets;
  }

  if (action === "record_package_ceo_order") {
    return [
      {
        userIds: await roleUserIds("legal"),
        title: "Гэрээний төсөл боловсруулах багц ирлээ",
        body: `${titleBase}: ${pack?.name || "өндөр дүнтэй багц"} дээр захирлын тушаал бүртгэгдлээ.`,
        targetUrl: packageTargetUrl(request.id, packageId),
      },
    ];
  }

  if (action === "mark_contract_signed") {
    return [
      {
        userIds: await roleUserIds("finance"),
        title: "Төлбөр бүртгэх багц ирлээ",
        body: `${titleBase}: ${pack?.name || "багц"} гэрээний шатнаас санхүү рүү ирлээ.`,
        targetUrl: packageTargetUrl(request.id, packageId),
      },
    ];
  }

  if (action === "mark_paid") {
    return [
      {
        userIds: await requestStorekeeperIds(request),
        title: "Хүлээн авалт хийх багц ирлээ",
        body: `${titleBase}: ${pack?.name || "багц"} төлбөр бүртгэгдлээ.`,
        targetUrl: packageTargetUrl(request.id, packageId),
      },
    ];
  }

  if (action === "mark_received" || action === "mark_done") {
    const departmentHeadIds = await loadDepartmentHeadUserIds(request.department?.id);
    return [
      {
        userIds: uniqueIds([request.requester?.id, ...departmentHeadIds]),
        title: "Худалдан авалтын хүсэлт дууслаа",
        body: `${titleBase}: хүлээлгэн өгч дууссан төлөвт орлоо.`,
        targetUrl: packageTargetUrl(request.id, packageId),
      },
    ];
  }

  if (action === "cancel") {
    return [
      {
        userIds: uniqueIds([request.requester?.id, request.storekeeper?.id]),
        title: "Худалдан авалтын хүсэлт цуцлагдлаа",
        body: `${titleBase}: хүсэлт цуцлагдсан байна.`,
        targetUrl: packageTargetUrl(request.id, packageId),
      },
    ];
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
    const results = [];
    for (const target of targets) {
      const userIds = uniqueIds(target.userIds);
      if (!userIds.length) continue;
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
    return results;
  } catch (error) {
    console.warn("Procurement stage notification failed:", error);
    return [];
  }
}
