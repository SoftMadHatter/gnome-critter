// An animal's needs: gauges from 0 to 100 (100 = satisfied) that evolve
// with real time. Pure module, no GNOME dependency: the Critter holds an
// instance of it and advances it in tick().

import { FOODS, PLANTS } from './items.js';
import { PREY } from './prey.js';
import { RELIEF } from './autonomy.js';

/** Stored gauges (health is handled separately, the first five make up mood). */
export const NEED_GAUGES = ['satiety', 'energy', 'cleanliness', 'stimulation', 'affection', 'relief'];
export const ALL_GAUGES = [...NEED_GAUGES, 'health'];

/** Decay per hour on normal difficulty. */
export const DEFAULT_DECAY_PER_HOUR = {
  satiety: 5,
  energy: 6,
  cleanliness: 4,
  stimulation: 10,
  affection: 4,
  relief: 8, // relief: also drops when the animal eats (see feed)
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

const RELIEF_COST_OF_EATING = 0.2; // share of the satiety gain taken from relief
const RELIEF_RESTORED = 85;

const CATCH_UP_CAP_SECONDS = 8 * 3600;
const CATCH_UP_FACTOR = 0.5;

/** One-off effects of an event on the gauges. */
export const EVENT_EFFECTS = Object.freeze({
  washed: { cleanliness: 30 },
  petted: { affection: 8, stimulation: 2 },
  tickled: { stimulation: 8, affection: 3 },
  annoyed: { affection: -4 },
  startled: { stimulation: 2 },
  greeted: { stimulation: 5, affection: 4 },
  played: { stimulation: 25, affection: 6 },
  brushed: { cleanliness: 25, affection: 6 },
  purring: { affection: 12, stimulation: 2 }, // pet streak: replaces `petted` (8 + 4 bonus)
});

const clamp100 = (v) => Math.min(100, Math.max(0, v));

/**
 * Weight multiplier for a gauge: 1 above 60, rises linearly up to `boost`
 * at 0, and drops to `satisfied` (< 1) above 90 so the animal doesn't
 * repeat an activity it doesn't need.
 */
export function needMultiplier(value, { boost = 4, satisfied = 0.3 } = {}) {
  if (value >= 90) return satisfied;
  if (value >= 60) return 1;
  return 1 + ((60 - value) / 60) * (boost - 1);
}

/**
 * Filters the `needs` section of a pack.json: the `decayPerHour` rates
 * (numbers >= 0, known gauges), the `diet` (known foods and plants -> a
 * satiety gain > 0) and `prey` (known species -> a gain) pass through, the
 * rest is reported.
 * @param {object} [raw]
 * @returns {{rates: Record<string, number>, diet: Record<string, number>, prey: Record<string, number>, ignored: string[]}}
 */
export function needsOverrides(raw = {}) {
  const rates = {};
  const diet = {};
  const prey = {};
  const ignored = [];
  for (const [key, value] of Object.entries(raw ?? {})) {
    if ((key !== 'decayPerHour' && key !== 'diet' && key !== 'prey') || !value || typeof value !== 'object') {
      ignored.push(key);
      continue;
    }
    if (key === 'diet') {
      for (const [food, gain] of Object.entries(value)) {
        if ((FOODS[food] || PLANTS[food]) && Number.isFinite(gain) && gain > 0) diet[food] = gain;
        else ignored.push(`diet.${food}`);
      }
      continue;
    }
    if (key === 'prey') {
      for (const [kind, gain] of Object.entries(value)) {
        if (PREY[kind] && Number.isFinite(gain) && gain > 0) prey[kind] = gain;
        else ignored.push(`prey.${kind}`);
      }
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
  return { rates, diet, prey, ignored };
}

export class Needs {
  /**
   * @param {{rates?: Record<string, number>, rateScale?: number}} [options]
   *   rates: hourly rates that override the defaults;
   *   rateScale: difficulty * (vacation mode ? 0 : 1).
   */
  constructor({ rates = {}, rateScale = 1 } = {}) {
    this.rates = { ...DEFAULT_DECAY_PER_HOUR, ...rates };
    this.rateScale = rateScale;
    this.autonomyFactor = 1; // 1 - RELIEF * autonomy: slows the gauges' decay
    this.values = {};
    for (const g of NEED_GAUGES) this.values[g] = INITIAL_LEVEL;
    this.values.health = 100;
  }

  /** Autonomy (0-1): the more the animal fends for itself, the more slowly its needs drop. */
  setAutonomy(level) {
    this.autonomyFactor = 1 - RELIEF * Math.min(1, Math.max(0, level));
  }

  setRateScale(scale) {
    this.rateScale = Math.max(0, scale);
  }

  /**
   * @param {number} dt seconds
   * @param {{sleeping?: boolean, active?: boolean, sleepFactor?: number}} [activity]
   *   sleepFactor: energy-gain multiplier while sleeping (bed)
   */
  advance(dt, { sleeping = false, active = false, sleepFactor = 1 } = {}) {
    if (this.rateScale <= 0 || dt <= 0) return;
    const hours = dt / 3600;
    const decayFactor = sleeping ? SLEEP_DECAY_FACTOR : 1;

    for (const g of NEED_GAUGES) {
      this.values[g] = clamp100(
        this.values[g] - this.rates[g] * this.rateScale * this.autonomyFactor * decayFactor * hours,
      );
    }
    if (sleeping) {
      this.values.energy = clamp100(this.values.energy + SLEEP_ENERGY_GAIN_PER_HOUR * sleepFactor * this.rateScale * hours);
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

  /** Meal: extra satiety (clamped); eating also lowers relief. */
  feed(amount) {
    this.boost('satiety', amount);
    this.boost('relief', -amount * RELIEF_COST_OF_EATING);
  }

  /** The animal relieved itself: the gauge goes back up. */
  relieve() {
    this.boost('relief', RELIEF_RESTORED);
  }

  boost(gauge, delta) {
    if (!ALL_GAUGES.includes(gauge) || !Number.isFinite(delta)) return;
    this.values[gauge] = clamp100(this.values[gauge] + delta);
  }

  /** Waking from hibernation: gauges rise back to a middling level. */
  revive() {
    for (const g of NEED_GAUGES) this.values[g] = Math.max(this.values[g], 50);
    this.values.affection = Math.max(this.values.affection, 60);
    this.values.health = Math.max(this.values.health, 50);
  }

  /** Applies a recognized event (see EVENT_EFFECTS), ignores others. */
  apply(event) {
    const effects = EVENT_EFFECTS[event];
    if (!effects) return;
    for (const [gauge, delta] of Object.entries(effects)) {
      this.values[gauge] = clamp100(this.values[gauge] + delta);
    }
  }

  /**
   * Catches up on time spent with the extension off: half rate, capped, no
   * effect in vacation mode (rateScale 0).
   */
  catchUp(seconds, { cap = CATCH_UP_CAP_SECONDS, factor = CATCH_UP_FACTOR } = {}) {
    if (!(seconds > 0)) return;
    const effective = Math.min(seconds, cap) * factor;
    // Not in a single block: health depends on the average, which shifts as we go.
    const steps = 24;
    for (let i = 0; i < steps; i++) this.advance(effective / steps, {});
  }

  _average() {
    return NEED_GAUGES.reduce((sum, g) => sum + this.values[g], 0) / NEED_GAUGES.length;
  }

  /** Mood 0-100: average of the needs, weighted by health. */
  get mood() {
    return this._average() * (0.5 + (0.5 * this.values.health) / 100);
  }

  /** Most pressing need (`health` takes priority), or null. */
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

  /** Restores saved gauges; any missing or invalid value keeps its current one. */
  restore(saved) {
    if (!saved || typeof saved !== 'object') return;
    for (const g of ALL_GAUGES) {
      if (Number.isFinite(saved[g])) this.values[g] = clamp100(saved[g]);
    }
  }
}
