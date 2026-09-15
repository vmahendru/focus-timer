'use strict';
// Fake Jira, GitHub and Confluence for trying the whole flow without any
// credentials. Same method shapes as lib/integrations.js.

function jira() {
  let n = 100;
  const issues = new Map();
  return {
    async me() { return { displayName: 'Demo User' }; },
    async createIssue(task, parentKey) {
      const key = 'DEMO-' + (++n);
      issues.set(key, { key, title: task.title, parent: parentKey || '' });
      return key;
    },
    async search() {
      return [
        { key: 'DEMO-7', title: 'Reduce ingest latency below 200 ms', status: 'To Do', parent: '', body: 'Customers see slow dashboards after peak hours.', url: 'https://jira.example.com/browse/DEMO-7' },
        { key: 'DEMO-9', title: 'Rotate the signing keys quarterly', status: 'In Progress', parent: '', body: '', url: 'https://jira.example.com/browse/DEMO-9' },
      ];
    },
    async transitions() { return [{ id: '11', name: 'To Do', to: 'To Do' }, { id: '21', name: 'In Progress', to: 'In Progress' }, { id: '31', name: 'Done', to: 'Done' }]; },
    async transition() {},
    url(key) { return 'https://jira.example.com/browse/' + key; },
  };
}

function github() {
  return {
    async assigned() {
      return [
        { ref: 'acme/ingest#412', title: 'Backpressure when the queue is full', url: 'https://github.com/acme/ingest/issues/412', kind: 'issue', body: '' },
      ];
    },
    async reviewRequests() {
      return [
        { ref: 'acme/ingest#418', title: 'Add retry budget to the fetcher', url: 'https://github.com/acme/ingest/pull/418', kind: 'pr', body: '' },
      ];
    },
  };
}

function confluence() {
  return {
    async search(text) {
      return [
        { title: 'Ingest pipeline architecture', url: 'https://wiki.example.com/pages/101' },
        { title: 'Runbook: ' + text, url: 'https://wiki.example.com/pages/102' },
      ];
    },
  };
}

const SAMPLE_TASKS = [
  { fields: { title: 'Reduce ingest latency below 200 ms', status: 'doing', order: 10, jira: 'DEMO-7' },
    body: 'Customers see slow dashboards after peak hours.\n\nDone when: p95 ingest latency is under 200 ms for a full week.' },
  { fields: { title: 'Write the Q4 roadmap', status: 'next', order: 20 }, body: 'Three themes, one page each.' },
  { fields: { title: 'Rotate the signing keys quarterly', status: 'backlog', order: 30, jira: 'DEMO-9' }, body: '' },
  { fields: { title: 'Fix the flaky nightly build', status: 'done', order: 40, spent: 2, blocks: 2 }, body: '' },
];

const SAMPLE_SUBTASKS = [
  { title: 'Read the profiler traces from last week', phase: 'research', blocks: 1, spent: 1, status: 'done', order: 10 },
  { title: 'List where the time goes and pick the top two hotspots', phase: 'research', blocks: 1, status: 'doing', order: 20 },
  { title: 'Sketch batching versus streaming for the hot path', phase: 'design', blocks: 1, order: 30 },
  { title: 'Implement the chosen approach behind a flag', phase: 'implement', blocks: 3, order: 40 },
  { title: 'Load test against last month\'s peak', phase: 'verify', blocks: 1, order: 50 },
];

function seed(store) {
  if (store.list().length) return;
  const created = SAMPLE_TASKS.map((t) => store.create(t.fields, t.body));
  for (const s of SAMPLE_SUBTASKS) store.create(Object.assign({ parent: created[0].id }, s), 'Part of: ' + created[0].title);
}

module.exports = { jira, github, confluence, seed };
