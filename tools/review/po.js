// A gettext (.po) catalog reader in JavaScript, for the tests and the
// review tool (the extension itself reads the .mo files compiled by
// msgfmt via GNOME's gettext). Pure module, usable under Node and in the browser.

function unescape(text) {
  return text.replace(/\\(.)/g, (_match, c) => ({ n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' })[c] ?? c);
}

function unquote(value) {
  const match = value.match(/^"(.*)"$/);
  if (!match) throw new Error(`malformed .po string: ${value}`);
  return unescape(match[1]);
}

const newEntry = () => ({ msgctxt: null, msgid: null, msgidPlural: null, msgstr: [], flags: [], comments: [] });

/**
 * Reads a .po catalog.
 * @returns {{headers: Record<string, string>, entries: {msgctxt: string|null, msgid: string, msgidPlural: string|null,
 *   msgstr: string[], flags: string[], comments: string[]}[]}} entries excluding the header, without obsolete ones (#~)
 */
export function parsePo(text) {
  const entries = [];
  let entry = newEntry();
  let field = null;
  let index = 0;
  const flush = () => {
    if (entry.msgid !== null) entries.push(entry);
    entry = newEntry();
    field = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') {
      flush();
      continue;
    }
    if (line.startsWith('#~')) continue; // obsolete entry
    if (line.startsWith('#')) {
      if (field && field.startsWith('msgstr')) flush(); // the next entry's comment
      if (line.startsWith('#,')) entry.flags.push(...line.slice(2).split(',').map((flag) => flag.trim()).filter(Boolean));
      else entry.comments.push(line);
      continue;
    }
    const match = line.match(/^(msgctxt|msgid_plural|msgid|msgstr)(?:\[(\d+)\])?\s+(".*")$/);
    if (match) {
      const [, key, idx, value] = match;
      if ((key === 'msgid' || key === 'msgctxt') && field && field !== 'msgctxt') flush(); // next entry with no blank line
      field = key;
      index = idx === undefined ? 0 : Number(idx);
      const text = unquote(value);
      if (key === 'msgctxt') entry.msgctxt = text;
      else if (key === 'msgid') entry.msgid = text;
      else if (key === 'msgid_plural') entry.msgidPlural = text;
      else entry.msgstr[index] = text;
      continue;
    }
    if (line.startsWith('"') && field) {
      const text = unquote(line);
      if (field === 'msgctxt') entry.msgctxt += text;
      else if (field === 'msgid') entry.msgid += text;
      else if (field === 'msgid_plural') entry.msgidPlural += text;
      else entry.msgstr[index] += text;
      continue;
    }
    throw new Error(`unreadable .po line: ${raw}`);
  }
  flush();
  const header = entries.find((e) => e.msgid === '' && e.msgctxt === null);
  const headers = {};
  for (const line of (header?.msgstr[0] ?? '').split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { headers, entries: entries.filter((e) => e.msgid !== '') };
}

/** Plural rule from a Plural-Forms header (French's and English's; English by default). */
export function pluralRule(pluralForms = '') {
  const expression = (pluralForms.match(/plural\s*=\s*([^;]+)/)?.[1] ?? 'n != 1').replace(/\s+/g, '');
  if (/^\(?n>1\)?$/.test(expression)) return (n) => (n > 1 ? 1 : 0);
  return (n) => (n !== 1 ? 1 : 0);
}

/**
 * A translator (for core/i18n.js's `setTranslator`) built from a loaded
 * catalog: fuzzy or empty entries don't translate (the source text stays).
 */
export function translatorFrom({ headers, entries }, language) {
  const singles = new Map();
  const plurals = new Map();
  for (const entry of entries) {
    if (entry.flags.includes('fuzzy')) continue;
    if (entry.msgidPlural !== null) plurals.set(entry.msgid, entry);
    else if (entry.msgstr[0]) singles.set(entry.msgid, entry.msgstr[0]);
  }
  const rule = pluralRule(headers['Plural-Forms']);
  return {
    language,
    gettext: (msgid) => singles.get(msgid) || msgid,
    ngettext: (singular, plural, n) => {
      const translated = plurals.get(singular)?.msgstr[rule(n)];
      if (translated) return translated;
      return n > 1 ? plural : singular; // not translated: French, with its own rule
    },
  };
}
