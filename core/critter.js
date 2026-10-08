import { clamp, sign } from './vec2.js';
import { Needs, needMultiplier, NEED_GAUGES } from './needs.js';
import { Life, modifiersFor, STAGES } from './life.js';
import { Stats } from './stats.js';
import { newlyUnlocked } from './achievements.js';
import { seasonOf, holidaysOn } from './calendar.js';
import { edibleFor, consume, bedsOn, toysFor, kick, push, pickGift, litterFor, isDirty, isOldMess } from './items.js';
import { TrickBook, TRICKS } from './tricks.js';
import { sanitizeName } from './names.js';
import { autonomyLevel } from './autonomy.js';
import {
  findSurfaceBelow,
  isOnSegment,
  findSegmentById,
  findWallById,
  findWallNear,
  findCeilingAbove,
  ceilingRun,
  findReachableWall,
  findDropEdges,
  findLedgeAtWallTop,
  DROP_PROBE,
  findReachableShelf,
  isInsideAnyMonitor,
  respawnPoint,
  groundPoint,
} from './surfaceMap.js';

/** Possible states. Deliberately a simple string union: easy to
 * serialize, log, and map to an animation name in a pack. */
export const State = Object.freeze({
  IDLE: 'idle',
  WALK: 'walk',
  FALL: 'fall',
  DRAG: 'drag',
  CLIMB: 'climb', // on a wall, vertical
  CEILING: 'ceiling', // walks on the ceiling, upside down
  SWIM: 'swim',
  FLY: 'fly',
  RUN: 'run', // fast walk (same mechanic as WALK)
  SWIM_FAST: 'swimFast', // fast swim (same sessions as SWIM)
  FLY_FAST: 'flyFast', // fast flight (same sessions as FLY, also lands)
  DIVE: 'dive', // dive at the end of a flight toward the targeted surface
  SLEEP: 'sleep',
  WASH: 'wash', // timed passive idle, washes in place (same mechanism as SLEEP)
  FOLLOW: 'follow', // walks toward the cursor, target recalculated continuously
  GREET: 'greet', // walks toward the nearest critter, greets it on arrival
  SEEK_WALL: 'seekWall', // walks toward a reachable wall to climb deliberately
  SEEK_FOCUS: 'seekFocus', // walks toward the window that just took focus
  SEEK_NAP: 'seekNap', // walks toward a nearby window ledge before falling asleep
  CHASE: 'chase', // chases a specific target (a fixed reference, not "the nearest one")
  FLEE: 'flee', // moves away from a pursuer
  SEEK_FOOD: 'seekFood', // heads toward a targeted food
  EAT: 'eat', // eating, motionless
  EGG: 'egg', // egg: motionless, resting, until it hatches
  HIBERNATE: 'hibernate', // hibernation after prolonged neglect
  PLAY: 'play', // reaches and plays with a toy, or chases the laser pointer
  BRUSHED: 'brushed', // lets itself be brushed, motionless
  TRICK: 'trick', // performs a trick (sit, roll...)
  RELIEVE: 'relieve', // goes to the litter box (or a corner) and relieves itself
  HUNT: 'hunt', // chases prey (an autonomous animal)
  GIFT: 'gift', // brings a gift to the cursor
  REMIND: 'remind', // comes to the cursor to remind the player to take a break
});

/** Surface types a species can know how to use. */
export const Locomotion = Object.freeze({
  GROUND: 'ground', // ground + window ledges ('ground'/'shelf' segments)
  WALL: 'wall',
  CEILING: 'ceiling',
  WATER: 'water',
  AIR: 'air',
});

/** Raw gesture detected on the extension side -> thematic event name emitted
 * (and thus the reaction name in pack.json). Centralized here to stay easy
 * to tweak without digging through Clutter event detection. */
const INTERACTION_REACTIONS = {
  click: 'petted',
  doubleClick: 'tickled',
  rightClick: 'annoyed',
  hover: 'noticed',
  windowOpened: 'startled',
  notification: 'noticed', // a notification arrives (content never read)
  typing: 'noticed', // the player is typing (keys never read), throttled by typingCooldown
  userReturned: 'greeted', // the player returns after being away
  meetCritter: 'greeted', // set on THE TARGET of a GREET (see _tickGreet): arrives between two of its own ticks, so through interact()/_pendingEvent like other external events -- unlike the initiator, which sets this.lastEvent directly since that happens WITHIN its own tick.
};

/** States where the animal exerts itself (stimulation gain, see Needs.advance). */
/** Counter incremented on every animal event. */
const EVENT_STATS = {
  ate: 'meals', played: 'playSessions', brushed: 'brushes', purring: 'purrs', petted: 'pets', greeted: 'greets',
  tickled: 'tickles', startled: 'startles', awakened: 'awakenings', annoyed: 'annoyances', sick: 'sicknesses',
  birthday: 'birthdays',
};

/** Activity counters: entering a state from a state not part of the same group. */
const STATE_GROUPS = [
  ['climbs', new Set(['climb'])],
  ['flights', new Set(['fly', 'flyFast', 'dive'])],
  ['dives', new Set(['dive'])],
  ['swims', new Set(['swim', 'swimFast'])],
  ['runs', new Set(['run'])],
  ['naps', new Set(['sleep'])],
  ['drags', new Set(['drag'])],
  ['falls', new Set(['fall'])],
  ['follows', new Set(['follow'])],
  ['flees', new Set(['flee'])],
  ['chases', new Set(['chase'])],
  ['washes', new Set(['wash'])],
  ['ceilingWalks', new Set(['ceiling'])],
];

/** A target closer than this (px) along x doesn't turn the critter around. */
const FACING_DEADZONE = 0.5;

const ACTIVE_STATES = new Set([
  State.WALK, State.RUN, State.CLIMB, State.CEILING, State.SWIM, State.SWIM_FAST,
  State.FLY, State.FLY_FAST, State.DIVE, State.FOLLOW, State.GREET, State.SEEK_WALL,
  State.SEEK_FOCUS, State.SEEK_NAP, State.CHASE, State.FLEE, State.SEEK_FOOD, State.PLAY, State.REMIND, State.GIFT, State.HUNT,
]);

/** Idle activities whose weight follows stimulation (the animal is bored: it moves). */
const ENERGETIC_ACTIVITIES = new Set(['run', 'fly', 'flyFast', 'swim', 'swimFast', 'climb']);

/** Gestures that wake up a sleeping animal. */
const WAKING_GESTURES = new Set(['click', 'doubleClick', 'rightClick']);

const DEFAULT_CONFIG = {
  speciesId: 'unknown',
  needsRateScale: 1, // difficulty * (vacation mode ? 0 : 1), see core/needs.js
  needsRates: {}, // species-specific hourly rates (pack's `needs` section, filtered by needsOverrides)
  lifeAgeScale: 1, // growth speed (setting), 0 in vacation mode
  stageScales: {}, // per-stage display scale (pack's `stages` section, filtered by stagesOverrides)
  needsDiet: {}, // food -> satiety gain (pack's `needs.diet` section); a missing food is ignored
  foodWeight: 40, // multiplied by hunger: a hungry animal prefers eating, a full one ignores it
  foodSeekDuration: [6, 12], // maximum time to reach a food
  eatDuration: [2, 4], // duration of a bite
  eatMoreBelow: 80, // satiety below which it chains into the next bite; above, it leaves a leftover
  bedSleepFactor: 1.5, // energy-gain multiplier while sleeping on a bed
  bedRadius: 24, // distance below which it sleeps "on" the bed
  playWeight: 30, // multiplied by boredom: a bored animal plays
  laserWeight: 80, // active laser pointer mode: it rushes to it
  playDuration: [6, 12],
  kickDistance: 18, // distance below which it "touches" the ball
  kickInterval: 1.2, // seconds between two kicks
  floatingPlayChance: 0.2, // a bored groundless species: chance per second of going to play with a floating toy
  floatingPlayBelow: 60, // stimulation below which it's bored enough to go
  petStreakWindow: 3, // max seconds between two pets of the same streak
  petStreakMin: 3, // pets for the streak to turn into purring
  brushDuration: 4,
  nightSleepFactor: 3, // night: sleep weight
  nightEnergeticFactor: 0.4, // night: weight of energetic activities
  awaySleepFactor: 4, // player away: sleep weight
  awayEnergeticFactor: 0.3,
  remindWeight: 1000, // a break reminder was requested: it wins out
  remindDuration: 25, // seconds spent near the cursor
  tricks: [], // the species' tricks (pack's `tricks` list, filtered by tricksOverrides)
  giftWeight: 6, // rare: a very affectionate animal brings back a gift
  giftCooldown: 1200, // seconds between two gifts
  giftAffection: 70, // minimum affection to give one
  giftDuration: [12, 25],
  giftChancePerSecond: 0.01, // a groundless species: chance per second of going to give one
  autonomyMode: 'auto', // `auto` (follows growth), `off`, `partial`, `full` (see core/autonomy.js)
  needsPrey: {}, // hunted prey -> satiety gain (pack's `needs.prey` section)
  huntWeight: 30, // multiplied by autonomy and hunger
  grazeWeight: 15, // same, for plants
  huntDuration: 12, // seconds of pursuit at most
  catchDistance: 14, // distance at which it catches the prey
  reliefWeight: 60, // multiplied by urgency: an animal in a hurry goes right away
  reliefDuration: 3.5, // seconds crouched
  accidentBelow: 8, // relief level below which the animal relieves itself in place
  accidentCleanlinessLoss: 15,
  messRadius: 200, // distance at which a mess bothers it
  messCleanlinessLoss: 6, // cleanliness lost per hour and per nearby mess (three at most)
  oldMessHealthLoss: 5, // health lost per hour and per nearby old mess (three at most)
  moldSickness: 20, // health lost from eating moldy food
  achievements: [], // the pack's achievements (`achievements` section, filtered by achievementsOverrides)
  typingCooldown: 20, // minimum seconds between two reactions to typing
  walkSpeed: 40, // px/s
  climbSpeed: 30,
  swimSpeed: 25,
  flySpeed: 60,
  gravity: 900, // px/s^2
  terminalVelocity: 800,
  idleDuration: [1.5, 4], // seconds, [min, max]
  walkDuration: [1, 3],
  // Relative weights of the weighted choice made by _tickWaiting between
  // idle activities (see weightedChoice below): no need to sum to 1, only
  // relative importance matters. Values chosen to keep the feel of the old
  // independent probabilities (5%/6%/12%/rest).
  walkWeight: 77,
  sleepWeight: 5,
  sleepDuration: [20, 90], // seconds; each species sets its own (the cat goes up to 15 minutes)
  washWeight: 6,
  washDuration: [3, 6],
  followWeight: 12,
  followDuration: [2, 4],
  followMaxDistance: 600, // beyond this, following the cursor becomes very unlikely (not impossible)
  greetWeight: 10,
  greetDuration: [2, 4],
  greetMaxDistance: 600,
  greetDistance: 20, // distance below which it's considered to have "reached" the other critter
  climbSeekWeight: 10,
  climbSeekDuration: [3, 6],
  climbSeekMaxDistance: 600,
  exploreWeight: 6, // walking to the end of a surface and stepping off (ledge -> ground, one screen -> the next)
  dropMaxHeight: 500,
  climbApproachDistance: 6, // distance below which it's considered to have "reached" the wall
  ceilingMinRun: 32, // a ceiling with less room to walk than this isn't latched onto
  seekFocusWeight: 10,
  seekFocusDuration: [3, 6],
  seekFocusMaxDistance: 600,
  seekFocusDistance: 20, // distance below which it's considered to have "reached" the window
  chaseChance: 0.4, // probability of chaining into a chase after a successful GREET
  chaseDuration: [2, 4],
  fleeWeight: 50,
  fleeMaxDistance: 600,
  fleeDuration: [2, 4],
  napSeekMaxDistance: 400, // local search, shorter than the 600 of other behaviours ("nearby", not "anywhere on screen")
  napSeekDuration: [3, 6],
  napApproachDistance: 6,
  runWeight: 10,
  runSpeedFactor: 2.2, // multiplier of walkSpeed
  swimFastWeight: 4,
  swimFastFactor: 2.2,
  flyFastWeight: 4,
  flyFastFactor: 2.2,
  fastChance: 0.2, // a groundless species: probability that a newly chained session is fast
  diveChance: 0.25, // probability PER SECOND of diving when the target is low enough and the angle steep
  diveMinHeight: 120, // minimum height difference (px) toward the target to dive
  diveSpeedFactor: 3.5,
  flyCruiseChance: 0.6, // probability of first climbing to a cruising altitude on takeoff
  swimRetargetDuration: [5, 10], // retargeting cadence while swimming (free flight keeps roamRetargetDuration)
  swimTurnMax: 60, // degrees: maximum turn on each swim retarget
  flyWeight: 8,
  flyDuration: [4, 8],
  swimWeight: 8,
  swimDuration: [4, 8],
  flyRetargetChance: 0.01, // probability PER SECOND of changing landing target mid-flight (very rare)
  roamRetargetDuration: [1, 3], // retargeting cadence during a FLY/SWIM session
  swimWaveFrequency: 4, // rad/s, swim stroke cadence
  swimWaveAmplitude: 0.6, // fraction of the component perpendicular to the direct path (< 1: stays oriented toward the target)
  repeatPenalty: 0.3, // weight multiplier if the last special activity was already this one
  supportedSurfaces: new Set([Locomotion.GROUND]),
  random: Math.random,
};

