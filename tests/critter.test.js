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
      runWeight: 0,
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
    runWeight: 0,
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
    runWeight: 0,
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

test('FLY vole jusqu\'à une surface et s\'y pose, sans jamais passer par FALL', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.9), flySpeed: 200 }, { x: 500, y: 100 });
  critter.state = State.FLY;
  critter.stateTimer = 0.01; // la durée ne compte plus : seule l'arrivée termine le vol

  const seen = new Set();
  let snapshot;
  for (let i = 0; i < 600; i++) {
    snapshot = critter.tick(1 / 60, surfaces, { worldBounds: monitor });
    seen.add(snapshot.state);
    if (snapshot.state !== State.FLY) break;
  }

  assert.equal(snapshot.state, State.IDLE);
  assert.equal(snapshot.event, 'landed');
  assert.equal(critter.y, monitor.height, 'posé sur le sol');
  assert.ok(!seen.has(State.FALL));
});

test('FLY se pose sur un rebord de fenêtre quand il est la cible', () => {
  const win = { id: 'w1', x: 200, y: 200, width: 300, height: 100 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const critter = new Critter({ random: fixedRandom(0, 0.5), flySpeed: 300 }, { x: 600, y: 50 });
  critter.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  critter.state = State.FLY;
  critter._flyTarget = null;

  for (let i = 0; i < 600 && critter.state === State.FLY; i++) {
    critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  }

  assert.equal(critter.state, State.IDLE);
  assert.equal(critter.y, 200);
  assert.ok(critter.x >= 200 && critter.x <= 500);
});

test('FLY change de cible si sa surface disparaît, sans tomber', () => {
  const win = { id: 'w1', x: 200, y: 200, width: 300, height: 100 };
  const withWin = computeSurfaces({ monitors: [monitor], windows: [win] });
  const without = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0, 0.5), flySpeed: 50 }, { x: 600, y: 50 });
  critter.currentSurface = withWin.segments.find((s) => s.type === 'ground');
  critter.state = State.FLY;

  critter.tick(1 / 60, withWin, { worldBounds: monitor });
  assert.equal(critter._flyTarget.segment.type, 'shelf');

  critter.tick(1 / 60, without, { worldBounds: monitor });
  assert.equal(critter.state, State.FLY, 'toujours en vol');
  assert.equal(critter._flyTarget.segment.type, 'ground', 'nouvelle cible : le sol');
});

test('FLY ne change pas de cible sans raison (probabilité nulle)', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.5), flySpeed: 50, flyRetargetChance: 0 }, { x: 500, y: 50 });
  critter.state = State.FLY;
  critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  const first = critter._flyTarget;
  for (let i = 0; i < 30; i++) critter.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(critter._flyTarget, first);
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

  const flyer = new Critter(
    { ...shared, flySpeed: 100, supportedSurfaces: new Set([Locomotion.AIR]) },
    { x: 500, y: 500 },
  );
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

test("fermer la fenêtre de départ pendant un vol ne fait pas tomber l'animal", () => {
  const win = { id: 'w1', x: 200, y: 200, width: 300, height: 100 };
  const withWin = computeSurfaces({ monitors: [monitor], windows: [win] });
  const without = computeSurfaces({ monitors: [monitor], windows: [] });
  const critter = new Critter({ random: fixedRandom(0.5), flySpeed: 50 }, { x: 300, y: 200 });
  critter.currentSurface = withWin.segments.find((s) => s.type === 'shelf');
  critter._startRoam(State.FLY);

  critter.tick(1 / 60, withWin, { worldBounds: monitor });
  critter.tick(1 / 60, without, { worldBounds: monitor });

  assert.equal(critter.state, State.FLY);
});

// --- Allures rapides, piqué et nage moins nerveuse ---------------------------

const groundSeg = computeSurfaces({ monitors: [monitor], windows: [] }).segments.find((s) => s.type === 'ground');

function flyingCritter(config, x, y) {
  const critter = new Critter(
    { random: fixedRandom(0.9), flyCruiseChance: 0, flyRetargetChance: 0, ...config },
    { x, y },
  );
  critter.state = State.FLY;
  critter._flyTarget = null;
  return critter;
}

test('RUN avance plus vite que WALK', () => {
  const step = (state) => {
    const c = new Critter({ random: fixedRandom(0.9), walkSpeed: 40 }, { x: 100, y: monitor.height });
    c.currentSurface = groundSeg;
    c.state = state;
    c.stateTimer = 10;
    c.walkTargetX = 900;
    c.tick(0.5, computeSurfaces({ monitors: [monitor], windows: [] }), { worldBounds: monitor });
    return c.x - 100;
  };
  assert.ok(step(State.RUN) > step(State.WALK) * 2);
});

test('runWeight écrasant déclenche RUN, poids 0 ne le déclenche jamais', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const make = (runWeight) => {
    const c = new Critter(
      { random: fixedRandom(0.5), walkWeight: 0, sleepWeight: 0, washWeight: 0, followWeight: 0, runWeight },
      { x: 100, y: monitor.height },
    );
    c.currentSurface = groundSeg;
    c.state = State.IDLE;
    c.stateTimer = 0;
    return c.tick(1 / 60, surfaces, { worldBounds: monitor }).state;
  };
  assert.equal(make(100), State.RUN);
  assert.notEqual(make(0), State.RUN);
});

test('SWIM_FAST et FLY_FAST vont plus vite que SWIM et FLY', () => {
  const swimDist = (state) => {
    const c = new Critter({ random: fixedRandom(0.5), swimSpeed: 50, swimWaveAmplitude: 0 }, { x: 100, y: 250 });
    c.state = state;
    c.stateTimer = 10;
    c.walkTargetX = 900;
    c._flyTargetY = 250;
    c._roamTimer = 1000;
    c._roamHasTarget = true;
    c.tick(0.5, {}, { worldBounds: monitor });
    return c.x - 100;
  };
  assert.ok(swimDist(State.SWIM_FAST) > swimDist(State.SWIM) * 2);

  const flyDist = (state) => {
    const c = flyingCritter({ flySpeed: 50 }, 100, 100);
    c.state = state;
    c._flyTarget = { segment: groundSeg, x: 900, y: monitor.height };
    const before = Math.hypot(c.x, c.y);
    c.tick(0.5, { segments: [groundSeg], walls: [] }, { worldBounds: monitor });
    return Math.hypot(c.x, c.y) - before;
  };
  assert.ok(flyDist(State.FLY_FAST) > flyDist(State.FLY) * 2);
});

test('FLY_FAST se pose sur une surface, sans FALL', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = flyingCritter({ flySpeed: 100 }, 500, 100);
  c.state = State.FLY_FAST;
  const seen = new Set();
  for (let i = 0; i < 600 && c.state !== State.IDLE; i++) {
    seen.add(c.tick(1 / 60, surfaces, { worldBounds: monitor }).state);
  }
  assert.equal(c.state, State.IDLE);
  assert.ok(!seen.has(State.FALL));
});

test('DIVE : démarre vers une cible basse et raide, atterrit sans FALL', () => {
  const surfaces = { segments: [groundSeg], walls: [] };
  const c = flyingCritter({ random: () => 0, diveChance: 1, flySpeed: 100 }, 500, 50);
  c._flyTarget = { segment: groundSeg, x: 520, y: monitor.height };
  const seen = new Set();
  for (let i = 0; i < 600 && c.state !== State.IDLE; i++) {
    seen.add(c.tick(1 / 60, surfaces, { worldBounds: monitor }).state);
  }
  assert.ok(seen.has(State.DIVE));
  assert.ok(!seen.has(State.FALL));
  assert.equal(c.state, State.IDLE);
  assert.equal(c.y, monitor.height);
  assert.equal(c.lastEvent, 'landed');
});

test("DIVE : pas de piqué si la cible est trop proche en hauteur ou l'angle trop plat", () => {
  const surfaces = { segments: [groundSeg], walls: [] };
  const near = flyingCritter({ random: () => 0, diveChance: 1 }, 500, monitor.height - 50);
  near._flyTarget = { segment: groundSeg, x: 510, y: monitor.height };
  near.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(near.state, State.FLY);

  const flat = flyingCritter({ random: () => 0, diveChance: 1 }, 50, 300);
  flat._flyTarget = { segment: groundSeg, x: 950, y: monitor.height };
  flat.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(flat.state, State.FLY);
});

test('DIVE : repasse en FLY, sans tomber, si la surface visée disparaît', () => {
  const win = { id: 'w1', x: 200, y: 300, width: 300, height: 100 };
  const withWin = computeSurfaces({ monitors: [monitor], windows: [win] });
  const without = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = flyingCritter({ random: () => 0, diveChance: 0 }, 300, 50);
  c._flyTarget = { segment: withWin.segments.find((s) => s.type === 'shelf'), x: 300, y: 300 };
  c.state = State.DIVE;
  c.tick(1 / 60, without, { worldBounds: monitor });
  assert.equal(c.state, State.FLY);
});

test('croisière : monte d\'abord haut au-dessus de la cible avant de la rejoindre', () => {
  const surfaces = { segments: [groundSeg], walls: [] };
  const c = flyingCritter({ random: fixedRandom(0.5), flyCruiseChance: 1, diveChance: 0 }, 500, monitor.height);
  c.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.ok(c._flyWaypoint, 'un point de croisière est posé');
  assert.ok(c._flyWaypoint.y <= monitor.height / 2);
  assert.ok(c._flyWaypoint.y <= monitor.height - c.config.diveMinHeight);
});

