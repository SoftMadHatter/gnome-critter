// A critter's context menu (middle click): its name as a header, its
// actions (see critterActions.js), the laser pointer, and tidying up
// toys. Anchored on a small invisible actor repositioned above the
// critter on every opening (the critter's own actor is flipped and moved
// continuously).

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { buildCritterActions } from './critterActions.js';
import { Pager } from './menuWidgets.js';
import { _ } from '../core/i18n.js';
import { lifeSummary } from '../core/labels.js';

export class CritterMenu {
  /**
   * @param {import('../core/critter.js').Critter} critter
   * @param {{spriteSize: {width:number, height:number}}} pack
   * @param {object} owner the critter's actions (see critterActions.js) + setLaser, isLaser, hasToys, clearToys
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
    this._pager = new Pager(this.menu);
    const root = this._pager.root;
    this._actions = buildCritterActions(this._pager, root, critter, owner);

    this._laser = new PopupMenu.PopupSwitchMenuItem(_('Pointeur laser'), owner.isLaser());
    this._laser.connect('toggled', (_item, state) => owner.setLaser(state));
    root.content.addMenuItem(this._laser);
    this._tidy = root.content.addAction(_('Ranger les jouets'), () => owner.clearToys());
  }

  /** @param {number} spriteHeight the critter's displayed height (varies with its stage) */
  open(spriteHeight) {
    const title = this._owner.titleOf(this._critter);
    this._header.label.text = `${this._critter.name ?? _('Sans nom')}${title ? `, ${title}` : ''} — ${lifeSummary(this._critter.life)}`;
    if (!this.menu.isOpen) this._owner.noteContextMenuOpen(); // the Committee is counting
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
