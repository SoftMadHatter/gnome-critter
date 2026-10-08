# Development loop (Wayland)

## The problem

On X11, GNOME Shell can be reloaded live with `Alt+F2`, `r`, Enter. **This
shortcut doesn't exist on Wayland**: the Wayland compositor can't replace
itself in place. The only "official" way to start from a clean Shell is to
log out/log back in — far too heavy to iterate on an extension.

Two things to distinguish:

- **Enabling/disabling** an extension (`gnome-extensions enable|disable`)
  never requires restarting the Shell, on either display session. That's
  enough to test a change in `packs/` (spritesheets, `pack.json`) or
  `schemas/`.
- **Changing JS code** (`extension.js`, `lib/*.js`, `prefs.js`) isn't
  enough with a simple disable/enable: since GNOME 45, extensions are
  loaded as native ES modules, cached by GJS once imported. Nothing forces
  GJS to re-read the file from disk — a **new `gnome-shell` process** is
  needed for the new code to take effect.

## The solution: a nested GNOME Shell session

`gnome-shell --devkit --wayland` launches a full Shell in a window instead
of taking control of the display, on its own D-Bus bus (via
`dbus-run-session`). It's a disposable Shell:

> Historically this mode was enabled with an explicit `--nested` flag,
> removed starting with GNOME Shell 49/50 (see `gnome-shell --help`).
> `--wayland` alone (without `--devkit`) was **tested and fails** on GNOME
> 50 with `Failed to take control of the session: GDBus.Error:System.Error.EBUSY:
> Device or resource busy`: the child process, launched from a terminal of
> the real session, belongs to the same logind session as the real Shell
> (`loginctl session-status` confirms it) and tries to take control of it
> while the real Shell already holds it — only one controller is allowed per
> logind session.
>
> `--devkit` (GNOME 48+, "development kit", designed precisely to test
> extensions without leaving your session) avoids this conflict: the logs
> show `Will monitor session 8` instead of a control-taking attempt. A
> `Failed to launch devkit: ... mutter-devkit ... No such file or directory`
> warning may appear if the optional `mutter-devkit` package isn't
> installed — harmless, the nested Shell still starts normally.

- it runs as a child process, isolated from the real session (its own D-Bus
  bus) — a crash or a `disable`/`enable` inside it never affects the real
  Shell or other extensions active on the real desktop;
- to start fresh after a JS code change, just close the window (or `Ctrl+C`
  in the terminal that launched it) and rerun the command — a few seconds,
  no logout needed;
- GSettings settings (`enabled-extensions`, the extension's own settings
  like `critter-mix`) are stored in dconf, which is shared between both
  sessions: no need to reconfigure everything on every launch.

## Usage

```bash
scripts/dev.sh
```

This script:

1. rebuilds the extension and updates the dev symlink (`scripts/build.sh
   --link`, as documented in `README.md`);
2. launches the nested session on a dedicated D-Bus bus;
3. automatically enables the extension there (`gnome-extensions enable`, run
   on that same bus) as soon as the nested Shell is ready.

To iterate:

- change to `packs/`, `schemas/`, or anything that doesn't touch a `.js`
  file → `gnome-extensions disable gnome-critter@beedi.xyz &&
  gnome-extensions enable gnome-critter@beedi.xyz` **in the nested
  session's terminal** (or on the real desktop if that's where you're
  testing) is enough, no need to rerun `dev.sh`;
- change to `extension.js` / `lib/*.js` / `prefs.js` → close the nested
  window (`Ctrl+C`) and rerun `scripts/dev.sh` (or `scripts/dev.sh
  --no-build` if you've already rebuilt elsewhere).

`--no-build` skips the rebuild step (useful if the symlink already points to
an up-to-date `dist/`).

`--lang en` launches the nested session in another language (`LANGUAGE`),
without touching the real session: menus, notifications, progression
window, preferences, and given names in English. Translations and tooling:
`docs/i18n.md`.

## Logs

In a separate terminal, while the nested session is running:

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

The extension's JS errors (exceptions in `enable()`, `loadPack()`, etc.)
appear there with their stack trace.

## Limits of the nested session

- No full GPU acceleration in some environments (VM, proprietary drivers)
  → can be slower/choppier than the real session, unrelated to any
  extension bug.
- Some portals (screenshots, file selection) may behave differently or be
  unavailable.
- If `dbus-run-session` isn't installed: the `dbus` package (Fedora) or
  `dbus-user-session` (Debian/Ubuntu).

To validate behavior that depends heavily on the real environment (several
physical monitors, real multi-window setups), retest occasionally in the
real session (a classic logout/login).

## State saving

Critters' positions are saved in the hidden `saved-state` GSettings key
(every 30 s and on disable). To inspect it or start fresh:

```bash
SCHEMAS=dist/gnome-critter@beedi.xyz/schemas
gsettings --schemadir "$SCHEMAS" get org.gnome.shell.extensions.gnome-critter saved-state
gsettings --schemadir "$SCHEMAS" reset org.gnome.shell.extensions.gnome-critter saved-state
```

## Live settings

Every setting in the "Settings…" window (icon menu) applies without
reloading the extension. To test them: `gsettings --schemadir
dist/gnome-critter@beedi.xyz/schemas set org.gnome.shell.extensions.gnome-critter
critter-mix '[{"pack":"cat","count":2},{"pack":"bird","count":1}]'` makes
two cats and a bird appear right away.

## Review tool (achievements, titles, rewards, creatures, objects)

A local page to review the game's content the way the engine
computes it, without launching GNOME Shell (read-only, except the
**Anchors** tab, which writes a pack's `anchors` section):

```bash
scripts/review.sh --open        # http://127.0.0.1:8765/ ; --port N for another port
```

The mini server (`tools/review/server.mjs`, Node, no dependencies) only
listens on 127.0.0.1, only answers reads (GET) — plus `POST /api/anchors/<pack>`, which rewrites
only the `"anchors"` block of `packs/<pack>/pack.json` (local page only) — and only serves `core/`,
`packs/`, `po/`, `extension/lib/`, `extension/assets/`, and `tools/review/`.
The page loads the core modules directly (`buildAchievements`,
`achievementView`, the Committee, the loot boxes, `shiftPixels`…): what it
shows is exactly what the game computes. When a file changes, it reloads
itself while keeping the tab and filters (in the address): fix it in your
editor, check it in the page. `tools/` isn't copied by `scripts/build.sh`:
none of it ships with the extension.

The header's language choice (French, English; `&lang=en` in the address)
shows the game's text as translated by `po/<language>.po` and the pack's
`translations` section. The tool's own interface stays in French (see
`docs/i18n.md`).

Tabs:

- **Achievements**: every achievement of a species, filterable by
  temperament, section, type (real, blunders, playful) or text; condition,
  reward, title, requirements, the Committee's comment, origin (library,
  pack, overridden by the pack). "Copy" copies the source template as JSON
  to add a new one.
