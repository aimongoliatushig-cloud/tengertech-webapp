import "server-only";

import type { AppSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

export const CALCULATION_MODEL = "municipal.calculation";
export const MATERIAL_MODEL = "municipal.calculation.material";
export const PRICE_MODEL = "municipal.calculation.material.price";
export const PACKAGE_MODEL = "municipal.calculation.work.package";
export const LABOR_RATE_MODEL = "municipal.calculation.labor.rate";
export const LABOR_HISTORY_MODEL = "municipal.calculation.labor.rate.history";

export type CalculationPayload = {
  work_name: string; work_type?: string; date: string; location: string; description?: string;
  quantity: number; unit: string; status: "draft" | "calculated" | "approved";
  work_package_id?: number; work_package_code?: string; work_package_name?: string; work_package_base_unit?: string;
  materials?: Record<string, unknown>[]; labor?: Record<string, unknown>[];
  equipment?: Record<string, unknown>[]; transport?: Record<string, unknown>[]; other?: Record<string, unknown>[];
};

function connection(session: AppSession) {
  return { url: session.odooUrl, db: session.odooDb, login: session.login, password: session.password };
}

export function rpc<T>(session: AppSession, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  return executeOdooKw<T>(model, method, args, kwargs, connection(session)).catch((error: unknown) => {
    // Passwords can be changed in Odoo while the signed web session is still valid.
    // The route has already authorized the web user, so use the server service
    // account only when the per-user Odoo authentication itself has gone stale.
    if (error instanceof Error && error.message === "Odoo authentication failed") {
      return executeOdooKw<T>(model, method, args, kwargs);
    }
    throw error;
  });
}

const calcFields = ["calculation_number", "date", "work_name", "work_type", "location", "description", "quantity", "unit", "status", "work_package_id", "work_package_code", "work_package_name", "work_package_base_unit", "material_total", "labor_total", "equipment_total", "transportation_total", "other_total", "grand_total", "material_line_ids", "labor_line_ids", "equipment_line_ids", "transport_line_ids", "other_line_ids", "created_by", "create_date", "updated_by", "write_date"];

export async function listCalculations(session: AppSession, query: URLSearchParams) {
  const domain: unknown[] = [];
  const search = query.get("search")?.trim();
  if (search) domain.push("|", "|", ["calculation_number", "ilike", search], ["work_name", "ilike", search], ["location", "ilike", search]);
  if (query.get("status")) domain.push(["status", "=", query.get("status")]);
  if (query.get("work_type")) domain.push(["work_type", "ilike", query.get("work_type")]);
  if (query.get("location")) domain.push(["location", "ilike", query.get("location")]);
  if (query.get("date_from")) domain.push(["date", ">=", query.get("date_from")]);
  if (query.get("date_to")) domain.push(["date", "<=", query.get("date_to")]);
  return rpc<Record<string, unknown>[]>(session, CALCULATION_MODEL, "search_read", [domain], { fields: calcFields, order: "date desc, id desc", limit: 500 });
}

async function readLines(session: AppSession, model: string, ids: number[], fields: string[]) {
  if (!ids.length) return [];
  return rpc<Record<string, unknown>[]>(session, model, "read", [ids], { fields });
}

export async function getCalculation(session: AppSession, id: number) {
  const rows = await rpc<Record<string, unknown>[]>(session, CALCULATION_MODEL, "read", [[id]], { fields: calcFields });
  const row = rows[0];
  if (!row) return null;
  const ids = (name: string) => (row[name] as number[] | undefined) ?? [];
  return {
    ...row,
    materials: await readLines(session, "municipal.calculation.line.material", ids("material_line_ids"), ["material_id", "material_code", "material_name", "category", "unit", "quantity", "unit_price", "norm", "total"]),
    labor: await readLines(session, "municipal.calculation.line.labor", ids("labor_line_ids"), ["work_type", "employee_count", "duration", "unit", "unit_price", "norm", "total"]),
    equipment: await readLines(session, "municipal.calculation.line.equipment", ids("equipment_line_ids"), ["equipment_name", "hours", "hourly_rate", "norm", "total"]),
    transport: await readLines(session, "municipal.calculation.line.transport", ids("transport_line_ids"), ["transport_type", "quantity", "unit_price", "norm", "total"]),
    other: await readLines(session, "municipal.calculation.line.other", ids("other_line_ids"), ["name", "description", "amount", "norm"]),
  };
}

const LINE_FIELDS: Record<string, string[]> = {
  material_line_ids: ["material_id", "material_code", "material_name", "category", "unit", "quantity", "unit_price", "norm"],
  labor_line_ids: ["work_type", "employee_count", "duration", "unit", "unit_price", "norm"],
  equipment_line_ids: ["equipment_name", "hours", "hourly_rate", "norm"],
  transport_line_ids: ["transport_type", "quantity", "unit_price", "norm"],
  other_line_ids: ["name", "description", "amount", "norm"],
};

function commands(rows: Record<string, unknown>[] = [], fieldNames: string[]) {
  return rows.map((source) => {
    const row = { ...source };
    for (const key of Object.keys(row)) if (!fieldNames.includes(key)) delete row[key];
    for (const key of Object.keys(row)) if (key.endsWith("_id") && Array.isArray(row[key])) row[key] = Number((row[key] as unknown[])[0]);
    return [0, 0, row];
  });
}
function values(payload: CalculationPayload): Record<string, unknown> {
  return { work_name: payload.work_name, work_type: payload.work_type || false, date: payload.date, location: payload.location, description: payload.description || false, quantity: payload.quantity, unit: payload.unit, status: payload.status, work_package_id: payload.work_package_id || false, work_package_code: payload.work_package_code || false, work_package_name: payload.work_package_name || false, work_package_base_unit: payload.work_package_base_unit || false,
    material_line_ids: commands(payload.materials, LINE_FIELDS.material_line_ids), labor_line_ids: commands(payload.labor, LINE_FIELDS.labor_line_ids), equipment_line_ids: commands(payload.equipment, LINE_FIELDS.equipment_line_ids), transport_line_ids: commands(payload.transport, LINE_FIELDS.transport_line_ids), other_line_ids: commands(payload.other, LINE_FIELDS.other_line_ids) };
}

export async function createCalculation(session: AppSession, payload: CalculationPayload) {
  return rpc<number>(session, CALCULATION_MODEL, "create", [values(payload)]);
}
export async function updateCalculation(session: AppSession, id: number, payload: CalculationPayload) {
  const vals = values(payload);
  for (const key of ["material_line_ids", "labor_line_ids", "equipment_line_ids", "transport_line_ids", "other_line_ids"] as const) vals[key] = [[5, 0, 0], ...((vals[key] as unknown[]) || [])];
  return rpc<boolean>(session, CALCULATION_MODEL, "write", [[id], vals]);
}

export async function listMaterials(session: AppSession, query: URLSearchParams) {
  const domain: unknown[] = [];
  const search = query.get("search")?.trim();
  if (search) domain.push("|", ["code", "ilike", search], ["name", "ilike", search]);
  if (query.get("category")) domain.push(["category", "=", query.get("category")]);
  if (query.get("unit")) domain.push(["unit", "=", query.get("unit")]);
  if (query.get("active") === "true") domain.push(["active", "=", true]);
  if (query.get("active") === "false") domain.push(["active", "=", false]);
  return rpc<Record<string, unknown>[]>(session, MATERIAL_MODEL, "search_read", [domain], { fields: ["code", "name", "category", "unit", "current_price", "price_source", "price_effective_date", "description", "active", "create_date", "write_date"], order: "code", limit: 500 });
}

const packageFields = ["code", "name", "category", "base_unit", "description", "active", "component_count", "material_line_ids", "labor_line_ids", "equipment_line_ids", "transport_line_ids", "other_line_ids", "created_by", "create_date", "updated_by", "write_date"];

export async function listWorkPackages(session: AppSession, query: URLSearchParams) {
  const domain: unknown[] = [];
  const search = query.get("search")?.trim();
  if (search) domain.push("|", "|", ["code", "ilike", search], ["name", "ilike", search], ["category", "ilike", search]);
  if (query.get("category")) domain.push(["category", "=", query.get("category")]);
  if (query.get("active") !== "all") domain.push(["active", "=", true]);
  return rpc<Record<string, unknown>[]>(session, PACKAGE_MODEL, "search_read", [domain], { fields: packageFields, order: "code", limit: 200 });
}

export async function getWorkPackage(session: AppSession, id: number) {
  const rows = await rpc<Record<string, unknown>[]>(session, PACKAGE_MODEL, "read", [[id]], { fields: packageFields });
  const row = rows[0]; if (!row) return null;
  const packageLines = (model: string, fields: string[]) => rpc<Record<string, unknown>[]>(
    session, model, "search_read", [[['package_id', '=', id]]], { fields, order: "id" },
  );
  return { ...row,
    materials: await packageLines("municipal.calculation.work.package.material", ["material_id", "norm", "unit", "unit_price"]),
    labor: await packageLines("municipal.calculation.work.package.labor", ["labor_rate_id", "norm", "unit", "unit_price", "required"]),
    equipment: await packageLines("municipal.calculation.work.package.equipment", ["name", "norm", "unit", "unit_price"]),
    transport: await packageLines("municipal.calculation.work.package.transport", ["name", "norm", "unit", "unit_price"]),
    other: await packageLines("municipal.calculation.work.package.other", ["name", "description", "norm", "unit", "unit_price"]),
  };
}

const packageLineFields: Record<string, string[]> = {
  material_line_ids: ["material_id", "norm", "unit", "unit_price"], labor_line_ids: ["labor_rate_id", "norm", "unit", "unit_price", "required"],
  equipment_line_ids: ["name", "norm", "unit", "unit_price"], transport_line_ids: ["name", "norm", "unit", "unit_price"], other_line_ids: ["name", "description", "norm", "unit", "unit_price"],
};
export function workPackageValues(body: Record<string, unknown>): Record<string, unknown> {
  const fieldKey: Record<string, string> = { materials: "material_line_ids", labor: "labor_line_ids", equipment: "equipment_line_ids", transport: "transport_line_ids", other: "other_line_ids" };
  const rows = (key: string) => commands((body[key] as Record<string, unknown>[] | undefined) || [], packageLineFields[fieldKey[key]]);
  return { name: body.name, category: body.category, base_unit: body.base_unit, description: body.description || false, active: body.active !== false,
    material_line_ids: rows("materials"), labor_line_ids: rows("labor"), equipment_line_ids: rows("equipment"), transport_line_ids: rows("transport"), other_line_ids: rows("other") };
}

export function workPackageUpdateValues(body: Record<string, unknown>) {
  const vals = workPackageValues(body);
  for (const key of Object.keys(packageLineFields)) vals[key] = [[5, 0, 0], ...((vals[key] as unknown[]) || [])];
  return vals;
}

export async function listLaborRates(session: AppSession) {
  return rpc<Record<string, unknown>[]>(session, LABOR_RATE_MODEL, "search_read", [[]], { fields: ["code", "name", "unit", "current_rate", "active", "create_date", "write_date"], order: "code", limit: 300 });
}
