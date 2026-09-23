import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSurfaces, findSurfaceBelow, isOnSegment } from '../core/surfaceMap.js';

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
