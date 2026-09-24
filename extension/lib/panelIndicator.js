// Icône dans la barre supérieure : humeur des animaux d'un coup d'oeil, et un
// menu court organisé en « fiche + actions rapides » :
//   sélecteur d'animal (s'il y en a plusieurs), fiche (nom, jauges),
//   quatre boutons d'action rapide, puis des rangées repliables (Plus…,
//   Bureau…, Pièces) et « Réglages… ».

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { foodLabel, TOY_LABELS, BED_LABELS, BOWL_LABELS } from './itemActor.js';
import { isBowlFood } from '../core/items.js';
import { buildCritterActions } from './critterActions.js';
import { lifeSummary } from './lifeLabels.js';
import { buttonRow, expandableRow, gaugeCell, gaugeRow, setEnabled, staticItem } from './menuWidgets.js';

const GAUGES = [
  ['satiety', 'Satiété'],
  ['energy', 'Énergie'],
  ['cleanliness', 'Propreté'],
  ['stimulation', 'Stimulation'],
  ['affection', 'Affection'],
  ['relief', 'Soulagement'],
  ['health', 'Santé'],
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
     * @param {object} owner API du Manager : getCritters, getPlayer, achievementsFor, shopList, buyAccessory, foods,
     *   dropFood, fillBowl, dropBed, dropBowl, dropToy, toyKinds, setLaser, isLaser, hasToys, clearToys, clearItems, openSettings, pet,
     *   quickFeed, et les actions d'un animal (rename, brush, train, perform, equip, equippable, wake)
     * @param {Gio.Settings} settings
     */
    _init(owner, settings) {
      super._init(0.5, 'Scamper');
      this._owner = owner;
      this._settings = settings;
      this._selected = 0;
      this._actions = null;
      this._sections = [];

      this._icon = new St.Icon({ icon_name: 'face-smile-symbolic', style_class: 'system-status-icon' });
      this.add_child(this._icon);

      this._buildMenu();
      this._rebuildCritterSection();

      this._settingsId = settings.connect('changed::vacation-mode', () => {
        this._vacation.setToggleState(settings.get_boolean('vacation-mode'));
      });
      this.menu.connect('open-state-changed', (_menu, open) => {
        if (!open) return;
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

      // Sélecteur d'animal (un seul animal : pas de sélecteur).
      this._selector = null;
      if (critters.length > 1) {
        this._selector = buttonRow(
          critters.map((critter, index) => ({ label: critter.name ?? `#${index + 1}`, onClick: () => this._select(index) })),
        );
        this.menu.addMenuItem(this._selector.item);
      }

      // Fiche : nom, état, jauges sur deux colonnes.
      this._title = new St.Label({ text: '', style: 'font-weight: bold;' });
      this.menu.addMenuItem(staticItem(this._title));
      this._gauges = {};
      for (let i = 0; i < GAUGES.length; i += 2) {
        const cells = GAUGES.slice(i, i + 2).map(([key, label]) => {
          const cell = gaugeCell(label);
          this._gauges[key] = cell;
          return cell;
        });
        this.menu.addMenuItem(gaugeRow(cells[0], cells[1]));
      }

      // Actions rapides : elles ne referment pas le menu, on peut les enchaîner.
      this._quick = buttonRow([
        { label: 'Nourrir', onClick: () => this._owner.quickFeed(this._critter()) },
        // Le premier jouet adapté : la balle, ou l'anneau flottant pour le poisson.
        { label: 'Jouer', onClick: () => this._owner.dropToy(this._owner.toyKinds()[0] ?? 'ball', this._critter()) },
        { label: 'Brosser', onClick: () => this._owner.brush(this._critter()) },
        { label: 'Câlin', onClick: () => this._owner.pet(this._critter()) },
      ]);
      this.menu.addMenuItem(this._quick.item);

      // Rangées repliables : une seule ouverte à la fois.
      this._more = expandableRow(this.menu, 'Plus…', (open) => this._toggle(this._more, open));
      this._desk = expandableRow(this.menu, 'Bureau…', (open) => this._toggle(this._desk, open));
      this._progress = expandableRow(this.menu, 'Pièces', (open) => this._toggle(this._progress, open));
      this._sections = [this._more, this._desk, this._progress];
      this._buildDesk(this._desk.section);
      this._shop = expandableRow(this._progress.section, 'Boutique');
      this._journal = this._progress.section.addAction('Journal', () => this._owner.openProgress(this._critter(), 'journal'));

      this.menu.addAction('Réglages…', () => this._owner.openSettings());
    }

    /** « Bureau… » : ce qui concerne tout le monde ; les objets tombent à la position du curseur. */
    _buildDesk(section) {
      this._vacation = new PopupMenu.PopupSwitchMenuItem('Mode vacances', this._settings.get_boolean('vacation-mode'));
      this._vacation.connect('toggled', (_item, state) => this._settings.set_boolean('vacation-mode', state));
      section.addMenuItem(this._vacation);
      this._laser = new PopupMenu.PopupSwitchMenuItem('Pointeur laser', this._owner.isLaser());
      this._laser.connect('toggled', (_item, state) => this._owner.setLaser(state));
      section.addMenuItem(this._laser);

      const foods = this._owner.foods();
      if (foods.length > 0) {
        const feed = expandableRow(section, 'Poser de la nourriture');
        for (const kind of foods) feed.section.addAction(foodLabel(kind), () => this._owner.dropFood(kind));
      }
      const bowlFoods = foods.filter(isBowlFood); // la nourriture flottante ne va pas dans une gamelle
      if (bowlFoods.length > 0) {
        const bowl = expandableRow(section, 'Remplir une gamelle');
        for (const kind of bowlFoods) bowl.section.addAction(foodLabel(kind, 5), () => this._owner.fillBowl(kind));
        const bowls = expandableRow(section, 'Poser une gamelle');
        for (const [model, label] of Object.entries(BOWL_LABELS)) bowls.section.addAction(label, () => this._owner.dropBowl(null, model));
      }
      const beds = expandableRow(section, 'Poser un lit');
      for (const [model, label] of Object.entries(BED_LABELS)) beds.section.addAction(label, () => this._owner.dropBed(null, model));
      section.addAction('Poser une litière', () => this._owner.dropLitter());
      section.addAction('Nettoyer les traces', () => this._owner.cleanAll());
      if (this._owner.preyKinds().length > 0) section.addAction('Lâcher une proie', () => this._owner.dropPrey());
      if (this._owner.plantKinds().length > 0) section.addAction('Poser une plante', () => this._owner.dropPlant());
      const toys = expandableRow(section, 'Poser un jouet');
      for (const kind of this._owner.toyKinds()) toys.section.addAction(TOY_LABELS[kind], () => this._owner.dropToy(kind));
      this._tidy = section.addAction('Ranger les jouets', () => this._owner.clearToys());
      section.addAction('Retirer les objets', () => this._owner.clearItems());
    }

    _toggle(row, open) {
      for (const other of this._sections) other.setOpen(other === row && open);
    }

    _select(index) {
      this._selected = index;
      this._rebuildCritterSection();
      this._actions.refresh();
      this._rebuildProgress();
      this.refresh();
    }

    /** « Plus… » : les actions de l'animal choisi, plus ses succès et statistiques. */
    _rebuildCritterSection() {
      const section = this._more.section;
      section.removeAll();
      this._actions = buildCritterActions(section, this._critter(), this._owner);
      // Le détail s'ouvre dans une fenêtre à part : le menu ne montre que le nombre de succès.
      this._achievements = section.addAction('Succès', () => this._owner.openProgress(this._critter(), 'achievements'));
      section.addAction('Statistiques', () => this._owner.openProgress(this._critter(), 'stats'));
    }

    /** Recrée succès, statistiques, boutique et journal (à l'ouverture du menu ou après un achat). */
    _rebuildProgress() {
      const player = this._owner.getPlayer();
      this._progress.setTitle(`Pièces : ${player.coins}`);

      const critter = this._critter();
      const list = this._owner.achievementsFor(critter);
      this._achievements.label.text = `Succès (${list.filter((a) => a.unlocked).length}/${list.length})`;

      this._shop.section.removeAll();
      for (const { id, label, price, owned, free } of this._owner.shopList()) {
        if (owned || free) {
          const text = owned ? `✓ ${label}` : `${label} (gratuit de saison)`;
          this._shop.section.addMenuItem(new PopupMenu.PopupMenuItem(text, { reactive: false, can_focus: false }));
        } else {
          this._shop.section.addAction(`Acheter : ${label} (${price} pièces)`, () => {
            this._owner.buyAccessory(id);
            this._rebuildProgress();
          });
        }
      }
    }

    refresh() {
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
      this._title.text = `${critter.name ?? 'Sans nom'} — ${lifeSummary(critter.life)}`;
      for (const [key] of GAUGES) this._gauges[key].update(critter.needs.values[key]);

      // Œuf : rien ne marche ; hibernation : seul « Câlin » (il réveille).
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

/** Ajoute l'indicateur à la barre du haut. */
export function addIndicator(owner, settings, uuid) {
  const indicator = new CritterIndicator(owner, settings);
  Main.panel.addToStatusArea(uuid, indicator);
  return indicator;
}
