// Player state: coins, purchases, journal, tracked gestures and player
// achievements. Pure module, saved separately from the animals' state
// (GSettings key `saved-player`).

import { Stats, PLAYER_STAT_KEYS } from './stats.js';

/** Coin rewards per animal event. */
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

/** Repeatable events that could otherwise be triggered in a chain: gains spaced out over time. */
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
    /** Entries `{id, t, text, body?, unread?}`; `body` = full text of an announcement, `unread` = not seen yet. */
    this.journal = [];
    if (Array.isArray(journal)) {
      const valid = journal.filter((e) => e && Number.isFinite(e.t) && typeof e.text === 'string').slice(-JOURNAL_LIMIT);
      let nextId = Math.max(0, ...valid.map((e) => (Number.isInteger(e.id) ? e.id : 0))) + 1;
      const seen = new Set();
      for (const e of valid) {
        // Older saves: no id (assigned here), entries already read.
        const id = Number.isInteger(e.id) && e.id > 0 && !seen.has(e.id) ? e.id : nextId++;
        seen.add(id);
        const entry = { id, t: e.t, text: e.text };
        if (typeof e.body === 'string' && e.body) entry.body = e.body;
        if (e.unread === true) entry.unread = true;
        this.journal.push(entry);
      }
    }
    /** Player gestures (menus, desktop...) and marks, the basis for player achievements. */
    this.stats = new Stats(PLAYER_STAT_KEYS);
    this.stats.restore(stats);
    /** Player achievements unlocked. */
    this.unlocked = new Set(Array.isArray(unlocked) ? unlocked.filter((id) => typeof id === 'string') : []);
    /** Total achievements unlocked (animals and player), which never goes down: the basis for trophies. */
    this.achievementCount = Number.isFinite(achievementCount) && achievementCount >= 0 ? Math.floor(achievementCount) : 0;
    this._lastAward = new Map();
  }

  /** Player achievement facts: counters, balance, accessories owned, marks. */
  progressFacts() {
    return {
      stats: { ...this.stats.counters, coins: this.coins, accessoriesOwned: this.owned.length },
      marks: this.stats.marks,
    };
  }

  /**
   * Credits coins; `cooldown` > 0 spaces out gains from the same source
   * (the animal and the event) to prevent chaining them in a loop.
   * @returns {number} coins actually earned
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

  /** Gain tied to an animal event (the COIN_REWARDS table, a cooldown for repeatable ones). */
  awardEvent(critterKey, event, nowSeconds) {
    const amount = COIN_REWARDS[event];
    if (!amount) return 0;
    const cooldown = COOLDOWN_EVENTS.has(event) ? COOLDOWN_SECONDS : 0;
    return this.award(`${critterKey}:${event}`, amount, nowSeconds, cooldown);
  }

  /** @returns {boolean} false (nothing debited) if the balance is insufficient */
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
   * Adds an entry to the journal and returns it. With `body` (an announcement's full text), it is
   * unread until marked as read; without, it's a plain event, already read.
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

  /** Marks an entry as read; returns true if it was unread. */
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

  /** Reads back a save, never throwing (a fresh player if unreadable). */
  static parse(text) {
    try {
      const data = JSON.parse(text);
      return data && data.version === 1 ? new Player(data) : new Player();
    } catch {
      return new Player();
    }
  }
}
