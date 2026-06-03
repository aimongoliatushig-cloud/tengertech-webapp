import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildPublicUrl } from "@/lib/request-url";
import {
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
} from "@/lib/session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/design-board",
  "/api/push/public-key",
  "/api/push/subscription",
  "/api/gaiham-fuel/import",
  "/api/wrs-report/import",
  "/api/wrs-report/normalized",
]);
const AUTH_ACTION_PATHS = new Set([
  "/auth/login",
  "/auth/logout",
]);

type ProxySession = {
  role?: string;
  login?: string;
  name?: string;
  employeeJobTitle?: string;
  groupFlags?: Record<string, boolean | undefined>;
};

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function getCanonicalOrigin() {
  const configuredUrl =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";

  try {
    return configuredUrl ? new URL(configuredUrl).origin : "";
  } catch {
    return "";
  }
}

function hostnameFromHost(host: string) {
  const normalized = host.trim().toLowerCase();
  if (normalized.startsWith("[")) {
    return normalized.slice(0, normalized.indexOf("]") + 1);
  }
  return normalized.split(":")[0];
}

function isLocalHost(host: string) {
  const normalized = hostnameFromHost(host);
  return (
    normalized === "0.0.0.0" ||
    normalized === "::" ||
    normalized === "::1" ||
    normalized === "[::]" ||
    normalized === "[::1]" ||
    normalized === "127.0.0.1" ||
    normalized === "localhost"
  );
}

function getRequestHost(request: NextRequest) {
  return firstHeaderValue(request.headers.get("x-forwarded-host")) ||
    firstHeaderValue(request.headers.get("host")) ||
    request.nextUrl.host;
}

