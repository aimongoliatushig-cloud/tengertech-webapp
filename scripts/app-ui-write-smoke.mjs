import fs from "node:fs";
import path from "node:path";

import { chromium } from "playwright";

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
const PAGE_TIMEOUT_MS = Number(process.env.QA_APP_UI_WRITE_TIMEOUT_MS || 60_000);

const connection = {
  url: (process.env.ODOO_URL || "http://localhost:8069").replace(/\/+$/, ""),
  db: process.env.ODOO_DB || "odoo19_admin",
  login: LOGIN,
  password: PASSWORD,
};

const startedAt = Date.now();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const projectName = `QA Codex UI ажил ${stamp}`;
const taskName = `QA Codex UI даалгавар ${stamp}`;
const errors = [];
const consoleErrors = [];
const pageErrors = [];
let uid = null;
let projectId = null;
let taskId = null;

try {
  uid = await authenticate();
  if (!uid) {
    throw new Error("Odoo authenticate failed for app UI write smoke user.");
  }

  const cookie = await getSessionCookie();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 920 } });
  await context.addCookies([
    {
      name: "ops_web_session",
      value: cookie,
      domain: new URL(BASE).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  try {
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const projectResponse = await page.goto(`${BASE}/projects/new`, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    });
    if (!projectResponse || projectResponse.status() >= 500) {
      throw new Error(`Project create page failed: HTTP ${projectResponse?.status() ?? "null"}`);
    }
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});

    const departmentSelect = page.locator('select[name="department_id"]');
    const departmentValue = await departmentSelect.evaluate((select) => {
      if (!(select instanceof HTMLSelectElement)) {
        return "";
      }
      const options = Array.from(select.options).filter((option) => option.value);
      return (
        options.find((option) => option.text.includes("Тохижил"))?.value ||
        options.find((option) => !/авто|хог|тээвэр/i.test(option.text))?.value ||
        options[0]?.value ||
        ""
      );
    });
    if (!departmentValue) {
      throw new Error("Project create page has no selectable department.");
    }
    await departmentSelect.selectOption(departmentValue);
    await page.locator("input#name").fill(projectName);
    await page.locator('textarea[name="project_description"]').fill("QA smoke: UI project create flow.");

    await Promise.all([
      page.waitForURL(/\/projects\/\d+/, { timeout: PAGE_TIMEOUT_MS }),
      page.getByRole("button", { name: /Ажил үүсгэх/ }).click(),
    ]);
    projectId = numberFromUrl(page.url(), /\/projects\/(\d+)/);
    if (!projectId) {
      throw new Error(`Project id was not present after create: ${page.url()}`);
    }

    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    await dismissNotificationCard(page);
    await page.locator("#task-name").fill(taskName);
    await clickVisibleTextButton(page, "Үргэлжлүүлэх", 0);
    await clickVisibleTextButton(page, "Үргэлжлүүлэх", 0);
    await Promise.all([
      page.waitForURL(/\/tasks\/\d+/, { timeout: PAGE_TIMEOUT_MS }),
      page.getByRole("button", { name: /Даалгавар үүсгэх/ }).click(),
    ]);
    taskId = numberFromUrl(page.url(), /\/tasks\/(\d+)/);
    if (!taskId) {
      throw new Error(`Task id was not present after create: ${page.url()}`);
    }
  } finally {
    await context.close();
    await browser.close();
  }
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
} finally {
  const cleanupErrors = await cleanupCreatedRecords({ taskId, projectId, projectName, taskName });
  errors.push(...cleanupErrors);
}

const summary = {
  ok: errors.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0,
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
    taskId,
  },
  consoleErrors,
  pageErrors,
  errors,
};

console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) {
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
      `Login failed for app UI write smoke: HTTP ${response.status} ${location || "no location"}`,
    );
  }
  return cookie.split("=").slice(1).join("=");
}

async function clickVisibleTextButton(page, text, index) {
  const buttons = page.getByRole("button", { name: new RegExp(text) });
  const count = await buttons.count();
  for (let offset = 0; offset < count; offset += 1) {
    const button = buttons.nth(offset);
    if (await button.isVisible().catch(() => false)) {
      if (index === 0) {
        await button.click();
        return;
      }
      index -= 1;
    }
  }
  throw new Error(`Visible button not found: ${text}`);
}

async function dismissNotificationCard(page) {
  const card = page.locator("[data-notification-permission-card]");
  if (!(await card.isVisible().catch(() => false))) {
    return;
  }
  await card.getByRole("button", { name: /хаах/i }).click({ timeout: 3_000 }).catch(() => {});
}

function numberFromUrl(url, pattern) {
  const match = url.match(pattern);
  const value = match?.[1] ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
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
  if (!uid) {
    return null;
  }
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

async function cleanupCreatedRecords({ taskId, projectId, projectName, taskName }) {
  const cleanupErrors = [];
  try {
    const taskIds = new Set();
    if (taskId) {
      taskIds.add(taskId);
    }
    const matchingTasks = await executeKw(
      "project.task",
      "search",
      [[["name", "=", taskName]]],
      { limit: 10 },
    ).catch(() => []);
    for (const id of matchingTasks || []) {
      taskIds.add(id);
    }
    if (taskIds.size) {
      await executeKw("project.task", "unlink", [Array.from(taskIds)]).catch((error) => {
        cleanupErrors.push(`cleanup project.task: ${error.message}`);
      });
    }

    const projectIds = new Set();
    if (projectId) {
      projectIds.add(projectId);
    }
    const matchingProjects = await executeKw(
      "project.project",
      "search",
      [[["name", "=", projectName]]],
      { limit: 10 },
    ).catch(() => []);
    for (const id of matchingProjects || []) {
      projectIds.add(id);
    }
    if (projectIds.size) {
      await executeKw("project.project", "unlink", [Array.from(projectIds)]).catch((error) => {
        cleanupErrors.push(`cleanup project.project: ${error.message}`);
      });
    }
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error.message : String(error));
  }
  return cleanupErrors;
}
