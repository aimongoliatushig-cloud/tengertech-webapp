import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { buildPublicUrl } from "@/lib/request-url";
import { SESSION_COOKIE_NAME } from "@/lib/session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/design-board",
  "/api/wrs-report/normalized",
]);
const AUTH_ACTION_PATHS = new Set([
  "/auth/login",
  "/auth/logout",
]);

type ProxySession = {
  role?: string;
  groupFlags?: Record<string, boolean | undefined>;
};

function getSessionKeyMaterial() {
  return process.env.SESSION_SECRET ?? "hot-tohjilt-local-session-secret-change-me";
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
  return Boolean(
    session.role === "hr_specialist" ||
      session.role === "hr_manager" ||
      flags.hrUser ||
      flags.hrManager ||
      flags.municipalHr,
  );
}

function hasDepartmentHeadAccess(session: ProxySession) {
  const flags = session.groupFlags ?? {};
  return Boolean(
    session.role === "project_manager" ||
      flags.municipalDepartmentHead ||
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

function isHrOnlySession(session: ProxySession) {
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
    pathname === "/auth/logout" ||
    pathname === "/api/hr" ||
    pathname.startsWith("/api/hr/") ||
    pathname.startsWith("/api/odoo/attachments/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
      if (isHrOnlySession(session)) {
        if (pathname === "/") {
          return NextResponse.redirect(buildPublicUrl(request, "/hr"));
        }
        if (!isHrAllowedPath(pathname)) {
          if (pathname.startsWith("/api/")) {
            return NextResponse.json(
              { error: "Хүний нөөцийн мэргэжилтэн зөвхөн хүний нөөцийн хэсэгт хандах эрхтэй." },
              { status: 403 },
            );
          }
          return NextResponse.redirect(buildPublicUrl(request, "/hr"));
        }
      }
    } catch {
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
