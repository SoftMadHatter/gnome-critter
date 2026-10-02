# Progression: counters, achievements, coins, log

## Counters and marks

Every critter counts what it does (`core/stats.js`): meals, play sessions,
ball hits, brushings, pets, climbs, flights, swims, naps, sleep time, falls,
mouse-dragged trips, tickles, startles, leftovers left behind, failed
tricks… (about fifty counters, all visible in "Statistics"), plus **marks**
of what it has experienced: foods tasted, toys tried, accessories worn,
kinds of gifts, beds, seasons and holidays lived through, unusual moments
(awake at 3 am, fell from the ceiling…). The player has their own
(`core/player.js`): menu, settings, and log openings, vacations, laser,
objects removed, coins spent… Everything is saved; an egg counts nothing
(except pets it receives).

## Achievements

About 200 to 260 achievements per species, expanded from **templates**
(`core/achievements.js`): a shared library (`core/achievementLibrary.js`)
and the pack's `achievements` section. They're grouped into sections: Care,
Play, Exploration, Life, Collection, Seasons, and **You** (the player's
achievements, shared across their critters). Over 40% are **blunders** (the
critter's "troll" achievements): pointless, mocking, with outlandish
rewards. A blunder isn't set apart in its own section — it's placed in
whichever of the six above fits its theme, same as a real achievement, and
already counts toward that section's total before it's ever discovered.

### Templates

A **series** yields several tiers:

```jsonc
{
  "series": "meals", "category": "care", "stat": "meals",
  "tiers": [10, 50, 200, 1000, 5000],
  "names": ["Petit creux", "Bon appétit", "Belle fourchette", "Estomac sur pattes", "Gouffre sans fond"],
  "description": "Faire {n} repas",   // {n}: the tier ("1 000"), {s}: plural "s"
  "title": "gouffre sans fond"          // title earned at the last tier (optional)
}
```

- Condition: `stat` (a counter, or `daysAlive`, `stageReached`,
  `tricksLearned`, `achievementsUnlocked`), or `marks` (the count of marks
  in a family: `food`, `toy`, `accessory`, `gift`, `bed`, `season`,
  `holiday`…).
- `tiers`: increasing numbers, `"all"` (everything the species can collect:
  every food in its diet, every one of its toys, every one of its
  tricks…), or `{ "at": 100, "id": "traveler" }` to keep an old identifier
  (saves stay valid). `unit`: 3600 for tiers in hours; `descriptions`: one
  description per tier.
- Default coins by tier rank: 5, 10, 20, 40, 80, 150 (or `coins`, an
  array).

A **standalone achievement**: `{ "id", "category", "name", "description",
"stat" + "atLeast" | "marks" + "atLeast" | "mark": "holiday:christmas",
"coins" }`. The old `"condition": { "stat", "atLeast" }` format is still
accepted.

Shared by both:

- `requires`: `trait` (`playful`, `lazy`, `greedy`, `shy`), `stage`, and
  `can` (`ground`, `wall`, `ceiling`, `air`, `water`, `hunt`, `graze`,
  `relieve`, `sleep`, `groom`, `tricks`): an achievement impossible for the
  species (flying for a cat, sleeping for a fish) is dropped outright.
- `scope: "player"`: a player achievement ("You" section), on their own
  counters (`menuOpens`, `coinsSpent`, `coins`, `accessoriesOwned`…).
- A pack overrides a library entry by reusing its `series` (or its `id`),
  or removes it with `{ "series": "...", "disabled": true }`.

### Blunders ("troll" achievements) and the Committee

`"troll": true`: the achievement is **hidden** until discovered — no row for
it at all, unlike an ungotten real achievement, which still shows its name
and progress — though it already counts toward its section's `done`/`total`
before that. It carries a `quip`, the Committee's comment. Its `reward` is
outlandish: `{ "coins": 0 }` (nothing), an absurd
amount (`{ "coins": 3, "text": "3.14 coins, rounded to 3" }`), a filing fee
(`{ "coins": -1 }`, never below zero), a **loot box** (`{ "box": "bronze"
}`, `silver`, `gold`, `platinum`, `legendary`: opened automatically, most
often empty or nearly so, sometimes a real prize), a ridiculous accessory
(`{ "accessory": "cone" }`), or plain text (`{ "text": "a feather" }`).
Examples: petting an egg 10 times, 500 falls, opening the menu 10,000
times, filling a bowl that's already full, being awake at 3 am.

**The Committee** (`core/narrator.js`) announces every achievement,
addressing the player informally: sober for a real achievement, sarcastic
for a blunder (imaginary spectators and sponsors; it mocks the player,
never the critter). More than three achievements at once (an old critter
catching up) give a single notification and a single log line.

### Rewards

- **Coins**: based on the tier, or the achievement's value.
- **Titles**: every completed series (and a few blunders) grants an
  invariable title ("nap ace", "free-fall test pilot"). It's chosen in the
  critter menu's "Title" row, shows under its name on hover and in menu
  headers ("Minou, nap ace — Adult…").
- **Trophies**: medal (25 achievements), laurel wreath (50), halo (100),
  based on the player's total achievements (critters and player combined,
  it never goes back down). Given automatically, never in the shop.
