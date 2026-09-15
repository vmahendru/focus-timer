#!/usr/bin/env node
'use strict';
// The companion: serves the app and a small JSON API over a local workspace
// of task files, and talks to Jira, GitHub and Confluence on your behalf.
// Node standard library only. Listens on localhost only.
//
//   node focus.js                      workspace at ~/Focus
//   node focus.js --workspace ~/work   somewhere else
//   node focus.js --demo               temporary workspace, fake integrations
//   node focus.js --port 9000
//
// Tokens come from <workspace>/config.json (written with owner-only
// permissions) or from FOCUS_JIRA_TOKEN, FOCUS_GITHUB_TOKEN and
// FOCUS_CONFLUENCE_TOKEN in the environment. Nothing leaves the machine
// except the calls you trigger to those three services.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TaskStore, STATUSES, PHASES } = require('./lib/tasks');
const scheduler = require('./lib/scheduler');
const decompose = require('./lib/decompose');
const integrations = require('./lib/integrations');
const demo = require('./lib/demo');

const APP_VERSION = '8';
const ROOT = __dirname;

// ---------- arguments ----------

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : (args[i + 1] || true); };
const DEMO = args.includes('--demo');
const PORT = Number(flag('--port')) || 8080;
const WORKSPACE = DEMO
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'focus-demo-'))
  : path.resolve(String(flag('--workspace') || process.env.FOCUS_WORKSPACE || path.join(os.homedir(), 'Focus')));

fs.mkdirSync(WORKSPACE, { recursive: true });
const store = new TaskStore(path.join(WORKSPACE, 'tasks'));
if (DEMO) demo.seed(store);

// ---------- config ----------

const CONFIG_FILE = path.join(WORKSPACE, 'config.json');
const DEFAULT_CONFIG = {
  blocksPerDay: 8,
  jira: { kind: 'dc', baseUrl: '', email: '', token: '', project: '', issueType: 'Task', subtaskType: 'Sub-task', jql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC' },
  github: { baseUrl: 'https://api.github.com', token: '' },
  confluence: { kind: 'dc', baseUrl: '', email: '', token: '' },
};

function readConfig() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { /* first run */ }
  const cfg = {
    blocksPerDay: saved.blocksPerDay || DEFAULT_CONFIG.blocksPerDay,
    jira: Object.assign({}, DEFAULT_CONFIG.jira, saved.jira),
    github: Object.assign({}, DEFAULT_CONFIG.github, saved.github),
    confluence: Object.assign({}, DEFAULT_CONFIG.confluence, saved.confluence),
  };
  if (process.env.FOCUS_JIRA_TOKEN) cfg.jira.token = process.env.FOCUS_JIRA_TOKEN;
  if (process.env.FOCUS_GITHUB_TOKEN) cfg.github.token = process.env.FOCUS_GITHUB_TOKEN;
  if (process.env.FOCUS_CONFLUENCE_TOKEN) cfg.confluence.token = process.env.FOCUS_CONFLUENCE_TOKEN;
  return cfg;
}

function writeConfig(next) {
  const current = readConfig();
  const merged = {
    blocksPerDay: Number(next.blocksPerDay) || current.blocksPerDay,
    jira: Object.assign({}, current.jira, next.jira || {}),
    github: Object.assign({}, current.github, next.github || {}),
    confluence: Object.assign({}, current.confluence, next.confluence || {}),
  };
  // A blank token in the form means "keep what I had".
  for (const k of ['jira', 'github', 'confluence']) if (!merged[k].token) merged[k].token = current[k].token;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(CONFIG_FILE, 0o600); } catch (e) { /* windows */ }
  return merged;
}

function publicConfig(cfg) {
  const mask = (c) => Object.assign({}, c, { token: '', hasToken: !!c.token });
  return { blocksPerDay: cfg.blocksPerDay, jira: mask(cfg.jira), github: mask(cfg.github), confluence: mask(cfg.confluence) };
}

function clients() {
  const cfg = readConfig();
  if (DEMO) return { cfg, jira: demo.jira(), github: demo.github(), confluence: demo.confluence() };
  return {
    cfg,
    jira: cfg.jira.baseUrl && cfg.jira.token ? integrations.jira(cfg.jira, fetch) : null,
    github: cfg.github.token ? integrations.github(cfg.github, fetch) : null,
    confluence: cfg.confluence.baseUrl && cfg.confluence.token ? integrations.confluence(cfg.confluence, fetch) : null,
  };
}

