import "server-only";

import { executeOdooKw } from "@/lib/odoo";

export type ErpAccessEntry = {
  id: number;
  name: string;
  login: string;
  lastLoginAt: string;
  active: boolean;
  portalUser: boolean;
};

type OdooUserAccessRecord = {
  id: number;
  name?: string | false;
  login?: string | false;
  login_date?: string | false;
  active?: boolean;
  share?: boolean;
};

export async function loadErpAccessEntries(): Promise<ErpAccessEntry[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const users = await executeOdooKw<OdooUserAccessRecord[]>(
    "res.users",
    "search_read",
    [[['login_date', '>=', since]]],
    {
      fields: ["name", "login", "login_date", "active", "share"],
      order: "login_date desc, name asc",
      limit: 500,
      context: { active_test: false },
    },
  );

  return users.map((user) => ({
    id: user.id,
    name: typeof user.name === "string" ? user.name : "Нэргүй хэрэглэгч",
    login: typeof user.login === "string" ? user.login : "",
    lastLoginAt: typeof user.login_date === "string" ? user.login_date : "",
    active: user.active !== false,
    portalUser: user.share === true,
  }));
}
