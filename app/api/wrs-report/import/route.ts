import { timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";
import { fetchWrsDailyVehicleTotals } from "@/lib/wrs-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type FleetVehicleRecord = {
  id: number;
  license_plate?: string | false;
  name?: string | false;
};

type WeightReportRecord = {
  id: number;
};

type ProjectTaskRecord = {
  id: number;
  name?: string | false;
  mfo_vehicle_id?: [number, string] | false;
  mfo_shift_date?: string | false;
};

type DailyWeightTotalRecord = {
  id: number;
};

const TIME_ZONE = process.env.APP_TIME_ZONE ?? "Asia/Ulaanbaatar";
const WRS_WEIGHT_SOURCE = "WRS жингийн систем";
const WRS_DAILY_WEIGHT_SOURCE = "wrs_normalized";

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

function hasBearerAccess(request: Request) {
  const configuredToken = process.env.WRS_SYNC_TOKEN?.trim();
  const authorization = request.headers.get("authorization") ?? "";

  if (!configuredToken || !authorization.startsWith("Bearer ")) {
    return false;
  }

  const providedToken = authorization.slice("Bearer ".length).trim();
  const configuredBuffer = Buffer.from(configuredToken);
  const providedBuffer = Buffer.from(providedToken);

  if (configuredBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(configuredBuffer, providedBuffer);
}

function hasQueryTokenAccess(request: Request) {
  const configuredToken = process.env.WRS_SYNC_TOKEN?.trim();
  const providedToken = new URL(request.url).searchParams.get("token")?.trim() ?? "";

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

async function authorizeRequest(request: Request) {
  if (hasBearerAccess(request) || hasQueryTokenAccess(request) || isLocalDevelopmentRequest(request)) {
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
        isRange: true,
      };
    }

    return {
      startDate: date,
      endDate: date,
      isRange: false,
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
        isRange: true,
      };
    }

    return {
      startDate: date,
      endDate: date,
      isRange: false,
    };
  } catch {
    const date = defaultImportDateKey();
    return {
      startDate: date,
      endDate: date,
      isRange: false,
    };
  }
}

