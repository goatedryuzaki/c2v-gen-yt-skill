# 3D Cel-Shaded Cartoon Video Generator (Ricks Clips Style)

Autonomous Remotion + Three.js 2.5D animation pipeline matching the signature visual style of Ricks Clips (*"The Job Nobody Wants in Japan"*).

## Features
- **3D Cel-Shaded Engine (`ThreeCanvas`)**: Saturated 3D cartoon worlds with custom ink edge passes (`InkPass`).
- **Thin-Lens Bokeh Blur (`LensBlurEffect`)**: 64-tap Vogel disc depth of field with foreground diffusion.
- **2D Character Cards (`toon.ts`)**: Bean-shaped heads, noodle limbs, and expressive cartoon facial features.
- **Captions & Audio**: Animated karaoke subtitles synced to high-energy Gemini TTS voiceovers.

---

## Quick Start on the New Machine

### 1. Requirements
- Node.js (v18 or v20+)
- Git
- FFmpeg (optional, Remotion bundles its own, but recommended in PATH)

### 2. Setup
```bash
git clone <YOUR_REPO_URL>
cd "Story Video Generator"
npm install
```

### 3. Check the GPU is actually being used
This project must render on the real GPU (`angle`), not SwiftShader — it is the difference between
~3 hours and ~10 hours for the full film.
```bash
npm run gpu-check
# -> out/gpu/element-1.jpeg: look for "Direct3D11", not "SwiftShader"
```
Full measurements and the reasoning behind every setting: **[docs/PERFORMANCE.md](docs/PERFORMANCE.md)**.

### 4. Preview a frame
`npx remotion still` produces a blank canvas in this project. Use the two-frame shot tool instead:
```bash
npm run shot -- 352
# -> out/shot-352.jpeg
```

### 5. Render the full film at 100% Maximum Quality
Renders are chunked and resumable — safe to interrupt, and re-running skips finished chunks:
```bash
npm run frames -- --from=0 --to=2024 --chunk=25
# -> out/frames/element-<n>.jpeg  (every pass on: DOF, bloom, ink, tone mapping, grain)

npm run encode
# -> out/final.mp4  (1080x1920, h264 crf 18, voiceover muxed in)
```

Draft pass for checking timing/captions (quarter of the pixels, ~2.5-3x faster):
```bash
npm run frames -- --from=0 --to=2024 --chunk=25 --scale=0.5
```

### Splitting the render across machines
If you have a second PC, it can render frames in parallel and the first machine only encodes:
```bash
npm run farm       # this PC: dashboard at http://localhost:4000
```
Then on the other machine (no installs: portable Node ZIP + a copy of the project):
```bash
node tools/farm/agent.mjs --server=http://<this-pc-ip>:4000 --label="i7 / GT 710" --conc=3
```
The agent prints the actual WebGL renderer string it got from the browser, and the dashboard shows
which machine owns which chunk, with a Start button and a Stop button that finishes the current chunk
and saves progress. Full guide: **[docs/FARM.md](docs/FARM.md)** — adding any new machine:
**[docs/ADD-WORKER-PC.md](docs/ADD-WORKER-PC.md)** (no installs needed).

The 6-second hook showcase:
```bash
npx remotion render src/index.ts RicksClipsShowcase out/showcase.mp4
```

### 6. Interactive Studio Preview
To open the interactive Remotion Studio in your browser:
```bash
npm start
```
