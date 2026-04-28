const BASE = 'http://localhost:3001';
const PASSWORD = 'admin';
const TARGET_PROJECT = 'TEST-NOTIF-PROJECT-202604271236-Tohijilt';
const TARGET_TASK = 'TEST-NOTIF-TASK-202604271236';

const users = [
  { label: 'system_admin', login: 'admin', expectTarget: false, expectProjectDirect: false, expectTaskDirect: false, expectHr: true },
  { label: 'director', login: '99996632', expectTarget: true, expectProjectDirect: true, expectTaskDirect: true, expectHr: true },
  { label: 'general_manager', login: '80007504', expectTarget: true, expectProjectDirect: true, expectTaskDirect: true, expectHr: true },
  { label: 'pm_auto_garbage', login: '88880943', expectTarget: false, expectProjectDirect: false, expectTaskDirect: false, expectHr: true },
  { label: 'pm_tohijilt', login: '99160453', expectTarget: true, expectProjectDirect: true, expectTaskDirect: true, expectHr: true },
  { label: 'senior_master_green', login: '91100190', expectTarget: false, expectProjectDirect: false, expectTaskDirect: false, expectHr: true },
  { label: 'team_leader_green_1', login: '88210622', expectTarget: false, expectProjectDirect: false, expectTaskDirect: false, expectHr: true },
  { label: 'team_leader_green_2', login: '90530609', expectTarget: false, expectProjectDirect: false, expectTaskDirect: false, expectHr: true },
  { label: 'worker_tohijilt_assigned', login: '80043033', expectTarget: true, expectProjectDirect: false, expectTaskDirect: true, expectHr: false },
];

async function signIn(login) {
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ login, password: PASSWORD }),
  });
  const setCookie = response.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  if (!cookie.startsWith('ops_web_session=')) throw new Error(`login failed: ${login} ${response.status}`);
  return cookie;
}

async function get(cookie, path) {
  const response = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { cookie } });
  const location = response.headers.get('location') || '';
  const text = await response.text().catch(() => '');
  return { status: response.status, finalPath: location ? new URL(location, BASE).pathname : path, text };
}

function visible(text) {
  return text.includes(TARGET_PROJECT) || text.includes(TARGET_TASK);
}

(async () => {
  const results = [];
  for (const user of users) {
    const row = { label: user.label, ok: true, errors: [] };
    try {
      const cookie = await signIn(user.login);
      const listPaths = ['/', '/projects', '/tasks', '/reports', '/review'];
      const checks = {};
      for (const path of listPaths) checks[path] = await get(cookie, path);
      const project = await get(cookie, '/projects/22');
      const task = await get(cookie, '/tasks/378');
      const hr = await get(cookie, '/hr');
      const visibleSomewhere = listPaths.some((path) => visible(checks[path].text));
      const projectAllowed = project.status === 200 && visible(project.text);
      const taskAllowed = task.status === 200 && visible(task.text);
      const hrAllowed = hr.status === 200;
      if (visibleSomewhere !== user.expectTarget) row.errors.push(`target list expected ${user.expectTarget} got ${visibleSomewhere}`);
      if (projectAllowed !== user.expectProjectDirect) row.errors.push(`project direct expected ${user.expectProjectDirect} got ${projectAllowed} status=${project.status} final=${project.finalPath}`);
      if (taskAllowed !== user.expectTaskDirect) row.errors.push(`task direct expected ${user.expectTaskDirect} got ${taskAllowed} status=${task.status} final=${task.finalPath}`);
      if (hrAllowed !== user.expectHr) row.errors.push(`hr expected ${user.expectHr} got ${hrAllowed} status=${hr.status} final=${hr.finalPath}`);
    } catch (error) {
      row.errors.push(error.message || String(error));
    }
    row.ok = row.errors.length === 0;
    results.push(row);
    console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.label}`);
    if (row.errors.length) console.log('  ' + row.errors.join('\n  '));
  }
  const failed = results.filter((row) => !row.ok);
  console.log(`SUMMARY passed=${results.length - failed.length} failed=${failed.length}`);
  if (failed.length) process.exitCode = 1;
})();


