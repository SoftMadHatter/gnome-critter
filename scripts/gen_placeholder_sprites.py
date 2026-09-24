#!/usr/bin/env python3
"""Génère des spritesheets pixel-art *placeholder* pour les packs d'animaux.

Ce ne sont pas des sprites définitifs : juste de quoi voir chaque animal
bouger tout de suite, avec un rendu pixel-art propre (dessiné sur une petite
grille puis mis à l'échelle au plus proche voisin, donc pas de flou).
Remplace ces PNG par tes propres dessins quand tu veux, en gardant la même
convention : une ligne de frames carrées par fichier.

Usage : python3 scripts/gen_placeholder_sprites.py [espèce ...]
        (toutes les espèces par défaut : critter-demo, cat, bug, fish, bird)

Régénérer un pack existant peut modifier ses PNG côté git même à pixels
identiques (l'encodage dépend de la version de Pillow) : préférer passer
en argument seulement les espèces réellement modifiées.
"""

import sys
from pathlib import Path
from PIL import Image, ImageDraw

GRID = 16  # taille logique de dessin (16x16 "pixels"), commune à toutes les espèces

PACKS_DIR = Path(__file__).resolve().parent.parent / "packs"

# --- critter-demo ------------------------------------------------------------
# Fonctions inchangées depuis la version mono-espèce du script : les PNG du
# pack démo doivent rester identiques octet pour octet.

BODY = (232, 150, 60, 255)      # orange
BODY_DARK = (196, 116, 40, 255)  # ombre du corps
BELLY = (250, 214, 170, 255)     # crème
EYE = (30, 20, 20, 255)
OUTLINE = (60, 34, 12, 255)


def new_canvas():
    return Image.new("RGBA", (GRID, GRID), (0, 0, 0, 0))


def draw_body(draw, bob=0, squash=0):
    """Corps ovale simple, avec un léger bob vertical et un squash pour les
    frames de saut/atterrissage."""
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
    draw_body(d, 0, squash=-squash)  # s'étire légèrement en chute
    draw_feet(d, 2, 2)
    draw_eyes(d, 0, "wide")
    return img


def frame_sleep(i):
    img = new_canvas()
    d = ImageDraw.Draw(img)
    bob = 1
    draw_ears(d, bob)
    draw_body(d, bob, squash=1)  # aplati, couché
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


# --- cat : chat gris tigré, queue, grimpe partout -------------------------------

CAT_BODY = (150, 150, 160, 255)
CAT_DARK = (100, 100, 112, 255)
CAT_BELLY = (225, 225, 230, 255)
CAT_NOSE = (230, 130, 150, 255)
CAT_OUTLINE = (45, 45, 55, 255)


def cat_base(d, bob=0, tail=0, eyes="open", body_squash=0):
    """Chat de profil (tête à droite) : corps allongé, tête ronde, queue."""
    top = 7 + bob + body_squash
    # queue qui se balance (tail = -1/0/1)
    d.line((2, 10 + bob, 1, 6 + bob + tail), fill=CAT_DARK, width=1)
    # corps
    d.ellipse((2, top, 11, 13 + bob), fill=CAT_BODY, outline=CAT_OUTLINE)
    d.line((5, top + 1, 5, top + 3), fill=CAT_DARK)  # rayures
    d.line((8, top + 1, 8, top + 3), fill=CAT_DARK)
    # tête + oreilles
    d.ellipse((9, 4 + bob, 15, 10 + bob), fill=CAT_BODY, outline=CAT_OUTLINE)
    d.polygon([(10, 5 + bob), (10, 2 + bob), (12, 4 + bob)], fill=CAT_BODY, outline=CAT_OUTLINE)
    d.polygon([(13, 4 + bob), (15, 2 + bob), (15, 5 + bob)], fill=CAT_BODY, outline=CAT_OUTLINE)
    d.point((14, 8 + bob), fill=CAT_NOSE)
    y = 6 + bob
    if eyes == "open":
        d.point((12, y), fill=CAT_OUTLINE)
    elif eyes == "closed":
        d.line((11, y, 12, y), fill=CAT_OUTLINE)
    elif eyes == "wide":
        d.line((12, y - 1, 12, y), fill=CAT_OUTLINE)


def cat_legs(d, bob=0, phase=0):
    y = 13 + bob
    back = [3, 4, 3, 2][phase % 4]
    front = [9, 8, 9, 10][phase % 4]
    d.line((back, y, back, y + 2), fill=CAT_DARK)
    d.line((front, y, front, y + 2), fill=CAT_DARK)


