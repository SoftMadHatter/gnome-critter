// Étiquette de nom (et titre porté, en petit dessous) : s'affiche au-dessus
// de l'animal après une seconde de survol continu, et s'efface dès que le
// curseur le quitte. Non réactive, ajoutée à uiGroup sans addChrome : elle
// laisse passer les clics.

import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const HOVER_DELAY_SECONDS = 1;
const GAP_PX = 4;

export class NameTag {
  constructor() {
    this._hovering = false;
    this._hoverTime = 0;
    this._markup = null;
    this.actor = new St.Label({
      reactive: false,
      visible: false,
      style: 'background-color: rgba(0,0,0,0.7); color: white; border-radius: 6px; padding: 1px 7px; font-size: 9pt;',
    });
    this.actor.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
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
   * @param {string|null} title titre porté, affiché en petit sous le nom (null : aucun)
   * @param {{x:number, y:number, width:number, height:number}} box rectangle du sprite à l'écran
   * @param {boolean} visible faux quand le sprite est masqué ou est un œuf
   */
  update(dt, name, title, box, visible) {
    if (this._hovering) this._hoverTime += dt;
    if (this._hoverTime < HOVER_DELAY_SECONDS || !name || !visible) {
      if (this.actor.visible) this.actor.hide();
      return;
    }
    const escape = (text) => GLib.markup_escape_text(text, -1);
    const markup = title ? `${escape(name)}\n<small><i>${escape(title)}</i></small>` : escape(name);
    if (markup !== this._markup) {
      this._markup = markup;
      this.actor.clutter_text.set_markup(markup);
    }
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
