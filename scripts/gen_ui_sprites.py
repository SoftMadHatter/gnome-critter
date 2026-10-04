#!/usr/bin/env python3
"""Generates the extension's interface sprites, with finedraw.py's
fine-drawing rendering (smoothed shapes, gradient shading, soft outline,
fine details):

- extension/assets/items/: desktop objects, drawn at double their display
  size; the bottom of the image is the resting point. Foods and remaining
  bites (`food_<food>_<n>`), bowls by model, food, and level
  (`bowl_<model>_empty`, `bowl_<model>_<food>_<1-3>`,
  `bowl_<model>_moldy_<1-3>`), beds (`bed_<model>`), toys and variants
  (`toy_<toy>_<variant>`), gifts, litter box, messes, prey (two walking
  frames), plants (one image per remaining portion), laser dot. Same
  catalog as core/itemLooks.js (checked by tests/itemLooks.test.js); PNGs
  no longer in it are deleted.
- extension/assets/accessories/: accessories placed on the head (16 grid,
  drawn at 32 px); the bottom of the image is the anchor point.
- extension/assets/bubbles/: thought bubble icons (12 grid, displayed at
  24 px, drawn at 48).
- extension/assets/life/egg.png: the shared egg (4 frames: resting, two
  wobbles, cracked), for packs without their own egg.

Usage: python3 scripts/gen_ui_sprites.py
"""

import math
from pathlib import Path

from PIL import Image

from finedraw import Canvas
from pngsave import save_png

ASSETS_DIR = Path(__file__).resolve().parent.parent / "extension" / "assets"
ITEMS_DIR = ASSETS_DIR / "items"
BUBBLES_DIR = ASSETS_DIR / "bubbles"
ACCESSORIES_DIR = ASSETS_DIR / "accessories"
LIFE_DIR = ASSETS_DIR / "life"

# Catalogue, en miroir de core/items.js.
FOODS = {"meat": 2, "fish": 2, "pate": 2, "kibble": 3, "seeds": 3, "mealworms": 3, "apple": 3, "plankton": 2, "flakes": 2}
BOWL_FOODS = [k for k in FOODS if k not in ("plankton", "flakes")]
BOWL_MODELS = ["ceramic", "steel", "wood"]
BED_MODELS = ["cushion", "basket", "cradle"]
TOYS = {
    "ball": ["red", "blue", "yellow", "green"],
    "yarn": ["pink", "blue", "yellow"],
    "plush": ["bear", "rabbit", "frog"],
    "ring": ["orange"],
}
PLANTS = ["grass", "berries", "leaf", "algae"]


def c(r, g, b, a=255):
    return (r, g, b, a)


def mix(color, target, amount):
    return tuple(round(color[i] + (target[i] - color[i]) * amount) for i in range(3)) + (color[3] if len(color) > 3 else 255,)


def tones(base):
    """(base, shadow, highlight) of a color, for shaded shapes."""
    return base, mix(base, (0, 0, 0), 0.32), mix(base, (255, 255, 255), 0.45)


def edge(base):
    """Outline color: the hue, heavily darkened."""
    return mix(base, (0, 0, 0), 0.62)


CLEAR = (0, 0, 0, 0)
INK = c(40, 30, 36)
WHITE = c(255, 255, 255)


def cblob(d, x0, y0, x1, y1, color):
    """Shaded ellipse in continuous coordinates."""
    d.blob((x0, y0, x1 - 1, y1 - 1), *tones(color))


def rotated(points, cx, cy, angle):
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * ca - (y - cy) * sa, cy + (x - cx) * sa + (y - cy) * ca) for x, y in points]


def ellipse_points(cx, cy, rx, ry, t0=0.0, t1=2 * math.pi, n=24):
    return [(cx + rx * math.cos(t0 + (t1 - t0) * i / n), cy + ry * math.sin(t0 + (t1 - t0) * i / n)) for i in range(n + 1)]


# --- foods ---------------------------------------------------------------------


def pellet(d, x, y, color, w=2.7, h=2.1):
    base, dark, light = tones(color)
    d.oval(x - w / 2, y - h / 2, x + w / 2, y + h / 2, dark)
    d.oval(x - w / 2, y - h / 2, x + w / 2 - 0.35, y + h / 2 - 0.4, base)
    d.oval(x - w / 2 + 0.4, y - h / 2 + 0.25, x - 0.1, y - 0.1, light)


def heap(rows, cx=8.0, bottom=13.5, dx=2.6, dy=1.7):
    """Positions of a pile: `rows` items per row, from bottom to top."""
    pts = []
    for r, count in enumerate(rows):
        x0 = cx - (count - 1) * dx / 2
        pts += [(x0 + i * dx, bottom - r * dy) for i in range(count)]
    return pts


KIBBLE = [c(160, 100, 55), c(138, 84, 44), c(176, 116, 62)]


def seed(d, x, y, angle):
    """Sunflower seed: a dark almond shape striped with a light line."""
    body = rotated(ellipse_points(x, y, 1.5, 0.8, n=16), x, y, angle)
    d.poly(body, c(62, 58, 66))
    d.stroke(rotated([(x - 0.9, y), (x + 0.9, y)], x, y, angle), 0.32, c(226, 220, 204))


def millet(d, x, y):
    pellet(d, x, y, c(232, 200, 92), 1.8, 1.6)


def worm(d, x, y, length, phase, flip=False):
    """Mealworm: a ringed, undulating body, darker head."""
    sign = -1 if flip else 1
    pts = [(x + sign * i * length / 8, y + 0.55 * math.sin(phase + i * 0.9)) for i in range(9)]
    d.stroke(pts, 1.55, c(168, 120, 62))
    d.stroke(pts, 1.05, c(228, 190, 112))
    for px, py in pts[1:-1:2]:
        d.oval(px - 0.16, py - 0.5, px + 0.16, py + 0.5, c(186, 140, 76))
    hx, hy = pts[-1]
    d.oval(hx - 0.55, hy - 0.55, hx + 0.55, hy + 0.55, c(120, 78, 40))


def apple_wedge(d, cx, cy, angle=0.0, r=2.8):
    """Apple wedge lying on its skin: cream flesh, red rim, seeds."""
    skin = rotated(ellipse_points(cx, cy, r, r * 0.78, 0, math.pi, 16), cx, cy, angle)
    flesh = rotated(ellipse_points(cx, cy - 0.05, r - 0.45, r * 0.78 - 0.5, 0, math.pi, 16), cx, cy, angle)
    d.poly(skin, c(212, 52, 52))
    d.poly(flesh, c(250, 240, 204))
    for sx in (-0.55, 0.45):
        p = rotated([(cx + sx, cy + 0.55)], cx, cy, angle)[0]
        d.oval(p[0] - 0.28, p[1] - 0.4, p[0] + 0.28, p[1] + 0.4, c(110, 62, 30))


def bite(d, holes, rim):
    """Croque une forme : bords clairs puis trous (transparents)."""
    for x, y, r in holes:
        d.oval(x - r - 0.45, y - r - 0.45, x + r + 0.45, y + r + 0.45, rim)
    for x, y, r in holes:
        d.oval(x - r, y - r, x + r, y + r, CLEAR)


