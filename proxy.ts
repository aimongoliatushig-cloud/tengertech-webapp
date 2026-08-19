import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildPublicUrl } from "@/lib/request-url";
import {
  isHrOnlyRole,
  isReportOnlyContext,
  type RoleContext,
} from "@/lib/roles";
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
  "/api/ecoroad/import",
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

// Эрхийн бүх шийдвэрийг lib/roles.ts-аас л дуудна (давхардсан хуулбар логик
// устгасан). ProxySession-г RoleContext болгож хувиргана.
function toRoleContext(session: ProxySession): RoleContext {
  return {
    role: session.role ?? "",
    groupFlags: (session.groupFlags ?? null) as RoleContext["groupFlags"],
    employeeJobTitle: session.employeeJobTitle ?? null,
    login: session.login ?? null,
    name: session.name ?? null,
  };
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
      const roleContext = toRoleContext(session);
      if (isReportOnlyContext(roleContext)) {
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
      if (isHrOnlyRole(roleContext)) {
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
