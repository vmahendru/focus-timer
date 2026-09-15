'use strict';
// Thin clients for Jira, GitHub and Confluence. Each takes a config object
// and a fetch function, so tests can stub the network and demo mode can
// swap in fakes. Nothing here stores anything; the caller decides.
//
// Jira and Confluence come in two flavours:
//   kind: "dc"     Data Center or Server. Bearer personal access token.
//   kind: "cloud"  Atlassian Cloud. Basic auth with email and API token.

function authHeaders(cfg) {
  if (cfg.kind === 'cloud') {
    return { Authorization: 'Basic ' + Buffer.from(cfg.email + ':' + cfg.token).toString('base64') };
  }
  return { Authorization: 'Bearer ' + cfg.token };
}

async function call(fetchImpl, url, options) {
  const res = await fetchImpl(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data && (data.message || (data.errorMessages || []).join('; '))) || res.statusText || 'request failed';
    const err = new Error(msg + ' (' + res.status + ')');
    err.status = res.status;
    throw err;
  }
  return data;
}

function trim(url) {
  return String(url || '').replace(/\/+$/, '');
}

// ---------- Jira ----------

function jira(cfg, fetchImpl) {
  const base = trim(cfg.baseUrl) + (cfg.kind === 'cloud' ? '/rest/api/3' : '/rest/api/2');
  const headers = Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, authHeaders(cfg));

  function description(text) {
    if (cfg.kind !== 'cloud') return text || '';
    // Cloud wants Atlassian Document Format.
    return { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: text || ' ' }] }] };
  }

  return {
    async me() {
      return call(fetchImpl, base + '/myself', { headers });
    },

    // Creates an issue for a task. A task with a parent that is already in
    // Jira becomes a sub-task of that issue.
    async createIssue(task, parentKey) {
      const fields = {
        project: { key: cfg.project },
        summary: task.title,
        description: description(task.body),
        issuetype: { name: parentKey ? (cfg.subtaskType || 'Sub-task') : (cfg.issueType || 'Task') },
      };
      if (parentKey) fields.parent = { key: parentKey };
      const data = await call(fetchImpl, base + '/issue', { method: 'POST', headers, body: JSON.stringify({ fields }) });
      return data.key;
    },

    async search(jql, max) {
      const url = base + '/search?jql=' + encodeURIComponent(jql) + '&maxResults=' + (max || 50) + '&fields=summary,status,description,parent,issuetype';
      const data = await call(fetchImpl, url, { headers });
      return (data.issues || []).map((i) => ({
        key: i.key,
        title: i.fields.summary,
        status: i.fields.status ? i.fields.status.name : '',
        parent: i.fields.parent ? i.fields.parent.key : '',
        body: typeof i.fields.description === 'string' ? i.fields.description : '',
        url: trim(cfg.baseUrl) + '/browse/' + i.key,
      }));
    },

    async transitions(key) {
      const data = await call(fetchImpl, base + '/issue/' + key + '/transitions', { headers });
      return (data.transitions || []).map((t) => ({ id: t.id, name: t.name, to: t.to ? t.to.name : '' }));
    },

    async transition(key, transitionId) {
      await call(fetchImpl, base + '/issue/' + key + '/transitions', {
        method: 'POST', headers, body: JSON.stringify({ transition: { id: String(transitionId) } })
      });
    },

    url(key) {
      return trim(cfg.baseUrl) + '/browse/' + key;
    },
  };
}

// ---------- GitHub ----------

function github(cfg, fetchImpl) {
  const base = trim(cfg.baseUrl || 'https://api.github.com');
  const headers = { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

  function ref(item) {
    const m = /repos\/([^/]+\/[^/]+)/.exec(item.repository_url || '') || /github\.com\/([^/]+\/[^/]+)\//.exec(item.html_url || '');
    return (m ? m[1] : '') + '#' + item.number;
  }

  function shape(item) {
    return { ref: ref(item), title: item.title, url: item.html_url, kind: item.pull_request ? 'pr' : 'issue', body: item.body || '' };
  }

  return {
    async assigned() {
      const data = await call(fetchImpl, base + '/issues?filter=assigned&state=open&per_page=50', { headers });
      return (Array.isArray(data) ? data : []).map(shape);
    },
    async reviewRequests() {
      const data = await call(fetchImpl, base + '/search/issues?q=' + encodeURIComponent('is:open is:pr review-requested:@me') + '&per_page=50', { headers });
      return ((data && data.items) || []).map(shape);
    },
  };
}

// ---------- Confluence ----------

function confluence(cfg, fetchImpl) {
  const root = trim(cfg.baseUrl);
  const base = root + (cfg.kind === 'cloud' ? '/wiki/rest/api' : '/rest/api');
  const headers = Object.assign({ Accept: 'application/json' }, authHeaders(cfg));

  return {
    async search(text, max) {
      const cql = 'type=page AND text ~ "' + String(text).replace(/"/g, '\\"') + '"';
      const data = await call(fetchImpl, base + '/content/search?cql=' + encodeURIComponent(cql) + '&limit=' + (max || 10), { headers });
      return (data.results || []).map((r) => ({
        title: r.title,
        url: (cfg.kind === 'cloud' ? root + '/wiki' : root) + (r._links && r._links.webui ? r._links.webui : ''),
      }));
    },
  };
}

module.exports = { jira, github, confluence, authHeaders };