test('nage : chaque reciblage tourne de 60 degrés au plus et reste dans les bornes', () => {
  const world = { x: 0, y: 0, width: 1000, height: 2000 };
  for (let i = 0; i < 300; i++) {
    const c = new Critter({ swimSpeed: 0.001, swimWaveAmplitude: 0 }, { x: 100, y: 1000 });
    c.state = State.SWIM;
    c.stateTimer = 10;
    c.walkTargetX = 600;
    c._flyTargetY = 1000;
    c._roamHasTarget = true;
    c._roamTimer = 0;
    c.tick(1 / 60, {}, { worldBounds: world });

    const angle = Math.atan2(c._flyTargetY - 1000, c.walkTargetX - 100) * (180 / Math.PI);
    assert.ok(Math.abs(angle) <= 60.5, `virage de ${angle} degrés`);
    assert.ok(c.walkTargetX >= 0 && c.walkTargetX <= 1000 && c._flyTargetY >= 0 && c._flyTargetY <= 2000);
    assert.ok(c._roamTimer >= 5 - 1 / 60 && c._roamTimer <= 10, `délai de reciblage ${c._roamTimer}`);
  }
});

// --- Réveil ----------------------------------------------------------------

function sleepingCritter() {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = new Critter({ random: fixedRandom(0.9) }, { x: 100, y: monitor.height });
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.state = State.SLEEP;
  c.stateTimer = 500;
  return { c, surfaces };
}

test('un clic (simple, double ou droit) réveille un animal endormi', () => {
  for (const gesture of ['click', 'doubleClick', 'rightClick']) {
    const { c } = sleepingCritter();
    c.interact(gesture);
    assert.equal(c.state, State.IDLE, gesture);
  }
  const { c } = sleepingCritter();
  c.pet();
  assert.equal(c.state, State.IDLE);
});

test("le survol et l'ouverture d'une fenêtre ne réveillent pas", () => {
  for (const gesture of ['hover', 'windowOpened', 'meetCritter']) {
    const { c, surfaces } = sleepingCritter();
    c.interact(gesture);
    c.tick(1 / 60, surfaces, { worldBounds: monitor });
    assert.equal(c.state, State.SLEEP, gesture);
  }
});

test('une fenêtre qui bouge ailleurs ne réveille pas, mais sa disparition sous les pieds oui', () => {
  const win = { id: 'w1', x: 200, y: 200, width: 300, height: 100 };
  const other = { id: 'w2', x: 700, y: 300, width: 100, height: 50 };
  const before = computeSurfaces({ monitors: [monitor], windows: [win, other] });
  const c = new Critter({ random: fixedRandom(0.9) }, { x: 300, y: 200 });
  c.currentSurface = before.segments.find((s) => s.type === 'shelf' && s.surfaceId === 'w1');
  c.state = State.SLEEP;
  c.stateTimer = 500;

  const otherMoved = computeSurfaces({ monitors: [monitor], windows: [win, { ...other, x: 750 }] });
  c.tick(1 / 60, otherMoved, { worldBounds: monitor });
  assert.equal(c.state, State.SLEEP, "une autre fenêtre bouge : l'animal continue de dormir");

  const closed = computeSurfaces({ monitors: [monitor], windows: [other] });
  c.tick(1 / 60, closed, { worldBounds: monitor });
  assert.equal(c.state, State.FALL, 'son rebord disparaît : il tombe');
});

test('une fenêtre déplacée sous les pieds réveille (chute)', () => {
  const win = { id: 'w1', x: 200, y: 200, width: 300, height: 100 };
  const before = computeSurfaces({ monitors: [monitor], windows: [win] });
  const c = new Critter({ random: fixedRandom(0.9) }, { x: 300, y: 200 });
  c.currentSurface = before.segments.find((s) => s.type === 'shelf');
  c.state = State.SLEEP;
  c.stateTimer = 500;
  const moved = computeSurfaces({ monitors: [monitor], windows: [{ ...win, y: 260 }] });
  c.tick(1 / 60, moved, { worldBounds: monitor });
  assert.notEqual(c.state, State.SLEEP);
});

// --- Besoins ----------------------------------------------------------------

function idleOnGround(config) {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = new Critter(
    { random: fixedRandom(0.5), walkWeight: 0, sleepWeight: 10, washWeight: 10, followWeight: 0, runWeight: 0, ...config },
    { x: 100, y: monitor.height },
  );
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.state = State.IDLE;
  c.stateTimer = 0;
  return { c, surfaces };
}

test('énergie basse : le sommeil est choisi ; énergie pleine : il devient très improbable', () => {
  const tired = idleOnGround({});
  tired.c.needs.values.energy = 5;
  tired.c.needs.values.cleanliness = 95; // lavage écarté
  assert.equal(tired.c.tick(1 / 60, tired.surfaces, { worldBounds: monitor }).state, State.SLEEP);

  const rested = idleOnGround({});
  rested.c.needs.values.energy = 100;
  rested.c.needs.values.cleanliness = 40;
  assert.equal(rested.c.tick(1 / 60, rested.surfaces, { worldBounds: monitor }).state, State.WASH);
});

test('propreté basse : le lavage est choisi', () => {
  const dirty = idleOnGround({ random: fixedRandom(0.9) });
  dirty.c.needs.values.cleanliness = 0;
  dirty.c.needs.values.energy = 95;
  assert.equal(dirty.c.tick(1 / 60, dirty.surfaces, { worldBounds: monitor }).state, State.WASH);
});

test("la fin d'un lavage remonte la propreté", () => {
  const { c, surfaces } = idleOnGround({});
  c.state = State.WASH;
  c.stateTimer = 0.01;
  c.needs.values.cleanliness = 20;
  c.tick(1 / 60, surfaces, { worldBounds: monitor });
  c.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.ok(c.needs.values.cleanliness >= 49);
});

test("dormir recharge l'énergie au fil des ticks", () => {
  const { c, surfaces } = idleOnGround({ needsRateScale: 1 });
  c.state = State.SLEEP;
  c.stateTimer = 1e9;
  c.needs.values.energy = 10;
  for (let i = 0; i < 100; i++) c.tick(60, surfaces, { worldBounds: monitor }); // 100 minutes
  assert.ok(c.needs.values.energy > 60, `énergie ${c.needs.values.energy}`);
});

test("une caresse monte l'affection ; les vacances figent les jauges", () => {
  const { c, surfaces } = idleOnGround({});
  c.needs.values.affection = 40;
  c.pet();
  c.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.ok(c.needs.values.affection >= 47);

  c.setNeedsRateScale(0);
  const before = c.needs.values.satiety;
  c.tick(3600, surfaces, { worldBounds: monitor });
  assert.equal(c.needs.values.satiety, before);
});

test("snapshot expose le besoin urgent et l'humeur", () => {
  const { c, surfaces } = idleOnGround({});
  c.state = State.SLEEP;
  c.stateTimer = 1e9;
  assert.equal(c.tick(1 / 60, surfaces, { worldBounds: monitor }).urgentNeed, null);
  c.needs.values.satiety = 5;
  const snap = c.tick(1 / 60, surfaces, { worldBounds: monitor });
  assert.equal(snap.urgentNeed, 'satiety');
  assert.ok(snap.mood > 0);
});

test('serialize/restore emportent les jauges, avec rattrapage hors ligne', () => {
  const a = new Critter({}, { x: 10, y: 10 });
  a.needs.values.satiety = 50;
  const saved = a.serialize();
  assert.equal(saved.extra.needs.satiety, 50);

  const b = new Critter({}, { x: 0, y: 0 });
  b.restore(saved, { elapsedSeconds: 2 * 3600 });
  assert.ok(b.needs.values.satiety < 50 && b.needs.values.satiety > 40);

  const vacation = new Critter({ needsRateScale: 0 }, { x: 0, y: 0 });
  vacation.restore(saved, { elapsedSeconds: 2 * 3600 });
  assert.equal(vacation.needs.values.satiety, 50);
});

// --- Nourriture, gamelle, lit ------------------------------------------------

import { createItem, tickItem, fillBowl } from '../core/items.js';

function settleItem(item, surfaces) {
  for (let i = 0; i < 300; i++) tickItem(item, 1 / 60, surfaces, monitor);
  return item;
}

function idleWithItems(config, items, surfaces) {
  const c = new Critter(
    {
      random: fixedRandom(0.5), walkWeight: 0, sleepWeight: 0, washWeight: 0, followWeight: 0, runWeight: 0,
      needsDiet: { fish: 60, meat: 40 }, ...config,
    },
    { x: 100, y: monitor.height },
  );
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.state = State.IDLE;
  c.stateTimer = 0;
  return c;
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

test('un affamé va manger la nourriture et sa satiété monte du gain du régime', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const fish = settleItem(createItem('food', 'fish', 250, 50), surfaces);
  const c = idleWithItems({ needsRateScale: 0 }, [fish], surfaces);
  c.needs.values.satiety = 10;

  const seen = run(c, surfaces, [fish], 30, () => fish.consumed && c.state === State.IDLE);
  assert.ok(seen.has(State.SEEK_FOOD) && seen.has(State.EAT));
  assert.ok(seen.has('event:ate'));
  assert.ok(fish.consumed);
  assert.equal(c.needs.values.satiety, 70);
  assert.ok(c.needs.values.affection > 80, "l'aliment préféré fait plaisir");
});

