# Autonomy

An autonomous critter covers part of its own needs: it hunts prey, nibbles
plants, and helps itself from a bowl, and its needs drop more slowly. The
model lives in `core/autonomy.js`, `core/prey.js`, and `core/items.js` (pure
and tested).

## Autonomy level (0 to 1)

"Autonomy" setting (preferences, Needs and life page), applied live:

- **Auto** (default): follows growth and training. Baby 0, young 0.4, adult
  and senior 0.7, plus 0.1 per trick learned (up to +0.3). An egg or a
  hibernating critter: 0.
- **Disabled** (0), **Partial** (0.5), **Full** (1): force the level.

Effects: needs drop more slowly (at autonomy 1, at 20% of their speed, never
zero); the neglect that leads to hibernation no longer accumulates ("nothing
at stake"); the activity draw gains two candidates, **hunt** and **nibble**,
weighted by the level and by hunger.

## Prey

Small creatures on the desktop, specific to each species (the pack's
`needs.prey` section: `{ "mouse": 40 }` gives the prey and its satiety gain):
mouse (cat), beetle (bird), aphid (insect), floating krill (fish).

- They **wander** on surfaces (walking, pauses, turning around at edges),
  **flee** a critter within 110 px and the cursor within 80 px (faster than
  their walk), and disappear after 10 minutes.
- **Automatic spawning** (the "Automatic prey" setting): every 60 to 180 s,
  at most 3 at a time, as long as a critter has more than 0.3 autonomy.
  "Drop a prey" in "Desktop…" places one near the cursor. They move with the
  mouse like other objects.
- **Hunting**: a hungry autonomous critter chases the prey (12 s at most); at
  14 px it catches it, the prey freezes, the critter eats it and gains the
  prey's gain. A prey that escapes or disappears: the critter gives up, with
  no consequence. `hunts` counter ("Mouse Hunter" achievement, etc.).

## Decorative plants

Grass (cat), berries (bird), leaf (insect), floating algae (fish): three
portions, one **regrows every 5 minutes**, they never disappear. Two are kept
automatically (the "Decorative plants" setting), more can be placed
("Place a plant"). Small satiety gain defined in `needs.diet`. `grazes`
counter. Only autonomous critters nibble them.

## Moldy bowl

A bowl whose food isn't refreshed goes moldy after **24 h** (a greenish,
fuzzy pile, at the remaining level): eating it costs 20 health points (and
the critter looks sick); **6 h later**, the contents disappear (the bowl
remains). Refilling it resets the counter. An autonomous critter (level 0.5
and above) avoids moldy food; a critter that depends on you eats it anyway.
