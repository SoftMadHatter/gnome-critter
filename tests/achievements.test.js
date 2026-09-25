import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAchievements, speciesProfile, newlyUnlocked, titlesFor, achievementView, achievementCount, conditionValue,
  formatCount, CAPABILITIES, TROLL_CATEGORY, PLAYER_CATEGORY, TIER_COINS,
} from '../core/achievements.js';

const ALL = { can: new Set(CAPABILITIES), diet: ['fish', 'meat', 'kibble', 'grass'], toys: ['ball', 'yarn', 'plush'], tricks: ['sit', 'roll'] };
const build = (entries, profile = ALL, library = []) => buildAchievements(entries, profile, library);
const facts = (stats = {}, marks = []) => ({ stats, marks: new Set(marks) });

const meals = {
  series: 'meals', category: 'care', stat: 'meals', tiers: [10, 50, 200],
  names: ['Petit creux', 'Bon appétit', 'Ogre'], description: 'Faire {n} repas', title: 'ogre du bureau',
};

test('une série se développe en paliers : ids, noms, descriptions, pièces, titre au dernier', () => {
  const { critter, ignored } = build([meals]);
  assert.deepEqual(ignored, []);
  assert.deepEqual(critter.map((d) => d.id), ['meals-10', 'meals-50', 'meals-200']);
  assert.deepEqual(critter.map((d) => d.description), ['Faire 10 repas', 'Faire 50 repas', 'Faire 200 repas']);
  assert.deepEqual(critter.map((d) => d.reward.coins), TIER_COINS.slice(0, 3));
  assert.deepEqual(critter.map((d) => d.title), [null, null, 'ogre du bureau']);
  assert.ok(critter.every((d) => d.series === 'meals' && d.category === 'care' && !d.troll));
});

test('paliers : unité, pluriel, grands nombres, identifiant historique', () => {
  const { critter } = build([
    { series: 'sleep', category: 'life', stat: 'sleepSeconds', unit: 3600, tiers: [1, 10], names: ['A', 'B'], description: 'Dormir {n} heure{s}' },
    { series: 'big', category: 'care', stat: 'pets', tiers: [1000, { at: 20000, id: 'legacy' }], names: ['C', 'D'], description: '{n} caresses' },
  ]);
  const byId = Object.fromEntries(critter.map((d) => [d.id, d]));
  assert.equal(byId['sleep-1'].description, 'Dormir 1 heure');
  assert.equal(byId['sleep-10'].description, 'Dormir 10 heures');
  assert.equal(byId['sleep-10'].condition.atLeast, 36000);
  assert.equal(byId['big-1000'].description, `${formatCount(1000)} caresses`);
  assert.equal(formatCount(20000), '20 000');
  assert.ok(byId.legacy, 'palier {at, id} : garde son identifiant');
});

test('« all » vaut le nombre de choses à collectionner pour l’espèce ; les paliers impossibles tombent', () => {
  const foods = { series: 'foods', category: 'collection', marks: 'food', tiers: [2, 4, 'all'], names: ['A', 'B', 'C'], description: 'Goûter {n} aliments' };
  assert.deepEqual(build([foods]).critter.map((d) => d.condition.atLeast), [2, 4]);
  const fish = { ...ALL, diet: ['plankton', 'flakes', 'algae'] };
  assert.deepEqual(build([foods], fish).critter.map((d) => d.condition.atLeast), [2, 3], '4 > 3 aliments : palier retiré');
  const toys = { series: 'toys', category: 'collection', marks: 'toy', tiers: [2, 'all'], names: ['A', 'B'], description: '{n} jouet{s}' };
  const one = build([toys], { ...ALL, toys: ['ring'] }).critter;
  assert.deepEqual(one.map((d) => [d.condition.atLeast, d.description]), [[1, '1 jouet']]);
  const tricks = { series: 'tricks', category: 'collection', stat: 'tricksLearned', tiers: [1, 'all'], names: ['A', 'B'], description: 'd' };
  assert.deepEqual(build([tricks], { ...ALL, tricks: [] }).critter, [], 'rien à apprendre : série vide, sans erreur');
  const bad = { series: 'bad', category: 'care', stat: 'meals', tiers: ['all'], names: ['A'], description: 'd' };
  assert.deepEqual(build([bad]).ignored, ['bad'], '« all » sans collection : rejeté');
});

