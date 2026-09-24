// Objets posés sur le bureau : nourriture, gamelle, lit. Module pur, sans
// GNOME : le Manager les possède et les avance à chaque tick, les critters
// les lisent (et les consomment) via `options.items`.

import { PREY, PREY_TTL, movePreyOnSurface, movePreyFloating } from './prey.js';
import {
  findSurfaceBelow, findSegmentById, isOnSegment, isInsideAnyMonitor, respawnPoint,
} from './surfaceMap.js';

/** Aliments connus : durée de vie en secondes, nombre de bouchées (un reste
 * entamé peut attendre sur le bureau), et `floats` pour la nourriture sans
 * gravité (plancton et flocons du poisson). */
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

/** Aliment qui peut aller dans une gamelle (pas la nourriture flottante). */
export function isBowlFood(kind) {
  return Boolean(FOODS[kind]) && !FOODS[kind].floats;
}

/** Plantes décoratives à grignoter : elles repoussent, ne disparaissent jamais (l'algue flotte). */
export const PLANTS = Object.freeze({ grass: {}, berries: {}, leaf: {}, algae: { floats: true } });
export const PLANT_MAX_PORTIONS = 3;
const PLANT_REGROW_SECONDS = 300;

/** Nourriture de gamelle : moisie après 24 h, disparaît 6 h plus tard. */
export const BOWL_MOLD_SECONDS = 24 * 3600;
export const BOWL_VANISH_SECONDS = 6 * 3600;

/**
 * Jouets. `rolls` : roule et se frappe (rebond, freinage en 1/s, vitesse de
 * frappe) ; `floats` : flotte sans gravité, poussé par le poisson ; la peluche
 * reste posée. `variants` : couleurs ou modèles, tirés au hasard à la pose.
 */
export const TOYS = Object.freeze({
  ball: { rolls: true, bounce: 0.45, friction: 2.5, kick: 260, variants: ['red', 'blue', 'yellow', 'green'] },
  yarn: { rolls: true, bounce: 0.15, friction: 5, kick: 200, variants: ['pink', 'blue', 'yellow'] },
  plush: { variants: ['bear', 'rabbit', 'frog'] },
  ring: { floats: true, variants: ['orange'] },
});

/** Modèles de lit et de gamelle, choisis à la pose (le premier par défaut). */
export const BED_MODELS = Object.freeze(['cushion', 'basket', 'cradle']);
export const BOWL_MODELS = Object.freeze(['ceramic', 'steel', 'wood']);

/** Modèles possibles d'un objet (lit, gamelle, variantes d'un jouet) ; vide pour les autres. */
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

/** Variante d'un jouet tirée au hasard (couleur de balle, modèle de peluche). */
export function pickVariant(kind, random = Math.random) {
  const variants = TOYS[kind]?.variants ?? [];
  return variants[Math.min(variants.length - 1, Math.floor(random() * variants.length))] ?? null;
}

/** Jouet adapté à une espèce : flottant pour une espèce sans sol, posé sinon. */
export function toyFits(kind, groundless) {
  return Boolean(TOYS[kind]) && Boolean(TOYS[kind].floats) === groundless;
}

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
const BOUNCE_MIN_SPEED = 140; // en dessous, un jouet qui roule se pose au lieu de rebondir
const DRIFT_FRICTION = 1.2; // 1/s : l'anneau poussé perd cette part de sa vitesse par seconde
const PUSH_SPEED = 150;
const FLOAT_TOP_MARGIN = 16; // un objet flottant garde le haut de son sprite dans l'écran

let nextId = 1;

