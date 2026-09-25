// Contrôles de la page de revue : structure de la bibliothèque de succès
// d'un pack (erreurs) et qualité des textes (avertissements). Module pur,
// utilisé par l'onglet « Contrôles » et testé sous Node (tests/review.test.js).

import { CATEGORIES, TROLL_CATEGORY, PLAYER_CATEGORY } from '../../core/achievements.js';
import { announceUnlock } from '../../core/narrator.js';

export const LIMITS = Object.freeze({
  name: 45,
  description: 90,
  quip: 170,
  notification: 320,
  minTitles: 20,
  minTrollShare: 0.4,
});

/** Mots d'un titre qui varient selon le genre (les créatures n'en ont pas). */
const GENDERED_WORDS = new Set([
  'roi', 'reine', 'maître', 'maîtresse', 'ami', 'amie', 'prince', 'princesse', 'martyr', 'martyre',
  'chasseur', 'chasseuse', 'voyageur', 'voyageuse', 'champion', 'championne', 'héros', 'héroïne',
  'fou', 'folle', 'dieu', 'déesse', 'seigneur', 'dame', 'fêtard', 'fêtarde', 'gourmand', 'gourmande',
  'paresseux', 'paresseuse', 'joueur', 'joueuse', 'petit', 'petite', 'grand', 'grande',
]);

const SPACE = '[\\s\\u00a0\\u202f]';

/** Problèmes de typographie française d'un texte (espaces, guillemets, points de suspension). */
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

/** Mots genrés d'un titre. */
export function genderedWords(title) {
  return title
    .toLowerCase()
    .split(/[^\p{L}-]+/u)
    .filter((word) => GENDERED_WORDS.has(word));
}

/**
 * Contrôles d'un pack préparé (voir data.js : `all`, `ignored`...).
 * @returns {{level: 'error'|'warning', id: string|null, message: string}[]}
 */
export function checkPack(pack) {
  const issues = [];
  const error = (id, message) => issues.push({ level: 'error', id, message });
  const warn = (id, message) => issues.push({ level: 'warning', id, message });
  const all = pack.all;

  // Structure (les mêmes règles que tests/packs.test.js).
  for (const id of pack.ignored) error(id, 'entrée rejetée par buildAchievements (format, stat, récompense...)');
  const trolls = all.filter((def) => def.troll).length;
  if (all.length > 0 && trolls / all.length < LIMITS.minTrollShare) {
    error(null, `${trolls} bêtises sur ${all.length} : moins de ${LIMITS.minTrollShare * 100} %`);
  }
  for (const category of [...CATEGORIES, TROLL_CATEGORY, PLAYER_CATEGORY]) {
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

  // Textes.
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

  // Séries dont tous les paliers ont la même description ({n} oublié dans le gabarit).
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
