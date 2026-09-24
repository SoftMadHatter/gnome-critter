#!/usr/bin/env python3
"""Génère les sprites d'interface de l'extension (pixel-art, aucune dépendance
hors Pillow).

- extension/assets/bubbles/ : six icônes de bulles de pensée 12x12, affichées
  en x2 au plus proche voisin (une bulle ronde avec l'icône du besoin).
- extension/assets/items/ contient aussi les proies (deux frames de marche :
  `mouse_0.png`, `mouse_1.png`...), les plantes (`grass_0..3.png`, un état par
  nombre de portions restantes) et la gamelle moisie.
- extension/assets/accessories/ : accessoires 16x16 (chapeaux, nœud, lunettes,
  couronne), posés sur la tête de l'animal ; le bas de l'image est le point
  d'ancrage.
- extension/assets/life/egg.png : l'œuf (4 frames 16x16 : posé, deux oscillations,
  fissuré), commun à toutes les espèces.
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
LIFE_DIR = ASSETS_DIR / "life"
ACCESSORIES_DIR = ASSETS_DIR / "accessories"

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


def break_cup():
    img, d = bubble()
    d.rectangle((3, 4, 7, 8), fill=(230, 230, 240, 255), outline=EDGE)
    d.rectangle((8, 5, 9, 7), outline=EDGE)
    d.line((4, 3, 4, 2), fill=GREY)
    d.line((6, 3, 6, 1), fill=GREY)
    d.line((3, 9, 8, 9), fill=EDGE)
    return img


ICONS = {"break": break_cup, "hungry": hungry, "sleepy": sleepy, "dirty": dirty, "bored": bored, "heart": heart, "sick": sick}


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


def ball():
    img, d = canvas(12, 12)
    d.ellipse((1, 1, 10, 10), fill=(230, 80, 70, 255))
    d.rectangle((1, 5, 10, 6), fill=(245, 245, 245, 255))
    d.ellipse((3, 2, 5, 4), fill=(250, 150, 140, 255))
    return outline(img)


def plush():
    img, d = canvas(16, 14)
    d.ellipse((3, 4, 12, 12), fill=(210, 160, 110, 255))
    d.ellipse((5, 1, 9, 5), fill=(210, 160, 110, 255))
    d.ellipse((9, 1, 13, 5), fill=(210, 160, 110, 255))
    d.ellipse((5, 7, 10, 11), fill=(240, 210, 170, 255))
    d.point((6, 6), fill=(50, 30, 30, 255))
    d.point((9, 6), fill=(50, 30, 30, 255))
    d.point((7, 8), fill=(200, 90, 100, 255))
    return outline(img)


def laser():
    img, d = canvas(8, 8)
    d.ellipse((1, 1, 6, 6), fill=(255, 50, 50, 255))
    d.ellipse((2, 2, 4, 4), fill=(255, 190, 190, 255))
    return img


def egg_frame(tilt=0, cracked=False):
    img, d = canvas(16, 16)
    d.ellipse((3, 2, 12, 14), fill=(240, 226, 190, 255))
    d.ellipse((5, 4, 8, 7), fill=(252, 244, 220, 255))
    for x, y in ((5, 9), (9, 6), (8, 11), (10, 10)):
        d.rectangle((x, y, x + 1, y + 1), fill=(222, 130, 70, 255))
    if cracked:
        for a, b in (((6, 3), (8, 5)), ((8, 5), (7, 7)), ((7, 7), (10, 8))):
            d.line((*a, *b), fill=(90, 60, 40, 255))
    if tilt:
        img = img.rotate(tilt, resample=Image.NEAREST, center=(8, 14))
    return outline(img, (90, 60, 40, 255))


def egg_sheet():
    frames = [egg_frame(), egg_frame(-10), egg_frame(10), egg_frame(cracked=True)]
    sheet = Image.new("RGBA", (16 * len(frames), 16), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * 16, 0))
    return sheet


def partyhat():
    img, d = canvas(16, 16)
    d.polygon([(8, 1), (3, 14), (13, 14)], fill=(240, 90, 140, 255))
    for x, y, c in ((7, 6, (250, 220, 90, 255)), (9, 9, (90, 200, 240, 255)), (6, 11, (250, 220, 90, 255))):
        d.rectangle((x, y, x + 1, y + 1), fill=c)
    d.ellipse((7, 0, 9, 2), fill=(250, 220, 90, 255))
    return outline(img)


def bow():
    img, d = canvas(16, 16)
    d.polygon([(8, 9), (2, 4), (2, 13)], fill=(230, 70, 90, 255))
    d.polygon([(8, 9), (14, 4), (14, 13)], fill=(230, 70, 90, 255))
    d.ellipse((6, 7, 10, 11), fill=(190, 40, 70, 255))
    return outline(img)


def glasses():
    img, d = canvas(16, 16)
    d.ellipse((1, 9, 7, 15), fill=(190, 225, 245, 255), outline=(40, 40, 60, 255))
    d.ellipse((9, 9, 15, 15), fill=(190, 225, 245, 255), outline=(40, 40, 60, 255))
    d.line((7, 12, 9, 12), fill=(40, 40, 60, 255))
    return img


def crown():
    img, d = canvas(16, 16)
    d.polygon([(2, 14), (2, 5), (5, 9), (8, 3), (11, 9), (14, 5), (14, 14)], fill=(245, 200, 60, 255))
    d.rectangle((2, 12, 13, 14), fill=(220, 160, 30, 255))
    for x in (4, 7, 10):
        d.point((x, 13), fill=(230, 60, 80, 255))
    return outline(img)


def santa():
    img, d = canvas(16, 16)
    d.polygon([(11, 1), (3, 12), (13, 12)], fill=(210, 40, 50, 255))
    d.rectangle((2, 11, 14, 14), fill=(245, 245, 245, 255))
    d.ellipse((10, 0, 13, 3), fill=(245, 245, 245, 255))
    return outline(img)


def witch():
    img, d = canvas(16, 16)
    d.polygon([(8, 0), (5, 11), (11, 11)], fill=(60, 40, 90, 255))
    d.rectangle((1, 11, 15, 13), fill=(60, 40, 90, 255))
    d.rectangle((5, 9, 11, 10), fill=(230, 160, 40, 255))
    return outline(img)


def coin():
    img, d = canvas(12, 12)
    d.ellipse((1, 1, 10, 10), fill=(245, 200, 60, 255))
    d.ellipse((3, 3, 8, 8), outline=(220, 160, 30, 255))
    d.point((4, 3), fill=(255, 240, 170, 255))
    return outline(img, (150, 100, 20, 255))


def flower():
    img, d = canvas(12, 12)
    d.line((6, 7, 6, 11), fill=(60, 150, 70, 255))
    for x, y in ((6, 2), (3, 4), (9, 4), (4, 7), (8, 7)):
        d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(240, 110, 150, 255))
    d.ellipse((5, 4, 7, 6), fill=(250, 220, 90, 255))
    return outline(img, (110, 40, 70, 255))


def feather():
    img, d = canvas(12, 12)
    d.polygon([(2, 10), (9, 1), (10, 3), (5, 10)], fill=(90, 160, 230, 255))
    d.line((2, 10, 9, 2), fill=(230, 240, 250, 255))
    return outline(img, (30, 60, 120, 255))


ACCESSORY_SPRITES = {
    "partyhat": partyhat, "bow": bow, "glasses": glasses, "crown": crown, "santa": santa, "witch": witch,
}


PREY_SPRITES = {}


def _prey(name, w, h, draw):
    for frame in (0, 1):
        img, d = canvas(w, h)
        draw(d, frame)
        PREY_SPRITES[f"{name}_{frame}"] = (lambda i=img: outline(i, (50, 40, 40, 255)))


def _mouse(d, f):
    d.ellipse((2, 3, 11, 8), fill=(150, 150, 165, 255))
    d.ellipse((10, 4, 14, 8), fill=(170, 170, 185, 255))
    d.point((13, 5), fill=(30, 30, 40, 255))
    d.rectangle((9, 2, 10, 3), fill=(230, 150, 170, 255))
    d.line((0, 6, 2, 5 + f), fill=(220, 160, 170, 255))
    d.line((4, 8, 4 + f, 9), fill=(110, 110, 125, 255))
    d.line((8, 8, 8 - f, 9), fill=(110, 110, 125, 255))


def _beetle(d, f):
    d.ellipse((1, 1, 8, 6), fill=(110, 70, 40, 255))
    d.line((4, 2, 4, 5), fill=(70, 40, 20, 255))
    d.line((2, 6, 2 + f, 7), fill=(50, 30, 20, 255))
    d.line((6, 6, 6 - f, 7), fill=(50, 30, 20, 255))


def _aphid(d, f):
    d.ellipse((0, 0, 4, 3), fill=(120, 200, 100, 255))
    d.point((1 + f, 4), fill=(50, 90, 40, 255))


def _krill(d, f):
    d.ellipse((1, 1, 6, 4), fill=(240, 150, 150, 255))
    d.line((0, 2 + f, 1, 2), fill=(220, 110, 120, 255))
    d.point((5, 2), fill=(40, 20, 30, 255))


_prey("mouse", 16, 10, _mouse)
_prey("beetle", 10, 8, _beetle)
_prey("aphid", 6, 5, _aphid)
_prey("krill", 8, 6, _krill)

PLANT_SPRITES = {}


def _plant(kind, portions):
    img, d = canvas(16, 14)
    xs = [3, 8, 12][: max(portions, 0)]
    if kind == "grass":
        d.line((2, 13, 13, 13), fill=(90, 60, 30, 255))
        for x in xs or [8]:
            h = 9 if xs else 3
            d.line((x, 13, x - 1, 13 - h), fill=(70, 170, 70, 255))
            d.line((x, 13, x + 1, 12 - h), fill=(100, 200, 90, 255))
    elif kind == "berries":
        d.ellipse((2, 5, 13, 13), fill=(60, 140, 70, 255) if xs else (90, 110, 70, 255))
        for x in xs:
            d.rectangle((x, 7 + (x % 3), x + 1, 8 + (x % 3)), fill=(220, 50, 70, 255))
    elif kind == "leaf":
        d.line((8, 13, 8, 10), fill=(60, 110, 50, 255))
        for i, x in enumerate(xs or [8]):
            d.ellipse((x - 3, 3 + i * 2 if xs else 8, x + 3, 9 + i * 2 if xs else 11), fill=(80, 180, 80, 255))
    else:  # algue
        for x in xs or [8]:
            for y in range(13, 2 if xs else 9, -1):
                d.point((x + (1 if y % 4 < 2 else -1), y), fill=(60, 170, 120, 255))
    return outline(img, (30, 80, 50, 255))


for _kind in ("grass", "berries", "leaf", "algae"):
    for _n in range(4):
        PLANT_SPRITES[f"{_kind}_{_n}"] = (lambda k=_kind, n=_n: _plant(k, n))


def bowl_moldy():
    img = bowl(True)
    d = ImageDraw.Draw(img)
    for x, y in ((6, 3), (10, 3), (14, 4), (9, 5), (17, 4)):
        d.rectangle((x, y, x + 2, y + 1), fill=(120, 190, 130, 255))
    return img


ITEMS = {
    "ball": ball, "plush": plush, "laser": laser, "coin": coin, "flower": flower, "feather": feather,
    "bowl_moldy": bowl_moldy, **PREY_SPRITES, **PLANT_SPRITES,
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
    ACCESSORIES_DIR.mkdir(parents=True, exist_ok=True)
    for name, fn in ACCESSORY_SPRITES.items():
        fn().save(ACCESSORIES_DIR / f"{name}.png")
        print(f"écrit {ACCESSORIES_DIR / (name + '.png')}")
    LIFE_DIR.mkdir(parents=True, exist_ok=True)
    egg_sheet().save(LIFE_DIR / "egg.png")
    print(f"écrit {LIFE_DIR / 'egg.png'}")


if __name__ == "__main__":
    main()
