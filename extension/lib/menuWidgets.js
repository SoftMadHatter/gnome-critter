// Small reusable menu widgets for the tray icon menu: button row, compact
// gauge, expandable row. The buttons live inside a non-activatable menu
// item: a click therefore doesn't close the menu (a plain PopupMenuItem
// does), which lets actions be chained and sections expanded.

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

/** Menu item with no activation or focus, holding a free-form actor. */
export function staticItem(child) {
  const item = new PopupMenu.PopupBaseMenuItem({ activate: false, can_focus: false });
  if (child) item.add_child(child);
  return item;
}

/**
 * A row of buttons.
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

/** Enables or grays out a button. */
export function setEnabled(button, enabled) {
  button.reactive = enabled;
  button.can_focus = enabled;
  button.opacity = enabled ? 255 : 110;
}

/**
 * Compact gauge: label and colored bar (two gauges per row).
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

/** Two gauges side by side on the same menu row. */
export function gaugeRow(left, right) {
  const box = new St.BoxLayout({ x_expand: true, style: 'spacing: 18px;' });
  box.add_child(left.actor);
  if (right) box.add_child(right.actor);
  return staticItem(box);
}

/**
 * Menu item that toggles on click WITHOUT closing the menu: the whole
 * highlighted area is clickable (like a normal item), not just the label.
 * A plain PopupMenuItem emits "activate", which the menu uses to close
 * itself; here `activate` is replaced by the toggle.
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

/** Expandable rows per menu or section (the parent), for the accordion: opening one closes its siblings. */
const ROWS = new WeakMap();

/** Indentation of an opened section: a thin bar on its left, cascading with the nesting. */
const SECTION_STYLE = 'margin-left: 12px; padding-left: 6px; border-left-width: 2px; border-left-color: rgba(255,255,255,0.18);';

/**
 * Expandable row: the whole line (label and arrow) is clickable and
 * expands an indented section. Replaces PopupSubMenuMenuItem, which
 * doesn't fit in these menus: nested in a section it only reacted to its
 * arrow and opened empty. The section can hold other expandable rows; its
 * plain items close the menu on click, as usual.
 * Accordion at every level: opening a row closes its siblings (same
 * menu or section), and closing a row closes the rows nested in it.
 * @param {PopupMenu.PopupMenuBase} menu the menu or section receiving the row
 * @param {string} title
 */
export function expandableRow(menu, title) {
  let open = false;
  let visible = true;
  const header = new ToggleMenuItem(title, () => row.setOpen(!open));
  menu.addMenuItem(header);
  const section = new PopupMenu.PopupMenuSection();
  section.actor.style = SECTION_STYLE;
  section.actor.hide();
  menu.addMenuItem(section);

  const siblings = ROWS.get(menu) ?? [];
  ROWS.set(menu, siblings);

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
      if (value) {
        for (const other of siblings) if (other !== row) other.setOpen(false);
      } else {
        collapseRows(section);
      }
    },
    /** Hides or shows the whole row (e.g. actions pointless for an egg). */
    setVisible(value) {
      visible = value;
      apply();
    },
  };
  siblings.push(row);
  // Rows rebuilt (`removeAll`) must not linger among the siblings.
  header.connect('destroy', () => {
    const index = siblings.indexOf(row);
    if (index >= 0) siblings.splice(index, 1);
  });
  return row;
}

/** Closes every expandable row of a menu or section (and, through them, their nested rows). */
export function collapseRows(menu) {
  for (const row of ROWS.get(menu) ?? []) row.setOpen(false);
}
