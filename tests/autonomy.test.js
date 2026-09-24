import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autonomyLevel, RELIEF } from '../core/autonomy.js';
import { Needs } from '../core/needs.js';
import { Life } from '../core/life.js';
import {
  PREY, PREY_TTL, movePreyOnSurface, movePreyFloating, pickSpawnPoint, PreySpawner,
  FLEE_ANIMAL_RADIUS,
} from '../core/prey.js';
import {
  createItem, tickItem, consume, fillBowl, isMoldy, isGone, edibleFor, serializeItems, parseSavedItems,
  BOWL_MOLD_SECONDS, BOWL_VANISH_SECONDS, PLANT_MAX_PORTIONS,
} from '../core/items.js';
import { computeSurfaces } from '../core/surfaceMap.js';

const HOUR = 3600;
const monitor = { x: 0, y: 0, width: 1000, height: 500 };
const stage = (name, hibernating = false) => ({ stage: name, hibernating });

test('autonomyLevel : modes du réglage', () => {
  const adult = stage('adult');
  assert.equal(autonomyLevel('off', adult), 0);
  assert.equal(autonomyLevel('partial', adult), 0.5);
  assert.equal(autonomyLevel('full', adult), 1);
});

test('autonomyLevel auto : suit la croissance et les tours appris', () => {
  assert.equal(autonomyLevel('auto', stage('baby')), 0);
  assert.equal(autonomyLevel('auto', stage('young')), 0.4);
  assert.equal(autonomyLevel('auto', stage('adult')), 0.7);
  assert.ok(Math.abs(autonomyLevel('auto', stage('adult'), 2) - 0.9) < 1e-9);
  assert.equal(autonomyLevel('auto', stage('adult'), 9), 1, 'plafonné à 1');
  assert.equal(autonomyLevel('auto', stage('senior'), 0), 0.7);
});

test('œuf et hibernant : jamais autonomes, même en mode total', () => {
  assert.equal(autonomyLevel('full', stage('egg')), 0);
  assert.equal(autonomyLevel('full', stage('adult', true)), 0);
});

test("l'autonomie ralentit la baisse des besoins sans jamais l'annuler", () => {
  const normal = new Needs();
  const auto = new Needs();
  auto.setAutonomy(1);
  normal.advance(HOUR);
  auto.advance(HOUR);
  const lostNormal = 80 - normal.values.satiety;
  const lostAuto = 80 - auto.values.satiety;
  assert.ok(lostAuto > 0 && Math.abs(lostAuto - lostNormal * (1 - RELIEF)) < 1e-9);
  auto.setAutonomy(5);
  assert.ok(auto.autonomyFactor > 0, 'niveau borné à 1');
});

test("un animal autonome ne tombe pas dans la négligence (pas d'hibernation)", () => {
  const life = new Life({ trait: 'lazy' });
  assert.deepEqual(life.advance(20 * HOUR, { mood: 5, health: 5, needsScale: 1 * (1 - 1) }), []);
  assert.ok(!life.hibernating);
  const dependent = new Life();
  assert.ok(dependent.advance(8 * HOUR, { mood: 5, health: 5, needsScale: 1 }).includes('hibernated'));
});

// --- Proies ------------------------------------------------------------------------

const seg = { x1: 100, x2: 500, y: 500 };
const rng = (...v) => {
  let i = 0;
  return () => v[Math.min(i++, v.length - 1)];
};

function mouse(x = 300) {
  const p = createItem('prey', 'mouse', x, 500);
  p.surface = seg;
  return p;
}

test('une proie flâne : marche, fait demi-tour au bord, reste dans le segment', () => {
  const p = mouse(490);
  p.dir = 1;
  p.wanderTimer = 100;
  for (let i = 0; i < 60; i++) movePreyOnSurface(p, 1 / 30, seg, { random: rng(0.9) });
  assert.ok(p.x <= 498 && p.x >= 102);
  assert.equal(p.dir, -1, 'demi-tour au bord droit');

  const paused = mouse();
  paused.wanderTimer = 0;
  movePreyOnSurface(paused, 1, seg, { random: rng(0.1, 0.1) }); // r < 0.3 : pause
  assert.equal(paused.moving, false);
});

