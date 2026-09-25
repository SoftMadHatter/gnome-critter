// Traductions portées par un pack (section `translations` de pack.json) :
// nom de l'espèce, prénoms, textes des succès propres au pack, par langue.
// Le français du pack est la langue source ; chaque champ absent y retombe.
// Module pur. Format décrit dans docs/pack-format.md.

const TEXT_FIELDS = ['name', 'description', 'quip', 'title'];
const LIST_FIELDS = ['names', 'descriptions', 'quips', 'rewardTexts'];

const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isTextList = (v) => Array.isArray(v) && v.length > 0 && v.every((item) => item === null || isText(item));
const keyOf = (entry) => (entry?.series ? `s:${entry.series}` : `i:${entry?.id}`);

/**
 * Valide la section `translations` : `{ <langue>: { displayName?, names?, achievements?: { <series ou id>: {...} } } }`.
 * @returns {{languages: Record<string, object>, ignored: string[]}}
 */
export function translationsOverrides(raw) {
  const languages = {};
  const ignored = [];
  if (raw === undefined) return { languages, ignored };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { languages, ignored: ['translations'] };
  for (const [lang, section] of Object.entries(raw)) {
    if (!/^[a-z]{2,3}$/.test(lang) || !section || typeof section !== 'object') {
      ignored.push(lang);
      continue;
    }
    const clean = { achievements: {} };
    for (const [key, value] of Object.entries(section)) {
      if (key === 'displayName' && isText(value)) clean.displayName = value;
      else if (key === 'names' && Array.isArray(value) && value.length > 0 && value.every(isText)) clean.names = value;
      else if (key === 'achievements' && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [id, texts] of Object.entries(value)) {
          const ok = texts && typeof texts === 'object'
            && Object.entries(texts).every(([field, text]) =>
              (TEXT_FIELDS.includes(field) && isText(text)) || (LIST_FIELDS.includes(field) && isTextList(text)));
          if (ok) clean.achievements[id] = texts;
          else ignored.push(`${lang}.achievements.${id}`);
        }
      } else ignored.push(`${lang}.${key}`);
    }
    languages[lang] = clean;
  }
  return { languages, ignored };
}

/** Une entrée de succès avec ses textes traduits ; une liste de longueur différente de l'originale est ignorée. */
function localizeEntry(entry, texts) {
  if (!texts) return entry;
  const out = { ...entry };
  for (const field of TEXT_FIELDS) if (texts[field] && entry[field] !== undefined) out[field] = texts[field];
  for (const field of ['names', 'descriptions', 'quips']) {
    if (texts[field] && Array.isArray(entry[field]) && texts[field].length === entry[field].length) {
      out[field] = texts[field].map((text, i) => text ?? entry[field][i]);
    }
  }
  if (texts.rewardTexts && Array.isArray(entry.reward) && texts.rewardTexts.length === entry.reward.length) {
    out.reward = entry.reward.map((reward, i) => (texts.rewardTexts[i] && reward?.text ? { ...reward, text: texts.rewardTexts[i] } : reward));
  } else if (texts.rewardTexts?.length === 1 && entry.reward?.text) {
    out.reward = { ...entry.reward, text: texts.rewardTexts[0] };
  }
  return out;
}

/**
 * Le pack dans une langue : nom, prénoms et textes des succès remplacés par
 * ceux de la section `translations`, champ par champ (le français sinon).
 * @param {object} meta pack.json
 * @param {string} lang `fr`, `en`...
 */
export function localizePack(meta, lang) {
  const section = translationsOverrides(meta?.translations).languages[lang];
  if (!section) return meta;
  const out = { ...meta };
  if (section.displayName) out.displayName = section.displayName;
  if (section.names) out.names = section.names;
  if (Array.isArray(meta.achievements)) {
    out.achievements = meta.achievements.map((entry) => {
      const key = keyOf(entry);
      const id = key.slice(2);
      return localizeEntry(entry, section.achievements[id]);
    });
  }
  return out;
}

/**
 * Textes du pack à traduire dans une langue, absents de sa section
 * `translations` (pour les tests et l'outil de revue).
 * @returns {string[]} chemins manquants (« displayName », « names », « achievements.hunts.names »...)
 */
export function missingTranslations(meta, lang) {
  const section = translationsOverrides(meta?.translations).languages[lang] ?? { achievements: {} };
  const missing = [];
  if (meta.displayName && !section.displayName) missing.push('displayName');
  if (Array.isArray(meta.names) && meta.names.length > 0 && !section.names) missing.push('names');
  for (const entry of Array.isArray(meta.achievements) ? meta.achievements : []) {
    if (!entry || entry.disabled) continue;
    const id = keyOf(entry).slice(2);
    const texts = section.achievements[id] ?? {};
    for (const field of TEXT_FIELDS) if (isText(entry[field]) && !texts[field]) missing.push(`achievements.${id}.${field}`);
    for (const field of ['names', 'descriptions', 'quips']) {
      if (Array.isArray(entry[field]) && !(texts[field]?.length === entry[field].length)) missing.push(`achievements.${id}.${field}`);
    }
    const rewards = [].concat(entry.reward ?? []).filter((reward) => reward?.text);
    if (rewards.length > 0 && !texts.rewardTexts) missing.push(`achievements.${id}.rewardTexts`);
  }
  return missing;
}
