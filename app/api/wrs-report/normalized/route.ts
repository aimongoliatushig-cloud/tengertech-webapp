import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { fetchWrsDailyVehicleTotals } from "@/lib/wrs-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

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
  if (hasBearerAccess(request)) {
    return true;
  }

  if (isLocalDevelopmentRequest(request)) {
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

function badRequest(message: string) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 400,
    },
  );
}

async function handleRequest(request: Request) {
  const isAuthorized = await authorizeRequest(request);
  if (!isAuthorized) {
    return NextResponse.json(
      {
        error: "Authorized session or bearer token required.",
      },
      {
        status: 401,
      },
    );
  }

  const requestedDate = await getRequestedDate(request);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    return badRequest("Send the target date using YYYY-MM-DD.");
  }

  try {
    const totals = await fetchWrsDailyVehicleTotals(requestedDate);
    return NextResponse.json(totals);
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to normalize the WRS report.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}
