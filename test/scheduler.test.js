const test = require('node:test');
const assert = require('node:assert/strict');
const { queue, next, plan, leaves } = require('../lib/scheduler');

function t(id, fields) {
  return Object.assign({ id, title: id, status: 'backlog', parent: '', phase: '', blocks: 1, spent: 0, order: 0, created: '2026-01-01' }, fields);
}

test('a task with unfinished children is not itself a candidate', () => {
  const tasks = [t('P', { status: 'doing' }), t('C', { parent: 'P' })];
  assert.deepEqual(leaves(tasks).map((x) => x.id), ['C']);
});

test('a parent whose children are all done becomes a leaf again', () => {
  const tasks = [t('P', { status: 'doing' }), t('C', { parent: 'P', status: 'done' })];
  assert.deepEqual(leaves(tasks).map((x) => x.id), ['P']);
});

test('doing beats next beats backlog', () => {
  const tasks = [t('B', { status: 'backlog' }), t('N', { status: 'next' }), t('D', { status: 'doing' })];
  assert.deepEqual(queue(tasks).map((x) => x.id), ['D', 'N', 'B']);
});

test('subtasks inherit their parent\'s momentum', () => {
  const tasks = [t('P', { status: 'doing', order: 5 }), t('C', { parent: 'P', status: 'backlog' }), t('N', { status: 'next', order: 1 })];
  assert.equal(next(tasks).id, 'C');
});

test('within a parent, phases run research, design, implement, verify', () => {
  const tasks = [t('P', { status: 'doing' }),
    t('V', { parent: 'P', phase: 'verify' }), t('I', { parent: 'P', phase: 'implement' }),
    t('R', { parent: 'P', phase: 'research' }), t('D', { parent: 'P', phase: 'design' })];
  assert.deepEqual(queue(tasks).map((x) => x.id), ['R', 'D', 'I', 'V']);
});

test('within a phase, the smallest remaining work goes first', () => {
  const tasks = [t('P', { status: 'doing' }),
    t('big', { parent: 'P', phase: 'implement', blocks: 3 }),
    t('small', { parent: 'P', phase: 'implement', blocks: 2, spent: 1 })];
  assert.deepEqual(queue(tasks).map((x) => x.id), ['small', 'big']);
});

test('parents are ordered by their board position', () => {
  const tasks = [t('P2', { status: 'next', order: 20 }), t('C2', { parent: 'P2' }), t('P1', { status: 'next', order: 10 }), t('C1', { parent: 'P1' })];
  assert.deepEqual(queue(tasks).map((x) => x.id), ['C1', 'C2']);
});

test('done tasks never appear and an empty board has no next', () => {
  assert.equal(next([t('X', { status: 'done' })]), null);
  assert.equal(next([]), null);
});

test('plan fills the day with whole tasks and stops at the budget', () => {
  const tasks = [t('P', { status: 'doing' }), t('a', { parent: 'P', blocks: 1, phase: 'research' }),
    t('b', { parent: 'P', blocks: 2, phase: 'design' }), t('c', { parent: 'P', blocks: 3, phase: 'implement' })];
  const p = plan(tasks, 4);
  assert.deepEqual(p.map((x) => x.task.id + ':' + x.blocks), ['a:1', 'b:2']);
  assert.deepEqual(plan(tasks, 1).map((x) => x.task.id), ['a']);
});
