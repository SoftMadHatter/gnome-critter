// Tours appris par répétition (assis, roulade, saut). Module pur : le Critter
// possède un carnet de tours ; le joueur entraîne, l'animal progresse.

export const TRICKS = Object.freeze({
  sit: { label: 'Assis', duration: 2.5 },
  roll: { label: 'Roulade', duration: 2 },
  flip: { label: 'Saut périlleux', duration: 1.6 },
});

const TRAINING_GAIN = 12; // maîtrise gagnée par essai
const GAIN_BY_TRAIT = { playful: 1.5, lazy: 0.6 };
const MIN_CHANCE = 0.15; // même un débutant réussit parfois

/**
 * Valide la liste `tricks` d'un pack : noms de tours connus.
 * @param {unknown} raw
 * @returns {{list: string[], ignored: string[]}}
 */
export function tricksOverrides(raw) {
  if (raw === undefined) return { list: [], ignored: [] };
  if (!Array.isArray(raw)) return { list: [], ignored: ['tricks'] };
  const list = [];
  const ignored = [];
  for (const name of raw) {
    if (typeof name === 'string' && TRICKS[name] && !list.includes(name)) list.push(name);
    else ignored.push(String(name));
  }
  return { list, ignored };
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

export class TrickBook {
  constructor() {
    this.skills = {};
  }

  skill(name) {
    return this.skills[name] ?? 0;
  }

  /** Un tour est appris quand sa maîtrise atteint 100. */
  isLearned(name) {
    return this.skill(name) >= 100;
  }

  learned() {
    return Object.keys(this.skills).filter((name) => this.isLearned(name));
  }

  /**
   * Un essai d'entraînement : réussi avec la probabilité de la maîtrise, qui
   * monte dans tous les cas (plus vite pour un joueur, moins pour un paresseux).
   * @param {string} name
   * @param {() => number} random
   * @param {string|null} trait
   * @returns {{success: boolean, learned: boolean}} learned : vrai à l'essai qui fait atteindre 100
   */
  train(name, random, trait = null) {
    if (!TRICKS[name]) return { success: false, learned: false };
    const before = this.skill(name);
    const success = this.isLearned(name) || random() < Math.max(MIN_CHANCE, before / 100);
    this.skills[name] = clamp(before + TRAINING_GAIN * (GAIN_BY_TRAIT[trait] ?? 1), 0, 100);
    return { success, learned: before < 100 && this.isLearned(name) };
  }

  serialize() {
    return Object.fromEntries(Object.entries(this.skills).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  }

  restore(saved) {
    if (!saved || typeof saved !== 'object') return;
    for (const name of Object.keys(TRICKS)) {
      if (Number.isFinite(saved[name])) this.skills[name] = clamp(saved[name], 0, 100);
    }
  }
}