test("requires.can écarte ce que l'espèce ne sait pas faire, sans le signaler", () => {
  const flights = { series: 'flights', category: 'exploration', stat: 'flights', tiers: [10], names: ['A'], description: 'd', requires: { can: 'air' } };
  const cat = speciesProfile({ supportedSurfaces: ['ground', 'wall'] });
  assert.deepEqual(build([flights], cat), { critter: [], player: [], ignored: [] });
  assert.equal(build([flights]).critter.length, 1);
  const bad = { ...flights, series: 'bad', requires: { can: 'teleport' } };
  assert.deepEqual(build([bad]).ignored, ['bad']);
});

test('speciesProfile : locomotions, chasse, plantes, besoins actifs, tours, jouets', () => {
  const fish = speciesProfile({
    supportedSurfaces: ['water'],
    needs: { decayPerHour: { energy: 0, cleanliness: 0, relief: 0 }, diet: { plankton: 40, algae: 8 }, prey: { krill: 25 } },
    tricks: ['flip'],
  });
  assert.deepEqual([...fish.can].sort(), ['graze', 'hunt', 'tricks', 'water']);
  assert.deepEqual(fish.toys, ['ring']);
  assert.deepEqual(fish.tricks, ['flip']);
  const cat = speciesProfile({ supportedSurfaces: ['ground', 'wall', 'ceiling'], needs: { diet: { fish: 60 } } });
  assert.ok(['ground', 'wall', 'ceiling', 'relieve', 'sleep', 'groom'].every((c) => cat.can.has(c)));
  assert.ok(!cat.can.has('hunt') && !cat.can.has('graze') && !cat.can.has('tricks'));
  assert.deepEqual(cat.toys, ['ball', 'yarn', 'plush']);
});

test("un pack remplace une entrée de la bibliothèque (même series ou id), ou la retire", () => {
  const library = [meals, { id: 'hello', category: 'care', name: 'Salut', description: 'd', stat: 'greets', atLeast: 1 }];
  const override = { ...meals, names: ['X', 'Y', 'Z'] };
  assert.deepEqual(build([override], ALL, library).critter.filter((d) => d.series === 'meals').map((d) => d.name), ['X', 'Y', 'Z']);
  const { critter } = build([{ series: 'meals', disabled: true }, { id: 'hello', disabled: true }], ALL, library);
  assert.deepEqual(critter, []);
});

test('troll : caché, commentaire et récompense obligatoires, récompenses validées', () => {
  const ok = {
    series: 'falls', troll: true, stat: 'falls', tiers: [10, 50], names: ['A', 'B'], description: 'd',
    quips: ['q1', 'q2'], reward: [{ coins: -1, text: 'frais de dossier' }, { box: 'gold' }],
  };
  const single = { id: 'owl', troll: true, mark: 'moment:night-owl', name: 'N', description: 'd', quip: 'q' };
  const { critter, ignored } = build([ok, single]);
  assert.deepEqual(ignored, []);
  assert.ok(critter.every((d) => d.troll && d.category === TROLL_CATEGORY));
  assert.deepEqual(critter.map((d) => d.reward), [{ coins: -1, text: 'frais de dossier' }, { box: 'gold' }, { coins: 0 }]);
  assert.deepEqual(critter.map((d) => d.quip), ['q1', 'q2', 'q']);

  const rejected = build([
    { ...single, id: 'no-quip', quip: undefined },
    { ...single, id: 'bad-box', reward: { box: 'wood' } },
    { ...single, id: 'two-kinds', reward: { coins: 1, box: 'gold' } },
    { ...single, id: 'real-accessory', reward: { accessory: 'crown' } },
    { ...single, id: 'bad-mark', mark: 'nope:x' },
    { ...ok, series: 'short-quips', quips: ['q1'] },
  ]).ignored;
  assert.deepEqual(rejected, ['no-quip', 'bad-box', 'two-kinds', 'real-accessory', 'bad-mark', 'short-quips']);
  assert.deepEqual(build([{ ...single, id: 'joke', reward: { accessory: 'cone' } }]).ignored, []);
});

