import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Critter, State, Locomotion, weightedChoice, behaviorOverrides } from '../core/critter.js';
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

test('depuis IDLE, un poids sleepWeight écrasant fait toujours basculer vers SLEEP', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    { random: fixedRandom(0.5), walkWeight: 0, sleepWeight: 1000, washWeight: 0, followWeight: 0 },
    { x: 10, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.SLEEP);
  assert.equal(snapshot.event, 'sleep');
});

test('depuis IDLE, un poids washWeight écrasant fait basculer vers WASH puis revient en IDLE', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    {
      random: fixedRandom(0.5),
      walkWeight: 0,
      sleepWeight: 0,
      washWeight: 1000,
      followWeight: 0,
      washDuration: [0.02, 0.02],
    },
    { x: 10, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  let snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(snapshot.state, State.WASH);
  assert.equal(snapshot.event, 'wash');

  for (let i = 0; i < 5; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state !== State.WASH) break;
  }
  assert.equal(snapshot.state, State.IDLE);
});

test('depuis IDLE, un poids followWeight écrasant fait suivre le curseur', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    {
      random: fixedRandom(0.5),
      walkWeight: 0,
      sleepWeight: 0,
      washWeight: 0,
      followWeight: 1000,
      walkSpeed: 40,
    },
    { x: 500, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  let snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor, pointer: { x: 800, y: 0 } });
  assert.equal(snapshot.state, State.FOLLOW);

  const xAfterEntry = snapshot.x;
  snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor, pointer: { x: 800, y: 0 } });
  assert.ok(snapshot.x > xAfterEntry, 'devrait se rapprocher du pointeur (800) situé à droite');
});

test('sans pointeur disponible, followWeight ne déclenche pas FOLLOW (retombe sur la marche)', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    { random: fixedRandom(0.01), walkWeight: 0, sleepWeight: 0, washWeight: 0, followWeight: 1000 },
    { x: 500, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.notEqual(snapshot.state, State.FOLLOW);
});

test('un critter qui suit le curseur reste dans les bornes de la surface et retombe si elle disparaît', () => {
  const win = { id: 'w1', x: 400, y: 300, width: 200, height: 100 };
  let surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter({ random: fixedRandom(0.9), walkSpeed: 200 }, { x: 450, y: 300 });

  critter.currentSurface = surfaces.segments.find((s) => s.type === 'shelf');
  critter.state = State.FOLLOW;
  critter.stateTimer = 10;

  let snapshot;
  for (let i = 0; i < 100; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor, pointer: { x: 5000, y: 0 } });
  }
  assert.equal(snapshot.state, State.FOLLOW);
  assert.equal(snapshot.x, 600, 'clampé au bord droit du rebord (x2=600), pas au-delà');

  surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor, pointer: { x: 5000, y: 0 } });

  assert.equal(snapshot.state, State.FALL);
});

test('weightedChoice répartit selon les poids relatifs', () => {
  const candidates = [
    { value: 'a', weight: 1 },
    { value: 'b', weight: 3 },
  ];
  assert.equal(weightedChoice(candidates, fixedRandom(0)), 'a');
  assert.equal(weightedChoice(candidates, fixedRandom(0.24)), 'a');
  assert.equal(weightedChoice(candidates, fixedRandom(0.26)), 'b');
  assert.equal(weightedChoice(candidates, fixedRandom(0.99)), 'b');
});

test('weightedChoice renvoie null si la somme des poids est nulle ou négative', () => {
  assert.equal(weightedChoice([{ value: 'a', weight: 0 }], fixedRandom(0.5)), null);
  assert.equal(weightedChoice([], fixedRandom(0.5)), null);
});

test('weightedChoice avec un seul candidat le renvoie toujours', () => {
  const candidates = [{ value: 'only', weight: 5 }];
  assert.equal(weightedChoice(candidates, fixedRandom(0)), 'only');
  assert.equal(weightedChoice(candidates, fixedRandom(0.999)), 'only');
});