/**
 * Draws a uniform float in [min, max] with the given random function
 * (replaceable for deterministic tests).
 */
function randRange([min, max], random) {
  return min + random() * (max - min);
}

/**
 * Picks a random candidate, proportionally to its weight (weights don't
 * need to sum to 1, only their relative importance matters).
 * @param {{value: *, weight: number}[]} candidates
 * @param {() => number} random
 * @returns {*} null if the sum of the weights is <= 0 (no valid candidate)
 */
export function weightedChoice(candidates, random) {
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return null;

  let r = random() * total;
  for (const c of candidates) {
    if (r < c.weight) return c.value;
    r -= c.weight;
  }
  return candidates[candidates.length - 1].value; // floating-point safety net
}

/**
 * Filters a pack.json's `behavior` section before applying it: only keys
 * already in DEFAULT_CONFIG, of type number or a [min, max] range, pass
 * through. random (function), supportedSurfaces (Set) and unknown keys
 * are dropped: a JSON file must never be able to break the core.
 * @param {object} [raw]
 * @returns {{config: object, ignored: string[]}}
 */
export function behaviorOverrides(raw = {}) {
  const config = {};
  const ignored = [];
  for (const [key, value] of Object.entries(raw)) {
    const def = DEFAULT_CONFIG[key];
    const isNumber = typeof def === 'number' && typeof value === 'number' && Number.isFinite(value);
    const isRange =
      Array.isArray(def) &&
      Array.isArray(value) &&
      value.length === 2 &&
      value.every((v) => typeof v === 'number' && Number.isFinite(v));
    if (isNumber || isRange) config[key] = value;
    else ignored.push(key);
  }
  return { config, ignored };
}

export class Critter {
  /**
   * @param {Partial<typeof DEFAULT_CONFIG>} config
   * @param {{x: number, y: number}} initialPosition
   */
  constructor(config, initialPosition) {
    this._baseConfig = { ...DEFAULT_CONFIG, ...config };
    this.config = { ...this._baseConfig };
    this.needs = new Needs({ rates: this.config.needsRates, rateScale: this.config.needsRateScale });
    this._baseRates = { ...this.needs.rates };
    /** A neutral adult by default: the Manager provides the real life (egg,
     * trait, colour) via setLife(), which keeps the core deterministic for tests. */
    this.life = new Life({}, { scales: this.config.stageScales });
    this.x = initialPosition.x;
    this.y = initialPosition.y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1; // 1 = right, -1 = left
    this.state = State.FALL; // at startup, it falls until it finds a surface
    this.stateTimer = 0;
    this.currentSurface = null;
    this.walkTargetX = null;
    this._dropDir = null; // set while walking to an edge to step off (`explore`)
    this.wallSide = null; // 'left' | 'right' during CLIMB
    /** True after leaving a ceiling: the fall grabs no wall until landing (otherwise it could climb back up and cycle). */
    this._noGrab = false;
    this._dragTarget = null;
    /** Last special activity chosen by _tickWaiting ('sleep'/'wash'/
     * 'follow', never 'walk'): used as an anti-repetition memory. */
    this._lastActivity = null;
    /** Specific Critter reference chased during CHASE (not recomputed by
     * proximity, unlike FOLLOW/GREET/SEEK_WALL/SEEK_FOCUS). */
    this._chaseTarget = null;
    /** Critter reference being moved away from during FLEE. */
    this._fleeFrom = null;
    /** Invitation set by proposeChase(): just one more opportunity for
     * _tickWaiting's weighted choice, not an order -- can be ignored if
     * another candidate wins the draw. */
    this._chaseInvitation = null;
    /** Countdown to the next retarget during FLY/SWIM (undefined until a
     * session has started: _tickRoam handles that, see its guard). */
    this._roamTimer = undefined;
    /** Phase of the swim wave (State.SWIM), continuous from one session to the next. */
    this._swimPhase = undefined;
    /** Last notable event (to trigger a sound/a reaction), cleared every tick. */
    this.lastEvent = null;
    /** Event set by a public method (pet/startDrag/...) between two ticks.
     * Not written directly into lastEvent because tick() clears lastEvent
     * on entry: without this queue, an event set just before tick() would
     * be wiped before the caller could read it. */
    this._pendingEvent = null;
    this._clock = 0;
    this._lastPetAt = -Infinity;
    this._petStreak = 0;
    this._playTarget = null;
    this._lastTypingAt = -Infinity;
    this._acknowledged = false;
    this.stats = new Stats();
    this.autonomy = 0; // current autonomy level (recomputed every tick)
    this._reliefTarget = null;
    this._pendingMess = null;
    this._huntTarget = null;
    this.tricks = new TrickBook();
    this._trick = null;
    this._lastGiftAt = 0; // the first gift only arrives after giftCooldown seconds of activity
    this._pendingGift = null;
    this._giftArrived = false;
    /** Accessory worn (id from core/accessories.js) or null. */
    this.accessory = null;
    /** The creature's name (chosen or rolled at birth), or null. */
    this.name = null;
    /** Achievements already earned and those to announce (see takeUnlocked). */
    this.unlocked = new Set();
    this._pendingUnlocked = [];
    /** Chosen title (id of the achievement that granted it), or null. */
    this.title = null;
    this._sleepStreak = 0;
    this._awakeStreak = 0; // seconds awake in a row ("All-nighter" mischief)
    this._fallStartY = null; // starting height of the current fall ("No parachute" mischief)
    this._now = null; // current date (ms), provided by the Manager (options.progress.now)
    this._achieveTimer = 0;
  }

  /** Replaces the life (egg, trait...) and recomputes the configuration that depends on it. */
  setLife(life) {
    this.life = life;
    this._recomputeConfig();
    // An egg (or a hibernating animal) replacing an already-active animal: if
    // resting, it goes straight to the still state; if airborne, it falls first.
    if (this._lifeFrozen() && this.state !== State.DRAG && this.state !== State.FALL) {
      if (this.currentSurface) this.state = this.life.hibernating ? State.HIBERNATE : State.EGG;
      else this._enterState(State.FALL);
    }
  }

  /**
   * Effective configuration = base configuration (defaults + pack) with
   * the trait and stage factors applied to weights and speeds, and the
   * need rates adjusted. Called again on every life change.
   */
  _recomputeConfig() {
    const mods = modifiersFor(this.life.trait, this.life.stage);
    const config = { ...this._baseConfig };
    for (const [key, factor] of Object.entries(mods.weights)) {
      if (typeof config[key] === 'number') config[key] *= factor;
    }
    for (const key of ['walkSpeed', 'climbSpeed', 'swimSpeed', 'flySpeed']) config[key] *= mods.speed;
    this.config = config;
    for (const gauge of NEED_GAUGES) {
      this.needs.rates[gauge] = this._baseRates[gauge] * (mods.decay[gauge] ?? 1) * (mods.decay.all ?? 1);
    }
  }

  setLifeAgeScale(scale) {
    this._baseConfig.lifeAgeScale = scale;
    this.config.lifeAgeScale = scale;
  }

  /** The player wakes the hibernating animal (a caring gesture): gauges restored, back to resting. */
  wake() {
    if (!this.life.wake()) return;
    this.stats.add('hibernationWakes');
    this.needs.revive();
    this._enterState(State.IDLE);
    this._pendingEvent = 'awakened';
  }

  _countEvent(event) {
    if (this.life.stage === 'egg') return;
    if (EVENT_STATS[event]) this.stats.add(EVENT_STATS[event]);
  }

  /** Activity, sleep and mark counters, and achievement evaluation (once a second). */
  _trackProgress(dt, previousState, options = {}) {
    if (this._lifeFrozen()) {
      this._sleepStreak = 0;
      return;
    }
    if (this.state !== previousState) {
      for (const [key, states] of STATE_GROUPS) {
        if (states.has(this.state) && !states.has(previousState)) this.stats.add(key);
      }
      if (this.state === State.FALL) {
        this._fallStartY = this.y;
        if (previousState === State.CEILING) this.stats.mark('moment', 'ceiling-fall');
      } else if (previousState === State.FALL && this._fallStartY !== null) {
        // A fall spanning almost the whole screen height.
        if (this.y - this._fallStartY >= (options.worldBounds?.height ?? 800) * 0.75) this.stats.mark('moment', 'skydive');
        this._fallStartY = null;
      }
      if (this.state === State.SLEEP && this.needs.values.satiety < 10) this.stats.mark('state', 'hungry-nap');
    }
    if (this.state === State.SLEEP) {
      this._sleepStreak += dt;
      this._awakeStreak = 0;
      this.stats.add('sleepSeconds', dt);
      this.stats.max('longestSleepSeconds', Math.floor(this._sleepStreak));
    } else {
      this._sleepStreak = 0;
      this._awakeStreak += dt;
    }

    this._achieveTimer += dt;
    if (this._achieveTimer < 1) return;
    this._achieveTimer = 0;
    this._markMoments();
    if (this.config.achievements.length === 0) return;
    const context = { trait: this.life.trait, stage: this.life.stage, facts: this.progressFacts() };
    for (const id of newlyUnlocked(this.config.achievements, context, this.unlocked)) {
      this.unlocked.add(id);
      this._pendingUnlocked.push(id);
    }
  }

  /** Marks recorded once a second: season, holidays, time of day, extreme gauges, current outfit. */
  _markMoments() {
    if (this._now !== null) {
      const date = new Date(this._now);
      this.stats.mark('season', seasonOf(date));
      for (const holiday of holidaysOn(date)) this.stats.mark('holiday', holiday);
      if (date.getHours() === 3 && this.state !== State.SLEEP) this.stats.mark('moment', 'night-owl');
    }
    if (this._awakeStreak >= 24 * 3600) this.stats.mark('moment', 'all-nighter');
    const levels = this.needs.values;
    if (levels.satiety <= 0) this.stats.mark('state', 'starving');
    if (levels.cleanliness <= 0) this.stats.mark('state', 'filthy');
    if (levels.stimulation <= 0) this.stats.mark('state', 'bored-stiff');
    if (NEED_GAUGES.every((gauge) => levels[gauge] >= 95) && levels.health >= 95) this.stats.mark('state', 'perfect');
    if (NEED_GAUGES.every((gauge) => levels[gauge] < 10)) this.stats.mark('state', 'rock-bottom');
    if (this.state === State.SLEEP && this.accessory === 'crown') this.stats.mark('state', 'royal-nap');
    if (this.state === State.SLEEP && this.accessory === 'glasses') this.stats.mark('state', 'glasses-nap');
    if (this.state === State.PLAY && this.accessory === 'sock') this.stats.mark('state', 'sock-play');
  }

  /** Achievement facts: counters, age, stage reached, tricks learned, achievements earned, marks. */
  progressFacts() {
    return {
      stats: {
        ...this.stats.counters,
        daysAlive: Math.floor(this.life.ageSeconds / 86400),
        stageReached: Math.max(0, STAGES.indexOf(this.life.stage)),
        tricksLearned: this.tricks.learned().length,
        achievementsUnlocked: this.unlocked.size,
      },
      marks: this.stats.marks,
    };
  }

  /** A player gesture toward the animal, counted for achievements: 'overfeed' (fed while not hungry). */
  noteAction(kind) {
    if (this.life.stage === 'egg') return;
    if (kind === 'overfeed') this.stats.add('overfeeds');
  }

  /** Picks a title among those earned (id of the achievement that granted it); null or an unearned title removes it. */
  setTitle(id) {
    this.title = typeof id === 'string' && this.unlocked.has(id) ? id : null;
  }

  /** Names the creature; an empty or invalid text changes nothing. */
  setName(text) {
    const name = sanitizeName(text);
    if (name !== null) {
      if (this.name !== null && name !== this.name) this.stats.add('renames');
      this.name = name;
    }
    return this.name;
  }

