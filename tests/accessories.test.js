import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopList, equippable, inSeason, anchorsOverrides, anchorFor, accessorySlot, accessoryPlacement, ACCESSORIES, FOOD_PRICES, isSpecial, trophiesFor } from '../core/accessories.js';
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
  assert.ok(Object.values(ACCESSORIES).every((a) => a.trophy > 0 || a.joke === true || a.price >= 0));
  assert.ok(FOOD_PRICES.fish > 0 && FOOD_PRICES.meat > 0 && FOOD_PRICES.kibble === undefined);
});

test('anchorsOverrides : défaut, valeurs valides, invalides signalées', () => {
  const none = anchorsOverrides(undefined);
  assert.deepEqual(none.ignored, []);
  assert.deepEqual(none.anchors.head, { x: 0.72, y: 0.2 });
  assert.deepEqual(Object.keys(none.anchors.slots), ['face', 'neck']);
  assert.deepEqual(anchorsOverrides({ head: { x: 0.5, y: 0.1 } }).anchors.head, { x: 0.5, y: 0.1 });
  const bad = anchorsOverrides({ head: { x: 2, y: 0 }, tail: { x: 0, y: 0 } });
  assert.deepEqual(bad.ignored, ['head', 'tail']);
  assert.deepEqual(bad.anchors.head, { x: 0.72, y: 0.2 });
});

test('anchorsOverrides : animations, réactions, emplacements, stades', () => {
  const { anchors, ignored } = anchorsOverrides({
    head: { x: 0.5, y: 0.1 },
    slots: { face: { dx: 0, dy: 0.1 } },
    animations: {
      walk: [[0.1, 0.2], [0.2, 0.3], false],
      sleep: [0.6, 0.4],
      ceiling: { rotation: 180, points: [[0.8, 0.8], [0.8, 0.82]] },
      climb: false,
    },
    reactions: { petted: [[0.3, 0.3]] },
    stageFit: { baby: { scale: 0.75 } },
  });
  assert.deepEqual(ignored, []);
  assert.deepEqual(anchors.slots.face, { dx: 0, dy: 0.1 });
  assert.deepEqual(anchors.slots.neck, { dx: -0.04, dy: 0.25 }); // default kept
  // The head point of a frame, an animation (all frames), then the pack's fallback.
  assert.deepEqual(anchorFor(anchors, { animation: 'walk', frame: 1 }), { x: 0.2, y: 0.3, rotation: 0 });
  assert.equal(anchorFor(anchors, { animation: 'walk', frame: 2 }), null); // hidden frame
  assert.deepEqual(anchorFor(anchors, { animation: 'sleep', frame: 5 }), { x: 0.6, y: 0.4, rotation: 0 });
  assert.equal(anchorFor(anchors, { animation: 'climb' }), null);
  assert.deepEqual(anchorFor(anchors, { animation: 'idle', frame: 3 }), { x: 0.5, y: 0.1, rotation: 0 });
  // A reaction and an animation with the same name are separate entries.
  assert.deepEqual(anchorFor(anchors, { reaction: 'petted', frame: 0 }), { x: 0.3, y: 0.3, rotation: 0 });
  assert.deepEqual(anchorFor(anchors, { animation: 'petted' }), { x: 0.5, y: 0.1, rotation: 0 });
  // Slots offset the point, flipped when the head is upside down.
  const face = anchorFor(anchors, { animation: 'sleep', slot: 'face' });
  assert.ok(Math.abs(face.y - 0.5) < 1e-9);
  const up = anchorFor(anchors, { animation: 'ceiling', frame: 1, slot: 'face' });
  assert.ok(Math.abs(up.y - 0.72) < 1e-9 && up.rotation === 180);
  // Baby: points are scaled around the bottom center.
  const baby = anchorFor(anchors, { animation: 'sleep', stage: 'baby' });
  assert.ok(Math.abs(baby.x - 0.575) < 1e-9 && Math.abs(baby.y - 0.55) < 1e-9);
  assert.equal(accessorySlot('glasses'), 'face');
  assert.equal(accessorySlot('medal'), 'neck');
  assert.equal(accessorySlot('crown'), 'top');
});

test('anchorsOverrides : entrées invalides ignorées', () => {
  const bad = anchorsOverrides({
    animations: { sleep: [2, 0], walk: [[0.1, 0.1], true], idle: { rotation: 90, points: [0.1, 0.1] }, 'bad key': false, run: [] },
    reactions: { petted: 'x' },
    slots: { face: { dx: 5, dy: 0 }, ear: { dx: 0, dy: 0 } },
    stageFit: { baby: { scale: 0 }, adult: { scale: 1 } },
  });
  assert.deepEqual(bad.ignored, [
    'animations.sleep', 'animations.walk', 'animations.idle', 'animations.bad key', 'animations.run',
    'reactions.petted', 'slots.face', 'slots.ear', 'stageFit.baby', 'stageFit.adult',
  ]);
  assert.deepEqual(bad.anchors.animations, {});
  assert.deepEqual(anchorsOverrides({ animations: [] }).ignored, ['animations']);
});

test('accessoryPlacement : tête à l\'envers, l\'accessoire pend sous le point', () => {
  const box = { x: 0, y: 0, width: 32, height: 32 };
  const up = accessoryPlacement('crown', box, { x: 0.5, y: 0.5 }, 1);
  const down = accessoryPlacement('crown', box, { x: 0.5, y: 0.5 }, 1, 180);
  assert.equal(up.y + up.size, 16);
  assert.equal(down.y, 16);
  const bow = accessoryPlacement('bow', box, { x: 0.5, y: 0.5 }, 1, 180);
  assert.ok(bow.y < 16, 'un nœud (offset) recouvre le point');
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

test('trophées et farces : jamais en boutique, portables une fois obtenus', () => {
  const date = new Date(2026, 5, 1);
  assert.ok(!shopList(date, []).some((a) => isSpecial(a.id)));
  assert.deepEqual(trophiesFor(24), []);
  assert.deepEqual(trophiesFor(60).map((t) => t.id), ['medal', 'laurel']);
  assert.deepEqual(trophiesFor(1000).map((t) => t.id), ['medal', 'laurel', 'halo']);
  const wearable = equippable(date, ['medal', 'cone', 'bow']).map((a) => a.id);
  assert.deepEqual(wearable.sort(), ['bow', 'cone', 'medal']);
  assert.ok(!equippable(date, []).some((a) => isSpecial(a.id)));
});
