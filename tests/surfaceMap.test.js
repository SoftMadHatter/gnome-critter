import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSurfaces,
  findSurfaceBelow,
  isOnSegment,
  findWallNear,
  findCeilingAbove,
  findReachableWall,
  findReachableShelf,
  findSegmentById,
  findDropEdges,
  findLedgeAtWallTop,
  findWallById,
  groundPoint,
} from '../core/surfaceMap.js';

test('computeSurfaces génère sol, plafond et murs pour chaque moniteur', () => {
  const { segments, walls } = computeSurfaces({
    monitors: [{ x: 0, y: 0, width: 1920, height: 1080 }],
    windows: [],
  });

  const ground = segments.find((s) => s.type === 'ground');
  const ceiling = segments.find((s) => s.type === 'ceiling');

  assert.equal(ground.y, 1080);
  assert.equal(ceiling.y, 0);
  assert.equal(walls.length, 2);
});

test('computeSurfaces ajoute un rebord "shelf" par fenêtre', () => {
  const { segments } = computeSurfaces({
    monitors: [{ x: 0, y: 0, width: 1920, height: 1080 }],
    windows: [{ id: 'win-1', x: 100, y: 400, width: 500, height: 300 }],
  });

  const shelf = segments.find((s) => s.type === 'shelf');
  assert.ok(shelf);
  assert.equal(shelf.y, 400);
  assert.equal(shelf.x1, 100);
  assert.equal(shelf.x2, 600);
  assert.equal(shelf.surfaceId, 'win-1');
});

test('findSurfaceBelow ignore les surfaces hors de portée horizontale', () => {
  const { segments } = computeSurfaces({
    monitors: [{ x: 0, y: 0, width: 1000, height: 1000 }],
    windows: [{ id: 'w', x: 800, y: 500, width: 100, height: 100 }],
  });

  const result = findSurfaceBelow(segments, 50, 0, 2000, new Set(['ground', 'shelf']));
  assert.equal(result.type, 'ground');
});

test('findSurfaceBelow choisit la surface la plus proche (le rebord avant le sol)', () => {
  const { segments } = computeSurfaces({
    monitors: [{ x: 0, y: 0, width: 1000, height: 1000 }],
    windows: [{ id: 'w', x: 0, y: 400, width: 1000, height: 100 }],
  });

  const result = findSurfaceBelow(segments, 50, 0, 2000, new Set(['ground', 'shelf']));
  assert.equal(result.type, 'shelf');
  assert.equal(result.y, 400);
});

test('isOnSegment détecte la sortie du rebord', () => {
  const seg = { x1: 0, x2: 100, y: 50 };
  assert.equal(isOnSegment(seg, 50, 50), true);
  assert.equal(isOnSegment(seg, 150, 50), false);
  assert.equal(isOnSegment(seg, 50, 60), false);
});

test('computeSurfaces ajoute un segment "ceiling" pour le dessous de chaque fenêtre', () => {
  const { segments } = computeSurfaces({
    monitors: [{ x: 0, y: 0, width: 1920, height: 1080 }],
    windows: [{ id: 'win-1', x: 100, y: 400, width: 500, height: 300 }],
  });

  const underside = segments.find((s) => s.type === 'ceiling' && s.surfaceId === 'win-1');
  assert.ok(underside);
  assert.equal(underside.y, 700); // 400 + 300
  assert.equal(underside.x1, 100);
  assert.equal(underside.x2, 600);
});

test('findWallNear trouve un mur proche horizontalement dont la portée verticale croise l\'intervalle donné', () => {
  const { walls } = computeSurfaces({
    monitors: [{ x: 0, y: 0, width: 1000, height: 1000 }],
    windows: [{ id: 'w', x: 400, y: 200, width: 200, height: 100 }],
  });

  const near = findWallNear(walls, 402, 250, 260);
  assert.ok(near);
  assert.equal(near.x, 400);

  assert.equal(findWallNear(walls, 500, 250, 260), null); // too far horizontally
  assert.equal(findWallNear(walls, 402, 350, 360), null); // outside the wall's vertical reach
});

