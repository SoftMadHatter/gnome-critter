// Données de la page de revue : packs, succès développés comme le jeu les
// calcule (speciesProfile + buildAchievements), origine et gabarit source de
// chaque succès.

import { buildAchievements, speciesProfile } from '../../core/achievements.js';
import { LIBRARY } from '../../core/achievementLibrary.js';
import { templateKey } from './format.js';

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} : ${response.status} ${response.statusText}`);
  return response.json();
}

/**
 * Un pack prêt à relire.
 * @param {string} id
 * @param {object} meta pack.json
 * @param {Set<string>} files fichiers du pack (chemins relatifs)
 */
export function preparePack(id, meta, files) {
  const profile = speciesProfile(meta);
  const { critter, player, ignored } = buildAchievements(meta.achievements, profile);
  const library = new Map(LIBRARY.map((entry) => [templateKey(entry), entry]));
  const own = new Map(
    (Array.isArray(meta.achievements) ? meta.achievements : []).filter(Boolean).map((entry) => [templateKey(entry), entry]),
  );
  const keyOf = (def) => (def.series ? `s:${def.series}` : `i:${def.id}`);
  return {
    id,
    meta,
    files,
    profile,
    critter,
    player,
    all: [...critter, ...player],
    ignored,
    /** Origine d'un succès : 'library', 'pack' (propre au pack) ou 'override' (bibliothèque remplacée par le pack). */
    origin(def) {
      const key = keyOf(def);
      if (!own.has(key)) return 'library';
      return library.has(key) ? 'override' : 'pack';
    },
    /** Gabarit source (entrée du pack ou de la bibliothèque) d'un succès. */
    source(def) {
      const key = keyOf(def);
      return own.get(key) ?? library.get(key);
    },
  };
}

/** Charge tous les packs servis par le serveur de revue. */
export async function loadData() {
  const ids = await fetchJson('/api/packs');
  const packs = {};
  for (const id of ids) {
    const meta = await fetchJson(`/packs/${id}/pack.json`);
    const files = new Set(await fetchJson(`/api/files?pack=${encodeURIComponent(id)}`));
    packs[id] = preparePack(id, meta, files);
  }
  return { ids, packs };
}