def food(kind, n):
    d = Canvas(16, 16, 2)
    whole = n == FOODS[kind]
    if kind == "meat":
        cblob(d, 1, 6, 12, 15, c(196, 78, 66))
        d.stroke([(3.5, 9.2), (5.5, 11.8)], 0.35, c(140, 46, 40))
        d.stroke([(6, 8.4), (8, 11)], 0.35, c(140, 46, 40))
        bone = c(246, 238, 222)
        d.stroke([(10, 10), (13.2, 6.2)], 1.8, bone)
        d.oval(12.1, 4.0, 14.3, 6.2, bone)
        d.oval(13.3, 5.3, 15.4, 7.4, bone)
        if not whole:
            bite(d, [(3.4, 6.9, 1.7), (1.7, 9.0, 1.5), (5.4, 6.3, 1.3)], c(236, 160, 140))
        return d.finish(c(110, 36, 30))
    if kind == "fish":
        body, fin = c(150, 195, 230), c(110, 152, 200)
        if whole:
            d.poly([(0.6, 8.2), (4.4, 11.2), (0.6, 14.4)], fin)
            d.poly([(6, 8.9), (8.2, 6.7), (10.2, 8.6)], fin)
            cblob(d, 3, 8, 14, 15, body)
            d.stroke([(5, 13.3), (11, 13.3)], 0.45, c(220, 236, 250))
        else:
            spine = c(236, 232, 222)
            d.poly([(0.6, 8.6), (3.4, 11.3), (0.6, 14)], c(176, 196, 218))
            d.stroke([(2.6, 11.3), (9, 11.3)], 0.55, spine)
            for x in (4, 5.6, 7.2):
                d.stroke([(x, 9.3), (x + 0.5, 11.3), (x, 13.3)], 0.4, spine)
            cblob(d, 8, 8, 14, 15, body)
        d.stroke([(10.2, 9.2), (9.7, 11.3), (10.2, 13.4)], 0.4, c(95, 138, 180))
        d.oval(11.2, 9.5, 12.5, 10.8, INK)
        d.oval(11.45, 9.7, 11.85, 10.1, WHITE)
        return d.finish(c(46, 70, 104))
    if kind == "pate":
        d.oval(0.8, 12.4, 15.2, 15.6, c(172, 188, 214))
        d.oval(1.3, 12.6, 14.7, 15.1, c(232, 238, 248))
        mound = (3, 7.2, 13, 13.8) if whole else (4.5, 10, 11.5, 13.8)
        cblob(d, *mound, c(164, 96, 74))
        x0, y0, x1, y1 = mound
        d.oval(x0 + 1.4, y0 + 0.9, x0 + 3.4, y0 + 1.9, c(222, 170, 140))
        for dx, dy in ((0.45, 0.55), (0.7, 0.35), (0.3, 0.75)):
            px, py = x0 + (x1 - x0) * dx, y0 + (y1 - y0) * dy
            d.oval(px - 0.3, py - 0.25, px + 0.3, py + 0.25, c(120, 62, 48))
        if not whole:
            d.oval(10.8, 13.1, 13.6, 14.2, c(170, 110, 88))  # a spread-out remnant
        return d.finish(c(70, 70, 96))
    if kind == "kibble":
        rows = {3: [4, 3, 2], 2: [3, 2], 1: [2, 1]}[n]
        for i, (x, y) in enumerate(heap(rows)):
            pellet(d, x, y, KIBBLE[i % 3])
        return d.finish(c(76, 44, 22))
    if kind == "seeds":
        rows = {3: [5, 4, 2], 2: [4, 2], 1: [2, 1]}[n]
        for i, (x, y) in enumerate(heap(rows, dx=2.3, dy=1.4)):
            if i % 3 == 1:
                seed(d, x, y, [-25, 20, 60][i % 3])
            else:
                millet(d, x, y)
        return d.finish(c(96, 76, 30))
    if kind == "mealworms":
        worms = [(3, 13.4, 6.5, 0.0, False), (12.8, 11.4, 6.2, 1.7, True), (4.5, 9.6, 5.5, 3.1, False)]
        for w in worms[:n]:
            worm(d, *w)
        return d.finish(c(96, 62, 24))
    if kind == "apple":
        wedges = [(4.4, 12.0, -8), (11.2, 12.2, 10), (7.8, 8.6, 0)]
        for w in wedges[:n]:
            apple_wedge(d, *w)
        return d.finish(c(110, 28, 28))
    if kind == "plankton":
        specks = [(4, 8), (7.5, 5.5), (10.5, 9.5), (6.5, 11.5), (12, 6.5), (3.5, 4.5), (9, 13), (13, 12), (5.5, 2.5)]
        colors = [c(110, 210, 150), c(150, 230, 205), c(90, 190, 175)]
        for i, (x, y) in enumerate(specks[: 9 if n == 2 else 5]):
            col = colors[i % 3]
            d.oval(x - 1.1, y - 1.1, x + 1.1, y + 1.1, mix(col, (255, 255, 255), 0.35))
            d.oval(x - 0.6, y - 0.6, x + 0.6, y + 0.6, col)
        return d.finish(c(36, 104, 86))
    # flocons (flottants) : paillettes de toutes les couleurs
    flakes = [(4, 6, 20), (8.5, 4.5, -30), (11.5, 8, 50), (6, 10.5, -10), (10, 12, 35), (3.5, 12.5, 70), (13, 4.5, -60)]
    colors = [c(242, 140, 50), c(226, 72, 60), c(250, 210, 80), c(124, 190, 92)]
    shape = [(-1.3, -0.5), (0.2, -0.9), (1.3, -0.2), (0.8, 0.8), (-0.6, 0.9)]
    for i, (x, y, a) in enumerate(flakes[: 7 if n == 2 else 4]):
        d.poly(rotated([(x + px, y + py) for px, py in shape], x, y, a), colors[i % 4])
    return d.finish(c(110, 56, 26))


# --- gamelles ---------------------------------------------------------------------

BOWL_STYLES = {
    "ceramic": dict(body=c(200, 70, 80), rim=c(232, 112, 122), inner=c(92, 36, 44), out=c(90, 28, 40)),
    "steel": dict(body=c(166, 174, 188), rim=c(214, 220, 230), inner=c(96, 102, 116), out=c(56, 62, 78)),
    "wood": dict(body=c(152, 100, 60), rim=c(192, 140, 88), inner=c(78, 50, 32), out=c(66, 40, 22)),
}

HEAPS = {
    "kibble": c(150, 94, 52), "seeds": c(214, 184, 96), "meat": c(178, 70, 60), "fish": c(234, 160, 130),
    "pate": c(160, 94, 74), "mealworms": c(200, 160, 96), "apple": c(238, 224, 180), "moldy": c(138, 128, 92),
}

# The bowl's opening (continuous): center, semi-axes.
OPEN_CX, OPEN_CY, OPEN_RX, OPEN_RY = 12.0, 5.5, 9.0, 1.5


def surface_y(x, level):
    """Height of the food's top at x-coordinate x, based on the level."""
    top = {1: 5.9, 2: 4.3, 3: 2.2}[level]
    base = OPEN_CY + 0.4
    t = max(0.0, 1 - ((x - OPEN_CX) / (OPEN_RX - 1.5)) ** 2)
    return base - (base - top) * t


