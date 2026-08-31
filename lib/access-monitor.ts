import "server-only";

import { executeOdooKw } from "@/lib/odoo";
import { loadErpLoginAudit, type ErpLoginAuditEvent } from "@/lib/erp-login-audit";

export type ErpAccessEntry = {
  id: number;
  name: string;
  login: string;
  lastLoginAt: string;
  active: boolean;
  portalUser: boolean;
  hasAccount: boolean;
  department: string;
  jobTitle: string;
  loginHistory: ErpLoginAuditEvent[];
};

type OdooUserAccessRecord = {
  id: number;
  name?: string | false;
  login?: string | false;
  login_date?: string | false;
  active?: boolean;
  share?: boolean;
};

type OdooEmployeeAccessRecord = {
  id: number;
  name?: string | false;
  user_id?: [number, string] | false;
  department_id?: [number, string] | false;
  job_id?: [number, string] | false;
};

type OdooLoginRecord = {
  id: number;
  create_uid?: [number, string] | false;
  create_date?: string | false;
};

function relationName(value?: [number, string] | false) {
  return Array.isArray(value) ? value[1] : "";
}

function recentLoginValue(value: string, cutoff: number) {
  if (!value) return false;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) && timestamp >= cutoff;
}

const SYSTEM_ADMIN_TOKENS = new Set([
  "admin", "administrator", "system administrator", "odoo admin", "odoo administrator",
  "админ", "администратор", "систем админ", "системийн админ", "систем администратор",
]);

function isSystemAdminEntry(entry: ErpAccessEntry) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase("mn-MN").replace(/\s+/g, " ");
  const loginName = normalize(entry.login).split("@")[0];
  return SYSTEM_ADMIN_TOKENS.has(loginName) || SYSTEM_ADMIN_TOKENS.has(normalize(entry.name));
}

export function filterRecentErpAccessEntries(entries: ErpAccessEntry[], days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return entries.filter((entry) =>
    entry.hasAccount && !isSystemAdminEntry(entry) && (
      recentLoginValue(entry.lastLoginAt, cutoff) ||
      entry.loginHistory.some((event) => recentLoginValue(event.loggedInAt, cutoff))
    ),
  );
}

export async function loadErpAccessEntries(): Promise<ErpAccessEntry[]> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
  const [users, employees, loginAudit, odooLoginRecords] = await Promise.all([
    executeOdooKw<OdooUserAccessRecord[]>(
      "res.users",
      "search_read",
      [[]],
      {
        fields: ["name", "login", "login_date", "active", "share"],
        order: "name asc",
        limit: 1000,
        context: { active_test: false },
      },
    ),
    executeOdooKw<OdooEmployeeAccessRecord[]>(
      "hr.employee",
      "search_read",
      [[['active', '=', true]]],
      {
        fields: ["name", "user_id", "department_id", "job_id"],
        order: "name asc",
        limit: 2000,
      },
    ),
    loadErpLoginAudit(30),
    executeOdooKw<OdooLoginRecord[]>(
      "res.users.log",
      "search_read",
      [[["create_date", ">=", cutoff]]],
      { fields: ["create_uid", "create_date"], order: "create_date desc", limit: 20_000 },
    ).catch(() => []),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));
  const auditByUserId = new Map<number, ErpLoginAuditEvent[]>();
  for (const event of loginAudit) {
    const items = auditByUserId.get(event.userId) || [];
    items.push(event);
    auditByUserId.set(event.userId, items);
  }
  for (const record of odooLoginRecords) {
    const userId = Array.isArray(record.create_uid) ? record.create_uid[0] : 0;
    if (!userId || typeof record.create_date !== "string") continue;
    const items = auditByUserId.get(userId) || [];
    items.push({
      id: `odoo-${record.id}`,
      userId,
      login: "",
      name: Array.isArray(record.create_uid) ? record.create_uid[1] : "",
      loggedInAt: record.create_date,
      device: "Odoo нэвтрэлтийн бүртгэл",
    });
    auditByUserId.set(userId, items);
  }
  return employees.map((employee) => {
    const userId = Array.isArray(employee.user_id) ? employee.user_id[0] : 0;
    const user = usersById.get(userId);
    return {
      id: employee.id,
      name: typeof employee.name === "string" ? employee.name : "Нэргүй ажилтан",
      login: typeof user?.login === "string" ? user.login : "",
      lastLoginAt: typeof user?.login_date === "string" ? user.login_date : "",
      active: user?.active !== false,
      portalUser: user?.share === true,
      hasAccount: Boolean(user),
      department: relationName(employee.department_id),
      jobTitle: relationName(employee.job_id),
      loginHistory: (auditByUserId.get(userId) || []).sort((a, b) => b.loggedInAt.localeCompare(a.loggedInAt)),
    };
  });
}
