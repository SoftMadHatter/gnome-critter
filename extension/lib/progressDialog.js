// Fenêtre de détail de la progression : succès, statistiques et journal, avec
// défilement. Les succès sont rangés par rubrique dépliable : une série montre
// son dernier palier et le suivant avec sa progression ; les bêtises (succès
// « troll ») restent cachées tant qu'elles ne sont pas découvertes, seul leur
// nombre apparaît.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { statLabel, categoryLabel, statValue, formatJournalDate } from '../core/labels.js';
import { formatCount } from '../core/achievements.js';
import { rewardLabel } from '../core/narrator.js';
import { _, N_, ngettext, fmt } from '../core/i18n.js';

const TAB_KEYS = ['achievements', 'stats', 'journal'];
const BAR_WIDTH = 160;
/** Rubriques de succès cachés : un compte « découverts sur N ». */
const HIDDEN_CATEGORIES = new Set(['mischief']);
const TAB_LABELS = { achievements: N_('Succès'), stats: N_('Statistiques'), journal: N_('Journal') };

export const ProgressDialog = GObject.registerClass(
  class ProgressDialog extends ModalDialog.ModalDialog {
    /**
     * @param {{
     *   title: string,
     *   tab: 'achievements'|'stats'|'journal',
     *   achievements: {done: number, total: number, categories: {id: string, done: number, total: number, entries: object[]}[]},
     *   stats: [string, number][],
     *   journal: {t: number, text: string}[],
     * }} data
     */
    _init(data) {
      super._init({ styleClass: 'prompt-dialog' });

      this.contentLayout.add_child(new St.Label({ text: data.title, style: 'font-weight: bold; padding-bottom: 6px;' }));

      const tabs = new St.BoxLayout({ style: 'spacing: 6px; padding-bottom: 8px;' });
      this.contentLayout.add_child(tabs);

      const scroll = new St.ScrollView({
        style: 'min-width: 440px; min-height: 240px; max-height: 340px;',
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: true,
      });
      this._list = new St.BoxLayout({ vertical: true, x_expand: true, style: 'spacing: 4px; padding-right: 10px;' });
      scroll.set_child(this._list);
      this.contentLayout.add_child(scroll);

      this._data = data;
      this._tabButtons = {};
      for (const key of TAB_KEYS) {
        const button = new St.Button({ label: _(TAB_LABELS[key]), style_class: 'button', can_focus: true });
        button.connect('clicked', () => this._showTab(key));
        tabs.add_child(button);
        this._tabButtons[key] = button;
      }

      this.addButton({ label: _('Fermer'), action: () => this.close(), key: Clutter.KEY_Escape, default: true });
      this._showTab(data.tab);
    }

    _showTab(key) {
      for (const [name, button] of Object.entries(this._tabButtons)) {
        button.style = name === key ? 'font-weight: bold;' : '';
      }
      this._list.destroy_all_children();
      if (key === 'achievements') this._fillAchievements();
      else if (key === 'stats') this._fillStats();
      else this._fillJournal();
    }

    _row(text, style = '') {
      const label = new St.Label({ text, style });
      label.clutter_text.line_wrap = true;
      this._list.add_child(label);
      return label;
    }

    _fillAchievements() {
      const { achievements } = this._data;
      this._row(fmt(_('{done} / {total} débloqués'), { done: achievements.done, total: achievements.total }), 'font-weight: bold;');
      if (achievements.total === 0) this._row(_('Aucun succès pour cet animal.'));
      for (const category of achievements.categories) this._category(category);
    }

    /** Rubrique repliée : un bouton avec le compte, qui déplie ses lignes. */
    _category(category) {
      const name = categoryLabel(category.id);
      const count = HIDDEN_CATEGORIES.has(category.id)
        ? fmt(ngettext('{done} découverte sur {total}', '{done} découvertes sur {total}', category.done), { done: category.done, total: category.total })
        : `${category.done}/${category.total}`;
      const header = new St.Button({
        label: `▸ ${name} (${count})`,
        style_class: 'button',
        x_align: Clutter.ActorAlign.START,
        can_focus: true,
        style: 'margin-top: 4px;',
      });
      const box = new St.BoxLayout({ vertical: true, x_expand: true, visible: false, style: 'spacing: 2px; padding-left: 12px;' });
      header.connect('clicked', () => {
        box.visible = !box.visible;
        header.label = `${box.visible ? '▾' : '▸'} ${name} (${count})`;
      });
      this._list.add_child(header);
      this._list.add_child(box);
      if (category.id === 'player') this._line(box, _('Tes succès à toi, partagés entre tous tes animaux.'), 'opacity: 170;');
      if (category.entries.length === 0) this._line(box, _("Rien de découvert pour l'instant. Le Système attend."), 'opacity: 170;');
      for (const entry of category.entries) this._entry(box, entry);
    }

    _entry(box, entry) {
      this._line(box, `${entry.done ? '✓ ' : ''}${entry.name}`, 'font-weight: bold; padding-top: 3px;');
      const progress = entry.done || entry.target === null ? '' : ` — ${formatCount(entry.value)} / ${formatCount(entry.target)}`;
      this._line(box, `${entry.description}${progress}`, 'opacity: 200;');
      if (!entry.done && entry.target) box.add_child(progressBar(entry.value / entry.target));
      if (entry.last) {
        this._line(box, fmt(_('Palier obtenu : {name} ({tier}/{tiers})'), { name: entry.last.name, tier: entry.tier, tiers: entry.tiers }), 'opacity: 170;');
      }
      if (entry.done && entry.title) this._line(box, fmt(_('Titre gagné : {title}'), { title: entry.title }), 'font-style: italic;');
      if (entry.troll) {
        this._line(box, fmt(_('« {name} »'), { name: entry.quip }), 'font-style: italic; opacity: 190;');
        this._line(box, fmt(_('Récompense : {reward}'), { reward: rewardLabel(entry.reward) }), 'opacity: 170;');
      }
    }

    _line(box, text, style = '') {
      const label = new St.Label({ text, style });
      label.clutter_text.line_wrap = true;
      box.add_child(label);
      return label;
    }

    _fillStats() {
      for (const [key, value] of this._data.stats) {
        this._row(fmt(_('{label} : {value}'), { label: statLabel(key), value: statValue(key, value) }));
      }
    }

    _fillJournal() {
      const entries = [...this._data.journal].reverse();
      if (entries.length === 0) this._row(_('Rien pour le moment.'));
      for (const entry of entries) this._row(`${formatJournalDate(entry.t)}   ${entry.text}`);
    }
  },
);

/** Barre de progression horizontale (fraction de 0 à 1). */
function progressBar(fraction) {
  const bar = new St.Widget({
    width: BAR_WIDTH,
    height: 5,
    style: 'background-color: rgba(255,255,255,0.15); border-radius: 3px; margin-bottom: 2px;',
  });
  bar.add_child(new St.Widget({
    width: Math.round(BAR_WIDTH * Math.min(1, Math.max(0, fraction))),
    height: 5,
    style: 'background-color: #62a0ea; border-radius: 3px;',
  }));
  return bar;
}
