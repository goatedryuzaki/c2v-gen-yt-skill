/**
 * Render one frame in a browser that we drive from outside -- locally or on another PC over the LAN.
 *
 *   node tools/farm/probe.mjs --frame=352                       # local Edge
 *   node tools/farm/probe.mjs --remote=http://192.168.1.50:9333  # browser already running over there
 *
 * This speaks Remotion's own render protocol (see @remotion/renderer): setBundleMode('evaluation') to
 * read the composition metadata, setBundleMode('composition') to mount it, then remotion_setFrame()
 * and wait for window.remotion_renderReady. The capture is a CDP page screenshot, which is exactly
 * what `remotion render` does -- so the DOM caption layer is included. A canvas-only capture
 * (toDataURL) would silently drop the captions.
 *
 * Prints the WebGL renderer string, which is the proof the GPU is drawing and not SwiftShader.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};

const frame = Number(arg('frame', 352));
const composition = arg('comp', 'RicksClipsFull');
const remote = arg('remote', null);
const browserName = arg('browser', 'edge');
const cdpPort = Number(arg('cdp', 9333));
const httpPort = Number(arg('port', 3100));
const host = arg('host', '127.0.0.1');
const settleMs = Number(arg('settle', 400));
const root = join(process.cwd(), 'build');

if (!existsSync(join(root, 'index.html'))) {
  console.error('build/index.html is missing -- run: node node_modules/@remotion/cli/remotion-cli.js bundle src/index.ts build');
  process.exit(1);
}

const BROWSERS = {
  edge: ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
  brave: ['C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
  chrome: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'],
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wav': 'audio/wav', '.ico': 'image/x-icon', '.css': 'text/css' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
// A remote browser has to be able to reach this server, so bind all interfaces in that case.
await new Promise((r) => server.listen(httpPort, remote ? '0.0.0.0' : '127.0.0.1', r));
console.log(`serving build/ on http://${host}:${httpPort}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let child = null;
let browser;
for (let i = 0; i < 40; i++) {
  try {
    if (remote) {
      browser = await chromium.connectOverCDP(remote);
    } else {
      if (!child) {
        const exe = (BROWSERS[browserName] ?? BROWSERS.edge).find((p) => existsSync(p));
        if (!exe) { throw new Error(`no ${browserName} binary found`); }
        const profile = join(process.cwd(), 'out', `farm-profile-${process.pid}`);
        mkdirSync(profile, { recursive: true });
        child = spawn(exe, [
          '--headless=new',
          `--remote-debugging-port=${cdpPort}`,
          `--user-data-dir=${profile}`,
          '--no-first-run', '--no-default-browser-check',
          '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
          '--use-angle=d3d11', '--enable-gpu',
          '--window-size=1080,1920', 'about:blank',
        ], { stdio: 'ignore' });
      }
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    }
    break;
  } catch {
    await sleep(300);
  }
}
if (!browser) {
  console.error(remote ? `could not reach ${remote}` : 'could not connect to the browser over CDP');
  child?.kill();
  server.close();
  process.exit(1);
}
console.log(`connected: ${remote ?? 'local ' + browserName}`);

try {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());
  await page.setViewportSize({ width: 1080, height: 1920 });

  const t0 = Date.now();
  await page.goto(`http://${host}:${httpPort}/index.html`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => typeof window.remotion_setBundleMode === 'function', { timeout: 120000 });

  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const ctx = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!ctx) return 'no webgl';
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    return ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : String(ctx.getParameter(ctx.RENDERER));
  });
  console.log(`webgl renderer: ${gl}`);

  // 1. read the composition metadata (this is what selectComposition() does)
  await page.evaluate(() => window.remotion_setBundleMode({ type: 'evaluation' }));
  await page.waitForFunction(() => window.remotion_renderReady === true, { timeout: 120000 });
  const meta = await page.evaluate(async (id) => {
    const m = await window.remotion_calculateComposition(id);
    return { ...m, props: m.serializedResolvedPropsWithCustomSchema };
  }, composition);
  console.log(`composition ${composition}: ${meta.width}x${meta.height}, ${meta.durationInFrames} frames, ${meta.fps} fps`);

  // 2. mount it (this is what make-page.js does)
  await page.evaluate((m) => {
    window.remotion_setBundleMode({
      type: 'composition',
      compositionName: m.id,
      serializedResolvedPropsWithSchema: m.props,
      compositionDurationInFrames: m.durationInFrames,
      compositionFps: m.fps,
      compositionHeight: m.height,
      compositionWidth: m.width,
      compositionDefaultCodec: m.defaultCodec ?? null,
      compositionDefaultOutName: m.defaultOutName ?? null,
      compositionDefaultVideoImageFormat: m.defaultVideoImageFormat ?? null,
      compositionDefaultPixelFormat: m.defaultPixelFormat ?? null,
      compositionDefaultProResProfile: m.defaultProResProfile ?? null,
      compositionDefaultSampleRate: m.defaultSampleRate ?? null,
    });
  }, meta);
  await page.waitForFunction(() => window.remotion_renderReady === true, { timeout: 120000 });
  console.log(`mounted in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  // 3. seek, wait for the frame to be ready, capture
  // The DOM (captions) re-renders synchronously but R3F invalidates its canvas on the next tick, so
  // screenshotting straight after renderReady captures the PREVIOUS 3D frame with the NEW caption.
  const t1 = Date.now();
  await page.evaluate(([f, c]) => window.remotion_setFrame(f, c, 0), [frame, composition]);
  await page.waitForFunction(() => window.remotion_renderReady === true, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.evaluate((ms) => new Promise((r) => {
    let n = 0;
    const tick = () => (++n >= 2 ? setTimeout(r, ms) : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), settleMs);
  const buf = await page.screenshot({
    type: 'jpeg', quality: 85,
    clip: { x: 0, y: 0, width: meta.width, height: meta.height },
  });
  const out = join(process.cwd(), 'out', `farm-probe-${frame}.jpeg`);
  writeFileSync(out, buf);
  console.log(`frame ${frame} -> ${out}  (${((Date.now() - t1) / 1000).toFixed(2)} s, ${Math.round(buf.length / 1024)} KB)`);
} catch (err) {
  console.error(`FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  if (!remote) await browser.close().catch(() => {});
  child?.kill();
  server.close();
}
