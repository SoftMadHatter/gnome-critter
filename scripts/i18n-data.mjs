#!/usr/bin/env node
// Extraction des textes de la bibliothèque commune de succès
// (core/achievementLibrary.js : noms, descriptions, commentaires du Système,
// titres, textes de récompense) au format .pot, pour scripts/i18n.sh. Ces
// textes sont des données, sans marqueur _() : buildAchievements les traduit
// à la construction (voir docs/i18n.md). Les tests réutilisent libraryTexts.

import { pathToFileURL } from 'node:url';
import { LIBRARY } from '../core/achievementLibrary.js';

/**
 * Textes à traduire d'une bibliothèque de succès.
 * @returns {Map<string, Set<string>>} msgid -> séries ou identifiants qui l'utilisent
 */
export function libraryTexts(library = LIBRARY) {
  const entries = new Map();
  const add = (text, id) => {
    if (typeof text !== 'string' || text === '') return;
    if (!entries.has(text)) entries.set(text, new Set());
    entries.get(text).add(id);
  };
  for (const entry of library) {
    const id = entry.series ?? entry.id;
    add(entry.name, id);
    for (const name of entry.names ?? []) add(name, id);
    add(entry.description, id);
    for (const description of entry.descriptions ?? []) add(description, id);
    add(entry.quip, id);
    for (const quip of entry.quips ?? []) add(quip, id);
    add(entry.title, id);
    for (const reward of [].concat(entry.reward ?? [])) add(reward?.text, id);
  }
  return entries;
}

const quote = (text) => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`;

/** Catalogue .pot des textes de la bibliothèque. */
export function libraryPot(entries = libraryTexts()) {
  const out = [
    'msgid ""',
    'msgstr ""',
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
    '',
  ];
  for (const [text, ids] of entries) {
    out.push(`#. succès : ${[...ids].join(', ')}`, '#: core/achievementLibrary.js', `msgid ${quote(text)}`, 'msgstr ""', '');
  }
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.stdout.write(libraryPot());