- **Ridiculous accessories**: cone of shame, sock, tinfoil hat, earned
  from certain blunders or from loot boxes.

`tests/packs.test.js` validates each pack's library: no entry rejected, at
least 150 achievements including 40% blunders, every section represented,
at least 20 titles, historical identifiers preserved, no duplicates.

## Coins

Earned by caring for critters: meal +1, play +2, brushing +1, purring +1
(these four spaced 30 s apart per critter to prevent chaining them),
hatching +10, new stage +15, achievements (their value). The balance,
purchases, log, and the player's counters and achievements are saved
separately (`saved-player`).

## Log

The last 100 events (hatching, new stage, achievements…), in the "Log" tab
of the progression window.

The Committee's announcements (achievements, blunders, streaks, trophies)
are **notified** and kept in full: the log keeps their complete text, in
bold with a dot as long as they're unread. The unread count shows as a
badge next to the panel icon and in the menu's "Log" row. Clicking an entry
marks it read; "Mark all as read" clears the counter and "Unread only"
filters the list. Other events are simple entries, already read.

Announcements also go through a "Critter" GNOME notification source
(`extension/lib/notifier.js`): they stay in the list until dismissed.
Dismissing a notification marks it read; clicking it opens the log. If the
shell's API fails, it falls back to `Main.notify` (ephemeral).

## Shop and accessories

Tray icon menu, "Shop": party hat (20 coins), bow tie (15), glasses (30),
crown (80), plus **free seasonal** accessories (Santa hat in December,
witch hat in October). Trophies and ridiculous accessories can't be bought
(see Rewards). Once bought, an accessory is worn via "Accessories" in the
critter menu (middle click). It follows the walking direction and the
stage's scale, and disappears in the egg.

Where it sits depends on the animation. The head moves while an animation
plays (and is elsewhere when sleeping curled up, climbing seen from behind,
or upside down on the ceiling), so the pack gives the **head point frame
by frame** in `anchors`, in fractions of the sprite facing right. These
points are **generated** by `scripts/gen_species_sprites.py`, which draws
the heads and so knows exactly where they are (`base`, one table per life
stage); the review tool's "Anchors" tab only holds the touch-ups
(`animations`, `reactions`), which take precedence:

