import { timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { executeOdooKw } from "@/lib/odoo";
import { fetchWrsDailyVehicleTotals } from "@/lib/wrs-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

type FleetVehicleRecord = {
  id: number;
  license_plate?: string | false;
  name?: string | false;
};

type WeightReportRecord = {
  id: number;
};

const WRS_WEIGHT_SOURCE = "WRS жингийн систем";

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

async function authorizeRequest(request: Request) {
  if (hasBearerAccess(request) || isLocalDevelopmentRequest(request)) {
    return true;
  }

  const session = await getSession();
  return Boolean(session);
}

async function getRequestedDate(request: Request) {
  if (request.method === "GET") {
    return new URL(request.url).searchParams.get("date")?.trim() ?? "";
  }

  try {
    const body = (await request.json()) as { date?: string };
    return String(body.date ?? "").trim();
  } catch {
    return "";
  }
}

function normalizeVehicleCode(value?: string | false | null) {
  return String(value ?? "")
    .toLocaleUpperCase("mn-MN")
    .replace(/\s+/g, "")
    .trim();
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
  for (const vehicle of vehicles) {
    for (const candidate of [vehicle.license_plate, vehicle.name]) {
      const code = normalizeVehicleCode(candidate);
      if (code && !vehicleByCode.has(code)) {
        vehicleByCode.set(code, vehicle);
      }
    }
  }

  return vehicleByCode;
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
        ["source", "=", WRS_WEIGHT_SOURCE],
      ],
    ],
    {
      fields: ["id"],
      limit: 1,
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
    state: "success",
    error_message: "",
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

async function handleRequest(request: Request) {
  const isAuthorized = await authorizeRequest(request);
  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Authorized session or bearer token required." },
      { status: 401 },
    );
  }

  const requestedDate = await getRequestedDate(request);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return badRequest("Send the target date using YYYY-MM-DD.");
  }

  try {
    const [totals, vehicleByCode] = await Promise.all([
      fetchWrsDailyVehicleTotals(requestedDate),
      loadVehicleByCode(),
    ]);
    let created = 0;
    let updated = 0;
    const unmatched: Array<{ vehicleCode: string; vehicleLabel: string; weightKg: number }> = [];

    for (const total of totals.totals) {
      const vehicleCode = normalizeVehicleCode(total.vehicleCode);
      const vehicle = vehicleByCode.get(vehicleCode);
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
        vehicleCode: total.vehicleCode,
        weightKg: total.netWeightTotal,
      });
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

    return NextResponse.json({
      ok: true,
      requestedDate,
      branchName: totals.branchName,
      totalRows: totals.totals.length,
      created,
      updated,
      unmatched,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to import the WRS report.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}
