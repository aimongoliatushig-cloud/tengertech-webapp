import { NextResponse } from "next/server";

import { buildSessionCookieHeader, signInWithOdooCredentials } from "@/lib/auth";
import { clearLoginRateLimit, isAllowedPostOrigin, isLoginRateLimited } from "@/lib/auth-guard";
import { canAccessGeneralDashboard, GENERAL_DASHBOARD_PATH } from "@/lib/general-dashboard-access";
import { buildPublicUrl } from "@/lib/request-url";

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(buildPublicUrl(request, path), { status: 303 });
}

export async function POST(request: Request) {
  if (!isAllowedPostOrigin(request)) {
    return NextResponse.json({ error: "Хүсэлтийн эх сурвалж буруу байна." }, { status: 403 });
  }

  const formData = await request.formData();
  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const loginIp =
    forwardedFor ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "";
  const userAgent = request.headers.get("user-agent")?.trim() || "";

  if (!login || !password) {
    return redirectTo(request, "/login?error=missing");
  }

  if (isLoginRateLimited(request, login)) {
    return redirectTo(request, "/login?error=rate-limit");
  }

  try {
    const session = await signInWithOdooCredentials(login, password, {
      loginIp,
      userAgent,
    });
    if (!session) {
      return redirectTo(request, "/login?error=invalid");
    }

    clearLoginRateLimit(request, login);

    const response = redirectTo(
      request,
      canAccessGeneralDashboard(session) ? GENERAL_DASHBOARD_PATH : "/",
    );
    response.headers.append("Set-Cookie", buildSessionCookieHeader(session));
    return response;
  } catch {
    return redirectTo(request, "/login?error=connection");
  }
}
