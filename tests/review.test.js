import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolvePath, HOME } from '../tools/review/paths.mjs';
import { checkPack, checkCatalog, checkTranslations, typographyIssues, genderedWords, looksFrench } from '../tools/review/checks.js';
import { preparePack } from '../tools/review/data.js';
import { parsePo, translatorFrom } from '../tools/review/po.js';
import { setTranslator } from '../core/i18n.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('outil de revue : adresses servies avec la disposition du dépôt et les alias du paquet', () => {
  assert.equal(resolvePath(ROOT, '/core/achievements.js'), join(ROOT, 'core', 'achievements.js'));
  assert.equal(resolvePath(ROOT, '/extension/core/accessories.js'), join(ROOT, 'core', 'accessories.js'), 'alias du paquet');
  assert.equal(resolvePath(ROOT, '/extension/lib/menuWidgets.js'), join(ROOT, 'extension', 'lib', 'menuWidgets.js'));
  assert.equal(resolvePath(ROOT, '/packs/cat/pack.json'), join(ROOT, 'packs', 'cat', 'pack.json'));
  assert.equal(resolvePath(ROOT, '/po/en.po'), join(ROOT, 'po', 'en.po'), 'catalogues pour le choix de la langue');
  assert.equal(resolvePath(ROOT, HOME), join(ROOT, 'tools', 'review', 'index.html'));
  assert.equal(resolvePath(ROOT, '/packs/cat/sprites%2Fidle.png'), join(ROOT, 'packs', 'cat', 'sprites', 'idle.png'));
  for (const bad of ['/', '/package.json', '/.git/config', '/core/', '/core/../package.json', '/packs/..%2F..%2Fetc/passwd',
    '/core//achievements.js', '/extension/metadata.json', '/tools/review/%E0%A4%A', '/core/a\\b.js']) {
    assert.equal(resolvePath(ROOT, bad), null, bad);
  }
});

test('outil de revue : les modules de la page n’importent que ce que le serveur sait servir', () => {
  const dir = join(ROOT, 'tools', 'review');
  const files = [...readdirSync(dir).map((f) => join(dir, f)), ...readdirSync(join(dir, 'tabs')).map((f) => join(dir, 'tabs', f))]
    .filter((f) => f.endsWith('.js'));
  for (const file of files) {
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(/from '([^']+)'/g)) {
      if (!spec.startsWith('.')) assert.fail(`${file} : import non relatif ${spec}`);
      const target = join(dirname(file), spec);
      assert.ok(existsSync(target), `${file} : ${spec} introuvable`);
      const url = `/${target.slice(ROOT.length + 1).split('\\').join('/')}`;
      assert.ok(resolvePath(ROOT, url), `${file} : ${url} n'est pas servi`);
    }
  }
});

test('contrôles : typographie, mots genrés', () => {
  assert.deepEqual(typographyIssues('Tu le fais exprès ?'), []);
  assert.deepEqual(typographyIssues('Oups!'), ['espace manquante avant « ! »']);
  assert.deepEqual(typographyIssues('Récompense: rien'), ['espace manquante avant « : »']);
  assert.deepEqual(typographyIssues('un badge «Bonjour»'), ['espace manquante après « « »', 'espace manquante avant « » »']);
  assert.deepEqual(typographyIssues('Attends... non'), ['« ... » au lieu de « … »']);
  assert.deepEqual(typographyIssues('deux  espaces'), ['espaces en double']);
  assert.deepEqual(genderedWords('ami des jardiniers'), ['ami']);
  assert.deepEqual(genderedWords('as de la sieste'), []);
});