test('findCeilingAbove trouve le segment ceiling le plus proche au-dessus d\'un point', () => {
  const { segments } = computeSurfaces({
    monitors: [{ x: 0, y: 0, width: 1000, height: 1000 }],
    windows: [{ id: 'w', x: 400, y: 200, width: 200, height: 100 }],
  });

  const found = findCeilingAbove(segments, 450, 300, 5);
  assert.ok(found);
  assert.equal(found.y, 300);
  assert.equal(found.surfaceId, 'w');

  assert.equal(findCeilingAbove(segments, 450, 300, 5), findCeilingAbove(segments, 450, 300, 5));
  assert.equal(findCeilingAbove(segments, 450, 299, 5), null); // already past above, out of reach
});

test('findReachableWall trouve le mur le plus proche dont le bas est au niveau donné', () => {
  const { walls } = computeSurfaces({
    monitors: [{ x: 0, y: 0, width: 1000, height: 1000 }],
    windows: [
      { id: 'floating', x: 400, y: 200, width: 200, height: 100 }, // bottom at 300
      { id: 'grounded', x: 100, y: 900, width: 50, height: 100 }, // bottom at 1000, at ground level
    ],
  });

  // At ground level (y=1000): the wall of the window resting on the
  // ground, closer than the monitor's walls, wins.
  const near = findReachableWall(walls, 120, 1000);
  assert.ok(near);
  assert.equal(near.surfaceId, 'grounded');

  // Far from that window, still at ground level: a monitor wall.
  const farFromWindow = findReachableWall(walls, 900, 1000);
  assert.equal(farFromWindow.surfaceId, 'monitor:0');
  assert.equal(farFromWindow.side, 'right');

  // At the level of the floating window's bottom (y=300): ITS wall, not
  // the ground/monitor ones, which aren't at this level here.
  const atFloatingWindow = findReachableWall(walls, 450, 300);
  assert.equal(atFloatingWindow.surfaceId, 'floating');
  assert.equal(atFloatingWindow.side, 'left');

  // At a level where no wall has its bottom: nothing "reachable".
  assert.equal(findReachableWall(walls, 450, 500), null);
});

test('findReachableShelf trouve le rebord le plus proche au même niveau, hors la surface exclue', () => {
  const { segments } = computeSurfaces({
    monitors: [{ x: 0, y: 0, width: 1000, height: 1000 }],
    windows: [
      { id: 'near', x: 100, y: 300, width: 100, height: 50 },
      { id: 'far', x: 800, y: 300, width: 100, height: 50 },
      { id: 'otherHeight', x: 400, y: 500, width: 100, height: 50 },
    ],
  });

  const nearest = findReachableShelf(segments, 250, 300, 'unrelated');
  assert.ok(nearest);
  assert.equal(nearest.surfaceId, 'near');

  // The already-occupied surface ('near') is excluded: the next one wins.
  const excludingNear = findReachableShelf(segments, 250, 300, 'near');
  assert.equal(excludingNear.surfaceId, 'far');

  assert.equal(findReachableShelf(segments, 250, 300, 'unrelated', 10), null, 'trop loin pour maxDistance=10');
  assert.equal(findReachableShelf(segments, 450, 999, 'unrelated'), null, 'aucun rebord à ce niveau');
});

// --- Ground point (repositioning after sleep) -----------------------------

test('groundPoint : bas du moniteur sous le point, abscisse ramenée dans ses bornes', () => {
  const monitors = [{ x: 0, y: 0, width: 1000, height: 500 }];
  assert.deepEqual(groundPoint(monitors, 400, 30), { x: 400, y: 500 });
  assert.deepEqual(groundPoint(monitors, 5000, 900), { x: 984, y: 500 });
  assert.equal(groundPoint([], 10, 10), null);
});