test('anti-répétition : la même activité spéciale devient moins probable juste après avoir été choisie', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    {
      random: fixedRandom(0.5),
      walkWeight: 0,
      sleepWeight: 5,
      washWeight: 10,
      followWeight: 0,
      repeatPenalty: 0.3,
      washDuration: [1000, 1000], // ne doit pas expirer pendant le test
      sleepDuration: [1000, 1000],
    },
    { x: 10, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };

  critter.state = State.IDLE;
  critter.stateTimer = 0;
  let snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(snapshot.state, State.WASH, 'premier tirage : wash a le plus gros poids');

  critter.state = State.IDLE;
  critter.stateTimer = 0;
  snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(
    snapshot.state,
    State.SLEEP,
    "même tirage aléatoire, mais wash vient d'être fait : sa pénalité le fait céder la place à sleep",
  );
});

test('FOLLOW devient moins probable quand le curseur est loin (suivi sensible à la distance)', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const config = {
    random: fixedRandom(0.3),
    walkWeight: 2,
    sleepWeight: 0,
    washWeight: 0,
    followWeight: 10,
  };

  const near = new Critter(config, { x: 500, y: monitor.height });
  near.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  near.state = State.IDLE;
  near.stateTimer = 0;
  const nearSnapshot = near.tick(1 / 60, surfaces, { worldBounds: monitor, pointer: { x: 500, y: 0 } });
  assert.equal(nearSnapshot.state, State.FOLLOW, 'curseur juste au-dessus : suivi favorisé');

  const far = new Critter(config, { x: 500, y: monitor.height });
  far.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  far.state = State.IDLE;
  far.stateTimer = 0;
  const farSnapshot = far.tick(1 / 60, surfaces, { worldBounds: monitor, pointer: { x: 5500, y: 0 } });
  assert.equal(farSnapshot.state, State.WALK, 'même tirage, mais curseur loin : la marche l\'emporte sur le suivi');
});

test('depuis IDLE, un poids greetWeight écrasant fait saluer le critter le plus proche', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    { random: fixedRandom(0.5), walkWeight: 0, sleepWeight: 0, washWeight: 0, followWeight: 0, greetWeight: 1000 },
    { x: 500, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  const snapshot = critter.tick(1 / 60, surfaces, {
    worldBounds: monitor,
    otherCritters: [{ x: 800, y: monitor.height }],
  });

  assert.equal(snapshot.state, State.GREET);
});

test('GREET avance vers le critter le plus proche parmi plusieurs, clampé à la surface', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.9), walkSpeed: 40 }, { x: 500, y: monitor.height });
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.GREET;
  critter.stateTimer = 10;

  const others = [
    { x: 900, y: monitor.height }, // loin
    { x: 550, y: monitor.height }, // le plus proche : cible attendue
  ];

  const snapshot1 = critter.tick(1 / 60, surfaces, { worldBounds: monitor, otherCritters: others });
  assert.equal(snapshot1.state, State.GREET);
  assert.ok(snapshot1.x > 500 && snapshot1.x < 550, "avance vers le plus proche (550), pas vers le plus loin (900)");
});

test('en dessous de greetDistance, GREET déclenche "greeted" et repasse en IDLE', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    { random: fixedRandom(0.9), greetDistance: 20 },
    { x: 500, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.GREET;
  critter.stateTimer = 10;

  const snapshot = critter.tick(1 / 60, surfaces, {
    worldBounds: monitor,
    otherCritters: [{ x: 510, y: monitor.height }], // distance 10 < greetDistance 20
  });

  assert.equal(snapshot.event, 'greeted');
  assert.equal(snapshot.state, State.IDLE);
});

test('GREET déclenche aussi "greeted" sur la cible, pas seulement sur l\'initiateur', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });

  const initiator = new Critter({ random: fixedRandom(0.9), greetDistance: 20 }, { x: 500, y: monitor.height });
  initiator.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  initiator.state = State.GREET;
  initiator.stateTimer = 10;

  const target = new Critter({ random: fixedRandom(0.9) }, { x: 510, y: monitor.height });
  target.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  target.state = State.IDLE;
  target.stateTimer = 10; // ne doit pas retomber sur un nouveau tirage pendant le test

  const initiatorSnapshot = initiator.tick(1 / 60, surfaces, {
    worldBounds: monitor,
    otherCritters: [{ x: target.x, y: target.y, critter: target }], // distance 10 < greetDistance 20
  });
  assert.equal(initiatorSnapshot.event, 'greeted', "l'initiateur réagit immédiatement, dans son propre tick");

  // interact() diffère via _pendingEvent : il faut un tick de la CIBLE pour
  // voir l'événement apparaître dans son propre snapshot.
  const targetSnapshot = target.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(targetSnapshot.event, 'greeted', 'la cible réagit aussi, à son tick suivant');
});

