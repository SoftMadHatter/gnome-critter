#!/usr/bin/env python3
"""Génère des bips *placeholder* pour les réactions de packs/critter-demo/.

Pas des sons définitifs : juste de quoi entendre une différence entre
réactions tout de suite. Aucune dépendance externe (module stdlib `wave`
uniquement, PCM 16 bits écrit directement).

Usage : python3 scripts/gen_placeholder_sounds.py
"""

import math
import struct
import wave
from pathlib import Path

RATE = 44100
OUT_DIR = Path(__file__).resolve().parent.parent / "packs" / "critter-demo" / "sounds"


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
    "petted.wav": lambda: chirp(500, 900, 0.15),
    # Deux petits chirps montants rapprochés : double-clic.
    "tickled.wav": lambda: concat(chirp(600, 1000, 0.08), chirp(600, 1000, 0.08)),
    # Buzz grave descendant, dents de scie : agacement.
    "annoyed.wav": lambda: chirp(300, 150, 0.25, wave_fn=sawtooth, amplitude=0.3),
    # Bip court et doux : remarqué.
    "noticed.wav": lambda: tone(700, 0.1, amplitude=0.3),
    # Chirp montant bref et aigu : sursaut (nouvelle fenêtre).
    "startled.wav": lambda: chirp(700, 1400, 0.1, amplitude=0.45),
}


def main():
    for filename, gen in SOUNDS.items():
        write_wav(OUT_DIR / filename, gen())
        print(f"==> {OUT_DIR / filename}")


if __name__ == "__main__":
    main()
