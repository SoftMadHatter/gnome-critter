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