test('sans otherCritters, GREET ne se déclenche jamais (retombe sur la marche)', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    { random: fixedRandom(0.01), walkWeight: 0, sleepWeight: 0, washWeight: 0, followWeight: 0, greetWeight: 1000 },
    { x: 500, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.notEqual(snapshot.state, State.GREET);
});

test('GREET devient moins probable quand le critter le plus proche est loin (sensible à la distance)', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const config = {
    random: fixedRandom(0.3),
    walkWeight: 2,
    sleepWeight: 0,
    washWeight: 0,
    followWeight: 0,
    greetWeight: 10,
  };

  const near = new Critter(config, { x: 500, y: monitor.height });
  near.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  near.state = State.IDLE;
  near.stateTimer = 0;
  const nearSnapshot = near.tick(1 / 60, surfaces, {
    worldBounds: monitor,
    otherCritters: [{ x: 500, y: monitor.height }],
  });
  assert.equal(nearSnapshot.state, State.GREET, 'autre critter juste à côté : salutation favorisée');

  const far = new Critter(config, { x: 500, y: monitor.height });
  far.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  far.state = State.IDLE;
  far.stateTimer = 0;
  const farSnapshot = far.tick(1 / 60, surfaces, {
    worldBounds: monitor,
    otherCritters: [{ x: 5500, y: monitor.height }],
  });
  assert.equal(farSnapshot.state, State.WALK, 'même tirage, mais autre critter loin : la marche l\'emporte');
});

test('depuis IDLE, un poids climbSeekWeight écrasant fait chercher un mur pour grimper', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    {
      random: fixedRandom(0.5),
      walkWeight: 0,
      sleepWeight: 0,
      washWeight: 0,
      followWeight: 0,
      greetWeight: 0,
      climbSeekWeight: 1000,
      supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.WALL]),
    },
    { x: 500, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.SEEK_WALL);
});

test("sans support 'wall', SEEK_WALL n'est jamais choisi même avec climbSeekWeight écrasant", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    {
      random: fixedRandom(0.01),
      walkWeight: 0,
      sleepWeight: 0,
      washWeight: 0,
      followWeight: 0,
      greetWeight: 0,
      climbSeekWeight: 1000,
    },
    { x: 500, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.notEqual(snapshot.state, State.SEEK_WALL);
});

test('SEEK_WALL avance vers le mur atteignable le plus proche puis grimpe (CLIMB) en l\'atteignant', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    { random: fixedRandom(0.9), walkSpeed: 300, supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.WALL]) },
    { x: 100, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.SEEK_WALL;
  critter.stateTimer = 10;

  let snapshot;
  for (let i = 0; i < 60; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state === State.CLIMB) break;
  }

  assert.equal(snapshot.state, State.CLIMB);
  assert.equal(critter.currentSurface.side, 'left');
  assert.equal(critter.currentSurface.surfaceId, 'monitor:0');
});

test('SEEK_WALL retombe en FALL si sa surface disparaît en chemin', () => {
  const win = { id: 'w1', x: 400, y: 300, width: 200, height: 100 };
  let surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter(
    { random: fixedRandom(0.9), supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.WALL]) },
    { x: 450, y: 300 },
  );
  critter.currentSurface = surfaces.segments.find((s) => s.type === 'shelf');
  critter.state = State.SEEK_WALL;
  critter.stateTimer = 10;

  surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.FALL);
});

test("SEEK_WALL retombe en IDLE si aucun mur atteignable n'est à portée", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    { random: fixedRandom(0.9), supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.WALL]) },
    { x: 500, y: 250 }, // y ne correspond au bas d'aucun mur (murs du moniteur : y2=500)
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: 250 };
  critter.state = State.SEEK_WALL;
  critter.stateTimer = 10;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.IDLE);
});

