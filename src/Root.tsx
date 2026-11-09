import React from 'react';
import { Composition } from 'remotion';
import { BridgeShort, BRIDGE_FRAMES } from './bridge/Bridge';

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