def bowl_particle(d, food, x, y, i):
    if food == "kibble":
        pellet(d, x, y, KIBBLE[i % 3], 2.0, 1.5)
    elif food == "seeds":
        if i % 3 == 1:
            seed(d, x, y, [-20, 30, 70][i % 3])
        else:
            millet(d, x, y)
    elif food == "meat":
        cblob(d, x - 1.1, y - 0.8, x + 1.1, y + 0.9, c(204, 86, 72))
        d.stroke([(x - 0.5, y - 0.2), (x + 0.4, y + 0.1)], 0.3, c(244, 206, 196))
    elif food == "fish":
        cblob(d, x - 1.1, y - 0.8, x + 1.1, y + 0.9, c(246, 186, 160))
        d.stroke([(x - 0.6, y - 0.3), (x + 0.5, y - 0.4)], 0.28, c(206, 214, 226))
    elif food == "pate":
        d.oval(x - 0.35, y - 0.25, x + 0.35, y + 0.25, c(118, 62, 48))
    elif food == "mealworms":
        worm(d, x - 1.3, y, 2.6, i * 1.3, flip=i % 2 == 1)
    elif food == "apple":
        d.rounded((x - 0.9, y - 0.8, x + 0.3, y + 0.3), 0.3, c(250, 240, 206))
        d.stroke([(x - 0.9, y + 0.55), (x + 0.9, y + 0.55)], 0.35, c(212, 52, 52))
    else:  # moldy: fuzzy patches
        d.oval(x - 1.1, y - 0.7, x + 1.1, y + 0.8, c(190, 226, 172))
        d.oval(x - 0.4, y - 0.4, x + 0.3, y + 0.2, c(240, 248, 236))


def bowl_contents(d, food, level):
    layer = Canvas(24, 12, 2)
    color = HEAPS[food]
    top = surface_y(OPEN_CX, level)
    if level == 1:
        cblob(layer, 5.5, 5.2, 18.5, 7.0, color)
    else:
        cblob(layer, 3.4, 4.1, 20.6, 7.0, color)
        cblob(layer, 4.2, top - 0.2, 19.8, 7.0, color)
    if food == "pate":
        layer.oval(8, top + 0.3, 11.5, top + 1.1, mix(color, (255, 255, 255), 0.5))  # gloss
    xs = {1: [8, 10.5, 13, 15.5], 2: [5.8, 8.2, 10.6, 13, 15.4, 17.8], 3: [5.6, 7.9, 10.2, 12.5, 14.8, 17.1, 8.9, 11.3, 13.7]}[level]
    for i, x in enumerate(xs):
        second_row = level == 3 and i >= 6
        y = surface_y(x, level) + (0.3 if not second_row else -0.6) + (0.9 if level == 3 and not second_row else 0)
        bowl_particle(layer, food, x, y, i)
    # Clipping: the inside of the opening and anything sticking out above the rim.
    clip = ellipse_points(OPEN_CX, OPEN_CY, OPEN_RX, OPEN_RY, 0, math.pi, 20) + [(OPEN_CX - OPEN_RX, -1), (OPEN_CX + OPEN_RX, -1)]
    d.composite(layer, clip=("poly", clip))


def bowl(model, food=None, level=0):
    s = BOWL_STYLES[model]
    d = Canvas(24, 12, 2)
    d.shaded("polygon", [(2, 5), (21, 5), (18, 11), (5, 11)], *tones(s["body"]))
    if model == "ceramic":  # empreinte de patte
        cream = c(250, 232, 222)
        d.oval(10.7, 8.0, 13.3, 10.2, cream)
        for x, y in ((10.3, 7.2), (11.5, 6.7), (12.5, 6.7), (13.7, 7.2)):
            d.oval(x - 0.5, y - 0.5, x + 0.5, y + 0.5, cream)
    elif model == "steel":  # reflets verticaux
        d.stroke([(6.6, 5.9), (7.4, 10.6)], 0.6, c(246, 248, 252))
        d.stroke([(16.2, 5.9), (15.6, 10.6)], 0.35, c(226, 230, 238))
    else:  # veinage du bois
        vein = c(116, 72, 40)
        d.stroke([(3.6, 7.0), (8, 7.6), (13, 7.2), (19.4, 7.8)], 0.35, vein)
        d.stroke([(5.2, 9.3), (10, 9.9), (15, 9.4), (18.4, 9.9)], 0.35, vein)
    d.shaded("ellipse", (1, 3, 22, 7), *tones(s["rim"]))
    d.ellipse((3, 4, 20, 6), fill=s["inner"])
    if level:
        bowl_contents(d, food, level)
    elif model == "steel":
        d.oval(6, 4.6, 9.5, 5.4, c(150, 156, 170))  # reflet au fond
    return d.finish(s["out"])


# --- lits -------------------------------------------------------------------------


def bed(model):
    d = Canvas(32, 12, 2)
    if model == "cushion":
        d.shaded("rounded", ((1, 4, 30, 11), 3.5), *tones(c(120, 90, 170)))
        d.shaded("rounded", ((3, 2, 28, 8), 3.5), *tones(c(165, 140, 210)))
        d.stroke([(6.5, 5.4), (25.5, 5.4)], 0.45, c(206, 190, 238))
        for x in (10.5, 16.5, 22.5):
            d.oval(x - 0.55, 4.9, x + 0.55, 6.0, c(108, 78, 158))
        return d.finish(c(64, 44, 104))
    if model == "basket":
        blanket = Canvas(32, 12, 2)
        blanket.blob((4, 1, 27, 6), *tones(c(206, 74, 74)))
        for x in range(6, 27, 3):
            blanket.stroke([(x, 0.5), (x - 1.2, 6.5)], 0.45, c(246, 232, 232))
        for y in (2.6, 4.4):
            blanket.stroke([(3, y), (29, y)], 0.45, c(246, 232, 232))
        d.composite(blanket, clip=("ellipse", (4, 1, 27, 6)))
        d.shaded("polygon", [(1, 4), (30, 4), (28, 11), (3, 11)], *tones(c(206, 160, 96)))
        weave = c(158, 112, 58)
        for row, y in enumerate((6.9, 8.6, 10.3)):
            for i in range(14):
                x = 3.2 + i * 2 + (1 if row % 2 else 0)
                if x < 28:
                    d.stroke([(x, y - 0.55), (x + 1.0, y + 0.55)], 0.45, weave)
        d.shaded("rounded", ((0, 3, 31, 5), 1.2), *tones(c(226, 186, 122)))
        return d.finish(c(96, 60, 24))
    # cradle: padded rim, light cushion in the hollow
    d.shaded("rounded", ((1, 3, 30, 11), 4), *tones(c(92, 142, 206)))
    d.shaded("ellipse", (5, 3, 26, 8), *tones(c(236, 238, 246)))
    for x, y in ((3.5, 8.6), (8, 9.8), (13, 10.2), (18.5, 10.2), (23.5, 9.8), (28, 8.6)):
        d.oval(x - 0.45, y - 0.45, x + 0.45, y + 0.45, c(236, 244, 255))
    return d.finish(c(38, 66, 116))


# --- toys -----------------------------------------------------------------------

