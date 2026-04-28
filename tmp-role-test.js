/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright');

const BASE = 'http://localhost:3001';
const PASSWORD = 'admin';
const TARGET_PROJECT = 'TEST-NOTIF-PROJECT-202604271236-Tohijilt';
const TARGET_TASK = 'TEST-NOTIF-TASK-202604271236';
const OTHER_TASK = 'TEST-NOTIF-';

const users = [
  { label: 'system_admin', login: 'admin', expectTarget: true, expectProjectDirect: true, expectTaskDirect: true, expectHr: true },
  { label: 'director', login: '99996632', expectTarget: true, expectProjectDirect: true, expectTaskDirect: true, expectHr: true },
  { label: 'general_manager', login: '80007504', expectTarget: true, expectProjectDirect: true, expectTaskDirect: true, expectHr: true },
  { label: 'pm_auto_garbage', login: '88880943', expectTarget: false, expectProjectDirect: false, expectTaskDirect: false, expectHr: true },
  { label: 'pm_tohijilt', login: '99160453', expectTarget: true, expectProjectDirect: true, expectTaskDirect: true, expectHr: true },
  { label: 'senior_master_green', login: '91100190', expectTarget: false, expectProjectDirect: false, expectTaskDirect: false, expectHr: true },
  { label: 'team_leader_green_1', login: '88210622', expectTarget: false, expectProjectDirect: false, expectTaskDirect: false, expectHr: true },
  { label: 'team_leader_green_2', login: '90530609', expectTarget: false, expectProjectDirect: false, expectTaskDirect: false, expectHr: true },
  { label: 'worker_tohijilt_assigned', login: '80043033', expectTarget: true, expectProjectDirect: false, expectTaskDirect: true, expectHr: false },
];

async function bodyText(page) {
  return await page.locator('body').innerText({ timeout: 15000 }).catch(async () => '');
}

async function login(page, login) {
  await page.goto(`${BASE}/auth/logout`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="login"]').fill(login);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 }).catch(() => null),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForLoadState('domcontentloaded');
  const url = page.url();
  const text = await bodyText(page);
  if (url.includes('/login') || /error=/.test(url)) {
    throw new Error(`login failed for ${login}: ${url} :: ${text.slice(0, 160)}`);
  }
}

async function visit(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  return { url: page.url(), text: await bodyText(page) };
}

function checkVisible(text) {
  return text.includes(TARGET_TASK) || text.includes(TARGET_PROJECT);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const user of users) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const row = { label: user.label, login: user.login, ok: true, checks: {}, errors: [] };
    try {
      await login(page, user.login);
      for (const path of ['/', '/projects', '/tasks', '/reports', '/review']) {
        const res = await visit(page, path);
        row.checks[path] = {
          url: res.url.replace(BASE, ''),
          targetVisible: checkVisible(res.text),
          anyNotifTestVisible: res.text.includes(OTHER_TASK),
        };
      }
      const projectDirect = await visit(page, '/projects/22');
      row.checks['/projects/22'] = {
        url: projectDirect.url.replace(BASE, ''),
        targetVisible: checkVisible(projectDirect.text),
        allowed: projectDirect.url.includes('/projects/22') && checkVisible(projectDirect.text),
      };
      const taskDirect = await visit(page, '/tasks/378');
      row.checks['/tasks/378'] = {
        url: taskDirect.url.replace(BASE, ''),
        targetVisible: checkVisible(taskDirect.text),
        allowed: taskDirect.url.includes('/tasks/378') && checkVisible(taskDirect.text),
      };
      const hr = await visit(page, '/hr');
      row.checks['/hr'] = {
        url: hr.url.replace(BASE, ''),
        allowed: hr.url.includes('/hr'),
        targetVisible: checkVisible(hr.text),
      };

      const visibleSomewhere = ['/', '/projects', '/tasks', '/reports', '/review'].some((path) => row.checks[path].targetVisible);
      if (visibleSomewhere !== user.expectTarget) {
        row.ok = false;
        row.errors.push(`target list visibility expected ${user.expectTarget} but got ${visibleSomewhere}`);
      }
      if (row.checks['/projects/22'].allowed !== user.expectProjectDirect) {
        row.ok = false;
        row.errors.push(`project direct expected ${user.expectProjectDirect} but got ${row.checks['/projects/22'].allowed} (${row.checks['/projects/22'].url})`);
      }
      if (row.checks['/tasks/378'].allowed !== user.expectTaskDirect) {
        row.ok = false;
        row.errors.push(`task direct expected ${user.expectTaskDirect} but got ${row.checks['/tasks/378'].allowed} (${row.checks['/tasks/378'].url})`);
      }
      if (row.checks['/hr'].allowed !== user.expectHr) {
        row.ok = false;
        row.errors.push(`hr access expected ${user.expectHr} but got ${row.checks['/hr'].allowed} (${row.checks['/hr'].url})`);
      }
      if (consoleErrors.length) {
        row.consoleErrors = consoleErrors.slice(0, 5);
      }
    } catch (error) {
      row.ok = false;
      row.errors.push(error.message || String(error));
    } finally {
      await context.close();
    }
    results.push(row);
  }
  await browser.close();
  const summary = {
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed) process.exitCode = 1;
})();

