---
name: gemini-tts
description: Generate high-quality voiceover and speech audio using Gemini TTS (gemini-3.8-flash-tts / gemini-2.5-flash-preview-tts). Use when generating narration, dialogue, storytelling voiceovers, character voices, or audio for Remotion and short-form video generation.
version: 1.0.0
---

# Gemini TTS (Text-to-Speech) Generation

Generate crystal-clear 24 kHz WAV voiceovers directly using Google Gemini's speech models (`gemini-3.8-flash-tts`, `gemini-2.5-flash-preview-tts`).

## Voices Available

Gemini TTS provides natural expressive voices:
- **Puck**: Engaging, youthful, expressive (great for upbeat narrations, hooks, dynamic storytelling).
- **Charon**: Deep, resonant, authoritative (great for dramatic history, mysteries, documentary style).
- **Kore**: Warm, articulate, balanced (standard female voice, versatile for explainers).
- **Fenrir**: Rugged, intense, cinematic (ideal for action, fantasy, intense story beats).
- **Aoede**: Melodic, gentle, emotional (ideal for poetry, reflective moments, soft explainers).

## Quick Execution via Script

A preconfigured script is provided at `scripts/gemini_tts.py`:

```bash
# Generate voiceover for your video
python scripts/gemini_tts.py --text "A man once sold the Eiffel Tower. Not once, but twice." --voice Charon --out public/voiceover.wav
```

### Parameters:
- `--text`, `-t` (required): Spoken text. Use plain conversational sentences, contractions, and natural punctuation.
- `--out`, `-o` (optional): Output WAV file path (defaults to `public/voiceover.wav`).
- `--voice`, `-v` (optional): Voice name (`Puck`, `Charon`, `Kore`, `Fenrir`, `Aoede`). Default is `Puck`.
- `--model`, `-m` (optional): TTS model (default: `gemini-3.8-flash-tts` with auto-fallback to `gemini-2.5-flash-preview-tts`).

## Programmatic Usage in Python

```python
import os
from scripts.gemini_tts import generate_tts

audio_path = generate_tts(
    text="Step 1: Write an engaging hook. Step 2: Let Remotion build the visuals.",
    output_path="public/audio/scene1.wav",
    voice="Puck"
)
```

## Integration with Remotion & Video Pipelines

1. Generate the voiceover first (`public/voiceover.wav`).
2. Probe the duration with FFmpeg or `ffprobe`:
   ```bash
   ffprobe -i public/voiceover.wav -show_entries format=duration -v quiet -of csv="p=0"
   ```
3. Calculate video duration in frames: `durationInFrames = Math.ceil(durationInSeconds * fps)`.
4. Import and play the audio in the Remotion composition:
   ```tsx
   import { Audio, staticFile } from 'remotion';
   
   export const MyVideo = () => {
     return (
       <>
         <Audio src={staticFile('voiceover.wav')} />
         {/* Visual components synced to timing */}
       </>
     );
   };
   ```