test('un animal rassasié ignore la nourriture, un aliment hors régime aussi', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const fish = settleItem(createItem('food', 'fish', 250, 50), surfaces);
  const seeds = settleItem(createItem('food', 'seeds', 250, 50), surfaces);

  const full = idleWithItems({ walkWeight: 77, needsRateScale: 0 }, [fish], surfaces);
  full.needs.values.satiety = 100;
  assert.ok(!run(full, surfaces, [fish], 2).has(State.SEEK_FOOD));

  const hungry = idleWithItems({ needsRateScale: 0 }, [seeds], surfaces);
  hungry.needs.values.satiety = 5;
  assert.ok(!run(hungry, surfaces, [seeds], 2).has(State.SEEK_FOOD));
});

test('une nourriture visée est réclamée : un second animal ne la vise pas', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const fish = settleItem(createItem('food', 'fish', 700, 50), surfaces);
  const a = idleWithItems({ needsRateScale: 0 }, [fish], surfaces);
  const b = idleWithItems({ needsRateScale: 0 }, [fish], surfaces);
  a.needs.values.satiety = 5;
  b.needs.values.satiety = 5;
  a.tick(1 / 30, surfaces, { worldBounds: monitor, items: [fish] });
  assert.equal(fish.claimedBy, a);
  b.tick(1 / 30, surfaces, { worldBounds: monitor, items: [fish] });
  assert.notEqual(b.state, State.SEEK_FOOD);
});

test('nourriture disparue en chemin : retour au repos, réclamation libérée', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const fish = settleItem(createItem('food', 'fish', 700, 50), surfaces);
  const c = idleWithItems({ needsRateScale: 0 }, [fish], surfaces);
  c.needs.values.satiety = 5;
  c.tick(1 / 30, surfaces, { worldBounds: monitor, items: [fish] });
  assert.equal(c.state, State.SEEK_FOOD);
  fish.consumed = true;
  c.tick(1 / 30, surfaces, { worldBounds: monitor, items: [fish] });
  assert.equal(c.state, State.IDLE);
  assert.equal(fish.claimedBy, null);
});

test('la gamelle perd une portion par repas et reste', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const bowl = settleItem(createItem('bowl', 'meat', 200, 50), surfaces);
  fillBowl(bowl, 'meat', 2);
  const c = idleWithItems({ needsRateScale: 0 }, [bowl], surfaces);
  c.needs.values.satiety = 5;
  run(c, surfaces, [bowl], 30, () => bowl.portions === 1);
  assert.equal(bowl.portions, 1);
  assert.ok(!bowl.consumed);
  assert.ok(c.needs.values.satiety > 5);
});

test("un oiseau décolle vers la nourriture posée sur un autre rebord", () => {
  const win = { id: 'w1', x: 600, y: 250, width: 300, height: 100 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const seeds = settleItem(createItem('food', 'seeds', 700, 50), surfaces);
  assert.equal(seeds.y, 250);
  const c = idleWithItems(
    { needsRateScale: 0, needsDiet: { seeds: 45 }, supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.AIR]), flySpeed: 300 },
    [seeds],
    surfaces,
  );
  c.needs.values.satiety = 5;
  const seen = run(c, surfaces, [seeds], 40, () => seeds.consumed);
  assert.ok(seen.has(State.FLY));
  assert.ok(seeds.consumed, "il s'est posé puis a mangé");
});

test("un poisson va manger le plancton flottant où qu'il soit", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const plankton = createItem('food', 'plankton', 700, 100);
  const c = new Critter(
    {
      random: fixedRandom(0.5), needsRateScale: 0, needsDiet: { plankton: 40 },
      supportedSurfaces: new Set([Locomotion.WATER]), swimSpeed: 200, swimWaveAmplitude: 0,
    },
    { x: 100, y: 300 },
  );
  c._startRoam(State.SWIM);
  c.needs.values.satiety = 10;
  const seen = run(c, surfaces, [plankton], 30, () => plankton.consumed);
  assert.ok(seen.has(State.SEEK_FOOD) && seen.has(State.EAT));
  assert.ok(plankton.consumed);
  assert.equal(c.needs.values.satiety, 50);
  assert.equal(c.state, State.SWIM, 'il reprend sa nage après le repas');
});

test('un lit sur la surface : la sieste passe par le lit, et on y récupère plus vite', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const bed = settleItem(createItem('bed', null, 300, 50), surfaces);

  const c = idleWithItems({ needsRateScale: 1, sleepWeight: 100, sleepDuration: [1000, 1000] }, [bed], surfaces);
  c.needs.values.energy = 10;
  c.tick(1 / 30, surfaces, { worldBounds: monitor, items: [bed] });
  assert.equal(c.state, State.SEEK_NAP);
  run(c, surfaces, [bed], 30, () => c.state === State.SLEEP);
  assert.equal(c.state, State.SLEEP);
  assert.equal(c.x, 300);

  const plain = idleWithItems({ needsRateScale: 1, sleepDuration: [1000, 1000] }, [], surfaces);
  plain.state = State.SLEEP;
  plain.stateTimer = 1e9;
  plain.needs.values.energy = 10;
  c.needs.values.energy = 10;
  for (let i = 0; i < 60; i++) {
    c.tick(60, surfaces, { worldBounds: monitor, items: [bed] });
    plain.tick(60, surfaces, { worldBounds: monitor, items: [] });
  }
  assert.ok(c.needs.values.energy > plain.needs.values.energy);
});

test('un lit lointain (au-delà de la portée de sieste) attire quand même, et le trajet a le temps de finir', () => {
  const surfaces = computeSurfaces({ monitors: [{ x: 0, y: 0, width: 3000, height: 500 }], windows: [] });
  const world = { x: 0, y: 0, width: 3000, height: 500 };
  const bed = createItem('bed', null, 1500, 50);
  for (let i = 0; i < 300; i++) tickItem(bed, 1 / 60, surfaces, world);

  const c = new Critter(
    { random: fixedRandom(0.5), walkWeight: 0, sleepWeight: 100, washWeight: 0, followWeight: 0, runWeight: 0, needsRateScale: 0, sleepDuration: [1000, 1000] },
    { x: 100, y: 500 },
  );
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.state = State.IDLE;
  c.stateTimer = 0;
  c.needs.values.energy = 5;

  c.tick(1 / 30, surfaces, { worldBounds: world, items: [bed] });
  assert.equal(c.state, State.SEEK_NAP);
  for (let i = 0; i < 30 * 80 && c.state === State.SEEK_NAP; i++) {
    c.tick(1 / 30, surfaces, { worldBounds: world, items: [bed] });
  }
  assert.equal(c.state, State.SLEEP);
  assert.equal(c.x, 1500);
});

test("un oiseau décolle vers un lit posé sur une autre surface", () => {
  const win = { id: 'w1', x: 600, y: 250, width: 300, height: 100 };
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [win] });
  const bed = createItem('bed', null, 700, 50);
  for (let i = 0; i < 300; i++) tickItem(bed, 1 / 60, surfaces, monitor);
  const c = new Critter(
    {
      random: fixedRandom(0.5), walkWeight: 0, sleepWeight: 100, washWeight: 0, followWeight: 0, runWeight: 0,
      needsRateScale: 0, supportedSurfaces: new Set([Locomotion.GROUND, Locomotion.AIR]),
    },
    { x: 100, y: 500 },
  );
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.state = State.IDLE;
  c.stateTimer = 0;
  c.needs.values.energy = 5;
  assert.equal(c.tick(1 / 30, surfaces, { worldBounds: monitor, items: [bed] }).state, State.FLY);
});

// --- Jeu, laser, caresses, brossage -----------------------------------------

function playerOf(config, items, surfaces) {
  const c = new Critter(
    {
      random: fixedRandom(0.5), walkWeight: 0, sleepWeight: 0, washWeight: 0, followWeight: 0, runWeight: 0,
      foodWeight: 0, needsRateScale: 0, ...config,
    },
    { x: 100, y: monitor.height },
  );
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.state = State.IDLE;
  c.stateTimer = 0;
  return c;
}

function runPlay(c, surfaces, opts, seconds, stop) {
  const seen = new Set();
  for (let i = 0; i < seconds * 30; i++) {
    const snap = c.tick(1 / 30, surfaces, { worldBounds: monitor, ...opts });
    seen.add(snap.state);
    if (snap.event) seen.add(`event:${snap.event}`);
    if (stop?.(snap)) break;
  }
  return seen;
}

test('un animal qui s\'ennuie joue avec la balle, la frappe, et gagne stimulation et affection', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const ball = settleItem(createItem('toy', 'ball', 300, 50), surfaces);
  const c = playerOf({ playDuration: [4, 4] }, [ball], surfaces);
  c.needs.values.stimulation = 10;
  c.needs.values.affection = 50;
  const startX = ball.x;

  const seen = runPlay(c, surfaces, { items: [ball] }, 30, () => c.lastEvent === 'played');
  assert.ok(seen.has(State.PLAY));
  assert.ok(seen.has('event:played'));
  assert.ok(Math.abs(ball.x - startX) > 5 || ball.vx !== 0, 'la balle a été frappée');
  assert.ok(c.needs.values.stimulation > 30);
  assert.ok(c.needs.values.affection > 50);
});

