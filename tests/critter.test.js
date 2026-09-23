import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Critter, State, Locomotion } from '../core/critter.js';
import { computeSurfaces } from '../core/surfaceMap.js';

/** RNG déterministe pour des tests reproductibles (retourne toujours la même
 * séquence quel que soit l'ordre d'appel dans un test donné). */
function fixedRandom(...values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const monitor = { x: 0, y: 0, width: 1000, height: 500 };

test("un critter lâché en l'air tombe puis atterrit sur le sol", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    { random: fixedRandom(0.9) }, // 0.9 > sleepChance donc pas de sieste
    { x: 500, y: 100 },
  );

  assert.equal(critter.state, State.FALL);

  let snapshot;
  for (let i = 0; i < 300; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state !== State.FALL) break;
  }

  assert.equal(snapshot.state, State.IDLE);
  assert.ok(Math.abs(snapshot.y - monitor.height) < 1, `y devrait être proche de ${monitor.height}, obtenu ${snapshot.y}`);
});

test('un critter atterrit sur le rebord d\'une fenêtre plutôt que de traverser jusqu\'au sol', () => {
  const surfaces = computeSurfaces({
    monitors: [monitor],
    windows: [{ id: 'w1', x: 400, y: 300, width: 200, height: 100 }],
  });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 450, y: 0 });

  let snapshot;
  for (let i = 0; i < 300; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state !== State.FALL) break;
  }

  assert.equal(snapshot.state, State.IDLE);
  assert.equal(snapshot.y, 300);
});

test('le drag prend le contrôle total de la position', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({}, { x: 10, y: 10 });

  critter.startDrag();
  critter.dragTo(777, 42);
  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.DRAG);
  assert.equal(snapshot.x, 777);
  assert.equal(snapshot.y, 42);
});

test('relâcher pendant un drag fait retomber le critter', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 10, y: 10 });

  critter.startDrag();
  critter.dragTo(500, 200);
  critter.tick(1 / 60, surfaces, {});
  critter.endDrag();

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(snapshot.state, State.FALL);
});

test("une espèce sans support 'wall' ne grimpe jamais (pas d'état CLIMB atteint)", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    { random: fixedRandom(0.9), supportedSurfaces: new Set([Locomotion.GROUND]) },
    { x: 500, y: 100 },
  );

  for (let i = 0; i < 600; i++) {
    critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    assert.notEqual(critter.state, State.CLIMB);
  }
});

test('un critter posé sur un rebord de fenêtre retombe quand la fenêtre est fermée', () => {
  const win = { id: 'w1', x: 400, y: 300, width: 200, height: 100 };
  let surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 450, y: 0 });

  let snapshot;
  for (let i = 0; i < 300; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state !== State.FALL) break;
  }
  assert.equal(snapshot.state, State.IDLE);
  assert.equal(snapshot.y, 300);

  // La fenêtre disparaît (fermée) : le rebord mémorisé n'existe plus dans
  // les surfaces recalculées à ce tick.
  surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.FALL);
});

test('un critter posé sur un rebord retombe quand la fenêtre est déplacée sous ses pieds', () => {
  const win = { id: 'w1', x: 400, y: 300, width: 200, height: 100 };
  let surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 450, y: 0 });

  let snapshot;
  for (let i = 0; i < 300; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state !== State.FALL) break;
  }
  assert.equal(snapshot.state, State.IDLE);

  // La fenêtre glisse loin sur la droite : le rebord (même id) ne passe
  // plus sous le critter.
  surfaces = computeSurfaces({ monitors: [monitor], windows: [{ ...win, x: 900 }] });
  snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.FALL);
});

test('pet() ne casse pas la boucle et se contente de signaler un événement', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 10, y: monitor.height });
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 10;

  critter.pet();
  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.event, 'petted');
  assert.equal(snapshot.state, State.IDLE);
});

