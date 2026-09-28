// World-rhythm sensors: player inactivity, notifications, typing. No
// content is ever read: only the facts "a notification arrived" and "a
// key was pressed" are relayed (never the title, the text, the app, or
// which key).

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

  /** Player inactivity, in seconds. */
  idleSeconds() {
    return this._idleMonitor.get_idletime() / 1000;
  }

  /** Turns the reaction to notifications on or off. */
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
      console.warn(`Critter: notification reaction unavailable (${e.message})`);
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
        // source already destroyed
      }
    }
    this._notificationIds = [];
    this._sourceHooked.clear();
  }

  /** Turns the reaction to typing on or off (only counts that a key was pressed). */
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
