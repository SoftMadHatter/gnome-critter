# Animal pack format

A pack describes a species: its sprites, its animations, what it can do
(walk on the ground, climb walls, walk on the ceiling, swim, fly), and a few
behavior parameters. Goal: add a new critter without touching the code, by
providing only a folder.

## Layout of a pack

```
packs/<species-id>/
  pack.json
  sprites/
    walk.png       # spritesheet, one row of frames per animation
    idle.png
    fall.png
    sleep.png
    ...
```

## `pack.json`

```jsonc
{
  "id": "critter-demo",
  "displayName": "Critter (démo)",
  "version": "0.1.0",
  "author": "you",

  // What surfaces the species can use. Possible values:
  // "ground" (floor + window ledges), "wall", "ceiling", "water", "air".
  "supportedSurfaces": ["ground"],

  // Display size on screen, in logical pixels (before HiDPI scaling).
  // Free choice: the insect (packs/bug) uses 16x16.
  "spriteSize": { "width": 32, "height": 32 },
  // Optional (default false): sheets finer than spriteSize, smoothed
  // downscaling instead of nearest-neighbor.
  "smooth": true,

  // Speeds in px/s, used as-is by core/critter.js.
  "speeds": {
    "walk": 40,
    "climb": 30,
    "swim": 25,
    "fly": 60
  },

  // Optional: overrides the species' temperament. Any DEFAULT_CONFIG key
  // (core/critter.js) of type number or [min, max] range is accepted:
  // idle activity weights (sleepWeight, washWeight, followWeight,
  // greetWeight, climbSeekWeight, seekFocusWeight, flyWeight, swimWeight…),
  // durations (idleDuration, sleepDuration, flyDuration…), swim undulation
  // (swimWaveAmplitude, swimWaveFrequency), etc. Other keys are ignored
  // with a warning in the GNOME Shell log. The "speeds" values keep
  // priority.
  "behavior": {
    "sleepWeight": 15,
    "idleDuration": [1, 3]
  },

  // One entry per core state (see core/critter.js State). "frameDuration"
  // is in seconds. "loop" says whether the animation loops or freezes on
  // the last frame (useful for a short transition).
  "animations": {
    "idle":   { "file": "sprites/idle.png",  "frames": 4, "frameDuration": 0.5, "loop": true },
    "walk":   { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "fall":   { "file": "sprites/fall.png",  "frames": 2, "frameDuration": 0.15, "loop": true },
    "drag":   { "file": "sprites/fall.png",  "frames": 1, "frameDuration": 1,   "loop": false },
    "sleep":  { "file": "sprites/sleep.png", "frames": 2, "frameDuration": 0.8, "loop": true },
    "climb":  { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "ceiling":{ "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "swim":   { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.2, "loop": true },
    "fly":    { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.1, "loop": true },
    "follow": { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "wash":   { "file": "sprites/sleep.png", "frames": 2, "frameDuration": 0.5, "loop": true },
    "greet":  { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "seekWall": { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "seekFocus": { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "chase":    { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "flee":     { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "seekNap":  { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "run":      { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.06, "loop": true },
    "swimFast": { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.1,  "loop": true },
    "flyFast":  { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.05, "loop": true },
    "dive":     { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.1,  "loop": true },
    "eat":      { "file": "sprites/idle.png",  "frames": 4, "frameDuration": 0.15, "loop": true },
    "seekFood": { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.1,  "loop": true },
    "play":     { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.08, "loop": true },
    "brushed":  { "file": "sprites/sleep.png", "frames": 2, "frameDuration": 0.5,  "loop": true },
    "remind":   { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.08, "loop": true },
    "hunt":     { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.06, "loop": true }
  },
  // A state with no entry silently falls back to "idle" (backward
  // compatible: nothing to do to benefit from a new state added to
  // core/critter.js), except the fast gaits, which fall back to their
  // normal gait first: "run" and "seekFood" -> "walk", "swimFast" ->
  // "swim", "flyFast" and "dive" -> "fly", "eat" -> "idle", "play" ->
  // "run" then "walk", "brushed" -> "wash" then "idle", "remind" ->
  // "follow" then "walk", "hunt" -> "run" then "walk".

  // Short reactions played over the current animation, triggered by core
  // events (see Critter#lastEvent: "petted", "tickled", "annoyed",
  // "noticed", "startled" (new window), "greeted" (reached another
  // critter in the GREET state), "purring" (3rd pet of a streak),
  // "brushed" (end of brushing), "played" (end of a play session), "ate",
  // "grabbed", "released", "landed", "sleep", "wash", ...).
  // "sound" is optional: a path relative to the pack to a .wav/.ogg
  // played once when triggered (nothing happens if it's absent or the
  // user has disabled sounds in the extension's preferences).
  "reactions": {
    "petted": {
      "file": "sprites/idle.png",
      "frames": 1,
      "frameDuration": 0.6,
      "sound": "sounds/petted.wav"
    }
  }
}
```

