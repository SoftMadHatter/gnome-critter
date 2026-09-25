// Mise en forme des succès pour la page de revue (conditions, exigences,
// rubriques). Module pur : utilisé aussi par les contrôles, testés sous Node.

import { formatCount } from '../../core/achievements.js';
import {
  statLabel as critterStatLabel, playerStatLabel, markFamilyLabel, categoryLabel, stageLabel, traitLabel,
} from '../../core/labels.js';

export { categoryLabel };

/** Libellé d'une stat, selon la portée (animal ou joueur). */
export function statLabel(stat, scope = 'critter') {
  return scope === 'player' ? playerStatLabel(stat) : critterStatLabel(stat);
}

/** Condition lisible : « Repas ≥ 50 », « Aliments goûtés ≥ 4 », « marque holiday:christmas ». */
export function conditionText(def) {
  const { condition, unit = 1 } = def;
  if (condition.stat !== undefined) {
    const value = formatCount(condition.atLeast / unit);
    return `${statLabel(condition.stat, def.scope)} ≥ ${value}${unit === 3600 ? ' h' : ''}`;
  }
  if (condition.marks !== undefined) return `${markFamilyLabel(condition.marks)} ≥ ${condition.atLeast}`;
  return `marque ${condition.mark}`;
}

/** Exigences lisibles : caractère, stade, capacités de l'espèce. */
export function requiresText(def) {
  const parts = [];
  if (def.requires.trait) parts.push(`caractère ${traitLabel(def.requires.trait)}`);
  if (def.requires.stage) parts.push(`stade ${stageLabel(def.requires.stage).toLowerCase()}`);
  if (def.requires.can.length > 0) parts.push(def.requires.can.join(', '));
  return parts.join(' · ');
}

/** Clé d'un gabarit : sa série, ou son identifiant pour un succès unique. */
export const templateKey = (entry) => (entry?.series ? `s:${entry.series}` : `i:${entry?.id}`);
