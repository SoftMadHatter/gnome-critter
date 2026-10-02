// Cosmetic accessories (hats, bow, glasses...) bought at the shop, and the
// head anchor points declared by packs. Pure module.

import { _, N_ } from './i18n.js';
import { ACCESSORY_GRID, ACCESSORY_METRICS } from './accessoryMetrics.js';

/**
 * `months`: months (1-12) during which the accessory is free and available; without `months`, bought at `price`.
 * `trophy`: never in the shop, awarded when the player reaches this many achievements.
 * `joke`: never in the shop, a silly reward from certain achievements (and the Committee's boxes).
 */
export const ACCESSORIES = Object.freeze({
  partyhat: { label: N_('Chapeau de fête'), price: 20 },
  bow: { label: N_('Nœud'), price: 15 },
  glasses: { label: N_('Lunettes'), price: 30 },
  crown: { label: N_('Couronne'), price: 80 },
  santa: { label: N_('Bonnet de Noël'), price: 0, months: [12] },
  witch: { label: N_('Chapeau de sorcière'), price: 0, months: [10] },
  medal: { label: N_('Médaille'), trophy: 25 },
  laurel: { label: N_('Couronne de laurier'), trophy: 50 },
  halo: { label: N_('Auréole'), trophy: 100 },
  cone: { label: N_('Cône de la honte'), joke: true },
  sock: { label: N_('Chaussette'), joke: true },
  foilhat: { label: N_('Chapeau en papier alu'), joke: true },
});

/** Displayed name of an accessory. */
export function accessoryLabel(id) {
  return ACCESSORIES[id] ? _(ACCESSORIES[id].label) : id;
}

/** An accessory outside the shop (trophy or joke), obtained some other way than buying it. */
export function isSpecial(id) {
  return Boolean(ACCESSORIES[id]?.trophy || ACCESSORIES[id]?.joke);
}

/** Trophies reached with `count` achievements: `[{id, label}]`, from the lowest threshold to the highest. */
export function trophiesFor(count) {
  return Object.entries(ACCESSORIES)
    .filter(([, def]) => def.trophy && count >= def.trophy)
    .sort((a, b) => a[1].trophy - b[1].trophy)
    .map(([id]) => ({ id, label: accessoryLabel(id) }));
}

/** Price in coins of a premium food (the others are free). */
export const FOOD_PRICES = Object.freeze({ meat: 2, fish: 3, pate: 2 });

export function inSeason(id, date) {
  const months = ACCESSORIES[id]?.months;
  return !months || months.includes(date.getMonth() + 1);
}

/**
 * Accessories offered at the shop on this date: purchasable (with their
 * price) and in-season (free).
 * @param {Date} date
 * @param {string[]} owned
 * @returns {{id: string, label: string, price: number, owned: boolean, free: boolean}[]}
 */
export function shopList(date, owned) {
  return Object.entries(ACCESSORIES)
    .filter(([id]) => !isSpecial(id) && inSeason(id, date))
    .map(([id, def]) => ({ id, label: accessoryLabel(id), price: def.price, free: def.price === 0, owned: owned.includes(id) }));
}

/** Accessories an animal can currently wear: bought, free in-season, trophies and jokes obtained. */
export function equippable(date, owned) {
  const special = Object.entries(ACCESSORIES)
    .filter(([id]) => isSpecial(id) && owned.includes(id))
    .map(([id]) => ({ id, label: accessoryLabel(id), price: 0, free: false, owned: true }));
  return [...shopList(date, owned).filter((a) => a.owned || a.free), ...special];
}

/**
 * How an accessory sits, in head widths (the critter's head, so a bow stays
 * small on a small head):
 * - `slot`: where it is worn, see SLOTS (default `top`).
 * - `span`: width of the drawn part (not of the image) in head widths.
 * - `at`: the point of the drawn part, as fractions of its box, that lands on
 *   the slot's point (default: bottom center for `top`, center otherwise).
 * - `shift`: extra downward shift of that point, in head widths (the halo
 *   floats above, the cone of shame wraps around the neck).
 */
export const ACCESSORY_LAYOUT = Object.freeze({
  partyhat: { span: 0.9 },
  crown: { span: 0.95 },
  santa: { span: 1.15 },
  witch: { span: 1.4 },
  foilhat: { span: 1 },
  laurel: { span: 1.05, shift: 0.4 },
  halo: { span: 0.8, shift: -0.47 },
  cone: { span: 1.5, shift: 1.75 },
  sock: { span: 1 },
  glasses: { slot: 'face', span: 0.9 },
  bow: { slot: 'neck', span: 0.5 },
  medal: { slot: 'neck', span: 0.4, at: [0.5, 0.15] },
});