BALL_COLORS = {"red": c(230, 80, 70), "blue": c(70, 130, 230), "yellow": c(245, 200, 50), "green": c(80, 190, 90)}
YARN_COLORS = {"pink": c(240, 130, 180), "blue": c(110, 160, 235), "yellow": c(245, 210, 90)}


def ball(color):
    base = BALL_COLORS[color]
    d = Canvas(12, 12, 2)
    d.blob((1, 1, 10, 10), *tones(base))
    band = Canvas(12, 12, 2)
    band.stroke([(0.8, 6.4), (4, 7.8), (7.5, 7.9), (11.2, 6.5)], 1.2, c(250, 250, 248))
    band.stroke([(0.8, 7.5), (4, 8.9), (7.5, 9.0), (11.2, 7.6)], 0.35, c(214, 214, 214))
    d.composite(band, clip=("ellipse", (1, 1, 10, 10)))
    d.oval(3.1, 2.5, 5.3, 4.3, mix(base, (255, 255, 255), 0.7))
    return d.finish(edge(base))


def yarn(color):
    base, dark, light = tones(YARN_COLORS[color])
    d = Canvas(12, 12, 2)
    d.stroke([(7.5, 10.6), (9.6, 11.5), (11.3, 11.0), (11.4, 9.8)], 0.5, dark)  # loose strand
    d.blob((0.5, 0.5, 10, 10), base, dark, light)
    strands = Canvas(12, 12, 2)
    cx, cy = 5.75, 5.75
    for fam, (angle, col) in enumerate(((25, light), (100, dark), (160, mix(base, (255, 255, 255), 0.2)))):
        a = math.radians(angle)
        u, v = (math.cos(a), math.sin(a)), (-math.sin(a), math.cos(a))
        for off in (-2.6, -0.9, 0.8, 2.5):
            pts = []
            for i in range(13):
                t = -6 + i
                bulge = off + 0.9 * (1 - (t / 6) ** 2) * (1 if fam % 2 else -1)
                pts.append((cx + t * u[0] + bulge * v[0], cy + t * u[1] + bulge * v[1]))
            strands.stroke(pts, 0.38, col)
    d.composite(strands, clip=("ellipse", (0.5, 0.5, 10, 10)))
    return d.finish(edge(base))


def plush(model):
    d = Canvas(16, 14, 2)
    if model == "bear":
        fur, muzzle = c(190, 140, 90), c(240, 210, 170)
        for x in (3.3, 9.7):
            cblob(d, x, 0.8, x + 3.2, 4.0, fur)
            d.oval(x + 0.8, 1.6, x + 2.4, 3.2, muzzle)
        cblob(d, 1.8, 8.4, 4.8, 11.6, fur)
        cblob(d, 11.2, 8.4, 14.2, 11.6, fur)
        cblob(d, 3, 7, 13, 13.6, fur)
        d.oval(5.6, 8.6, 10.4, 13.1, muzzle)
        cblob(d, 3.4, 1.8, 12.6, 9.6, fur)
        d.oval(6.2, 5.4, 9.8, 8.4, muzzle)
        d.oval(7.3, 5.6, 8.7, 6.7, c(60, 36, 30))
        for x in (5.3, 9.7):
            d.oval(x, 4.1, x + 1.0, 5.2, INK)
        d.stroke([(7.3, 7.6), (8, 7.9), (8.7, 7.6)], 0.28, c(90, 52, 40))
        for x in (4, 9):
            cblob(d, x, 12, x + 3, 14, fur)
        return d.finish(c(88, 54, 28))
    if model == "rabbit":
        fur, pink = c(232, 232, 240), c(240, 170, 190)
        for x in (4.4, 9.2):
            cblob(d, x, 0, x + 2.6, 6.8, fur)
            d.oval(x + 0.75, 0.9, x + 1.85, 5.6, pink)
        cblob(d, 3.5, 8.4, 12.5, 13.8, fur)
        d.oval(5.6, 9.6, 10.4, 13.2, WHITE)
        cblob(d, 3.6, 3.8, 12.4, 10.6, fur)
        for x in (5.4, 9.6):
            d.oval(x, 5.6, x + 1.0, 6.8, INK)
        d.oval(7.4, 7.4, 8.6, 8.3, pink)
        for dy in (-0.4, 0.4):
            d.stroke([(6.6, 8 + dy), (4.6, 7.6 + dy * 2)], 0.2, c(150, 150, 165))
            d.stroke([(9.4, 8 + dy), (11.4, 7.6 + dy * 2)], 0.2, c(150, 150, 165))
        for x in (4, 9):
            cblob(d, x, 12.2, x + 3, 14, fur)
        return d.finish(c(104, 100, 122))
    # grenouille
    green, belly = c(110, 190, 90), c(192, 232, 152)
    for x in (2.8, 9.2):
        cblob(d, x, 0.6, x + 4, 4.8, green)
        d.oval(x + 0.8, 1.3, x + 3.2, 3.7, WHITE)
        d.oval(x + 1.5, 1.9, x + 2.6, 3.2, INK)
    cblob(d, 4, 8.2, 12, 13.8, green)
    d.oval(5.6, 9.2, 10.4, 13.4, belly)
    cblob(d, 1.8, 3.2, 14.2, 10.2, green)
    d.stroke([(4.6, 7.2), (6.5, 8.3), (9.5, 8.3), (11.4, 7.2)], 0.4, c(40, 96, 40))
    for x in (3.5, 11.3):
        d.oval(x, 7.4, x + 1.3, 8.3, c(240, 150, 150))
    for x in (2.4, 10.2):
        cblob(d, x, 12, x + 3.6, 14, green)
    return d.finish(c(36, 86, 36))


def ring(color):
    base, dark, light = tones(c(245, 130, 50))
    d = Canvas(16, 16, 2)
    d.blob((1, 3, 14, 14), base, dark, light)
    stripes = Canvas(16, 16, 2)
    cx, cy = 8.0, 9.0
    for a in (45, 135, 225, 315):
        wedge = [(cx, cy)] + [
            (cx + 10 * math.cos(math.radians(a + t)), cy + 10 * math.sin(math.radians(a + t))) for t in (-17, -8, 0, 8, 17)
        ]
        stripes.poly(wedge, c(248, 246, 244))
    d.composite(stripes, clip=("ellipse", (1, 3, 14, 14)))
    d.stroke([(3.2, 7.4), (4.8, 5.2), (7.4, 4.3)], 0.55, mix(base, (255, 255, 255), 0.6))  # reflet
    d.oval(5.3, 7.3, 10.7, 10.9, mix(base, (0, 0, 0), 0.45))  # ombre du trou
    d.oval(5.4, 7.8, 10.6, 11.0, CLEAR)
    return d.finish(c(120, 54, 20))


TOY_DRAW = {"ball": ball, "yarn": yarn, "plush": plush, "ring": ring}


# --- gifts, litter box, messes, laser ------------------------------------------------


def coin():
    d = Canvas(12, 12, 2)
    gold = c(245, 200, 60)
    d.blob((1, 1, 10, 10), *tones(gold))
    d.ellipse((2.6, 2.6, 8.4, 8.4), outline=c(214, 158, 34), width=0.45)
    star = [(6 + (1.9 if i % 2 == 0 else 0.8) * math.cos(math.radians(-90 + i * 36)),
             6 + (1.9 if i % 2 == 0 else 0.8) * math.sin(math.radians(-90 + i * 36))) for i in range(10)]
    d.poly(star, c(255, 236, 150))
    return d.finish(c(140, 92, 16))


