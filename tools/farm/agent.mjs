/**
 * Render farm worker. Run this on each machine -- including this one.
 *
 *   node tools/farm/agent.mjs --server=http://192.168.1.10:4000 --label="i7 / GT 710"
 *   node tools/farm/agent.mjs --server=http://192.168.1.10:4000 --label="i3 / HD 2500" --conc=2
 *
 * It claims a chunk of frames from the coordinator, renders them with the real Remotion renderer on
 * this machine's GPU, uploads the JPEGs, and asks for the next chunk. Nothing has to be reachable
 * from the outside: every call is made by this process, going out.
 *
 * --conc is Remotion's Chromium concurrency: use 2 on a 2-core/4-thread box, 3 on a 4-core/8-thread
 * box with 8 GB. Higher than that just thrashes RAM.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};

const SERVER = arg('server', 'http://localhost:4000').replace(/\/$/, '');
const LABEL = arg('label', process.env.COMPUTERNAME || 'worker');
const CONC = arg('conc', '2');
const MAX_CHUNKS = Number(arg('max', '1000'));
const project = process.cwd();
const remotionCli = join(project, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');

if (!existsSync(remotionCli)) {
  console.error('remotion CLI not found -- run this from the project folder (node_modules must be present)');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- GPU probe
/**
 * Asks the browser itself which renderer it uses, without any dependency: headless Chromium can
 * dump the DOM of a local file, so the WebGL renderer string comes back as plain text.
 */