test('depuis IDLE, un poids seekFocusWeight écrasant fait aller voir la fenêtre focalisée', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    {
      random: fixedRandom(0.5),
      walkWeight: 0,
      sleepWeight: 0,
      washWeight: 0,
      followWeight: 0,
      greetWeight: 0,
      climbSeekWeight: 0,
      seekFocusWeight: 1000,
    },
    { x: 500, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  const snapshot = critter.tick(1 / 60, surfaces, {
    worldBounds: monitor,
    focusedWindow: { x: 800, y: 0, width: 100, height: 100 },
  });

  assert.equal(snapshot.state, State.SEEK_FOCUS);
});

test('sans focusedWindow, SEEK_FOCUS ne se déclenche jamais (retombe sur la marche)', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    {
      random: fixedRandom(0.01),
      walkWeight: 0,
      sleepWeight: 0,
      washWeight: 0,
      followWeight: 0,
      greetWeight: 0,
      climbSeekWeight: 0,
      seekFocusWeight: 1000,
    },
    { x: 500, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.notEqual(snapshot.state, State.SEEK_FOCUS);
});

test("SEEK_FOCUS avance vers le centre de la fenêtre focalisée puis s'arrête (IDLE) en l'atteignant", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.9), walkSpeed: 300 }, { x: 100, y: monitor.height });
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.SEEK_FOCUS;
  critter.stateTimer = 10;

  const focusedWindow = { x: 400, y: 300, width: 200, height: 100 }; // centre x = 500

  let snapshot;
  for (let i = 0; i < 120; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor, focusedWindow });
    if (snapshot.state === State.IDLE) break;
  }

  assert.equal(snapshot.state, State.IDLE);
  assert.ok(
    Math.abs(snapshot.x - 500) < 25,
    `devrait s'être arrêté près du centre de la fenêtre (500), obtenu ${snapshot.x}`,
  );
});

test('SEEK_FOCUS retombe en FALL si sa surface disparaît en chemin', () => {
  const win = { id: 'w1', x: 400, y: 300, width: 200, height: 100 };
  let surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 450, y: 300 });
  critter.currentSurface = surfaces.segments.find((s) => s.type === 'shelf');
  critter.state = State.SEEK_FOCUS;
  critter.stateTimer = 10;

  surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const snapshot = critter.tick(1 / 60, surfaces, {
    worldBounds: monitor,
    focusedWindow: { x: 400, y: 300, width: 200, height: 100 },
  });

  assert.equal(snapshot.state, State.FALL);
});

test("SEEK_FOCUS retombe en IDLE si focusedWindow n'est plus fourni (expiré côté manager, ou timeout)", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 100, y: monitor.height });
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.SEEK_FOCUS;
  critter.stateTimer = 10;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.IDLE);
});

test('un GREET réussi peut enchaîner sur CHASE et propose une fuite à la cible', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });

  const initiator = new Critter(
    { random: fixedRandom(0.9), greetDistance: 20, chaseChance: 1 },
    { x: 500, y: monitor.height },
  );
  initiator.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  initiator.state = State.GREET;
  initiator.stateTimer = 10;

  const target = new Critter({ random: fixedRandom(0.9) }, { x: 510, y: monitor.height });
  target.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  target.state = State.IDLE;
  target.stateTimer = 10;

  const snapshot = initiator.tick(1 / 60, surfaces, {
    worldBounds: monitor,
    otherCritters: [{ x: target.x, y: target.y, critter: target }],
  });

  assert.equal(snapshot.state, State.CHASE);
  assert.equal(target._chaseInvitation, initiator);
});

test("la cible accepte de fuir si fleeWeight l'emporte et le poursuivant est proche", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const chaser = new Critter({}, { x: 505, y: monitor.height });

  const target = new Critter(
    {
      random: fixedRandom(0.5),
      walkWeight: 0,
      sleepWeight: 0,
      washWeight: 0,
      followWeight: 0,
      greetWeight: 0,
      climbSeekWeight: 0,
      seekFocusWeight: 0,
      fleeWeight: 1000,
    },
    { x: 500, y: monitor.height },
  );
  target.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  target.state = State.IDLE;
  target.stateTimer = 0;
  target.proposeChase(chaser);

  const snapshot = target.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.FLEE);
});

