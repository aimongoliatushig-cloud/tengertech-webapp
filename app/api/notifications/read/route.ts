import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/notification-state";

export async function POST(request: Request) {
  const session = await requireSession();
  const payload = (await request.json().catch(() => null)) as { keys?: unknown } | null;
  const keys = Array.isArray(payload?.keys)
    ? payload.keys.filter((key): key is string => typeof key === "string")
    : [];

  const ok = await markNotificationsRead(session, keys);
  return NextResponse.json({ ok, readCount: keys.length });
}
