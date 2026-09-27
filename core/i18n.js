// Traduction. Les textes source sont en français (ce sont les msgid de
// gettext, domaine « gnome-critter ») ; le traducteur actif est branché par
// l'extension (gettext de GNOME), par les préférences, ou par les tests et
// l'outil de revue (catalogue .po lu en JavaScript). Sans traducteur : le
// français, avec sa règle de pluriel. Module pur. Voir docs/i18n.md.

/** Langues qui ont un catalogue (le français est la langue source). */
export const LANGUAGES = Object.freeze(['fr', 'en']);

const identity = {
  gettext: (msgid) => msgid,
  ngettext: (singular, plural, n) => (n > 1 ? plural : singular),
  language: 'fr',
};

let translator = identity;

/**
 * Branche le traducteur actif.
 * @param {{gettext?: (msgid: string) => string, ngettext?: (s: string, p: string, n: number) => string, language?: string}} [t]
 *   sans argument : retour au français
 */
export function setTranslator(t = identity) {
  translator = {
    gettext: t.gettext ?? identity.gettext,
    ngettext: t.ngettext ?? identity.ngettext,
    language: t.language ?? 'fr',
  };
}

/** Langue affichée (`fr` ou `en`). */
export function language() {
  return translator.language;
}

/** Texte traduit. */
export function _(msgid) {
  return translator.gettext(msgid);
}

/** Texte traduit selon le nombre (pluriel de la langue). */
export function ngettext(singular, plural, n) {
  return translator.ngettext(singular, plural, n);
}

/** Marqueur d'extraction : le texte est traduit plus tard, au moment de l'afficher (tables de libellés). */
export function N_(msgid) {
  return msgid;
}

/** Remplace les espaces réservés nommés : `fmt('{name} a éclos.', { name })`. */
export function fmt(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

/**
 * Langue de la session parmi celles qui ont un catalogue, comme le repli de
 * gettext : la première des langues préférées (ex. `['en_US.UTF-8', 'en_US', 'en', 'C']`)
 * qui a un catalogue, sinon le français (langue source).
 */
export function sessionLanguage(names = [], available = LANGUAGES) {
  for (const name of names) {
    const base = String(name).split(/[_.@]/)[0].toLowerCase();
    if (available.includes(base)) return base;
  }
  return 'fr';
}