test('un animal comblé ne joue pas', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const ball = settleItem(createItem('toy', 'ball', 300, 50), surfaces);
  const c = playerOf({ walkWeight: 77 }, [ball], surfaces);
  c.needs.values.stimulation = 100;
  assert.ok(!runPlay(c, surfaces, { items: [ball] }, 1).has(State.PLAY));
});

test('jouer avec une peluche : rejoint puis reste, sans jamais la déplacer', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const plush = settleItem(createItem('toy', 'plush', 300, 50), surfaces);
  const c = playerOf({ playDuration: [3, 3] }, [plush], surfaces);
  c.needs.values.stimulation = 5;
  runPlay(c, surfaces, { items: [plush] }, 20, () => c.lastEvent === 'played');
  assert.equal(c.lastEvent, 'played');
  assert.ok(Math.abs(c.x - 300) < 25);
  assert.equal(plush.vx, 0);
});

test('jouet retiré en cours de jeu : retour au repos, sans récompense', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const plush = settleItem(createItem('toy', 'plush', 700, 50), surfaces);
  const c = playerOf({ playDuration: [20, 20] }, [plush], surfaces);
  c.needs.values.stimulation = 5;
  c.tick(1 / 30, surfaces, { worldBounds: monitor, items: [plush] });
  assert.equal(c.state, State.PLAY);
  plush.removed = true;
  c.tick(1 / 30, surfaces, { worldBounds: monitor, items: [plush] });
  assert.equal(c.state, State.IDLE);
  assert.notEqual(c.lastEvent, 'played');
});

test('mode laser : il fonce sur le pointeur, même sans jouet, et abandonne si le mode s\'éteint', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = playerOf({ playDuration: [20, 20] }, [], surfaces);
  const pointer = { x: 600, y: 300 };
  c.tick(1 / 30, surfaces, { worldBounds: monitor, laser: true, pointer });
  assert.equal(c.state, State.PLAY);
  for (let i = 0; i < 30 * 8; i++) c.tick(1 / 30, surfaces, { worldBounds: monitor, laser: true, pointer });
  assert.ok(Math.abs(c.x - 600) < 25, `x = ${c.x}`);
  pointer.x = 100;
  for (let i = 0; i < 30 * 6; i++) c.tick(1 / 30, surfaces, { worldBounds: monitor, laser: true, pointer });
  assert.ok(Math.abs(c.x - 100) < 25, 'il suit le pointeur');
  c.tick(1 / 30, surfaces, { worldBounds: monitor, laser: false, pointer });
  assert.equal(c.state, State.IDLE);
});

test('un poisson poursuit le pointeur en 2D en mode laser', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = new Critter(
    { random: fixedRandom(0.5), needsRateScale: 0, supportedSurfaces: new Set([Locomotion.WATER]), swimSpeed: 200, swimWaveAmplitude: 0, playDuration: [30, 30] },
    { x: 100, y: 400 },
  );
  c._startRoam(State.SWIM);
  const pointer = { x: 800, y: 100 };
  const seen = new Set();
  for (let i = 0; i < 30 * 15; i++) seen.add(c.tick(1 / 30, surfaces, { worldBounds: monitor, laser: true, pointer }).state);
  assert.ok(seen.has(State.PLAY));
  assert.ok(Math.hypot(c.x - 800, c.y - 100) < 30, `(${c.x}, ${c.y})`);
});

test('une série de caresses rapprochées devient un ronronnement, une pause la rompt', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = playerOf({}, [], surfaces);
  c.state = State.SLEEP;
  c.stateTimer = 1e9;
  const events = [];
  for (let i = 0; i < 3; i++) {
    c.pet();
    events.push(c.tick(0.5, surfaces, { worldBounds: monitor }).event);
    c.state = State.SLEEP;
    c.stateTimer = 1e9;
  }
  assert.deepEqual(events, ['petted', 'petted', 'purring']);

  c.tick(5, surfaces, { worldBounds: monitor }); // plus de 3 s de pause
  c.state = State.SLEEP;
  c.stateTimer = 1e9;
  c.pet();
  assert.equal(c.tick(0.5, surfaces, { worldBounds: monitor }).event, 'petted');
});

test('brosser : immobile, puis propreté et affection montent', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = playerOf({ brushDuration: 2 }, [], surfaces);
  c.needs.values.cleanliness = 20;
  c.needs.values.affection = 50;
  c.state = State.SLEEP;
  c.stateTimer = 1e9;
  c.brush();
  assert.equal(c.state, State.BRUSHED, 'réveille un animal endormi');
  const x = c.x;
  const seen = new Set();
  for (let i = 0; i < 30 * 4; i++) {
    const snap = c.tick(1 / 30, surfaces, { worldBounds: monitor });
    seen.add(snap.state);
    if (snap.event) seen.add(`event:${snap.event}`);
  }
  assert.ok(seen.has('event:brushed'));
  assert.equal(c.x, x);
  assert.ok(c.needs.values.cleanliness >= 44);
  assert.ok(c.needs.values.affection >= 55);
});

test('on ne brosse pas un animal en vol ou en chute', () => {
  const c = new Critter({}, { x: 0, y: 0 });
  c.state = State.FALL;
  c.brush();
  assert.equal(c.state, State.FALL);
});

// --- Réapparition hors écran ---------------------------------------------------

test('hors de tout moniteur, l\'animal réapparaît en haut du plus proche et retombe', () => {
  const monitors = [{ x: 0, y: 0, width: 1000, height: 500 }];
  const c = new Critter({}, { x: 2500, y: 900 });
  c.state = State.IDLE;
  assert.equal(c.ensureVisible(monitors, 32), true);
  assert.equal(c.state, State.FALL);
  assert.equal(c.x, 984);
  assert.equal(c.y, 32);
  assert.equal(c.currentSurface, null);
});

test('un animal visible n\'est pas déplacé, ni un animal qu\'on est en train de glisser', () => {
  const monitors = [{ x: 0, y: 0, width: 1000, height: 500 }];
  const inside = new Critter({}, { x: 500, y: 500 });
  inside.state = State.IDLE;
  assert.equal(inside.ensureVisible(monitors, 32), false);
  assert.equal(inside.state, State.IDLE);

  const dragged = new Critter({}, { x: 5000, y: 5000 });
  dragged.startDrag();
  assert.equal(dragged.ensureVisible(monitors, 32), false);
  assert.equal(dragged.state, State.DRAG);
});

test('deux écrans : réapparaît sur celui qui reste, le plus proche', () => {
  const left = { x: 0, y: 0, width: 800, height: 600 };
  const right = { x: 800, y: 0, width: 800, height: 600 };
  const c = new Critter({}, { x: 1500, y: 300 });
  c.state = State.IDLE;
  assert.equal(c.ensureVisible([left, right], 32), false, 'toujours visible');
  assert.equal(c.ensureVisible([left], 32), true, "l'écran de droite a disparu");
  assert.ok(c.x <= 800 && c.x >= 700);
  assert.equal(c.y, 32);
});

test('un objet hors écran est ramené en haut de l\'écran le plus proche', async () => {
  const { createItem, rescueItem } = await import('../core/items.js');
  const monitors = [{ x: 0, y: 0, width: 1000, height: 500 }];
  const item = createItem('toy', 'ball', 3000, 700);
  item.vx = 50;
  assert.equal(rescueItem(item, monitors), true);
  assert.equal(item.x, 984);
  assert.equal(item.y, 16);
  assert.equal(item.vx, 0);
  const ok = createItem('bed', null, 100, 500);
  assert.equal(rescueItem(ok, monitors), false);
});

// --- Vie : œuf, stades, personnalité, hibernation --------------------------------

import { Life } from '../core/life.js';

