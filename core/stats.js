// Life counters for an animal (meals, plays, flights...) and marks for what
// it has experienced (foods tasted, holidays lived through...), the basis
// for achievements. Pure module: the Critter feeds them, derived facts
// (`daysAlive`...) are computed separately.

export const STAT_KEYS = Object.freeze([
  'meals', 'mealsFavorite', 'playSessions', 'ballKicks', 'brushes', 'purrs', 'pets', 'greets',
  'climbs', 'flights', 'dives', 'swims', 'runs', 'naps', 'longestSleepSeconds',
  'tricksPerformed', 'giftsGiven', 'hunts', 'grazes', 'reliefs', 'accidents',
  // step 15: achievements (including "mischief")
  'tickles', 'startles', 'awakenings', 'annoyances', 'sicknesses', 'birthdays', 'drags', 'falls', 'follows',
  'flees', 'chases', 'washes', 'ceilingWalks', 'hibernations', 'laserChases', 'ringPushes', 'leftovers',
  'sleepSeconds', 'eggPets', 'hovers', 'renames', 'overfeeds', 'pointlessBrushes', 'trickFails', 'hibernationWakes',
  'rescues', 'typingWatches', 'notificationsSeen',
]);

/** Facts computed on demand (not counters): age, stage, tricks learned, achievements unlocked. */
export const DERIVED_STATS = Object.freeze(['daysAlive', 'stageReached', 'tricksLearned', 'achievementsUnlocked']);

/** Keys usable in an animal achievement condition: counters and derived facts. */
export const CONDITION_STATS = Object.freeze([...STAT_KEYS, ...DERIVED_STATS]);

/** Mark families (`family:value`): what an animal has tasted, tried, worn, experienced. */
export const MARK_FAMILIES = Object.freeze(['food', 'toy', 'accessory', 'gift', 'bed', 'season', 'holiday', 'moment', 'state']);

/** Player counters (gestures in menus, on the desktop...), shared between animals. */
export const PLAYER_STAT_KEYS = Object.freeze([
  'menuOpens', 'contextMenuOpens', 'settingsOpens', 'progressOpens', 'journalOpens', 'vacations', 'laserToggles',
  'clears', 'tidies', 'itemsRemoved', 'preyDrops', 'bowlOverfills', 'coinsSpent', 'messesCleaned', 'giftsCollected',
]);
/** Player facts computed on demand: coin balance and accessories owned. */
export const PLAYER_DERIVED_STATS = Object.freeze(['coins', 'accessoriesOwned']);
export const PLAYER_CONDITION_STATS = Object.freeze([...PLAYER_STAT_KEYS, ...PLAYER_DERIVED_STATS]);
export const PLAYER_MARK_FAMILIES = Object.freeze(['moment', 'state', 'desk', 'shop']);

const MARK_PATTERN = /^[a-z]+:[a-z0-9-]+$/;
const MAX_MARKS = 500; // safety net against a corrupted save

export class Stats {
  /** @param {readonly string[]} [keys] tracked counters (an animal's by default) */
  constructor(keys = STAT_KEYS) {
    this._keys = keys;
    this.counters = Object.fromEntries(keys.map((k) => [k, 0]));
    /** @type {Set<string>} marques `famille:valeur` */
    this.marks = new Set();
  }

  get(key) {
    return this.counters[key] ?? 0;
  }

  add(key, amount = 1) {
    if (key in this.counters && Number.isFinite(amount)) this.counters[key] += amount;
  }

  /** Keeps the highest value seen (e.g. the longest nap). */
  max(key, value) {
    if (key in this.counters && Number.isFinite(value) && value > this.counters[key]) this.counters[key] = value;
  }

  /** Sets a `family:value` mark (no effect if it already exists or is malformed). */
  mark(family, value) {
    const mark = `${family}:${value}`;
    if (MARK_PATTERN.test(mark) && this.marks.size < MAX_MARKS) this.marks.add(mark);
  }

  hasMark(mark) {
    return this.marks.has(mark);
  }

  /** Number of distinct marks in a family. */
  countMarks(family) {
    const prefix = `${family}:`;
    let n = 0;
    for (const mark of this.marks) if (mark.startsWith(prefix)) n++;
    return n;
  }

  serialize() {
    return {
      ...Object.fromEntries(this._keys.map((k) => [k, Math.round(this.counters[k])])),
      marks: [...this.marks],
    };
  }

  restore(saved) {
    if (!saved || typeof saved !== 'object') return;
    for (const key of this._keys) {
      if (Number.isFinite(saved[key]) && saved[key] >= 0) this.counters[key] = saved[key];
    }
    if (Array.isArray(saved.marks)) {
      for (const mark of saved.marks) {
        if (typeof mark === 'string' && MARK_PATTERN.test(mark) && this.marks.size < MAX_MARKS) this.marks.add(mark);
      }
    }
  }
}
