#!/usr/bin/env python3
"""Génère les sprites d'interface de l'extension (pixel-art, aucune dépendance
hors Pillow).

- extension/assets/bubbles/ : six icônes de bulles de pensée 12x12, affichées
  en x2 au plus proche voisin (une bulle ronde avec l'icône du besoin).
- extension/assets/items/ : objets du bureau, affichés à leur taille réelle :
  aliments 16x16, gamelle vide/pleine 24x12, lit 32x12. Le bas de l'image est
  le point de pose sur la surface.

Usage : python3 scripts/gen_ui_sprites.py
"""

from pathlib import Path
from PIL import Image, ImageDraw

SIZE = 12
ASSETS_DIR = Path(__file__).resolve().parent.parent / "extension" / "assets"
OUT_DIR = ASSETS_DIR / "bubbles"
ITEMS_DIR = ASSETS_DIR / "items"

WHITE = (255, 255, 255, 255)
EDGE = (70, 70, 90, 255)
RED = (225, 60, 80, 255)
BROWN = (150, 90, 50, 255)
TAN = (235, 200, 150, 255)
BLUE = (80, 120, 210, 255)
GREEN = (60, 160, 90, 255)
GREY = (120, 120, 140, 255)


def bubble():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((0, 0, SIZE - 1, SIZE - 2), fill=WHITE, outline=EDGE)
    d.point((3, SIZE - 1), fill=EDGE)  # petite queue de bulle
    return img, d


def pixels(d, points, color):
    for x, y in points:
        d.point((x, y), fill=color)


def hungry():
    img, d = bubble()
    # pilon de poulet
    d.ellipse((3, 2, 8, 6), fill=BROWN)
    d.line((6, 6, 8, 8), fill=TAN)
    d.point((8, 9), fill=TAN)
    d.point((9, 8), fill=TAN)
    return img


def sleepy():
    img, d = bubble()
    pixels(d, [(3, 3), (4, 3), (5, 3), (5, 4), (4, 5), (3, 6), (3, 7), (4, 7), (5, 7)], BLUE)
    pixels(d, [(7, 2), (8, 2), (8, 3), (7, 4), (8, 4)], BLUE)
    return img


def dirty():
    img, d = bubble()
    d.ellipse((2, 4, 5, 7), outline=GREY)
    d.ellipse((6, 2, 9, 5), outline=GREY)
    d.ellipse((6, 6, 8, 8), outline=GREY)
    return img


def bored():
    img, d = bubble()
    pixels(d, [(3, 5), (6, 5), (9, 5)], GREY)
    pixels(d, [(3, 6), (6, 6), (9, 6)], GREY)
    return img


def heart():
    img, d = bubble()
    pixels(d, [(3, 3), (4, 3), (7, 3), (8, 3)], RED)
    d.rectangle((2, 4, 9, 5), fill=RED)
    d.rectangle((3, 6, 8, 6), fill=RED)
    d.rectangle((4, 7, 7, 7), fill=RED)
    d.rectangle((5, 8, 6, 8), fill=RED)
    return img


def sick():
    img, d = bubble()
    d.rectangle((5, 2, 6, 8), fill=GREEN)
    d.rectangle((2, 5, 9, 6), fill=GREEN)
    return img


ICONS = {"hungry": hungry, "sleepy": sleepy, "dirty": dirty, "bored": bored, "heart": heart, "sick": sick}


# --- objets du bureau -----------------------------------------------------------

OUTLINE = (60, 40, 40, 255)


def canvas(w, h):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def outline(img, color=OUTLINE):
    px = img.load()
    w, h = img.size
    marks = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] > 0:
                    marks.append((x, y))
                    break
    for m in marks:
        px[m] = color
    return img


def meat():
    img, d = canvas(16, 16)
    d.ellipse((2, 6, 12, 14), fill=(196, 78, 66, 255))
    d.ellipse((4, 7, 8, 10), fill=(226, 120, 104, 255))
    d.rectangle((11, 4, 14, 6), fill=(245, 240, 225, 255))
    d.point((14, 3), fill=(245, 240, 225, 255))
    d.point((14, 7), fill=(245, 240, 225, 255))
    return outline(img)


def fish():
    img, d = canvas(16, 16)
    d.polygon([(1, 8), (4, 10), (4, 14)], fill=(110, 150, 200, 255))
    d.ellipse((3, 8, 13, 14), fill=(150, 195, 230, 255))
    d.rectangle((5, 11, 10, 12), fill=(215, 235, 250, 255))
    d.point((11, 10), fill=(30, 30, 50, 255))
    return outline(img)


def kibble():
    img, d = canvas(16, 16)
    for x, y in ((3, 11), (7, 10), (10, 12), (5, 13), (8, 13)):
        d.ellipse((x, y - 2, x + 2, y + 1), fill=(160, 100, 55, 255))
    return outline(img)


def seeds():
    img, d = canvas(16, 16)
    for x, y in ((3, 12), (6, 13), (9, 12), (11, 14), (5, 10), (8, 10)):
        d.rectangle((x, y, x + 1, y + 1), fill=(225, 190, 90, 255))
        d.point((x, y), fill=(250, 230, 150, 255))
    return outline(img)


def plankton():
    img, d = canvas(16, 16)
    for x, y in ((3, 9), (7, 6), (10, 10), (6, 12), (12, 7), (4, 5)):
        d.rectangle((x, y, x + 1, y + 1), fill=(110, 210, 150, 255))
        d.point((x + 1, y), fill=(190, 250, 210, 255))
    return outline(img, (30, 90, 70, 255))


def bowl(full):
    img, d = canvas(24, 12)
    d.polygon([(2, 5), (21, 5), (18, 11), (5, 11)], fill=(200, 70, 80, 255))
    d.ellipse((1, 3, 22, 7), fill=(230, 110, 120, 255))
    d.ellipse((3, 4, 20, 6), fill=(70, 30, 35, 255))
    if full:
        for x, y in ((6, 3), (10, 2), (14, 3), (9, 4), (13, 4), (17, 4)):
            d.ellipse((x, y, x + 3, y + 2), fill=(160, 100, 55, 255))
    return outline(img)


def bed():
    img, d = canvas(32, 12)
    d.rounded_rectangle((1, 4, 30, 11), radius=4, fill=(120, 90, 170, 255))
    d.rounded_rectangle((3, 2, 28, 8), radius=4, fill=(165, 140, 210, 255))
    d.line((6, 4, 25, 4), fill=(200, 180, 235, 255))
    return outline(img)


ITEMS = {
    "meat": meat, "fish": fish, "kibble": kibble, "seeds": seeds, "plankton": plankton,
    "bowl_empty": lambda: bowl(False), "bowl_full": lambda: bowl(True), "bed": bed,
}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ITEMS_DIR.mkdir(parents=True, exist_ok=True)
    for name, fn in ICONS.items():
        fn().save(OUT_DIR / f"{name}.png")
        print(f"écrit {OUT_DIR / (name + '.png')}")
    for name, fn in ITEMS.items():
        fn().save(ITEMS_DIR / f"{name}.png")
        print(f"écrit {ITEMS_DIR / (name + '.png')}")


if __name__ == "__main__":
    main()