def flower():
    d = Canvas(12, 12, 2)
    d.stroke([(6, 6.5), (6, 11.4)], 0.8, c(60, 150, 70))
    d.poly([(6, 10.2), (8.8, 8.4), (9.4, 9.6)], c(84, 170, 84))
    for i in range(5):
        a = math.radians(-90 + i * 72)
        x, y = 6 + 2.1 * math.cos(a), 4.6 + 2.1 * math.sin(a)
        cblob(d, x - 1.35, y - 1.35, x + 1.35, y + 1.35, c(240, 110, 150))
    cblob(d, 4.9, 3.5, 7.1, 5.7, c(250, 220, 90))
    return d.finish(c(110, 40, 70))


def feather():
    d = Canvas(12, 12, 2)
    vane = [(1.8, 10.8), (2.2, 8.0), (4.6, 4.6), (8.0, 1.8), (10.6, 1.0), (10.2, 3.2), (8.4, 6.6), (5.4, 9.2), (3.0, 10.6)]
    d.shaded("poly", vane, *tones(c(90, 160, 230)))
    d.stroke([(1.4, 11.3), (4.8, 6.6), (10.2, 1.4)], 0.4, c(232, 242, 252))
    for t in (0.35, 0.55, 0.75):
        x, y = 1.4 + (10.2 - 1.4) * t, 11.3 + (1.4 - 11.3) * t
        d.stroke([(x, y), (x + 1.3, y + 1.0)], 0.28, c(60, 120, 200))
    return d.finish(c(30, 60, 120))


def litter(dirty):
    d = Canvas(24, 10, 2)
    d.shaded("polygon", [(1, 4), (22, 4), (20, 9), (3, 9)], *tones(c(120, 130, 190)))
    sand = c(170, 150, 110) if dirty else c(226, 210, 170)
    d.shaded("ellipse", (2, 2, 21, 5.4), *tones(sand))
    for i, (x, y) in enumerate(((5, 3.6), (8.2, 3.1), (11.5, 3.8), (14.6, 3.2), (17.8, 3.7), (9.8, 4.6), (13.4, 4.5))):
        d.oval(x - 0.25, y - 0.2, x + 0.25, y + 0.2, mix(sand, (0, 0, 0), 0.25 if i % 2 else 0.15))
    if dirty:
        for x, y in ((6.2, 2.4), (11, 1.8), (16.2, 2.4)):
            cblob(d, x - 1.3, y - 0.3, x + 1.5, y + 1.6, c(112, 80, 50))
    d.shaded("rounded", ((0.5, 3.4, 22.5, 4.8), 0.7), *tones(c(150, 160, 214)))
    return d.finish(c(46, 50, 86))


def mess(old):
    d = Canvas(10, 6, 2)
    base = c(92, 100, 54) if old else c(122, 82, 50)
    cblob(d, 1, 2.6, 9, 6, base)
    cblob(d, 2.6, 1.1, 7.2, 4.1, mix(base, (255, 255, 255), 0.08))
    cblob(d, 4.0, 0.1, 6.0, 1.9, mix(base, (255, 255, 255), 0.12))
    if old:
        d.stroke([(3, 4.4), (4.4, 3.8), (5.2, 4.6)], 0.25, c(60, 64, 34))
        for x, y in ((0.9, 0.9), (8.6, 1.3)):  # mouches
            d.oval(x - 0.55, y - 0.75, x + 0.25, y - 0.05, c(210, 220, 232))
            d.oval(x - 0.4, y - 0.4, x + 0.4, y + 0.4, INK)
    return d.finish(c(44, 34, 22) if not old else c(42, 44, 22))


def laser():
    d = Canvas(8, 8, 2)
    for r, col in ((3.9, c(255, 40, 40, 50)), (3.2, c(255, 40, 40, 100)), (2.5, c(255, 50, 50, 170)),
                   (1.9, c(255, 40, 40)), (1.0, c(255, 196, 196))):
        d.oval(4 - r, 4 - r, 4 + r, 4 + r, col)
    return d.finish(None)


# --- proies -----------------------------------------------------------------------


def mouse(f):
    d = Canvas(16, 10, 2)
    d.stroke([(2.6, 6.6), (1.2, 6.0 + f * 0.6), (0.4, 4.4 + f * 1.4)], 0.55, c(220, 160, 170))
    for x in (4 + f * 0.8, 8.5 - f * 0.8):
        d.oval(x - 0.7, 7.9, x + 0.7, 9.3, c(112, 112, 128))
    cblob(d, 2, 3, 11.5, 9, c(150, 150, 165))
    cblob(d, 9.4, 3.4, 14.8, 8.4, c(170, 170, 185))
    d.oval(9.0, 1.4, 11.8, 4.4, c(150, 150, 165))
    d.oval(9.5, 1.9, 11.3, 3.9, c(232, 152, 172))
    d.oval(12.3, 4.8, 13.3, 5.9, INK)
    d.oval(12.55, 5.0, 12.9, 5.35, WHITE)
    d.oval(14.2, 5.9, 15.3, 6.9, c(232, 150, 170))
    for dy in (-0.5, 0.4):
        d.stroke([(14, 6.6), (15.8, 6.4 + dy * 2)], 0.15, c(110, 110, 124))
    return d.finish(c(50, 40, 44))


def beetle(f):
    d = Canvas(10, 8, 2)
    leg = c(52, 32, 22)
    for i, x in enumerate((2.4, 4.4, 6.4)):
        swing = 0.7 if (i + f) % 2 else -0.7
        d.stroke([(x, 5.4), (x + swing, 7.4)], 0.35, leg)
    cblob(d, 1, 1, 8.6, 6.8, c(110, 70, 40))
    d.stroke([(4.8, 1.4), (4.8, 6.4)], 0.3, c(66, 38, 20))
    cblob(d, 7.3, 2.3, 9.6, 5.3, c(58, 40, 30))
    d.stroke([(9.2, 2.6), (9.9, 1.0)], 0.25, leg)
    return d.finish(c(40, 24, 14))


def aphid(f):
    d = Canvas(6, 5, 2)
    for x in (1.2 + f * 0.4, 3.2 - f * 0.4):
        d.oval(x - 0.35, 3.7, x + 0.35, 4.6, c(52, 92, 40))
    cblob(d, 0.3, 0.4, 5, 4.1, c(120, 200, 100))
    d.oval(3.8, 1.5, 4.4, 2.1, INK)
    return d.finish(c(40, 80, 30))


def krill(f):
    d = Canvas(8, 6, 2)
    body = c(240, 150, 150)
    d.poly([(1.4, 2.8), (0.1, 1.2 + f * 0.8), (0.1, 4.4 - f * 0.8)], mix(body, (0, 0, 0), 0.15))
    for i, x in enumerate((1.4, 2.6, 3.8, 5.0)):
        cblob(d, x, 1.4 + 0.2 * i, x + 1.8, 4.2, body)
    d.oval(5.5, 1.9, 6.2, 2.6, INK)
    d.stroke([(6.4, 2.2), (7.8, 0.6)], 0.2, c(200, 110, 120))
    return d.finish(c(130, 50, 60))


