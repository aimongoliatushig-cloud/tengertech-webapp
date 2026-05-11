import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const PASSWORD = "admin";
const OUT = path.join(process.cwd(), "tmp-full-qa");

fs.mkdirSync(OUT, { recursive: true });

const users = [
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

const corePages = [
  "/",
  "/projects",
  "/tasks?view=today",
  "/reports",
  "/create",
  "/field",
  "/fleet-repair/requests",
  "/fleet-repair/dashboard",
  "/fleet-repair/requests/new",
  "/settings/garbage-transport",
  "/hr",
  "/profile",
];

async function getSessionCookie(login) {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ login, password: PASSWORD }),
  });
  const cookie = (response.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie.startsWith("ops_web_session=")) {
    throw new Error(`login failed for ${login}: ${response.status}`);
  }
  return cookie.split("=").slice(1).join("=");
}

async function visit(page, target) {
  const started = Date.now();
  try {
    const response = await page.goto(`${BASE}${target}`, {
      waitUntil: "domcontentloaded",
      timeout: 22000,
    });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const title = await page.title().catch(() => "");
    return {
      target,
      url: page.url().replace(BASE, ""),
      status: response?.status() ?? null,
      ms: Date.now() - started,
      title,
      hasNextError: bodyText.includes("Application error") || bodyText.includes("Unhandled Runtime Error"),
      hasLogin: bodyText.includes("Нэвтрэх"),
      hasPermissionText: bodyText.includes("эрх") || bodyText.includes("зөвшөөрөл"),
      textSample: bodyText.replace(/\s+/g, " ").slice(0, 220),
    };
  } catch (error) {
    return {
      target,
      status: "ERR",
      ms: Date.now() - started,
      error: error.message || String(error),
    };
  }
}

async function makeContext(browser, login, viewport) {
  const cookieValue = await getSessionCookie(login);
  const context = await browser.newContext({ viewport });
  await context.addCookies([
    {
      name: "ops_web_session",
      value: cookieValue,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return context;
}

async function runRoleUi(browser) {
  const results = [];
  for (const user of users) {
    const context = await makeContext(browser, user.login, { width: 1365, height: 900 });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    const row = { label: user.label, loginOk: true, pages: [], consoleErrors };
    for (const target of corePages) {
      row.pages.push(await visit(page, target));
    }
    const safeLabel = user.label.replace(/[^a-z0-9_-]/gi, "_");
    const screenPath = path.join(OUT, `desktop-${safeLabel}.png`);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 22000 }).catch(() => {});
    await page.screenshot({ path: screenPath, fullPage: false }).catch(() => {});
    row.dashboardScreenshot = screenPath;
    await context.close();
    results.push(row);
    const failed = row.pages.filter((item) => item.status === "ERR" || item.status >= 500 || item.hasNextError);
    console.log(`${failed.length ? "FAIL" : "PASS"} ${user.label} pageFailures=${failed.length}`);
  }
  return results;
}

const browser = await chromium.launch({ headless: true });
const roleUi = await runRoleUi(browser);
await browser.close();

const report = { generatedAt: new Date().toISOString(), roleUi };
fs.writeFileSync(path.join(OUT, "browser-role-ui.json"), JSON.stringify(report, null, 2));

const hardFailures = roleUi.flatMap((row) =>
  row.pages
    .filter((page) => page.status === "ERR" || page.status >= 500 || page.hasNextError)
    .map((page) => `${row.label} ${page.target} ${page.status} ${page.error || ""}`),
);
console.log("HARD_FAILURES", hardFailures.length);
for (const failure of hardFailures.slice(0, 20)) console.log(" ", failure);
if (hardFailures.length) {
  process.exitCode = 1;
}