/** Where on the head an accessory is worn: the top (hats), the face (glasses), the neck (medal, bow). */
export const SLOTS = Object.freeze(['top', 'face', 'neck']);

/**
 * An accessory's layout for a pack: the defaults above, overridden by the pack's `anchors.layout`.
 * @param {string} id
 * @param {{layout?: Record<string, object>}} [anchors] from anchorsOverrides
 */
export function layoutFor(id, anchors) {
  return { ...ACCESSORY_LAYOUT[id], ...anchors?.layout?.[id] };
}

export function accessorySlot(id, anchors) {
  return layoutFor(id, anchors).slot ?? 'top';
}

const DEFAULT_HEAD_ANCHOR = { x: 0.72, y: 0.2 };
const DEFAULT_HEAD_WIDTH = 0.375;
// Offsets from the head point, in head widths (sprite facing right): `top` sinks hats into the head.
const DEFAULT_SLOTS = Object.freeze({ top: { dx: 0, dy: 0 }, face: { dx: 0, dy: 0.35 }, neck: { dx: -0.1, dy: 0.85 } });
const ROTATIONS = [0, 180];
const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const STAGE_FIT = ['baby', 'young', 'senior'];

const isFraction = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
const isWidth = (v) => Number.isFinite(v) && v > 0 && v <= 1;
const isPair = (v) => Array.isArray(v) && v.length === 2 && isFraction(v[0]) && isFraction(v[1]);
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const toPoint = (v) => ({ x: v[0], y: v[1] });

/**
 * Size and position of an accessory on the sprite displayed in `box`: the
 * square its image is drawn in. Same computation for the extension and the
 * review tool.
 * @param {string} id
 * @param {{x:number, y:number, width:number, height:number}} box the sprite's rectangle
 * @param {{x:number, y:number, headWidth?:number}} anchor slot point (fractions, sprite facing right) and head width
 * @param {number} facing 1 (right) or -1 (left)
 * @param {number} [rotation] 180 when the head is upside down: the accessory hangs below the point
 * @param {object} [layout] the accessory's layout for the pack (see layoutFor); the defaults if omitted
 * @returns {{x:number, y:number, size:number}}
 */
export function accessoryPlacement(id, box, anchor, facing, rotation = 0, layout = ACCESSORY_LAYOUT[id] ?? {}) {
  const m = ACCESSORY_METRICS[id] ?? { x0: 0, y0: 0, x1: ACCESSORY_GRID, y1: ACCESSORY_GRID };
  const head = (anchor.headWidth ?? DEFAULT_HEAD_WIDTH) * box.width;
  const size = Math.max(6, Math.round((head * (layout.span ?? 1)) / ((m.x1 - m.x0) / ACCESSORY_GRID)));
  const at = layout.at ?? ((layout.slot ?? 'top') === 'top' ? [0.5, 1] : [0.5, 0.5]);
  // Where the point lands in the image, once mirrored (facing left) and turned (upside down).
  let ix = (m.x0 + at[0] * (m.x1 - m.x0)) / ACCESSORY_GRID;
  let iy = (m.y0 + at[1] * (m.y1 - m.y0)) / ACCESSORY_GRID;
  if (facing < 0) ix = 1 - ix;
  let py = box.y + anchor.y * box.height;
  const shift = (layout.shift ?? 0) * head;
  if (rotation === 180) {
    ix = 1 - ix;
    iy = 1 - iy;
    py -= shift;
  } else {
    py += shift;
  }
  const px = box.x + (facing >= 0 ? anchor.x : 1 - anchor.x) * box.width;
  return { x: Math.round(px - ix * size), y: Math.round(py - iy * size), size };
}

/**
 * One animation's entry: a point `[x, y]` (all frames), a list with one
 * point or `false` (hidden) per frame, `false` (hidden everywhere), or
 * `{ rotation, width, points }` where `points` is either of the first two
 * forms, `rotation` 0 or 180 and `width` the head width on these frames
 * (when it differs from the stage's, e.g. a sleeping baby drawn smaller).
 * @returns {{rotation: number, width: number|null, points: ({x:number, y:number}|null)[]}|null} null if invalid
 */
function parseEntry(raw) {
  let rotation = 0;
  let width = null;
  let list = raw;
  if (isObject(raw)) {
    if (raw.rotation !== undefined && !ROTATIONS.includes(raw.rotation)) return null;
    if (raw.width !== undefined && !isWidth(raw.width)) return null;
    rotation = raw.rotation ?? 0;
    width = raw.width ?? null;
    list = raw.points;
  }
  if (list === false) return { rotation, width, points: [null] };
  if (isPair(list)) return { rotation, width, points: [toPoint(list)] };
  if (Array.isArray(list) && list.length > 0 && list.every((v) => v === false || isPair(v))) {
    return { rotation, width, points: list.map((v) => (v === false ? null : toPoint(v))) };
  }
  return null;
}

