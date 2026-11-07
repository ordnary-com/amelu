// status.amelu.org. See wrangler.jsonc.

interface Env {
  STATUS_API: string;
}

type State = 'operational' | 'degraded' | 'outage' | string;

interface Day {
  date: string;
  uptime: number;
  state: State;
}

interface Monitor {
  name: string;
  endpoint: string;
  kind: string;
  state: State;
  uptime: number;
  history: Day[];
}

interface Text {
  en: string;
  nl?: string;
}

interface Incident {
  title: Text;
  state: 'investigating' | 'monitoring' | 'resolved';
  impact: 'minor' | 'major' | 'critical';
  components: { name: string; region: string | null }[];
  startedAt: string;
  resolvedAt: string | null;
  updates: { state: Incident['state']; at: string; text: Text }[];
}

interface Snapshot {
  updatedAt: string;
  historyDays: number;
  groups: { name: string; monitors: Monitor[] }[];
  incidents: Incident[];
}

const DASHBOARD_ORIGINS = ['https://app.amelu.org', 'https://beta.amelu.org', 'http://localhost:4200'];

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });

    let snapshot: Snapshot | null = null;
    try {
      snapshot = await load(env, ctx);
    } catch {
      snapshot = null;
    }

    if (url.pathname === '/api/status') {
      const origin = request.headers.get('Origin') ?? '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' };
      if (DASHBOARD_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
      if (!snapshot) return new Response(JSON.stringify({ error: 'status unavailable' }), { status: 503, headers });
      return new Response(JSON.stringify(snapshot), { headers });
    }
    if (url.pathname !== '/') return Response.redirect(new URL('/', url).toString(), 302);

    return new Response(render(snapshot), {
      status: snapshot ? 200 : 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=30' },
    });
  },
};

