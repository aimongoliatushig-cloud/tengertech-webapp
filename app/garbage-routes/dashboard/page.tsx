import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, Navigation, Truck } from "lucide-react";

import { AppMenu } from "@/app/_components/app-menu";
import { WorkspaceHeader } from "@/app/_components/workspace-header";
import shellStyles from "@/app/workspace.module.css";
import { loadSessionDepartmentName } from "@/lib/access-scope";
import {
  canAccessAutoBaseOverview,
  getSessionRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  requireSession,
} from "@/lib/auth";
import { fetchGaihamDailyRoutes, type GaihamTrackPoint } from "@/lib/gaiham-fuel-report";
import { executeOdooKw, loadFleetVehicleBoard } from "@/lib/odoo";
import { getAllWastePointsFiltered } from "@/lib/waste-points/service";
import type { WastePoint } from "@/lib/waste-points/types";
import { loadWorkspaceNotificationCount } from "@/lib/workspace-notifications";

import styles from "./route-dashboard.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ date?: string | string[]; department?: string | string[] }> };

type WeightTicketRecord = {
  id: number;
  ticket_number?: string | false;
  report_date?: string | false;
  report_time?: string | false;
  vehicle_license_plate?: string | false;
  branch_name?: string | false;
  garbage_weight_kg?: number | false;
  total_weight_kg?: number | false;
};

function currentDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());
}

function normalizeVehicle(value: string) {
  return value.toLocaleUpperCase("mn-MN").replace(/[^\p{L}\p{N}]/gu, "");
}

function radians(value: number) { return value * Math.PI / 180; }
function distanceMeters(point: GaihamTrackPoint, target: Pick<WastePoint, "latitude" | "longitude">) {
  const earthRadius = 6_371_000;
  const latDelta = radians(target.latitude - point.lat);
  const lngDelta = radians(target.longitude - point.lng);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(point.lat)) * Math.cos(radians(target.latitude)) * Math.sin(lngDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointVisits(points: GaihamTrackPoint[], wastePoints: WastePoint[]) {
  const radius = 5;
  const visits = new Map<string, { point: WastePoint; firstAt: string; lastAt: string; samples: number; closestMeters: number }>();
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
      existing.samples += 1;
      existing.closestMeters = Math.min(existing.closestMeters, nearestDistance);
    } else {
      visits.set(nearest.id, { point: nearest, firstAt: gpsPoint.getTime, lastAt: gpsPoint.getTime, samples: 1, closestMeters: nearestDistance });
    }
  }
  return Array.from(visits.values()).sort((left, right) => left.firstAt.localeCompare(right.firstAt));
}

function timeLabel(value: string) { return value ? value.slice(11, 16) : "-"; }
function durationMinutes(from: string, to: string) {
  const start = new Date(from.replace(" ", "T")).getTime();
  const end = new Date(to.replace(" ", "T")).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 60_000)) : 0;
}

