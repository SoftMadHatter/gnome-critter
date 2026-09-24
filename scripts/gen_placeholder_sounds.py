#!/usr/bin/env python3
"""Génère des bips *placeholder* pour les réactions des packs d'animaux.

Pas des sons définitifs : juste de quoi entendre une différence entre
réactions (et entre espèces) tout de suite. Aucune dépendance externe
(module stdlib `wave` uniquement, PCM 16 bits écrit directement).

Usage : python3 scripts/gen_placeholder_sounds.py [espèce ...]
        (toutes les espèces par défaut : critter-demo, cat, bug, fish, bird)
"""

import math
import struct
import sys
import wave
from pathlib import Path

RATE = 44100
PACKS_DIR = Path(__file__).resolve().parent.parent / "packs"

# Facteur de hauteur appliqué à toutes les fréquences d'une espèce : les
# mêmes 6 réactions, transposées (1.0 = sons d'origine du pack démo).
SPECIES_PITCH = {
    "critter-demo": 1.0,
    "cat": 0.85,
    "bug": 2.2,  # très aigu, petit insecte
    "fish": 0.55,  # grave, façon bulles
    "bird": 1.7,  # gazouillis
}


def envelope(i, n, attack=0.05, release=0.3):
    """Fondu d'entrée/sortie linéaire pour éviter les clics au début/fin."""
    t = i / n
    if t < attack:
        return t / attack
    if t > 1 - release:
        return (1 - t) / release
    return 1.0


def tone(freq, duration, wave_fn=math.sin, amplitude=0.4):
    n = int(RATE * duration)
    samples = []
    for i in range(n):
        t = i / RATE
        value = wave_fn(2 * math.pi * freq * t) * amplitude * envelope(i, n)
        samples.append(int(value * 32767))
    return samples


def sawtooth(phase):
    return 2 * ((phase / (2 * math.pi)) % 1) - 1


def chirp(freq_start, freq_end, duration, wave_fn=math.sin, amplitude=0.4):
    """Glissando linéaire freq_start -> freq_end."""
    n = int(RATE * duration)
    samples = []
    phase = 0.0
    for i in range(n):
        t = i / n
        freq = freq_start + (freq_end - freq_start) * t
        phase += 2 * math.pi * freq / RATE
        value = wave_fn(phase) * amplitude * envelope(i, n)
        samples.append(int(value * 32767))
    return samples


def concat(*parts):
    out = []
    for p in parts:
        out.extend(p)
    return out


def write_wav(path, samples):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(struct.pack(f"<{len(samples)}h", *samples))


SOUNDS = {
    # Petit chirp montant, agréable : caresse.
    "petted.wav": lambda p: chirp(500 * p, 900 * p, 0.15),
    # Deux petits chirps montants rapprochés : double-clic.
    "tickled.wav": lambda p: concat(chirp(600 * p, 1000 * p, 0.08), chirp(600 * p, 1000 * p, 0.08)),
    # Buzz grave descendant, dents de scie : agacement.
    "annoyed.wav": lambda p: chirp(300 * p, 150 * p, 0.25, wave_fn=sawtooth, amplitude=0.3),
    # Bip court et doux : remarqué.
    "noticed.wav": lambda p: tone(700 * p, 0.1, amplitude=0.3),
    # Chirp montant bref et aigu : sursaut (nouvelle fenêtre).
    "startled.wav": lambda p: chirp(700 * p, 1400 * p, 0.1, amplitude=0.45),
    # Deux notes amicales, la seconde plus haute : salutation entre critters.
    "greeted.wav": lambda p: concat(tone(600 * p, 0.08, amplitude=0.35), tone(800 * p, 0.1, amplitude=0.35)),
}


def main():
    requested = sys.argv[1:] or list(SPECIES_PITCH)
    unknown = [s for s in requested if s not in SPECIES_PITCH]
    if unknown:
        sys.exit(f"espèce(s) inconnue(s) : {', '.join(unknown)} (connues : {', '.join(SPECIES_PITCH)})")
    for species in requested:
        out_dir = PACKS_DIR / species / "sounds"
        for filename, gen in SOUNDS.items():
            write_wav(out_dir / filename, gen(SPECIES_PITCH[species]))
            print(f"==> {out_dir / filename}")


if __name__ == "__main__":
    main()