test('portée joueur : ses propres stats et marques, catégorie « Toi »', () => {
  const { critter, player, ignored } = build([
    { series: 'menu', scope: 'player', troll: true, stat: 'menuOpens', tiers: [1, 100], names: ['A', 'B'], description: 'd', quip: 'q' },
    { id: 'yeet', scope: 'player', troll: true, mark: 'moment:yeet', name: 'Y', description: 'd', quip: 'q' },
    { id: 'wrong-scope', scope: 'player', stat: 'meals', atLeast: 1, name: 'W', description: 'd' },
    { id: 'wrong-scope-2', stat: 'menuOpens', atLeast: 1, name: 'W', description: 'd', category: 'care' },
  ]);
  assert.deepEqual(critter, []);
  assert.deepEqual(player.map((d) => d.id), ['menu-1', 'menu-100', 'yeet']);
  assert.ok(player.every((d) => d.category === PLAYER_CATEGORY && d.scope === 'player'));
  assert.deepEqual(ignored, ['wrong-scope', 'wrong-scope-2']);
});

test('évaluation : compteur, nombre de marques, marque précise', () => {
  const { critter } = build([
    { series: 'foods', category: 'collection', marks: 'food', tiers: [2, 'all'], names: ['A', 'B'], description: 'd' },
    { id: 'xmas', category: 'seasons', mark: 'holiday:christmas', name: 'Noël', description: 'd' },
    meals,
  ]);
  const f = facts({ meals: 60 }, ['food:fish', 'food:meat', 'holiday:christmas', 'toy:ball']);
  assert.equal(conditionValue(critter[0].condition, f), 2);
  assert.deepEqual(newlyUnlocked(critter, { trait: null, stage: 'adult', facts: f }, new Set()), ['foods-2', 'xmas', 'meals-10', 'meals-50']);
});

test('titres : ceux des séries terminées et des uniques obtenus', () => {
  const { critter } = build([meals, { id: 'lol', troll: true, stat: 'falls', atLeast: 1, name: 'L', description: 'd', quip: 'q', title: 'as de la chute' }]);
  assert.deepEqual(titlesFor(critter, new Set(['meals-10', 'meals-50'])), []);
  assert.deepEqual(titlesFor(critter, new Set(['meals-200', 'lol'])), [{ id: 'meals-200', title: 'ogre du bureau' }, { id: 'lol', title: 'as de la chute' }]);
});

test("affichage : une ligne par série (dernier palier, suivant, progression), bêtises cachées jusqu'à leur découverte", () => {
  const { critter } = build([
    meals,
    { series: 'drags', troll: true, stat: 'drags', tiers: [25, 100], names: ['Mal des transports', 'Tapis volant'], description: 'Porté {n} fois', quip: 'q' },
    { id: 'owl', troll: true, mark: 'moment:night-owl', name: 'Noctambule', description: 'd', quip: 'hou' },
    { id: 'lazy-only', category: 'life', stat: 'naps', atLeast: 5, name: 'Z', description: 'd', requires: { trait: 'lazy' } },
  ]);
  const unlocked = new Set(['meals-10']);
  const view = achievementView(critter, { trait: 'playful', unlocked, facts: facts({ meals: 37, drags: 30 }) });
  assert.deepEqual([view.done, view.total], [1, 6], 'le succès de caractère « paresseux » ne compte pas');
  const care = view.categories.find((c) => c.id === 'care');
  assert.deepEqual(care.entries, [{
    id: 'meals-50', series: true, troll: false, name: 'Bon appétit', description: 'Faire 50 repas', done: false,
    last: { name: 'Petit creux' }, value: 37, target: 50, tier: 1, tiers: 3, title: 'ogre du bureau', quip: null, reward: { coins: 5 },
  }]);
  const mischief = view.categories.find((c) => c.id === TROLL_CATEGORY);
  assert.deepEqual([mischief.done, mischief.total, mischief.entries.length], [0, 3, 0], 'rien de découvert : seulement le compte');

  unlocked.add('drags-25');
  unlocked.add('owl');
  const found = achievementView(critter, { trait: 'playful', unlocked, facts: facts({ meals: 37, drags: 30 }) });
  const entries = found.categories.find((c) => c.id === TROLL_CATEGORY).entries;
  assert.deepEqual(entries.map((e) => [e.name, e.done, e.quip]), [['Tapis volant', false, 'q'], ['Noctambule', true, 'hou']]);
  assert.deepEqual(achievementCount(critter, { trait: 'playful', unlocked }), { done: 3, total: 6 });
});