## Needs (`needs`)

Optional section to set how fast each need drops (`decayPerHour`, per
gauge: `satiety`, `energy`, `cleanliness`, `stimulation`, `affection`). See
`docs/needs.md`.

```jsonc
"needs": {
  "decayPerHour": { "energy": 3, "cleanliness": 2 },
  "diet": { "fish": 60, "meat": 45, "kibble": 30 }
}
```

`diet`: foods the species eats (`meat`, `fish`, `pate`, `kibble`, `seeds`,
`mealworms`, `apple`, and the floating `plankton`, `flakes`) and plants it
nibbles (`grass`, `berries`, `leaf`, `algae`), with each one's satiety
gain; a missing food is ignored. `prey`: prey it hunts (`mouse`, `beetle`,
`aphid`, `krill`) and the satiety gain per prey (see `docs/autonomy.md`).

## Appearance and stages (`appearance`, `stages`)

Optional sections described in `docs/life.md`: hue range and gray
colorization (`appearance`), display scale and per-stage sheet folder
(`stages`, e.g. `"baby": { "folder": "sprites/baby" }`). Optional `egg`
(4 frames) and `hibernate` animations; `hatched`, `grew`, `awakened`
reactions.

## Progression (`achievements`, `tricks`, `anchors`)

Optional sections described in `docs/progression.md`: the species'
achievements (templates that add to, replace, or remove entries from the
shared library), the species' tricks, the head anchor point for
accessories, then frame by frame for each animation and reaction, with the
head size and the top, face and neck slots (`anchors`, generated for the
species drawn by the script, see `docs/progression.md`). Optional animations `trick_sit`, `trick_roll`, `trick_flip`
(one per trick declared) and `gift`.

## Names (`names`)

Optional list of given names drawn at birth (at least 8, see
`docs/creatures.md`), in French. Without it, the game uses a generic list
in the session's language. Given names for other languages go in the
`translations` section.

## Translations (`translations`)

Optional section: the pack's text in other languages. The French in
`pack.json` stays the source, and any missing field falls back to it. The
game applies the section for the session's language when the pack loads
(see `docs/i18n.md`).

```jsonc
"translations": {
  "en": {                              // language code: 2 or 3 lowercase letters
    "displayName": "Cat",
    "names": ["Whiskers", "Mocha", "Cuddles", "Pixel", "Nougat", "Purrcy", "Tiger", "Luna"],
    "achievements": {
      // key: the `series` or `id` of an entry in the pack's "achievements"
      "hunts": {
        "names": ["First mouse", "Mouser", "Scourge of mice", "Rodents' nightmare"],
        "description": "Catch {n} mice",
        "title": "rodents' nightmare"
      },
      "cat-early-meal": { "name": "Alarm clock", "description": "Eat between 5 and 6 a.m.", "quip": "…" }
    }
  }
}
```

Fields of an achievement:

