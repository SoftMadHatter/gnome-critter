// Which setting governs each sound. A master switch (`sounds-enabled`) turns
// every sound off; below it, three categories can be turned off separately.
// Pure module.

/** Reactions about the animal's life events and the reminders it brings. */
const LIFE_REACTIONS = new Set(['hatched', 'grew', 'birthday', 'gift', 'trickLearned', 'reminded']);

export const SOUNDS_MASTER_KEY = 'sounds-enabled';
export const VOICES_KEY = 'sounds-voices'; // the animal's voice: petted, startled, annoyed...
export const LIFE_KEY = 'sounds-life'; // hatching, growing, birthday, gift, trick, break reminder
export const GAME_KEY = 'sounds-game'; // the extension's own: achievement, coin, blunder

/** The category setting of a pack reaction's sound (any reaction not listed above is a voice). */
export function reactionSoundKey(reaction) {
  return LIFE_REACTIONS.has(reaction) ? LIFE_KEY : VOICES_KEY;
}

/**
 * @param {(key: string) => boolean} read reads a boolean setting
 * @param {string} categoryKey VOICES_KEY, LIFE_KEY or GAME_KEY
 */
export function soundEnabled(read, categoryKey) {
  return read(SOUNDS_MASTER_KEY) && read(categoryKey);
}
