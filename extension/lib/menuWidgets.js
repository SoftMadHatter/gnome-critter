// Small reusable menu widgets for the tray icon menu: button row, compact
// gauge, pages (drill-down navigation). The buttons live inside a non-activatable menu
// item: a click therefore doesn't close the menu (a plain PopupMenuItem
// does), which lets actions be chained and sections expanded.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
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
 * Menu item that navigates on click WITHOUT closing the menu: the whole
 * highlighted area is clickable (like a normal item), not just the label.
 * A plain PopupMenuItem emits "activate", which the menu uses to close
 * itself; here `activate` is replaced by the callback.
 */
const NavMenuItem = GObject.registerClass(
  class NavMenuItem extends PopupMenu.PopupBaseMenuItem {
    _init(title, onActivate, arrow) {
      super._init();
      this._onActivate = onActivate;
      this.label = new St.Label({ text: title, x_expand: true, y_align: Clutter.ActorAlign.CENTER });
      this.add_child(this.label);
      if (arrow) this.add_child(new St.Label({ text: arrow, y_align: Clutter.ActorAlign.CENTER }));
    }

    activate(_event) {
      this._onActivate();
    }
  },
);

/**
 * An action item that does NOT close the menu (a plain `addAction` does):
 * for actions that can be chained. Actions opening a window keep `addAction`.
 * @returns {PopupMenu.PopupBaseMenuItem} (with `label`)
 */
export function stayAction(section, title, onActivate) {
  const item = new NavMenuItem(title, onActivate, null);
  section.addMenuItem(item);
  return item;
}

/** Share of the monitor's work area a page may take before it scrolls. */
const MAX_HEIGHT_SHARE = 0.75;
/** Room kept for what surrounds a page's content: arrow and padding (root), plus back and title rows (sub-pages). */
const ROOT_MARGIN = 30;
const SUBPAGE_MARGIN = 110;

/**
 * Drill-down navigation in a menu: a stack of pages showing one at a time,
 * so the menu keeps a bounded height (a small screen included) instead of
 * growing with every opened section. A row opens a sub-page, which starts
 * with a "Back" row and its title; the menu goes back to the root page
 * whenever it closes. Each page scrolls when it exceeds the screen.
 * Replaces PopupSubMenuMenuItem, which doesn't fit in these menus: nested
 * in a section it only reacted to its arrow and opened empty.
 */
export class Pager {
  /** @param {PopupMenu.PopupMenu} menu */
  constructor(menu) {
    this._host = new PopupMenu.PopupMenuSection();
    menu.addMenuItem(this._host);
    this.root = this._createPage(null, '');
    this._current = this.root;
    menu.connect('open-state-changed', (_menu, open) => {
      if (open) this._resize(this._current);
      else this.home();
    });
  }

  /**
   * A page: a section holding its back and title rows, then a scrollable
   * `content` section where items are added.
   */
  _createPage(parent, title) {
    const outer = new PopupMenu.PopupMenuSection();
    this._host.addMenuItem(outer);
    const page = { outer, parent, children: [], title: null, scroll: null };
    if (parent) {
      outer.addMenuItem(new NavMenuItem(`‹ ${_('Retour')}`, () => this._show(parent), null));
      page.title = new St.Label({ text: title, style: 'font-weight: bold;' });
      outer.addMenuItem(staticItem(page.title));
      parent.children.push(page);
    }
    page.content = new PopupMenu.PopupMenuSection();
    outer.addMenuItem(page.content);
    // The content scrolls past the screen's height (the scroll view wraps the section's actor).
    page.scroll = new St.ScrollView({
      hscrollbar_policy: St.PolicyType.NEVER,
      vscrollbar_policy: St.PolicyType.AUTOMATIC,
      overlay_scrollbars: true,
    });
    outer.actor.remove_child(page.content.actor);
    page.scroll.add_child(page.content.actor);
    outer.actor.add_child(page.scroll);
    if (parent) outer.actor.hide();
    return page;
  }

  _show(page) {
    this._current.outer.actor.hide();
    page.outer.actor.show();
    this._current = page;
    this._resize(page);
  }

  /** Caps a page's height to the screen (no monitor yet while the shell starts: nothing to cap, until the menu opens). */
  _resize(page) {
    const monitor = Main.layoutManager.currentMonitor ?? Main.layoutManager.primaryMonitor;
    if (!monitor) return;
    const work = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
    const margin = page.parent ? SUBPAGE_MARGIN : ROOT_MARGIN;
    page.scroll.style = `max-height: ${Math.max(160, Math.floor(work.height * MAX_HEIGHT_SHARE) - margin)}px;`;
  }

  /** Back to the root page. */
  home() {
    this._show(this.root);
  }

  /**
   * Adds to `page` a row opening a new sub-page.
   * @param {object} page the page receiving the row
   * @param {string} title
   * @returns {{page: object, section: PopupMenu.PopupMenuSection, setTitle: (text: string) => void,
   *   setPageTitle: (text: string) => void, setVisible: (visible: boolean) => void}}
   *   `section`: where to add the sub-page's items
   */
  row(page, title) {
    const child = this._createPage(page, title);
    const header = new NavMenuItem(title, () => this._show(child), '▸');
    page.content.addMenuItem(header);
    return {
      page: child,
      section: child.content,
      setTitle: (text) => (header.label.text = text),
      setPageTitle: (text) => (child.title.text = text),
      /** Hides or shows the row (e.g. actions pointless for an egg). */
      setVisible: (visible) => (header.actor.visible = visible),
    };
  }

  /** Empties a page: its items and its sub-pages (to rebuild it). */
  clearPage(page) {
    for (const child of page.children) this._destroyPage(child);
    page.children = [];
    page.content.removeAll();
  }

  /** Sub-pages live side by side in the host, not inside their parent: they go one by one. */
  _destroyPage(page) {
    for (const child of page.children) this._destroyPage(child);
    page.outer.destroy();
  }
}