test('la cible ignore la fuite si le poursuivant est loin et un autre candidat domine', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const chaser = new Critter({}, { x: 5000, y: monitor.height }); // très loin

  const target = new Critter(
    {
      random: fixedRandom(0.99),
      walkWeight: 1000,
      sleepWeight: 0,
      washWeight: 0,
      followWeight: 0,
      greetWeight: 0,
      climbSeekWeight: 0,
      seekFocusWeight: 0,
      fleeWeight: 50,
      fleeMaxDistance: 600,
    },
    { x: 500, y: monitor.height },
  );
  target.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  target.state = State.IDLE;
  target.stateTimer = 0;
  target.proposeChase(chaser);

  const snapshot = target.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.notEqual(snapshot.state, State.FLEE);
});

test('FLEE éloigne le critter de _fleeFrom, clampé à la surface', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const chaser = new Critter({}, { x: 10, y: monitor.height }); // à gauche

  const critter = new Critter({ random: fixedRandom(0.9), walkSpeed: 300 }, { x: 20, y: monitor.height });
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.FLEE;
  critter.stateTimer = 10;
  critter._fleeFrom = chaser;

  let snapshot;
  for (let i = 0; i < 5; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  }

  assert.ok(snapshot.x > 20, 'devrait fuir vers la droite (loin du poursuivant à x=10)');
});

test('CHASE suit _chaseTarget (référence live) et, une fois rattrapée, pose greeted des deux côtés', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });

  const target = new Critter({ random: fixedRandom(0.9) }, { x: 600, y: monitor.height });
  target.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  target.state = State.IDLE;
  target.stateTimer = 10; // reste immobile pendant toute la boucle du poursuivant

  const chaser = new Critter(
    { random: fixedRandom(0.9), walkSpeed: 300, greetDistance: 20 },
    { x: 100, y: monitor.height },
  );
  chaser.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  chaser.state = State.CHASE;
  chaser.stateTimer = 10;
  chaser._chaseTarget = target;

  let chaserSnapshot;
  for (let i = 0; i < 120; i++) {
    chaserSnapshot = chaser.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (chaserSnapshot.state === State.IDLE) break;
  }

  assert.equal(chaserSnapshot.state, State.IDLE);
  assert.equal(chaserSnapshot.event, 'greeted');

  // La cible reçoit l'événement à SON prochain tick (interact()/_pendingEvent).
  const targetSnapshot = target.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(targetSnapshot.event, 'greeted');
});

test('CHASE retombe en FALL si sa surface disparaît en chemin', () => {
  const win = { id: 'w1', x: 400, y: 300, width: 200, height: 100 };
  let surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const target = new Critter({}, { x: 900, y: 300 });

  const chaser = new Critter({ random: fixedRandom(0.9) }, { x: 450, y: 300 });
  chaser.currentSurface = surfaces.segments.find((s) => s.type === 'shelf');
  chaser.state = State.CHASE;
  chaser.stateTimer = 10;
  chaser._chaseTarget = target;

  surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const snapshot = chaser.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.FALL);
});

test('CHASE retombe en IDLE si _chaseTarget est absent (timeout)', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 500, y: monitor.height });
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.CHASE;
  critter.stateTimer = 10;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.IDLE);
});

test('FLEE retombe en IDLE si _fleeFrom est absent (timeout)', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 500, y: monitor.height });
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.FLEE;
  critter.stateTimer = 10;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.IDLE);
});

test('depuis IDLE, sleepWeight écrasant bascule vers SEEK_NAP si un rebord est à portée', () => {
  const win = { id: 'w1', x: 600, y: monitor.height, width: 200, height: 100 }; // haut au niveau du sol
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter(
    {
      random: fixedRandom(0.5),
      walkWeight: 0,
      sleepWeight: 1000,
      washWeight: 0,
      followWeight: 0,
      greetWeight: 0,
      climbSeekWeight: 0,
      seekFocusWeight: 0,
    },
    { x: 500, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.SEEK_NAP);
});

test("SEEK_NAP avance vers le rebord puis bascule en SLEEP (currentSurface = le rebord) en l'atteignant", () => {
  const win = { id: 'w1', x: 600, y: monitor.height, width: 200, height: 100 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter({ random: fixedRandom(0.9), walkSpeed: 300 }, { x: 500, y: monitor.height });
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.SEEK_NAP;
  critter.stateTimer = 10;

  let snapshot;
  for (let i = 0; i < 60; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state === State.SLEEP) break;
  }

  assert.equal(snapshot.state, State.SLEEP);
  assert.equal(critter.currentSurface.surfaceId, 'w1');
  assert.equal(critter.currentSurface.type, 'shelf');
});

test('SEEK_NAP retombe en FALL si sa surface disparaît en chemin', () => {
  const win = { id: 'w1', x: 400, y: 300, width: 200, height: 100 };
  let surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 450, y: 300 });
  critter.currentSurface = surfaces.segments.find((s) => s.type === 'shelf' && s.surfaceId === 'w1');
  critter.state = State.SEEK_NAP;
  critter.stateTimer = 10;

  surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.FALL);
});

