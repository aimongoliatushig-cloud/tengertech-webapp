import { getSession } from "@/lib/auth";
import { loadFleetFuelWeightReport, type FleetFuelWeightReportType } from "@/lib/odoo";
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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type FleetReport = Awaited<ReturnType<typeof loadFleetFuelWeightReport>>;

function buildRows(report: FleetReport) {
  const valueHeader = report.type === "fuel" ? "Нийт литр" : "Нийт жин (тонн)";
  const header = ["№", "Машин", "Улсын дугаар", "Хэлтэс", valueHeader, "Бүртгэлийн мөр", "Таарсан"];
  const body = report.rows.map((row, index) => [
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

function toExcelHtml(title: string, report: FleetReport) {
  const rows = buildRows(report);
  const head = rows[0];
  const dataRows = rows.slice(1);
  const tableRows = dataRows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccd5cf; padding: 6px 8px; text-align: left; }
    th { background: #eef6f0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>Хугацаа: ${escapeHtml(report.startDate)} - ${escapeHtml(report.endDate)}</p>
  <p>Нийт: ${escapeHtml(report.summary.totalLabel)} · Машин: ${report.summary.matchedVehicleCount} · Өдрийн дундаж: ${escapeHtml(report.summary.dayAverageLabel)}</p>
  <table>
    <thead><tr>${head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead>
    <tbody>${tableRows || `<tr><td colspan="${head.length}">Тайлан олдсонгүй.</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Нэвтрэх шаардлагатай." }, { status: 401 });
  }
  if (!canViewGarbageWeightReports(session)) {
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

  const format = getParam(searchParams, "format") || "csv";
  const typeSlug = type === "fuel" ? "fuel" : "weight";
  const title =
    type === "fuel" ? "Шатахууны тайлан" : "Хогийн жингийн тайлан";
  const fileBase = `fleet-${typeSlug}-${startDate}_${endDate}`;

  if (format === "excel" || format === "xls") {
    return new Response(toExcelHtml(title, report), {
      headers: {
        "Content-Disposition": `attachment; filename="${fileBase}.xls"`,
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      },
    });
  }

  return new Response(toCsv(buildRows(report)), {
    headers: {
      "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
