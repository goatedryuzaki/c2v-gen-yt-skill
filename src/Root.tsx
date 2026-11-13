import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Composition } from 'remotion';
import { BridgeShort, BRIDGE_FRAMES } from './bridge/Bridge';

/** Prints the WebGL renderer the render tab is really using. `swangle` in the output means Chrome fell back to
 *  SwiftShader (software, ~3x slower); anything with "Intel", "NVIDIA", "ANGLE (…Direct3D11…)" means the GPU. */
const GpuCheck: React.FC = () => {
  const [info, setInfo] = useState('…');
  useEffect(() => {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return setInfo('NO WEBGL CONTEXT');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    setInfo([
      `VERSION  ${gl.getParameter(gl.VERSION)}`,
      `VENDOR   ${gl.getParameter(gl.VENDOR)}`,
      `RENDERER ${ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}`,
      `MAX TEX  ${gl.getParameter(gl.MAX_TEXTURE_SIZE)}`,
    ].join('\n'));
  }, []);
  return (
    <AbsoluteFill style={{ background: '#0d0f14', color: '#7CFFB2', fontFamily: 'monospace', fontSize: 34, padding: 50, whiteSpace: 'pre-wrap' }}>
      {info}
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Which GL backend the render tab is using: npm run gpu-check */}
      <Composition id="GpuCheck" component={GpuCheck} durationInFrames={30} fps={30} width={1080} height={1920} />

      {/* 6-second showcase: Shot 1 & 2 hook with 3D bridge, bean soldiers, and audio */}
      <Composition
        id="RicksClipsShowcase"
        component={BridgeShort}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* Full story composition */}
      <Composition
        id="RicksClipsFull"
        component={BridgeShort}
        durationInFrames={BRIDGE_FRAMES}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
