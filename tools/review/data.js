// Données de la page de revue : packs, succès développés comme le jeu les
// calcule (speciesProfile + buildAchievements), origine et gabarit source de
// chaque succès. Hors du français, le catalogue po/<langue>.po est branché
// et chaque pack est localisé (section `translations`) ; la version
// française reste disponible pour les contrôles des textes source.

import { buildAchievements, speciesProfile } from '../../core/achievements.js';
import { LIBRARY } from '../../core/achievementLibrary.js';
import { LANGUAGES, setTranslator } from '../../core/i18n.js';
import { localizePack } from '../../core/packTranslations.js';
import { templateKey } from './format.js';
import { parsePo, translatorFrom } from './po.js';

async function fetchOk(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} : ${response.status} ${response.statusText}`);
  return response;
}

const fetchJson = async (url) => (await fetchOk(url)).json();

/**
 * Un pack prêt à relire, dans la langue du traducteur actif.
 * @param {string} id
 * @param {object} raw pack.json tel qu'écrit (textes source en français)
 * @param {Set<string>} files fichiers du pack (chemins relatifs)
 * @param {string} [lang] langue d'affichage (`fr`, `en`)
 */
export function preparePack(id, raw, files, lang = 'fr') {
  const meta = localizePack(raw, lang);
  const profile = speciesProfile(meta);
  const { critter, player, ignored } = buildAchievements(meta.achievements, profile);
  const library = new Map(LIBRARY.map((entry) => [templateKey(entry), entry]));
  const own = new Map(
    (Array.isArray(raw.achievements) ? raw.achievements : []).filter(Boolean).map((entry) => [templateKey(entry), entry]),
  );
  const keyOf = (def) => (def.series ? `s:${def.series}` : `i:${def.id}`);
  return {
    id,
    lang,
    meta,
    raw,
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
    /** Gabarit source (entrée du pack ou de la bibliothèque, en français) d'un succès. */
    source(def) {
      const key = keyOf(def);
      return own.get(key) ?? library.get(key);
    },
  };
}

/**
 * Charge tous les packs servis par le serveur de revue.
 * @param {string} [lang] langue d'affichage ; hors du français, chaque pack garde
 *   sa version française dans `french` et le catalogue lu est rendu dans `catalog`
 */
export async function loadData(lang = 'fr') {
  if (!LANGUAGES.includes(lang)) lang = 'fr';
  const ids = await fetchJson('/api/packs');
  const sources = {};
  for (const id of ids) {
    sources[id] = {
      raw: await fetchJson(`/packs/${id}/pack.json`),
      files: new Set(await fetchJson(`/api/files?pack=${encodeURIComponent(id)}`)),
    };
  }
  setTranslator();
  const french = Object.fromEntries(ids.map((id) => [id, preparePack(id, sources[id].raw, sources[id].files)]));
  if (lang === 'fr') return { ids, lang, packs: french, catalog: null };
  const catalog = parsePo(await (await fetchOk(`/po/${lang}.po`)).text());
  setTranslator(translatorFrom(catalog, lang));
  const packs = Object.fromEntries(
    ids.map((id) => [id, { ...preparePack(id, sources[id].raw, sources[id].files, lang), french: french[id] }]),
  );
  return { ids, lang, packs, catalog };
}
