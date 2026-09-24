#!/usr/bin/env python3
"""Génère les icônes de bulles de pensée (besoin urgent) de l'extension.

Six PNG pixel-art 12x12 dans extension/assets/bubbles/, affichés en x2 au
plus proche voisin. Une bulle ronde blanche avec l'icône du besoin dedans.

Usage : python3 scripts/gen_ui_sprites.py
"""

from pathlib import Path
from PIL import Image, ImageDraw

SIZE = 12
OUT_DIR = Path(__file__).resolve().parent.parent / "extension" / "assets" / "bubbles"

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


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, fn in ICONS.items():
        fn().save(OUT_DIR / f"{name}.png")
        print(f"écrit {OUT_DIR / (name + '.png')}")


if __name__ == "__main__":
    main()
