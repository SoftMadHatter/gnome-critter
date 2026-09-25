// Libellés français des objets du bureau (aliments, jouets, modèles de lit et
// de gamelle, proies, plantes). Module pur, sans GNOME : partagé par les menus
// de l'extension et par l'outil de revue (tools/review).

import { FOOD_PRICES } from '../core/accessories.js';

export const FOOD_LABELS = {
  meat: 'Viande',
  fish: 'Poisson',
  pate: 'Pâtée',
  kibble: 'Croquettes',
  seeds: 'Graines',
  mealworms: 'Vers de farine',
  apple: 'Pomme',
  plankton: 'Plancton',
  flakes: 'Flocons',
};

/** Libellé d'un aliment avec son prix (aliments premium seulement), pour `portions` portions. */
export function foodLabel(kind, portions = 1) {
  const price = (FOOD_PRICES[kind] ?? 0) * portions;
  return `${FOOD_LABELS[kind] ?? kind}${price > 0 ? ` (${price} pièces)` : ''}`;
}

export const TOY_LABELS = { ball: 'Balle', yarn: 'Pelote de laine', plush: 'Peluche', ring: 'Anneau flottant' };
export const BED_LABELS = { cushion: 'Coussin', basket: 'Panier', cradle: 'Couffin' };
export const BOWL_LABELS = { ceramic: 'Céramique', steel: 'Inox', wood: 'Bois' };

export const PREY_LABELS = { mouse: 'Souris', beetle: 'Scarabée', aphid: 'Puceron', krill: 'Krill' };
export const PLANT_LABELS = { grass: 'Herbe', berries: 'Baies', leaf: 'Feuille', algae: 'Algue' };
