const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TaskStore, parse, serialize } = require('../lib/tasks');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'focus-tasks-'));
}

test('parse and serialize round-trip a task file', () => {
  const text = serialize({ id: 'T-0001', title: 'Ship it', status: 'next', parent: '', phase: '', blocks: 2, spent: 0, order: 10, jira: 'X-1', github: '', links: ['https://a', 'https://b'], created: 'c', updated: 'u' }, 'Body here.\n\nDone when: shipped.');
  const { fields, body } = parse(text);
  assert.equal(fields.title, 'Ship it');
  assert.equal(fields.blocks, 2);
  assert.equal(fields.parent, '');
  assert.deepEqual(fields.links, ['https://a', 'https://b']);
  assert.equal(body, 'Body here.\n\nDone when: shipped.');
  assert.equal(serialize(fields, body), text);
});

test('a file with no frontmatter is just a body', () => {
  const { fields, body } = parse('hello');
  assert.deepEqual(fields, {});
  assert.equal(body, 'hello');
});

test('create assigns sequential ids and writes a readable file', () => {
  const store = new TaskStore(tmp());
  const a = store.create({ title: 'First' }, 'notes');
  const b = store.create({ title: 'Second', status: 'doing' });
  assert.equal(a.id, 'T-0001');
  assert.equal(b.id, 'T-0002');
  assert.equal(b.status, 'doing');
  const raw = fs.readFileSync(path.join(store.dir, 'T-0001.md'), 'utf8');
  assert.match(raw, /^---\nid: T-0001\ntitle: First\nstatus: backlog\n/);
  assert.match(raw, /\nnotes\n$/);
});

test('unknown statuses and phases fall back safely', () => {
  const store = new TaskStore(tmp());
  const t = store.create({ title: 'Odd', status: 'weird', phase: 'nope', blocks: 'x' });
  assert.equal(t.status, 'backlog');
  assert.equal(t.phase, '');
  assert.equal(t.blocks, 0);
});

test('update patches fields, keeps the body unless given, and bumps updated', () => {
  const store = new TaskStore(tmp());
  const t = store.create({ title: 'Edit me', updated: '2000-01-01T00:00:00.000Z' }, 'keep this');
  const u = store.update(t.id, { status: 'done', spent: 3 });
  assert.equal(u.status, 'done');
  assert.equal(u.spent, 3);
  assert.equal(u.body, 'keep this');
  assert.notEqual(u.updated, '2000-01-01T00:00:00.000Z');
  const v = store.update(t.id, {}, 'new body');
  assert.equal(v.body, 'new body');
});

test('remove deletes a task and its children', () => {
  const store = new TaskStore(tmp());
  const p = store.create({ title: 'Parent' });
  store.create({ title: 'Child', parent: p.id });
  store.create({ title: 'Other' });
  store.remove(p.id);
  assert.deepEqual(store.list().map((t) => t.title), ['Other']);
});

test('files edited by hand are picked up and ids come from the filename if missing', () => {
  const store = new TaskStore(tmp());
  fs.writeFileSync(path.join(store.dir, 'T-0042.md'), '---\ntitle: Hand written\nstatus: next\n---\nby a person\n');
  const t = store.get('T-0042');
  assert.equal(t.id, 'T-0042');
  assert.equal(t.title, 'Hand written');
  assert.equal(store.nextId(), 'T-0043');
});

test('ids that could escape the folder are rejected', () => {
  const store = new TaskStore(tmp());
  assert.throws(() => store.get('../etc/passwd'));
});
