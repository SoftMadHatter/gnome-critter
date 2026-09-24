import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopList, equippable, inSeason, anchorsOverrides, ACCESSORIES, FOOD_PRICES } from '../core/accessories.js';
import { Life } from '../core/life.js';
import { Critter } from '../core/critter.js';

const date = (month) => new Date(2026, month - 1, 15);
const YEAR = 365 * 86400;

test('les accessoires de saison ne sont proposés que leur mois, gratuits', () => {
  assert.equal(inSeason('santa', date(12)), true);
  assert.equal(inSeason('santa', date(6)), false);
  assert.equal(inSeason('bow', date(6)), true);

  const june = shopList(date(6), []).map((a) => a.id);
  assert.ok(june.includes('bow') && !june.includes('santa') && !june.includes('witch'));
  const december = shopList(date(12), []);
  const santa = december.find((a) => a.id === 'santa');
  assert.ok(santa.free && santa.price === 0);
});

test('equippable : achetés ou gratuits de saison seulement', () => {
  assert.deepEqual(equippable(date(6), []).map((a) => a.id), []);
  assert.deepEqual(equippable(date(6), ['bow']).map((a) => a.id), ['bow']);
  assert.deepEqual(equippable(date(12), ['crown']).map((a) => a.id).sort(), ['crown', 'santa']);
  assert.ok(shopList(date(6), ['bow']).find((a) => a.id === 'bow').owned);
});

test('prix : accessoires et aliments premium', () => {
  assert.ok(Object.values(ACCESSORIES).every((a) => a.price >= 0));
  assert.ok(FOOD_PRICES.fish > 0 && FOOD_PRICES.meat > 0 && FOOD_PRICES.kibble === undefined);
});

test('anchorsOverrides : défaut, valeurs valides, invalides signalées', () => {
  assert.deepEqual(anchorsOverrides(undefined), { anchors: { head: { x: 0.72, y: 0.2 } }, ignored: [] });
  assert.deepEqual(anchorsOverrides({ head: { x: 0.5, y: 0.1 } }).anchors.head, { x: 0.5, y: 0.1 });
  const bad = anchorsOverrides({ head: { x: 2, y: 0 }, tail: { x: 0, y: 0 } });
  assert.deepEqual(bad.ignored, ['head', 'tail']);
  assert.deepEqual(bad.anchors.head, { x: 0.72, y: 0.2 });
});

test('anniversaire : signalé à chaque année de vie, fêté pendant un jour', () => {
  const life = new Life({ ageSeconds: YEAR - 10 });
  assert.equal(life.snapshot().birthdayToday, false);
  assert.ok(life.advance(5, { mood: 80, health: 100 }).length === 0);
  assert.deepEqual(life.advance(10, { mood: 80, health: 100 }).filter((e) => e === 'birthday'), ['birthday']);
  assert.equal(life.snapshot().birthdayToday, true);
  assert.deepEqual(life.advance(100, { mood: 80, health: 100 }), []);

  life.ageSeconds = YEAR + 2 * 86400;
  assert.equal(life.snapshot().birthdayToday, false);
  const old = new Life({ ageSeconds: 3 * YEAR + 100 });
  assert.deepEqual(old.advance(10, { mood: 80, health: 100 }), [], 'les anniversaires passés ne sont pas refêtés');
  const back = new Life();
  back.restore(old.serialize());
  assert.deepEqual(back.advance(10, { mood: 80, health: 100 }), []);
});

test('un critter porte, sauvegarde et restaure son accessoire', () => {
  const c = new Critter({}, { x: 0, y: 0 });
  assert.equal(c.snapshot().accessory, null);
  c.equip('bow');
  assert.equal(c.snapshot().accessory, 'bow');
  const back = new Critter({}, { x: 0, y: 0 });
  back.restore(c.serialize());
  assert.equal(back.accessory, 'bow');
  back.equip(null);
  assert.equal(back.accessory, null);
  const old = new Critter({}, { x: 0, y: 0 });
  old.restore({ x: 1, y: 1, facing: 1, extra: { accessory: 42 } });
  assert.equal(old.accessory, null);
});
