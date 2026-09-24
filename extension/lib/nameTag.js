// Étiquette de nom : s'affiche au-dessus de l'animal après une seconde de
// survol continu, et s'efface dès que le curseur le quitte. Non réactive, ajoutée à uiGroup sans addChrome : elle laisse
// passer les clics.

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const HOVER_DELAY_SECONDS = 1;
const GAP_PX = 4;

export class NameTag {
  constructor() {
    this._hovering = false;
    this._hoverTime = 0;
    this.actor = new St.Label({
      reactive: false,
      visible: false,
      style: 'background-color: rgba(0,0,0,0.7); color: white; border-radius: 6px; padding: 1px 7px; font-size: 9pt;',
    });
    Main.layoutManager.uiGroup.add_child(this.actor);
  }

  /** Le curseur entre sur l'animal (true) ou le quitte (false). */
  setHover(hovering) {
    this._hovering = hovering;
    if (!hovering) this._hoverTime = 0;
  }

  /**
   * @param {number} dt secondes
   * @param {string|null} name nom à afficher (null : rien)
   * @param {{x:number, y:number, width:number, height:number}} box rectangle du sprite à l'écran
   * @param {boolean} visible faux quand le sprite est masqué ou est un œuf
   */
  update(dt, name, box, visible) {
    if (this._hovering) this._hoverTime += dt;
    if (this._hoverTime < HOVER_DELAY_SECONDS || !name || !visible) {
      if (this.actor.visible) this.actor.hide();
      return;
    }
    if (this.actor.text !== name) this.actor.text = name;
    if (!this.actor.visible) this.actor.show();
    const [width, height] = this.actor.get_size();
    this.actor.set_position(
      Math.round(box.x + box.width / 2 - width / 2),
      Math.max(0, Math.round(box.y - height - GAP_PX)),
    );
  }

  destroy() {
    this.actor.destroy();
  }
}
