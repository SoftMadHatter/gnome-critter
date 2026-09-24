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
    "star": [".X.", "XXX", ".X."],
    "note": ["..XX", "..X.", ".XX.", "XX.."],
    "sweat": [".X.", "XXX", "XXX", ".X."],
    "sick": [".XXX", "X...", ".XX.", "...X", "XXX."],
}
MARK_COLORS = {
    "!": c(230, 50, 50),
    "z": c(90, 110, 170),
    "heart": c(235, 70, 110),
    "bubble": c(150, 200, 240),
    "star": c(250, 210, 60),
    "note": c(120, 90, 200),
    "sweat": c(110, 180, 240),
    "sick": c(110, 190, 90),
}
CONFETTI = [(1, 1, c(240, 80, 90)), (4, 0, c(80, 180, 240)), (7, 2, c(250, 210, 60)), (2, 4, c(120, 200, 100)), (6, 5, c(200, 100, 220))]


def mark(d, kind, x, y):
    if kind == "confetti":
        for dx, dy, color in CONFETTI:
            d.rectangle((x + dx, y + dy, x + dx + 1, y + dy + 1), fill=color)
    elif kind:
        px_pattern(d, MARKS[kind], x, y, MARK_COLORS[kind])


def carry_item(d, x, y):
    """Petit cadeau tenu dans la gueule ou le bec."""
    d.rectangle((x, y, x + 3, y + 3), fill=c(245, 200, 60))
    d.rectangle((x + 1, y + 1, x + 2, y + 2), fill=c(250, 235, 150))
    d.point((x + 3, y), fill=c(230, 70, 90))


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
        squash=0, rot=0, ears="up", kind=None, wing="folded", fin=0, mouth=False, pivot=None, head=0, carry=False, blanket=False,
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
        "run": walk_poses(6, stride=3, run=True),
        "flee": [pose(**{**p.__dict__, "eyes": "wide", "tail": 2, "mark": "!" if i == 0 else None})
                 for i, p in enumerate(walk_poses(6, stride=3, run=True))],
        "greet": [pose(bob=b, tail=t, eyes="happy") for b, t in [(0, 2), (-1, 3), (0, 2), (-1, 1)]],
        "react_greeted": [pose(bob=b, tail=t, eyes="happy", mark="heart" if i % 2 == 0 else None) for i, (b, t) in enumerate([(0, 2), (-1, 3), (0, 2), (-1, 1)])],
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


def legged(stride=3, hop=0):
    """États d'un animal à pattes (chat, insecte, oiseau au sol) : chacun a sa démarche et son attitude."""
    bob = lambda i: -(i % 2) * (1 + hop)  # noqa: E731
    tails = [0, 1, 0, -1, 0, 1]
    return {
        "drag": [pose(bob=-4, tail=t, eyes="wide", mouth=True) for t in (-2, 2)],
        "follow": [pose(bob=bob(i), phase=i, stride=stride, tail=2, head=-2, eyes="wide" if i % 3 == 0 else "open") for i in range(6)],
        "seekWall": [pose(bob=bob(i), phase=i, stride=max(1, stride - 1), tail=1, head=-3) for i in range(6)],
        "seekFocus": [pose(bob=bob(i), phase=i, stride=stride, tail=tails[i], head=[0, 0, 1, 1, 0, 0][i]) for i in range(6)],
        "seekNap": [pose(bob=1, phase=i, stride=max(1, stride - 2), lift=1, tail=-1, head=1, eyes="closed" if i % 3 == 2 else "blink") for i in range(6)],
        "seekFood": [pose(bob=bob(i), phase=i, stride=max(1, stride - 1), head=3, mouth=i % 2 == 1) for i in range(6)],
        "chase": [pose(**{**p.__dict__, "eyes": "angry", "mouth": True}) for p in walk_poses(6, stride, run=True)],
        "hunt": [pose(bob=2, squash=2, phase=i, stride=2, lift=1, ears="back", tail=-1, eyes="wide", head=1) for i in range(6)],
        "remind": [pose(bob=-(i % 2) * 3, kind="jump", eyes="wide", mark="!", tail=[1, 2, 1, 0][i]) for i in range(4)],
        "gift": [pose(bob=bob(i), phase=i, stride=max(1, stride - 1), tail=2, head=-1, carry=True, eyes="happy") for i in range(6)],
        "brushed": [pose(rot=r, pivot=28, eyes="happy", squash=1, mark="heart" if i % 2 == 0 else None) for i, r in enumerate((0, -5, 0, 5))],
        "hibernate": [pose(kind="sleep", bob=1, blanket=True, mark=m, eyes="closed") for m in (None, "z")],
    }


