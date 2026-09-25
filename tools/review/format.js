// Mise en forme des succès pour la page de revue (conditions, exigences,
// rubriques). Module pur : utilisé aussi par les contrôles, testés sous Node.

import { formatCount } from '../../core/achievements.js';
import {
  STAT_LABELS, PLAYER_STAT_LABELS, MARK_FAMILY_LABELS, CATEGORY_LABELS,
} from '../../extension/lib/progressLabels.js';
import { STAGE_LABELS, TRAIT_LABELS } from '../../extension/lib/lifeLabels.js';

export const categoryLabel = (id) => CATEGORY_LABELS[id] ?? id;

/** Libellé d'une stat, selon la portée (animal ou joueur). */
export function statLabel(stat, scope = 'critter') {
  return (scope === 'player' ? PLAYER_STAT_LABELS : STAT_LABELS)[stat] ?? stat;
}

/** Condition lisible : « Repas ≥ 50 », « Aliments goûtés ≥ 4 », « marque holiday:christmas ». */
export function conditionText(def) {
  const { condition, unit = 1 } = def;
  if (condition.stat !== undefined) {
    const value = formatCount(condition.atLeast / unit);
    return `${statLabel(condition.stat, def.scope)} ≥ ${value}${unit === 3600 ? ' h' : ''}`;
  }
  if (condition.marks !== undefined) return `${MARK_FAMILY_LABELS[condition.marks] ?? condition.marks} ≥ ${condition.atLeast}`;
  return `marque ${condition.mark}`;
}

/** Exigences lisibles : caractère, stade, capacités de l'espèce. */
export function requiresText(def) {
  const parts = [];
  if (def.requires.trait) parts.push(`caractère ${TRAIT_LABELS[def.requires.trait] ?? def.requires.trait}`);
  if (def.requires.stage) parts.push(`stade ${STAGE_LABELS[def.requires.stage]?.toLowerCase() ?? def.requires.stage}`);
  if (def.requires.can.length > 0) parts.push(def.requires.can.join(', '));
  return parts.join(' · ');
}

/** Clé d'un gabarit : sa série, ou son identifiant pour un succès unique. */
export const templateKey = (entry) => (entry?.series ? `s:${entry.series}` : `i:${entry?.id}`);
