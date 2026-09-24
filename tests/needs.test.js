import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Needs, needMultiplier, needsOverrides, DEFAULT_DECAY_PER_HOUR } from '../core/needs.js';

const HOUR = 3600;

test('démarre à 80 partout, santé pleine, sans besoin urgent', () => {
  const n = new Needs();
  assert.equal(n.values.satiety, 80);
  assert.equal(n.values.health, 100);
  assert.equal(n.urgent(), null);
});

test('chaque jauge décroît de son débit par heure', () => {
  const n = new Needs();
  n.advance(HOUR);
  for (const [gauge, rate] of Object.entries(DEFAULT_DECAY_PER_HOUR)) {
    assert.ok(Math.abs(n.values[gauge] - (80 - rate)) < 1e-9, gauge);
  }
});

test("la difficulté multiplie les débits, les vacances figent tout", () => {
  const strict = new Needs({ rateScale: 2 });
  strict.advance(HOUR);
  assert.ok(Math.abs(strict.values.satiety - 70) < 1e-9);

  const vacation = new Needs({ rateScale: 0 });
  vacation.advance(10 * HOUR, { sleeping: true, active: true });
  assert.equal(vacation.values.satiety, 80);
  assert.equal(vacation.values.energy, 80);

  strict.setRateScale(0);
  strict.advance(HOUR);
  assert.ok(Math.abs(strict.values.satiety - 70) < 1e-9);
});

test('les débits du pack remplacent les défauts', () => {
  const n = new Needs({ rates: { energy: 0 } });
  n.advance(HOUR);
  assert.equal(n.values.energy, 80);
  assert.ok(n.values.satiety < 80);
});

test('les jauges restent entre 0 et 100', () => {
  const n = new Needs();
  n.advance(1000 * HOUR);
  for (const v of Object.values(n.values)) assert.ok(v >= 0 && v <= 100);
  for (let i = 0; i < 20; i++) n.feed(40);
  assert.equal(n.values.satiety, 100);
});

test("dormir recharge l'énergie et ralentit les autres jauges", () => {
  const n = new Needs();
  n.values.energy = 20;
  n.advance(HOUR, { sleeping: true });
  assert.ok(n.values.energy > 70, `énergie ${n.values.energy}`);
  assert.ok(Math.abs(n.values.satiety - (80 - 5 * 0.25)) < 1e-9);
});

test("une activité physique fait gagner de la stimulation malgré le débit", () => {
  const n = new Needs();
  n.advance(HOUR, { active: true });
  assert.ok(n.values.stimulation > 80);
});

test('effets ponctuels', () => {
  const n = new Needs();
  n.values.satiety = 30;
  n.values.cleanliness = 30;
  n.feed(40);
  n.apply('washed');
  assert.equal(n.values.satiety, 70);
  assert.equal(n.values.cleanliness, 60);
  n.apply('petted');
  assert.equal(n.values.affection, 88);
  n.apply('annoyed');
  assert.equal(n.values.affection, 84);
  n.apply('inconnu');
  assert.equal(n.values.affection, 84);
});

test('la santé baisse quand tout est négligé et remonte quand ça va', () => {
  const n = new Needs();
  for (const g of ['satiety', 'energy', 'cleanliness', 'stimulation', 'affection']) n.values[g] = 5;
  n.advance(HOUR);
  assert.ok(n.values.health < 100);
  const low = n.values.health;

  for (const g of ['satiety', 'energy', 'cleanliness', 'stimulation', 'affection']) n.values[g] = 90;
  n.advance(HOUR);
  assert.ok(n.values.health > low);
});

test('humeur dérivée et besoin urgent', () => {
  const n = new Needs();
  n.values.stimulation = 10;
  n.values.affection = 20;
  assert.equal(n.urgent(), 'stimulation');
  n.values.health = 30;
  assert.equal(n.urgent(), 'health', 'la santé est prioritaire');

  const fresh = new Needs();
  assert.ok(fresh.mood > 75 && fresh.mood <= 100);
  fresh.values.health = 0;
  assert.ok(fresh.mood < 50);
});

