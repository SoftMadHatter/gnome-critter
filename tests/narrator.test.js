import { test } from 'node:test';
import assert from 'node:assert/strict';

import { announceUnlock, announceBurst, announceTrophy, rewardText, NARRATOR } from '../core/narrator.js';
import { buildAchievements, speciesProfile } from '../core/achievements.js';

const real = { name: 'Bon appétit', troll: false, reward: { coins: 10 } };
const troll = { name: 'Toc toc', troll: true, quip: "Il ne s'est rien passé.", reward: { box: 'bronze' } };

test('un vrai succès : annonce sobre, avec les pièces', () => {
  const { title, body } = announceUnlock({ def: real, who: 'Minou', random: () => 0 });
  assert.equal(title, NARRATOR);
  assert.match(body, /Minou : « Bon appétit »/);
  assert.match(body, /10 pièces/);
});

test('une bêtise : commentaire du Système et contenu de la boîte', () => {
  const { body } = announceUnlock({ def: troll, who: 'Minou', outcome: { box: { text: 'une pièce rouillée' } }, random: () => 0 });
  assert.match(body, /Il ne s'est rien passé\./);
  assert.match(body, /une boîte en bronze… qui contient : une pièce rouillée/);
  const player = announceUnlock({ def: troll, who: null, random: () => 0.99 });
  assert.ok(!player.body.includes('null'));
});

test('récompenses farfelues : rien, pièces absurdes, frais de dossier payés ou non, accessoire', () => {
  assert.equal(rewardText({ coins: 0 }), 'rien. Absolument rien.');
  assert.equal(rewardText({ coins: 3, text: '3,14 pièces, arrondies à 3' }), '3,14 pièces, arrondies à 3.');
  assert.equal(rewardText({ coins: 1 }), '1 pièce.');
  assert.equal(rewardText({ coins: -1, text: 'frais de dossier' }, { paid: true }), '−1 pièce (frais de dossier).');
  assert.match(rewardText({ coins: -1, text: 'frais de dossier' }, { paid: false }), /ne peux même pas payer/);
  assert.match(rewardText({ accessory: 'cone' }, { accessoryLabel: 'Cône de la honte' }), /^cône de la honte\./);
  assert.equal(rewardText({ text: 'une plume' }), 'une plume.');
});

test('rafale et trophée', () => {
  const burst = announceBurst({ who: 'Minou', defs: [real, troll, real, real], coins: 25 });
  assert.match(burst.body, /4 succès d'un coup, dont « Bon appétit », « Toc toc » et « Bon appétit »/);
  assert.match(burst.body, /Dont 1 bêtise/);
  assert.match(burst.body, /\+25 pièces/);
  assert.match(announceTrophy({ label: 'Médaille', count: 25 }).body, /25 succès\. Tu as droit à : médaille/);
});

test('toutes les annonces de la bibliothèque restent courtes, sans texte manquant', () => {
  const { critter, player } = buildAchievements([], speciesProfile({ supportedSurfaces: ['ground', 'wall', 'ceiling', 'air', 'water'] }));
  for (const def of [...critter, ...player]) {
    for (const r of [0, 0.5, 0.99]) {
      const { body } = announceUnlock({ def, who: 'Minou', outcome: { paid: true, box: { text: 'rien' }, accessoryLabel: 'Chaussette' }, random: () => r });
      assert.ok(!/undefined|null|NaN/.test(body), `${def.id} : ${body}`);
      assert.ok(body.length <= 320, `${def.id} : ${body.length} caractères`);
    }
  }
});
