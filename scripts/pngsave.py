#!/usr/bin/env python3
"""Saves the sprites as palette PNGs: the sprites are shaded pixel art with
a soft outline, so a 128-color palette (with per-color transparency) looks
the same and weighs about 40 % of the RGBA original. The archive sent to
extensions.gnome.org is almost entirely made of these images.

The palette comes from libimagequant (bundled with Pillow's wheels, the same
quantizer as pngquant); without it, images are saved as plain RGBA.
An image with no transparent pixel stays RGBA too: GdkPixbuf loads an opaque
palette image without an alpha channel, which the extension's color
variants rely on.

Used by the sprite generators (`save_png`). Run it directly to optimize
existing files in place; already optimized ones are skipped:

    python3 scripts/pngsave.py [file-or-folder ...]
    (default: packs/ and extension/assets/)
"""

import sys
from pathlib import Path

from PIL import Image, features

COLORS = 128
ROOT_DIR = Path(__file__).resolve().parent.parent


def has_transparency(image):
    return image.getchannel("A").getextrema()[0] < 255


def save_png(image, path):
    image = image.convert("RGBA")
    if features.check("libimagequant") and has_transparency(image):
        image = image.quantize(colors=COLORS, method=Image.Quantize.LIBIMAGEQUANT, dither=Image.Dither.NONE)
    image.save(path, optimize=True)


def optimize(path):
    """Rewrites an existing PNG in place; returns the bytes saved."""
    before = path.stat().st_size
    with Image.open(path) as image:
        if image.mode == "P":
            return 0
        image.load()
        save_png(image, path)
    return before - path.stat().st_size


def main():
    targets = [Path(a) for a in sys.argv[1:]] or [ROOT_DIR / "packs", ROOT_DIR / "extension" / "assets"]
    files = sorted(f for t in targets for f in ([t] if t.is_file() else t.rglob("*.png")))
    saved = sum(optimize(f) for f in files)
    print(f"{len(files)} PNG files, {saved // 1024} KB saved")


if __name__ == "__main__":
    main()
