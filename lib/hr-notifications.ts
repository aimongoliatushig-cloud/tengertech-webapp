import "server-only";

import type { AppSession } from "@/lib/auth";
import type { HrTimeoffRequest } from "@/lib/hr";
import { executeOdooKw } from "@/lib/odoo";
import { notifyPushEvent } from "@/lib/push-notifications";
import { fixMojibakeText } from "@/lib/text-normalize";

type ExternalIdRecord = {
  res_id?: number | false;
};

type UserIdRecord = {
  id: number;
};

type HrEmployeeRecipientRecord = {
  user_id?: [number, string] | false;
  department_id?: [number, string] | false;
  job_id?: [number, string] | false;
  job_title?: string | false;
  x_hr_role?: string | false;
  x_role_key?: string | false;
};

type HrEmployeeUserRecord = {
  user_id?: [number, string] | false;
};

const HR_REVIEWER_GROUPS = [
  "hr.group_hr_manager",
  "hr_custom_mn.group_hr_custom_mn_officer",
  "hr_custom_mn.group_hr_custom_mn_admin",
  "municipal_core.group_municipal_hr",
];

const HR_TEXT_TOKENS = [
  "хүний нөөц",
  "human resources",
  "hr officer",
  "hr admin",
  "hr manager",
  "hr specialist",
  "hr_user",
  "hr_manager",
];

function uniqueUserIds(values: Array<number | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)),
  );
}

function normalizeText(value: unknown) {
  return fixMojibakeText(String(value ?? "")).trim().toLocaleLowerCase("mn-MN");
}

function relationName(value?: [number, string] | false) {
  return Array.isArray(value) ? value[1] : "";
}

function containsHrText(value: unknown) {
  const normalized = normalizeText(value);
  return HR_TEXT_TOKENS.some((token) => normalized.includes(normalizeText(token)));
}

async function getAvailableFields(model: string, desiredFields: string[]) {
  try {
    const fields = await executeOdooKw<Record<string, unknown>>(
      model,
      "fields_get",
      [desiredFields],
      { attributes: ["string", "type"] },
    );
    return desiredFields.filter((field) => Boolean(fields[field]));
  } catch (error) {
    console.warn(`HR notification fields_get failed for ${model}:`, error);
    return desiredFields;
  }
}

async function loadHrReviewerGroupIds() {
  const xmlIds = HR_REVIEWER_GROUPS.map((value) => {
    const [module, name] = value.split(".");
    return { module, name };
  });
  const modules = Array.from(new Set(xmlIds.map((item) => item.module)));
  const names = xmlIds.map((item) => item.name);

  const records = await executeOdooKw<ExternalIdRecord[]>(
    "ir.model.data",
    "search_read",
    [[["model", "=", "res.groups"], ["module", "in", modules], ["name", "in", names]]],
    { fields: ["res_id"], limit: 20 },
  ).catch((error) => {
    console.warn("HR reviewer group lookup failed:", error);
    return [];
  });

  return uniqueUserIds(records.map((record) => (record.res_id ? Number(record.res_id) : null)));
}

async function loadUsersFromGroups(groupIds: number[]) {
  if (!groupIds.length) return [];

  const users = await executeOdooKw<UserIdRecord[]>(
    "res.users",
    "search_read",
    [[["active", "=", true], ["groups_id", "in", groupIds]]],
    { fields: ["id"], limit: 300 },
  ).catch((error) => {
    console.warn("HR reviewer users could not be loaded:", error);
    return [];
  });

  return users.map((user) => user.id);
}

async function loadUsersFromHrEmployees() {
  const desiredFields = ["user_id", "department_id", "job_id", "job_title", "x_hr_role", "x_role_key"];
  const fields = await getAvailableFields("hr.employee", desiredFields);
  const employees = await executeOdooKw<HrEmployeeRecipientRecord[]>(
    "hr.employee",
    "search_read",
    [[["user_id", "!=", false]]],
    {
      fields,
      limit: 300,
      context: { active_test: false },
    },
  ).catch((error) => {
    console.warn("HR employee recipient fallback failed:", error);
    return [];
  });

  return employees
    .filter((employee) => {
      return (
        containsHrText(relationName(employee.department_id)) ||
        containsHrText(relationName(employee.job_id)) ||
        containsHrText(employee.job_title) ||
        containsHrText(employee.x_hr_role) ||
        containsHrText(employee.x_role_key)
      );
    })
    .map((employee) => (Array.isArray(employee.user_id) ? employee.user_id[0] : null));
}

