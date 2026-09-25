// Actions propres à un animal, partagées par son menu contextuel (clic milieu)
// et par son bloc dans le menu de l'icône de barre : renommer, donner à
// manger, gamelle, lit, brosser, jouer, tours, accessoires, réveiller.
// Chaque action vise l'animal passé en paramètre.

import { expandableRow } from './menuWidgets.js';
import { _, fmt } from '../core/i18n.js';
import { foodLabel, toyLabel, bedLabel, bowlLabel, TOY_LABELS, BED_LABELS, BOWL_LABELS } from '../core/labels.js';
import { trickLabel } from '../core/tricks.js';
import { FOODS, isBowlFood, toyFits } from '../core/items.js';
import { Locomotion } from '../core/critter.js';

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

  menu.addAction(_('Renommer…'), () => owner.rename(critter));

  // Aliments du régime, le préféré d'abord (les plantes se posent à part) ; la
  // nourriture flottante ne va pas dans une gamelle.
  const foods = Object.entries(critter.config.needsDiet)
    .filter(([kind]) => FOODS[kind])
    .sort((a, b) => b[1] - a[1])
    .map(([kind]) => kind);
  const withFavorite = (kind, text) => (kind === foods[0] ? fmt(_('{food} (préféré)'), { food: text }) : text);
  if (foods.length > 0) {
    const feed = trackRow(expandableRow(menu, _('Donner à manger')));
    for (const kind of foods) feed.section.addAction(withFavorite(kind, foodLabel(kind)), () => owner.dropFood(kind, critter));
  }
  const bowlFoods = foods.filter(isBowlFood);
  if (bowlFoods.length > 0) {
    const bowl = trackRow(expandableRow(menu, _('Remplir la gamelle')));
    for (const kind of bowlFoods) {
      bowl.section.addAction(withFavorite(kind, foodLabel(kind, 5)), () => owner.fillBowl(kind, critter));
    }
    const bowls = trackRow(expandableRow(menu, _('Poser une gamelle')));
    for (const model of Object.keys(BOWL_LABELS)) bowls.section.addAction(bowlLabel(model), () => owner.dropBowl(critter, model));
  }

  const accessories = trackRow(expandableRow(menu, _('Accessoires')));
  const titles = trackRow(expandableRow(menu, _('Titre')));
  const tricks = trackRow(expandableRow(menu, _('Tours')));
  const wake = menu.addAction(_('Réveiller'), () => owner.wake(critter));
  track(wake);
  const beds = trackRow(expandableRow(menu, _('Poser un lit')));
  for (const model of Object.keys(BED_LABELS)) beds.section.addAction(bedLabel(model), () => owner.dropBed(critter, model));
  track(menu.addAction(_('Brosser'), () => owner.brush(critter)));

  // Jouets adaptés : l'anneau flottant pour une espèce sans sol, les autres sinon.
  const groundless = !critter.supports(Locomotion.GROUND);
  const play = trackRow(expandableRow(menu, _('Jouer')));
  for (const kind of Object.keys(TOY_LABELS)) {
    if (toyFits(kind, groundless)) play.section.addAction(toyLabel(kind), () => owner.dropToy(kind, critter));
  }

  const rebuildAccessories = () => {
    accessories.section.removeAll();
    const worn = critter.accessory;
    const checked = (on, text) => (on ? `✓ ${text}` : text);
    accessories.section.addAction(checked(worn === null, _('Aucun')), () => owner.equip(critter, null));
    for (const { id, label } of owner.equippable()) {
      accessories.section.addAction(checked(worn === id, label), () => owner.equip(critter, id));
    }
  };

  // Titres gagnés (séries terminées, certaines bêtises) : un seul porté à la fois.
  const rebuildTitles = () => {
    titles.section.removeAll();
    const earned = owner.titles(critter);
    titles.setVisible(earned.length > 0 && critter.life.stage !== 'egg');
    const checked = (on, text) => (on ? `✓ ${text}` : text);
    titles.section.addAction(checked(critter.title === null, _('Aucun')), () => owner.setTitle(critter, null));
    for (const { id, title } of earned) {
      titles.section.addAction(checked(critter.title === id, title), () => owner.setTitle(critter, id));
    }
  };

  const rebuildTricks = () => {
    tricks.section.removeAll();
    const names = critter.config.tricks;
    tricks.setVisible(names.length > 0 && critter.life.stage !== 'egg');
    for (const name of names) {
      const trick = trickLabel(name);
      if (critter.tricks.isLearned(name)) {
        tricks.section.addAction(fmt(_('Faire : {trick}'), { trick }), () => owner.perform(critter, name));
      } else {
        const skill = Math.floor(critter.tricks.skill(name));
        tricks.section.addAction(fmt(_('Entraîner : {trick} ({skill} %)'), { trick, skill }), () => owner.train(critter, name));
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
