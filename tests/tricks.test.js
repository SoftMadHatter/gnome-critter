import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrickBook, tricksOverrides, TRICKS } from '../core/tricks.js';
import { Critter, State } from '../core/critter.js';
import { Life } from '../core/life.js';
import { computeSurfaces } from '../core/surfaceMap.js';
import { createItem, tickItem, pickGift, isGone, GIFTS, serializeItems, parseSavedItems } from '../core/items.js';

const monitor = { x: 0, y: 0, width: 1000, height: 500 };

test('tricksOverrides : noms connus gardés, doublons et inconnus signalés', () => {
  assert.deepEqual(tricksOverrides(undefined), { list: [], ignored: [] });
  assert.deepEqual(tricksOverrides(['sit', 'roll', 'sit', 'moonwalk', 3]), { list: ['sit', 'roll'], ignored: ['sit', 'moonwalk', '3'] });
  assert.deepEqual(tricksOverrides('sit').ignored, ['tricks']);
});

test('TrickBook : la maîtrise monte à chaque essai, le tour est appris à 100', () => {
  const book = new TrickBook();
  let attempts = 0;
  let learnedAt = null;
  while (!book.isLearned('sit') && attempts < 50) {
    const { learned } = book.train('sit', () => 0.99);
    attempts += 1;
    if (learned) learnedAt = attempts;
  }
  assert.equal(learnedAt, attempts);
  assert.equal(book.skill('sit'), 100);
  assert.deepEqual(book.learned(), ['sit']);
  assert.equal(book.train('sit', () => 0.99).learned, false, 'annoncé une seule fois');
  assert.deepEqual(book.train('inconnu', () => 0), { success: false, learned: false });
});

test('TrickBook : la réussite suit la maîtrise, le caractère joue sur la vitesse', () => {
  const novice = new TrickBook();
  assert.equal(novice.train('roll', () => 0.5).success, false, 'chance minimale de 15 %');
  assert.equal(new TrickBook().train('roll', () => 0.1).success, true);
  const trained = new TrickBook();
  trained.skills.roll = 90;
  assert.equal(trained.train('roll', () => 0.85).success, true);

  const playful = new TrickBook();
  const lazy = new TrickBook();
  const plain = new TrickBook();
  playful.train('sit', () => 0.5, 'playful');
  lazy.train('sit', () => 0.5, 'lazy');
  plain.train('sit', () => 0.5, null);
  assert.ok(playful.skill('sit') > plain.skill('sit') && plain.skill('sit') > lazy.skill('sit'));
});

test('TrickBook : sérialisation tolérante', () => {
  const a = new TrickBook();
  a.skills.sit = 42.34;
  const b = new TrickBook();
  b.restore(a.serialize());
  assert.equal(b.skill('sit'), 42.3);
  b.restore({ sit: 'x', roll: 500, moonwalk: 5 });
  assert.equal(b.skill('sit'), 42.3);
  assert.equal(b.skill('roll'), 100);
  assert.equal(b.skill('moonwalk'), 0);
  b.restore(null);
});

function groundedCat(config = {}) {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = new Critter({ random: () => 0.05, tricks: ['sit', 'roll'], needsRateScale: 0, ...config }, { x: 300, y: 500 });
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.state = State.IDLE;
  c.stateTimer = 1e9;
  return { c, surfaces };
}

test("entraîner : un essai réussi lance le tour, l'apprentissage est annoncé", () => {
  const { c, surfaces } = groundedCat();
  assert.equal(c.trainTrick('sit'), true);
  assert.equal(c.state, State.TRICK);
  assert.equal(c.snapshot().trick, 'sit');
  assert.equal(c.stats.get('tricksPerformed'), 1);

  const events = [];
  for (let i = 0; i < 30 * 4; i++) events.push(c.tick(1 / 30, surfaces, { worldBounds: monitor }).event);
  assert.equal(c.state, State.IDLE, 'le tour se termine');
  assert.equal(c.snapshot().trick, null);

  for (let n = 0; n < 12; n++) {
    c.state = State.IDLE;
    c.stateTimer = 1e9;
    c.trainTrick('sit');
    events.push(c.tick(1 / 30, surfaces, { worldBounds: monitor }).event);
    c.state = State.IDLE;
  }
  assert.ok(events.includes('trickLearned'));
  assert.ok(c.tricks.isLearned('sit'));
});

test('un essai raté fait hésiter, sans tour', () => {
  const { c, surfaces } = groundedCat({ random: () => 0.99 });
  assert.equal(c.trainTrick('roll'), false);
  assert.equal(c.state, State.IDLE);
  assert.equal(c.tick(1 / 30, surfaces, { worldBounds: monitor }).event, 'noticed');
});

test("« Faire » un tour exige de l'avoir appris ; les tours d'une autre espèce sont refusés", () => {
  const { c } = groundedCat();
  assert.equal(c.performTrick('sit'), false);
  c.tricks.skills.sit = 100;
  assert.equal(c.performTrick('sit'), true);
  const other = groundedCat({ tricks: ['flip'] });
  other.c.tricks.skills.sit = 100;
  assert.equal(other.c.performTrick('sit'), false);
  assert.equal(other.c.trainTrick('sit'), false);
});

