import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stats, STAT_KEYS } from '../core/stats.js';
import { buildAchievements, newlyUnlocked, isEligible, CAPABILITIES } from '../core/achievements.js';
import { Player, COIN_REWARDS } from '../core/player.js';

/** Succès écrits pour le test seuls (sans la bibliothèque commune), pour une espèce qui sait tout faire. */
const build = (entries) => buildAchievements(entries, { can: new Set(CAPABILITIES), diet: [], toys: [], tricks: [] }, []);
const facts = (stats, marks = []) => ({ stats, marks: new Set(marks) });

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

test("buildAchievements : l'ancien format reste valide, pièces complétées, rejets signalés", () => {
  const { critter, player, ignored } = build([
    napKing,
    { ...napKing },
    { id: 'x', name: 'X', description: '', condition: { stat: 'pasUnStat', atLeast: 1 } },
    { id: 'y', name: 'Y', description: '', requires: { trait: 'zzz' }, condition: { stat: 'meals', atLeast: 1 } },
    { id: 'z', name: 'Z', description: '', condition: { stat: 'meals', atLeast: 0 } },
    { id: 'ok', name: 'Ok', description: 'd', condition: { stat: 'daysAlive', atLeast: 30 } },
    null,
  ]);
  assert.deepEqual(critter.map((a) => a.id), ['nap-king', 'ok']);
  assert.deepEqual(player, []);
  assert.equal(critter[0].reward.coins, 15);
  assert.equal(critter[1].reward.coins, 10, 'pièces par défaut');
  assert.equal(critter[0].category, 'life', "catégorie déduite de la stat dans l'ancien format");
  assert.deepEqual([...ignored].sort(), ['#6', 'nap-king', 'x', 'y', 'z']);
  assert.deepEqual(build(undefined).ignored, []);
  assert.deepEqual(build('oups').ignored, ['achievements']);
});

test('newlyUnlocked : seuil, caractère, stade, déjà obtenu', () => {
  const defs = build([
    napKing,
    { id: 'meals', name: 'M', description: '', condition: { stat: 'meals', atLeast: 5 } },
    { id: 'elder', name: 'E', description: '', requires: { stage: 'senior' }, condition: { stat: 'daysAlive', atLeast: 1 } },
  ]).critter;
  const stats = facts({ longestSleepSeconds: 1000, meals: 5, daysAlive: 40 });
  const unlocked = new Set();

  assert.deepEqual(newlyUnlocked(defs, { trait: 'lazy', stage: 'adult', facts: stats }, unlocked), ['nap-king', 'meals']);
  assert.deepEqual(newlyUnlocked(defs, { trait: 'playful', stage: 'adult', facts: stats }, unlocked), ['meals'], 'caractère différent');
  assert.deepEqual(newlyUnlocked(defs, { trait: 'lazy', stage: 'senior', facts: stats }, unlocked), ['nap-king', 'meals', 'elder']);
  unlocked.add('meals');
  assert.deepEqual(
    newlyUnlocked(defs, { trait: 'lazy', stage: 'adult', facts: facts({ ...stats.stats, meals: 99 }) }, unlocked),
    ['nap-king'],
  );
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
  for (let i = 0; i < 130; i++) p.log(`entrée ${i}`, i);
  assert.equal(p.journal.length, 100);
  assert.equal(p.journal[0].text, 'entrée 30');
  p.own('crown');

  const back = Player.parse(p.serialize());
  assert.equal(back.coins, 12);
  assert.deepEqual(back.owned, ['crown']);
  assert.equal(back.journal.length, 100);

  for (const bad of ['', '{nope', 'null', '{"version":9}']) assert.equal(Player.parse(bad).coins, 0);
  const messy = new Player({ coins: -5, owned: [1, 'ok'], journal: [null, { t: 1, text: 'a' }, { t: 'x', text: 'b' }] });
  assert.equal(messy.coins, 0);
  assert.deepEqual(messy.owned, ['ok']);
  assert.equal(messy.journal.length, 1);
});

test('Player : journal, annonces non lues et marquage lu', () => {
  const p = new Player();
  const plain = p.log('Un œuf est déposé.', 1);
  const announced = p.log('Toi : succès « A ».', 2, { body: 'Le Comité : bravo.', unread: true });
  const other = p.log('Trophée obtenu.', 3, { body: 'Le Comité : trophée.', unread: true });
  assert.deepEqual([plain.id, announced.id, other.id], [1, 2, 3]);
  assert.equal(plain.unread, undefined);
  assert.equal(announced.body, 'Le Comité : bravo.');
  assert.equal(p.unreadCount(), 2);

  assert.equal(p.markRead(2), true);
  assert.equal(p.markRead(2), false, 'déjà lue');
  assert.equal(p.markRead(99), false, 'inconnue');
  assert.equal(p.unreadCount(), 1);

  const back = Player.parse(p.serialize());
  assert.equal(back.unreadCount(), 1);
  assert.equal(back.journal[2].body, 'Le Comité : trophée.');
  assert.equal(back.log('suite', 4).id, 4, 'les ids continuent après relecture');

  p.markAllRead();
  assert.equal(p.unreadCount(), 0);
});

test('Player : ancien journal (sans id ni non-lu) relu comme lu, ids uniques', () => {
  const p = new Player({ journal: [{ t: 1, text: 'a' }, { t: 2, text: 'b' }, { id: 1, t: 3, text: 'c', unread: 'oui' }, { id: 1, t: 4, text: 'd', body: 5 }] });
  const ids = p.journal.map((e) => e.id);
  assert.equal(new Set(ids).size, 4);
  assert.ok(ids.every((id) => Number.isInteger(id) && id > 0));
  assert.equal(p.unreadCount(), 0);
  assert.ok(p.journal.every((e) => e.body === undefined));
});

test('Player : gestes, marques, succès du joueur et total sauvegardés, anciennes sauvegardes relues', () => {
  const p = new Player({ coins: 40, owned: ['bow'] });
  p.stats.add('menuOpens', 3);
  p.stats.mark('moment', 'yeet');
  p.unlocked.add('menu-opens-1');
  p.achievementCount = 26;
  const facts = p.progressFacts();
  assert.equal(facts.stats.menuOpens, 3);
  assert.equal(facts.stats.coins, 40);
  assert.equal(facts.stats.accessoriesOwned, 1);
  assert.ok(facts.marks.has('moment:yeet'));

  const back = Player.parse(p.serialize());
  assert.equal(back.stats.get('menuOpens'), 3);
  assert.ok(back.stats.hasMark('moment:yeet'));
  assert.ok(back.unlocked.has('menu-opens-1'));
  assert.equal(back.achievementCount, 26);

  const old = Player.parse(JSON.stringify({ version: 1, coins: 5, owned: [], journal: [] }));
  assert.equal(old.achievementCount, 0);
  assert.equal(old.unlocked.size, 0);
  assert.equal(old.stats.get('menuOpens'), 0);
  const messy = new Player({ stats: { menuOpens: -3, marks: ['ok:yes', 'PAS BON', 7] }, unlocked: ['a', 3], achievementCount: -2 });
  assert.equal(messy.stats.get('menuOpens'), 0);
  assert.deepEqual([...messy.stats.marks], ['ok:yes']);
  assert.deepEqual([...messy.unlocked], ['a']);
  assert.equal(messy.achievementCount, 0);
});
