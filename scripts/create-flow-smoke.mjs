import { chromium } from "playwright";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.QA_TEST_PASSWORD || process.env.ODOO_PASSWORD || "admin";
const PAGE_TIMEOUT_MS = Number(process.env.QA_CREATE_PAGE_TIMEOUT_MS || 30_000);

const USERS = [
  {
    label: "system_admin",
    login: "admin",
    pages: [
      { path: "/projects" },
      {
        path: "/projects/new",
        expectControls: ["department_id", "name"],
        expectRequiredControls: ["department_id", "name"],
        expectSubmitText: "Ажил үүсгэх",
      },
      { path: "/tasks?view=today" },
      {
        path: "/settings",
        expectControls: ["subdistrict_name"],
        expectRequiredControls: ["subdistrict_name"],
        expectSubmitText: "Хороо нэмэх",
      },
      {
        path: "/settings/garbage-transport#points",
        expectControls: ["point_name", "subdistrict_id"],
        expectRequiredControls: ["point_name", "subdistrict_id"],
        expectSubmitText: "Хогийн цэг нэмэх",
      },
    ],
    checkCrewApi: true,
  },
  {
    label: "senior_master_green",
    login: "91100190",
    pages: [
      { path: "/projects" },
      { path: "/tasks?view=today" },
      { path: "/field" },
      { path: "/reports" },
    ],
    checkCrewApi: true,
  },
];

const results = [];

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

async function inspectPage(page, spec) {
  const controls = await page.evaluate(() => {
    const visible = (element) => {
      const target = element instanceof HTMLInputElement && element.type === "hidden"
        ? element.closest("form")
        : element;
      return Boolean(target?.getClientRects().length);
    };
    return [...document.querySelectorAll("input, select, textarea, button")]
      .filter(visible)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type") || "",
        name: element.getAttribute("name") || "",
        text: element.textContent?.trim() || "",
        required: element.hasAttribute("required"),
        disabled: element.hasAttribute("disabled"),
        valid:
          "checkValidity" in element && typeof element.checkValidity === "function"
            ? element.checkValidity()
            : true,
      }));
  });

  const names = new Set(controls.map((control) => control.name).filter(Boolean));
  const requiredNames = new Set(
    controls
      .filter((control) => control.required)
      .map((control) => control.name)
      .filter(Boolean),
  );
  const submitTexts = controls
    .filter((control) => control.tag === "button" && (control.type === "submit" || !control.type))
    .map((control) => control.text.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const errors = [];
  for (const controlName of spec.expectControls || []) {
    if (!names.has(controlName)) {
      errors.push(`missing control: ${controlName}`);
    }
  }
  for (const controlName of spec.expectRequiredControls || []) {
    if (!requiredNames.has(controlName)) {
      errors.push(`missing required control: ${controlName}`);
    }
  }
  if (spec.expectSubmitText && !submitTexts.some((text) => text.includes(spec.expectSubmitText))) {
    errors.push(`missing submit button: ${spec.expectSubmitText}`);
  }

  return {
    visibleControls: controls.length,
    controlNames: Array.from(names).slice(0, 30),
    requiredControlNames: Array.from(requiredNames).slice(0, 30),
    submitTexts: submitTexts.slice(0, 12),
    errors,
  };
}

async function runUserSmoke(browser, user) {
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
  for (const spec of user.pages) {
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
    const inspection = await inspectPage(page, spec);
    if (navigationError) {
      inspection.errors.push(navigationError);
    }
    pages.push({
      target: spec.path,
      finalUrl: page.url().replace(BASE, ""),
      status: response?.status() ?? null,
      ms: Date.now() - startedAt,
      bodyLength: bodyText.length,
      hasNextError: hasNextError(bodyText),
      hasBrokenText: hasBrokenText(bodyText),
      visibleButtons: await page.locator("button:visible").count().catch(() => 0),
      ...inspection,
    });
  }

  let crewApi = null;
  if (user.checkCrewApi) {
    const response = await context.request.post(`${BASE}/api/projects/1/crew-teams`, {
      headers: { cookie: `ops_web_session=${login.value}` },
      data: {},
    });
    crewApi = {
      status: response.status(),
      body: (await response.text()).slice(0, 180),
    };
  }

  await context.close();

  const ok =
    pages.every(
      (item) =>
        item.status < 500 &&
        item.status !== null &&
        !item.hasNextError &&
        !item.hasBrokenText &&
        item.errors.length === 0,
    ) &&
    consoleErrors.length === 0 &&
    pageErrors.length === 0 &&
    publicKeyRequests === 0 &&
    (!crewApi || crewApi.status === 400);

  return {
    user: user.label,
    login: user.login,
    ok,
    publicKeyRequests,
    consoleErrors,
    pageErrors,
    pages,
    crewApi,
  };
}

const browser = await chromium.launch({ headless: true });
for (const user of USERS) {
  const result = await runUserSmoke(browser, user);
  results.push(result);
  console.log(`${result.ok ? "PASS" : result.skipped ? "SKIP" : "FAIL"} ${user.label}`);
}
await browser.close();

const failures = results.filter((result) => !result.ok && !result.skipped);
const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE,
  results,
  pass: results.length - failures.length,
  fail: failures.length,
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  process.exitCode = 1;
}
