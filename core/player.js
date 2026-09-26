// État du joueur : pièces, achats, journal, gestes comptés et succès du
// joueur. Module pur, sauvegardé à part de celui des animaux (clé GSettings
// `saved-player`).

import { Stats, PLAYER_STAT_KEYS } from './stats.js';

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
const JOURNAL_LIMIT = 100;

export class Player {
  /**
   * @param {{coins?: number, owned?: string[], journal?: {id?:number, t:number, text:string, body?:string, unread?:boolean}[], stats?: object,
   *   unlocked?: string[], achievementCount?: number}} [state]
   */
  constructor({ coins = 0, owned = [], journal = [], stats = null, unlocked = [], achievementCount = 0 } = {}) {
    this.coins = Number.isFinite(coins) && coins >= 0 ? Math.floor(coins) : 0;
    this.owned = Array.isArray(owned) ? owned.filter((id) => typeof id === 'string') : [];
    /** Entrées `{id, t, text, body?, unread?}` ; `body` = texte complet d'une annonce, `unread` = pas encore vue. */
    this.journal = [];
    if (Array.isArray(journal)) {
      const valid = journal.filter((e) => e && Number.isFinite(e.t) && typeof e.text === 'string').slice(-JOURNAL_LIMIT);
      let nextId = Math.max(0, ...valid.map((e) => (Number.isInteger(e.id) ? e.id : 0))) + 1;
      const seen = new Set();
      for (const e of valid) {
        // Anciennes sauvegardes : pas d'id (attribué ici), entrées lues.
        const id = Number.isInteger(e.id) && e.id > 0 && !seen.has(e.id) ? e.id : nextId++;
        seen.add(id);
        const entry = { id, t: e.t, text: e.text };
        if (typeof e.body === 'string' && e.body) entry.body = e.body;
        if (e.unread === true) entry.unread = true;
        this.journal.push(entry);
      }
    }
    /** Gestes du joueur (menus, bureau...) et marques, base des succès du joueur. */
    this.stats = new Stats(PLAYER_STAT_KEYS);
    this.stats.restore(stats);
    /** Succès du joueur obtenus. */
    this.unlocked = new Set(Array.isArray(unlocked) ? unlocked.filter((id) => typeof id === 'string') : []);
    /** Total des succès obtenus (animaux et joueur), qui ne redescend jamais : base des trophées. */
    this.achievementCount = Number.isFinite(achievementCount) && achievementCount >= 0 ? Math.floor(achievementCount) : 0;
    this._lastAward = new Map();
  }

  /** Faits des succès du joueur : compteurs, solde, accessoires possédés, marques. */
  progressFacts() {
    return {
      stats: { ...this.stats.counters, coins: this.coins, accessoriesOwned: this.owned.length },
      marks: this.stats.marks,
    };
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

  /**
   * Ajoute une entrée au journal et la renvoie. Avec `body` (texte complet d'une annonce), elle est
   * non lue tant qu'on ne l'a pas marquée lue ; sans, c'est un simple événement, déjà lu.
   */
  log(text, nowMs, { body = null, unread = false } = {}) {
    const id = this.journal.reduce((max, e) => Math.max(max, e.id), 0) + 1;
    const entry = { id, t: nowMs, text };
    if (body) entry.body = body;
    if (unread) entry.unread = true;
    this.journal.push(entry);
    if (this.journal.length > JOURNAL_LIMIT) this.journal.splice(0, this.journal.length - JOURNAL_LIMIT);
    return entry;
  }

  unreadCount() {
    return this.journal.filter((e) => e.unread).length;
  }

  /** Marque une entrée lue ; renvoie vrai si elle était non lue. */
  markRead(id) {
    const entry = this.journal.find((e) => e.id === id);
    if (!entry?.unread) return false;
    delete entry.unread;
    return true;
  }

  markAllRead() {
    for (const entry of this.journal) delete entry.unread;
  }

  serialize() {
    return JSON.stringify({
      version: 1,
      coins: this.coins,
      owned: this.owned,
      journal: this.journal,
      stats: this.stats.serialize(),
      unlocked: [...this.unlocked],
      achievementCount: this.achievementCount,
    });
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