test('contrôles : doublons, rejets, descriptions de paliers identiques', () => {
  const meta = {
    supportedSurfaces: ['ground'],
    achievements: [
      { series: 'same', category: 'care', stat: 'pets', tiers: [3, 7], names: ['A', 'B'], description: 'Caresses' },
      { id: 'twin', category: 'care', stat: 'pets', atLeast: 7, name: 'Jumeau', description: 'd' },
      { id: 'broken', category: 'nope', stat: 'pets', atLeast: 1, name: 'X', description: 'd' },
    ],
  };
  const issues = checkPack(preparePack('test', meta, new Set()));
  const has = (level, id, text) => issues.some((i) => i.level === level && i.id === id && i.message.includes(text));
  assert.ok(has('error', 'broken', 'rejetée'));
  assert.ok(has('error', 'twin', 'même condition'));
  assert.ok(has('warning', 'same-3', 'descriptions identiques'));
});

test('contrôles : aucune erreur de structure sur les vrais packs', () => {
  for (const id of readdirSync(join(ROOT, 'packs'))) {
    const meta = JSON.parse(readFileSync(join(ROOT, 'packs', id, 'pack.json'), 'utf8'));
    const errors = checkPack(preparePack(id, meta, new Set())).filter((issue) => issue.level === 'error');
    assert.deepEqual(errors, [], `${id} : ${errors.map((e) => e.message).join(' ; ')}`);
  }
});

test('contrôles de traduction : catalogue', () => {
  const catalog = parsePo([
    'msgid "Fermer"', 'msgstr "Close"', '',
    'msgid "Ouvrir"', 'msgstr ""', '',
    '#, fuzzy', 'msgid "Jouer"', 'msgstr "Play"', '',
    'msgid "{name} a éclos."', 'msgstr "{nom} hatched."', '',
    'msgid "Moments"', 'msgstr "Moments"', '',
    'msgid "Bonjour !"', 'msgstr "Hello !"', '',
    'msgid "{n} pièce"', 'msgid_plural "{n} pièces"', 'msgstr[0] "{n} coin"', 'msgstr[1] "{n} coins"',
  ].join('\n'));
  assert.deepEqual(checkCatalog(catalog).map((issue) => [issue.level, issue.id, issue.message.split(' :')[0]]), [
    ['warning', 'Ouvrir', 'non traduit'],
    ['warning', 'Jouer', 'entrée floue'],
    ['error', '{name} a éclos.', 'espaces réservés différents'],
    ['info', 'Moments', 'identique au français'],
    ['warning', 'Bonjour !', 'typographie française'],
  ]);
  assert.ok(looksFrench('Le chat') && looksFrench('Première') && !looksFrench('Bon appétit, whiskers') && !looksFrench('Ninja'));
});

test('contrôles de traduction : section translations d’un pack et textes restés en français', () => {
  const raw = {
    supportedSurfaces: ['ground'],
    achievements: [
      { series: 'solo', category: 'care', stat: 'pets', tiers: [3, 7], names: ['Premier pas', 'Deuxième'], description: 'Caresser {n} fois', title: 'as des caresses' },
    ],
    translations: { en: { achievements: { solo: { names: ['First step', null], description: 'Pet {count} times' } } }, de: 'invalide' },
  };
  const french = preparePack('test', raw, new Set());
  setTranslator(translatorFrom(parsePo(readFileSync(join(ROOT, 'po', 'en.po'), 'utf8')), 'en'));
  try {
    const issues = checkTranslations({ ...preparePack('test', raw, new Set(), 'en'), french });
    const has = (level, id, text) => issues.some((i) => i.level === level && i.id === id && i.message.includes(text));
    assert.ok(has('warning', null, '« de » ignorée'));
    assert.ok(has('warning', null, 'achievements.solo.title'));
    assert.ok(has('error', 'solo', 'description (en) : espaces réservés'));
    assert.ok(has('warning', 'solo-7', 'name resté en français ? Deuxième'));
    assert.equal(issues.filter((i) => i.id && !i.id.startsWith('solo')).length, 0, 'bibliothèque : rien à signaler en anglais');
  } finally {
    setTranslator();
  }
});
