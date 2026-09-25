import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seasonOf, holidaysOn, easterSunday, SEASONS, HOLIDAYS } from '../core/calendar.js';

test('Pâques : calcul grégorien', () => {
  assert.deepEqual(easterSunday(2025), { month: 4, day: 20 });
  assert.deepEqual(easterSunday(2026), { month: 4, day: 5 });
  assert.deepEqual(easterSunday(2027), { month: 3, day: 28 });
  assert.deepEqual(easterSunday(2038), { month: 4, day: 25 });
});

test('saisons météorologiques', () => {
  const season = (month) => seasonOf(new Date(2026, month - 1, 15));
  assert.deepEqual([1, 2, 3, 5, 6, 8, 9, 11, 12].map(season), [
    'winter', 'winter', 'spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter',
  ]);
  assert.deepEqual([...new Set([...Array(12).keys()].map((m) => season(m + 1)))].sort(), [...SEASONS].sort());
});

test('fêtes du jour', () => {
  const on = (y, m, d) => holidaysOn(new Date(y, m - 1, d, 12));
  assert.deepEqual(on(2026, 1, 1), ['newyear']);
  assert.deepEqual(on(2026, 2, 14), ['valentine']);
  assert.deepEqual(on(2026, 4, 5), ['easter']);
  assert.deepEqual(on(2026, 4, 6), ['easter'], 'lundi de Pâques');
  assert.deepEqual(on(2026, 4, 7), []);
  assert.deepEqual(on(2026, 10, 31), ['halloween']);
  assert.deepEqual(on(2026, 12, 24), ['christmas']);
  assert.deepEqual(on(2026, 12, 25), ['christmas']);
  assert.deepEqual(on(2026, 12, 26), []);
  assert.deepEqual(on(2027, 3, 29), ['easter'], 'lundi de Pâques en mars');
  const all = new Set();
  for (let day = 0; day < 366; day++) for (const h of holidaysOn(new Date(2026, 0, 1 + day))) all.add(h);
  assert.deepEqual([...all].sort(), [...HOLIDAYS].sort());
});
