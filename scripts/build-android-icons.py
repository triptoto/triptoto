#!/usr/bin/env python3
"""Generates the Android launcher icons and splash images from the tripto.to
brand mark (public/app-icon.svg: lavender tile, navy/indigo compass needle,
yellow dot). Requires Pillow. Run from the repo root:

    python3 scripts/build-android-icons.py

Adaptive icons (Android 8+) use the vector foreground in
res/drawable/ic_launcher_foreground.xml; these PNGs cover Android 7 launchers
and the pre-Android-12 splash window.
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android/app/src/main/res"
TILE = "#e7e1fb"
SPLASH_BG = "#f6f4f1"
NEEDLE_DARK = "#05152d"
NEEDLE_LIGHT = "#5547b7"
DOT = "#fbc840"
SS = 4  # supersampling factor for smooth edges


def mark(size, rounded=None):
    """The 512-unit brand mark rendered at `size` px. rounded: None (square),
    'circle', or a corner radius ratio."""
    big = size * SS
    k = big / 512
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if rounded == "circle":
        draw.ellipse((0, 0, big - 1, big - 1), fill=TILE)
    elif rounded:
        draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * rounded), fill=TILE)
    else:
        draw.rectangle((0, 0, big, big), fill=TILE)
    pts = lambda seq: [(x * k, y * k) for x, y in seq]
    draw.polygon(pts([(124, 282), (376, 132), (282, 388), (232, 278)]), fill=NEEDLE_DARK)
    draw.polygon(pts([(124, 282), (376, 132), (232, 278)]), fill=NEEDLE_LIGHT)
    draw.ellipse(((370 - 30) * k, (366 - 30) * k, (370 + 30) * k, (366 + 30) * k), fill=DOT)
    return img.resize((size, size), Image.LANCZOS)


LEGACY = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for density, px in LEGACY.items():
    folder = RES / f"mipmap-{density}"
    mark(px, 0.18).save(folder / "ic_launcher.png", optimize=True)
    mark(px, "circle").save(folder / "ic_launcher_round.png", optimize=True)
    stale = folder / "ic_launcher_foreground.png"
    if stale.exists():
        stale.unlink()

for splash in sorted(RES.glob("drawable*/splash.png")):
    with Image.open(splash) as current:
        w, h = current.size
    canvas = Image.new("RGB", (w, h), SPLASH_BG)
    icon = mark(int(min(w, h) * 0.3), 0.22)
    canvas.paste(icon, ((w - icon.width) // 2, (h - icon.height) // 2), icon)
    canvas.save(splash, optimize=True)

print("android icons: legacy launcher icons + splash images written")