function parseTable(raw, prefix, ignored) {
  const table = {};
  for (const [name, value] of Object.entries(raw)) {
    const entry = NAME.test(name) ? parseEntry(value) : null;
    if (entry) table[name] = entry;
    else ignored.push(`${prefix}.${name}`);
  }
  return table;
}

/** `{animations, reactions}` out of a raw object holding one or both tables. */
function parseTables(raw, prefix, ignored) {
  const out = { animations: {}, reactions: {} };
  for (const [key, value] of Object.entries(raw)) {
    if ((key === 'animations' || key === 'reactions') && isObject(value)) out[key] = parseTable(value, `${prefix}${key}`, ignored);
    else ignored.push(`${prefix}${key}`);
  }
  return out;
}

function parseStage(raw, prefix, ignored) {
  const stage = { headWidth: null, animations: {}, reactions: {}, base: { animations: {}, reactions: {} } };
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'headWidth' && isWidth(value)) stage.headWidth = value;
    else if ((key === 'animations' || key === 'reactions') && isObject(value)) stage[key] = parseTable(value, `${prefix}${key}`, ignored);
    else if (key === 'base' && isObject(value)) stage.base = parseTables(value, `${prefix}base.`, ignored);
    else ignored.push(`${prefix}${key}`);
  }
  return stage;
}

const LAYOUT_FIELDS = {
  span: (v) => Number.isFinite(v) && v >= 0.1 && v <= 3,
  shift: (v) => Number.isFinite(v) && v >= -3 && v <= 3,
  at: (v) => Array.isArray(v) && v.length === 2 && v.every(isFraction),
  slot: (v) => SLOTS.includes(v),
};

/** `anchors.layout`: partial overrides of ACCESSORY_LAYOUT per accessory, only valid fields kept. */
function parseLayout(raw, ignored) {
  const layout = {};
  for (const [id, fields] of Object.entries(raw)) {
    if (!(id in ACCESSORIES) || !isObject(fields)) {
      ignored.push(`layout.${id}`);
      continue;
    }
    const kept = {};
    for (const [field, value] of Object.entries(fields)) {
      if (LAYOUT_FIELDS[field]?.(value)) kept[field] = field === 'at' ? [...value] : value;
      else ignored.push(`layout.${id}.${field}`);
    }
    if (Object.keys(kept).length > 0) layout[id] = kept;
  }
  return layout;
}

/**
 * Validates the `anchors` section of a pack: where accessories sit.
 * - `head`: the top of the head, in fractions of the sprite's size, sprite facing right (fallback).
 * - `headWidth`: width of the head, in fractions of the sprite's width (accessories are sized on it).
 * - `base`: `{ animations, reactions }` generated by the sprite script (scripts/gen_species_sprites.py).
 * - `animations` / `reactions`: manual touch-ups of the head point per animation (or reaction), one
 *   per frame (see parseEntry), which take precedence over `base`.
 * - `slots`: `top`, `face` and `neck` offsets from the head point (`dx`, `dy`), in head widths.
 * - `layout`: per accessory, overrides of ACCESSORY_LAYOUT for this pack (`span`, `shift`, `at`, `slot`).
 * - `stages`: for a stage drawn differently from the adult (`baby`, `young`, `senior`),
 *   `{ headWidth, base, animations, reactions }`; whatever it doesn't define comes from the adult.
 * - `stageFit`: without `stages`, a stage drawn smaller (`{ "baby": { "scale": 0.75 } }`):
 *   points are scaled around the bottom center of the frame.
 * @returns {{anchors: {head: {x:number, y:number}, headWidth: number, slots: Record<string, {dx:number, dy:number}>, animations: Record<string, any>, reactions: Record<string, any>, base: {animations: Record<string, any>, reactions: Record<string, any>}, stages: Record<string, any>, stageFit: Record<string, {scale:number}>, layout: Record<string, any>}, ignored: string[]}}
 */
