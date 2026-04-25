import { NextResponse } from "next/server";

import { buildDestroyedSessionCookieHeader } from "@/lib/auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
  response.headers.append("Set-Cookie", buildDestroyedSessionCookieHeader());
  return response;
}