test("SEEK_NAP retombe en IDLE si aucun rebord n'est à portée", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.9) }, { x: 500, y: monitor.height });
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.SEEK_NAP;
  critter.stateTimer = 10;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.equal(snapshot.state, State.IDLE);
});

test('FLY atterrit (repasse en FALL) une fois stateTimer écoulé, au lieu de voler indéfiniment', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.9), flySpeed: 60 }, { x: 500, y: 100 });
  critter.state = State.FLY;
  critter.stateTimer = 0.05; // expire après quelques ticks

  let snapshot;
  for (let i = 0; i < 10; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  }

  assert.equal(snapshot.state, State.FALL);
});

test('SWIM ondule perpendiculairement à sa trajectoire, contrairement à FLY qui va en ligne droite', () => {
  const shared = { random: fixedRandom(0.999), roamRetargetDuration: [1000, 1000] };

  const swimmer = new Critter(
    { ...shared, swimSpeed: 100, swimWaveAmplitude: 1, swimWaveFrequency: 100 },
    { x: 500, y: 500 },
  );
  swimmer.state = State.SWIM;
  swimmer.stateTimer = 10;
  swimmer.walkTargetX = 900;
  swimmer._flyTargetY = 500; // même hauteur : sans ondulation, y resterait à 500
  swimmer._roamTimer = 1000; // pas de reciblage pendant le test

  const swimSnapshot = swimmer.tick(1 / 60, {}, { worldBounds: monitor });
  assert.notEqual(swimSnapshot.y, 500, 'devrait dévier verticalement malgré une cible à la même hauteur');

  const flyer = new Critter({ ...shared, flySpeed: 100 }, { x: 500, y: 500 });
  flyer.state = State.FLY;
  flyer.stateTimer = 10;
  flyer.walkTargetX = 900;
  flyer._flyTargetY = 500;
  flyer._roamTimer = 1000;

  const flySnapshot = flyer.tick(1 / 60, {}, { worldBounds: monitor });
  assert.equal(flySnapshot.y, 500, 'FLY va en ligne droite : pas de déviation verticale ici');
});

test('depuis IDLE, flyWeight/swimWeight écrasants font décoller/plonger une espèce qui les supporte', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const baseWeights = {
    walkWeight: 0,
    sleepWeight: 0,
    washWeight: 0,
    followWeight: 0,
    greetWeight: 0,
    climbSeekWeight: 0,
    seekFocusWeight: 0,
  };

  const flyer = new Critter(
    {
      random: fixedRandom(0.5),
      ...baseWeights,
      flyWeight: 1000,
      swimWeight: 0,
      supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.AIR]),
    },
    { x: 500, y: monitor.height },
  );
  flyer.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  flyer.state = State.IDLE;
  flyer.stateTimer = 0;
  assert.equal(flyer.tick(1 / 60, surfaces, { worldBounds: monitor }).state, State.FLY);

  const swimmer = new Critter(
    {
      random: fixedRandom(0.5),
      ...baseWeights,
      flyWeight: 0,
      swimWeight: 1000,
      supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.WATER]),
    },
    { x: 500, y: monitor.height },
  );
  swimmer.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  swimmer.state = State.IDLE;
  swimmer.stateTimer = 0;
  assert.equal(swimmer.tick(1 / 60, surfaces, { worldBounds: monitor }).state, State.SWIM);
});