```jsonc
"anchors": {
  "head": { "x": 0.78, "y": 0.2 },        // fallback: top of the head
  "headWidth": 0.375,                      // the head's width (fraction of the sprite): sizes the accessories
  "view": "side",                          // "side" (critter drawn in profile) or "front" (default)
  "slots": {                               // offsets from the head point, in head widths
    "top": { "dx": 0.059, "dy": 0.288 },  // hats sink this far into the head
    "face": { "dx": 0.083, "dy": 0.417 }, // glasses (the eye, from the generator)
    "neck": { "dx": -0.15, "dy": 1 }      // medal, bow
  },
  "layout": {                              // this pack's overrides of the accessories' defaults
    "bow": { "span": 0.45, "shift": 0, "at": [0.5, 0.5], "slot": "neck" }
  },
  "base": {                                // generated: one point per frame
    "animations": {
      "walk": [[0.75, 0.156], [0.75, 0.188]],
      "sleep": [0.688, 0.469],                                         // one point: every frame
      "ceiling": { "rotation": 180, "points": [[0.75, 0.844]] }       // upside down
      "climb": { "hide": ["face", "neck"], "points": [0.5, 0.062] }   // seen from behind: only hats show
    },
    "reactions": { "petted": [[0.75, 0.219], [0.75, 0.188]] }          // key = reaction name
  },
  "stages": {                              // stages drawn differently (baby, young, senior)
    "baby": { "headWidth": 0.375, "base": { "animations": { "sleep": { "width": 0.262, "points": [0.638, 0.623] } } } }
  },
  "animations": { "climb": false },       // touch-ups, same format (`false`: hidden)
  "reactions": {}
}
```

Each accessory has a slot: on top of the head (hats, crown, halo, cone,
laurel), on the face (glasses) or on the neck (medal, bow), at the slot's
offset from the head point (in head widths, so it follows the stage's head
size). Accessories are sized on the **head width** (`headWidth`, or the
entry's own `width` for a sheet drawn smaller as a whole): each has a
`span` in `ACCESSORY_LAYOUT` (core/accessories.js), the width of its drawn
part in head widths (a bow is half a head, a hat about one), measured on its
opaque pixels (`core/accessoryMetrics.js`, generated by
`scripts/gen_accessory_metrics.py`). `rotation` is 0 (default) or 180 (head
upside down: offsets flip, the accessory hangs below the point and is
rotated). In a side view, accessories with a profile image (`glasses_side`, drawn by
`scripts/gen_ui_sprites.py`) use it, with its own width and anchor point in
`ACCESSORY_LAYOUT.<id>.side`. `layout` overrides, for this pack only, an accessory's `span`, `shift` (extra
downward shift, in head widths), `at` (the point of its drawn part, from 0 to 1, put on the
slot's point) and `slot`. Lookup order for a frame: the stage's touch-up, the stage's
generated point, the adult's touch-up, the adult's generated point, then
`head`. The animation or reaction really playing counts (a reaction
interrupts the state's animation). A pack without `stages` can use
`stageFit` (`{ "baby": { "scale": 0.75 } }`) to scale the adult's points
around the bottom center of the frame.

Premium foods cost coins on every gift: fish 3, meat 2, wet food 2 (x5 to
fill a bowl). Kibble, seeds, mealworms, apple, plankton, flakes, toys,
bowls, and beds stay free.

## Birthdays

Every year of life (365 days of age), the critter celebrates its birthday:
+25 coins, a log entry, and a party hat for twenty-four hours (if it isn't
already wearing an accessory).

## Tricks

Each pack declares the species' tricks (`"tricks": ["sit", "roll"]`; known
tricks: `sit`, `roll`, `flip` (a somersault). In the critter menu, "Tricks"
> "Train": an attempt succeeds with the mastery probability (15% minimum),
which rises with every attempt (faster for a playful critter, slower for a
lazy one). At 100% the trick is learned (+10 coins, a log entry) and "Do:
…" appears. Tricks are saved with the critter. Animations: `trick_sit`,
`trick_roll`, `trick_flip` (falling back to `idle`, `play`, `swim`,
`walk`).

## Gifts

An adult (or senior) critter with affection above 70 can, rarely (at most
once every 20 minutes, the first after 20 minutes of activity), come drop a
gift near your cursor: a coin (5 coins), a flower (3), or a feather (8,
rare). A click picks it up and credits the coins; if forgotten, it
disappears after 30 minutes. No penalty.
