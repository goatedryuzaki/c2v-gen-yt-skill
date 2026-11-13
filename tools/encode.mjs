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
// --delivery: same pixels, a bitrate a weak CPU can decode in real time. An HD 2500-class machine
// decodes about 10-14 Mbps of 1080p30 x264 fine, but chokes at the 50+ Mbps the crf 18 veryfast
// master produces -- which looked like "stuttering" on THIS machine, not a broken render.
const delivery = process.argv.includes('--delivery');
const preset = arg('preset', delivery ? 'medium' : 'veryfast');
const crf = arg('crf', delivery ? '23' : '18');
const maxrate = arg('maxrate', delivery ? '14M' : null);
const bufsize = arg('bufsize', delivery ? '28M' : null);
const audio = arg('audio', join('public', 'bridge_voiceover.wav'));
const out = arg('out', join('out', delivery ? 'final_web.mp4' : 'final.mp4'));

const args = [
  '-hide_banner', '-y',
  '-framerate', '30', '-start_number', String(first), '-i', join(dir, 'element-%d.jpeg'),
  ...(existsSync(audio) ? ['-i', audio] : []),
  // The JPEG frames are full-range sRGB. Encode as standard limited-range Rec.709 and TAG it, or
  // players that ignore the range flag show crushed blacks / washed colour on a phone.
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-c:v', 'libx264', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p',
  ...(delivery && maxrate ? ['-profile:v', 'high', '-level', '4.1', '-maxrate', maxrate, '-bufsize', bufsize] : []),
  ...(existsSync(audio) ? ['-c:a', 'aac', '-b:a', '192k'] : []),
  // Deliberately no -shortest: the voiceover is 65.2 s and the film is 67.5 s (2025 frames), so
  // -shortest would trim the last 2.3 s of picture. Video decides the length; audio just ends first.
  '-movflags', '+faststart',
  out,
];
console.log(`encoding ${last - first + 1} frames -> ${out}${delivery ? `  (delivery: crf ${crf}, ${preset} preset, capped at ${maxrate} -- smooth on a 2-core i3)` : ''}`);
execFileSync(ffmpeg, args, { stdio: 'inherit' });
console.log('done');
