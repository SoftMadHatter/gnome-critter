// Icône dans la barre supérieure : humeur des animaux d'un coup d'oeil, et
// menu avec leurs jauges, le mode vacances et l'action « Nourrir ».

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { FOOD_LABELS } from './itemActor.js';

const GAUGES = [
  ['satiety', 'Satiété'],
  ['energy', 'Énergie'],
  ['cleanliness', 'Propreté'],
  ['stimulation', 'Stimulation'],
  ['affection', 'Affection'],
  ['health', 'Santé'],
];

const BAR_WIDTH = 120;
const REFRESH_SECONDS = 2;

function barColor(value) {
  if (value >= 60) return '#57c785';
  if (value >= 30) return '#e5c14b';
  return '#e05a5a';
}

function moodIcon(mood) {
  if (mood >= 65) return 'face-smile-symbolic';
  if (mood >= 35) return 'face-plain-symbolic';
  return 'face-sad-symbolic';
}

export const CritterIndicator = GObject.registerClass(
  class CritterIndicator extends PanelMenu.Button {
    /**
     * @param {{getCritters: () => import('../core/critter.js').Critter[], title: string, foods: () => string[], dropFood: Function, fillBowl: Function, dropBed: Function, clearItems: Function}} owner
     * @param {Gio.Settings} settings
     */
    _init(owner, settings) {
      super._init(0.5, 'Scamper');
      this._owner = owner;
      this._settings = settings;
      this._rows = []; // [{critter, bars: {gauge: {fill, rest, value}}}]

      this._icon = new St.Icon({ icon_name: 'face-smile-symbolic', style_class: 'system-status-icon' });
      this.add_child(this._icon);

      this._buildMenu();

      this._settingsId = settings.connect('changed::vacation-mode', () => {
        this._vacation.setToggleState(settings.get_boolean('vacation-mode'));
      });
      this.menu.connect('open-state-changed', (_menu, open) => {
        if (open) this.refresh();
      });
      this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
        this.refresh();
        return GLib.SOURCE_CONTINUE;
      });
      this.refresh();
    }

    _buildMenu() {
      const critters = this._owner.getCritters();
      critters.forEach((critter, index) => {
        const title = critters.length > 1 ? `${this._owner.title} ${index + 1}` : this._owner.title;
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(title));

        const bars = {};
        for (const [gauge, label] of GAUGES) {
          const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
          item.add_child(new St.Label({ text: label, x_expand: true, y_align: Clutter.ActorAlign.CENTER }));

          const box = new St.BoxLayout({ width: BAR_WIDTH, y_align: Clutter.ActorAlign.CENTER });
          const fill = new St.Widget({ height: 8, style: 'border-radius: 4px;' });
          const rest = new St.Widget({ height: 8, style: 'background-color: rgba(128,128,128,0.3); border-radius: 4px;' });
          box.add_child(fill);
          box.add_child(rest);
          item.add_child(box);
          this.menu.addMenuItem(item);
          bars[gauge] = { fill, rest };
        }
        this._rows.push({ critter, bars });
      });

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this._vacation = new PopupMenu.PopupSwitchMenuItem(
        'Mode vacances',
        this._settings.get_boolean('vacation-mode'),
      );
      this._vacation.connect('toggled', (_item, state) => this._settings.set_boolean('vacation-mode', state));
      this.menu.addMenuItem(this._vacation);

      const foods = this._owner.foods();
      if (foods.length > 0) {
        const feed = new PopupMenu.PopupSubMenuMenuItem('Donner à manger');
        const bowl = new PopupMenu.PopupSubMenuMenuItem('Remplir la gamelle');
        for (const kind of foods) {
          const label = FOOD_LABELS[kind] ?? kind;
          feed.menu.addAction(label, () => this._owner.dropFood(kind));
          bowl.menu.addAction(label, () => this._owner.fillBowl(kind));
        }
        this.menu.addMenuItem(feed);
        this.menu.addMenuItem(bowl);
      }
      this.menu.addAction('Poser un lit', () => this._owner.dropBed());
      this.menu.addAction('Retirer les objets', () => this._owner.clearItems());
    }

    refresh() {
      let moodSum = 0;
      for (const { critter, bars } of this._rows) {
        const values = critter.needs.values;
        moodSum += critter.needs.mood;
        if (!this.menu.isOpen) continue;
        for (const [gauge] of GAUGES) {
          const value = values[gauge];
          const filled = Math.round((BAR_WIDTH * value) / 100);
          bars[gauge].fill.set_width(filled);
          bars[gauge].fill.set_style(`background-color: ${barColor(value)}; border-radius: 4px;`);
          bars[gauge].rest.set_width(BAR_WIDTH - filled);
        }
      }
      if (this._rows.length > 0) this._icon.icon_name = moodIcon(moodSum / this._rows.length);
    }

    destroy() {
      if (this._timeoutId) {
        GLib.source_remove(this._timeoutId);
        this._timeoutId = null;
      }
      if (this._settingsId) {
        this._settings.disconnect(this._settingsId);
        this._settingsId = null;
      }
      super.destroy();
    }
  },
);

/** Ajoute l'indicateur à la barre du haut. */
export function addIndicator(owner, settings, uuid) {
  const indicator = new CritterIndicator(owner, settings);
  Main.panel.addToStatusArea(uuid, indicator);
  return indicator;
}
