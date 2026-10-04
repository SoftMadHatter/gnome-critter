#!/usr/bin/env python3
"""Generates the spritesheets (and the pack.json animations/reactions
wiring) for the cat, bug, fish, and bird species.

The pose recipes draw on a logical 32x32 grid, but the rendering is
fine-detailed (see finedraw.py): shapes traced at high resolution then
downscaled to 64 px (smoothed edges), gradient shading, a soft outline
computed around the silhouette, details (eyes, markings) traced finely.
Poses are shared between species (walk, run, greet, reactions...). Sheets
are square (64 px), one row of frames per file; on-screen display is still
set by `spriteSize` in pack.json (32 px, the insect 16 px: the sheet is
downscaled by the extension's linear filter).

The `critter-demo` pack is still handled by gen_placeholder_sprites.py.

Usage: python3 scripts/gen_species_sprites.py [species ...]
"""

import json
import math
import re
import sys
from pathlib import Path
from types import SimpleNamespace

from PIL import Image, ImageOps

from finedraw import Canvas
from pngsave import save_png

G = 32  # logical grid of the drawing recipes
R = 64  # side of an output frame
S = R // G
PACKS_DIR = Path(__file__).resolve().parent.parent / "packs"

WHITE = (255, 255, 255, 255)
INK = (28, 24, 32, 255)


def c(r, g, b):
    return (r, g, b, 255)


# --- outils de dessin -----------------------------------------------------------


class Head:
    """Where a pose's head is, in grid units (0..G): `x, y` the top-centre
    (where a hat rests), `width`, and `eye` (None when no face is visible).
    A draw function records it on its canvas as `d.head`; `render` carries it
    (rotated like the image) to the frame as `frame.head`."""

    def __init__(self, x, y, width, eye, angle=0):
        self.x, self.y, self.width, self.eye, self.angle = x, y, width, eye, angle

    def mapped(self, fn):
        """Same head after moving every point through `fn(x, y) -> (x, y)`."""
        x, y = fn(self.x, self.y)
        return Head(x, y, self.width, fn(*self.eye) if self.eye else None, self.angle)


def rotate_point(angle, center, x, y):
    """The image of grid point (x, y) after Canvas.rotate(angle, center) (counter-clockwise, y down)."""
    a = math.radians(angle)
    dx, dy = x - (center[0] + 0.5), y - (center[1] + 0.5)
    return (center[0] + 0.5 + dx * math.cos(a) + dy * math.sin(a), center[1] + 0.5 - dx * math.sin(a) + dy * math.cos(a))


def new_canvas():
    canvas = Canvas(G, G, S)
    return canvas, canvas


def blob(d, box, base, dark, light):
    d.blob(box, base, dark, light)