function getCanonicalRedirectUrl(request: NextRequest) {
  const canonicalOrigin = getCanonicalOrigin();
  if (!canonicalOrigin) {
    return null;
  }

  const requestHost = getRequestHost(request);
  const requestHostname = hostnameFromHost(requestHost);
  const canonicalUrl = new URL(canonicalOrigin);
  const canonicalHostname = canonicalUrl.hostname.toLowerCase();

  if (
    !requestHostname ||
    requestHostname === canonicalHostname ||
    isLocalHost(requestHostname) ||
    isLocalHost(canonicalHostname)
  ) {
    return null;
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.protocol = canonicalUrl.protocol;
  redirectUrl.host = canonicalUrl.host;
  return redirectUrl;
}

function getSessionKeyMaterial() {
  return process.env.SESSION_SECRET ?? "hot-tohjilt-local-session-secret-change-me";
}

function shouldUseSecureSessionCookie() {
  return process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase() === "true";
}

function buildRefreshedSessionCookieHeader(token: string) {
  const expiresAt = new Date(Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000).toUTCString();
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    `Expires=${expiresAt}`,
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (shouldUseSecureSessionCookie()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function withRefreshedSessionCookie<T extends NextResponse>(response: T, token: string) {
  response.headers.append("Set-Cookie", buildRefreshedSessionCookieHeader(token));
  return response;
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function unsealProxySession(token: string) {
  const buffer = base64UrlToBytes(token);
  const iv = buffer.slice(0, 12);
  const tag = buffer.slice(12, 28);
  const encrypted = buffer.slice(28);
  const sealedPayload = new Uint8Array(encrypted.length + tag.length);
  sealedPayload.set(encrypted, 0);
  sealedPayload.set(tag, encrypted.length);
  const encodedSecret = new TextEncoder().encode(getSessionKeyMaterial());
  const digest = await crypto.subtle.digest("SHA-256", encodedSecret);
  const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealedPayload);
  return JSON.parse(new TextDecoder().decode(decrypted)) as ProxySession;
}

function hasHrAccess(session: ProxySession) {
  const flags = session.groupFlags ?? {};
  const role = session.role;
  const transportInspectorOnly = Boolean(
    role === "transport_inspector" ||
      (flags.mfoInspector && !flags.mfoManager && !flags.mfoDispatcher),
  );
  if (transportInspectorOnly) {
    return false;
  }

  const masterOrOperationalLeader = Boolean(
    role === "senior_master" ||
      role === "team_leader" ||
      role === "transport_inspector" ||
      flags.municipalMaster ||
      flags.mfoInspector ||
      flags.greenMaster ||
      flags.fleetRepairTeamLeader,
  );
  return Boolean(
    role === "hr_specialist" ||
      role === "hr_manager" ||
      (role !== "worker" &&
        !masterOrOperationalLeader &&
        (flags.hrUser || flags.hrManager || flags.municipalHr)),
  );
}

function hasDepartmentHeadAccess(session: ProxySession) {
  const flags = session.groupFlags ?? {};
  return Boolean(
    session.role === "project_manager" ||
      session.role === "senior_master" ||
      session.role === "team_leader" ||
      flags.municipalDepartmentHead ||
      flags.municipalMaster ||
      flags.municipalManager ||
      flags.mfoManager ||
      flags.environmentManager ||
      flags.improvementManager,
  );
}

function hasExecutiveOrAdminAccess(session: ProxySession) {
  const flags = session.groupFlags ?? {};
  return Boolean(
    session.role === "system_admin" ||
      session.role === "director" ||
      session.role === "general_manager" ||
      flags.municipalDirector ||
      flags.fleetRepairCeo,
  );
}

function normalizePermissionText(value?: string | null) {
  return String(value ?? "")
    .toLocaleLowerCase("mn-MN")
    .replace(/[.,/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactPermissionText(value?: string | null) {
  return normalizePermissionText(value).replace(/\s+/g, "");
}

function isReportOnlySession(session: ProxySession) {
  const jobTitle = normalizePermissionText(session.employeeJobTitle);
  const hasReportPlanningTitle =
    jobTitle.includes("тайлан") &&
    jobTitle.includes("төлөвлөгөө") &&
    jobTitle.includes("хариуцсан") &&
    jobTitle.includes("мэргэжилтэн");

  return Boolean(
    session.role === "report_specialist" ||
      hasReportPlanningTitle ||
      String(session.login ?? "").trim() === "90858504" ||
      compactPermissionText(session.name) === "бболормаа"
  );
}

function isHrOnlySession(session: ProxySession) {
  if (session.role === "worker") {
    return false;
  }

  const explicitHrRole = session.role === "hr_specialist" || session.role === "hr_manager";
  return (
    hasHrAccess(session) &&
    !hasExecutiveOrAdminAccess(session) &&
    (explicitHrRole || !hasDepartmentHeadAccess(session))
  );
}

function isHrAllowedPath(pathname: string) {
  return (
    pathname === "/hr" ||
    pathname.startsWith("/hr/") ||
    pathname === "/profile" ||
    pathname === "/settings/notifications" ||
    pathname === "/auth/logout" ||
    pathname === "/api/hr" ||
    pathname.startsWith("/api/hr/") ||
    pathname === "/api/notifications/subscribe" ||
    pathname === "/api/notifications/test" ||
    pathname === "/api/push/test" ||
    pathname.startsWith("/api/odoo/attachments/")
  );
}

function isReportAllowedPath(pathname: string) {
  return (
    pathname === "/reports" ||
    pathname.startsWith("/reports/") ||
    pathname === "/settings/notifications" ||
    pathname === "/auth/logout" ||
    pathname === "/api/reports/export" ||
    pathname === "/api/notifications/subscribe" ||
    pathname === "/api/notifications/test" ||
    pathname === "/api/push/test" ||
    pathname === "/api/garbage-transport/weight-report" ||
    pathname.startsWith("/api/odoo/attachments/") ||
    pathname === "/api/profile-image"
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const canonicalRedirectUrl = getCanonicalRedirectUrl(request);
  if (canonicalRedirectUrl) {
    return NextResponse.redirect(canonicalRedirectUrl, 308);
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const hasSession = Boolean(sessionToken);
  const isPublicPath = PUBLIC_PATHS.has(pathname);

  if (AUTH_ACTION_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (!hasSession && !isPublicPath) {
    const loginUrl = buildPublicUrl(request, "/login");
    return NextResponse.redirect(loginUrl);
  }

  if (sessionToken && !isPublicPath) {
    try {
      const session = await unsealProxySession(sessionToken);
      if (isReportOnlySession(session)) {
        if (pathname === "/") {
          return withRefreshedSessionCookie(
            NextResponse.redirect(buildPublicUrl(request, "/reports")),
            sessionToken,
          );
        }
        if (!isReportAllowedPath(pathname)) {
          if (pathname.startsWith("/api/")) {
            return withRefreshedSessionCookie(
              NextResponse.json(
                { error: "Тайлангийн ажилтан зөвхөн тайлангийн хэсэгт хандах эрхтэй." },
                { status: 403 },
              ),
              sessionToken,
            );
          }
          return withRefreshedSessionCookie(
            NextResponse.redirect(buildPublicUrl(request, "/reports")),
            sessionToken,
          );
        }
      }
      if (isHrOnlySession(session)) {
        if (pathname === "/") {
          return withRefreshedSessionCookie(
            NextResponse.redirect(buildPublicUrl(request, "/hr")),
            sessionToken,
          );
        }
        if (!isHrAllowedPath(pathname)) {
          if (pathname.startsWith("/api/")) {
            return withRefreshedSessionCookie(
              NextResponse.json(
                { error: "Хүний нөөцийн мэргэжилтэн зөвхөн хүний нөөцийн хэсэгт хандах эрхтэй." },
                { status: 403 },
              ),
              sessionToken,
            );
          }
          return withRefreshedSessionCookie(
            NextResponse.redirect(buildPublicUrl(request, "/hr")),
            sessionToken,
          );
        }
      }
    } catch {
      return NextResponse.next();
    }
  }

  const response = NextResponse.next();
  return sessionToken && !isPublicPath
    ? withRefreshedSessionCookie(response, sessionToken)
    : response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
