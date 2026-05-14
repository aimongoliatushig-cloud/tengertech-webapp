import { getSession } from "@/lib/auth";
import { loadSessionEmployeeDepartmentName } from "@/lib/access-scope";
import { filterByDepartment } from "@/lib/dashboard-scope";
import { normalizeOrganizationUnitName } from "@/lib/department-groups";
import { canAccessFleetRepair } from "@/lib/fleet-repair";
import { executeOdooKw } from "@/lib/odoo";
import type { RoleGroupFlags } from "@/lib/roles";
import { fetchWrsWeightRows, type WrsWeightReportRow } from "@/lib/wrs-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Ulaanbaatar";

function currentDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfMonthDateKey(dateKey: string) {
  return `${dateKey.slice(0, 8)}01`;
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function resolveRange(request: Request) {
  const params = new URL(request.url).searchParams;
  const today = currentDateKey();
  const period = params.get("period")?.trim() || "";
  let startDate = params.get("startDate")?.trim() || "";
  let endDate = params.get("endDate")?.trim() || "";

  if (!startDate && !endDate) {
    if (period === "week") {
      startDate = shiftDateKey(today, -6);
      endDate = today;
    } else if (period === "month") {
      startDate = startOfMonthDateKey(today);
      endDate = today;
    } else {
      startDate = today;
      endDate = today;
    }
  }

  if (startDate && !endDate) {
    endDate = startDate;
  }
  if (!startDate && endDate) {
    startDate = endDate;
  }

  return { startDate, endDate };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatTon(value: number) {
  return new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: 1,
  }).format(Math.round((value / 1000) * 10) / 10);
}

