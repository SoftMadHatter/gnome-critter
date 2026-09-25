// Actions propres à un animal, partagées par son menu contextuel (clic milieu)
// et par son bloc dans le menu de l'icône de barre : renommer, donner à
// manger, gamelle, lit, brosser, jouer, tours, accessoires, réveiller.
// Chaque action vise l'animal passé en paramètre.


import { foodLabel, TOY_LABELS, BED_LABELS, BOWL_LABELS } from './itemLabels.js';
import { expandableRow } from './menuWidgets.js';
import { TRICKS } from '../core/tricks.js';
import { FOODS, isBowlFood, toyFits } from '../core/items.js';
import { Locomotion } from '../core/critter.js';

const TRICK_LABELS = Object.fromEntries(Object.entries(TRICKS).map(([name, def]) => [name, def.label]));

/**
 * Ajoute les actions d'un animal à `menu` (un PopupMenu ou un PopupMenuSection).
 * @param {PopupMenu.PopupMenuBase} menu
 * @param {import('../core/critter.js').Critter} critter
 * @param {{rename: Function, dropFood: Function, fillBowl: Function, dropBed: Function, dropBowl: Function, dropToy: Function, brush: Function, train: Function, perform: Function, equip: Function, equippable: Function, titles: Function, setTitle: Function, wake: Function}} owner
 * @returns {{refresh: () => void}} refresh : à appeler à l'ouverture du menu
 */
export function buildCritterActions(menu, critter, owner) {
  /** Actions masquées pour un œuf (seul « Renommer » reste) : éléments de menu et rangées dépliables. */
  const hiddenForEgg = [];
  const track = (item) => {
    hiddenForEgg.push({ setVisible: (visible) => (item.actor.visible = visible) });
    return item;
  };
  const trackRow = (row) => {
    hiddenForEgg.push(row);
    return row;
  };

  menu.addAction('Renommer…', () => owner.rename(critter));

  // Aliments du régime, le préféré d'abord (les plantes se posent à part) ; la
  // nourriture flottante ne va pas dans une gamelle.
  const foods = Object.entries(critter.config.needsDiet)
    .filter(([kind]) => FOODS[kind])
    .sort((a, b) => b[1] - a[1])
    .map(([kind]) => kind);
  const favoriteOf = (kind) => (kind === foods[0] ? ' (préféré)' : '');
  if (foods.length > 0) {
    const feed = trackRow(expandableRow(menu, 'Donner à manger'));
    for (const kind of foods) feed.section.addAction(`${foodLabel(kind)}${favoriteOf(kind)}`, () => owner.dropFood(kind, critter));
  }
  const bowlFoods = foods.filter(isBowlFood);
  if (bowlFoods.length > 0) {
    const bowl = trackRow(expandableRow(menu, 'Remplir la gamelle'));
    for (const kind of bowlFoods) {
      bowl.section.addAction(`${foodLabel(kind, 5)}${favoriteOf(kind)}`, () => owner.fillBowl(kind, critter));
    }
    const bowls = trackRow(expandableRow(menu, 'Poser une gamelle'));
    for (const [model, label] of Object.entries(BOWL_LABELS)) bowls.section.addAction(label, () => owner.dropBowl(critter, model));
  }

  const accessories = trackRow(expandableRow(menu, 'Accessoires'));
  const titles = trackRow(expandableRow(menu, 'Titre'));
  const tricks = trackRow(expandableRow(menu, 'Tours'));
  const wake = menu.addAction('Réveiller', () => owner.wake(critter));
  track(wake);
  const beds = trackRow(expandableRow(menu, 'Poser un lit'));
  for (const [model, label] of Object.entries(BED_LABELS)) beds.section.addAction(label, () => owner.dropBed(critter, model));
  track(menu.addAction('Brosser', () => owner.brush(critter)));

  // Jouets adaptés : l'anneau flottant pour une espèce sans sol, les autres sinon.
  const groundless = !critter.supports(Locomotion.GROUND);
  const play = trackRow(expandableRow(menu, 'Jouer'));
  for (const [kind, label] of Object.entries(TOY_LABELS)) {
    if (toyFits(kind, groundless)) play.section.addAction(label, () => owner.dropToy(kind, critter));
  }

  const rebuildAccessories = () => {
    accessories.section.removeAll();
    const worn = critter.accessory;
    accessories.section.addAction(worn === null ? '✓ Aucun' : 'Aucun', () => owner.equip(critter, null));
    for (const { id, label } of owner.equippable()) {
      accessories.section.addAction(worn === id ? `✓ ${label}` : label, () => owner.equip(critter, id));
    }
  };

  // Titres gagnés (séries terminées, certaines bêtises) : un seul porté à la fois.
  const rebuildTitles = () => {
    titles.section.removeAll();
    const earned = owner.titles(critter);
    titles.setVisible(earned.length > 0 && critter.life.stage !== 'egg');
    titles.section.addAction(critter.title === null ? '✓ Aucun' : 'Aucun', () => owner.setTitle(critter, null));
    for (const { id, title } of earned) {
      titles.section.addAction(critter.title === id ? `✓ ${title}` : title, () => owner.setTitle(critter, id));
    }
  };

  const rebuildTricks = () => {
    tricks.section.removeAll();
    const names = critter.config.tricks;
    tricks.setVisible(names.length > 0 && critter.life.stage !== 'egg');
    for (const name of names) {
      const label = TRICK_LABELS[name] ?? name;
      if (critter.tricks.isLearned(name)) {
        tricks.section.addAction(`Faire : ${label}`, () => owner.perform(critter, name));
      } else {
        tricks.section.addAction(`Entraîner : ${label} (${Math.floor(critter.tricks.skill(name))} %)`, () => owner.train(critter, name));
      }
    }
  };

  return {
    refresh() {
      const egg = critter.life.stage === 'egg';
      for (const item of hiddenForEgg) item.setVisible(!egg);
      wake.actor.visible = !egg && critter.life.hibernating;
      if (!egg) {
        rebuildAccessories();
        rebuildTitles();
        rebuildTricks();
      }
    },
  };
}
