// Menu contextuel d'un animal (clic milieu) : son nom en en-tête, ses actions
// (voir critterActions.js), le pointeur laser et le rangement des jouets.
// Ancré sur un petit acteur invisible replacé au-dessus de l'animal à chaque
// ouverture (l'acteur du critter lui-même est retourné et déplacé en continu).

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { buildCritterActions } from './critterActions.js';
import { _ } from '../core/i18n.js';
import { lifeSummary } from '../core/labels.js';

export class CritterMenu {
  /**
   * @param {import('../core/critter.js').Critter} critter
   * @param {{spriteSize: {width:number, height:number}}} pack
   * @param {object} owner actions de l'animal (voir critterActions.js) + setLaser, isLaser, hasToys, clearToys
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

    this._header = new PopupMenu.PopupMenuItem('', { reactive: false, can_focus: false });
    this.menu.addMenuItem(this._header);
    this._actions = buildCritterActions(this.menu, critter, owner);

    this._laser = new PopupMenu.PopupSwitchMenuItem(_('Pointeur laser'), owner.isLaser());
    this._laser.connect('toggled', (_item, state) => owner.setLaser(state));
    this.menu.addMenuItem(this._laser);
    this._tidy = this.menu.addAction(_('Ranger les jouets'), () => owner.clearToys());
  }

  /** @param {number} spriteHeight hauteur affichée de l'animal (varie avec son stade) */
  open(spriteHeight) {
    const title = this._owner.titleOf(this._critter);
    this._header.label.text = `${this._critter.name ?? _('Sans nom')}${title ? `, ${title}` : ''} — ${lifeSummary(this._critter.life)}`;
    if (!this.menu.isOpen) this._owner.noteContextMenuOpen(); // le Comité compte
    this._actions.refresh();
    this._laser.setToggleState(this._owner.isLaser());
    this._tidy.setSensitive(this._owner.hasToys());
    this._anchor.set_position(Math.round(this._critter.x), Math.round(this._critter.y - spriteHeight));
    this.menu.toggle();
  }

  destroy() {
    this.menu.close(false);
    this._manager.removeMenu?.(this.menu);
    this.menu.destroy();
    this._anchor.destroy();
  }
}
