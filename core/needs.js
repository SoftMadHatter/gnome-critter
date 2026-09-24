// Besoins d'un animal : jauges de 0 à 100 (100 = satisfait) qui évoluent
// avec le temps réel. Module pur, sans dépendance GNOME : le Critter en
// possède une instance et l'avance dans tick().

/** Jauges stockées (la santé est traitée à part, les cinq premières forment l'humeur). */
export const NEED_GAUGES = ['satiety', 'energy', 'cleanliness', 'stimulation', 'affection'];
export const ALL_GAUGES = [...NEED_GAUGES, 'health'];

/** Décroissance par heure en difficulté normale. */
export const DEFAULT_DECAY_PER_HOUR = {
  satiety: 5,
  energy: 6,
  cleanliness: 4,
  stimulation: 10,
  affection: 4,
};

export const INITIAL_LEVEL = 80;

const SLEEP_ENERGY_GAIN_PER_HOUR = 60;
const SLEEP_DECAY_FACTOR = 0.25;
const ACTIVE_STIMULATION_GAIN_PER_HOUR = 25;
const HEALTH_LOSS_PER_HOUR = 6;
const HEALTH_GAIN_PER_HOUR = 4;
const HEALTH_LOSS_BELOW = 25;
const HEALTH_GAIN_ABOVE = 50;
const URGENT_BELOW = 30;
const URGENT_HEALTH_BELOW = 40;

const CATCH_UP_CAP_SECONDS = 8 * 3600;
const CATCH_UP_FACTOR = 0.5;

/** Effets ponctuels d'un événement sur les jauges. */
export const EVENT_EFFECTS = Object.freeze({
  fed: { satiety: 40 },
  washed: { cleanliness: 30 },
  petted: { affection: 8, stimulation: 2 },
  tickled: { stimulation: 8, affection: 3 },
  annoyed: { affection: -4 },
  startled: { stimulation: 2 },
  greeted: { stimulation: 5, affection: 4 },
});

const clamp100 = (v) => Math.min(100, Math.max(0, v));

/**
 * Multiplicateur de poids pour une jauge : 1 au-dessus de 60, monte
 * linéairement jusqu'à `boost` à 0, et descend à `satisfied` (< 1) au-dessus
 * de 90 pour ne pas répéter une activité dont l'animal n'a pas besoin.
 */
export function needMultiplier(value, { boost = 4, satisfied = 0.3 } = {}) {
  if (value >= 90) return satisfied;
  if (value >= 60) return 1;
  return 1 + ((60 - value) / 60) * (boost - 1);
}

/**
 * Filtre la section `needs` d'un pack.json : seuls les débits
 * `decayPerHour` numériques >= 0 des jauges connues passent.
 * @param {object} [raw]
 * @returns {{rates: Record<string, number>, ignored: string[]}}
 */
export function needsOverrides(raw = {}) {
  const rates = {};
  const ignored = [];
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (key !== 'decayPerHour' || !value || typeof value !== 'object') {
      ignored.push(key);
      continue;
    }
    for (const [gauge, rate] of Object.entries(value)) {
      if (NEED_GAUGES.includes(gauge) && Number.isFinite(rate) && rate >= 0) {
        rates[gauge] = rate;
      } else {
        ignored.push(`decayPerHour.${gauge}`);
      }
    }
  }
  return { rates, ignored };
}

export class Needs {
  /**
   * @param {{rates?: Record<string, number>, rateScale?: number}} [options]
   *   rates : débits par heure qui remplacent les défauts ;
   *   rateScale : difficulté * (vacances ? 0 : 1).
   */
  constructor({ rates = {}, rateScale = 1 } = {}) {
    this.rates = { ...DEFAULT_DECAY_PER_HOUR, ...rates };
    this.rateScale = rateScale;
    this.values = {};
    for (const g of NEED_GAUGES) this.values[g] = INITIAL_LEVEL;
    this.values.health = 100;
  }

  setRateScale(scale) {
    this.rateScale = Math.max(0, scale);
  }

  /**
   * @param {number} dt secondes
   * @param {{sleeping?: boolean, active?: boolean}} [activity]
   */
  advance(dt, { sleeping = false, active = false } = {}) {
    if (this.rateScale <= 0 || dt <= 0) return;
    const hours = dt / 3600;
    const decayFactor = sleeping ? SLEEP_DECAY_FACTOR : 1;

    for (const g of NEED_GAUGES) {
      this.values[g] = clamp100(this.values[g] - this.rates[g] * this.rateScale * decayFactor * hours);
    }
    if (sleeping) {
      this.values.energy = clamp100(this.values.energy + SLEEP_ENERGY_GAIN_PER_HOUR * this.rateScale * hours);
    }
    if (active) {
      this.values.stimulation = clamp100(
        this.values.stimulation + ACTIVE_STIMULATION_GAIN_PER_HOUR * this.rateScale * hours,
      );
    }

    const average = this._average();
    if (average < HEALTH_LOSS_BELOW) {
      this.values.health = clamp100(this.values.health - HEALTH_LOSS_PER_HOUR * this.rateScale * hours);
    } else if (average > HEALTH_GAIN_ABOVE) {
      this.values.health = clamp100(this.values.health + HEALTH_GAIN_PER_HOUR * this.rateScale * hours);
    }
  }

  /** Applique un événement reconnu (voir EVENT_EFFECTS), ignore les autres. */
  apply(event) {
    const effects = EVENT_EFFECTS[event];
    if (!effects) return;
    for (const [gauge, delta] of Object.entries(effects)) {
      this.values[gauge] = clamp100(this.values[gauge] + delta);
    }
  }

  /**
   * Rattrape le temps passé animal éteint : demi-débit, plafonné, sans effet
   * en mode vacances (rateScale 0).
   */
  catchUp(seconds, { cap = CATCH_UP_CAP_SECONDS, factor = CATCH_UP_FACTOR } = {}) {
    if (!(seconds > 0)) return;
    const effective = Math.min(seconds, cap) * factor;
    // Pas en un seul bloc : la santé dépend de la moyenne, qui évolue.
    const steps = 24;
    for (let i = 0; i < steps; i++) this.advance(effective / steps, {});
  }

  _average() {
    return NEED_GAUGES.reduce((sum, g) => sum + this.values[g], 0) / NEED_GAUGES.length;
  }

  /** Humeur 0-100 : moyenne des besoins, pondérée par la santé. */
  get mood() {
    return this._average() * (0.5 + (0.5 * this.values.health) / 100);
  }

  /** Besoin le plus pressant (`health` prioritaire), ou null. */
  urgent() {
    if (this.values.health < URGENT_HEALTH_BELOW) return 'health';
    let lowest = null;
    for (const g of NEED_GAUGES) {
      if (this.values[g] < URGENT_BELOW && (lowest === null || this.values[g] < this.values[lowest])) {
        lowest = g;
      }
    }
    return lowest;
  }

  snapshot() {
    return { ...this.values, mood: this.mood, urgent: this.urgent() };
  }

  serialize() {
    const out = {};
    for (const g of ALL_GAUGES) out[g] = Math.round(this.values[g] * 10) / 10;
    return out;
  }

  /** Restaure des jauges sauvegardées ; toute valeur absente ou invalide garde sa valeur courante. */
  restore(saved) {
    if (!saved || typeof saved !== 'object') return;
    for (const g of ALL_GAUGES) {
      if (Number.isFinite(saved[g])) this.values[g] = clamp100(saved[g]);
    }
  }
}
