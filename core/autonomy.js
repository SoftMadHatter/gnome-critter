// Autonomie : à quel point l'animal couvre lui-même ses besoins (chasse,
// grignotage), de 0 (dépend de toi) à 1. Module pur.

export const AUTONOMY_MODES = Object.freeze(['auto', 'off', 'partial', 'full']);

/** À autonomie 1, la vitesse de baisse des besoins est réduite de cette part (jamais nulle). */
export const RELIEF = 0.8;

const STAGE_BASE = { egg: 0, baby: 0, young: 0.4, adult: 0.7, senior: 0.7 };
const TRICK_BONUS = 0.1;
const TRICK_BONUS_CAP = 0.3;

/**
 * @param {string} mode `auto` (suit la croissance et les tours appris), `off`,
 *   `partial` (0,5) ou `full` (1)
 * @param {{stage: string, hibernating: boolean}} life
 * @param {number} learnedTricks nombre de tours appris
 * @returns {number} niveau de 0 à 1 (toujours 0 pour un œuf ou un hibernant)
 */
export function autonomyLevel(mode, life, learnedTricks = 0) {
  if (life.hibernating || life.stage === 'egg') return 0;
  switch (mode) {
    case 'off':
      return 0;
    case 'partial':
      return 0.5;
    case 'full':
      return 1;
    default:
      return Math.min(1, (STAGE_BASE[life.stage] ?? 0) + Math.min(TRICK_BONUS_CAP, TRICK_BONUS * learnedTricks));
  }
}