function lifeSeq(...values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function groundedCritter(config = {}) {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = new Critter({ random: fixedRandom(0.9), ...config }, { x: 300, y: 100 });
  return { c, surfaces };
}

test("un œuf tombe, se pose et reste immobile, sans besoins, puis éclot", () => {
  const { c, surfaces } = groundedCritter();
  c.setLife(Life.create(lifeSeq(0.1, 0.5, 0.5), { growth: true }));

  let snap;
  for (let i = 0; i < 200 && c.state !== State.EGG; i++) snap = c.tick(1 / 30, surfaces, { worldBounds: monitor });
  assert.equal(c.state, State.EGG);
  assert.equal(snap.stage, 'egg');
  assert.equal(snap.urgentNeed, null);

  const x = c.x;
  const satiety = c.needs.values.satiety;
  for (let i = 0; i < 50; i++) c.tick(10, surfaces, { worldBounds: monitor }); // 500 s : toujours dans l'œuf
  assert.equal(c.x, x);
  assert.equal(c.needs.values.satiety, satiety, 'besoins figés dans l\'œuf');

  c.life.ageSeconds = 0.25 * 3600 - 1;
  const seen = [];
  for (let i = 0; i < 5; i++) seen.push(c.tick(1, surfaces, { worldBounds: monitor }).event);
  assert.ok(seen.includes('hatched'));
  assert.equal(c.life.stage, 'baby');
  assert.notEqual(c.state, State.EGG);
  assert.equal(c.snapshot().scale, 0.5);
});

test('un bébé va plus lentement qu\'un adulte', () => {
  const walkedBy = (stage) => {
    const { c, surfaces } = groundedCritter({ walkSpeed: 40 });
    const life = new Life({ ageSeconds: { baby: 1, adult: 60 * 3600 }[stage] });
    life.ageSeconds = { baby: 0.3 * 3600, adult: 60 * 3600 }[stage];
    c.setLife(life);
    c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
    c.y = monitor.height;
    c.x = 100;
    c.state = State.WALK;
    c.stateTimer = 100;
    c.walkTargetX = 900;
    c.tick(1, surfaces, { worldBounds: monitor });
    return c.x - 100;
  };
  const baby = walkedBy('baby');
  const adult = walkedBy('adult');
  assert.ok(baby < adult * 0.8, `bébé ${baby}, adulte ${adult}`);
});

test('le caractère modifie les poids : un paresseux dort davantage, un timide salue moins', () => {
  const { c } = groundedCritter({ sleepWeight: 10, greetWeight: 20 });
  const base = c.config.sleepWeight;
  c.setLife(new Life({ trait: 'lazy' }));
  assert.ok(c.config.sleepWeight > base * 1.7);
  c.setLife(new Life({ trait: 'shy' }));
  assert.ok(c.config.greetWeight < 20 * 0.5);
  c.setLife(new Life({ trait: null }));
  assert.equal(c.config.greetWeight, 20);
});

test('le caractère joue sur les débits de besoins', () => {
  const { c } = groundedCritter();
  const before = c.needs.rates.satiety;
  c.setLife(new Life({ trait: 'greedy' }));
  assert.ok(c.needs.rates.satiety > before * 1.3);
});

test("négligence prolongée : hibernation ; un clic réveille et remonte les jauges", () => {
  const { c, surfaces } = groundedCritter({ autonomyMode: 'off' }); // un animal autonome ne tombe pas dans la négligence
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.y = monitor.height;
  c.state = State.IDLE;
  c.stateTimer = 1e9;
  c.needs.values.health = 5;
  c.needs.values.satiety = 1;
  c.life.neglectSeconds = 6 * 3600 - 1;
  const events = [];
  for (let i = 0; i < 3; i++) events.push(c.tick(1, surfaces, { worldBounds: monitor }).event);
  assert.ok(events.includes('hibernated'));
  assert.equal(c.state, State.HIBERNATE);
  assert.equal(c.snapshot().urgentNeed, null);

  c.interact('hover');
  assert.equal(c.state, State.HIBERNATE, 'le survol ne réveille pas');
  c.interact('click');
  assert.equal(c.state, State.IDLE);
  assert.equal(c.life.hibernating, false);
  assert.ok(c.needs.values.satiety >= 50 && c.needs.values.health >= 50);
  assert.equal(c.tick(1 / 30, surfaces, { worldBounds: monitor }).event, 'awakened');
});

test('le brossage réveille aussi un animal hibernant', () => {
  const { c, surfaces } = groundedCritter();
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.life.hibernating = true;
  c.state = State.HIBERNATE;
  c.brush();
  assert.equal(c.life.hibernating, false);
});

test('serialize/restore : la vie est conservée, et une ancienne sauvegarde reste adulte', () => {
  const a = new Critter({}, { x: 10, y: 10 });
  a.setLife(Life.create(lifeSeq(0.6, 0.2, 0.8), { growth: false }));
  const saved = a.serialize();
  assert.equal(saved.extra.life.trait, 'greedy');

  const b = new Critter({}, { x: 0, y: 0 });
  b.restore(saved);
  assert.equal(b.life.trait, 'greedy');
  assert.equal(b.life.stage, 'adult');

  const old = new Critter({}, { x: 0, y: 0 });
  old.restore({ x: 5, y: 5, facing: 1, extra: {} });
  assert.equal(old.life.stage, 'adult');
});

test('restaurer un œuf ou un hibernant : retombe puis reprend son état', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const egg = new Critter({ random: fixedRandom(0.9) }, { x: 300, y: 100 });
  egg.setLife(Life.create(lifeSeq(0.1, 0.5, 0.5), { growth: true }));
  const restored = new Critter({ random: fixedRandom(0.9) }, { x: 0, y: 0 });
  restored.restore(egg.serialize());
  for (let i = 0; i < 300 && restored.state === State.FALL; i++) restored.tick(1 / 30, surfaces, { worldBounds: monitor });
  assert.equal(restored.state, State.EGG);

  const sleeper = new Critter({ random: fixedRandom(0.9) }, { x: 300, y: 100 });
  sleeper.life.hibernating = true;
  const back = new Critter({ random: fixedRandom(0.9) }, { x: 0, y: 0 });
  back.restore(sleeper.serialize());
  for (let i = 0; i < 300 && back.state === State.FALL; i++) back.tick(1 / 30, surfaces, { worldBounds: monitor });
  assert.equal(back.state, State.HIBERNATE);
});

test('le rattrapage hors ligne fait grandir (demi-vitesse) et ne touche pas les besoins d\'un œuf', () => {
  const egg = new Critter({}, { x: 0, y: 0 });
  egg.setLife(Life.create(lifeSeq(0.1, 0.5, 0.5), { growth: true }));
  const saved = egg.serialize();
  const back = new Critter({}, { x: 0, y: 0 });
  back.restore(saved, { elapsedSeconds: 2 * 3600 });
  assert.equal(back.life.stage, 'baby');

  const eggAgain = new Critter({}, { x: 0, y: 0 });
  eggAgain.setLife(Life.create(lifeSeq(0.1, 0.5, 0.5), { growth: true }));
  const s2 = eggAgain.serialize();
  const still = new Critter({}, { x: 0, y: 0 });
  still.restore(s2, { elapsedSeconds: 60 });
  assert.equal(still.life.stage, 'egg');
  assert.equal(still.needs.values.satiety, 80);
});

test('vitesse de croissance et vacances via lifeAgeScale', () => {
  const { c, surfaces } = groundedCritter({ lifeAgeScale: 1000 });
  c.setLife(Life.create(lifeSeq(0.1, 0.5, 0.5), { growth: true }));
  c.tick(1, surfaces, { worldBounds: monitor });
  assert.ok(c.life.ageSeconds >= 1000);

  const frozen = groundedCritter({ lifeAgeScale: 0 });
  frozen.c.setLife(Life.create(lifeSeq(0.1, 0.5, 0.5), { growth: true }));
  frozen.c.tick(100, frozen.surfaces, { worldBounds: monitor });
  assert.equal(frozen.c.life.ageSeconds, 0);

  frozen.c.setLifeAgeScale(5);
  frozen.c.tick(10, frozen.surfaces, { worldBounds: monitor });
  assert.equal(frozen.c.life.ageSeconds, 50);
});

test("dans l'œuf : aucune interaction (survol, clic, invitation), seul le glisser reste", () => {
  const { c, surfaces } = groundedCritter();
  c.setLife(Life.create(lifeSeq(0.1, 0.5, 0.5), { growth: true }));
  for (let i = 0; i < 200 && c.state !== State.EGG; i++) c.tick(1 / 30, surfaces, { worldBounds: monitor });
  assert.equal(c.state, State.EGG);

  for (const gesture of ['hover', 'click', 'doubleClick', 'rightClick', 'windowOpened', 'meetCritter']) {
    c.interact(gesture);
    assert.equal(c.tick(1 / 30, surfaces, { worldBounds: monitor }).event, null, gesture);
  }
  c.pet();
  c.proposeChase({ x: 0 });
  assert.equal(c._chaseInvitation, null);
  c.brush();
  assert.equal(c.state, State.EGG);
  assert.equal(c.needs.values.affection, 80);

  c.startDrag();
  assert.equal(c.state, State.DRAG, 'le glisser reste possible');
  c.dragTo(500, 100);
  c.endDrag();
  assert.equal(c.snapshot().stage, 'egg');
  assert.equal(c.snapshot().event, null);
});

test("un œuf en chute n'a aucun événement visible non plus (atterrissage)", () => {
  const { c, surfaces } = groundedCritter();
  c.setLife(Life.create(lifeSeq(0.1, 0.5, 0.5), { growth: true }));
  const events = [];
  for (let i = 0; i < 200 && c.state !== State.EGG; i++) events.push(c.tick(1 / 30, surfaces, { worldBounds: monitor }).event);
  assert.ok(events.every((e) => e === null));
});

// --- Rythme du monde ---------------------------------------------------------------

function worldCritter(config = {}) {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = new Critter(
    {
      random: fixedRandom(0.5), walkWeight: 50, sleepWeight: 10, washWeight: 0, followWeight: 0, runWeight: 30,
      needsRateScale: 0, ...config,
    },
    { x: 100, y: monitor.height },
  );
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.state = State.IDLE;
  c.stateTimer = 0;
  return { c, surfaces };
}

function decide(c, surfaces, ambient) {
  c.state = State.IDLE;
  c.stateTimer = 0;
  return c.tick(1 / 30, surfaces, { worldBounds: monitor, ambient }).state;
}

