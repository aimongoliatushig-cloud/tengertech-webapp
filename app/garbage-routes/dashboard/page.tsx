import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MapPin, Navigation, Truck } from "lucide-react";

import { loadSessionDepartmentName } from "@/lib/access-scope";
import { canAccessAutoBaseOverview, requireSession } from "@/lib/auth";
import { fetchGaihamDailyRoutes, type GaihamTrackPoint } from "@/lib/gaiham-fuel-report";
import { loadFleetVehicleBoard } from "@/lib/odoo";
import { getAllWastePointsFiltered } from "@/lib/waste-points/service";
import type { WastePoint } from "@/lib/waste-points/types";

import styles from "./route-dashboard.module.css";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: Promise<{ date?: string | string[]; department?: string | string[] }> };

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

export default async function GarbageRouteDashboardPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const departmentName = await loadSessionDepartmentName(session);
  if (!canAccessAutoBaseOverview(session, departmentName)) redirect("/");
  const params = await searchParams;
  const rawDate = params?.date;
  const rawDepartment = params?.department;
  const requestedDepartment = typeof rawDepartment === "string" ? rawDepartment : "";
  const requestedDate = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : currentDateKey();
  const [routeResult, wastePoints, fleetBoard] = await Promise.all([
    fetchGaihamDailyRoutes(requestedDate),
    getAllWastePointsFiltered(),
    loadFleetVehicleBoard().catch(() => null),
  ]);
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
    return {
      ...route,
      imageUrl: fleetVehicle?.imageUrl ?? "",
      vehicleTypeName: fleetVehicle?.vehicleTypeName || fleetVehicle?.categoryName || "Төрөл бүртгээгүй",
      departmentName: fleetVehicle?.departmentName ?? "Хэлтэс бүртгээгүй",
      visits: pointVisits(route.points, wastePoints),
      weightTons: weightByVehicle.get(normalizeVehicle(route.vehicleCode)) ?? 0,
    };
  }).filter((vehicle) => !requestedDepartment || vehicle.departmentName === requestedDepartment)
    .sort((left, right) => right.visits.length - left.visits.length || right.distanceKm - left.distanceKm);
  const totalVisits = vehicles.reduce((sum, vehicle) => sum + vehicle.visits.length, 0);
  const totalDistance = vehicles.reduce((sum, vehicle) => sum + vehicle.distanceKm, 0);
  const totalWeight = vehicles.reduce((sum, vehicle) => sum + vehicle.weightTons, 0);

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><Link href="/auto-base"><ArrowLeft /> Авто бааз</Link><h1>GPS маршрут ба хогийн цэгийн бүртгэл</h1><p>Gaiham GPS-ийн хөдөлгөөнийг бүртгэлтэй хогийн цэгийн координаттай автоматаар тулгав.</p></div>
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
        {vehicle.visits.length ? <ol className={styles.visits}>{vehicle.visits.map((visit) => <li key={visit.point.id}>
          <Link className={styles.visitMapLink} href={`/waste-points/map?point=${encodeURIComponent(visit.point.id)}`} title="Газрын зураг дээр харах"><span className={styles.visitNumber}>{visit.point.code}</span><div><strong>{visit.point.name}</strong><small>{visit.point.khorooName} · {Math.round(visit.closestMeters)} м дотор · Газрын зураг нээх</small></div></Link><div className={styles.visitTime}><strong>{timeLabel(visit.firstAt)}–{timeLabel(visit.lastAt)}</strong><small>{durationMinutes(visit.firstAt, visit.lastAt)} минут · GPS баталгаатай</small></div>
        </li>)}</ol> : <p className={styles.emptyVisits}>Бүртгэлтэй хогийн цэгийн 5 метрийн радиуст очсон GPS цэг илрээгүй.</p>}
      </details>) : <div className={styles.empty}>Энэ өдөр Gaiham GPS хөдөлгөөний мэдээлэл бүртгэгдээгүй байна.</div>}
    </section>
  </main>;
}
