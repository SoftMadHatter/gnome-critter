// Saving/restoring the critters' state: pure functions (storage itself, a
// GSettings key, is in extension/lib/manager.js). The format is versioned
// and carries an `extra` object per critter, reserved for future needs
// (mood, hunger...) without breaking existing saves.

export const SAVE_VERSION = 2;
// Version 1 (position only, no timestamp) stays readable: no catch-up on
// needs, empty `extra`.
const READABLE_VERSIONS = new Set([1, 2]);

/**
 * @param {string} packId
 * @param {{serialize: () => object}[]} critters
 * @param {number} [nowMs] wall clock, for catch-up on the next startup
 * @returns {string} JSON
 */
export function serializeCritters(packId, critters, nowMs = Date.now()) {
  return JSON.stringify({
    version: SAVE_VERSION,
    packId,
    savedAt: nowMs,
    critters: critters.map((c) => c.serialize()),
  });
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/**
 * Reads a save, never throwing.
 * @param {string} text
 * @param {{packId: string, bounds: {x:number,y:number,width:number,height:number}, nowMs?: number}} context
 * @returns {{x:number, y:number, facing:1|-1, extra:object, elapsedSeconds:number}[]} empty if the
 *   save is missing, invalid, or from another version or another pack
 */
export function parseSavedState(text, { packId, bounds, nowMs = Date.now() }) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!READABLE_VERSIONS.has(data?.version) || data.packId !== packId || !Array.isArray(data.critters)) {
    return [];
  }

  const elapsedSeconds =
    Number.isFinite(data.savedAt) && nowMs > data.savedAt ? (nowMs - data.savedAt) / 1000 : 0;

  const result = [];
  for (const raw of data.critters) {
    if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) continue;
    result.push({
      x: clamp(raw.x, bounds.x, bounds.x + bounds.width),
      y: clamp(raw.y, bounds.y, bounds.y + bounds.height),
      facing: raw.facing === -1 ? -1 : 1,
      extra: raw.extra && typeof raw.extra === 'object' && !Array.isArray(raw.extra) ? raw.extra : {},
      elapsedSeconds,
    });
  }
  return result;
}
