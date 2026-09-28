# Needs and mood

Every critter has gauges from 0 to 100, where **100 = satisfied**. They drop
with real time, steer its behavior, are saved, and are visible in the top-bar
icon and in thought bubbles. The model is in `core/needs.js` (pure, tested);
the `Critter` owns an instance of it.

## Gauges

| Gauge | Decay (per hour, normal difficulty) | Rise |
|---|---|---|
| `satiety` | 5 | eating: gain specific to the food (`needs.diet`) |
| `energy` | 6 | sleeping: +60 per hour |
| `cleanliness` | 4 | end of a wash: +30; brushing: +25 |
| `stimulation` (against boredom) | 10 | physical activity: +25 per hour; play: +25; reactions |
| `affection` | 4 | pet +8 (purring +12), tickle +3, greeting +4, play +6, brushing +6 |
| `relief` | 8, plus a fifth of each meal's gain | relieving itself: +85 |
| `health` | drops 6 per hour when the average of the other five is below 25 | rises 4 per hour above 50 |

Mood (`mood`) isn't stored: it's the average of the five needs weighted by
health. A new critter starts at 80 everywhere. There is never death: health
recovers as soon as the critter is cared for.

While asleep, needs drop at 25% of their speed.

## Effect on behavior

The critter keeps the decision: gauges only multiply the weights of its
draw (`needMultiplier`), never forcing a state. Low energy: sleep is more
likely. Low cleanliness: washing. Low affection: it follows the cursor more.
Low stimulation: energetic activities (running, flying, fast swimming,
climbing). A gauge that's full (above 90) instead reduces the matching
activity. Below 30 health, energetic activities are reduced to 30%.

## Natural needs

The critter needs to relieve itself. Below 60 its relief gauge makes it want
to go more and more (below 30: "urgent" bubble).

- **Where**: a clean **litter box** placed on its surface ("Desktop…" >
  "Place a litter box"; a flying critter joins its surface), otherwise the
  nearest **corner** (edge of the window or the screen). It crouches for
  3.5 s, then relief rises. Fish don't have this need.
- **Litter box**: dirty after 3 uses (and no longer used); a click cleans it.
- **Mess**: outside a litter box the critter leaves a mess; a **click** cleans
  it up (+1 coin), "Clean up messes" in "Desktop…" removes them all. A nearby
  mess (200 px, same surface) lowers cleanliness (6 per hour, three messes at
  most); **after 2 h** it ages and lowers health (5 per hour per mess, three
  at most, dampened by autonomy: an autonomous critter cleans up after
  itself). Everything is frozen in vacation mode.
- **Accident**: if relief drops below 8, the critter relieves itself on the
  spot (a mess, cleanliness -15).

## Food, bowl, and bed

Objects are desktop entities (`core/items.js`), which fall onto the ground
or a window ledge like critters do and fall again if the window moves or
disappears.

- **Feeding**: middle click on the critter (context menu) or the tray icon
  menu. The food drops next to the critter. Foods: meat, fish, wet food,
  kibble, seeds, mealworms, apple, and for fish plankton and flakes
  (floating). Uneaten food expires (15 min, plankton and flakes 10 min).
  Diet plants aren't among them: they're placed with "Place a plant".
- **Diet**: each species only eats the foods in its `needs.diet`, each with a
  satiety gain; the food with the highest gain also pleases it (affection
  +5). A full critter ignores food, a hungry one prefers it to anything
  else. It reaches it on foot, by flying to another ledge (bird), or by
  swimming (fish and plankton), then eats (`eat` state).
- **Bites and leftovers**: a food is eaten in several bites (meat, fish, wet
  food, plankton, flakes: 2; kibble, seeds, mealworms, apple: 3), a few
  seconds each, and each bite brings its share of the gain. As long as
  satiety stays below 80, the critter keeps eating; beyond that, it leaves a
  **started leftover** (a half-gnawed bone, fish bones, a pile that's
  shrunk…), which it will finish later or another critter will eat. The
  leftover is visible and saved. The "ate" reaction, affection, and the
  `mealsFavorite` counter come at the end of the meal (for the favorite food:
  the meal finished).