def px_pattern(d, rows, x, y, color):
    """Motif de pastilles : les cases voisines fusionnent en une forme lisse."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == "X":
                d.oval(x + i - 0.15, y + j - 0.15, x + i + 1.15, y + j + 1.15, color)


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
            d.oval(x + dx, y + dy, x + dx + 2, y + dy + 2, color)
    elif kind:
        px_pattern(d, MARKS[kind], x, y, MARK_COLORS[kind])


def carry_item(d, x, y):
    """Petit cadeau tenu dans la gueule ou le bec."""
    d.rectangle((x, y, x + 3, y + 3), fill=c(245, 200, 60))
    d.rectangle((x + 1, y + 1, x + 2, y + 2), fill=c(250, 235, 150))
    d.oval(x + 2.6, y - 0.4, x + 4.2, y + 1.2, c(230, 70, 90))  # small bow


def eye(d, x, y, kind):
    """Fine eye: oval, highlight, smoothed-arc eyelids."""
    if kind == "open":
        d.oval(x + 0.1, y - 0.3, x + 2.0, y + 2.2, INK)
        d.oval(x + 0.35, y - 0.1, x + 0.95, y + 0.55, WHITE)
    elif kind in ("closed", "blink"):
        d.stroke([(x - 0.5, y + 1.4), (x + 1, y + 1.85), (x + 2.5, y + 1.4)], 0.8, INK)
    elif kind == "happy":
        d.stroke([(x - 0.5, y + 2), (x + 1, y + 0.5), (x + 2.5, y + 2)], 0.9, INK)
    elif kind == "wide":
        d.oval(x - 1.3, y - 1.3, x + 3.1, y + 3.1, INK)
        d.oval(x - 0.9, y - 0.9, x + 2.7, y + 2.7, WHITE)
        d.oval(x + 0.3, y + 0.2, x + 1.7, y + 1.9, INK)
    elif kind == "angry":
        d.oval(x + 0.1, y - 0.1, x + 2.0, y + 2.1, INK)
        d.stroke([(x - 1, y - 1.8), (x + 2.6, y - 0.6)], 0.9, INK)


def pose(**kw):
    base = dict(
        bob=0, tail=0, phase=None, stride=3, lift=2, eyes="open", mark=None,
        squash=0, rot=0, ears="up", kind=None, wing="folded", fin=0, mouth=False, pivot=None, head=0, carry=False, blanket=False,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def leg_offsets(phase, n, stride, lift, offsets=(0, 0.5, 0.5, 0)):
    """(dx, lift) for each leg at frame `phase` of an `n`-frame cycle."""
    out = []
    for off in offsets:
        t = phase / n + off
        dx = round(stride * math.sin(2 * math.pi * t))
        up = max(0, round(lift * math.cos(2 * math.pi * t)))
        out.append((dx, up))
    return out


# --- shared poses (walk, run, greet, reactions) ---------------------------


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
    """States of a legged animal (cat, insect, grounded bird): each has its own gait and attitude."""
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
    """Reactions to events: each has its own sheet (same poses for every species)."""
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


def cat_head(d, x, y, p, tilt=0, scale=1.0):
    """Drawn around its own origin `(x, y)`: at `scale != 1` every offset from
    that origin shrinks/grows with it, so a caller can grow or shrink just the
    head by picking where `(x, y)` lands (see `draw_cat`'s stage handling)."""
    X, Y = lambda dx: x + dx * scale, lambda dy: y + dy * scale  # noqa: E731
    d.head = Head(X(6), Y(0), 12 * scale, (X(7), Y(5)))
    # Seen from the side (facing right): the far ear peeks out from behind
    # the head, shifted toward the back of the skull, and is drawn first so
    # the head covers its base; the near ear is seen edge-on, wider, with
    # the pink inner ear.
    if p.ears == "back":
        d.polygon([(X(0), Y(5)), (X(-3), Y(1)), (X(5), Y(2))], fill=CAT_DARK)
    else:
        d.polygon([(X(0), Y(4)), (X(1), Y(-3)), (X(6), Y(2))], fill=CAT_DARK)
    blob(d, (X(0), Y(0), X(12), Y(12)), CAT_BASE, CAT_DARK, CAT_LIGHT)
    if p.ears == "back":
        d.polygon([(X(3), Y(3)), (X(-1), Y(0)), (X(8), Y(1))], fill=CAT_BASE)
        d.polygon([(X(3), Y(2)), (X(1), Y(1)), (X(6), Y(1))], fill=CAT_PINK)
    else:
        d.polygon([(X(3), Y(3)), (X(5), Y(-5)), (X(10), Y(3))], fill=CAT_BASE)
        d.polygon([(X(5), Y(2)), (X(5.5), Y(-2)), (X(8), Y(2))], fill=CAT_PINK)
    eye(d, X(7), Y(5), p.eyes)
    d.point((X(11), Y(8)), fill=CAT_PINK)
    d.line((X(9), Y(10), X(11), Y(10)), fill=CAT_DARK) if p.mouth else None
    d.point((X(11), Y(10)), fill=CAT_DARK)


# Ground-level point a life stage's body geometry scales around: a point
# scaled around itself doesn't move, so anything already at that height
# (the paws, on the ground) stays put while everything above it shrinks or
# grows toward it. Shared by every cat pose that isn't `is_uniform_sheet`
# (sleep/climb/rotated/hibernating poses keep the old whole-frame scaling,
# which was never the broken one).
CAT_BODY_PIVOT = (14, 29)


def _pivot_pt(pivot, pt, scale):
    px, py = pivot
    x, y = pt
    return (px + (x - px) * scale, py + (y - py) * scale)


def draw_cat(img, d, p, body_scale=1.0, head_scale=1.0):
    """`body_scale`/`head_scale` draw a life stage natively instead of
    post-scaling a rendered adult frame (see docs on `CAT_BODY_PIVOT`):
    every body coordinate scales around `CAT_BODY_PIVOT`, and the head is
    then drawn at `cat_head`'s own `scale`, anchored on the exact point
    that same pivot transform puts its attachment coordinate at -- so the
    two always meet, however different the two scales are. At the default
    1.0/1.0 this is pixel-identical to the un-scaled drawing."""
    def B(pt):
        return _pivot_pt(CAT_BODY_PIVOT, pt, body_scale)

    b = p.bob
    sq = p.squash
    # queue
    tip = 9 + b - p.tail * 2
    d.line((*B((5, 19 + b)), *B((2, 15 + b)), *B((3, tip))), fill=CAT_DARK, width=2)
    # pattes
    legs = leg_offsets(p.phase or 0, 6, p.stride, p.lift) if p.phase is not None else None
    for k, x in enumerate((7, 11, 18, 22)):
        if p.kind == "jump":
            d.line((*B((x, 24 + b)), *B((x + (-2 if k % 2 == 0 else 2), 28 + b))), fill=CAT_DARK, width=2)
        elif legs is None:
            d.line((*B((x, 24 + b)), *B((x, 29))), fill=CAT_DARK, width=2)
        else:
            dx, up = legs[k]
            d.line((*B((x, 24 + b)), *B((x + dx, 29 - up))), fill=CAT_DARK, width=2)
    # corps
    blob(d, (*B((4, 13 + b + sq)), *B((24, 27 + b))), CAT_BASE, CAT_DARK, CAT_LIGHT)
    for x in (9, 13, 17):
        d.line((*B((x, 14 + b + sq)), *B((x + 1, 17 + b + sq))), fill=CAT_DARK)
    cat_head(d, *B((18, 6 + b + p.head)), p, scale=head_scale)
    if p.carry:
        carry_item(d, *B((29, 14 + b + p.head)))
    mark(d, p.mark, *B((26, 0)))


def draw_cat_sleep(img, d, p):
    blob(d, (3, 15, 27, 29), CAT_BASE, CAT_DARK, CAT_LIGHT)
    blob(d, (16, 15, 28, 27), CAT_BASE, CAT_DARK, CAT_LIGHT)
    d.head = Head(22, 15, 12, (21.5, 21))
    d.polygon([(17, 17), (17, 12), (21, 16)], fill=CAT_BASE)
    d.polygon([(23, 16), (27, 12), (27, 18)], fill=CAT_BASE)
    d.line((20, 21, 23, 21), fill=INK)
    d.line((5, 26, 14, 28), fill=CAT_DARK, width=2)  # curled-up tail
    for x in (9, 12, 15):
        d.line((x, 17, x + 1, 20), fill=CAT_DARK)
    mark(d, p.mark, 24, 2)


def draw_cat_wash(img, d, p, body_scale=1.0, head_scale=1.0):
    """Sitting, licking a raised paw. `wash` isn't one of the states
    `is_uniform_sheet` exempts from per-stage scaling, so it needs the same
    native treatment as `draw_cat` (see `CAT_BODY_PIVOT`)."""
    def B(pt):
        return _pivot_pt(CAT_BODY_PIVOT, pt, body_scale)

    blob(d, (*B((6, 12)), *B((21, 30))), CAT_BASE, CAT_DARK, CAT_LIGHT)
    d.line((*B((5, 27)), *B((1, 22)), *B((2, 17))), fill=CAT_DARK, width=2)
    cat_head(d, *B((15, 3)), pose(eyes="closed"), scale=head_scale)
    lift = p.lift
    d.line((*B((17, 19)), *B((24, 12 + lift))), fill=CAT_DARK, width=3)  # raised paw
    if p.mouth:
        d.point(B((27, 13 + lift)), fill=CAT_PINK)


def draw_cat_climb(img, d, p):
    """Back view against a wall: head at the top, paws alternating."""
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
    d.head = Head(16, 2 + b, 12, None)  # seen from behind: no face
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


# Same idea as CAT_BODY_PIVOT: ground-level point the insect's body scales
# around for a life stage (see `draw_bug`'s stage handling). Needed because
# `stage_draw`'s caterpillar override only replaces the `baby` stage --
# `young` still draws the adult beetle shape, natively scaled.
BUG_BODY_PIVOT = (15, 29)


def bug_legs(d, b, p, up=False, body_scale=1.0):
    def B(pt):
        return _pivot_pt(BUG_BODY_PIVOT, pt, body_scale)

    legs = leg_offsets(p.phase or 0, 6, 2, 2, offsets=(0, 0.5, 0)) if p.phase is not None else [(0, 0)] * 3
    for k, x in enumerate((9, 14, 19)):
        dx, lift = legs[k]
        if up:
            d.line((*B((x, 15 + b)), *B((x + dx - 1, 10 + b))), fill=BUG_LEG)
        else:
            d.line((*B((x, 24 + b)), *B((x + dx - 1, 29 - lift))), fill=BUG_LEG)


def draw_bug(img, d, p, body_scale=1.0, head_scale=1.0):
    """`body_scale`/`head_scale`: see `draw_cat`. The head anchor here is
    the head box's bottom-right corner `(30, 25 + b)`, the one fixed point
    in the original drawing that doesn't move with `p.head` -- so scaling
    around it reproduces the un-scaled drawing exactly at 1.0/1.0."""
    def B(pt):
        return _pivot_pt(BUG_BODY_PIVOT, pt, body_scale)

    b = p.bob
    up = p.kind == "back"
    bug_legs(d, b, p, up=up, body_scale=body_scale)
    blob(d, (*B((5, 13 + b + p.squash)), *B((25, 27 + b))), BUG_BASE, BUG_DARK, BUG_LIGHT)
    d.line((*B((15, 14 + b)), *B((15, 25 + b))), fill=BUG_DARK)  # wing-case split
    d.point(B((11, 20 + b)), fill=BUG_DARK)
    d.point(B((19, 22 + b)), fill=BUG_DARK)
    h = p.head
    ax, ay = B((30, 25 + b))
    HX, HY = lambda dx: ax + dx * head_scale, lambda dy: ay + dy * head_scale  # noqa: E731
    d.head = Head(HX(-4), HY(h - 9), 8 * head_scale, (HX(-4), HY(h - 6)))
    blob(d, (HX(-8), HY(h - 9), HX(0), HY(0)), c(84, 96, 74), c(58, 68, 52), c(120, 136, 104))
    eye(d, HX(-4), HY(h - 6), "open" if p.eyes == "blink" else p.eyes)
    if p.carry:
        carry_item(d, HX(-2), HY(h - 3))
    aw = -1 if p.tail < 0 else p.tail
    d.line((HX(-3), HY(-9), HX(-1), HY(-14 - aw)), fill=BUG_LEG)
    d.line((HX(-5), HY(-9), HX(-4), HY(-14 + aw)), fill=BUG_LEG)
    mark(d, p.mark, *B((5, 1)))


def draw_bug_climb(img, d, p):
    b = p.bob
    for k, y in enumerate((14, 19, 24)):
        swing = [1, -1][(k + p.phase) % 2] * 2
        d.line((9, y + b, 3, y + b + swing), fill=BUG_LEG)
        d.line((23, y + b, 29, y + b - swing), fill=BUG_LEG)
    blob(d, (9, 9 + b, 23, 30 + b), BUG_BASE, BUG_DARK, BUG_LIGHT)
    d.line((16, 11 + b, 16, 29 + b), fill=BUG_DARK)
    d.head = Head(16, 2 + b, 10, None)  # seen from behind: no face
    blob(d, (11, 2 + b, 21, 11 + b), BUG_LEG, BUG_LEG, BUG_DARK)
    d.line((12, 3 + b, 9, -0 + b), fill=BUG_LEG)
    d.line((20, 3 + b, 23, 0 + b), fill=BUG_LEG)


# Larva: the baby insect's caterpillar, same poses (so the same movements) as the adult.
LARVA_BASE = c(150, 214, 96)
LARVA_DARK = c(84, 150, 72)
LARVA_LIGHT = c(214, 242, 150)
LARVA_HEAD = c(236, 170, 70)
LARVA_HEAD_DARK = c(190, 118, 44)
LARVA_HEAD_LIGHT = c(250, 214, 130)


def draw_caterpillar(img, d, p):
    """Five undulating rings (a bump peak travels along the body as `phase` advances) and an orange head."""
    b = p.bob
    bottom = min(28 + b, 30)
    height = 7 - (2 if p.squash else 0)
    xs = (5, 9, 13, 17, 21)
    lifts = []
    for i in range(len(xs)):
        t = (p.phase or 0) / 6 - i / 5
        lifts.append(max(0, round(2 * math.sin(2 * math.pi * t))) if p.phase is not None else 0)
    if p.kind == "back":  # on its back: rings flat, legs in the air
        lifts = [0] * len(xs)
        for x in xs:
            d.line((x, bottom - height, x + 1, bottom - height - 3), fill=BUG_LEG)
    else:
        for i, x in enumerate(xs):
            d.point((x, bottom + 1 if lifts[i] == 0 else bottom), fill=BUG_LEG)
    for i, x in enumerate(xs):
        top = bottom - height - lifts[i]
        blob(d, (x - 3, top, x + 3, bottom - lifts[i]), LARVA_BASE, LARVA_DARK, LARVA_LIGHT)
        if i % 2 == 1:
            d.line((x, top + 1, x, bottom - lifts[i] - 1), fill=LARVA_DARK)
    h = p.head
    top = bottom - height - 1 + h
    d.head = Head(26, top, 8, (27, top + 3))
    blob(d, (22, top, 30, bottom), LARVA_HEAD, LARVA_HEAD_DARK, LARVA_HEAD_LIGHT)
    eye(d, 27, top + 3, "open" if p.eyes == "blink" else p.eyes)
    if p.carry:
        carry_item(d, 29, top + 5)
    aw = -1 if p.tail < 0 else p.tail
    d.line((26, top, 27, top - 3 - aw), fill=BUG_LEG)
    d.line((24, top, 24, top - 3 + aw), fill=BUG_LEG)
    mark(d, p.mark, 5, 1)


def draw_caterpillar_climb(img, d, p):
    """Vertical caterpillar: the bump climbs up along the body."""
    b = p.bob
    ys = (27, 22, 17, 12, 7)
    for i, y in enumerate(ys):
        t = (p.phase or 0) / 6 - i / 5
        dx = round(2 * math.sin(2 * math.pi * t))
        d.line((11 + dx, y + b, 8 + dx, y + b + 1), fill=BUG_LEG)
        d.line((21 + dx, y + b, 24 + dx, y + b + 1), fill=BUG_LEG)
        blob(d, (12 + dx, y - 3 + b, 20 + dx, y + 3 + b), LARVA_BASE, LARVA_DARK, LARVA_LIGHT)
    d.head = Head(16, -1 + b, 8, None)
    blob(d, (12, -1 + b, 20, 5 + b), LARVA_HEAD, LARVA_HEAD_DARK, LARVA_HEAD_LIGHT)
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
    d.head = Head(23.5, 10.5 + b, 11, (23, 14 + b))
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


# Same idea as CAT_BODY_PIVOT (see `draw_cat`): ground-level point the
# bird's body -- including the wings, which is what made the earlier
# raster-mask attempt bleed onto them -- scales around for a life stage.
BIRD_BODY_PIVOT = (14, 30)


def bird_wing(d, b, wing, body_scale=1.0):
    def B(pt):
        return _pivot_pt(BIRD_BODY_PIVOT, pt, body_scale)

    if wing == "folded":
        blob(d, (*B((6, 15 + b)), *B((17, 24 + b))), BIRD_DARK, BIRD_DARK, BIRD_BASE)
    elif wing == "up":
        d.polygon([B((7, 15 + b)), B((17, 15 + b)), B((5, 1 + b)), B((3, 8 + b))], fill=BIRD_DARK)
        d.line((*B((6, 4 + b)), *B((10, 14 + b))), fill=BIRD_BASE)
    elif wing == "mid":
        d.polygon([B((6, 16 + b)), B((17, 16 + b)), B((0, 12 + b)), B((0, 16 + b))], fill=BIRD_DARK)
        d.line((*B((2, 14 + b)), *B((12, 16 + b))), fill=BIRD_BASE)
    elif wing == "down":
        d.polygon([B((7, 18 + b)), B((17, 18 + b)), B((4, 30)), B((2, 24))], fill=BIRD_DARK)
        d.line((*B((5, 24)), *B((10, 19 + b))), fill=BIRD_BASE)


def draw_bird(img, d, p, body_scale=1.0, head_scale=1.0):
    """`body_scale`/`head_scale`: see `draw_cat`. `(hx, hy)` is already the
    head's own anchor point in the original drawing, so scaling around it
    (once transformed through the body's own pivot) is exactly the
    `draw_cat`/`cat_head` pattern."""
    def B(pt):
        return _pivot_pt(BIRD_BODY_PIVOT, pt, body_scale)

    b = p.bob
    flying = p.kind in ("fly", "flee")
    d.polygon([B((6, 18 + b)), B((0, 15 + b - p.tail)), B((0, 21 + b - p.tail)), B((5, 23 + b))], fill=BIRD_DARK)  # queue
    if not flying and p.kind != "sleep":
        legs = leg_offsets(p.phase or 0, 6, 2, 2, offsets=(0, 0.5)) if p.phase is not None else [(0, 0)] * 2
        for k, x in enumerate((12, 17)):
            dx, up = legs[k]
            d.line((*B((x, 25 + b)), *B((x + dx, 30 - up))), fill=BIRD_BEAK)
    elif flying:
        d.line((*B((12, 25 + b)), *B((11, 28 + b))), fill=BIRD_BEAK)
        d.line((*B((16, 25 + b)), *B((17, 28 + b))), fill=BIRD_BEAK)
    blob(d, (*B((5, 13 + b)), *B((23, 27 + b))), BIRD_BASE, BIRD_DARK, BIRD_LIGHT)
    d.ellipse((*B((10, 19 + b)), *B((21, 27 + b))), fill=BIRD_BELLY)
    hx, hy = (16, 9 + b + p.head) if p.kind != "preen" else (14, 13 + b)
    if p.kind == "sleep":
        hx, hy = (15, 12 + b)
    ax, ay = B((hx, hy))
    HX, HY = lambda dx: ax + dx * head_scale, lambda dy: ay + dy * head_scale  # noqa: E731
    d.head = Head(HX(6), HY(-4), 12 * head_scale, (HX(7), HY(0)))
    blob(d, (HX(0), HY(-4), HX(12), HY(8)), BIRD_BASE, BIRD_DARK, BIRD_LIGHT)
    if p.kind == "preen":
        d.polygon([(HX(4), HY(8)), (HX(9), HY(8)), (HX(6), HY(12))], fill=BIRD_BEAK)
    else:
        d.polygon([(HX(11), HY(0)), (HX(15), HY(2)), (HX(11), HY(4))], fill=BIRD_BEAK)
    eye(d, HX(7), HY(0), p.eyes)
    if p.ears == "back" or p.eyes == "wide":  # crest raised
        d.polygon([(HX(3), HY(-3)), (HX(1), HY(-8)), (HX(6), HY(-4))], fill=BIRD_DARK)
    bird_wing(d, b, p.wing, body_scale=body_scale)
    if p.carry:
        carry_item(d, HX(13), HY(3))
    mark(d, p.mark, *B((24, 0)))


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


# --- assembly ------------------------------------------------------------------

# Frame duration (seconds) per state; one sheet per state, of the same name.
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
    """state -> (sheet of the same name, frame duration)."""
    return {name: (name, DURATIONS[name]) for name in names}


SPECIES = {
    "cat": dict(
        sheets=cat_sheets, out=CAT_OUT,
        draw=lambda img, d, p: {"sleep": draw_cat_sleep, "wash": draw_cat_wash, "climb": draw_cat_climb}.get(p.kind, draw_cat)(img, d, p),
        # Native per-stage drawing (see draw_cat/draw_cat_wash): everything
        # `is_uniform_sheet` doesn't already exempt (sleep/climb/rotated/
        # hibernating poses) goes through here instead of a whole-frame split.
        draw_stage=lambda img, d, p, bs, hs: (draw_cat_wash if p.kind == "wash" else draw_cat)(img, d, p, bs, hs),
        flip={"ceiling": "walk"},
        states=make_states(GROUND_STATES + ["climb", "seekWall", "ceiling", "trick_sit", "trick_roll", "egg"]),
    ),
    "bug": dict(
        sheets=bug_sheets, out=c(20, 34, 22),
        draw=lambda img, d, p: (draw_bug_climb if p.kind == "climb" else draw_bug)(img, d, p),
        # Only `baby` gets the caterpillar; `young` still draws the beetle
        # shape (build_stage checks `stage_draw` first), natively scaled.
        draw_stage=draw_bug,
        flip={"ceiling": "walk"},
        stage_draw={"baby": lambda img, d, p: (draw_caterpillar_climb if p.kind == "climb" else draw_caterpillar)(img, d, p)},
        states=make_states(GROUND_STATES + ["climb", "seekWall", "ceiling", "trick_roll", "egg"]),
    ),
    "fish": dict(
        sheets=fish_sheets, out=c(96, 40, 8),
        draw=draw_fish, flip={},
        # No separate head shape to scale independently (see build_stage):
        # every stage gets the same whole-frame treatment as sleep/climb.
        states=make_states([
            "idle", "fall", "drag", "swim", "swimFast", "seekFood", "eat", "play", "hunt", "remind", "gift",
            "hibernate", "trick_flip", "egg",
        ]),
    ),
    "bird": dict(
        sheets=bird_sheets, out=c(16, 30, 64),
        draw=draw_bird, flip={},
        draw_stage=draw_bird,
        states=make_states(GROUND_STATES + ["fly", "flyFast", "dive", "trick_flip", "egg"]),
    ),
}

# reaction -> (sheet, frame duration, sound); no sound when the event has none.
REACTIONS = {
    "petted": ("react_petted", 0.25, "petted"), "tickled": ("react_tickled", 0.12, "tickled"),
    "annoyed": ("react_annoyed", 0.3, "annoyed"), "noticed": ("react_noticed", 0.25, "noticed"),
    "startled": ("react_startled", 0.2, "startled"), "greeted": ("react_greeted", 0.15, "greeted"),
    "purring": ("react_purr", 0.4, "petted"), "brushed": ("react_brushed", 0.35, "petted"),
    "hatched": ("react_hatched", 0.2, "hatched"), "grew": ("react_grew", 0.15, "grew"),
    "awakened": ("react_awakened", 0.25, "noticed"), "ate": ("react_ate", 0.15, None),
    "played": ("react_played", 0.15, "greeted"), "sick": ("react_sick", 0.3, "annoyed"),
    "accident": ("react_accident", 0.3, "startled"), "relieved": ("react_relieved", 0.3, None),
    "trickLearned": ("react_trick", 0.15, "tickled"), "birthday": ("react_birthday", 0.2, "greeted"),
    "gift": ("react_gift", 0.2, "greeted"), "reminded": ("react_reminded", 0.2, "noticed"),
}


# --- species-specific eggs ------------------------------------------------

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
        d.ellipse((10, 7, 14, 11), fill=style["light"][:3] + (220,))  # highlight
        d.polygon([(13, 19), (19, 16), (19, 22)], fill=style["mark"])  # small fish inside
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
        else:  # pearl: pale highlights
            for x, y in ((11, 11), (14, 14), (17, 12), (12, 20), (18, 19)):
                d.line((x, y, x + 2, y + 1), fill=style["light"])
            for x, y in ((15, 9), (10, 17), (19, 24)):
                d.point((x, y), fill=style["mark"])
    if cracked:
        for (x0, y0), (x1, y1) in (((13, 8), (15, 11)), ((15, 11), (14, 14)), ((14, 14), (18, 16))):
            d.line((x0, y0, x1, y1), fill=INK)
    if tilt:
        img.rotate(tilt, (16, 28))
    return img.finish(out)


def species_egg(species, out):
    """Species' egg: resting, two wobbles, cracked."""
    style = EGG_STYLES[species]
    return [egg_frame(style, out), egg_frame(style, out, tilt=-10), egg_frame(style, out, tilt=10), egg_frame(style, out, cracked=True)]


# --- growth stages: baby, young, senior ------------------------------------

# X coordinate (output pixels) splitting the body from the head, sprite facing right.
HEAD_SPLIT = {"cat": 17 * S, "bird": 15 * S, "bug": 21 * S, "fish": 21 * S}

# body/head: scale factors for the body and the head (baby: big head, small body);
# uniform: downscaling of rotated sheets; lighten: brightening; gray: fade toward a light gray (graying fur).
STAGE_CFG = {
    "baby": dict(body=0.62, head=1.0, uniform=0.7, lighten=0.10, head_gray=0.0, body_gray=0.0),
    "young": dict(body=0.86, head=0.94, uniform=0.88, lighten=0.06, head_gray=0.0, body_gray=0.0),
    "senior": dict(body=1.0, head=1.0, uniform=1.0, lighten=0.0, head_gray=0.45, body_gray=0.22),
}
GRAY_HAIR = (215, 215, 225)


def _mix(color, target, amount):
    return tuple(round(color[i] + (target[i] - color[i]) * amount) for i in range(3))


def carry(src, dst):
    """Copies the head (and the flipped mark) of a frame onto another made from it."""
    dst.head = getattr(src, "head", None)
    if getattr(src, "flipped", False):
        dst.flipped = True
    return dst


def tint_stage(frame, split, cfg):
    """Lightens and/or grays light pixels (dark outlines stay untouched)."""
    img = frame.copy()
    px = img.load()
    for y in range(R):
        for x in range(R):
            r, g, b, a = px[x, y]
            if a == 0 or 0.3 * r + 0.59 * g + 0.11 * b < 70:
                continue
            t = min(1.0, max(0.0, (x - (split - 3 * S)) / (6 * S)))  # smooth body -> head transition
            gray = cfg["body_gray"] + (cfg["head_gray"] - cfg["body_gray"]) * t
            color = (r, g, b)
            if gray:
                color = _mix(color, GRAY_HAIR, gray)
            if cfg["lighten"]:
                color = _mix(color, (255, 255, 255), cfg["lighten"])
            px[x, y] = color + (a,)
    return carry(frame, img)


def _scaled(img, factor):
    if factor == 1:
        return img
    w, h = img.size
    return img.resize((max(1, round(w * factor)), max(1, round(h * factor))), Image.LANCZOS)


def uniform_stage(frame, factor, bbox):
    """Uniform downscaling of the content, feet aligned with the original's and centered."""
    if factor == 1:
        return frame
    content = _scaled(frame.crop(bbox), factor)
    out = Image.new("RGBA", (R, R), (0, 0, 0, 0))
    cx = (bbox[0] + bbox[2]) // 2
    left = min(max(cx - content.width // 2, 0), R - content.width)
    top = bbox[3] - content.height
    out.paste(content, (left, top), content)
    carry(frame, out)
    head = out.head
    if head:
        kx, ky = content.width / (bbox[2] - bbox[0]), content.height / (bbox[3] - bbox[1])
        out.head = head.mapped(lambda x, y: ((left + (x * S - bbox[0]) * kx) / S, (top + (y * S - bbox[1]) * ky) / S))
        out.head.width = head.width * factor
    return out


def is_uniform_sheet(poses):
    """Rotated, sleeping, or climbing sheets: downscaled as a whole (no body/head split)."""
    return any(p.rot or p.kind in ("sleep", "climb") or p.blanket for p in poses)


def build_stage(spec, species, poses, sheets, stage):
    if stage in spec.get("stage_draw", {}):
        # Stage drawn separately (larva): same poses, different silhouette.
        alt = dict(spec, draw=spec["stage_draw"][stage])
        out = {name: [render(alt, p) for p in ps] for name, ps in poses.items()}
        for name, src in spec["flip"].items():
            out[name] = [flip_frame(f) for f in out[src]]
        return out
    cfg = STAGE_CFG[stage]
    split = HEAD_SPLIT[species]
    # Only cat/bug/bird have a head shape distinct enough to scale on its
    # own (see `draw_stage` on each in SPECIES); fish and the exempted
    # poses (sleep/climb/rotated/hibernating -- see `is_uniform_sheet`)
    # always get the whole-frame treatment, same as before.
    can_native = "draw_stage" in spec and cfg["body"] != cfg["head"]
    out = {}
    for name, frames in sheets.items():
        if name in spec["flip"] or name == "egg":
            continue
        uniform = is_uniform_sheet(poses[name])
        frames_out = []
        for i, frame in enumerate(frames):
            bbox = frame.getbbox()
            if bbox is None:
                frames_out.append(frame)
                continue
            if can_native and not uniform:
                frames_out.append(render_stage(spec, poses[name][i], cfg["body"], cfg["head"], split, cfg))
            else:
                img = tint_stage(frame, split, cfg)
                img = uniform_stage(img, cfg["uniform"], bbox)
                frames_out.append(img)
        out[name] = frames_out
    for name, src in spec["flip"].items():
        out[name] = [flip_frame(f) for f in out[src]]
    return out


def flip_frame(frame):
    """Vertical mirror (head on the ceiling): the head follows, and `flipped` marks the 180 degree anchor."""
    out = ImageOps.flip(frame)
    head = getattr(frame, "head", None)
    out.head = head and head.mapped(lambda x, y: (x, G - y))
    out.flipped = True
    return out


def render(spec, p):
    img, d = new_canvas()
    spec["draw"](img, d, p)
    if p.blanket:  # hibernation: a blanket over the lower body
        d.rectangle((3, 21, 28, 30), fill=c(100, 130, 200))
        for x in range(4, 28, 4):
            d.line((x, 21, x, 30), fill=c(70, 100, 170))
    head = getattr(img, "head", None)
    if p.rot:
        center = (G / 2, G - 2 if p.pivot is None else p.pivot)
        img.rotate(p.rot, center)
        head = head and head.mapped(lambda x, y: rotate_point(p.rot, center, x, y))
        if head:
            head.angle = (p.rot + 180) % 360 - 180
    frame = img.finish(spec["out"])
    frame.head = head
    return frame


def render_stage(spec, p, body_scale, head_scale, split, cfg):
    """Like `render`, but calls the species' scale-aware `draw_stage`
    instead of `draw` -- used for the life stages whose body and head
    scale differently (see `build_stage`). Never sees a rotated/blanket
    pose (those are always `is_uniform_sheet`, handled the old way), so
    unlike `render` it doesn't need to handle `p.rot`/`p.blanket`."""
    img, d = new_canvas()
    spec["draw_stage"](img, d, p, body_scale, head_scale)
    frame = img.finish(spec["out"])
    frame.head = getattr(img, "head", None)
    return tint_stage(frame, split, cfg)


def build_sheets(spec, species):
    """(sheet name -> images, sheet name -> poses); mirrored sheets are derived."""
    poses = spec["sheets"]()
    sheets = {name: [render(spec, p) for p in ps] for name, ps in poses.items()}
    for name, src in spec["flip"].items():
        sheets[name] = [flip_frame(f) for f in sheets[src]]
    sheets["egg"] = species_egg(species, spec["out"])
    return sheets, poses


def save_sheet(path, frames):
    sheet = Image.new("RGBA", (R * len(frames), R), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * R, 0))
    save_png(sheet, path)


# --- accessory anchors (pack.json "anchors": see docs/pack-format.md) ----------

MAX_TILT = 25  # degrees
ANCHOR_ORDER = ["head", "headWidth", "view", "slots", "layout", "stageFit", "base", "stages", "animations", "reactions"]
STAGES = list(STAGE_CFG)


def _num(v):
    return int(v) if isinstance(v, float) and v == int(v) else v


def head_width(sheets):
    """The head's width (fraction of the frame) in a stage's reference animation, or None without a head."""
    head = getattr(sheets["idle"][0], "head", None)
    return round(head.width / G, 3) if head else None


def anchor_tables(sheets, spec, stage_width):
    """`{animations, reactions}` of generated head points for one stage (the egg shows no accessory).

    One point per frame; a single point when they are all equal; `{rotation, width, hide, points}` when the head is
    upside down, its width differs from the stage's (a sheet drawn smaller as a whole) or no face shows."""
    out = {"animations": {}, "reactions": {}}
    sources = {
        "animations": {state: sheet for state, (sheet, _) in spec["states"].items()},
        "reactions": {react: sheet for react, (sheet, _, _) in REACTIONS.items()},
    }
    for table, entries in sources.items():
        for name, sheet in entries.items():
            frames = sheets.get(sheet)
            if sheet == "egg" or not frames:
                continue
            heads = [getattr(f, "head", None) for f in frames]
            if not any(heads):
                continue
            # An accessory only turns by 0 or 180 degrees: hidden while the head is tilted further than a wobble.
            heads = [h if h and abs(h.angle) <= MAX_TILT else None for h in heads]
            if not any(heads):
                out[table][name] = False
                continue
            clamp = lambda v: min(max(round(v / G, 3), 0), 1)  # noqa: E731
            points = [[clamp(h.x), clamp(h.y)] if h else False for h in heads]
            if all(p == points[0] and p for p in points):
                points = points[0]
            entry = {}
            if getattr(frames[0], "flipped", False):
                entry["rotation"] = 180
            widths = [h.width / G for h in heads if h]
            width = round(sum(widths) / len(widths), 3)
            if abs(width - stage_width) > 0.002:
                entry["width"] = width
            if all(h is None or h.eye is None for h in heads):
                entry["hide"] = ["face", "neck"]  # seen from behind: no face to put glasses on, no chest
            out[table][name] = {**entry, "points": points} if entry else points
    return out


def species_anchors(spec, species, sheets, poses):
    """Generated `base` / `stages` / `headWidth` / `slots.face` for a species whose draw functions record heads, else None."""
    adult_width = head_width(sheets)
    if adult_width is None:
        return None
    generated = {"headWidth": adult_width, "base": anchor_tables(sheets, spec, adult_width), "stages": {}}
    head = sheets["idle"][0].head
    if head.eye:
        generated["face"] = {
            "dx": round((head.eye[0] - head.x) / head.width, 3), "dy": round((head.eye[1] - head.y) / head.width, 3)}
    for stage in STAGES:
        stage_sheets = build_stage(spec, species, poses, sheets, stage)
        width = head_width(stage_sheets)
        generated["stages"][stage] = {"headWidth": width, "base": anchor_tables(stage_sheets, spec, width)}
    return generated


def merged_anchors(existing, generated):
    """The pack's `anchors` with the generated parts replaced; touch-ups, `head` and `slots` are kept."""
    out = dict(existing or {})
    for key in ("headWidth", "base", "stages"):
        out[key] = generated[key]
    slots = dict(out.get("slots", {}))
    if "face" in generated:
        slots.setdefault("face", generated["face"])
    # a stage block keeps its own touch-ups
    for stage, block in (existing or {}).get("stages", {}).items():
        for key in ("animations", "reactions"):
            if key in block and stage in out["stages"]:
                out["stages"][stage][key] = block[key]
    if slots:
        out["slots"] = slots
    out.setdefault("head", {"x": 0.72, "y": 0.2})
    return {key: out[key] for key in ANCHOR_ORDER if key in out} | {k: v for k, v in out.items() if k not in ANCHOR_ORDER}


def _inline(value):
    if isinstance(value, list):
        return "[" + ", ".join(_inline(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{ " + ", ".join(f"{json.dumps(k)}: {_inline(v)}" for k, v in value.items()) + " }"
    return json.dumps(_num(value))


def _anchor_lines(key, value, depth, comma):
    pad = "  " * depth
    if isinstance(value, dict) and value and (key in ("animations", "reactions", "layout", "base", "stages") or key in STAGES):
        rows = list(value.items())
        inner = []
        for j, (name, entry) in enumerate(rows):
            last = "" if j == len(rows) - 1 else ","
            if key in ("animations", "reactions", "layout"):
                inner.append(f"{pad}  {json.dumps(name)}: {_inline(entry)}{last}")
            else:
                inner += _anchor_lines(name, entry, depth + 1, last)
        return [f"{pad}{json.dumps(key)}: {{", *inner, f"{pad}}}{comma}"]
    return [f"{pad}{json.dumps(key)}: {_inline(value)}{comma}"]


def format_anchors(anchors):
    """The block's text, identical to tools/review/anchorsFile.mjs (formatAnchors)."""
    items = list(anchors.items())
    lines = [line for i, (k, v) in enumerate(items) for line in _anchor_lines(k, v, 2, "," if i < len(items) - 1 else "")]
    return '  "anchors": {\n' + "\n".join(lines) + "\n  }"


def replace_anchors_text(text, anchors):
    """pack.json's text with its "anchors" block replaced (same as replaceAnchors in anchorsFile.mjs)."""
    block = format_anchors(anchors)
    m = re.search(r'^ {2}"anchors": \{', text, re.M)
    if not m:
        return text.rstrip()[:-1].rstrip() + ",\n" + block + "\n}\n"
    depth, end = 0, None
    for i in range(text.index("{", m.start()), len(text)):
        depth += (text[i] == "{") - (text[i] == "}")
        if depth == 0:
            end = i + 1
            break
    return text[:m.start()] + block + text[end:]


def compact_json(data):
    text = json.dumps(data, indent=2, ensure_ascii=False)
    # Strings are set aside: their braces (achievements' "{n}") must not be reformatted.
    strings = []

    def stash(m):
        strings.append(m.group(0))
        return f'"\x00{len(strings) - 1}\x00"'

    text = re.sub(r'"(?:[^"\\]|\\.)*"', stash, text)
    text = re.sub(r"\[\s*([-\d.,\s]+?)\s*\]", lambda m: "[" + re.sub(r"\s+", " ", m.group(1)) + "]", text)
    text = re.sub(
        r"\{\s*([^{}]*?)\s*\}",
        lambda m: "{ " + re.sub(r"\s*\n\s*", " ", m.group(1)) + " }",
        text,
    )
    text = re.sub(r'"\x00(\d+)\x00"', lambda m: strings[int(m.group(1))], text)
    return text + "\n"


def write_species(name):
    spec = SPECIES[name]
    pack_dir = PACKS_DIR / name
    out_dir = pack_dir / "sprites"
    out_dir.mkdir(parents=True, exist_ok=True)
    sheets, poses = build_sheets(spec, name)
    for sheet_name, frames in sheets.items():
        save_sheet(out_dir / f"{sheet_name}.png", frames)
        print(f"wrote {name}/sprites/{sheet_name}.png ({len(frames)} frames)")

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
    meta["smooth"] = True  # fine drawing: the extension smooths the 64 -> spriteSize downscale
    meta["animations"] = animations
    meta["reactions"] = reactions

    # One folder per stage (baby, young, senior): same sheet names, different proportions and fur.
    meta["stages"] = {}
    for stage in STAGE_CFG:
        stage_dir = out_dir / stage
        stage_dir.mkdir(exist_ok=True)
        for sheet_name, frames in build_stage(spec, name, poses, sheets, stage).items():
            save_sheet(stage_dir / f"{sheet_name}.png", frames)
        meta["stages"][stage] = {"scale": 1, "folder": f"sprites/{stage}"}
    text = compact_json(meta)
    generated = species_anchors(spec, name, sheets, poses)
    if generated:
        text = replace_anchors_text(text, merged_anchors(meta.get("anchors"), generated))
    elif meta.get("anchors"):
        text = replace_anchors_text(text, meta["anchors"])  # same layout as the review tool's
    json.loads(text)  # never write a broken file
    pack_path.write_text(text, encoding="utf-8")
    for orphan in sorted(set(sheets) - used):
        print(f"  (unreferenced sheet: {orphan})")
    for stale in sorted(p.name for p in out_dir.glob("*.png") if p.stem not in sheets):
        print(f"  (stale file to delete: {name}/sprites/{stale})")


def main():
    requested = sys.argv[1:] or list(SPECIES)
    unknown = [s for s in requested if s not in SPECIES]
    if unknown:
        sys.exit(f"unknown species: {', '.join(unknown)} (known: {', '.join(SPECIES)})")
    for name in requested:
        write_species(name)


if __name__ == "__main__":
    main()
