'use strict';
// Decides what to do next. Pure: takes the task list, returns an ordered
// queue of leaf tasks (tasks with no unfinished children).
//
// Order of preference:
//   1. tasks already in progress, then queued, then backlog, judged by the
//      more active of the task's own status and its parent's status
//   2. the parent's position on the board
//   3. phase: research, design, implement, verify
//   4. fewer remaining focus blocks first, so the queue keeps moving
//   5. explicit order, then age

const { PHASES } = require('./tasks');

const RANK = { doing: 0, next: 1, backlog: 2 };

function byId(tasks) {
  const map = new Map();
  for (const t of tasks) map.set(t.id, t);
  return map;
}

function remaining(task) {
  return Math.max(0, (task.blocks || 0) - (task.spent || 0));
}

function leaves(tasks) {
  const open = tasks.filter((t) => t.status !== 'done');
  const parentsWithOpenChildren = new Set(open.filter((t) => t.parent).map((t) => t.parent));
  return open.filter((t) => !parentsWithOpenChildren.has(t.id));
}

function queue(tasks) {
  const map = byId(tasks);
  const phaseRank = (p) => { const i = PHASES.indexOf(p); return i === -1 ? PHASES.length : i; };
  const keyed = leaves(tasks).map((t) => {
    const parent = t.parent ? map.get(t.parent) : null;
    const own = RANK[t.status] ?? 2;
    const inherited = parent ? (RANK[parent.status] ?? 2) : own;
    return {
      task: t,
      rank: Math.min(own, inherited),
      parentOrder: parent ? parent.order : t.order,
      parentCreated: parent ? parent.created : t.created,
      phase: phaseRank(t.phase),
      remaining: remaining(t) || 1,
    };
  });
  keyed.sort((a, b) =>
    a.rank - b.rank ||
    a.parentOrder - b.parentOrder ||
    String(a.parentCreated).localeCompare(String(b.parentCreated)) ||
    a.phase - b.phase ||
    a.remaining - b.remaining ||
    a.task.order - b.task.order ||
    String(a.task.created).localeCompare(String(b.task.created)) ||
    a.task.id.localeCompare(b.task.id)
  );
  return keyed.map((k) => k.task);
}

function next(tasks) {
  return queue(tasks)[0] || null;
}

// Lays the queue out into today's focus blocks.
function plan(tasks, blocksPerDay) {
  const out = [];
  let used = 0;
  for (const task of queue(tasks)) {
    const need = remaining(task) || 1;
    if (used + need > blocksPerDay && out.length) break;
    out.push({ task, blocks: need });
    used += need;
    if (used >= blocksPerDay) break;
  }
  return out;
}

module.exports = { queue, next, plan, leaves, remaining };
