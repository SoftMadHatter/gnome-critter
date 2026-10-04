#!/usr/bin/env python3
"""Generates the species packs' reaction sounds: one 8-bit "voice" per
species (meow and purr for the cat, chirps for the bird, bubbles for the
fish, buzzing for the insect), for the six base reactions every pack
wires up (petted, startled, annoyed, noticed, greeted, tickled).

Also the event sounds: hatching and growing (copied into every species'
`sounds/`, the packs point to them) and the sounds the extension plays on
its own for an achievement, a coin and a blunder (`extension/assets/sounds/`).

Pure synthesis, no sample and no dependency (stdlib only): square,
triangle, sawtooth, sine and noise (a linear-feedback shift register, like
the sound chips of old consoles), mixed down to 22.05 kHz, 8-bit mono and
quantized to 6 bits. The files keep the names the packs already point to,
so `pack.json` doesn't change.

`critter-demo`'s sounds still come from gen_placeholder_sounds.py.

Usage: python3 scripts/gen_species_sounds.py [species ...]
       (all by default: cat, bird, fish, bug)
"""

import io
import math
import sys
import wave
from pathlib import Path

RATE = 22050
TAU = 2 * math.pi
QUANT_BITS = 6
PEAK = 0.5  # square waves are loud: keep well below full scale
ROOT_DIR = Path(__file__).resolve().parent.parent
PACKS_DIR = ROOT_DIR / "packs"
EVENT_SOUNDS_DIR = ROOT_DIR / "extension" / "assets" / "sounds"
_NOTES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
ATTACK_S = 0.002
RELEASE_S = 0.004


def note(name):
    """'C#5' -> frequency in Hz."""
    accidental = 1 if "#" in name else 0
    return 440 * 2 ** ((12 * (int(name[-1]) + 1) + _NOTES[name[0]] + accidental - 69) / 12)


def tone(f0, f1=None, dur=0.1, wave_="square", duty=0.5, vol=1.0, env="decay", vib=None, trem=None):
    """One note, optionally sliding from `f0` to `f1` Hz (exponentially).

    `wave_`: square (with `duty`), tri, saw, sine, noise (15-bit register) or
    noise_s (7-bit register, a more metallic hiss; the noise "frequency" is the
    register's clock). `env`: flat, decay, pluck, fade or swell. `vib` is
    (rate Hz, depth as a fraction of the frequency), `trem` (rate Hz, depth 0-1).
    """
    f1 = f0 if f1 is None else f1
    n = max(1, int(dur * RATE))
    out = []
    phase = 0.0
    lfsr = 0x7FFF
    clock = 0.0
    held = 1.0
    attack = int(ATTACK_S * RATE)
    release = int(RELEASE_S * RATE)
    for i in range(n):
        t = i / n
        f = f0 * (f1 / f0) ** t
        if vib:
            f *= 1 + vib[1] * math.sin(TAU * vib[0] * i / RATE)
        if wave_ in ("noise", "noise_s"):
            clock += f / RATE
            if clock >= 1:
                clock -= 1
                bit = (lfsr ^ (lfsr >> 1)) & 1
                lfsr = (lfsr >> 1) | (bit << (14 if wave_ == "noise" else 6))
                if wave_ == "noise_s":
                    lfsr = (lfsr & 0x7F) or 0x7F
                held = 1.0 if lfsr & 1 else -1.0
            s = held
        else:
            phase = (phase + f / RATE) % 1.0
            if wave_ == "square":
                s = 1.0 if phase < duty else -1.0
            elif wave_ == "tri":
                s = 4 * abs(phase - 0.5) - 1
            elif wave_ == "saw":
                s = 2 * phase - 1
            else:
                s = math.sin(TAU * phase)
        a = {
            "flat": 1.0,
            "decay": math.exp(-3.5 * t),
            "pluck": math.exp(-8 * t),
            "fade": 1 - t,
            "swell": math.sin(math.pi * t),
        }[env]
        if i < attack:
            a *= i / attack
        if n - i < release:
            a *= (n - i) / release
        if trem:
            a *= 1 - trem[1] * (0.5 + 0.5 * math.sin(TAU * trem[0] * i / RATE))
        out.append(s * a * vol)
    return out


def rest(dur):
    return [0.0] * int(dur * RATE)


