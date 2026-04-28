const BASE = 'http://localhost:3001';
const PASSWORD = 'admin';
const TARGET_PROJECT = 'TEST-NOTIF-PROJECT-202604271236-Tohijilt';
const TARGET_TASK = 'TEST-NOTIF-TASK-202604271236';

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

async function signIn(login) {
  const form = new URLSearchParams({ login, password: PASSWORD });
  const response = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const setCookie = response.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  if (!cookie.startsWith('ops_web_session=')) {
    throw new Error(`login failed: status=${response.status} location=${response.headers.get('location')} cookie=${setCookie.slice(0, 80)}`);
  }
  return cookie;
}

async function get(cookie, path) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: { cookie },
  });
  const location = response.headers.get('location') || '';
  const text = await response.text().catch(() => '');
  return { status: response.status, location, finalPath: location ? new URL(location, BASE).pathname : path, text };
}

function visible(text) {
  return text.includes(TARGET_PROJECT) || text.includes(TARGET_TASK);
}

(async () => {
  const results = [];
  for (const user of users) {
    const row = { label: user.label, login: user.login, ok: true, checks: {}, errors: [] };
    try {
      const cookie = await signIn(user.login);
      const listPaths = ['/', '/projects', '/tasks', '/reports', '/review'];
      for (const path of listPaths) {
        const res = await get(cookie, path);
        row.checks[path] = { status: res.status, finalPath: res.finalPath, targetVisible: visible(res.text) };
      }
      const project = await get(cookie, '/projects/22');
      row.checks['/projects/22'] = { status: project.status, finalPath: project.finalPath, targetVisible: visible(project.text), allowed: project.status === 200 && visible(project.text) };
      const task = await get(cookie, '/tasks/378');
      row.checks['/tasks/378'] = { status: task.status, finalPath: task.finalPath, targetVisible: visible(task.text), allowed: task.status === 200 && visible(task.text) };
      const hr = await get(cookie, '/hr');
      row.checks['/hr'] = { status: hr.status, finalPath: hr.finalPath, allowed: hr.status === 200 };

      const visibleSomewhere = listPaths.some((path) => row.checks[path].targetVisible);
      if (visibleSomewhere !== user.expectTarget) row.errors.push(`target list expected ${user.expectTarget} got ${visibleSomewhere}`);
      if (row.checks['/projects/22'].allowed !== user.expectProjectDirect) row.errors.push(`project direct expected ${user.expectProjectDirect} got ${row.checks['/projects/22'].allowed} status=${row.checks['/projects/22'].status} final=${row.checks['/projects/22'].finalPath}`);
      if (row.checks['/tasks/378'].allowed !== user.expectTaskDirect) row.errors.push(`task direct expected ${user.expectTaskDirect} got ${row.checks['/tasks/378'].allowed} status=${row.checks['/tasks/378'].status} final=${row.checks['/tasks/378'].finalPath}`);
      if (row.checks['/hr'].allowed !== user.expectHr) row.errors.push(`hr expected ${user.expectHr} got ${row.checks['/hr'].allowed} status=${row.checks['/hr'].status} final=${row.checks['/hr'].finalPath}`);
      row.ok = row.errors.length === 0;
    } catch (error) {
      row.ok = false;
      row.errors.push(error.message || String(error));
    }
    results.push(row);
    console.log(`${row.ok ? 'PASS' : 'FAIL'} ${row.label}`);
    if (row.errors.length) console.log('  ' + row.errors.join('\n  '));
  }
  const summary = { passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
  console.log('ROLE_MATRIX_JSON_START');
  console.log(JSON.stringify(summary, null, 2));
  console.log('ROLE_MATRIX_JSON_END');
  if (summary.failed) process.exitCode = 1;
})();
