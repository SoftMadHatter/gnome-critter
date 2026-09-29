import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { loadPack, resolvePackPath } from './lib/packLoader.js';
import { Manager } from './lib/manager.js';
import { setTranslator, sessionLanguage } from './core/i18n.js';

const DEFAULT_MIX = [{ pack: 'cat', count: 1 }];
const MAX_TOTAL_CRITTERS = 10; // matches critter-mix's schema description
const RELOAD_DELAY_MS = 400; // groups successive changes (numeric field, list)

/**
 * Parses and sanitizes the `critter-mix` setting (JSON array of
 * `{pack, count}`): drops entries with a non-string pack id or a
 * non-positive count, then clamps the total count to MAX_TOTAL_CRITTERS
 * (entries are kept in order, later ones shrink or drop first) so a
 * malformed setting can never spawn unboundedly. Falls back to
 * DEFAULT_MIX if nothing valid remains.
 * @param {string} text
 * @returns {{pack: string, count: number}[]}
 */
function parseMix(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const entries = Array.isArray(raw) ? raw : [];
  const clean = [];
  let total = 0;
  for (const entry of entries) {
    const pack = entry?.pack;
    const count = Math.floor(entry?.count);
    if (typeof pack !== 'string' || !pack || !Number.isFinite(count) || count < 1) continue;
    const kept = Math.min(count, MAX_TOTAL_CRITTERS - total);
    if (kept < 1) break;
    clean.push({ pack, count: kept });
    total += kept;
  }
  return clean.length > 0 ? clean : DEFAULT_MIX;
}

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

    // Changing the mix applies live: the manager is recreated (it saves
    // state first, existing critters keep their life).
    this._settingsIds = ['critter-mix'].map((key) =>
      this._settings.connect(`changed::${key}`, () => this._scheduleReload()),
    );
  }

  _startManager() {
    const mix = parseMix(this._settings.get_string('critter-mix'));

    // Each distinct pack id is only loaded once, however many mix entries
    // (or critters) use it -- see docs/dev-workflow.md and the Manager's
    // own per-pack cache for the same idea at spawn time.
    const loaded = new Map();
    const packs = [];
    for (const { pack: packId, count } of mix) {
      if (!loaded.has(packId)) {
        const packPath = resolvePackPath(this.path, packId);
        try {
          loaded.set(packId, loadPack(packPath));
        } catch (e) {
          logError(e, `Critter: failed to load pack "${packId}" (${packPath})`);
          loaded.set(packId, null);
        }
      }
      const pack = loaded.get(packId);
      if (pack) packs.push({ pack, count });
    }
    if (packs.length === 0) return;

    this._manager = new Manager(packs, this._settings, {
      extensionPath: this.path,
      uuid: this.uuid,
      openSettings: () => this.openPreferences(),
    });
    this._manager.spawn();
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