test('une proie fuit un animal proche, plus vite, dans le sens opposé', () => {
  const calm = mouse(300);
  calm.dir = 1;
  calm.wanderTimer = 100;
  movePreyOnSurface(calm, 1, seg, { random: rng(0.9) });
  const walked = calm.x - 300;

  const scared = mouse(300);
  movePreyOnSurface(scared, 1, seg, { threats: [{ x: 350, y: 500, radius: FLEE_ANIMAL_RADIUS }], random: rng(0.9) });
  assert.ok(scared.dir === -1 && scared.x < 300, 'fuit vers la gauche');
  assert.ok(300 - scared.x > walked * 1.8, 'plus vite que la flânerie');
  assert.equal(scared.fleeing, true);

  const far = mouse(300);
  far.wanderTimer = 100;
  movePreyOnSurface(far, 1, seg, { threats: [{ x: 800, y: 500, radius: FLEE_ANIMAL_RADIUS }], random: rng(0.9) });
  assert.equal(far.fleeing, false, 'menace hors de portée');
});

test('acculée à un bord, une proie qui fuit reste sur place', () => {
  const p = mouse(101);
  movePreyOnSurface(p, 1, seg, { threats: [{ x: 150, y: 500, radius: FLEE_ANIMAL_RADIUS }] });
  assert.equal(p.x, seg.x1 + 2);
});

test('le krill dérive dans tout l’espace et fuit', () => {
  const krill = createItem('prey', 'krill', 500, 250);
  assert.equal(krill.floating, true);
  for (let i = 0; i < 300; i++) movePreyFloating(krill, 1 / 30, monitor, { random: rng(0.5) });
  assert.ok(krill.x >= 0 && krill.x <= 1000 && krill.y >= 0 && krill.y <= 500);
  const before = { x: krill.x, y: krill.y };
  movePreyFloating(krill, 1, monitor, { threats: [{ x: krill.x - 20, y: krill.y, radius: 90 }] });
  assert.ok(krill.x > before.x, 's’éloigne de la menace');
});

test('les proies expirent, tombent, et ne sont jamais sauvegardées', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const p = createItem('prey', 'mouse', 400, 100);
  for (let i = 0; i < 300; i++) tickItem(p, 1 / 60, surfaces, monitor, { random: rng(0.9) });
  assert.ok(p.surface, 'posée sur le sol');
  assert.equal(parseSavedItems(serializeItems([p]), { bounds: monitor }).length, 0);
  tickItem(p, PREY_TTL + 1, surfaces, monitor);
  assert.ok(isGone(p));
  assert.ok(PREY.mouse.speed > 0);
});

test('une proie attrapée est figée', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const p = createItem('prey', 'mouse', 400, 500);
  for (let i = 0; i < 100; i++) tickItem(p, 1 / 60, surfaces, monitor, { random: rng(0.9) });
  p.caught = true;
  const x = p.x;
  for (let i = 0; i < 100; i++) tickItem(p, 1 / 60, surfaces, monitor, { random: rng(0.9) });
  assert.equal(p.x, x);
});

test('pickSpawnPoint : sur une surface pondérée par la largeur, ou flottant ; rien sans surface', () => {
  const win = { id: 'w', x: 100, y: 200, width: 100, height: 50 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const onGround = pickSpawnPoint(surfaces, rng(0.1, 0.5), { bounds: monitor });
  assert.equal(onGround.y, 500 - 30);
  const onShelf = pickSpawnPoint(surfaces, rng(0.99, 0.5), { bounds: monitor });
  assert.equal(onShelf.y, 200 - 30);
  assert.ok(onShelf.x >= 100 && onShelf.x <= 200);
  const floating = pickSpawnPoint(surfaces, rng(0.5, 0.5), { floating: true, bounds: monitor });
  assert.ok(floating.x > 0 && floating.y > 0 && floating.y < 500);
  assert.equal(pickSpawnPoint({ segments: [] }, rng(0.5), { bounds: monitor }), null);
});

test('PreySpawner : intervalle aléatoire, maximum, activation', () => {
  const sp = new PreySpawner({ minInterval: 60, maxInterval: 180, max: 2 });
  assert.equal(sp.advance(1000, { count: 0, enabled: false }), false, 'désactivé');
  assert.equal(sp.advance(1000, { count: 2, enabled: true }), false, 'maximum atteint');
  assert.equal(sp.advance(10, { count: 0, enabled: true, random: () => 0 }), false);
  assert.equal(sp.advance(60, { count: 0, enabled: true, random: () => 0 }), true, 'après 60 s');
  assert.equal(sp.advance(1, { count: 1, enabled: true, random: () => 0 }), false, 'nouveau délai tiré');
});

// --- Plantes et moisissure ---------------------------------------------------------

test('une plante se grignote portion par portion et repousse', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const grass = createItem('plant', 'grass', 300, 100);
  assert.equal(grass.portions, PLANT_MAX_PORTIONS);
  for (let i = 0; i < 200; i++) tickItem(grass, 1 / 60, surfaces, monitor);
  const ground = surfaces.segments.find((s) => s.type === 'ground');
  const ctx = { x: 0, surfaceId: ground.surfaceId, canFly: false, floating: false };
  assert.equal(edibleFor([grass], { grass: 8 }, ctx).length, 1);

  consume(grass);
  consume(grass);
  assert.equal(grass.portions, 1);
  tickItem(grass, 301, surfaces, monitor);
  assert.equal(grass.portions, 2, 'une portion repousse toutes les 5 minutes');
  consume(grass);
  consume(grass);
  assert.equal(edibleFor([grass], { grass: 8 }, ctx).length, 0, 'rien à grignoter');
  assert.ok(!isGone(grass), 'elle ne disparaît jamais');
});

