// Items placed on the desktop: food, bowl, bed. Pure module, no GNOME: the
// Manager owns them and advances them every tick, critters read (and
// consume) them via `options.items`.

import { PREY, PREY_TTL, movePreyOnSurface, movePreyFloating } from './prey.js';
import {
  findSurfaceBelow, findSegmentById, isOnSegment, isInsideAnyMonitor, respawnPoint, groundPoint,
} from './surfaceMap.js';

/** Known foods: lifetime in seconds, number of bites (a started-but-not-
 * finished leftover can wait on the desktop), and `floats` for gravity-free
 * food (plankton and flakes for the fish). */
export const FOODS = Object.freeze({
  meat: { ttl: 900, bites: 2 },
  fish: { ttl: 900, bites: 2 },
  pate: { ttl: 900, bites: 2 },
  kibble: { ttl: 900, bites: 3 },
  seeds: { ttl: 900, bites: 3 },
  mealworms: { ttl: 900, bites: 3 },
  apple: { ttl: 900, bites: 3 },
  plankton: { ttl: 600, bites: 2, floats: true },
  flakes: { ttl: 600, bites: 2, floats: true },
});

/** Food that can go in a bowl (not floating food). */
export function isBowlFood(kind) {
  return Boolean(FOODS[kind]) && !FOODS[kind].floats;
}

/** Decorative plants to graze on: they regrow, they never disappear (algae floats). */
export const PLANTS = Object.freeze({ grass: {}, berries: {}, leaf: {}, algae: { floats: true } });
export const PLANT_MAX_PORTIONS = 3;
const PLANT_REGROW_SECONDS = 300;

/** Bowl food: moldy after 24 h, disappears 6 h later. */
export const BOWL_MOLD_SECONDS = 24 * 3600;
export const BOWL_VANISH_SECONDS = 6 * 3600;

/**
 * Toys. `rolls`: rolls and can be kicked (bounce, friction in 1/s, kick
 * speed); `floats`: floats with no gravity, pushed by the fish; the plush
 * stays put. `variants`: colours or models, drawn at random when placed.
 */
export const TOYS = Object.freeze({
  ball: { rolls: true, bounce: 0.45, friction: 2.5, kick: 260, variants: ['red', 'blue', 'yellow', 'green'] },
  yarn: { rolls: true, bounce: 0.15, friction: 5, kick: 200, variants: ['pink', 'blue', 'yellow'] },
  plush: { variants: ['bear', 'rabbit', 'frog'] },
  ring: { floats: true, variants: ['orange'] },
});

/** Bed and bowl models, chosen when placed (the first one by default). */
export const BED_MODELS = Object.freeze(['cushion', 'basket', 'cradle']);
export const BOWL_MODELS = Object.freeze(['ceramic', 'steel', 'wood']);

/** Possible models of an item (bed, bowl, toy variants); empty for others. */
export function modelsOf(type, kind) {
  if (type === 'bed') return BED_MODELS;
  if (type === 'bowl') return BOWL_MODELS;
  if (type === 'toy') return TOYS[kind]?.variants ?? [];
  return [];
}

function validModel(type, kind, model) {
  const models = modelsOf(type, kind);
  if (models.length === 0) return null;
  return models.includes(model) ? model : models[0];
}

/** A toy's variant drawn at random (ball colour, plush model). */
export function pickVariant(kind, random = Math.random) {
  const variants = TOYS[kind]?.variants ?? [];
  return variants[Math.min(variants.length - 1, Math.floor(random() * variants.length))] ?? null;
}

/** A toy fit for a species: floating for a groundless species, resting otherwise. */
export function toyFits(kind, groundless) {
  return Boolean(TOYS[kind]) && Boolean(TOYS[kind].floats) === groundless;
}

/** Gifts brought back by an animal: coins earned when the player picks them up. */
export const GIFTS = Object.freeze({ coin: { coins: 5 }, flower: { coins: 3 }, feather: { coins: 8 } });

/** A gift drawn at random (the feather is rare). */
export function pickGift(random) {
  const r = random();
  return r < 0.6 ? 'coin' : r < 0.9 ? 'flower' : 'feather';
}

const GIFT_TTL = 1800;

/** Litter box: dirty after this many uses, clean again once cleaned. */
export const LITTER_CAPACITY = 3;
/** A mess left longer than this is "old": it makes the animal sick. */
export const MESS_OLD_SECONDS = 2 * 3600;

export const ITEM_TYPES = Object.freeze(['food', 'bowl', 'bed', 'toy', 'gift', 'plant', 'prey', 'litter', 'mess']);

export const BOWL_CAPACITY = 5;

