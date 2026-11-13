# Rendering this film on a 2012 office PC

Measured on the actual machine:

| | |
|---|---|
| CPU | Intel Core i3-3220 — 2 cores / 4 threads, 3.3 GHz (Ivy Bridge, 2012) |
| RAM | 8 GB, **one** DIMM (single channel — the iGPU shares that bandwidth) |
| GPU | Intel HD Graphics 2500, driver 10.18.10.5161 (2016), 2 GB shared |
| Disk | C: 27 GB free, project inside OneDrive |
| Film | 2025 frames, 1080×1920 @ 30 fps (67.5 s) |

Nothing here adds horsepower. Everything below removes *waste* and leaves the picture identical,
because the style is carried by the shaders (ink, cel shading, film grain), not by how many
pixels the intermediate blur passes run at.

---

## 1. Where the time went

Measured on frames 350-353, `--concurrency=2`, ~22 s of bundling/browser in every run:

| Config | 4 frames | per frame |
|---|---|---|
| default (`swangle` = software WebGL) | 93.7 s | **17.9 s** |
| `--gl=angle` (the real Intel GPU) | 45.7 s | **5.95 s** |
| post chain disabled (scene only) | 52.2 s | 7.6 s |
| depth of field off | 74.4 s | 13.1 s |
| bloom off | 79.5 s | 14.4 s |
| ink off | 82.0 s | 15.0 s |
| `dpr: 0.5` (quarter of the pixels) | 47.4 s | 6.4 s |

Read that as: **the post chain was ~60 % of the frame**, and the machine was spending all of it
on the CPU. The scene itself (geometry, characters, lighting) is only ~7.6 s/frame in software.

The one-line reason: Remotion v4 defaults to `swangle`, which is SwiftShader — WebGL rasterised
on two CPU cores. The Intel HD 2500 was never used.

`npm run gpu-check` renders the backend into an image. Current output:

```
VERSION  WebGL 2.0 (OpenGL ES 3.0 Chromium)
RENDERER ANGLE (Intel, Intel(R) HD Graphics (0x00000152) Direct3D11 vs_5_0 ps_5_0, D3D11)
```

---

## 2. What was changed

### a. Use the GPU — `remotion.config.ts`

`Config.setChromiumOpenGlRenderer('angle')`. Same shaders, same maths, 3.0× faster, and the A/B
stills came out at **PSNR 39-51 dB** against the software render (imperceptible; `tools/perf/imgdiff.py`
prints the number). If a render ever dies with a GPU-process crash or a driver reset, change it
back to `'swangle'` — everything else still works, just slower.

### b. Bloom at half resolution — `src/bridge/Bridge.tsx`

A bloom pyramid is a low-pass filter by definition: it is fed only pixels brighter than 1.0 and
what comes out is a soft halo. It was running its whole mip chain at full 1080×1920. It now starts
at 540×960 with `levels: 5` (instead of 6), so the halo covers the same number of *output* pixels
as before — only the grid it is built on is coarser. This is how every game engine does bloom.
Cost of the pass: 3.5 s → ~0.9 s/frame in software terms; identical stills.

### c. Shadow map not re-rendered every frame — `src/bridge/Bridge.tsx`

The sun is frozen per shot and the set is static; only the bouncing deck and the flags move, and
their shadows are soft. The 4096² shadow map of the whole world was being rebuilt every frame.
It is now refreshed every other frame (and always on a canvas' first frame, so a crossfade layer
never appears shadowless).

Resolution of the map itself was left at 4096 on purpose — that is a visible style element, and
the throttle already removes most of the cost.

### d. Concurrency stays at 2

4 hardware threads: one tab renders, one tab encodes, and 8 GB is not enough for more Chromium
instances. `--concurrency=1` is only marginally cheaper and was measurably not worth it.

---

## 3. What it costs now

24 frames of shot 6 through the real pipeline (`tools/render-frames.mjs`, chunk 12):
**6.4 s/frame wall**, including two Chromium startups. Pure render rate ≈ 4.7-5 s/frame on that
shot, 10 s/frame on the heavy aerials.

Full film, 2025 frames: **~3 hours**, versus ~10 hours before. A half-scale draft
(`--scale=0.5`) runs ~2.5-3× faster again and is fine for judging timing, captions and voice.

Numbers on this machine move by ±30 % with whatever else is open (a single Chrome window with a
few tabs was enough to double a benchmark run). Measure, do not trust a single sample.

---

## 4. The render workflow

