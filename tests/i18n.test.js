import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _, ngettext, fmt, setTranslator, language, sessionLanguage, LANGUAGES } from '../core/i18n.js';
import { parsePo, pluralRule, translatorFrom } from '../tools/review/po.js';
import { libraryTexts } from '../scripts/i18n-data.mjs';
import { buildAchievements, speciesProfile, formatCount } from '../core/achievements.js';
import { announceUnlock, announceBurst, announceTrophy } from '../core/narrator.js';
import { accessoryLabel } from '../core/accessories.js';
import { translationsOverrides, localizePack, missingTranslations } from '../core/packTranslations.js';
import { genericNames } from '../core/names.js';
import { placeholders, looksFrench } from '../tools/review/checks.js';
import { stringLiterals } from './helpers/jsStrings.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const EN = parsePo(read('po/en.po'));
const POT = parsePo(read('po/gnome-critter.pot'));
const PACKS = readdirSync(join(ROOT, 'packs')).map((id) => [id, JSON.parse(read(`packs/${id}/pack.json`))]);

/** Sources passed to xgettext by scripts/i18n.sh (paths relative to the repo). */
const SOURCES = [
  ...['extension', 'extension/lib', 'core'].flatMap((dir) =>
    readdirSync(join(ROOT, dir)).filter((file) => file.endsWith('.js')).map((file) => `${dir}/${file}`)),
];
const TRANSLATION_CALLS = new Set(['_', 'N_', 'ngettext']);

/** Runs `fn` with the English catalog, then reverts to French. */
function inEnglish(fn) {
  setTranslator(translatorFrom(EN, 'en'));
  try {
    return fn();
  } finally {
    setTranslator();
  }
}

test('fmt remplace les espaces réservés nommés, dans l’ordre voulu par la langue', () => {
  assert.equal(fmt('{name} a éclos.', { name: 'Minou' }), 'Minou a éclos.');
  assert.equal(fmt('{month}/{day}', { day: '25', month: '09' }), '09/25');
  assert.equal(fmt('{a} et {a}, {b}', { a: 1 }), '1 et 1, {b}', 'valeur absente : espace réservé laissé tel quel');
});

test('sessionLanguage : la première langue de la session qui a un catalogue, sinon le français', () => {
  assert.equal(sessionLanguage(['en_US.UTF-8', 'en_US', 'en', 'C']), 'en');
  assert.equal(sessionLanguage(['fr_FR.UTF-8', 'fr_FR', 'fr', 'C']), 'fr');
  assert.equal(sessionLanguage(['de_DE', 'de', 'en_GB', 'en', 'C']), 'en', 'repli de gettext (LANGUAGE=de:en)');
  assert.equal(sessionLanguage(['de_DE', 'de', 'C']), 'fr');
  assert.equal(sessionLanguage([]), 'fr');
});

test('traducteur : français par défaut, anglais branché, puis retour au français', () => {
  assert.equal(language(), 'fr');
  assert.equal(_('Fermer'), 'Fermer');
  assert.equal(ngettext('{n} pièce', '{n} pièces', 0), '{n} pièce', 'règle française : 0 au singulier');
  assert.equal(ngettext('{n} pièce', '{n} pièces', 2), '{n} pièces');
  assert.equal(formatCount(12500), '12 500');
  inEnglish(() => {
    assert.equal(language(), 'en');
    assert.equal(_('Fermer'), 'Close');
    assert.equal(_('texte inconnu'), 'texte inconnu', 'sans traduction : le texte source');
    assert.equal(ngettext('{n} pièce', '{n} pièces', 1), '{n} coin');
    assert.equal(ngettext('{n} pièce', '{n} pièces', 0), '{n} coins', 'règle anglaise : 0 au pluriel');
    assert.equal(formatCount(12500), '12,500');
    assert.equal(genericNames()[1], 'Nugget', 'prénoms génériques de la langue');
  });
  assert.equal(language(), 'fr');
  assert.equal(genericNames()[1], 'Nougat');
});

test('lecteur .po : en-têtes, pluriels, échappements, lignes multiples, entrées floues et obsolètes', () => {
  const po = parsePo([
    'msgid ""',
    'msgstr ""',
    '"Language: en\\n"',
    '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
    '',
    '#: core/a.js:1',
    'msgid "Fermer"',
    'msgstr "Close"',
    '',
    '#, fuzzy',
    'msgid "Ouvrir"',
    'msgstr "Open"',
    '',
    'msgid ""',
    '"Une longue "',
    '"phrase \\"citée\\"\\n"',
    'msgstr "A long \\"quoted\\" sentence\\n"',
    '',
    'msgid "{n} pièce"',
    'msgid_plural "{n} pièces"',
    'msgstr[0] "{n} coin"',
    'msgstr[1] "{n} coins"',
    '',
    '#~ msgid "Ancien"',
    '#~ msgstr "Old"',
  ].join('\n'));
  assert.equal(po.headers.Language, 'en');
  assert.equal(po.entries.length, 4);
  assert.equal(po.entries[2].msgid, 'Une longue phrase "citée"\n');
  assert.deepEqual(po.entries[1].flags, ['fuzzy']);
  const t = translatorFrom(po, 'en');
  assert.equal(t.gettext('Fermer'), 'Close');
  assert.equal(t.gettext('Ouvrir'), 'Ouvrir', 'entrée floue : non traduite');
  assert.equal(t.gettext('Une longue phrase "citée"\n'), 'A long "quoted" sentence\n');
  assert.equal(t.ngettext('{n} pièce', '{n} pièces', 1), '{n} coin');
  assert.equal(t.ngettext('{n} pièce', '{n} pièces', 3), '{n} coins');
  assert.equal(pluralRule('nplurals=2; plural=(n > 1);')(0), 0);
  assert.equal(pluralRule('nplurals=2; plural=(n != 1);')(0), 1);
});

