# The render farm

One machine is no longer doing the whole film. Several machines each render a chunk of frames and
report to one coordinator, which shows you what is happening and lets you stop it safely.

It does **not** reimplement rendering. Each machine runs the same Remotion CLI you would run
locally, on its own GPU, with its own code from the project folder. The coordinator only hands out
frame ranges and receives JPEGs.

## What you get

- a dashboard at `http://<this-pc-ip>:4000` showing every frame chunk and which machine/GPU owns it
- per-machine: detected GPU (the browser's actual WebGL renderer string), frames in flight, rate
- Start / Stop; **Stop finishes the current chunk and saves progress**, then asks each worker to quit
- nothing to install on worker PCs — a portable Node ZIP and a copy of the project

## The coordinator (this PC)

```bash
npm run farm                     # dashboard on port 4000
npm run farm -- --chunk=25       # smaller chunks = finer spread across machines
npm run farm -- --from=0 --to=674 --chunk=25   # re-render only part of the film
```

Open `http://localhost:4000`. Press **Start** once you have workers connected.

## Each worker (no installs)

1. Copy the project folder, including `node_modules`, to the worker PC
   (USB stick or network share is fine).
2. Extract the portable Node ZIP anywhere, e.g. `C:\node`:
   `https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip`
   Nothing is installed, registered or added to PATH.
3. Double-click `tools\farm\start-worker.bat`, after setting `SERVER_IP` (IP of the coordinator PC),
   `LABEL` and `CONC`.
   - **CONC = 2** for a 2-core / 4-thread CPU, **3** for 4-core / 8-thread with 8 GB RAM.
4. The agent prints the browser's real WebGL renderer string before it claims anything.
   Check that line: if it says `Intel(R) HD Graphics 2500` or `NVIDIA GeForce GT 710` you are on the
   GPU; if it says `SwiftShader`, `Basic Render Driver` or `WARP`, that machine is rendering on the
   CPU and the dashboard will mark it with a red warning.
5. Watch the dashboard — the machine appears within a second and starts claiming chunks.

GPU rule: rendering goes through the browser anyway (that is what Remotion does), so the GPU is used
as long as the browser reports a real adapter. `--gl=angle` is already set in `remotion.config.ts`.

## Network notes

- all worker→coordinator traffic is **outbound from the worker**; nothing needs to be opened on the
  worker PC
- the coordinator listens on port 4000, so the *coordinator* PC may need the Windows Firewall prompt
  accepted ("Allow access on private networks") the first time
- uploads are one JPEG per HTTP POST, ~450 KB each; even 2000 frames is under a gigabyte

## How work is divided

- chunks (default 25 frames) are handed to whichever worker asks first; faster machines take more
- chunks whose frames already exist in `out/frames/` are skipped automatically, so pressing Start
  never throws away finished work; to re-render, delete the frames or pass `--from` / `--to`
- `out/frames/` on the coordinator fills up as chunks finish; encoding is unchanged:
  `npm run encode`
- chunks that fail are not silently retried in a loop; the dashboard marks them `failed` and, once
  everything else settles, tells you how many frames are missing so you can press Start to retry

## Current status

- local test on this PC: chunk 0-2 and 3-5 rendered, uploaded and accounted → dashboard correct
- the warm-up blank-frame bug is handled: every chunk renders `concurrency` extra frames in front,
  only the requested range is uploaded, and frames 0-1 (start of film, no room for a lead) are filled
  from frame 2 as a one-frame hold
- a second machine (the i7 + GT 710) has not been tested yet — use `tools/perf/shot.mjs` and the
  `GpuCheck` composition there to confirm the GPU before a full run