```bash
# 1. Is the GPU actually being used?
npm run gpu-check
#    -> out/gpu/element-1.jpeg  (look for "Direct3D11", not "SwiftShader")

# 2. Preview one frame
npm run shot -- 352
#    -> out/shot-352.jpeg

# 3. Render the film in resumable chunks (safe to interrupt, safe to restart)
npm run frames -- --from=0 --to=2024 --chunk=25
#    full quality, all filters, writes out/frames/element-<n>.jpeg
#    re-running it skips every chunk already on disk

#    draft pass for timing review, quarter of the pixels:
npm run frames -- --from=0 --to=2024 --chunk=25 --scale=0.5

# 4. Encode + mux the voiceover (cheap; re-run after any cut or audio change)
npm run encode          # full-quality master, out/final.mp4
node tools/encode.mjs --delivery
#    -> out/final_web.mp4  (crf 23, medium preset, capped at 14 Mbps, bt709)
#    A 1080x1920 crf 18 master is ~50 Mbps and stutters on a 2-core i3;
#    this one plays smoothly on the machine that rendered it.
```

Cost of each step on this machine:

| step | time |
|---|---|
| one frame | ~10 s (plus ~22 s bundling) |
| draft at 0.5×, full film | ~60-70 min |
| final, full film | ~3 h |
| encode 67 s of 1080×1920 | ~3-5 min |

### Isolating a slow shot

`bench/*.json` are `--props` files that switch individual passes off, so you can measure one
shot instead of guessing:

```bash
npx remotion render src/index.ts RicksClipsFull out/probe --frames=1050-1053 --sequence --props=bench/nolens.json
```

`all`, `nolens`, `noink`, `nobloom`, `nopost`, `dpr05`.

---

## 5. Two real bugs found while measuring

Neither is caused by the changes above — both were there before.

**a. `remotion still` always produces a blank frame.** The WebGL canvas has not drawn when
Remotion takes the screenshot, so you get the flat backdrop plus captions. The
"deliver-and-verify" step in `SYSTEM_PROMPT.md` has therefore been giving you empty images.
Use `npm run shot -- <frame>`, which renders two frames and keeps the second.

**b. The first captured frame of every Chromium tab is blank.** A full render loses one frame per
tab (2 frames at the start with `--concurrency=2`). `tools/render-frames.mjs` compensates: each
chunk renders `concurrency` sacrificial frames in front and copies out only the real range, and
frame 0 is filled from frame 1 (an invisible one-frame hold).

Fixing (a) and (b) properly means making the composition hold `delayRender` until R3F has drawn
once. Attempts via `advance()`, `useFrame` and `preserveDrawingBuffer` did not work in this
Remotion/three version; the workarounds above are reliable.

### Checking a finished render

File size is a poor signal — a blank frame over a dark backdrop still compresses small — so
`tools/perf/blankcheck.py` looks at the picture: it drops the caption band and measures the colour
variance of the canvas region. A real shot varies; a failed capture is flat.

```bash
python tools/perf/blankcheck.py out/frames
```

A uniform **white** frame is not a defect: `Bridge.tsx` paints a full-white overlay at
`FLASH_AT..FLASH_AT+3` (`story.ts`), so the shot change at frame 130 is white by design. The tool
separates the two by mean brightness and ignores the flash.

**c. `-shortest` silently truncates the film.** The voiceover is 65.2 s but the film is 67.5 s
(2025 frames). With `-shortest` ffmpeg stops at the shorter stream, cutting the last 2.3 s of
picture. `tools/encode.mjs` therefore lets the video decide the length and the audio simply ends
first.

---

## 6. What is still on the table

Ordered by payoff, none of it implemented yet:

1. **Depth of field at half resolution.** The lens pass is still the single most expensive thing
   left (~27 % of frame time in software, and 112 texture fetches per pixel at full res). Doing
   the gather on a half-res colour+CoC target and compositing by CoC is the standard technique and
   is visually lossless — blur is already low-frequency. Worth another ~25-30 %. It means rewriting
   `LensBlur` as a `Pass` with its own render targets (pattern: `InkPass`).
2. **Move the project out of OneDrive.** `node_modules` and 2000 frames written through a sync
   folder is pure overhead; `C:\dev\story-video` syncs nothing. Keep a copy in OneDrive if you
   want the backup.
3. **24 fps instead of 30** if the platform allows it: a straight 20 % off, no other change.
4. **Free remote horsepower** if a render ever has to happen while the PC is off: a public GitHub
   repo gets unlimited free Actions minutes on 4-core runners (about 2× this machine + no GPU),
   and Colab's free T4 can drive the same Remotion render through Xvfb. Both are more setup than
   they are worth unless you need the machine back.
