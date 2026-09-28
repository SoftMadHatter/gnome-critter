// Name tag (and worn title, small underneath): shown above the critter
// after one second of continuous hover, and cleared as soon as the
// cursor leaves it. Non-reactive, added to uiGroup without addChrome: it
// lets clicks through.

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

  /** The cursor enters the critter (true) or leaves it (false). */
  setHover(hovering) {
    this._hovering = hovering;
    if (!hovering) this._hoverTime = 0;
  }

  /**
   * @param {number} dt seconds
   * @param {string|null} name name to display (null: nothing)
   * @param {string|null} title worn title, shown small under the name (null: none)
   * @param {{x:number, y:number, width:number, height:number}} box the sprite's on-screen rectangle
   * @param {boolean} visible false when the sprite is hidden or is an egg
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