  /** Equips an accessory (the Manager checks it's bought or in season); null to remove it. */
  equip(id) {
    this.accessory = typeof id === 'string' ? id : null;
    if (this.accessory && this.life.stage !== 'egg') this.stats.mark('accessory', this.accessory);
  }

  /** Achievements unlocked since the last call (each one only once). */
  takeUnlocked() {
    const ids = this._pendingUnlocked;
    this._pendingUnlocked = [];
    return ids;
  }

  /** Persistence extension point: anything that needs to survive a
   * restart (mood, hunger... as the game grows) goes in `extra`. */
  serialize() {
    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      facing: this.facing,
      extra: {
        needs: this.needs.serialize(),
        life: this.life.serialize(),
        stats: this.stats.serialize(),
        achievements: [...this.unlocked],
        accessory: this.accessory,
        name: this.name,
        title: this.title,
        tricks: this.tricks.serialize(),
      },
    };
  }

  /** Falls again from the saved position: since surfaces may have
   * changed, it relies on whatever is now underneath. */
  restore(saved, { elapsedSeconds = 0 } = {}) {
    this.x = saved.x;
    this.y = saved.y;
    this.facing = saved.facing;
    if (saved.extra?.life) this.life.restore(saved.extra.life);
    this.stats.restore(saved.extra?.stats);
    this.tricks.restore(saved.extra?.tricks);
    this.name = sanitizeName(saved.extra?.name);
    this.accessory = typeof saved.extra?.accessory === 'string' ? saved.extra.accessory : null;
    if (Array.isArray(saved.extra?.achievements)) {
      this.unlocked = new Set(saved.extra.achievements.filter((id) => typeof id === 'string'));
    }
    this.setTitle(saved.extra?.title);
    this._recomputeConfig();
    this.needs.restore(saved.extra?.needs);
    if (!this._lifeFrozen()) this.needs.catchUp(elapsedSeconds);
    this.life.catchUp(elapsedSeconds, { ageScale: this.config.lifeAgeScale });
    this._recomputeConfig();
    this._enterState(State.FALL);
  }

  /**
   * After a resolution or monitor change, the animal can end up outside
   * every monitor: it then reappears at the top of the closest monitor
   * and falls. No effect during a drag (the user is holding it).
   * @param {{x:number,y:number,width:number,height:number}[]} monitors
   * @param {number} spriteHeight sprite height (y designates the feet)
   * @returns {boolean} true if it was repositioned
   */
  /** Needs and decisions on hold: while in the egg or hibernating. */
  _lifeFrozen() {
    return this.life.hibernating || this.life.stage === 'egg';
  }

  ensureVisible(monitors, spriteHeight) {
    if (this.state === State.DRAG || monitors.length === 0) return false;
    // One pixel above the feet: resting on a monitor's bottom edge, it's visible.
    if (isInsideAnyMonitor(monitors, this.x, this.y - 1)) return false;
    const point = respawnPoint(monitors, this.x, this.y, spriteHeight);
    if (!point) return false;
    this.x = point.x;
    this.y = point.y;
    this.vx = 0;
    this.vy = 0;
    this.currentSurface = null;
    this._enterState(State.FALL);
    this.stats.add('rescues');
    return true;
  }

  /**
   * After a suspend: brings the animal back to the ground (bottom of the closest monitor)
   * instead of leaving it stuck on the top bar or on a window. Ignores a grabbed animal and
   * groundless species (fish, flying ones), which don't "fall back down".
   * @returns {boolean} true if the animal was moved
   */
  regroundAfterResume(monitors) {
    if (this.state === State.DRAG || !this.supports(Locomotion.GROUND)) return false;
    const point = groundPoint(monitors, this.x, this.y);
    if (!point) return false;
    this.x = point.x;
    this.y = point.y;
    this.vx = 0;
    this.vy = 0;
    this.currentSurface = null;
    this._enterState(State.FALL);
    return true;
  }

  /** Live autonomy setting: `auto`, `off`, `partial` or `full`. */
  setAutonomyMode(mode) {
    this._baseConfig.autonomyMode = mode;
    this.config.autonomyMode = mode;
  }

  setNeedsRateScale(scale) {
    this.needs.setRateScale(scale);
  }

  supports(locomotion) {
    return this.config.supportedSurfaces.has(locomotion);
  }

  // --- User interactions -------------------------------------------------

  startDrag() {
    if (this.life.stage !== 'egg') {
      if (this.state === State.SLEEP) this.stats.mark('state', 'sleepwalk');
      if (this.state === State.EAT) this.stats.mark('state', 'dinner-thief');
    }
    this._releaseFood();
    this._playTarget = null;
    this._huntTarget = null;
    this.state = State.DRAG;
    this.vx = 0;
    this.vy = 0;
    this.currentSurface = null;
    this._pendingEvent = 'grabbed';
  }

  dragTo(x, y) {
    this._dragTarget = { x, y };
  }

  endDrag() {
    this.state = State.FALL;
    this.stateTimer = 0;
    this._pendingEvent = 'released';
  }

  pet() {
    this.interact('click');
  }

  /**
   * Sets a one-off reaction without touching the physical state (unlike
   * startDrag/endDrag, which also change state/vx/vy). `kind` is the raw
   * gesture detected on the extension side (e.g. 'doubleClick');
   * INTERACTION_REACTIONS maps it to the corresponding thematic event
   * name, so that mapping stays editable in one place.
   */
  interact(kind) {
    // In the egg: no interaction (neither reaction nor pet); only dragging remains possible.
    if (this.life.stage === 'egg') {
      if (kind === 'click') this.stats.add('eggPets'); // nothing happens, but the Committee counts it
      return;
    }
    let event = INTERACTION_REACTIONS[kind];
    if (kind === 'typing') {
      if (this._clock - this._lastTypingAt < this.config.typingCooldown) return;
      this._lastTypingAt = this._clock;
      this.stats.add('typingWatches');
    }
    if (kind === 'hover') this.stats.add('hovers');
    if (kind === 'notification') this.stats.add('notificationsSeen');
    if (kind === 'click' && this.state === State.EAT) this.stats.mark('state', 'pet-while-eating');
    if (kind === 'click' && this.state === State.RELIEVE) this.stats.mark('state', 'pet-while-relieving');
    if (kind === 'doubleClick' && this.state === State.SLEEP) this.stats.mark('state', 'tickle-sleep');
    if (kind === 'userReturned' && this.state === State.SLEEP) this._enterState(State.IDLE); // it greets you
    if (kind === 'click' && this.state === State.REMIND) {
      this._acknowledged = true; // the player saw the reminder
      this._enterState(State.IDLE);
    }
    if (kind === 'click') {
      // Pets close together form a streak: from the 3rd one, purring
      // (more affection) instead of a plain pet.
      this._petStreak = this._clock - this._lastPetAt <= this.config.petStreakWindow ? this._petStreak + 1 : 1;
      this._lastPetAt = this._clock;
      if (this._petStreak >= this.config.petStreakMin) event = 'purring';
    }
    if (event) this._pendingEvent = event;
    // Only a click wakes it up: neither hovering nor a window opening
    // does. A surface that moves or disappears under the animal wakes it
    // through falling instead (see _tickWaiting/_resyncCurrentSurface).
    if (this.state === State.SLEEP && WAKING_GESTURES.has(kind)) this._enterState(State.IDLE);
    if (this.state === State.HIBERNATE && WAKING_GESTURES.has(kind)) this.wake();
  }

  /**
   * Proposes a chase (used by CHASE, see _tickGreet): forces nothing,
   * just one more opportunity for _tickWaiting's weighted choice -- the
   * target can accept or ignore it on its next idle decision, same as
   * sleep/wash/follow/etc.
   */
  /** True only once after a click on the animal that came to remind about a break (the Manager resets the counter). */
  takeAcknowledgement() {
    const acknowledged = this._acknowledged;
    this._acknowledged = false;
    return acknowledged;
  }

  proposeChase(chaser) {
    if (this.life.stage === 'egg') return;
    this._chaseInvitation = chaser;
  }

  // --- Main loop ----------------------------------------------------

  /**
   * @param {number} dt seconds elapsed since the previous tick
   * @param {{segments: import('./surfaceMap.js').Segment[], walls: import('./surfaceMap.js').Wall[]}} surfaces
   * @param {{worldBounds: {x:number,y:number,width:number,height:number}, pointer: {x:number,y:number}, otherCritters: {x:number,y:number,critter?:Critter}[]}} options global bounds (union of the monitors, used by FLY/safety), cursor position (used by FOLLOW) and other critters' positions, with an optional reference to the instance (used by GREET to target and, on arrival, trigger a reaction on it)
   */
  tick(dt, surfaces, options = {}) {
    this._now = options.progress?.now ?? null;
    this.lastEvent = this._pendingEvent;
    this._pendingEvent = null;
    // An event coming from outside affects the gauges right away: the
    // tick's own logic can overwrite lastEvent afterward (e.g. 'sleep').
    const external = this.lastEvent;
    if (external) {
      this.needs.apply(external);
      this._countEvent(external);
    }
    const previousState = this.state;
    this.autonomy = autonomyLevel(this.config.autonomyMode, this.life, this.tricks.learned().length);
    this.needs.setAutonomy(this.autonomy);
    this.stateTimer -= dt;
    this._clock += dt;
    if (!this._lifeFrozen()) {
      this.needs.advance(dt, {
        sleeping: this.state === State.SLEEP,
        active: ACTIVE_STATES.has(this.state),
        sleepFactor: this._bedSleepFactor(options),
      });
    }
    this._applyLifeTransitions(
      this.life.advance(dt, {
        mood: this.needs.mood,
        health: this.needs.values.health,
        ageScale: this.config.lifeAgeScale,
        needsScale: this.needs.rateScale * (1 - this.autonomy), // an autonomous animal doesn't fall into neglect
      }),
    );

    // The window/ledge it landed on may have been closed, moved or
    // resized since the tick `currentSurface` was stored: it's looked up
    // again in THIS tick's freshly recomputed surfaces before acting,
    // otherwise we'd keep reasoning on stale coordinates (the critter
    // would stay suspended in mid-air).
    if (this.currentSurface && this.currentSurface.surfaceId !== undefined) {
      this._resyncCurrentSurface(surfaces);
    }

    switch (this.state) {
      case State.DRAG:
        this._tickDrag();
        break;
      case State.FALL:
        this._tickFall(dt, surfaces, options);
        break;
      case State.WALK:
        this._tickWalk(dt);
        break;
      case State.RUN:
        this._tickWalk(dt, this.config.walkSpeed * this.config.runSpeedFactor);
        break;
      case State.CLIMB:
        this._tickClimb(dt, surfaces);
        break;
      case State.CEILING:
        this._tickCeiling(dt);
        break;
      case State.SWIM:
      case State.SWIM_FAST:
        this._tickSwim(dt, options);
        break;
      case State.FLY:
      case State.FLY_FAST:
      case State.DIVE:
        this._tickFly(dt, surfaces, options);
        break;
      case State.FOLLOW:
        this._tickFollow(dt, options);
        break;
      case State.GREET:
        this._tickGreet(dt, options);
        break;
      case State.SEEK_WALL:
        this._tickSeekWall(dt, surfaces);
        break;
      case State.SEEK_FOCUS:
        this._tickSeekFocus(dt, options);
        break;
      case State.CHASE:
        this._tickChase(dt);
        break;
      case State.FLEE:
        this._tickFlee(dt);
        break;
      case State.SEEK_NAP:
        this._tickSeekNap(dt, surfaces, options);
        break;
      case State.SEEK_FOOD:
        this._tickSeekFood(dt);
        break;
      case State.EAT:
        this._tickEat(dt);
        break;
      case State.REMIND:
        this._tickRemind(dt, options);
        break;
      case State.HUNT:
        this._tickHunt(dt);
        break;
      case State.RELIEVE:
        this._tickRelieve(dt);
        break;
      case State.TRICK:
        this._tickTrick();
        break;
      case State.GIFT:
        this._tickGift(dt, options);
        break;
      case State.EGG:
      case State.HIBERNATE:
        this._tickResting();
        break;
      case State.PLAY:
        this._tickPlay(dt, options);
        break;
      case State.BRUSHED:
        this._tickBrushed(dt);
        break;
      case State.IDLE:
      case State.SLEEP:
      case State.WASH:
        this._tickWaiting(dt, surfaces, options);
        break;
      default:
        this.state = State.IDLE;
        this.stateTimer = randRange(this.config.idleDuration, this.config.random);
    }

    this._environment(dt, options);
    if (this.lastEvent && this.lastEvent !== external) {
      this.needs.apply(this.lastEvent);
      this._countEvent(this.lastEvent);
    }
    this._trackProgress(dt, previousState, options);

    return this.snapshot();
  }

  snapshot() {
    return {
      x: this.x,
      y: this.y,
      facing: this.facing,
      state: this.state,
      event: this.life.stage === 'egg' ? null : this.lastEvent,
      name: this.name,
      autonomy: this.autonomy,
      accessory: this.accessory,
      trick: this._trick,
      bubble: this.state === State.REMIND ? 'break' : null,
      urgentNeed: this._lifeFrozen() ? null : this.needs.urgent(),
      mood: this.needs.mood,
      ...this.life.snapshot(),
    };
  }

  // --- Per-state implementations ----------------------------------------------

  /**
   * Replaces `currentSurface` with its up-to-date version in `surfaces`
   * (same `surfaceId`/`type`, or `side` for a wall), or makes the critter
   * fall if it no longer exists (a window closed in the meantime).
   */
  _resyncCurrentSurface(surfaces) {
    const surface = this.currentSurface;
    const fresh = surface.side
      ? findWallById(surfaces.walls, surface.surfaceId, surface.side, this.y)
      : findSegmentById(surfaces.segments, surface.surfaceId, surface.type, this.x);

    if (!fresh) {
      this._enterState(State.FALL);
      return;
    }
    this.currentSurface = fresh;
  }

  _tickDrag() {
    if (!this._dragTarget) return;
    this.x = this._dragTarget.x;
    this.y = this._dragTarget.y;
  }

  _tickFall(dt, surfaces, options) {
    this.vy = clamp(this.vy + this.config.gravity * dt, -Infinity, this.config.terminalVelocity);
    const nextY = this.y + this.vy * dt;

    const allowed = new Set(['ground', 'shelf']);
    if (this.supports(Locomotion.WATER)) allowed.add('water');

    const landing = findSurfaceBelow(surfaces.segments, this.x, nextY, this.vy * dt + 1, allowed);
    if (landing) {
      this.y = landing.y;
      this.vy = 0;
      this.currentSurface = landing;
      this._noGrab = false;
      const groundless = this._groundlessRoamState();
      if (this.life.hibernating) {
        this.state = State.HIBERNATE;
      } else if (this.life.stage === 'egg') {
        this.state = State.EGG;
      } else if (landing.type === 'water' && this.supports(Locomotion.WATER)) {
        this._startRoam(State.SWIM);
      } else if (groundless) {
        // A groundless species (fish, a purely airborne creature): never
        // settles down, goes straight back into roaming (spawn, end of drag).
        this._startRoam(groundless);
      } else {
        this._enterState(State.IDLE);
      }
      this.lastEvent = 'landed';
      return;
    }

    if (this.supports(Locomotion.WALL)) {
      const wall = this._noGrab ? null : findWallNear(surfaces.walls, this.x, Math.min(this.y, nextY), Math.max(this.y, nextY));
      if (wall) {
        this.x = wall.x; // flush against the wall, not just "close enough"
        this.y = clamp(nextY, wall.y1, wall.y2);
        this.vy = 0;
        this.currentSurface = wall;
        this._enterState(State.CLIMB);
        this.lastEvent = 'landed';
        return;
      }
    }

    this.y = nextY;

    // Safety net: if it falls outside every known monitor, fall back to
    // the bottom of the first monitor so it never leaves the screen.
    const bounds = options.worldBounds;
    if (bounds && this.y > bounds.y + bounds.height + 200) {
      this.x = clamp(this.x, bounds.x, bounds.x + bounds.width);
      this.y = bounds.y + bounds.height;
      this.vy = 0;
      this._enterState(State.IDLE);
    }
  }

  _tickWaiting(dt, surfaces, options = {}) {
    // Checks it hasn't been left "in mid-air" following a window closed
    // or moved out from under its feet.
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer > 0) return;

    if (this.state === State.SLEEP || this.state === State.WASH) {
      if (this.state === State.WASH) this.needs.apply('washed');
      this._enterState(State.IDLE);
      return;
    }

    // Emergency: it can't hold it any longer, it relieves itself in place (a mess, cleanliness drops).
    if (this.needs.values.relief < this.config.accidentBelow && this.supports(Locomotion.GROUND) && this.currentSurface) {
      this._accident();
      return;
    }

    const candidates = [
      { value: 'walk', weight: this.config.walkWeight },
      { value: 'sleep', weight: this.config.sleepWeight },
      { value: 'wash', weight: this.config.washWeight },
    ];

    if (this.currentSurface && options.pointer) {
      const distance = Math.abs(options.pointer.x - this.x);
      // Less tempting to follow a distant cursor, never fully excluded
      // (it might get closer while the critter walks toward it).
      const proximity = clamp(1 - distance / this.config.followMaxDistance, 0.15, 1);
      candidates.push({ value: 'follow', weight: this.config.followWeight * proximity });
    }

    if (options.otherCritters?.length) {
      const nearest = options.otherCritters.reduce((a, b) =>
        Math.abs(b.x - this.x) < Math.abs(a.x - this.x) ? b : a,
      );
      const distance = Math.abs(nearest.x - this.x);
      const proximity = clamp(1 - distance / this.config.greetMaxDistance, 0.15, 1);
      candidates.push({ value: 'greet', weight: this.config.greetWeight * proximity });
    }

    if (this.supports(Locomotion.WALL) && this.currentSurface) {
      const wall = findReachableWall(surfaces.walls, this.x, this.y);
      if (wall) {
        const distance = Math.abs(wall.x - this.x);
        const proximity = clamp(1 - distance / this.config.climbSeekMaxDistance, 0.15, 1);
        candidates.push({ value: 'climb', weight: this.config.climbSeekWeight * proximity });
      }
    }

    this._dropEdges = [];
    if (this.supports(Locomotion.GROUND) && this.currentSurface && isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._dropEdges = findDropEdges(
        surfaces.segments, this.currentSurface, this.y, this.config.dropMaxHeight, new Set(['ground', 'shelf']),
      );
      if (this._dropEdges.length > 0) candidates.push({ value: 'explore', weight: this.config.exploreWeight });
    }

    if (this.currentSurface && options.focusedWindow) {
      const targetX = options.focusedWindow.x + options.focusedWindow.width / 2;
      const distance = Math.abs(targetX - this.x);
      const proximity = clamp(1 - distance / this.config.seekFocusMaxDistance, 0.15, 1);
      candidates.push({ value: 'seekFocus', weight: this.config.seekFocusWeight * proximity });
    }

    const edible = this._edibleTargets(options);
    if (edible.length > 0) candidates.push({ value: 'food', weight: this.config.foodWeight });

    const toys =
      options.items?.length && this.supports(Locomotion.GROUND) && this.currentSurface
        ? toysFor(options.items, {
            x: this.x,
            surfaceId: this.currentSurface.surfaceId,
            canFly: this.supports(Locomotion.AIR),
          })
        : [];
    if (toys.length > 0) candidates.push({ value: 'play', weight: this.config.playWeight });
    if (options.laser && options.pointer) candidates.push({ value: 'laser', weight: this.config.laserWeight });
    if (options.ambient?.breakReminder && options.pointer) {
      candidates.push({ value: 'remind', weight: this.config.remindWeight });
    }
    if (this._giftReady(options)) candidates.push({ value: 'gift', weight: this.config.giftWeight });

    // Autonomy: an animal that fends for itself hunts and forages, depending on its hunger.
    const prey = this._preyTargets(options);
    // Urge to relieve itself: none while the gauge is comfortable (>= 60), growing stronger after.
    if (this.supports(Locomotion.GROUND) && this.currentSurface && this.needs.values.relief < 60) {
      candidates.push({ value: 'relieve', weight: this.config.reliefWeight * 4 * ((60 - this.needs.values.relief) / 60) });
    }
    if (prey.length > 0) candidates.push({ value: 'hunt', weight: this.config.huntWeight * this.autonomy });
    const plants = this.autonomy > 0 ? this._edibleTargets(options, { plants: true }) : [];
    if (plants.length > 0) candidates.push({ value: 'graze', weight: this.config.grazeWeight * this.autonomy });

    // Takeoff/dive: fixed weights, no proximity (nothing to "target" for
    // a takeoff, unlike the behaviours above).
    if (this.supports(Locomotion.GROUND)) {
      candidates.push({ value: 'run', weight: this.config.runWeight });
    }
    if (this.supports(Locomotion.AIR)) {
      candidates.push({ value: 'fly', weight: this.config.flyWeight });
      candidates.push({ value: 'flyFast', weight: this.config.flyFastWeight });
    }
    if (this.supports(Locomotion.WATER)) {
      candidates.push({ value: 'swim', weight: this.config.swimWeight });
      candidates.push({ value: 'swimFast', weight: this.config.swimFastWeight });
    }

    // Invitation set by proposeChase() (see _tickGreet/_tickChase):
    // consumed once here, accepted or not -- no retry if it loses the
    // draw, that's what "can ignore it" means. Weight relative to the
    // distance to the pursuer AT THE TIME of the decision (a live
    // reference: it may have gotten closer or farther in the meantime),
    // the same pattern as the other proximity-based behaviours.
    const chaseInvitation = this._chaseInvitation;
    this._chaseInvitation = null;
    if (chaseInvitation) {
      const distance = Math.abs(chaseInvitation.x - this.x);
      const proximity = clamp(1 - distance / this.config.fleeMaxDistance, 0.15, 1);
      candidates.push({ value: 'flee', weight: this.config.fleeWeight * proximity });
    }

    // Needs steer the choice without ever forcing it: a multiplied
    // weight is still a random draw.
    const levels = this.needs.values;
    const tired = levels.health < 30;
    for (const c of candidates) {
      if (c.value === 'sleep') c.weight *= needMultiplier(levels.energy, { boost: 6, satisfied: 0.3 });
      else if (c.value === 'wash') c.weight *= needMultiplier(levels.cleanliness, { boost: 5, satisfied: 0.3 });
      else if (c.value === 'follow') c.weight *= needMultiplier(levels.affection, { boost: 4, satisfied: 0.5 });
      else if (c.value === 'food') c.weight *= needMultiplier(levels.satiety, { boost: 8, satisfied: 0.05 });
      else if (c.value === 'play') c.weight *= needMultiplier(levels.stimulation, { boost: 5, satisfied: 0.2 });
      else if (c.value === 'hunt' || c.value === 'graze') c.weight *= needMultiplier(levels.satiety, { boost: 6, satisfied: 0.05 });
      else if (ENERGETIC_ACTIVITIES.has(c.value)) {
        c.weight *= needMultiplier(levels.stimulation, { boost: 3, satisfied: 0.6 });
        if (tired) c.weight *= 0.3;
      }
    }

    // World context: night and the player being away push toward sleep.
    const ambient = options.ambient ?? {};
    const sleepy = (ambient.night ? this.config.nightSleepFactor : 1) * (ambient.away ? this.config.awaySleepFactor : 1);
    const lively =
      (ambient.night ? this.config.nightEnergeticFactor : 1) * (ambient.away ? this.config.awayEnergeticFactor : 1);
    for (const c of candidates) {
      if (c.value === 'sleep') c.weight *= sleepy;
      else if (ENERGETIC_ACTIVITIES.has(c.value) || c.value === 'play') c.weight *= lively;
    }

    // Anti-repetition: special activities only. "walk" is already the
    // most frequent option; penalizing it too would overcorrect in
    // favour of the others on every cycle that follows a walk.
    for (const c of candidates) {
      if (c.value !== 'walk' && c.value === this._lastActivity) {
        c.weight *= this.config.repeatPenalty;
      }
    }

    const choice = weightedChoice(candidates, this.config.random);
    this._lastActivity = choice; // 'walk' never matches the !== 'walk' guard above: equivalent to a reset

    switch (choice) {
      case 'food':
        this._startSeekFood(edible[0]);
        return;
      case 'play': {
        const toy = toys[0];
        if (toy.surface.surfaceId !== this.currentSurface.surfaceId) {
          this._takeOffToward(toy, toy.x);
          return;
        }
        this._startPlay({ item: toy });
        return;
      }
      case 'laser':
        this._startPlay({ laser: true });
        return;
      case 'remind':
        this._startRemind();
        return;
      case 'gift':
        this._startGift();
        return;
      case 'relieve':
        this._startRelieve(options);
        return;
      case 'hunt':
        this._startHunt(prey[0]);
        return;
      case 'graze':
        this._startSeekFood(plants[0]);
        return;
      case 'sleep': {
        // A bed takes priority over everything, whatever the distance: it
        // heads there (walk time adjusts), or sleeps right on it if
        // already there. A flying species with a bed on another surface:
        // takes off toward that bed, the nap follows once landed.
        const beds = (options.items ?? []).filter((i) => i.type === 'bed' && !i.removed && i.surface && !i.grabbed);
        const here = this.currentSurface
          ? beds
              .filter((b) => b.surface.surfaceId === this.currentSurface.surfaceId)
              .sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0]
          : null;
        if (here) {
          const distance = Math.abs(here.x - this.x);
          if (distance >= this.config.napApproachDistance) {
            this._napBed = here;
            this.state = State.SEEK_NAP;
            this.stateTimer = Math.max(
              randRange(this.config.napSeekDuration, this.config.random),
              (distance / this.config.walkSpeed) * 1.5 + 2,
            );
            return;
          }
          this.state = State.SLEEP;
          this.stateTimer = randRange(this.config.sleepDuration, this.config.random);
          this.lastEvent = 'sleep';
          return;
        }
        if (this.supports(Locomotion.AIR) && beds.length > 0) {
          const bed = beds.sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0];
          this._takeOffToward(bed);
          return;
        }
        // Targeted nap: rather than sleeping in place, first looks for a
        // nearby window ledge reachable by walking; falls back to
        // sleeping in place if nothing is in range (the behaviour before this refinement).
        const shelf = this.currentSurface
          ? findReachableShelf(
              surfaces.segments,
              this.x,
              this.y,
              this.currentSurface.surfaceId,
              this.config.napSeekMaxDistance,
            )
          : null;
        if (shelf) {
          this.state = State.SEEK_NAP;
          this.stateTimer = randRange(this.config.napSeekDuration, this.config.random);
          return;
        }
        this.state = State.SLEEP;
        this.stateTimer = randRange(this.config.sleepDuration, this.config.random);
        this.lastEvent = 'sleep';
        return;
      }
      case 'wash':
        this.state = State.WASH;
        this.stateTimer = randRange(this.config.washDuration, this.config.random);
        this.lastEvent = 'wash';
        return;
      case 'follow':
        this.state = State.FOLLOW;
        this.stateTimer = randRange(this.config.followDuration, this.config.random);
        return;
      case 'greet':
        this.state = State.GREET;
        this.stateTimer = randRange(this.config.greetDuration, this.config.random);
        return;
      case 'climb': {
        // Long enough to get there: the nearest reachable wall can be far away.
        const wall = findReachableWall(surfaces.walls, this.x, this.y);
        const travel = wall ? (Math.abs(wall.x - this.x) / this.config.walkSpeed) * 1.5 + 2 : 0;
        this.state = State.SEEK_WALL;
        this.stateTimer = Math.max(randRange(this.config.climbSeekDuration, this.config.random), travel);
        return;
      }
      case 'explore': {
        const edge = this._dropEdges[Math.floor(this.config.random() * this._dropEdges.length) % this._dropEdges.length];
        this.walkTargetX = edge.x;
        this._dropDir = edge.dir;
        this.facing = sign(edge.x - this.x) || edge.dir;
        this.state = State.WALK;
        this.stateTimer = Math.abs(edge.x - this.x) / this.config.walkSpeed * 1.5 + 2;
        return;
      }
      case 'seekFocus':
        this.state = State.SEEK_FOCUS;
        this.stateTimer = randRange(this.config.seekFocusDuration, this.config.random);
        return;
      case 'flee':
        this.state = State.FLEE;
        this._fleeFrom = chaseInvitation;
        this.stateTimer = randRange(this.config.fleeDuration, this.config.random);
        return;
      case 'fly':
        this._startRoam(State.FLY);
        return;
      case 'swim':
        this._startRoam(State.SWIM);
        return;
      case 'flyFast':
        this._startRoam(State.FLY_FAST);
        return;
      case 'swimFast':
        this._startRoam(State.SWIM_FAST);
        return;
      case 'run':
        this._startWalkOnCurrentSurface(State.RUN);
        return;
      default:
        this._startWalkOnCurrentSurface();
    }
  }

  _tickFollow(dt, options) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer <= 0 || !options.pointer) {
      this._enterState(State.IDLE);
      return;
    }

    // Target recomputed every tick (unlike WALK, which aims at a fixed
    // point): the critter follows a cursor that keeps moving.
    this._chase(dt, options.pointer.x);
  }

  _tickGreet(dt, options) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    // Recomputed every tick, like the pointer for FOLLOW: no tracking by
    // id, if another critter gets closer in the meantime the target can
    // change mid-way.
    const target = options.otherCritters?.length
      ? options.otherCritters.reduce((a, b) => (Math.abs(b.x - this.x) < Math.abs(a.x - this.x) ? b : a))
      : null;

    if (this.stateTimer <= 0 || !target) {
      this._enterState(State.IDLE);
      return;
    }

    if (Math.abs(target.x - this.x) < this.config.greetDistance) {
      // this.lastEvent set directly for ITSELF (not interact()): triggered
      // WITHIN this tick, after tick() has already copied _pendingEvent
      // into lastEvent on entry -- going through interact() here would
      // push the event to the next tick. Same pattern as 'landed'/'sleep'/
      // 'wash' elsewhere. For THE TARGET, though, the greeting does arrive
      // between two of its own ticks: interact() (thus _pendingEvent) is
      // the right mechanism, same as for an external event (windowOpened).
      this.lastEvent = 'greeted';
      target.critter?.interact('meetCritter');

      // Sometimes chains into a chase instead of going straight back to
      // IDLE: proposes (doesn't impose, see proposeChase) that the target
      // flee, and gives chase.
      if (target.critter && this.config.random() < this.config.chaseChance) {
        target.critter.proposeChase(this);
        this.state = State.CHASE;
        this._chaseTarget = target.critter;
        this.stateTimer = randRange(this.config.chaseDuration, this.config.random);
        return;
      }

      this._enterState(State.IDLE);
      return;
    }

    // Unreachable (a different level, a wall in the way...): the critter
    // butts against the edge of its own surface and stateTimer eventually
    // expires normally, no special case to handle here.
    this._chase(dt, target.x);
  }

  /**
   * Unlike GREET/FOLLOW/SEEK_WALL/SEEK_FOCUS, the target is a FIXED
   * reference (`_chaseTarget`, set by _tickGreet) rather than recomputed
   * by proximity every tick: a real chase follows a specific target, not
   * "whoever is closest".
   */
  _tickChase(dt) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer <= 0 || !this._chaseTarget) {
      this._chaseTarget = null;
      this._enterState(State.IDLE);
      return;
    }

    if (Math.abs(this._chaseTarget.x - this.x) < this.config.greetDistance) {
      // Caught up: reuses 'greeted' (both the start AND the end of a
      // chase stay the same emotion) rather than adding a new event and
      // its assets just for this.
      this.lastEvent = 'greeted';
      this._chaseTarget.interact('meetCritter'); // the target also reacts to being caught
      this._chaseTarget = null;
      this._enterState(State.IDLE);
      return;
    }

    // A live reference: follows the target wherever it has gone, not a
    // position frozen at the moment the chase started.
    this._chase(dt, this._chaseTarget.x);
  }

  _tickFlee(dt) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer <= 0 || !this._fleeFrom) {
      this._fleeFrom = null;
      this._enterState(State.IDLE);
      return;
    }

    // The mirror image of _chase, but moving away from the target instead of toward it.
    const dir = sign(this.x - this._fleeFrom.x) || this.facing || 1;
    this.facing = dir;
    this.x += dir * this.config.walkSpeed * dt;

    if (this.currentSurface) {
      this.x = clamp(this.x, this.currentSurface.x1, this.currentSurface.x2);
    }
  }

  _tickSeekNap(dt, surfaces, options = {}) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this._napBed) {
      const bed = this._napBed;
      const stillThere =
        !bed.removed &&
        this.currentSurface &&
        bedsOn(options.items ?? [], this.currentSurface.surfaceId, this.x).includes(bed);
      if (this.stateTimer <= 0 || !stillThere) {
        this._napBed = null;
        this._enterState(State.IDLE);
        return;
      }
      if (Math.abs(bed.x - this.x) < this.config.napApproachDistance) {
        this.x = bed.x;
        this._napBed = null;
        this.state = State.SLEEP;
        this.stateTimer = randRange(this.config.sleepDuration, this.config.random);
        this.lastEvent = 'sleep';
        return;
      }
      this._chase(dt, bed.x);
      return;
    }

    // Recomputed every tick (like SEEK_WALL): a ledge can become
    // unreachable (a closed/moved window) along the way.
    const shelf = this.currentSurface
      ? findReachableShelf(
          surfaces.segments,
          this.x,
          this.y,
          this.currentSurface.surfaceId,
          this.config.napSeekMaxDistance,
        )
      : null;

    if (this.stateTimer <= 0 || !shelf) {
      this._enterState(State.IDLE);
      return;
    }

    const targetX = clamp(this.x, shelf.x1, shelf.x2); // closest point on the ledge
    if (Math.abs(targetX - this.x) < this.config.napApproachDistance) {
      this.x = targetX;
      this.y = shelf.y;
      this.currentSurface = shelf;
      this.state = State.SLEEP;
      this.stateTimer = randRange(this.config.sleepDuration, this.config.random);
      this.lastEvent = 'sleep';
      return;
    }

    this._chase(dt, targetX);
  }

  // --- Food and bed ----------------------------------------------------

  /** Edible targets for this species, closest first. */
  /** Edible targets; plants (foraging, autonomy) are requested separately. */
  _edibleTargets(options, { plants = false } = {}) {
    if (!options.items?.length) return [];
    return edibleFor(options.items, this.config.needsDiet, {
      x: this.x,
      surfaceId: this.currentSurface?.surfaceId,
      canFly: this.supports(Locomotion.AIR),
      floating: !this.supports(Locomotion.GROUND),
      self: this,
      avoidMold: this.autonomy >= 0.5, // an autonomous animal doesn't eat moldy food
    }).filter((e) => (e.item.type === 'plant') === plants);
  }

  /** Prey this species hunts, reachable: closest first. */
  _preyTargets(options) {
    if (!options.items?.length || this.autonomy <= 0) return [];
    const floating = !this.supports(Locomotion.GROUND);
    const canFly = this.supports(Locomotion.AIR);
    return options.items
      .filter(
        (i) =>
          i.type === 'prey' && !i.consumed && !i.removed && !i.grabbed && !i.caught &&
          this.config.needsPrey[i.kind] > 0 &&
          i.floating === floating &&
          (floating || (i.surface && (canFly || i.surface.surfaceId === this.currentSurface?.surfaceId))),
      )
      .sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x));
  }

  _releaseFood() {
    if (this._foodTarget?.item.claimedBy === this) this._foodTarget.item.claimedBy = null;
    this._foodTarget = null;
  }

  _startSeekFood(target) {
    const { item } = target;
    const seg = item.surface;
    const sameSurface = seg && this.currentSurface && seg.surfaceId === this.currentSurface.surfaceId;

    if (!item.floating && !sameSurface) {
      // A flying species, food on another surface: takes off toward that
      // surface; once landed, the food will be on its surface.
      this._takeOffToward(item);
      return;
    }

    this._releaseFood();
    this._foodTarget = target;
    if (item.type === 'food') item.claimedBy = this;
    this.state = State.SEEK_FOOD;
    this.stateTimer = randRange(this.config.foodSeekDuration, this.config.random);
  }

  _foodGone(item) {
    return !item || item.consumed || item.removed || item.grabbed || (item.type === 'bowl' && item.portions <= 0);
  }

  /** Gives up (target eaten, gone, unreachable): back to resting or roaming. */
  _giveUpFood() {
    this._releaseFood();
    const roam = this._groundlessRoamState();
    if (roam) this._startRoam(roam);
    else this._enterState(State.IDLE);
  }

  _tickSeekFood(dt) {
    const item = this._foodTarget?.item;
    const groundless = !this.supports(Locomotion.GROUND);

    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const unreachable =
      item &&
      !groundless &&
      !item.floating &&
      (!item.surface || item.surface.surfaceId !== this.currentSurface?.surfaceId);
    if (this._foodGone(item) || unreachable || this.stateTimer <= 0) {
      this._giveUpFood();
      return;
    }

    if (groundless) {
      const toX = item.x - this.x;
      const toY = item.y - this.y;
      const distance = Math.hypot(toX, toY);
      if (distance < 10) {
        this._startEating();
        return;
      }
      this._approach2D(dt, item.x, item.y, this.supports(Locomotion.WATER) ? this.config.swimSpeed : this.config.flySpeed);
      return;
    }

    if (Math.abs(item.x - this.x) < this.config.napApproachDistance) {
      this._startEating();
      return;
    }
    this._chase(dt, item.x);
  }

  _startEating() {
    const item = this._foodTarget.item;
    this.facing = sign(item.x - this.x) || this.facing;
    this.state = State.EAT;
    this.stateTimer = randRange(this.config.eatDuration, this.config.random);
  }

  _tickEat(dt) {
    const target = this._foodTarget;
    const groundless = !this.supports(Locomotion.GROUND);
    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    if (!target || this._foodGone(target.item)) {
      this._giveUpFood();
      return;
    }
    if (this.stateTimer > 0) return;

    const { item, gain } = target;
    const { sick, fraction, finished } = consume(item);
    this.needs.feed(gain * fraction);
    if (item.kind) this.stats.mark('food', item.kind);
    if (this._now !== null && new Date(this._now).getHours() === 5) this.stats.mark('moment', 'early-meal');
    if (sick) {
      // Moldy food: a small health hit, a "sick" bubble to remedy.
      this.needs.boost('health', -this.config.moldSickness);
      this.lastEvent = 'sick';
    } else {
      // Still hungry and a bite left: next bite, without letting go of
      // the food; otherwise it leaves the started leftover (for later, or another).
      if (!finished && this.needs.values.satiety < this.config.eatMoreBelow) {
        item.claimedBy = this;
        this.stateTimer = randRange(this.config.eatDuration, this.config.random);
        return;
      }
      if (!finished) this.stats.add('leftovers');
      if (finished && item.type === 'food' && gain >= Math.max(...Object.values(this.config.needsDiet))) {
        this.needs.boost('affection', 5);
        this.stats.add('mealsFavorite');
      }
      if (item.type === 'plant') this.stats.add('grazes');
      this.lastEvent = 'ate';
    }
    this._giveUpFood();
  }

  // --- Natural needs -----------------------------------------------------------

  /** A mess to drop, requested by the animal (the Manager turns it into an item), or null. */
  takeMess() {
    const mess = this._pendingMess;
    this._pendingMess = null;
    return mess;
  }

  _accident() {
    this._pendingMess = { x: this.x, y: this.y };
    this.needs.relieve();
    this.needs.boost('cleanliness', -this.config.accidentCleanlinessLoss);
    this.stats.add('accidents');
    this.lastEvent = 'accident';
    this._enterState(State.IDLE);
  }

  /** Goes to a clean litter box on its surface, otherwise the nearest corner (edge); while flying, heads to the litter box's surface. */
  _startRelieve(options) {
    const seg = this.currentSurface;
    const litter =
      litterFor(options.items ?? [], { x: this.x, surfaceId: seg.surfaceId, canFly: this.supports(Locomotion.AIR) })[0] ?? null;
    if (litter && litter.surface.surfaceId !== seg.surfaceId) {
      this._takeOffToward(litter);
      return;
    }
    const corner = Math.abs(this.x - seg.x1) < Math.abs(seg.x2 - this.x) ? seg.x1 + 10 : seg.x2 - 10;
    this._reliefTarget = { x: clamp(litter ? litter.x : corner, seg.x1 + 4, seg.x2 - 4), litter, acting: false };
    this.state = State.RELIEVE;
    this.stateTimer = 20; // travel time: beyond this, it relieves itself wherever it is
  }

  _tickRelieve(dt) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const target = this._reliefTarget;
    if (!target) {
      this._enterState(State.IDLE);
      return;
    }
    // The litter box became dirty, was removed or moved along the way: it falls back on the nearest corner.
    if (target.litter && (target.litter.removed || target.litter.grabbed || isDirty(target.litter))) {
      const seg = this.currentSurface;
      target.litter = null;
      target.x = clamp(Math.abs(this.x - seg.x1) < Math.abs(seg.x2 - this.x) ? seg.x1 + 10 : seg.x2 - 10, seg.x1 + 4, seg.x2 - 4);
    }

    if (!target.acting) {
      if (this.stateTimer <= 0 || Math.abs(target.x - this.x) < 6) {
        target.acting = true;
        this.stateTimer = this.config.reliefDuration;
        return;
      }
      this._chase(dt, target.x);
      return;
    }
    if (this.stateTimer > 0) return;
    this._finishRelieve(target);
  }

  _finishRelieve(target) {
    this.needs.relieve();
    this.stats.add('reliefs');
    if (target.litter) target.litter.uses += 1;
    else this._pendingMess = { x: this.x, y: this.y };
    this.lastEvent = 'relieved';
    this._enterState(State.IDLE);
  }

  /**
   * Nearby messes on the same surface: they dirty it, and old ones (over
   * two hours) make the animal sick, except for an autonomous animal
   * that cleans up after itself. Frozen in vacation mode.
   */
  _environment(dt, options) {
    if (this._lifeFrozen() || !this.currentSurface || !options.items?.length || this.needs.rateScale <= 0) return;
    let nearby = 0;
    let old = 0;
    for (const item of options.items) {
      if (item.type !== 'mess' || item.removed || !item.surface) continue;
      if (item.surface.surfaceId !== this.currentSurface.surfaceId || Math.abs(item.x - this.x) >= this.config.messRadius) continue;
      nearby += 1;
      if (isOldMess(item)) old += 1;
    }
    const hours = (dt / 3600) * this.needs.rateScale;
    if (nearby > 0) this.needs.boost('cleanliness', -this.config.messCleanlinessLoss * Math.min(nearby, 3) * hours);
    if (old > 0) this.needs.boost('health', -this.config.oldMessHealthLoss * Math.min(old, 3) * (1 - this.autonomy) * hours);
  }

  // --- Hunting ---------------------------------------------------------------------

  _startHunt(prey) {
    const sameSurface = prey.surface && this.currentSurface && prey.surface.surfaceId === this.currentSurface.surfaceId;
    if (!prey.floating && !sameSurface) {
      this._takeOffToward(prey); // a flying species: takes off toward the prey's surface
      return;
    }
    this._releaseFood();
    this._playTarget = null;
    this._huntTarget = prey;
    this.state = State.HUNT;
    this.stateTimer = this.config.huntDuration;
  }

  _endHunt() {
    this._huntTarget = null;
    const roam = this._groundlessRoamState();
    if (roam) this._startRoam(roam);
    else this._enterState(State.IDLE);
  }

  /** Chase: gives up without consequence if the prey escapes, disappears, or changes surface. */
  _tickHunt(dt) {
    const groundless = !this.supports(Locomotion.GROUND);
    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const prey = this._huntTarget;
    const lost =
      !prey || prey.consumed || prey.removed || prey.grabbed || prey.caught || this.stateTimer <= 0 ||
      (!groundless && (!prey.surface || prey.surface.surfaceId !== this.currentSurface?.surfaceId));
    if (lost) {
      this._endHunt();
      return;
    }

    if (groundless) {
      const speed = this.supports(Locomotion.WATER)
        ? this.config.swimSpeed * this.config.swimFastFactor
        : this.config.flySpeed * this.config.flyFastFactor;
      if (Math.hypot(prey.x - this.x, prey.y - this.y) < this.config.catchDistance) {
        this._catch(prey);
        return;
      }
      this._approach2D(dt, prey.x, prey.y, speed);
      return;
    }
    if (Math.abs(prey.x - this.x) < this.config.catchDistance) {
      this._catch(prey);
      return;
    }
    this._chase(dt, prey.x, this.config.walkSpeed * this.config.runSpeedFactor);
  }

  /** The prey is caught: it freezes, the critter eats it (EAT state reused). */
  _catch(prey) {
    prey.caught = true;
    this._huntTarget = null;
    this._foodTarget = { item: prey, gain: this.config.needsPrey[prey.kind] };
    this.stats.add('hunts');
    this._startEating();
  }

  /** Takes off toward an object's surface (flying species); once landed,
   * the object will be on its surface and can be reached on foot. */
  _takeOffToward(item, x = item.x) {
    const seg = item.surface;
    this._releaseFood();
    this._startRoam(State.FLY);
    const margin = Math.min(8, (seg.x2 - seg.x1) / 2);
    this._flyTarget = { segment: seg, x: clamp(x, seg.x1 + margin, seg.x2 - margin), y: seg.y };
  }

  /** Moves toward a 2D point (groundless species); returns the remaining distance. */
  _approach2D(dt, targetX, targetY, speed) {
    const toX = targetX - this.x;
    const toY = targetY - this.y;
    const distance = Math.hypot(toX, toY);
    if (distance < 1e-6) return 0;
    const step = Math.min(speed * dt, distance);
    this.facing = sign(toX) || this.facing;
    this.x += (toX / distance) * step;
    this.y += (toY / distance) * step;
    return distance - step;
  }

  // --- Play, petting, brushing ------------------------------------------------

  _startPlay(target) {
    if (target.laser) this.stats.add('laserChases');
    this._playTarget = target;
    this._kickTimer = 0;
    this.state = State.PLAY;
    this.stateTimer = randRange(this.config.playDuration, this.config.random);
  }

  /** End of a session (played through to the end: reward) or abandonment. */
  _endPlay(completed) {
    if (completed && this._playTarget?.item) this.stats.mark('toy', this._playTarget.item.kind);
    this._playTarget = null;
    if (completed) this.lastEvent = 'played';
    const roam = this._groundlessRoamState();
    if (roam) this._startRoam(roam);
    else this._enterState(State.IDLE);
  }

  _tickPlay(dt, options) {
    const groundless = !this.supports(Locomotion.GROUND);
    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const target = this._playTarget;
    if (!target) {
      this._endPlay(false);
      return;
    }
    if (this.stateTimer <= 0) {
      this._endPlay(true);
      return;
    }

    let tx;
    let ty;
    if (target.laser) {
      if (!options.laser || !options.pointer) {
        this._endPlay(false);
        return;
      }
      tx = options.pointer.x;
      ty = options.pointer.y;
    } else {
      const toy = target.item;
      const lost =
        toy.removed ||
        toy.grabbed ||
        (toy.surface && !this.supports(Locomotion.AIR) && toy.surface.surfaceId !== this.currentSurface?.surfaceId);
      if (lost) {
        this._endPlay(false);
        return;
      }
      tx = toy.x;
      ty = toy.y;
    }

    if (groundless) {
      const speed = this.supports(Locomotion.WATER)
        ? this.config.swimSpeed * this.config.swimFastFactor
        : this.config.flySpeed * this.config.flyFastFactor;
      const remaining = this._approach2D(dt, tx, ty, speed);
      // Floating toy in range: a nudge of the snout pushes it further.
      if (!target.laser && remaining < this.config.kickDistance) {
        this._kickTimer -= dt;
        if (this._kickTimer <= 0) {
          this._kickTimer = this.config.kickInterval;
          if (push(target.item, tx - this.x || this.facing, ty - this.y)) this.stats.add('ringPushes');
        }
      }
      return;
    }

    if (Math.abs(tx - this.x) >= this.config.kickDistance) {
      this._chase(dt, tx, this.config.walkSpeed * this.config.runSpeedFactor);
      return;
    }
    this.facing = sign(tx - this.x) || this.facing;
    // Rolling toy (ball, wool ball): a swat of the paw now and then; the plush toy doesn't move.
    if (!target.laser) {
      this._kickTimer -= dt;
      if (this._kickTimer <= 0) {
        this._kickTimer = this.config.kickInterval;
        if (kick(target.item, sign(tx - this.x) || this.facing)) this.stats.add('ballKicks');
      }
    }
  }

  /** Life transitions: hatching, growth, hibernation. */
  _applyLifeTransitions(transitions) {
    if (transitions.length === 0) return;
    for (const transition of transitions) {
      if (transition === 'hatched') {
        this.lastEvent = 'hatched';
        if (this.state === State.EGG) this._enterState(State.IDLE);
      } else if (transition === 'grew') {
        this.lastEvent = 'grew';
      } else if (transition === 'birthday') {
        this.lastEvent = 'birthday';
      } else if (transition === 'hibernated') {
        this.lastEvent = 'hibernated';
        this.stats.add('hibernations');
        this._releaseFood();
        this._playTarget = null;
        if (this.state !== State.DRAG && this.state !== State.FALL) this.state = State.HIBERNATE;
      }
    }
    this._recomputeConfig();
  }

  /** Egg and hibernation: motionless, only watching that the support holds. */
  _tickResting() {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
    }
  }

  // --- Tricks and gifts -----------------------------------------------------------

  /** The trick exists for the species and the critter is in a state to perform it (not egg, hibernation, or falling). */
  _canPerform(name) {
    if (!this.config.tricks.includes(name) || this._lifeFrozen()) return false;
    const blocked = [State.DRAG, State.FALL, State.EGG, State.HIBERNATE, State.CLIMB, State.CEILING];
    return !blocked.includes(this.state) && (Boolean(this.currentSurface) || !this.supports(Locomotion.GROUND));
  }

  _startTrick(name) {
    this._releaseFood();
    this._playTarget = null;
    this._trick = name;
    this.state = State.TRICK;
    this.stateTimer = TRICKS[name].duration;
    this.stats.add('tricksPerformed');
  }

  /**
   * Training (player action): succeeds with the mastery probability, which
   * rises in every case. A trick finally learned is announced (`trickLearned`
   * event).
   * @returns {boolean} true if the critter performed the trick
   */
  trainTrick(name) {
    if (!this._canPerform(name)) return false;
    const { success, learned } = this.tricks.train(name, this.config.random, this.life.trait);
    if (success) this._startTrick(name);
    else {
      this._pendingEvent = 'noticed'; // it hesitates
      this.stats.add('trickFails');
    }
    if (learned) this._pendingEvent = 'trickLearned';
    return success;
  }

  /** Performs a trick already learned (player action). */
  performTrick(name) {
    if (!this.tricks.isLearned(name) || !this._canPerform(name)) return false;
    this._startTrick(name);
    return true;
  }

  _tickTrick() {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    if (this.stateTimer > 0) return;
    this._trick = null;
    const roam = this._groundlessRoamState();
    if (roam) this._startRoam(roam);
    else this._enterState(State.IDLE);
  }

  /** A very affectionate adult, with no recent gift, may bring one back near the cursor. */
  _giftReady(options) {
    return (
      Boolean(options.pointer) &&
      (this.life.stage === 'adult' || this.life.stage === 'senior') &&
      this.needs.values.affection >= this.config.giftAffection &&
      this._clock - this._lastGiftAt >= this.config.giftCooldown
    );
  }

  _startGift() {
    this._releaseFood();
    this._playTarget = null;
    this.state = State.GIFT;
    this.stateTimer = randRange(this.config.giftDuration, this.config.random);
  }

  /** Reaches the cursor then drops its gift there (to be picked up by the player). */
  _tickGift(dt, options) {
    const groundless = !this.supports(Locomotion.GROUND);
    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const pointer = options.pointer;
    const end = () => {
      const roam = this._groundlessRoamState();
      if (roam) this._startRoam(roam);
      else this._enterState(State.IDLE);
    };
    if (this.stateTimer <= 0 || !pointer) {
      end(); // didn't arrive in time: no gift, no time consumed
      return;
    }

    let distance;
    if (groundless) {
      const speed = this.supports(Locomotion.WATER) ? this.config.swimSpeed : this.config.flySpeed;
      distance = this._approach2D(dt, pointer.x, pointer.y, speed);
    } else {
      distance = Math.abs(pointer.x - this.x);
      if (distance >= this.config.kickDistance) this._chase(dt, pointer.x);
    }
    if (distance < this.config.kickDistance * 1.5) {
      this._pendingGift = { kind: pickGift(this.config.random), x: this.x, y: this.y - 16 };
      this.stats.mark('gift', this._pendingGift.kind);
      this._lastGiftAt = this._clock;
      this.stats.add('giftsGiven');
      this.lastEvent = 'gift';
      end();
    }
  }

  /** Gift dropped since the last call (the Manager turns it into an object), or null. */
  takeGift() {
    const gift = this._pendingGift;
    this._pendingGift = null;
    return gift;
  }

  _startRemind() {
    this._releaseFood();
    this._playTarget = null;
    this._remindArrived = false;
    this.state = State.REMIND;
    this.stateTimer = this.config.remindDuration;
  }

  /** Break reminder: reaches the cursor (walking, flying, or swimming) and stays by it until the end. */
  _tickRemind(dt, options) {
    const groundless = !this.supports(Locomotion.GROUND);
    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const pointer = options.pointer;
    if (this.stateTimer <= 0 || !pointer || !options.ambient?.breakReminder) {
      const roam = this._groundlessRoamState();
      if (roam) this._startRoam(roam);
      else this._enterState(State.IDLE);
      return;
    }

    let distance;
    if (groundless) {
      const speed = this.supports(Locomotion.WATER)
        ? this.config.swimSpeed * this.config.swimFastFactor
        : this.config.flySpeed * this.config.flyFastFactor;
      distance = this._approach2D(dt, pointer.x, pointer.y, speed);
    } else {
      distance = Math.abs(pointer.x - this.x);
      if (distance >= this.config.kickDistance) {
        this._chase(dt, pointer.x, this.config.walkSpeed * this.config.runSpeedFactor);
      }
    }
    if (distance < this.config.kickDistance * 1.5 && !this._remindArrived) {
      this._remindArrived = true;
      this.lastEvent = 'reminded';
    }
  }

  /** Brushing (player action): motionless for a few seconds, then cleanliness and affection rise. */
  brush() {
    const blocked = [
      State.DRAG, State.FALL, State.CLIMB, State.CEILING, State.SWIM, State.SWIM_FAST,
      State.FLY, State.FLY_FAST, State.DIVE,
    ];
    if (this.state === State.HIBERNATE) {
      this.wake();
      return;
    }
    if (!this.currentSurface || blocked.includes(this.state) || this.state === State.EGG) return;
    if (this.needs.values.cleanliness >= 95) this.stats.add('pointlessBrushes');
    this._releaseFood();
    this._playTarget = null;
    this.state = State.BRUSHED;
    this.stateTimer = this.config.brushDuration;
  }

  _tickBrushed() {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    if (this.stateTimer > 0) return;
    this.lastEvent = 'brushed';
    this._enterState(State.IDLE);
  }

  /** Multiplier for the energy gain while sleeping: stronger on a bed. */
  _bedSleepFactor(options) {
    if (this.state !== State.SLEEP || !this.currentSurface || !options?.items) return 1;
    const bed = bedsOn(options.items, this.currentSurface.surfaceId, this.x)[0];
    if (!bed || Math.abs(bed.x - this.x) >= this.config.bedRadius) return 1;
    if (bed.model) this.stats.mark('bed', bed.model);
    return this.config.bedSleepFactor;
  }

  _tickSeekWall(dt, surfaces) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    // Recomputed every tick (like FOLLOW/GREET): a wall may become
    // unreachable (window closed) or a closer one may appear.
    const wall = findReachableWall(surfaces.walls, this.x, this.y);

    if (this.stateTimer <= 0 || !wall) {
      this._enterState(State.IDLE);
      return;
    }

    if (Math.abs(wall.x - this.x) < this.config.climbApproachDistance) {
      this.x = wall.x;
      this.y = clamp(this.y, wall.y1, wall.y2); // no-op or nearly: wall already filtered "reachable" at selection
      this.currentSurface = wall;
      this._enterState(State.CLIMB);
      return;
    }

    this._chase(dt, wall.x);
  }

  _tickSeekFocus(dt, options) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer <= 0 || !options.focusedWindow) {
      this._enterState(State.IDLE);
      return;
    }

    const targetX = options.focusedWindow.x + options.focusedWindow.width / 2;
    if (Math.abs(targetX - this.x) < this.config.seekFocusDistance) {
      // Arrived: simple curiosity, no dedicated new reaction/sound for
      // this behavior (unlike GREET -> 'greeted').
      this._enterState(State.IDLE);
      return;
    }

    this._chase(dt, targetX);
  }

  /** Moves toward `targetX` along the current surface (WALK targets a
   * fixed point once and for all; FOLLOW/GREET call this every tick
   * with a target that may have moved). */
  _chase(dt, targetX, speed = this.config.walkSpeed) {
    this.x = this._stepToward(targetX, speed * dt);

    if (this.currentSurface) {
      this.x = clamp(this.x, this.currentSurface.x1, this.currentSurface.x2);
    }
  }

  /**
   * One walking step toward `targetX`: never past it (a step longer than the
   * distance left would overshoot, then come back, and the critter would
   * turn around every tick on the spot), and the facing only follows a
   * target that is really on the other side, so a cursor or a prey that
   * moves a hair doesn't flip it either.
   * @returns {number} the new x
   */
  _stepToward(targetX, step) {
    const toTarget = targetX - this.x;
    if (Math.abs(toTarget) > FACING_DEADZONE) this.facing = sign(toTarget);
    return this.x + sign(toTarget) * Math.min(step, Math.abs(toTarget));
  }

  _startWalkOnCurrentSurface(state = State.WALK) {
    const surface = this.currentSurface;
    if (!surface) {
      this._enterState(State.IDLE);
      return;
    }
    const margin = 4;
    const min = surface.x1 + margin;
    const max = surface.x2 - margin;
    if (max <= min) {
      this._enterState(State.IDLE);
      return;
    }
    this.walkTargetX = randRange([min, max], this.config.random);
    this.facing = sign(this.walkTargetX - this.x) || this.facing;
    this.state = state;
    this.stateTimer = randRange(this.config.walkDuration, this.config.random);
  }

  _tickWalk(dt, speed = this.config.walkSpeed) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    const dir = sign(this.walkTargetX - this.x);
    if (dir === 0 || this.stateTimer <= 0) {
      this._endWalk();
      return;
    }

    this.x = this._stepToward(this.walkTargetX, speed * dt);

    if (this.currentSurface) {
      this.x = clamp(this.x, this.currentSurface.x1, this.currentSurface.x2);
    }

    if (Math.abs(this.walkTargetX - this.x) < 1) this._endWalk();
  }

  /** End of a walk: idles, or steps off the edge it was heading for (`explore`) and falls. */
  _endWalk() {
    const dir = this._dropDir;
    if (dir && Math.abs(this.walkTargetX - this.x) < 1) {
      this.x = this.walkTargetX + dir * DROP_PROBE;
      this.facing = dir;
      this._enterState(State.FALL);
      return;
    }
    this._enterState(State.IDLE);
  }

  _tickClimb(dt, surfaces) {
    // Climbs up the current wall. If the species can walk on ceilings,
    // it stops and latches on as soon as it crosses, along the way, an
    // overhanging surface (a monitor's top, the underside of a window);
    // otherwise it climbs to the top of the wall and stops there (nothing
    // to hang from up there).
    const wall = this.currentSurface;
    if (!wall) {
      this._enterState(State.FALL);
      return;
    }

    const prevY = this.y;
    this.y = Math.max(this.y - this.config.climbSpeed * dt, wall.y1);

    if (this.supports(Locomotion.CEILING)) {
      const ceiling = findCeilingAbove(surfaces.segments, wall.x, prevY, prevY - this.y);
      // A ceiling ending right at the wall has no room to walk on: it would
      // drop the critter at once, so it isn't latched onto.
      const room = ceiling ? ceilingRun(ceiling, wall.x) : null;
      if (ceiling && room.run >= this.config.ceilingMinRun) {
        this.y = ceiling.y;
        this.currentSurface = ceiling;
        // Heads toward the inside of the overhang (where there is room);
        // falling off it, no wall is grabbed before landing.
        this.facing = room.dir;
        this._noGrab = true;
        this._enterState(State.CEILING);
        return;
      }
    }

    if (this.y <= wall.y1) {
      // A ledge/ground starting right at the top (the exposed edge of a
      // monitor next to a higher one, a window's ledge): steps onto it.
      const ledge = findLedgeAtWallTop(surfaces.segments, wall);
      if (ledge) {
        this.currentSurface = ledge.segment;
        this.x = wall.x + ledge.dir * DROP_PROBE / 2;
        this.y = ledge.segment.y;
        this.facing = ledge.dir;
        this._enterState(State.IDLE);
        return;
      }
      // Nothing to grip at the top: stay latched there, motionless, rather
      // than "standing" on a wall (which has no valid x1/x2 for the
      // surface check of the IDLE/WALK states).
      this.currentSurface = null;
      this._enterState(State.IDLE);
    }
  }

  _tickCeiling(dt) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer <= 0) {
      this._enterState(State.FALL);
      return;
    }

    this.x += this.facing * this.config.walkSpeed * dt;

    if (this.currentSurface) {
      const clamped = clamp(this.x, this.currentSurface.x1, this.currentSurface.x2);
      if (clamped !== this.x) {
        // End of the overhang reached: nothing left to hold onto.
        this.x = clamped;
        this._enterState(State.FALL);
      }
    }
  }

  /**
   * Mechanics shared by FLY and SWIM: 2D target recomputed periodically
   * (unlike WALK, which targets a fixed point once and for all).
   * "Landing" needs no dedicated logic: once stateTimer runs out, we go
   * back to FALL and the landing detection already in place
   * (findSurfaceBelow) handles the rest.
   * @param {boolean} wavy if true, undulates perpendicular to the direct
   * path toward the target (swimming) rather than going straight there
   * (flying).
   */
  /** Roaming locomotion of a species that doesn't support ground:
   * SWIM (water) first, otherwise FLY (air), otherwise null. */
  _groundlessRoamState() {
    if (this.supports(Locomotion.GROUND)) return null;
    if (this.supports(Locomotion.WATER)) return State.SWIM;
    if (this.supports(Locomotion.AIR)) return State.FLY;
    return null;
  }

  /** Base state of a variant: SWIM_FAST -> SWIM; FLY_FAST/DIVE -> FLY. */
  _roamBase(state) {
    if (state === State.SWIM_FAST) return State.SWIM;
    if (state === State.FLY_FAST || state === State.DIVE) return State.FLY;
    return state;
  }

  /** Chained session of a groundless species: fast with `fastChance`. */
  _roamVariant(base) {
    const fast = this.config.random() < this.config.fastChance;
    if (!fast) return base;
    return base === State.SWIM ? State.SWIM_FAST : State.FLY_FAST;
  }

  /** Starts a FLY/SWIM session. No _enterState(): stateTimer and
   * _roamTimer must be set on the very first frame, otherwise _tickRoam
   * would see stateTimer already <= 0 and end the session immediately. */
  _startRoam(state) {
    if (this._roamBase(this.state) !== State.SWIM) this._roamHasTarget = false;
    this.state = state;
    const swimming = this._roamBase(state) === State.SWIM;
    const duration = swimming ? this.config.swimDuration : this.config.flyDuration;
    this.stateTimer = randRange(duration, this.config.random);
    this._roamTimer = 0; // force a first targeting on the very first tick
    this._flyTarget = null; // landing target, chosen on the first tick of flight
    this._flyWaypoint = null;
    // While flying we're no longer attached to the starting surface: if its
    // window closes, tick() must not make us fall (see _resyncCurrentSurface).
    this._flyOriginId = this.currentSurface?.surfaceId;
    this.currentSurface = null;
  }

  _tickRoam(dt, options, speed, yRangeFactors, wavy = false) {
    // A groundless species never goes through _tickWaiting: this is where
    // it notices floating food when it's hungry.
    if (this._groundlessRoamState()) {
      this._foodCheckTimer = (this._foodCheckTimer ?? 0) - dt;
      if (this._foodCheckTimer <= 0) {
        this._foodCheckTimer = 1;
        if (options.ambient?.breakReminder && options.pointer) {
          this._startRemind();
          return;
        }
        if (this._giftReady(options) && this.config.random() < this.config.giftChancePerSecond) {
          this._startGift();
          return;
        }
        if (options.laser && options.pointer) {
          this._startPlay({ laser: true });
          return;
        }
        if (this.needs.values.satiety < 70) {
          const edible = this._edibleTargets(options);
          if (edible.length > 0) {
            this._startSeekFood(edible[0]);
            return;
          }
          const prey = this._preyTargets(options);
          if (prey.length > 0) {
            this._startHunt(prey[0]);
            return;
          }
          const plants = this.autonomy > 0 ? this._edibleTargets(options, { plants: true }) : [];
          if (plants.length > 0) {
            this._startSeekFood(plants[0]);
            return;
          }
        }
        // It's bored and a toy is floating (the ring): it will push it.
        if (this.needs.values.stimulation < this.config.floatingPlayBelow && options.items?.length) {
          const toy = toysFor(options.items, { x: this.x, y: this.y, floating: true })[0];
          if (toy && this.config.random() < this.config.floatingPlayChance) {
            this._startPlay({ item: toy });
            return;
          }
        }
      }
    }

    if (this.stateTimer <= 0) {
      // A groundless species chains into a new session rather than
      // falling: it would have nowhere to land.
      const base = this._roamBase(this.state);
      if (this._groundlessRoamState() === base) this._startRoam(this._roamVariant(base));
      else this._enterState(State.FALL);
      return;
    }

    const arrived =
      this.walkTargetX != null &&
      this._flyTargetY != null &&
      Math.hypot(this.walkTargetX - this.x, this._flyTargetY - this.y) < 24;
    if (this._roamTimer === undefined || this._roamTimer <= 0 || (arrived && this._roamHasTarget)) {
      const bounds = options.worldBounds ?? { x: 0, y: 0, width: 1920, height: 1080 };
      const [yMinFactor, yMaxFactor] = yRangeFactors;
      const yMin = bounds.y + bounds.height * yMinFactor;
      const yMax = bounds.y + bounds.height * yMaxFactor;
      if (wavy && this._roamHasTarget) {
        // Swimming: new heading close to the previous one (limited turn),
        // not a point drawn anywhere, to avoid sharp and frequent direction
        // changes.
        const heading = Math.atan2(this._flyTargetY - this.y, this.walkTargetX - this.x);
        const turn = (this.config.swimTurnMax * Math.PI) / 180;
        const angle = heading + randRange([-turn, turn], this.config.random);
        const dist = randRange([0.3, 0.7], this.config.random) * bounds.width;
        let cos = Math.cos(angle);
        let sin = Math.sin(angle);
        // Too close to an edge: head back the other way on that axis.
        if (this.x + cos * dist < bounds.x || this.x + cos * dist > bounds.x + bounds.width) cos = -cos;
        if (this.y + sin * dist < yMin || this.y + sin * dist > yMax) sin = -sin;
        this.walkTargetX = clamp(this.x + cos * dist, bounds.x, bounds.x + bounds.width);
        this._flyTargetY = clamp(this.y + sin * dist, yMin, yMax);
      } else {
        this.walkTargetX = randRange([bounds.x, bounds.x + bounds.width], this.config.random);
        this._flyTargetY = randRange([yMin, yMax], this.config.random);
      }
      this._roamHasTarget = true;
      this._roamTimer = randRange(
        wavy ? this.config.swimRetargetDuration : this.config.roamRetargetDuration,
        this.config.random,
      );
    }
    this._roamTimer -= dt;

    const toX = this.walkTargetX - this.x;
    const toY = this._flyTargetY - this.y;
    const distance = Math.hypot(toX, toY) || 1;
    let dirX = toX / distance;
    let dirY = toY / distance;

    if (wavy) {
      // Wave perpendicular to the direct path, fish-tail-like undulating
      // swimming rather than a straight line. Amplitude < 1: the
      // "toward the target" component always stays dominant, so the
      // target is always eventually reached (or redrawn before then).
      this._swimPhase = (this._swimPhase ?? 0) + dt * this.config.swimWaveFrequency;
      const wobble = Math.sin(this._swimPhase) * this.config.swimWaveAmplitude;
      const perpX = -dirY;
      const perpY = dirX;
      dirX += perpX * wobble;
      dirY += perpY * wobble;
      const norm = Math.hypot(dirX, dirY) || 1;
      dirX /= norm;
      dirY /= norm;
    }

    this.facing = sign(dirX) || this.facing;
    this.x += dirX * speed * dt;
    this.y += dirY * speed * dt;
  }

  /**
   * Flight of a species that can also walk on the ground: as soon as it
   * takes off, a surface to land on is chosen (a window ledge or the
   * ground), it flies to it in a straight line and lands, never falling
   * into free fall. The target changes only very rarely
   * (`flyRetargetChance`) or if its surface has disappeared or moved. A
   * purely aerial species has nowhere to land: it keeps the free roaming
   * of _tickRoam.
   */
  _tickFly(dt, surfaces, options) {
    const factor =
      this.state === State.DIVE
        ? this.config.diveSpeedFactor
        : this.state === State.FLY_FAST
          ? this.config.flyFastFactor
          : 1;

    if (this._groundlessRoamState() === State.FLY) {
      this._tickRoam(dt, options, this.config.flySpeed * factor, [0, 0.5], false);
      return;
    }

    let target = this._flyTarget;
    if (target?.segment) {
      const seg = target.segment;
      const fresh = findSegmentById(surfaces.segments ?? [], seg.surfaceId, seg.type, (seg.x1 + seg.x2) / 2);
      if (!fresh || fresh.y !== seg.y || fresh.x1 !== seg.x1 || fresh.x2 !== seg.x2) target = null;
    }
    if (target && this.state !== State.DIVE && this.config.random() < this.config.flyRetargetChance * dt) {
      target = null;
    }
    if (!target) {
      target = this._flyTarget = this._pickFlyTarget(surfaces, options);
      this._flyWaypoint = this._pickCruise(target, options);
      if (this.state === State.DIVE) this.state = State.FLY; // target lost: back to normal flight
    }

    // Dive: only toward a target that's clearly lower and steep, and
    // never during the climb to cruising altitude.
    if (this.state !== State.DIVE && !this._flyWaypoint && target.segment) {
      const dy = target.y - this.y;
      const dx = Math.abs(target.x - this.x);
      if (
        dy >= this.config.diveMinHeight &&
        dx <= 1.5 * dy &&
        this.config.random() < this.config.diveChance * dt
      ) {
        this.state = State.DIVE;
      }
    }

    const goal = this._flyWaypoint ?? target;
    const speed = this.config.flySpeed * (this.state === State.DIVE ? this.config.diveSpeedFactor : factor);
    const toX = goal.x - this.x;
    const toY = goal.y - this.y;
    const distance = Math.hypot(toX, toY);
    const step = speed * dt;
    if (distance <= step + 1) {
      this.x = goal.x;
      this.y = goal.y;
      if (this._flyWaypoint) {
        this._flyWaypoint = null;
        return;
      }
      this._flyTarget = null;
      if (target.segment) {
        this.currentSurface = target.segment;
        this.vy = 0;
        this._enterState(State.IDLE);
        this.lastEvent = 'landed';
      } else {
        this._enterState(State.FALL); // no known surface: the world's floor
      }
      return;
    }
    this.facing = sign(toX) || this.facing;
    this.x += (toX / distance) * step;
    this.y += (toY / distance) * step;
  }

  /** Optional cruising point: high on the screen and above the target, so
   * the descent that follows can be a dive. */
  _pickCruise(target, options) {
    if (!target.segment || this.config.random() >= this.config.flyCruiseChance) return null;
    const bounds = options.worldBounds ?? { x: 0, y: 0, width: 1920, height: 1080 };
    const top = bounds.y + bounds.height * 0.08;
    const bottom = Math.min(target.y - this.config.diveMinHeight, bounds.y + bounds.height * 0.5);
    if (bottom <= top) return null;
    const y = randRange([top, bottom], this.config.random);
    const spread = (target.y - y) * 0.5;
    const x = clamp(
      target.x + randRange([-spread, spread], this.config.random),
      bounds.x,
      bounds.x + bounds.width,
    );
    return { x, y };
  }

  /** Landing surface (ground or ledge, other than the one being left, if
   * possible) and arrival point on it; failing that, the bottom of the world. */
  _pickFlyTarget(surfaces, options) {
    const landable = (surfaces.segments ?? []).filter(
      (seg) => (seg.type === 'ground' || seg.type === 'shelf') && seg.x2 > seg.x1,
    );
    const others = landable.filter((seg) => seg.surfaceId !== (this._flyOriginId ?? this.currentSurface?.surfaceId));
    const pool = others.length > 0 ? others : landable;

    if (pool.length === 0) {
      const bounds = options.worldBounds ?? { x: 0, y: 0, width: 1920, height: 1080 };
      return {
        segment: null,
        x: randRange([bounds.x, bounds.x + bounds.width], this.config.random),
        y: bounds.y + bounds.height,
      };
    }
    const segment = pool[Math.min(pool.length - 1, Math.floor(this.config.random() * pool.length))];
    const margin = Math.min(8, (segment.x2 - segment.x1) / 2);
    return {
      segment,
      x: randRange([segment.x1 + margin, segment.x2 - margin], this.config.random),
      y: segment.y,
    };
  }

  _tickSwim(dt, options) {
    const factor = this.state === State.SWIM_FAST ? this.config.swimFastFactor : 1;
    this._tickRoam(dt, options, this.config.swimSpeed * factor, [0, 1], true); // whole screen, undulating
  }

  _enterState(state) {
    if (state !== State.FALL && state !== State.CLIMB && state !== State.CEILING) this._noGrab = false;
    this._dropDir = null;
    this._reliefTarget = null;
    this._releaseFood();
    this._playTarget = null;
    this._huntTarget = null;
    this.state = state;
    switch (state) {
      case State.IDLE:
        this.stateTimer = randRange(this.config.idleDuration, this.config.random);
        break;
      case State.FALL:
        this.vy = 0;
        this.currentSurface = null;
        break;
      case State.CEILING:
        // stateTimer inherited from the previous state (WALK/CLIMB...) would
        // already be exhausted: without this reset, _tickCeiling would fall
        // again on the very next tick, before even visibly latching on.
        this.stateTimer = randRange(this.config.walkDuration, this.config.random);
        break;
      default:
        break;
    }
  }
}
