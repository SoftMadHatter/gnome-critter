// Compteurs de vie d'un animal (repas, jeux, vols...), base des succès.
// Module pur : le Critter les alimente, `daysAlive` est calculé à part.

export const STAT_KEYS = Object.freeze([
  'meals', 'mealsFavorite', 'playSessions', 'ballKicks', 'brushes', 'purrs', 'pets', 'greets',
  'climbs', 'flights', 'dives', 'swims', 'runs', 'naps', 'longestSleepSeconds',
  'tricksPerformed', 'giftsGiven',
]);

/** Clés utilisables dans une condition de succès : les compteurs et l'âge en jours. */
export const CONDITION_STATS = Object.freeze([...STAT_KEYS, 'daysAlive']);

export class Stats {
  constructor() {
    this.counters = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
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

  serialize() {
    return Object.fromEntries(STAT_KEYS.map((k) => [k, Math.round(this.counters[k])]));
  }

  restore(saved) {
    if (!saved || typeof saved !== 'object') return;
    for (const key of STAT_KEYS) {
      if (Number.isFinite(saved[key]) && saved[key] >= 0) this.counters[key] = saved[key];
    }
  }
}