def cat(*parts):
    out = []
    for p in parts:
        out.extend(p)
    return out


def mix(*tracks):
    n = max(len(t) for t in tracks)
    return [sum(t[i] for t in tracks if i < len(t)) for i in range(n)]


def to_wav(samples):
    """Normalizes, quantizes and encodes as 8-bit unsigned mono PCM."""
    peak = max(1e-9, max(abs(v) for v in samples))
    levels = 2 ** QUANT_BITS / 2
    frames = bytearray()
    for v in samples:
        q = round(v / peak * PEAK * levels) / levels
        frames.append(max(0, min(255, round(128 + 127 * q))))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(1)
        w.setframerate(RATE)
        w.writeframes(bytes(frames))
    return buf.getvalue()


# --- Cat: meow (a square pulse sliding up then down) and purr (a low rumble). ---


def meow(f0=520, peak=900, end=560, dur=0.36, vol=1.0):
    up = tone(f0, peak, dur * 0.35, "square", 0.25, env="flat", vol=vol)
    down = tone(peak, end, dur * 0.65, "square", 0.25, env="fade", vol=vol, vib=(18, 0.03))
    return cat(up, down)


def purr(dur=0.4):
    return mix(
        tone(70, None, dur, "tri", env="flat", trem=(24, 0.8), vol=0.9),
        tone(120, None, dur, "noise_s", env="flat", trem=(24, 0.9), vol=0.2),
    )


def cat_voice():
    return {
        "petted": mix(purr(0.5), cat(rest(0.1), meow(600, 800, 700, 0.25, 0.5))),
        "startled": cat(
            mix(tone(5500, 2500, 0.12, "noise", vol=0.7, env="pluck"), tone(1500, 2200, 0.1, "square", 0.25)),
            meow(900, 1300, 800, 0.18),
        ),
        "annoyed": mix(
            tone(150, 110, 0.4, "saw", env="fade", trem=(30, 0.6)),
            tone(300, None, 0.4, "noise", vol=0.3, env="fade", trem=(30, 0.6)),
        ),
        "noticed": tone(480, 820, 0.09, "square", 0.25, env="flat"),
        "greeted": cat(meow(520, 880, 640, 0.18), rest(0.04), meow(560, 960, 700, 0.2)),
        "tickled": cat(*[meow(700 + 60 * (i % 2), 1000, 800, 0.08, 0.9) + rest(0.02) for i in range(4)]),
    }


# --- Bird: short triangle chirps, high and fast. ---


def chirp(a, b, dur=0.06):
    return tone(a, b, dur, "tri", env="flat")


def bird_voice():
    return {
        "petted": cat(*[chirp(3000, 3300, 0.025) + chirp(3300, 3000, 0.025) for _ in range(6)]),
        "startled": cat(chirp(2500, 4200, 0.05), rest(0.02), chirp(2600, 4400, 0.05), rest(0.02), chirp(2700, 4600, 0.07)),
        "annoyed": mix(
            tone(1400, 700, 0.3, "saw", env="fade", vol=0.8),
            tone(900, None, 0.3, "noise", vol=0.25, env="fade"),
        ),
        "noticed": chirp(2400, 3600, 0.08),
        "greeted": cat(
            chirp(2800, 3800, 0.06), rest(0.03), chirp(2800, 3800, 0.06), rest(0.03), chirp(3800, 2600, 0.04), chirp(2600, 4200, 0.07)
        ),
        "tickled": tone(3200, None, 0.34, "tri", env="flat", vib=(28, 0.18)),
    }


# --- Fish: bubbles, short sine glissandos. ---


def bubble(f0=300, f1=900, dur=0.07, vol=1.0):
    return tone(f0, f1, dur, "sine", env="pluck", vol=vol)


def fish_voice():
    return {
        "petted": cat(bubble(260, 620, 0.1, 0.8), rest(0.08), bubble(300, 700, 0.12, 0.7)),
        "startled": mix(bubble(200, 1400, 0.16), tone(3000, 500, 0.12, "noise", vol=0.35, env="pluck")),
        "annoyed": tone(420, 130, 0.3, "sine", env="fade", vib=(14, 0.06)),
        "noticed": bubble(350, 900, 0.07),
        "greeted": cat(bubble(280, 600), rest(0.03), bubble(340, 760), rest(0.03), bubble(420, 980, 0.1)),
        "tickled": cat(*[bubble(300 + 40 * (i % 3), 800, 0.04, 0.8) + rest(0.015) for i in range(8)]),
    }


