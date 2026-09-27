// Boîtes du Comité, récompense farfelue de certains succès « troll » :
// ouvertes d'office, elles contiennent le plus souvent rien (ou presque), et
// parfois un vrai lot qui grossit avec la boîte. Module pur (hasard injecté).

import { ACCESSORIES, accessoryLabel } from './accessories.js';
import { _, N_ } from './i18n.js';

/** Accessoires « farces » qu'une boîte peut offrir. */
const JOKES = Object.keys(ACCESSORIES).filter((id) => ACCESSORIES[id].joke);

/**
 * Tables de tirage `[poids, lot]`. Un lot `accessory: 'joke'` donne une farce
 * pas encore possédée, sinon son `fallback`.
 */
export const BOX_TABLES = Object.freeze({
  bronze: [
    [50, { text: N_('rien, absolument rien') }],
    [30, { coins: 1, text: N_('une pièce rouillée') }],
    [15, { text: N_("un mot d'excuse du Comité") }],
    [5, { coins: 5, text: N_('cinq pièces presque neuves') }],
  ],
  silver: [
    [35, { text: N_('une boîte en bronze, vide') }],
    [30, { coins: 2, text: N_('deux pièces qui ne se ressemblent pas') }],
    [20, { text: N_('un coupon de réduction expiré') }],
    [15, { coins: 10, text: N_('dix pièces') }],
  ],
  gold: [
    [25, { text: N_('un certificat de participation') }],
    [30, { coins: 5, text: N_('cinq pièces et une excuse') }],
    [30, { coins: 20, text: N_('vingt pièces, sans condition') }],
    [15, { accessory: 'joke', fallback: { coins: 20, text: N_('vingt pièces (tu as déjà toutes les farces)') } }],
  ],
  platinum: [
    [20, { text: N_('une boîte en or, vide, mais brillante') }],
    [40, { coins: 40, text: N_('quarante pièces') }],
    [40, { accessory: 'joke', fallback: { coins: 40, text: N_('quarante pièces') } }],
  ],
  legendary: [
    [50, { coins: 100, text: N_("cent pièces. Le Comité n'en revient pas") }],
    [50, { accessory: 'joke', fallback: { coins: 100, text: N_('cent pièces') } }],
  ],
});

export const BOX_LABELS = Object.freeze({
  bronze: N_('une boîte en bronze'),
  silver: N_('une boîte en argent'),
  gold: N_('une boîte en or'),
  platinum: N_('une boîte en platine'),
  legendary: N_('une boîte légendaire'),
});

/** Nom affiché d'une boîte (« une boîte en or »). */
export function boxLabel(tier) {
  return BOX_LABELS[tier] ? _(BOX_LABELS[tier]) : tier;
}

/**
 * Ouvre une boîte.
 * @param {string} tier bronze, silver, gold, platinum ou legendary
 * @param {() => number} random
 * @param {{owned?: string[]}} [context] accessoires déjà possédés
 * @returns {{coins: number, accessory: string|null, text: string}}
 */
export function openBox(tier, random, { owned = [] } = {}) {
  const table = BOX_TABLES[tier] ?? BOX_TABLES.bronze;
  const total = table.reduce((sum, [weight]) => sum + weight, 0);
  let roll = random() * total;
  let prize = table[table.length - 1][1];
  for (const [weight, candidate] of table) {
    if (roll < weight) {
      prize = candidate;
      break;
    }
    roll -= weight;
  }
  if (prize.accessory === 'joke') {
    const free = JOKES.filter((id) => !owned.includes(id));
    if (free.length === 0) return { coins: prize.fallback.coins ?? 0, accessory: null, text: _(prize.fallback.text) };
    const id = free[Math.min(free.length - 1, Math.floor(random() * free.length))];
    return { coins: 0, accessory: id, text: accessoryLabel(id).toLowerCase() };
  }
  return { coins: prize.coins ?? 0, accessory: null, text: _(prize.text) };
}
