// Rythme du monde : nuit, absence du joueur, pauses. Module pur, sans GNOME :
// l'extension lit l'heure et l'inactivité (capteurs), ces classes décident.

/**
 * Nuit de `start` h à `end` h (heure locale 0-23), fenêtre qui passe minuit
 * comprise (23 h -> 7 h par défaut).
 */
export function isNight(hour, { start = 23, end = 7 } = {}) {
  if (start === end) return false;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/**
 * Temps d'activité continu du joueur : au bout de `interval` secondes sans
 * vraie pause, propose un rappel, une seule fois puis après un délai de grâce.
 */
export class BreakTracker {
  /**
   * @param {{interval?: number, resetIdle?: number, cooldown?: number, enabled?: boolean}} [options]
   *   interval : secondes d'activité avant le rappel ; resetIdle : inactivité
   *   qui compte comme une pause ; cooldown : délai de grâce après un rappel.
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
   * @param {number} dt secondes écoulées
   * @param {number} idleSeconds inactivité actuelle du joueur
   * @returns {'remind'|null}
   */
  advance(dt, idleSeconds) {
    if (!this.enabled || dt <= 0) return null;
    if (idleSeconds >= this.resetIdle) {
      this.activeSeconds = 0; // une vraie pause
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

  /** Le joueur a réagi au rappel : le compteur repart de zéro. */
  acknowledge() {
    this.activeSeconds = 0;
    this._cooling = this.cooldown;
  }
}

/** Détecte l'absence du joueur (inactivité prolongée) et son retour, une fois chacun. */
export class IdleTracker {
  /** @param {{awayAfter?: number}} [options] awayAfter : secondes d'inactivité avant l'absence */
  constructor({ awayAfter = 600 } = {}) {
    this.awayAfter = awayAfter;
    this.away = false;
  }

  /**
   * @param {number} idleSeconds
   * @returns {'away'|'returned'|null} transition survenue
   */
  update(idleSeconds) {
    const nowAway = idleSeconds >= this.awayAfter;
    if (nowAway === this.away) return null;
    this.away = nowAway;
    return nowAway ? 'away' : 'returned';
  }
}
