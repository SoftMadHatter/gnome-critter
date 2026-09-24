// Succès propres à une espèce et à un caractère, déclarés dans pack.json
// (section `achievements`). Module pur.

import { CONDITION_STATS } from './stats.js';
import { STAGES, TRAITS } from './life.js';

export const DEFAULT_ACHIEVEMENT_COINS = 10;

/**
 * Valide la section `achievements` d'un pack : liste de
 * `{ id, name, description, requires?: {trait?, stage?}, condition: {stat, atLeast}, coins? }`.
 * @param {unknown} raw
 * @returns {{list: object[], ignored: string[]}}
 */
export function achievementsOverrides(raw) {
  const list = [];
  const ignored = [];
  if (raw === undefined) return { list, ignored };
  if (!Array.isArray(raw)) return { list, ignored: ['achievements'] };

  const seen = new Set();
  raw.forEach((def, index) => {
    const label = def && typeof def.id === 'string' ? def.id : `#${index}`;
    const requires = def?.requires ?? {};
    const valid =
      def &&
      typeof def.id === 'string' && def.id !== '' && !seen.has(def.id) &&
      typeof def.name === 'string' && def.name !== '' &&
      typeof def.description === 'string' &&
      CONDITION_STATS.includes(def.condition?.stat) &&
      Number.isFinite(def.condition?.atLeast) && def.condition.atLeast > 0 &&
      (requires.trait === undefined || TRAITS.includes(requires.trait)) &&
      (requires.stage === undefined || STAGES.includes(requires.stage)) &&
      (def.coins === undefined || (Number.isFinite(def.coins) && def.coins >= 0));
    if (!valid) {
      ignored.push(label);
      return;
    }
    seen.add(def.id);
    list.push({
      id: def.id,
      name: def.name,
      description: def.description,
      requires: { trait: requires.trait, stage: requires.stage },
      condition: { stat: def.condition.stat, atLeast: def.condition.atLeast },
      coins: def.coins ?? DEFAULT_ACHIEVEMENT_COINS,
    });
  });
  return { list, ignored };
}

/** Un animal peut-il un jour obtenir ce succès ? (son caractère correspond ; le stade se gagne avec le temps) */
export function isEligible(def, { trait }) {
  return def.requires.trait === undefined || def.requires.trait === trait;
}

/**
 * Succès à débloquer maintenant.
 * @param {object[]} defs
 * @param {{trait: string|null, stage: string, stats: Record<string, number>}} context
 * @param {Set<string>} unlocked identifiants déjà obtenus
 */
export function newlyUnlocked(defs, { trait, stage, stats }, unlocked) {
  return defs
    .filter((def) => !unlocked.has(def.id))
    .filter((def) => isEligible(def, { trait }))
    .filter((def) => def.requires.stage === undefined || def.requires.stage === stage)
    .filter((def) => (stats[def.condition.stat] ?? 0) >= def.condition.atLeast)
    .map((def) => def.id);
}
