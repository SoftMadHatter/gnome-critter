# Creatures: names and menus

## Names

Each creature has a name. At birth it's drawn from its species' list (the
`names` section of `pack.json`, or a generic list), avoiding names already
taken; it's saved with the critter. To change it: "Rename…" in its menu
(middle click) or in its block in the tray icon menu. The name is cleaned up
(collapsed whitespace, control characters stripped, 24 characters at most)
and made unique among the displayed critters ("Moka", then "Moka 2"). It
appears in menus, achievement notifications, and the log, and above the
critter after one second of continuous hover (not for an egg).

```json
"names": ["Minou", "Moka", "Câline", "Pixel", "Nougat", "Ronron", "Tigrou", "Luna"]
```

At least 8 names per pack (checked by `tests/packs.test.js`).

## Tray icon menu

A short menu, "card + quick actions":

```
[Moka] [Pixel] [Luna]        selector (if there are several critters)
Moka — Adult, playful
Satiety ████   Energy ██████
Cleanliness ███   Stimulation ████
Affection ██████   Health ███████
[Feed] [Play] [Brush] [Pet]
▸ More…      ▸ Desktop…      ▸ Coins: 42
  Settings…
```

- **Selector**: one button per critter; the card shows the chosen critter.
- **Card**: name, stage, temperament; six gauges in two columns.
- **Quick actions** (they don't close the menu): "Feed" drops the free food
  the species prefers, "Play" a ball (the floating ring for fish), "Brush",
  "Pet" (a caress, which wakes a hibernating critter). Grayed out for an egg;
  only "Pet" stays active for a hibernating critter.
- **More…**: every action for the chosen critter (rename, choice of foods,
  fill or place a bowl, bed, toys, tricks, accessories, wake up), plus
  "Achievements (n/m)" and "Statistics", which open the progression window.
  "Place a bed" and "Place a bowl" expand into their models (cushion,
  basket, cradle; ceramic, steel, wood); "Play" only offers toys suited to
  the species.
- **Desktop…**: vacation mode, laser pointer, drop food, fill or place a
  bowl, a bed, or a toy (they fall from the top of the screen, at the
  cursor's x position), tidy up toys, remove objects.
- **Coins: N**: the shop (expandable) and "Log" (progression window).
- **Settings…**: opens the settings window.

Only one expandable row is open at a time.

## Progression window

"Achievements", "Statistics", and "Log" open a tabbed, scrollable window: the
chosen critter's achievements (then your own, "You" section), its
statistics, the log (last 50 entries). The menu only shows the **number** of
unlocked achievements. In the window, achievements are grouped into
expandable sections; a series shows its last-reached tier and the next one,
with progress; blunders stay hidden until discovered (see
`docs/progression.md`).

The critter menu's "Title" row lists the titles it has earned; the chosen
title shows under its name on hover and in menu headers.

Every expandable row in the menu is clickable across its whole highlighted
area, and doesn't close the menu.

## Settings window

Opened by "Settings…" (a GNOME preferences window, non-modal). Three pages:
General (critter, count, sounds, tray icon), Needs and life (difficulty,
vacation, growth, speed), Rhythm and sensors (day/night, away, break
reminder, notifications, typing). **Everything applies immediately**, without
reloading the extension: changing the critter or the count recreates the
manager live (after 0.4 s, to group clicks on a number field). Existing
critters keep their life when only the count changes; a different critter
starts fresh from an egg.

## Context menu (middle click)

A header with the name and state, the same critter actions, the laser
pointer, and "Tidy up toys". No menu for an egg.
