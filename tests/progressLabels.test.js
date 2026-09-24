import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskText, formatSeconds, statValue } from '../extension/lib/progressLabels.js';

test('maskText garde la forme du texte mais le rend illisible', () => {
  assert.equal(maskText('Roi de la sieste'), '▒▒▒ ▒▒ ▒▒ ▒▒▒▒▒▒');
  assert.equal(maskText("Dormir 15 minutes d'affilée"), "▒▒▒▒▒▒ ▒▒ ▒▒▒▒▒▒▒ ▒'▒▒▒▒▒▒▒");
  assert.equal(maskText(''), '');
  assert.ok(!/[a-zA-Z0-9éèà]/.test(maskText('Câlin 10 fois !')));
});

test('formatSeconds et statValue', () => {
  assert.equal(formatSeconds(45), '45 s');
  assert.equal(formatSeconds(900), '15 min');
  assert.equal(statValue('longestSleepSeconds', 600), '10 min');
  assert.equal(statValue('meals', 12), '12');
});
