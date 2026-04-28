import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3001';
const OUT = path.join(process.cwd(), 'tmp-login-ui-screens');
fs.mkdirSync(OUT, { recursive: true });

const viewports = [
  { label: 'desktop', width: 1440, height: 1000 },
  { label: 'mobile', width: 390, height: 844 },
];

for (const viewport of viewports) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  await page.goto(`${BASE}/auth/logout`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  const text = await page.locator('body').innerText();
  const checks = {
    hasLoginName: text.includes('Нэвтрэх нэр'),
    hasPassword: text.includes('Нууц үг'),
    hasOdoo: /Odoo/i.test(text),
    hasTrial: text.includes('Туршилтын') || text.includes('admin / admin'),
    inputCount: await page.locator('input').count(),
  };
  console.log(`${viewport.label}: ${JSON.stringify(checks)}`);
  if (!checks.hasLoginName || !checks.hasPassword || checks.hasOdoo || checks.hasTrial || checks.inputCount !== 2) {
    process.exitCode = 1;
  }
  await page.screenshot({ path: path.join(OUT, `${viewport.label}.png`), fullPage: true });
  await context.close();
  await browser.close();
}
