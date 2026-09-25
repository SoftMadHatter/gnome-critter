// Lecteur de catalogues gettext (.po) en JavaScript, pour les tests et
// l'outil de revue (l'extension, elle, lit les .mo compilés par msgfmt via
// le gettext de GNOME). Module pur, utilisable sous Node et dans le navigateur.

function unescape(text) {
  return text.replace(/\\(.)/g, (_match, c) => ({ n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' })[c] ?? c);
}

function unquote(value) {
  const match = value.match(/^"(.*)"$/);
  if (!match) throw new Error(`chaîne .po mal formée : ${value}`);
  return unescape(match[1]);
}

const newEntry = () => ({ msgctxt: null, msgid: null, msgidPlural: null, msgstr: [], flags: [], comments: [] });

/**
 * Lit un catalogue .po.
 * @returns {{headers: Record<string, string>, entries: {msgctxt: string|null, msgid: string, msgidPlural: string|null,
 *   msgstr: string[], flags: string[], comments: string[]}[]}} entrées hors en-tête, sans les obsolètes (#~)
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
    if (line.startsWith('#~')) continue; // entrée obsolète
    if (line.startsWith('#')) {
      if (field && field.startsWith('msgstr')) flush(); // commentaire de l'entrée suivante
      if (line.startsWith('#,')) entry.flags.push(...line.slice(2).split(',').map((flag) => flag.trim()).filter(Boolean));
      else entry.comments.push(line);
      continue;
    }
    const match = line.match(/^(msgctxt|msgid_plural|msgid|msgstr)(?:\[(\d+)\])?\s+(".*")$/);
    if (match) {
      const [, key, idx, value] = match;
      if ((key === 'msgid' || key === 'msgctxt') && field && field !== 'msgctxt') flush(); // entrée suivante sans ligne vide
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
    throw new Error(`ligne .po illisible : ${raw}`);
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

/** Règle de pluriel d'un en-tête Plural-Forms (celles du français et de l'anglais ; anglais par défaut). */
export function pluralRule(pluralForms = '') {
  const expression = (pluralForms.match(/plural\s*=\s*([^;]+)/)?.[1] ?? 'n != 1').replace(/\s+/g, '');
  if (/^\(?n>1\)?$/.test(expression)) return (n) => (n > 1 ? 1 : 0);
  return (n) => (n !== 1 ? 1 : 0);
}

/**
 * Traducteur (pour `setTranslator` de core/i18n.js) tiré d'un catalogue lu :
 * les entrées floues ou vides ne traduisent pas (le texte source reste).
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
      return n > 1 ? plural : singular; // non traduit : le français, avec sa règle
    },
  };
}
