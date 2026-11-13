/**
 * Render farm coordinator -- the dashboard and the chunk scheduler.
 *
 *   npm run farm                     # http://localhost:4000
 *   npm run farm -- --chunk=15 --from=0 --to=2024
 *
 * Machines don't push frames INTO the coordinator; each one runs a real GPU-backed Remotion
 * renderer (tools/farm/agent.mjs) that claims a chunk of frames, renders it locally, uploads the
 * JPEGs and reports back. Every connection is outbound, so the only thing that needs opening on a
 * worker is nothing at all -- no inbound firewall rules, no file shares.
 *
 * Kept separate from render-frames.mjs on purpose: that tool is for one machine and is optimised for
 * an unattended overnight run. This is for several machines at once and wants visible state.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};

const PORT = Number(arg('port', 4000));
const FIRST = Number(arg('from', 0));
const LAST = Number(arg('to', 2024));
const CHUNK = Number(arg('chunk', 25));
const DIR = join(process.cwd(), arg('dir', join('out', 'frames')));
const COMP = arg('comp', 'RicksClipsFull');

mkdirSync(DIR, { recursive: true });

// ---------------------------------------------------------------- state
const chunks = [];
for (let a = FIRST; a <= LAST; a += CHUNK) {
  const b = Math.min(a + CHUNK - 1, LAST);
  chunks.push({ id: chunks.length, from: a, to: b, status: 'pending', worker: null, ms: null, error: null });
}

const workers = new Map();
const state = {
  running: false,
  stopping: false,
  startedAt: null,
  finishedAt: null,
  complaint: null,
};

const framesOnDisk = () => {
  const set = new Set();
  for (const n of readdirSync(DIR)) {
    const m = n.match(/element-(\d+)\.jpe?g$/);
    if (m) set.add(Number(m[1]));
  }
  return set;
};

const summary = () => {
  const done = chunks.filter((c) => c.status === 'done');
  const queued = chunks.filter((c) => c.status === 'pending');
  const running = chunks.filter((c) => c.status === 'running');
  const failed = chunks.filter((c) => c.status === 'failed');
  const framesDone = done.reduce((n, c) => n + (c.to - c.from + 1), 0);
  const framesRunning = running.reduce((n, c) => n + (c.to - c.from + 1), 0);
  const total = LAST - FIRST + 1;
  const etaMs = (() => {
    const rates = [...workers.values()].filter((w) => w.rate > 0);
    if (!rates.length) return null;
    const combined = rates.reduce((n, w) => n + w.rate, 0); // frames/sec, all workers
    const left = total - framesDone;
    return combined > 0 ? (left / combined) * 1000 : null;
  })();
  return {
    running: state.running,
    stopping: state.stopping,
    complaint: state.complaint,
    range: { first: FIRST, last: LAST, chunk: CHUNK, total },
    framesDone,
    framesRunning,
    elapsedMs: state.startedAt ? (state.finishedAt ?? Date.now()) - state.startedAt : 0,
    etaMs,
    chunks: chunks.map((c) => ({
      id: c.id,
      from: c.from,
      to: c.to,
      status: c.status,
      worker: c.worker,
      ms: c.ms,
      error: c.error,
    })),
    workers: [...workers.values()].map((w) => ({
      id: w.id,
      label: w.label,
      gpu: w.gpu,
      software: w.software,
      status: w.status,
      chunk: w.chunk,
      frames: w.frames,
      rate: Number(w.rate.toFixed(3)),
      lastSeen: w.lastSeen,
    })),
  };
};

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });

// ---------------------------------------------------------------- dashboard
const page = () => `<!doctype html>
<html><head><meta charset="utf-8"><title>Render farm</title>
<style>
  :root { color-scheme: dark; --bg:#0d1117; --panel:#161b22; --line:#30363d; --dim:#8b949e;
          --ok:#3fb950; --run:#d29922; --bad:#f85149; --idle:#484f58; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:#e6edf3; font:14px/1.5 -apple-system,Segoe UI,system-ui,sans-serif; }
  header { display:flex; align-items:center; gap:16px; padding:16px 24px; border-bottom:1px solid var(--line); }
  h1 { font-size:16px; margin:0; font-weight:600; letter-spacing:.2px; }
  .grow { flex:1; }
  button { font:inherit; font-weight:600; padding:8px 18px; border-radius:6px; border:1px solid var(--line);
           background:#21262d; color:#e6edf3; cursor:pointer; }
  button:disabled { opacity:.45; cursor:default; }
  button.start { background:#238636; border-color:#2ea043; }
  button.stop  { background:#8b2c22; border-color:#b62324; }
  .banner { display:none; padding:10px 24px; background:#3d2c00; color:#e3b341; border-bottom:1px solid #5a4500; }
  .banner.on { display:block; }
  main { padding:20px 24px; display:grid; grid-template-columns: 1fr 340px; gap:20px; align-items:start; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  .card h2 { font-size:12px; text-transform:uppercase; letter-spacing:.8px; color:var(--dim);
             margin:0; padding:10px 14px; border-bottom:1px solid var(--line); font-weight:600; }
  table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
  th,td { text-align:left; padding:7px 14px; border-bottom:1px solid #21262d; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.6px; color:var(--dim); font-weight:600; }
  tr:last-child td { border-bottom:0; }
  .pill { display:inline-block; padding:1px 8px; border-radius:99px; font-size:11px; font-weight:600; }
  .s-pending { background:#21262d; color:var(--dim); }
  .s-running { background:#3d2c00; color:var(--run); }
  .s-done    { background:#0f2f1a; color:var(--ok); }
  .s-failed  { background:#3d1418; color:var(--bad); }
  .stats { display:grid; grid-template-columns:repeat(2,1fr); gap:1px; background:var(--line); }
  .stat { background:var(--panel); padding:12px 14px; }
  .stat b { display:block; font-size:20px; font-variant-numeric:tabular-nums; }
  .stat span { font-size:11px; text-transform:uppercase; letter-spacing:.6px; color:var(--dim); }
  .worker { padding:12px 14px; border-bottom:1px solid #21262d; }
  .worker:last-child { border-bottom:0; }
  .worker .name { font-weight:600; display:flex; gap:8px; align-items:center; }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--idle); }
  .dot.busy { background:var(--run); }
  .gpu { font:12px ui-monospace,Consolas,monospace; color:var(--dim); margin-top:3px; word-break:break-word; }
  .warn { color:var(--bad); font-size:12px; margin-top:4px; }
  .muted { color:var(--dim); }
  .empty { padding:18px 14px; color:var(--dim); }
  .chunklist { max-height:calc(100vh - 260px); overflow:auto; }
</style></head>
<body>
<header>
  <h1>Render farm</h1>
  <span class="muted" id="range"></span>
  <span class="grow"></span>
  <button class="start" id="start">Start</button>
  <button class="stop" id="stop" disabled>Stop</button>
</header>
<div class="banner" id="banner"></div>
<main>
  <section>
    <div class="card">
      <h2>Progress</h2>
      <div class="stats">
        <div class="stat"><span>Frames done</span><b id="fd">0</b></div>
        <div class="stat"><span>Elapsed</span><b id="el">–</b></div>
        <div class="stat"><span>ETA</span><b id="eta">–</b></div>
        <div class="stat"><span>Frames / sec</span><b id="fps">–</b></div>
      </div>
    </div>
    <div class="card" style="margin-top:20px">
      <h2>Chunks</h2>
      <div class="chunklist"><table id="chunks"><thead>
        <tr><th>#</th><th>Frames</th><th>Status</th><th>Worker</th><th>Time</th></tr>
      </thead><tbody></tbody></table></div>
    </div>
  </section>
  <aside class="card">
    <h2>Workers</h2>
    <div id="workers"></div>
  </aside>
</main>
<script>
const $ = (id) => document.getElementById(id);
const hms = (ms) => {
  if (ms == null || !isFinite(ms)) return '–';
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? h + 'h ' + m + 'm' : m ? m + 'm ' + r + 's' : r + 's';
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

async function tick() {
  let s;
  try { s = await (await fetch('/api/state')).json(); } catch { return; }
  $('range').textContent = s.range.first + '–' + s.range.last + ' · ' + s.range.total + ' frames · chunk ' + s.range.chunk;
  $('fd').textContent = s.framesDone + (s.framesRunning ? ' (+' + s.framesRunning + ')' : '');
  $('el').textContent = hms(s.elapsedMs);
  $('eta').textContent = hms(s.etaMs);
  const rate = s.workers.reduce((n, w) => n + (w.rate || 0), 0);
  $('fps').textContent = rate ? rate.toFixed(2) : '–';

  $('start').disabled = s.running;
  $('stop').disabled = !s.running || s.stopping;

  const banner = $('banner');
  if (s.stopping) {
    banner.className = 'banner on';
    banner.textContent = 'Stopping after the current chunk — every rendered frame is saved. Restart '
      + 'whenever you like and it continues from where it stopped.';
  } else if (s.complaint) {
    banner.className = 'banner on'; banner.textContent = s.complaint;
  } else { banner.className = 'banner'; }

  const tb = document.querySelector('#chunks tbody');
  tb.innerHTML = s.chunks.map((c) =>
    '<tr><td class="muted">' + (c.id + 1) + '</td><td>' + c.from + '–' + c.to + '</td>' +
    '<td><span class="pill s-' + c.status + '">' + c.status + '</span></td>' +
    '<td class="muted">' + esc(c.worker ?? '–') + '</td>' +
    '<td class="muted">' + (c.ms ? hms(c.ms) : '–') + '</td></tr>').join('');

  $('workers').innerHTML = s.workers.length ? s.workers.map((w) =>
    '<div class="worker"><div class="name"><span class="dot ' + (w.status === 'busy' ? 'busy' : '') +
    '"></span>' + esc(w.label) + '</div>' +
    '<div class="gpu">' + esc(w.gpu || 'unknown GPU') + '</div>' +
    (w.software ? '<div class="warn">software rendering — no GPU detected</div>' : '') +
    '<div class="gpu">' + (w.chunk ? 'chunk ' + w.chunk : 'idle') +
    ' · ' + (w.frames || 0) + ' frames' + (w.rate ? ' · ' + w.rate.toFixed(2) + ' fps' : '') + '</div></div>'
  ).join('') : '<div class="empty">No machines connected.<br><br>Run this on the other PC:<br><code>node tools/farm/agent.mjs --server=http://&lt;this-ip&gt;:' + 4000 + '</code></div>';
}

$('start').onclick = async () => { await fetch('/api/start', { method: 'POST' }); tick(); };
$('stop').onclick = async () => { await fetch('/api/stop', { method: 'POST' }); tick(); };
tick();
setInterval(tick, 1000);
</script></body></html>`;

// ---------------------------------------------------------------- server
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const p = url.pathname;

  if (p === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(page());
  }

  if (p === '/api/state') return json(res, 200, summary());

  if (p === '/api/start' && req.method === 'POST') {
    if (state.running) return json(res, 409, { error: 'already running' });
    state.running = true;
    state.stopping = false;
    state.complaint = null;
    state.startedAt = Date.now();
    state.finishedAt = null;
    for (const c of chunks) if (c.status === 'running') { c.status = 'pending'; c.worker = null; }
    console.log(`start: ${chunks.length} chunks queued`);
    return json(res, 200, summary());
  }

  if (p === '/api/stop' && req.method === 'POST') {
    state.stopping = true;
    console.log('stop requested -- workers will finish their current chunk');
    return json(res, 200, summary());
  }

  // ---- worker protocol -------------------------------------------------
  if (p === '/api/register' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const id = `w${workers.size + 1}-${Math.random().toString(36).slice(2, 6)}`;
    const w = {
      id,
      label: body.label || `worker ${workers.size + 1}`,
      gpu: body.gpu || null,
      software: Boolean(body.software),
      status: 'idle',
      chunk: null,
      frames: 0,
      rate: 0,
      lastSeen: Date.now(),
      startedAt: Date.now(),
    };
    workers.set(id, w);
    console.log(`worker up: ${w.label} [${w.gpu ?? 'unknown gpu'}]`);
    return json(res, 200, {
      workerId: id,
      chunk: CHUNK,
      comp: COMP,
    });
  }

  if (p === '/api/claim' && req.method === 'POST') {
    const { workerId } = JSON.parse((await readBody(req)) || '{}');
    const w = workers.get(workerId);
    if (!w) return json(res, 404, { error: 'unknown worker' });
    w.lastSeen = Date.now();
    if (!state.running) { w.status = 'idle'; return json(res, 200, { idle: true }); }
    if (state.stopping) { w.status = 'idle'; return json(res, 200, { stopped: true }); }
    const next = chunks.find((c) => c.status === 'pending');
    if (!next) { w.status = 'idle'; return json(res, 200, { done: true }); }
    next.status = 'running';
    next.worker = w.label;
    next.startedAt = Date.now();
    w.status = 'busy';
    w.chunk = `${next.from}–${next.to}`;
    w.frames = 0;
    w.chunkStartedAt = Date.now();
    console.log(`claim: ${w.label} -> ${next.from}-${next.to}`);
    return json(res, 200, { chunk: { id: next.id, from: next.from, to: next.to } });
  }

  if (p === '/api/progress' && req.method === 'POST') {
    const b = JSON.parse((await readBody(req)) || '{}');
    const w = workers.get(b.workerId);
    if (w) {
      w.lastSeen = Date.now();
      w.frames = b.frames ?? w.frames;
      if (w.chunkStartedAt && w.frames > 0) {
        const secs = (Date.now() - w.chunkStartedAt) / 1000;
        const instant = w.frames / Math.max(1, secs);
        w.rate = w.rate ? w.rate * 0.7 + instant * 0.3 : instant;
      }
    }
    const c = chunks.find((x) => x.id === b.chunkId);
    if (c) c.progress = b.frames;
    return json(res, 200, { ok: true });
  }

  if (p === '/api/frame' && req.method === 'POST') {
    const name = url.searchParams.get('name');
    if (!name || !/^element-\d+\.jpe?g$/.test(name)) return json(res, 400, { error: 'bad name' });
    const parts = [];
    for await (const c of req) parts.push(c);
    writeFileSync(join(DIR, name), Buffer.concat(parts));
    return json(res, 200, { ok: true, bytes: Buffer.concat(parts).length });
  }

  if (p === '/api/finish' && req.method === 'POST') {
    const b = JSON.parse((await readBody(req)) || '{}');
    const c = chunks.find((x) => x.id === b.chunkId);
    const w = workers.get(b.workerId);
    if (w) { w.status = 'idle'; w.chunk = null; w.lastSeen = Date.now(); }
    if (c) {
      c.ms = c.startedAt ? Date.now() - c.startedAt : null;
      if (b.ok) { c.status = 'done'; console.log(`done: ${c.from}-${c.to} in ${Math.round(c.ms / 1000)}s via ${c.worker}`); }
      else { c.status = 'failed'; c.error = b.error ?? 'unknown'; c.worker = null;
             console.error(`FAILED: ${c.from}-${c.to}: ${c.error}`); }
    }
    if (chunks.every((x) => x.status === 'done' || x.status === 'failed')) {
      state.running = false;
      state.stopping = false;
      state.finishedAt = Date.now();
      const gaps = LAST - FIRST + 1 - framesOnDisk().size;
      state.complaint = gaps > 0 ? `${gaps} frame(s) still missing — press Start to retry them.` : null;
      console.log('all chunks settled');
    }
    return json(res, 200, { ok: true });
  }

  res.writeHead(404).end('not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`farm dashboard: http://localhost:${PORT}`);
  console.log(`frames dir:     ${DIR}`);
  console.log(`range:          ${FIRST}-${LAST} in chunks of ${CHUNK}`);
  console.log('waiting for workers to connect...');
});

process.on('SIGINT', () => {
  console.log('\nstopping server');
  server.close();
  process.exit(0);
});
