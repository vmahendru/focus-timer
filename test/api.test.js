// Runs the companion in demo mode on a spare port and drives the API.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 18711;
const BASE = 'http://127.0.0.1:' + PORT;
let child;

async function api(method, url, body) {
  const res = await fetch(BASE + url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, data: text.startsWith('{') || text.startsWith('[') ? JSON.parse(text) : text };
}

test.before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'focus.js'), '--demo', '--port', String(PORT)], { stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => { if (String(d).includes('running')) resolve(); });
    child.on('exit', (code) => reject(new Error('companion exited ' + code)));
    setTimeout(() => reject(new Error('companion did not start')), 5000);
  });
});

test.after(() => { child.kill(); });

test('health reports demo mode with all fake integrations on', async () => {
  const { data } = await api('GET', '/api/health');
  assert.equal(data.ok, true);
  assert.equal(data.demo, true);
  assert.deepEqual(data.integrations, { jira: true, github: true, confluence: true });
});

test('the demo board has tasks and a next-up subtask under the active parent', async () => {
  const { data } = await api('GET', '/api/next');
  assert.ok(data.task);
  assert.equal(data.task.phase, 'research');
  assert.equal(data.task.parentTitle, 'Reduce ingest latency below 200 ms');
  assert.ok(data.plan.length >= 1);
});

test('create, patch, decompose, block, done, delete', async () => {
  const created = await api('POST', '/api/tasks', { title: 'Write the design note', status: 'next', blocks: 3, body: 'why' });
  assert.equal(created.status, 201);
  const id = created.data.id;

  const patched = await api('PATCH', '/api/tasks/' + id, { status: 'doing', body: 'updated' });
  assert.equal(patched.data.status, 'doing');
  assert.equal(patched.data.body, 'updated');

  const proposal = await api('GET', '/api/tasks/' + id + '/decompose?phases=design,verify');
  assert.ok(proposal.data.subtasks.length >= 4);
  assert.ok(proposal.data.subtasks.every((s) => ['design', 'verify'].includes(s.phase)));

  const made = await api('POST', '/api/tasks/' + id + '/decompose', { subtasks: proposal.data.subtasks.slice(0, 2) });
  assert.equal(made.status, 201);
  assert.equal(made.data.subtasks.length, 2);
  assert.ok(made.data.subtasks.every((s) => s.parent === id));

  const one = await api('GET', '/api/tasks/' + id);
  assert.equal(one.data.children.length, 2);

  const sub = made.data.subtasks[0].id;
  const blocked = await api('POST', '/api/tasks/' + sub + '/block');
  assert.equal(blocked.data.spent, 1);
  assert.equal(blocked.data.status, 'doing');
  const done = await api('POST', '/api/tasks/' + sub + '/done');
  assert.equal(done.data.status, 'done');

  const prompt = await api('GET', '/api/tasks/' + id + '/prompt');
  assert.match(prompt.data, /Write the design note/);
  assert.match(prompt.data, new RegExp(id));
  assert.match(prompt.data, /Existing subtasks:\n\n- T-/);

  const gone = await api('DELETE', '/api/tasks/' + id);
  assert.equal(gone.status, 200);
  const missing = await api('GET', '/api/tasks/' + id);
  assert.equal(missing.status, 404);
  const all = await api('GET', '/api/tasks');
  assert.ok(all.data.tasks.every((t) => t.parent !== id));
});

test('bad input is rejected', async () => {
  assert.equal((await api('POST', '/api/tasks', { title: '' })).status, 400);
  assert.equal((await api('POST', '/api/tasks', { title: 'x', status: 'nope' })).status, 400);
  assert.equal((await api('GET', '/api/tasks/../../etc')).status, 404);
});

test('jira: search, import once, push with subtasks', async () => {
  const found = await api('GET', '/api/jira/search?jql=x');
  assert.equal(found.data.issues.length, 2);
  const imported = await api('POST', '/api/jira/import', { issues: found.data.issues });
  assert.equal(imported.data.tasks.length, 0, 'demo issues are already on the board');
  const fresh = await api('POST', '/api/jira/import', { issues: [{ key: 'DEMO-55', title: 'New one', url: 'https://jira.example.com/browse/DEMO-55' }] });
  assert.equal(fresh.data.tasks.length, 1);
  assert.equal(fresh.data.tasks[0].jira, 'DEMO-55');

  const local = await api('POST', '/api/tasks', { title: 'Local only', status: 'next' });
  await api('POST', '/api/tasks/' + local.data.id + '/decompose', { phases: ['verify'] });
  const pushed = await api('POST', '/api/jira/push/' + local.data.id, { withChildren: true });
  assert.ok(pushed.data.tasks.length >= 2);
  assert.ok(pushed.data.tasks.every((t) => /^DEMO-\d+$/.test(t.jira)));
  const again = await api('POST', '/api/jira/push/' + local.data.id, { withChildren: true });
  assert.equal(again.data.tasks[0].jira, pushed.data.tasks[0].jira, 'pushing twice does not duplicate');
});

test('github inbox and import, confluence search', async () => {
  const inbox = await api('GET', '/api/github/inbox');
  assert.equal(inbox.data.assigned.length, 1);
  assert.equal(inbox.data.reviews.length, 1);
  const imported = await api('POST', '/api/github/import', { items: inbox.data.reviews });
  assert.equal(imported.data.tasks[0].title, 'Review: Add retry budget to the fetcher');
  assert.equal(imported.data.tasks[0].github, 'acme/ingest#418');
  const pages = await api('GET', '/api/confluence/search?q=latency');
  assert.equal(pages.data.pages.length, 2);
});

test('config round-trips with tokens masked and kept', async () => {
  const saved = await api('PUT', '/api/config', { blocksPerDay: 6, jira: { baseUrl: 'https://j', project: 'P', token: 'secret' } });
  assert.equal(saved.data.jira.token, '');
  assert.equal(saved.data.jira.hasToken, true);
  const kept = await api('PUT', '/api/config', { jira: { project: 'Q', token: '' } });
  assert.equal(kept.data.jira.project, 'Q');
  assert.equal(kept.data.jira.hasToken, true);
  assert.equal(kept.data.blocksPerDay, 6);
});

test('the companion does not serve its own source or the workspace', async () => {
  assert.equal((await api('GET', '/focus.js')).status, 404);
  assert.equal((await api('GET', '/lib/tasks.js')).status, 404);
  assert.equal((await api('GET', '/board.html')).status, 200);
});
