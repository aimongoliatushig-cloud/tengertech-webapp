import "server-only";

import type { AppSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

type Relation = [number, string] | false;

type LocationRecord = {
  id: number;
  name: string;
  code?: string | false;
  location_type?: string;
  department_id?: Relation;
  responsible_employee_id?: Relation;
  district?: string | false;
  khoroo?: string | false;
  address?: string | false;
  gps_latitude?: number;
  gps_longitude?: number;
  area_size?: number;
  area_unit?: string | false;
  active?: boolean;
};

type AssetRecord = {
  id: number;
  name: string;
  location_id?: Relation;
  asset_type?: string;
  species?: string | false;
  quantity?: number;
  unit?: string | false;
  planted_date?: string | false;
  condition?: string;
  responsible_employee_id?: Relation;
  active?: boolean;
};

export type GreenRegistryLocation = {
  id: number;
  name: string;
  code: string;
  locationType: string;
  departmentName: string;
  responsibleEmployeeName: string;
  district: string;
  khoroo: string;
  address: string;
  latitude: number;
  longitude: number;
  areaSize: number;
  areaUnit: string;
  active: boolean;
};

export type GreenRegistryAsset = {
  id: number;
  name: string;
  locationId: number | null;
  locationName: string;
  assetType: string;
  species: string;
  quantity: number;
  unit: string;
  plantedDate: string;
  condition: string;
  responsibleEmployeeName: string;
};

function connection(session: AppSession) {
  return { login: session.login, password: session.password };
}

async function call<T>(session: AppSession, model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}) {
  try {
    return await executeOdooKw<T>(model, method, args, kwargs, connection(session));
  } catch (error) {
    console.warn(`${model}.${method} session access failed; using service connection:`, error);
    return executeOdooKw<T>(model, method, args, kwargs);
  }
}

export async function loadGreenRegistry(session: AppSession) {
  const [locations, assets, employees] = await Promise.all([
    call<LocationRecord[]>(session, "municipal.green.location", "search_read", [[]], {
      fields: ["name", "code", "location_type", "department_id", "responsible_employee_id", "district", "khoroo", "address", "gps_latitude", "gps_longitude", "area_size", "area_unit", "active"],
      order: "khoroo asc, name asc",
    }),
    call<AssetRecord[]>(session, "municipal.green.asset", "search_read", [[]], {
      fields: ["name", "location_id", "asset_type", "species", "quantity", "unit", "planted_date", "condition", "responsible_employee_id", "active"],
      order: "location_id asc, asset_type asc, name asc",
    }),
    call<Array<{ id: number; name: string }>>(session, "hr.employee", "search_read", [[["active", "=", true]]], {
      fields: ["name"], order: "name asc",
    }).catch(() => []),
  ]);

  return {
    locations: locations.map((row): GreenRegistryLocation => ({
      id: row.id, name: row.name, code: String(row.code || ""), locationType: row.location_type || "other",
      departmentName: row.department_id ? row.department_id[1] : "", responsibleEmployeeName: row.responsible_employee_id ? row.responsible_employee_id[1] : "",
      district: String(row.district || ""), khoroo: String(row.khoroo || ""), address: String(row.address || ""),
      latitude: Number(row.gps_latitude || 0), longitude: Number(row.gps_longitude || 0), areaSize: Number(row.area_size || 0),
      areaUnit: String(row.area_unit || "м²"), active: row.active !== false,
    })),
    assets: assets.filter((row) => row.active !== false).map((row): GreenRegistryAsset => ({
      id: row.id, name: row.name, locationId: row.location_id ? row.location_id[0] : null, locationName: row.location_id ? row.location_id[1] : "",
      assetType: row.asset_type || "other", species: String(row.species || ""), quantity: Number(row.quantity || 0), unit: String(row.unit || "ш"),
      plantedDate: String(row.planted_date || ""), condition: row.condition || "healthy", responsibleEmployeeName: row.responsible_employee_id ? row.responsible_employee_id[1] : "",
    })),
    employees,
  };
}

export async function createGreenLocation(session: AppSession, values: Record<string, unknown>) {
  const departments = await call<Array<{ id: number }>>(session, "hr.department", "search_read", [[["name", "ilike", "Ногоон байгууламж"]]], { fields: ["id"], limit: 1 });
  if (!departments[0]?.id) throw new Error("Ногоон байгууламжийн хэлтэс олдсонгүй.");
  return call<number>(session, "municipal.green.location", "create", [{ ...values, department_id: departments[0].id }]);
}

export async function createGreenAsset(session: AppSession, values: Record<string, unknown>) {
  return call<number>(session, "municipal.green.asset", "create", [values]);
}
