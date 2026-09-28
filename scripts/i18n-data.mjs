#!/usr/bin/env node
// Extracts the shared achievement library's text (core/achievementLibrary.js:
// names, descriptions, the Committee's comments, titles, reward text) into
// .pot format, for scripts/i18n.sh. This text is data, with no _() marker:
// buildAchievements translates it at build time (see docs/i18n.md). Tests
// reuse libraryTexts.

import { pathToFileURL } from 'node:url';
import { LIBRARY } from '../core/achievementLibrary.js';

/**
 * Text to translate from an achievement library.
 * @returns {Map<string, Set<string>>} msgid -> series or ids that use it
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

/** .pot catalog of the library's text. */
export function libraryPot(entries = libraryTexts()) {
  const out = [
    'msgid ""',
    'msgstr ""',
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
    '',
  ];
  for (const [text, ids] of entries) {
    out.push(`#. achievement: ${[...ids].join(', ')}`, '#: core/achievementLibrary.js', `msgid ${quote(text)}`, 'msgstr ""', '');
  }
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.stdout.write(libraryPot());
