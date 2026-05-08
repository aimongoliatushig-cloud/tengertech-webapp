import { NextResponse, type NextRequest } from "next/server";

import { requireSession } from "@/lib/auth";
import {
  canAccessProjectTracker,
  loadProjectTrackerReport,
} from "@/lib/project-tracker";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (!canAccessProjectTracker(session)) {
    return NextResponse.json({ error: "Эрх хүрэхгүй байна." }, { status: 403 });
  }

  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
  const report = await loadProjectTrackerReport({ forceRefresh });
  return NextResponse.json(report);
}
