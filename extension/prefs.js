import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class ScamperPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup({ title: 'Scamper' });
    page.add(group);

    const packRow = new Adw.EntryRow({ title: 'Pack (dossier sous packs/)' });
    settings.bind('pack-id', packRow, 'text', 0);
    group.add(packRow);

    const countRow = new Adw.SpinRow({
      title: "Nombre d'animaux",
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 10, step_increment: 1 }),
    });
    settings.bind('critter-count', countRow, 'value', 0);
    group.add(countRow);

    const noteRow = new Adw.ActionRow({
      title: 'Le changement de pack ou de nombre demande de désactiver/réactiver l\'extension.',
    });
    group.add(noteRow);

    window.add(page);
  }
}