function timestamp(value: string) {
  const parsed = new Date(value.replace(" ", "T")).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function ticketTimestamp(ticket: WeightTicketRecord) {
  if (!ticket.report_date || !ticket.report_time) return 0;
  return timestamp(`${ticket.report_date} ${String(ticket.report_time).slice(0, 8)}`);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function nearestTrackPoint(points: GaihamTrackPoint[], targetTime: number) {
  let nearest: GaihamTrackPoint | null = null;
  let delta = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const pointTime = timestamp(point.getTime);
    const nextDelta = Math.abs(pointTime - targetTime);
    if (pointTime && nextDelta < delta) {
      nearest = point;
      delta = nextDelta;
    }
  }
  return nearest && delta <= 3 * 60 * 60_000 ? nearest : null;
}

function resolveLandfillCenter(
  routes: Awaited<ReturnType<typeof fetchGaihamDailyRoutes>>["routes"],
  tickets: WeightTicketRecord[],
) {
  const configuredLat = Number(process.env.MORIN_LANDFILL_LATITUDE);
  const configuredLng = Number(process.env.MORIN_LANDFILL_LONGITUDE);
  if (Number.isFinite(configuredLat) && Number.isFinite(configuredLng) && configuredLat && configuredLng) {
    return { latitude: configuredLat, longitude: configuredLng, inferred: false };
  }
  const routeByVehicle = new Map<string, (typeof routes)[number]>();
  for (const route of routes) {
    routeByVehicle.set(normalizeVehicle(route.vehicleCode), route);
    routeByVehicle.set(normalizeVehicle(route.vehicleLabel), route);
  }
  const candidates = tickets.flatMap((ticket) => {
    const route = routeByVehicle.get(normalizeVehicle(String(ticket.vehicle_license_plate || "")));
    const ticketTime = ticketTimestamp(ticket);
    const point = route && ticketTime ? nearestTrackPoint(route.points, ticketTime) : null;
    return point ? [point] : [];
  });
  if (!candidates.length) return null;
  return {
    latitude: median(candidates.map((point) => point.lat)),
    longitude: median(candidates.map((point) => point.lng)),
    inferred: true,
  };
}

function matchTicketToGps(
  ticket: WeightTicketRecord,
  points: GaihamTrackPoint[],
  center: { latitude: number; longitude: number } | null,
) {
  const weighedAt = ticketTimestamp(ticket);
  if (!weighedAt || !center || !points.length) return { entryAt: "", exitAt: "", closestMeters: null };
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const pointTime = timestamp(points[index].getTime);
    if (!pointTime || Math.abs(pointTime - weighedAt) > 3 * 60 * 60_000) continue;
    const distance = distanceMeters(points[index], center);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  if (nearestIndex < 0 || nearestDistance > 5) {
    return { entryAt: "", exitAt: "", closestMeters: Number.isFinite(nearestDistance) ? nearestDistance : null };
  }
  let start = nearestIndex;
  let end = nearestIndex;
  while (start > 0 && distanceMeters(points[start - 1], center) <= 5) start -= 1;
  while (end + 1 < points.length && distanceMeters(points[end + 1], center) <= 5) end += 1;
  return { entryAt: points[start].getTime, exitAt: points[end].getTime, closestMeters: nearestDistance };
}

export default async function GarbageRouteDashboardPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const departmentName = await loadSessionDepartmentName(session);
  if (!canAccessAutoBaseOverview(session, departmentName)) redirect("/");
  const notificationCount = await loadWorkspaceNotificationCount(session);
  const roleLabel = getSessionRoleLabel(session);
  const params = await searchParams;
  const rawDate = params?.date;
  const rawDepartment = params?.department;
  const requestedDepartment = typeof rawDepartment === "string" ? rawDepartment : "";
  const requestedDate = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : currentDateKey();
  const [routeResult, wastePoints, fleetBoard, weightTickets] = await Promise.all([
    fetchGaihamDailyRoutes(requestedDate),
    getAllWastePointsFiltered(),
    loadFleetVehicleBoard().catch(() => null),
    executeOdooKw<WeightTicketRecord[]>(
      "municipal.garbage.weight.ticket",
      "search_read",
      [[["report_date", "=", requestedDate]]],
      {
        fields: ["id", "ticket_number", "report_date", "report_time", "vehicle_license_plate", "branch_name", "garbage_weight_kg", "total_weight_kg"],
        order: "report_time asc, id asc",
        limit: 5000,
      },
    ).catch(() => []),
  ]);
  const landfillCenter = resolveLandfillCenter(routeResult.routes, weightTickets);
  const weightByVehicle = new Map<string, number>();
  for (const row of fleetBoard?.weightReportRows ?? []) {
    if (row.reportDateValue !== requestedDate) continue;
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
  const departmentOptions = Array.from(new Set((fleetBoard?.allVehicles ?? []).map((vehicle) => vehicle.departmentName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "mn"));
  const vehicles = routeResult.routes.map((route) => {
    const fleetVehicle = fleetByVehicle.get(normalizeVehicle(route.vehicleCode)) ?? fleetByVehicle.get(normalizeVehicle(route.vehicleLabel));
    const tickets = weightTickets
      .filter((ticket) => normalizeVehicle(String(ticket.vehicle_license_plate || "")) === normalizeVehicle(route.vehicleCode) || normalizeVehicle(String(ticket.vehicle_license_plate || "")) === normalizeVehicle(route.vehicleLabel))
      .map((ticket) => ({ ...ticket, gps: matchTicketToGps(ticket, route.points, landfillCenter) }));
    return {
      ...route,
      imageUrl: fleetVehicle?.imageUrl ?? "",
      vehicleTypeName: fleetVehicle?.vehicleTypeName || fleetVehicle?.categoryName || "Төрөл бүртгээгүй",
      departmentName: fleetVehicle?.departmentName ?? "Хэлтэс бүртгээгүй",
      visits: pointVisits(route.points, wastePoints),
      weightTons: weightByVehicle.get(normalizeVehicle(route.vehicleCode)) ?? 0,
      tickets,
    };
  }).filter((vehicle) => !requestedDepartment || vehicle.departmentName === requestedDepartment)
    .sort((left, right) => right.visits.length - left.visits.length || right.distanceKm - left.distanceKm);
  const totalVisits = vehicles.reduce((sum, vehicle) => sum + vehicle.visits.length, 0);
  const totalDistance = vehicles.reduce((sum, vehicle) => sum + vehicle.distanceKm, 0);
  const totalWeight = vehicles.reduce((sum, vehicle) => sum + vehicle.weightTons, 0);

  const content = <main className={styles.page}>
    <header className={styles.header}>
      <div><h2>Маршрут ба хогийн цэгийн бүртгэл</h2><p>Gaiham GPS-ийн хөдөлгөөнийг бүртгэлтэй хогийн цэгийн координаттай автоматаар тулгав.</p></div>
      <div className={styles.headerActions}><form method="get"><label htmlFor="route-department">Хэлтэс</label><select id="route-department" name="department" defaultValue={requestedDepartment}><option value="">Бүх хэлтэс</option>{departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}</select><label htmlFor="route-date">Огноо</label><input id="route-date" name="date" type="date" defaultValue={requestedDate}/><button type="submit">Харах</button></form><div className={styles.exports}><a href={`/api/garbage-routes/export?date=${requestedDate}&department=${encodeURIComponent(requestedDepartment)}&format=xlsx`}>Excel</a><a href={`/api/garbage-routes/export?date=${requestedDate}&department=${encodeURIComponent(requestedDepartment)}&format=pdf`}>PDF</a></div></div>
    </header>
    <section className={styles.metrics}>
      <article><Truck/><span>Хөдөлгөөнтэй машин</span><strong>{vehicles.length}</strong><small>{requestedDepartment || `Нийт ${routeResult.trackerCount} GPS`}</small></article>
      <article><MapPin/><span>Хогийн цэгийн очилт</span><strong>{totalVisits}</strong><small>{wastePoints.length} цэгтэй тулгасан</small></article>
      <article><Navigation/><span>Нийт туулсан зам</span><strong>{totalDistance.toFixed(1)} км</strong><small>Gaiham GPS</small></article>
      <article><Truck/><span>Ачсан жин</span><strong>{totalWeight.toFixed(2)} тн</strong><small>Жингийн тайлантай холбосон</small></article>
    </section>
    <section className={styles.list}>
      <div className={styles.sectionTitle}><h2>Машинуудын маршрут</h2><span>{requestedDate}</span></div>
      {vehicles.length ? vehicles.map((vehicle) => <details key={vehicle.trackerId} className={styles.vehicleCard}>
        <summary className={styles.vehicleSummary}>
          <div>{vehicle.imageUrl ? <img className={styles.vehiclePhoto} src={vehicle.imageUrl} alt={vehicle.vehicleCode}/> : <span className={styles.vehicleIcon}><Truck/></span>}<div><h3>{vehicle.vehicleCode}</h3><small>{vehicle.vehicleLabel} · {vehicle.vehicleTypeName} · {vehicle.departmentName}</small></div></div>
          <dl><div><dt>Туулсан</dt><dd>{vehicle.distanceKm.toFixed(1)} км</dd></div><div><dt>Хөдөлгөөн</dt><dd>{timeLabel(vehicle.startedAt)}–{timeLabel(vehicle.endedAt)}</dd></div><div><dt>Очсон цэг</dt><dd>{vehicle.visits.length}</dd></div><div><dt>Ачсан жин</dt><dd>{vehicle.weightTons.toFixed(2)} тн</dd></div></dl>
          <span className={styles.expandHint}>Дэлгэрэнгүй</span>
        </summary>
        {vehicle.tickets.length ? <div className={styles.weightTrips}><h4>Морингийн хогийн цэгийн жингийн бүртгэл</h4>{vehicle.tickets.map((ticket) => <div className={styles.weightTrip} key={ticket.id}><div><strong>Тасалбар {ticket.ticket_number || ticket.id}</strong><small>Жинлэсэн: {String(ticket.report_time || "-").slice(0, 8)}</small></div><div><span>Орсон</span><b>{ticket.gps.entryAt ? timeLabel(ticket.gps.entryAt) : "GPS таараагүй"}</b></div><div><span>Гарсан</span><b>{ticket.gps.exitAt ? timeLabel(ticket.gps.exitAt) : "GPS таараагүй"}</b></div><div><span>Цэвэр жин</span><b>{((Number(ticket.garbage_weight_kg) || 0) / 1000).toFixed(2)} тн</b></div></div>)}</div> : null}
        {vehicle.visits.length ? <ol className={styles.visits}>{vehicle.visits.map((visit) => <li key={visit.point.id}>
          <Link className={styles.visitMapLink} href={`/waste-points/map?point=${encodeURIComponent(visit.point.id)}`} title="Газрын зураг дээр харах"><span className={styles.visitNumber}>{visit.point.code}</span><div><strong>{visit.point.name}</strong><small>{visit.point.khorooName} · {Math.round(visit.closestMeters)} м дотор · Газрын зураг нээх</small></div></Link><div className={styles.visitTime}><strong>{timeLabel(visit.firstAt)}–{timeLabel(visit.lastAt)}</strong><small>{durationMinutes(visit.firstAt, visit.lastAt)} минут · GPS баталгаатай</small></div>
        </li>)}</ol> : <p className={styles.emptyVisits}>Бүртгэлтэй хогийн цэгийн 5 метрийн радиуст очсон GPS цэг илрээгүй.</p>}
      </details>) : <div className={styles.empty}>Энэ өдөр Gaiham GPS хөдөлгөөний мэдээлэл бүртгэгдээгүй байна.</div>}
    </section>
  </main>;

  return (
    <main className={shellStyles.shell}>
      <div className={shellStyles.container}>
        <div className={shellStyles.contentWithMenu}>
          <aside className={shellStyles.menuColumn}>
            <AppMenu
              active="gps-routes"
              canCreateProject={hasCapability(session, "create_projects")}
              canCreateTasks={hasCapability(session, "create_tasks")}
              canWriteReports={hasCapability(session, "write_workspace_reports")}
              canViewQualityCenter={hasCapability(session, "view_quality_center")}
              canUseFieldConsole={hasCapability(session, "use_field_console")}
              userName={session.name}
              userRole={session.role}
              roleLabel={roleLabel}
              groupFlags={session.groupFlags}
              notificationCount={notificationCount}
              masterMode={isMasterRole(session.role)}
              workerMode={isWorkerOnly(session)}
              departmentScopeName={departmentName}
            />
          </aside>
          <div className={shellStyles.pageContent}>
            <WorkspaceHeader
              title="GPS маршрут"
              subtitle="Автомашины маршрут, хогийн цэгийн очилт, туулсан замын хяналт"
              userName={session.name}
              roleLabel={roleLabel}
              notificationCount={notificationCount}
            />
            {content}
          </div>
        </div>
      </div>
    </main>
  );
}
