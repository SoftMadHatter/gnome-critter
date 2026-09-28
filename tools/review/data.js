// Data for the review page: packs, achievements expanded the way the game
// computes them (speciesProfile + buildAchievements), origin and source
// template of every achievement. Outside of French, the po/<language>.po
// catalog is plugged in and every pack is localized (`translations`
// section); the French version stays available for source-text checks.

import { buildAchievements, speciesProfile } from '../../core/achievements.js';
import { LIBRARY } from '../../core/achievementLibrary.js';
import { LANGUAGES, setTranslator } from '../../core/i18n.js';
import { localizePack } from '../../core/packTranslations.js';
import { templateKey } from './format.js';
import { parsePo, translatorFrom } from './po.js';

async function fetchOk(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response;
}

const fetchJson = async (url) => (await fetchOk(url)).json();

/**
 * A pack ready to review, in the active translator's language.
 * @param {string} id
 * @param {object} raw pack.json as written (source text in French)
 * @param {Set<string>} files the pack's files (relative paths)
 * @param {string} [lang] display language (`fr`, `en`)
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
    /** An achievement's origin: 'library', 'pack' (specific to the pack), or 'override' (library entry replaced by the pack). */
    origin(def) {
      const key = keyOf(def);
      if (!own.has(key)) return 'library';
      return library.has(key) ? 'override' : 'pack';
    },
    /** An achievement's source template (pack or library entry, in French). */
    source(def) {
      const key = keyOf(def);
      return own.get(key) ?? library.get(key);
    },
  };
}

/**
 * Loads every pack served by the review server.
 * @param {string} [lang] display language; outside of French, every pack keeps
 *   its French version in `french` and the loaded catalog is returned in `catalog`
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
