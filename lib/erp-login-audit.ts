import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { AppSession } from "@/lib/auth";

export type ErpLoginAuditEvent = {
  id: string;
  userId: number;
  login: string;
  name: string;
  loggedInAt: string;
  device: string;
};

const DATA_FILE = process.env.ERP_LOGIN_AUDIT_FILE || path.join(
  /*turbopackIgnore: true*/ process.cwd(),
  "data",
  "erp-login-audit.json",
);
let writeQueue = Promise.resolve();

async function readEvents() {
  try {
    const parsed = JSON.parse(await fs.readFile(DATA_FILE, "utf8")) as unknown;
    return Array.isArray(parsed) ? parsed as ErpLoginAuditEvent[] : [];
  } catch {
    return [];
  }
}

export async function loadErpLoginAudit(days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return (await readEvents())
    .filter((event) => new Date(event.loggedInAt).getTime() >= cutoff)
    .sort((a, b) => b.loggedInAt.localeCompare(a.loggedInAt));
}

export function recordErpLogin(session: AppSession) {
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const events = await readEvents();
    const now = new Date();
    events.push({
      id: `${session.uid}-${now.getTime()}-${session.sessionId || "session"}`,
      userId: session.uid,
      login: session.login,
      name: session.name,
      loggedInAt: now.toISOString(),
      device: session.deviceLabel || "Тодорхойгүй төхөөрөмж",
    });
    const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;
    const retained = events
      .filter((event) => new Date(event.loggedInAt).getTime() >= cutoff)
      .slice(-20_000);
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    const temporaryFile = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(retained, null, 2), "utf8");
    await fs.rename(temporaryFile, DATA_FILE);
  });
  return writeQueue;
}
