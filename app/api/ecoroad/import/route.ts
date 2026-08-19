import { timingSafeEqual } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { importEcoRoadInspections } from "@/lib/ecoroad-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function hasTokenAccess(request: Request) {
  const configured = process.env.ECOROAD_SYNC_TOKEN?.trim() || process.env.WRS_SYNC_TOKEN?.trim() || "";
  const authorization = request.headers.get("authorization") || "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!configured || !provided) return false;
  const configuredBuffer = Buffer.from(configured);
  const providedBuffer = Buffer.from(provided);
  return configuredBuffer.length === providedBuffer.length && timingSafeEqual(configuredBuffer, providedBuffer);
}

export async function POST(request: Request) {
  if (!hasTokenAccess(request) && !(await getSession())) {
    return NextResponse.json({ error: "Нэвтрэх эрх шаардлагатай." }, { status: 401 });
  }
  try {
    const result = await importEcoRoadInspections();
    revalidatePath("/cleaning-areas");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Eco Road import failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Eco Road импорт амжилтгүй боллоо." },
      { status: 502 },
    );
  }
}