- text:
  - `name`;
  - `description`;
  - `quip` (the Committee's comment);
  - `title`;
- lists:
  - `names` (one per tier);
  - `descriptions`;
  - `quips`;
  - `rewardTexts` (texts of the rewards that have a `text`, in order).

Rules:

- A list must have the same length as the original, otherwise it's
  ignored. A `null` element keeps the French text.
- The French placeholders carry over into the translation: `{n}` (the
  tier), `{s}` ("s" beyond 1), which each language places wherever it
  fits.
- Only achievements **specific to the pack** are translated here. Those
  from the shared library go through the game's catalog (`po/`).
- A malformed key is ignored, with a warning in the GNOME Shell log. The
  review tool's Checks tab flags it too.
- For packs in the repo, `tests/i18n.test.js` requires a complete `en`
  section: name, given names (at least 8), every text of the pack's
  achievements.

## Spritesheet rule

Every referenced PNG file is a single row of `frames` square images with no
margin between frames. A cell's size is the PNG's height: it must be an
integer multiple of `spriteSize`. The cat/bug/fish/bird packs draw at 64x64
for a 32 px display (the insect at 16 px): they declare `"smooth": true`,
and the extension then downscales the sheet with a smooth filter (crisp on
HiDPI). Without `smooth` (the case for `critter-demo`, at 32x32), display
uses nearest-neighbor, with no blur. This is the simplest format to slice
on the extension side (one `Clutter.Image` per frame, generated once when
the pack loads then cached).

The sprite is drawn facing right by default; when `facing === -1`, the
rendering layer flips the image horizontally rather than duplicating the
frames.

## Flight

A species that can both walk on the ground and fly (bird, the demo pack)
picks, as soon as it takes off, a floor or window ledge to land on, flies
to it in a straight line, and lands: it never falls into free fall. It
changes target only very rarely (`flyRetargetChance`, a probability per
second) or if its target surface disappears or moves. `flyDuration`
therefore only applies to purely aerial species (see below).

Two extra behaviors: **fast flight** (`flyFastWeight`, `flyFastFactor`) and
the **dive**: on takeoff, with probability `flyCruiseChance`, the critter
first climbs to a cruising altitude, then while descending toward its
target it may dive (`diveChance` per second, target at least
`diveMinHeight` lower and at a steep angle, speed `diveSpeedFactor`). A
dive always ends with landing on the target.

## Fast gaits and swimming

`run` (`runWeight`, `runSpeedFactor`), `swimFast` (`swimFastWeight`,
`swimFastFactor`), and `flyFast` are the fast versions of walking,
swimming, and flying. A groundless species chains its sessions by drawing
a fast session with probability `fastChance`. Swimming redraws its target
every `swimRetargetDuration` seconds (5 to 10 by default), with a turn of
at most `swimTurnMax` degrees each time; the free flight of aerial species
keeps `roamRetargetDuration`.

## Groundless species

A species whose `supportedSurfaces` doesn't contain `"ground"` but does
contain `"water"` (or `"air"`) never lands: at the end of a swimming (or
flying) session it chains into another one, and if it falls (spawn, end of
a drag) it resumes roaming as soon as it touches the ground. This is the
case for the fish (`packs/fish`, `["water"]`).

## Checklist of states and reactions

A complete pack gives **every reachable state its own sheet** (no shared
sheet); `tests/packs.test.js` checks this for every pack except
`critter-demo`, which stays deliberately minimal to show the fallbacks.

- **Always**: `idle`, `fall`, `drag`, `hibernate`, `remind`, `gift`,
  `play`, `hunt`, `eat`, `seekFood`.
- **Ground** (`ground`): `walk`, `sleep`, `wash`, `follow`, `greet`,
  `seekFocus`, `seekNap`, `chase`, `flee`, `run`, `brushed`, `relieve`.
- **Wall**: `climb`, `seekWall`; **ceiling**: `ceiling`; **air**: `fly`,
  `flyFast`, `dive`; **water**: `swim`, `swimFast`.
- **Tricks**: one `trick_<name>` per trick declared in `tricks`.
- **Reactions**: `petted`, `tickled`, `annoyed`, `noticed`, `startled`,
  `greeted`, `purring`, `brushed`, `hatched`, `grew`, `awakened`, `ate`,
  `played`, `sick`, `accident`, `relieved`, `trickLearned`, `birthday`,
  `gift`, `reminded` (the sound is optional).

`scripts/gen_species_sprites.py` generates every one of these sheets for
cat, bird, insect, and fish, from per-state pose recipes.

## Packs provided

| Folder | Species | Locomotion | Notes |
|---|---|---|---|
| `critter-demo` | Critter (demo) | all | reference pack |
| `cat` | Cat | ground, walls, ceiling | sleeps and washes often, follows the cursor |
| `bug` | Insect | ground, walls, ceiling | 16 px, fast, climbs constantly |
| `fish` | Fish | water only | continuous undulating swim |
| `bird` | Bird | ground, air | flies often, lands on ledges |

Their sounds are placeholders generated by
`scripts/gen_placeholder_sounds.py`. `critter-demo`'s sprites come from
`scripts/gen_placeholder_sprites.py`; cat/bug/fish/bird's from
`scripts/gen_species_sprites.py` (fine, supersampled drawing, 64x64
sheets, automatic soft outline), which also rewrites the `animations` and
`reactions` sections of their `pack.json` (pass a species as an argument
to regenerate just one). These packs have dedicated sheets for most states
(climbing, ceiling, running, fleeing, greeting…) and for every reaction.
`tests/packs.test.js` automatically checks every pack (files present,
spritesheet slicing, sounds, `behavior` keys).

## Adding a new species

1. Copy `packs/critter-demo/` to a new `<species-id>`.
2. Replace the spritesheets with your own (same slicing convention).
3. Adjust `supportedSurfaces` and `speeds` to what the critter should be
   able to do (a fish: `["water"]`; a bird: `["ground", "air"]`, etc.),
   then give the species some personality via `behavior`.
4. Run `npm test`: `tests/packs.test.js` flags any missing file or
   mis-sliced spritesheet.
5. No code change is needed for standard behavior, including the
   automatic idle activities already wired in (following the cursor,
   washing, startling at a window opening): they work for any species,
   with or without a dedicated animation in the pack. A genuinely new
   behavior (e.g. a species that flies in formation with other critters)
   stays an addition in `core/critter.js`.
