// Achievements: templates (the common library in core/achievementLibrary.js
// and a pack's `achievements` section) expanded into concrete achievements,
// then evaluation and a display model. Pure module. Format described in
// docs/progression.md.

import {
  CONDITION_STATS, MARK_FAMILIES, PLAYER_CONDITION_STATS, PLAYER_MARK_FAMILIES,
} from './stats.js';
import { STAGES, TRAITS } from './life.js';
import { needsOverrides, DEFAULT_DECAY_PER_HOUR } from './needs.js';
import { tricksOverrides } from './tricks.js';
import { TOYS, GIFTS, PLANTS, BED_MODELS, toyFits } from './items.js';
import { ACCESSORIES } from './accessories.js';
import { SEASONS, HOLIDAYS } from './calendar.js';
import { LIBRARY } from './achievementLibrary.js';
import { _, language } from './i18n.js';

/** Categories of real animal achievements, in display order. */
export const CATEGORIES = Object.freeze(['care', 'play', 'exploration', 'life', 'collection', 'seasons']);
/** An animal's "troll" achievements (hidden until discovered). */
export const TROLL_CATEGORY = 'mischief';
/** Player achievements (shared between animals). */
export const PLAYER_CATEGORY = 'player';
export const DISPLAY_ORDER = Object.freeze([...CATEGORIES, TROLL_CATEGORY, PLAYER_CATEGORY]);

/** What a species can do (see speciesProfile), to rule out impossible achievements. */
export const CAPABILITIES = Object.freeze([
  'ground', 'wall', 'ceiling', 'air', 'water', 'hunt', 'graze', 'relieve', 'tricks', 'sleep', 'groom',
]);
export const BOX_TIERS = Object.freeze(['bronze', 'silver', 'gold', 'platinum', 'legendary']);
/** Default coins depending on the tier's rank (1st, 2nd...). */
export const TIER_COINS = Object.freeze([5, 10, 20, 40, 80, 150]);
export const DEFAULT_ACHIEVEMENT_COINS = 10;

const LOCOMOTIONS = new Set(['ground', 'wall', 'ceiling', 'air', 'water']);

/** Category inferred from the stat, for old-format achievements (without `category`). */
const STAT_CATEGORY = {
  meals: 'care', mealsFavorite: 'care', pets: 'care', purrs: 'care', brushes: 'care', washes: 'care', greets: 'care',
  playSessions: 'play', ballKicks: 'play', tricksPerformed: 'play', follows: 'play', ringPushes: 'play', laserChases: 'play',
  climbs: 'exploration', flights: 'exploration', dives: 'exploration', swims: 'exploration', runs: 'exploration',
  hunts: 'exploration', grazes: 'exploration', ceilingWalks: 'exploration',
  giftsGiven: 'collection', tricksLearned: 'collection', achievementsUnlocked: 'collection',
};

/** "Normal" accessories (neither trophy nor joke): basis for "all the accessories". */
const WEARABLE_COUNT = Object.values(ACCESSORIES).filter((def) => !def.trophy && !def.joke).length;

/**
 * What a species can do, based on its pack.
 * @param {object} meta pack.json
 * @returns {{can: Set<string>, diet: string[], toys: string[], tricks: string[]}}
 */
export function speciesProfile(meta = {}) {
  const needs = needsOverrides(meta.needs);
  const rate = (gauge) => needs.rates[gauge] ?? DEFAULT_DECAY_PER_HOUR[gauge];
  const can = new Set((meta.supportedSurfaces ?? ['ground']).filter((s) => LOCOMOTIONS.has(s)));
  const diet = Object.keys(needs.diet);
  const tricks = tricksOverrides(meta.tricks).list;
  if (Object.keys(needs.prey).length > 0) can.add('hunt');
  if (diet.some((kind) => PLANTS[kind])) can.add('graze');
  if (rate('relief') > 0) can.add('relieve');
  if (rate('energy') > 0) can.add('sleep');
  if (rate('cleanliness') > 0) can.add('groom');
  if (tricks.length > 0) can.add('tricks');
  const groundless = !can.has('ground');
  return { can, diet, tricks, toys: Object.keys(TOYS).filter((kind) => toyFits(kind, groundless)) };
}

/** "1000" -> "1 000" (narrow no-break space; comma in English). */
export function formatCount(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, language() === 'en' ? ',' : '\u202f');
}

/** A template's text in the displayed language (library: gettext catalogue; packs: `translations` section). */
const tr = (text) => (typeof text === 'string' && text !== '' ? _(text) : text);

/** A reward with its translated text. */
const translatedReward = (reward) => (reward.text ? { ...reward, text: tr(reward.text) } : reward);

function render(text, n) {
  return text.replaceAll('{n}', formatCount(n)).replaceAll('{s}', n > 1 ? 's' : '');
}

