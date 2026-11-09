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

### 3. Render at 100% Maximum Quality
To render the full short video with all post-processing effects (Depth Blur, Bloom, Inking, Tone Mapping):
```bash
npx remotion render src/index.ts RicksClipsFull out/full_video.mp4
```

To render the 6-second hook showcase:
```bash
npx remotion render src/index.ts RicksClipsShowcase out/showcase.mp4
```

### 4. Interactive Studio Preview
To open the interactive Remotion Studio in your browser:
```bash
npm start
```
