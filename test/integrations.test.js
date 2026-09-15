const test = require('node:test');
const assert = require('node:assert/strict');
const { jira, github, confluence, authHeaders } = require('../lib/integrations');
const { template } = require('../lib/decompose');

function stub(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options: options || {} });
    const body = typeof responses === 'function' ? responses(url, options) : responses;
    return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(body) };
  };
  return { fetchImpl, calls };
}

test('data center uses a bearer token, cloud uses basic auth', () => {
  assert.equal(authHeaders({ kind: 'dc', token: 'pat' }).Authorization, 'Bearer pat');
  assert.equal(authHeaders({ kind: 'cloud', email: 'a@b.c', token: 't' }).Authorization, 'Basic ' + Buffer.from('a@b.c:t').toString('base64'));
});

test('jira data center creates a task, and a sub-task under a parent key', async () => {
  const { fetchImpl, calls } = stub({ key: 'PROJ-9' });
  const client = jira({ kind: 'dc', baseUrl: 'https://jira.example.com/', token: 'pat', project: 'PROJ' }, fetchImpl);
  const key = await client.createIssue({ title: 'Do it', body: 'why' });
  assert.equal(key, 'PROJ-9');
  assert.equal(calls[0].url, 'https://jira.example.com/rest/api/2/issue');
  const sent = JSON.parse(calls[0].options.body).fields;
  assert.equal(sent.issuetype.name, 'Task');
  assert.equal(sent.description, 'why');
  assert.equal(sent.parent, undefined);
  await client.createIssue({ title: 'Part', body: '' }, 'PROJ-9');
  const sub = JSON.parse(calls[1].options.body).fields;
  assert.equal(sub.issuetype.name, 'Sub-task');
  assert.equal(sub.parent.key, 'PROJ-9');
});

test('jira cloud uses v3 and document-format descriptions', async () => {
  const { fetchImpl, calls } = stub({ key: 'C-1' });
  const client = jira({ kind: 'cloud', baseUrl: 'https://x.atlassian.net', email: 'e', token: 't', project: 'C' }, fetchImpl);
  await client.createIssue({ title: 'T', body: 'text' });
  assert.equal(calls[0].url, 'https://x.atlassian.net/rest/api/3/issue');
  assert.equal(JSON.parse(calls[0].options.body).fields.description.type, 'doc');
});

test('jira search shapes issues and builds browse links', async () => {
  const { fetchImpl, calls } = stub({ issues: [{ key: 'P-1', fields: { summary: 'S', status: { name: 'To Do' }, description: 'd' } }] });
  const client = jira({ kind: 'dc', baseUrl: 'https://j', token: 't', project: 'P' }, fetchImpl);
  const out = await client.search('assignee = currentUser()');
  assert.match(calls[0].url, /\/search\?jql=assignee%20%3D%20currentUser\(\)/);
  assert.deepEqual(out, [{ key: 'P-1', title: 'S', status: 'To Do', parent: '', body: 'd', url: 'https://j/browse/P-1' }]);
});

test('errors carry the status and message', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, statusText: 'Unauthorized', text: async () => JSON.stringify({ errorMessages: ['bad token'] }) });
  const client = jira({ kind: 'dc', baseUrl: 'https://j', token: 't', project: 'P' }, fetchImpl);
  await assert.rejects(client.me(), (e) => e.status === 401 && /bad token/.test(e.message));
});

test('github lists assigned issues and review requests with repo refs', async () => {
  const { fetchImpl, calls } = stub((url) => url.includes('/search/')
    ? { items: [{ number: 5, title: 'PR', html_url: 'https://github.com/o/r/pull/5', repository_url: 'https://api.github.com/repos/o/r', pull_request: {} }] }
    : [{ number: 3, title: 'Issue', html_url: 'https://github.com/o/r/issues/3', repository_url: 'https://api.github.com/repos/o/r' }]);
  const client = github({ token: 'gh' }, fetchImpl);
  const issues = await client.assigned();
  assert.deepEqual(issues, [{ ref: 'o/r#3', title: 'Issue', url: 'https://github.com/o/r/issues/3', kind: 'issue', body: '' }]);
  const prs = await client.reviewRequests();
  assert.equal(prs[0].ref, 'o/r#5');
  assert.equal(prs[0].kind, 'pr');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer gh');
});

test('confluence searches with cql and returns page links', async () => {
  const { fetchImpl, calls } = stub({ results: [{ title: 'Doc', _links: { webui: '/display/X/Doc' } }] });
  const client = confluence({ kind: 'dc', baseUrl: 'https://wiki', token: 't' }, fetchImpl);
  const out = await client.search('ingest "latency"');
  assert.match(decodeURIComponent(calls[0].url), /text ~ "ingest \\"latency\\""/);
  assert.deepEqual(out, [{ title: 'Doc', url: 'https://wiki/display/X/Doc' }]);
});

test('template decomposition yields phased subtasks sized in blocks', () => {
  const subs = template({ id: 'T-1', title: 'Big thing', status: 'next' }, ['research', 'implement']);
  assert.ok(subs.length >= 4);
  assert.ok(subs.every((s) => s.parent === 'T-1' && s.blocks >= 1 && s.status === 'backlog'));
  assert.deepEqual([...new Set(subs.map((s) => s.phase))], ['research', 'implement']);
  assert.ok(subs[0].order < subs[1].order);
});
