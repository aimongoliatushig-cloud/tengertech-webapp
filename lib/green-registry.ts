import "server-only";

import type { AppSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";

type Relation = [number, string] | false;

type LocationRecord = {
  id: number;
  name: string;
  code?: string | false;
  location_type?: string;
  asset_group?: string;
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

type ActivityRecord = {
  id: number;
  name: string;
  location_id?: Relation;
  activity_type?: string;
  planned_date?: string | false;
  done_datetime?: string | false;
  actual_quantity?: number;
  unit?: string | false;
  state?: string;
  report_note?: string | false;
  assigned_employee_id?: Relation;
};

type VehicleVisitRecord = { id:number; location_id?:Relation; vehicle_plate:string; visit_date:string; entered_at:string; exited_at?:string|false; closest_meters?:number; sample_count?:number };

export type GreenRegistryLocation = {
  id: number;
  name: string;
  code: string;
  locationType: string;
  assetGroup: string;
  departmentName: string;
  responsibleEmployeeId: number | null;
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

export type GreenRegistryActivity = {
  id: number;
  name: string;
  locationId: number | null;
  locationName: string;
  activityType: string;
  plannedDate: string;
  doneDate: string;
  actualQuantity: number;
  unit: string;
  state: string;
  reportNote: string;
  assignedEmployeeName: string;
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
  const [locations, assets, activities, employees, vehicleVisits] = await Promise.all([
    call<LocationRecord[]>(session, "municipal.green.location", "search_read", [[]], {
      fields: ["name", "code", "location_type", "asset_group", "department_id", "responsible_employee_id", "district", "khoroo", "address", "gps_latitude", "gps_longitude", "area_size", "area_unit", "active"],
      order: "khoroo asc, name asc",
    }),
    call<AssetRecord[]>(session, "municipal.green.asset", "search_read", [[]], {
      fields: ["name", "location_id", "asset_type", "species", "quantity", "unit", "planted_date", "condition", "responsible_employee_id", "active"],
      order: "location_id asc, asset_type asc, name asc",
    }),
    call<ActivityRecord[]>(session, "municipal.green.activity", "search_read", [[]], {
      fields: ["name", "location_id", "activity_type", "planned_date", "done_datetime", "actual_quantity", "unit", "state", "report_note", "assigned_employee_id"],
      order: "planned_date desc, id desc",
      limit: 500,
    }),
    call<Array<{ id: number; name: string }>>(session, "hr.employee", "search_read", [[["active", "=", true]]], {
      fields: ["name"], order: "name asc",
    }).catch(() => []),
    call<VehicleVisitRecord[]>(session, "municipal.green.vehicle.visit", "search_read", [[]], {
      fields:["location_id","vehicle_plate","visit_date","entered_at","exited_at","closest_meters","sample_count"], order:"entered_at desc", limit:100,
    }).catch(() => []),
  ]);

  return {
    locations: locations.map((row): GreenRegistryLocation => ({
      id: row.id, name: row.name, code: String(row.code || ""), locationType: row.location_type || "other", assetGroup: row.asset_group || "grass",
      departmentName: row.department_id ? row.department_id[1] : "", responsibleEmployeeId: row.responsible_employee_id ? row.responsible_employee_id[0] : null,
      responsibleEmployeeName: row.responsible_employee_id ? row.responsible_employee_id[1] : "",
      district: String(row.district || ""), khoroo: String(row.khoroo || ""), address: String(row.address || ""),
      latitude: Number(row.gps_latitude || 0), longitude: Number(row.gps_longitude || 0), areaSize: Number(row.area_size || 0),
      areaUnit: String(row.area_unit || "м²"), active: row.active !== false,
    })),
    assets: assets.filter((row) => row.active !== false).map((row): GreenRegistryAsset => ({
      id: row.id, name: row.name, locationId: row.location_id ? row.location_id[0] : null, locationName: row.location_id ? row.location_id[1] : "",
      assetType: row.asset_type || "other", species: String(row.species || ""), quantity: Number(row.quantity || 0), unit: String(row.unit || "ш"),
      plantedDate: String(row.planted_date || ""), condition: row.condition || "healthy", responsibleEmployeeName: row.responsible_employee_id ? row.responsible_employee_id[1] : "",
    })),
    activities: activities.map((row): GreenRegistryActivity => ({
      id: row.id, name: row.name, locationId: row.location_id ? row.location_id[0] : null,
      locationName: row.location_id ? row.location_id[1] : "", activityType: row.activity_type || "other",
      plannedDate: String(row.planned_date || ""), doneDate: String(row.done_datetime || ""),
      actualQuantity: Number(row.actual_quantity || 0), unit: String(row.unit || ""), state: row.state || "draft",
      reportNote: String(row.report_note || ""), assignedEmployeeName: row.assigned_employee_id ? row.assigned_employee_id[1] : "",
    })),
    employees,
    vehicleVisits: vehicleVisits.map(row=>({ id:row.id, locationId:row.location_id?row.location_id[0]:null, locationName:row.location_id?row.location_id[1]:"", vehiclePlate:row.vehicle_plate, visitDate:row.visit_date, enteredAt:row.entered_at, exitedAt:String(row.exited_at||""), closestMeters:Number(row.closest_meters||0), sampleCount:Number(row.sample_count||0) })),
  };
}

export async function createGreenLocation(session: AppSession, values: Record<string, unknown>) {
  const departments = await call<Array<{ id: number }>>(session, "hr.department", "search_read", [[["name", "ilike", "Ногоон байгууламж"]]], { fields: ["id"], limit: 1 });
  if (!departments[0]?.id) throw new Error("Ногоон байгууламжийн хэлтэс олдсонгүй.");
  return call<number>(session, "municipal.green.location", "create", [{ ...values, department_id: departments[0].id }]);
}

export async function updateGreenLocation(session: AppSession, id: number, values: Record<string, unknown>) {
  return call<boolean>(session, "municipal.green.location", "write", [[id], values]);
}

export async function createGreenAsset(session: AppSession, values: Record<string, unknown>) {
  return call<number>(session, "municipal.green.asset", "create", [values]);
}

export async function createGreenActivity(session: AppSession, values: Record<string, unknown>) {
  return call<number>(session, "municipal.green.activity", "create", [values]);
}
