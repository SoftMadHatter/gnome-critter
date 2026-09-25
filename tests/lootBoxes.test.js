import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openBox, BOX_TABLES, BOX_LABELS } from '../core/lootBoxes.js';
import { ACCESSORIES } from '../core/accessories.js';
import { BOX_TIERS } from '../core/achievements.js';

/** Hasard déterministe balayant tout l'intervalle [0, 1[. */
function sweep(n) {
  let i = 0;
  return () => ((i++ * 0.6180339887) % 1);
}

test('chaque boîte existe, a un libellé, et ne donne que des lots valides', () => {
  assert.deepEqual(Object.keys(BOX_TABLES).sort(), [...BOX_TIERS].sort());
  for (const tier of BOX_TIERS) {
    assert.ok(BOX_LABELS[tier], tier);
    const random = sweep();
    for (let i = 0; i < 400; i++) {
      const prize = openBox(tier, random);
      assert.ok(Number.isInteger(prize.coins) && prize.coins >= 0, `${tier} : pièces ${prize.coins}`);
      assert.ok(typeof prize.text === 'string' && prize.text.length > 0);
      if (prize.accessory) assert.equal(ACCESSORIES[prize.accessory]?.joke, true, `${tier} : ${prize.accessory}`);
    }
  }
});

test("les gros lots restent rares et grossissent avec la boîte", () => {
  const average = (tier) => {
    const random = sweep();
    let coins = 0;
    for (let i = 0; i < 2000; i++) coins += openBox(tier, random, { owned: ['cone', 'sock', 'foilhat'] }).coins;
    return coins / 2000;
  };
  const means = BOX_TIERS.map(average);
  assert.ok(means.every((m, i) => i === 0 || m > means[i - 1]), `moyennes croissantes : ${means.join(', ')}`);
  assert.ok(means[0] < 1, 'la boîte en bronze rapporte presque rien');
});

test('une farce déjà possédée est remplacée par des pièces', () => {
  const always = () => 0.999; // dernier lot : l'accessoire farce
  const first = openBox('legendary', always, { owned: [] });
  assert.equal(ACCESSORIES[first.accessory]?.joke, true);
  const none = openBox('legendary', always, { owned: ['cone', 'sock', 'foilhat'] });
  assert.equal(none.accessory, null);
  assert.equal(none.coins, 100);
});
