import { NextResponse } from "next/server";

import { buildSessionCookieHeader, signInWithOdooCredentials } from "@/lib/auth";
import { buildPublicUrl } from "@/lib/request-url";

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(buildPublicUrl(request, path), { status: 303 });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!login || !password) {
    return redirectTo(request, "/login?error=missing");
  }

  try {
    const session = await signInWithOdooCredentials(login, password);
    if (!session) {
      return redirectTo(request, "/login?error=invalid");
    }

    const response = redirectTo(request, "/");
    response.headers.append("Set-Cookie", buildSessionCookieHeader(session));
    return response;
  } catch {
    return redirectTo(request, "/login?error=connection");
  }
}