- **In-game view**: set counters and markers (presets: new critter, one
  month of life, everything unlocked; also in the address with
  `&preset=all`); the progression window displays exactly as the player
  sees it, with the Committee's announcements. The scenario is kept per
  pack in the browser.
- **Titles**: every title, the achievement that grants it, its condition,
  the warnings.
- **Rewards**: loot box contents and odds, a simulation of 1,000 openings,
  coin budget per section, trophies and jokes.
- **The Committee**: announcements for an achievement (several draws),
  streaks, trophy, opening and closing lines, comments sorted by length.
- **Creatures**: the pack's sheet, an animation player (stage, speed, size,
  smoothing, flipping, colors, accessory, following the head frame by frame), a sheet of every
  animation for a stage.
- **Anchors**: shows where the head is, frame by frame (dashed gray circle:
  the point generated by `scripts/gen_species_sprites.py`, for every stage)
  and lets you touch it up (red circle). Pick an animation or reaction,
  click the head on a frame to touch it up (←/→ to move between frames;
  "next after click" advances by itself), copy a point to every frame,
  hide a frame, flip to 180° for an upside-down head, or go back to the
  generated point (one frame or the whole animation). Four witness
  accessories (crown, glasses, medal, bow; or any single one) show the
  result next to an animated preview. The pack settings tune the head
  width (adult and each stage; one animation can also have its own), the
  view of the drawing (front or profile: glasses change) and
  the top, face and neck slots; the "Accessories" table tunes, for each
  accessory, its slot, width, shift and anchor point (only differences
  from the code's defaults are written, bold in the table). The draft stays in the
  browser until "Save to pack.json" rewrites only the `anchors` block (the
  diff shows in git): the generated sections are carried through, and a
  touch-up equal to the generated points is not written. After redrawing
  accessory images, run `python3 scripts/gen_accessory_metrics.py`.
- **Objects**: every sprite in the catalog, at display size and double.
- **Checks**: structural errors (the rules from `tests/packs.test.js`) and
  text to review (typography, duplicates, lengths, gendered titles,
  identical tier descriptions); their count shows on the tab. Outside of
  French, these are added:
  - catalog checks: missing translations, placeholders, text identical to
    the French;
  - checks on each pack's `translations` section.

Limits: no writing but the anchors (other fixes are made in the editor); it's not GNOME Shell's
actual rendering (menus, notifications, HiDPI, Clutter filters): sprites
are replayed in a browser canvas. For a headless capture (`chromium
--headless`), add `?noreload` to the address: without it, the reload stream
keeps the page open.

## Checking a release

`scripts/check-release.sh` builds the archive (`dist/<uuid>.shell-extension.zip`)
and runs the checks that can be automated before uploading to
extensions.gnome.org: `metadata.json` (real `url`, no `version`, `version-name`
of 1 to 16 characters, stable `shell-version`), the archive's contents (required
files, no `gschemas.compiled`, `.po`, script or binary; size), the code
(no `Mainloop`, `Lang`, `ByteArray` or `imports.`; no Shell library in
`prefs.js`; no Gtk/Gdk in the Shell's process) and `npm test`
(`--no-tests` skips it). `gschemas.compiled` stays in `dist/<uuid>/` for the
dev symlink but is left out of the archive.

## Image weight

Sprites are the bulk of the archive, so the generators save them as palette
PNGs (128 colors with per-color transparency, from libimagequant, which ships
with Pillow) through `scripts/pngsave.py`: about 40 % of the RGBA size, with no
visible difference. To optimize files drawn by hand or by another tool, run
`python3 scripts/pngsave.py [file-or-folder ...]` (default: `packs/` and
`extension/assets/`); it skips what is already optimized. An image with no
transparent pixel stays RGBA on purpose: GdkPixbuf loads an opaque palette
image without an alpha channel, and the extension's color variants need one.

## Simulating the critters without the Shell

`core/` is pure, so the Manager's loop can be replayed headless:

```bash
node tools/simulate-surfaces.mjs [--minutes 20] [--seeds 3] [--species cat,bird]
```

It runs each species on several screen layouts (one screen, a laptop offset
under an external screen, screens of different sizes, windows maximized below
the top bar or flush with the top of the screen) and prints, per species and
layout, the rescues (a critter found outside every screen and put back at the
top) grouped by zone and state, and the episodes where it turns around every
tick on the spot. Runs are seeded, so before and after a change compare.
