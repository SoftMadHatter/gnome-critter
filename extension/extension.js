import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { loadPack, resolvePackPath } from './lib/packLoader.js';
import { Manager } from './lib/manager.js';

const DEFAULT_PACK_ID = 'critter-demo';
const DEFAULT_COUNT = 1;

export default class ScamperExtension extends Extension {
  enable() {
    this._settings = this.getSettings();

    const packId = this._settings.get_string('pack-id') || DEFAULT_PACK_ID;
    const count = this._settings.get_int('critter-count') || DEFAULT_COUNT;
    const packPath = resolvePackPath(this.path, packId);

    let pack;
    try {
      pack = loadPack(packPath);
    } catch (e) {
      logError(e, `Scamper: échec du chargement du pack "${packId}" (${packPath})`);
      return;
    }

    this._manager = new Manager(pack, this._settings, { extensionPath: this.path, uuid: this.uuid });
    this._manager.spawn(count);
    this._manager.start();
  }

  disable() {
    this._manager?.destroy();
    this._manager = null;
    this._settings = null;
  }
}