test("sans support 'air'/'water', FLY/SWIM ne sont jamais choisis même avec des poids écrasants", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    {
      random: fixedRandom(0.01),
      walkWeight: 0,
      sleepWeight: 0,
      washWeight: 0,
      followWeight: 0,
      greetWeight: 0,
      climbSeekWeight: 0,
      seekFocusWeight: 0,
      flyWeight: 1000,
      swimWeight: 1000,
    },
    { x: 500, y: monitor.height },
  );
  critter.currentSurface = { type: 'ground', x1: 0, x2: 1000, y: monitor.height };
  critter.state = State.IDLE;
  critter.stateTimer = 0;

  const snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });

  assert.notEqual(snapshot.state, State.FLY);
  assert.notEqual(snapshot.state, State.SWIM);
});

test("atterrir dans une zone d'eau initialise correctement SWIM (ne retombe pas instantanément)", () => {
  const surfaces = computeSurfaces({
    monitors: [monitor],
    windows: [],
    waterZones: [{ x: 0, y: 300, width: 1000, height: 50 }],
  });
  const critter = new Critter(
    { random: fixedRandom(0.9), supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.WATER]) },
    { x: 500, y: 0 },
  );

  let snapshot;
  for (let i = 0; i < 300; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state !== State.FALL) break;
  }
  assert.equal(snapshot.state, State.SWIM);

  // Un tick de plus : ne doit PAS retomber immédiatement en FALL (bug visé
  // par le correctif : stateTimer/_roamTimer bien initialisés à l'entrée).
  const nextSnapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(nextSnapshot.state, State.SWIM);
});

test('behaviorOverrides garde les nombres et intervalles connus, écarte le reste', () => {
  const { config, ignored } = behaviorOverrides({
    sleepWeight: 15,
    idleDuration: [0.5, 1.5],
    inconnue: 3, // clé absente de DEFAULT_CONFIG
    washWeight: 'beaucoup', // mauvais type
    walkDuration: [1, 2, 3], // intervalle mal formé
    random: 0.5, // fonction côté cœur : jamais surchargeable depuis un JSON
    supportedSurfaces: ['air'], // Set côté cœur : idem
  });

  assert.deepEqual(config, { sleepWeight: 15, idleDuration: [0.5, 1.5] });
  assert.deepEqual(
    ignored.sort(),
    ['inconnue', 'random', 'supportedSurfaces', 'walkDuration', 'washWeight'].sort(),
  );
});

test('behaviorOverrides sans section behavior renvoie une config vide', () => {
  assert.deepEqual(behaviorOverrides(undefined), { config: {}, ignored: [] });
});

test("une espèce aquatique pure enchaîne les nages au lieu de retomber en fin de session", () => {
  const critter = new Critter(
    { random: fixedRandom(0.5), supportedSurfaces: new Set([Locomotion.WATER]) },
    { x: 500, y: 200 },
  );
  critter.state = State.SWIM;
  critter.stateTimer = 0.01; // expire dès le premier tick

  const snapshot = critter.tick(1 / 60, {}, { worldBounds: monitor });

  assert.equal(snapshot.state, State.SWIM);
  assert.ok(critter.stateTimer > 0, 'une nouvelle session doit avoir démarré');
});

test("une espèce aquatique pure qui touche le sol repart nager au lieu de s'y poser", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    { random: fixedRandom(0.5), supportedSurfaces: new Set([Locomotion.WATER]) },
    { x: 500, y: 100 },
  );

  let snapshot;
  for (let i = 0; i < 300; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state !== State.FALL) break;
  }

  assert.equal(snapshot.state, State.SWIM);
});

test("une espèce purement aérienne enchaîne les vols et ne se pose pas", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter(
    { random: fixedRandom(0.5), supportedSurfaces: new Set([Locomotion.AIR]) },
    { x: 500, y: 100 },
  );

  let snapshot;
  for (let i = 0; i < 300; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    if (snapshot.state !== State.FALL) break;
  }
  assert.equal(snapshot.state, State.FLY, 'touche le sol puis repart en vol');

  critter.stateTimer = 0.01;
  snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(snapshot.state, State.FLY, 'fin de session : nouvelle session, pas de chute');
});

test('une espèce sol + eau retombe normalement en fin de nage (non-régression)', () => {
  const critter = new Critter(
    { random: fixedRandom(0.5), supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.WATER]) },
    { x: 500, y: 200 },
  );
  critter.state = State.SWIM;
  critter.stateTimer = 0.01;

  const snapshot = critter.tick(1 / 60, {}, { worldBounds: monitor });

  assert.equal(snapshot.state, State.FALL);
});