# --- Insect: buzzing (a sawtooth with fast amplitude modulation) and clicks. ---


def buzz(f, dur, rate=60, depth=0.9, vol=1.0, f1=None, env="flat"):
    return tone(f, f1, dur, "saw", 0.5, env=env, trem=(rate, depth), vol=vol)


def bug_voice():
    return {
        "petted": buzz(210, 0.4, 40, 0.5, 0.7, 240, "swell"),
        "startled": mix(buzz(220, 0.22, 90, 0.8, 1.0, 900, "pluck"), tone(5000, 1500, 0.1, "noise", vol=0.3, env="pluck")),
        "annoyed": buzz(120, 0.45, 70, 0.9, 1.0, 100, "fade"),
        "noticed": cat(buzz(320, 0.05, 100), rest(0.04), buzz(320, 0.05, 100)),
        "greeted": buzz(250, 0.3, 50, 0.6, 0.9, 520, "swell"),
        "tickled": cat(*[tone(4200, None, 0.03, "square", 0.5, env="flat", vol=0.7) + rest(0.025) for _ in range(7)]),
    }


# --- Events: the same square-wave voice for every species. ---


def pulse(name, dur=0.08, duty=0.25, **kwargs):
    return tone(note(name), None, dur, "square", duty, **kwargs)


def event_hatched():
    cracks = cat(*[tone(2500 + 300 * i, None, 0.02, "noise", vol=0.9, env="pluck") + rest(0.07) for i in range(3)])
    return mix(cracks, cat(rest(0.3), tone(note("C5"), note("C6"), 0.25, "square", 0.5, env="swell")))


def event_grew():
    return cat(*[pulse(n) for n in ("C5", "D5", "E5", "G5", "C6")], pulse("E6", 0.2, env="fade"))


def event_achievement():
    fanfare = [pulse(n, 0.09, 0.5) for n in ("C5", "E5", "G5", "C6")]
    return cat(*fanfare, rest(0.04), pulse("G5", 0.07, 0.5), pulse("C6", 0.3, 0.5, vib=(7, 0.01)))


def event_coin():
    return cat(pulse("B5", 0.07, 0.5, env="flat"), pulse("E6", 0.3, 0.5, env="fade"))


def event_blunder():
    sagging = [tone(note(n), note(n) * 0.97, 0.2, "square", 0.5, env="flat", vib=(6, 0.03)) for n in ("A3", "G#3", "G3")]
    return cat(*sagging, tone(note("F#3"), note("F#3") * 0.85, 0.45, "square", 0.5, env="fade", vib=(7, 0.05)))


PACK_EVENTS = {"hatched": event_hatched, "grew": event_grew}
EXTENSION_EVENTS = {"achievement": event_achievement, "coin": event_coin, "blunder": event_blunder}

VOICES = {"cat": cat_voice, "bird": bird_voice, "fish": fish_voice, "bug": bug_voice}


def main():
    requested = sys.argv[1:] or list(VOICES)
    unknown = [s for s in requested if s not in VOICES]
    if unknown:
        sys.exit(f"unknown species: {', '.join(unknown)} (known: {', '.join(VOICES)})")
    pack_events = {name: to_wav(make()) for name, make in PACK_EVENTS.items()}
    for species in requested:
        out_dir = PACKS_DIR / species / "sounds"
        out_dir.mkdir(parents=True, exist_ok=True)
        sounds = {reaction: to_wav(samples) for reaction, samples in VOICES[species]().items()}
        for name, data in {**sounds, **pack_events}.items():
            path = out_dir / f"{name}.wav"
            path.write_bytes(data)
            print(f"==> {path}")
    if not sys.argv[1:]:  # the extension's own sounds belong to no pack
        EVENT_SOUNDS_DIR.mkdir(parents=True, exist_ok=True)
        for name, make in EXTENSION_EVENTS.items():
            path = EVENT_SOUNDS_DIR / f"{name}.wav"
            path.write_bytes(to_wav(make()))
            print(f"==> {path}")


if __name__ == "__main__":
    main()