test('la nuit et l\'absence du joueur poussent au sommeil et freinent les activités énergiques', () => {
  const pick = (ambient) => {
    const wins = { sleep: 0, run: 0 };
    for (let r = 0.05; r < 1; r += 0.1) {
      const { c, surfaces } = worldCritter({ random: () => r });
      const state = decide(c, surfaces, ambient);
      if (state === State.SLEEP) wins.sleep += 1;
      if (state === State.RUN) wins.run += 1;
    }
    return wins;
  };
  const day = pick({});
  const night = pick({ night: true });
  const away = pick({ away: true });
  assert.ok(night.sleep > day.sleep, `nuit ${night.sleep} > jour ${day.sleep}`);
  assert.ok(away.sleep >= night.sleep);
  assert.ok(night.run <= day.run);
  assert.ok(away.run <= night.run);
});

test('userReturned : salue et réveille un dormeur ; notification et frappe : curiosité sans réveil', () => {
  const { c, surfaces } = worldCritter();
  c.state = State.SLEEP;
  c.stateTimer = 1e9;
  c.interact('notification');
  assert.equal(c.tick(1 / 30, surfaces, { worldBounds: monitor }).event, 'noticed');
  assert.equal(c.state, State.SLEEP, 'une notification ne réveille pas');
  c.interact('typing');
  assert.equal(c.tick(1 / 30, surfaces, { worldBounds: monitor }).event, 'noticed');
  assert.equal(c.state, State.SLEEP);

  c.interact('userReturned');
  assert.notEqual(c.state, State.SLEEP, 'il t\'accueille');
  assert.equal(c.tick(1 / 30, surfaces, { worldBounds: monitor }).event, 'greeted');
});

test('la réaction à la frappe est limitée dans le temps', () => {
  const { c, surfaces } = worldCritter({ typingCooldown: 20 });
  c.state = State.SLEEP;
  c.stateTimer = 1e9;
  c.interact('typing');
  assert.equal(c.tick(1, surfaces, { worldBounds: monitor }).event, 'noticed');
  c.interact('typing');
  assert.equal(c.tick(1, surfaces, { worldBounds: monitor }).event, null, 'trop tôt');
  c.tick(30, surfaces, { worldBounds: monitor });
  c.interact('typing');
  assert.equal(c.tick(1, surfaces, { worldBounds: monitor }).event, 'noticed');
});

test('rappel de pause : va vers le curseur avec la bulle, arrive, puis un clic acquitte', () => {
  const { c, surfaces } = worldCritter({ remindDuration: 30 });
  const pointer = { x: 700, y: 300 };
  const opts = { worldBounds: monitor, pointer, ambient: { breakReminder: true } };
  let snap = c.tick(1 / 30, surfaces, opts);
  assert.equal(snap.state, State.REMIND);
  assert.equal(snap.bubble, 'break');

  const events = new Set();
  for (let i = 0; i < 30 * 15; i++) {
    snap = c.tick(1 / 30, surfaces, opts);
    if (snap.event) events.add(snap.event);
  }
  assert.ok(Math.abs(c.x - 700) < 40, `x = ${c.x}`);
  assert.ok(events.has('reminded'));
  assert.equal(c.takeAcknowledgement(), false);

  c.interact('click');
  assert.equal(c.state, State.IDLE);
  assert.equal(c.takeAcknowledgement(), true);
  assert.equal(c.takeAcknowledgement(), false, 'une seule fois');
  assert.equal(c.snapshot().bubble, null);
});

test('rappel de pause : se termine à la fin du délai ou quand le rappel est retiré', () => {
  const { c, surfaces } = worldCritter({ remindDuration: 2 });
  const pointer = { x: 150, y: 300 };
  c.tick(1 / 30, surfaces, { worldBounds: monitor, pointer, ambient: { breakReminder: true } });
  for (let i = 0; i < 30 * 3; i++) c.tick(1 / 30, surfaces, { worldBounds: monitor, pointer, ambient: { breakReminder: true } });
  assert.notEqual(c.state, State.REMIND);

  const other = worldCritter({ remindDuration: 60 });
  other.c.tick(1 / 30, other.surfaces, { worldBounds: monitor, pointer, ambient: { breakReminder: true } });
  assert.equal(other.c.state, State.REMIND);
  other.c.tick(1 / 30, other.surfaces, { worldBounds: monitor, pointer, ambient: {} });
  assert.equal(other.c.state, State.IDLE);
});

test('un poisson vient aussi au curseur pour le rappel de pause', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = new Critter(
    { random: fixedRandom(0.5), needsRateScale: 0, supportedSurfaces: new Set([Locomotion.WATER]), swimSpeed: 200, swimWaveAmplitude: 0 },
    { x: 100, y: 400 },
  );
  c._startRoam(State.SWIM);
  const pointer = { x: 800, y: 100 };
  for (let i = 0; i < 30 * 15; i++) {
    c.tick(1 / 30, surfaces, { worldBounds: monitor, pointer, ambient: { breakReminder: true } });
  }
  assert.ok(Math.hypot(c.x - 800, c.y - 100) < 40, `(${c.x}, ${c.y})`);
});

test('œuf et hibernation ignorent tout le contexte du monde', () => {
  const { c, surfaces } = worldCritter();
  c.setLife(Life.create(lifeSeq(0.1, 0.5, 0.5), { growth: true }));
  for (let i = 0; i < 200 && c.state !== State.EGG; i++) c.tick(1 / 30, surfaces, { worldBounds: monitor });
  for (const gesture of ['notification', 'typing', 'userReturned']) {
    c.interact(gesture);
    assert.equal(c.tick(1 / 30, surfaces, { worldBounds: monitor }).event, null, gesture);
  }
  c.tick(1 / 30, surfaces, { worldBounds: monitor, pointer: { x: 500, y: 300 }, ambient: { breakReminder: true } });
  assert.equal(c.state, State.EGG);

  const sleeper = worldCritter();
  sleeper.c.life.hibernating = true;
  sleeper.c.state = State.HIBERNATE;
  sleeper.c.tick(1 / 30, sleeper.surfaces, { worldBounds: monitor, pointer: { x: 500, y: 300 }, ambient: { breakReminder: true } });
  assert.equal(sleeper.c.state, State.HIBERNATE);
});

// --- Compteurs et succès ---------------------------------------------------------------

import { buildAchievements, CAPABILITIES } from '../core/achievements.js';

/** Succès écrits pour le test seuls (sans la bibliothèque commune), pour une espèce qui sait tout faire. */
function defsOf(entries) {
  const profile = { can: new Set(CAPABILITIES), diet: ['fish', 'meat'], toys: ['ball', 'yarn', 'plush'], tricks: ['sit'] };
  const { critter, ignored } = buildAchievements(entries, profile, []);
  assert.deepEqual(ignored, []);
  return critter;
}

test('les événements alimentent les compteurs (repas, jeu, caresses, brossage)', () => {
  const { c, surfaces } = worldCritter();
  c.stateTimer = 1e9;
  c.pet();
  c.tick(1 / 30, surfaces, { worldBounds: monitor });
  assert.equal(c.stats.get('pets'), 1);
  c.pet();
  c.pet();
  c.tick(1 / 30, surfaces, { worldBounds: monitor });
  assert.ok(c.stats.get('purrs') >= 1 || c.stats.get('pets') >= 2);

  c.lastEvent = null;
  c.state = State.WASH;
  c.stateTimer = 0.01;
  c.brush();
  for (let i = 0; i < 30 * 5; i++) c.tick(1 / 30, surfaces, { worldBounds: monitor });
  assert.equal(c.stats.get('brushes'), 1);
});

test('repas, coups de balle et parties comptent', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const fish = settleItem(createItem('food', 'fish', 250, 50), surfaces);
  const c = idleWithItems({ needsRateScale: 0 }, [fish], surfaces);
  c.needs.values.satiety = 10;
  run(c, surfaces, [fish], 30, () => fish.consumed && c.state === State.IDLE);
  assert.equal(c.stats.get('meals'), 1);
  assert.equal(c.stats.get('mealsFavorite'), 1);

  const ball = settleItem(createItem('toy', 'ball', 400, 50), surfaces);
  const player = playerOf({ playDuration: [8, 8] }, [ball], surfaces);
  player.needs.values.stimulation = 5;
  runPlay(player, surfaces, { items: [ball] }, 30, () => player.lastEvent === 'played');
  assert.ok(player.stats.get('ballKicks') >= 1);
  assert.equal(player.stats.get('playSessions'), 1);
});

test('entrées dans un état : escalade, vol, piqué, course ; plus longue sieste', () => {
  const { c, surfaces } = worldCritter();
  for (const state of [State.CLIMB, State.FLY, State.DIVE, State.RUN]) {
    c.state = State.IDLE;
    c._trackProgress(0.1, State.IDLE);
    c.state = state;
    c._trackProgress(0.1, State.IDLE);
  }
  assert.equal(c.stats.get('climbs'), 1);
  assert.equal(c.stats.get('flights'), 2, 'vol puis piqué depuis IDLE : deux entrées dans le groupe');
  assert.equal(c.stats.get('dives'), 1);
  assert.equal(c.stats.get('runs'), 1);

  c.state = State.FLY;
  c._trackProgress(0.1, State.DIVE);
  assert.equal(c.stats.get('flights'), 2, 'DIVE -> FLY reste dans le même groupe');

  c.state = State.SLEEP;
  c.stateTimer = 1e9;
  c._trackProgress(0.1, State.IDLE); // entrée dans la sieste
  assert.equal(c.stats.get('naps'), 1);
  for (let i = 0; i < 10; i++) c.tick(60, surfaces, { worldBounds: monitor });
  assert.ok(c.stats.get('longestSleepSeconds') >= 540);
  const before = c.stats.get('longestSleepSeconds');
  c.state = State.IDLE;
  c.stateTimer = 1e9;
  c.tick(1, surfaces, { worldBounds: monitor });
  c.state = State.SLEEP;
  c.tick(5, surfaces, { worldBounds: monitor });
  assert.equal(c.stats.get('longestSleepSeconds'), before, 'une sieste plus courte ne bat pas le record');
});

