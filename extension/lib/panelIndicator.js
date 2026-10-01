// Top-bar icon: critters' mood at a glance, and a short menu organized as
// "card + quick actions":
//   critter selector (if there are several), card (name, gauges),
//   four quick-action buttons, then rows opening pages (drill-down, so the
//   menu stays short on a small screen): Place…, the critter's own page,
//   Progress, Shop, Desktop; and "Settings…".

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { _, N_, ngettext, fmt } from '../core/i18n.js';
import { lifeSummary } from '../core/labels.js';
import { buildCritterActions, buildDropActions } from './critterActions.js';
import { Pager, stayAction, buttonRow, gaugeCell, gaugeRow, setEnabled, staticItem } from './menuWidgets.js';

const GAUGES = [
  ['satiety', N_('Satiété')],
  ['energy', N_('Énergie')],
  ['cleanliness', N_('Propreté')],
  ['stimulation', N_('Stimulation')],
  ['affection', N_('Affection')],
  ['relief', N_('Soulagement')],
  ['health', N_('Santé')],
];

const REFRESH_SECONDS = 2;

function moodIcon(mood) {
  if (mood >= 65) return 'face-smile-symbolic';
  if (mood >= 35) return 'face-plain-symbolic';
  return 'face-sad-symbolic';
}

