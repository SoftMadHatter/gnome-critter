// Proies : petites créatures qui flânent sur le bureau, fuient les animaux et le
// curseur, et que les animaux autonomes chassent. Module pur (la physique de
// chute et d'atterrissage est celle des autres objets, dans items.js).

import { sign } from './vec2.js';

/** Espèces de proies : vitesse de flânerie (px/s) et `floats` pour celles qui dérivent dans tout l'espace. */
export const PREY = Object.freeze({
  mouse: { speed: 45 },
  beetle: { speed: 22 },
  aphid: { speed: 12 },
  krill: { speed: 30, floats: true },
});

export const PREY_TTL = 600; // secondes avant qu'une proie non mangée ne disparaisse
export const FLEE_ANIMAL_RADIUS = 110;
export const FLEE_POINTER_RADIUS = 80;
const FLEE_SPEED_FACTOR = 2.2;
const EDGE_MARGIN = 2;

/** Menace la plus proche dont le rayon englobe la proie, ou null. threats : [{x, y, radius}]. */
function nearestThreat(prey, threats = []) {
  let best = null;
  let bestDistance = Infinity;
  for (const t of threats) {
    const d = Math.hypot(prey.x - t.x, prey.y - t.y);
    if (d < t.radius && d < bestDistance) {
      best = t;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Proie posée sur un segment : flâne (marche, s'arrête, repart), fuit une
 * menace plus vite, fait demi-tour aux bords.
 * @param {object} prey
 * @param {number} dt
 * @param {{x1:number, x2:number}} segment
 * @param {{threats?: object[], random?: () => number}} ctx
 */
export function movePreyOnSurface(prey, dt, segment, { threats, random = Math.random } = {}) {
  const spec = PREY[prey.kind];
  const threat = nearestThreat(prey, threats);
  let speed;
  if (threat) {
    prey.dir = sign(prey.x - threat.x) || prey.dir || 1;
    speed = spec.speed * FLEE_SPEED_FACTOR;
    prey.fleeing = true;
  } else {
    prey.fleeing = false;
    prey.wanderTimer = (prey.wanderTimer ?? 0) - dt;
    if (prey.wanderTimer <= 0) {
      prey.wanderTimer = 1 + random() * 2;
      const r = random();
      prey.paused = r < 0.3; // une pause de temps en temps
      if (!prey.paused) prey.dir = r < 0.65 ? 1 : -1;
    }
    speed = prey.paused ? 0 : spec.speed;
  }

  const min = segment.x1 + EDGE_MARGIN;
  const max = segment.x2 - EDGE_MARGIN;
  prey.x += prey.dir * speed * dt;
  if (prey.x <= min) {
    prey.x = min;
    if (!threat) prey.dir = 1; // demi-tour ; acculée, elle reste (et l'animal la rattrape)
  } else if (prey.x >= max) {
    prey.x = max;
    if (!threat) prey.dir = -1;
  }
  prey.moving = speed > 0;
}

/**
 * Proie flottante (krill) : dérive vers un point tiré au hasard dans les
 * bornes, s'éloigne d'une menace.
 */
export function movePreyFloating(prey, dt, bounds, { threats, random = Math.random } = {}) {
  const spec = PREY[prey.kind];
  const threat = nearestThreat(prey, threats);
  let dx;
  let dy;
  let speed = spec.speed;
  if (threat) {
    dx = prey.x - threat.x;
    dy = prey.y - threat.y;
    speed *= FLEE_SPEED_FACTOR;
    prey.fleeing = true;
  } else {
    prey.fleeing = false;
    prey.wanderTimer = (prey.wanderTimer ?? 0) - dt;
    const arrived = prey.targetX !== undefined && Math.hypot(prey.targetX - prey.x, prey.targetY - prey.y) < 8;
    if (prey.wanderTimer <= 0 || arrived || prey.targetX === undefined) {
      prey.wanderTimer = 2 + random() * 4;
      prey.targetX = bounds.x + random() * bounds.width;
      prey.targetY = bounds.y + bounds.height * (0.15 + random() * 0.7);
    }
    dx = prey.targetX - prey.x;
    dy = prey.targetY - prey.y;
  }
  const norm = Math.hypot(dx, dy) || 1;
  prey.x += (dx / norm) * speed * dt;
  prey.y += (dy / norm) * speed * dt;
  prey.x = Math.min(Math.max(prey.x, bounds.x), bounds.x + bounds.width);
  prey.y = Math.min(Math.max(prey.y, bounds.y), bounds.y + bounds.height);
  if (Math.abs(dx) > 1) prey.dir = sign(dx);
  prey.moving = true;
}

/**
 * Point d'apparition d'une proie ou d'une plante.
 * @param {{segments: {type:string, x1:number, x2:number, y:number}[]}} surfaces
 * @param {() => number} random
 * @param {{floating?: boolean, bounds: {x:number,y:number,width:number,height:number}}} options
 * @returns {{x:number, y:number}|null} null s'il n'y a aucune surface où apparaître
 */
export function pickSpawnPoint(surfaces, random, { floating = false, bounds }) {
  if (floating) {
    return {
      x: bounds.x + 16 + random() * Math.max(0, bounds.width - 32),
      y: bounds.y + bounds.height * (0.2 + random() * 0.6),
    };
  }
  const segments = (surfaces.segments ?? []).filter((s) => (s.type === 'ground' || s.type === 'shelf') && s.x2 - s.x1 > 24);
  const total = segments.reduce((sum, s) => sum + (s.x2 - s.x1), 0);
  if (total <= 0) return null;
  let r = random() * total;
  for (const s of segments) {
    const width = s.x2 - s.x1;
    if (r < width) {
      return { x: s.x1 + 8 + random() * (width - 16), y: s.y - 30 }; // lâchée juste au-dessus : elle retombe
    }
    r -= width;
  }
  const last = segments[segments.length - 1];
  return { x: (last.x1 + last.x2) / 2, y: last.y - 30 };
}

/** Décide quand une proie doit apparaître : à intervalle aléatoire, au plus `max` en même temps. */
export class PreySpawner {
  constructor({ minInterval = 60, maxInterval = 180, max = 3 } = {}) {
    this.minInterval = minInterval;
    this.maxInterval = maxInterval;
    this.max = max;
    this._timer = null;
  }

  /**
   * @param {number} dt
   * @param {{count: number, enabled: boolean, random?: () => number}} state count : proies présentes
   * @returns {boolean} vrai quand il faut en faire apparaître une
   */
  advance(dt, { count, enabled, random = Math.random }) {
    if (!enabled || count >= this.max) return false;
    if (this._timer === null) this._timer = this.minInterval + random() * (this.maxInterval - this.minInterval);
    this._timer -= dt;
    if (this._timer > 0) return false;
    this._timer = null;
    return true;
  }
}
