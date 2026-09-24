// Objets posés sur le bureau : nourriture, gamelle, lit. Module pur, sans
// GNOME : le Manager les possède et les avance à chaque tick, les critters
// les lisent (et les consomment) via `options.items`.

import { findSurfaceBelow, findSegmentById, isOnSegment } from './surfaceMap.js';

/** Aliments connus : durée de vie en secondes, et `floats` pour la
 * nourriture sans gravité (le plancton du poisson). */
export const FOODS = Object.freeze({
  meat: { ttl: 900 },
  fish: { ttl: 900 },
  kibble: { ttl: 900 },
  seeds: { ttl: 900 },
  plankton: { ttl: 600, floats: true },
});

export const ITEM_TYPES = Object.freeze(['food', 'bowl', 'bed']);

export const BOWL_CAPACITY = 5;

const GRAVITY = 900;
const TERMINAL_VELOCITY = 800;
const RESTING_TYPES = new Set(['ground', 'shelf']);

let nextId = 1;

/**
 * @param {'food'|'bowl'|'bed'} type
 * @param {string|null} kind aliment (food/bowl), null pour un lit
 */
export function createItem(type, kind, x, y) {
  const food = type === 'food' ? FOODS[kind] : null;
  return {
    id: nextId++,
    type,
    kind: type === 'bed' ? null : kind,
    x,
    y,
    vy: 0,
    surface: null, // segment sur lequel l'objet repose, une fois posé
    floating: Boolean(food?.floats),
    portions: 0, // gamelle uniquement
    ttl: food ? food.ttl : Infinity,
    consumed: false, // mangée ou expirée : à retirer
    removed: false, // retirée par le joueur : à retirer
    grabbed: false, // tenue à la souris : pas de physique
    claimedBy: null, // critter qui vise cette nourriture
  };
}

export function fillBowl(bowl, kind, portions = BOWL_CAPACITY) {
  if (bowl.type !== 'bowl' || !FOODS[kind]) return;
  if (bowl.kind !== kind) bowl.portions = 0; // on ne mélange pas deux aliments
  bowl.kind = kind;
  bowl.portions = Math.min(BOWL_CAPACITY, bowl.portions + portions);
}

/** Vrai quand le Manager doit retirer l'objet. */
export function isGone(item) {
  return item.removed || (item.type === 'food' && item.consumed);
}

/**
 * Avance un objet d'un pas : chute, atterrissage, resynchronisation sur sa
 * surface (fenêtre déplacée ou fermée : il retombe) et péremption.
 * @param {ReturnType<typeof createItem>} item
 * @param {number} dt
 * @param {{segments: object[]}} surfaces
 * @param {{y:number, height:number}} [worldBounds]
 */
export function tickItem(item, dt, surfaces, worldBounds) {
  if (item.type === 'food' && Number.isFinite(item.ttl)) {
    item.ttl -= dt;
    if (item.ttl <= 0) item.consumed = true;
  }
  if (item.grabbed || item.floating) return;

  const segments = surfaces.segments ?? [];
  if (item.surface) {
    const fresh = findSegmentById(segments, item.surface.surfaceId, item.surface.type);
    if (fresh && isOnSegment(fresh, item.x, item.y, 4)) {
      item.surface = fresh;
      item.y = fresh.y;
      return;
    }
    item.surface = null;
    item.vy = 0;
  }

  item.vy = Math.min(item.vy + GRAVITY * dt, TERMINAL_VELOCITY);
  const nextY = item.y + item.vy * dt;
  const landing = findSurfaceBelow(segments, item.x, nextY, item.vy * dt + 1, RESTING_TYPES);
  if (landing) {
    item.y = landing.y;
    item.vy = 0;
    item.surface = landing;
    return;
  }
  item.y = nextY;
  if (worldBounds && item.y > worldBounds.y + worldBounds.height + 200) {
    item.y = worldBounds.y + worldBounds.height; // filet de sécurité : jamais hors de l'écran
    item.vy = 0;
  }
}

/**
 * Objets qu'une espèce peut aller manger, du plus proche au plus loin.
 * @param {ReturnType<typeof createItem>[]} items
 * @param {Record<string, number>} diet aliment -> gain de satiété
 * @param {{x:number, surfaceId:*, canFly:boolean, floating:boolean, self?:object}} who
 *   floating : espèce sans sol (ne mange que la nourriture flottante) ;
 *   self : le critter demandeur (ses propres réclamations restent valables).
 * @returns {{item: object, gain: number}[]}
 */
export function edibleFor(items, diet, { x, surfaceId, canFly, floating, self }) {
  const found = [];
  for (const item of items) {
    if (item.type === 'bed' || item.consumed || item.removed || item.grabbed) continue;
    const gain = diet[item.kind];
    if (!(gain > 0)) continue;
    if (item.type === 'bowl' && item.portions <= 0) continue;
    if (item.claimedBy && item.claimedBy !== self) continue;
    if (item.floating !== floating) continue;
    if (!floating) {
      if (!item.surface) continue; // encore en chute
      if (!canFly && item.surface.surfaceId !== surfaceId) continue;
    }
    found.push({ item, gain });
  }
  return found.sort((a, b) => Math.abs(a.item.x - x) - Math.abs(b.item.x - x));
}

/** Une portion en moins (gamelle) ou l'objet mangé. */
export function consume(item) {
  if (item.type === 'bowl') item.portions = Math.max(0, item.portions - 1);
  else item.consumed = true;
  item.claimedBy = null;
}

/** Lits posés sur `surfaceId`, du plus proche au plus loin. */
export function bedsOn(items, surfaceId, x) {
  return items
    .filter((i) => i.type === 'bed' && !i.removed && i.surface && i.surface.surfaceId === surfaceId)
    .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
}

const SAVE_VERSION = 1;

/** JSON des objets à conserver : durables et nourriture encore fraîche. */
export function serializeItems(items) {
  return JSON.stringify({
    version: SAVE_VERSION,
    items: items
      .filter((i) => !isGone(i) && !i.grabbed)
      .map((i) => ({
        type: i.type,
        kind: i.kind,
        x: Math.round(i.x),
        y: Math.round(i.y),
        portions: i.portions,
        ttl: Number.isFinite(i.ttl) ? Math.round(i.ttl) : null,
      })),
  });
}

/**
 * Relit des objets sauvegardés, sans jamais lever d'exception.
 * @returns {ReturnType<typeof createItem>[]} objets neufs qui retomberont
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
    if (!raw || !ITEM_TYPES.includes(raw.type) || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) continue;
    if (raw.type !== 'bed' && !FOODS[raw.kind]) continue;
    const item = createItem(raw.type, raw.kind, 0, 0);
    item.x = Math.min(Math.max(raw.x, bounds.x), bounds.x + bounds.width);
    item.y = Math.min(Math.max(raw.y, bounds.y), bounds.y + bounds.height);
    if (item.type === 'bowl') item.portions = Number.isFinite(raw.portions) ? Math.min(Math.max(raw.portions, 0), BOWL_CAPACITY) : 0;
    if (item.type === 'food') {
      if (Number.isFinite(raw.ttl) && raw.ttl <= 0) continue;
      if (Number.isFinite(raw.ttl)) item.ttl = Math.min(raw.ttl, item.ttl);
    }
    result.push(item);
  }
  return result;
}