// ---------- helpers ----------

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) reject(new HttpError(413, 'too large')); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new HttpError(400, 'bad json')); }
    });
  });
}

function pickTaskFields(input) {
  const out = {};
  for (const k of ['title', 'status', 'parent', 'phase', 'blocks', 'spent', 'order', 'jira', 'github', 'links']) {
    if (k in input) out[k] = input[k];
  }
  if (out.status && !STATUSES.includes(out.status)) throw new HttpError(400, 'bad status');
  if (out.phase && !PHASES.includes(out.phase)) throw new HttpError(400, 'bad phase');
  return out;
}

function nextUp() {
  const tasks = store.list();
  const map = new Map(tasks.map((t) => [t.id, t]));
  const q = scheduler.queue(tasks);
  const withParent = (t) => t ? Object.assign({}, t, { parentTitle: t.parent && map.get(t.parent) ? map.get(t.parent).title : '' }) : null;
  return {
    task: withParent(q[0] || null),
    queue: q.slice(0, 12).map(withParent),
    plan: scheduler.plan(tasks, readConfig().blocksPerDay).map((p) => ({ task: withParent(p.task), blocks: p.blocks })),
  };
}

function renderPrompt(name, task) {
  const text = fs.readFileSync(path.join(ROOT, 'agent', name + '.md'), 'utf8');
  const children = task ? store.children(task.id) : [];
  const file = task ? path.join(store.dir, task.id + '.md') : '';
  return text
    .replace(/\{\{workspace\}\}/g, WORKSPACE)
    .replace(/\{\{tasks_dir\}\}/g, store.dir)
    .replace(/\{\{task_file\}\}/g, file)
    .replace(/\{\{task_id\}\}/g, task ? task.id : '')
    .replace(/\{\{task_title\}\}/g, task ? task.title : '')
    .replace(/\{\{task_body\}\}/g, task ? task.body : '')
    .replace(/\{\{next_id\}\}/g, store.nextId())
    .replace(/\{\{existing_subtasks\}\}/g, children.length ? children.map((c) => '- ' + c.id + ' [' + c.status + '] ' + c.title).join('\n') : '(none yet)');
}

// ---------- API ----------

