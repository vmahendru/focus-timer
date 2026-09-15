(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var STATUS_NAMES = { backlog: 'Backlog', next: 'Next', doing: 'Doing', done: 'Done' };
  var PHASE_NAMES = { research: 'Research', design: 'Design', implement: 'Implement', verify: 'Verify' };

  var tasks = [];
  var byId = {};
  var nextUp = { task: null, queue: [], plan: [] };
  var health = null;
  var current = null;

  // Keep the timer's colour scheme.
  try {
    var theme = JSON.parse(localStorage.getItem('focus.theme') || '"spirit"');
    document.body.dataset.theme = theme;
  } catch (e) { /* default */ }

  // ----- api -----

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
        if (!res.ok) throw new Error((data && data.error) || res.statusText);
        return data;
      });
    });
  }

  function say(text) {
    $('#status-line').textContent = text || '';
    if (text) setTimeout(function () { if ($('#status-line').textContent === text) $('#status-line').textContent = ''; }, 6000);
  }

  function fail(err) { say(err.message || String(err)); }

  function load() {
    return Promise.all([api('GET', '/api/tasks'), api('GET', '/api/next')]).then(function (r) {
      tasks = r[0].tasks;
      byId = {};
      tasks.forEach(function (t) { byId[t.id] = t; });
      nextUp = r[1];
      render();
      if (current && byId[current]) fillDrawer(byId[current]);
    }).catch(fail);
  }

  // ----- render -----

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function childrenOf(id) { return tasks.filter(function (t) { return t.parent === id; }); }

  function render() {
    renderNext();
    document.querySelectorAll('.column').forEach(function (col) {
      var status = col.dataset.status;
      var cards = col.querySelector('.cards');
      cards.innerHTML = '';
      var top = tasks.filter(function (t) { return !t.parent && t.status === status; });
      col.querySelector('h2').innerHTML = '';
      col.querySelector('h2').appendChild(document.createTextNode(STATUS_NAMES[status]));
      col.querySelector('h2').appendChild(el('span', 'count', String(top.length)));
      top.forEach(function (t) { cards.appendChild(card(t)); });
    });
  }

  function card(t) {
    var kids = childrenOf(t.id);
    var done = kids.filter(function (k) { return k.status === 'done'; }).length;
    var c = el('article', 'card');
    c.draggable = true;
    c.dataset.id = t.id;
    if (nextUp.task && (nextUp.task.id === t.id || nextUp.task.parent === t.id)) c.classList.add('is-next');
    c.appendChild(el('p', 't', t.title));
    var m = el('div', 'm');
    if (t.jira) m.appendChild(el('span', 'key', t.jira));
    if (t.github) m.appendChild(el('span', 'key', t.github));
    if (kids.length) m.appendChild(el('span', '', done + ' of ' + kids.length + ' steps'));
    var total = kids.length ? kids.reduce(function (s, k) { return s + (k.blocks || 0); }, 0) : t.blocks;
    var spent = kids.length ? kids.reduce(function (s, k) { return s + (k.spent || 0); }, 0) : t.spent;
    if (total) m.appendChild(el('span', '', spent + ' of ' + total + ' blocks'));
    c.appendChild(m);
    if (total) {
      var track = el('div', 'bar-track');
      var fill = el('div', 'bar-fill');
      fill.style.width = Math.min(100, Math.round(100 * spent / total)) + '%';
      track.appendChild(fill);
      c.appendChild(track);
    }
    c.addEventListener('click', function () { openTask(t.id); });
    c.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', t.id);
      e.dataTransfer.effectAllowed = 'move';
      c.classList.add('dragging');
    });
    c.addEventListener('dragend', function () { c.classList.remove('dragging'); });
    return c;
  }

  function renderNext() {
    var t = nextUp.task;
    $('#next-title').textContent = t ? t.title : 'Nothing queued. Add a task or move one to Next.';
    $('#next-parent').textContent = t && t.parentTitle ? 'Part of ' + t.parentTitle : '';
    $('#next-done').hidden = !t;
    var plan = $('#plan');
    plan.innerHTML = '';
    if (!nextUp.plan.length) {
      plan.appendChild(el('li', 'empty', 'Today\'s plan appears here once there is work queued.'));
      return;
    }
    nextUp.plan.forEach(function (p, i) {
      var li = el('li');
      li.appendChild(el('span', 'n', String(i + 1)));
      li.appendChild(el('span', '', p.task.title));
      li.appendChild(el('span', 'b', p.blocks + (p.blocks === 1 ? ' block' : ' blocks')));
      plan.appendChild(li);
    });
  }

  // ----- drag and drop between lanes -----

  document.querySelectorAll('.column').forEach(function (col) {
    col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', function () { col.classList.remove('over'); });
    col.addEventListener('drop', function (e) {
      e.preventDefault();
      col.classList.remove('over');
      var id = e.dataTransfer.getData('text/plain');
      if (!id || !byId[id]) return;
      var status = col.dataset.status;
      var after = e.target.closest('.card');
      var siblings = tasks.filter(function (t) { return !t.parent && t.status === status && t.id !== id; });
      var index = after ? siblings.findIndex(function (t) { return t.id === after.dataset.id; }) : siblings.length;
      if (index < 0) index = siblings.length;
      siblings.splice(index, 0, byId[id]);
      var updates = siblings.map(function (t, i) {
        var patch = { order: (i + 1) * 10 };
        if (t.id === id) patch.status = status;
        return api('PATCH', '/api/tasks/' + t.id, patch);
      });
      Promise.all(updates).then(load).catch(fail);
    });
  });

  // ----- drawers -----

  function openDrawer(id) {
    document.querySelectorAll('.drawer').forEach(function (d) { d.hidden = d.id !== id; });
    $('#drawer-backdrop').hidden = false;
  }

  function closeDrawers() {
    document.querySelectorAll('.drawer').forEach(function (d) { d.hidden = true; });
    $('#drawer-backdrop').hidden = true;
    current = null;
  }

  $('#drawer-backdrop').addEventListener('click', closeDrawers);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDrawers();
    var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (!typing && e.key === 'n') { e.preventDefault(); newTask(); }
  });

  // ----- task drawer -----

  var form = $('#task-form');

  function openTask(id) {
    current = id;
    fillDrawer(byId[id]);
    openDrawer('drawer');
    $('#drawer').scrollTop = 0;
    fitTitle();
  }

  function newTask(parent) {
    current = null;
    fillDrawer({ id: '', title: '', status: 'next', phase: '', blocks: 1, spent: 0, body: '', links: [], parent: parent || '', jira: '', github: '' });
    openDrawer('drawer');
    fitTitle();
    form.title.focus();
  }

  function fillDrawer(t) {
    form.id.value = t.id;
    form.title.value = t.title;
    form.status.value = t.status;
    form.phase.value = t.phase || '';
    form.blocks.value = t.blocks;
    form.spent.value = t.spent;
    form.body.value = t.body || '';
    form.dataset.parent = t.parent || '';
    fitTitle();
    var crumb = $('#task-crumb');
    crumb.innerHTML = '';
    if (t.parent && byId[t.parent]) {
      crumb.appendChild(document.createTextNode('Part of '));
      var b = el('button', 'st', byId[t.parent].title);
      b.type = 'button';
      b.addEventListener('click', function () { openTask(t.parent); });
      crumb.appendChild(b);
    } else {
      crumb.textContent = t.id ? t.id : 'New task';
    }

    var refs = $('#task-refs');
    refs.innerHTML = '';
    if (t.jira) { var j = el('a', '', t.jira); j.href = t.links.find(function (l) { return /\/browse\//.test(l); }) || '#'; j.target = '_blank'; j.rel = 'noopener'; refs.appendChild(j); }
    if (t.github) { var g = el('a', '', t.github); g.href = t.links.find(function (l) { return /github/.test(l); }) || '#'; g.target = '_blank'; g.rel = 'noopener'; refs.appendChild(g); }

    var list = $('#subtask-list');
    list.innerHTML = '';
    var kids = t.id ? childrenOf(t.id) : [];
    $('#subtask-count').textContent = kids.length ? kids.filter(function (k) { return k.status === 'done'; }).length + ' of ' + kids.length + ' done' : '';
    kids.forEach(function (k) {
      var li = el('li', k.status === 'done' ? 'done' : '');
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = k.status === 'done';
      box.addEventListener('change', function () {
        api('PATCH', '/api/tasks/' + k.id, { status: box.checked ? 'done' : 'backlog' }).then(load).catch(fail);
      });
      li.appendChild(box);
      var open = el('button', 'st', k.title);
      open.type = 'button';
      open.addEventListener('click', function () { openTask(k.id); });
      li.appendChild(open);
      li.appendChild(el('span', 'ph', (PHASE_NAMES[k.phase] || '') + (k.blocks ? ' · ' + k.spent + '/' + k.blocks : '')));
      list.appendChild(li);
    });
    $('#subtasks-section').hidden = !!t.parent;

    var links = $('#link-list');
    links.innerHTML = '';
    (t.links || []).forEach(function (url, i) {
      var li = el('li');
      var a = el('a', '', url.replace(/^https?:\/\//, ''));
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      li.appendChild(a);
      var rm = el('button', '', 'remove');
      rm.type = 'button';
      rm.addEventListener('click', function () {
        var next = t.links.slice(); next.splice(i, 1);
        api('PATCH', '/api/tasks/' + t.id, { links: next }).then(load).catch(fail);
      });
      li.appendChild(rm);
      links.appendChild(li);
    });
    $('#links-section').hidden = !t.id;
    $('#page-results').hidden = true;
    $('#push-jira').hidden = !t.id;
    $('#push-jira').textContent = t.jira ? 'Push new subtasks to Jira' : 'Push to Jira';
    $('#delete-task').hidden = !t.id;
    $('#decompose').disabled = !t.id;
    $('#copy-prompt').disabled = !t.id;
  }

  function fitTitle() {
    form.title.style.height = 'auto';
    form.title.style.height = form.title.scrollHeight + 'px';
  }

  form.title.addEventListener('input', fitTitle);
  form.title.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); form.requestSubmit(); } });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fields = {
      title: form.title.value.trim(),
      status: form.status.value,
      phase: form.phase.value,
      blocks: Number(form.blocks.value) || 0,
      spent: Number(form.spent.value) || 0,
      body: form.body.value,
      parent: form.dataset.parent || ''
    };
    if (!fields.title) return;
    var req = form.id.value ? api('PATCH', '/api/tasks/' + form.id.value, fields) : api('POST', '/api/tasks', fields);
    req.then(function (t) {
      say(form.id.value ? 'Saved.' : 'Added ' + t.id + '.');
      if (!form.id.value) closeDrawers();
      return load();
    }).catch(fail);
  });

  $('#new-task').addEventListener('click', function () { newTask(); });
  $('#close-drawer').addEventListener('click', closeDrawers);
  $('#delete-task').addEventListener('click', function () {
    var id = form.id.value;
    if (!id || !confirm('Delete this task' + (childrenOf(id).length ? ' and its subtasks' : '') + '?')) return;
    api('DELETE', '/api/tasks/' + id).then(function () { closeDrawers(); say('Deleted.'); return load(); }).catch(fail);
  });

  $('#add-link').addEventListener('click', function () {
    var url = $('#new-link').value.trim();
    var t = byId[form.id.value];
    if (!url || !t) return;
    api('PATCH', '/api/tasks/' + t.id, { links: t.links.concat(url) }).then(function () { $('#new-link').value = ''; return load(); }).catch(fail);
  });

  $('#find-page').addEventListener('click', function () {
    var t = byId[form.id.value];
    if (!t) return;
    var q = $('#new-link').value.trim() || t.title;
    api('GET', '/api/confluence/search?q=' + encodeURIComponent(q)).then(function (r) {
      var ul = $('#page-results');
      ul.innerHTML = '';
      ul.hidden = false;
      if (!r.pages.length) ul.appendChild(el('li', '', 'No pages found for "' + q + '".'));
      r.pages.forEach(function (p) {
        var li = el('li');
        var b = el('button', 'st', 'Attach: ' + p.title);
        b.type = 'button';
        b.addEventListener('click', function () {
          api('PATCH', '/api/tasks/' + t.id, { links: t.links.concat(p.url) }).then(load).catch(fail);
        });
        li.appendChild(b);
        ul.appendChild(li);
      });
    }).catch(fail);
  });

  $('#push-jira').addEventListener('click', function () {
    var id = form.id.value;
    if (!id) return;
    var withChildren = childrenOf(id).length > 0;
    say('Pushing to Jira...');
    api('POST', '/api/jira/push/' + id, { withChildren: withChildren }).then(function (r) {
      say('In Jira as ' + r.tasks.map(function (t) { return t.jira; }).join(', ') + '.');
      return load();
    }).catch(fail);
  });

  $('#copy-prompt').addEventListener('click', function () {
    var id = form.id.value;
    fetch('/api/tasks/' + id + '/prompt').then(function (r) { return r.text(); }).then(function (text) {
      return navigator.clipboard.writeText(text).then(function () { say('Prompt copied. Paste it into your agent.'); });
    }).catch(fail);
  });

  // ----- decompose -----

  var proposal = [];

  function loadProposal() {
    var phases = Array.prototype.map.call(document.querySelectorAll('#phase-picks input:checked'), function (i) { return i.value; });
    return api('GET', '/api/tasks/' + form.id.value + '/decompose?phases=' + phases.join(',')).then(function (r) {
      proposal = r.subtasks;
      var ol = $('#proposal');
      ol.innerHTML = '';
      proposal.forEach(function (s, i) {
        var li = el('li');
        li.appendChild(el('span', 'ph', PHASE_NAMES[s.phase] || ''));
        var title = document.createElement('input');
        title.type = 'text'; title.value = s.title;
        title.addEventListener('input', function () { proposal[i].title = title.value; });
        li.appendChild(title);
        var blocks = document.createElement('input');
        blocks.type = 'number'; blocks.min = 1; blocks.max = 8; blocks.value = s.blocks;
        blocks.addEventListener('input', function () { proposal[i].blocks = Number(blocks.value) || 1; });
        li.appendChild(blocks);
        ol.appendChild(li);
      });
    }).catch(fail);
  }

  $('#decompose').addEventListener('click', function () {
    if (!form.id.value) return;
    loadProposal().then(function () { openDrawer('decompose-drawer'); });
  });
  document.querySelectorAll('#phase-picks input').forEach(function (i) { i.addEventListener('change', loadProposal); });
  $('#cancel-decompose').addEventListener('click', function () { openDrawer('drawer'); });
  $('#create-subtasks').addEventListener('click', function () {
    var subs = proposal.filter(function (s) { return s.title.trim(); });
    api('POST', '/api/tasks/' + form.id.value + '/decompose', { subtasks: subs }).then(function (r) {
      say('Created ' + r.subtasks.length + ' subtasks.');
      current = form.id.value;
      return load().then(function () { openDrawer('drawer'); });
    }).catch(fail);
  });

  // ----- import from Jira / GitHub -----

  var importItems = [];
  var importKind = 'jira';

  function renderImport(items, label) {
    importItems = items;
    var ul = $('#import-results');
    ul.innerHTML = '';
    if (!items.length) ul.appendChild(el('li', '', 'Nothing to import.'));
    items.forEach(function (it, i) {
      var li = el('li');
      var box = document.createElement('input');
      box.type = 'checkbox'; box.checked = !it.exists; box.disabled = !!it.exists; box.dataset.i = i;
      li.appendChild(box);
      var text = el('span', '', it.title);
      text.appendChild(el('span', 'sub', label(it) + (it.exists ? ' · already on the board' : '')));
      li.appendChild(text);
      ul.appendChild(li);
    });
  }

  $('#import-jira').addEventListener('click', function () {
    importKind = 'jira';
    $('#import-title').textContent = 'Import from Jira';
    $('#jql-row').hidden = false;
    openDrawer('import-drawer');
    api('GET', '/api/config').then(function (c) { $('#jql').value = c.jira.jql; runJql(); }).catch(fail);
  });

  function runJql() {
    say('Searching Jira...');
    api('GET', '/api/jira/search?jql=' + encodeURIComponent($('#jql').value)).then(function (r) {
      say('');
      var known = {};
      tasks.forEach(function (t) { if (t.jira) known[t.jira] = true; });
      renderImport(r.issues.map(function (i) { return Object.assign(i, { exists: !!known[i.key] }); }), function (i) { return i.key + ' · ' + i.status; });
    }).catch(fail);
  }

  $('#run-jql').addEventListener('click', runJql);
  $('#jql').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); runJql(); } });

  $('#github-inbox').addEventListener('click', function () {
    importKind = 'github';
    $('#import-title').textContent = 'GitHub inbox';
    $('#jql-row').hidden = true;
    openDrawer('import-drawer');
    say('Asking GitHub...');
    api('GET', '/api/github/inbox').then(function (r) {
      say('');
      var known = {};
      tasks.forEach(function (t) { if (t.github) known[t.github] = true; });
      var items = r.reviews.concat(r.assigned).map(function (i) { return Object.assign(i, { exists: !!known[i.ref] }); });
      renderImport(items, function (i) { return i.ref + (i.kind === 'pr' ? ' · review requested' : ' · assigned'); });
    }).catch(fail);
  });

  $('#import-selected').addEventListener('click', function () {
    var picked = Array.prototype.map.call(document.querySelectorAll('#import-results input:checked'), function (b) { return importItems[Number(b.dataset.i)]; });
    if (!picked.length) return;
    var req = importKind === 'jira' ? api('POST', '/api/jira/import', { issues: picked }) : api('POST', '/api/github/import', { items: picked });
    req.then(function (r) { say('Added ' + r.tasks.length + '.'); closeDrawers(); return load(); }).catch(fail);
  });
  $('#cancel-import').addEventListener('click', closeDrawers);

  // ----- next up actions -----

  $('#next-done').addEventListener('click', function () {
    if (!nextUp.task) return;
    api('POST', '/api/tasks/' + nextUp.task.id + '/done').then(function () { say('Done. Next one is up.'); return load(); }).catch(fail);
  });

  // ----- settings -----

  var settings = $('#settings-form');

  function openSettings() {
    api('GET', '/api/config').then(function (c) {
      settings.blocksPerDay.value = c.blocksPerDay;
      ['jira', 'github', 'confluence'].forEach(function (k) {
        Object.keys(c[k]).forEach(function (f) {
          var input = settings.elements[k + '.' + f];
          if (input && f !== 'token' && f !== 'hasToken') input.value = c[k][f];
        });
        var hint = settings.querySelector('[data-has="' + k + '"]');
        if (hint) hint.textContent = c[k].hasToken ? 'A token is saved.' : 'No token saved.';
      });
      $('#workspace-path').textContent = health ? health.workspace + '/config.json' : 'config.json';
      openDrawer('settings-drawer');
    }).catch(fail);
  }

  settings.addEventListener('submit', function (e) {
    e.preventDefault();
    var body = { blocksPerDay: Number(settings.blocksPerDay.value), jira: {}, github: {}, confluence: {} };
    Array.prototype.forEach.call(settings.elements, function (input) {
      var m = /^(jira|github|confluence)\.(\w+)$/.exec(input.name || '');
      if (m) body[m[1]][m[2]] = input.value.trim();
    });
    api('PUT', '/api/config', body).then(function () {
      say('Connections saved.');
      closeDrawers();
      return refreshHealth().then(load);
    }).catch(fail);
  });

  $('#open-settings').addEventListener('click', openSettings);
  $('#close-settings').addEventListener('click', closeDrawers);

  function refreshHealth() {
    return api('GET', '/api/health').then(function (h) {
      health = h;
      document.querySelectorAll('[data-needs]').forEach(function (b) {
        b.disabled = !h.integrations[b.dataset.needs];
        b.title = h.integrations[b.dataset.needs] ? '' : 'Set this up under Connections';
      });
      if (h.demo) say('Demo workspace with fake Jira, GitHub and Confluence. Nothing here is real.');
    }).catch(function () {
      say('The companion is not running. Start it with: node focus.js');
    });
  }

  // ----- live updates -----

  try {
    var events = new EventSource('/api/events');
    events.addEventListener('change', load);
  } catch (e) { /* no live updates */ }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(); });

  refreshHealth().then(load);
})();
