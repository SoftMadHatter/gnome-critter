// Libellés français de la vie d'un animal (stade, caractère, évolution, âge)
// pour l'icône de la barre supérieure.

export const STAGE_LABELS = { egg: 'Œuf', baby: 'Bébé', young: 'Jeune', adult: 'Adulte', senior: 'Senior' };
export const TRAIT_LABELS = { playful: 'joueur', lazy: 'paresseux', greedy: 'gourmand', shy: 'timide' };
export const EVOLUTION_LABELS = { devoted: 'choyé', neglected: 'négligé' };

export function formatAge(seconds) {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 48 * 3600) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86400)} j`;
}

/** « Adulte, joueur, choyé, 3 j » (+ « hibernation » le cas échéant). */
export function lifeSummary(life) {
  const parts = [STAGE_LABELS[life.stage] ?? life.stage];
  if (life.trait) parts.push(TRAIT_LABELS[life.trait]);
  if (EVOLUTION_LABELS[life.evolution]) parts.push(EVOLUTION_LABELS[life.evolution]);
  parts.push(formatAge(life.ageSeconds));
  if (life.hibernating) parts.push('hibernation');
  return parts.join(', ');
}
