// Autonomy: how much the animal covers its own needs (hunting, foraging),
// from 0 (depends on you) to 1. Pure module.

/** At autonomy 1, the needs' decay rate is reduced by this share (never zero). */
export const RELIEF = 0.8;

const STAGE_BASE = { egg: 0, baby: 0, young: 0.4, adult: 0.7, senior: 0.7 };
const TRICK_BONUS = 0.1;
const TRICK_BONUS_CAP = 0.3;

/**
 * @param {string} mode `auto` (follows growth and tricks learned), `off`,
 *   `partial` (0.5) or `full` (1)
 * @param {{stage: string, hibernating: boolean}} life
 * @param {number} learnedTricks number of tricks learned
 * @returns {number} level from 0 to 1 (always 0 for an egg or a hibernating animal)
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