const listeners = new Set();
store.watch(() => { for (const res of listeners) res.write('event: change\ndata: {}\n\n'); });

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const m = req.method;
  const [head, id, action] = parts;

  if (head === 'health') {
    const c = clients();
    return json(res, 200, { ok: true, version: APP_VERSION, workspace: WORKSPACE, demo: DEMO,
      integrations: { jira: !!c.jira, github: !!c.github, confluence: !!c.confluence } });
  }

  if (head === 'events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('event: hello\ndata: {}\n\n');
    listeners.add(res);
    req.on('close', () => listeners.delete(res));
    return;
  }

  if (head === 'config') {
    if (m === 'GET') return json(res, 200, publicConfig(readConfig()));
    if (m === 'PUT') return json(res, 200, publicConfig(writeConfig(await readBody(req))));
  }

  if (head === 'next' && m === 'GET') return json(res, 200, nextUp());

  if (head === 'tasks') {
    if (!id && m === 'GET') return json(res, 200, { tasks: store.list() });
    if (!id && m === 'POST') {
      const input = await readBody(req);
      if (!input.title || !String(input.title).trim()) throw new HttpError(400, 'title required');
      return json(res, 201, store.create(pickTaskFields(input), input.body || ''));
    }
    if (id && !store.get(id)) throw new HttpError(404, 'no such task');
    if (id && !action) {
      if (m === 'GET') return json(res, 200, Object.assign(store.get(id), { children: store.children(id) }));
      if (m === 'PATCH') {
        const input = await readBody(req);
        return json(res, 200, store.update(id, pickTaskFields(input), 'body' in input ? String(input.body) : undefined));
      }
      if (m === 'DELETE') { store.remove(id); return json(res, 200, { ok: true }); }
    }
    if (id && action === 'done' && m === 'POST') return json(res, 200, store.update(id, { status: 'done' }));
    if (id && action === 'block' && m === 'POST') {
      const t = store.get(id);
      return json(res, 200, store.update(id, { spent: (t.spent || 0) + 1, status: t.status === 'done' ? 'done' : 'doing' }));
    }
    if (id && action === 'decompose') {
      const task = store.get(id);
      if (m === 'GET') {
        const phases = (url.searchParams.get('phases') || '').split(',').filter(Boolean);
        return json(res, 200, { subtasks: decompose.template(task, phases) });
      }
      if (m === 'POST') {
        const input = await readBody(req);
        const proposed = Array.isArray(input.subtasks) && input.subtasks.length ? input.subtasks : decompose.template(task, input.phases || []);
        const created = proposed.map((s) => store.create(Object.assign(pickTaskFields(s), { parent: id, status: s.status || 'backlog' }), s.body || ''));
        return json(res, 201, { subtasks: created });
      }
    }
    if (id && action === 'prompt' && m === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(renderPrompt('decompose', store.get(id)));
    }
  }

  if (head === 'jira') {
    const { jira, cfg } = clients();
    if (!jira) throw new HttpError(412, 'Jira is not configured');
    if (id === 'search' && m === 'GET') {
      return json(res, 200, { issues: await jira.search(url.searchParams.get('jql') || cfg.jira.jql, 50) });
    }
    if (id === 'import' && m === 'POST') {
      const input = await readBody(req);
      const existing = new Set(store.list().map((t) => t.jira).filter(Boolean));
      const created = [];
      for (const issue of input.issues || []) {
        if (!issue.key || existing.has(issue.key)) continue;
        created.push(store.create({ title: issue.title, status: 'backlog', jira: issue.key, links: issue.url ? [issue.url] : [] }, issue.body || ''));
      }
      return json(res, 201, { tasks: created });
    }
    if (id === 'push' && action && m === 'POST') {
      const task = store.get(action);
      if (!task) throw new HttpError(404, 'no such task');
      const input = await readBody(req);
      const parent = task.parent ? store.get(task.parent) : null;
      let key = task.jira;
      if (!key) {
        key = await jira.createIssue(task, parent && parent.jira ? parent.jira : null);
        store.update(task.id, { jira: key, links: task.links.concat(jira.url(key)) });
      }
      const pushed = [store.get(task.id)];
      if (input.withChildren) {
        for (const child of store.children(task.id)) {
          if (child.jira) continue;
          const childKey = await jira.createIssue(child, key);
          pushed.push(store.update(child.id, { jira: childKey, links: child.links.concat(jira.url(childKey)) }));
        }
      }
      return json(res, 200, { tasks: pushed });
    }
    if (id === 'transitions' && action && m === 'GET') return json(res, 200, { transitions: await jira.transitions(action) });
    if (id === 'transition' && action && m === 'POST') {
      const input = await readBody(req);
      await jira.transition(action, input.id);
      return json(res, 200, { ok: true });
    }
  }

  if (head === 'github') {
    const { github } = clients();
    if (!github) throw new HttpError(412, 'GitHub is not configured');
    if (id === 'inbox' && m === 'GET') {
      const [assigned, reviews] = await Promise.all([github.assigned(), github.reviewRequests()]);
      return json(res, 200, { assigned, reviews });
    }
    if (id === 'import' && m === 'POST') {
      const input = await readBody(req);
      const existing = new Set(store.list().map((t) => t.github).filter(Boolean));
      const created = [];
      for (const item of input.items || []) {
        if (!item.ref || existing.has(item.ref)) continue;
        const title = (item.kind === 'pr' ? 'Review: ' : '') + item.title;
        created.push(store.create({ title, status: 'next', github: item.ref, blocks: item.kind === 'pr' ? 1 : 2, links: item.url ? [item.url] : [] }, item.body || ''));
      }
      return json(res, 201, { tasks: created });
    }
  }

  if (head === 'confluence') {
    const { confluence } = clients();
    if (!confluence) throw new HttpError(412, 'Confluence is not configured');
    if (id === 'search' && m === 'GET') return json(res, 200, { pages: await confluence.search(url.searchParams.get('q') || '', 10) });
  }

  throw new HttpError(404, 'not found');
}

// ---------- static ----------

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };

function serveStatic(res, pathname) {
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT) || /(^|\/)(lib|test|tools|node_modules|\.git)(\/|$)/.test(rel) || rel.endsWith('focus.js') || rel.endsWith('serve.js')) {
    res.writeHead(404); return res.end('Not found');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// ---------- server ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    try {
      await api(req, res, url);
    } catch (e) {
      const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
      json(res, status, { error: e.message || 'error' });
    }
    return;
  }
  serveStatic(res, url.pathname);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Focus is running at http://127.0.0.1:' + PORT + '/');
  console.log('Board:             http://127.0.0.1:' + PORT + '/board.html');
  console.log('Workspace:         ' + WORKSPACE + (DEMO ? '  (demo, temporary)' : ''));
});

module.exports = { server, store };
