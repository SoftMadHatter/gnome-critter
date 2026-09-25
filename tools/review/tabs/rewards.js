// Onglet « Récompenses » : boîtes du Système (lots, probabilités, simulation),
// budget de pièces de l'espèce, trophées et accessoires ridicules.

import { h, table, badge, percent } from '../dom.js';
import { BOX_TABLES, boxLabel, openBox } from '../../../core/lootBoxes.js';
import { _ } from '../../../core/i18n.js';
import { BOX_TIERS, DISPLAY_ORDER, formatCount } from '../../../core/achievements.js';
import { ACCESSORIES, accessoryLabel } from '../../../core/accessories.js';
import { rewardText } from '../../../core/narrator.js';
import { categoryLabel } from '../format.js';

const SIMULATIONS = 1000;
const TIER_NAMES = { bronze: 'bronze', silver: 'argent', gold: 'or', platinum: 'platine', legendary: 'légendaire' };

function simulate(tier) {
  let coins = 0;
  let max = 0;
  let accessories = 0;
  let nothing = 0;
  for (let i = 0; i < SIMULATIONS; i++) {
    const prize = openBox(tier, Math.random);
    coins += prize.coins;
    max = Math.max(max, prize.coins);
    if (prize.accessory) accessories++;
    if (prize.coins === 0 && !prize.accessory) nothing++;
  }
  return { mean: coins / SIMULATIONS, max, accessories: accessories / SIMULATIONS, nothing: nothing / SIMULATIONS };
}

function boxPanel(tier) {
  const lots = BOX_TABLES[tier];
  const total = lots.reduce((sum, [weight]) => sum + weight, 0);
  const result = h('div');
  const run = () => {
    const s = simulate(tier);
    result.replaceChildren(
      h('p', {}, `${formatCount(SIMULATIONS)} ouvertures : ${s.mean.toFixed(1).replace('.', ',')} pièces en moyenne, `,
        `${s.max} au mieux, un accessoire dans ${percent(s.accessories)} des cas, rien du tout dans ${percent(s.nothing)}.`),
    );
  };
  const opened = h('div');
  run();
  return h(
    'div',
    { class: 'panel', style: { border: '1px solid var(--line)', borderRadius: '8px', padding: '10px' } },
    h('h3', {}, boxLabel(tier)),
    table(
      [
        ['Lot', ([, lot]) => (lot.accessory ? `un accessoire farce (sinon : ${_(lot.fallback.text)})` : _(lot.text))],
        ['Pièces', ([, lot]) => lot.coins ?? (lot.fallback?.coins ? `(${lot.fallback.coins})` : 0), 'num'],
        ['Probabilité', ([weight]) => percent(weight / total), 'num'],
      ],
      lots,
    ),
    result,
    h('div', { class: 'controls' },
      h('button', { onclick: run }, 'Relancer la simulation'),
      h('button', {
        onclick: () => opened.replaceChildren(
          h('div', { class: 'notif' }, h('b', {}, 'Récompense'), rewardText({ box: tier }, { box: openBox(tier, Math.random) })),
        ),
      }, 'Ouvrir une boîte')),
    opened,
  );
}

function budget(pack) {
  const rows = DISPLAY_ORDER.map((category) => {
    const defs = pack.all.filter((def) => def.category === category);
    const boxes = {};
    for (const def of defs) if (def.reward.box) boxes[def.reward.box] = (boxes[def.reward.box] ?? 0) + 1;
    return {
      category,
      count: defs.length,
      coins: defs.reduce((sum, def) => sum + Math.max(0, def.reward.coins ?? 0), 0),
      fees: defs.filter((def) => def.reward.coins < 0).length,
      nothing: defs.filter((def) => def.reward.coins === 0 && !def.reward.text).length,
      boxes,
      accessories: defs.filter((def) => def.reward.accessory).length,
    };
  }).filter((row) => row.count > 0);
  const total = rows.reduce((sum, row) => sum + row.coins, 0);
  return h(
    'div',
    {},
    table(
      [
        ['Rubrique', (row) => categoryLabel(row.category)],
        ['Succès', (row) => row.count, 'num'],
        ['Pièces', (row) => formatCount(row.coins), 'num'],
        ['Frais de dossier', (row) => row.fees || '', 'num'],
        ['Rien', (row) => row.nothing || '', 'num'],
        ['Boîtes', (row) => BOX_TIERS.filter((t) => row.boxes[t]).map((t) => `${row.boxes[t]} ${TIER_NAMES[t]}`).join(', ')],
        ['Accessoires', (row) => row.accessories || '', 'num'],
      ],
      rows,
    ),
    h('p', {}, `Total : ${formatCount(total)} pièces à gagner par les succès (hors boîtes), tous caractères confondus.`),
  );
}

export function render(root, { pack, data }) {
  const trophies = Object.entries(ACCESSORIES).filter(([, def]) => def.trophy).sort((a, b) => a[1].trophy - b[1].trophy);
  const jokes = Object.entries(ACCESSORIES).filter(([, def]) => def.joke);
  const givers = (id) => pack.all.filter((def) => def.reward.accessory === id);
  root.append(
    h('section', { class: 'panel' }, h('h2', {}, 'Boîtes du Système'), h('div', { class: 'columns' }, BOX_TIERS.map(boxPanel))),
    h('section', { class: 'panel' }, h('h2', {}, `Budget — ${pack.meta.displayName ?? pack.id}`), budget(pack)),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Trophées et accessoires ridicules'),
      table(
        [
          ['Accessoire', ([id, def]) => [h('img', { src: `/extension/assets/accessories/${id}.png`, width: 32, height: 32, style: { verticalAlign: 'middle' } }), ' ', accessoryLabel(id)]],
          ['Obtention', ([id, def]) => (def.trophy
            ? `au ${def.trophy}e succès du joueur (tous animaux confondus)`
            : givers(id).map((g) => `${g.name} (${g.id})`).join(', ') || 'boîtes en or, platine ou légendaires seulement')],
          ['Type', ([, def]) => badge(def.trophy ? 'trophée' : 'farce', def.trophy ? 'ok' : 'troll')],
        ],
        [...trophies, ...jokes],
      ),
      h('p', { class: 'muted' }, `Packs chargés : ${data.ids.join(', ')}. Les boîtes peuvent aussi donner une farce que le joueur n'a pas encore.`),
    ),
  );
}
