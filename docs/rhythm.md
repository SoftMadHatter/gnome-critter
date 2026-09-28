# World rhythm

Critters react to the time of day, your presence, your work rhythm, and a few
desktop events. The logic is in `core/rhythm.js` and `core/critter.js` (pure
and tested); the sensors are in `extension/lib/activitySensor.js` and
`extension/lib/manager.js`.

**Privacy**: no content is ever read or kept. A notification is only an
"there is one" (no title, no text, no app); a keystroke is only a "a key was
pressed" (never which one); inactivity is only a duration.

## Day and night

From 11 pm to 7 am (local time), critters sleep more (sleep weight x3,
energetic activities x0.4) and are slightly dimmed. Setting: day/night cycle.

## Player away

After 10 minutes of inactivity (adjustable), they fall asleep more readily
(sleep x4, energetic x0.3). When you come back, they greet you and any
sleepers wake up. Settings: sleep while you're away, inactivity minutes.

## Break reminder

Disabled by default. After 60 minutes of continuous activity (adjustable),
the first awake critter comes to your cursor with a cup bubble for 25
seconds. Clicking it acknowledges the reminder (the counter resets to zero).
An actual break (5 minutes of inactivity) also resets the counter, and a
30-minute grace period follows each reminder. An egg or a hibernating critter
is never chosen.

## Notifications and typing

- **Notifications** (on by default): the critter notices a notification
  arriving (curiosity reaction), without waking a sleeper.
- **Typing** (off by default): curiosity reaction limited to once every 20
  seconds per critter.

An egg ignores all of this, as it ignores every interaction.

## Pack animations

`remind` (falls back to `follow` then `walk`). The reactions used are
`noticed` (notification, typing) and `greeted` (player's return), already
present in packs.
