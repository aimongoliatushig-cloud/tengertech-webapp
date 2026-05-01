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
  "/garbage-routes/weekly-plan",
  "/garbage-routes/today",
  "/garbage-routes/inspections",
  "/garbage-routes/dashboard",
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

async function testWeeklyTemplate(browser) {
  const context = await makeContext(browser, "88880943", { width: 1440, height: 950 });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const result = { ok: true, errors, checks: {}, screenshot: "" };
  try {
    await page.goto(`${BASE}/garbage-routes/weekly-plan`, { waitUntil: "domcontentloaded", timeout: 22000 });
    await page.waitForSelector("text=Долоо хоногийн загвар", { timeout: 18000 });
    result.checks.hasMatrix = await page.locator("text=7 хоног бүр давтагдана").isVisible().catch(() => false);
    await page.getByRole("button", { name: "Нэмэх" }).first().click();
    await page.waitForSelector("text=Даваа гарагийн оноолт нэмэх", { timeout: 6000 });
    result.checks.popoverOpens = true;

    const selects = page.locator("form select");
    const selectCount = await selects.count();
    result.checks.selectCount = selectCount;
    if (selectCount < 3) throw new Error(`expected at least 3 selects, got ${selectCount}`);
    await selects.nth(0).selectOption({ index: 1 });
    await selects.nth(1).selectOption({ index: 1 });
    await selects.nth(2).selectOption({ index: 1 });
    await page.locator("form textarea").fill("QA weekly template smoke");
    await page.getByRole("button", { name: "Хадгалах" }).click();
    await page.waitForSelector("text=Маршрут:", { timeout: 7000 });
    result.checks.savedCardVisible = true;
    result.checks.countBadgeVisible = await page.locator("text=1 загвар").isVisible().catch(() => false);

    await page.getByRole("button", { name: "Нэмэх" }).nth(0).click();
    await selects.nth(0).selectOption({ index: 1 });
    await selects.nth(1).selectOption({ index: 1 });
    await selects.nth(2).selectOption({ index: 1 });
    await page.getByRole("button", { name: "Хадгалах" }).click();
    await page.waitForSelector("text=Энэ машин сонгосон өдөр", { timeout: 5000 });
    result.checks.conflictValidationVisible = true;

    result.screenshot = path.join(OUT, "weekly-template-smoke.png");
    await page.screenshot({ path: result.screenshot, fullPage: false });
  } catch (error) {
    result.ok = false;
    result.error = error.message || String(error);
  } finally {
    await context.close();
  }
  return result;
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
const weekly = await testWeeklyTemplate(browser);
const roleUi = await runRoleUi(browser);
await browser.close();

const report = { generatedAt: new Date().toISOString(), weekly, roleUi };
fs.writeFileSync(path.join(OUT, "browser-role-ui.json"), JSON.stringify(report, null, 2));

const hardFailures = roleUi.flatMap((row) =>
  row.pages
    .filter((page) => page.status === "ERR" || page.status >= 500 || page.hasNextError)
    .map((page) => `${row.label} ${page.target} ${page.status} ${page.error || ""}`),
);
console.log("WEEKLY", weekly.ok ? "PASS" : "FAIL", weekly.error || "");
console.log("HARD_FAILURES", hardFailures.length);
for (const failure of hardFailures.slice(0, 20)) console.log(" ", failure);
if (!weekly.ok || hardFailures.length) {
  process.exitCode = 1;
}
