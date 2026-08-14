import { chromium } from "playwright";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canAccessAutoBaseOverview, getSession } from "@/lib/auth";
import { fetchGaihamDailyRoutes, type GaihamTrackPoint } from "@/lib/gaiham-fuel-report";
import { loadFleetVehicleBoard } from "@/lib/odoo";
import { buildReportWorkbook } from "@/lib/report-xlsx";
import { getAllWastePointsFiltered } from "@/lib/waste-points/service";
import type { WastePoint } from "@/lib/waste-points/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function currentDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());
}

function normalizeVehicle(value: string) {
  return value.toLocaleUpperCase("mn-MN").replace(/[^\p{L}\p{N}]/gu, "");
}

function radians(value: number) { return value * Math.PI / 180; }

function distanceMeters(point: GaihamTrackPoint, target: WastePoint) {
  const earthRadius = 6_371_000;
  const latDelta = radians(target.latitude - point.lat);
  const lngDelta = radians(target.longitude - point.lng);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(point.lat)) * Math.cos(radians(target.latitude)) * Math.sin(lngDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointVisits(points: GaihamTrackPoint[], wastePoints: WastePoint[]) {
  const radius = 20;
  const visits = new Map<string, { point: WastePoint; firstAt: string; lastAt: string; closestMeters: number }>();
  for (const gpsPoint of points) {
    let nearest: WastePoint | null = null;
    let nearestDistance = radius + 1;
    for (const wastePoint of wastePoints) {
      const distance = distanceMeters(gpsPoint, wastePoint);
      if (distance < nearestDistance) { nearest = wastePoint; nearestDistance = distance; }
    }
    if (!nearest || nearestDistance > radius) continue;
    const existing = visits.get(nearest.id);
    if (existing) {
      existing.lastAt = gpsPoint.getTime || existing.lastAt;
      existing.closestMeters = Math.min(existing.closestMeters, nearestDistance);
    } else {
      visits.set(nearest.id, { point: nearest, firstAt: gpsPoint.getTime, lastAt: gpsPoint.getTime, closestMeters: nearestDistance });
    }
  }
  return Array.from(visits.values()).sort((a, b) => a.firstAt.localeCompare(b.firstAt));
}

function timeLabel(value: string) { return value ? value.slice(11, 16) : "-"; }

function durationMinutes(from: string, to: string) {
  const start = new Date(from.replace(" ", "T")).getTime();
  const end = new Date(to.replace(" ", "T")).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 60_000)) : 0;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  const departmentName = await loadSessionDepartmentName(session);
  if (!canAccessAutoBaseOverview(session, departmentName)) return Response.json({ error: "Эрх хүрэлцэхгүй байна." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const rawDate = params.get("date") ?? "";
  const date = DATE_RE.test(rawDate) ? rawDate : currentDateKey();
  const format = params.get("format") === "pdf" ? "pdf" : "xlsx";
  const requestedDepartment = params.get("department")?.trim() ?? "";

  try {
    const [routeResult, wastePoints, fleetBoard] = await Promise.all([
      fetchGaihamDailyRoutes(date),
      getAllWastePointsFiltered(),
      loadFleetVehicleBoard().catch(() => null),
    ]);
    const weightByVehicle = new Map<string, number>();
    for (const row of fleetBoard?.weightReportRows ?? []) {
      if (row.reportDateValue !== date) continue;
      const key = normalizeVehicle(row.vehiclePlate || row.vehicleName);
      weightByVehicle.set(key, (weightByVehicle.get(key) ?? 0) + row.weightTons);
    }
    const fleetByVehicle = new Map<string, NonNullable<typeof fleetBoard>["allVehicles"][number]>();
    for (const vehicle of fleetBoard?.allVehicles ?? []) {
      for (const value of [vehicle.plate, vehicle.name]) {
        const key = normalizeVehicle(value);
        if (key) fleetByVehicle.set(key, vehicle);
      }
    }
    const vehicles = routeResult.routes.map((route) => {
      const fleetVehicle = fleetByVehicle.get(normalizeVehicle(route.vehicleCode)) ?? fleetByVehicle.get(normalizeVehicle(route.vehicleLabel));
      return {
        ...route,
        departmentName: fleetVehicle?.departmentName ?? "Хэлтэс бүртгээгүй",
        visits: pointVisits(route.points, wastePoints),
        weightTons: weightByVehicle.get(normalizeVehicle(route.vehicleCode)) ?? 0,
      };
    }).filter((vehicle) => !requestedDepartment || vehicle.departmentName === requestedDepartment)
      .sort((a, b) => b.visits.length - a.visits.length || b.distanceKm - a.distanceKm);
    const totalVisits = vehicles.reduce((sum, item) => sum + item.visits.length, 0);
    const totalDistance = vehicles.reduce((sum, item) => sum + item.distanceKm, 0);
    const totalWeight = vehicles.reduce((sum, item) => sum + item.weightTons, 0);
    const rows: (string | number)[][] = [];
    vehicles.forEach((vehicle, vehicleIndex) => {
      if (!vehicle.visits.length) {
        rows.push([vehicleIndex + 1, vehicle.vehicleCode, vehicle.vehicleLabel, vehicle.departmentName, `${timeLabel(vehicle.startedAt)}–${timeLabel(vehicle.endedAt)}`, Number(vehicle.distanceKm.toFixed(1)), 0, "", "", "", "", "", Number(vehicle.weightTons.toFixed(2))]);
        return;
      }
      vehicle.visits.forEach((visit, visitIndex) => rows.push([
        visitIndex === 0 ? vehicleIndex + 1 : "", visitIndex === 0 ? vehicle.vehicleCode : "", visitIndex === 0 ? vehicle.vehicleLabel : "",
        visitIndex === 0 ? vehicle.departmentName : "", visitIndex === 0 ? `${timeLabel(vehicle.startedAt)}–${timeLabel(vehicle.endedAt)}` : "", visitIndex === 0 ? Number(vehicle.distanceKm.toFixed(1)) : "",
        visitIndex + 1, visit.point.code, visit.point.name, visit.point.khorooName,
        `${timeLabel(visit.firstAt)}–${timeLabel(visit.lastAt)}`, `${durationMinutes(visit.firstAt, visit.lastAt)} мин · ${Math.round(visit.closestMeters)} м`,
        visitIndex === 0 ? Number(vehicle.weightTons.toFixed(2)) : "",
      ]));
    });

    if (format === "xlsx") {
      const buffer = await buildReportWorkbook({
        title: "GPS маршрут ба хогийн цэгийн тайлан",
        meta: [
          { label: "Огноо", value: date }, { label: "Хэлтэс", value: requestedDepartment || "Бүх хэлтэс" }, { label: "Нийт GPS", value: String(routeResult.trackerCount) },
          { label: "Хөдөлгөөнтэй машин", value: String(vehicles.length) }, { label: "Хогийн цэгийн очилт", value: String(totalVisits) },
          { label: "Нийт туулсан зам", value: `${totalDistance.toFixed(1)} км` }, { label: "Нийт ачсан жин", value: `${totalWeight.toFixed(2)} тн` },
        ],
        sections: [{ caption: "Машины маршрут", headers: ["№", "Улсын дугаар", "GPS нэр", "Хэлтэс", "Хөдөлгөөн", "Км", "Цэгийн дараалал", "Код", "Хогийн цэг", "Хороо", "Очсон цаг", "Саатал / зай", "Жин (тн)"], rows, columnWidths: [5, 14, 22, 28, 14, 9, 12, 12, 28, 14, 14, 18, 10] }],
        sheetName: "GPS маршрут",
      });
      return new Response(new Uint8Array(buffer), { headers: { "Content-Disposition": `attachment; filename="gps-marshrut-${date}.xlsx"`, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    }

    const tableRows = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:12pt;color:#111}h1{text-align:center;font-size:16pt;margin:0 0 6px}.meta{text-align:center;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:9pt}th,td{border:1px solid #777;padding:4px;vertical-align:top}th{background:#e8f3ea;font-weight:700}</style></head><body><h1>GPS маршрут ба хогийн цэгийн тайлан</h1><p class="meta">Огноо: ${date} · Хэлтэс: ${escapeHtml(requestedDepartment || "Бүх хэлтэс")} · Машин: ${vehicles.length} · Очилт: ${totalVisits} · Зам: ${totalDistance.toFixed(1)} км · Жин: ${totalWeight.toFixed(2)} тн</p><table><thead><tr>${["№","Улсын дугаар","GPS нэр","Хэлтэс","Хөдөлгөөн","Км","Д/д","Код","Хогийн цэг","Хороо","Очсон цаг","Саатал / зай","Жин (тн)"].map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      const buffer = await page.pdf({ format: "A4", landscape: true, printBackground: true, margin: { top: "10mm", right: "8mm", bottom: "10mm", left: "8mm" } });
      return new Response(new Uint8Array(buffer), { headers: { "Content-Disposition": `attachment; filename="gps-marshrut-${date}.pdf"`, "Content-Type": "application/pdf" } });
    } finally { await browser.close(); }
  } catch (error) {
    console.error("Garbage route export failed", error);
    return Response.json({ error: "Маршрутын тайлан үүсгэж чадсангүй." }, { status: 502 });
  }
}