/** Room an object needs above its resting ledge: on a ledge with less, it falls through. */
export const ITEM_HEADROOM = 32;
const GRAVITY = 900;
const TERMINAL_VELOCITY = 800;
const RESTING_TYPES = new Set(['ground', 'shelf']);
const BOUNCE_MIN_SPEED = 140; // below this, a rolling toy settles instead of bouncing
const DRIFT_FRICTION = 1.2; // 1/s: a pushed ring loses this share of its speed per second
const PUSH_SPEED = 150;
const FLOAT_TOP_MARGIN = 16; // a floating item keeps the top of its sprite on screen

let nextId = 1;

/**
 * @param {'food'|'bowl'|'bed'|'toy'|'gift'|'plant'|'prey'|'litter'|'mess'} type
 * @param {string|null} kind food kind (food; bowl, null for an empty bowl), toy kind (toy), null for a bed
 * @param {string|null} [model] bed or bowl model, toy variant (the first one by default)
 */
export function createItem(type, kind, x, y, model = null) {
  const food = type === 'food' ? FOODS[kind] : null;
  const gift = type === 'gift';
  const plant = type === 'plant' ? PLANTS[kind] : null;
  const prey = type === 'prey' ? PREY[kind] : null;
  const toy = type === 'toy' ? TOYS[kind] : null;
  return {
    id: nextId++,
    type,
    kind: type === 'bed' || (type === 'bowl' && !isBowlFood(kind)) ? null : kind,
    model: validModel(type, kind, model),
    x,
    y,
    vx: 0, // horizontal speed (rolling ball, thrown item)
    vy: 0,
    surface: null, // segment the item rests on, once settled
    floating: Boolean(food?.floats || plant?.floats || prey?.floats || toy?.floats),
    portions: plant ? PLANT_MAX_PORTIONS : food ? food.bites : 0, // bites (food), portions (bowl, plant)
    uses: 0, // litter: number of uses since it was last cleaned
    age: 0, // mess: seconds since it was left
    cleaned: false, // the player clicked a litter box: reset next tick
    fillAge: 0, // bowl: seconds since it was last filled (mold)
    regrow: 0, // plant: seconds toward the next regrowth
    dir: 1, // prey: walking direction
    caught: false, // prey caught by an animal: frozen in place
    ttl: food ? food.ttl : gift ? GIFT_TTL : prey ? PREY_TTL : Infinity,
    collected: false, // gift picked up by the player (the Manager credits the coins)
    consumed: false, // eaten or expired: to be removed
    removed: false, // removed by the player: to be removed
    grabbed: false, // held by the mouse: no physics
    claimedBy: null, // critter targeting this food
  };
}

export function fillBowl(bowl, kind, portions = BOWL_CAPACITY) {
  if (bowl.type !== 'bowl' || !isBowlFood(kind)) return;
  if (bowl.kind !== kind) bowl.portions = 0; // two foods never mix
  bowl.kind = kind;
  bowl.fillAge = 0; // fresh food
  bowl.portions = Math.min(BOWL_CAPACITY, bowl.portions + portions);
}

/** Visible level of a bowl: 0 empty, 1 (1-2 portions), 2 (3-4), 3 full. */
export function bowlLevel(portions) {
  if (!(portions > 0)) return 0;
  return portions >= BOWL_CAPACITY ? 3 : portions >= 3 ? 2 : 1;
}

/** True when the Manager should remove the item. */
export function isGone(item) {
  return item.removed || ((item.type === 'food' || item.type === 'gift' || item.type === 'prey') && item.consumed);
}

/** Dirty litter box: nobody uses it anymore. */
export function isDirty(item) {
  return item.type === 'litter' && item.uses >= LITTER_CAPACITY;
}

/** A mess left for more than two hours. */
export function isOldMess(item) {
  return item.type === 'mess' && item.age >= MESS_OLD_SECONDS;
}

/**
 * Clean litter boxes an animal can reach, closest first: on the same
 * surface, or any of them for a flying species.
 */
export function litterFor(items, { x, surfaceId, canFly }) {
  return items
    .filter((i) => i.type === 'litter' && !i.removed && !i.grabbed && i.surface && !isDirty(i))
    .filter((i) => canFly || i.surface.surfaceId === surfaceId)
    .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
}

/** Moldy bowl food (makes the animal sick). */
export function isMoldy(item) {
  return item.type === 'bowl' && item.portions > 0 && item.fillAge >= BOWL_MOLD_SECONDS;
}

