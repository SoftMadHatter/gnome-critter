// Translation. Source texts are in French (they're the gettext msgids,
// domain "gnome-critter"); the active translator is plugged in by the
// extension (GNOME's gettext), by the preferences, or by the tests and the
// review tool (a .po catalogue read in JavaScript). With no translator:
// French, with its plural rule. Pure module. See docs/i18n.md.

/** Languages with a catalogue (French is the source language). */
export const LANGUAGES = Object.freeze(['fr', 'en']);

const identity = {
  gettext: (msgid) => msgid,
  ngettext: (singular, plural, n) => (n > 1 ? plural : singular),
  language: 'fr',
};

let translator = identity;

/**
 * Plugs in the active translator.
 * @param {{gettext?: (msgid: string) => string, ngettext?: (s: string, p: string, n: number) => string, language?: string}} [t]
 *   no argument: back to French
 */
export function setTranslator(t = identity) {
  translator = {
    gettext: t.gettext ?? identity.gettext,
    ngettext: t.ngettext ?? identity.ngettext,
    language: t.language ?? 'fr',
  };
}

/** Displayed language (`fr` or `en`). */
export function language() {
  return translator.language;
}

/** Translated text. */
export function _(msgid) {
  return translator.gettext(msgid);
}

/** Text translated according to the count (the language's plural form). */
export function ngettext(singular, plural, n) {
  return translator.ngettext(singular, plural, n);
}

/** Extraction marker: the text is translated later, at display time (label tables). */
export function N_(msgid) {
  return msgid;
}

/** Replaces named placeholders: `fmt('{name} hatched.', { name })`. */
export function fmt(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

/**
 * Session language among those with a catalogue, mirroring gettext's own
 * fallback: the first preferred language (e.g. `['en_US.UTF-8', 'en_US', 'en', 'C']`)
 * that has a catalogue, otherwise French (the source language).
 */
export function sessionLanguage(names = [], available = LANGUAGES) {
  for (const name of names) {
    const base = String(name).split(/[_.@]/)[0].toLowerCase();
    if (available.includes(base)) return base;
  }
  return 'fr';
}
