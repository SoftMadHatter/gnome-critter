import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopList, equippable, inSeason, anchorsOverrides, anchorEntry, anchorFor, accessorySlot, accessoryPlacement, layoutFor, ACCESSORY_LAYOUT, ACCESSORIES, FOOD_PRICES, isSpecial, trophiesFor } from '../core/accessories.js';
import { ACCESSORY_METRICS } from '../core/accessoryMetrics.js';
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
  assert.deepEqual(Object.keys(none.anchors.slots), ['top', 'face', 'neck']);
  assert.equal(none.anchors.headWidth, 0.375);
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
  assert.deepEqual(anchors.slots.neck, { dx: -0.1, dy: 0.85 }); // default kept
  // The head point of a frame, an animation (all frames), then the pack's fallback.
  assert.deepEqual(anchorFor(anchors, { animation: 'walk', frame: 1 }), { x: 0.2, y: 0.3, rotation: 0, headWidth: 0.375 });
  assert.equal(anchorFor(anchors, { animation: 'walk', frame: 2 }), null); // hidden frame
  assert.deepEqual(anchorFor(anchors, { animation: 'sleep', frame: 5 }), { x: 0.6, y: 0.4, rotation: 0, headWidth: 0.375 });
  assert.equal(anchorFor(anchors, { animation: 'climb' }), null);
  assert.deepEqual(anchorFor(anchors, { animation: 'idle', frame: 3 }), { x: 0.5, y: 0.1, rotation: 0, headWidth: 0.375 });
  // A reaction and an animation with the same name are separate entries.
  assert.deepEqual(anchorFor(anchors, { reaction: 'petted', frame: 0 }), { x: 0.3, y: 0.3, rotation: 0, headWidth: 0.375 });
  assert.deepEqual(anchorFor(anchors, { animation: 'petted' }), { x: 0.5, y: 0.1, rotation: 0, headWidth: 0.375 });
  // Slots offset the point, flipped when the head is upside down.
  const face = anchorFor(anchors, { animation: 'sleep', slot: 'face' });
  assert.ok(Math.abs(face.y - 0.4375) < 1e-9);
  const up = anchorFor(anchors, { animation: 'ceiling', frame: 1, slot: 'face' });
  assert.ok(Math.abs(up.y - 0.7825) < 1e-9 && up.rotation === 180);
  // Baby: points are scaled around the bottom center.
  const baby = anchorFor(anchors, { animation: 'sleep', stage: 'baby' });
  assert.ok(Math.abs(baby.x - 0.575) < 1e-9 && Math.abs(baby.y - 0.55) < 1e-9);
  assert.ok(Math.abs(baby.headWidth - 0.28125) < 1e-9);
  assert.equal(accessorySlot('glasses'), 'face');
  assert.equal(accessorySlot('medal'), 'neck');
  assert.equal(accessorySlot('crown'), 'top');
});

test('anchorsOverrides : entrées invalides ignorées', () => {
  const bad = anchorsOverrides({
    animations: { sleep: [2, 0], walk: [[0.1, 0.1], true], idle: { rotation: 90, points: [0.1, 0.1] }, 'bad key': false, run: [] },
    reactions: { petted: 'x' },
    slots: { face: { dx: 5, dy: 0 }, ear: { dx: 0, dy: 0 } },
    headWidth: 0,
    stageFit: { baby: { scale: 0 }, adult: { scale: 1 } },
  });
  assert.deepEqual(bad.ignored, [
    'animations.sleep', 'animations.walk', 'animations.idle', 'animations.bad key', 'animations.run',
    'reactions.petted', 'slots.face', 'slots.ear', 'headWidth', 'stageFit.baby', 'stageFit.adult',
  ]);
  assert.deepEqual(bad.anchors.animations, {});
  assert.deepEqual(anchorsOverrides({ animations: [] }).ignored, ['animations']);
});