/**
 * Advances an item by one step: falling, landing, resyncing to its
 * surface (a moved or closed window: it falls again) and expiry.
 * @param {ReturnType<typeof createItem>} item
 * @param {number} dt
 * @param {{segments: object[]}} surfaces

 * @param {{y:number, height:number}} [worldBounds]
 * @param {{threats?: object[], random?: () => number}} [ctx] threats (animals, cursor) and randomness for prey
 */
export function tickItem(item, dt, surfaces, worldBounds, ctx = {}) {
  if ((item.type === 'food' || item.type === 'gift' || item.type === 'prey') && Number.isFinite(item.ttl)) {
    item.ttl -= dt;
    if (item.ttl <= 0) item.consumed = true;
  }
  if (item.type === 'plant' && item.portions < PLANT_MAX_PORTIONS) {
    item.regrow += dt;
    if (item.regrow >= PLANT_REGROW_SECONDS) {
      item.regrow = 0;
      item.portions += 1;
    }
  }
  if (item.type === 'bowl' && item.portions > 0) {
    item.fillAge += dt;
    if (item.fillAge >= BOWL_MOLD_SECONDS + BOWL_VANISH_SECONDS) {
      item.portions = 0; // the moldy food disappears
      item.fillAge = 0;
    }
  }
  if (item.type === 'mess') item.age += dt;
  if (item.type === 'litter' && item.cleaned) {
    item.cleaned = false;
    item.uses = 0;
  }
  if (item.grabbed || item.caught) return;
  if (item.floating) {
    if (item.type === 'prey' && worldBounds && worldBounds.width !== undefined) movePreyFloating(item, dt, worldBounds, ctx);
    else if (item.type === 'toy') driftFloating(item, dt, worldBounds);
    return;
  }

  const toy = item.type === 'toy' ? TOYS[item.kind] : null;
  const rolls = Boolean(toy?.rolls);
  const segments = surfaces.segments ?? [];

  if (item.surface) {
    if (rolls && item.vx !== 0) {
      item.x += item.vx * dt;
      bounceOffWorldEdges(item, worldBounds);
      item.vx *= Math.max(0, 1 - toy.friction * dt);
      if (Math.abs(item.vx) < 4) item.vx = 0;
    }
    const fresh = findSegmentById(segments, item.surface.surfaceId, item.surface.type, item.x);
    if (fresh && isOnSegment(fresh, item.x, item.y, 4)) {
      item.surface = fresh;
      item.y = fresh.y;
      if (item.type === 'prey') movePreyOnSurface(item, dt, fresh, ctx);
      return;
    }
    item.surface = null; // window gone, or off the edge: it falls (keeping its momentum)
    item.vy = 0;
  }

  if (item.vx !== 0) {
    item.x += item.vx * dt;
    bounceOffWorldEdges(item, worldBounds);
  }

  item.vy = Math.min(item.vy + GRAVITY * dt, TERMINAL_VELOCITY);
  const nextY = item.y + item.vy * dt;
  const landing = findSurfaceBelow(segments, item.x, nextY, item.vy * dt + 1, RESTING_TYPES);
  if (landing) {
    item.y = landing.y;
    if (rolls && item.vy > BOUNCE_MIN_SPEED) {
      item.vy = -item.vy * toy.bounce; // bounce: stays airborne
      return;
    }
    item.vy = 0;
    item.surface = landing;
    if (!rolls) item.vx = 0;
    return;
  }
  item.y = nextY;
  if (worldBounds && item.y > worldBounds.y + worldBounds.height + 200) {
    item.y = worldBounds.y + worldBounds.height; // safety net: never off screen
    item.vy = 0;
    item.vx = 0;
  }
}

function bounceOffWorldEdges(item, worldBounds) {
  if (!worldBounds || worldBounds.width === undefined) return;
  const min = worldBounds.x;
  const max = worldBounds.x + worldBounds.width;
  if (item.x < min) {
    item.x = min;
    item.vx = Math.abs(item.vx) * 0.6;
  } else if (item.x > max) {
    item.x = max;
    item.vx = -Math.abs(item.vx) * 0.6;
  }
}

/** A thrown or pushed floating item: coasts on its momentum, slows down, bounces off the screen edges. */
function driftFloating(item, dt, worldBounds) {
  if (item.vx === 0 && item.vy === 0) return;
  item.x += item.vx * dt;
  item.y += item.vy * dt;
  bounceOffWorldEdges(item, worldBounds);
  if (worldBounds && worldBounds.height !== undefined) {
    const top = worldBounds.y + FLOAT_TOP_MARGIN;
    const bottom = worldBounds.y + worldBounds.height;
    if (item.y < top) {
      item.y = top;
      item.vy = Math.abs(item.vy) * 0.6;
    } else if (item.y > bottom) {
      item.y = bottom;
      item.vy = -Math.abs(item.vy) * 0.6;
    }
  }
  const damping = Math.max(0, 1 - DRIFT_FRICTION * dt);
  item.vx *= damping;
  item.vy *= damping;
  if (Math.hypot(item.vx, item.vy) < 4) {
    item.vx = 0;
    item.vy = 0;
  }
}

