#!/usr/bin/env python3
"""Generates the *placeholder* pixel-art spritesheets for the critter-demo pack.

These aren't final sprites: just enough to see each critter move right
away, with a clean pixel-art look (drawn on a small grid then scaled with
nearest-neighbor, so no blur). Replace these PNGs with your own art
whenever you want, keeping the same convention: one row of square frames
per file.

Usage: python3 scripts/gen_placeholder_sprites.py [species ...]
       (critter-demo only; cat, bug, fish, and bird: gen_species_sprites.py)

Regenerating an existing pack can change its PNGs on the git side even
with identical pixels (the encoding depends on the Pillow version): prefer
passing only the species actually modified as arguments.
"""

import sys
from pathlib import Path
from PIL import Image, ImageDraw

GRID = 16  # logical drawing size (16x16 "pixels"), shared by every species

PACKS_DIR = Path(__file__).resolve().parent.parent / "packs"

# --- critter-demo ------------------------------------------------------------
# Functions unchanged since the script's single-species version: the demo
# pack's PNGs must stay byte-for-byte identical.

BODY = (232, 150, 60, 255)      # orange
BODY_DARK = (196, 116, 40, 255)  # body shadow
BELLY = (250, 214, 170, 255)     # cream
EYE = (30, 20, 20, 255)
OUTLINE = (60, 34, 12, 255)


def new_canvas():
    return Image.new("RGBA", (GRID, GRID), (0, 0, 0, 0))


def draw_body(draw, bob=0, squash=0):
    """Simple oval body, with a slight vertical bob and a squash for the
    jump/landing frames."""
    top = 5 + bob + squash
    bottom = 13 + bob - squash
    draw.ellipse((3, top, 12, bottom), fill=BODY, outline=OUTLINE)
    draw.ellipse((5, top + 3, 10, bottom), fill=BELLY)


def draw_feet(draw, bob=0, offset=0):
    y = 13 + bob
    draw.rectangle((4 + offset, y, 6 + offset, y + 1), fill=BODY_DARK)
    draw.rectangle((9 - offset, y, 11 - offset, y + 1), fill=BODY_DARK)


def draw_eyes(draw, bob=0, state="open"):
    y = 7 + bob
    if state == "open":
        draw.point((5, y), fill=EYE)
        draw.point((9, y), fill=EYE)
    elif state == "blink":
        draw.line((5, y, 6, y), fill=EYE)
        draw.line((9, y, 10, y), fill=EYE)
    elif state == "closed":
        draw.line((4, y, 6, y), fill=EYE)
        draw.line((8, y, 10, y), fill=EYE)
    elif state == "wide":
        draw.point((5, y - 1), fill=EYE)
        draw.point((5, y), fill=EYE)
        draw.point((9, y - 1), fill=EYE)
        draw.point((9, y), fill=EYE)


def draw_ears(draw, bob=0):
    draw.polygon([(3, 5 + bob), (4, 2 + bob), (6, 5 + bob)], fill=BODY)
    draw.polygon([(9, 5 + bob), (11, 2 + bob), (12, 5 + bob)], fill=BODY)


def frame_idle(i):
    img = new_canvas()
    d = ImageDraw.Draw(img)
    bob = [0, 0, 1, 0][i % 4]
    draw_ears(d, bob)
    draw_body(d, bob)
    draw_feet(d, bob)
    draw_eyes(d, bob, "blink" if i == 3 else "open")
    return img


def frame_walk(i):
    img = new_canvas()
    d = ImageDraw.Draw(img)
    bob = [0, -1, 0, -1][i % 4]
    leg_offset = [0, 1, 0, -1][i % 4]
    draw_ears(d, bob)
    draw_body(d, bob)
    draw_feet(d, bob, leg_offset)
    draw_eyes(d, bob, "open")
    return img


def frame_fall(i):
    img = new_canvas()
    d = ImageDraw.Draw(img)
    squash = [0, 1][i % 2]
    draw_ears(d, 0)
    draw_body(d, 0, squash=-squash)  # stretches slightly while falling
    draw_feet(d, 2, 2)
    draw_eyes(d, 0, "wide")
    return img


def frame_sleep(i):
    img = new_canvas()
    d = ImageDraw.Draw(img)
    bob = 1
    draw_ears(d, bob)
    draw_body(d, bob, squash=1)  # flattened, lying down
    draw_eyes(d, bob, "closed")
    if i == 1:
        d.text((11, 1), "z", fill=OUTLINE)
    return img


DEMO_SHEETS = {
    "idle.png": (frame_idle, 4),
    "walk.png": (frame_walk, 4),
    "fall.png": (frame_fall, 2),
    "sleep.png": (frame_sleep, 2),
}


# --- generation ----------------------------------------------------------------

def canvas():
    img = new_canvas()
    return img, ImageDraw.Draw(img)


# species -> (scale factor, sheets). Final frame size: GRID * scale, to
# report in the corresponding pack.json's spriteSize.
SPECIES = {
    "critter-demo": (2, DEMO_SHEETS),
}


def write_species(species):
    scale, sheets = SPECIES[species]
    out_dir = PACKS_DIR / species / "sprites"
    out_dir.mkdir(parents=True, exist_ok=True)
    for filename, (frame_fn, count) in sheets.items():
        sheet = Image.new("RGBA", (GRID * count, GRID), (0, 0, 0, 0))
        for i in range(count):
            sheet.paste(frame_fn(i), (i * GRID, 0))
        sheet = sheet.resize((GRID * count * scale, GRID * scale), Image.NEAREST)
        out_path = out_dir / filename
        sheet.save(out_path)
        print(f"wrote {out_path} ({sheet.width}x{sheet.height}, {count} frames)")


def main():
    requested = sys.argv[1:] or list(SPECIES)
    unknown = [s for s in requested if s not in SPECIES]
    if unknown:
        sys.exit(f"unknown species: {', '.join(unknown)} (known: {', '.join(SPECIES)})")
    for species in requested:
        write_species(species)


if __name__ == "__main__":
    main()
