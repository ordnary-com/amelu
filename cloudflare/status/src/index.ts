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

// Outline icons, as in the dashboard.
const ICON: Record<string, string> = {
  ok: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  warn: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5"/><path d="M12 16h.01"/>',
  bad: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  none: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};
const icon = (name: string, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

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
  const cls = stateClass(m.state);
  return `
    <li class="monitor">
      <div class="monitor-head">
        <div class="monitor-id">
          <span class="monitor-name">${esc(m.name)}</span>${m.kind ? `<span class="kind">${esc(m.kind)}</span>` : ''}
          ${m.endpoint ? `<div class="sub mono">${esc(m.endpoint)}</div>` : ''}
        </div>
        <span class="state ${cls}">${icon(cls)}${esc(STATE_LABEL[m.state] ?? m.state)}</span>
      </div>
      <div class="bars" aria-hidden="true">${bars}</div>
      <div class="bars-legend"><span>${m.history.length} days ago</span><span>${m.uptime.toFixed(2)}% uptime</span><span>Today</span></div>
    </li>`;
}

function renderIncident(i: Incident): string {
  const affected = i.components.map((c) => (c.region ? `${c.name} (${c.region})` : c.name)).join(', ');
  const cls = i.state === 'resolved' ? 'ok' : i.impact === 'minor' ? 'warn' : 'bad';
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
    <article class="incident">
      <header>
        <div>
          <h3>${esc(i.title.en)}</h3>
          <p class="sub">${esc(when)}${affected ? ` · ${esc(affected)}` : ''}</p>
        </div>
        <span class="state ${cls}">${icon(cls)}${esc(INCIDENT_LABEL[i.state])}</span>
      </header>
      <ol class="updates">${updates}</ol>
    </article>`;
}

/** A panel: a title bar over a faint grey body, like the dashboard's. */
const panel = (title: string, body: string, count?: number) => `
  <section class="panel">
    <div class="panel-head"><h2>${esc(title)}${count !== undefined ? ` <span class="count">(${count})</span>` : ''}</h2></div>
    <div class="well">${body}</div>
  </section>`;

function render(s: Snapshot | null): string {
  let body: string;
  if (!s) {
    body = `
      <section class="panel">
        <div class="panel-head"><h2>Overview</h2></div>
        <p class="note">${icon('info')}<span>We couldn't load the current status. Try again in a minute.</span></p>
      </section>`;
  } else {
    const o = overall(s);
    const monitors = s.groups.flatMap((g) => g.monitors);
    const open = s.incidents.filter((i) => i.state !== 'resolved');
    const past = s.incidents.filter((i) => i.state === 'resolved');
    body = `
      <section class="panel">
        <div class="panel-head"><h2>Overview</h2></div>
        <dl class="fields">
          <div><dt>Current status</dt><dd class="state ${o.cls}">${icon(o.cls, 18)}${esc(o.title)}</dd></div>
          <div><dt>Services</dt><dd>${monitors.length}</dd></div>
          <div><dt>Open incidents</dt><dd class="${open.length ? 'state bad' : ''}">${open.length}</dd></div>
        </dl>
      </section>
      ${open.length ? panel('Current Incidents', `<div class="box">${open.map(renderIncident).join('')}</div>`, open.length) : ''}
      ${s.groups
        .filter((g) => g.monitors.length)
        .map((g) => panel(g.name === 'Amelu' ? 'Services' : g.name, `<ul class="box monitors">${g.monitors.map(renderMonitor).join('')}</ul>`, g.monitors.length))
        .join('')}
      ${panel(
        'Past Incidents',
        past.length
          ? `<div class="box">${past.map(renderIncident).join('')}</div>`
          : `<div class="box empty">${icon('ok', 20)}<p>No incidents in the last ${s.historyDays} days</p></div>`,
      )}`;
  }

  const updated = s ? `Updated ${esc(fmtDate(s.updatedAt))}` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Amelu Status</title>
<meta name="description" content="Current status of Amelu email hosting: mail delivery, mailbox access, webmail, dashboard and API.">
<link rel="icon" href="https://amelu.org/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap">
<style>
/* The dashboard's palette: a navy bar in a deep shade of Ordnary blue, white panels over a faint grey body. */
:root {
  --chrome: color-mix(in srgb, #0051fe 35%, black);
  --page: #ffffff; --surface: #ffffff; --well: #fafafb; --ink: #14171f; --muted: #5c6370; --line: #e2e5ea;
  --link: color-mix(in srgb, #0051fe, black 12%);
  --ok: #199e70; --warn: #c98500; --bad: #d92d20; --none: #e2e5ea;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --chrome: #171d25; --page: #0f1318; --surface: #14191f; --well: #181d24; --ink: #dedee3; --muted: #a4a4ac; --line: #2d323b;
    --link: color-mix(in srgb, #0051fe, white 30%);
    --ok: #3fbf8a; --warn: #e0a028; --bad: #f0554a; --none: #2d323b;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 14px/1.5 Roboto, Arial, Helvetica, sans-serif; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.bar { background: var(--chrome); }
.bar-inner { max-width: 960px; margin: 0 auto; height: 64px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; }
.bar img { height: 22px; filter: brightness(0) invert(1); display: block; }
.bar a.link { color: rgba(255,255,255,.8); font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
.bar a.link:hover { color: #fff; text-decoration: none; }
main { max-width: 960px; margin: 0 auto; padding: 28px 20px 56px; }
.title { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 24px; margin-bottom: 20px; }
h1 { margin: 0; font-size: 22px; font-weight: 400; line-height: 1.25; }
.title p { margin: 0; color: var(--muted); font-size: 14px; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgb(0 0 0 / .05); margin-bottom: 20px; }
.panel-head { height: 44px; display: flex; align-items: center; padding: 0 20px; border-bottom: 1px solid var(--line); }
h2 { margin: 0; font-size: 15px; font-weight: 500; }
.count { color: var(--muted); font-weight: 400; }
.well { background: var(--well); padding: 16px; }
.box { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.fields { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0; }
.fields > div { padding: 16px 20px; min-width: 0; }
.fields > div + div { border-left: 1px solid var(--line); }
dt { color: var(--muted); font-size: 13px; }
dd { margin: 4px 0 0; font-size: 16px; }
.state { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.state.ok { color: var(--ok); } .state.warn { color: var(--warn); } .state.bad { color: var(--bad); } .state.none { color: var(--muted); }
.monitors { list-style: none; margin: 0; padding: 0; }
.monitor { padding: 14px 16px; }
.monitor + .monitor { border-top: 1px solid var(--line); }
.monitor-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.monitor-id { min-width: 0; }
.monitor-name { font-weight: 500; }
.kind { margin-left: 8px; font-size: 10px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; color: var(--link); background: color-mix(in srgb, #0051fe 12%, transparent); border-radius: 4px; padding: 2px 6px; vertical-align: 1px; }
.sub { color: var(--muted); font-size: 12px; margin: 2px 0 0; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.monitor .state { font-size: 13px; }
.bars { display: flex; gap: 2px; margin-top: 12px; height: 26px; }
.day { flex: 1; border-radius: 2px; background: var(--none); }
.day.ok { background: var(--ok); } .day.warn { background: var(--warn); } .day.bad { background: var(--bad); }
.bars-legend { display: flex; justify-content: space-between; color: var(--muted); font-size: 12px; margin-top: 6px; }
.incident { padding: 14px 16px; }
.incident + .incident { border-top: 1px solid var(--line); }
.incident header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.incident h3 { margin: 0; font-size: 14px; font-weight: 500; }
.incident .state { font-size: 13px; }
.updates { list-style: none; margin: 10px 0 0; padding: 0; border-left: 2px solid var(--line); }
.updates li { padding: 2px 0 8px 12px; }
.update-head { display: flex; flex-wrap: wrap; gap: 8px; font-size: 13px; }
.update-head strong { font-weight: 500; }
.update-head span { color: var(--muted); }
.updates p { margin: 2px 0 0; font-size: 13px; }
.empty { padding: 28px 16px; text-align: center; }
.empty svg { color: var(--ok); }
.empty p { margin: 6px 0 0; }
.note { display: flex; gap: 10px; margin: 0; padding: 16px 20px; background: var(--well); }
.note svg { flex: none; margin-top: 2px; }
footer { color: var(--muted); font-size: 13px; display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px; }
footer a { color: var(--muted); }
@media (max-width: 640px) {
  .fields { grid-template-columns: 1fr; }
  .fields > div + div { border-left: 0; border-top: 1px solid var(--line); }
  .monitor-head, .incident header { flex-direction: column; gap: 4px; }
  .bars { gap: 1px; }
}
</style>
</head>
<body>
<div class="bar">
  <div class="bar-inner">
    <a href="https://amelu.org"><img src="https://amelu.org/amelu-logo.png" alt="Amelu"></a>
    <a class="link" href="https://app.amelu.org">Dashboard ${icon('external', 14)}</a>
  </div>
</div>
<main>
  <div class="title">
    <h1>Service Status</h1>
    <p>${updated}</p>
  </div>
  ${body}
  <footer>
    <a href="https://amelu.org">amelu.org</a>
    <a href="https://app.amelu.org/support">Support</a>
    <span>Times are in UTC.</span>
  </footer>
</main>
</body>
</html>`;
}