export function anchorsOverrides(raw) {
  const anchors = {
    head: { ...DEFAULT_HEAD_ANCHOR },
    headWidth: DEFAULT_HEAD_WIDTH,
    slots: Object.fromEntries(Object.entries(DEFAULT_SLOTS).map(([slot, d]) => [slot, { ...d }])),
    animations: {},
    reactions: {},
    base: { animations: {}, reactions: {} },
    stages: {},
    stageFit: {},
    layout: {},
  };
  const ignored = [];
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (key === 'head' && isFraction(value?.x) && isFraction(value?.y)) {
      anchors.head = { x: value.x, y: value.y };
    } else if (key === 'headWidth' && isWidth(value)) {
      anchors.headWidth = value;
    } else if (key === 'slots' && isObject(value)) {
      for (const [slot, d] of Object.entries(value)) {
        if (slot in DEFAULT_SLOTS && Number.isFinite(d?.dx) && Number.isFinite(d?.dy) && Math.abs(d.dx) <= 3 && Math.abs(d.dy) <= 3) {
          anchors.slots[slot] = { dx: d.dx, dy: d.dy };
        } else ignored.push(`slots.${slot}`);
      }
    } else if ((key === 'animations' || key === 'reactions') && isObject(value)) {
      anchors[key] = parseTable(value, key, ignored);
    } else if (key === 'layout' && isObject(value)) {
      anchors.layout = parseLayout(value, ignored);
    } else if (key === 'base' && isObject(value)) {
      anchors.base = parseTables(value, 'base.', ignored);
    } else if (key === 'stages' && isObject(value)) {
      for (const [stage, block] of Object.entries(value)) {
        if (STAGE_FIT.includes(stage) && isObject(block)) anchors.stages[stage] = parseStage(block, `stages.${stage}.`, ignored);
        else ignored.push(`stages.${stage}`);
      }
    } else if (key === 'stageFit' && isObject(value)) {
      for (const [stage, fit] of Object.entries(value)) {
        if (STAGE_FIT.includes(stage) && Number.isFinite(fit?.scale) && fit.scale > 0 && fit.scale <= 1.5) {
          anchors.stageFit[stage] = { scale: fit.scale };
        } else ignored.push(`stageFit.${stage}`);
      }
    } else {
      ignored.push(key);
    }
  }
  return { anchors, ignored };
}

/**
 * The entry that decides an animation's (or reaction's) head points for a stage, and where it comes from.
 * Lookup order: the stage's touch-ups, the stage's generated points, the adult's touch-ups, the adult's
 * generated points.
 * @param {ReturnType<typeof anchorsOverrides>['anchors']} anchors
 * @param {{animation?: string, reaction?: string, stage?: string}} pose
 * @returns {{entry: {rotation:number, width:number|null, points:({x:number,y:number}|null)[]}, source: 'touch-up'|'generated', stage: boolean}|null}
 *   `stage`: true when the entry is the stage's own (not the adult's)
 */
export function anchorEntry(anchors, { animation, reaction, stage = 'adult' } = {}) {
  const kind = reaction ? 'reactions' : 'animations';
  const name = reaction ?? animation;
  const own = anchors.stages[stage];
  const layers = [
    [own?.[kind], 'touch-up', true],
    [own?.base[kind], 'generated', true],
    [anchors[kind], 'touch-up', false],
    [anchors.base[kind], 'generated', false],
  ];
  for (const [table, source, isStage] of layers) {
    if (table?.[name]) return { entry: table[name], source, stage: isStage };
  }
  return null;
}

/**
 * Where an accessory sits on the critter for the frame being displayed (see anchorEntry for the lookup
 * order; without any entry, the `head` fallback).
 * @param {ReturnType<typeof anchorsOverrides>['anchors']} anchors
 * @param {{animation?: string, reaction?: string, frame?: number, stage?: string, slot?: string}} pose
 *   the animation or reaction ACTUALLY playing (not the critter's state), its frame index, the life stage
 * @returns {{x:number, y:number, rotation:number, headWidth:number}|null} point in fractions of the sprite (facing right), head width in fractions of its width; null when hidden
 */
export function anchorFor(anchors, { animation, reaction, frame = 0, stage = 'adult', slot = 'top' } = {}) {
  const found = anchorEntry(anchors, { animation, reaction, stage });
  let point = anchors.head;
  let rotation = 0;
  let headWidth = anchors.stages[stage]?.headWidth ?? anchors.headWidth;
  if (found) {
    const { entry } = found;
    ({ rotation } = entry);
    headWidth = entry.width ?? headWidth;
    point = entry.points[Math.min(Math.max(frame, 0), entry.points.length - 1)];
    if (!point) return null;
  }
  const scale = found?.stage ? 1 : anchors.stageFit[stage]?.scale ?? 1;
  let { x, y } = point;
  const offset = anchors.slots[slot];
  if (offset) {
    x += offset.dx * headWidth;
    y += offset.dy * headWidth * (rotation === 180 ? -1 : 1);
  }
  if (scale !== 1) {
    x = 0.5 + (x - 0.5) * scale;
    y = 1 + (y - 1) * scale;
    headWidth *= scale;
  }
  return { x, y, rotation, headWidth };
}
