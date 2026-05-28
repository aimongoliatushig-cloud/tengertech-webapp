import { after, NextResponse } from "next/server";

import { buildSessionCookieHeader, signInWithOdooCredentials } from "@/lib/auth";
import { clearLoginRateLimit, isAllowedPostOrigin, isLoginRateLimited } from "@/lib/auth-guard";
import { canAccessGeneralDashboard, GENERAL_DASHBOARD_PATH } from "@/lib/general-dashboard-access";
import { buildPublicUrl } from "@/lib/request-url";
import { warmCommonWorkspace } from "@/lib/workspace-warm";

const WORK_DASHBOARD_HOME = "/";

function redirectTo(request: Request, path: string) {
  const response = NextResponse.redirect(buildPublicUrl(request, path), { status: 303 });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Clear-Site-Data", '"cache"');
  return response;
}

function getPostLoginPath(session: NonNullable<Awaited<ReturnType<typeof signInWithOdooCredentials>>>) {
  const flags = session.groupFlags || {};
  const transportInspectorMode = Boolean(
    session.role === "transport_inspector" ||
      (flags.mfoInspector && !flags.mfoManager && !flags.mfoDispatcher),
  );
  if (transportInspectorMode) {
    return WORK_DASHBOARD_HOME;
  }

  return canAccessGeneralDashboard(session) ? GENERAL_DASHBOARD_PATH : WORK_DASHBOARD_HOME;
}

function warmPostLoginWorkspace(
  session: NonNullable<Awaited<ReturnType<typeof signInWithOdooCredentials>>>,
) {
  after(async () => {
    try {
      await warmCommonWorkspace(session);
    } catch (error) {
      console.warn("Post-login workspace warm failed:", error);
    }
  });
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
    warmPostLoginWorkspace(session);

    const response = redirectTo(request, getPostLoginPath(session));
    response.headers.append("Set-Cookie", buildSessionCookieHeader(session));
    return response;
  } catch {
    return redirectTo(request, "/login?error=connection");
  }
}
