// Formatting of achievements for the review page (conditions, requirements,
// categories). Pure module: also used by the checks, tested under Node.

import { formatCount } from '../../core/achievements.js';
import {
  statLabel as critterStatLabel, playerStatLabel, markFamilyLabel, categoryLabel, stageLabel, traitLabel,
} from '../../core/labels.js';

export { categoryLabel };

/** A stat's label, based on scope (critter or player). */
export function statLabel(stat, scope = 'critter') {
  return scope === 'player' ? playerStatLabel(stat) : critterStatLabel(stat);
}

/** Readable condition: "Repas ≥ 50", "Aliments goûtés ≥ 4", "marque holiday:christmas". */
export function conditionText(def) {
  const { condition, unit = 1 } = def;
  if (condition.stat !== undefined) {
    const value = formatCount(condition.atLeast / unit);
    return `${statLabel(condition.stat, def.scope)} ≥ ${value}${unit === 3600 ? ' h' : ''}`;
  }
  if (condition.marks !== undefined) return `${markFamilyLabel(condition.marks)} ≥ ${condition.atLeast}`;
  return `marque ${condition.mark}`;
}

/** Readable requirements: trait, stage, species capabilities. */
export function requiresText(def) {
  const parts = [];
  if (def.requires.trait) parts.push(`caractère ${traitLabel(def.requires.trait)}`);
  if (def.requires.stage) parts.push(`stade ${stageLabel(def.requires.stage).toLowerCase()}`);
  if (def.requires.can.length > 0) parts.push(def.requires.can.join(', '));
  return parts.join(' · ');
}

/** A template's key: its series, or its id for a standalone achievement. */
export const templateKey = (entry) => (entry?.series ? `s:${entry.series}` : `i:${entry?.id}`);
