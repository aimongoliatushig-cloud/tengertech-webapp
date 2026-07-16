import "server-only";

import { getMockWastePoints } from "./mock-data";
import {
  WASTE_STATUS_LABELS,
  WASTE_TYPE_LABELS,
  fillLevelBucket,
  type WastePoint,
  type WastePointStatus,
  type WastePointType,
} from "./types";

// --- Repository давхарга ---------------------------------------------------
// Одоогоор mock эх сурвалж. Бодит API-д шилжихэд зөвхөн энэ давхаргыг солино:
//   const res = await fetch(`${process.env.WASTE_POINTS_API_URL}/api/waste-points?companyId=${companyId}&limit=5000`, {...});
//   return (await res.json()) as WastePoint[];
// UI/сервисийн бусад код хэвээр ажиллана.

async function fetchAllWastePoints(): Promise<WastePoint[]> {
  const apiUrl = process.env.WASTE_POINTS_API_URL;
  const companyId = process.env.WASTE_POINTS_COMPANY_ID;
  if (apiUrl && companyId) {
    try {
      const res = await fetch(
        `${apiUrl.replace(/\/$/, "")}/api/waste-points?companyId=${encodeURIComponent(companyId)}&limit=5000`,
        {
          headers: process.env.WASTE_POINTS_API_TOKEN
            ? { Authorization: `Bearer ${process.env.WASTE_POINTS_API_TOKEN}` }
            : undefined,
          cache: "no-store",
        },
      );
      if (res.ok) {
        const data = (await res.json()) as WastePoint[];
        if (Array.isArray(data)) return data;
      }
    } catch (error) {
      console.warn("Waste points API unavailable, falling back to mock:", error);
    }
  }
  return getMockWastePoints();
}

// --- Сервисийн давхарга ----------------------------------------------------

export type WastePointQuery = {
  search?: string;
  type?: WastePointType | "all";
  khoroo?: string; // "all" | "5-р хороо"
  status?: WastePointStatus | "all";
  /** updatedAt-аар шүүх (YYYY-MM-DD) */
  dateFrom?: string;
  dateTo?: string;
  sort?: WastePointSort;
  page?: number;
  pageSize?: number;
};

export type WastePointSort =
  | "code"
  | "name"
  | "khoroo"
  | "fill_desc"
  | "fill_asc"
  | "updated";