test('l’algue flotte et ne se grignote que par une espèce sans sol', () => {
  const algae = createItem('plant', 'algae', 400, 200);
  assert.equal(algae.floating, true);
  assert.equal(edibleFor([algae], { algae: 8 }, { x: 0, surfaceId: null, canFly: false, floating: true }).length, 1);
  assert.equal(edibleFor([algae], { algae: 8 }, { x: 0, surfaceId: 'g', canFly: false, floating: false }).length, 0);
});

test('gamelle : moisie après un jour (rend malade), contenu disparu 6 h plus tard, remplir remet à zéro', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const bowl = createItem('bowl', 'kibble', 300, 500);
  fillBowl(bowl, 'kibble');
  tickItem(bowl, BOWL_MOLD_SECONDS - 10, surfaces, monitor);
  assert.equal(isMoldy(bowl), false);
  assert.equal(consume(bowl).sick, false, 'encore fraîche');
  tickItem(bowl, 20, surfaces, monitor);
  assert.equal(isMoldy(bowl), true);
  assert.equal(consume(bowl).sick, true, 'moisie : malade');

  const ground = surfaces.segments.find((s) => s.type === 'ground');
  const ctx = { x: 0, surfaceId: ground.surfaceId, canFly: false, floating: false };
  bowl.surface = ground;
  assert.equal(edibleFor([bowl], { kibble: 30 }, ctx).length, 1, 'les non autonomes la mangent');
  assert.equal(edibleFor([bowl], { kibble: 30 }, { ...ctx, avoidMold: true }).length, 0, 'les autonomes l’évitent');

  fillBowl(bowl, 'kibble');
  assert.equal(bowl.fillAge, 0);
  assert.equal(isMoldy(bowl), false);

  tickItem(bowl, BOWL_MOLD_SECONDS + BOWL_VANISH_SECONDS + 1, surfaces, monitor);
  assert.equal(bowl.portions, 0, 'contenu disparu');
  assert.ok(!isGone(bowl), 'la gamelle reste');
});

test('sauvegarde : âge de la gamelle et plantes conservés', () => {
  const bowl = createItem('bowl', 'kibble', 100, 480);
  fillBowl(bowl, 'kibble');
  bowl.fillAge = 5000;
  const plant = createItem('plant', 'berries', 200, 480);
  plant.portions = 1;
  const back = parseSavedItems(serializeItems([bowl, plant]), { bounds: monitor });
  assert.equal(back.find((i) => i.type === 'bowl').fillAge, 5000);
  assert.equal(back.find((i) => i.type === 'plant').portions, 1);
  const bad = JSON.stringify({ version: 1, items: [{ type: 'plant', kind: 'cactus', x: 1, y: 1 }] });
  assert.equal(parseSavedItems(bad, { bounds: monitor }).length, 0);
});

// --- Besoins naturels ---------------------------------------------------------------

import { litterFor, isDirty, isOldMess, LITTER_CAPACITY, MESS_OLD_SECONDS } from '../core/items.js';
import { Critter, State, Locomotion } from '../core/critter.js';