function relationId(value?: [number, string] | false | null) {
  return Array.isArray(value) ? value[0] : null;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function loadVehicleByCode() {
  const vehicles = await executeOdooKw<FleetVehicleRecord[]>(
    "fleet.vehicle",
    "search_read",
    [[]],
    {
      fields: ["id", "license_plate", "name"],
      limit: 500,
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
        numericVehicleByCode.set(
          numericCode,
          existing && existing.id !== vehicle.id ? null : existing ?? vehicle,
        );
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

async function loadGarbageTasksByVehicle(reportDate: string, vehicleIds: number[]) {
  if (!vehicleIds.length) {
    return new Map<number, ProjectTaskRecord>();
  }

  const tasks = await executeOdooKw<ProjectTaskRecord[]>(
    "project.task",
    "search_read",
    [
      [
        ["mfo_shift_date", "=", reportDate],
        ["mfo_operation_type", "in", ["garbage", "garbage_seasonal"]],
        ["mfo_vehicle_id", "in", vehicleIds],
      ],
    ],
    {
      fields: ["name", "mfo_vehicle_id"],
      order: "id desc",
      limit: Math.max(vehicleIds.length * 3, 50),
    },
  );

  const taskByVehicleId = new Map<number, ProjectTaskRecord>();
  for (const task of tasks) {
    const vehicleId = relationId(task.mfo_vehicle_id);
    if (vehicleId && !taskByVehicleId.has(vehicleId)) {
      taskByVehicleId.set(vehicleId, task);
    }
  }

  return taskByVehicleId;
}

async function loadGarbageTasksByDateAndVehicle(reportDates: string[], vehicleIds: number[]) {
  if (!reportDates.length || !vehicleIds.length) {
    return new Map<string, ProjectTaskRecord>();
  }

  const tasks = await executeOdooKw<ProjectTaskRecord[]>(
    "project.task",
    "search_read",
    [
      [
        ["mfo_shift_date", "in", reportDates],
        ["mfo_operation_type", "in", ["garbage", "garbage_seasonal"]],
        ["mfo_vehicle_id", "in", vehicleIds],
      ],
    ],
    {
      fields: ["name", "mfo_vehicle_id", "mfo_shift_date"],
      order: "id desc",
      limit: Math.max(reportDates.length * vehicleIds.length * 2, 500),
    },
  );

  const taskByDateVehicle = new Map<string, ProjectTaskRecord>();
  for (const task of tasks) {
    const vehicleId = relationId(task.mfo_vehicle_id);
    const dateKey = task.mfo_shift_date || "";
    if (!vehicleId || !dateKey) {
      continue;
    }

    const key = `${dateKey}:${vehicleId}`;
    if (!taskByDateVehicle.has(key)) {
      taskByDateVehicle.set(key, task);
    }
  }

  return taskByDateVehicle;
}

async function upsertWeightReport(input: {
  reportDate: string;
  vehicle?: FleetVehicleRecord;
  vehicleCode: string;
  weightKg: number;
}) {
  const existing = await executeOdooKw<WeightReportRecord[]>(
    "municipal.garbage.weight.report",
    "search_read",
    [
      [
        ["report_date", "=", input.reportDate],
        ["vehicle_license_plate", "=", input.vehicleCode],
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
    weight: input.weightKg,
    unit: "kg",
    source: WRS_WEIGHT_SOURCE,
    fetched_at: new Date().toISOString().replace("T", " ").slice(0, 19),
    state: input.vehicle ? "success" : "failed",
    error_message: input.vehicle ? "" : "Авто баазад таарах машин олдсонгүй.",
  };

  if (existing[0]?.id) {
    await executeOdooKw<boolean>(
      "municipal.garbage.weight.report",
      "write",
      [[existing[0].id], values],
    );
    return "updated" as const;
  }

  await executeOdooKw<number>(
    "municipal.garbage.weight.report",
    "create",
    [values],
  );
  return "created" as const;
}

async function upsertDailyWeightTotal(input: {
  reportDate: string;
  task?: ProjectTaskRecord;
  vehicleCode: string;
  weightKg: number;
}) {
  if (!input.task?.id || input.weightKg <= 0) {
    return null;
  }

  const externalReference = `wrs:${input.reportDate}:${normalizeVehicleCode(input.vehicleCode)}`;
  const existing = await executeOdooKw<DailyWeightTotalRecord[]>(
    "mfo.daily.weight.total",
    "search_read",
    [[["external_reference", "=", externalReference]]],
    {
      fields: ["id"],
      limit: 1,
    },
  );
  const values = {
    task_id: input.task.id,
    net_weight_total: input.weightKg,
    source: WRS_DAILY_WEIGHT_SOURCE,
    external_reference: externalReference,
    note: `WRS ${input.reportDate} ${input.vehicleCode}`,
  };

  if (existing[0]?.id) {
    await executeOdooKw<boolean>(
      "mfo.daily.weight.total",
      "write",
      [[existing[0].id], values],
    );
    return "updated" as const;
  }

  await executeOdooKw<number>(
    "mfo.daily.weight.total",
    "create",
    [values],
  );
  return "created" as const;
}

async function createSyncLog(input: {
  state: "success" | "failed";
  recordCount?: number;
  errorMessage?: string;
}) {
  try {
    await executeOdooKw<number>(
      "municipal.garbage.sync.log",
      "create",
      [
        {
          sync_type: "weight",
          state: input.state,
          record_count: input.recordCount ?? 0,
          error_message: input.errorMessage ?? "",
        },
      ],
    );
  } catch (error) {
    console.warn("WRS import sync log could not be saved:", error);
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

async function importWrsDateRange(startDate: string, endDate: string) {
  const vehicleByCode = await loadVehicleByCode();
  const importedDates: string[] = [];
  const emptyDates: Array<{ date: string; branchName: string; ignoredSamples: string[] }> = [];
  const failedDates: Array<{ date: string; error: string }> = [];
  const branchNames = new Set<string>();
  let sourceRows = 0;
  let extractedLineCount = 0;

  const totalsByDateVehicle = new Map<
    string,
    {
      reportDate: string;
      vehicleCode: string;
      vehicleLabel: string;
      weightKg: number;
      rowCount: number;
      sampleRows: string[];
    }
  >();

  for (const reportDate of dateKeysBetween(startDate, endDate)) {
    try {
      const dailyResult = await fetchWrsDailyVehicleTotals(reportDate);
      branchNames.add(dailyResult.branchName);
      extractedLineCount += dailyResult.extractedLineCount;

      if (!dailyResult.totals.length) {
        emptyDates.push({
          date: reportDate,
          branchName: dailyResult.branchName,
          ignoredSamples: dailyResult.ignoredSamples,
        });
        continue;
      }

      importedDates.push(reportDate);

      for (const total of dailyResult.totals) {
        const vehicleCode = normalizeVehicleCode(total.vehicleCode);
        if (!vehicleCode || total.netWeightTotal <= 0) {
          continue;
        }

        const key = `${reportDate}:${vehicleCode}`;
        const current = totalsByDateVehicle.get(key) ?? {
          reportDate,
          vehicleCode: total.vehicleCode,
          vehicleLabel: total.vehicleLabel,
          weightKg: 0,
          rowCount: 0,
          sampleRows: [],
        };

        current.weightKg += total.netWeightTotal;
        current.rowCount += total.rowCount;
        sourceRows += total.rowCount;

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
            : "WRS тайлан татахад алдаа гарлаа.",
      });
    }
  }

  const totals = Array.from(totalsByDateVehicle.values()).sort((left, right) =>
    `${left.reportDate}:${left.vehicleCode}`.localeCompare(`${right.reportDate}:${right.vehicleCode}`),
  );

  const matchedVehicleIds = totals
    .map((total) => findVehicleByCode(vehicleByCode, total.vehicleCode)?.id)
    .filter((id): id is number => Number.isFinite(id ?? NaN) && Number(id) > 0);
  const taskByDateVehicle = await loadGarbageTasksByDateAndVehicle(
    Array.from(new Set(totals.map((total) => total.reportDate))),
    Array.from(new Set(matchedVehicleIds)),
  );

  if (!totals.length) {
    const message = `WRS жингийн тайлан ${startDate} - ${endDate} хугацаанд өдөр бүрээр татахад 0 мөр буцаалаа.`;
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
        branchNames: Array.from(branchNames),
        sourceRows,
        extractedLineCount,
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
  let dailyWeightCreated = 0;
  let dailyWeightUpdated = 0;
  const unmatched: Array<{ vehicleCode: string; vehicleLabel: string; weightKg: number }> = [];
  const unmatchedTasks: Array<{ vehicleCode: string; vehicleLabel: string; weightKg: number }> = [];

  for (const total of totals) {
    const vehicle = findVehicleByCode(vehicleByCode, total.vehicleCode);
    const reportVehicleCode = vehicleReportCode(vehicle, total.vehicleCode);
    if (!vehicle) {
      unmatched.push({
        vehicleCode: total.vehicleCode,
        vehicleLabel: total.vehicleLabel,
        weightKg: total.weightKg,
      });
    }

    const result = await upsertWeightReport({
      reportDate: total.reportDate,
      vehicle,
      vehicleCode: reportVehicleCode,
      weightKg: total.weightKg,
    });

    if (vehicle) {
      imported += 1;
      const dailyWeightResult = await upsertDailyWeightTotal({
        reportDate: total.reportDate,
        task: taskByDateVehicle.get(`${total.reportDate}:${vehicle.id}`),
        vehicleCode: reportVehicleCode,
        weightKg: total.weightKg,
      });
      if (dailyWeightResult === "created") {
        dailyWeightCreated += 1;
      } else if (dailyWeightResult === "updated") {
        dailyWeightUpdated += 1;
      } else {
        unmatchedTasks.push({
          vehicleCode: total.vehicleCode,
          vehicleLabel: total.vehicleLabel,
          weightKg: total.weightKg,
        });
      }
    }

    if (result === "created") {
      created += 1;
    } else {
      updated += 1;
    }
  }

  if (created || updated || dailyWeightCreated || dailyWeightUpdated) {
    revalidatePath("/auto-base");
    revalidatePath("/projects");
    revalidatePath("/tasks");
    revalidatePath("/reports");
  }

  await createSyncLog({
    state: unmatched.length === totals.length && totals.length > 0 ? "failed" : "success",
    recordCount: imported,
    errorMessage: unmatched.length
      ? `${unmatched.length} машины улсын дугаар авто баазтай таарсангүй.`
      : "",
  });

  return NextResponse.json({
    ok: true,
    startDate,
    endDate,
    branchName: Array.from(branchNames)[0] ?? "",
    branchNames: Array.from(branchNames),
    sourceRows,
    extractedLineCount,
    totalRows: totals.length,
    importedDates,
    emptyDates,
    failedDates,
    imported,
    created,
    updated,
    dailyWeightCreated,
    dailyWeightUpdated,
    unmatched,
    unmatchedTasks,
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

  if (requestedWindow.isRange || requestedWindow.startDate !== requestedWindow.endDate) {
    return importWrsDateRange(requestedWindow.startDate, requestedWindow.endDate);
  }

  const requestedDate = requestedWindow.startDate;

  try {
    const [totals, vehicleByCode] = await Promise.all([
      fetchWrsDailyVehicleTotals(requestedDate),
      loadVehicleByCode(),
    ]);
    const matchedVehicleIds = totals.totals
      .map((total) => findVehicleByCode(vehicleByCode, total.vehicleCode)?.id)
      .filter((id): id is number => Number.isFinite(id ?? NaN) && Number(id) > 0);
    const taskByVehicleId = await loadGarbageTasksByVehicle(
      requestedDate,
      Array.from(new Set(matchedVehicleIds)),
    );
    if (!totals.totals.length) {
      const message = `WRS жингийн тайлан ${requestedDate} өдөр 0 мөр буцаалаа.`;
      await createSyncLog({
        state: "failed",
        recordCount: 0,
        errorMessage: message,
      });
      return NextResponse.json(
        {
          error: message,
          requestedDate,
          branchName: totals.branchName,
          totalRows: 0,
          ignoredSamples: totals.ignoredSamples,
        },
        { status: 404 },
      );
    }
    let created = 0;
    let updated = 0;
    let imported = 0;
    let dailyWeightCreated = 0;
    let dailyWeightUpdated = 0;
    const unmatched: Array<{ vehicleCode: string; vehicleLabel: string; weightKg: number }> = [];
    const unmatchedTasks: Array<{ vehicleCode: string; vehicleLabel: string; weightKg: number }> = [];

    for (const total of totals.totals) {
      const vehicle = findVehicleByCode(vehicleByCode, total.vehicleCode);
      const reportVehicleCode = vehicleReportCode(vehicle, total.vehicleCode);
      if (!vehicle) {
        unmatched.push({
          vehicleCode: total.vehicleCode,
          vehicleLabel: total.vehicleLabel,
          weightKg: total.netWeightTotal,
        });
      }

      const result = await upsertWeightReport({
        reportDate: requestedDate,
        vehicle,
        vehicleCode: reportVehicleCode,
        weightKg: total.netWeightTotal,
      });
      if (vehicle) {
        imported += 1;
        const dailyWeightResult = await upsertDailyWeightTotal({
          reportDate: requestedDate,
          task: taskByVehicleId.get(vehicle.id),
          vehicleCode: reportVehicleCode,
          weightKg: total.netWeightTotal,
        });
        if (dailyWeightResult === "created") {
          dailyWeightCreated += 1;
        } else if (dailyWeightResult === "updated") {
          dailyWeightUpdated += 1;
        } else {
          unmatchedTasks.push({
            vehicleCode: total.vehicleCode,
            vehicleLabel: total.vehicleLabel,
            weightKg: total.netWeightTotal,
          });
        }
      }
      if (result === "created") {
        created += 1;
      } else {
        updated += 1;
      }
    }

    if (created || updated || dailyWeightCreated || dailyWeightUpdated) {
      revalidatePath("/auto-base");
      revalidatePath("/projects");
      revalidatePath("/tasks");
      revalidatePath("/reports");
    }

    await createSyncLog({
      state: unmatched.length === totals.totals.length && totals.totals.length > 0 ? "failed" : "success",
      recordCount: imported,
      errorMessage: unmatched.length
        ? `${unmatched.length} машины улсын дугаар авто баазтай таарсангүй.`
        : "",
    });

    return NextResponse.json({
      ok: true,
      requestedDate,
      branchName: totals.branchName,
      totalRows: totals.totals.length,
      imported,
      created,
      updated,
      dailyWeightCreated,
      dailyWeightUpdated,
      unmatched,
      unmatchedTasks,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to import the WRS report.";

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
