import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

// Scene 1: The Hook (0 - 150)
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 130 },
  });

  const subSpring = spring({
    frame: frame - 28,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const punchSpring = spring({
    frame: frame - 65,
    fps,
    config: { damping: 12, stiffness: 160 },
  });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
      <div
        style={{
          transform: `scale(${titleSpring})`,
          opacity: interpolate(titleSpring, [0, 0.5], [0, 1]),
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: '#f59e0b',
          marginBottom: 20,
        }}
      >
        PARIS • 1925
      </div>

      <h1
        style={{
          transform: `scale(${interpolate(titleSpring, [0, 1], [0.85, 1])})`,
          opacity: interpolate(titleSpring, [0, 0.4], [0, 1]),
          fontSize: 78,
          fontWeight: 900,
          lineHeight: 1.1,
          textAlign: 'center',
          color: '#ffffff',
          textShadow: '0 10px 40px rgba(0,0,0,0.9)',
          margin: 0,
        }}
      >
        HE SOLD THE <span style={{ color: '#fbbf24', textDecoration: 'underline' }}>EIFFEL TOWER</span>
      </h1>

      {frame >= 28 && (
        <div
          style={{
            transform: `translateY(${interpolate(subSpring, [0, 1], [30, 0])}px)`,
            opacity: interpolate(subSpring, [0, 0.5], [0, 1]),
            fontSize: 42,
            fontWeight: 700,
            color: '#94a3b8',
            marginTop: 30,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          FOR SCRAP METAL
        </div>
      )}

      {frame >= 65 && (
        <div
          style={{
            transform: `scale(${punchSpring})`,
            opacity: interpolate(punchSpring, [0, 0.5], [0, 1]),
            marginTop: 48,
            padding: '16px 36px',
            borderRadius: 999,
            backgroundColor: '#ef4444',
            color: '#ffffff',
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: '0.02em',
            boxShadow: '0 0 50px rgba(239, 68, 68, 0.5)',
          }}
        >
          AND HE DIDN'T EVEN OWN IT
        </div>
      )}
    </AbsoluteFill>
  );
};

// Scene 2: The Con (150 - 320)
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const nameSpring = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const cardSpring = spring({ frame: frame - 25, fps, config: { damping: 15, stiffness: 110 } });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
      <div
        style={{
          transform: `scale(${nameSpring})`,
          opacity: interpolate(nameSpring, [0, 0.5], [0, 1]),
          fontSize: 32,
          fontWeight: 700,
          color: '#38bdf8',
          letterSpacing: '0.2em',
          marginBottom: 16,
        }}
      >
        THE CON ARTIST
      </div>

      <div
        style={{
          transform: `scale(${interpolate(nameSpring, [0, 1], [0.9, 1])})`,
          fontSize: 84,
          fontWeight: 900,
          textAlign: 'center',
          color: '#ffffff',
          letterSpacing: '-0.02em',
        }}
      >
        “COUNT” VICTOR LUSTIG
      </div>

      {frame >= 25 && (
        <div
          style={{
            transform: `scale(${cardSpring}) translateY(${interpolate(cardSpring, [0, 1], [40, 0])}px)`,
            opacity: interpolate(cardSpring, [0, 0.5], [0, 1]),
            marginTop: 50,
            padding: '36px 48px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '2px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 28,
            backdropFilter: 'blur(20px)',
            maxWidth: 820,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 38, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.35 }}>
            Invited Paris’s biggest scrap barons to a luxury hotel suite...
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 30,
              fontWeight: 600,
              color: '#38bdf8',
              letterSpacing: '0.05em',
            }}
          >
            CONFIDENTIAL GOVERNMENT CONTRACT
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// Scene 3: The Score (320 - 480)
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const countSpring = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const amount = Math.floor(interpolate(countSpring, [0, 1], [0, 50000]));

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          color: '#4ade80',
          letterSpacing: '0.15em',
          marginBottom: 20,
        }}
      >
        ONE DEALER TOOK THE BAIT
      </div>

      <div
        style={{
          fontSize: 110,
          fontWeight: 900,
          color: '#22c55e',
          textShadow: '0 0 60px rgba(34, 197, 94, 0.4)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}
      >
        ${amount.toLocaleString()}
      </div>

      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: '#ffffff',
          marginTop: 20,
          letterSpacing: '0.08em',
        }}
      >
        IN COLD HARD CASH
      </div>

      <div
        style={{
          fontSize: 28,
          color: '#94a3b8',
          marginTop: 20,
          fontWeight: 500,
        }}
      >
        (Equivalent to over $1,000,000 today)
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: The Embarrassment (480 - 610)
const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const textSpring = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
      <div
        style={{
          transform: `scale(${textSpring})`,
          fontSize: 32,
          fontWeight: 700,
          color: '#f43f5e',
          letterSpacing: '0.2em',
          marginBottom: 24,
        }}
      >
        THE TWIST
      </div>

      <div
        style={{
          fontSize: 68,
          fontWeight: 900,
          textAlign: 'center',
          color: '#ffffff',
          lineHeight: 1.2,
          maxWidth: 900,
        }}
      >
        The buyer was so humiliated...
      </div>

      <div
        style={{
          transform: `translateY(${interpolate(textSpring, [0, 1], [30, 0])}px)`,
          marginTop: 36,
          fontSize: 52,
          fontWeight: 800,
          color: '#fda4af',
          textAlign: 'center',
        }}
      >
        HE NEVER CALLED THE POLICE.
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: The Climax (610 - 730)
const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hit1 = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const hit2 = spring({ frame: frame - 35, fps, config: { damping: 10, stiffness: 160 } });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
      <div
        style={{
          transform: `scale(${hit1})`,
          opacity: interpolate(hit1, [0, 0.4], [0, 1]),
          fontSize: 40,
          fontWeight: 800,
          color: '#fbbf24',
          letterSpacing: '0.15em',
          marginBottom: 30,
        }}
      >
        SO ONE MONTH LATER...
      </div>

      {frame >= 35 && (
        <div
          style={{
            transform: `scale(${hit2})`,
            fontSize: 82,
            fontWeight: 900,
            textAlign: 'center',
            color: '#ffffff',
            lineHeight: 1.15,
            textShadow: '0 0 70px rgba(251, 191, 36, 0.6)',
          }}
        >
          LUSTIG CAME BACK...
          <br />
          <span style={{ color: '#f59e0b', textDecoration: 'underline' }}>
            AND SOLD IT AGAIN.
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};

export const DemoVideo: React.FC = () => {
  const frame = useCurrentFrame();

  // Subtle ambient camera drift across the entire video
  const ambientScale = interpolate(frame, [0, 730], [1, 1.05], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#05070d',
        color: '#ffffff',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* 24kHz Studio Narration Audio Track */}
      <Audio src={staticFile('demo_voiceover.wav')} />

      {/* Atmospheric dynamic gradient background */}
      <AbsoluteFill
        style={{
          transform: `scale(${ambientScale})`,
          background:
            'radial-gradient(circle at 50% 35%, rgba(30, 58, 138, 0.35) 0%, rgba(5, 7, 13, 1) 75%)',
          filter: 'blur(30px)',
          pointerEvents: 'none',
        }}
      />

      {/* Sequenced Scenes */}
      <Sequence from={0} durationInFrames={150}>
        <Scene1 />
      </Sequence>

      <Sequence from={150} durationInFrames={170}>
        <Scene2 />
      </Sequence>

      <Sequence from={320} durationInFrames={160}>
        <Scene3 />
      </Sequence>

      <Sequence from={480} durationInFrames={130}>
        <Scene4 />
      </Sequence>

      <Sequence from={610} durationInFrames={120}>
        <Scene5 />
      </Sequence>
    </AbsoluteFill>
  );
};
