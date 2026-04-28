/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const BASE = 'http://localhost:3001';
const outDir = path.join(process.cwd(), 'tmp-role-scope-screens');
fs.mkdirSync(outDir, { recursive: true });
async function login(page, login) {
  await page.goto(`${BASE}/auth/logout`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="login"]').fill(login);
  await page.locator('input[name="password"]').fill('admin');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => null),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForLoadState('domcontentloaded');
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  await login(page, '99160453');
  await page.goto(`${BASE}/review`, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: path.join(outDir, 'pm-tohijilt-review-target-task.png'), fullPage: true });
  await login(page, '80043033');
  await page.goto(`${BASE}/tasks`, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: path.join(outDir, 'worker-assigned-tasks-target-task.png'), fullPage: true });
  await context.close();
  await browser.close();
  console.log('screenshots saved');
})();

