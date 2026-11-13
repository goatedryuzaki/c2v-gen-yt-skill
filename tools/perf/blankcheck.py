"""
Flag frames whose WebGL canvas never drew.

The composition captures a tab's very first frame before R3F has painted, so a stray blank can
survive a render: flat backdrop + captions only. File size is a weak signal (a blank over a dark
backdrop still compresses small), so this looks at the picture instead.

The caption band sits at the bottom, so the test is on the canvas region above it: if that area is
almost perfectly uniform, no scene was drawn.

    python tools/perf/blankcheck.py out/frames [--threshold 3.0]
"""
import sys
import pathlib
import numpy as np
from PIL import Image

CAPTION_TOP = 1500  # rows above this carry the 3D scene, below it the caption capsule
STEP = 3           # sample every Nth pixel; enough signal, ~9x faster


def flatness(path: pathlib.Path) -> tuple[float, float]:
    img = Image.open(path).convert("RGB")
    a = np.asarray(img)[:CAPTION_TOP:STEP, ::STEP].astype(np.float32)
    # Per-channel std of the whole region: ~0 when one colour fills it.
    # Mean brightness separates a real defect from a designed white flash (FLASH_AT in story.ts).
    return float(a.std(axis=(0, 1)).mean()), float(a.mean())


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    directory = pathlib.Path(sys.argv[1])
    threshold = 3.0
    if "--threshold" in sys.argv:
        threshold = float(sys.argv[sys.argv.index("--threshold") + 1])

    frames = sorted(directory.glob("element-*.jpeg"), key=lambda p: int(p.stem.split("-")[1]))
    if not frames:
        print(f"no frames in {directory}")
        return 1

    print(f"checking {len(frames)} frames (std < {threshold} = no scene drawn)")
    flagged = []
    flashes = []
    for path in frames:
        score, mean = flatness(path)
        if score < threshold:
            idx = int(path.stem.split("-")[1])
            if mean > 250:
                # A uniform WHITE frame is the designed flash transition, not a failed capture:
                # Bridge.tsx paints a full-white overlay at FLASH_AT..FLASH_AT+3.
                flashes.append(idx)
            else:
                flagged.append((idx, score, mean))

    for idx in flashes:
        print(f"  white flash (expected)  frame {idx:>4}")
    for idx, score, mean in flagged:
        print(f"  BLANK  frame {idx:>4}  std={score:.2f} mean={mean:.0f}")

    if flagged:
        print(f"\n{len(flagged)} blank frame(s): {', '.join(str(f) for f, _, _ in flagged)}")
        return 1
    print(f"\nno blank frames ({len(flashes)} designed white flash frame(s) ignored)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