/**
 * @param {'food'|'bowl'|'bed'|'toy'|'gift'|'plant'|'prey'|'litter'|'mess'} type
 * @param {string|null} kind aliment (food ; bowl, null pour une gamelle vide), jouet (toy), null pour un lit
 * @param {string|null} [model] modèle de lit ou de gamelle, variante de jouet (le premier par défaut)
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
    vx: 0, // vitesse horizontale (balle qui roule, objet lancé)
    vy: 0,
    surface: null, // segment sur lequel l'objet repose, une fois posé
    floating: Boolean(food?.floats || plant?.floats || prey?.floats || toy?.floats),
    portions: plant ? PLANT_MAX_PORTIONS : food ? food.bites : 0, // bouchées (aliment), portions (gamelle, plante)
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
  if (bowl.type !== 'bowl' || !isBowlFood(kind)) return;
  if (bowl.kind !== kind) bowl.portions = 0; // on ne mélange pas deux aliments
  bowl.kind = kind;
  bowl.fillAge = 0; // nourriture fraîche
  bowl.portions = Math.min(BOWL_CAPACITY, bowl.portions + portions);
}

/** Niveau visible d'une gamelle : 0 vide, 1 (1-2 portions), 2 (3-4), 3 pleine. */
export function bowlLevel(portions) {
  if (!(portions > 0)) return 0;
  return portions >= BOWL_CAPACITY ? 3 : portions >= 3 ? 2 : 1;
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
    if (rolls && item.vy > BOUNCE_MIN_SPEED) {
      item.vy = -item.vy * toy.bounce; // rebond : reste en l'air
      return;
    }
    item.vy = 0;
    item.surface = landing;
    if (!rolls) item.vx = 0;
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

/** Objet flottant lancé ou poussé : glisse sur son élan, ralentit, rebondit sur les bords de l'écran. */
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
 * Frappe un jouet qui roule (par un animal) : il décolle et file dans la direction donnée.
 * @returns {boolean} faux pour un objet qui ne se frappe pas (peluche, anneau...)
 */
export function kick(item, dirX) {
  const toy = item.type === 'toy' ? TOYS[item.kind] : null;
  if (!toy?.rolls) return false;
  item.vx = (dirX >= 0 ? 1 : -1) * toy.kick;
  item.vy = -toy.kick;
  item.surface = null;
  return true;
}

/** Pousse un jouet flottant (par le poisson) : il file dans la direction (dx, dy). */
export function push(item, dx, dy) {
  if (item.type !== 'toy' || !TOYS[item.kind]?.floats) return false;
  const length = Math.hypot(dx, dy);
  if (length === 0) return false;
  item.vx = (dx / length) * PUSH_SPEED;
  item.vy = (dy / length) * PUSH_SPEED;
  return true;
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
 * Jouets qu'un animal peut rejoindre, du plus proche au plus loin. Espèce qui
 * marche : jouets posés sur sa surface, ou n'importe laquelle si elle vole ;
 * espèce sans sol (`floating`) : jouets flottants, n'importe où.
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
 * Une bouchée (aliment), une portion (gamelle, plante) ou l'objet entier.
 * @returns {{sick: boolean, fraction: number, finished: boolean}} sick : la
 *   nourriture était moisie ; fraction : part du gain de satiété apportée ;
 *   finished : faux tant qu'il reste des bouchées à l'aliment
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
      raw.type === 'gift' ? GIFTS[raw.kind]
      : raw.type === 'toy' ? TOYS[raw.kind]
      : raw.type === 'plant' ? PLANTS[raw.kind]
      : raw.type === 'bed' || raw.type === 'litter' || raw.type === 'mess' ? true
      : raw.type === 'bowl' ? raw.kind == null || FOODS[raw.kind] // gamelle posée vide : pas d'aliment
      : FOODS[raw.kind];
    if (!validKind) continue;
    // Modèle absent ou inconnu (ancienne sauvegarde) : modèle par défaut.
    const item = createItem(raw.type, raw.kind ?? null, 0, 0, raw.model);
    item.x = Math.min(Math.max(raw.x, bounds.x), bounds.x + bounds.width);
    item.y = Math.min(Math.max(raw.y, bounds.y), bounds.y + bounds.height);
    if (item.type === 'bowl') {
      // Une ancienne gamelle de plancton (aliment flottant) revient vide.
      item.portions = item.kind && Number.isFinite(raw.portions) ? Math.min(Math.max(raw.portions, 0), BOWL_CAPACITY) : 0;
      item.fillAge = Number.isFinite(raw.fillAge) && raw.fillAge >= 0 ? raw.fillAge : 0;
    }
    if (item.type === 'food') {
      // Bouchées restantes ; une ancienne sauvegarde (0) revient entière.
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
