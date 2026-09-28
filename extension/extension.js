import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { loadPack, resolvePackPath } from './lib/packLoader.js';
import { Manager } from './lib/manager.js';
import { setTranslator, sessionLanguage } from './core/i18n.js';

const DEFAULT_PACK_ID = 'cat';
const DEFAULT_COUNT = 1;
const RELOAD_DELAY_MS = 400; // groups successive changes (numeric field, list)

export default class CritterExtension extends Extension {
  enable() {
    // Text in the session's language (locale/<language>/LC_MESSAGES/gnome-critter.mo
    // catalog, metadata.json's "gettext-domain"); without a catalog: the original French.
    this.initTranslations?.();
    setTranslator({
      gettext: (text) => this.gettext(text),
      ngettext: (singular, plural, n) => this.ngettext(singular, plural, n),
      language: sessionLanguage(GLib.get_language_names()),
    });
    this._settings = this.getSettings();
    this._startManager();

    // Changing the critter or the count applies live: the manager is
    // recreated (it saves state first, existing critters keep their life).
    this._settingsIds = ['pack-id', 'critter-count'].map((key) =>
      this._settings.connect(`changed::${key}`, () => this._scheduleReload()),
    );
  }

  _startManager() {
    const packId = this._settings.get_string('pack-id') || DEFAULT_PACK_ID;
    const count = this._settings.get_int('critter-count') || DEFAULT_COUNT;
    const packPath = resolvePackPath(this.path, packId);

    let pack;
    try {
      pack = loadPack(packPath);
    } catch (e) {
      logError(e, `Critter: failed to load pack "${packId}" (${packPath})`);
      return;
    }

    this._manager = new Manager(pack, this._settings, {
      extensionPath: this.path,
      uuid: this.uuid,
      openSettings: () => this.openPreferences(),
    });
    this._manager.spawn(count);
    this._manager.start();
  }

  _scheduleReload() {
    if (this._reloadId) GLib.source_remove(this._reloadId);
    this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, RELOAD_DELAY_MS, () => {
      this._reloadId = null;
      this._manager?.destroy();
      this._manager = null;
      this._startManager();
      return GLib.SOURCE_REMOVE;
    });
  }

  disable() {
    if (this._reloadId) {
      GLib.source_remove(this._reloadId);
      this._reloadId = null;
    }
    for (const id of this._settingsIds ?? []) this._settings.disconnect(id);
    this._settingsIds = [];
    this._manager?.destroy();
    this._manager = null;
    this._settings = null;
    setTranslator(); // back to French: doesn't keep a reference to the disabled extension
  }
}