const isText = (v) => typeof v === 'string' && v.trim() !== '';

/** Value of "all" for a condition, based on the species (null: "all" doesn't make sense here). */
function allValue(condition, profile) {
  if (condition.stat === 'tricksLearned') return profile.tricks.length;
  switch (condition.marks) {
    case 'food': return profile.diet.length;
    case 'toy': return profile.toys.length;
    case 'accessory': return WEARABLE_COUNT;
    case 'gift': return Object.keys(GIFTS).length;
    case 'bed': return BED_MODELS.length;
    case 'season': return SEASONS.length;
    case 'holiday': return HOLIDAYS.length;
    default: return null;
  }
}

function validRequires(raw) {
  const requires = raw ?? {};
  const can = requires.can === undefined ? [] : [].concat(requires.can);
  const ok =
    (requires.trait === undefined || TRAITS.includes(requires.trait)) &&
    (requires.stage === undefined || STAGES.includes(requires.stage)) &&
    can.every((c) => CAPABILITIES.includes(c));
  return ok ? { trait: requires.trait, stage: requires.stage, can } : null;
}

/** Normalized condition `{stat|marks|mark, atLeast}`, or null if invalid for this scope. */
function validCondition(raw, scope, atLeast) {
  const stats = scope === 'player' ? PLAYER_CONDITION_STATS : CONDITION_STATS;
  const families = scope === 'player' ? PLAYER_MARK_FAMILIES : MARK_FAMILIES;
  if (raw.stat !== undefined) return stats.includes(raw.stat) ? { stat: raw.stat, atLeast } : null;
  if (raw.marks !== undefined) return families.includes(raw.marks) ? { marks: raw.marks, atLeast } : null;
  if (raw.mark !== undefined) {
    const [family, value] = String(raw.mark).split(':');
    return families.includes(family) && isText(value) ? { mark: raw.mark, atLeast: 1 } : null;
  }
  return null;
}

/** Reward of a troll achievement: exactly one kind (coins, box, accessory) or a plain text. */
function validReward(raw) {
  if (raw === undefined) return { coins: 0 };
  if (!raw || typeof raw !== 'object') return null;
  const kinds = ['coins', 'box', 'accessory'].filter((k) => raw[k] !== undefined);
  if (kinds.length > 1 || (kinds.length === 0 && !isText(raw.text))) return null;
  if (raw.text !== undefined && !isText(raw.text)) return null;
  if (raw.coins !== undefined && !(Number.isInteger(raw.coins) && raw.coins >= -5 && raw.coins <= 500)) return null;
  if (raw.box !== undefined && !BOX_TIERS.includes(raw.box)) return null;
  if (raw.accessory !== undefined && !ACCESSORIES[raw.accessory]?.joke) return null;
  return { ...raw };
}

