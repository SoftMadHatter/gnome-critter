// Menu contextuel d'un animal (clic milieu) : donner à manger, gamelle, lit.
// Ancré sur un petit acteur invisible replacé au-dessus de l'animal à chaque
// ouverture (l'acteur du critter lui-même est retourné et déplacé en continu).

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { foodLabel, TOY_LABELS } from './itemActor.js';
import { TRICKS } from '../core/tricks.js';

const TRICK_LABELS = Object.fromEntries(Object.entries(TRICKS).map(([name, def]) => [name, def.label]));

export class CritterMenu {
  /**
   * @param {import('../core/critter.js').Critter} critter
   * @param {{spriteSize: {width:number, height:number}}} pack
   * @param {{dropFood: Function, fillBowl: Function, dropBed: Function, dropToy: Function, wake: Function, train: Function, perform: Function, equip: Function, equippable: Function, brush: Function, setLaser: Function, isLaser: Function, hasToys: Function, clearToys: Function}} owner
   */
  constructor(critter, pack, owner) {
    this._critter = critter;
    this._pack = pack;
    this._owner = owner;

    this._anchor = new St.Widget({ width: 1, height: 1, reactive: false });
    Main.uiGroup.add_child(this._anchor);

    this.menu = new PopupMenu.PopupMenu(this._anchor, 0.5, St.Side.BOTTOM);
    Main.uiGroup.add_child(this.menu.actor);
    this.menu.actor.hide();
    this._manager = new PopupMenu.PopupMenuManager(this._anchor);
    this._manager.addMenu(this.menu);

    const foods = Object.entries(critter.config.needsDiet).sort((a, b) => b[1] - a[1]);
    if (foods.length > 0) {
      const feed = new PopupMenu.PopupSubMenuMenuItem('Donner à manger');
      const bowl = new PopupMenu.PopupSubMenuMenuItem('Remplir la gamelle');
      foods.forEach(([kind], index) => {
        const favorite = index === 0 ? ' (préféré)' : '';
        feed.menu.addAction(`${foodLabel(kind)}${favorite}`, () => owner.dropFood(kind, critter));
        bowl.menu.addAction(`${foodLabel(kind, 5)}${favorite}`, () => owner.fillBowl(kind, critter));
      });
      this.menu.addMenuItem(feed);
      this.menu.addMenuItem(bowl);
    }
    this._accessories = new PopupMenu.PopupSubMenuMenuItem('Accessoires');
    this.menu.addMenuItem(this._accessories);
    this._tricks = new PopupMenu.PopupSubMenuMenuItem('Tours');
    this.menu.addMenuItem(this._tricks);
    this._wake = this.menu.addAction('Réveiller', () => owner.wake(critter));
    this.menu.addAction('Poser un lit', () => owner.dropBed(critter));

    this.menu.addAction('Brosser', () => owner.brush(critter));
    const play = new PopupMenu.PopupSubMenuMenuItem('Jouer');
    for (const [kind, label] of Object.entries(TOY_LABELS)) {
      play.menu.addAction(label, () => owner.dropToy(kind, critter));
    }
    this.menu.addMenuItem(play);
    this._laser = new PopupMenu.PopupSwitchMenuItem('Pointeur laser', owner.isLaser());
    this._laser.connect('toggled', (_item, state) => owner.setLaser(state));
    this.menu.addMenuItem(this._laser);
    this._tidy = this.menu.addAction('Ranger les jouets', () => owner.clearToys());
  }

  /** @param {number} spriteHeight hauteur affichée de l'animal (varie avec son stade) */
  open(spriteHeight) {
    this._wake.actor.visible = this._critter.life.hibernating;
    this._rebuildAccessories();
    this._rebuildTricks();
    this._laser.setToggleState(this._owner.isLaser());
    this._tidy.setSensitive(this._owner.hasToys());
    this._anchor.set_position(Math.round(this._critter.x), Math.round(this._critter.y - spriteHeight));
    this.menu.toggle();
  }

  /** Accessoires que l'animal peut porter (achetés ou gratuits de saison), le porté marqué. */
  _rebuildAccessories() {
    const menu = this._accessories.menu;
    menu.removeAll();
    const worn = this._critter.accessory;
    menu.addAction(worn === null ? '✓ Aucun' : 'Aucun', () => this._owner.equip(this._critter, null));
    for (const { id, label } of this._owner.equippable()) {
      menu.addAction(worn === id ? `✓ ${label}` : label, () => this._owner.equip(this._critter, id));
    }
  }

  /** Tours de l'espèce : entraîner (avec la maîtrise) ; « Faire » une fois appris. */
  _rebuildTricks() {
    const menu = this._tricks.menu;
    menu.removeAll();
    const names = this._critter.config.tricks;
    this._tricks.actor.visible = names.length > 0;
    for (const name of names) {
      const label = TRICK_LABELS[name] ?? name;
      const skill = Math.floor(this._critter.tricks.skill(name));
      if (this._critter.tricks.isLearned(name)) {
        menu.addAction(`Faire : ${label}`, () => this._owner.perform(this._critter, name));
      } else {
        menu.addAction(`Entraîner : ${label} (${skill} %)`, () => this._owner.train(this._critter, name));
      }
    }
  }

  destroy() {
    this.menu.close(false);
    this._manager.removeMenu?.(this.menu);
    this.menu.destroy();
    this._anchor.destroy();
  }
}
