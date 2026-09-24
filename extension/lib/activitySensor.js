// Capteurs du rythme du monde : inactivité du joueur, notifications, frappe.
// Aucun contenu n'est jamais lu : seuls les faits « une notification est
// arrivée » et « une touche a été pressée » sont relayés (jamais le titre, le
// texte, l'application ni la touche).

import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class ActivitySensor {
  /**
   * @param {{onNotification: () => void, onTyping: () => void}} handlers
   */
  constructor({ onNotification, onTyping }) {
    this._onNotification = onNotification;
    this._onTyping = onTyping;
    this._idleMonitor = global.backend.get_core_idle_monitor();
    this._notificationIds = []; // [{object, id}]
    this._sourceHooked = new Set();
    this._typingId = null;
  }

  /** Inactivité du joueur, en secondes. */
  idleSeconds() {
    return this._idleMonitor.get_idletime() / 1000;
  }

  /** Active ou coupe la réaction aux notifications. */
  setNotifications(enabled) {
    if (enabled && this._notificationIds.length === 0) this._hookNotifications();
    else if (!enabled) this._unhookNotifications();
  }

  _hookNotifications() {
    try {
      const tray = Main.messageTray;
      this._connect(tray, 'source-added', (_tray, source) => this._hookSource(source));
      for (const source of tray.getSources?.() ?? []) this._hookSource(source);
    } catch (e) {
      console.warn(`Scamper : réaction aux notifications indisponible (${e.message})`);
      this._unhookNotifications();
    }
  }

  _hookSource(source) {
    if (this._sourceHooked.has(source)) return;
    this._sourceHooked.add(source);
    this._connect(source, 'notification-added', () => this._onNotification());
  }

  _connect(object, signal, callback) {
    this._notificationIds.push({ object, id: object.connect(signal, callback) });
  }

  _unhookNotifications() {
    for (const { object, id } of this._notificationIds) {
      try {
        object.disconnect(id);
      } catch {
        // source déjà détruite
      }
    }
    this._notificationIds = [];
    this._sourceHooked.clear();
  }

  /** Active ou coupe la réaction à la frappe (compte seulement qu'une touche est pressée). */
  setTyping(enabled) {
    if (enabled && this._typingId === null) {
      this._typingId = global.stage.connect('captured-event', (_stage, event) => {
        if (event.type() === Clutter.EventType.KEY_PRESS) this._onTyping();
        return Clutter.EVENT_PROPAGATE;
      });
    } else if (!enabled && this._typingId !== null) {
      global.stage.disconnect(this._typingId);
      this._typingId = null;
    }
  }

  destroy() {
    this._unhookNotifications();
    this.setTyping(false);
  }
}
