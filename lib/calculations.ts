import "server-only";

import type { AppSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

export const CALCULATION_MODEL = "municipal.calculation";
export const MATERIAL_MODEL = "municipal.calculation.material";
export const PRICE_MODEL = "municipal.calculation.material.price";

export type CalculationPayload = {
  work_name: string; work_type?: string; date: string; location: string; description?: string;
  quantity: number; unit: string; status: "draft" | "calculated" | "approved";
  materials?: Record<string, unknown>[]; labor?: Record<string, unknown>[];
  equipment?: Record<string, unknown>[]; transport?: Record<string, unknown>[]; other?: Record<string, unknown>[];
};

function connection(session: AppSession) {
  return { url: session.odooUrl, db: session.odooDb, login: session.login, password: session.password };
}

export function rpc<T>(session: AppSession, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  return executeOdooKw<T>(model, method, args, kwargs, connection(session));
}

const calcFields = ["calculation_number", "date", "work_name", "work_type", "location", "description", "quantity", "unit", "status", "material_total", "labor_total", "equipment_total", "transportation_total", "other_total", "grand_total", "material_line_ids", "labor_line_ids", "equipment_line_ids", "transport_line_ids", "other_line_ids", "created_by", "create_date", "updated_by", "write_date"];

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
    materials: await readLines(session, "municipal.calculation.line.material", ids("material_line_ids"), ["material_id", "material_code", "material_name", "category", "unit", "quantity", "unit_price", "total"]),
    labor: await readLines(session, "municipal.calculation.line.labor", ids("labor_line_ids"), ["work_type", "employee_count", "duration", "unit", "unit_price", "total"]),
    equipment: await readLines(session, "municipal.calculation.line.equipment", ids("equipment_line_ids"), ["equipment_name", "hours", "hourly_rate", "total"]),
    transport: await readLines(session, "municipal.calculation.line.transport", ids("transport_line_ids"), ["transport_type", "quantity", "unit_price", "total"]),
    other: await readLines(session, "municipal.calculation.line.other", ids("other_line_ids"), ["name", "description", "amount"]),
  };
}

function commands(rows: Record<string, unknown>[] = []) {
  return rows.map((source) => {
    const row = { ...source };
    delete row.id;
    delete row.total;
    if (Array.isArray(row.material_id)) {
      row.material_id = Number(row.material_id[0]);
    }
    return [0, 0, row];
  });
}
function values(payload: CalculationPayload): Record<string, unknown> {
  return { work_name: payload.work_name, work_type: payload.work_type || false, date: payload.date, location: payload.location, description: payload.description || false, quantity: payload.quantity, unit: payload.unit, status: payload.status,
    material_line_ids: commands(payload.materials), labor_line_ids: commands(payload.labor), equipment_line_ids: commands(payload.equipment), transport_line_ids: commands(payload.transport), other_line_ids: commands(payload.other) };
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
  return rpc<Record<string, unknown>[]>(session, MATERIAL_MODEL, "search_read", [domain], { fields: ["code", "name", "category", "unit", "current_price", "description", "active", "create_date", "write_date"], order: "code", limit: 500 });
}