test('pas de tour dans l\'œuf, en chute ou en hibernation ; les tours sont sauvegardés', () => {
  const { c } = groundedCat();
  c.state = State.FALL;
  assert.equal(c.trainTrick('sit'), false);
  c.state = State.IDLE;
  c.life.hibernating = true;
  assert.equal(c.trainTrick('sit'), false);
  c.life.hibernating = false;
  c.tricks.skills.roll = 55;
  const back = new Critter({ tricks: ['sit', 'roll'] }, { x: 0, y: 0 });
  back.restore(c.serialize());
  assert.equal(back.tricks.skill('roll'), 55);
  assert.ok(TRICKS.sit.duration > 0);
});

function giftCritter(config = {}) {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = new Critter(
    {
      random: () => 0.1, walkWeight: 0, sleepWeight: 0, washWeight: 0, followWeight: 0, runWeight: 0,
      needsRateScale: 0, giftWeight: 1000, giftCooldown: 0, ...config,
    },
    { x: 100, y: 500 },
  );
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.state = State.IDLE;
  c.stateTimer = 0;
  c.needs.values.affection = 90;
  return { c, surfaces };
}

test('un animal très affectueux va offrir un cadeau près du curseur, une seule fois par délai', () => {
  const { c, surfaces } = giftCritter({ giftCooldown: 1200 });
  const pointer = { x: 600, y: 300 };
  c._clock = 5000; // au-delà du délai de départ
  let snap = c.tick(1 / 30, surfaces, { worldBounds: monitor, pointer });
  assert.equal(snap.state, State.GIFT);

  const events = new Set();
  for (let i = 0; i < 30 * 15 && c.state === State.GIFT; i++) {
    snap = c.tick(1 / 30, surfaces, { worldBounds: monitor, pointer });
    if (snap.event) events.add(snap.event);
  }
  assert.ok(events.has('gift'));
  const gift = c.takeGift();
  assert.ok(gift && Object.keys(GIFTS).includes(gift.kind));
  assert.ok(Math.abs(gift.x - 600) < 40);
  assert.equal(c.takeGift(), null);
  assert.equal(c.stats.get('giftsGiven'), 1);

  c.state = State.IDLE;
  c.stateTimer = 0;
  assert.notEqual(c.tick(1 / 30, surfaces, { worldBounds: monitor, pointer }).state, State.GIFT, 'délai de 20 minutes');
});

test("pas de cadeau si peu d'affection, sans curseur, ni pour un bébé ou un œuf", () => {
  const cold = giftCritter();
  cold.c.needs.values.affection = 20;
  assert.notEqual(cold.c.tick(1 / 30, cold.surfaces, { worldBounds: monitor, pointer: { x: 300, y: 300 } }).state, State.GIFT);

  const noPointer = giftCritter();
  assert.notEqual(noPointer.c.tick(1 / 30, noPointer.surfaces, { worldBounds: monitor }).state, State.GIFT);

  const baby = giftCritter();
  baby.c.setLife(new Life({ ageSeconds: 3600 }));
  assert.notEqual(baby.c.tick(1 / 30, baby.surfaces, { worldBounds: monitor, pointer: { x: 300, y: 300 } }).state, State.GIFT);
});

test('cadeau abandonné si le curseur disparaît : rien déposé, délai non consommé', () => {
  const { c, surfaces } = giftCritter();
  c.tick(1 / 30, surfaces, { worldBounds: monitor, pointer: { x: 900, y: 300 } });
  assert.equal(c.state, State.GIFT);
  c.tick(1 / 30, surfaces, { worldBounds: monitor });
  assert.equal(c.state, State.IDLE);
  assert.equal(c.takeGift(), null);
  assert.equal(c.stats.get('giftsGiven'), 0);
});

test('objets cadeau : tombent, expirent, se sauvegardent ; pickGift respecte les proportions', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const coin = createItem('gift', 'coin', 300, 50);
  for (let i = 0; i < 300; i++) tickItem(coin, 1 / 60, surfaces, monitor);
  assert.equal(coin.y, 500);
  assert.ok(!isGone(coin));
  tickItem(coin, 2000, surfaces, monitor);
  assert.ok(isGone(coin), 'un cadeau oublié finit par disparaître');

  const flower = createItem('gift', 'flower', 100, 100);
  const back = parseSavedItems(serializeItems([flower]), { bounds: monitor });
  assert.equal(back.length, 1);
  assert.equal(back[0].type, 'gift');
  assert.equal(parseSavedItems(JSON.stringify({ version: 1, items: [{ type: 'gift', kind: 'ruby', x: 1, y: 1 }] }), { bounds: monitor }).length, 0);

  assert.equal(pickGift(() => 0.1), 'coin');
  assert.equal(pickGift(() => 0.7), 'flower');
  assert.equal(pickGift(() => 0.95), 'feather');
});