test('jauge de soulagement : décroît, baisse en mangeant, remonte en se soulageant', () => {
  const n = new Needs();
  n.advance(HOUR);
  assert.ok(Math.abs(n.values.relief - 72) < 1e-9, 'huit points par heure');

  const eater = new Needs();
  eater.feed(40);
  assert.equal(eater.values.relief, 72, 'manger 40 retire 8');

  n.values.relief = 5;
  n.relieve();
  assert.equal(n.values.relief, 90);
  n.values.relief = 40;
  n.relieve();
  assert.equal(n.values.relief, 100, 'bornée à 100');
  n.values.relief = 10;
  assert.equal(n.urgent(), 'relief');
});

test('litière : sale après trois usages, nettoyée au clic ; trace : vieille après deux heures', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const litter = createItem('litter', null, 300, 100);
  for (let i = 0; i < 200; i++) tickItem(litter, 1 / 60, surfaces, monitor);
  const ground = surfaces.segments.find((s) => s.type === 'ground');
  const ctx = { x: 0, surfaceId: ground.surfaceId, canFly: false };
  assert.equal(litterFor([litter], ctx).length, 1);
  litter.uses = LITTER_CAPACITY;
  assert.ok(isDirty(litter));
  assert.equal(litterFor([litter], ctx).length, 0, 'sale : plus utilisée');
  litter.cleaned = true;
  tickItem(litter, 1 / 60, surfaces, monitor);
  assert.equal(litter.uses, 0);
  assert.ok(!isDirty(litter));

  const mess = createItem('mess', null, 300, 500);
  tickItem(mess, MESS_OLD_SECONDS - 1, surfaces, monitor);
  assert.ok(!isOldMess(mess));
  tickItem(mess, 2, surfaces, monitor);
  assert.ok(isOldMess(mess));
  assert.ok(!isGone(mess));
});

test('litière et trace : sauvegardées avec leur état', () => {
  const litter = createItem('litter', null, 100, 480);
  litter.uses = 2;
  const mess = createItem('mess', null, 200, 480);
  mess.age = 900;
  const back = parseSavedItems(serializeItems([litter, mess]), { bounds: monitor });
  assert.equal(back.find((i) => i.type === 'litter').uses, 2);
  assert.equal(back.find((i) => i.type === 'mess').age, 900);
});

function reliefCritter(config = {}) {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = new Critter(
    {
      random: () => 0.5, walkWeight: 0, sleepWeight: 0, washWeight: 0, followWeight: 0, runWeight: 0,
      needsRateScale: 0, autonomyMode: 'off', ...config,
    },
    { x: 300, y: monitor.height },
  );
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.state = State.IDLE;
  c.stateTimer = 0;
  return { c, surfaces };
}

function run(c, surfaces, items, seconds, stop) {
  const seen = new Set();
  for (let i = 0; i < seconds * 30; i++) {
    const snap = c.tick(1 / 30, surfaces, { worldBounds: monitor, items });
    seen.add(snap.state);
    if (snap.event) seen.add(`event:${snap.event}`);
    if (stop?.(snap)) break;
  }
  return seen;
}

test('pressé, l’animal va à la litière propre et l’utilise (aucune trace)', () => {
  const { c, surfaces } = reliefCritter();
  const litter = createItem('litter', null, 600, 500);
  litter.surface = surfaces.segments.find((s) => s.type === 'ground');
  c.needs.values.relief = 20;
  const seen = run(c, surfaces, [litter], 30, () => c.lastEvent === 'relieved');
  assert.ok(seen.has(State.RELIEVE));
  assert.ok(seen.has('event:relieved'));
  assert.equal(litter.uses, 1);
  assert.equal(c.takeMess(), null);
  assert.ok(c.needs.values.relief > 90);
  assert.equal(c.stats.get('reliefs'), 1);
});

test('sans litière : va au coin le plus proche et laisse une trace', () => {
  const { c, surfaces } = reliefCritter();
  c.x = 900;
  c.needs.values.relief = 20;
  run(c, surfaces, [], 30, () => c.lastEvent === 'relieved');
  const mess = c.takeMess();
  assert.ok(mess, 'trace demandée');
  assert.ok(mess.x > 950, `coin droit, x = ${mess.x}`);
  assert.equal(c.needs.values.relief > 90, true);
});

