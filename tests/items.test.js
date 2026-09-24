import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createItem, tickItem, edibleFor, consume, fillBowl, isGone, bedsOn,
  serializeItems, parseSavedItems, BOWL_CAPACITY, kick, push, throwItem, isToy, toysFor, toyFits,
  pickVariant, bowlLevel,
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

test('consume : un aliment se mange en bouchées puis disparaît, la réclamation est libérée', () => {
  const food = createItem('food', 'meat', 0, 0); // 2 bouchées
  assert.equal(food.portions, 2);
  food.claimedBy = {};
  assert.deepEqual(consume(food), { sick: false, fraction: 0.5, finished: false });
  assert.ok(!food.consumed && !food.claimedBy && !isGone(food), 'reste entamé');
  assert.deepEqual(consume(food), { sick: false, fraction: 0.5, finished: true });
  assert.ok(food.consumed && isGone(food));
  assert.equal(consume(createItem('food', 'kibble', 0, 0)).fraction, 1 / 3);
  const bowl = createItem('bowl', 'kibble', 0, 0);
  fillBowl(bowl, 'kibble');
  assert.deepEqual(consume(bowl), { sick: false, fraction: 1, finished: true }, 'une portion de gamelle est un repas');
});

test("gamelle : jamais d'aliment flottant, posée vide, niveaux visibles", () => {
  const bowl = createItem('bowl', null, 0, 0);
  assert.equal(bowl.kind, null);
  assert.equal(bowl.model, 'ceramic');
  fillBowl(bowl, 'plankton');
  assert.equal(bowl.portions, 0, 'le plancton flotte : pas dans une gamelle');
  assert.equal(createItem('bowl', 'flakes', 0, 0).kind, null);
  fillBowl(bowl, 'pate');
  assert.equal(bowl.portions, BOWL_CAPACITY);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(bowlLevel), [0, 1, 1, 2, 2, 3]);
});

test('modèles : validés à la création, variante de jouet tirée au hasard', () => {
  assert.equal(createItem('bed', null, 0, 0, 'basket').model, 'basket');
  assert.equal(createItem('bed', null, 0, 0, 'hamac').model, 'cushion', 'modèle inconnu : celui par défaut');
  assert.equal(createItem('bowl', 'kibble', 0, 0).model, 'ceramic');
  assert.equal(createItem('food', 'meat', 0, 0, 'wood').model, null, 'pas de modèle pour un aliment');
  assert.equal(pickVariant('ball', () => 0), 'red');
  assert.equal(pickVariant('ball', () => 0.999), 'green');
  assert.equal(pickVariant('nope', () => 0.5), null);
  assert.equal(createItem('toy', 'plush', 0, 0, pickVariant('plush', () => 0.5)).model, 'rabbit');
});

test('sauvegarde : modèles, bouchées restantes et anciens formats', () => {
  const bed = createItem('bed', null, 10, 480, 'cradle');
  const bowl = createItem('bowl', null, 20, 480, 'wood');
  const ball = createItem('toy', 'ball', 30, 480, 'blue');
  const leftover = createItem('food', 'apple', 40, 480);
  consume(leftover);
  const back = parseSavedItems(serializeItems([bed, bowl, ball, leftover]), { bounds });
  assert.deepEqual(back.map((i) => i.model), ['cradle', 'wood', 'blue', null]);
  assert.equal(back[1].kind, null, 'gamelle posée vide');
  assert.equal(back[3].portions, 2, 'reste entamé');

  const old = JSON.stringify({
    version: 1,
    items: [
      { type: 'bed', kind: null, x: 1, y: 1 },
      { type: 'food', kind: 'meat', x: 1, y: 1, portions: 0, ttl: 100 },
      { type: 'bowl', kind: 'plankton', x: 1, y: 1, portions: 4 },
      { type: 'toy', kind: 'ball', x: 1, y: 1, model: 'plaid' },
    ],
  });
  const [oldBed, oldMeat, oldBowl, oldBall] = parseSavedItems(old, { bounds });
  assert.equal(oldBed.model, 'cushion');
  assert.equal(oldMeat.portions, 2, 'aliment sans bouchées enregistrées : entier');
  assert.equal(oldBowl.kind, null);
  assert.equal(oldBowl.portions, 0, 'ancienne gamelle de plancton : vidée');
  assert.equal(oldBall.model, 'red');
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

// --- Jouets ------------------------------------------------------------------

test('la balle rebondit à la chute, puis se pose', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const ball = createItem('toy', 'ball', 300, 100);
  let bounced = false;
  let previousVy = 0;
  for (let i = 0; i < 60 * 8; i++) {
    tickItem(ball, 1 / 60, surfaces, bounds);
    if (previousVy > 100 && ball.vy < 0) bounced = true;
    previousVy = ball.vy;
  }
  assert.ok(bounced, 'elle a rebondi');
  assert.equal(ball.y, 500);
  assert.ok(ball.surface, 'puis elle repose sur le sol');
});

test('la peluche ne rebondit pas', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const plush = createItem('toy', 'plush', 300, 100);
  let bounced = false;
  for (let i = 0; i < 60 * 3; i++) {
    tickItem(plush, 1 / 60, surfaces, bounds);
    if (plush.vy < 0) bounced = true;
  }
  assert.ok(!bounced);
  assert.ok(plush.surface);
});

test('une balle frappée roule, ralentit puis s\'arrête', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const ball = createItem('toy', 'ball', 300, 100);
  settle(ball, surfaces, 8);
  const restX = ball.x;
  kick(ball, 1);
  assert.ok(ball.vx > 0 && ball.vy < 0 && !ball.surface);
  settle(ball, surfaces, 10);
  assert.ok(ball.x > restX + 20, 'elle a roulé');
  assert.equal(ball.vx, 0, 'elle s\'est arrêtée');
  assert.ok(ball.surface);
});

