'use strict';
// The task store: one Markdown file per task in <workspace>/tasks/.
//
//   ---
//   id: T-0001
//   title: Migrate the ingest pipeline
//   status: next            backlog | next | doing | done
//   parent:                 id of the parent task, blank for a top-level task
//   phase:                  research | design | implement | verify, for subtasks
//   blocks: 1               estimated focus blocks
//   spent: 0                focus blocks completed
//   order: 10               position within its column or parent
//   jira: PROJ-123
//   github: org/repo#45
//   links:
//     - https://wiki.example.com/pages/1
//   created: 2026-09-15T10:00:00.000Z
//   updated: 2026-09-15T10:00:00.000Z
//   ---
//   Notes and acceptance criteria, in Markdown.
//
// Files are the source of truth, so people and agents can edit them directly.

const fs = require('fs');
const path = require('path');

const STATUSES = ['backlog', 'next', 'doing', 'done'];
const PHASES = ['research', 'design', 'implement', 'verify'];
const LIST_KEYS = ['links'];
const NUMBER_KEYS = ['blocks', 'spent', 'order'];
const KEY_ORDER = ['id', 'title', 'status', 'parent', 'phase', 'blocks', 'spent', 'order', 'jira', 'github', 'links', 'created', 'updated'];

function parse(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { fields: {}, body: text.trim() };
  const fields = {};
  let listKey = null;
  for (const raw of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(raw);
    if (item && listKey) { fields[listKey].push(item[1].trim()); continue; }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(raw);
    if (!kv) continue;
    const [, key, value] = kv;
    if (LIST_KEYS.includes(key) && value === '') { fields[key] = []; listKey = key; continue; }
    listKey = null;
    fields[key] = NUMBER_KEYS.includes(key) && value !== '' && !isNaN(Number(value)) ? Number(value) : value;
  }
  return { fields, body: m[2].trim() };
}

function serialize(fields, body) {
  const keys = KEY_ORDER.concat(Object.keys(fields).filter((k) => !KEY_ORDER.includes(k)));
  const lines = ['---'];
  for (const key of keys) {
    if (!(key in fields)) continue;
    const value = fields[key];
    if (Array.isArray(value)) {
      lines.push(key + ':');
      for (const v of value) lines.push('  - ' + v);
    } else {
      lines.push(key + ':' + (value === '' || value === null || value === undefined ? '' : ' ' + value));
    }
  }
  lines.push('---');
  return lines.join('\n') + '\n' + (body ? body.trim() + '\n' : '');
}

function normalize(fields) {
  const t = Object.assign({
    id: '', title: '', status: 'backlog', parent: '', phase: '', blocks: 1, spent: 0, order: 0,
    jira: '', github: '', links: [], created: '', updated: ''
  }, fields);
  if (!STATUSES.includes(t.status)) t.status = 'backlog';
  if (t.phase && !PHASES.includes(t.phase)) t.phase = '';
  if (!Array.isArray(t.links)) t.links = t.links ? [String(t.links)] : [];
  t.blocks = Math.max(0, Number(t.blocks) || 0);
  t.spent = Math.max(0, Number(t.spent) || 0);
  t.order = Number(t.order) || 0;
  return t;
}

class TaskStore {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  file(id) {
    if (!/^[\w.-]+$/.test(id)) throw new Error('bad task id');
    return path.join(this.dir, id + '.md');
  }

  list() {
    const tasks = [];
    for (const name of fs.readdirSync(this.dir)) {
      if (!name.endsWith('.md')) continue;
      const text = fs.readFileSync(path.join(this.dir, name), 'utf8');
      const { fields, body } = parse(text);
      const task = normalize(fields);
      if (!task.id) task.id = name.slice(0, -3);
      task.body = body;
      tasks.push(task);
    }
    return tasks.sort((a, b) => a.order - b.order || a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
  }

  get(id) {
    const file = this.file(id);
    if (!fs.existsSync(file)) return null;
    const { fields, body } = parse(fs.readFileSync(file, 'utf8'));
    const task = normalize(fields);
    task.id = task.id || id;
    task.body = body;
    return task;
  }

  nextId() {
    let max = 0;
    for (const name of fs.readdirSync(this.dir)) {
      const m = /^T-(\d+)\.md$/.exec(name);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return 'T-' + String(max + 1).padStart(4, '0');
  }

  create(fields, body) {
    const now = new Date().toISOString();
    const task = normalize(Object.assign({ created: now, updated: now }, fields, { id: fields.id || this.nextId() }));
    if (!task.title) throw new Error('title required');
    this.write(task, body || '');
    return this.get(task.id);
  }

  update(id, patch, body) {
    const current = this.get(id);
    if (!current) throw new Error('no such task: ' + id);
    const next = normalize(Object.assign({}, current, patch, { id, updated: new Date().toISOString() }));
    this.write(next, body === undefined ? current.body : body);
    return this.get(id);
  }

  remove(id) {
    const file = this.file(id);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    for (const child of this.children(id)) this.remove(child.id);
  }

  children(id) {
    return this.list().filter((t) => t.parent === id);
  }

  write(task, body) {
    const fields = {};
    for (const key of KEY_ORDER) fields[key] = task[key];
    const tmp = this.file(task.id) + '.tmp';
    fs.writeFileSync(tmp, serialize(fields, body), 'utf8');
    fs.renameSync(tmp, this.file(task.id));
  }

  // Calls back, debounced, whenever any task file changes on disk.
  watch(callback) {
    let timer = null;
    try {
      const watcher = fs.watch(this.dir, () => {
        clearTimeout(timer);
        timer = setTimeout(callback, 150);
      });
      return () => watcher.close();
    } catch (e) {
      return () => {};
    }
  }
}

module.exports = { TaskStore, parse, serialize, normalize, STATUSES, PHASES };
