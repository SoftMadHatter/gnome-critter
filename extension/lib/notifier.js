// The extension's notifications in GNOME's list: a "Critter" source whose
// notifications stay until dismissed (they no longer go by "too fast").
// Clicking a notification or dismissing it marks it read in the log
// (Manager callbacks). If the shell's API doesn't respond as expected, it
// falls back to `Main.notify`.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { warn } from './log.js';

const SOURCE_TITLE = 'Critter';
const SOURCE_ICON = 'face-smile-symbolic';

export class Notifier {
  /**
   * @param {{onActivated: (id: number) => void, onDismissed: (id: number) => void}} callbacks
   */
  constructor({ onActivated, onDismissed }) {
    this._onActivated = onActivated;
    this._onDismissed = onDismissed;
    this._source = null;
  }

  _ensureSource() {
    if (this._source) return this._source;
    const source = new MessageTray.Source({ title: SOURCE_TITLE, iconName: SOURCE_ICON });
    // The source can be destroyed from outside ("clear all"): recreated on demand.
    source.connect('destroy', () => {
      if (this._source === source) this._source = null;
    });
    Main.messageTray.add(source);
    this._source = source;
    return source;
  }

  /** Shows and keeps a notification linked to log entry `id`. */
  notify(id, title, body) {
    try {
      const source = this._ensureSource();
      const notification = new MessageTray.Notification({ source, title, body, isTransient: false });
      notification.connect('activated', () => this._onActivated(id));
      notification.connect('destroy', (_notification, reason) => {
        if (reason === MessageTray.NotificationDestroyedReason.DISMISSED) this._onDismissed(id);
      });
      source.addNotification(notification);
    } catch (e) {
      warn(`GNOME notification unavailable (${e.message}), falling back to Main.notify`);
      Main.notify(title, body);
    }
  }

  destroy() {
    const source = this._source;
    this._source = null;
    source?.destroy();
  }
}
