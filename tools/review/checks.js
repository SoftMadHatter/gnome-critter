// Checks for the review page: structure of a pack's achievement library
// (errors), text quality (warnings), and, outside of French, translations
// (the .po catalog and packs' `translations` section). Pure module, used
// by the "Checks" tab and tested under Node (tests/review.test.js).

import { CATEGORIES, PLAYER_CATEGORY } from '../../core/achievements.js';
import { announceUnlock } from '../../core/narrator.js';
import { missingTranslations, translationsOverrides } from '../../core/packTranslations.js';

export const LIMITS = Object.freeze({
  name: 45,
  description: 90,
  quip: 170,
  notification: 320,
  minTitles: 20,
  minTrollShare: 0.4,
});

/** Words in a title that vary by gender (creatures don't have one). */
const GENDERED_WORDS = new Set([
  'roi', 'reine', 'maître', 'maîtresse', 'ami', 'amie', 'prince', 'princesse', 'martyr', 'martyre',
  'chasseur', 'chasseuse', 'voyageur', 'voyageuse', 'champion', 'championne', 'héros', 'héroïne',
  'fou', 'folle', 'dieu', 'déesse', 'seigneur', 'dame', 'fêtard', 'fêtarde', 'gourmand', 'gourmande',
  'paresseux', 'paresseuse', 'joueur', 'joueuse', 'petit', 'petite', 'grand', 'grande',
]);

const SPACE = '[\\s\\u00a0\\u202f]';

/** French typography issues in a text (spaces, quotes, ellipsis). */
export function typographyIssues(text) {
  if (typeof text !== 'string' || text === '') return [];
  const issues = [];
  const missingSpace = text.match(new RegExp(`[^\\s\\u00a0\\u202f([«][?!:;]`, 'u'));
  if (missingSpace) issues.push(`espace manquante avant « ${missingSpace[0].slice(-1)} »`);
  if (new RegExp(`«(?!${SPACE})`, 'u').test(text)) issues.push('espace manquante après « « »');
  if (new RegExp(`(?<!${SPACE})»`, 'u').test(text)) issues.push('espace manquante avant « » »');
  if (/ {2,}/.test(text)) issues.push('espaces en double');
  if (/\.\.\./.test(text)) issues.push('« ... » au lieu de « … »');
  if (/^\s|\s$/.test(text)) issues.push('espace en début ou en fin');
  return issues;
}

/** Gendered words in a title. */
export function genderedWords(title) {
  return title
    .toLowerCase()
    .split(/[^\p{L}-]+/u)
    .filter((word) => GENDERED_WORDS.has(word));
}

/**
 * Checks for a prepared pack (see data.js: `all`, `ignored`...).
 * @returns {{level: 'error'|'warning', id: string|null, message: string}[]}
 */
export function checkPack(pack) {
  const issues = [];
  const error = (id, message) => issues.push({ level: 'error', id, message });
  const warn = (id, message) => issues.push({ level: 'warning', id, message });
  const all = pack.all;

  // Structure (the same rules as tests/packs.test.js).
  for (const id of pack.ignored) error(id, 'entrée rejetée par buildAchievements (format, stat, récompense...)');
  const trolls = all.filter((def) => def.troll).length;
  if (all.length > 0 && trolls / all.length < LIMITS.minTrollShare) {
    error(null, `${trolls} bêtises sur ${all.length} : moins de ${LIMITS.minTrollShare * 100} %`);
  }
  for (const category of [...CATEGORIES, PLAYER_CATEGORY]) {
    if (!all.some((def) => def.category === category)) error(null, `rubrique vide : ${category}`);
  }
  const titled = all.filter((def) => def.title);
  if (titled.length < LIMITS.minTitles) warn(null, `${titled.length} titres seulement (au moins ${LIMITS.minTitles} attendus)`);
  const conditions = new Map();
  for (const def of all) {
    const key = JSON.stringify([def.scope, def.condition, def.requires.trait, def.requires.stage]);
    if (conditions.has(key)) error(def.id, `même condition que « ${conditions.get(key)} »`);
    else conditions.set(key, def.id);
  }

  // Text.
  const firstSeen = { name: new Map(), title: new Map(), quip: new Map() };
  for (const def of all) {
    for (const [field, text] of [['name', def.name], ['description', def.description], ['quip', def.quip], ['title', def.title]]) {
      for (const issue of typographyIssues(text)) warn(def.id, `${field} : ${issue}`);
    }
    for (const field of ['name', 'title', 'quip']) {
      const text = def[field];
      if (!text) continue;
      const seen = firstSeen[field];
      if (seen.has(text) && !(field === 'title' && def.series && seen.get(text).series === def.series)) {
        warn(def.id, `${field} déjà utilisé par « ${seen.get(text).id} » : ${text}`);
      } else if (!seen.has(text)) {
        seen.set(text, def);
      }
    }
    if (def.name.length > LIMITS.name) warn(def.id, `nom long (${def.name.length} caractères)`);
    if (def.description.length > LIMITS.description) warn(def.id, `description longue (${def.description.length} caractères)`);
    if (def.quip && def.quip.length > LIMITS.quip) warn(def.id, `commentaire long (${def.quip.length} caractères)`);
    if (def.title) {
      const words = genderedWords(def.title);
      if (words.length > 0) warn(def.id, `titre genré (« ${words.join(' », « ')} ») : ${def.title}`);
    }
    const longest = Math.max(
      ...[0, 0.5, 0.999].map((r) => announceUnlock({ def, who: 'Pistache', outcome: { paid: true, box: { text: 'rien' } }, random: () => r }).body.length),
    );
    if (longest > LIMITS.notification) warn(def.id, `notification longue (${longest} caractères)`);
  }

  // Series whose tiers all have the same description ({n} forgotten in the template).
  const series = new Map();
  for (const def of all) {
    if (!def.series) continue;
    if (!series.has(def.series)) series.set(def.series, []);
    series.get(def.series).push(def);
  }
  for (const [name, tiers] of series) {
    if (tiers.length > 1 && new Set(tiers.map((def) => def.description)).size < tiers.length) {
      warn(tiers[0].id, `série « ${name} » : descriptions identiques d'un palier à l'autre ({n} manquant ?)`);
    }
  }
  return issues;
}

