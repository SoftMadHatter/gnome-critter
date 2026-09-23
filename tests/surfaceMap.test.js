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

  assert.equal(findWallNear(walls, 500, 250, 260), null); // trop loin horizontalement
  assert.equal(findWallNear(walls, 402, 350, 360), null); // hors de la portée verticale du mur
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
  assert.equal(findCeilingAbove(segments, 450, 299, 5), null); // déjà passé au-dessus, hors de portée
});

test('findReachableWall trouve le mur le plus proche dont le bas est au niveau donné', () => {
  const { walls } = computeSurfaces({
    monitors: [{ x: 0, y: 0, width: 1000, height: 1000 }],
    windows: [
      { id: 'floating', x: 400, y: 200, width: 200, height: 100 }, // bas à 300
      { id: 'grounded', x: 100, y: 900, width: 50, height: 100 }, // bas à 1000, au niveau du sol
    ],
  });

  // Au niveau du sol (y=1000) : le mur de la fenêtre posée au sol, plus
  // proche que les murs du moniteur, l'emporte.
  const near = findReachableWall(walls, 120, 1000);
  assert.ok(near);
  assert.equal(near.surfaceId, 'grounded');

  // Loin de cette fenêtre, toujours au sol : un mur du moniteur.
  const farFromWindow = findReachableWall(walls, 900, 1000);
  assert.equal(farFromWindow.surfaceId, 'monitor:0');
  assert.equal(farFromWindow.side, 'right');

  // Au niveau du bas de la fenêtre flottante (y=300) : SON mur, pas ceux
  // du sol/moniteur qui ne sont pas au niveau ici.
  const atFloatingWindow = findReachableWall(walls, 450, 300);
  assert.equal(atFloatingWindow.surfaceId, 'floating');
  assert.equal(atFloatingWindow.side, 'left');

  // À un niveau où aucun mur n'a son bas : rien de "atteignable".
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

  // La surface déjà occupée ('near') est exclue : le suivant l'emporte.
  const excludingNear = findReachableShelf(segments, 250, 300, 'near');
  assert.equal(excludingNear.surfaceId, 'far');

  assert.equal(findReachableShelf(segments, 250, 300, 'unrelated', 10), null, 'trop loin pour maxDistance=10');
  assert.equal(findReachableShelf(segments, 450, 999, 'unrelated'), null, 'aucun rebord à ce niveau');
});