test('anchorFor : retouches, points générés, stades et largeur de tête', () => {
  const { anchors, ignored } = anchorsOverrides({
    headWidth: 0.4,
    slots: { face: { dx: 0.1, dy: 1 } },
    base: {
      animations: {
        walk: [[0.5, 0.2], [0.5, 0.25]],
        sleep: { width: 0.3, points: [0.6, 0.5] },
        ceiling: { rotation: 180, points: [0.5, 0.8] },
      },
      reactions: { petted: [[0.4, 0.3]] },
    },
    animations: { walk: [[0.55, 0.3], [0.55, 0.35]] },
    stages: {
      baby: { headWidth: 0.5, base: { animations: { walk: [[0.6, 0.4], [0.6, 0.45]] } }, animations: { sleep: [0.2, 0.2] } },
    },
  });
  assert.deepEqual(ignored, []);
  const at = (pose) => anchorFor(anchors, pose);
  // A touch-up wins over the generated point; without one, the generated point is used.
  assert.deepEqual(at({ animation: 'walk', frame: 1 }), { x: 0.55, y: 0.35, rotation: 0, headWidth: 0.4 });
  assert.deepEqual(at({ reaction: 'petted' }), { x: 0.4, y: 0.3, rotation: 0, headWidth: 0.4 });
  // The entry's own head width wins over the pack's.
  assert.equal(at({ animation: 'sleep' }).headWidth, 0.3);
  // The head point is offset by the slot, in head widths.
  const mask = at({ animation: 'walk', frame: 0, slot: 'face' });
  assert.ok(Math.abs(mask.x - 0.59) < 1e-9 && Math.abs(mask.y - 0.7) < 1e-9);
  const face = at({ animation: 'sleep', slot: 'face' });
  assert.ok(Math.abs(face.y - 0.8) < 1e-9, 'dy of 1 head width = the entry\'s width (0.3)');
  assert.ok(Math.abs(at({ animation: 'ceiling', slot: 'face' }).y - 0.4) < 1e-9, 'upside down: the offset goes up');
  // A stage block: its touch-ups, then its generated points, then the adult's.
  assert.deepEqual(at({ animation: 'walk', frame: 1, stage: 'baby' }), { x: 0.6, y: 0.45, rotation: 0, headWidth: 0.5 });
  assert.deepEqual(at({ animation: 'sleep', stage: 'baby' }), { x: 0.2, y: 0.2, rotation: 0, headWidth: 0.5 });
  assert.deepEqual(at({ reaction: 'petted', stage: 'baby' }), { x: 0.4, y: 0.3, rotation: 0, headWidth: 0.5 });
  assert.deepEqual(at({ animation: 'walk', stage: 'senior' }), { x: 0.55, y: 0.3, rotation: 0, headWidth: 0.4 });
});

test('anchorsOverrides : base et stades invalides ignorés', () => {
  const bad = anchorsOverrides({
    base: { animations: { walk: [2, 2] }, other: {} },
    stages: { baby: { headWidth: 0, base: { reactions: { petted: 'x' } }, size: 1 }, adult: {} },
    headWidth: 2,
  });
  assert.deepEqual(bad.ignored, ['base.animations.walk', 'base.other', 'stages.baby.headWidth', 'stages.baby.base.reactions.petted', 'stages.baby.size', 'stages.adult', 'headWidth']);
});

test('accessoryPlacement : taille proportionnelle à la tête de l\'espèce', () => {
  const box = { x: 0, y: 0, width: 32, height: 32 };
  const wide = accessoryPlacement('partyhat', box, { x: 0.5, y: 0.5, headWidth: 0.375 }, 1);
  const narrow = accessoryPlacement('partyhat', box, { x: 0.5, y: 0.5, headWidth: 0.25 }, 1);
  assert.ok(narrow.size < wide.size);
  assert.ok(Math.abs(narrow.size / wide.size - 0.25 / 0.375) < 0.1);
  // A bow is much smaller than a hat, whatever the species.
  assert.ok(accessoryPlacement('bow', box, { x: 0.5, y: 0.5, headWidth: 0.375 }, 1).size < wide.size);
  // The drawn part, not the image, spans the layout's width: the party hat covers 0.9 head width.
  const m = ACCESSORY_METRICS.partyhat;
  assert.ok(Math.abs((wide.size * (m.x1 - m.x0)) / 32 - 0.9 * 0.375 * 32) < 1);
  for (const id of Object.keys(ACCESSORIES)) assert.ok(ACCESSORY_METRICS[id], `métriques de ${id}`);
});

