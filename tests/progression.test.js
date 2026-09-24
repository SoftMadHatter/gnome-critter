import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stats, STAT_KEYS } from '../core/stats.js';
import { achievementsOverrides, newlyUnlocked, isEligible } from '../core/achievements.js';
import { Player, COIN_REWARDS } from '../core/player.js';

const napKing = {
  id: 'nap-king', name: 'Roi de la sieste', description: 'Dormir 15 minutes d\'affilée',
  requires: { trait: 'lazy' }, condition: { stat: 'longestSleepSeconds', atLeast: 900 }, coins: 15,
};

test('Stats : add, max, bornes, sérialisation tolérante', () => {
  const s = new Stats();
  s.add('meals');
  s.add('meals', 2);
  s.add('inconnue', 5);
  s.add('pets', NaN);
  s.max('longestSleepSeconds', 100);
  s.max('longestSleepSeconds', 50);
  assert.equal(s.get('meals'), 3);
  assert.equal(s.get('inconnue'), 0);
  assert.equal(s.get('pets'), 0);
  assert.equal(s.get('longestSleepSeconds'), 100);

  const t = new Stats();
  t.restore(s.serialize());
  assert.equal(t.get('meals'), 3);
  t.restore({ meals: -4, pets: 'x', purrs: 7 });
  assert.equal(t.get('meals'), 3);
  assert.equal(t.get('purrs'), 7);
  t.restore(null);
  assert.ok(STAT_KEYS.every((k) => Number.isFinite(t.get(k))));
});

test('achievementsOverrides : valide, complète les pièces, signale le reste', () => {
  const { list, ignored } = achievementsOverrides([
    napKing,
    { ...napKing },
    { id: 'x', name: 'X', description: '', condition: { stat: 'pasUnStat', atLeast: 1 } },
    { id: 'y', name: 'Y', description: '', requires: { trait: 'zzz' }, condition: { stat: 'meals', atLeast: 1 } },
    { id: 'z', name: 'Z', description: '', condition: { stat: 'meals', atLeast: 0 } },
    { id: 'ok', name: 'Ok', description: 'd', condition: { stat: 'daysAlive', atLeast: 30 } },
    null,
  ]);
  assert.deepEqual(list.map((a) => a.id), ['nap-king', 'ok']);
  assert.equal(list[1].coins, 10);
  assert.deepEqual(ignored, ['nap-king', 'x', 'y', 'z', '#6']);
  assert.deepEqual(achievementsOverrides(undefined), { list: [], ignored: [] });
  assert.deepEqual(achievementsOverrides('oups').ignored, ['achievements']);
});

test('newlyUnlocked : seuil, caractère, stade, déjà obtenu', () => {
  const defs = achievementsOverrides([
    napKing,
    { id: 'meals', name: 'M', description: '', condition: { stat: 'meals', atLeast: 5 } },
    { id: 'elder', name: 'E', description: '', requires: { stage: 'senior' }, condition: { stat: 'daysAlive', atLeast: 1 } },
  ]).list;
  const stats = { longestSleepSeconds: 1000, meals: 5, daysAlive: 40 };
  const unlocked = new Set();

  assert.deepEqual(newlyUnlocked(defs, { trait: 'lazy', stage: 'adult', stats }, unlocked), ['nap-king', 'meals']);
  assert.deepEqual(newlyUnlocked(defs, { trait: 'playful', stage: 'adult', stats }, unlocked), ['meals'], 'caractère différent');
  assert.deepEqual(newlyUnlocked(defs, { trait: 'lazy', stage: 'senior', stats }, unlocked), ['nap-king', 'meals', 'elder']);
  unlocked.add('meals');
  assert.deepEqual(newlyUnlocked(defs, { trait: 'lazy', stage: 'adult', stats: { ...stats, meals: 99 } }, unlocked), ['nap-king']);
  assert.equal(isEligible(defs[0], { trait: 'shy' }), false);
  assert.equal(isEligible(defs[1], { trait: 'shy' }), true);
});

test('Player : gains avec délai anti-abus, dépenses, achats', () => {
  const p = new Player();
  assert.equal(p.awardEvent('chat', 'ate', 0), COIN_REWARDS.ate);
  assert.equal(p.awardEvent('chat', 'ate', 10), 0, 'trop tôt');
  assert.equal(p.awardEvent('chat', 'ate', 31), COIN_REWARDS.ate);
  assert.equal(p.awardEvent('oiseau', 'ate', 31), COIN_REWARDS.ate, 'autre animal');
  assert.equal(p.awardEvent('chat', 'hatched', 32), COIN_REWARDS.hatched);
  assert.equal(p.awardEvent('chat', 'hatched', 33), COIN_REWARDS.hatched, 'événements rares : sans délai');
  assert.equal(p.awardEvent('chat', 'inconnu', 34), 0);

  const before = p.coins;
  assert.equal(p.spend(before + 1), false);
  assert.equal(p.coins, before);
  assert.equal(p.spend(5), true);
  assert.equal(p.coins, before - 5);
  p.own('bow');
  p.own('bow');
  assert.deepEqual(p.owned, ['bow']);
  assert.ok(p.owns('bow') && !p.owns('crown'));
});

test('Player : journal borné, sérialisation et lecture tolérante', () => {
  const p = new Player({ coins: 12.7 });
  for (let i = 0; i < 70; i++) p.log(`entrée ${i}`, i);
  assert.equal(p.journal.length, 50);
  assert.equal(p.journal[0].text, 'entrée 20');
  p.own('crown');

  const back = Player.parse(p.serialize());
  assert.equal(back.coins, 12);
  assert.deepEqual(back.owned, ['crown']);
  assert.equal(back.journal.length, 50);

  for (const bad of ['', '{nope', 'null', '{"version":9}']) assert.equal(Player.parse(bad).coins, 0);
  const messy = new Player({ coins: -5, owned: [1, 'ok'], journal: [null, { t: 1, text: 'a' }, { t: 'x', text: 'b' }] });
  assert.equal(messy.coins, 0);
  assert.deepEqual(messy.owned, ['ok']);
  assert.equal(messy.journal.length, 1);
});