test('groundPoint : deux écrans de hauteurs différentes, prend le plus proche', () => {
  const left = { x: 0, y: 0, width: 800, height: 600 };
  const right = { x: 800, y: 100, width: 800, height: 400 };
  assert.deepEqual(groundPoint([left, right], 300, 20), { x: 300, y: 600 });
  assert.deepEqual(groundPoint([left, right], 1200, 120), { x: 1200, y: 500 });
});

// --- Hidden / out-of-screen surfaces (#23) ----------------------------------

const span = (list) => list.map((s) => [s.x1, s.x2]);

test('computeSurfaces : le sol du petit écran ne traverse pas le grand écran voisin', () => {
  const big = { x: 0, y: 0, width: 1000, height: 800 };
  const small = { x: 1000, y: 0, width: 800, height: 500 };
  const { segments } = computeSurfaces({ monitors: [big, small], windows: [] });
  const ground = segments.filter((s) => s.type === 'ground');
  assert.deepEqual(span(ground.filter((s) => s.y === 800)), [[0, 1000]]);
  assert.deepEqual(span(ground.filter((s) => s.y === 500)), [[1000, 1800]]);

  // Small screen *below* the big one's bottom edge: the big one's ground is cut.
  const tall = { x: 0, y: 0, width: 1000, height: 400 };
  const wide = { x: 500, y: 0, width: 1000, height: 800 };
  const r = computeSurfaces({ monitors: [tall, wide], windows: [] });
  assert.deepEqual(span(r.segments.filter((s) => s.type === 'ground' && s.y === 400)), [[0, 500]]);
});

test('computeSurfaces : deux écrans alignés gardent un sol continu, sans mur commun', () => {
  const left = { x: 0, y: 0, width: 1000, height: 600 };
  const right = { x: 1000, y: 0, width: 1000, height: 600 };
  const { segments, walls } = computeSurfaces({ monitors: [left, right], windows: [] });
  assert.equal(segments.filter((s) => s.type === 'ground').length, 2);
  assert.deepEqual(walls.map((w) => [w.side, w.x]).sort(), [['left', 0], ['right', 2000]]);
});

test('computeSurfaces : mur partiellement mitoyen, seule la partie exposée reste', () => {
  const left = { x: 0, y: 0, width: 1000, height: 600 };
  const right = { x: 1000, y: 200, width: 1000, height: 400 };
  const { walls } = computeSurfaces({ monitors: [left, right], windows: [] });
  const leftRight = walls.filter((w) => w.surfaceId === 'monitor:0' && w.side === 'right');
  assert.deepEqual(leftRight.map((w) => [w.y1, w.y2]), [[0, 200]]);
});

test('computeSurfaces : le rebord d\'une fenêtre est coupé là où une fenêtre devant le cache', () => {
  const monitors = [{ x: 0, y: 0, width: 2000, height: 1000 }];
  const back = { id: 'back', x: 100, y: 300, width: 600, height: 400 };
  const front = { id: 'front', x: 400, y: 200, width: 600, height: 400 };
  const { segments, walls } = computeSurfaces({ monitors, windows: [back, front] });
  const shelf = (id) => segments.filter((s) => s.type === 'shelf' && s.surfaceId === id);
  assert.deepEqual(span(shelf('back')), [[100, 400]]);
  assert.deepEqual(span(shelf('front')), [[400, 1000]]);
  // Back window's right wall (x=700) is behind the front window for y in [300, 600].
  const wall = walls.filter((w) => w.surfaceId === 'back' && w.side === 'right');
  assert.deepEqual(wall.map((w) => [w.y1, w.y2]), [[600, 700]]);
  // Order matters: swapped, it's the other way around.
  const swapped = computeSurfaces({ monitors, windows: [front, back] });
  assert.deepEqual(span(swapped.segments.filter((s) => s.type === 'shelf' && s.surfaceId === 'back')), [[100, 700]]);
});

