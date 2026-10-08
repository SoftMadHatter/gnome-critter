// An animal's life: growth stages, personality, appearance, evolution
// depending on the care received, and hibernation if neglected. Pure
// module, no GNOME: the Critter holds an instance of it.

export const STAGES = Object.freeze(['egg', 'baby', 'young', 'adult', 'senior']);
export const TRAITS = Object.freeze(['playful', 'lazy', 'greedy', 'shy']);

const HOUR = 3600;

/** Age (hours) at which each stage starts. */
export const DEFAULT_STAGE_HOURS = Object.freeze({ baby: 0.25, young: 6, adult: 48, senior: 720 });

const DEFAULT_SCALES = Object.freeze({ egg: 1, baby: 0.5, young: 0.75, adult: 1, senior: 1 });

/** Per-stage factors: speed, behaviour weights, need decay rates (`all` = every gauge). */
const STAGE_MODIFIERS = {
  egg: {},
  baby: { speed: 0.7, weights: { sleepWeight: 1.5 }, decay: { all: 1.2 } },
  young: {},
  adult: {},
  senior: { speed: 0.8, weights: { sleepWeight: 1.3 } },
};

const LAZY_ENERGETIC = 0.6;
const TRAIT_MODIFIERS = {
  playful: { weights: { playWeight: 1.6, runWeight: 1.5 }, decay: { stimulation: 1.4 } },
  lazy: {
    weights: {
      sleepWeight: 1.8, runWeight: LAZY_ENERGETIC, flyWeight: LAZY_ENERGETIC, flyFastWeight: LAZY_ENERGETIC,
      swimFastWeight: LAZY_ENERGETIC, climbSeekWeight: LAZY_ENERGETIC,
    },
    decay: { energy: 0.8 },
  },
  greedy: { weights: { foodWeight: 1.5 }, decay: { satiety: 1.4 } },
  shy: { weights: { greetWeight: 0.4, followWeight: 0.6, fleeWeight: 1.5 }, decay: {} },
};

const YEAR_SECONDS = 365 * 24 * HOUR;
const BIRTHDAY_DAY_SECONDS = 24 * HOUR; // how long the birthday is celebrated for

const NEGLECT_HEALTH_BELOW = 15;
const NEGLECT_SECONDS = 6 * HOUR;
const CARE_TIME_CONSTANT = 12 * HOUR;
const CATCH_UP_CAP_SECONDS = 8 * HOUR;
const CATCH_UP_FACTOR = 0.5;

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const randRange = ([min, max], random) => min + random() * (max - min);

/**
 * Combined factors of a trait and a stage.
 * @returns {{weights: Record<string, number>, speed: number, decay: Record<string, number>}}
 */
export function modifiersFor(trait, stage) {
  const weights = {};
  const decay = {};
  let speed = 1;
  for (const mod of [STAGE_MODIFIERS[stage] ?? {}, TRAIT_MODIFIERS[trait] ?? {}]) {
    speed *= mod.speed ?? 1;
    for (const [k, f] of Object.entries(mod.weights ?? {})) weights[k] = (weights[k] ?? 1) * f;
    for (const [k, f] of Object.entries(mod.decay ?? {})) decay[k] = (decay[k] ?? 1) * f;
  }
  return { weights, speed, decay };
}

/** Validates the `stages` section of a pack.json: per-stage display scale. */
export function stagesOverrides(raw = {}) {
  const scales = {};
  const folders = {};
  const ignored = [];
  for (const [stage, def] of Object.entries(raw ?? {})) {
    if (!STAGES.includes(stage) || !def || typeof def !== 'object') {
      ignored.push(stage);
      continue;
    }
    const hasFolder = def.folder !== undefined;
    const folderOk = typeof def.folder === 'string' && /^[\w-]+(\/[\w-]+)*$/.test(def.folder);
    const scaleOk = Number.isFinite(def.scale) && def.scale >= 0.25 && def.scale <= 2;
    // With a folder, the scale is optional (1: the sheets are already the right size).
    if ((hasFolder && !folderOk) || (def.scale !== undefined && !scaleOk) || (!hasFolder && !scaleOk)) {
      ignored.push(stage);
      continue;
    }
    if (hasFolder) folders[stage] = def.folder;
    scales[stage] = scaleOk ? def.scale : 1;
  }
  return { scales, folders, ignored };
}

export class Life {
  /**
   * @param {object} [state]
   * @param {{stageHours?: object, scales?: object}} [options]
   */
  constructor(state = {}, { stageHours = {}, scales = {} } = {}) {
    this.stageHours = { ...DEFAULT_STAGE_HOURS, ...stageHours };
    this.scales = { ...DEFAULT_SCALES, ...scales };
    this.sizeFactor = 1; // the player's size setting, applied on top of the stage scale
    this.trait = TRAITS.includes(state.trait) ? state.trait : null; // null: neutral
    this.ageSeconds = Number.isFinite(state.ageSeconds) ? Math.max(0, state.ageSeconds) : this.stageHours.adult * HOUR;
    this.appearance = { hue: 0, tone: 0, saturation: 1, ...state.appearance };
    this.care = Number.isFinite(state.care) ? clamp(state.care, 0, 100) : 80;
    this.neglectSeconds = Number.isFinite(state.neglectSeconds) ? Math.max(0, state.neglectSeconds) : 0;
    this.hibernating = state.hibernating === true;
    this.evolution = ['devoted', 'normal', 'neglected'].includes(state.evolution) ? state.evolution : null;
    this._birthdays = Math.floor(this.ageSeconds / YEAR_SECONDS); // birthdays already celebrated
  }

