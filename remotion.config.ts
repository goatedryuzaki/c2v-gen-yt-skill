import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(85);
Config.setOverwriteOutput(true);

// Rendering budget (measured on an i3-3220 / 8 GB / Intel HD 2500):
//   concurrency 2 = one tab rendering + one tab encoding; more than that just thrashes 8 GB.
Config.setConcurrency(2);
Config.setX264Preset('veryfast');
Config.setTimeoutInMilliseconds(120000);
Config.setChromiumDisableWebSecurity(true);

// The WebGL part of this film is a real 3D scene + a post chain, so it is fill-rate bound.
// Remotion defaults to `swangle` = SwiftShader = WebGL rasterised on the CPU. On this machine
// that costs ~18 s/frame. `angle` hands the same shaders to the GPU (D3D11 on Windows) and
// measures ~6 s/frame with a pixel-identical image (PSNR 39-51 dB, see tools/perf/imgdiff.py).
// If a render ever dies with "GPU process crashed" / a driver reset, set this to 'swangle'.
Config.setChromiumOpenGlRenderer('angle');