test('une balle qui roule hors du rebord tombe sur le sol', () => {
  const win = { id: 'w1', x: 200, y: 200, width: 100, height: 100 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const ball = createItem('toy', 'ball', 280, 100);
  settle(ball, surfaces, 6);
  assert.equal(ball.y, 200);
  ball.vx = 400;
  settle(ball, surfaces, 10);
  assert.equal(ball.y, 500, 'elle a quitté la fenêtre et rejoint le sol');
  assert.ok(ball.x > 300);
});

test('la balle rebondit contre les bords de l\'écran', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const ball = createItem('toy', 'ball', 900, 100);
  settle(ball, surfaces, 6);
  ball.vx = 800;
  for (let i = 0; i < 30; i++) tickItem(ball, 1 / 60, surfaces, bounds);
  assert.ok(ball.x <= 1000);
  assert.ok(ball.vx < 0, 'renvoyée vers la gauche');
});

test('throwItem lance un objet, qui retombe sans rouler s\'il n\'est pas une balle', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const meat = createItem('food', 'meat', 300, 100);
  settle(meat, surfaces, 3);
  const before = meat.x;
  throwItem(meat, 300, -400);
  settle(meat, surfaces, 5);
  assert.ok(meat.x > before + 50);
  assert.equal(meat.vx, 0);
  assert.equal(meat.y, 500);
});

test('toysFor : même surface ou vol, jamais les objets non jouets', () => {
  const win = { id: 'w1', x: 600, y: 250, width: 300, height: 100 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const ground = surfaces.segments.find((s) => s.type === 'ground');
  const onGround = createItem('toy', 'plush', 100, 50);
  const onWindow = createItem('toy', 'ball', 700, 50);
  const food = createItem('food', 'meat', 200, 50);
  for (const i of [onGround, onWindow, food]) settle(i, surfaces, 4);

  const walker = toysFor([onGround, onWindow, food], { x: 300, surfaceId: ground.surfaceId, canFly: false });
  assert.deepEqual(walker, [onGround]);
  assert.equal(toysFor([onGround, onWindow, food], { x: 300, surfaceId: ground.surfaceId, canFly: true }).length, 2);
  assert.ok(isToy(onGround) && !isToy(food));
});

test('les jouets sont sauvegardés et relus', () => {
  const ball = createItem('toy', 'ball', 100, 480);
  const back = parseSavedItems(serializeItems([ball]), { bounds });
  assert.equal(back.length, 1);
  assert.equal(back[0].type, 'toy');
  assert.equal(back[0].kind, 'ball');
  const bad = JSON.stringify({ version: 1, items: [{ type: 'toy', kind: 'yoyo', x: 1, y: 1 }] });
  assert.equal(parseSavedItems(bad, { bounds }).length, 0);
});

test('la pelote rebondit moins et roule moins loin que la balle', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const bounces = (item) => {
    let n = 0;
    for (let i = 0; i < 300; i++) {
      const before = item.vy;
      tickItem(item, 1 / 60, surfaces, bounds);
      if (before > 0 && item.vy < 0) n++;
    }
    return n;
  };
  const ball = createItem('toy', 'ball', 300, 100);
  const yarn = createItem('toy', 'yarn', 600, 100);
  assert.ok(bounces(yarn) < bounces(ball));
  assert.ok(kick(ball, 1) && kick(yarn, 1));
  settle(ball, surfaces, 6);
  settle(yarn, surfaces, 6);
  assert.ok(yarn.x - 600 < ball.x - 300, `pelote ${yarn.x - 600} px, balle ${ball.x - 300} px`);
  assert.equal(kick(createItem('toy', 'plush', 0, 0), 1), false, 'la peluche ne se frappe pas');
});

test("l'anneau flotte, file quand on le pousse, ralentit et rebondit sur les bords", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const ring = createItem('toy', 'ring', 500, 200);
  assert.ok(ring.floating);
  settle(ring, surfaces, 1);
  assert.deepEqual([ring.x, ring.y], [500, 200], 'sans gravité');
  assert.ok(push(ring, 1, 0));
  settle(ring, surfaces, 0.5);
  assert.ok(ring.x > 520);
  settle(ring, surfaces, 10);
  assert.deepEqual([ring.vx, ring.vy], [0, 0], "finit par s'arrêter");

  const edge = createItem('toy', 'ring', 990, 20);
  push(edge, 1, -1);
  settle(edge, surfaces, 1);
  assert.ok(edge.x <= 1000 && edge.vx <= 0, 'rebond sur le bord droit');
  assert.ok(edge.y >= 16 && edge.vy >= 0, 'rebond en haut, sprite gardé dans l\'écran');
  assert.equal(push(createItem('toy', 'ball', 0, 0), 1, 0), false);
});

test('toysFor : le poisson ne voit que les jouets flottants, les autres les jouets posés', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const ground = surfaces.segments.find((s) => s.type === 'ground');
  const ring = createItem('toy', 'ring', 400, 200);
  const far = createItem('toy', 'ring', 900, 400);
  const ball = createItem('toy', 'ball', 450, 50);
  settle(ball, surfaces, 4);
  assert.deepEqual(toysFor([far, ball, ring], { x: 380, y: 210, floating: true }), [ring, far]);
  assert.deepEqual(toysFor([far, ball, ring], { x: 380, surfaceId: ground.surfaceId, canFly: false }), [ball]);
  assert.ok(toyFits('ring', true) && !toyFits('ring', false));
  assert.ok(toyFits('yarn', false) && !toyFits('yarn', true) && !toyFits('nope', false));
});
