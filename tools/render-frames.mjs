/**
 * Crash-resumable frame renderer for slow machines.
 *
 *   node tools/render-frames.mjs --from=0 --to=2024 [--chunk=25] [--scale=1] [--gl=angle] [--comp=RicksClipsFull]
 *
 * Renders JPEG frames with `remotion render --sequence`, one chunk per Chromium launch, and SKIPS chunks whose
 * frames already exist. An all-night render that dies at hour 6 (driver reset, power cut, Windows update) resumes
 * instead of restarting.
 *
 * Why the temp folder: a fresh Chromium tab captures its very first frame before the WebGL canvas has drawn, so
 * each chunk is rendered with one extra frame in front and only the requested range is copied out -- the blank
 * one is thrown away. Frame 0 would still be that blank frame, so it is filled with frame 1 (a one-frame hold).
 *
 * Then: node tools/encode.mjs
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};

const from = Number(arg('from', 0));
const to = Number(arg('to', 2024));
const chunk = Number(arg('chunk', 25));
const conc = Number(arg('conc', 2));
const scale = arg('scale', null);
const gl = arg('gl', null);
const comp = arg('comp', 'RicksClipsFull');

const dir = join(process.cwd(), 'out', 'frames');
const tmp = join(dir, '_chunk');
mkdirSync(dir, { recursive: true });

const framePath = (f) => join(dir, `element-${f}.jpeg`);
// Call the CLI's own JS with the running node binary: no .cmd, no shell, so paths with spaces are fine.
const remotionCli = join(process.cwd(), 'node_modules', '@remotion', 'cli', 'remotion-cli.js');

let rendered = 0;
let skipped = 0;
const t0 = Date.now();

for (let a = from; a <= to; a += chunk) {
  const b = Math.min(a + chunk - 1, to);
  const missing = [];
  for (let f = a; f <= b; f++) if (!existsSync(framePath(f))) missing.push(f);
  if (missing.length === 0) {
    skipped += b - a + 1;
    process.stdout.write(`skip ${a}-${b} (already on disk)\n`);
    continue;
  }

  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  // One sacrificial frame per render tab (each tab's first capture is blank): Remotion hands frame i to
  // tab i % concurrency, so `conc` frames in front covers every tab.
  const lead = Math.max(0, a - conc);
  const args = ['render', 'src/index.ts', comp, tmp, `--frames=${lead}-${b}`, '--sequence', `--concurrency=${conc}`];
  if (scale) args.push(`--scale=${scale}`);
  if (gl) args.push(`--gl=${gl}`);
  process.stdout.write(`render ${a}-${b}${scale ? ` @${scale}x` : ''}\n`);
  execFileSync(process.execPath, [remotionCli, ...args], { stdio: 'inherit' });

  const files = readdirSync(tmp);
  let copied = 0;
  for (const f of missing) {
    const name = files.find((n) => n.endsWith(`-${f}.jpeg`));
    if (name) {
      copyFileSync(join(tmp, name), framePath(f));
      copied++;
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  if (copied === 0) {
    process.stderr.write(`chunk ${a}-${b} produced no frames -- stopping\n`);
    process.exit(1);
  }

  // Frame 0 is always the sacrificial one; duplicate frame 1 so the film does not open on a blank.
  if (a === 0 && !existsSync(framePath(0)) && existsSync(framePath(1))) {
    copyFileSync(framePath(1), framePath(0));
    process.stdout.write('  frame 0 filled from frame 1 (tab warm-up frame is blank)\n');
  }

  rendered += copied;
  const rate = (Date.now() - t0) / 1000 / Math.max(1, rendered);
  const left = (to - b) * rate;
  process.stdout.write(`  ${b - from + 1}/${to - from + 1} frames  ${rate.toFixed(1)} s/frame  ~${(left / 60).toFixed(0)} min left\n`);
}

process.stdout.write(`\ndone: ${rendered} rendered, ${skipped} skipped, ${((Date.now() - t0) / 60000).toFixed(1)} min\n`);
process.stdout.write('next: node tools/encode.mjs\n');