test('succès : débloqué une seule fois quand la condition est remplie, seulement pour le bon caractère', () => {
  const defs = defsOf([
    { id: 'nap', name: 'Sieste', description: 'd', requires: { trait: 'lazy' }, condition: { stat: 'longestSleepSeconds', atLeast: 100 }, coins: 15 },
    { id: 'pets', name: 'Câlins', description: 'd', condition: { stat: 'pets', atLeast: 2 } },
  ]);
  const { c, surfaces } = worldCritter({ achievements: defs });
  c.setLife(new Life({ trait: 'lazy' }));
  c.state = State.SLEEP;
  c.stateTimer = 1e9;
  const got = [];
  for (let i = 0; i < 3; i++) {
    c.tick(60, surfaces, { worldBounds: monitor });
    got.push(...c.takeUnlocked());
  }
  assert.deepEqual(got, ['nap']);
  assert.deepEqual(c.takeUnlocked(), [], 'annoncé une seule fois');
  for (let i = 0; i < 3; i++) c.tick(60, surfaces, { worldBounds: monitor });
  assert.deepEqual(c.takeUnlocked(), []);

  const other = worldCritter({ achievements: defs });
  other.c.setLife(new Life({ trait: 'playful' }));
  other.c.state = State.SLEEP;
  other.c.stateTimer = 1e9;
  for (let i = 0; i < 5; i++) other.c.tick(60, other.surfaces, { worldBounds: monitor });
  assert.deepEqual(other.c.takeUnlocked(), [], 'pas le bon caractère');
});

test('compteurs et succès sont sauvegardés et restaurés sans être ré-annoncés', () => {
  const defs = defsOf([{ id: 'pets', name: 'C', description: 'd', condition: { stat: 'pets', atLeast: 1 } }]);
  const { c, surfaces } = worldCritter({ achievements: defs });
  c.stateTimer = 1e9;
  c.pet();
  c.tick(2, surfaces, { worldBounds: monitor });
  assert.deepEqual(c.takeUnlocked(), ['pets']);

  const back = new Critter({ achievements: defs }, { x: 0, y: 0 });
  back.restore(c.serialize());
  assert.equal(back.stats.get('pets'), 1);
  assert.ok(back.unlocked.has('pets'));
  back.state = State.IDLE;
  back.stateTimer = 1e9;
  back.tick(2, surfaces, { worldBounds: monitor });
  assert.deepEqual(back.takeUnlocked(), []);
});

test('un œuf ne compte ni ne débloque rien', () => {
  const defs = defsOf([{ id: 'x', name: 'X', description: 'd', condition: { stat: 'pets', atLeast: 1 } }]);
  const { c, surfaces } = worldCritter({ achievements: defs });
  c.setLife(Life.create(lifeSeq(0.1, 0.5, 0.5), { growth: true }));
  c.interact('click');
  for (let i = 0; i < 5; i++) c.tick(1, surfaces, { worldBounds: monitor });
  assert.equal(c.stats.get('pets'), 0);
  assert.deepEqual(c.takeUnlocked(), []);
});

// --- Autonomie : chasse, grignotage, moisissure ------------------------------------

function hunterOf(config = {}) {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = new Critter(
    {
      random: fixedRandom(0.5), walkWeight: 0, sleepWeight: 0, washWeight: 0, followWeight: 0, runWeight: 0,
      needsRateScale: 0, autonomyMode: 'full', needsPrey: { mouse: 40 }, needsDiet: { grass: 8, kibble: 30 }, ...config,
    },
    { x: 100, y: monitor.height },
  );
  c.currentSurface = surfaces.segments.find((s) => s.type === 'ground');
  c.state = State.IDLE;
  c.stateTimer = 0;
  c.needs.values.satiety = 10;
  return { c, surfaces };
}

function restingPrey(surfaces, kind, x) {
  const p = createItem('prey', kind, x, 500);
  p.surface = surfaces.segments.find((s) => s.type === 'ground');
  p.wanderTimer = 1e9;
  p.paused = true; // immobile pour un test déterministe
  return p;
}

function huntRun(c, surfaces, items, seconds, stop) {
  const seen = new Set();
  for (let i = 0; i < seconds * 30; i++) {
    const snap = c.tick(1 / 30, surfaces, { worldBounds: monitor, items });
    seen.add(snap.state);
    if (snap.event) seen.add(`event:${snap.event}`);
    if (stop?.(snap)) break;
  }
  return seen;
}

test('un animal autonome affamé chasse une proie, la mange et compte la prise', () => {
  const { c, surfaces } = hunterOf();
  const prey = restingPrey(surfaces, 'mouse', 300);
  const seen = huntRun(c, surfaces, [prey], 30, () => prey.consumed);
  assert.ok(seen.has(State.HUNT) && seen.has(State.EAT));
  assert.ok(prey.consumed);
  assert.equal(c.needs.values.satiety, 50);
  assert.equal(c.stats.get('hunts'), 1);
  assert.ok(seen.has('event:ate'));
});

test('chasse ratée (proie changée de surface ou disparue) : sans conséquence', () => {
  const { c, surfaces } = hunterOf();
  const prey = restingPrey(surfaces, 'mouse', 800);
  c.tick(1 / 30, surfaces, { worldBounds: monitor, items: [prey] });
  assert.equal(c.state, State.HUNT);
  prey.removed = true;
  c.tick(1 / 30, surfaces, { worldBounds: monitor, items: [prey] });
  assert.equal(c.state, State.IDLE);
  assert.equal(c.stats.get('hunts'), 0);
  assert.equal(c.needs.values.health, 100);
});

test('une proie trop rapide pour l’animal lui échappe au bout du délai', () => {
  const { c, surfaces } = hunterOf({ walkSpeed: 5, huntDuration: 2 });
  const prey = restingPrey(surfaces, 'mouse', 900);
  const seen = huntRun(c, surfaces, [prey], 5);
  assert.ok(seen.has(State.IDLE), 'il a abandonné la poursuite');
  assert.ok(!prey.consumed);
  assert.equal(c.stats.get('hunts'), 0);
});

test('un animal non autonome ne chasse pas ; rassasié non plus', () => {
  const dependent = hunterOf({ autonomyMode: 'off' });
  const p1 = restingPrey(dependent.surfaces, 'mouse', 300);
  assert.ok(!huntRun(dependent.c, dependent.surfaces, [p1], 3).has(State.HUNT));

  const full = hunterOf({ walkWeight: 77 });
  full.c.needs.values.satiety = 100;
  const p2 = restingPrey(full.surfaces, 'mouse', 300);
  assert.ok(!huntRun(full.c, full.surfaces, [p2], 3).has(State.HUNT));
});

test('une espèce ne chasse que ses proies', () => {
  const { c, surfaces } = hunterOf({ needsPrey: { beetle: 30 } });
  const prey = restingPrey(surfaces, 'mouse', 300);
  assert.ok(!huntRun(c, surfaces, [prey], 3).has(State.HUNT));
});

test('un poisson autonome chasse le krill flottant en 2D', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const c = new Critter(
    {
      random: fixedRandom(0.5), needsRateScale: 0, autonomyMode: 'full', needsPrey: { krill: 25 },
      supportedSurfaces: new Set([Locomotion.WATER]), swimSpeed: 200, swimWaveAmplitude: 0,
    },
    { x: 100, y: 300 },
  );
  c._startRoam(State.SWIM);
  c.needs.values.satiety = 10;
  const krill = createItem('prey', 'krill', 700, 150);
  krill.targetX = 700;
  krill.targetY = 150;
  krill.wanderTimer = 1e9;
  krill.caught = false;
  const seen = huntRun(c, surfaces, [krill], 30, () => krill.consumed || krill.caught);
  assert.ok(seen.has(State.HUNT));
  assert.ok(krill.caught || krill.consumed);
});

test('grignoter une plante : autonomes seulement, une portion, compte les grignotages', () => {
  const { c, surfaces } = hunterOf({ needsPrey: {} });
  const grass = createItem('plant', 'grass', 300, 500);
  grass.surface = surfaces.segments.find((s) => s.type === 'ground');
  const seen = huntRun(c, surfaces, [grass], 30, () => grass.portions < 3 && c.state === State.IDLE);
  assert.ok(seen.has(State.SEEK_FOOD) && seen.has(State.EAT));
  assert.equal(grass.portions, 2);
  assert.equal(c.stats.get('grazes'), 1);

  const dependent = hunterOf({ autonomyMode: 'off', needsPrey: {} });
  const plant = createItem('plant', 'grass', 300, 500);
  plant.surface = dependent.surfaces.segments.find((s) => s.type === 'ground');
  assert.ok(!huntRun(dependent.c, dependent.surfaces, [plant], 3).has(State.SEEK_FOOD));
});