/** A text's named placeholders, sorted, without `{s}` (the plural marker in descriptions, free per language). */
export function placeholders(text) {
  return [...new Set(text.match(/\{\w+\}/g) ?? [])].filter((p) => p !== '{s}').sort();
}

const samePlaceholders = (a, b) => placeholders(a).join() === placeholders(b).join();

/** French phrases kept as-is in other languages. */
const KEPT_AS_IS = ['Bon appétit'];

/** Whether a text looks like it stayed in French: accents, French quotes, common short words. */
export function looksFrench(text) {
  const rest = KEPT_AS_IS.reduce((out, phrase) => out.replaceAll(phrase, ''), text);
  return /[àâçéèêëîïôûùüÿœæ«»]|\b(le|la|les|des|du|une?|et|est|pas|il|tu|ta|tes|fois|avec|dans|sur|aux?)\b/i.test(rest);
}

/**
 * Checks for a catalog read by parsePo (a language other than French).
 * @returns {{level: 'error'|'warning'|'info', id: string, message: string}[]} `id`: the source text
 */
export function checkCatalog({ entries }) {
  const issues = [];
  for (const entry of entries) {
    const id = entry.msgid;
    const add = (level, message) => issues.push({ level, id, message });
    if (entry.flags.includes('fuzzy')) add('warning', 'entrée floue : à relire (gettext l’ignore)');
    if (entry.msgstr.length === 0 || entry.msgstr.some((text) => !text)) {
      add('warning', 'non traduit');
      continue;
    }
    for (const text of entry.msgstr) {
      if (!samePlaceholders(entry.msgid, text)) add('error', `espaces réservés différents : ${text}`);
      if (/[«»]| [!?:;]/.test(text)) add('warning', `typographie française : ${text}`);
    }
    if (entry.msgidPlural === null && entry.msgstr[0] === entry.msgid) add('info', 'identique au français');
  }
  return issues;
}

/**
 * Checks for the translation of a pack displayed outside of French (see
 * data.js: `raw`, `lang`, `french`): the pack's `translations` section,
 * text left in French, notification length in the language.
 * @returns {{level: 'error'|'warning', id: string|null, message: string}[]}
 */
export function checkTranslations(pack) {
  const issues = [];
  const error = (id, message) => issues.push({ level: 'error', id, message });
  const warn = (id, message) => issues.push({ level: 'warning', id, message });
  const { lang, raw } = pack;
  const { languages, ignored } = translationsOverrides(raw.translations);
  for (const key of ignored) warn(null, `pack.json, section translations : « ${key} » ignorée (format invalide)`);
  for (const path of missingTranslations(raw, lang)) warn(null, `pack.json : traduction « ${lang} » manquante (${path})`);
  const section = languages[lang]?.achievements ?? {};
  for (const entry of Array.isArray(raw.achievements) ? raw.achievements : []) {
    const key = entry?.series ?? entry?.id;
    const texts = section[key];
    if (!texts) continue;
    for (const field of ['name', 'description', 'quip', 'title']) {
      if (typeof entry[field] === 'string' && typeof texts[field] === 'string' && !samePlaceholders(entry[field], texts[field])) {
        error(key, `pack.json, ${field} (${lang}) : espaces réservés différents du français`);
      }
    }
    for (const field of ['names', 'descriptions', 'quips']) {
      (texts[field] ?? []).forEach((text, i) => {
        const source = entry[field]?.[i];
        if (text && source && !samePlaceholders(source, text)) error(key, `pack.json, ${field}[${i}] (${lang}) : espaces réservés différents`);
      });
    }
  }
  const french = new Map((pack.french?.all ?? []).map((def) => [def.id, def]));
  for (const def of pack.all) {
    for (const field of ['name', 'description', 'quip', 'title']) {
      const text = def[field];
      if (text && looksFrench(text)) warn(def.id, `${field} resté en français ? ${text}`);
    }
    if (!french.has(def.id)) continue;
    const longest = Math.max(
      ...[0, 0.5, 0.999].map((r) => announceUnlock({ def, who: 'Pistache', outcome: { paid: true, box: { text: '' } }, random: () => r }).body.length),
    );
    if (longest > LIMITS.notification) warn(def.id, `notification longue en « ${lang} » (${longest} caractères)`);
  }
  return issues;
}