async function loadHrReviewerUserIds(excludeUserId?: number | null) {
  const groupIds = await loadHrReviewerGroupIds();
  const [groupUsers, employeeUsers] = await Promise.all([
    loadUsersFromGroups(groupIds),
    loadUsersFromHrEmployees(),
  ]);

  return uniqueUserIds([...groupUsers, ...employeeUsers]).filter((userId) => userId !== excludeUserId);
}

async function loadEmployeeUserId(employeeId: number) {
  if (!Number.isFinite(employeeId) || employeeId <= 0) return null;

  const records = await executeOdooKw<HrEmployeeUserRecord[]>(
    "hr.employee",
    "search_read",
    [[["id", "=", employeeId]]],
    {
      fields: ["user_id"],
      limit: 1,
      context: { active_test: false },
    },
  ).catch((error) => {
    console.warn("HR request employee user lookup failed:", error);
    return [];
  });

  const userId = records[0]?.user_id;
  return Array.isArray(userId) ? userId[0] : null;
}

function buildTimeoffNotificationBody(request: HrTimeoffRequest) {
  const employee = request.employeeName || "Ажилтан";
  const type = request.requestTypeLabel || (request.requestType === "sick" ? "Өвчтэй" : "Чөлөө");
  const dates = request.dateFrom && request.dateTo ? `${request.dateFrom} - ${request.dateTo}` : "";
  return [employee, type, dates].filter(Boolean).join(" · ");
}

export async function notifyHrTimeoffRequestSubmitted(request: HrTimeoffRequest, session?: AppSession | null) {
  const userIds = await loadHrReviewerUserIds(session?.uid);
  if (!userIds.length) {
    console.warn("HR time off request push skipped: no HR reviewer recipients found.");
    return { sent: 0, failed: 0, skipped: "no_recipients" as const };
  }

  return notifyPushEvent({
    eventType: "hr_timeoff_request",
    title: request.requestType === "sick" ? "Өвчтэй хүсэлт ирлээ" : "Чөлөөний хүсэлт ирлээ",
    body: buildTimeoffNotificationBody(request),
    targetUrl: "/hr/leaves",
    userIds,
  });
}

function timeoffStatusTitle(request: HrTimeoffRequest) {
  switch (request.state) {
    case "approved":
      return "HR хүсэлт батлагдлаа";
    case "rejected":
      return "HR хүсэлт татгалзлаа";
    case "hr_review":
      return "HR хүсэлт шалгалтад орлоо";
    case "cancelled":
      return "HR хүсэлт цуцлагдлаа";
    default:
      return "HR хүсэлтийн төлөв өөрчлөгдлөө";
  }
}

function timeoffStatusBody(request: HrTimeoffRequest) {
  const type = request.requestTypeLabel || (request.requestType === "sick" ? "Өвчтэй" : "Чөлөө");
  const dates = request.dateFrom && request.dateTo ? ` · ${request.dateFrom} - ${request.dateTo}` : "";
  return `${type} хүсэлтийн төлөв: ${request.stateLabel || request.state}.${dates}`;
}

export async function notifyHrTimeoffRequestStatusChanged(request: HrTimeoffRequest, session?: AppSession | null) {
  const employeeUserId = await loadEmployeeUserId(request.employeeId);
  if (!employeeUserId || employeeUserId === session?.uid) {
    return { sent: 0, failed: 0, skipped: "no_employee_recipient" as const };
  }

  return notifyPushEvent({
    eventType: "hr_timeoff_status",
    title: timeoffStatusTitle(request),
    body: timeoffStatusBody(request),
    targetUrl: "/hr/leaves",
    userIds: [employeeUserId],
  });
}
