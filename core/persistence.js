// Saving/restoring the critters' state: pure functions (storage itself, a
// GSettings key, is in extension/lib/manager.js). The format is versioned
// and carries an `extra` object per critter, reserved for future needs
// (mood, hunger...) without breaking existing saves.

export const SAVE_VERSION = 3;
// Version 1 (position only, no timestamp) and version 2 (a single shared
// packId for every critter, from before mixed species) stay "readable" in
// the sense of not crashing: their critters just never match `packIds`
// below (version 2's `packId` isn't even the right shape), so they read
// back as no data for any critter -- same as any other pack mismatch.
const READABLE_VERSIONS = new Set([1, 2, 3]);

/**
 * @param {string[]} packIds one per critter, in the same order as `critters`
 * @param {{serialize: () => object}[]} critters
 * @param {number} [nowMs] wall clock, for catch-up on the next startup
 * @returns {string} JSON
 */
export function serializeCritters(packIds, critters, nowMs = Date.now()) {
  return JSON.stringify({
    version: SAVE_VERSION,
    packIds,
    savedAt: nowMs,
    critters: critters.map((c) => c.serialize()),
  });
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/**
 * Reads a save, never throwing. Matched per critter, not as a whole: a
 * saved critter only comes back if the pack at its own index still matches
 * (so changing just one species in the mix doesn't discard the others).
 * @param {string} text
 * @param {{packIds: string[], bounds: {x:number,y:number,width:number,height:number}, nowMs?: number}} context
 *   `packIds`: this run's pack per critter, in spawn order
 * @returns {({x: number, y: number, facing:1|-1, extra:object, elapsedSeconds:number}|undefined)[]}
 *   same length as `packIds`; a hole (`undefined`) where there's no usable saved data (missing,
 *   invalid, wrong version, or that index's pack changed)
 */
export function parseSavedState(text, { packIds, bounds, nowMs = Date.now() }) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!READABLE_VERSIONS.has(data?.version) || !Array.isArray(data.critters) || !Array.isArray(data.packIds)) {
    return [];
  }

  const elapsedSeconds =
    Number.isFinite(data.savedAt) && nowMs > data.savedAt ? (nowMs - data.savedAt) / 1000 : 0;

  return packIds.map((packId, i) => {
    const raw = data.critters[i];
    if (data.packIds[i] !== packId || !raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) {
      return undefined;
    }
    return {
      x: clamp(raw.x, bounds.x, bounds.x + bounds.width),
      y: clamp(raw.y, bounds.y, bounds.y + bounds.height),
      facing: raw.facing === -1 ? -1 : 1,
      extra: raw.extra && typeof raw.extra === 'object' && !Array.isArray(raw.extra) ? raw.extra : {},
      elapsedSeconds,
    };
  });
}
