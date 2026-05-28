import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth";
import { warmCommonWorkspace } from "@/lib/workspace-warm";

export async function GET() {
  const session = await requireSession();
  const result = await warmCommonWorkspace(session);
  return NextResponse.json(result);
}