PREY_DRAW = {"mouse": mouse, "beetle": beetle, "aphid": aphid, "krill": krill}


# --- plantes ----------------------------------------------------------------------


def plant(kind, n):
    d = Canvas(16, 14, 2)
    if kind == "grass":
        d.shaded("rounded", ((1.5, 12, 14.5, 13.6), 0.8), *tones(c(112, 76, 42)))
        clusters = [3.8, 8, 12.2][:n] or [8]
        for x in clusters:
            h = 9 if n else 2.4
            for dx, lean, col in ((-0.6, -1.8, c(66, 160, 66)), (0.6, 1.9, c(98, 196, 88)), (0, 0.2, c(80, 178, 76))):
                d.stroke([(x + dx, 12.4), (x + dx + lean * 0.4, 12.4 - h * 0.55), (x + dx + lean, 12.4 - h)], 0.75,
                         col if n else c(160, 164, 88))
        return d.finish(c(38, 66, 28))
    if kind == "berries":
        cblob(d, 2, 5, 14, 14, c(60, 140, 70) if n else c(96, 114, 72))
        for x, y in ((5, 7.4), (9.6, 6.6), (11.4, 10), (4.6, 11)):
            d.oval(x - 0.9, y - 0.5, x + 0.9, y + 0.5, c(96, 176, 96) if n else c(120, 132, 90))
        for x, y in ((5, 8), (10, 7.3), (7.5, 10.4))[:n]:
            cblob(d, x - 1.2, y - 1.2, x + 1.2, y + 1.2, c(220, 50, 70))
        return d.finish(c(30, 70, 40))
    if kind == "leaf":
        d.shaded("ellipse", (4, 12, 11, 13.4), *tones(c(112, 76, 42)))
        d.stroke([(8, 12.6), (8, 7.6)], 0.7, c(70, 110, 50))
        leaves = [(8, 4.4, 0), (4.8, 7.4, -55), (11.2, 7.4, 55)][:n]
        for x, y, a in leaves:
            # Almond-shaped leaf, pointed at both ends, rotated around its base.
            lens = rotated([(x + 1.7 * math.copysign(abs(math.sin(t)) ** 1.4, math.sin(t)), y - 2.8 * math.cos(t))
                            for t in [2 * math.pi * i / 24 for i in range(24)]], x, y + 2.2, a)
            d.shaded("poly", lens, *tones(c(80, 180, 80)))
            d.stroke(rotated([(x, y + 2.2), (x, y - 2.0)], x, y + 2.2, a), 0.25, c(56, 132, 56))
        if not n:
            d.oval(7.4, 6.6, 8.6, 8.0, c(120, 160, 80))
        return d.finish(c(30, 80, 40))
    # algue
    d.shaded("ellipse", (2, 12, 14, 13.6), *tones(c(122, 126, 132)))
    for x in [4.2, 8, 11.8][:n] or [8]:
        top = 2.0 if n else 9.5
        pts = [(x + 0.9 * math.sin(y * 0.9 + x), y) for y in [12.4 - (12.4 - top) * i / 10 for i in range(11)]]
        d.stroke(pts, 1.1, c(60, 170, 120) if n else c(100, 150, 120))
        d.stroke(pts, 0.4, c(130, 214, 168))
    return d.finish(c(20, 80, 70))


# --- accessoires --------------------------------------------------------------------


def partyhat():
    d = Canvas(16, 16, 2)
    d.shaded("poly", [(8, 1.6), (3, 14.6), (13, 14.6)], *tones(c(240, 90, 140)))
    for x, y, col in ((7.4, 6.4, c(250, 220, 90)), (9.2, 9.4, c(90, 200, 240)), (6.4, 11.4, c(250, 220, 90)), (10.2, 12.8, c(250, 250, 250))):
        d.oval(x - 0.6, y - 0.6, x + 0.6, y + 0.6, col)
    d.stroke([(3.4, 14.4), (12.6, 14.4)], 0.8, c(250, 226, 110))
    cblob(d, 6.8, 0, 9.2, 2.4, c(250, 220, 90))
    return d.finish(c(110, 30, 70))


def bow():
    d = Canvas(16, 16, 2)
    red = c(230, 70, 90)
    d.poly([(7, 10), (6, 13.6), (7.6, 13.2)], mix(red, (0, 0, 0), 0.2))
    d.poly([(9, 10), (10, 13.6), (8.4, 13.2)], mix(red, (0, 0, 0), 0.2))
    d.shaded("poly", [(8, 9.4), (4, 5.2), (1.6, 4.8), (1.4, 8.4), (1.8, 12.8), (4, 12.6)], *tones(red))
    d.shaded("poly", [(8, 9.4), (12, 5.2), (14.4, 4.8), (14.6, 8.4), (14.2, 12.8), (12, 12.6)], *tones(red))
    cblob(d, 6.4, 7.4, 9.6, 10.8, c(196, 44, 72))
    return d.finish(c(110, 20, 40))


def glasses():
    d = Canvas(16, 16, 2)
    frame = c(40, 40, 60)
    for x in (1, 9):
        d.oval(x, 9, x + 6, 15, c(190, 225, 245, 170))
        d.ellipse((x, 9, x + 5, 14), outline=frame, width=1.0)
        d.stroke([(x + 1.4, 10.8), (x + 2.6, 10.2)], 0.35, c(250, 252, 255))
    d.stroke([(7, 11.6), (8, 11.1), (9, 11.6)], 0.8, frame)
    return d.finish(None)


def glasses_side():
    """Glasses seen in profile (for a critter drawn side-on): the near lens over the eye, a temple going back to the ear."""
    d = Canvas(16, 16, 2)
    frame = c(40, 40, 60)
    d.stroke([(7.7, 8.2), (4.2, 7.8), (1.4, 8.4), (1.0, 10.2)], 0.8, frame)  # temple, hooked behind the ear
    d.oval(7.6, 5.6, 14.6, 12.4, c(190, 225, 245, 170))
    d.ellipse((7.6, 5.6, 14.0, 11.8), outline=frame, width=1.0)
    d.stroke([(9.1, 7.6), (10.6, 6.8)], 0.4, c(250, 252, 255))
    return d.finish(None)


def crown():
    d = Canvas(16, 16, 2)
    d.shaded("polygon", [(2, 14), (2, 5), (5, 9), (8, 3), (11, 9), (14, 5), (14, 14)], *tones(c(245, 200, 60)))
    d.shaded("rounded", ((2, 11.4, 14, 14), 0.5), *tones(c(222, 160, 30)))
    for x, col in ((4.6, c(230, 60, 80)), (8.5, c(80, 140, 230)), (12.4, c(230, 60, 80))):
        cblob(d, x - 0.9, 11.9, x + 0.9, 13.7, col)
    for x, y in ((2.5, 5.2), (8.5, 3.2), (14.5, 5.2)):
        cblob(d, x - 0.9, y - 1.1, x + 0.9, y + 0.7, c(252, 226, 120))
    return d.finish(c(130, 84, 10))