function formatGeneratedAt(value = new Date()) {
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(value)
    .replace(/\//g, ".");
}

function periodLabel(startDate: string, endDate: string) {
  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
}

type FleetVehicleDepartmentRecord = {
  id: number;
  name?: string | false;
  license_plate?: string | false;
  municipal_department_id?: [number, string] | false;
};

type AppSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

function normalizeVehicleCode(value?: string | null) {
  return String(value ?? "").toLocaleUpperCase("mn-MN").replace(/\s+/g, "");
}

function canViewAllGarbageWeightReports(session: AppSession) {
  const flags: Partial<RoleGroupFlags> = session.groupFlags || {};
  return Boolean(
    session.role === "system_admin" ||
      session.role === "director" ||
      session.role === "general_manager" ||
      flags.municipalDirector ||
      flags.municipalManager ||
      flags.mfoManager ||
      flags.mfoDispatcher ||
      flags.fleetRepairManager ||
      flags.fleetRepairGeneralManager ||
      flags.fleetRepairCeo
  );
}

function relationName(value?: [number, string] | false) {
  return Array.isArray(value) ? value[1] : "";
}

async function loadVehicleDepartmentByCode(rows: WrsWeightReportRow[]) {
  const requestedCodes = new Set(rows.map((row) => normalizeVehicleCode(row.vehicleCode)).filter(Boolean));
  const departmentByCode = new Map<string, string>();
  if (!requestedCodes.size) {
    return departmentByCode;
  }

  const vehicles = await executeOdooKw<FleetVehicleDepartmentRecord[]>(
    "fleet.vehicle",
    "search_read",
    [[["id", "!=", 0]]],
    {
      fields: ["name", "license_plate", "municipal_department_id"],
      limit: 5000,
    },
  );

  for (const vehicle of vehicles) {
    const rawDepartmentName = relationName(vehicle.municipal_department_id);
    const departmentName = normalizeOrganizationUnitName(rawDepartmentName) || rawDepartmentName.trim();
    if (!departmentName) {
      continue;
    }

    for (const code of [vehicle.license_plate, vehicle.name]) {
      const normalizedCode = normalizeVehicleCode(code || "");
      if (requestedCodes.has(normalizedCode)) {
        departmentByCode.set(normalizedCode, departmentName);
      }
    }
  }

  return departmentByCode;
}

async function scopeReportRows(rows: WrsWeightReportRow[], scopedDepartmentName: string | null) {
  if (!scopedDepartmentName) {
    return rows;
  }

  const departmentByCode = await loadVehicleDepartmentByCode(rows);
  return rows.filter((row) => {
    const departmentName = departmentByCode.get(normalizeVehicleCode(row.vehicleCode));
    return Boolean(departmentName && filterByDepartment([{ departmentName }], scopedDepartmentName).length);
  });
}

function recalculateReportTotals<T extends { rows: WrsWeightReportRow[] }>(report: T, rows: WrsWeightReportRow[]) {
  const vehicleCodes = new Set(rows.map((row) => row.vehicleCode));
  return {
    ...report,
    rows,
    tripCount: rows.length,
    vehicleCount: vehicleCodes.size,
    totalVehicleWeightKg: rows.reduce((sum, row) => sum + row.vehicleWeightKg, 0),
    totalGarbageWeightKg: rows.reduce((sum, row) => sum + row.garbageWeightKg, 0),
    totalCombinedWeightKg: rows.reduce((sum, row) => sum + row.totalWeightKg, 0),
  };
}

function rowHtml(row: WrsWeightReportRow, index: number) {
  return `<tr>
    <td>${index + 1}</td>
    <td>${escapeHtml(row.ticketNumber)}</td>
    <td>${escapeHtml(row.vehicleCode)}</td>
    <td>${escapeHtml(row.carrierName)}</td>
    <td>${escapeHtml(row.fromLocation)}</td>
    <td>${escapeHtml(row.district)}</td>
    <td>${escapeHtml(row.wasteType)}</td>
    <td>${escapeHtml(row.sourceName)}</td>
    <td>${escapeHtml(row.reportDate)}</td>
    <td>${escapeHtml(row.reportTime)}</td>
    <td class="num">${formatNumber(row.vehicleWeightKg)}</td>
    <td class="num">${formatNumber(row.garbageWeightKg)}</td>
    <td class="num">${formatNumber(row.totalWeightKg)}</td>
  </tr>`;
}

function buildReportHtml(input: {
  branchName: string;
  startDate: string;
  endDate: string;
  rows: WrsWeightReportRow[];
  tripCount: number;
  vehicleCount: number;
  totalGarbageWeightKg: number;
  totalVehicleWeightKg: number;
  totalCombinedWeightKg: number;
  scopedDepartmentName?: string | null;
}) {
  const title = input.startDate === input.endDate ? "ӨДРИЙН ТАЙЛАН" : "ХУГАЦААНЫ ТАЙЛАН";
  const emptyRow = `<tr><td colspan="13" class="empty">Сонгосон хугацаанд WRS жингийн мөр олдсонгүй.</td></tr>`;

  return `<!doctype html>
<html lang="mn">
<head>
  <meta charset="utf-8" />
  <title>Хог тээврийн жингийн тайлан</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #000; background: #fff; font-family: Arial, "Helvetica Neue", sans-serif; font-size: 10px; }
    .page { width: 100%; min-height: 100vh; padding: 18px 20px 28px; border: 1px solid #f97316; }
    header { text-align: center; margin: 10px 0 22px; }
    h1 { margin: 0; font-size: 15px; font-weight: 800; letter-spacing: 0; }
    .subtitle { margin-top: 6px; font-style: italic; }
    .meta { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px; font-size: 10px; }
    .meta strong { font-size: 11px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #000; padding: 3px 4px; vertical-align: middle; line-height: 1.2; word-break: break-word; }
    th { text-align: center; font-weight: 800; }
    td { border-left: 0; border-right: 0; }
    tbody td:first-child, tbody td:nth-child(2), tbody td:nth-child(3), tbody td:nth-child(9), tbody td:nth-child(10) { text-align: center; }
    .num { text-align: right; white-space: nowrap; }
    .summary-line td { border-left: 0; border-right: 0; font-weight: 800; }
    .summary-line .summary { text-align: right; }
    .bullets { width: 52%; margin: 28px auto 38px; font-size: 11px; line-height: 1.8; }
    .sign { text-align: center; margin-top: 26px; font-size: 11px; }
    footer { display: flex; justify-content: space-between; border-bottom: 1px solid #000; padding-bottom: 5px; font-weight: 700; }
    .empty { text-align: center; padding: 20px; font-weight: 700; }
    @media print {
      .page { border-color: transparent; min-height: auto; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header>
      <h1>${title}</h1>
      <div class="subtitle">/ Нарангийн энгэрийн төвлөрсөн хогийн цэг /</div>
    </header>
    <div class="meta">
      <div>
        <strong>Хугацаа:</strong> ${escapeHtml(periodLabel(input.startDate, input.endDate))}<br />
        <strong>Салбар:</strong> ${escapeHtml(input.branchName)}
        ${input.scopedDepartmentName ? `<br /><strong>Хэлтэс:</strong> ${escapeHtml(input.scopedDepartmentName)}` : ""}
      </div>
      <div><strong>Хэмжих нэгж: кг</strong></div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 3%">№</th>
          <th style="width: 7%">Тасалбарын дугаар</th>
          <th style="width: 6%">Авто машин</th>
          <th style="width: 11%">Тээвэрлэгч байгууллага</th>
          <th style="width: 10%">Хаанаас</th>
          <th style="width: 11%">Хороо</th>
          <th style="width: 10%">Хог, хаягдлын төрөл</th>
          <th style="width: 9%">Эх үүсвэр</th>
          <th style="width: 6%">Огноо</th>
          <th style="width: 5%">Цаг</th>
          <th style="width: 7%">Машины жин</th>
          <th style="width: 7%">Хогны жин</th>
          <th style="width: 8%">Нийт жин</th>
        </tr>
      </thead>
      <tbody>
        ${input.rows.length ? input.rows.map(rowHtml).join("") : emptyRow}
        <tr class="summary-line">
          <td>${input.tripCount}</td>
          <td colspan="8"></td>
          <td colspan="4" class="summary">Нийт хогны жин: ${formatTon(input.totalGarbageWeightKg)} тонн</td>
        </tr>
      </tbody>
    </table>
    <section class="bullets">
      <div>- ${input.vehicleCount} ширхэг авто машин,</div>
      <div>- ${input.tripCount} удаагийн рейсээр,</div>
      <div>- ${formatTon(input.totalGarbageWeightKg)} тонн хог хаягдлыг бүртгэсэн байна</div>
    </section>
    <div class="sign">ТАЙЛАН ГАРГАСАН: ......................................... /.........................../</div>
    <footer>
      <span>${formatGeneratedAt()}</span>
      <span>Хуудас: 1 / 1</span>
    </footer>
  </main>
</body>
</html>`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }
  if (!canAccessFleetRepair(session)) {
    return Response.json({ error: "Хог тээврийн жингийн тайлан харах эрхгүй байна." }, { status: 403 });
  }

  const { startDate, endDate } = resolveRange(request);
  if (!isDateKey(startDate) || !isDateKey(endDate) || startDate > endDate) {
    return Response.json({ error: "Огноог YYYY-MM-DD хэлбэрээр зөв сонгоно уу." }, { status: 400 });
  }

  try {
    const report = await fetchWrsWeightRows(startDate, endDate);
    const canViewAllReports = canViewAllGarbageWeightReports(session);
    const scopedDepartmentName = canViewAllReports
      ? null
      : await loadSessionEmployeeDepartmentName(session);

    if (!canViewAllReports && !scopedDepartmentName) {
      return Response.json(
        { error: "Хэрэглэгчийн хэлтсийг тодорхойлж чадсангүй." },
        { status: 403 },
      );
    }

    const scopedRows = await scopeReportRows(report.rows, scopedDepartmentName);
    const html = buildReportHtml({
      ...recalculateReportTotals(report, scopedRows),
      scopedDepartmentName,
    });

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "WRS жингийн тайлан үүсгэхэд алдаа гарлаа.";
    return Response.json({ error: message }, { status: 500 });
  }
}
