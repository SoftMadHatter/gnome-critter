# GNOME Critter

A pixel-art desktop pet for GNOME Shell: a small animal that lives on your
desktop, walks the ground, climbs window edges and walls, or flies and
swims depending on the species, and reacts to what you're doing.

**[Get it on GNOME Extensions — soon](https://extensions.gnome.org)**
*(not published yet — this link will point to the actual extension page
once the review is accepted; see the [publishing checklist](docs/publishing.md).)*

## What it is

Critter runs as a normal GNOME Shell extension: no separate daemon, no
network access. It spawns one or more animals that wander your desktop
using the real screen and window layout as their world — the bottom of
each monitor is the ground, window title bars are ledges, and species that
can climb or fly use walls and ceilings too. You can feed it, play with it,
pet it, or just leave it alone and watch it live its own life.

The code is split in two so the core logic could be extracted later (to a
separate daemon, another runtime) without a rewrite:

```
core/        pure JS logic, ZERO GJS/Clutter/Meta/St dependency. State,
             physics, behaviour choices. Tested with node --test.
extension/   GNOME Shell layer: reads desktop state (windows, monitors,
             pointer), draws sprites, handles click/drag.
packs/       per-species data (see docs/pack-format.md): sprites + JSON,
             no code.
scripts/     placeholder sprite generation, build/packaging.
tests/       tests for core/ (node --test).
LICENSE      GNU GPL version 3 (see "License" below).
```

## Species

Five packs ship today, each with its own sprites, sounds and set of
surfaces it can use:

| Species | Can use |
|---|---|
| Cat | ground, walls, ceiling |
| Bug | ground, walls, ceiling |
| Bird | ground, air |
| Fish | water only |
| Critter (demo) | everything — the placeholder species used for development |

Adding a new species is just a folder (sprites, sounds and a `pack.json`
describing its behaviour); see [`docs/pack-format.md`](docs/pack-format.md).

## How it works

- **Needs & mood.** Each animal has gauges — satiety, energy, cleanliness,
  stimulation, affection, relief, health — that drain over real time and
  drive its behaviour. Full model: [`docs/needs.md`](docs/needs.md).
- **Life & growth.** It hatches from an egg, grows through stages (baby,
  young, adult, senior), gets a personality and a color rolled at birth,
  and evolves with the care it receives. It can hibernate if neglected for
  too long, but it never dies. Details: [`docs/life.md`](docs/life.md).
- **Autonomy.** Depending on a setting, an animal can cover part of its own
  needs — hunting prey, foraging plants, eating from its bowl — instead of
  depending entirely on you. See [`docs/autonomy.md`](docs/autonomy.md).
- **Awareness of you.** It reacts to the time of day, whether you're around
  or idle, and desktop events like a new window or a notification.
  Nothing is ever read or stored: a notification is only ever "there was
  one" (no title, no text, no app), a keystroke is only "a key was
  pressed" (never which one). Details: [`docs/rhythm.md`](docs/rhythm.md).
- **Progression.** Dozens of tracked stats, a couple hundred achievements
  per species, coins, and a journal of what happened. See
  [`docs/progression.md`](docs/progression.md).
- **Translations.** French is the source language, English ships today,
  built on standard GNOME gettext tooling. See
  [`docs/i18n.md`](docs/i18n.md).

## Try it (GNOME 48+, Wayland)

Prerequisites:

- `zip`;
- `glib-compile-schemas` (package `libglib2.0-bin` on Debian/Ubuntu,
  `glib2-devel` on Fedora);
- `msgfmt` (package `gettext`) to compile translations; without it the
  extension falls back to French;
- Python 3 and Pillow, only needed to regenerate the placeholder sprites.

```bash
# 1. Build and install as a dev symlink (iterate with another
#    `build.sh --link` after each change, no manual reinstall needed)
./scripts/build.sh --link

# 2. Reload GNOME Shell
#    - X11: Alt+F2, type "r", Enter
#    - Wayland: log out / log back in (no hot reload) — or, to iterate
#      without logging out, `scripts/dev.sh` (see docs/dev-workflow.md)

# 3. Enable the extension
gnome-extensions enable gnome-critter@beedi.xyz

# 4. Logs if something goes wrong
journalctl -f -o cat /usr/bin/gnome-shell
```

If nothing shows up, check the logs first — a `pack.json` or spritesheet
loading error is the most likely culprit on a first run.

### Iterating quickly on Wayland

`Alt+F2, r` only works on X11. On Wayland, `scripts/dev.sh` launches a
disposable nested GNOME Shell session (build + link + auto-enable inside
it) that you can close and relaunch in seconds instead of logging out:

```bash
scripts/dev.sh
```

Details and limitations of the nested session:
[`docs/dev-workflow.md`](docs/dev-workflow.md).

## Running the tests

```bash
npm test
```

## Regenerating the placeholder sprites

```bash
python3 scripts/gen_placeholder_sprites.py
```

## Contributing

Issues and pull requests: <https://github.com/SoftMadHatter/gnome-critter>.

Internal identifiers (GSettings schema, gettext domain, log prefix) keep
the project's short name, `gnome-critter`/`Critter`. Extension logs can be
filtered with:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep Critter
```

## Built with AI

This project was built with the help of an AI coding assistant (Claude
Code) — both as a real development tool for the day-to-day work, and
deliberately, as a way for the author to evaluate what an AI assistant can
actually do on a real, non-trivial project over time, not just on toy
examples.

## License

Copyright © 2026 mad

This program is free software: you can redistribute it and/or modify it
under the terms of the GNU General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option)
any later version (`GPL-3.0-or-later`). The full text is in
[`LICENSE`](LICENSE).

This program is distributed in the hope that it will be useful, but
**without any warranty**; without even the implied warranty of
merchantability or fitness for a particular purpose.

Sprites and sounds for packs, items, accessories and speech bubbles are
generated by this repository's own scripts (`scripts/gen_*.py`) and are
distributed under the same license.
