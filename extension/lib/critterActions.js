// Actions specific to a critter, shared by its context menu (middle click)
// and by its page in the tray icon menu: rename, accessories, titles,
// tricks, wake up, brush, and the "Place" page (food, bowl, bed, toys...).
// Every action targets the critter passed as a parameter.

import { _, fmt } from '../core/i18n.js';
import { foodLabel, toyLabel, bedLabel, bowlLabel, TOY_LABELS, BED_LABELS, BOWL_LABELS } from '../core/labels.js';
import { trickLabel } from '../core/tricks.js';
import { FOODS, isBowlFood, toyFits } from '../core/items.js';
import { Locomotion } from '../core/critter.js';

/** A critter's diet foods, favorite first (plants are placed separately). */
function dietFoods(critter) {
  return Object.entries(critter.config.needsDiet)
    .filter(([kind]) => FOODS[kind])
    .sort((a, b) => b[1] - a[1])
    .map(([kind]) => kind);
}

/**
 * Fills a "Place" page: food, bowls, bed, toys, and, for the whole desktop,
 * litter, plant, and prey. With a critter, objects fall next to it and the
 * choices fit its species; without, they fall at the cursor's position.
 * @param {import('./menuWidgets.js').Pager} pager
 * @param {{page: object}} row the "Place" row
 * @param {object} owner the Manager's API (foods, toyKinds, preyKinds, plantKinds, dropFood, fillBowl, dropBowl, dropBed, dropToy, dropLitter, dropPrey, dropPlant)
 * @param {import('../core/critter.js').Critter} [critter]
 */
export function buildDropActions(pager, row, owner, critter) {
  const page = row.page;
  const add = (title) => pager.row(page, title).section;
  const foods = critter ? dietFoods(critter) : owner.foods();
  const withFavorite = (kind, text) => (critter && kind === foods[0] ? fmt(_('{food} (préféré)'), { food: text }) : text);
  const target = critter ?? undefined;

  if (foods.length > 0) {
    const feed = add(_('Nourriture'));
    for (const kind of foods) feed.addAction(withFavorite(kind, foodLabel(kind)), () => owner.dropFood(kind, target));
  }
  const bowlFoods = foods.filter(isBowlFood); // floating food doesn't go in a bowl
  if (bowlFoods.length > 0) {
    const bowls = add(_('Gamelle'));
    for (const model of Object.keys(BOWL_LABELS)) bowls.addAction(bowlLabel(model), () => owner.dropBowl(critter ?? null, model));
    const fill = add(_('Remplir une gamelle'));
    for (const kind of bowlFoods) fill.addAction(withFavorite(kind, foodLabel(kind, 5)), () => owner.fillBowl(kind, target));
  }
  const beds = add(_('Lit'));
  for (const model of Object.keys(BED_LABELS)) beds.addAction(bedLabel(model), () => owner.dropBed(critter ?? null, model));

  // The floating ring for a groundless species, the other toys otherwise.
  const toys = add(_('Jouet'));
  const kinds = critter
    ? Object.keys(TOY_LABELS).filter((kind) => toyFits(kind, !critter.supports(Locomotion.GROUND)))
    : owner.toyKinds();
  for (const kind of kinds) toys.addAction(toyLabel(kind), () => owner.dropToy(kind, target));

  if (!critter) {
    page.content.addAction(_('Litière'), () => owner.dropLitter());
    if (owner.plantKinds().length > 0) page.content.addAction(_('Plante'), () => owner.dropPlant());
    if (owner.preyKinds().length > 0) page.content.addAction(_('Proie'), () => owner.dropPrey());
  }
}

/**
 * Adds a critter's actions to a page.
 * @param {import('./menuWidgets.js').Pager} pager
 * @param {object} page the page receiving them
 * @param {import('../core/critter.js').Critter} critter
 * @param {{rename: Function, brush: Function, train: Function, perform: Function, equip: Function, equippable: Function, titles: Function, setTitle: Function, wake: Function}} owner
 *   (and the drop actions, see buildDropActions)
 * @param {{drops?: boolean, brush?: boolean}} [options] `drops`: the "Place" row (next to the critter);
 *   `brush`: a "Brush" action (the tray menu already has a quick button for it)
 * @returns {{refresh: () => void}} refresh: to call when the menu opens
 */
export function buildCritterActions(pager, page, critter, owner, { drops = true, brush = true } = {}) {
  /** Actions hidden for an egg (only "Rename" stays): menu items and rows. */
  const hiddenForEgg = [];
  const track = (item) => {
    hiddenForEgg.push({ setVisible: (visible) => (item.actor.visible = visible) });
    return item;
  };
  const trackRow = (row) => {
    hiddenForEgg.push(row);
    return row;
  };

  page.content.addAction(_('Renommer…'), () => owner.rename(critter));
  if (drops) {
    const place = pager.row(page, _('Poser…'));
    buildDropActions(pager, place, owner, critter);
    hiddenForEgg.push(place);
  }
  const accessories = trackRow(pager.row(page, _('Accessoires')));
  const titles = trackRow(pager.row(page, _('Titre')));
  const tricks = trackRow(pager.row(page, _('Tours')));
  const wake = page.content.addAction(_('Réveiller'), () => owner.wake(critter));
  track(wake);
  if (brush) track(page.content.addAction(_('Brosser'), () => owner.brush(critter)));

  const rebuildAccessories = () => {
    accessories.section.removeAll();
    const worn = critter.accessory;
    const checked = (on, text) => (on ? `✓ ${text}` : text);
    accessories.section.addAction(checked(worn === null, _('Aucun')), () => owner.equip(critter, null));
    for (const { id, label } of owner.equippable()) {
      accessories.section.addAction(checked(worn === id, label), () => owner.equip(critter, id));
    }
  };

  // Titles earned (completed series, some blunders): only one worn at a time.
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
