import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Life, modifiersFor, stagesOverrides, DEFAULT_STAGE_HOURS } from '../core/life.js';

const HOUR = 3600;
const calm = { mood: 80, health: 100 };

function seq(...values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

test('un adulte neutre par défaut, sans caractère', () => {
  const life = new Life();
  assert.equal(life.stage, 'adult');
  assert.equal(life.trait, null);
  assert.equal(life.scale, 1);
});

test('create : caractère et couleur tirés ; sans croissance : adulte, avec croissance : œuf', () => {
  const egg = Life.create(seq(0.3, 0.9, 0.5), { growth: true });
  assert.equal(egg.stage, 'egg');
  assert.equal(egg.trait, 'lazy');
  assert.ok(egg.appearance.hue >= -35 && egg.appearance.hue <= 35);
  assert.equal(egg.appearance.tone, 180);

  const adult = Life.create(seq(0.9, 0.5, 0.5), { growth: false });
  assert.equal(adult.stage, 'adult');
  assert.equal(adult.trait, 'shy');
});

test('les stades suivent les seuils d\'âge, avec échelle par stade', () => {
  const life = Life.create(seq(0.1, 0.5, 0.5), { growth: true });
  const stageAt = (hours) => {
    life.ageSeconds = hours * HOUR;
    return life.stage;
  };
  assert.equal(stageAt(0.1), 'egg');
  assert.equal(stageAt(DEFAULT_STAGE_HOURS.baby), 'baby');
  assert.equal(life.scale, 0.5);
  assert.equal(stageAt(DEFAULT_STAGE_HOURS.young), 'young');
  assert.equal(life.scale, 0.75);
  assert.equal(stageAt(DEFAULT_STAGE_HOURS.adult), 'adult');
  assert.equal(stageAt(DEFAULT_STAGE_HOURS.senior), 'senior');
});

test('advance : éclosion, passage de stade, vitesse de croissance et vacances', () => {
  const life = Life.create(seq(0.1, 0.5, 0.5), { growth: true });
  assert.deepEqual(life.advance(0.2 * HOUR, calm), []);
  assert.deepEqual(life.advance(0.1 * HOUR, calm), ['hatched']);
  assert.equal(life.stage, 'baby');

  const before = life.ageSeconds;
  life.advance(HOUR, { ...calm, ageScale: 0 });
  assert.equal(life.ageSeconds, before, 'vacances : âge figé');

  assert.deepEqual(life.advance(HOUR, { ...calm, ageScale: 10 }), ['grew']);
  assert.equal(life.stage, 'young');
});

test("l'évolution au passage à l'adulte dépend des soins reçus", () => {
  const evolve = (mood) => {
    const life = Life.create(seq(0.1, 0.5, 0.5), { growth: true });
    life.ageSeconds = 40 * HOUR;
    life.care = mood;
    const events = life.advance(10 * HOUR, { mood, health: 100 });
    assert.ok(events.includes('evolved'));
    return life;
  };
  assert.equal(evolve(95).evolution, 'devoted');
  assert.equal(evolve(95).appearance.saturation, 1.2);
  assert.equal(evolve(20).evolution, 'neglected');
  assert.equal(evolve(20).appearance.saturation, 0.7);
  assert.equal(evolve(55).evolution, 'normal');
});

test('négligence prolongée : hibernation ; réveil ; la difficulté et les vacances comptent', () => {
  const life = new Life({ trait: 'lazy' });
  assert.deepEqual(life.advance(5 * HOUR, { mood: 5, health: 5 }), []);
  assert.deepEqual(life.advance(2 * HOUR, { mood: 5, health: 5 }), ['hibernated']);
  assert.ok(life.hibernating);
  assert.deepEqual(life.advance(HOUR, calm), [], "rien n'avance en hibernation");
  assert.equal(life.wake(), true);
  assert.equal(life.hibernating, false);
  assert.equal(life.neglectSeconds, 0);
  assert.equal(life.wake(), false);

  const vacation = new Life();
  vacation.advance(100 * HOUR, { mood: 5, health: 5, needsScale: 0 });
  assert.ok(!vacation.hibernating);

  const strict = new Life();
  assert.deepEqual(strict.advance(3.5 * HOUR, { mood: 5, health: 5, needsScale: 2 }), ['hibernated']);
});

test('la négligence se résorbe quand la santé remonte', () => {
  const life = new Life();
  life.advance(3 * HOUR, { mood: 5, health: 5 });
  life.advance(3 * HOUR, calm);
  assert.equal(life.neglectSeconds, 0);
});

test('catchUp : demi-vitesse, plafonné, sans effet en hibernation', () => {
  const life = Life.create(seq(0.1, 0.5, 0.5), { growth: true });
  life.catchUp(2 * HOUR);
  assert.equal(Math.round(life.ageSeconds), HOUR);

  const capped = Life.create(seq(0.1, 0.5, 0.5), { growth: true });
  capped.catchUp(1000 * HOUR);
  assert.equal(Math.round(capped.ageSeconds), 4 * HOUR);

  const sleeping = new Life({ hibernating: true, ageSeconds: 10 });
  sleeping.catchUp(5 * HOUR);
  assert.equal(sleeping.ageSeconds, 10);
});

test('modifiersFor : traits et stades se cumulent', () => {
  const lazy = modifiersFor('lazy', 'adult');
  assert.equal(lazy.weights.sleepWeight, 1.8);
  assert.equal(lazy.decay.energy, 0.8);
  const babyLazy = modifiersFor('lazy', 'baby');
  assert.ok(Math.abs(babyLazy.weights.sleepWeight - 1.8 * 1.5) < 1e-9);
  assert.equal(babyLazy.speed, 0.7);
  assert.equal(babyLazy.decay.all, 1.2);
  assert.deepEqual(modifiersFor(null, 'adult'), { weights: {}, speed: 1, decay: {} });
  assert.equal(modifiersFor('shy', 'adult').weights.greetWeight, 0.4);
});

test('serialize / restore, données invalides tolérées', () => {
  const a = Life.create(seq(0.6, 0.2, 0.8), { growth: true });
  a.ageSeconds = 5 * HOUR;
  a.care = 61.234;
  const b = new Life();
  b.restore(a.serialize());
  assert.equal(b.trait, a.trait);
  assert.equal(b.ageSeconds, 5 * HOUR);
  assert.equal(b.appearance.tone, Math.round(a.appearance.tone * 10) / 10);

  const c = new Life({ trait: 'lazy' });
  c.restore({ trait: 'zzz', ageSeconds: 'x', appearance: { hue: 'a', saturation: 99 }, care: -5, hibernating: 'oui' });
  assert.equal(c.trait, null);
  assert.equal(c.stage, 'adult');
  assert.equal(c.appearance.saturation, 1.5);
  assert.equal(c.care, 0);
  assert.equal(c.hibernating, false);
  c.restore(null);
  c.restore('texte');
});

test('stagesOverrides : échelles valides gardées, le reste signalé', () => {
  const { scales, ignored } = stagesOverrides({ baby: { scale: 0.6 }, adult: { scale: 9 }, larve: { scale: 1 }, senior: {} });
  assert.deepEqual(scales, { baby: 0.6 });
  assert.deepEqual(ignored.sort(), ['adult', 'larve', 'senior']);
  assert.deepEqual(stagesOverrides(undefined), { scales: {}, folders: {}, ignored: [] });
});

test('stagesOverrides : dossier de stade, échelle facultative, chemins dangereux refusés', () => {
  const { scales, folders, ignored } = stagesOverrides({
    baby: { folder: 'sprites/baby' },
    young: { scale: 0.8, folder: 'sprites/young' },
    senior: { folder: '../evil' },
    adult: { folder: '/etc' },
  });
  assert.deepEqual(folders, { baby: 'sprites/baby', young: 'sprites/young' });
  assert.deepEqual(scales, { baby: 1, young: 0.8 });
  assert.deepEqual(ignored.sort(), ['adult', 'senior']);
});

test('le réglage de taille multiplie l’échelle du stade', () => {
  const life = new Life({}, { scales: { adult: 1, baby: 0.5 } });
  assert.equal(life.scale, 1);
  life.sizeFactor = 2;
  assert.equal(life.scale, 2);
  assert.equal(life.snapshot().scale, 2);
});
