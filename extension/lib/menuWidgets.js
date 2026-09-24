// Petits éléments de menu réutilisables pour le menu de l'icône de barre :
// rangée de boutons, jauge compacte, rangée repliable. Les boutons vivent dans
// un élément de menu non activable : un clic ne referme donc pas le menu (un
// simple PopupMenuItem le ferme), ce qui permet d'enchaîner les actions et de
// déplier des sections.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const BAR_WIDTH = 80;

export function barColor(value) {
  if (value >= 60) return '#57c785';
  if (value >= 30) return '#e5c14b';
  return '#e05a5a';
}

/** Élément de menu sans activation ni focus, qui contient un acteur libre. */
export function staticItem(child) {
  const item = new PopupMenu.PopupBaseMenuItem({ activate: false, can_focus: false });
  if (child) item.add_child(child);
  return item;
}

/**
 * Rangée de boutons.
 * @param {{label: string, onClick: () => void}[]} buttons
 * @returns {{item: PopupMenu.PopupBaseMenuItem, buttons: St.Button[]}}
 */
export function buttonRow(buttons) {
  const box = new St.BoxLayout({ x_expand: true, style: 'spacing: 6px;' });
  const widgets = buttons.map(({ label, onClick }) => {
    const button = new St.Button({ label, style_class: 'button', x_expand: true, can_focus: true });
    button.connect('clicked', onClick);
    box.add_child(button);
    return button;
  });
  return { item: staticItem(box), buttons: widgets };
}

/** Active ou grise un bouton. */
export function setEnabled(button, enabled) {
  button.reactive = enabled;
  button.can_focus = enabled;
  button.opacity = enabled ? 255 : 110;
}

/**
 * Jauge compacte : libellé et barre colorée (deux jauges par ligne).
 * @returns {{actor: St.BoxLayout, update: (value: number) => void}}
 */
export function gaugeCell(label) {
  const box = new St.BoxLayout({ x_expand: true, style: 'spacing: 6px;' });
  box.add_child(new St.Label({ text: label, x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
  const bar = new St.BoxLayout({ width: BAR_WIDTH, y_align: Clutter.ActorAlign.CENTER });
  const fill = new St.Widget({ height: 8, style: 'border-radius: 4px;' });
  const rest = new St.Widget({ height: 8, style: 'background-color: rgba(128,128,128,0.3); border-radius: 4px;' });
  bar.add_child(fill);
  bar.add_child(rest);
  box.add_child(bar);
  return {
    actor: box,
    update(value) {
      const filled = Math.round((BAR_WIDTH * value) / 100);
      fill.set_width(filled);
      fill.set_style(`background-color: ${barColor(value)}; border-radius: 4px;`);
      rest.set_width(BAR_WIDTH - filled);
    },
  };
}

/** Deux jauges côte à côte dans une même ligne de menu. */
export function gaugeRow(left, right) {
  const box = new St.BoxLayout({ x_expand: true, style: 'spacing: 18px;' });
  box.add_child(left.actor);
  if (right) box.add_child(right.actor);
  return staticItem(box);
}

/**
 * Élément de menu qui bascule au clic SANS fermer le menu : toute la zone en
 * surbrillance est cliquable (comme un élément normal), pas seulement le
 * libellé. Un PopupMenuItem ordinaire émet « activate », que le menu utilise
 * pour se refermer ; ici `activate` est remplacé par la bascule.
 */
const ToggleMenuItem = GObject.registerClass(
  class ToggleMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(title, onToggle) {
      super._init();
      this._onToggle = onToggle;
      this.label = new St.Label({ text: title, x_expand: true, y_align: Clutter.ActorAlign.CENTER });
      this.arrow = new St.Label({ text: '▸', y_align: Clutter.ActorAlign.CENTER });
      this.add_child(this.label);
      this.add_child(this.arrow);
    }

    activate(_event) {
      this._onToggle();
    }
  },
);

/**
 * Rangée dépliable : toute la ligne (libellé et flèche) est cliquable et
 * déplie une section. Remplace PopupSubMenuMenuItem, qui ne convient pas dans
 * ces menus : imbriqué dans une section il ne réagissait qu'à sa flèche et
 * s'ouvrait vide. La section peut contenir d'autres rangées dépliables ; ses
 * éléments simples referment le menu au clic, comme d'habitude.
 * @param {PopupMenu.PopupMenuBase} menu menu ou section qui reçoit la rangée
 * @param {string} title
 * @param {((open: boolean) => void)|null} [onToggle] appelé avec l'état voulu
 *   (accordéon géré par l'appelant) ; par défaut la rangée s'ouvre et se ferme seule
 */
export function expandableRow(menu, title, onToggle = null) {
  let open = false;
  let visible = true;
  const header = new ToggleMenuItem(title, () => (onToggle ? onToggle(!open) : row.setOpen(!open)));
  menu.addMenuItem(header);
  const section = new PopupMenu.PopupMenuSection();
  section.actor.hide();
  menu.addMenuItem(section);

  const apply = () => {
    header.actor.visible = visible;
    section.actor.visible = visible && open;
    header.arrow.text = open ? '▾' : '▸';
  };
  const row = {
    header,
    section,
    get open() {
      return open;
    },
    setTitle(text) {
      header.label.text = text;
    },
    setOpen(value) {
      open = value;
      apply();
    },
    /** Masque ou montre toute la rangée (ex. actions inutiles pour un œuf). */
    setVisible(value) {
      visible = value;
      apply();
    },
  };
  return row;
}