  /** An adult with a personality and a colour rolled at random. */
  static create(random, { growth = true, hueRange = [-35, 35], ...options } = {}) {
    const life = new Life(
      {
        trait: TRAITS[Math.min(TRAITS.length - 1, Math.floor(random() * TRAITS.length))],
        appearance: { hue: randRange(hueRange, random), tone: random() * 360, saturation: 1 },
        ageSeconds: growth ? 0 : undefined,
      },
      options,
    );
    if (!growth) life.evolution = 'normal';
    return life;
  }

  get stage() {
    const hours = this.ageSeconds / HOUR;
    if (hours >= this.stageHours.senior) return 'senior';
    if (hours >= this.stageHours.adult) return 'adult';
    if (hours >= this.stageHours.young) return 'young';
    if (hours >= this.stageHours.baby) return 'baby';
    return 'egg';
  }

  get scale() {
    return this.scales[this.stage] * this.sizeFactor;
  }

  /** Displayable age in seconds of life elapsed. */
  snapshot() {
    return {
      stage: this.stage,
      scale: this.scale,
      trait: this.trait,
      appearance: this.appearance,
      hibernating: this.hibernating,
      evolution: this.evolution,
      ageSeconds: this.ageSeconds,
      birthdayToday: this.ageSeconds >= YEAR_SECONDS && this.ageSeconds % YEAR_SECONDS < BIRTHDAY_DAY_SECONDS,
      hatchProgress: Math.min(1, this.ageSeconds / (this.stageHours.baby * HOUR)), // 0-1 while in the egg
    };
  }

  /**
   * @param {number} dt real seconds
   * @param {{mood: number, health: number, ageScale?: number, needsScale?: number}} state
   *   ageScale: growth speed (chosen speed, 0 on vacation);
   *   needsScale: difficulty (0 on vacation), for neglect.
   * @returns {string[]} transitions: `hatched`, `grew`, `evolved`, `hibernated`
   */
  advance(dt, { mood, health, ageScale = 1, needsScale = 1 }) {
    if (this.hibernating || dt <= 0) return [];
    const events = [];
    const before = this.stage;

    if (ageScale > 0) {
      this.ageSeconds += dt * ageScale;
      this.care += (mood - this.care) * Math.min(1, (dt * ageScale) / CARE_TIME_CONSTANT);
    }
    const after = this.stage;
    if (after !== before) {
      events.push(before === 'egg' ? 'hatched' : 'grew');
      if (STAGES.indexOf(before) < STAGES.indexOf('adult') && STAGES.indexOf(after) >= STAGES.indexOf('adult')) {
        this._evolve();
        events.push('evolved');
      }
    }

    const years = Math.floor(this.ageSeconds / YEAR_SECONDS);
    if (years > this._birthdays) {
      this._birthdays = years;
      events.push('birthday');
    }

    if (before !== 'egg' && needsScale > 0) {
      const weight = dt * needsScale * Math.max(1, ageScale);
      if (health < NEGLECT_HEALTH_BELOW) this.neglectSeconds += weight;
      else this.neglectSeconds = Math.max(0, this.neglectSeconds - weight * 2);
      if (this.neglectSeconds >= NEGLECT_SECONDS) {
        this.hibernating = true;
        events.push('hibernated');
      }
    }
    return events;
  }

  /** Appearance variant fixed when reaching adulthood, based on the average care received. */
  _evolve() {
    if (this.care >= 70) {
      this.evolution = 'devoted';
      this.appearance = { ...this.appearance, saturation: 1.2 };
    } else if (this.care < 40) {
      this.evolution = 'neglected';
      this.appearance = { ...this.appearance, saturation: 0.7 };
    } else {
      this.evolution = 'normal';
    }
  }

  /** Waking from hibernation (the player's doing). @returns {boolean} true if it was hibernating */
  wake() {
    if (!this.hibernating) return false;
    this.hibernating = false;
    this.neglectSeconds = 0;
    return true;
  }

  /** Time spent with the extension off: growth at half speed, capped, no neglect. */
  catchUp(seconds, { ageScale = 1 } = {}) {
    if (!(seconds > 0) || this.hibernating) return [];
    const effective = Math.min(seconds, CATCH_UP_CAP_SECONDS) * CATCH_UP_FACTOR;
    return this.advance(effective, { mood: this.care, health: 100, ageScale, needsScale: 0 });
  }

  serialize() {
    return {
      trait: this.trait,
      ageSeconds: Math.round(this.ageSeconds),
      appearance: {
        hue: Math.round(this.appearance.hue * 10) / 10,
        tone: Math.round(this.appearance.tone * 10) / 10,
        saturation: this.appearance.saturation,
      },
      care: Math.round(this.care * 10) / 10,
      neglectSeconds: Math.round(this.neglectSeconds),
      hibernating: this.hibernating,
      evolution: this.evolution,
    };
  }

  /** Restores a saved life; invalid values fall back to defaults. */
  restore(saved) {
    if (!saved || typeof saved !== 'object') return;
    const appearance = saved.appearance && typeof saved.appearance === 'object' ? saved.appearance : {};
    const fresh = new Life(
      {
        ...saved,
        appearance: {
          hue: Number.isFinite(appearance.hue) ? appearance.hue : 0,
          tone: Number.isFinite(appearance.tone) ? appearance.tone : 0,
          saturation: Number.isFinite(appearance.saturation) ? clamp(appearance.saturation, 0.3, 1.5) : 1,
        },
      },
      { stageHours: this.stageHours, scales: this.scales },
    );
    Object.assign(this, {
      _birthdays: fresh._birthdays,
      trait: fresh.trait,
      ageSeconds: fresh.ageSeconds,
      appearance: fresh.appearance,
      care: fresh.care,
      neglectSeconds: fresh.neglectSeconds,
      hibernating: fresh.hibernating,
      evolution: fresh.evolution,
    });
  }
}