const probeGpu = () => {
  const exes = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter((p) => existsSync(p));
  if (!exes.length) return { gpu: 'no chromium browser found', software: false };

  const probeFile = join(tmpdir(), 'gpu-probe.html');
  writeFileSync(probeFile, `<!doctype html><body><pre id="o"></pre><script>
    try {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2') || c.getContext('webgl');
      const e = g && g.getExtension('WEBGL_debug_renderer_info');
      document.getElementById('o').textContent = e
        ? g.getParameter(e.UNMASKED_RENDERER_WEBGL)
        : 'no webgl context';
    } catch (err) { document.getElementById('o').textContent = 'error: ' + err.message; }
  </script></body>`);

  for (const exe of exes) {
    try {
      const out = execFileSync(exe, [
        '--headless=new', '--disable-gpu-sandbox', '--no-sandbox',
        '--use-angle=d3d11', '--enable-gpu',
        '--user-data-dir=' + join(tmpdir(), 'gpu-probe-profile'),
        '--virtual-time-budget=3000',
        '--dump-dom', 'file:///' + probeFile.replace(/\\/g, '/'),
      ], { encoding: 'utf8', timeout: 45000, stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/<pre id="o">([\s\S]*?)<\/pre>/);
      const gpu = (m?.[1] ?? '').trim();
      if (gpu && !gpu.startsWith('error') && gpu !== 'no webgl context') {
        const software = /swiftshader|basic render|warp|llvmpipe|software/i.test(gpu);
        return { gpu, software };
      }
    } catch {
      // try the next browser
    }
  }
  return { gpu: 'probe failed', software: false };
};

// ---------------------------------------------------------------- http helpers
const post = async (path, body) => {
  const res = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
};

const uploadFrame = async (file) => {
  const name = basename(file);
  const buf = readFileSync(file);
  const res = await fetch(`${SERVER}/api/frame?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: buf,
  });
  if (!res.ok) throw new Error(`upload ${name} -> ${res.status}`);
};

// ---------------------------------------------------------------- main loop
const gpu = probeGpu();
console.log(`labelled:      ${LABEL}`);
console.log(`renderer:      ${gpu.gpu}`);
if (gpu.software) console.log('WARNING: this is software rendering, not the GPU');
console.log(`server:        ${SERVER}`);
console.log(`concurrency:   ${CONC}`);
console.log('');

const { workerId, comp } = await post('/api/register', { label: LABEL, gpu: gpu.gpu, software: gpu.software });
console.log(`registered as ${workerId}, waiting for work...`);

let served = 0;
for (;;) {
  if (served >= MAX_CHUNKS) { console.log('reached --max chunks, exiting'); break; }

  let claim;
  try {
    claim = await post('/api/claim', { workerId });
  } catch (err) {
    console.log(`coordinator unreachable (${err.message}), retrying in 5s`);
    await sleep(5000);
    continue;
  }

  if (claim.idle) { await sleep(2000); continue; }
  if (claim.stopped) { console.log('stop requested by the dashboard -- finishing cleanly'); break; }
  if (claim.done) { console.log('no chunks left, exiting'); break; }

  const { id, from, to } = claim.chunk;
  const tmp = join(project, 'out', `_agent_${workerId}_${id}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  console.log(`\nchunk ${from}-${to}  (${to - from + 1} frames)`);
  const t0 = Date.now();

  // Remotion captures the first frame of every Chromium tab BEFORE the WebGL canvas has drawn, so
  // those frames come out blank. Render `conc` extra frames in front of the chunk and upload only the
  // requested range. Chunks after the first get a proper lead; the very first chunk cannot, so its
  // warm-up frames are topped up below.
  const lead = Math.max(0, from - Number(CONC));

  let failed = null;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        remotionCli, 'render', 'src/index.ts', comp, tmp,
        `--frames=${lead}-${to}`, '--sequence', `--concurrency=${CONC}`,
      ], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });

      let frames = 0;
      let lastReport = 0;
      const onLine = (line) => {
        const m = line.match(/Rendered (\d+)\/(\d+)/);
        if (m) {
          frames = Number(m[1]);
          const now = Date.now();
          if (now - lastReport > 1500) {
            lastReport = now;
            post('/api/progress', { workerId, chunkId: id, frames }).catch(() => {});
          }
        }
      };
      let buf = '';
      const consume = (chunk) => {
        buf += chunk.toString();
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';
        lines.forEach(onLine);
      };
      child.stdout.on('data', consume);
      child.stderr.on('data', consume);
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`renderer exited ${code}`))));
    });

    const indexOf = (n) => Number(n.match(/element-(\d+)/)[1]);
    const files = readdirSync(tmp)
      .filter((n) => /^element-\d+\.jpeg$/.test(n))
      .sort((a, b) => indexOf(a) - indexOf(b));
    // Lead frames are sacrificial warm-up captures; upload only what was asked for.
    // The very first chunk has no lead, so its two warm-up frames would be blank.
    const start = from === 0 ? 2 : from;
    const wanted = files.filter((n) => indexOf(n) >= start);
    if (!wanted.length) throw new Error('renderer produced no frames');

    let uploaded = 0;
    for (const f of wanted) {
      await uploadFrame(join(tmp, f));
      uploaded++;
      if (uploaded % 5 === 0) await post('/api/progress', { workerId, chunkId: id, frames: uploaded }).catch(() => {});
    }

    if (from === 0) {
      const src = files.find((n) => indexOf(n) >= 2);
      if (src) {
        const buf = readFileSync(join(tmp, src));
        for (const name of ['element-0.jpeg', 'element-1.jpeg']) {
          await fetch(`${SERVER}/api/frame?name=${name}`, {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream' },
            body: buf,
          });
          uploaded++;
        }
      }
    }
    const secs = (Date.now() - t0) / 1000;
    console.log(`  ${uploaded} frames in ${secs.toFixed(0)}s  (${(secs / uploaded).toFixed(2)} s/frame)`);
  } catch (err) {
    failed = err.message;
    console.error(`  chunk failed: ${failed}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  await post('/api/finish', { workerId, chunkId: id, ok: !failed, error: failed }).catch(() => {});
  served++;

  if (failed) {
    console.log('  waiting 5s before asking for another chunk');
    await sleep(5000);
  }
}

console.log('\nworker stopped');
