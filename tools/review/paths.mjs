// Correspondance adresse -> fichier de l'outil de revue. Les sources sont
// servies avec la disposition du dépôt (les modules de tools/review importent
// le cœur par `../../core/...`, comme sous Node), plus deux alias qui imitent
// le paquet construit par scripts/build.sh : les modules de extension/lib
// importent `../core/...` et `../packs/...`.

import { join, sep } from 'node:path';

/** Préfixes servis -> dossier du dépôt (le plus spécifique d'abord). */
export const ROUTES = Object.freeze([
  ['/extension/core/', 'core'],
  ['/extension/packs/', 'packs'],
  ['/extension/lib/', 'extension/lib'],
  ['/extension/assets/', 'extension/assets'],
  ['/core/', 'core'],
  ['/packs/', 'packs'],
  ['/tools/review/', 'tools/review'],
]);

/** Adresse de la page d'accueil de l'outil. */
export const HOME = '/tools/review/';

/**
 * Fichier du dépôt servi pour `pathname`, ou null (préfixe inconnu, remontée
 * de répertoire, adresse illisible).
 * @param {string} root racine du dépôt
 * @param {string} pathname chemin de l'adresse, sans la requête
 * @returns {string|null}
 */
export function resolvePath(root, pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (path.includes('\0') || path.includes('\\')) return null;
  const route = ROUTES.find(([prefix]) => path.startsWith(prefix));
  if (!route) return null;
  const [prefix, dir] = route;
  let rest = path.slice(prefix.length);
  if (rest === '' && prefix === HOME) rest = 'index.html';
  const segments = rest.split('/');
  if (rest === '' || segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  const base = join(root, dir);
  const file = join(base, ...segments);
  return file.startsWith(base + sep) ? file : null;
}