test('needMultiplier : neutre au milieu, boost quand bas, réduit quand comblé', () => {
  assert.equal(needMultiplier(70), 1);
  assert.equal(needMultiplier(0, { boost: 6 }), 6);
  assert.equal(needMultiplier(95, { satisfied: 0.3 }), 0.3);
  assert.ok(needMultiplier(30, { boost: 5 }) > 1 && needMultiplier(30, { boost: 5 }) < 5);
});

test('catchUp : demi-débit, plafonné, nul en vacances', () => {
  const n = new Needs();
  n.catchUp(2 * HOUR);
  assert.ok(Math.abs(n.values.satiety - (80 - 5)) < 0.5, `${n.values.satiety}`);

  const capped = new Needs();
  capped.catchUp(1000 * HOUR);
  const eight = new Needs();
  eight.catchUp(8 * HOUR);
  assert.ok(Math.abs(capped.values.satiety - eight.values.satiety) < 1e-6);

  const vacation = new Needs({ rateScale: 0 });
  vacation.catchUp(5 * HOUR);
  assert.equal(vacation.values.satiety, 80);

  const none = new Needs();
  none.catchUp(-5);
  none.catchUp(NaN);
  assert.equal(none.values.satiety, 80);
});

test('aller-retour de sérialisation et données invalides tolérées', () => {
  const a = new Needs();
  a.values.satiety = 12.34;
  const b = new Needs();
  b.restore(a.serialize());
  assert.ok(Math.abs(b.values.satiety - 12.3) < 1e-9);

  const c = new Needs();
  c.restore({ satiety: 'x', energy: 500, health: -3, bidon: 1 });
  assert.equal(c.values.satiety, 80);
  assert.equal(c.values.energy, 100);
  assert.equal(c.values.health, 0);
  c.restore(null);
  c.restore('texte');
});

test('needsOverrides garde les débits valides et signale le reste', () => {
  const { rates, ignored } = needsOverrides({
    decayPerHour: { energy: 3, satiety: -1, health: 2, cleanliness: 'x' },
    autre: 1,
  });
  assert.deepEqual(rates, { energy: 3 });
  assert.deepEqual(ignored.sort(), ['autre', 'decayPerHour.cleanliness', 'decayPerHour.health', 'decayPerHour.satiety']);
  assert.deepEqual(needsOverrides(undefined), { rates: {}, diet: {}, prey: {}, ignored: [] });
});

test('feed et boost bornent la jauge ; le lit majore le gain de sommeil', () => {
  const n = new Needs();
  n.feed(1000);
  assert.equal(n.values.satiety, 100);
  n.boost('inconnue', 5);
  n.boost('affection', NaN);
  assert.equal(n.values.affection, 80);

  const plain = new Needs();
  const bed = new Needs();
  plain.values.energy = 10;
  bed.values.energy = 10;
  plain.advance(1800, { sleeping: true });
  bed.advance(1800, { sleeping: true, sleepFactor: 1.5 });
  assert.ok(bed.values.energy > plain.values.energy);
});

test('needsOverrides : régime valide, aliments inconnus ou gains invalides signalés', () => {
  const { diet, ignored } = needsOverrides({ diet: { fish: 60, pizza: 5, meat: -1, seeds: 'x' } });
  assert.deepEqual(diet, { fish: 60 });
  assert.deepEqual(ignored.sort(), ['diet.meat', 'diet.pizza', 'diet.seeds']);
});

test('jeu, brossage et ronronnement ont leurs effets', () => {
  const n = new Needs();
  n.values.stimulation = 40;
  n.values.cleanliness = 40;
  n.apply('played');
  assert.equal(n.values.stimulation, 65);
  n.apply('brushed');
  assert.equal(n.values.cleanliness, 65);
  const before = n.values.affection;
  n.apply('purring');
  assert.equal(n.values.affection, before + 12 > 100 ? 100 : before + 12);
});