/** The Airplane snapshot, cached at the edge for 30 seconds. */
async function load(env: Env, ctx: ExecutionContext): Promise<Snapshot> {
  const cache = caches.default;
  const key = new Request(env.STATUS_API);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const res = await fetch(env.STATUS_API, { headers: { Accept: 'application/json', 'User-Agent': 'amelu-status' } });
  if (!res.ok) throw new Error(`status API ${res.status}`);
  const body = await res.text();
  ctx.waitUntil(cache.put(key, new Response(body, { headers: { 'Cache-Control': 'public, max-age=30', 'Content-Type': 'application/json' } })));
  return JSON.parse(body);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STATE_LABEL: Record<string, string> = { operational: 'Operational', degraded: 'Degraded performance', outage: 'Outage' };
const INCIDENT_LABEL: Record<Incident['state'], string> = { investigating: 'Investigating', monitoring: 'Monitoring', resolved: 'Resolved' };

function stateClass(state: State): string {
  return state === 'outage' ? 'bad' : state === 'degraded' ? 'warn' : state === 'operational' ? 'ok' : 'none';
}

function fmtDate(iso: string, withTime = true): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (!withTime) return date;
  return `${date}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

function overall(s: Snapshot): { cls: string; title: string } {
  const monitors = s.groups.flatMap((g) => g.monitors);
  const open = s.incidents.filter((i) => i.state !== 'resolved');
  if (monitors.some((m) => m.state === 'outage') || open.some((i) => i.impact !== 'minor')) return { cls: 'bad', title: 'Some services are down' };
  if (monitors.some((m) => m.state === 'degraded') || open.length > 0) return { cls: 'warn', title: 'Some services have problems' };
  return { cls: 'ok', title: 'All systems operational' };
}

function renderMonitor(m: Monitor): string {
  const bars = m.history
    .map((d) => {
      const tip = `${fmtDate(d.date + 'T00:00:00Z', false)}: ${d.uptime.toFixed(2)}% uptime`;
      return `<span class="day ${stateClass(d.state)}" title="${esc(tip)}"></span>`;
    })
    .join('');
  return `
    <li class="monitor">
      <div class="monitor-head">
        <div>
          <span class="monitor-name">${esc(m.name)}</span>${m.kind ? ` <span class="kind">${esc(m.kind)}</span>` : ''}
          ${m.endpoint ? `<div class="endpoint">${esc(m.endpoint)}</div>` : ''}
        </div>
        <span class="state ${stateClass(m.state)}"><span class="dot"></span>${esc(STATE_LABEL[m.state] ?? m.state)}</span>
      </div>
      <div class="bars" aria-hidden="true">${bars}</div>
      <div class="bars-legend"><span>${m.history.length} days ago</span><span>${m.uptime.toFixed(2)}% uptime</span><span>Today</span></div>
    </li>`;
}

function renderIncident(i: Incident): string {
  const affected = i.components.map((c) => (c.region ? `${c.name} (${c.region})` : c.name)).join(', ');
  const updates = i.updates
    .map(
      (u) => `
      <li>
        <div class="update-head"><strong>${esc(INCIDENT_LABEL[u.state])}</strong><span>${esc(fmtDate(u.at))}</span></div>
        <p>${esc(u.text.en)}</p>
      </li>`,
    )
    .join('');
  const when = i.resolvedAt ? `${fmtDate(i.startedAt)} to ${fmtDate(i.resolvedAt)}` : `Since ${fmtDate(i.startedAt)}`;
  return `
    <article class="incident ${i.state === 'resolved' ? 'resolved' : i.impact}">
      <header>
        <h3>${esc(i.title.en)}</h3>
        <span class="incident-state">${esc(INCIDENT_LABEL[i.state])}</span>
      </header>
      <p class="incident-meta">${esc(when)}${affected ? ` · Affected: ${esc(affected)}` : ''}</p>
      <ol class="updates">${updates}</ol>
    </article>`;
}

function render(s: Snapshot | null): string {
  let body: string;
  if (!s) {
    body = `<section class="banner none"><h1>Status unavailable</h1><p>We couldn't load the current status. Try again in a minute.</p></section>`;
  } else {
    const o = overall(s);
    const open = s.incidents.filter((i) => i.state !== 'resolved');
    const past = s.incidents.filter((i) => i.state === 'resolved');
    body = `
      <section class="banner ${o.cls}">
        <h1>${esc(o.title)}</h1>
        <p>Updated ${esc(fmtDate(s.updatedAt))}</p>
      </section>
      ${open.length ? `<section><h2>Current incidents</h2>${open.map(renderIncident).join('')}</section>` : ''}
      ${s.groups
        .filter((g) => g.monitors.length)
        .map((g) => `<section><h2>${esc(g.name === 'Amelu' ? 'Services' : g.name)}</h2><ul class="card monitors">${g.monitors.map(renderMonitor).join('')}</ul></section>`)
        .join('')}
      <section>
        <h2>Past incidents</h2>
        ${past.length ? past.map(renderIncident).join('') : `<p class="muted">No incidents in the last ${s.historyDays} days.</p>`}
      </section>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Amelu Status</title>
<meta name="description" content="Current status of Amelu email hosting: mail delivery, mailbox access, webmail, dashboard and API.">
<link rel="icon" href="https://amelu.org/icon.png">
<style>
:root {
  --bg: #f6f7f9; --surface: #ffffff; --ink: #14171c; --muted: #61666f; --line: #e3e6ea;
  --accent: #0051fe; --ok: #16a34a; --warn: #d97706; --bad: #dc2626; --none: #cfd3d9;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0f1216; --surface: #171b21; --ink: #e9ebee; --muted: #9aa0a8; --line: #272c34; --none: #333943; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
.top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
.top img { height: 30px; }
.top a { color: var(--muted); text-decoration: none; font-weight: 500; font-size: 13px; }
.top a:hover { color: var(--ink); }
h1 { margin: 0; font-size: 20px; }
h2 { font-size: 15px; margin: 32px 0 10px; }
.banner { border-radius: 10px; padding: 18px 20px; color: #fff; }
.banner p { margin: 4px 0 0; opacity: .85; font-size: 13px; }
.banner.ok { background: var(--ok); } .banner.warn { background: var(--warn); } .banner.bad { background: var(--bad); } .banner.none { background: var(--muted); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
.monitors { list-style: none; margin: 0; padding: 0; }
.monitor { padding: 16px 18px; border-bottom: 1px solid var(--line); }
.monitor:last-child { border-bottom: 0; }
.monitor-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
.monitor-name { font-weight: 600; }
.kind { font-size: 11px; font-weight: 700; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; margin-left: 4px; }
.endpoint { color: var(--muted); font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.state { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; white-space: nowrap; }
.state .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.state.ok { color: var(--ok); } .state.warn { color: var(--warn); } .state.bad { color: var(--bad); } .state.none { color: var(--muted); }
.bars { display: flex; gap: 2px; margin-top: 12px; height: 28px; }
.day { flex: 1; border-radius: 2px; background: var(--none); }
.day.ok { background: var(--ok); } .day.warn { background: var(--warn); } .day.bad { background: var(--bad); }
.bars-legend { display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; margin-top: 6px; }
.incident { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--warn); border-radius: 10px; padding: 14px 18px; margin-bottom: 10px; }
.incident.major, .incident.critical { border-left-color: var(--bad); }
.incident.resolved { border-left-color: var(--line); }
.incident header { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.incident h3 { margin: 0; font-size: 15px; }
.incident-state { font-size: 12px; font-weight: 600; color: var(--muted); white-space: nowrap; }
.incident-meta { color: var(--muted); font-size: 12px; margin: 4px 0 10px; }
.updates { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.updates li { padding: 10px 0 0; }
.update-head { display: flex; gap: 10px; flex-wrap: wrap; font-size: 13px; }
.update-head span { color: var(--muted); }
.updates p { margin: 4px 0 0; color: var(--ink); }
.muted { color: var(--muted); }
footer { margin-top: 40px; color: var(--muted); font-size: 12px; display: flex; gap: 16px; flex-wrap: wrap; }
footer a { color: inherit; }
@media (max-width: 520px) { .bars { gap: 1px; } .monitor-head { flex-direction: column; } }
</style>
</head>
<body>
<main>
  <div class="top">
    <a href="https://amelu.org"><img src="https://amelu.org/amelu-logo.png" alt="Amelu"></a>
    <a href="https://app.amelu.org">Dashboard</a>
  </div>
  ${body}
  <footer>
    <a href="https://amelu.org">amelu.org</a>
    <a href="https://support.ordnary.com">Support</a>
    <span>Times are in UTC.</span>
  </footer>
</main>
</body>
</html>`;
}