def cat_idle(i):
    img, d = canvas()
    cat_base(d, bob=[0, 0, 1, 0][i], tail=[-1, 0, 1, 0][i], eyes="closed" if i == 3 else "open")
    cat_legs(d, bob=[0, 0, 1, 0][i])
    return img


def cat_walk(i):
    img, d = canvas()
    bob = [0, -1, 0, -1][i]
    cat_base(d, bob=bob, tail=[0, 1, 0, -1][i])
    cat_legs(d, bob=bob, phase=i)
    return img


def cat_fall(i):
    img, d = canvas()
    cat_base(d, bob=-1, tail=[-2, 2][i], eyes="wide")
    d.line((3, 12, 1, 14), fill=CAT_DARK)  # pattes écartées
    d.line((10, 12, 12, 14), fill=CAT_DARK)
    return img


def cat_sleep(i):
    img, d = canvas()
    # roulé en boule
    d.ellipse((2, 8, 14, 15), fill=CAT_BODY, outline=CAT_OUTLINE)
    d.ellipse((9, 8, 14, 13), fill=CAT_BODY, outline=CAT_OUTLINE)
    d.line((11, 10, 12, 10), fill=CAT_OUTLINE)
    d.line((3, 13, 8, 14), fill=CAT_DARK)  # queue enroulée
    if i == 1:
        d.text((10, 1), "z", fill=CAT_OUTLINE)
    return img


def cat_wash(i):
    """Assis, lèche une patte levée devant la tête."""
    img, d = canvas()
    d.ellipse((4, 7, 11, 15), fill=CAT_BODY, outline=CAT_OUTLINE)  # corps assis
    d.ellipse((8, 3, 14, 9), fill=CAT_BODY, outline=CAT_OUTLINE)
    d.polygon([(9, 4), (9, 1), (11, 3)], fill=CAT_BODY, outline=CAT_OUTLINE)
    d.polygon([(12, 3), (14, 1), (14, 4)], fill=CAT_BODY, outline=CAT_OUTLINE)
    d.line((10, 6, 11, 6), fill=CAT_OUTLINE)  # yeux mi-clos
    paw_y = [9, 8, 7, 8][i]
    d.line((11, 12, 14, paw_y), fill=CAT_DARK, width=1)  # patte levée
    if i in (1, 2):
        d.point((14, paw_y - 1), fill=CAT_NOSE)  # langue
    d.line((4, 14, 1, 12), fill=CAT_DARK)
    return img


def cat_climb(i):
    """Vue verticale, tête en haut, pattes alternées contre le mur."""
    img, d = canvas()
    bob = [0, -1, 0, -1][i]
    d.ellipse((5, 5 + bob, 11, 14 + bob), fill=CAT_BODY, outline=CAT_OUTLINE)
    d.ellipse((5, 1 + bob, 11, 7 + bob), fill=CAT_BODY, outline=CAT_OUTLINE)
    d.polygon([(5, 2 + bob), (6, 0 + bob), (7, 2 + bob)], fill=CAT_BODY)
    d.polygon([(9, 2 + bob), (10, 0 + bob), (11, 2 + bob)], fill=CAT_BODY)
    reach = [0, 1, 0, -1][i]
    d.line((5, 8 + bob, 3, 6 + bob - reach), fill=CAT_DARK)
    d.line((11, 8 + bob, 13, 6 + bob + reach), fill=CAT_DARK)
    d.line((8, 14 + bob, 8, 15), fill=CAT_DARK)  # queue
    return img


CAT_SHEETS = {
    "idle.png": (cat_idle, 4),
    "walk.png": (cat_walk, 4),
    "fall.png": (cat_fall, 2),
    "sleep.png": (cat_sleep, 2),
    "wash.png": (cat_wash, 4),
    "climb.png": (cat_climb, 4),
}


# --- bug : scarabée vert, petit (16 px), six pattes ----------------------------

BUG_BODY = (70, 150, 70, 255)
BUG_SHINE = (140, 210, 120, 255)
BUG_LEG = (30, 50, 30, 255)


