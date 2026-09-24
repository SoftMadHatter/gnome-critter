import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createItem, tickItem, edibleFor, consume, fillBowl, isGone, bedsOn,
  serializeItems, parseSavedItems, BOWL_CAPACITY,
} from '../core/items.js';
import { computeSurfaces } from '../core/surfaceMap.js';

const monitor = { x: 0, y: 0, width: 1000, height: 500 };
const bounds = monitor;

function settle(item, surfaces, seconds = 5) {
  for (let i = 0; i < seconds * 60; i++) tickItem(item, 1 / 60, surfaces, bounds);
}

test('un aliment lâché tombe et se pose sur le sol', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const item = createItem('food', 'kibble', 300, 50);
  settle(item, surfaces);
  assert.equal(item.y, 500);
  assert.ok(item.surface);
});

test('un objet posé sur une fenêtre retombe quand elle disparaît', () => {
  const win = { id: 'w1', x: 200, y: 200, width: 300, height: 100 };
  const withWin = computeSurfaces({ monitors: [monitor], windows: [win] });
  const without = computeSurfaces({ monitors: [monitor], windows: [] });
  const bowl = createItem('bowl', 'kibble', 300, 50);
  settle(bowl, withWin);
  assert.equal(bowl.y, 200);
  settle(bowl, without);
  assert.equal(bowl.y, 500);
});

test("un objet dont la fenêtre bouge sous lui retombe aussi", () => {
  const win = { id: 'w1', x: 200, y: 200, width: 300, height: 100 };
  const before = computeSurfaces({ monitors: [monitor], windows: [win] });
  const moved = computeSurfaces({ monitors: [monitor], windows: [{ ...win, y: 300 }] });
  const bed = createItem('bed', null, 300, 50);
  settle(bed, before);
  settle(bed, moved);
  assert.equal(bed.y, 300);
});

test('le plancton flotte sans gravité et un objet tenu ne bouge pas', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const plankton = createItem('food', 'plankton', 400, 100);
  settle(plankton, surfaces);
  assert.equal(plankton.y, 100);

  const held = createItem('food', 'meat', 400, 100);
  held.grabbed = true;
  settle(held, surfaces);
  assert.equal(held.y, 100);
});

test('la nourriture expire, pas la gamelle ni le lit', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const food = createItem('food', 'plankton', 10, 10);
  const bowl = createItem('bowl', 'kibble', 10, 10);
  tickItem(food, 601, surfaces, bounds);
  tickItem(bowl, 1e6, surfaces, bounds);
  assert.ok(isGone(food));
  assert.ok(!isGone(bowl));
});

test('edibleFor : régime, surface, vol, réclamation, chute', () => {
  const win = { id: 'w1', x: 600, y: 300, width: 200, height: 100 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const ground = surfaces.segments.find((s) => s.type === 'ground');

  const fish = createItem('food', 'fish', 300, 50);
  const seeds = createItem('food', 'seeds', 700, 50);
  const falling = createItem('food', 'fish', 100, 50);
  settle(fish, surfaces);
  settle(seeds, surfaces);
  const items = [fish, seeds, falling];

  const diet = { fish: 60, seeds: 30 };
  const walker = edibleFor(items, { fish: 60 }, { x: 200, surfaceId: ground.surfaceId, canFly: false, floating: false });
  assert.deepEqual(walker.map((e) => e.item), [fish], 'régime, surface et chute filtrent');

  const flyer = edibleFor(items, diet, { x: 200, surfaceId: ground.surfaceId, canFly: true, floating: false });
  assert.equal(flyer.length, 2, "l'oiseau voit aussi le rebord");

  fish.claimedBy = {};
  assert.equal(edibleFor(items, diet, { x: 200, surfaceId: ground.surfaceId, canFly: false, floating: false }).length, 0);
  const me = fish.claimedBy;
  assert.equal(
    edibleFor(items, diet, { x: 200, surfaceId: ground.surfaceId, canFly: false, floating: false, self: me }).length,
    1,
    'sa propre réclamation reste valable',
  );
});

test('edibleFor : le poisson ne voit que le flottant, et inversement', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const ground = surfaces.segments.find((s) => s.type === 'ground');
  const plankton = createItem('food', 'plankton', 400, 100);
  const meat = createItem('food', 'meat', 400, 50);
  settle(meat, surfaces);
  const diet = { plankton: 40, meat: 40 };
  const fish = edibleFor([plankton, meat], diet, { x: 0, surfaceId: null, canFly: false, floating: true });
  assert.deepEqual(fish.map((e) => e.item), [plankton]);
  const cat = edibleFor([plankton, meat], diet, { x: 0, surfaceId: ground.surfaceId, canFly: false, floating: false });
  assert.deepEqual(cat.map((e) => e.item), [meat]);
});

test('gamelle : remplissage, portions, un seul aliment', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const bowl = createItem('bowl', 'kibble', 300, 50);
  settle(bowl, surfaces);
  const ground = surfaces.segments.find((s) => s.type === 'ground');
  const ctx = { x: 0, surfaceId: ground.surfaceId, canFly: false, floating: false };

  assert.equal(edibleFor([bowl], { kibble: 30 }, ctx).length, 0, 'vide : rien à manger');
  fillBowl(bowl, 'kibble');
  assert.equal(bowl.portions, BOWL_CAPACITY);
  consume(bowl);
  assert.equal(bowl.portions, BOWL_CAPACITY - 1);
  fillBowl(bowl, 'fish', 2);
  assert.equal(bowl.kind, 'fish');
  assert.equal(bowl.portions, 2, "changer d'aliment vide d'abord la gamelle");
  assert.ok(!isGone(bowl));
});

test('consume marque la nourriture mangée et libère sa réclamation', () => {
  const food = createItem('food', 'meat', 0, 0);
  food.claimedBy = {};
  consume(food);
  assert.ok(food.consumed && !food.claimedBy);
});

test('bedsOn : lits de la surface, du plus proche au plus loin', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const ground = surfaces.segments.find((s) => s.type === 'ground');
  const a = createItem('bed', null, 800, 50);
  const b = createItem('bed', null, 200, 50);
  settle(a, surfaces);
  settle(b, surfaces);
  assert.deepEqual(bedsOn([a, b], ground.surfaceId, 100), [b, a]);
});

test('sauvegarde : objets durables et nourriture fraîche seulement, lecture tolérante', () => {
  const bowl = createItem('bowl', 'kibble', 300.4, 480);
  bowl.portions = 3;
  const food = createItem('food', 'fish', 50, 10);
  const eaten = createItem('food', 'meat', 60, 10);
  eaten.consumed = true;
  const text = serializeItems([bowl, food, eaten]);
  const back = parseSavedItems(text, { bounds });
  assert.equal(back.length, 2);
  assert.equal(back[0].type, 'bowl');
  assert.equal(back[0].portions, 3);
  assert.equal(back[0].x, 300);

  assert.deepEqual(parseSavedItems('', { bounds }), []);
  assert.deepEqual(parseSavedItems('{nope', { bounds }), []);
  assert.deepEqual(parseSavedItems('{"version":9,"items":[]}', { bounds }), []);
  const messy = JSON.stringify({
    version: 1,
    items: [null, { type: 'zzz' }, { type: 'food', kind: 'nope', x: 1, y: 1 }, { type: 'bed', x: 5000, y: -9 }],
  });
  const kept = parseSavedItems(messy, { bounds });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].x, 1000);
  assert.equal(kept[0].y, 0);
});
