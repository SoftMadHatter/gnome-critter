import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeName, namesOverrides, uniqueName, pickName, MAX_NAME_LENGTH, GENERIC_NAMES } from '../core/names.js';
import { Critter } from '../core/critter.js';

test('sanitizeName : contrôle, espaces, longueur, vide', () => {
  assert.equal(sanitizeName('  Moka  '), 'Moka');
  assert.equal(sanitizeName('Mo\tka\n  la   chatte'), 'Mo ka la chatte');
  assert.equal(sanitizeName('a'.repeat(50)).length, MAX_NAME_LENGTH);
  assert.equal(sanitizeName('   '), null);
  assert.equal(sanitizeName('\u0007\u0000'), null);
  assert.equal(sanitizeName(42), null);
  assert.equal(sanitizeName(undefined), null);
  assert.equal(sanitizeName('Éclair d\'été'), 'Éclair d\'été');
});

test('namesOverrides : noms valides, doublons et invalides signalés', () => {
  assert.deepEqual(namesOverrides(undefined), { list: [], ignored: [] });
  assert.deepEqual(namesOverrides('Moka').ignored, ['names']);
  const { list, ignored } = namesOverrides(['Moka', 'moka', ' Luna', '', 7, 'Pixel']);
  assert.deepEqual(list, ['Moka', 'Pixel']);
  assert.deepEqual(ignored, ['moka', ' Luna', '', '7']);
});

test('uniqueName : suffixe numéroté, insensible à la casse, longueur respectée', () => {
  assert.equal(uniqueName('Moka', []), 'Moka');
  assert.equal(uniqueName('Moka', ['Luna']), 'Moka');
  assert.equal(uniqueName('Moka', ['moka']), 'Moka 2');
  assert.equal(uniqueName('Moka', ['Moka', 'Moka 2']), 'Moka 3');
  const long = 'a'.repeat(MAX_NAME_LENGTH);
  assert.ok(uniqueName(long, [long]).length <= MAX_NAME_LENGTH);
  assert.notEqual(uniqueName(long, [long]), long);
});

test('pickName : évite les noms pris, repli numéroté quand tout est pris', () => {
  const pool = ['Moka', 'Luna', 'Pixel'];
  assert.equal(pickName(() => 0, pool, []), 'Moka');
  assert.equal(pickName(() => 0, pool, ['Moka']), 'Luna');
  assert.equal(pickName(() => 0.99, pool, ['Pixel']), 'Luna');
  assert.equal(pickName(() => 0, pool, ['Moka', 'Luna', 'Pixel']), 'Moka 2');
  assert.ok(GENERIC_NAMES.includes(pickName(() => 0.5, [], [])), 'liste générique en repli');
});

test('Critter : setName nettoie, sauvegarde et restaure ; ancienne sauvegarde sans nom', () => {
  const c = new Critter({}, { x: 0, y: 0 });
  assert.equal(c.name, null);
  assert.equal(c.setName('  Moka  la  chatte '), 'Moka la chatte');
  assert.equal(c.snapshot().name, 'Moka la chatte');
  assert.equal(c.setName('   '), 'Moka la chatte', 'un nom vide ne change rien');

  const back = new Critter({}, { x: 0, y: 0 });
  back.restore(c.serialize());
  assert.equal(back.name, 'Moka la chatte');

  const old = new Critter({}, { x: 0, y: 0 });
  old.restore({ x: 1, y: 1, facing: 1, extra: {} });
  assert.equal(old.name, null);
  old.restore({ x: 1, y: 1, facing: 1, extra: { name: 12 } });
  assert.equal(old.name, null);
});