test('nourriture moisie : un animal non autonome tombe malade, un autonome l’évite', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const moldyBowl = () => {
    const bowl = createItem('bowl', 'kibble', 250, 500);
    bowl.surface = surfaces.segments.find((s) => s.type === 'ground');
    fillBowl(bowl, 'kibble');
    bowl.fillAge = 24 * 3600 + 10;
    return bowl;
  };

  const dependent = hunterOf({ autonomyMode: 'off', needsPrey: {}, foodWeight: 1000 });
  const bowl = moldyBowl();
  huntRun(dependent.c, dependent.surfaces, [bowl], 30, (snap) => snap.event === 'sick');
  assert.equal(dependent.c.needs.values.health, 80);
  assert.equal(bowl.portions, 4);

  const autonomous = hunterOf({ needsPrey: {}, foodWeight: 1000 });
  const bowl2 = moldyBowl();
  const seen = huntRun(autonomous.c, autonomous.surfaces, [bowl2], 5);
  assert.ok(!seen.has(State.EAT));
  assert.equal(autonomous.c.needs.values.health, 100);
});

test('autonomie : besoins ralentis, et pas d’hibernation', () => {
  const { c, surfaces } = hunterOf({ needsRateScale: 1, needsPrey: {} });
  c.state = State.IDLE;
  c.stateTimer = 1e9;
  c.needs.values.satiety = 80;
  c.tick(3600, surfaces, { worldBounds: monitor });
  assert.equal(c.snapshot().autonomy, 1);
  assert.ok(80 - c.needs.values.satiety < 5 * 0.25 + 0.01, `perte ${80 - c.needs.values.satiety}`);

  c.setAutonomyMode('off');
  c.tick(1, surfaces, { worldBounds: monitor });
  assert.equal(c.snapshot().autonomy, 0);
});

// --- Bouchées et nouveaux jouets ------------------------------------------------

test('un animal presque repu mange une bouchée et laisse un reste entamé', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const fish = settleItem(createItem('food', 'fish', 250, 50), surfaces); // préféré : 2 bouchées de 30
  const c = idleWithItems({ needsRateScale: 0 }, [fish], surfaces);
  c.needs.values.satiety = 60;
  const seen = run(c, surfaces, [fish], 30, (snap) => snap.event === 'ate');
  assert.ok(seen.has(State.EAT));
  assert.equal(c.needs.values.satiety, 90);
  assert.equal(fish.portions, 1);
  assert.ok(!fish.consumed && fish.claimedBy === null, 'reste entamé, libre pour plus tard');
  assert.equal(c.stats.get('meals'), 1);
  assert.equal(c.stats.get('mealsFavorite'), 0, 'le repas du préféré n\'est pas fini');
});

test('la pelote se frappe comme la balle', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const yarn = settleItem(createItem('toy', 'yarn', 300, 50), surfaces);
  const c = playerOf({ playDuration: [4, 4] }, [yarn], surfaces);
  c.needs.values.stimulation = 10;
  runPlay(c, surfaces, { items: [yarn] }, 30, () => c.lastEvent === 'played');
  assert.equal(c.lastEvent, 'played');
  assert.ok(c.stats.get('ballKicks') >= 1);
});

test("un poisson qui s'ennuie va pousser l'anneau flottant", () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const ring = createItem('toy', 'ring', 600, 200);
  const c = new Critter(
    {
      random: fixedRandom(0.1), needsRateScale: 0, needsDiet: { plankton: 40 },
      supportedSurfaces: new Set([Locomotion.WATER]), swimSpeed: 200, swimWaveAmplitude: 0, playDuration: [6, 6],
    },
    { x: 100, y: 300 },
  );
  c._startRoam(State.SWIM);
  c.needs.values.stimulation = 10;
  c.needs.values.satiety = 100;
  const seen = new Set();
  let pushed = false;
  for (let i = 0; i < 30 * 30 && c.lastEvent !== 'played'; i++) {
    seen.add(c.tick(1 / 30, surfaces, { worldBounds: monitor, items: [ring] }).state);
    tickItem(ring, 1 / 30, surfaces, monitor);
    if (ring.vx !== 0 || ring.vy !== 0) pushed = true;
  }
  assert.ok(seen.has(State.PLAY));
  assert.ok(pushed, "l'anneau a été poussé");
  assert.equal(c.lastEvent, 'played');
});

// --- Étape 15 : compteurs, marques, titres ------------------------------------------------

test('bêtises : œuf caressé, chatouilles, survols, caresse en plein repas, sommeil dérangé', () => {
  const egg = worldCritter();
  egg.c.setLife(Life.create(lifeSeq(0.1, 0.5, 0.5), { growth: true }));
  egg.c.interact('click');
  egg.c.interact('click');
  assert.equal(egg.c.stats.get('eggPets'), 2, "l'œuf ne réagit pas, mais le Système compte");

  const { c, surfaces } = worldCritter();
  c.stateTimer = 1e9;
  c.interact('doubleClick');
  c.tick(1 / 30, surfaces, { worldBounds: monitor });
  c.interact('hover');
  c.tick(1 / 30, surfaces, { worldBounds: monitor });
  assert.equal(c.stats.get('tickles'), 1);
  assert.equal(c.stats.get('hovers'), 1);
  c.state = State.EAT;
  c.interact('click');
  assert.ok(c.stats.hasMark('state:pet-while-eating'));
  c.state = State.SLEEP;
  c.interact('doubleClick');
  assert.ok(c.stats.hasMark('state:tickle-sleep'));
  c.state = State.SLEEP;
  c.startDrag();
  assert.ok(c.stats.hasMark('state:sleepwalk'));
});

test('marques : aliment goûté, jouet essayé, accessoire porté, cadeau, fête et nuit blanche à 3 h', () => {
  const surfaces = computeSurfaces({ monitors: [monitor], windows: [] });
  const fish = settleItem(createItem('food', 'fish', 250, 50), surfaces);
  const c = idleWithItems({ needsRateScale: 0 }, [fish], surfaces);
  c.needs.values.satiety = 10;
  run(c, surfaces, [fish], 30, () => fish.consumed);
  assert.ok(c.stats.hasMark('food:fish'));

  const yarn = settleItem(createItem('toy', 'yarn', 300, 50), surfaces);
  const player = playerOf({ playDuration: [3, 3] }, [yarn], surfaces);
  player.needs.values.stimulation = 5;
  runPlay(player, surfaces, { items: [yarn] }, 20, () => player.lastEvent === 'played');
  assert.ok(player.stats.hasMark('toy:yarn'));

  c.equip('bow');
  assert.ok(c.stats.hasMark('accessory:bow'));

  const christmas3am = new Date(2026, 11, 25, 3, 0, 0).getTime();
  c.state = State.IDLE;
  c.stateTimer = 1e9;
  c.tick(1.1, surfaces, { worldBounds: monitor, progress: { now: christmas3am } });
  assert.ok(c.stats.hasMark('holiday:christmas'));
  assert.ok(c.stats.hasMark('season:winter'));
  assert.ok(c.stats.hasMark('moment:night-owl'));
});

test('compteurs de sommeil, de renommage et de repas forcé ; faits dérivés', () => {
  const { c, surfaces } = worldCritter();
  c.setName('Minou');
  c.setName('Minou');
  c.setName('Pistache');
  assert.equal(c.stats.get('renames'), 1, 'le premier nom et un nom inchangé ne comptent pas');
  c.noteAction('overfeed');
  assert.equal(c.stats.get('overfeeds'), 1);
  c.state = State.SLEEP;
  c.stateTimer = 1e9;
  for (let i = 0; i < 10; i++) c.tick(1, surfaces, { worldBounds: monitor });
  assert.ok(c.stats.get('sleepSeconds') >= 9);
  const facts = c.progressFacts();
  assert.equal(facts.stats.stageReached, 3, 'adulte');
  assert.equal(facts.stats.achievementsUnlocked, 0);
});

test('un animal ancien débloque d’un coup tous les paliers atteints, une seule fois', () => {
  const defs = defsOf([
    { series: 'pets', category: 'care', stat: 'pets', tiers: [1, 2, 3, 100], names: ['A', 'B', 'C', 'D'], description: 'd' },
  ]);
  const { c, surfaces } = worldCritter({ achievements: defs });
  c.stats.add('pets', 5);
  c.stateTimer = 1e9;
  c.tick(1.1, surfaces, { worldBounds: monitor });
  assert.deepEqual(c.takeUnlocked(), ['pets-1', 'pets-2', 'pets-3']);
  c.tick(1.1, surfaces, { worldBounds: monitor });
  assert.deepEqual(c.takeUnlocked(), []);
});

test('titre : seulement un titre gagné, sauvegardé et relu', () => {
  const defs = defsOf([
    { series: 'pets', category: 'care', stat: 'pets', tiers: [1], names: ['A'], description: 'd', title: 'aimant à caresses' },
  ]);
  const { c, surfaces } = worldCritter({ achievements: defs });
  c.setTitle('pets-1');
  assert.equal(c.title, null, 'pas encore gagné');
  c.stats.add('pets', 1);
  c.stateTimer = 1e9;
  c.tick(1.1, surfaces, { worldBounds: monitor });
  c.setTitle('pets-1');
  assert.equal(c.title, 'pets-1');
  const back = new Critter({ achievements: defs }, { x: 0, y: 0 });
  back.restore(c.serialize());
  assert.equal(back.title, 'pets-1');
  assert.ok(back.stats.marks instanceof Set);
  back.setTitle(null);
  assert.equal(back.title, null);
});