test('extension : domaine gettext déclaré, une langue par catalogue', () => {
  assert.equal(JSON.parse(read('extension/metadata.json'))['gettext-domain'], 'gnome-critter');
  assert.match(read('extension/schemas/org.gnome.shell.extensions.gnome-critter.gschema.xml'), /gettext-domain="gnome-critter"/);
  assert.deepEqual(read('po/LINGUAS').split(/\s+/).filter(Boolean), LANGUAGES.filter((lang) => lang !== 'fr'));
});

test('en.po : à jour avec gnome-critter.pot, tout traduit, mêmes espaces réservés, typographie anglaise', () => {
  const ids = (po) => po.entries.map((entry) => entry.msgid).sort();
  assert.deepEqual(ids(EN), ids(POT), 'lancer scripts/i18n.sh update');
  assert.equal(EN.headers.Language, 'en');
  for (const entry of EN.entries) {
    const where = JSON.stringify(entry.msgid);
    assert.ok(!entry.flags.includes('fuzzy'), `entrée floue : ${where}`);
    assert.equal(entry.msgstr.length, entry.msgidPlural === null ? 1 : 2, `formes : ${where}`);
    for (const text of entry.msgstr) {
      assert.ok(text, `non traduit : ${where}`);
      assert.deepEqual(placeholders(text), placeholders(entry.msgid), `espaces réservés : ${where} → ${text}`);
      assert.ok(!/[«»]| [!?:;]/.test(text), `typographie française en anglais : ${text}`);
    }
  }
});

test('couverture : chaque texte marqué du code et chaque texte de la bibliothèque est au catalogue', () => {
  const known = new Set(EN.entries.flatMap((entry) => [entry.msgid, entry.msgidPlural]).filter((text) => text !== null));
  for (const file of SOURCES) {
    for (const literal of stringLiterals(read(file))) {
      if (!TRANSLATION_CALLS.has(literal.callee)) continue;
      const where = `${file}:${literal.line}`;
      assert.ok(!literal.dynamic, `${where} : gabarit \`…\${}\` dans ${literal.callee}() (utiliser fmt et des espaces réservés)`);
      assert.ok(known.has(literal.value), `${where} : ${JSON.stringify(literal.value)} absent du catalogue (scripts/i18n.sh update)`);
    }
  }
  for (const text of libraryTexts().keys()) assert.ok(known.has(text), `bibliothèque : ${JSON.stringify(text)} absent du catalogue`);
});