export type WastePointListResult = {
  items: WastePoint[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const norm = (v: string) => v.toLocaleLowerCase("mn-MN").trim();

function khorooNumber(name: string): number {
  const match = name.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function applyFilters(all: WastePoint[], q: WastePointQuery): WastePoint[] {
  const search = norm(q.search ?? "");
  return all.filter((p) => {
    if (q.type && q.type !== "all" && p.type !== q.type) return false;
    if (q.status && q.status !== "all" && p.currentStatus !== q.status) return false;
    if (q.khoroo && q.khoroo !== "all" && p.khorooName !== q.khoroo) return false;
    const updatedDay = p.updatedAt.slice(0, 10);
    if (q.dateFrom && updatedDay < q.dateFrom) return false;
    if (q.dateTo && updatedDay > q.dateTo) return false;
    if (search) {
      const hay = `${p.code} ${p.name} ${p.address} ${p.khorooName}`.toLocaleLowerCase("mn-MN");
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function applySort(items: WastePoint[], sort: WastePointSort = "code"): WastePoint[] {
  const sorted = [...items];
  switch (sort) {
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name, "mn"));
      break;
    case "khoroo":
      sorted.sort((a, b) => khorooNumber(a.khorooName) - khorooNumber(b.khorooName) || a.code.localeCompare(b.code));
      break;
    case "fill_desc":
      sorted.sort((a, b) => b.currentFillLevel - a.currentFillLevel);
      break;
    case "fill_asc":
      sorted.sort((a, b) => a.currentFillLevel - b.currentFillLevel);
      break;
    case "updated":
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
    case "code":
    default:
      sorted.sort((a, b) => a.code.localeCompare(b.code));
      break;
  }
  return sorted;
}

export async function listWastePoints(q: WastePointQuery = {}): Promise<WastePointListResult> {
  const all = await fetchAllWastePoints();
  const filtered = applySort(applyFilters(all, q), q.sort);
  const pageSize = Math.min(Math.max(q.pageSize ?? 20, 5), 200);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(q.page ?? 1, 1), pageCount);
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    pageCount,
  };
}

export async function getAllWastePointsFiltered(q: WastePointQuery = {}): Promise<WastePoint[]> {
  const all = await fetchAllWastePoints();
  return applySort(applyFilters(all, q), q.sort);
}

export async function getWastePointById(id: number): Promise<WastePoint | null> {
  const all = await fetchAllWastePoints();
  return all.find((p) => p.id === id) ?? null;
}

export function getKhorooOptions(all: WastePoint[]): string[] {
  return Array.from(new Set(all.map((p) => p.khorooName))).sort(
    (a, b) => khorooNumber(a) - khorooNumber(b),
  );
}

// --- Тайлангийн агрегац ----------------------------------------------------

export type WasteReportGroup = {
  key: string;
  label: string;
  count: number;
  avgFill: number;
  fullCount: number;
  capacity: number;
};

export type WasteReport = {
  points: WastePoint[];
  total: number;
  avgFill: number;
  fullCount: number;
  totalCapacity: number;
  byKhoroo: WasteReportGroup[];
  byType: WasteReportGroup[];
  byStatus: WasteReportGroup[];
};

function groupBy(
  points: WastePoint[],
  keyOf: (p: WastePoint) => string,
  labelOf: (key: string) => string,
  sortKeys?: (a: WasteReportGroup, b: WasteReportGroup) => number,
): WasteReportGroup[] {
  const map = new Map<string, WastePoint[]>();
  for (const p of points) {
    const key = keyOf(p);
    const bucket = map.get(key);
    if (bucket) bucket.push(p);
    else map.set(key, [p]);
  }
  const groups = [...map.entries()].map(([key, list]) => ({
    key,
    label: labelOf(key),
    count: list.length,
    avgFill: list.length
      ? Math.round(list.reduce((sum, p) => sum + p.currentFillLevel, 0) / list.length)
      : 0,
    fullCount: list.filter((p) => p.currentStatus === "full").length,
    capacity: list.reduce((sum, p) => sum + p.capacity, 0),
  }));
  return sortKeys ? groups.sort(sortKeys) : groups.sort((a, b) => b.count - a.count);
}

export async function buildWasteReport(q: WastePointQuery = {}): Promise<WasteReport> {
  const points = await getAllWastePointsFiltered(q);
  const total = points.length;
  return {
    points,
    total,
    avgFill: total
      ? Math.round(points.reduce((sum, p) => sum + p.currentFillLevel, 0) / total)
      : 0,
    fullCount: points.filter((p) => p.currentStatus === "full").length,
    totalCapacity: points.reduce((sum, p) => sum + p.capacity, 0),
    byKhoroo: groupBy(
      points,
      (p) => p.khorooName,
      (k) => k,
      (a, b) => khorooNumber(a.key) - khorooNumber(b.key),
    ),
    byType: groupBy(points, (p) => p.type, (k) => WASTE_TYPE_LABELS[k as WastePointType] ?? k),
    byStatus: groupBy(
      points,
      (p) => p.currentStatus,
      (k) => WASTE_STATUS_LABELS[k as WastePointStatus] ?? k,
    ),
  };
}

export type WastePointStats = {
  total: number;
  byType: { type: WastePointType; count: number }[];
  byKhoroo: { khoroo: string; count: number }[];
  byStatus: { status: WastePointStatus; count: number }[];
  fill: { low: number; mid: number; high: number };
  fullCount: number;
  avgFill: number;
  recentlyUpdated: WastePoint[];
};

export async function getWastePointStats(): Promise<WastePointStats> {
  const all = await fetchAllWastePoints();
  const typeMap = new Map<WastePointType, number>();
  const khorooMap = new Map<string, number>();
  const statusMap = new Map<WastePointStatus, number>();
  const fill = { low: 0, mid: 0, high: 0 };
  let fillSum = 0;
  for (const p of all) {
    typeMap.set(p.type, (typeMap.get(p.type) ?? 0) + 1);
    khorooMap.set(p.khorooName, (khorooMap.get(p.khorooName) ?? 0) + 1);
    statusMap.set(p.currentStatus, (statusMap.get(p.currentStatus) ?? 0) + 1);
    fill[fillLevelBucket(p.currentFillLevel)] += 1;
    fillSum += p.currentFillLevel;
  }
  return {
    total: all.length,
    byType: [...typeMap.entries()].map(([type, count]) => ({ type, count })),
    byKhoroo: [...khorooMap.entries()]
      .map(([khoroo, count]) => ({ khoroo, count }))
      .sort((a, b) => khorooNumber(a.khoroo) - khorooNumber(b.khoroo)),
    byStatus: [...statusMap.entries()].map(([status, count]) => ({ status, count })),
    fill,
    fullCount: all.filter((p) => p.currentStatus === "full").length,
    avgFill: all.length ? Math.round(fillSum / all.length) : 0,
    recentlyUpdated: [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
  };
}
