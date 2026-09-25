// Compteurs de vie d'un animal (repas, jeux, vols...) et marques de ce qu'il a
// connu (aliments goûtés, fêtes vécues...), base des succès. Module pur : le
// Critter les alimente, les faits dérivés (`daysAlive`...) sont calculés à part.

export const STAT_KEYS = Object.freeze([
  'meals', 'mealsFavorite', 'playSessions', 'ballKicks', 'brushes', 'purrs', 'pets', 'greets',
  'climbs', 'flights', 'dives', 'swims', 'runs', 'naps', 'longestSleepSeconds',
  'tricksPerformed', 'giftsGiven', 'hunts', 'grazes', 'reliefs', 'accidents',
  // étape 15 : succès (dont les « bêtises »)
  'tickles', 'startles', 'awakenings', 'annoyances', 'sicknesses', 'birthdays', 'drags', 'falls', 'follows',
  'flees', 'chases', 'washes', 'ceilingWalks', 'hibernations', 'laserChases', 'ringPushes', 'leftovers',
  'sleepSeconds', 'eggPets', 'hovers', 'renames', 'overfeeds', 'pointlessBrushes', 'trickFails', 'hibernationWakes',
  'rescues', 'typingWatches', 'notificationsSeen',
]);

/** Faits calculés à la demande (pas des compteurs) : âge, stade, tours appris, succès obtenus. */
export const DERIVED_STATS = Object.freeze(['daysAlive', 'stageReached', 'tricksLearned', 'achievementsUnlocked']);

/** Clés utilisables dans une condition de succès d'animal : les compteurs et les faits dérivés. */
export const CONDITION_STATS = Object.freeze([...STAT_KEYS, ...DERIVED_STATS]);

/** Familles de marques (`famille:valeur`) : ce qu'un animal a goûté, essayé, porté, vécu. */
export const MARK_FAMILIES = Object.freeze(['food', 'toy', 'accessory', 'gift', 'bed', 'season', 'holiday', 'moment', 'state']);

/** Compteurs du joueur (gestes dans les menus, sur le bureau...), partagés entre animaux. */
export const PLAYER_STAT_KEYS = Object.freeze([
  'menuOpens', 'contextMenuOpens', 'settingsOpens', 'progressOpens', 'journalOpens', 'vacations', 'laserToggles',
  'clears', 'tidies', 'itemsRemoved', 'preyDrops', 'bowlOverfills', 'coinsSpent', 'messesCleaned', 'giftsCollected',
]);
/** Faits du joueur calculés à la demande : solde et accessoires possédés. */
export const PLAYER_DERIVED_STATS = Object.freeze(['coins', 'accessoriesOwned']);
export const PLAYER_CONDITION_STATS = Object.freeze([...PLAYER_STAT_KEYS, ...PLAYER_DERIVED_STATS]);
export const PLAYER_MARK_FAMILIES = Object.freeze(['moment', 'state', 'desk', 'shop']);

const MARK_PATTERN = /^[a-z]+:[a-z0-9-]+$/;
const MAX_MARKS = 500; // garde-fou contre une sauvegarde corrompue

export class Stats {
  /** @param {readonly string[]} [keys] compteurs suivis (ceux d'un animal par défaut) */
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

  /** Garde la plus grande valeur vue (ex. la plus longue sieste). */
  max(key, value) {
    if (key in this.counters && Number.isFinite(value) && value > this.counters[key]) this.counters[key] = value;
  }

  /** Pose une marque `famille:valeur` (sans effet si elle existe déjà ou est mal formée). */
  mark(family, value) {
    const mark = `${family}:${value}`;
    if (MARK_PATTERN.test(mark) && this.marks.size < MAX_MARKS) this.marks.add(mark);
  }

  hasMark(mark) {
    return this.marks.has(mark);
  }

  /** Nombre de marques distinctes d'une famille. */
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
