"""Pixel-compare two renders (A/B) so a speed change can be proven visually safe.

    python tools/perf/imgdiff.py out/bench_all out/bench_gl_angle 350 351 352 353

Prints PSNR + max/mean absolute error per pair (8-bit RGB) and writes
<dirA>/.._diff-<frame>.png with the amplified difference.
Exit code 1 if any pair is below the PSNR floor (default 40 dB) or the mean
error is above 1.0/255 -- i.e. "not the same picture any more".
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

FLOOR_DB = 40.0
MEAN_TOL = 1.0


def load(p: Path) -> np.ndarray:
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)


def psnr(a: np.ndarray, b: np.ndarray) -> float:
    mse = float(np.mean((a - b) ** 2))
    return 99.0 if mse == 0 else 10.0 * np.log10(255.0 ** 2 / mse)


def find(dir_: Path, frame: str) -> Path:
    for ext in (".png", ".jpeg", ".jpg"):
        for name in (f"element-{frame}{ext}", f"frame-{frame}{ext}", f"{frame}{ext}"):
            p = dir_ / name
            if p.exists():
                return p
    raise SystemExit(f"no frame {frame} in {dir_}")


def main() -> int:
    a_dir, b_dir = Path(sys.argv[1]), Path(sys.argv[2])
    frames = sys.argv[3:] or ["350"]
    bad = 0
    for f in frames:
        a, b = load(find(a_dir, f)), load(find(b_dir, f))
        if a.shape != b.shape:
            print(f"{f}: SIZE MISMATCH {a.shape} vs {b.shape}")
            bad += 1
            continue
        d = np.abs(a - b)
        db, mean, mx = psnr(a, b), float(d.mean()), int(d.max())
        ok = db >= FLOOR_DB and mean <= MEAN_TOL
        bad += 0 if ok else 1
        print(f"frame {f}: PSNR {db:6.2f} dB   mean {mean:5.3f}/255   max {mx:3d}   {'OK' if ok else 'CHANGED'}")
        amp = np.clip(d * 8, 0, 255).astype(np.uint8)
        Image.fromarray(amp).save(b_dir.parent / f"_diff-{f}.png")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
