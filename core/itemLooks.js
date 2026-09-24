// Apparence des objets du bureau : taille d'affichage et nom du sprite selon
// le type, le modèle et l'état (bouchées restantes, niveau de la gamelle,
// moisissure...). Module pur : l'extension affiche
// `extension/assets/items/<nom>.png`, dessiné par scripts/gen_ui_sprites.py au
// double de la taille d'affichage, et les tests vérifient que chaque nom du
// catalogue existe.

import {
  FOODS, PLANTS, GIFTS, TOYS, BED_MODELS, BOWL_MODELS, PLANT_MAX_PORTIONS,
  isBowlFood, bowlLevel, isMoldy, isDirty, isOldMess,
} from './items.js';
import { PREY } from './prey.js';

/** Les PNG sont dessinés à cette échelle de leur taille d'affichage (nets en HiDPI). */
export const SPRITE_SCALE = 2;

const SIZES = {
  food: [16, 16], bowl: [24, 12], bed: [32, 12], gift: [12, 12], plant: [16, 14], litter: [24, 10], mess: [10, 6],
};
const TOY_SIZES = { ball: [12, 12], yarn: [12, 12], plush: [16, 14], ring: [16, 16] };
const PREY_SIZES = { mouse: [16, 10], beetle: [10, 8], aphid: [6, 5], krill: [8, 6] };
const LASER_SIZE = [8, 8];

const asSize = ([width, height]) => ({ width, height });

/** Taille d'affichage (px logiques) d'un objet ; le bas du sprite est son point de pose. */
export function spriteSize(item) {
  if (item.type === 'toy') return asSize(TOY_SIZES[item.kind] ?? SIZES.food);
  if (item.type === 'prey') return asSize(PREY_SIZES[item.kind] ?? SIZES.food);
  return asSize(SIZES[item.type] ?? SIZES.food);
}

/**
 * Nom du sprite d'un objet dans son état actuel.
 * @param {object} item
 * @param {number} [frame] frame de marche d'une proie (0 ou 1)
 */
export function spriteName(item, frame = 0) {
  switch (item.type) {
    case 'food':
      return `food_${item.kind}_${Math.max(1, item.portions)}`;
    case 'bowl': {
      const level = bowlLevel(item.portions);
      if (level === 0 || !isBowlFood(item.kind)) return `bowl_${item.model}_empty`;
      return isMoldy(item) ? `bowl_${item.model}_moldy_${level}` : `bowl_${item.model}_${item.kind}_${level}`;
    }
    case 'bed':
      return `bed_${item.model}`;
    case 'toy':
      return `toy_${item.kind}_${item.model}`;
    case 'plant':
      return `${item.kind}_${item.portions}`;
    case 'litter':
      return isDirty(item) ? 'litter_dirty' : 'litter_clean';
    case 'mess':
      return isOldMess(item) ? 'mess_old' : 'mess';
    case 'prey':
      return `${item.kind}_${frame}`;
    default:
      return item.kind; // cadeaux
  }
}

/** Catalogue complet des sprites d'objets : nom -> taille d'affichage. */
export function spriteCatalog() {
  const catalog = {};
  const add = (name, size) => {
    catalog[name] = asSize(size);
  };
  for (const [kind, food] of Object.entries(FOODS)) {
    for (let n = 1; n <= food.bites; n++) add(`food_${kind}_${n}`, SIZES.food);
  }
  const bowlFoods = Object.keys(FOODS).filter(isBowlFood);
  for (const model of BOWL_MODELS) {
    add(`bowl_${model}_empty`, SIZES.bowl);
    for (let level = 1; level <= 3; level++) {
      for (const kind of bowlFoods) add(`bowl_${model}_${kind}_${level}`, SIZES.bowl);
      add(`bowl_${model}_moldy_${level}`, SIZES.bowl);
    }
  }
  for (const model of BED_MODELS) add(`bed_${model}`, SIZES.bed);
  for (const [kind, toy] of Object.entries(TOYS)) {
    for (const variant of toy.variants) add(`toy_${kind}_${variant}`, TOY_SIZES[kind]);
  }
  for (const kind of Object.keys(PLANTS)) {
    for (let n = 0; n <= PLANT_MAX_PORTIONS; n++) add(`${kind}_${n}`, SIZES.plant);
  }
  for (const kind of Object.keys(PREY)) {
    for (const frame of [0, 1]) add(`${kind}_${frame}`, PREY_SIZES[kind]);
  }
  for (const kind of Object.keys(GIFTS)) add(kind, SIZES.gift);
  add('litter_clean', SIZES.litter);
  add('litter_dirty', SIZES.litter);
  add('mess', SIZES.mess);
  add('mess_old', SIZES.mess);
  add('laser', LASER_SIZE); // point du pointeur laser (pas un objet, même dossier)
  return catalog;
}
