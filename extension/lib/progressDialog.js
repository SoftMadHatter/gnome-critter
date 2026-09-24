// Fenêtre de détail de la progression : succès, statistiques et journal, avec
// défilement. Les succès non débloqués sont masqués et floutés (seul leur
// nombre apparaît dans le menu) : on ne voit ni leur nom ni leur objectif.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { STAT_LABELS, statValue, formatJournalDate, maskText } from './progressLabels.js';

// Texte transparent + ombre portée : rendu « flou » du texte masqué.
const BLUR_STYLE = 'color: transparent; text-shadow: 0 0 7px rgba(200,200,200,0.9);';
const TAB_KEYS = ['achievements', 'stats', 'journal'];
const TAB_LABELS = { achievements: 'Succès', stats: 'Statistiques', journal: 'Journal' };

export const ProgressDialog = GObject.registerClass(
  class ProgressDialog extends ModalDialog.ModalDialog {
    /**
     * @param {{
     *   title: string,
     *   tab: 'achievements'|'stats'|'journal',
     *   achievements: {def: object, unlocked: boolean, progress: number}[],
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
        const button = new St.Button({ label: TAB_LABELS[key], style_class: 'button', can_focus: true });
        button.connect('clicked', () => this._showTab(key));
        tabs.add_child(button);
        this._tabButtons[key] = button;
      }

      this.addButton({ label: 'Fermer', action: () => this.close(), key: Clutter.KEY_Escape, default: true });
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
      const done = achievements.filter((a) => a.unlocked).length;
      this._row(`${done} / ${achievements.length} débloqués`, 'font-weight: bold;');
      for (const { def, unlocked } of achievements) {
        if (unlocked) {
          this._row(`✓ ${def.name}`, 'font-weight: bold;');
          this._row(def.description, 'opacity: 190; padding-bottom: 4px;');
        } else {
          this._row(maskText(def.name), `${BLUR_STYLE} font-weight: bold;`);
          this._row(maskText(def.description), `${BLUR_STYLE} padding-bottom: 4px;`);
        }
      }
      if (achievements.length === 0) this._row('Aucun succès pour cet animal.');
    }

    _fillStats() {
      for (const [key, value] of this._data.stats) {
        this._row(`${STAT_LABELS[key] ?? key} : ${statValue(key, value)}`);
      }
    }

    _fillJournal() {
      const entries = [...this._data.journal].reverse();
      if (entries.length === 0) this._row('Rien pour le moment.');
      for (const entry of entries) this._row(`${formatJournalDate(entry.t)}   ${entry.text}`);
    }
  },
);