test('litière sale évitée : il va au coin et la litière ne bouge pas', () => {
  const { c, surfaces } = reliefCritter();
  const litter = createItem('litter', null, 500, 500);
  litter.surface = surfaces.segments.find((s) => s.type === 'ground');
  litter.uses = LITTER_CAPACITY;
  c.needs.values.relief = 20;
  run(c, surfaces, [litter], 30, () => c.lastEvent === 'relieved');
  assert.equal(litter.uses, LITTER_CAPACITY);
  assert.ok(c.takeMess());
});

test('accident : sous le seuil, il se soulage sur place (trace, propreté en baisse)', () => {
  const { c, surfaces } = reliefCritter();
  c.needs.values.relief = 2;
  const cleanliness = c.needs.values.cleanliness;
  const snap = c.tick(1 / 30, surfaces, { worldBounds: monitor, items: [] });
  assert.equal(snap.event, 'accident');
  const mess = c.takeMess();
  assert.ok(mess && Math.abs(mess.x - 300) < 2);
  assert.equal(c.stats.get('accidents'), 1);
  assert.ok(c.needs.values.cleanliness <= cleanliness - 14);
  assert.ok(c.needs.values.relief > 80);
});

test('à l’aise, l’animal ne cherche pas à se soulager', () => {
  const { c, surfaces } = reliefCritter({ walkWeight: 77 });
  c.needs.values.relief = 90;
  assert.ok(!run(c, surfaces, [], 5).has(State.RELIEVE));
});

test('traces proches : elles salissent, les vieilles rendent malade (moins pour un autonome)', () => {
  const near = (surfaces, age) => {
    const m = createItem('mess', null, 320, 500);
    m.surface = surfaces.segments.find((s) => s.type === 'ground');
    m.age = age;
    return m;
  };
  const dependent = reliefCritter({ needsRateScale: 1 });
  dependent.c.state = State.IDLE;
  dependent.c.stateTimer = 1e9;
  const fresh = near(dependent.surfaces, 0);
  dependent.c.tick(3600, dependent.surfaces, { worldBounds: monitor, items: [fresh] });
  assert.ok(dependent.c.needs.values.cleanliness < 80 - 4 * 0.9, 'une trace salit');
  assert.equal(dependent.c.needs.values.health, 100, 'jeune trace : pas malade');

  const sick = reliefCritter({ needsRateScale: 1 });
  sick.c.stateTimer = 1e9;
  sick.c.tick(3600, sick.surfaces, { worldBounds: monitor, items: [near(sick.surfaces, MESS_OLD_SECONDS + 1)] });
  assert.ok(sick.c.needs.values.health <= 96, `santé ${sick.c.needs.values.health}`);

  const auto = reliefCritter({ needsRateScale: 1, autonomyMode: 'full' });
  auto.c.stateTimer = 1e9;
  auto.c.tick(3600, auto.surfaces, { worldBounds: monitor, items: [near(auto.surfaces, MESS_OLD_SECONDS + 1)] });
  assert.equal(auto.c.needs.values.health, 100, 'un animal autonome nettoie derrière lui');
});

test('trace loin ou sur une autre surface : sans effet ; vacances : figé', () => {
  const far = reliefCritter({ needsRateScale: 1 });
  const m = createItem('mess', null, 900, 500);
  m.surface = far.surfaces.segments.find((s) => s.type === 'ground');
  m.age = MESS_OLD_SECONDS + 1;
  far.c.stateTimer = 1e9;
  far.c.tick(3600, far.surfaces, { worldBounds: monitor, items: [m] });
  assert.equal(far.c.needs.values.health, 100);

  const vacation = reliefCritter({ needsRateScale: 0 });
  const close = createItem('mess', null, 310, 500);
  close.surface = vacation.surfaces.segments.find((s) => s.type === 'ground');
  close.age = MESS_OLD_SECONDS + 1;
  vacation.c.stateTimer = 1e9;
  vacation.c.tick(3600, vacation.surfaces, { worldBounds: monitor, items: [close] });
  assert.equal(vacation.c.needs.values.health, 100);
});

test('un poisson n’a pas ce besoin', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const fish = new Critter(
    { random: () => 0.5, needsRateScale: 0, supportedSurfaces: new Set([Locomotion.WATER]), swimSpeed: 200 },
    { x: 100, y: 300 },
  );
  fish._startRoam(State.SWIM);
  fish.needs.values.relief = 1;
  for (let i = 0; i < 90; i++) fish.tick(1 / 30, surfaces, { worldBounds: monitor, items: [] });
  assert.notEqual(fish.state, State.RELIEVE);
  assert.equal(fish.takeMess(), null);
});
