import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.QA_TEST_PASSWORD || process.env.ODOO_PASSWORD || "admin";
const OUT = path.join(process.cwd(), "docs", "qa-assets", "all-role-menu-screenshots");

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

const FALLBACK_PAGES = [
  { label: "home", path: "/" },
  { label: "tasks", path: "/tasks?view=today" },
  { label: "projects", path: "/projects" },
  { label: "reports", path: "/reports" },
  { label: "notifications", path: "/notifications" },
  { label: "profile", path: "/profile" },
  { label: "chat", path: "/chat" },
  { label: "help", path: "/help" },
];

const viewports = [
  { label: "desktop", viewport: { width: 1440, height: 900 }, isMobile: false },
  { label: "mobile", viewport: { width: 390, height: 844 }, isMobile: true },
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE,
  outputDir: OUT,
  users: [],
};

function safeName(value) {
  return value.replace(/[^a-z0-9а-яөүёүА-ЯӨҮЁ -]+/gi, "_").replace(/\s+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "page";
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
  return { ok: true, value: cookie.split("=").slice(1).join("=") };
}

async function capture(page, userDir, viewportLabel, label, fullPage = true) {
  const file = `${viewportLabel}-${safeName(label)}.png`;
  const target = path.join(userDir, file);
  await page.screenshot({ path: target, fullPage }).catch(() => {});
  return target;
}

async function collectVisibleLinks(page) {
  return page.evaluate(() => {
    const links = [...document.querySelectorAll("a[href]")];
    const seen = new Set();
    return links
      .map((link) => ({
        text: (link.textContent || "").replace(/\s+/g, " ").trim(),
        href: link.getAttribute("href") || "",
        box: link.getBoundingClientRect(),
      }))
      .filter((item) => {
        if (!item.href || item.href.startsWith("http") || item.href.startsWith("mailto:")) return false;
        if (item.href.startsWith("#") || item.href.startsWith("javascript:")) return false;
        if (item.box.width <= 0 || item.box.height <= 0) return false;
        const key = `${item.text}|${item.href}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 18)
      .map(({ text, href }) => ({ text: text || href, href }));
  });
}

async function openMobileMenuIfPresent(page) {
  const buttons = [
    page.getByRole("button", { name: /цэс|menu/i }).first(),
    page.locator('button[aria-label*="Цэс"]').first(),
    page.locator('button[aria-label*="Menu"]').first(),
  ];
  for (const button of buttons) {
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      await page.waitForTimeout(300);
      return true;
    }
  }
  return false;
}

const browser = await chromium.launch({ headless: true });

for (const user of USERS) {
  const userRecord = {
    label: user.label,
    login: user.login,
    skipped: false,
    screenshots: [],
    pages: [],
  };
  manifest.users.push(userRecord);

  const login = await getSessionCookie(user.login);
  if (!login.ok) {
    userRecord.skipped = true;
    userRecord.reason = login.reason;
    userRecord.status = login.status;
    userRecord.location = login.location;
    console.log(`SKIP ${user.label}: ${login.reason}`);
    continue;
  }

  const userDir = path.join(OUT, safeName(user.label));
  fs.mkdirSync(userDir, { recursive: true });

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: viewport.viewport, isMobile: viewport.isMobile });
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

    const homeResult = await gotoAndCapture(page, userDir, viewport.label, "/", "home");
    userRecord.pages.push(homeResult);
    userRecord.screenshots.push(homeResult.screenshot);

    if (viewport.isMobile) {
      const opened = await openMobileMenuIfPresent(page);
      if (opened) {
        const menuShot = await capture(page, userDir, viewport.label, "mobile-menu-open", false);
        userRecord.screenshots.push(menuShot);
      }
    } else {
      const menuShot = await capture(page, userDir, viewport.label, "desktop-menu", false);
      userRecord.screenshots.push(menuShot);
    }

    const visibleLinks = await collectVisibleLinks(page).catch(() => []);
    const pages = mergePages(FALLBACK_PAGES, visibleLinks);
    for (const item of pages) {
      const result = await gotoAndCapture(page, userDir, viewport.label, item.href, item.label || item.text);
      userRecord.pages.push(result);
      userRecord.screenshots.push(result.screenshot);
    }

    await context.close();
  }
  console.log(`DONE ${user.label}`);
}

await browser.close();

manifest.users.forEach((user) => {
  user.screenshots = user.screenshots
    .filter(Boolean)
    .map((file) => path.relative(process.cwd(), file).replaceAll("\\", "/"));
});

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(OUT, "README.md"), renderReadme(manifest));

const captured = manifest.users.reduce((sum, user) => sum + user.screenshots.length, 0);
const skipped = manifest.users.filter((user) => user.skipped).length;
console.log(`CAPTURED screenshots=${captured} skipped=${skipped}`);
console.log(`OUT ${OUT}`);

async function gotoAndCapture(page, userDir, viewportLabel, targetPath, label) {
  const startedAt = Date.now();
  const result = {
    viewport: viewportLabel,
    label,
    path: targetPath,
    finalUrl: "",
    status: null,
    ok: true,
    error: "",
    screenshot: "",
  };
  const response = await page
    .goto(`${BASE}${targetPath}`, { waitUntil: "domcontentloaded", timeout: 20_000 })
    .catch((error) => {
      result.ok = false;
      result.error = error.message || String(error);
      return null;
    });
  await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
  result.status = response?.status() ?? null;
  result.finalUrl = page.url().replace(BASE, "");
  if (result.status && result.status >= 500) {
    result.ok = false;
    result.error = `HTTP ${result.status}`;
  }
  result.ms = Date.now() - startedAt;
  result.screenshot = await capture(page, userDir, viewportLabel, `${label}-${safeName(targetPath)}`);
  return result;
}

function mergePages(basePages, linkItems) {
  const byHref = new Map();
  for (const page of basePages) byHref.set(page.path, { label: page.label, href: page.path });
  for (const link of linkItems) {
    const href = link.href || "";
    if (!href || href === "/auth/logout") continue;
    if (href.startsWith("/api/") || href.startsWith("/_next/")) continue;
    byHref.set(href, { label: link.text || href, href });
  }
  return [...byHref.values()].slice(0, 24);
}

function renderReadme(data) {
  const rows = data.users
    .map((user) => `| ${user.label} | ${user.skipped ? `SKIPPED: ${user.reason}` : "CAPTURED"} | ${user.screenshots.length} |`)
    .join("\n");
  return `# All Role Menu Screenshots

- Generated: ${data.generatedAt}
- Base URL: ${data.baseUrl}
- Viewports: desktop 1440x900, mobile 390x844
- Passwords/secrets are not stored in this folder.

| Role/User | Status | Screenshot count |
| --- | --- | ---: |
${rows}
`;
}
