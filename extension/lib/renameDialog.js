// Boîte de dialogue GNOME pour renommer une créature : une zone de saisie,
// Annuler et OK ; Entrée valide, Échap annule.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import { MAX_NAME_LENGTH } from '../core/names.js';
import { _, fmt } from '../core/i18n.js';

export const RenameDialog = GObject.registerClass(
  class RenameDialog extends ModalDialog.ModalDialog {
    /**
     * @param {string} currentName
     * @param {(text: string) => void} onDone appelé avec le texte saisi à la validation
     */
    _init(currentName, onDone) {
      super._init({ styleClass: 'prompt-dialog' });
      this._onDone = onDone;

      this.contentLayout.add_child(
        new St.Label({ text: _('Nom de la créature'), style: 'font-weight: bold; padding-bottom: 8px;' }),
      );
      this._entry = new St.Entry({
        text: currentName,
        style: 'min-width: 280px;',
        can_focus: true,
        hint_text: fmt(_('{n} caractères au plus'), { n: MAX_NAME_LENGTH }),
      });
      this._entry.clutter_text.set_max_length(MAX_NAME_LENGTH);
      this._entry.clutter_text.connect('activate', () => this._validate());
      this.contentLayout.add_child(this._entry);
      this.setInitialKeyFocus(this._entry.clutter_text);

      this.addButton({ label: _('Annuler'), action: () => this.close(), key: Clutter.KEY_Escape });
      this.addButton({ label: _('OK'), action: () => this._validate(), default: true });
    }

    _validate() {
      const text = this._entry.get_text();
      this.close();
      this._onDone(text);
    }
  },
);
