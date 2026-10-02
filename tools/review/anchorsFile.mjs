// Review tool (dev): rewrites the "anchors" block of a pack.json, and only
// that block, in a compact layout (one line per animation). Used by the
// anchor editor through server.mjs (the one write the tool allows itself).

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { anchorsOverrides } from '../../core/accessories.js';

const inline = (value) => {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{ ${Object.entries(value).map(([key, v]) => `${JSON.stringify(key)}: ${inline(v)}`).join(', ')} }`;
  }
  return JSON.stringify(value);
};

const TABLES = ['animations', 'reactions'];
const NESTED = ['base', 'stages', 'baby', 'young', 'senior'];

/** The lines of `"key": value`, tables and nested blocks spread over several lines, anything else on one. */
function entryLines(key, value, depth, comma) {
  const pad = '  '.repeat(depth);
  const isBlock = value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
  if (isBlock && (TABLES.includes(key) || NESTED.includes(key))) {
    const rows = Object.entries(value);
    const inner = rows.flatMap(([name, entry], j) => {
      const last = j === rows.length - 1 ? '' : ',';
      return TABLES.includes(key) ? [`${pad}  ${JSON.stringify(name)}: ${inline(entry)}${last}`] : entryLines(name, entry, depth + 1, last);
    });
    return [`${pad}${JSON.stringify(key)}: {`, ...inner, `${pad}}${comma}`];
  }
  return [`${pad}${JSON.stringify(key)}: ${inline(value)}${comma}`];
}

/**
 * The block's text, indented for a top-level key of pack.json.
 * @param {object} anchors the section, in the pack's own format (see anchorsOverrides)
 */
export function formatAnchors(anchors) {
  const entries = Object.entries(anchors);
  const lines = entries.flatMap(([key, value], i) => entryLines(key, value, 2, i < entries.length - 1 ? ',' : ''));
  return `  "anchors": {\n${lines.join('\n')}\n  }`;
}

/**
 * pack.json's text with its "anchors" block replaced (added at the end if
 * absent); everything else is kept byte for byte.
 * @returns {string}
 */
export function replaceAnchors(text, anchors) {
  const block = formatAnchors(anchors);
  const start = text.search(/^ {2}"anchors": \{/m);
  let result;
  if (start >= 0) {
    let depth = 0;
    let end = -1;
    for (let i = text.indexOf('{', start); i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end < 0) throw new Error('Unbalanced "anchors" block');
    result = text.slice(0, start) + block + text.slice(end);
  } else {
    const close = text.lastIndexOf('}');
    const before = text.slice(0, close).replace(/\s+$/, '');
    result = `${before},\n${block}\n${text.slice(close)}`;
  }
  JSON.parse(result); // never write a broken file
  return result;
}

/**
 * Problems that make an `anchors` section unfit to write (empty if fine):
 * invalid entries, unknown animations or reactions, wrong frame counts (in
 * the touch-ups, the generated `base` and each stage's tables).
 * @param {object} raw the section as sent by the editor
 * @param {object} meta the pack's pack.json
 * @returns {string[]}
 */
export function anchorsProblems(raw, meta) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['anchors must be an object'];
  const { anchors, ignored } = anchorsOverrides(raw);
  const problems = ignored.map((key) => `invalid: ${key}`);
  const check = (tables, prefix) => {
    for (const [table, defs] of [['animations', meta.animations ?? {}], ['reactions', meta.reactions ?? {}]]) {
      for (const [name, entry] of Object.entries(tables[table])) {
        if (!defs[name]) problems.push(`unknown ${prefix}${table}.${name}`);
        else if (entry.points.length !== 1 && entry.points.length !== defs[name].frames) {
          problems.push(`${prefix}${table}.${name}: ${entry.points.length} points for ${defs[name].frames} frames`);
        }
      }
    }
  };
  check(anchors, '');
  check(anchors.base, 'base.');
  for (const [stage, block] of Object.entries(anchors.stages)) {
    check(block, `stages.${stage}.`);
    check(block.base, `stages.${stage}.base.`);
  }
  return problems;
}

/**
 * Validates then writes the `anchors` section of packs/<id>/pack.json.
 * @param {string} root repo root
 * @param {string} id pack folder name
 * @param {object} raw
 * @returns {Promise<string[]>} problems (nothing written if not empty)
 */
export async function saveAnchors(root, id, raw) {
  if (!/^[a-z0-9-]+$/.test(id)) return ['invalid pack'];
  const path = join(root, 'packs', id, 'pack.json');
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return ['unknown pack'];
  }
  const problems = anchorsProblems(raw, JSON.parse(text));
  if (problems.length === 0) await writeFile(path, replaceAnchors(text, raw));
  return problems;
}
