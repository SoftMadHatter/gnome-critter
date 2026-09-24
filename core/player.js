// État du joueur : pièces, achats, journal. Module pur, sauvegardé à part de
// celui des animaux (clé GSettings `saved-player`).

/** Gains de pièces par événement d'animal. */
export const COIN_REWARDS = Object.freeze({
  ate: 1,
  played: 2,
  brushed: 1,
  purring: 1,
  hatched: 10,
  grew: 15,
  birthday: 25,
  trickLearned: 10,
});

/** Événements répétables qu'on peut provoquer à la chaîne : gains espacés dans le temps. */
export const COOLDOWN_EVENTS = Object.freeze(new Set(['ate', 'played', 'brushed', 'purring']));

const COOLDOWN_SECONDS = 30;
const JOURNAL_LIMIT = 50;

export class Player {
  /** @param {{coins?: number, owned?: string[], journal?: {t:number, text:string}[]}} [state] */
  constructor({ coins = 0, owned = [], journal = [] } = {}) {
    this.coins = Number.isFinite(coins) && coins >= 0 ? Math.floor(coins) : 0;
    this.owned = Array.isArray(owned) ? owned.filter((id) => typeof id === 'string') : [];
    this.journal = Array.isArray(journal)
      ? journal.filter((e) => e && Number.isFinite(e.t) && typeof e.text === 'string').slice(-JOURNAL_LIMIT)
      : [];
    this._lastAward = new Map();
  }

  /**
   * Crédite des pièces ; `cooldown` > 0 espace les gains d'une même source
   * (l'animal et l'événement) pour empêcher de les enchaîner en boucle.
   * @returns {number} pièces réellement gagnées
   */
  award(source, amount, nowSeconds, cooldown = 0) {
    if (!(amount > 0)) return 0;
    if (cooldown > 0) {
      const last = this._lastAward.get(source);
      if (last !== undefined && nowSeconds - last < cooldown) return 0;
      this._lastAward.set(source, nowSeconds);
    }
    this.coins += amount;
    return amount;
  }

  /** Gain lié à un événement d'animal (table COIN_REWARDS, délai pour les répétables). */
  awardEvent(critterKey, event, nowSeconds) {
    const amount = COIN_REWARDS[event];
    if (!amount) return 0;
    const cooldown = COOLDOWN_EVENTS.has(event) ? COOLDOWN_SECONDS : 0;
    return this.award(`${critterKey}:${event}`, amount, nowSeconds, cooldown);
  }

  /** @returns {boolean} faux (rien débité) si le solde est insuffisant */
  spend(price) {
    if (!(price >= 0) || price > this.coins) return false;
    this.coins -= price;
    return true;
  }

  owns(id) {
    return this.owned.includes(id);
  }

  own(id) {
    if (!this.owns(id)) this.owned.push(id);
  }

  log(text, nowMs) {
    this.journal.push({ t: nowMs, text });
    if (this.journal.length > JOURNAL_LIMIT) this.journal.splice(0, this.journal.length - JOURNAL_LIMIT);
  }

  serialize() {
    return JSON.stringify({ version: 1, coins: this.coins, owned: this.owned, journal: this.journal });
  }

  /** Relit une sauvegarde sans jamais lever d'exception (joueur neuf si illisible). */
  static parse(text) {
    try {
      const data = JSON.parse(text);
      return data && data.version === 1 ? new Player(data) : new Player();
    } catch {
      return new Player();
    }
  }
}
