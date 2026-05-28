import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
loadEnvFile(".env");
loadEnvFile(".env.local");

const BASE = (process.env.QA_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const LOGIN = process.env.QA_APP_WRITE_LOGIN || process.env.ODOO_LOGIN || "admin";
const PASSWORD =
  process.env.QA_APP_WRITE_PASSWORD ||
  process.env.QA_TEST_PASSWORD ||
  process.env.ODOO_PASSWORD ||
  "admin";

const connection = {
  url: (process.env.ODOO_URL || "http://localhost:8069").replace(/\/+$/, ""),
  db: process.env.ODOO_DB || "odoo19_admin",
  login: LOGIN,
  password: PASSWORD,
};

const startedAt = Date.now();
const cleanup = [];
const errors = [];
let uid = null;
let projectId = null;
let teamId = null;

try {
  uid = await authenticate();
  if (!uid) {
    throw new Error("Odoo authenticate failed for app write smoke user.");
  }

  const cookie = await getSessionCookie();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  projectId = await createWithFallback("project.project", {
    name: `QA Codex app API ажил ${stamp}`,
  });
  cleanup.push(["project.project", projectId]);

  const response = await fetch(`${BASE}/api/projects/${projectId}/crew-teams`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `ops_web_session=${cookie}`,
    },
    body: JSON.stringify({
      name: `QA Codex app API баг ${stamp}`,
      memberUserIds: [uid],
    }),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 500) };
  }

  if (!response.ok || !payload?.ok || !payload?.team?.id) {
    throw new Error(`Crew team API failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }

  teamId = Number(payload.team.id);
  cleanup.push(["mfo.crew.team", teamId]);
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
} finally {
  for (const [model, id] of [...cleanup].reverse()) {
    const cleanupError = await unlinkQuietly(model, id);
    if (cleanupError) {
      errors.push(`cleanup ${model}#${id}: ${cleanupError}`);
    }
  }
}

const summary = {
  ok: errors.length === 0,
  elapsedMs: Date.now() - startedAt,
  baseUrl: BASE,
  odoo: {
    url: connection.url,
    db: connection.db,
    login: connection.login,
    uid,
  },
  created: {
    projectId,
    crewTeamId: teamId,
  },
  cleanedCount: cleanup.length,
  errors,
};

console.log(JSON.stringify(summary, null, 2));
if (errors.length) {
  process.exitCode = 1;
}

function loadEnvFile(fileName) {
  const filePath = path.join(cwd, fileName);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function getSessionCookie() {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ login: LOGIN, password: PASSWORD }),
  });
  const location = response.headers.get("location") || "";
  const cookie = (response.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie.startsWith("ops_web_session=")) {
    throw new Error(
      `Login failed for app write smoke: HTTP ${response.status} ${location || "no location"}`,
    );
  }
  return cookie.split("=").slice(1).join("=");
}

async function jsonRpc(service, method, args) {
  const response = await fetch(`${connection.url}/jsonrpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: `${service}-${method}-${Date.now()}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.data?.message || payload.error.message || "Unknown Odoo error");
  }
  return payload.result;
}

async function authenticate() {
  return jsonRpc("common", "authenticate", [
    connection.db,
    connection.login,
    connection.password,
    {},
  ]);
}

async function executeKw(model, method, args = [], kwargs = {}) {
  return jsonRpc("object", "execute_kw", [
    connection.db,
    uid,
    connection.password,
    model,
    method,
    args,
    kwargs,
  ]);
}

function recoverableFieldName(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return (
    message.match(/Invalid field '([^']+)'/)?.[1] ||
    message.match(/Unknown field '([^']+)'/)?.[1] ||
    message.match(/Wrong value for [\w.]+\.([A-Za-z_][\w]*):/)?.[1] ||
    message.match(/Wrong value for ([A-Za-z_][\w]*):/)?.[1] ||
    null
  );
}

async function createWithFallback(model, values, requiredFields = ["name"]) {
  const remaining = { ...values };
  const required = new Set(requiredFields);
  for (;;) {
    try {
      return await executeKw(model, "create", [remaining]);
    } catch (error) {
      const fieldName = recoverableFieldName(error);
      if (!fieldName || required.has(fieldName) || !(fieldName in remaining)) {
        throw error;
      }
      delete remaining[fieldName];
    }
  }
}

async function unlinkQuietly(model, id) {
  if (!id) {
    return "";
  }
  try {
    await executeKw(model, "unlink", [[id]]);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
