import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.QA_TEST_PASSWORD || process.env.ODOO_PASSWORD || "admin";
const OUT = path.join(process.cwd(), "tmp-webapp-role-qa");

const USERS = [
  { label: "system_admin", login: "admin" },
  { label: "director", login: "99996632" },
  { label: "general_manager", login: "80007504" },
  { label: "pm_auto_garbage", login: "88880943" },
  { label: "pm_tohijilt", login: "99160453" },
  { label: "senior_master_green", login: "91100190" },
  { label: "team_leader_green_1", login: "88210622" },
  { label: "team_leader_green_2", login: "90530609" },
  { label: "worker_tohijilt_assigned", login: "80043033" },
];

const PAGES = [
  "/",
  "/projects",
  "/tasks?view=today",
  "/field",
  "/reports",
  "/review",
  "/quality",
  "/hr",
  "/fleet-repair/requests",
  "/fleet-repair/dashboard",
  "/garbage-routes/today",
  "/garbage-routes/weekly-plan",
  "/procurement/dashboard",
  "/profile",
];

fs.mkdirSync(OUT, { recursive: true });

const results = [];

function writeSummary() {
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    outputDir: OUT,
    results,
  };
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
}

async function getSessionCookie(login) {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ login, password: PASSWORD }),
  });
  const location = response.headers.get("location") || "";
  const cookie = (response.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie.startsWith("ops_web_session=")) {
    return {
      ok: false,
      status: response.status,
      location,
      reason: location.includes("error=invalid") ? "invalid" : "no-session-cookie",
    };
  }
  return {
    ok: true,
    value: cookie.split("=").slice(1).join("="),
  };
}

function hasBrokenText(text) {
  return /[ÐÑÒÓ]/.test(text);
}

function hasNextError(text) {
  return text.includes("Application error") || text.includes("Unhandled Runtime Error");
}

async function checkPage(page, target, userLabel, viewportLabel) {
  const startedAt = Date.now();
  const errors = [];
  const response = await page.goto(`${BASE}${target}`, {
    waitUntil: "domcontentloaded",
    timeout: 12_000,
  }).catch((error) => {
    errors.push(error.message || String(error));
    return null;
  });
  await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});

  const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  const title = await page.title().catch(() => "");
  const finalUrl = page.url().replace(BASE, "");
  const status = response?.status() ?? null;

  if (status && status >= 500) {
    errors.push(`HTTP ${status}`);
  }
  if (hasNextError(bodyText)) {
    errors.push("Next.js error page visible");
  }
  if (hasBrokenText(bodyText) || hasBrokenText(title)) {
    errors.push("Broken encoded text visible");
  }

  const safeTarget = target.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "home";
  const screenshot = `${viewportLabel}-${userLabel}-${safeTarget}.png`;
  await page.screenshot({ path: path.join(OUT, screenshot), fullPage: false }).catch(() => {});

  return {
    target,
    finalUrl,
    status,
    ms: Date.now() - startedAt,
    title,
    screenshot,
    ok: errors.length === 0,
    errors,
  };
}

const browser = await chromium.launch({ headless: true });
const viewports = [
  { label: "desktop", viewport: { width: 1440, height: 960 } },
  { label: "mobile", viewport: { width: 390, height: 844 } },
];

for (const user of USERS) {
  const login = await getSessionCookie(user.login);
  if (!login.ok) {
    results.push({
      user: user.label,
      login: user.login,
      ok: false,
      skipped: true,
      reason: login.reason,
      status: login.status,
      location: login.location,
      pages: [],
    });
    writeSummary();
    console.log(`SKIP ${user.label} login=${login.reason}`);
    continue;
  }

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: viewport.viewport });
    await context.addCookies([
      {
        name: "ops_web_session",
        value: login.value,
        domain: new URL(BASE).hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    const pages = [];
    for (const target of PAGES) {
      pages.push(await checkPage(page, target, user.label, viewport.label));
    }

    const rowErrors = pages.flatMap((item) => item.errors);
    results.push({
      user: user.label,
      login: user.login,
      viewport: viewport.label,
      ok: rowErrors.length === 0,
      consoleErrors,
      pages,
    });
    writeSummary();
    console.log(`${rowErrors.length ? "FAIL" : "PASS"} ${viewport.label} ${user.label}`);
    await context.close();
  }
}

await browser.close();
writeSummary();

const failures = results.filter((row) => !row.ok && !row.skipped);
console.log(`SUMMARY pass=${results.length - failures.length} fail=${failures.length}`);
if (failures.length) {
  process.exitCode = 1;
}