/**
 * Kicks a rolling toy (by an animal): it takes off and flies in the given direction.
 * @returns {boolean} false for an item that can't be kicked (plush, ring...)
 */
export function kick(item, dirX) {
  const toy = item.type === 'toy' ? TOYS[item.kind] : null;
  if (!toy?.rolls) return false;
  item.vx = (dirX >= 0 ? 1 : -1) * toy.kick;
  item.vy = -toy.kick;
  item.surface = null;
  return true;
}

/** Pushes a floating toy (by the fish): it flies off in the direction (dx, dy). */
export function push(item, dx, dy) {
  if (item.type !== 'toy' || !TOYS[item.kind]?.floats) return false;
  const length = Math.hypot(dx, dy);
  if (length === 0) return false;
  item.vx = (dx / length) * PUSH_SPEED;
  item.vy = (dy / length) * PUSH_SPEED;
  return true;
}

/** An item no longer inside any monitor (resolution change, a monitor unplugged) respawns at the top of the closest one. */
export function rescueItem(item, monitors) {
  if (item.grabbed || monitors.length === 0 || isInsideAnyMonitor(monitors, item.x, item.y - 1)) return false;
  const point = respawnPoint(monitors, item.x, item.y, 16);
  if (!point) return false;
  item.x = point.x;
  item.y = point.y;
  item.vx = 0;
  item.vy = 0;
  item.surface = null;
  return true;
}

/**
 * After a suspend: puts back on the ground (bottom of the closest monitor) any item resting or
 * falling, so it doesn't stay stuck on the top bar or on a window. Grabbed or floating items
 * don't move.
 */
export function regroundItem(item, monitors) {
  if (item.grabbed || item.caught || item.floating) return false;
  const point = groundPoint(monitors, item.x, item.y);
  if (!point) return false;
  item.x = point.x;
  item.y = point.y;
  item.vx = 0;
  item.vy = 0;
  item.surface = null;
  return true;
}

/** Throws an item (released by the mouse with momentum). */
export function throwItem(item, vx, vy) {
  item.vx = vx;
  item.vy = vy;
  item.surface = null;
}

/** True for a toy (the basis of "Tidy up toys"). */
export function isToy(item) {
  return item.type === 'toy';
}

/**
 * Toys an animal can reach, closest first. A walking species: toys on its
 * surface, or any of them if it flies; a groundless species (`floating`):
 * floating toys, anywhere.
 */
export function toysFor(items, { x, y = 0, surfaceId, canFly, floating = false }) {
  if (floating) {
    return items
      .filter((i) => i.type === 'toy' && i.floating && !i.removed && !i.grabbed)
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  }
  return items
    .filter((i) => i.type === 'toy' && !i.removed && !i.grabbed && i.surface)
    .filter((i) => canFly || i.surface.surfaceId === surfaceId)
    .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
}

/**
 * Items a species can go eat, closest first.
 * @param {ReturnType<typeof createItem>[]} items
 * @param {Record<string, number>} diet food -> satiety gain
 * @param {{x:number, surfaceId:*, canFly:boolean, floating:boolean, self?:object}} who
 *   floating: a groundless species (only eats floating food);
 *   self: the requesting critter (its own claims stay valid).
 * @returns {{item: object, gain: number}[]}
 */
export function edibleFor(items, diet, { x, surfaceId, canFly, floating, self, avoidMold = false }) {
  const found = [];
  for (const item of items) {
    if (item.type === 'bed' || item.type === 'prey' || item.consumed || item.removed || item.grabbed) continue;
    const gain = diet[item.kind];
    if (!(gain > 0)) continue;
    if ((item.type === 'bowl' || item.type === 'plant') && item.portions <= 0) continue;
    if (avoidMold && isMoldy(item)) continue;
    if (item.claimedBy && item.claimedBy !== self) continue;
    if (item.floating !== floating) continue;
    if (!floating) {
      if (!item.surface) continue; // still falling
      if (!canFly && item.surface.surfaceId !== surfaceId) continue;
    }
    found.push({ item, gain });
  }
  return found.sort((a, b) => Math.abs(a.item.x - x) - Math.abs(b.item.x - x));
}