test("une espèce sans support 'wall' tombe le long d'une fenêtre sans s'y accrocher", () => {
  const win = { id: 'w1', x: 400, y: 200, width: 200, height: 100 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter(
    { random: fixedRandom(0.9), supportedSurfaces: new Set([Locomotion.GROUND]) },
    { x: 400, y: 300 },
  );

  for (let i = 0; i < 300; i++) {
    critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    assert.notEqual(critter.state, State.CLIMB);
  }
});

test("un critter WALL+CEILING lâché contre le bord d'une fenêtre s'accroche et grimpe (CLIMB)", () => {
  const win = { id: 'w1', x: 400, y: 200, width: 200, height: 100 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter(
    {
      random: fixedRandom(0.9),
      supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.WALL]),
    },
    { x: 400, y: 250 }, // déjà au niveau du mur gauche de la fenêtre (x1=400, y in [200,300])
  );

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.CLIMB);
  assert.equal(critter.currentSurface.side, 'left');
});

test("un critter WALL+CEILING s'accroche sous le dessous d'une fenêtre (CEILING) en grimpant", () => {
  const win = { id: 'w1', x: 400, y: 200, width: 200, height: 100 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter(
    {
      random: fixedRandom(0.9),
      supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.WALL, Locomotion.CEILING]),
    },
    // Juste sous le bas de la fenêtre (win.y + height = 300) : la chute
    // franchit ce seuil dès le premier tick et vient s'y accrocher.
    { x: 400, y: 300 },
  );

  let snapshot;
  for (let i = 0; i < 60; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state === State.CEILING) break;
  }

  assert.equal(snapshot.state, State.CEILING);
  assert.equal(snapshot.y, 300);
  assert.equal(critter.currentSurface.type, 'ceiling');
  assert.equal(critter.currentSurface.surfaceId, 'w1');
  // Repart vers le centre du dessous de fenêtre, pas vers le bord duquel il
  // vient de grimper (sinon il en retomberait aussitôt).
  assert.equal(critter.facing, 1);
});

test('un critter accroché sous une fenêtre retombe si elle est fermée', () => {
  const win = { id: 'w1', x: 400, y: 200, width: 200, height: 100 };
  let surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter(
    {
      random: fixedRandom(0.9),
      supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.WALL, Locomotion.CEILING]),
    },
    { x: 400, y: 300 },
  );

  let snapshot;
  for (let i = 0; i < 60; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state === State.CEILING) break;
  }
  assert.equal(snapshot.state, State.CEILING);

  surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.FALL);
});

test("un critter WALL sans CEILING reste accroché en haut du mur sans planter ni osciller", () => {
  const win = { id: 'w1', x: 400, y: 200, width: 200, height: 100 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter(
    {
      random: fixedRandom(0.9),
      supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.WALL]),
    },
    { x: 400, y: 250 },
  );

  let snapshot;
  for (let i = 0; i < 120; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  }

  assert.equal(snapshot.state, State.IDLE);
  assert.equal(critter.currentSurface, null);
});

test('interact() associe chaque geste à sa réaction thématique', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });

  const cases = [
    ['doubleClick', 'tickled'],
    ['rightClick', 'annoyed'],
    ['hover', 'noticed'],
    ['click', 'petted'],
  ];

  for (const [kind, expectedEvent] of cases) {
    const critter = new Critter({ random: fixedRandom(0.9) }, { x: 10, y: monitor.height });
    critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
    critter.state = State.IDLE;
    critter.stateTimer = 10;

    critter.interact(kind);
    const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

    assert.equal(snapshot.event, expectedEvent, `${kind} devrait poser l'événement ${expectedEvent}`);
  }
});

test("interact() avec un geste inconnu ne plante pas et ne pose pas d'événement", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 10, y: monitor.height });
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 10;

  critter.interact('inconnu');
  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.event, null);
  assert.equal(snapshot.state, State.IDLE);
});
