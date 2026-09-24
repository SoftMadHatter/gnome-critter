// Objets posés sur le bureau : nourriture, gamelle, lit. Module pur, sans
// GNOME : le Manager les possède et les avance à chaque tick, les critters
// les lisent (et les consomment) via `options.items`.

import { PREY, PREY_TTL, movePreyOnSurface, movePreyFloating } from './prey.js';
import {
  findSurfaceBelow, findSegmentById, isOnSegment, isInsideAnyMonitor, respawnPoint,
} from './surfaceMap.js';

/** Aliments connus : durée de vie en secondes, et `floats` pour la
 * nourriture sans gravité (le plancton du poisson). */
export const FOODS = Object.freeze({
  meat: { ttl: 900 },
  fish: { ttl: 900 },
  kibble: { ttl: 900 },
  seeds: { ttl: 900 },
  plankton: { ttl: 600, floats: true },
});

/** Plantes décoratives à grignoter : elles repoussent, ne disparaissent jamais (l'algue flotte). */
export const PLANTS = Object.freeze({ grass: {}, berries: {}, leaf: {}, algae: { floats: true } });
export const PLANT_MAX_PORTIONS = 3;
const PLANT_REGROW_SECONDS = 300;

/** Nourriture de gamelle : moisie après 24 h, disparaît 6 h plus tard. */
export const BOWL_MOLD_SECONDS = 24 * 3600;
export const BOWL_VANISH_SECONDS = 6 * 3600;

/** Jouets : la balle roule et rebondit, la peluche reste posée. */
export const TOYS = Object.freeze({ ball: {}, plush: {} });

/** Cadeaux ramenés par un animal : pièces gagnées quand le joueur les ramasse. */
export const GIFTS = Object.freeze({ coin: { coins: 5 }, flower: { coins: 3 }, feather: { coins: 8 } });

/** Cadeau tiré au hasard (la plume est rare). */
export function pickGift(random) {
  const r = random();
  return r < 0.6 ? 'coin' : r < 0.9 ? 'flower' : 'feather';
}

const GIFT_TTL = 1800;

/** Litière : sale après ce nombre d'usages, propre de nouveau au nettoyage. */
export const LITTER_CAPACITY = 3;
/** Une trace laissée plus longtemps que cela est « vieille » : elle rend malade. */
export const MESS_OLD_SECONDS = 2 * 3600;

export const ITEM_TYPES = Object.freeze(['food', 'bowl', 'bed', 'toy', 'gift', 'plant', 'prey', 'litter', 'mess']);

export const BOWL_CAPACITY = 5;

const GRAVITY = 900;
const TERMINAL_VELOCITY = 800;
const RESTING_TYPES = new Set(['ground', 'shelf']);
const ROLL_FRICTION = 2.5; // 1/s : la balle perd cette part de sa vitesse par seconde
const BOUNCE_RESTITUTION = 0.45;
const BOUNCE_MIN_SPEED = 140; // en dessous, la balle se pose au lieu de rebondir
const KICK_SPEED = 260;

let nextId = 1;

/**
* @param {'food'|'bowl'|'bed'|'toy'} type
 * @param {string|null} kind aliment (food/bowl), jouet (toy), null pour un lit
 */
