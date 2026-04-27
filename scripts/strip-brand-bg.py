"""
Strip the near-black background from brand PNGs so they composite cleanly
on dark surfaces. The bundle ships RGBA pure-opaque artwork — see
ad-lockup-horizontal-final.png corner pixel (0, 3, 8, 255). This script
zeroes alpha for any pixel where R+G+B is below THRESHOLD.

Run: python scripts/strip-brand-bg.py
"""
from __future__ import annotations

import sys
from pathlib import Path
from PIL import Image

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

THRESHOLD = 24  # R+G+B sum below which a pixel is treated as background.
SOFT_BAND = 8   # extra band for partial-alpha edge feathering.

ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "public" / "brand"
TARGETS = [
    "ad-mark.png",
    "ad-lockup-horizontal-final.png",
    "ad-lockup-stacked-final.png",
]


def strip(path: Path) -> None:
    out = path.with_name(path.stem + "-bg-stripped.png")
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    n_clear = 0
    n_soft = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            s = r + g + b
            if s <= THRESHOLD:
                px[x, y] = (r, g, b, 0)
                n_clear += 1
            elif s <= THRESHOLD + SOFT_BAND:
                t = (s - THRESHOLD) / SOFT_BAND
                px[x, y] = (r, g, b, int(255 * t))
                n_soft += 1
    im.save(out)
    pct_clear = 100 * n_clear / (w * h)
    print(f"  {path.name} -> {out.name} ({w}×{h}, {pct_clear:.1f}% transparent, {n_soft} soft)")


def main() -> None:
    for name in TARGETS:
        path = SRC_DIR / name
        if not path.exists():
            print(f"  SKIP missing: {path}")
            continue
        strip(path)
    print("done.")


if __name__ == "__main__":
    main()