- **Bowl**: "Place a bowl" places an empty one, in ceramic, steel, or wood;
  "Fill the bowl" fills the nearest one (or creates a ceramic one) with 5
  portions of a food. It empties portion by portion and its contents are
  visible: the chosen food, as a full pile, half, or at the bottom. Floating
  food doesn't go in a bowl (the menu doesn't offer it).
- **Bed**: "Place a bed", in cushion, wicker basket, or cradle. When a
  critter wants to sleep and a bed is on its surface, it goes there, and
  recovers 1.5 times faster on it.
- **Moving / removing**: objects can be dragged with the mouse (they fall
  again on release), right click to remove one, "Remove objects" to remove
  them all. Bowls, beds, toys, and fresh food (including leftovers) are kept
  across restarts with their model (`saved-items` key).

## Playing, petting, brushing

- **Toys**: ball, wool ball, and plush toy for walking species, floating
  ring for fish ("Play" in the critter menu, "Place a toy" in the icon menu,
  which only offer toys suited to the species). The ball gets a random color
  (red, blue, yellow, green), so does the wool ball (pink, blue, yellow), and
  the plush toy a model (bear, rabbit, frog). The ball rolls with friction,
  bounces, bounces off the screen's edges, and can fall off a window ledge;
  the wool ball rolls the same way but brakes quickly and barely bounces; the
  plush toy stays put. A bored critter goes to play (by running): it hits the
  ball or wool ball then chases it, or snuggles up to the plush toy. The ring
  floats without gravity: a bored fish reaches it and pushes it with its
  snout, the ring shoots off, slows down, and bounces off the screen's edges.
  A session lasts 6 to 12 s and, played through to the end, gives stimulation
  +25 and affection +6. A satisfied critter barely plays.
- **Throwing with the mouse**: objects can be dragged, and leave with the
  pointer's momentum on release (up to 900 px/s), to throw the ball.
- **Laser pointer**: a toggle in both menus. A red dot follows the cursor and
  critters rush to it (fish chase it too, in 2D). The mode isn't remembered:
  it's off on every activation.
- **Extended petting**: from the 3rd pet within 3 s of the previous one
  (clicks), the critter purrs (`purring`, affection +12 instead of +8).
- **Brushing**: in the context menu; the critter stays still for 4 s
  (`brushed`), cleanliness +25, affection +6. Wakes a sleeping critter.
- **Tidy up toys**: removes all toys at once, without touching the bowl,
  bed, or food ("Remove objects" removes everything). Toys are kept across
  restarts.

## Difficulty and vacation mode

Preferences settings (vacation mode is also in the icon menu): relaxed
difficulty (x0.4), normal (x1), strict (x2). Vacation mode freezes every
gauge, including during offline catch-up. Changes apply immediately, without
reloading the extension.

## Thought bubbles

When a gauge drops below 30 (or health below 40, which takes priority), a
bubble appears above the critter: hunger, sleep, dirt, boredom, heart
(affection), green cross (health). The icons come from
`extension/assets/bubbles/`, generated by `scripts/gen_ui_sprites.py`.
Bubbles never block clicks.

## Saving and catch-up

Gauges are saved along with position, every 30 seconds and on disable. On restart, the time spent with the critter off is caught up at
half speed, capped at 8 hours. Old saves (version 1, position only) remain
readable.

## Per-species settings

Optional `needs` section of `pack.json`:

```json
"needs": { "decayPerHour": { "energy": 3, "cleanliness": 2 } }
```

The `diet` key lists the accepted foods (`meat`, `fish`, `kibble`, `seeds`,
`plankton`) with their satiety gain (> 0). Only the five need gauges accept a
decay rate (a number >= 0, 0 to disable a gauge: fish neither sleep nor
wash). Other keys are ignored with a warning in the GNOME Shell log.
`tests/packs.test.js` validates this section for every pack.
