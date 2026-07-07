import { loadSessionDepartmentName } from "@/lib/access-scope";
import { getSession } from "@/lib/auth";
import { loadFleetFuelWeightReport, type FleetFuelWeightReportType } from "@/lib/odoo";
import { buildReportWorkbook } from "@/lib/report-xlsx";
import { canViewGarbageWeightReports } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() ?? "";
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows: unknown[][]) {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

type FleetReport = Awaited<ReturnType<typeof loadFleetFuelWeightReport>>;

function filterFleetRows(report: FleetReport, department: string, vehicleNeedle: string) {
  return report.rows.filter((row) => {
    if (department && row.departmentName.trim() !== department) {
      return false;
    }
    if (
      vehicleNeedle &&
      !`${row.vehicleLabel} ${row.vehiclePlate}`.toLocaleLowerCase("mn-MN").includes(vehicleNeedle)
    ) {
      return false;
    }
    return true;
  });
}

function buildRows(type: FleetFuelWeightReportType, rows: FleetReport["rows"]) {
  const valueHeader = type === "fuel" ? "Нийт литр" : "Нийт жин (тонн)";
  const header = ["№", "Машин", "Улсын дугаар", "Хэлтэс", valueHeader, "Бүртгэлийн мөр", "Таарсан"];
  const body = rows.map((row, index) => [
    index + 1,
    row.vehicleLabel,
    row.vehiclePlate,
    row.departmentName,
    row.total,
    row.rowCount,
    row.matched ? "Тийм" : "Үгүй",
  ]);
  return [header, ...body];
}

async function toExcelWorkbook(
  title: string,
  type: FleetFuelWeightReportType,
  report: FleetReport,
  rows: FleetReport["rows"],
) {
  const tableRows = buildRows(type, rows);
  const num = (value: number) => value.toLocaleString("mn-MN", { maximumFractionDigits: 1 });
  const total = rows.reduce((sum, row) => sum + (row.total ?? 0), 0);
  const rowCount = rows.reduce((sum, row) => sum + row.rowCount, 0);
  const top = rows.length ? rows.reduce((max, row) => (row.total > max.total ? row : max), rows[0]) : null;
  return buildReportWorkbook({
    title,
    meta: [
      { label: "Тайлангийн төрөл", value: type === "fuel" ? "Шатахуун" : "Хогийн жин" },
      { label: "Хамрах хугацаа", value: `${report.startDate} - ${report.endDate}` },
    ],
    sections: [
      {
        caption: "Нэгтгэл үзүүлэлт",
        headers: ["Үзүүлэлт", "Дүн"],
        rows: [
          ["Нийт дүн", `${num(total)} ${report.unitLabel}`],
          ["Машины тоо", rows.length],
          ["Бүртгэлийн мөр", rowCount],
          ["Хамгийн их", top ? `${top.vehicleLabel} (${top.totalLabel})` : "—"],
        ],
        columnWidths: [30, 30],
      },
      {
        caption: "Машин тус бүрийн задаргаа",
        headers: tableRows[0] as string[],
        rows: tableRows.slice(1) as (string | number)[][],
        columnWidths: [5, 26, 16, 24, 16, 12, 10],
      },
    ],
    sheetName: type === "fuel" ? "Шатахуун" : "Жин",
  });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }
  const scopedDepartmentName = await loadSessionDepartmentName(session);
  if (!canViewGarbageWeightReports(session, scopedDepartmentName)) {
    return Response.json({ error: "Энэ тайланг харах эрхгүй байна." }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const type: FleetFuelWeightReportType = getParam(searchParams, "type") === "weight" ? "weight" : "fuel";
  const rawStart = getParam(searchParams, "startDate");
  const rawEnd = getParam(searchParams, "endDate");
  if (!DATE_KEY_PATTERN.test(rawStart) || !DATE_KEY_PATTERN.test(rawEnd)) {
    return Response.json({ error: "Огноог YYYY-MM-DD хэлбэрээр илгээнэ үү." }, { status: 400 });
  }
  const startDate = rawStart <= rawEnd ? rawStart : rawEnd;
  const endDate = rawStart <= rawEnd ? rawEnd : rawStart;

  const report = await loadFleetFuelWeightReport(
    { type, startDate, endDate },
    { login: session.login, password: session.password },
  );

  // Хэлтэс / машинаар шүүх (тайлан дээрх шүүлттэй ижил)
  const department = getParam(searchParams, "department");
  const vehicleNeedle = getParam(searchParams, "vehicle").trim().toLocaleLowerCase("mn-MN");
  const displayRows = filterFleetRows(report, department, vehicleNeedle);

  const format = getParam(searchParams, "format") || "csv";
  const typeSlug = type === "fuel" ? "fuel" : "weight";
  const title =
    type === "fuel" ? "Шатахууны тайлан" : "Хогийн жингийн тайлан";
  const fileBase = `fleet-${typeSlug}-${startDate}_${endDate}`;

  if (format === "excel" || format === "xls" || format === "xlsx") {
    const buffer = await toExcelWorkbook(title, type, report, displayRows);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  }

  return new Response(toCsv(buildRows(type, displayRows)), {
    headers: {
      "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
