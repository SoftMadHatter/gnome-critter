import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  SOUNDS_MASTER_KEY, VOICES_KEY, LIFE_KEY, GAME_KEY, reactionSoundKey, soundEnabled,
} from '../core/soundCategories.js';

const settingsOf = (values) => (key) => values[key] ?? false;

test('sons : les réactions de vie ont leur catégorie, toutes les autres sont des voix', () => {
  for (const reaction of ['hatched', 'grew', 'birthday', 'gift', 'trickLearned', 'reminded']) {
    assert.equal(reactionSoundKey(reaction), LIFE_KEY, reaction);
  }
  for (const reaction of ['petted', 'startled', 'annoyed', 'purring', 'sick', 'inconnue']) {
    assert.equal(reactionSoundKey(reaction), VOICES_KEY, reaction);
  }
});

test('sons : l’interrupteur général coupe tout, une catégorie coupée ne coupe que la sienne', () => {
  const on = { [SOUNDS_MASTER_KEY]: true, [VOICES_KEY]: true, [LIFE_KEY]: true, [GAME_KEY]: true };
  for (const key of [VOICES_KEY, LIFE_KEY, GAME_KEY]) assert.equal(soundEnabled(settingsOf(on), key), true);

  const masterOff = { ...on, [SOUNDS_MASTER_KEY]: false };
  for (const key of [VOICES_KEY, LIFE_KEY, GAME_KEY]) assert.equal(soundEnabled(settingsOf(masterOff), key), false);

  const voicesOff = { ...on, [VOICES_KEY]: false };
  assert.equal(soundEnabled(settingsOf(voicesOff), VOICES_KEY), false);
  assert.equal(soundEnabled(settingsOf(voicesOff), LIFE_KEY), true);
  assert.equal(soundEnabled(settingsOf(voicesOff), GAME_KEY), true);
});

test('sons : le schéma GSettings déclare l’interrupteur général et les trois catégories (activés par défaut)', () => {
  const dir = 'extension/schemas';
  const xml = readFileSync(`${dir}/${readdirSync(dir).find((f) => f.endsWith('.gschema.xml'))}`, 'utf8');
  for (const key of [SOUNDS_MASTER_KEY, VOICES_KEY, LIFE_KEY, GAME_KEY]) {
    assert.match(xml, new RegExp(`<key name="${key}" type="b">\\s*<default>true</default>`), key);
  }
});