def common_reactions():
    """Réactions aux événements : chacune a sa feuille (mêmes poses pour toutes les espèces)."""
    return {
        "react_purr": [pose(eyes="closed", bob=b, mark=m, squash=1) for b, m in ((0, "note"), (1, None), (0, "heart"), (1, None))],
        "react_brushed": [pose(eyes="happy", rot=r, pivot=28, mark="heart") for r in (-4, 0, 4, 0)],
        "react_grew": [pose(eyes="happy", bob=b, mark=m, squash=q) for b, m, q in ((-2, "star", 0), (0, None, 1), (-3, "star", 0), (0, None, 1))],
        "react_awakened": [pose(eyes="blink", ears="back", squash=1), pose(eyes="closed", mouth=True, bob=-1), pose(eyes="open", bob=0), pose(eyes="open", mouth=True, bob=-1)],
        "react_hatched": [pose(eyes="wide", bob=-3, mark="confetti"), pose(eyes="happy", bob=-1, mark="confetti"), pose(eyes="happy", bob=-2, mark="star"), pose(eyes="open")],
        "react_ate": [pose(eyes="happy", head=h, mouth=m) for h, m in ((3, True), (4, False), (3, True), (0, False))],
        "react_played": [pose(eyes="happy", bob=-2, mark="star", kind="jump"), pose(eyes="happy", bob=0, mouth=True)],
        "react_sick": [pose(eyes="closed", rot=r, mark="sick", ears="back", squash=1) for r in (-3, 3)],
        "react_accident": [pose(eyes="closed", ears="back", mark="sweat", tail=-2, squash=1), pose(eyes="wide", ears="back", mark="sweat", tail=-2)],
        "react_relieved": [pose(eyes="happy", squash=1), pose(eyes="closed", bob=-1)],
        "react_trick": [pose(eyes="happy", bob=-3, mark="star", kind="jump"), pose(eyes="happy", bob=-1, mark="star"), pose(eyes="happy", bob=-3, mark="heart", kind="jump"), pose(eyes="happy")],
        "react_birthday": [pose(eyes="happy", bob=-2, mark="confetti", kind="jump"), pose(eyes="happy", mark="confetti")],
        "react_gift": [pose(eyes="happy", carry=True, mark="heart", bob=-1), pose(eyes="happy", carry=True)],
        "react_reminded": [pose(eyes="wide", mark="!", bob=-3, kind="jump"), pose(eyes="open", mark="!")],
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
    if p.carry:
        carry_item(d, 29, 14 + b + p.head)
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
    s.update(legged(stride=3))
    s.update(common_reactions())
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
    if p.carry:
        carry_item(d, 28, 22 + b + h)
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


# Larve : la chenille du bébé insecte, mêmes poses (donc mêmes déplacements) que l'adulte.
CAT_BASE = c(150, 214, 96)
CAT_DARK = c(84, 150, 72)
CAT_LIGHT = c(214, 242, 150)
CAT_HEAD = c(236, 170, 70)
CAT_HEAD_DARK = c(190, 118, 44)
CAT_HEAD_LIGHT = c(250, 214, 130)


def draw_caterpillar(img, d, p):
    """Cinq anneaux qui ondulent (un pic de bosse parcourt le corps quand `phase` avance) et une tête orangée."""
    b = p.bob
    bottom = min(28 + b, 30)
    height = 7 - (2 if p.squash else 0)
    xs = (5, 9, 13, 17, 21)
    lifts = []
    for i in range(len(xs)):
        t = (p.phase or 0) / 6 - i / 5
        lifts.append(max(0, round(2 * math.sin(2 * math.pi * t))) if p.phase is not None else 0)
    if p.kind == "back":  # sur le dos : anneaux à plat, pattes en l'air
        lifts = [0] * len(xs)
        for x in xs:
            d.line((x, bottom - height, x + 1, bottom - height - 3), fill=BUG_LEG)
    else:
        for i, x in enumerate(xs):
            d.point((x, bottom + 1 if lifts[i] == 0 else bottom), fill=BUG_LEG)
    for i, x in enumerate(xs):
        top = bottom - height - lifts[i]
        blob(d, (x - 3, top, x + 3, bottom - lifts[i]), CAT_BASE, CAT_DARK, CAT_LIGHT)
        if i % 2 == 1:
            d.line((x, top + 1, x, bottom - lifts[i] - 1), fill=CAT_DARK)
    h = p.head
    top = bottom - height - 1 + h
    blob(d, (22, top, 30, bottom), CAT_HEAD, CAT_HEAD_DARK, CAT_HEAD_LIGHT)
    eye(d, 27, top + 3, "open" if p.eyes == "blink" else p.eyes)
    if p.carry:
        carry_item(d, 29, top + 5)
    aw = -1 if p.tail < 0 else p.tail
    d.line((26, top, 27, top - 3 - aw), fill=BUG_LEG)
    d.line((24, top, 24, top - 3 + aw), fill=BUG_LEG)
    mark(d, p.mark, 5, 1)


def draw_caterpillar_climb(img, d, p):
    """Chenille à la verticale : la bosse remonte le long du corps."""
    b = p.bob
    ys = (27, 22, 17, 12, 7)
    for i, y in enumerate(ys):
        t = (p.phase or 0) / 6 - i / 5
        dx = round(2 * math.sin(2 * math.pi * t))
        d.line((11 + dx, y + b, 8 + dx, y + b + 1), fill=BUG_LEG)
        d.line((21 + dx, y + b, 24 + dx, y + b + 1), fill=BUG_LEG)
        blob(d, (12 + dx, y - 3 + b, 20 + dx, y + 3 + b), CAT_BASE, CAT_DARK, CAT_LIGHT)
    blob(d, (12, -1 + b, 20, 5 + b), CAT_HEAD, CAT_HEAD_DARK, CAT_HEAD_LIGHT)
    d.point((14, 3 + b), fill=INK)
    d.point((18, 3 + b), fill=INK)


def bug_sheets():
    s = common_sheets()
    s.update(legged(stride=2))
    s.update(common_reactions())
    s["idle"] = [pose(tail=t, eyes=e) for t, e in [(0, "open"), (1, "open"), (0, "blink"), (-1, "open")]]
    s["walk"] = [pose(bob=-(i % 2), phase=i, tail=[0, 1, 0, -1, 0, 1][i]) for i in range(6)]
    s["run"] = [pose(bob=-(i % 2), phase=i, stride=3, tail=[0, 1, 0, -1, 0, 1][i]) for i in range(6)]
    s["flee"] = [pose(bob=-(i % 2), phase=i, eyes="wide", tail=2, mark="!" if i == 0 else None) for i in range(6)]
    s["fall"] = [pose(bob=0, kind="back", phase=i, tail=i) for i in range(2)]
    s["climb"] = [pose(kind="climb", phase=i, bob=-(i % 2)) for i in range(6)]
    s["eat"] = [pose(head=h, tail=t) for h, t in [(2, 0), (0, 1), (2, 0), (0, -1)]]
    s["relieve"] = [pose(bob=2, eyes=e) for e in ("closed", "open")]
    s["sleep"] = [pose(bob=3, squash=3, eyes="closed"), pose(bob=3, squash=3, eyes="closed", mark="z")]
    s["wash"] = [pose(bob=1, head=2, tail=t, eyes="closed") for t in (2, -2, 2, -2)]
    s["hibernate"] = [pose(bob=3, squash=3, eyes="closed", blanket=True, mark=m) for m in (None, "z")]
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
    if p.mouth:
        d.rectangle((26, 17 + b, 28, 20 + b), fill=FISH_DARK)  # bouche ouverte
    if p.carry:
        carry_item(d, 28, 18 + b)
    mark(d, p.mark, 26, 1)


def fish_sheets():
    s = common_sheets()
    for k in ("walk", "run", "play", "flee", "greet", "react_greeted"):
        s.pop(k)
    s.update(common_reactions())
    s["react_greeted"] = [pose(tail=t, eyes="happy", mark=m) for t, m in [(-1, "heart"), (1, None), (-1, "heart"), (1, None)]]
    s["idle"] = [pose(bob=b, tail=t, eyes=e, mark=m) for b, t, e, m in
                 [(0, 0, "open", None), (1, 1, "open", "bubble"), (1, 0, "open", None), (0, -1, "blink", None)]]
    s["swim"] = [pose(tail=t, bob=b, fin=f) for t, b, f in
                 [(-1, 0, 0), (0, 0, 1), (1, 1, 0), (1, 1, 1), (0, 0, 0), (-1, 0, 1)]]
    s["swimFast"] = [pose(tail=t, fin=f) for t, f in [(-2, 0), (0, 1), (2, 0), (0, 1), (-2, 0), (0, 1)]]
    s["trick_flip"] = [pose(tail=(-1) ** i, rot=-i * 60, pivot=16, eyes="happy") for i in range(6)]
    s["fall"] = [pose(tail=t, rot=r, eyes="wide") for t, r in [(-1, -14), (1, 14)]]
    s["drag"] = [pose(tail=t, rot=r, eyes="wide", mouth=True) for t, r in [(-2, -28), (2, 28)]]
    s["seekFood"] = [pose(tail=t, rot=-12, fin=f) for t, f in [(-1, 0), (0, 1), (1, 0), (0, 1)]]
    s["eat"] = [pose(tail=t, mouth=m, mark="bubble" if m else None) for t, m in [(0, True), (1, False), (0, True), (-1, False)]]
    s["hunt"] = [pose(tail=t * 2, fin=1, eyes="wide", rot=-8) for t in (-1, 1, -1, 1)]
    s["play"] = [pose(tail=t, rot=r, eyes="happy", mark=m) for t, r, m in [(-1, -18, "star"), (1, 18, None), (-1, -18, None), (1, 18, "star")]]
    s["remind"] = [pose(bob=-(i % 2) * 3, eyes="wide", mark="!", tail=[1, 2, 1, 0][i]) for i in range(4)]
    s["gift"] = [pose(tail=t, fin=f, carry=True, eyes="happy") for t, f in [(-1, 0), (0, 1), (1, 0), (0, 1)]]
    s["hibernate"] = [pose(rot=-80, pivot=16, eyes="closed", mark=m) for m in (None, "z")]
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
    if p.carry:
        carry_item(d, hx + 13, hy + 3)
    mark(d, p.mark, 24, 0)


def bird_sheets():
    s = common_sheets()
    s.update(legged(stride=2, hop=1))
    s.pop("seekWall")  # l'oiseau ne grimpe pas
    s.update(common_reactions())
    s["walk"] = [pose(bob=[0, -2, 0, -1, 0, -2][i], phase=i, stride=2, tail=[0, 1, 0, -1, 0, 1][i]) for i in range(6)]
    s["run"] = [pose(bob=[0, -3, 0, -2, 0, -3][i], phase=i, stride=3, lift=3, tail=[0, 1, 0, -1, 0, 1][i]) for i in range(6)]
    s["fall"] = [pose(bob=0, eyes="wide", kind="fly", wing=w, tail=1) for w in ("up", "mid")]
    s["fly"] = [pose(bob=b, kind="fly", wing=w, tail=1) for b, w in
                [(0, "up"), (0, "up"), (1, "mid"), (1, "down"), (1, "down"), (0, "mid")]]
    s["flyFast"] = [pose(bob=b, kind="fly", wing=w, tail=2, rot=-6, pivot=18, eyes="wide")
                    for b, w in [(0, "up"), (1, "mid"), (1, "down"), (0, "mid")]]
    s["flee"] = [pose(bob=b, kind="flee", wing=w, tail=2, eyes="wide", mark="!" if i == 0 else None)
                 for i, (b, w) in enumerate([(0, "up"), (0, "up"), (1, "mid"), (1, "down"), (1, "down"), (0, "mid")])]
    s["eat"] = [pose(head=h, tail=t) for h, t in [(7, 0), (3, 1), (7, 0), (3, -1)]]
    s["trick_flip"] = [pose(kind="fly", wing="mid", rot=-i * 60, pivot=18, eyes="happy") for i in range(6)]
    s["relieve"] = [pose(bob=1, eyes=e) for e in ("closed", "open")]
    s["dive"] = [pose(kind="fly", wing="folded", rot=-55, pivot=16, eyes="wide", tail=b) for b in (1, 2)]
    s["sleep"] = [pose(kind="sleep", bob=1, eyes="closed"), pose(kind="sleep", bob=1, eyes="closed", mark="z")]
    s["wash"] = [pose(kind="preen", bob=b, eyes="closed") for b in (0, 1, 0, 1)]
    s["hibernate"] = [pose(kind="sleep", bob=2, eyes="closed", blanket=True, mark=m) for m in (None, "z")]
    s["react_startled"] = [pose(eyes="wide", bob=-4, kind="fly", wing=w, mark=m) for w, m in (("up", "!"), ("mid", None))]
    s["react_tickled"] = [pose(eyes="happy", kind="fly", wing=w, rot=r) for w, r in
                          (("up", -6), ("mid", 6), ("up", -6), ("mid", 6))]
    return s


# --- assemblage ------------------------------------------------------------------

# Durée d'une frame (secondes) par état ; une feuille par état, du même nom.
DURATIONS = {
    "idle": 0.5, "walk": 0.1, "fall": 0.12, "drag": 0.12, "sleep": 0.8, "wash": 0.25, "climb": 0.12,
    "ceiling": 0.1, "follow": 0.09, "greet": 0.2, "seekWall": 0.1, "seekFocus": 0.09, "seekNap": 0.14,
    "chase": 0.06, "flee": 0.06, "run": 0.06, "seekFood": 0.1, "eat": 0.16, "play": 0.09, "brushed": 0.35,
    "remind": 0.12, "gift": 0.1, "hunt": 0.08, "relieve": 0.35, "hibernate": 0.9, "egg": 0.6, "fly": 0.07, "flyFast": 0.045,
    "dive": 0.1, "swim": 0.12, "swimFast": 0.07, "trick_sit": 0.3, "trick_roll": 0.1, "trick_flip": 0.1,
}

GROUND_STATES = [
    "idle", "walk", "fall", "drag", "sleep", "wash", "follow", "greet", "seekFocus", "seekNap", "chase", "flee",
    "run", "seekFood", "eat", "play", "brushed", "remind", "gift", "hunt", "relieve", "hibernate",
]


def make_states(names):
    """état -> (feuille du même nom, durée de frame)."""
    return {name: (name, DURATIONS[name]) for name in names}


SPECIES = {
    "cat": dict(
        sheets=cat_sheets, out=CAT_OUT,
        draw=lambda img, d, p: {"sleep": draw_cat_sleep, "wash": draw_cat_wash, "climb": draw_cat_climb}.get(p.kind, draw_cat)(img, d, p),
        flip={"ceiling": "walk"},
        states=make_states(GROUND_STATES + ["climb", "seekWall", "ceiling", "trick_sit", "trick_roll", "egg"]),
    ),
    "bug": dict(
        sheets=bug_sheets, out=c(20, 34, 22),
        draw=lambda img, d, p: (draw_bug_climb if p.kind == "climb" else draw_bug)(img, d, p),
        flip={"ceiling": "walk"},
        stage_draw={"baby": lambda img, d, p: (draw_caterpillar_climb if p.kind == "climb" else draw_caterpillar)(img, d, p)},
        states=make_states(GROUND_STATES + ["climb", "seekWall", "ceiling", "trick_roll", "egg"]),
    ),
    "fish": dict(
        sheets=fish_sheets, out=c(96, 40, 8),
        draw=draw_fish, flip={},
        states=make_states([
            "idle", "fall", "drag", "swim", "swimFast", "seekFood", "eat", "play", "hunt", "remind", "gift",
            "hibernate", "trick_flip", "egg",
        ]),
    ),
    "bird": dict(
        sheets=bird_sheets, out=c(16, 30, 64),
        draw=draw_bird, flip={},
        states=make_states(GROUND_STATES + ["fly", "flyFast", "dive", "trick_flip", "egg"]),
    ),
}

# réaction -> (feuille, durée d'une frame, son) ; sans son quand l'événement n'en a pas.
REACTIONS = {
    "petted": ("react_petted", 0.25, "petted"), "tickled": ("react_tickled", 0.12, "tickled"),
    "annoyed": ("react_annoyed", 0.3, "annoyed"), "noticed": ("react_noticed", 0.25, "noticed"),
    "startled": ("react_startled", 0.2, "startled"), "greeted": ("react_greeted", 0.15, "greeted"),
    "purring": ("react_purr", 0.4, "petted"), "brushed": ("react_brushed", 0.35, "petted"),
    "hatched": ("react_hatched", 0.2, "startled"), "grew": ("react_grew", 0.15, "tickled"),
    "awakened": ("react_awakened", 0.25, "noticed"), "ate": ("react_ate", 0.15, None),
    "played": ("react_played", 0.15, "greeted"), "sick": ("react_sick", 0.3, "annoyed"),
    "accident": ("react_accident", 0.3, "startled"), "relieved": ("react_relieved", 0.3, None),
    "trickLearned": ("react_trick", 0.15, "tickled"), "birthday": ("react_birthday", 0.2, "greeted"),
    "gift": ("react_gift", 0.2, "greeted"), "reminded": ("react_reminded", 0.2, "noticed"),
}


# --- œufs propres à chaque espèce ------------------------------------------------

EGG_STYLES = {
    "cat": dict(base=c(226, 218, 204), dark=c(168, 158, 146), light=c(248, 244, 236), pattern="stripes", mark=c(120, 120, 134)),
    "bird": dict(base=c(164, 206, 240), dark=c(110, 160, 210), light=c(220, 240, 252), pattern="spots", mark=c(60, 110, 190)),
    "bug": dict(base=c(160, 216, 140), dark=c(100, 170, 100), light=c(230, 250, 210), pattern="pearl", mark=c(60, 120, 70)),
    "fish": dict(base=c(190, 226, 248), dark=c(120, 170, 220), light=c(240, 250, 255), pattern="bubble", mark=c(240, 140, 50)),
}


def egg_frame(style, out, tilt=0, cracked=False):
    img, d = new_canvas()
    box = (8, 5, 23, 29)
    if style["pattern"] == "bubble":
        d.ellipse(box, fill=style["base"][:3] + (150,))
        d.ellipse((10, 7, 14, 11), fill=style["light"][:3] + (220,))  # reflet
        d.polygon([(13, 19), (19, 16), (19, 22)], fill=style["mark"])  # petit poisson dedans
        d.polygon([(19, 19), (22, 17), (22, 21)], fill=style["mark"])
        d.point((14, 18), fill=INK)
    else:
        blob(d, box, style["base"], style["dark"], style["light"])
        if style["pattern"] == "stripes":
            for y in (10, 14, 18, 22):
                d.line((10, y, 13, y + 1), fill=style["mark"])
                d.line((18, y + 1, 21, y), fill=style["mark"])
        elif style["pattern"] == "spots":
            for x, y in ((11, 12), (17, 10), (15, 18), (19, 21), (11, 23), (13, 15)):
                d.rectangle((x, y, x + 1, y + 1), fill=style["mark"])
        else:  # nacré : reflets pâles
            for x, y in ((11, 11), (14, 14), (17, 12), (12, 20), (18, 19)):
                d.line((x, y, x + 2, y + 1), fill=style["light"])
            for x, y in ((15, 9), (10, 17), (19, 24)):
                d.point((x, y), fill=style["mark"])
    if cracked:
        for (x0, y0), (x1, y1) in (((13, 8), (15, 11)), ((15, 11), (14, 14)), ((14, 14), (18, 16))):
            d.line((x0, y0, x1, y1), fill=INK)
    if tilt:
        img = img.rotate(tilt, resample=Image.NEAREST, center=(16, 28))
    outline(img, out)
    return img


def species_egg(species, out):
    """Œuf de l'espèce : posé, deux oscillations, fissuré."""
    style = EGG_STYLES[species]
    return [egg_frame(style, out), egg_frame(style, out, tilt=-10), egg_frame(style, out, tilt=10), egg_frame(style, out, cracked=True)]


# --- stades de croissance : bébé, jeune, senior ------------------------------------

# Abscisse (grille 32) qui sépare le corps de la tête, sprite tourné vers la droite.
HEAD_SPLIT = {"cat": 17, "bird": 15, "bug": 21, "fish": 21}

# body/head : facteurs d'échelle du corps et de la tête (bébé : grosse tête, petit corps) ;
# uniform : réduction des feuilles pivotées ; lighten : éclaircissement ; gray : fondu vers un gris clair (poil grisonnant).
STAGE_CFG = {
    "baby": dict(body=0.62, head=1.0, uniform=0.7, lighten=0.10, head_gray=0.0, body_gray=0.0),
    "young": dict(body=0.86, head=0.94, uniform=0.88, lighten=0.06, head_gray=0.0, body_gray=0.0),
    "senior": dict(body=1.0, head=1.0, uniform=1.0, lighten=0.0, head_gray=0.45, body_gray=0.22),
}
GRAY_HAIR = (215, 215, 225)


def _mix(color, target, amount):
    return tuple(round(color[i] + (target[i] - color[i]) * amount) for i in range(3))


def tint_stage(frame, split, cfg):
    """Éclaircit et/ou grisonne les pixels clairs (les contours sombres restent intacts)."""
    img = frame.copy()
    px = img.load()
    for y in range(G):
        for x in range(G):
            r, g, b, a = px[x, y]
            if a == 0 or 0.3 * r + 0.59 * g + 0.11 * b < 70:
                continue
            gray = cfg["head_gray"] if x >= split else cfg["body_gray"]
            color = (r, g, b)
            if gray:
                color = _mix(color, GRAY_HAIR, gray)
            if cfg["lighten"]:
                color = _mix(color, (255, 255, 255), cfg["lighten"])
            px[x, y] = color + (a,)
    return img


def _scaled(img, factor):
    if factor == 1:
        return img
    w, h = img.size
    return img.resize((max(1, round(w * factor)), max(1, round(h * factor))), Image.NEAREST)


def uniform_stage(frame, factor, bbox):
    """Réduction uniforme du contenu, pieds alignés sur ceux de l'original et centré."""
    if factor == 1:
        return frame
    content = _scaled(frame.crop(bbox), factor)
    out = Image.new("RGBA", (G, G), (0, 0, 0, 0))
    cx = (bbox[0] + bbox[2]) // 2
    out.paste(content, (min(max(cx - content.width // 2, 0), G - content.width), bbox[3] - content.height), content)
    return out


def morph_stage(frame, split, body, head, bbox):
    """Coupe corps/tête, les met chacun à son échelle, les rejoint : proportions différentes du même animal."""
    left, right = frame.crop((0, 0, split, G)), frame.crop((split, 0, G, G))
    lb0, rb0 = left.getbbox(), right.getbbox()
    if lb0 is None or rb0 is None or (body == 1 and head == 1):
        return frame
    left_s, right_s = _scaled(left, body), _scaled(right, head)
    lb, rb = left_s.getbbox(), right_s.getbbox()
    feet = bbox[3]
    canvas = Image.new("RGBA", (G * 2, G * 2), (0, 0, 0, 0))
    off = G // 2
    left_y = feet - lb[3]
    canvas.paste(left_s, (off, left_y + off), left_s)
    head_bottom = feet - round((feet - rb0[3]) * body)
    right_x = lb[2] - 1 - rb[0]
    canvas.paste(right_s, (right_x + off, head_bottom - rb[3] + off), right_s)
    bb = canvas.getbbox()
    shift = (bbox[0] + bbox[2]) // 2 - (bb[0] + bb[2]) // 2
    out = Image.new("RGBA", (G, G), (0, 0, 0, 0))
    out.paste(canvas, (shift - 0, -off), canvas)
    return out


def is_uniform_sheet(poses):
    """Feuilles pivotées, endormies ou d'escalade : réduites d'un bloc (pas de coupe corps/tête)."""
    return any(p.rot or p.kind in ("sleep", "climb") or p.blanket for p in poses)


def build_stage(spec, species, poses, sheets, stage):
    if stage in spec.get("stage_draw", {}):
        # Stade dessiné à part (larve) : mêmes poses, autre silhouette.
        alt = dict(spec, draw=spec["stage_draw"][stage])
        out = {name: [render(alt, p) for p in ps] for name, ps in poses.items()}
        for name, src in spec["flip"].items():
            out[name] = [ImageOps.flip(f) for f in out[src]]
        return out
    cfg = STAGE_CFG[stage]
    split = HEAD_SPLIT[species]
    out = {}
    for name, frames in sheets.items():
        if name in spec["flip"] or name == "egg":
            continue
        uniform = is_uniform_sheet(poses[name])
        frames_out = []
        for frame in frames:
            bbox = frame.getbbox()
            if bbox is None:
                frames_out.append(frame)
                continue
            img = tint_stage(frame, split, cfg)
            if uniform:
                img = uniform_stage(img, cfg["uniform"], bbox)
            else:
                img = morph_stage(img, split, cfg["body"], cfg["head"], bbox)
            frames_out.append(img)
        out[name] = frames_out
    for name, src in spec["flip"].items():
        out[name] = [ImageOps.flip(f) for f in out[src]]
    return out


def render(spec, p):
    img, d = new_canvas()
    spec["draw"](img, d, p)
    if p.blanket:  # hibernation : une couverture sur le bas du corps
        d.rectangle((3, 21, 28, 30), fill=c(100, 130, 200))
        for x in range(4, 28, 4):
            d.line((x, 21, x, 30), fill=c(70, 100, 170))
    if p.rot:
        img = img.rotate(p.rot, resample=Image.NEAREST, center=(G / 2, G - 2 if p.pivot is None else p.pivot))
    outline(img, spec["out"])
    return img


def build_sheets(spec, species):
    """(nom de feuille -> images, nom de feuille -> poses) ; les feuilles miroir sont dérivées."""
    poses = spec["sheets"]()
    sheets = {name: [render(spec, p) for p in ps] for name, ps in poses.items()}
    for name, src in spec["flip"].items():
        sheets[name] = [ImageOps.flip(f) for f in sheets[src]]
    sheets["egg"] = species_egg(species, spec["out"])
    return sheets, poses


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
    sheets, poses = build_sheets(spec, name)
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
        reactions[react] = {"file": f"sprites/{sheet}.png", "frames": len(sheets[sheet]), "frameDuration": duration}
        if sound:
            reactions[react]["sound"] = f"sounds/{sound}.wav"
        used.add(sheet)
    meta["animations"] = animations
    meta["reactions"] = reactions

    # Un dossier par stade (bébé, jeune, senior) : mêmes noms de feuilles, proportions et poil différents.
    meta["stages"] = {}
    for stage in STAGE_CFG:
        stage_dir = out_dir / stage
        stage_dir.mkdir(exist_ok=True)
        for sheet_name, frames in build_stage(spec, name, poses, sheets, stage).items():
            save_sheet(stage_dir / f"{sheet_name}.png", frames)
        meta["stages"][stage] = {"scale": 1, "folder": f"sprites/{stage}"}
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
