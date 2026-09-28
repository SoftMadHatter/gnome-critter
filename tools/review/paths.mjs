// Address -> file mapping for the review tool. Sources are served with the
// repo's layout (tools/review modules import the core via `../../core/...`,
// as under Node), plus two aliases that mimic the package built by
// scripts/build.sh: extension/lib modules import `../core/...` and
// `../packs/...`. The po/*.po catalogs serve the language choice.

import { join, sep } from 'node:path';

/** Served prefixes -> repo folder (most specific first). */
export const ROUTES = Object.freeze([
  ['/extension/core/', 'core'],
  ['/extension/packs/', 'packs'],
  ['/extension/lib/', 'extension/lib'],
  ['/extension/assets/', 'extension/assets'],
  ['/core/', 'core'],
  ['/packs/', 'packs'],
  ['/po/', 'po'],
  ['/tools/review/', 'tools/review'],
]);

/** Address of the tool's home page. */
export const HOME = '/tools/review/';

/**
 * Repo file served for `pathname`, or null (unknown prefix, directory
 * traversal, unreadable address).
 * @param {string} root repo root
 * @param {string} pathname the address's path, without the query
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
