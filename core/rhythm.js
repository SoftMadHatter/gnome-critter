// The world's rhythm: night, the player being away, breaks. Pure module,
// no GNOME: the extension reads the time and idleness (sensors), these
// classes decide.

/**
 * Night from `start` h to `end` h (local time, 0-23), a window that crosses
 * midnight included (23 h -> 7 h by default).
 */
export function isNight(hour, { start = 23, end = 7 } = {}) {
  if (start === end) return false;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/**
 * The player's continuous activity time: after `interval` seconds without a
 * real break, offers a reminder, once, then again after a grace period.
 */
export class BreakTracker {
  /**
   * @param {{interval?: number, resetIdle?: number, cooldown?: number, enabled?: boolean}} [options]
   *   interval: seconds of activity before the reminder; resetIdle: idle time
   *   that counts as a break; cooldown: grace period after a reminder.
   */
  constructor({ interval = 3600, resetIdle = 300, cooldown = 1800, enabled = true } = {}) {
    this.interval = interval;
    this.resetIdle = resetIdle;
    this.cooldown = cooldown;
    this.enabled = enabled;
    this.activeSeconds = 0;
    this._cooling = 0;
  }

  /**
   * @param {number} dt elapsed seconds
   * @param {number} idleSeconds the player's current idle time
   * @returns {'remind'|null}
   */
  advance(dt, idleSeconds) {
    if (!this.enabled || dt <= 0) return null;
    if (idleSeconds >= this.resetIdle) {
      this.activeSeconds = 0; // a real break
      this._cooling = 0;
      return null;
    }
    if (this._cooling > 0) {
      this._cooling -= dt;
      return null;
    }
    this.activeSeconds += dt;
    if (this.activeSeconds >= this.interval) {
      this.activeSeconds = 0;
      this._cooling = this.cooldown;
      return 'remind';
    }
    return null;
  }

  /** The player acknowledged the reminder: the counter resets to zero. */
  acknowledge() {
    this.activeSeconds = 0;
    this._cooling = this.cooldown;
  }
}

/** Detects the player being away (prolonged idleness) and their return, once each. */
export class IdleTracker {
  /** @param {{awayAfter?: number}} [options] awayAfter: seconds of idleness before "away" */
  constructor({ awayAfter = 600 } = {}) {
    this.awayAfter = awayAfter;
    this.away = false;
  }

  /**
   * @param {number} idleSeconds
   * @returns {'away'|'returned'|null} the transition that occurred
   */
  update(idleSeconds) {
    const nowAway = idleSeconds >= this.awayAfter;
    if (nowAway === this.away) return null;
    this.away = nowAway;
    return nowAway ? 'away' : 'returned';
  }
}