export function createItem(type, kind, x, y) {
  const food = type === 'food' ? FOODS[kind] : null;
  const gift = type === 'gift';
  const plant = type === 'plant' ? PLANTS[kind] : null;
  const prey = type === 'prey' ? PREY[kind] : null;
  return {
    id: nextId++,
    type,
    kind: type === 'bed' ? null : kind,
    x,
    y,
    vx: 0, // vitesse horizontale (balle qui roule, objet lancé)
    vy: 0,
    surface: null, // segment sur lequel l'objet repose, une fois posé
    floating: Boolean(food?.floats || plant?.floats || prey?.floats),
    portions: plant ? PLANT_MAX_PORTIONS : 0, // gamelle et plante
    uses: 0, // litière : nombre d'usages depuis le dernier nettoyage
    age: 0, // trace : secondes depuis qu'elle a été laissée
    cleaned: false, // clic du joueur sur une litière : remise à zéro au prochain tick
    fillAge: 0, // gamelle : secondes depuis le dernier remplissage (moisissure)
    regrow: 0, // plante : secondes vers la prochaine repousse
    dir: 1, // proie : sens de marche
    caught: false, // proie attrapée par un animal : figée
    ttl: food ? food.ttl : gift ? GIFT_TTL : prey ? PREY_TTL : Infinity,
    collected: false, // cadeau ramassé par le joueur (le Manager crédite les pièces)
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
  bowl.fillAge = 0; // nourriture fraîche
  bowl.portions = Math.min(BOWL_CAPACITY, bowl.portions + portions);
}

/** Vrai quand le Manager doit retirer l'objet. */
export function isGone(item) {
  return item.removed || ((item.type === 'food' || item.type === 'gift' || item.type === 'prey') && item.consumed);
}

/** Litière sale : plus personne ne l'utilise. */
export function isDirty(item) {
  return item.type === 'litter' && item.uses >= LITTER_CAPACITY;
}

/** Trace laissée depuis plus de deux heures. */
export function isOldMess(item) {
  return item.type === 'mess' && item.age >= MESS_OLD_SECONDS;
}

/**
 * Litières propres qu'un animal peut rejoindre, la plus proche d'abord :
 * sur la même surface, ou n'importe laquelle pour une espèce qui vole.
 */
export function litterFor(items, { x, surfaceId, canFly }) {
  return items
    .filter((i) => i.type === 'litter' && !i.removed && !i.grabbed && i.surface && !isDirty(i))
    .filter((i) => canFly || i.surface.surfaceId === surfaceId)
    .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
}

/** Nourriture de gamelle moisie (rend malade). */
export function isMoldy(item) {
  return item.type === 'bowl' && item.portions > 0 && item.fillAge >= BOWL_MOLD_SECONDS;
}

/**
 * Avance un objet d'un pas : chute, atterrissage, resynchronisation sur sa
 * surface (fenêtre déplacée ou fermée : il retombe) et péremption.
 * @param {ReturnType<typeof createItem>} item
 * @param {number} dt
 * @param {{segments: object[]}} surfaces

 * @param {{y:number, height:number}} [worldBounds]
 * @param {{threats?: object[], random?: () => number}} [ctx] menaces (animaux, curseur) et hasard pour les proies
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
      item.portions = 0; // la nourriture moisie disparaît
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
    return;
  }

  const isBall = item.type === 'toy' && item.kind === 'ball';
  const segments = surfaces.segments ?? [];

  if (item.surface) {
    if (isBall && item.vx !== 0) {
      item.x += item.vx * dt;
      bounceOffWorldEdges(item, worldBounds);
      item.vx *= Math.max(0, 1 - ROLL_FRICTION * dt);
      if (Math.abs(item.vx) < 4) item.vx = 0;
    }
    const fresh = findSegmentById(segments, item.surface.surfaceId, item.surface.type);
    if (fresh && isOnSegment(fresh, item.x, item.y, 4)) {
      item.surface = fresh;
      item.y = fresh.y;
      if (item.type === 'prey') movePreyOnSurface(item, dt, fresh, ctx);
      return;
    }
    item.surface = null; // fenêtre partie, ou bord dépassé : il tombe (avec son élan)
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
    if (isBall && item.vy > BOUNCE_MIN_SPEED) {
      item.vy = -item.vy * BOUNCE_RESTITUTION; // rebond : reste en l'air
      return;
    }
    item.vy = 0;
    item.surface = landing;
    if (!isBall) item.vx = 0;
    return;
  }
  item.y = nextY;
  if (worldBounds && item.y > worldBounds.y + worldBounds.height + 200) {
    item.y = worldBounds.y + worldBounds.height; // filet de sécurité : jamais hors de l'écran
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

/** Frappe la balle (par un animal) : elle décolle et file dans la direction donnée. */
export function kick(item, dirX) {
  if (item.type !== 'toy' || item.kind !== 'ball') return;
  item.vx = (dirX >= 0 ? 1 : -1) * KICK_SPEED;
  item.vy = -KICK_SPEED;
  item.surface = null;
}

/** Un objet hors de tout moniteur (changement de résolution, écran débranché) réapparaît en haut du plus proche. */
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

/** Lance un objet (relâché à la souris avec de l'élan). */
export function throwItem(item, vx, vy) {
  item.vx = vx;
  item.vy = vy;
  item.surface = null;
}

/** Vrai pour un jouet (base de « Ranger les jouets »). */
export function isToy(item) {
  return item.type === 'toy';
}

/**
 * Jouets qu'une espèce qui marche peut rejoindre, du plus proche au plus loin :
 * sur la même surface, ou n'importe laquelle pour une espèce qui vole.
 */
export function toysFor(items, { x, surfaceId, canFly }) {
  return items
    .filter((i) => i.type === 'toy' && !i.removed && !i.grabbed && i.surface)
    .filter((i) => canFly || i.surface.surfaceId === surfaceId)
    .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
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
      if (!item.surface) continue; // encore en chute
      if (!canFly && item.surface.surfaceId !== surfaceId) continue;
    }
    found.push({ item, gain });
  }
  return found.sort((a, b) => Math.abs(a.item.x - x) - Math.abs(b.item.x - x));
}

/**
 * Une portion en moins (gamelle, plante) ou l'objet mangé.
 * @returns {{sick: boolean}} sick : la nourriture était moisie
 */
export function consume(item) {
  const sick = isMoldy(item);
  if (item.type === 'bowl' || item.type === 'plant') item.portions = Math.max(0, item.portions - 1);
  else item.consumed = true;
  item.claimedBy = null;
  return { sick };
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
      .filter((i) => !isGone(i) && !i.grabbed && i.type !== 'prey') // les proies sont éphémères
      .map((i) => ({
        type: i.type,
        kind: i.kind,
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
    if (!raw || !ITEM_TYPES.includes(raw.type) || raw.type === 'prey' || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) continue;
    const validKind =
      raw.type === 'gift' ? GIFTS[raw.kind] : raw.type === 'toy' ? TOYS[raw.kind] : raw.type === 'plant' ? PLANTS[raw.kind] : raw.type === 'bed' || raw.type === 'litter' || raw.type === 'mess' ? true : FOODS[raw.kind];
    if (!validKind) continue;
    const item = createItem(raw.type, raw.kind, 0, 0);
    item.x = Math.min(Math.max(raw.x, bounds.x), bounds.x + bounds.width);
    item.y = Math.min(Math.max(raw.y, bounds.y), bounds.y + bounds.height);
    if (item.type === 'bowl') {
      item.portions = Number.isFinite(raw.portions) ? Math.min(Math.max(raw.portions, 0), BOWL_CAPACITY) : 0;
      item.fillAge = Number.isFinite(raw.fillAge) && raw.fillAge >= 0 ? raw.fillAge : 0;
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
