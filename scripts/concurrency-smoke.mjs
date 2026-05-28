import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.QA_TEST_PASSWORD || process.env.ODOO_PASSWORD || "admin";
const PAGE_TIMEOUT_MS = Number(process.env.QA_CONCURRENCY_PAGE_TIMEOUT_MS || 45_000);
const CONCURRENCY = Number(process.env.QA_CONCURRENCY || 4);

const USERS = [
  {
    label: "system_admin",
    login: "admin",
    routes: ["/", "/projects", "/projects/new", "/tasks?view=today", "/settings", "/settings/garbage-transport#points"],
  },
  {
    label: "senior_master_green",
    login: "91100190",
    routes: ["/", "/projects", "/tasks?view=today", "/field", "/reports"],
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
  return { ok: true, value: cookie.split("=").slice(1).join("=") };
}

function hasNextError(text) {
  return text.includes("Application error") || text.includes("Unhandled Runtime Error");
}

function hasBrokenText(text) {
  return /[ÃƒÃÃ‘Ã’Ã“]/.test(text);
}

async function warmWorkspace(context, cookieValue) {
  const response = await context.request
    .get(`${BASE}/api/workspace/warm`, {
      headers: { cookie: `ops_web_session=${cookieValue}` },
      timeout: 20_000,
    })
    .catch((error) => ({ error }));
  if ("error" in response) {
    return { ok: false, error: response.error.message || String(response.error) };
  }
  return { ok: response.ok(), status: response.status() };
}

async function mapLimited(items, limit, worker) {
  const results = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function checkRoute(routeSpec) {
  const { context } = routeSpec;
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

  const startedAt = Date.now();
  let navigationError = "";
  const response = await page
    .goto(`${BASE}${routeSpec.path}`, {
      waitUntil: "domcontentloaded",
      timeout: PAGE_TIMEOUT_MS,
    })
    .catch((error) => {
      navigationError = error.message || String(error);
      return null;
    });
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
  const bodyText = await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "");
  const finalUrl = page.url().replace(BASE, "");
  await page.close().catch(() => {});

  const status = response?.status() ?? null;
  const errors = [];
  if (navigationError) {
    errors.push(navigationError);
  }
  if (status === null || status >= 500) {
    errors.push(`HTTP ${status ?? "none"}`);
  }
  if (hasNextError(bodyText)) {
    errors.push("Next.js error page visible");
  }
  if (hasBrokenText(bodyText)) {
    errors.push("Broken encoded text visible");
  }
  if (consoleErrors.length) {
    errors.push(...consoleErrors.map((error) => `console: ${error}`));
  }
  if (pageErrors.length) {
    errors.push(...pageErrors.map((error) => `pageerror: ${error}`));
  }
  if (publicKeyRequests > 0) {
    errors.push(`unexpected public key requests: ${publicKeyRequests}`);
  }

  return {
    ...routeSpec,
    finalUrl,
    status,
    ms: Date.now() - startedAt,
    bodyLength: bodyText.length,
    publicKeyRequests,
    ok: errors.length === 0,
    errors,
  };
}

const browser = await chromium.launch({ headless: true });
const contexts = [];
const skipped = [];
try {
  for (const user of USERS) {
    const login = await getSessionCookie(user.login);
    if (!login.ok) {
      skipped.push({ user: user.label, login: user.login, ...login });
      continue;
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
    const warmResult = await warmWorkspace(context, login.value);
    contexts.push({ user, context, warmResult });
  }

  const routeSpecs = contexts.flatMap(({ user, context, warmResult }) =>
    user.routes.map((path) => ({ user: user.label, path, context, warmResult })),
  );
  const routeResults = await mapLimited(routeSpecs, CONCURRENCY, checkRoute);
  const failures = routeResults.filter((result) => !result.ok);
  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    concurrency: CONCURRENCY,
    pageTimeoutMs: PAGE_TIMEOUT_MS,
    skipped,
    routes: routeResults.map(({ context, ...result }) => result),
    pass: routeResults.length - failures.length,
    fail: failures.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length) {
    process.exitCode = 1;
  }
} finally {
  await Promise.all(contexts.map(({ context }) => context.close().catch(() => {})));
  await browser.close();
}
