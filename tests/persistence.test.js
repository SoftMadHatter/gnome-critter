import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Critter, State } from '../core/critter.js';
import { computeSurfaces } from '../core/surfaceMap.js';
import { serializeCritters, parseSavedState } from '../core/persistence.js';

const bounds = { x: 0, y: 0, width: 1000, height: 500 };
const ctx = { packIds: ['cat'], bounds };

test('aller-retour sérialisation / lecture', () => {
  const a = new Critter({}, { x: 120, y: 300 });
  a.facing = -1;
  const text = serializeCritters(['cat', 'cat'], [a, new Critter({}, { x: 800, y: 50 })]);
  const back = parseSavedState(text, { packIds: ['cat', 'cat'], bounds });
  assert.equal(back.length, 2);
  assert.deepEqual(
    { x: back[0].x, y: back[0].y, facing: back[0].facing },
    { x: 120, y: 300, facing: -1 },
  );
  assert.equal(back[0].extra.needs.satiety, 80);
  assert.equal(back[1].x, 800);
});

test('texte vide, JSON invalide, version ou pack différents : aucune sauvegarde', () => {
  assert.deepEqual(parseSavedState('', ctx), []);
  assert.deepEqual(parseSavedState('{pas du json', ctx), []);
  assert.deepEqual(parseSavedState('null', ctx), []);
  assert.deepEqual(parseSavedState(JSON.stringify({ version: 99, packIds: ['cat'], critters: [] }), ctx), []);
  const other = serializeCritters(['fish'], [new Critter({}, { x: 1, y: 1 })]);
  assert.deepEqual(parseSavedState(other, ctx), [undefined]);
});

test('entrées invalides écartées ou nettoyées', () => {
  const text = JSON.stringify({
    version: 1,
    packIds: ['cat', 'cat', 'cat'],
    critters: [
      { x: 'a', y: 3 },
      null,
      { x: 10, y: 20, facing: 7, extra: [1] },
    ],
  });
  const back = parseSavedState(text, { packIds: ['cat', 'cat', 'cat'], bounds });
  assert.equal(back.length, 3);
  assert.equal(back[0], undefined);
  assert.equal(back[1], undefined);
  assert.equal(back[2].facing, 1);
  assert.deepEqual(back[2].extra, {});
});

test('position hors des bornes ramenée dans les bornes', () => {
  const text = JSON.stringify({ version: 1, packIds: ['cat'], critters: [{ x: 5000, y: -40, facing: 1 }] });
  const [c] = parseSavedState(text, ctx);
  assert.equal(c.x, 1000);
  assert.equal(c.y, 0);
});

test('restore() : position posée, chute puis atterrissage', () => {
  const surfaces = computeSurfaces({ monitors: [{ x: 0, y: 0, width: 1000, height: 500 }], windows: [] });
  const c = new Critter({ random: () => 0.99 }, { x: 0, y: 0 });
  c.state = State.IDLE;
  c.restore({ x: 400, y: 100, facing: -1, extra: {} });
  assert.equal(c.state, State.FALL);
  assert.equal(c.x, 400);
  assert.equal(c.facing, -1);
  for (let i = 0; i < 200 && c.state === State.FALL; i++) c.tick(0.05, surfaces);
  assert.notEqual(c.state, State.FALL);
  assert.equal(c.y, 500);
});

test("la version 1 (position seule) reste lisible, sans rattrapage", () => {
  const text = JSON.stringify({ version: 1, packIds: ['cat'], critters: [{ x: 10, y: 20, facing: 1 }] });
  const [c] = parseSavedState(text, ctx);
  assert.equal(c.x, 10);
  assert.deepEqual(c.extra, {});
  assert.equal(c.elapsedSeconds, 0);
});

test('version courante : elapsedSeconds vient de savedAt, jamais négatif', () => {
  const text = serializeCritters(['cat'], [new Critter({}, { x: 1, y: 1 })], 1_000_000);
  assert.equal(parseSavedState(text, { ...ctx, nowMs: 1_000_000 + 90_000 })[0].elapsedSeconds, 90);
  assert.equal(parseSavedState(text, { ...ctx, nowMs: 1_000_000 - 5_000 })[0].elapsedSeconds, 0);
});