export const CritterIndicator = GObject.registerClass(
  class CritterIndicator extends PanelMenu.Button {
    /**
     * @param {object} owner the Manager's API: getCritters, getPlayer, achievementSummary, shopList, buyAccessory, foods,
     *   dropFood, fillBowl, dropBed, dropBowl, dropToy, toyKinds, setLaser, isLaser, hasToys, clearToys, clearItems, openSettings, pet,
     *   quickFeed, and a critter's actions (rename, brush, train, perform, equip, equippable, wake)
     * @param {Gio.Settings} settings
     */
    _init(owner, settings) {
      super._init(0.5, 'Critter');
      this._owner = owner;
      this._settings = settings;
      this._selected = 0;
      this._actions = null;

      this._icon = new St.Icon({ icon_name: 'face-smile-symbolic', style_class: 'system-status-icon' });
      // Badge with the number of unread log announcements (hidden at 0).
      this._badge = new St.Label({ text: '', y_align: Clutter.ActorAlign.CENTER, style: 'font-weight: bold; font-size: 0.85em; padding-left: 2px;', visible: false });
      const box = new St.BoxLayout();
      box.add_child(this._icon);
      box.add_child(this._badge);
      this.add_child(box);

      this._buildMenu();
      this._rebuildCritterSection();

      this._settingsId = settings.connect('changed::vacation-mode', () => {
        this._vacation.setToggleState(settings.get_boolean('vacation-mode'));
      });
      this.menu.connect('open-state-changed', (_menu, open) => {
        if (!open) return;
        this._owner.noteMenuOpen(); // the Committee is counting (see the player's blunders)
        this._laser.setToggleState(this._owner.isLaser());
        this._tidy.setSensitive(this._owner.hasToys());
        this._actions.refresh();
        this._rebuildProgress();
        this.refresh();
      });
      this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
        this.refresh();
        return GLib.SOURCE_CONTINUE;
      });
      this.refresh();
    }

    _critters() {
      return this._owner.getCritters();
    }

    _critter() {
      const critters = this._critters();
      return critters[Math.min(this._selected, critters.length - 1)];
    }

    _buildMenu() {
      const critters = this._critters();
      this._pager = new Pager(this.menu);
      const root = this._pager.root.content;

      // Critter selector (a single critter: no selector).
      this._selector = null;
      if (critters.length > 1) {
        this._selector = buttonRow(
          critters.map((critter, index) => ({ label: critter.name ?? `#${index + 1}`, onClick: () => this._select(index) })),
        );
        root.addMenuItem(this._selector.item);
      }

      // Card: name, state, gauges in two columns.
      this._title = new St.Label({ text: '', style: 'font-weight: bold;' });
      root.addMenuItem(staticItem(this._title));
      this._gauges = {};
      for (let i = 0; i < GAUGES.length; i += 2) {
        const cells = GAUGES.slice(i, i + 2).map(([key, label]) => {
          const cell = gaugeCell(_(label));
          this._gauges[key] = cell;
          return cell;
        });
        root.addMenuItem(gaugeRow(cells[0], cells[1]));
      }

      // Quick actions: they don't close the menu, they can be chained.
      this._quick = buttonRow([
        { label: _('Nourrir'), onClick: () => this._owner.quickFeed(this._critter()) },
        // The first suitable toy: the ball, or the floating ring for fish.
        { label: _('Jouer'), onClick: () => this._owner.dropToy(this._owner.toyKinds()[0] ?? 'ball', this._critter()) },
        { label: _('Brosser'), onClick: () => this._owner.brush(this._critter()) },
        { label: _('Câlin'), onClick: () => this._owner.pet(this._critter()) },
      ]);
      root.addMenuItem(this._quick.item);

      // Pages: objects to place (at the cursor), the chosen critter, progress, shop, desktop.
      this._place = this._pager.row(this._pager.root, _('Poser…'));
      buildDropActions(this._pager, this._place, this._owner, undefined, () => this._afterAction());
      this._me = this._pager.row(this._pager.root, _('Sans nom'));
      this._progress = this._pager.row(this._pager.root, _('Progrès'));
      this._achievements = this._progress.section.addAction(_('Succès'), () => this._owner.openProgress(this._critter(), 'achievements'));
      this._progress.section.addAction(_('Statistiques'), () => this._owner.openProgress(this._critter(), 'stats'));
      this._journal = this._progress.section.addAction(_('Journal'), () => this._owner.openProgress(this._critter(), 'journal'));
      this._shop = this._pager.row(this._pager.root, _('Boutique'));
      this._desk = this._pager.row(this._pager.root, _('Bureau'));
      this._buildDesk(this._desk.section);

      root.addAction(_('Réglages…'), () => this._owner.openSettings());
    }

    /** "Desktop": things that concern every critter and the desktop's objects. */
    _buildDesk(section) {
      this._vacation = new PopupMenu.PopupSwitchMenuItem(_('Mode vacances'), this._settings.get_boolean('vacation-mode'));
      this._vacation.connect('toggled', (_item, state) => this._settings.set_boolean('vacation-mode', state));
      section.addMenuItem(this._vacation);
      this._laser = new PopupMenu.PopupSwitchMenuItem(_('Pointeur laser'), this._owner.isLaser());
      this._laser.connect('toggled', (_item, state) => this._owner.setLaser(state));
      section.addMenuItem(this._laser);
      stayAction(section, _('Nettoyer les traces'), () => this._owner.cleanAll());
      this._tidy = stayAction(section, _('Ranger les jouets'), () => {
        this._owner.clearToys();
        this._afterAction();
      });
      stayAction(section, _('Retirer les objets'), () => {
        this._owner.clearItems();
        this._afterAction();
      });
    }

    /** After an action (the menu stays open): what depends on the objects on the desktop. */
    _afterAction() {
      this._tidy.setSensitive(this._owner.hasToys());
    }

    _select(index) {
      this._selected = index;
      this._rebuildCritterSection();
      this._actions.refresh();
      this._rebuildProgress();
      this.refresh();
    }

    /** The chosen critter's page: its actions (the progress page covers achievements and statistics). */
    _rebuildCritterSection() {
      this._pager.clearPage(this._me.page);
      this._actions = buildCritterActions(this._pager, this._me.page, this._critter(), this._owner, { drops: false, brush: false, onAction: () => this._afterAction() });
    }

    /** Rebuilds achievements, shop, and log rows (on menu open or after a purchase). */
    _rebuildProgress() {
      const player = this._owner.getPlayer();
      this._shop.setPageTitle(fmt(_('Pièces : {coins}'), { coins: player.coins }));

      const critter = this._critter();
      const { done, total } = this._owner.achievementSummary(critter);
      this._achievements.label.text = fmt(_('Succès ({done}/{total})'), { done, total });
      this._updateUnread();

      this._shop.section.removeAll();
      for (const { id, label, price, owned, free } of this._owner.shopList()) {
        if (owned || free) {
          const text = owned ? `✓ ${label}` : fmt(_('{accessory} (gratuit de saison)'), { accessory: label });
          this._shop.section.addMenuItem(new PopupMenu.PopupMenuItem(text, { reactive: false, can_focus: false }));
        } else {
          stayAction(this._shop.section, fmt(_('Acheter : {accessory} ({price} pièces)'), { accessory: label, price }), () => {
            this._owner.buyAccessory(id);
            // The list is rebuilt, the clicked item included: once its handler is over.
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
              this._rebuildProgress();
              return GLib.SOURCE_REMOVE;
            });
          });
        }
      }
    }

    /** Panel badge and "Log" row: number of unread announcements. */
    _updateUnread() {
      const unread = this._owner.unreadCount();
      this._badge.text = String(unread);
      this._badge.visible = unread > 0;
      this._progress.setTitle(unread > 0 ? `${_('Progrès')} ●` : _('Progrès'));
      this._journal.label.text = unread > 0
        ? fmt(ngettext('Journal ({count} non lu)', 'Journal ({count} non lus)', unread), { count: unread })
        : _('Journal');
    }

    refresh() {
      this._updateUnread();
      const critters = this._critters();
      if (critters.length > 0) {
        const moodSum = critters.reduce((sum, c) => sum + c.needs.mood, 0);
        this._icon.icon_name = moodIcon(moodSum / critters.length);
      }
      if (!this.menu.isOpen) return;

      const critter = this._critter();
      if (this._selector) {
        this._selector.buttons.forEach((button, index) => {
          button.label = critters[index].name ?? `#${index + 1}`;
          button.style = index === this._selected ? 'font-weight: bold;' : '';
        });
      }
      this._me.setTitle(critter.name ?? _('Sans nom'));
      this._me.setPageTitle(critter.name ?? _('Sans nom'));
      const title = this._owner.titleOf(critter);
      this._title.text = `${critter.name ?? _('Sans nom')}${title ? `, ${title}` : ''} — ${lifeSummary(critter.life)}`;
      for (const [key] of GAUGES) this._gauges[key].update(critter.needs.values[key]);

      // Egg: nothing works; hibernation: only "Pet" (it wakes the critter).
      const egg = critter.life.stage === 'egg';
      const asleep = critter.life.hibernating;
      const [feed, play, brush, pet] = this._quick.buttons;
      for (const button of [feed, play, brush]) setEnabled(button, !egg && !asleep);
      setEnabled(pet, !egg);
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

/** Adds the indicator to the top bar. */
export function addIndicator(owner, settings, uuid) {
  const indicator = new CritterIndicator(owner, settings);
  Main.panel.addToStatusArea(uuid, indicator);
  return indicator;
}