def bug_base(d, bob=0, leg_phase=0, legs_up=False):
    """Scarabée de profil : carapace, tête, six pattes, antennes."""
    d.ellipse((3, 6 + bob, 12, 12 + bob), fill=BUG_BODY, outline=BUG_LEG)
    d.line((5, 8 + bob, 9, 7 + bob), fill=BUG_SHINE)  # reflet
    d.ellipse((11, 7 + bob, 14, 10 + bob), fill=BUG_LEG)  # tête
    d.line((13, 7 + bob, 15, 4 + bob), fill=BUG_LEG)  # antennes
    d.line((12, 7 + bob, 13, 4 + bob), fill=BUG_LEG)
    for n, x in enumerate((4, 7, 10)):
        swing = [1, -1][(n + leg_phase) % 2]
        if legs_up:
            d.line((x, 6 + bob, x + swing, 3 + bob), fill=BUG_LEG)
        else:
            d.line((x, 12 + bob, x + swing, 14 + bob), fill=BUG_LEG)


def bug_idle(i):
    img, d = canvas()
    bug_base(d, bob=[0, 0][i], leg_phase=0)
    if i == 1:
        d.line((13, 7, 15, 5), fill=BUG_LEG)  # antenne qui frétille
    return img


def bug_walk(i):
    img, d = canvas()
    bug_base(d, bob=[0, -1, 0, -1][i], leg_phase=i)
    return img


def bug_fall(i):
    img, d = canvas()
    bug_base(d, bob=1, leg_phase=i, legs_up=True)  # sur le dos, pattes en l'air
    return img


def bug_climb(i):
    """Vue de dessus contre le mur : carapace verticale, pattes des deux côtés."""
    img, d = canvas()
    bob = [0, -1, 0, -1][i]
    d.ellipse((5, 4 + bob, 11, 13 + bob), fill=BUG_BODY, outline=BUG_LEG)
    d.line((8, 5 + bob, 8, 12 + bob), fill=BUG_LEG)  # séparation des élytres
    d.ellipse((6, 1 + bob, 10, 5 + bob), fill=BUG_LEG)
    for n, y in enumerate((6, 9, 12)):
        swing = [1, -1][(n + i) % 2]
        d.line((5, y + bob, 3, y + bob + swing), fill=BUG_LEG)
        d.line((11, y + bob, 13, y + bob - swing), fill=BUG_LEG)
    return img


BUG_SHEETS = {
    "idle.png": (bug_idle, 2),
    "walk.png": (bug_walk, 4),
    "fall.png": (bug_fall, 2),
    "climb.png": (bug_climb, 4),
}


# --- fish : poisson orange, nage en continu -----------------------------------

FISH_BODY = (240, 140, 40, 255)
FISH_FIN = (250, 200, 90, 255)
FISH_OUTLINE = (110, 50, 10, 255)


def fish_base(d, tail=0, bob=0, eye="open"):
    """Poisson de profil (tête à droite) ; tail = inclinaison de la queue."""
    d.polygon([(4, 8 + bob), (0, 5 + bob + tail), (0, 11 + bob + tail)], fill=FISH_FIN, outline=FISH_OUTLINE)
    d.ellipse((3, 5 + bob, 14, 11 + bob), fill=FISH_BODY, outline=FISH_OUTLINE)
    d.polygon([(7, 5 + bob), (9, 2 + bob), (11, 5 + bob)], fill=FISH_FIN)  # nageoire dorsale
    d.line((6, 7 + bob, 6, 9 + bob), fill=FISH_FIN)  # ouïe
    if eye == "open":
        d.point((11, 7 + bob), fill=FISH_OUTLINE)
    else:
        d.line((10, 6 + bob, 12, 8 + bob), fill=FISH_OUTLINE)
        d.line((10, 8 + bob, 12, 6 + bob), fill=FISH_OUTLINE)


def fish_swim(i):
    img, d = canvas()
    fish_base(d, tail=[-1, 0, 1, 0][i], bob=[0, 0, 1, 1][i])
    return img


def fish_fall(i):
    img, d = canvas()
    fish_base(d, tail=[-2, 2][i], bob=[0, 1][i], eye="x")  # se tortille, hors de l'eau
    return img


def fish_idle(i):
    img, d = canvas()
    fish_base(d, tail=[0, 1][i])
    if i == 1:
        d.point((15, 4), fill=FISH_FIN)  # bulle
    return img


FISH_SHEETS = {
    "idle.png": (fish_idle, 2),
    "swim.png": (fish_swim, 4),
    "fall.png": (fish_fall, 2),
}


# --- bird : oiseau bleu, vole souvent -----------------------------------------

BIRD_BODY = (70, 130, 220, 255)
BIRD_WING = (40, 90, 170, 255)
BIRD_BELLY = (230, 230, 245, 255)
BIRD_BEAK = (245, 170, 40, 255)
BIRD_OUTLINE = (20, 35, 70, 255)


