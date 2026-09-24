// Actions propres à un animal, partagées par son menu contextuel (clic milieu)
// et par son bloc dans le menu de l'icône de barre : renommer, donner à
// manger, gamelle, lit, brosser, jouer, tours, accessoires, réveiller.
// Chaque action vise l'animal passé en paramètre.


import { foodLabel, TOY_LABELS } from './itemActor.js';
import { expandableRow } from './menuWidgets.js';
import { TRICKS } from '../core/tricks.js';

const TRICK_LABELS = Object.fromEntries(Object.entries(TRICKS).map(([name, def]) => [name, def.label]));

/**
 * Ajoute les actions d'un animal à `menu` (un PopupMenu ou un PopupMenuSection).
 * @param {PopupMenu.PopupMenuBase} menu
 * @param {import('../core/critter.js').Critter} critter
 * @param {{rename: Function, dropFood: Function, fillBowl: Function, dropBed: Function, dropToy: Function, brush: Function, train: Function, perform: Function, equip: Function, equippable: Function, wake: Function}} owner
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

  const foods = Object.entries(critter.config.needsDiet).sort((a, b) => b[1] - a[1]);
  if (foods.length > 0) {
    const feed = trackRow(expandableRow(menu, 'Donner à manger'));
    const bowl = trackRow(expandableRow(menu, 'Remplir la gamelle'));
    foods.forEach(([kind], index) => {
      const favorite = index === 0 ? ' (préféré)' : '';
      feed.section.addAction(`${foodLabel(kind)}${favorite}`, () => owner.dropFood(kind, critter));
      bowl.section.addAction(`${foodLabel(kind, 5)}${favorite}`, () => owner.fillBowl(kind, critter));
    });
  }

  const accessories = trackRow(expandableRow(menu, 'Accessoires'));
  const tricks = trackRow(expandableRow(menu, 'Tours'));
  const wake = menu.addAction('Réveiller', () => owner.wake(critter));
  track(wake);
  track(menu.addAction('Poser un lit', () => owner.dropBed(critter)));
  track(menu.addAction('Brosser', () => owner.brush(critter)));

  const play = trackRow(expandableRow(menu, 'Jouer'));
  for (const [kind, label] of Object.entries(TOY_LABELS)) {
    play.section.addAction(label, () => owner.dropToy(kind, critter));
  }

  const rebuildAccessories = () => {
    accessories.section.removeAll();
    const worn = critter.accessory;
    accessories.section.addAction(worn === null ? '✓ Aucun' : 'Aucun', () => owner.equip(critter, null));
    for (const { id, label } of owner.equippable()) {
      accessories.section.addAction(worn === id ? `✓ ${label}` : label, () => owner.equip(critter, id));
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
        rebuildTricks();
      }
    },
  };
}
