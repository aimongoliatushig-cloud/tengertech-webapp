import { NextResponse } from "next/server";

import { buildDestroyedSessionCookieHeader } from "@/lib/auth";
import { buildPublicUrl } from "@/lib/request-url";

function destroySession(request: Request) {
  const response = NextResponse.redirect(buildPublicUrl(request, "/login"), {
    status: 303,
  });
  response.headers.append("Set-Cookie", buildDestroyedSessionCookieHeader());
  return response;
}

export async function GET(request: Request) {
  return destroySession(request);
}

export async function POST(request: Request) {
  return destroySession(request);
}
