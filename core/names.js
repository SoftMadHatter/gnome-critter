// Creature names: sanitizing, per-species lists, uniqueness. Pure module.

import { language } from './i18n.js';

export const MAX_NAME_LENGTH = 24;

/** Fallback names when the pack doesn't provide any, by language (French by default). */
export const GENERIC_NAMES_BY_LANGUAGE = Object.freeze({
  fr: Object.freeze([
    'Pixel', 'Nougat', 'Biscotte', 'Praline', 'Mochi', 'Cannelle', 'Pistache', 'Réglisse',
    'Truffe', 'Noisette', 'Caramel', 'Bulle', 'Filou', 'Poucet', 'Zéphyr', 'Lutin',
  ]),
  en: Object.freeze([
    'Pixel', 'Nugget', 'Biscuit', 'Praline', 'Mochi', 'Cinnamon', 'Pistachio', 'Licorice',
    'Truffle', 'Hazel', 'Caramel', 'Bubble', 'Rascal', 'Peanut', 'Zephyr', 'Sprite',
  ]),
});

/** Fallback names in the displayed language. */
export function genericNames() {
  return GENERIC_NAMES_BY_LANGUAGE[language()] ?? GENERIC_NAMES_BY_LANGUAGE.fr;
}

/** Fallback names in French (compatibility). */
export const GENERIC_NAMES = GENERIC_NAMES_BY_LANGUAGE.fr;

/**
 * Sanitizes an entered name: control characters removed, spaces collapsed,
 * length capped.
 * @param {unknown} text
 * @returns {string|null} null if nothing usable is left
 */
export function sanitizeName(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned === '' ? null : cleaned;
}

/**
 * Validates the `names` section of a pack.json: a list of names.
 * @param {unknown} raw
 * @returns {{list: string[], ignored: string[]}}
 */
export function namesOverrides(raw) {
  if (raw === undefined) return { list: [], ignored: [] };
  if (!Array.isArray(raw)) return { list: [], ignored: ['names'] };
  const list = [];
  const ignored = [];
  const seen = new Set();
  for (const entry of raw) {
    const name = sanitizeName(entry);
    if (name === null || name !== entry || seen.has(name.toLowerCase())) {
      ignored.push(String(entry));
      continue;
    }
    seen.add(name.toLowerCase());
    list.push(name);
  }
  return { list, ignored };
}

const norm = (name) => name.toLowerCase();

/**
 * Makes a name unique among those already taken (case-insensitive) by
 * appending a number: "Moka", "Moka 2", "Moka 3".
 * @param {string} name
 * @param {string[]} taken
 */
export function uniqueName(name, taken) {
  const used = new Set(taken.map(norm));
  if (!used.has(norm(name))) return name;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = `${name.slice(0, MAX_NAME_LENGTH - suffix.length).trim()}${suffix}`;
    if (!used.has(norm(candidate))) return candidate;
  }
}

/**
 * Draws a name from the species' list (or the generic list), avoiding
 * names already taken; if all are taken, numbers one.
 * @param {() => number} random
 * @param {string[]} pool
 * @param {string[]} taken
 */
export function pickName(random, pool, taken) {
  const source = pool.length > 0 ? pool : genericNames();
  const used = new Set(taken.map(norm));
  const free = source.filter((name) => !used.has(norm(name)));
  if (free.length > 0) return free[Math.min(free.length - 1, Math.floor(random() * free.length))];
  return uniqueName(source[Math.min(source.length - 1, Math.floor(random() * source.length))], taken);
}
