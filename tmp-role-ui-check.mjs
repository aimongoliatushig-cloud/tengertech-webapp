import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3001';
const OUT = path.join(process.cwd(), 'tmp-role-ui-screens');
fs.mkdirSync(OUT, { recursive: true });

const deptLabels = [
  'Санхүүгийн алба',
  'Захиргааны алба',
  'Авто бааз, хог тээвэрлэлтийн хэлтэс',
  'Хог тээвэрлэлт',
  'Авто бааз',
  'Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс',
  'Тохижилтын хэлтэс',
];

const users = [
  { label: 'system_admin', login: 'admin', allAccess: false, ownAny: ['Захиргааны алба'] },
  { label: 'director', login: '99996632', allAccess: true },
  { label: 'general_manager', login: '80007504', allAccess: true },
  { label: 'pm_auto_garbage', login: '88880943', allAccess: false, ownAny: ['Авто бааз, хог тээвэрлэлтийн хэлтэс', 'Хог тээвэрлэлт', 'Авто бааз'] },
  { label: 'pm_tohijilt', login: '99160453', allAccess: false, ownAny: ['Тохижилтын хэлтэс'] },
  { label: 'senior_master_green', login: '91100190', allAccess: false, ownAny: ['Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс'] },
  { label: 'team_leader_green_1', login: '88210622', allAccess: false, ownAny: ['Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс'] },
  { label: 'team_leader_green_2', login: '90530609', allAccess: false, ownAny: ['Ногоон байгууламж, цэвэрлэгээ үйлчилгээний хэлтэс'] },
  { label: 'worker_tohijilt_assigned', login: '80043033', allAccess: false, ownAny: ['Тохижилтын хэлтэс'], worker: true },
];

const viewports = [
  { label: 'desktop', width: 1440, height: 1100 },
  { label: 'mobile', width: 390, height: 844 },
];

async function getSessionCookie(login) {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ login, password: 'admin' }),
  });
  const setCookie = response.headers.get('set-cookie') || '';
  const value = setCookie.split(';')[0].split('=').slice(1).join('=');
  if (!value) throw new Error(`No session cookie for ${login}: status ${response.status}`);
  return value;
}

function includesAny(text, values) {
  return values.filter((value) => text.includes(value));
}

const allResults = [];
for (const viewport of viewports) {
  const browser = await chromium.launch({ headless: true });
  for (const user of users) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const row = { viewport: viewport.label, user: user.label, ok: true, errors: [] };
    try {
      const sessionValue = await getSessionCookie(user.login);
      await context.addCookies([{ name: 'ops_web_session', value: sessionValue, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      const text = await page.locator('body').innerText({ timeout: 25000 });
      const visibleDepts = includesAny(text, deptLabels);
      const hasSystemInfo = text.includes('Системийн мэдээлэл');
      const hasScopedInfo = text.includes('Алба нэгжийн мэдээлэл');
      const hasGlobalUserCount = text.includes('Хэрэглэгч') && text.includes('128');
      const ownVisible = user.ownAny ? user.ownAny.some((value) => text.includes(value)) : true;
      const otherVisible = user.ownAny ? visibleDepts.filter((dept) => !user.ownAny.includes(dept)) : [];

      row.visibleDepts = visibleDepts;
      row.hasSystemInfo = hasSystemInfo;
      row.hasScopedInfo = hasScopedInfo;
      row.hasGlobalUserCount = hasGlobalUserCount;

      if (viewport.label === 'mobile') {
        if (user.allAccess) {
          if (!text.includes('Бүх алба хэлтэс')) row.errors.push('expected all-department mobile scope label');
        } else {
          if (!ownVisible) row.errors.push(`own department missing: ${user.ownAny.join(' / ')}`);
          if (!user.worker && otherVisible.length > 0) row.errors.push(`other department labels visible: ${otherVisible.join(', ')}`);
          if (hasGlobalUserCount) row.errors.push('must not show global user count 128');
        }
      } else if (user.allAccess) {
        if (!hasSystemInfo) row.errors.push('expected global System info card');
        if (visibleDepts.length < 4) row.errors.push(`expected all department labels, got ${visibleDepts.join(', ')}`);
      } else {
        if (!hasScopedInfo) row.errors.push('expected scoped department info card');
        if (hasSystemInfo) row.errors.push('must not show global System info card');
        if (hasGlobalUserCount) row.errors.push('must not show global user count 128');
        if (!ownVisible) row.errors.push(`own department missing: ${user.ownAny.join(' / ')}`);
        if (!user.worker && otherVisible.length > 0) row.errors.push(`other department labels visible: ${otherVisible.join(', ')}`);
      }

      const fileName = `${viewport.label}-${user.label}.png`;
      await page.screenshot({ path: path.join(OUT, fileName), fullPage: true });
      row.screenshot = fileName;
    } catch (error) {
      row.ok = false;
      row.errors.push(error.message || String(error));
    }
    row.ok = row.errors.length === 0;
    allResults.push(row);
    console.log(`${row.ok ? 'PASS' : 'FAIL'} ${viewport.label} ${user.label}`);
    if (row.errors.length) console.log('  ' + row.errors.join('\n  '));
    await context.close();
  }
  await browser.close();
}

fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(allResults, null, 2));
const failed = allResults.filter((row) => !row.ok);
console.log(`SUMMARY passed=${allResults.length - failed.length} failed=${failed.length}`);
if (failed.length) process.exitCode = 1;