def bird_base(d, bob=0, eyes="open"):
    """Oiseau de profil (tête à droite) : corps rond, tête, bec, pattes."""
    d.polygon([(3, 9 + bob), (0, 8 + bob), (1, 11 + bob)], fill=BIRD_WING)  # queue
    d.ellipse((2, 6 + bob, 11, 13 + bob), fill=BIRD_BODY, outline=BIRD_OUTLINE)
    d.ellipse((5, 9 + bob, 10, 13 + bob), fill=BIRD_BELLY)
    d.ellipse((8, 3 + bob, 14, 9 + bob), fill=BIRD_BODY, outline=BIRD_OUTLINE)
    d.polygon([(14, 5 + bob), (16, 6 + bob), (14, 7 + bob)], fill=BIRD_BEAK)
    y = 5 + bob
    if eyes == "open":
        d.point((12, y), fill=BIRD_OUTLINE)
    elif eyes == "closed":
        d.line((11, y, 12, y), fill=BIRD_OUTLINE)
    elif eyes == "wide":
        d.line((12, y - 1, 12, y), fill=BIRD_OUTLINE)


def bird_feet(d, bob=0):
    d.line((5, 13 + bob, 5, 15), fill=BIRD_BEAK)
    d.line((8, 13 + bob, 8, 15), fill=BIRD_BEAK)


def bird_wing(d, bob=0, pose="folded"):
    if pose == "folded":
        d.ellipse((3, 8 + bob, 8, 11 + bob), fill=BIRD_WING)
    elif pose == "up":
        d.polygon([(4, 8 + bob), (9, 8 + bob), (5, 1 + bob)], fill=BIRD_WING, outline=BIRD_OUTLINE)
    elif pose == "mid":
        d.polygon([(3, 8 + bob), (9, 8 + bob), (1, 6 + bob)], fill=BIRD_WING, outline=BIRD_OUTLINE)
    elif pose == "down":
        d.polygon([(4, 9 + bob), (9, 9 + bob), (5, 15)], fill=BIRD_WING, outline=BIRD_OUTLINE)


def bird_idle(i):
    img, d = canvas()
    bob = [0, 1][i]
    bird_base(d, bob=bob, eyes="open")
    bird_wing(d, bob=bob)
    bird_feet(d, bob=bob)
    return img


def bird_walk(i):
    """Sautille : léger bond une frame sur deux."""
    img, d = canvas()
    bob = [0, -2, 0, -1][i]
    bird_base(d, bob=bob)
    bird_wing(d, bob=bob)
    bird_feet(d, bob=bob)
    return img


def bird_fall(i):
    img, d = canvas()
    bird_base(d, bob=0, eyes="wide")
    bird_wing(d, bob=0, pose=["up", "mid"][i])  # bat des ailes en panique
    return img


def bird_fly(i):
    img, d = canvas()
    bob = [0, 0, 1, 0][i]
    bird_base(d, bob=bob)
    bird_wing(d, bob=bob, pose=["up", "mid", "down", "mid"][i])
    return img


def bird_sleep(i):
    img, d = canvas()
    bird_base(d, bob=1, eyes="closed")
    bird_wing(d, bob=1)
    bird_feet(d, bob=1)
    if i == 1:
        d.text((1, 0), "z", fill=BIRD_OUTLINE)
    return img


BIRD_SHEETS = {
    "idle.png": (bird_idle, 2),
    "walk.png": (bird_walk, 4),
    "fall.png": (bird_fall, 2),
    "fly.png": (bird_fly, 4),
    "sleep.png": (bird_sleep, 2),
}


# --- génération ----------------------------------------------------------------

def canvas():
    img = new_canvas()
    return img, ImageDraw.Draw(img)


# espèce -> (facteur d'agrandissement, feuilles). Taille finale d'une frame :
# GRID * scale, à reporter dans le spriteSize du pack.json correspondant.
SPECIES = {
    "critter-demo": (2, DEMO_SHEETS),
    "cat": (2, CAT_SHEETS),
    "bug": (1, BUG_SHEETS),  # 16 px : petit insecte
    "fish": (2, FISH_SHEETS),
    "bird": (2, BIRD_SHEETS),
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
        print(f"écrit {out_path} ({sheet.width}x{sheet.height}, {count} frames)")


def main():
    requested = sys.argv[1:] or list(SPECIES)
    unknown = [s for s in requested if s not in SPECIES]
    if unknown:
        sys.exit(f"espèce(s) inconnue(s) : {', '.join(unknown)} (connues : {', '.join(SPECIES)})")
    for species in requested:
        write_species(species)


if __name__ == "__main__":
    main()
