// Sauvegarde/restauration de l'état des critters : fonctions pures (le
// stockage lui-même, une clé GSettings, est dans extension/lib/manager.js).
// Le format est versionné et porte un objet `extra` par critter, réservé aux
// futurs besoins (humeur, faim...) sans casser les sauvegardes existantes.

export const SAVE_VERSION = 1;

/**
 * @param {string} packId
 * @param {{serialize: () => object}[]} critters
 * @returns {string} JSON
 */
export function serializeCritters(packId, critters) {
  return JSON.stringify({
    version: SAVE_VERSION,
    packId,
    critters: critters.map((c) => c.serialize()),
  });
}

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/**
 * Lit une sauvegarde sans jamais lever d'exception.
 * @param {string} text
 * @param {{packId: string, bounds: {x:number,y:number,width:number,height:number}}} context
 * @returns {{x:number, y:number, facing:1|-1, extra:object}[]} vide si la
 *   sauvegarde est absente, invalide, d'une autre version ou d'un autre pack
 */
export function parseSavedState(text, { packId, bounds }) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (data?.version !== SAVE_VERSION || data.packId !== packId || !Array.isArray(data.critters)) {
    return [];
  }

  const result = [];
  for (const raw of data.critters) {
    if (!raw || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)) continue;
    result.push({
      x: clamp(raw.x, bounds.x, bounds.x + bounds.width),
      y: clamp(raw.y, bounds.y, bounds.y + bounds.height),
      facing: raw.facing === -1 ? -1 : 1,
      extra: raw.extra && typeof raw.extra === 'object' && !Array.isArray(raw.extra) ? raw.extra : {},
    });
  }
  return result;
}
