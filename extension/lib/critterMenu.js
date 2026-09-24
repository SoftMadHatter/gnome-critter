// Menu contextuel d'un animal (clic milieu) : donner à manger, gamelle, lit.
// Ancré sur un petit acteur invisible replacé au-dessus de l'animal à chaque
// ouverture (l'acteur du critter lui-même est retourné et déplacé en continu).

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { FOOD_LABELS } from './itemActor.js';

export class CritterMenu {
  /**
   * @param {import('../core/critter.js').Critter} critter
   * @param {{spriteSize: {width:number, height:number}}} pack
   * @param {{dropFood: Function, fillBowl: Function, dropBed: Function}} owner
   */
  constructor(critter, pack, owner) {
    this._critter = critter;
    this._pack = pack;

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
        const label = `${FOOD_LABELS[kind] ?? kind}${index === 0 ? ' (préféré)' : ''}`;
        feed.menu.addAction(label, () => owner.dropFood(kind, critter));
        bowl.menu.addAction(label, () => owner.fillBowl(kind, critter));
      });
      this.menu.addMenuItem(feed);
      this.menu.addMenuItem(bowl);
    }
    this.menu.addAction('Poser un lit', () => owner.dropBed(critter));
  }

  open() {
    const size = this._pack.spriteSize;
    this._anchor.set_position(Math.round(this._critter.x), Math.round(this._critter.y - size.height));
    this.menu.toggle();
  }

  destroy() {
    this.menu.close(false);
    this._manager.removeMenu?.(this.menu);
    this.menu.destroy();
    this._anchor.destroy();
  }
}