def santa():
    d = Canvas(16, 16, 2)
    d.shaded("poly", [(12.4, 2.2), (9.6, 3.2), (3.4, 12.6), (13.6, 12.6), (11.4, 5.4)], *tones(c(210, 40, 50)))
    d.shaded("rounded", ((2, 10.6, 14, 14.2), 1.6), *tones(c(246, 246, 246)))
    cblob(d, 10.4, 0, 13.8, 3.4, c(246, 246, 246))
    return d.finish(c(110, 20, 30))


def witch():
    d = Canvas(16, 16, 2)
    purple = c(66, 44, 98)
    d.shaded("poly", [(9.6, 0.2), (8.4, 2.4), (5, 11.4), (11.4, 11.4), (9.6, 4)], *tones(purple))
    d.shaded("ellipse", (0.5, 10.4, 15.5, 13.8), *tones(purple))
    d.shaded("rounded", ((5, 9, 11.4, 10.9), 0.3), *tones(c(230, 160, 40)))
    d.ellipse((7.2, 9.2, 8.8, 10.6), outline=c(252, 222, 110), width=0.35)
    return d.finish(c(22, 12, 36))


# Trophies (given at the 25th, 50th, and 100th achievement) and jokes (Committee rewards).


def medal():
    """Contest rosette pinned on the head: hanging ribbons, blue rosette, gold heart."""
    d = Canvas(16, 16, 2)
    blue = c(60, 110, 210)
    d.poly([(6.6, 8.5), (4.4, 15.6), (6.2, 14.6), (7.6, 15.8), (8.4, 9)], mix(blue, (0, 0, 0), 0.15))
    d.poly([(9.4, 8.5), (11.6, 15.6), (9.8, 14.6), (8.4, 15.8), (7.6, 9)], blue)
    for i in range(12):
        a = 2 * math.pi * i / 12
        x, y = 8 + 4.2 * math.cos(a), 6.5 + 4.2 * math.sin(a)
        d.oval(x - 1.6, y - 1.6, x + 1.6, y + 1.6, blue if i % 2 else mix(blue, (255, 255, 255), 0.25))
    cblob(d, 5.2, 3.7, 10.8, 9.3, c(245, 200, 60))
    star = [(8 + (1.7 if i % 2 == 0 else 0.7) * math.cos(math.radians(-90 + i * 36)),
             6.5 + (1.7 if i % 2 == 0 else 0.7) * math.sin(math.radians(-90 + i * 36))) for i in range(10)]
    d.poly(star, c(255, 240, 170))
    return d.finish(c(30, 50, 110))


def laurel():
    """Laurel wreath seen in profile: two rows of leaves around a headband."""
    d = Canvas(16, 16, 2)
    back, front = c(70, 130, 60), c(110, 176, 84)
    for layer, color, t0, t1 in ((0, back, math.pi, 2 * math.pi), (1, front, 0, math.pi)):
        for i in range(8):
            t = t0 + (t1 - t0) * (i + 0.5) / 8
            x, y = 8 + 6.4 * math.cos(t), 11.6 + 2.6 * math.sin(t)
            leaf = rotated(ellipse_points(x, y - 1.2, 0.9, 1.8, n=12), x, y, math.degrees(t) + 90)
            d.shaded("poly", leaf, *tones(color))
    d.stroke([(3.2, 13.4), (8, 14.6), (12.8, 13.4)], 0.5, c(220, 170, 40))  # golden headband
    return d.finish(c(30, 64, 26))


def halo():
    """Golden halo floating above the head, with a soft glow."""
    d = Canvas(16, 16, 2)
    d.oval(0.6, 10, 15.4, 15.6, c(255, 236, 140, 70))
    d.ellipse((2, 11, 13, 14), outline=c(230, 180, 40), width=1.3)
    d.ellipse((2.4, 11.2, 12.6, 13.6), outline=c(255, 232, 130), width=0.5)
    return d.finish(None)


def cone():
    """Cone of shame (a vet's collar), seen in profile, open toward the front."""
    d = Canvas(16, 16, 2)
    d.poly([(4, 6), (13.6, 1), (13.6, 15), (4, 10)], c(210, 232, 250, 150))
    d.stroke([(4, 6), (13.6, 1)], 0.5, c(120, 160, 200))
    d.stroke([(4, 10), (13.6, 15)], 0.5, c(120, 160, 200))
    d.stroke([(13.6, 1), (13.6, 15)], 0.9, c(150, 190, 225))
    d.stroke([(4, 6), (4, 10)], 0.7, c(120, 160, 200))
    for x in (6.6, 9.2, 11.8):  # plastic folds
        h = 2 + (x - 4) * 0.52
        d.stroke([(x, 8 - h), (x, 8 + h)], 0.25, c(240, 248, 255, 200))
    return d.finish(None)


def sock():
    """Striped sock worn on the head, the toe flopping over."""
    d = Canvas(16, 16, 2)
    red, white = c(220, 70, 70), c(246, 244, 240)
    body = [(1.4, 8.2), (11.2, 8.2), (13.2, 9.4), (14.2, 12.4), (13.4, 15.4), (10.4, 15.4), (10.2, 12.6), (1.4, 12.6)]
    d.shaded("poly", body, *tones(red))
    stripes = Canvas(16, 16, 2)
    for x in (4, 7, 10):
        stripes.rectangle((x, 7, x + 1, 13), fill=white)
    stripes.rectangle((10, 13.4, 15, 14.2), fill=white)
    d.composite(stripes, clip=("poly", body))
    d.shaded("rounded", ((0.6, 7.4, 3.4, 13.4), 0.8), *tones(white))  # ribbed cuff
    for y in (8.6, 10.2, 11.8):
        d.stroke([(1.0, y), (3.0, y)], 0.25, c(200, 196, 190))
    return d.finish(c(110, 30, 30))


def foilhat():
    """Pointed tinfoil hat, crinkled and shiny."""
    d = Canvas(16, 16, 2)
    d.shaded("poly", [(8.2, 0.8), (2.6, 14.6), (13.6, 14.6)], *tones(c(190, 196, 206)))
    for a, b, col in (((8.2, 1.5), (5.4, 9.5), c(236, 240, 246)), ((7.4, 5), (11.6, 12), c(150, 156, 170)),
                      ((4.4, 11), (9.6, 13.8), c(236, 240, 246)), ((9.6, 6.5), (6.4, 12.6), c(160, 166, 180))):
        d.stroke([a, b], 0.35, col)
    d.oval(6.2, 4.2, 7.6, 6.2, c(255, 255, 255))  # reflet
    d.shaded("rounded", ((1.6, 13.4, 14.6, 15.2), 0.6), *tones(c(176, 182, 194)))
    return d.finish(c(70, 76, 90))


ACCESSORY_SPRITES = {
    "partyhat": partyhat, "bow": bow, "glasses": glasses, "glasses_side": glasses_side, "crown": crown, "santa": santa, "witch": witch,
    "medal": medal, "laurel": laurel, "halo": halo, "cone": cone, "sock": sock, "foilhat": foilhat,
}


# --- thought bubbles ------------------------------------------------------------------

BUBBLE_EDGE = c(70, 70, 90)


