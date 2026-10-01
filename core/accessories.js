// Cosmetic accessories (hats, bow, glasses...) bought at the shop, and the
// head anchor points declared by packs. Pure module.

import { _, N_ } from './i18n.js';

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
 * Placement of an accessory on the head. `offset`: downward shift, as a
 * fraction of its size (hats rest on the anchor; items on the `face` and
 * `neck` slots are centered on theirs, the halo floats above, the cone of
 * shame wraps around the head); `scale`: relative size (1 = half the
 * sprite's width); `slot`: where it is worn, see SLOTS (default `top`).
 */
export const ACCESSORY_LAYOUT = Object.freeze({
  glasses: { slot: 'face', offset: 0.5 },
  bow: { slot: 'neck', offset: 0.5 },
  medal: { slot: 'neck', offset: 0.5 },
  laurel: { offset: 0.3 },
  halo: { offset: -0.35 },
  cone: { offset: 0.85, scale: 1.6 },
});

/**
 * Square where to draw an accessory on a sprite displayed in `box` (same
 * computation for the extension and the review tool).
 * @param {string} id
 * @param {{x:number, y:number, width:number, height:number}} box the sprite's rectangle
 * @param {{x:number, y:number}} head head anchor (fractions, sprite facing right)
 * @param {number} facing 1 (right) or -1 (left)
 * @param {number} [rotation] 180 when the head is upside down: the accessory hangs below the point
 * @returns {{x:number, y:number, size:number}}
 */
export function accessoryPlacement(id, box, head, facing, rotation = 0) {
  const layout = ACCESSORY_LAYOUT[id] ?? {};
  const size = Math.max(6, Math.round((box.width / 2) * (layout.scale ?? 1)));
  const ax = box.x + (facing >= 0 ? head.x : 1 - head.x) * box.width;
  const ay = box.y + head.y * box.height + (layout.offset ?? 0) * size;
  const offset = (layout.offset ?? 0) * size;
  const top = rotation === 180 ? box.y + head.y * box.height - offset : ay - size;
  return { x: Math.round(ax - size / 2), y: Math.round(top), size };
}

/** Where on the head an accessory is worn: the top (hats), the face (glasses), the neck (medal, bow). */
export const SLOTS = Object.freeze(['top', 'face', 'neck']);

export function accessorySlot(id) {
  return ACCESSORY_LAYOUT[id]?.slot ?? 'top';
}

const DEFAULT_HEAD_ANCHOR = { x: 0.72, y: 0.2 };
// Offsets from the head point (fractions of the sprite, sprite facing right).
const DEFAULT_SLOTS = Object.freeze({ face: { dx: 0, dy: 0.12 }, neck: { dx: -0.04, dy: 0.25 } });
const ROTATIONS = [0, 180];
const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const STAGE_FIT = ['baby', 'young', 'senior'];

const isFraction = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
const isPair = (v) => Array.isArray(v) && v.length === 2 && isFraction(v[0]) && isFraction(v[1]);
const toPoint = (v) => ({ x: v[0], y: v[1] });

/**
 * One animation's entry: a point `[x, y]` (all frames), a list with one
 * point or `false` (hidden) per frame, `false` (hidden everywhere), or
 * `{ rotation, points }` where `points` is either of the first two forms.
 * @returns {{rotation: number, points: ({x:number, y:number}|null)[]}|null} null if invalid
 */
function parseEntry(raw) {
  let rotation = 0;
  let list = raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (raw.rotation !== undefined && !ROTATIONS.includes(raw.rotation)) return null;
    rotation = raw.rotation ?? 0;
    list = raw.points;
  }
  if (list === false) return { rotation, points: [null] };
  if (isPair(list)) return { rotation, points: [toPoint(list)] };
  if (Array.isArray(list) && list.length > 0 && list.every((v) => v === false || isPair(v))) {
    return { rotation, points: list.map((v) => (v === false ? null : toPoint(v))) };
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

/**
 * Validates the `anchors` section of a pack: where accessories sit.
 * - `head`: the top of the head, in fractions of the sprite's size, sprite facing right.
 * - `animations` / `reactions`: the head point per animation (or reaction),
 *   one per frame (see parseEntry), since the head moves while it plays.
 * - `slots`: `face` and `neck` offsets from the head point (`dx`, `dy`).
 * - `stageFit`: for a stage drawn smaller than the adult (`{ "baby": { "scale": 0.75 } }`),
 *   points are scaled around the bottom center of the frame.
 * @returns {{anchors: {head: {x:number, y:number}, slots: Record<string, {dx:number, dy:number}>, animations: Record<string, any>, reactions: Record<string, any>, stageFit: Record<string, {scale:number}>}, ignored: string[]}}
 */
export function anchorsOverrides(raw) {
  const anchors = {
    head: { ...DEFAULT_HEAD_ANCHOR },
    slots: { face: { ...DEFAULT_SLOTS.face }, neck: { ...DEFAULT_SLOTS.neck } },
    animations: {},
    reactions: {},
    stageFit: {},
  };
  const ignored = [];
  const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (key === 'head' && isFraction(value?.x) && isFraction(value?.y)) {
      anchors.head = { x: value.x, y: value.y };
    } else if (key === 'slots' && isObject(value)) {
      for (const [slot, d] of Object.entries(value)) {
        if (slot in DEFAULT_SLOTS && Number.isFinite(d?.dx) && Number.isFinite(d?.dy) && Math.abs(d.dx) <= 1 && Math.abs(d.dy) <= 1) {
          anchors.slots[slot] = { dx: d.dx, dy: d.dy };
        } else ignored.push(`slots.${slot}`);
      }
    } else if ((key === 'animations' || key === 'reactions') && isObject(value)) {
      anchors[key] = parseTable(value, key, ignored);
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
 * Where an accessory sits on the critter for the frame being displayed.
 * @param {ReturnType<typeof anchorsOverrides>['anchors']} anchors
 * @param {{animation?: string, reaction?: string, frame?: number, stage?: string, slot?: string}} pose
 *   the animation or reaction ACTUALLY playing (not the critter's state), its frame index, the life stage
 * @returns {{x:number, y:number, rotation:number}|null} fractions of the sprite (facing right), null when hidden
 */
export function anchorFor(anchors, { animation, reaction, frame = 0, stage = 'adult', slot = 'top' } = {}) {
  const entry = reaction ? anchors.reactions[reaction] : anchors.animations[animation];
  let point = anchors.head;
  let rotation = 0;
  if (entry) {
    ({ rotation } = entry);
    const pts = entry.points;
    point = pts[Math.min(Math.max(frame, 0), pts.length - 1)];
    if (!point) return null;
  }
  const scale = anchors.stageFit[stage]?.scale ?? 1;
  let { x, y } = point;
  const offset = anchors.slots[slot];
  if (offset) {
    x += offset.dx;
    y += offset.dy * (rotation === 180 ? -1 : 1);
  }
  if (scale !== 1) {
    x = 0.5 + (x - 0.5) * scale;
    y = 1 + (y - 1) * scale;
  }
  return { x, y, rotation };
}
