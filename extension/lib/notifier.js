// Notifications de l'extension dans la liste de GNOME : une source « Critter »
// dont les notifications restent jusqu'à ce qu'on les ferme (elles ne passent
// plus « trop vite »). Cliquer une notification ou la fermer la marque lue dans
// le journal (rappels du Manager). Si l'API du shell ne répond pas comme prévu,
// on retombe sur `Main.notify`.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

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
    // La source peut être détruite de l'extérieur (« tout effacer ») : on la recrée à la demande.
    source.connect('destroy', () => {
      if (this._source === source) this._source = null;
    });
    Main.messageTray.add(source);
    this._source = source;
    return source;
  }

  /** Affiche et conserve une notification liée à l'entrée `id` du journal. */
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
      console.warn(`Scamper: notification GNOME indisponible (${e.message}), repli sur Main.notify`);
      Main.notify(title, body);
    }
  }

  destroy() {
    const source = this._source;
    this._source = null;
    source?.destroy();
  }
}
