/**
 * Encode the JPEG frames written by tools/render-frames.mjs into the final MP4, with the voiceover muxed once.
 *
 *   node tools/encode.mjs [--from=0] [--to=2024] [--audio=public/bridge_voiceover.wav] [--out=out/final.mp4]
 *
 * Kept separate from the render on purpose: encoding is cheap (a few minutes), so re-encoding after a
 * crash, a re-timed cut or an audio change never costs you a re-render.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};

const dir = join(process.cwd(), 'out', 'frames');
if (!existsSync(dir)) {
  console.error('out/frames is missing -- run: node tools/render-frames.mjs');
  process.exit(1);
}

const have = readdirSync(dir)
  .map((n) => Number((n.match(/element-(\d+)\./) ?? [])[1]))
  .filter((n) => Number.isInteger(n))
  .sort((a, b) => a - b);
if (have.length === 0) {
  console.error('out/frames has no element-<frame>.jpeg files');
  process.exit(1);
}

const first = Number(arg('from', have[0]));
const last = Number(arg('to', have[have.length - 1]));
const missing = [];
for (let f = first; f <= last; f++) if (!have.includes(f)) missing.push(f);
if (missing.length) {
  console.error(`frames missing between ${first} and ${last}: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' …' : ''}`);
  process.exit(1);
}

const ffmpeg = join('node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
const audio = arg('audio', join('public', 'bridge_voiceover.wav'));
const out = arg('out', join('out', 'final.mp4'));

const args = [
  '-hide_banner', '-y',
  '-framerate', '30', '-start_number', String(first), '-i', join(dir, 'element-%d.jpeg'),
  ...(existsSync(audio) ? ['-i', audio] : []),
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
  ...(existsSync(audio) ? ['-c:a', 'aac', '-b:a', '192k'] : []),
  '-shortest', '-movflags', '+faststart',
  out,
];
console.log(`encoding ${last - first + 1} frames -> ${out}`);
execFileSync(ffmpeg, args, { stdio: 'inherit' });
console.log('done');
