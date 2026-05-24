import { timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { fetchGaihamDailyFuelTotals } from "@/lib/gaiham-fuel-report";
import { executeOdooKw } from "@/lib/odoo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type FleetVehicleRecord = {
  id: number;
  license_plate?: string | false;
  name?: string | false;
};

type FuelReportRecord = {
  id: number;
};

const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Ulaanbaatar";
const GAIHAM_FUEL_SOURCE = "\u0413\u0430\u0439\u0445\u0430\u043c GPS";

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

function defaultImportDateKey() {
  return shiftDateKey(currentDateKey(), -1);
}

function isLocalDevelopmentRequest(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const hostname = new URL(request.url).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function hasTokenAccess(configuredToken: string, providedToken: string) {
  if (!configuredToken || !providedToken) {
    return false;
  }

  const configuredBuffer = Buffer.from(configuredToken);
  const providedBuffer = Buffer.from(providedToken);
  if (configuredBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(configuredBuffer, providedBuffer);
}

function hasEnvTokenAccess(request: Request) {
  const configuredToken = process.env.GAIHAM_SYNC_TOKEN?.trim() || process.env.WRS_SYNC_TOKEN?.trim() || "";
  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const queryToken = new URL(request.url).searchParams.get("token")?.trim() ?? "";

  return hasTokenAccess(configuredToken, bearerToken || queryToken);
}

async function loadOdooConfiguredSyncToken() {
  try {
    const [gaihamToken, wrsToken] = await Promise.all([
      executeOdooKw<string>("ir.config_parameter", "get_param", [
        "municipal_repair_workflow.gaiham_sync_token",
        "",
      ]),
      executeOdooKw<string>("ir.config_parameter", "get_param", [
        "municipal_repair_workflow.wrs_sync_token",
        "",
      ]),
    ]);

    return String(gaihamToken || wrsToken || "").trim();
  } catch (error) {
    console.warn("Gaiham sync token could not be read from Odoo config:", error);
    return "";
  }
}

async function hasOdooConfiguredTokenAccess(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const queryToken = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const providedToken = bearerToken || queryToken;

  return hasTokenAccess(await loadOdooConfiguredSyncToken(), providedToken);
}

async function authorizeRequest(request: Request) {
  if (hasEnvTokenAccess(request) || (await hasOdooConfiguredTokenAccess(request)) || isLocalDevelopmentRequest(request)) {
    return true;
  }

  const session = await getSession();
  return Boolean(session);
}

function normalizeVehicleCode(value?: string | false | null) {
  return String(value ?? "")
    .toLocaleUpperCase("mn-MN")
    .replace(/\s+/g, "")
    .trim();
}

function numericVehicleCode(value?: string | false | null) {
  return normalizeVehicleCode(value).replace(/\D/g, "");
}

function findVehicleByCode(vehicleByCode: Map<string, FleetVehicleRecord>, value?: string | false | null) {
  const normalizedCode = normalizeVehicleCode(value);
  return vehicleByCode.get(normalizedCode) ?? vehicleByCode.get(numericVehicleCode(normalizedCode));
}

function vehicleReportCode(vehicle: FleetVehicleRecord | undefined, fallbackCode: string) {
  return String(vehicle?.license_plate || vehicle?.name || fallbackCode).trim();
}

async function loadVehicleByCode() {
  const vehicles = await executeOdooKw<FleetVehicleRecord[]>(
    "fleet.vehicle",
    "search_read",
    [[]],
    {
      fields: ["id", "license_plate", "name"],
      limit: 700,
      order: "license_plate asc, name asc",
      context: { active_test: false },
    },
  );

  const vehicleByCode = new Map<string, FleetVehicleRecord>();
  const numericVehicleByCode = new Map<string, FleetVehicleRecord | null>();
  for (const vehicle of vehicles) {
    for (const candidate of [vehicle.license_plate, vehicle.name]) {
      const code = normalizeVehicleCode(candidate);
      if (code && !vehicleByCode.has(code)) {
        vehicleByCode.set(code, vehicle);
      }

      const numericCode = numericVehicleCode(code);
      if (numericCode.length >= 3) {
        const existing = numericVehicleByCode.get(numericCode);
        numericVehicleByCode.set(numericCode, existing && existing.id !== vehicle.id ? null : existing ?? vehicle);
      }
    }
  }

  for (const [numericCode, vehicle] of numericVehicleByCode.entries()) {
    if (vehicle && !vehicleByCode.has(numericCode)) {
      vehicleByCode.set(numericCode, vehicle);
    }
  }

  return vehicleByCode;
}

async function getRequestedWindow(request: Request) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const startDate = url.searchParams.get("startDate")?.trim() || "";
    const endDate = url.searchParams.get("endDate")?.trim() || "";
    const date = url.searchParams.get("date")?.trim() || defaultImportDateKey();

    if (startDate || endDate) {
      return {
        startDate: startDate || endDate,
        endDate: endDate || startDate,
      };
    }

    return {
      startDate: date,
      endDate: date,
    };
  }

  try {
    const body = (await request.json()) as {
      date?: string;
      endDate?: string;
      startDate?: string;
    };
    const startDate = String(body.startDate ?? "").trim();
    const endDate = String(body.endDate ?? "").trim();
    const date = String(body.date ?? "").trim() || defaultImportDateKey();

    if (startDate || endDate) {
      return {
        startDate: startDate || endDate,
        endDate: endDate || startDate,
      };
    }

    return {
      startDate: date,
      endDate: date,
    };
  } catch {
    const date = defaultImportDateKey();
    return {
      startDate: date,
      endDate: date,
    };
  }
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateKeysBetween(startDate: string, endDate: string) {
  const dates: string[] = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    dates.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }

  return dates;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function upsertFuelReport(input: {
  reportDate: string;
  vehicle?: FleetVehicleRecord;
  vehicleCode: string;
  fuelLiters: number;
  fuelType?: string;
}) {
  const existing = await executeOdooKw<FuelReportRecord[]>(
    "municipal.garbage.fuel.report",
    "search_read",
    [
      [
        ["report_date", "=", input.reportDate],
        ["vehicle_license_plate", "=", input.vehicleCode],
        ["source", "=", GAIHAM_FUEL_SOURCE],
      ],
    ],
    {
      fields: ["id"],
      limit: 1,
      order: "id desc",
    },
  );

  const values = {
    report_date: input.reportDate,
    vehicle_id: input.vehicle?.id ?? false,
    vehicle_license_plate: input.vehicleCode,
    fuel_liters: input.fuelLiters,
    fuel_type: input.fuelType || "",
    source: GAIHAM_FUEL_SOURCE,
    fetched_at: new Date().toISOString().replace("T", " ").slice(0, 19),
    state: input.vehicle ? "success" : "failed",
    error_message: input.vehicle
      ? ""
      : "\u0410\u0432\u0442\u043e \u0431\u0430\u0430\u0437\u0430\u0434 \u0442\u0430\u0430\u0440\u0430\u0445 \u043c\u0430\u0448\u0438\u043d \u043e\u043b\u0434\u0441\u043e\u043d\u0433\u04af\u0439.",
  };

  if (existing[0]?.id) {
    await executeOdooKw<boolean>("municipal.garbage.fuel.report", "write", [[existing[0].id], values]);
    return "updated" as const;
  }

  await executeOdooKw<number>("municipal.garbage.fuel.report", "create", [values]);
  return "created" as const;
}

async function createSyncLog(input: {
  state: "success" | "failed";
  recordCount?: number;
  errorMessage?: string;
}) {
  try {
    await executeOdooKw<number>("municipal.garbage.sync.log", "create", [
      {
        sync_type: "fuel",
        state: input.state,
        record_count: input.recordCount ?? 0,
        error_message: input.errorMessage ?? "",
      },
    ]);
  } catch (error) {
    console.warn("Gaiham fuel import sync log could not be saved:", error);
  }
}

async function importGaihamDateRange(startDate: string, endDate: string) {
  const vehicleByCode = await loadVehicleByCode();
  const importedDates: string[] = [];
  const emptyDates: Array<{ date: string; ignoredSamples: string[] }> = [];
  const failedDates: Array<{ date: string; error: string }> = [];
  let sourceRows = 0;
  let trackerCount = 0;

  const totalsByDateVehicle = new Map<
    string,
    {
      reportDate: string;
      vehicleCode: string;
      vehicleLabel: string;
      fuelLiters: number;
      fuelType: string;
      rowCount: number;
      sampleRows: string[];
    }
  >();

  for (const reportDate of dateKeysBetween(startDate, endDate)) {
    try {
      const dailyResult = await fetchGaihamDailyFuelTotals(reportDate);
      sourceRows += dailyResult.sourceRows;
      trackerCount = Math.max(trackerCount, dailyResult.trackerCount);

      if (!dailyResult.totals.length) {
        emptyDates.push({
          date: reportDate,
          ignoredSamples: dailyResult.ignoredSamples,
        });
        continue;
      }

      importedDates.push(reportDate);
      for (const total of dailyResult.totals) {
        const vehicleCode = normalizeVehicleCode(total.vehicleCode);
        if (!vehicleCode || total.fuelLiters <= 0) {
          continue;
        }

        const key = `${reportDate}:${vehicleCode}`;
        const current = totalsByDateVehicle.get(key) ?? {
          reportDate,
          vehicleCode,
          vehicleLabel: total.vehicleLabel,
          fuelLiters: 0,
          fuelType: total.fuelType,
          rowCount: 0,
          sampleRows: [],
        };

        current.fuelLiters += total.fuelLiters;
        current.rowCount += total.rowCount;
        for (const sample of total.sampleRows) {
          if (current.sampleRows.length >= 3) {
            break;
          }
          current.sampleRows.push(sample);
        }

        totalsByDateVehicle.set(key, current);
      }
    } catch (error) {
      failedDates.push({
        date: reportDate,
        error:
          error instanceof Error && error.message
            ? error.message
            : "Gaiham \u0442\u04af\u043b\u0448\u043d\u0438\u0439 \u0442\u0430\u0439\u043b\u0430\u043d \u0442\u0430\u0442\u0430\u0445\u0430\u0434 \u0430\u043b\u0434\u0430\u0430 \u0433\u0430\u0440\u043b\u0430\u0430.",
      });
    }
  }

  const totals = Array.from(totalsByDateVehicle.values()).sort((left, right) =>
    `${left.reportDate}:${left.vehicleCode}`.localeCompare(`${right.reportDate}:${right.vehicleCode}`),
  );

  if (!totals.length) {
    const message = `Gaiham \u0442\u04af\u043b\u0448\u043d\u0438\u0439 \u0442\u0430\u0439\u043b\u0430\u043d ${startDate} - ${endDate} \u0445\u0443\u0433\u0430\u0446\u0430\u0430\u043d\u0434 \u04e9\u0434\u04e9\u0440 \u0431\u04af\u0440\u044d\u044d\u0440 \u0442\u0430\u0442\u0430\u0445\u0430\u0434 0 \u043c\u04e9\u0440 \u0431\u0443\u0446\u0430\u0430\u043b\u0430\u0430.`;
    await createSyncLog({
      state: "failed",
      recordCount: 0,
      errorMessage: message,
    });
    return NextResponse.json(
      {
        error: message,
        startDate,
        endDate,
        trackerCount,
        sourceRows,
        totalRows: 0,
        importedDates,
        emptyDates,
        failedDates,
      },
      { status: 404 },
    );
  }

  let created = 0;
  let updated = 0;
  let imported = 0;
  const unmatched: Array<{ vehicleCode: string; vehicleLabel: string; fuelLiters: number }> = [];

  for (const total of totals) {
    const vehicle = findVehicleByCode(vehicleByCode, total.vehicleCode);
    const reportVehicleCode = vehicleReportCode(vehicle, total.vehicleCode);
    if (!vehicle) {
      unmatched.push({
        vehicleCode: total.vehicleCode,
        vehicleLabel: total.vehicleLabel,
        fuelLiters: total.fuelLiters,
      });
    }

    const result = await upsertFuelReport({
      reportDate: total.reportDate,
      vehicle,
      vehicleCode: reportVehicleCode,
      fuelLiters: total.fuelLiters,
      fuelType: total.fuelType,
    });

    if (vehicle) {
      imported += 1;
    }
    if (result === "created") {
      created += 1;
    } else {
      updated += 1;
    }
  }

  if (created || updated) {
    revalidatePath("/auto-base");
    revalidatePath("/projects");
    revalidatePath("/reports");
  }

  await createSyncLog({
    state: unmatched.length === totals.length && totals.length > 0 ? "failed" : "success",
    recordCount: imported,
    errorMessage: unmatched.length
      ? `${unmatched.length} \u043c\u0430\u0448\u0438\u043d\u044b \u0443\u043b\u0441\u044b\u043d \u0434\u0443\u0433\u0430\u0430\u0440 \u0430\u0432\u0442\u043e \u0431\u0430\u0430\u0437\u0442\u0430\u0439 \u0442\u0430\u0430\u0440\u0441\u0430\u043d\u0433\u04af\u0439.`
      : "",
  });

  return NextResponse.json({
    ok: true,
    startDate,
    endDate,
    trackerCount,
    sourceRows,
    totalRows: totals.length,
    importedDates,
    emptyDates,
    failedDates,
    imported,
    created,
    updated,
    unmatched,
  });
}

async function handleRequest(request: Request) {
  const isAuthorized = await authorizeRequest(request);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Authorized session or bearer token required." },
      { status: 401 },
    );
  }

  const requestedWindow = await getRequestedWindow(request);
  if (!isDateKey(requestedWindow.startDate) || !isDateKey(requestedWindow.endDate)) {
    return badRequest("Send the target date using YYYY-MM-DD.");
  }
  if (requestedWindow.startDate > requestedWindow.endDate) {
    return badRequest("startDate must be before or equal to endDate.");
  }

  try {
    return await importGaihamDateRange(requestedWindow.startDate, requestedWindow.endDate);
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to import the Gaiham fuel report.";

    await createSyncLog({
      state: "failed",
      errorMessage: message,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}
