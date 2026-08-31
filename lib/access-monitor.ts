import "server-only";

import { executeOdooKw } from "@/lib/odoo";

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

function relationName(value?: [number, string] | false) {
  return Array.isArray(value) ? value[1] : "";
}

export async function loadErpAccessEntries(): Promise<ErpAccessEntry[]> {
  const [users, employees] = await Promise.all([
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
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));
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
    };
  });
}
