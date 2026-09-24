#!/usr/bin/env python3
"""Génère les spritesheets (et le câblage animations/réactions des pack.json)
des espèces cat, bug, fish et bird.

Dessin sur une vraie grille 32x32 : ombrage à trois tons, contour 1 px
calculé automatiquement autour de la silhouette, poses partagées entre
espèces (marche, course, salut, réactions...). Les feuilles sont carrées, une
ligne de frames par fichier ; l'affichage à l'écran reste réglé par
`spriteSize` dans pack.json (l'insecte est affiché à 16 px : sa feuille 32 px
est réduite au plus proche voisin).

Le pack `critter-demo` reste géré par gen_placeholder_sprites.py.

Usage : python3 scripts/gen_species_sprites.py [espèce ...]
"""

import json
import math
import re
import sys
from pathlib import Path
from types import SimpleNamespace

from PIL import Image, ImageDraw, ImageOps

G = 32
PACKS_DIR = Path(__file__).resolve().parent.parent / "packs"

WHITE = (255, 255, 255, 255)
INK = (28, 24, 32, 255)


def c(r, g, b):
    return (r, g, b, 255)


# --- outils de dessin -----------------------------------------------------------


def new_canvas():
    img = Image.new("RGBA", (G, G), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def outline(img, color):
    """Contour 1 px sur les pixels transparents adjacents à la silhouette."""
    px = img.load()
    marks = []
    for y in range(G):
        for x in range(G):
            if px[x, y][3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < G and 0 <= ny < G and px[nx, ny][3] > 0:
                    marks.append((x, y))
                    break
    for m in marks:
        px[m] = color


def blob(d, box, base, dark, light):
    """Ellipse à trois tons : ombre en bas, reflet en haut à gauche."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    d.ellipse(box, fill=dark)
    d.ellipse((x0, y0, x1 - max(1, w // 8), y1 - max(1, h // 5)), fill=base)
    d.ellipse(
        (x0 + w * 0.2, y0 + h * 0.12, x0 + w * 0.48, y0 + h * 0.36), fill=light
    )


def px_pattern(d, rows, x, y, color):
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == "X":
                d.point((x + i, y + j), fill=color)


MARKS = {
    "!": ["X", "X", "X", "X", ".", "X"],
    "z": ["XXXX", "..X.", ".X..", "XXXX"],
    "heart": [".X.X.", "XXXXX", "XXXXX", ".XXX.", "..X.."],
    "bubble": [".XX.", "X..X", "X..X", ".XX."],
}
MARK_COLORS = {
    "!": c(230, 50, 50),
    "z": c(90, 110, 170),
    "heart": c(235, 70, 110),
    "bubble": c(150, 200, 240),
}


def mark(d, kind, x, y):
    if kind:
        px_pattern(d, MARKS[kind], x, y, MARK_COLORS[kind])


def eye(d, x, y, kind):
    if kind == "open":
        d.rectangle((x, y, x + 1, y + 1), fill=INK)
        d.point((x, y), fill=WHITE)
    elif kind in ("closed", "blink"):
        d.line((x - 1, y + 1, x + 1, y + 1), fill=INK)
    elif kind == "happy":
        d.point((x - 1, y + 1), fill=INK)
        d.point((x, y), fill=INK)
        d.point((x + 1, y + 1), fill=INK)
    elif kind == "wide":
        d.rectangle((x - 1, y - 1, x + 1, y + 1), fill=WHITE)
        d.point((x, y), fill=INK)
    elif kind == "angry":
        d.rectangle((x, y, x + 1, y + 1), fill=INK)
        d.line((x - 1, y - 2, x + 2, y - 1), fill=INK)


def pose(**kw):
    base = dict(
        bob=0, tail=0, phase=None, stride=3, lift=2, eyes="open", mark=None,
        squash=0, rot=0, ears="up", kind=None, wing="folded", fin=0, mouth=False, pivot=None, head=0,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def leg_offsets(phase, n, stride, lift, offsets=(0, 0.5, 0.5, 0)):
    """(dx, lift) pour chaque patte à la frame `phase` d'un cycle de `n`."""
    out = []
    for off in offsets:
        t = phase / n + off
        dx = round(stride * math.sin(2 * math.pi * t))
        up = max(0, round(lift * math.cos(2 * math.pi * t)))
        out.append((dx, up))
    return out


# --- poses communes (marche, course, salut, réactions) ---------------------------


def walk_poses(n=6, stride=3, run=False):
    out = []
    for i in range(n):
        bob = -(1 if i % (n // 2) < (n // 4 + 1) and run else 0) - (1 if i % 3 == 0 else 0)
        out.append(pose(
            bob=bob, phase=i, stride=stride + (2 if run else 0), lift=3 if run else 2,
            tail=[0, 1, 0, -1, 0, 1][i % 6], ears="back" if run else "up", kind="run" if run else None,
        ))
    return out


def common_sheets():
    return {
        "idle": [pose(bob=b, tail=t, eyes=e) for b, t, e in
                 [(0, -1, "open"), (0, 0, "open"), (1, 1, "open"), (0, 0, "blink")]],
        "walk": walk_poses(6),
        "chase": walk_poses(6, stride=3, run=True),
        "flee": [pose(**{**p.__dict__, "eyes": "wide", "tail": 2, "mark": "!" if i == 0 else None})
                 for i, p in enumerate(walk_poses(6, stride=3, run=True))],
        "greet": [pose(bob=b, tail=t, eyes="happy") for b, t in [(0, 2), (-1, 3), (0, 2), (-1, 1)]],
        "play": [pose(bob=-(i % 3), phase=i, stride=4, lift=3, eyes="happy" if i % 2 else "open", mouth=True, tail=[0, 1, 0, -1, 0, 1][i], head=2)
                 for i in range(6)],
        "react_petted": [pose(eyes="happy", bob=1, mark="heart"), pose(eyes="happy", bob=0, mark="heart", tail=2)],
        "react_tickled": [pose(eyes="happy", squash=1, rot=-6, tail=2), pose(eyes="happy", squash=0, rot=6, tail=-2),
                          pose(eyes="happy", squash=1, rot=-6, tail=2), pose(eyes="happy", squash=0, rot=6, tail=-2)],
        "react_annoyed": [pose(eyes="angry", ears="back", mark="!", tail=2), pose(eyes="angry", ears="back", tail=-2)],
        "react_startled": [pose(eyes="wide", bob=-4, kind="jump", ears="up", mark="!", tail=2),
                           pose(eyes="wide", bob=-2, kind="jump", ears="up", tail=2)],
        "react_noticed": [pose(eyes="wide", ears="up"), pose(eyes="open", ears="up", tail=1)],
    }


# --- chat ------------------------------------------------------------------------

CAT_BASE = c(150, 152, 165)
CAT_DARK = c(92, 94, 112)
CAT_LIGHT = c(200, 202, 212)
CAT_PINK = c(235, 140, 160)
CAT_OUT = c(38, 38, 52)


def cat_head(d, x, y, p, tilt=0):
    blob(d, (x, y, x + 12, y + 12), CAT_BASE, CAT_DARK, CAT_LIGHT)
    if p.ears == "back":
        d.polygon([(x + 1, y + 4), (x - 2, y - 1), (x + 6, y + 1)], fill=CAT_DARK)
        d.polygon([(x + 7, y + 1), (x + 13, y - 1), (x + 12, y + 4)], fill=CAT_DARK)
    else:
        d.polygon([(x + 1, y + 4), (x + 1, y - 4), (x + 6, y + 1)], fill=CAT_BASE)
        d.polygon([(x + 2, y + 3), (x + 2, y - 1), (x + 4, y + 1)], fill=CAT_PINK)
        d.polygon([(x + 7, y + 1), (x + 12, y - 4), (x + 12, y + 4)], fill=CAT_BASE)
        d.polygon([(x + 9, y + 1), (x + 11, y - 1), (x + 11, y + 3)], fill=CAT_PINK)
    eye(d, x + 7, y + 5, p.eyes)
    d.point((x + 11, y + 8), fill=CAT_PINK)
    d.line((x + 9, y + 10, x + 11, y + 10), fill=CAT_DARK) if p.mouth else None
    d.point((x + 11, y + 10), fill=CAT_DARK)


def draw_cat(img, d, p):
    b = p.bob
    sq = p.squash
    # queue
    tip = 9 + b - p.tail * 2
    d.line((5, 19 + b, 2, 15 + b, 3, tip), fill=CAT_DARK, width=2)
    # pattes
    legs = leg_offsets(p.phase or 0, 6, p.stride, p.lift) if p.phase is not None else None
    for k, x in enumerate((7, 11, 18, 22)):
        if p.kind == "jump":
            d.line((x, 24 + b, x + (-2 if k % 2 == 0 else 2), 28 + b), fill=CAT_DARK, width=2)
        elif legs is None:
            d.line((x, 24 + b, x, 29), fill=CAT_DARK, width=2)
        else:
            dx, up = legs[k]
            d.line((x, 24 + b, x + dx, 29 - up), fill=CAT_DARK, width=2)
    # corps
    blob(d, (4, 13 + b + sq, 24, 27 + b), CAT_BASE, CAT_DARK, CAT_LIGHT)
    for x in (9, 13, 17):
        d.line((x, 14 + b + sq, x + 1, 17 + b + sq), fill=CAT_DARK)
    cat_head(d, 18, 6 + b + p.head, p)
    mark(d, p.mark, 26, 0)


def draw_cat_sleep(img, d, p):
    blob(d, (3, 15, 27, 29), CAT_BASE, CAT_DARK, CAT_LIGHT)
    blob(d, (16, 15, 28, 27), CAT_BASE, CAT_DARK, CAT_LIGHT)
    d.polygon([(17, 17), (17, 12), (21, 16)], fill=CAT_BASE)
    d.polygon([(23, 16), (27, 12), (27, 18)], fill=CAT_BASE)
    d.line((20, 21, 23, 21), fill=INK)
    d.line((5, 26, 14, 28), fill=CAT_DARK, width=2)  # queue enroulée
    for x in (9, 12, 15):
        d.line((x, 17, x + 1, 20), fill=CAT_DARK)
    mark(d, p.mark, 24, 2)


def draw_cat_wash(img, d, p):
    """Assis, lèche une patte levée."""
    blob(d, (6, 12, 21, 30), CAT_BASE, CAT_DARK, CAT_LIGHT)
    d.line((5, 27, 1, 22, 2, 17), fill=CAT_DARK, width=2)
    cat_head(d, 15, 3, pose(eyes="closed"))
    lift = p.lift
    d.line((17, 19, 24, 12 + lift), fill=CAT_DARK, width=3)  # patte levée
    if p.mouth:
        d.point((27, 13 + lift), fill=CAT_PINK)


def draw_cat_climb(img, d, p):
    """Vue de dos contre un mur : tête en haut, pattes qui alternent."""
    b = p.bob
    d.line((16, 26 + b, 16, 31), fill=CAT_DARK, width=2)
    reach = p.lift
    d.line((9, 14 + b, 4, 10 + b - reach), fill=CAT_DARK, width=2)
    d.line((23, 14 + b, 28, 10 + b + reach), fill=CAT_DARK, width=2)
    d.line((10, 24 + b, 6, 27 + b + reach), fill=CAT_DARK, width=2)
    d.line((22, 24 + b, 26, 27 + b - reach), fill=CAT_DARK, width=2)
    blob(d, (8, 10 + b, 24, 28 + b), CAT_BASE, CAT_DARK, CAT_LIGHT)
    for y in (15, 19, 23):
        d.line((11, y + b, 14, y + b + 1), fill=CAT_DARK)
        d.line((18, y + b + 1, 21, y + b), fill=CAT_DARK)
    blob(d, (10, 2 + b, 22, 13 + b), CAT_BASE, CAT_DARK, CAT_LIGHT)
    d.polygon([(10, 5 + b), (10, -1 + b), (15, 3 + b)], fill=CAT_BASE)
    d.polygon([(17, 3 + b), (22, -1 + b), (22, 5 + b)], fill=CAT_BASE)


def cat_sheets():
    s = common_sheets()
    s["fall"] = [pose(bob=-1, tail=t, eyes="wide", kind="jump") for t in (2, -2)]
    s["eat"] = [pose(head=h, mouth=m, tail=t) for h, m, t in [(5, False, 0), (6, True, 1), (5, False, 0), (6, True, -1)]]
    s["relieve"] = [pose(bob=2, squash=2, eyes=e) for e in ("closed", "open")]
    s["trick_sit"] = [pose(kind="wash", lift=l) for l in (0, 1)]
    s["trick_roll"] = [pose(rot=-i * 60, pivot=18, eyes="happy") for i in range(6)]
    s["sleep"] = [pose(kind="sleep"), pose(kind="sleep", mark="z")]
    s["wash"] = [pose(kind="wash", lift=l, mouth=m) for l, m in [(3, False), (1, True), (0, True), (2, False)]]
    s["climb"] = [pose(kind="climb", bob=-(i % 2), lift=[0, 1, 2, 1, 0, -1][i]) for i in range(6)]
    return s


# --- insecte ---------------------------------------------------------------------

BUG_BASE = c(72, 160, 78)
BUG_DARK = c(38, 96, 52)
BUG_LIGHT = c(150, 220, 130)
BUG_LEG = c(40, 46, 36)


def bug_legs(d, b, p, up=False):
    legs = leg_offsets(p.phase or 0, 6, 2, 2, offsets=(0, 0.5, 0)) if p.phase is not None else [(0, 0)] * 3
    for k, x in enumerate((9, 14, 19)):
        dx, lift = legs[k]
        if up:
            d.line((x, 15 + b, x + dx - 1, 10 + b), fill=BUG_LEG)
        else:
            d.line((x, 24 + b, x + dx - 1, 29 - lift), fill=BUG_LEG)


def draw_bug(img, d, p):
    b = p.bob
    up = p.kind == "back"
    bug_legs(d, b, p, up=up)
    blob(d, (5, 13 + b + p.squash, 25, 27 + b), BUG_BASE, BUG_DARK, BUG_LIGHT)
    d.line((15, 14 + b, 15, 25 + b), fill=BUG_DARK)  # séparation des élytres
    d.point((11, 20 + b), fill=BUG_DARK)
    d.point((19, 22 + b), fill=BUG_DARK)
    h = p.head
    blob(d, (22, 16 + b + h, 30, 25 + b), c(84, 96, 74), c(58, 68, 52), c(120, 136, 104))
    eye(d, 26, 19 + b + h, "open" if p.eyes == "blink" else p.eyes)
    aw = -1 if p.tail < 0 else p.tail
    d.line((27, 16 + b, 29, 11 + b - aw), fill=BUG_LEG)
    d.line((25, 16 + b, 26, 11 + b + aw), fill=BUG_LEG)
    mark(d, p.mark, 5, 1)


def draw_bug_climb(img, d, p):
    b = p.bob
    for k, y in enumerate((14, 19, 24)):
        swing = [1, -1][(k + p.phase) % 2] * 2
        d.line((9, y + b, 3, y + b + swing), fill=BUG_LEG)
        d.line((23, y + b, 29, y + b - swing), fill=BUG_LEG)
    blob(d, (9, 9 + b, 23, 30 + b), BUG_BASE, BUG_DARK, BUG_LIGHT)
    d.line((16, 11 + b, 16, 29 + b), fill=BUG_DARK)
    blob(d, (11, 2 + b, 21, 11 + b), BUG_LEG, BUG_LEG, BUG_DARK)
    d.line((12, 3 + b, 9, -0 + b), fill=BUG_LEG)
    d.line((20, 3 + b, 23, 0 + b), fill=BUG_LEG)


def bug_sheets():
    s = common_sheets()
    s["idle"] = [pose(tail=t, eyes=e) for t, e in [(0, "open"), (1, "open"), (0, "blink"), (-1, "open")]]
    s["walk"] = [pose(bob=-(i % 2), phase=i, tail=[0, 1, 0, -1, 0, 1][i]) for i in range(6)]
    s.pop("chase")
    s["flee"] = [pose(bob=-(i % 2), phase=i, eyes="wide", tail=2, mark="!" if i == 0 else None) for i in range(6)]
    s["fall"] = [pose(bob=0, kind="back", phase=i, tail=i) for i in range(2)]
    s["climb"] = [pose(kind="climb", phase=i, bob=-(i % 2)) for i in range(6)]
    s["eat"] = [pose(head=h, tail=t) for h, t in [(2, 0), (0, 1), (2, 0), (0, -1)]]
    s["relieve"] = [pose(bob=2, eyes=e) for e in ("closed", "open")]
    s["trick_roll"] = [pose(rot=-i * 60, pivot=18, eyes="happy") for i in range(6)]
    return s


# --- poisson ---------------------------------------------------------------------

FISH_BASE = c(244, 142, 42)
FISH_DARK = c(200, 92, 24)
FISH_LIGHT = c(255, 210, 120)
FISH_FIN = c(255, 190, 80)


def draw_fish(img, d, p):
    b = p.bob
    puff = 2 if p.kind == "jump" else 0
    ty = p.tail * 3
    d.polygon([(8, 16 + b), (0, 8 + b + ty), (1, 16 + b + ty), (0, 24 + b + ty)], fill=FISH_FIN)
    d.polygon([(12, 10 + b), (17, 3 + b), (22, 10 + b)], fill=FISH_FIN)  # dorsale
    d.polygon([(13, 21 + b), (17, 27 + b + p.fin), (20, 21 + b)], fill=FISH_FIN)  # ventrale
    blob(d, (5 - puff, 9 + b - puff, 29 + puff, 24 + b + puff), FISH_BASE, FISH_DARK, FISH_LIGHT)
    d.line((18, 11 + b, 18, 22 + b), fill=FISH_DARK)  # ouïe
    for x, y in ((10, 14), (13, 17), (10, 19)):
        d.point((x, y + b), fill=FISH_DARK)
    d.point((26, 19 + b), fill=FISH_DARK)  # bouche
    kind = "wide" if p.eyes == "wide" else p.eyes
    eye(d, 23, 14 + b, kind)
    mark(d, p.mark, 26, 1)


def fish_sheets():
    s = common_sheets()
    for k in ("walk", "chase", "play"):
        s.pop(k)
    s["idle"] = [pose(bob=b, tail=t, eyes=e, mark=m) for b, t, e, m in
                 [(0, 0, "open", None), (1, 1, "open", "bubble"), (1, 0, "open", None), (0, -1, "blink", None)]]
    s["swim"] = [pose(tail=t, bob=b, fin=f) for t, b, f in
                 [(-1, 0, 0), (0, 0, 1), (1, 1, 0), (1, 1, 1), (0, 0, 0), (-1, 0, 1)]]
    s["flee"] = [pose(tail=t * 2 // 1 if abs(t) < 2 else t, bob=0, eyes="wide", fin=1, mark="!" if i == 0 else None)
                 for i, t in enumerate([-1, 1, -1, 1, -1, 1])]
    s["greet"] = [pose(tail=t, eyes="happy", mark=m) for t, m in [(-1, "bubble"), (1, None), (-1, None), (1, "bubble")]]
    s["swimFast"] = [pose(tail=t, fin=f) for t, f in [(-2, 0), (0, 1), (2, 0), (0, 1), (-2, 0), (0, 1)]]
    s["trick_flip"] = [pose(tail=(-1) ** i, rot=-i * 60, pivot=16, eyes="happy") for i in range(6)]
    s["fall"] = [pose(tail=t, rot=r, eyes="wide") for t, r in [(-1, -14), (1, 14)]]
    return s


# --- oiseau ----------------------------------------------------------------------

BIRD_BASE = c(74, 134, 224)
BIRD_DARK = c(38, 84, 168)
BIRD_LIGHT = c(140, 190, 250)
BIRD_BELLY = c(232, 232, 248)
BIRD_BEAK = c(250, 176, 40)


def bird_wing(d, b, wing):
    if wing == "folded":
        blob(d, (6, 15 + b, 17, 24 + b), BIRD_DARK, BIRD_DARK, BIRD_BASE)
    elif wing == "up":
        d.polygon([(7, 15 + b), (17, 15 + b), (5, 1 + b), (3, 8 + b)], fill=BIRD_DARK)
        d.line((6, 4 + b, 10, 14 + b), fill=BIRD_BASE)
    elif wing == "mid":
        d.polygon([(6, 16 + b), (17, 16 + b), (0, 12 + b), (0, 16 + b)], fill=BIRD_DARK)
        d.line((2, 14 + b, 12, 16 + b), fill=BIRD_BASE)
    elif wing == "down":
        d.polygon([(7, 18 + b), (17, 18 + b), (4, 30), (2, 24)], fill=BIRD_DARK)
        d.line((5, 24, 10, 19 + b), fill=BIRD_BASE)


def draw_bird(img, d, p):
    b = p.bob
    flying = p.kind in ("fly", "flee")
    d.polygon([(6, 18 + b), (0, 15 + b - p.tail), (0, 21 + b - p.tail), (5, 23 + b)], fill=BIRD_DARK)  # queue
    if not flying and p.kind != "sleep":
        legs = leg_offsets(p.phase or 0, 6, 2, 2, offsets=(0, 0.5)) if p.phase is not None else [(0, 0)] * 2
        for k, x in enumerate((12, 17)):
            dx, up = legs[k]
            d.line((x, 25 + b, x + dx, 30 - up), fill=BIRD_BEAK)
    elif flying:
        d.line((12, 25 + b, 11, 28 + b), fill=BIRD_BEAK)
        d.line((16, 25 + b, 17, 28 + b), fill=BIRD_BEAK)
    blob(d, (5, 13 + b, 23, 27 + b), BIRD_BASE, BIRD_DARK, BIRD_LIGHT)
    d.ellipse((10, 19 + b, 21, 27 + b), fill=BIRD_BELLY)
    hx, hy = (16, 9 + b + p.head) if p.kind != "preen" else (14, 13 + b)
    if p.kind == "sleep":
        hx, hy = (15, 12 + b)
    blob(d, (hx, hy - 4, hx + 12, hy + 8), BIRD_BASE, BIRD_DARK, BIRD_LIGHT)
    if p.kind == "preen":
        d.polygon([(hx + 4, hy + 8), (hx + 9, hy + 8), (hx + 6, hy + 12)], fill=BIRD_BEAK)
    else:
        d.polygon([(hx + 11, hy), (hx + 15, hy + 2), (hx + 11, hy + 4)], fill=BIRD_BEAK)
    eye(d, hx + 7, hy, p.eyes)
    if p.ears == "back" or p.eyes == "wide":  # huppe dressée
        d.polygon([(hx + 3, hy - 3), (hx + 1, hy - 8), (hx + 6, hy - 4)], fill=BIRD_DARK)
    bird_wing(d, b, p.wing)
    mark(d, p.mark, 24, 0)


def bird_sheets():
    s = common_sheets()
    for k in ("chase",):
        s.pop(k)
    s["walk"] = [pose(bob=[0, -2, 0, -1, 0, -2][i], phase=i, stride=2, tail=[0, 1, 0, -1, 0, 1][i]) for i in range(6)]
    s["fall"] = [pose(bob=0, eyes="wide", kind="fly", wing=w, tail=1) for w in ("up", "mid")]
    s["fly"] = [pose(bob=b, kind="fly", wing=w, tail=1) for b, w in
                [(0, "up"), (0, "up"), (1, "mid"), (1, "down"), (1, "down"), (0, "mid")]]
    s["flee"] = [pose(bob=b, kind="flee", wing=w, tail=2, eyes="wide", mark="!" if i == 0 else None)
                 for i, (b, w) in enumerate([(0, "up"), (0, "up"), (1, "mid"), (1, "down"), (1, "down"), (0, "mid")])]
    s["eat"] = [pose(head=h, tail=t) for h, t in [(7, 0), (3, 1), (7, 0), (3, -1)]]
    s["trick_flip"] = [pose(kind="fly", wing="mid", rot=-i * 60, pivot=18, eyes="happy") for i in range(6)]
    s["relieve"] = [pose(bob=1, eyes=e) for e in ("closed", "open")]
    s["dive"] = [pose(kind="fly", wing="folded", rot=-55, pivot=16, eyes="wide", tail=b) for b in (1, 2)]
    s["sleep"] = [pose(kind="sleep", bob=1, eyes="closed"), pose(kind="sleep", bob=1, eyes="closed", mark="z")]
    s["wash"] = [pose(kind="preen", bob=b, eyes="closed") for b in (0, 1, 0, 1)]
    s["react_startled"] = [pose(eyes="wide", bob=-4, kind="fly", wing=w, mark=m) for w, m in (("up", "!"), ("mid", None))]
    s["react_tickled"] = [pose(eyes="happy", kind="fly", wing=w, rot=r) for w, r in
                          (("up", -6), ("mid", 6), ("up", -6), ("mid", 6))]
    return s


# --- assemblage ------------------------------------------------------------------

SPECIES = {
    "cat": dict(
        sheets=cat_sheets, out=CAT_OUT,
        draw=lambda img, d, p: {"sleep": draw_cat_sleep, "wash": draw_cat_wash, "climb": draw_cat_climb}.get(p.kind, draw_cat)(img, d, p),
        flip={"ceiling": "walk"},
        states={
            "idle": ("idle", 0.5), "walk": ("walk", 0.1), "fall": ("fall", 0.12), "drag": ("fall", 0.12),
            "sleep": ("sleep", 0.8), "wash": ("wash", 0.25), "climb": ("climb", 0.12), "ceiling": ("ceiling", 0.1),
            "follow": ("walk", 0.09), "greet": ("greet", 0.2), "seekWall": ("walk", 0.09),
            "seekFocus": ("walk", 0.08), "seekNap": ("walk", 0.1), "chase": ("chase", 0.07), "flee": ("flee", 0.06),
            "run": ("chase", 0.06), "hunt": ("chase", 0.06), "relieve": ("relieve", 0.35), "eat": ("eat", 0.18), "play": ("play", 0.09),
            "trick_sit": ("trick_sit", 0.3), "trick_roll": ("trick_roll", 0.1),
        },
    ),
    "bug": dict(
        sheets=bug_sheets, out=c(20, 34, 22),
        draw=lambda img, d, p: (draw_bug_climb if p.kind == "climb" else draw_bug)(img, d, p),
        flip={"ceiling": "walk"},
        states={
            "idle": ("idle", 0.4), "walk": ("walk", 0.07), "fall": ("fall", 0.1), "drag": ("fall", 0.1),
            "climb": ("climb", 0.08), "ceiling": ("ceiling", 0.07), "follow": ("walk", 0.06),
            "greet": ("greet", 0.15), "seekWall": ("walk", 0.06), "seekFocus": ("walk", 0.06),
            "chase": ("walk", 0.05), "flee": ("flee", 0.05), "run": ("walk", 0.04), "hunt": ("walk", 0.05), "relieve": ("relieve", 0.35), "eat": ("eat", 0.14), "play": ("play", 0.07), "trick_roll": ("trick_roll", 0.1),
        },
    ),
    "fish": dict(
        sheets=fish_sheets, out=c(96, 40, 8),
        draw=draw_fish, flip={},
        states={
            "idle": ("idle", 0.4), "swim": ("swim", 0.12), "fall": ("fall", 0.12), "drag": ("fall", 0.12),
            "greet": ("greet", 0.2), "flee": ("flee", 0.07), "swimFast": ("swimFast", 0.07), "play": ("swimFast", 0.07), "hunt": ("swimFast", 0.07), "trick_flip": ("trick_flip", 0.1),
        },
    ),
    "bird": dict(
        sheets=bird_sheets, out=c(16, 30, 64),
        draw=draw_bird, flip={},
        states={
            "idle": ("idle", 0.5), "walk": ("walk", 0.1), "fall": ("fall", 0.1), "drag": ("fall", 0.1),
            "fly": ("fly", 0.07), "sleep": ("sleep", 0.8), "wash": ("wash", 0.22),
            "follow": ("walk", 0.09), "greet": ("greet", 0.2), "seekFocus": ("walk", 0.09),
            "seekNap": ("walk", 0.1), "chase": ("walk", 0.06), "flee": ("flee", 0.06),
            "run": ("walk", 0.05), "flyFast": ("fly", 0.045), "dive": ("dive", 0.1), "eat": ("eat", 0.15), "hunt": ("walk", 0.06), "relieve": ("relieve", 0.35), "play": ("play", 0.09), "trick_flip": ("trick_flip", 0.1),
        },
    ),
}

# réaction -> (feuille, durée d'une frame, son) ; purring et brushed réutilisent les sons de petted.
REACTIONS = {
    "petted": ("react_petted", 0.25, "petted"), "tickled": ("react_tickled", 0.12, "tickled"),
    "annoyed": ("react_annoyed", 0.3, "annoyed"), "noticed": ("react_noticed", 0.25, "noticed"),
    "startled": ("react_startled", 0.2, "startled"), "greeted": ("greet", 0.15, "greeted"),
    "purring": ("react_petted", 0.4, "petted"), "brushed": ("react_petted", 0.35, "petted"),
    "hatched": ("react_startled", 0.2, "startled"), "grew": ("react_tickled", 0.12, "tickled"),
    "awakened": ("react_noticed", 0.25, "noticed"),
}


def render(spec, p):
    img, d = new_canvas()
    spec["draw"](img, d, p)
    if p.rot:
        img = img.rotate(p.rot, resample=Image.NEAREST, center=(G / 2, G - 2 if p.pivot is None else p.pivot))
    outline(img, spec["out"])
    return img


def build_sheets(spec):
    """nom de feuille -> liste d'images (les feuilles miroir sont dérivées)."""
    poses = spec["sheets"]()
    sheets = {name: [render(spec, p) for p in ps] for name, ps in poses.items()}
    for name, src in spec["flip"].items():
        sheets[name] = [ImageOps.flip(f) for f in sheets[src]]
    return sheets


def save_sheet(path, frames):
    sheet = Image.new("RGBA", (G * len(frames), G), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * G, 0))
    sheet.save(path)


def compact_json(data):
    text = json.dumps(data, indent=2, ensure_ascii=False)
    text = re.sub(r"\[\s*([-\d.,\s]+?)\s*\]", lambda m: "[" + re.sub(r"\s+", " ", m.group(1)) + "]", text)
    text = re.sub(
        r"\{\s*([^{}]*?)\s*\}",
        lambda m: "{ " + re.sub(r"\s*\n\s*", " ", m.group(1)) + " }",
        text,
    )
    return text + "\n"


def write_species(name):
    spec = SPECIES[name]
    pack_dir = PACKS_DIR / name
    out_dir = pack_dir / "sprites"
    out_dir.mkdir(parents=True, exist_ok=True)
    sheets = build_sheets(spec)
    for sheet_name, frames in sheets.items():
        save_sheet(out_dir / f"{sheet_name}.png", frames)
        print(f"écrit {name}/sprites/{sheet_name}.png ({len(frames)} frames)")

    pack_path = pack_dir / "pack.json"
    meta = json.loads(pack_path.read_text(encoding="utf-8"))
    used = set()
    animations = {}
    for state, (sheet, duration) in spec["states"].items():
        animations[state] = {"file": f"sprites/{sheet}.png", "frames": len(sheets[sheet]),
                             "frameDuration": duration, "loop": True}
        used.add(sheet)
    reactions = {}
    for react, (sheet, duration, sound) in REACTIONS.items():
        reactions[react] = {"file": f"sprites/{sheet}.png", "frames": len(sheets[sheet]),
                            "frameDuration": duration, "sound": f"sounds/{sound}.wav"}
        used.add(sheet)
    meta["animations"] = animations
    meta["reactions"] = reactions
    pack_path.write_text(compact_json(meta), encoding="utf-8")
    for orphan in sorted(set(sheets) - used):
        print(f"  (feuille non référencée : {orphan})")
    for stale in sorted(p.name for p in out_dir.glob("*.png") if p.stem not in sheets):
        print(f"  (fichier obsolète à supprimer : {name}/sprites/{stale})")


def main():
    requested = sys.argv[1:] or list(SPECIES)
    unknown = [s for s in requested if s not in SPECIES]
    if unknown:
        sys.exit(f"espèce(s) inconnue(s) : {', '.join(unknown)} (connues : {', '.join(SPECIES)})")
    for name in requested:
        write_species(name)


if __name__ == "__main__":
    main()