test('rien n’échappe à la traduction : aucun texte d’interface hors de _(), N_() ou ngettext()', () => {
  // Data text translated another way: the library (extracted by
  // scripts/i18n-data.mjs, checked above) and generic given names (one list per language).
  const exempt = new Set(['core/achievementLibrary.js', 'core/names.js']);
  // Development logs and errors; the proper noun (source of notifications, the tray button).
  const allowedCalls = new Set(['log', 'logError', 'console.log', 'console.warn', 'console.error', 'console.debug', 'Error', 'TypeError']);
  const allowedTexts = new Set(['Critter']);
  // Text-like appearance: an accented letter, two words, or a single capitalized word ("Journal").
  const looksLikeText = (text) =>
    /[À-ÖØ-öø-ÿŒœ]/.test(text) || /\p{L}{2,}[ '’]+\p{L}{2,}/u.test(text) || /^[A-ZÀ-Ý][a-zà-ÿœ]+[.…!?]?$/.test(text);
  const escaped = [];
  for (const file of SOURCES.filter((path) => !exempt.has(path))) {
    for (const literal of stringLiterals(read(file))) {
      if (TRANSLATION_CALLS.has(literal.callee) || allowedCalls.has(literal.callee) || allowedTexts.has(literal.value)) continue;
      if (looksLikeText(literal.value.replaceAll('{}', ' '))) escaped.push(`${file}:${literal.line} ${JSON.stringify(literal.value)}`);
    }
  }
  assert.deepEqual(escaped, []);
});

test('lecteur de littéraux : appel englobant, gabarits, expressions rationnelles et commentaires', () => {
  const literals = stringLiterals([
    'logError(e, `Échec "${id}" (${path})`); // « commentaire »',
    "const re = /[\"'(]/g; /* 'pas un texte' */",
    "label(a ? `, ${_('Sans nom')}` : '');",
    "ngettext('{n} pièce', '{n} pièces', n); [N_('Soins'), 'Brut'];",
    "h('p', { class: 'muted' }, 'Texte');",
  ].join('\n'));
  assert.deepEqual(literals.map((l) => [l.value, l.callee, l.line]), [
    ['Échec "{}" ({})', 'logError', 1],
    [', {}', 'label', 3],
    ['Sans nom', '_', 3],
    ['', 'label', 3],
    ['{n} pièce', 'ngettext', 4],
    ['{n} pièces', 'ngettext', 4],
    ['Soins', 'N_', 4],
    ['Brut', null, 4],
    ['p', 'h', 5],
    ['muted', null, 5],
    ['Texte', 'h', 5],
  ]);
  assert.ok(literals[0].dynamic && !literals[2].dynamic);
});

test('packs : section anglaise valide et complète, mêmes espaces réservés', () => {
  for (const [id, meta] of PACKS) {
    assert.deepEqual(translationsOverrides(meta.translations).ignored, [], `${id} : clés ignorées`);
    assert.deepEqual(missingTranslations(meta, 'en'), [], `${id} : traductions manquantes`);
    const en = localizePack(meta, 'en');
    assert.ok(en.names.length >= 8, `${id} : au moins 8 prénoms anglais`);
    assert.notDeepEqual(en.names, meta.names, `${id} : prénoms anglais`);
    (meta.achievements ?? []).forEach((entry, index) => {
      const translated = en.achievements[index];
      for (const field of ['name', 'description', 'quip', 'title']) {
        if (typeof entry[field] !== 'string') continue;
        assert.deepEqual(placeholders(translated[field]), placeholders(entry[field]), `${id} : ${translated[field]}`);
      }
    });
  }
});

test('localizePack : repli champ par champ sur le français, sections invalides ignorées', () => {
  const meta = {
    displayName: 'Chat',
    names: ['Minou'],
    achievements: [
      { series: 'hunts', names: ['A', 'B'], description: 'Attraper {n} souris', title: 'titre' },
      { id: 'solo', name: 'Seul', description: 'd', quip: 'q', reward: { coins: 3, text: 'trois pièces' } },
    ],
    translations: {
      en: { displayName: 'Cat', achievements: { hunts: { names: ['First', null], description: 'Catch {n} mice' }, solo: { rewardTexts: ['three coins'] } } },
      de: 'invalide',
      xx_long: {},
    },
  };
  const en = localizePack(meta, 'en');
  assert.equal(en.displayName, 'Cat');
  assert.deepEqual(en.names, ['Minou'], 'prénoms absents : ceux du pack');
  assert.deepEqual(en.achievements[0].names, ['First', 'B'], 'null : le texte français');
  assert.equal(en.achievements[0].description, 'Catch {n} mice');
  assert.equal(en.achievements[0].title, 'titre');
  assert.equal(en.achievements[1].reward.text, 'three coins');
  assert.equal(en.achievements[1].name, 'Seul');
  assert.equal(localizePack(meta, 'fr'), meta, 'langue sans section : le pack tel quel');
  assert.deepEqual(translationsOverrides(meta.translations).ignored, ['de', 'xx_long']);
  assert.deepEqual(missingTranslations(meta, 'en'), [
    'names', 'achievements.hunts.title', 'achievements.solo.name', 'achievements.solo.description', 'achievements.solo.quip',
  ]);
});

test('rendu anglais : succès développés et annonces du Comité sans français', () => {
  const check = (text, where) => assert.ok(!looksFrench(text), `${where} : ${text}`);
  inEnglish(() => {
    for (const [id, meta] of PACKS) {
      const pack = localizePack(meta, 'en');
      const { critter, player } = buildAchievements(pack.achievements, speciesProfile(pack));
      for (const def of [...critter, ...player]) {
        for (const text of [def.name, def.description, def.quip, def.title, def.reward?.text]) if (text) check(text, `${id}/${def.id}`);
        for (const r of [0, 0.5, 0.99]) {
          const who = def.scope === 'player' ? null : pack.names[0];
          const outcome = { paid: r > 0.5, box: { text: 'a rusty coin' } };
          const { title, body } = announceUnlock({ def, who, outcome, random: () => r });
          assert.equal(title, 'The Committee');
          check(body, `${id}/${def.id}`);
        }
      }
      check(announceBurst({ who: pack.names[0], defs: critter.slice(-4), coins: 25 }).body, `${id} : rafale`);
      check(announceBurst({ who: null, defs: player.slice(0, 2) }).body, `${id} : rafale du joueur`);
    }
    const trophy = announceTrophy({ label: accessoryLabel('medal'), count: 25 }).body;
    assert.equal(trophy, '25 achievements. You get: medal. The Committee is almost impressed.');
  });
});