def bubble():
    d = Canvas(12, 12, 4)
    d.oval(0, 0, 12, 10.8, BUBBLE_EDGE)
    d.oval(0.55, 0.55, 11.45, 10.25, WHITE)
    d.oval(2.1, 10.1, 4.1, 12, BUBBLE_EDGE)
    d.oval(2.55, 10.55, 3.65, 11.55, WHITE)
    return d


def icon_hungry():
    d = bubble()
    bone = c(236, 206, 156)
    d.stroke([(6.4, 5.8), (8.4, 8.0)], 1.1, bone)
    d.oval(7.8, 7.4, 9.2, 8.8, bone)
    d.oval(8.5, 6.8, 9.8, 8.1, bone)
    cblob(d, 2.6, 1.9, 7.6, 6.9, c(154, 92, 52))
    return d.finish(None)


def icon_sleepy():
    d = bubble()
    blue = c(80, 120, 210)
    d.stroke([(2.9, 3.4), (6, 3.4), (2.9, 7.2), (6.2, 7.2)], 0.8, blue)
    d.stroke([(7.2, 2.1), (9.2, 2.1), (7.2, 4.3), (9.3, 4.3)], 0.6, blue)
    return d.finish(None)


def icon_dirty():
    d = bubble()
    grey = c(120, 120, 140)
    for box in ((2, 4.2, 5.4, 7.6), (5.8, 1.9, 9.4, 5.5), (6.2, 6.1, 8.8, 8.7)):
        d.ellipse(box, outline=grey, width=0.5)
    return d.finish(None)


def icon_bored():
    d = bubble()
    for x in (3.4, 6, 8.6):
        d.oval(x - 0.75, 5.0, x + 0.75, 6.5, c(120, 120, 140))
    return d.finish(None)


def icon_heart():
    d = bubble()
    red = c(225, 60, 80)
    d.oval(2.3, 2.3, 6.3, 6.3, red)
    d.oval(5.7, 2.3, 9.7, 6.3, red)
    d.poly([(2.6, 5.2), (9.4, 5.2), (6, 9)], red)
    d.oval(3.3, 3.0, 4.7, 4.3, c(246, 150, 166))
    return d.finish(None)


def icon_sick():
    d = bubble()
    green = c(60, 160, 90)
    d.rounded((5, 2, 6.9, 8.4), 0.5, green)
    d.rounded((2.8, 4.2, 9.2, 6.1), 0.5, green)
    return d.finish(None)


def icon_break():
    d = bubble()
    grey = c(150, 150, 162)
    d.stroke([(4.4, 3.4), (4.0, 2.4), (4.6, 1.4)], 0.4, grey)
    d.stroke([(6.4, 3.4), (6.0, 2.4), (6.6, 1.4)], 0.4, grey)
    d.ellipse((7, 5.2, 8.9, 7.3), outline=BUBBLE_EDGE, width=0.5)
    d.rounded((2.8, 4.2, 7.6, 8.4), 1.0, BUBBLE_EDGE)
    d.rounded((3.2, 4.6, 7.2, 8.0), 0.8, c(236, 236, 244))
    d.stroke([(2.4, 9.1), (8.6, 9.1)], 0.5, BUBBLE_EDGE)
    return d.finish(None)


def icon_relief():
    d = bubble()
    drop = [(6, 1.6)] + ellipse_points(6, 6.4, 2.5, 2.5, -math.pi * 0.18, math.pi * 1.18, 20)
    d.shaded("poly", drop, *tones(c(80, 150, 230)))
    d.oval(4.6, 5.2, 5.6, 6.6, c(206, 230, 255))
    return d.finish(None)


ICONS = {
    "relief": icon_relief, "break": icon_break, "hungry": icon_hungry, "sleepy": icon_sleepy,
    "dirty": icon_dirty, "bored": icon_bored, "heart": icon_heart, "sick": icon_sick,
}


# --- œuf commun ---------------------------------------------------------------------


def egg_frame(tilt=0, cracked=False):
    d = Canvas(16, 16, 2)
    d.blob((3, 2, 12, 14), *tones(c(240, 226, 190)))
    for x, y in ((5.6, 9.6), (9.6, 6.6), (8.6, 11.6), (10.6, 10.4)):
        d.oval(x - 0.8, y - 0.7, x + 0.8, y + 0.7, c(222, 130, 70))
    if cracked:
        d.stroke([(6.4, 3.4), (8.4, 5.4), (7.4, 7.4), (10.4, 8.4)], 0.45, c(90, 60, 40))
    if tilt:
        d.rotate(tilt, (8, 14))
    return d.finish(c(90, 60, 40))


def egg_sheet():
    frames = [egg_frame(), egg_frame(-10), egg_frame(10), egg_frame(cracked=True)]
    size = frames[0].height
    sheet = Image.new("RGBA", (size * len(frames), size), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * size, 0))
    return sheet


# --- catalogue ------------------------------------------------------------------------


def items():
    """Nom -> fonction de dessin, en miroir de spriteCatalog() (core/itemLooks.js)."""
    out = {}
    for kind, bites in FOODS.items():
        for n in range(1, bites + 1):
            out[f"food_{kind}_{n}"] = lambda k=kind, n=n: food(k, n)
    for model in BOWL_MODELS:
        out[f"bowl_{model}_empty"] = lambda m=model: bowl(m)
        for level in (1, 2, 3):
            for kind in BOWL_FOODS + ["moldy"]:
                out[f"bowl_{model}_{kind}_{level}"] = lambda m=model, k=kind, l=level: bowl(m, k, l)
    for model in BED_MODELS:
        out[f"bed_{model}"] = lambda m=model: bed(m)
    for kind, variants in TOYS.items():
        for variant in variants:
            out[f"toy_{kind}_{variant}"] = lambda k=kind, v=variant: TOY_DRAW[k](v)
    for kind in PLANTS:
        for n in range(4):
            out[f"{kind}_{n}"] = lambda k=kind, n=n: plant(k, n)
    for kind, draw in PREY_DRAW.items():
        for frame in (0, 1):
            out[f"{kind}_{frame}"] = lambda d=draw, f=frame: d(f)
    out.update({
        "coin": coin, "flower": flower, "feather": feather,
        "litter_clean": lambda: litter(False), "litter_dirty": lambda: litter(True),
        "mess": lambda: mess(False), "mess_old": lambda: mess(True), "laser": laser,
    })
    return out


def write_dir(directory, sprites):
    directory.mkdir(parents=True, exist_ok=True)
    for name, draw in sprites.items():
        save_png(draw(), directory / f"{name}.png")
    print(f"wrote {len(sprites)} sprites in {directory.relative_to(ASSETS_DIR.parent.parent)}")


def main():
    catalog = items()
    write_dir(ITEMS_DIR, catalog)
    for stale in sorted(p for p in ITEMS_DIR.glob("*.png") if p.stem not in catalog):
        stale.unlink()
        print(f"  removed (not in catalog): {stale.name}")
    write_dir(ACCESSORIES_DIR, ACCESSORY_SPRITES)
    write_dir(BUBBLES_DIR, ICONS)
    LIFE_DIR.mkdir(parents=True, exist_ok=True)
    save_png(egg_sheet(), LIFE_DIR / "egg.png")
    print("wrote extension/assets/life/egg.png")


if __name__ == "__main__":
    main()
