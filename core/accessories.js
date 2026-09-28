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
 * fraction of its size (hats rest on the anchor; the bow, medal and
 * glasses sit lower, the halo floats above, the cone of shame wraps
 * around the head); `scale`: relative size (1 = half the sprite's width).
 */
export const ACCESSORY_LAYOUT = Object.freeze({
  glasses: { offset: 0.45 },
  bow: { offset: 0.3 },
  medal: { offset: 0.3 },
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
 * @returns {{x:number, y:number, size:number}}
 */
export function accessoryPlacement(id, box, head, facing) {
  const layout = ACCESSORY_LAYOUT[id] ?? {};
  const size = Math.max(6, Math.round((box.width / 2) * (layout.scale ?? 1)));
  const ax = box.x + (facing >= 0 ? head.x : 1 - head.x) * box.width;
  const ay = box.y + head.y * box.height + (layout.offset ?? 0) * size;
  return { x: Math.round(ax - size / 2), y: Math.round(ay - size), size };
}

const DEFAULT_HEAD_ANCHOR = { x: 0.72, y: 0.2 };

/**
 * Validates the `anchors` section of a pack: the head point (fractions of
 * the sprite's size, sprite facing right), where a hat sits.
 * @returns {{anchors: {head: {x:number, y:number}}, ignored: string[]}}
 */
export function anchorsOverrides(raw) {
  const anchors = { head: { ...DEFAULT_HEAD_ANCHOR } };
  const ignored = [];
  for (const [key, value] of Object.entries(raw ?? {})) {
    const ok =
      key === 'head' &&
      value &&
      Number.isFinite(value.x) && value.x >= 0 && value.x <= 1 &&
      Number.isFinite(value.y) && value.y >= 0 && value.y <= 1;
    if (ok) anchors.head = { x: value.x, y: value.y };
    else ignored.push(key);
  }
  return { anchors, ignored };
}