test('computeSurfaces : une fenêtre qui déborde de l\'écran est restreinte aux moniteurs', () => {
  const monitors = [{ x: 0, y: 0, width: 1000, height: 800 }];
  const win = { id: 'w', x: 800, y: 300, width: 600, height: 300 };
  const { segments, walls } = computeSurfaces({ monitors, windows: [win] });
  assert.deepEqual(span(segments.filter((s) => s.type === 'shelf')), [[800, 1000]]);
  assert.deepEqual(walls.filter((w) => w.surfaceId === 'w').map((w) => w.side), ['left']);
});

test('findSegmentById / findWallById : choisit le morceau le plus proche de la coordonnée', () => {
  const monitors = [{ x: 0, y: 0, width: 2000, height: 1000 }];
  const back = { id: 'back', x: 100, y: 300, width: 800, height: 400 };
  const front = { id: 'front', x: 400, y: 200, width: 200, height: 400 };
  const { segments, walls } = computeSurfaces({ monitors, windows: [back, front] });
  assert.equal(findSegmentById(segments, 'back', 'shelf', 800).x1, 600);
  assert.equal(findSegmentById(segments, 'back', 'shelf', 200).x2, 400);
  assert.equal(findSegmentById(segments, 'back', 'shelf').x1, 100);
  assert.equal(findSegmentById(segments, 'nope', 'shelf', 0), null);
  assert.ok(findWallById(walls, 'back', 'left', 650));
});

// --- Stepping off / over (#21) ----------------------------------------------

const GROUND_SHELF = new Set(['ground', 'shelf']);

test('findDropEdges : rebord de fenêtre -> sol en dessous des deux côtés', () => {
  const { segments } = computeSurfaces({
    monitors: [{ x: 0, y: 0, width: 1000, height: 800 }],
    windows: [{ id: 'w', x: 300, y: 400, width: 200, height: 200 }],
  });
  const shelf = segments.find((s) => s.type === 'shelf');
  const edges = findDropEdges(segments, shelf, 400, 500, GROUND_SHELF);
  assert.deepEqual(edges.map((e) => [e.x, e.dir, e.landing.type]), [[300, -1, 'ground'], [500, 1, 'ground']]);
  assert.deepEqual(findDropEdges(segments, shelf, 400, 100, GROUND_SHELF), [], 'trop haut pour maxDrop');
});

test("findDropEdges : le sol de l'écran haut descend vers l'écran bas, pas dans le vide", () => {
  const low = { x: 0, y: 300, width: 1000, height: 500 };
  const high = { x: 1000, y: 0, width: 1000, height: 500 };
  const { segments } = computeSurfaces({ monitors: [low, high], windows: [] });
  const highGround = segments.find((s) => s.type === 'ground' && s.y === 500);
  const edges = findDropEdges(segments, highGround, 500, 500, GROUND_SHELF);
  assert.deepEqual(edges.map((e) => [e.x, e.dir, e.landing.y]), [[1000, -1, 800]]);
  // The low ground has nothing lower: its right end faces a higher surface.
  const lowGround = segments.find((s) => s.type === 'ground' && s.y === 800);
  assert.deepEqual(findDropEdges(segments, lowGround, 800, 500, GROUND_SHELF), []);
});

test('findLedgeAtWallTop : sol voisin au sommet du mur exposé, null pour un mur flottant', () => {
  const low = { x: 0, y: 300, width: 1000, height: 500 };
  const high = { x: 1000, y: 0, width: 1000, height: 500 };
  const { segments, walls } = computeSurfaces({ monitors: [low, high], windows: [] });
  const wall = walls.find((w) => w.surfaceId === 'monitor:0' && w.side === 'right');
  const found = findLedgeAtWallTop(segments, wall);
  assert.equal(found.segment.surfaceId, 'monitor:1');
  assert.equal(found.dir, 1);
  assert.equal(findLedgeAtWallTop(segments, { x: 123, y1: 50, y2: 90 }), null);
});