test('accessoryPlacement : un chapeau repose sur le point, à l\'envers il pend dessous', () => {
  const box = { x: 0, y: 0, width: 64, height: 64 };
  const anchor = { x: 0.5, y: 0.5, headWidth: 0.375 };
  const m = ACCESSORY_METRICS.crown;
  const up = accessoryPlacement('crown', box, anchor, 1);
  const down = accessoryPlacement('crown', box, anchor, 1, 180);
  assert.ok(Math.abs(up.y + (up.size * m.y1) / 32 - 32) <= 1, 'le bas de la couronne touche le point');
  assert.ok(Math.abs(down.y + (down.size * (32 - m.y1)) / 32 - 32) <= 1, 'tête à l\'envers : la couronne est retournée sous le point');
  assert.ok(down.y + down.size > 32 && up.y < 32);
  // Facing left mirrors the horizontal position around the box.
  const left = accessoryPlacement('crown', box, { ...anchor, x: 0.8 }, -1);
  const right = accessoryPlacement('crown', box, { ...anchor, x: 0.8 }, 1);
  assert.ok(Math.abs(left.x + left.size / 2 - (64 - (right.x + right.size / 2))) <= 2);
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

test('anchorEntry : d\'où vient le point (retouche ou généré, stade ou adulte)', () => {
  const { anchors } = anchorsOverrides({
    base: { animations: { walk: [[0.5, 0.2]], run: [0.4, 0.4] } },
    animations: { walk: [[0.55, 0.2]] },
    stages: { baby: { base: { animations: { run: [0.6, 0.6] } } } },
  });
  const from = (pose) => { const f = anchorEntry(anchors, pose); return f && [f.source, f.stage]; };
  assert.deepEqual(from({ animation: 'walk' }), ['touch-up', false]);
  assert.deepEqual(from({ animation: 'run' }), ['generated', false]);
  assert.deepEqual(from({ animation: 'run', stage: 'baby' }), ['generated', true]);
  assert.deepEqual(from({ animation: 'walk', stage: 'baby' }), ['touch-up', false]);
  assert.equal(anchorEntry(anchors, { animation: 'fly' }), null);
  assert.equal(anchorEntry(anchors, { reaction: 'walk' }), null, 'une réaction n\'est pas une animation');
});

test('layout : surcharges par pack validées, fusionnées avec le code', () => {
  const { anchors, ignored } = anchorsOverrides({
    layout: { bow: { span: 0.3, at: [0.5, 0.2], slot: 'top' }, crown: { span: 9, shift: 0.1, colour: 'red' }, ghost: { span: 1 }, medal: 'x' },
  });
  assert.deepEqual(ignored, ['layout.crown.span', 'layout.crown.colour', 'layout.ghost', 'layout.medal']);
  assert.deepEqual(anchors.layout, { bow: { span: 0.3, at: [0.5, 0.2], slot: 'top' }, crown: { shift: 0.1 } });
  assert.equal(accessorySlot('bow'), 'neck');
  assert.equal(accessorySlot('bow', anchors), 'top');
  assert.deepEqual(layoutFor('crown', anchors), { span: 0.95, shift: 0.1 });
  assert.deepEqual(layoutFor('bow'), ACCESSORY_LAYOUT.bow);
  const box = { x: 0, y: 0, width: 64, height: 64 };
  const anchor = { x: 0.5, y: 0.5, headWidth: 0.375 };
  const small = accessoryPlacement('bow', box, anchor, 1, 0, layoutFor('bow', anchors));
  assert.ok(small.size < accessoryPlacement('bow', box, anchor, 1).size, 'le span du pack réduit le nœud');
});

test('hide : le visage et le cou disparaissent de dos, pas le dessus', () => {
  const { anchors, ignored } = anchorsOverrides({
    base: { animations: { climb: { hide: ['face', 'neck'], points: [0.5, 0.1] }, walk: [0.5, 0.2] } },
  });
  assert.deepEqual(ignored, []);
  assert.equal(anchorFor(anchors, { animation: 'climb', slot: 'face' }), null);
  assert.equal(anchorFor(anchors, { animation: 'climb', slot: 'neck' }), null);
  assert.ok(anchorFor(anchors, { animation: 'climb', slot: 'top' }));
  assert.ok(anchorFor(anchors, { animation: 'walk', slot: 'face' }));
  assert.deepEqual(anchorsOverrides({ base: { animations: { climb: { hide: ['back'], points: [0.5, 0.1] } } } }).ignored, ['base.animations.climb']);
});
