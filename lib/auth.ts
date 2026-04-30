import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { authenticateOdooUser, createOdooConnection } from "@/lib/odoo";
import {
  getRoleLabel,
  hasCapability,
  isMasterRole,
  isWorkerOnly,
  type RoleGroupFlags,
  type UserRole,
} from "@/lib/roles";
import { SESSION_COOKIE_NAME } from "@/lib/session";

const SESSION_TTL_SECONDS = 60 * 60 * 12;
const WORKER_ROLE_REFRESH_INTERVAL_MS = 5 * 60_000;

export type AppSession = {
  uid: number;
  login: string;
  password: string;
  name: string;
  role: UserRole;
  groupFlags?: RoleGroupFlags;
  odooUrl: string;
  odooDb: string;
  issuedAt: number;
  roleCheckedAt?: number;
};

function normalizeSessionUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function getCurrentSessionConnection() {
  const connection = createOdooConnection();
  return {
    odooUrl: normalizeSessionUrl(connection.url),
    odooDb: connection.db.trim(),
  };
}

type SessionReadResult = {
  session: AppSession | null;
  hasInvalidToken: boolean;
};

function getSessionKey() {
  const secret =
    process.env.SESSION_SECRET ?? "hot-tohjilt-local-session-secret-change-me";
  return createHash("sha256").update(secret).digest();
}

function sealSession(payload: AppSession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSessionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function unsealSession(token: string) {
  const buffer = Buffer.from(token, "base64url");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getSessionKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(decrypted) as AppSession;
}

export async function getSession() {
  const { session } = await readSession();
  return session;
}

async function refreshWorkerSessionRole(session: AppSession) {
  if (session.role !== "worker") {
    return session;
  }

  const lastRoleCheckAt = session.roleCheckedAt ?? session.issuedAt;
  if (Date.now() - lastRoleCheckAt < WORKER_ROLE_REFRESH_INTERVAL_MS) {
    return session;
  }

  try {
    const refreshed = await authenticateOdooUser(session.login, session.password);
    if (!refreshed || refreshed.uid !== session.uid) {
      return {
        ...session,
        roleCheckedAt: Date.now(),
      };
    }

    if (refreshed.user.role === session.role) {
      return {
        ...session,
        roleCheckedAt: Date.now(),
      };
    }

    return {
      ...session,
      name: refreshed.user.name,
      login: refreshed.user.login,
      role: refreshed.user.role,
      groupFlags: refreshed.user.groupFlags,
      roleCheckedAt: Date.now(),
    } satisfies AppSession;
  } catch {
    return {
      ...session,
      roleCheckedAt: Date.now(),
    };
  }
}

async function readSession(): Promise<SessionReadResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return { session: null, hasInvalidToken: false };
  }

  try {
    const session = unsealSession(token);
    const currentConnection = getCurrentSessionConnection();
    if (
      !session.odooUrl ||
      !session.odooDb ||
      normalizeSessionUrl(session.odooUrl) !== currentConnection.odooUrl ||
      session.odooDb.trim() !== currentConnection.odooDb
    ) {
      return { session: null, hasInvalidToken: true };
    }
    return {
      session: await refreshWorkerSessionRole(session),
      hasInvalidToken: false,
    };
  } catch {
    return { session: null, hasInvalidToken: true };
  }
}

function shouldUseSecureSessionCookie() {
  return process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase() === "true";
}

export function buildSessionCookieHeader(session: AppSession) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toUTCString();
  const parts = [
    `${SESSION_COOKIE_NAME}=${sealSession(session)}`,
    "Path=/",
    `Expires=${expiresAt}`,
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (shouldUseSecureSessionCookie()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function buildDestroyedSessionCookieHeader() {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (shouldUseSecureSessionCookie()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export async function requireSession() {
  const { session, hasInvalidToken } = await readSession();
  if (!session) {
    if (hasInvalidToken) {
      redirect("/auth/logout");
    }
    redirect("/login");
  }
  return session;
}

export async function signInWithOdooCredentials(login: string, password: string) {
  const result = await authenticateOdooUser(login, password);
  if (!result) {
    return null;
  }

  return {
    uid: result.uid,
    login: result.user.login,
    password,
    name: result.user.name,
    role: result.user.role,
    groupFlags: result.user.groupFlags,
    ...getCurrentSessionConnection(),
    issuedAt: Date.now(),
    roleCheckedAt: Date.now(),
  } satisfies AppSession;
}

export { getRoleLabel, hasCapability, isMasterRole, isWorkerOnly };
