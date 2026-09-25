import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatSeconds, formatDuration, statValue, STAT_LABELS, CATEGORY_LABELS, PLAYER_STAT_LABELS, MARK_FAMILY_LABELS,
} from '../extension/lib/progressLabels.js';
import { STAT_KEYS, DERIVED_STATS, PLAYER_CONDITION_STATS, MARK_FAMILIES, PLAYER_MARK_FAMILIES } from '../core/stats.js';
import { DISPLAY_ORDER } from '../core/achievements.js';

test('formatSeconds, formatDuration et statValue', () => {
  assert.equal(formatSeconds(45), '45 s');
  assert.equal(formatSeconds(900), '15 min');
  assert.equal(formatDuration(12 * 60), '12 min');
  assert.equal(formatDuration(3 * 3600 + 20 * 60 + 5), '3 h 20 min');
  assert.equal(statValue('longestSleepSeconds', 600), '10 min');
  assert.equal(statValue('sleepSeconds', 7200), '2 h 0 min');
  assert.equal(statValue('meals', 12), '12');
});

test('chaque compteur et chaque rubrique de succès a un libellé', () => {
  for (const key of [...STAT_KEYS, ...DERIVED_STATS]) assert.ok(STAT_LABELS[key], `compteur sans libellé : ${key}`);
  for (const key of PLAYER_CONDITION_STATS) assert.ok(PLAYER_STAT_LABELS[key], `compteur du joueur sans libellé : ${key}`);
  for (const family of [...MARK_FAMILIES, ...PLAYER_MARK_FAMILIES]) assert.ok(MARK_FAMILY_LABELS[family], `famille sans libellé : ${family}`);
  for (const id of DISPLAY_ORDER) assert.ok(CATEGORY_LABELS[id], `rubrique sans libellé : ${id}`);
});