/**
 * A bite (food), a portion (bowl, plant) or the whole item.
 * @returns {{sick: boolean, fraction: number, finished: boolean}} sick: the
 *   food was moldy; fraction: share of the satiety gain delivered;
 *   finished: false while the food still has bites left
 */
export function consume(item) {
  const sick = isMoldy(item);
  let fraction = 1;
  let finished = true;
  if (item.type === 'food') {
    fraction = 1 / (FOODS[item.kind]?.bites ?? 1);
    item.portions = Math.max(0, item.portions - 1);
    finished = item.portions === 0;
    if (finished) item.consumed = true;
  } else if (item.type === 'bowl' || item.type === 'plant') {
    item.portions = Math.max(0, item.portions - 1);
  } else {
    item.consumed = true;
  }
  item.claimedBy = null;
  return { sick, fraction, finished };
}

/** Beds placed on `surfaceId`, closest first. */
export function bedsOn(items, surfaceId, x) {
  return items
    .filter((i) => i.type === 'bed' && !i.removed && i.surface && i.surface.surfaceId === surfaceId)
    .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
}

const SAVE_VERSION = 1;

/** JSON of the items to persist: durable ones and food that's still fresh. */
export function serializeItems(items) {
  return JSON.stringify({
    version: SAVE_VERSION,
    items: items
      .filter((i) => !isGone(i) && !i.grabbed && i.type !== 'prey') // prey is transient
      .map((i) => ({
        type: i.type,
        kind: i.kind,
        model: i.model ?? null,
        x: Math.round(i.x),
        y: Math.round(i.y),
        portions: i.portions,
        fillAge: Math.round(i.fillAge ?? 0),
        uses: i.uses ?? 0,
        age: Math.round(i.age ?? 0),
        ttl: Number.isFinite(i.ttl) ? Math.round(i.ttl) : null,
      })),
  });
}

/**
 * Reads back saved items, never throwing.
 * @returns {ReturnType<typeof createItem>[]} fresh items that will fall into place
 */
export function parseSavedItems(text, { bounds }) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!data || data.version !== SAVE_VERSION || !Array.isArray(data.items)) return [];

  const result = [];
  for (const raw of data.items) {
    if (!raw || !ITEM_TYPES.includes(raw.type) || raw.type === 'prey' || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) continue;
    const validKind =
      raw.type === 'gift' ? GIFTS[raw.kind]
      : raw.type === 'toy' ? TOYS[raw.kind]
      : raw.type === 'plant' ? PLANTS[raw.kind]
      : raw.type === 'bed' || raw.type === 'litter' || raw.type === 'mess' ? true
      : raw.type === 'bowl' ? raw.kind == null || FOODS[raw.kind] // bowl placed empty: no food
      : FOODS[raw.kind];
    if (!validKind) continue;
    // Missing or unknown model (older save): default model.
    const item = createItem(raw.type, raw.kind ?? null, 0, 0, raw.model);
    item.x = Math.min(Math.max(raw.x, bounds.x), bounds.x + bounds.width);
    item.y = Math.min(Math.max(raw.y, bounds.y), bounds.y + bounds.height);
    if (item.type === 'bowl') {
      // An older bowl of plankton (floating food) comes back empty.
      item.portions = item.kind && Number.isFinite(raw.portions) ? Math.min(Math.max(raw.portions, 0), BOWL_CAPACITY) : 0;
      item.fillAge = Number.isFinite(raw.fillAge) && raw.fillAge >= 0 ? raw.fillAge : 0;
    }
    if (item.type === 'food') {
      // Bites remaining; an older save (0) comes back whole.
      const bites = FOODS[item.kind].bites;
      item.portions = Number.isFinite(raw.portions) && raw.portions >= 1 ? Math.min(Math.round(raw.portions), bites) : bites;
    }
    if (item.type === 'litter') item.uses = Number.isFinite(raw.uses) && raw.uses >= 0 ? Math.min(raw.uses, LITTER_CAPACITY) : 0;
    if (item.type === 'mess') item.age = Number.isFinite(raw.age) && raw.age >= 0 ? raw.age : 0;
    if (item.type === 'plant') {
      item.portions = Number.isFinite(raw.portions) ? Math.min(Math.max(raw.portions, 0), PLANT_MAX_PORTIONS) : PLANT_MAX_PORTIONS;
    }
    if (item.type === 'food' || item.type === 'gift') {
      if (Number.isFinite(raw.ttl) && raw.ttl <= 0) continue;
      if (Number.isFinite(raw.ttl)) item.ttl = Math.min(raw.ttl, item.ttl);
    }
    result.push(item);
  }
  return result;
}