function validCoins(value, fallback) {
  if (value === undefined) return fallback;
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Scope, category and troll flag common to both series and single entries. */
function placement(entry, condition) {
  const scope = entry.scope === 'player' ? 'player' : entry.scope === undefined || entry.scope === 'critter' ? 'critter' : null;
  if (!scope) return null;
  const troll = entry.troll === true;
  let category;
  if (scope === 'player') category = PLAYER_CATEGORY;
  else if (troll) category = TROLL_CATEGORY;
  else category = entry.category ?? STAT_CATEGORY[condition?.stat] ?? 'life';
  if (scope === 'critter' && !troll && !CATEGORIES.includes(category)) return null;
  return { scope, troll, category };
}

/** A single entry (new format or old `condition: {stat, atLeast}`) -> achievement, or null. */
function expandSingle(entry) {
  const raw = entry.condition ?? entry;
  const atLeast = raw.mark !== undefined ? 1 : raw.atLeast;
  if (raw.mark === undefined && !(Number.isFinite(atLeast) && atLeast > 0)) return null;
  const requires = validRequires(entry.requires);
  const where = placement(entry, raw);
  if (!requires || !where || !isText(entry.id) || !isText(entry.name) || typeof entry.description !== 'string') return null;
  const condition = validCondition(raw, where.scope, atLeast);
  if (!condition) return null;
  if (where.troll && !isText(entry.quip)) return null;
  const reward = where.troll ? validReward(entry.reward) : entry.reward === undefined ? { coins: validCoins(entry.coins, DEFAULT_ACHIEVEMENT_COINS) } : validReward(entry.reward);
  if (!reward || reward.coins === null) return null;
  if (entry.title !== undefined && !isText(entry.title)) return null;
  return [{
    id: entry.id,
    name: tr(entry.name),
    description: tr(entry.description),
    ...where,
    series: null,
    condition,
    unit: 1,
    requires,
    reward: translatedReward(reward),
    quip: where.troll ? tr(entry.quip) : null,
    title: tr(entry.title) ?? null,
  }];
}

/**
 * A series -> its tiers, or null if invalid; [] when the species has
 * nothing to collect ("all" is worth 0).
 */
function expandSeries(entry, profile) {
  const tiers = entry.tiers;
  const requires = validRequires(entry.requires);
  const firstCondition = { stat: entry.stat, marks: entry.marks };
  const where = placement(entry, firstCondition);
  if (!requires || !where || !isText(entry.series) || !/^[a-zA-Z0-9-]+$/.test(entry.series)) return null;
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  const aligned = (list) => Array.isArray(list) && list.length === tiers.length;
  if (!aligned(entry.names) || !entry.names.every(isText)) return null;
  const descriptions = entry.descriptions ?? tiers.map(() => entry.description);
  if (!aligned(descriptions) || !descriptions.every((d) => typeof d === 'string')) return null;
  if (entry.stat === undefined && entry.marks === undefined) return null;
  const probe = validCondition(firstCondition.stat !== undefined ? { stat: entry.stat } : { marks: entry.marks }, where.scope, 1);
  if (!probe) return null;
  const unit = entry.unit ?? 1;
  if (!(Number.isFinite(unit) && unit > 0)) return null;
  const quips = where.troll ? entry.quips ?? tiers.map(() => entry.quip) : null;
  if (where.troll && (!aligned(quips) || !quips.every(isText))) return null;
  const rewards = where.troll ? (Array.isArray(entry.reward) ? entry.reward : tiers.map(() => entry.reward)) : null;
  if (where.troll && !aligned(rewards)) return null;
  if (entry.coins !== undefined && (!aligned(entry.coins) || !entry.coins.every((c) => validCoins(c, null) !== null))) return null;
  if (entry.title !== undefined && !isText(entry.title)) return null;

  // Tiers: increasing numbers, "all" (species-dependent) or {at, id} to keep an old identifier.
  const cap = tiers.includes('all') ? allValue(probe, profile) : null;
  if (tiers.includes('all') && cap === null) return null;
  const kept = [];
  for (const [index, tier] of tiers.entries()) {
    const at = tier === 'all' ? cap : typeof tier === 'object' && tier !== null ? tier.at : tier;
    const id = typeof tier === 'object' && tier !== null ? tier.id : undefined;
    if (!Number.isFinite(at) || at <= 0 || (id !== undefined && !isText(id))) return null;
    if (kept.length > 0 && at <= kept[kept.length - 1].at) {
      if (id !== undefined) return null; // a historical identifier must never disappear
      continue;
    }
    if (cap !== null && at > cap) {
      if (id !== undefined) return null;
      continue;
    }
    kept.push({ at, id, index });
  }
  const defs = [];
  for (const [rank, { at, id, index }] of kept.entries()) {
    const reward = where.troll
      ? validReward(rewards[index])
      : { coins: entry.coins?.[index] ?? TIER_COINS[Math.min(rank, TIER_COINS.length - 1)] };
    if (!reward) return null;
    defs.push({
      id: id ?? `${entry.series}-${at}`,
      name: tr(entry.names[index]),
      description: render(tr(descriptions[index]), at),
      ...where,
      series: entry.series,
      condition: { ...probe, atLeast: at * unit },
      unit,
      requires,
      reward: translatedReward(reward),
      quip: where.troll ? tr(quips[index]) : null,
      title: rank === kept.length - 1 ? tr(entry.title) ?? null : null,
    });
  }
  return defs;
}

const entryKey = (entry) => (entry && typeof entry === 'object' ? (entry.series ? `s:${entry.series}` : `i:${entry.id}`) : null);
const entryLabel = (entry, index) => (entry?.series ?? entry?.id ?? `#${index}`);

/**
 * Common library + a pack's `achievements` section -> concrete achievements.
 * A pack entry with the same `series` (or the same `id`) replaces the one
 * from the library; `disabled: true` removes it. Achievements the species
 * can never earn (`requires.can`) are dropped without being reported.
 * @param {unknown} packEntries
 * @param {ReturnType<typeof speciesProfile>} profile
 * @param {object[]} [library]
 * @returns {{critter: object[], player: object[], ignored: string[]}}
 */
export function buildAchievements(packEntries, profile, library = LIBRARY) {
  const ignored = [];
  const merged = new Map(library.map((entry) => [entryKey(entry), entry]));
  if (packEntries !== undefined && !Array.isArray(packEntries)) ignored.push('achievements');
  else {
    const packKeys = new Set();
    for (const [index, entry] of (packEntries ?? []).entries()) {
      const key = entryKey(entry);
      if (!key || key === 's:undefined' || key === 'i:undefined' || packKeys.has(key)) {
        ignored.push(entryLabel(entry, index)); // unreadable entry, or a duplicate within the pack
        continue;
      }
      packKeys.add(key);
      if (entry.disabled === true) merged.delete(key);
      else {
        merged.delete(key); // replaced: takes its spot back at the end of the list
        merged.set(key, { ...entry, fromPack: true, packIndex: index });
      }
    }
  }

  const critter = [];
  const player = [];
  const seen = new Set();
  for (const entry of merged.values()) {
    const defs = entry.series !== undefined ? expandSeries(entry, profile) : expandSingle(entry);
    if (!defs) {
      ignored.push(entryLabel(entry, entry.packIndex ?? 0));
      continue;
    }
    for (const def of defs) {
      if (!def.requires.can.every((c) => profile.can.has(c))) continue;
      if (seen.has(def.id)) {
        ignored.push(def.id);
        continue;
      }
      seen.add(def.id);
      (def.scope === 'player' ? player : critter).push(def);
    }
  }
  return { critter, player, ignored };
}

// --- Evaluation ---------------------------------------------------------------------

function countMarks(marks, family) {
  const prefix = `${family}:`;
  let n = 0;
  for (const mark of marks ?? []) if (mark.startsWith(prefix)) n++;
  return n;
}

/** Current value of a condition (in the stat's unit). */
export function conditionValue(condition, facts) {
  if (condition.stat !== undefined) return facts.stats?.[condition.stat] ?? 0;
  if (condition.marks !== undefined) return countMarks(facts.marks, condition.marks);
  return facts.marks?.has(condition.mark) ? 1 : 0;
}

/** Can an animal ever earn this achievement? (its trait matches; the stage is reached with time) */
export function isEligible(def, { trait }) {
  return def.requires.trait === undefined || def.requires.trait === trait;
}

/**
 * Achievements to unlock now.
 * @param {object[]} defs
 * @param {{trait?: string|null, stage?: string, facts: {stats: Record<string, number>, marks: Set<string>}}} context
 * @param {Set<string>} unlocked ids already earned
 */
export function newlyUnlocked(defs, { trait = null, stage, facts }, unlocked) {
  return defs
    .filter((def) => !unlocked.has(def.id))
    .filter((def) => isEligible(def, { trait }))
    .filter((def) => def.requires.stage === undefined || def.requires.stage === stage)
    .filter((def) => conditionValue(def.condition, facts) >= def.condition.atLeast)
    .map((def) => def.id);
}

/** Titles earned: `[{id, title}]`, id of the achievement that granted it. */
export function titlesFor(defs, unlocked) {
  return defs.filter((def) => def.title && unlocked.has(def.id)).map((def) => ({ id: def.id, title: def.title }));
}

/** Number of achievements earned / possible for this trait. */
export function achievementCount(defs, { trait = null, unlocked }) {
  const eligible = defs.filter((def) => isEligible(def, { trait }));
  return { done: eligible.filter((def) => unlocked.has(def.id)).length, total: eligible.length };
}

/**
 * Display model per category. A series gives one row: its last tier
 * earned and the next one, with progress; a troll achievement (series or
 * single) only appears once discovered, its category gives the count.
 * @returns {{done: number, total: number, categories: {id: string, done: number, total: number, entries: object[]}[]}}
 */
export function achievementView(defs, { trait = null, unlocked, facts }) {
  const eligible = defs.filter((def) => isEligible(def, { trait }));
  const groups = new Map();
  for (const def of eligible) {
    const key = def.series ? `s:${def.series}` : `i:${def.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(def);
  }
  const categories = new Map(DISPLAY_ORDER.map((id) => [id, { id, done: 0, total: 0, entries: [] }]));
  for (const tiers of groups.values()) {
    tiers.sort((a, b) => a.condition.atLeast - b.condition.atLeast);
    const category = categories.get(tiers[0].category);
    const got = tiers.filter((def) => unlocked.has(def.id));
    category.done += got.length;
    category.total += tiers.length;
    if (tiers[0].troll && got.length === 0) continue; // mischief not discovered yet
    const last = got[got.length - 1] ?? null;
    const next = tiers.find((def) => !unlocked.has(def.id)) ?? null;
    const shown = next ?? last;
    category.entries.push({
      id: shown.id,
      series: tiers[0].series !== null,
      troll: shown.troll,
      name: shown.name,
      description: shown.description,
      done: next === null,
      last: last && last !== shown ? { name: last.name } : null,
      value: next ? Math.floor(conditionValue(next.condition, facts) / next.unit) : null,
      target: next ? next.condition.atLeast / next.unit : null,
      tier: got.length,
      tiers: tiers.length,
      title: tiers[tiers.length - 1].title,
      quip: (last ?? shown).quip,
      reward: (last ?? shown).reward,
    });
  }
  const list = [...categories.values()].filter((c) => c.total > 0);
  return {
    done: list.reduce((sum, c) => sum + c.done, 0),
    total: list.reduce((sum, c) => sum + c.total, 0),
    categories: list,
  };
}
