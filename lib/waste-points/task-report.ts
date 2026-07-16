import "server-only";

import { executeOdooKw } from "@/lib/odoo";

// "Ажил үүсгэх"-ээр ERP-д үүссэн хогийн цэгийн ажлуудыг тайланд ашиглана.
// Машин/жолооч нь тухайн ажилд оноогдсон үед бөглөгдөнө.

const WASTE_TASK_PROJECT = "Хогийн цэгийн ажил (2026)";

type OdooRelation = [number, string] | false;

type RawTask = {
  id: number;
  name: string;
  date_deadline: string | false;
  create_date: string | false;
  stage_id: OdooRelation;
  mfo_vehicle_id: OdooRelation;
  mfo_driver_employee_id: OdooRelation;
};

export type WasteTaskRow = {
  id: number;
  name: string;
  createdAt: string;
  deadline: string;
  stage: string;
  vehicle: string;
  driver: string;
};

const relName = (rel: OdooRelation) => (Array.isArray(rel) ? rel[1] : "");

export async function loadWasteTaskRows(params: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<WasteTaskRow[]> {
  try {
    const projects = await executeOdooKw<{ id: number }[]>(
      "project.project",
      "search_read",
      [[["name", "=", WASTE_TASK_PROJECT]]],
      { fields: ["id"], limit: 1 },
    );
    const projectId = projects[0]?.id;
    if (!projectId) return [];

    const domain: unknown[] = [["project_id", "=", projectId]];
    if (params.dateFrom) domain.push(["create_date", ">=", `${params.dateFrom} 00:00:00`]);
    if (params.dateTo) domain.push(["create_date", "<=", `${params.dateTo} 23:59:59`]);

    const tasks = await executeOdooKw<RawTask[]>(
      "project.task",
      "search_read",
      [domain],
      {
        fields: [
          "name",
          "date_deadline",
          "create_date",
          "stage_id",
          "mfo_vehicle_id",
          "mfo_driver_employee_id",
        ],
        order: "create_date desc",
        limit: 500,
      },
    );

    return tasks.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: typeof t.create_date === "string" ? t.create_date.slice(0, 10) : "",
      deadline: typeof t.date_deadline === "string" ? t.date_deadline.slice(0, 10) : "",
      stage: relName(t.stage_id),
      vehicle: relName(t.mfo_vehicle_id),
      driver: relName(t.mfo_driver_employee_id),
    }));
  } catch (error) {
    console.warn("Waste point task report could not be loaded:", error);
    return [];
  }
}

export type WasteTaskGroup = { label: string; count: number };

export function groupTaskRows(rows: WasteTaskRow[], key: "vehicle" | "driver"): WasteTaskGroup[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const label = row[key] || "Оноогоогүй";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
