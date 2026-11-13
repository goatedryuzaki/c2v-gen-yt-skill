/**
 * Preview one frame -- the working replacement for `npx remotion still`, which captures a
 * transparent canvas for this composition (R3F never draws before Remotion takes the shot).
 *
 *   npm run shot -- 352
 *
 * Why two frames: the first frame of every fresh Chromium tab is captured before the WebGL
 * canvas has drawn (blank backdrop + captions). Frames after that are correct, so we render
 * [n-1, n] and keep the second one. Costs one extra frame (~10 s here), not a whole re-render.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const frame = Number(process.argv[2]);
if (!Number.isInteger(frame) || frame < 0) {
  console.error('usage: npm run shot -- <frame>');
  process.exit(1);
}

const comp = process.env.COMP ?? 'RicksClipsFull';
const first = Math.max(0, frame - 1);
const tmp = join('out', '_shot');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// Call the CLI's own JS with the running node binary: no .cmd, no shell, so paths with spaces are fine.
const remotionCli = join(process.cwd(), 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
execFileSync(process.execPath, [remotionCli, 'render', 'src/index.ts', comp, tmp, `--frames=${first}-${frame}`, '--concurrency=1', '--sequence'], { stdio: 'inherit' });

const pick = (f) => readdirSync(tmp).find((n) => n.includes(`-${f}.`));
let src = pick(frame);
if (!src) src = readdirSync(tmp).sort().pop();
if (!src) {
  console.error('nothing was rendered');
  process.exit(1);
}
const dst = join('out', `shot-${frame}${src.slice(src.lastIndexOf('.'))}`);
copyFileSync(join(tmp, src), dst);
rmSync(tmp, { recursive: true, force: true });
console.log(`\nframe ${frame} -> ${dst}  (${existsSync(dst) ? 'ok' : 'missing'})`);
