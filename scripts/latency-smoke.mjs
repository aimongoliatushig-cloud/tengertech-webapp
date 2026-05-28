import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.QA_TEST_PASSWORD || process.env.ODOO_PASSWORD || "admin";
const WARN_MS = Number(process.env.QA_LATENCY_WARN_MS || 3000);
const PAGE_TIMEOUT_MS = Number(process.env.QA_LATENCY_PAGE_TIMEOUT_MS || 45_000);
const FAIL_ON_BUDGET = process.env.QA_LATENCY_FAIL === "1";

const USERS = [
  {
    label: "system_admin",
    login: "admin",
    routes: [
      { path: "/", budgetMs: 5000 },
      { path: "/projects", budgetMs: 6000 },
      { path: "/projects/new", budgetMs: 6000 },
      { path: "/tasks?view=today", budgetMs: 3000 },
      { path: "/settings", budgetMs: 5000 },
      { path: "/settings/garbage-transport#points", budgetMs: 7000 },
    ],
  },
  {
    label: "senior_master_green",
    login: "91100190",
    routes: [
      { path: "/", budgetMs: 5000 },
      { path: "/projects", budgetMs: 6000 },
      { path: "/tasks?view=today", budgetMs: 3000 },
      { path: "/field", budgetMs: 3000 },
      { path: "/reports", budgetMs: 3000 },
    ],
  },
];

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

function hasNextError(text) {
  return text.includes("Application error") || text.includes("Unhandled Runtime Error");
}

function hasBrokenText(text) {
  return /[ÃÐÑÒÓ]/.test(text);
}

async function warmWorkspace(context, cookieValue) {
  const response = await context.request.get(`${BASE}/api/workspace/warm`, {
    headers: { cookie: `ops_web_session=${cookieValue}` },
    timeout: 15_000,
  }).catch((error) => ({ error }));
  if ("error" in response) {
    return { ok: false, error: response.error.message || String(response.error) };
  }
  return { ok: response.ok(), status: response.status() };
}

async function measureRoute(page, spec, passLabel) {
  const startedAt = Date.now();
  let navigationError = "";
  const response = await page.goto(`${BASE}${spec.path}`, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_TIMEOUT_MS,
  }).catch((error) => {
    navigationError = error.message || String(error);
    return null;
  });
  await page.waitForLoadState("networkidle", { timeout: 2_500 }).catch(() => {});
  const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  const ms = Date.now() - startedAt;
  const errors = [];
  const status = response?.status() ?? null;
  if (navigationError) {
    errors.push(navigationError);
  }
  if (status && status >= 500) {
    errors.push(`HTTP ${status}`);
  }
  if (hasNextError(bodyText)) {
    errors.push("Next.js error page visible");
  }
  if (hasBrokenText(bodyText)) {
    errors.push("Broken encoded text visible");
  }
  if (FAIL_ON_BUDGET && ms > spec.budgetMs) {
    errors.push(`latency budget exceeded: ${ms}ms > ${spec.budgetMs}ms`);
  }

  return {
    pass: passLabel,
    target: spec.path,
    finalUrl: page.url().replace(BASE, ""),
    status,
    ms,
    budgetMs: spec.budgetMs,
    slow: ms > WARN_MS,
    ok: errors.length === 0,
    errors,
  };
}

async function runUser(browser, user) {
  const login = await getSessionCookie(user.login);
  if (!login.ok) {
    return {
      user: user.label,
      login: user.login,
      ok: false,
      skipped: true,
      loginResult: login,
      pages: [],
    };
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
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
  const pageErrors = [];
  let publicKeyRequests = 0;

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/push/public-key")) {
      publicKeyRequests += 1;
    }
  });

  const pages = [];
  for (const spec of user.routes) {
    pages.push(await measureRoute(page, spec, "cold"));
  }
  const warmResult = await warmWorkspace(context, login.value);
  for (const spec of user.routes) {
    pages.push(await measureRoute(page, spec, "warm"));
  }

  await context.close();

  const routeFailures = pages.filter((item) => !item.ok);
  return {
    user: user.label,
    login: user.login,
    ok:
      routeFailures.length === 0 &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      publicKeyRequests === 0,
    warmResult,
    publicKeyRequests,
    consoleErrors,
    pageErrors,
    pages,
  };
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (const user of USERS) {
  const result = await runUser(browser, user);
  results.push(result);
  console.log(`${result.ok ? "PASS" : result.skipped ? "SKIP" : "FAIL"} ${user.label}`);
}
await browser.close();

const failures = results.filter((result) => !result.ok && !result.skipped);
const slowPages = results.flatMap((result) =>
  (result.pages || [])
    .filter((page) => page.slow)
    .map((page) => ({
      user: result.user,
      pass: page.pass,
      target: page.target,
      ms: page.ms,
      budgetMs: page.budgetMs,
    })),
);
const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE,
  warnMs: WARN_MS,
  pageTimeoutMs: PAGE_TIMEOUT_MS,
  failOnBudget: FAIL_ON_BUDGET,
  results,
  slowPages,
  pass: results.length - failures.length,
  fail: failures.length,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  process.exitCode = 1;
}
