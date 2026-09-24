// Noms des créatures : nettoyage, listes par espèce, unicité. Module pur.

export const MAX_NAME_LENGTH = 24;

/** Prénoms de repli quand le pack n'en fournit pas. */
export const GENERIC_NAMES = Object.freeze([
  'Pixel', 'Nougat', 'Biscotte', 'Praline', 'Mochi', 'Cannelle', 'Pistache', 'Réglisse',
  'Truffe', 'Noisette', 'Caramel', 'Bulle', 'Filou', 'Poucet', 'Zéphyr', 'Lutin',
]);

/**
 * Nettoie un nom saisi : caractères de contrôle retirés, espaces repliés,
 * longueur limitée.
 * @param {unknown} text
 * @returns {string|null} null si rien de valable ne reste
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
 * Valide la section `names` d'un pack.json : liste de noms.
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
 * Rend un nom unique parmi ceux déjà pris (insensible à la casse) en ajoutant
 * un numéro : « Moka », « Moka 2 », « Moka 3 ».
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
 * Tire un nom dans la liste de l'espèce (ou la liste générique), en évitant
 * les noms pris ; si tous le sont, en numérote un.
 * @param {() => number} random
 * @param {string[]} pool
 * @param {string[]} taken
 */
export function pickName(random, pool, taken) {
  const source = pool.length > 0 ? pool : GENERIC_NAMES;
  const used = new Set(taken.map(norm));
  const free = source.filter((name) => !used.has(norm(name)));
  if (free.length > 0) return free[Math.min(free.length - 1, Math.floor(random() * free.length))];
  return uniqueName(source[Math.min(source.length - 1, Math.floor(random() * source.length))], taken);
}
