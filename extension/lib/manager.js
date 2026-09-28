// Orchestrates the simulation: owns the Critter instances (pure core) and
// their CritterActor (rendering), runs the tick loop, and translates the
// desktop's state (sensors.js) into `surfaces` every frame.

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// NB: these imports target the layout of the package ASSEMBLED by
// scripts/build.sh (where core/ is copied directly to the extension's
// root), not the source repo's layout (where core/ is a folder next to
// extension/). The extension never runs from the source tree as-is:
// development always goes through `scripts/build.sh --link`, which
// rebuilds dist/<uuid>/ on every call.
import { Critter, Locomotion, behaviorOverrides } from '../core/critter.js';
import { serializeCritters, parseSavedState } from '../core/persistence.js';
import { needsOverrides } from '../core/needs.js';
import { Life, stagesOverrides } from '../core/life.js';
import { isNight, BreakTracker, IdleTracker } from '../core/rhythm.js';
import { Player } from '../core/player.js';
import { tricksOverrides } from '../core/tricks.js';
import { PreySpawner, pickSpawnPoint, PREY, FLEE_ANIMAL_RADIUS, FLEE_POINTER_RADIUS } from '../core/prey.js';
import { namesOverrides, pickName, sanitizeName, uniqueName } from '../core/names.js';
import { anchorsOverrides, shopList, equippable, trophiesFor, accessoryLabel, ACCESSORIES, FOOD_PRICES } from '../core/accessories.js';
import {
  buildAchievements, speciesProfile, newlyUnlocked, titlesFor, achievementView, achievementCount,
} from '../core/achievements.js';
import { openBox } from '../core/lootBoxes.js';
import { announceUnlock, announceBurst, announceTrophy } from '../core/narrator.js';
import { stageLabel } from '../core/labels.js';
import { _, ngettext, fmt } from '../core/i18n.js';
import { translationsOverrides } from '../core/packTranslations.js';
import { computeSurfaces } from '../core/surfaceMap.js';
import {
  createItem, fillBowl, tickItem, FOODS, PLANTS, TOYS, isGone, isToy, rescueItem, regroundItem, serializeItems, parseSavedItems, GIFTS,
  pickVariant, toyFits, BOWL_CAPACITY,
} from '../core/items.js';
import { getMonitors, getWindows, getPointer, computeWorldBounds } from './sensors.js';
import { CritterActor } from './critterActor.js';
import { loadBubbleIcons } from './thoughtBubble.js';
import { addIndicator } from './panelIndicator.js';
import { loadVariantSheet } from './packLoader.js';
import { ActivitySensor } from './activitySensor.js';
import { ItemActor, LaserDot, loadItemImages } from './itemActor.js';
import { loadAccessoryImages } from './accessoryActor.js';
import { RenameDialog } from './renameDialog.js';
import { ProgressDialog } from './progressDialog.js';
import { Notifier } from './notifier.js';

const SAVE_INTERVAL_S = 30;
const DIFFICULTY_SCALE = { relaxed: 0.4, normal: 1, strict: 2 };
const RESUME_GAP_S = 3; // a gap this long between two frames (wall clock) signals sleep
const SETTLE_S = 2.5; // after sleep or a screen change: let the desktop settle
const TICK_INTERVAL_MS = 33; // ~30 fps; enough for a pixel-art sprite, light on the CPU
const BURST_SIZE = 3; // beyond that, an achievement burst gets only one notification
const OVERFED_SATIETY = 95; // feeding a critter this full is a blunder

export class Manager {
  /**
   * @param {ReturnType<typeof import('./packLoader.js').loadPack>} pack
   * @param {Gio.Settings} settings
   * @param {{extensionPath: string, uuid: string, openSettings?: () => void}} extension
   */
  constructor(pack, settings, { extensionPath, uuid, openSettings = () => {} }) {
    this.pack = pack;
    this.settings = settings;
    this._extensionPath = extensionPath;
    this._uuid = uuid;
    this._openSettings = openSettings;
    this._indicator = null;
    this._notifier = new Notifier({
      onActivated: (id) => {
        this._player.markRead(id);
        const critter = this._critters[0]?.critter;
        if (critter) this.openProgress(critter, 'journal');
      },
      onDismissed: (id) => this._player.markRead(id),
    });
    this._settingsIds = [];
    /** @type {{item: object, actor: ItemActor}[]} */
    this._items = [];
    this._itemImages = { get: () => null }; // replaced once sprites are loaded
    this._lastSavedItems = null;
    this._eggSheet = null;
    this._preySpawner = new PreySpawner();
    this._plantTimer = 0;
    this._player = new Player();
    /** Critter and player achievements, expanded from the library and the pack. */
    this._achievements = [];
    this._playerAchievements = [];
    this._vacationSince = null; // start of the current vacation (ms), for "Express vacation"
    this._lastSavedPlayer = null;
    this._sensors = null;
    this._idleTracker = new IdleTracker();
    this._breakTracker = new BreakTracker({ enabled: false });
    this._worldTimer = 0;
    this._night = false;
    this._nightHour = -1;
    /** Critter chosen for the break reminder, and the end of the reminder window (µs). */
    this._reminder = null;
    this._reminderUntilUs = 0;
    this._laser = false; // laser pointer mode, in memory only (off on every activation)
    this._laserDot = null;
    /** @type {{critter: Critter, actor: CritterActor}[]} */
    this._critters = [];
    this._timeoutId = null;
    this._saveTimeoutId = null;
    this._lastSavedState = null;
    this._lastTickUs = null;
    /** End of settling after sleep / a screen change (0: none in progress). */
    this._settleUntilUs = 0;
    this._lastRealUs = 0;
    this._pendingReground = false;
    this._monitorsChangedId = 0;
    /** @type {Set<number>|null} null until the very first tick has
     * happened, so as to never react to windows already open at startup. */
    this._knownWindowIds = null;
    /** @type {number|undefined} id of the focused window on the previous
     * tick (undefined until the very first tick has happened, see above). */
    this._lastFocusedWindowId = undefined;
    /** Window that just took focus, exposed to critters as long as
     * `_focusedWindowExpiryUs` isn't past (a fleeting opportunity, not a
     * permanent target like the pointer is for FOLLOW). */
    this._focusedWindow = null;
    this._focusedWindowExpiryUs = 0;
  }

  spawn(count = 1) {
    const monitors = getMonitors();
    const bounds = computeWorldBounds(monitors);

    const behavior = behaviorOverrides(this.pack.behavior);
    if (behavior.ignored.length > 0) {
      console.warn(
        `Critter: pack "${this.pack.meta.id}", "behavior" keys ignored: ${behavior.ignored.join(', ')}`,
      );
    }

    const needs = needsOverrides(this.pack.needs);
    if (needs.ignored.length > 0) {
      console.warn(`Critter: pack "${this.pack.meta.id}", "needs" keys ignored: ${needs.ignored.join(', ')}`);
    }
    this._accessoryImages = loadAccessoryImages(GLib.build_filenamev([this._extensionPath, 'assets', 'accessories']));
    const anchors = anchorsOverrides(this.pack.meta.anchors);
    if (anchors.ignored.length > 0) {
      console.warn(`Critter: pack "${this.pack.meta.id}", "anchors" keys ignored: ${anchors.ignored.join(', ')}`);
    }
    this._itemImages = loadItemImages(GLib.build_filenamev([this._extensionPath, 'assets', 'items']));
    const laser = this._itemImages.get('laser');
    if (laser) this._laserDot = new LaserDot(laser);
    try {
      this._eggSheet = loadVariantSheet(GLib.build_filenamev([this._extensionPath, 'assets', 'life', 'egg.png']));
    } catch (e) {
      console.warn(`Critter: egg sprite unavailable (${e.message})`);
    }
    const stages = stagesOverrides(this.pack.meta.stages);
    if (stages.ignored.length > 0) {
      console.warn(`Critter: pack "${this.pack.meta.id}", "stages" keys ignored: ${stages.ignored.join(', ')}`);
    }
    const translations = translationsOverrides(this.pack.meta.translations);
    if (translations.ignored.length > 0) {
      console.warn(`Critter: pack "${this.pack.meta.id}", translations ignored: ${translations.ignored.join(', ')}`);
    }
    const namesList = namesOverrides(this.pack.meta.names).list;
    const achievements = buildAchievements(this.pack.meta.achievements, speciesProfile(this.pack.meta));
    if (achievements.ignored.length > 0) {
      console.warn(`Critter: pack "${this.pack.meta.id}", achievements ignored: ${achievements.ignored.join(', ')}`);
    }
    this._achievements = achievements.critter;
    this._playerAchievements = achievements.player;
    const tricks = tricksOverrides(this.pack.meta.tricks);
    if (tricks.ignored.length > 0) {
      console.warn(`Critter: pack "${this.pack.meta.id}", tricks ignored: ${tricks.ignored.join(', ')}`);
    }
    this._player = Player.parse(this.settings.get_string('saved-player'));
    const growthEnabled = this.settings.get_boolean('growth-enabled');
    const hueRange = this.pack.appearance.enabled ? this.pack.appearance.hueRange : [0, 0];
    const bubbleIcons = loadBubbleIcons(GLib.build_filenamev([this._extensionPath, 'assets', 'bubbles']));

    const saved = parseSavedState(this.settings.get_string('saved-state'), {
      packId: this.pack.meta.id,
      bounds,
    });

    for (let i = 0; i < count; i++) {
      const startX = bounds.x + bounds.width * (0.3 + 0.1 * i);
      // critter.y is the feet's position (see CritterActor.syncPosition,
      // which places the sprite at critter.y - height): starting exactly
      // at bounds.y would put the whole sprite off-screen above the
      // monitor during the initial fall. It's offset by one sprite height
      // so it's visible from the very first frame, at the very top of the
      // screen.
      const startY = bounds.y + this.pack.spriteSize.height;

      const critter = new Critter(
        {
          // First: the pack's `speeds` and locomotions, set afterward,
          // keep priority over any equivalent keys.
          ...behavior.config,
          needsRates: needs.rates,
          needsDiet: needs.diet,
          needsPrey: needs.prey,
          autonomyMode: this.settings.get_string('autonomy'),
          lifeAgeScale: this._lifeAgeScale(),
          achievements: this._achievements,
          tricks: tricks.list,
          stageScales: stages.scales,
          needsRateScale: this._needsRateScale(),
          speciesId: this.pack.meta.id,
          walkSpeed: this.pack.speeds.walk ?? 40,
          climbSpeed: this.pack.speeds.climb ?? 30,
          swimSpeed: this.pack.speeds.swim ?? 25,
          flySpeed: this.pack.speeds.fly ?? 60,
          supportedSurfaces: new Set(
            [...this.pack.supportedSurfaces].map((s) => Locomotion[s.toUpperCase()] ?? s),
          ),
        },
        { x: startX, y: startY },
      );

      // A new critter is born as an egg (if growth is active); a save
      // from before growth existed turns it into an adult with a random trait.
      critter.setLife(
        Life.create(Math.random, { growth: growthEnabled && !saved[i], hueRange, scales: stages.scales }),
      );
      if (saved[i]) critter.restore(saved[i], { elapsedSeconds: saved[i].elapsedSeconds });
      // Name: the saved one, otherwise drawn from the species' list among the free ones.
      if (!critter.name) {
        const taken = this._critters.map((e) => e.critter.name).filter(Boolean);
        critter.setName(pickName(Math.random, namesList, taken));
      }
      if (!saved[i] && growthEnabled) this._player.log(fmt(_('Un œuf est déposé : {name}.'), { name: critter.name }), Date.now());

      const actor = new CritterActor(critter, this.pack, this.settings, bubbleIcons, this._menuOwner(), this._eggSheet);
      actor.attachAccessories(this._accessoryImages, anchors.anchors);
      // GNOME 50 (layout.js): addChrome() automatically includes the actor
      // in the input region based on its size/position/visibility; the
      // affectsInputRegion parameter no longer exists (Params.parse
      // rejects any unknown key). Only trackFullscreen/affectsStruts remain.
      Main.layoutManager.addChrome(actor.actor);

      this._critters.push({ critter, actor });
    }

    for (const item of parseSavedItems(this.settings.get_string('saved-items'), { bounds })) this._addItem(item);

    for (const key of ['difficulty', 'vacation-mode']) {
      this._settingsIds.push(this.settings.connect(`changed::${key}`, () => this._applyNeedsRateScale()));
    }
    for (const key of ['vacation-mode', 'growth-enabled', 'growth-speed']) {
      this._settingsIds.push(this.settings.connect(`changed::${key}`, () => this._applyLifeAgeScale()));
    }
    this._settingsIds.push(this.settings.connect('changed::autonomy', () => this._applyAutonomy()));
    this._settingsIds.push(this.settings.connect('changed::vacation-mode', () => this._onVacationChanged()));
    this._settingsIds.push(this.settings.connect('changed::show-indicator', () => this._syncIndicator()));
    this._syncIndicator();

    this._sensors = new ActivitySensor({
      onNotification: () => this._broadcast('notification', 'react-notifications'),
      onTyping: () => this._broadcast('typing', 'react-typing'),
    });
    for (const [key, apply] of [
      ['react-notifications', (on) => this._sensors.setNotifications(on)],
      ['react-typing', (on) => this._sensors.setTyping(on)],
    ]) {
      apply(this.settings.get_boolean(key));
      this._settingsIds.push(this.settings.connect(`changed::${key}`, () => apply(this.settings.get_boolean(key))));
    }
  }

  /** World event (notification, typing, player's return) passed on to the critters. */
  _broadcast(kind, settingKey = null) {
    if (settingKey && !this.settings.get_boolean(settingKey)) return;
    for (const { critter } of this._critters) critter.interact(kind);
  }

  /**
   * World rhythm, once per second: player's absence and return, time of
   * day (night), break tracking. Nothing is read beyond the idle time and
   * the local hour.
   */
  _worldTick(dt, nowUs) {
    this._worldTimer += dt;
    if (this._worldTimer < 1 || !this._sensors) return;
    const elapsed = this._worldTimer;
    this._worldTimer = 0;
    const idle = this._sensors.idleSeconds();

    this._idleTracker.awayAfter = this.settings.get_int('away-minutes') * 60;
    const transition = this._idleTracker.update(idle);
    if (transition === 'returned' && this.settings.get_boolean('away-sleep')) this._broadcast('userReturned');

    const hour = GLib.DateTime.new_now_local().get_hour();
    if (hour !== this._nightHour) {
      this._nightHour = hour;
      this._night = isNight(hour);
    }

    this._breakTracker.enabled = this.settings.get_boolean('break-reminder');
    this._breakTracker.interval = this.settings.get_int('break-minutes') * 60;
    if (this._breakTracker.advance(elapsed, idle) === 'remind') {
      this._reminder =
        this._critters.find(({ critter }) => critter.life.stage !== 'egg' && !critter.life.hibernating)?.critter ?? null;
      this._reminderUntilUs = nowUs + 90_000_000;
    }
    if (!this._breakTracker.enabled || nowUs > this._reminderUntilUs) this._reminder = null;
    this._evaluatePlayer(nowUs);
  }

  /** Player achievements (menu gestures, cluttered desktop...), once per second. */
  _evaluatePlayer(nowUs) {
    const count = (type) => this._items.filter(({ item }) => item.type === type && !item.removed).length;
    if (count('bed') >= 10) this._player.stats.mark('desk', 'beds');
    if (count('toy') >= 20) this._player.stats.mark('desk', 'toys');
    if (count('bowl') >= 5) this._player.stats.mark('desk', 'bowls');
    const ids = newlyUnlocked(this._playerAchievements, { facts: this._player.progressFacts() }, this._player.unlocked);
    if (ids.length === 0) return;
    for (const id of ids) this._player.unlocked.add(id);
    const defs = ids.map((id) => this._playerAchievements.find((def) => def.id === id));
    this._announce(defs, { who: null, key: 'player', nowSeconds: nowUs / 1_000_000 });
  }

  /** Vacation: counted at the start; a return in under a minute is a blunder. */
  _onVacationChanged() {
    if (this.settings.get_boolean('vacation-mode')) {
      this._player.stats.add('vacations');
      this._vacationSince = Date.now();
    } else if (this._vacationSince !== null) {
      if (Date.now() - this._vacationSince < 60_000) this._player.stats.mark('moment', 'short-vacation');
      this._vacationSince = null;
    }
  }

  /** Player gesture counted toward their achievements (opening a menu...), with the 3 am blunder. */
  _noteMenuOpen(key) {
    this._player.stats.add(key);
    if (new Date().getHours() === 3) this._player.stats.mark('moment', 'night-menu');
  }

  /** Debits `price` coins; without enough coins, warns and refuses. */
  _pay(price) {
    if (price <= 0) return true;
    if (this._player.spend(price)) {
      this._player.stats.add('coinsSpent', price);
      if (this._player.coins === 0) this._player.stats.mark('state', 'broke');
      return true;
    }
    Main.notify('Critter', fmt(_('Pièces insuffisantes ({price} nécessaires, {coins} en poche).'), { price, coins: this._player.coins }));
    return false;
  }

  buyAccessory(id) {
    const def = ACCESSORIES[id];
    if (!def || this._player.owns(id) || def.price === 0) return;
    if (!this._pay(def.price)) return;
    this._player.own(id);
    if (id === 'crown') this._player.stats.mark('shop', 'crown');
    const label = accessoryLabel(id);
    this._player.log(fmt(_('Accessoire acheté : {accessory}.'), { accessory: label }), Date.now());
    Main.notify('Critter', fmt(_('{accessory} acheté (-{price} pièces).'), { accessory: label, price: def.price }));
  }

  /** A critter's name in messages: the species, numbered if there are several. */
  _nameOf(index) {
    return this._critters[index]?.critter.name ?? this.pack.meta.displayName ?? this.pack.meta.id;
  }

  /** "Feed" button: the free food the species prefers (otherwise the cheapest), dropped near it. */
  quickFeed(critter) {
    const kinds = Object.entries(critter.config.needsDiet)
      .filter(([kind]) => FOODS[kind]) // diet plants aren't placed like a food
      .sort((a, b) => b[1] - a[1])
      .map(([kind]) => kind);
    const kind = kinds.find((k) => !(FOOD_PRICES[k] > 0)) ?? kinds.sort((a, b) => (FOOD_PRICES[a] ?? 0) - (FOOD_PRICES[b] ?? 0))[0];
    if (kind) this._feed(kind, critter);
  }

  /** Places a food (paid for if premium) near the critter; feeding a full critter is counted. */
  _feed(kind, critter) {
    if (!this._pay(FOOD_PRICES[kind] ?? 0)) return;
    if (critter && critter.needs.values.satiety >= OVERFED_SATIETY) critter.noteAction('overfeed');
    this._dropNear('food', kind, critter);
  }

  /** Detail window: achievements by category (the critter's, then your own), statistics, log. */
  openProgress(critter, tab) {
    this._player.stats.add(tab === 'journal' ? 'journalOpens' : 'progressOpens');
    const facts = critter.progressFacts();
    const mine = achievementView(this._achievements, { trait: critter.life.trait, unlocked: critter.unlocked, facts });
    const yours = achievementView(this._playerAchievements, { unlocked: this._player.unlocked, facts: this._player.progressFacts() });
    const { stageReached, tricksLearned, achievementsUnlocked, ...values } = facts.stats;
    new ProgressDialog({
      title: fmt(_('{name} — progression'), { name: critter.name ?? _('Sans nom') }),
      tab,
      achievements: {
        done: mine.done + yours.done,
        total: mine.total + yours.total,
        categories: [...mine.categories, ...yours.categories],
      },
      stats: Object.entries(values),
      journal: this._player.journal,
      onRead: (id) => this.readJournalEntry(id),
      onReadAll: () => this.readAllJournal(),
    }).open();
  }

  /** Opens the dialog to rename a creature. */
  openRename(critter) {
    new RenameDialog(critter.name ?? '', (text) => this.rename(critter, text)).open();
  }

  /** Renames (cleaned up, unique among the displayed critters) and logs it. */
  rename(critter, text) {
    const clean = sanitizeName(text);
    if (clean === null || clean === critter.name) return;
    const taken = this._critters.map((e) => e.critter.name).filter((n) => n && n !== critter.name);
    const previous = critter.name;
    critter.setName(uniqueName(clean, taken));
    this._player.log(fmt(_('{previous} est rebaptisé(e) {name}.'), { previous: previous ?? _('Une créature'), name: critter.name }), Date.now());
  }

  /** Achievements earned / possible for a critter (matching species and trait). */
  achievementSummary(critter) {
    return achievementCount(this._achievements, { trait: critter.life.trait, unlocked: critter.unlocked });
  }

  /** Text of the title worn by a critter, or null. */
  titleOf(critter) {
    return this._achievements.find((def) => def.id === critter.title)?.title ?? null;
  }

  /**
   * Rewards, log entries, and Committee announcements for achievements
   * just earned (by a critter, or by the player when `who` is null).
   */
  _announce(defs, { who, key, nowSeconds }) {
    let coins = 0;
    const outcomes = defs.map((def) => {
      const outcome = this._grant(def, key, nowSeconds);
      coins += outcome.coins;
      return outcome;
    });
    const subject = who ?? _('Toi');
    if (defs.length > BURST_SIZE) {
      const line = fmt(ngettext("{name} : {count} succès d'un coup.", "{name} : {count} succès d'un coup.", defs.length), { name: subject, count: defs.length });
      this._announceEntry(line, announceBurst({ who, defs, coins }));
    } else {
      defs.forEach((def, i) => {
        const line = def.troll ? _('{name} : bêtise « {achievement} ».') : _('{name} : succès « {achievement} ».');
        this._announceEntry(fmt(line, { name: subject, achievement: def.name }), announceUnlock({ def, who, outcome: outcomes[i] }));
      });
    }
    this._player.achievementCount += defs.length;
    for (const trophy of trophiesFor(this._player.achievementCount)) {
      if (this._player.owns(trophy.id)) continue;
      this._player.own(trophy.id);
      this._announceEntry(
        fmt(_('Trophée obtenu : {trophy}.'), { trophy: trophy.label }),
        announceTrophy({ label: trophy.label, count: ACCESSORIES[trophy.id].trophy }),
      );
    }
  }

  /** Logs an announcement (unread, full text) and notifies it in GNOME's list. */
  _announceEntry(line, { title, body }) {
    const entry = this._player.log(line, Date.now(), { body, unread: true });
    this._notifier?.notify(entry.id, title, body);
  }

  unreadCount() {
    return this._player.unreadCount();
  }

  readJournalEntry(id) {
    this._player.markRead(id);
  }

  readAllJournal() {
    this._player.markAllRead();
  }

  /** Applies an achievement's reward and describes what happened (for the announcement). */
  _grant(def, key, nowSeconds) {
    const reward = def.reward ?? {};
    const outcome = { coins: 0 };
    if (reward.coins > 0) outcome.coins = this._player.award(`achievement:${key}:${def.id}`, reward.coins, nowSeconds);
    else if (reward.coins < 0) outcome.paid = this._player.spend(-reward.coins); // filing fee, if it can be paid
    if (reward.box) {
      outcome.box = openBox(reward.box, Math.random, { owned: this._player.owned });
      if (outcome.box.coins > 0) outcome.coins += this._player.award(`box:${key}:${def.id}`, outcome.box.coins, nowSeconds);
      if (outcome.box.accessory) this._player.own(outcome.box.accessory);
    }
    if (reward.accessory) {
      this._player.own(reward.accessory);
      outcome.accessoryLabel = accessoryLabel(reward.accessory);
    }
    return outcome;
  }

  /**
   * A critter's progression after its tick: coins from events, log,
   * achievements (coins, log entry, notification).
   */
  _processProgress(index, critter, snapshot, nowUs) {
    const name = this._nameOf(index);
    const nowSeconds = nowUs / 1_000_000;
    const event = snapshot.event;
    if (event) {
      this._player.awardEvent(`${index}`, event, nowSeconds);
      if (event === 'hatched') this._player.log(fmt(_('{name} a éclos.'), { name }), Date.now());
      else if (event === 'birthday') this._player.log(fmt(_('{name} fête son anniversaire !'), { name }), Date.now());
      else if (event === 'grew') this._player.log(fmt(_('{name} devient {stage}.'), { name, stage: stageLabel(snapshot.stage).toLowerCase() }), Date.now());
    }
    if (event === 'trickLearned') this._player.log(fmt(_('{name} a appris un tour.'), { name }), Date.now());
    const mess = critter.takeMess();
    if (mess) this._addItem(createItem('mess', null, mess.x, mess.y - 4));
    const gift = critter.takeGift();
    if (gift) this._addItem(createItem('gift', gift.kind, gift.x, gift.y));
    const defs = critter.takeUnlocked().map((id) => this._achievements.find((def) => def.id === id)).filter(Boolean);
    if (defs.length > 0) this._announce(defs, { who: name, key: `${index}`, nowSeconds });
  }

  /** Prey species hunted by the displayed critter (the pack's `needs.prey` section). */
  _preyKinds() {
    return Object.keys(this._critters[0]?.critter.config.needsPrey ?? {});
  }

  /** Plants the species nibbles (its diet, restricted to known plants). */
  _plantKinds() {
    return Object.keys(this._critters[0]?.critter.config.needsDiet ?? {}).filter((kind) => PLANTS[kind]);
  }

  /**
   * Prey and plants of an autonomous world: a prey spawns every so often
   * (if the setting is on and a critter is autonomous enough), and two
   * plants are kept maintained. Objects fall from a surface.
   */
  _autonomyTick(dt, surfaces, worldBounds) {
    const maxAutonomy = this._critters.reduce((m, { critter }) => Math.max(m, critter.autonomy), 0);
    const preyKinds = this._preyKinds();
    const preyCount = this._items.filter(({ item }) => item.type === 'prey' && !item.removed && !item.consumed).length;
    const spawn = this._preySpawner.advance(dt, {
      count: preyCount,
      enabled: this.settings.get_boolean('prey-spawn') && maxAutonomy > 0.3 && preyKinds.length > 0,
    });
    if (spawn) {
      const kind = preyKinds[Math.floor(Math.random() * preyKinds.length)];
      const point = pickSpawnPoint(surfaces, Math.random, { floating: PREY[kind].floats, bounds: worldBounds });
      if (point) this._addItem(createItem('prey', kind, point.x, point.y));
    }

    this._plantTimer += dt;
    if (this._plantTimer < 5) return;
    this._plantTimer = 0;
    const plantKinds = this._plantKinds();
    const plants = this._items.filter(({ item }) => item.type === 'plant' && !item.removed).length;
    if (this.settings.get_boolean('decor-plants') && maxAutonomy > 0 && plantKinds.length > 0 && plants < 2) {
      const kind = plantKinds[0];
      const point = pickSpawnPoint(surfaces, Math.random, { floating: PLANTS[kind].floats, bounds: worldBounds });
      if (point) this._addItem(createItem('plant', kind, point.x, point.y));
    }
  }

  /** World context as seen by a critter: night, away, break reminder (its own only). */
  _ambientFor(critter) {
    return {
      night: this.settings.get_boolean('day-night') && this._night,
      away: this.settings.get_boolean('away-sleep') && this._idleTracker.away,
      breakReminder: this._reminder === critter,
    };
  }

  /** Chosen difficulty, or 0 in vacation mode (everything frozen). */
  _needsRateScale() {
    if (this.settings.get_boolean('vacation-mode')) return 0;
    return DIFFICULTY_SCALE[this.settings.get_string('difficulty')] ?? 1;
  }

  /** Growth speed: chosen setting, 0 during vacation or with growth disabled. */
  _lifeAgeScale() {
    if (this.settings.get_boolean('vacation-mode') || !this.settings.get_boolean('growth-enabled')) return 0;
    return this.settings.get_double('growth-speed');
  }

  _applyAutonomy() {
    const mode = this.settings.get_string('autonomy');
    for (const { critter } of this._critters) critter.setAutonomyMode(mode);
  }

  _applyLifeAgeScale() {
    const scale = this._lifeAgeScale();
    for (const { critter } of this._critters) critter.setLifeAgeScale(scale);
  }

  _applyNeedsRateScale() {
    const scale = this._needsRateScale();
    for (const { critter } of this._critters) critter.setNeedsRateScale(scale);
  }

  _syncIndicator() {
    const wanted = this.settings.get_boolean('show-indicator');
    if (wanted && !this._indicator && this._critters.length > 0) {
      this._indicator = addIndicator(
        {
          getCritters: () => this._critters.map(({ critter }) => critter),
          title: this.pack.meta.displayName ?? this.pack.meta.id,
          ...this._menuOwner(),
          getPlayer: () => this._player,
          achievementSummary: (critter) => this.achievementSummary(critter),
          foods: () => this._foods(),
          clearItems: () => this.clearItems(),
        },
        this.settings,
        this._uuid,
      );
    } else if (!wanted && this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }

  // --- Desktop objects ---------------------------------------------------

  /** Actions offered to the menus (a critter's context menu and the tray icon). */
  _menuOwner() {
    return {
      rename: (critter) => this.openRename(critter),
      openSettings: () => {
        this._player.stats.add('settingsOpens');
        this._openSettings();
      },
      unreadCount: () => this.unreadCount(),
      noteMenuOpen: () => this._noteMenuOpen('menuOpens'),
      noteContextMenuOpen: () => this._noteMenuOpen('contextMenuOpens'),
      titles: (critter) => titlesFor(this._achievements, critter.unlocked),
      setTitle: (critter, id) => critter.setTitle(id),
      titleOf: (critter) => this.titleOf(critter),
      openProgress: (critter, tab) => this.openProgress(critter, tab),
      quickFeed: (critter) => this.quickFeed(critter),
      pet: (critter) => (critter.life.hibernating ? critter.wake() : critter.pet()),
      dropFood: (kind, critter) => this._feed(kind, critter),
      fillBowl: (kind, critter) => {
        if (this._pay((FOOD_PRICES[kind] ?? 0) * 5)) this._fillBowl(kind, critter);
      },
      train: (critter, name) => critter.trainTrick(name),
      perform: (critter, name) => critter.performTrick(name),
      equippable: () => equippable(new Date(), this._player.owned),
      equip: (critter, id) => critter.equip(id),
      shopList: () => shopList(new Date(), this._player.owned),
      buyAccessory: (id) => this.buyAccessory(id),
      dropBed: (critter, model) => this._dropNear('bed', null, critter, model),
      dropBowl: (critter, model) => this._dropNear('bowl', null, critter, model),
      dropToy: (kind, critter) => this._dropNear('toy', kind, critter, pickVariant(kind)),
      toyKinds: () => this._toyKinds(),
      brush: (critter) => critter.brush(),
      preyKinds: () => this._preyKinds(),
      plantKinds: () => this._plantKinds(),
      dropLitter: () => this._dropNear('litter', null, null),
      cleanAll: () => this.cleanAll(),
      dropPrey: (kind) => {
        this._player.stats.add('preyDrops');
        this._dropNear('prey', kind ?? this._preyKinds()[0], null);
      },
      dropPlant: (kind) => this._dropNear('plant', kind ?? this._plantKinds()[0], null),
      wake: (critter) => critter.wake(),
      setLaser: (on) => this.setLaser(on),
      isLaser: () => this._laser,
      hasToys: () => this._items.some(({ item }) => isToy(item) && !item.removed),
      clearToys: () => this.clearToys(),
    };
  }

  /** Foods known by the displayed critters (excluding plants, placed separately), most liked first. */
  _foods() {
    const diet = {};
    for (const { critter } of this._critters) {
      for (const [kind, gain] of Object.entries(critter.config.needsDiet)) {
        if (FOODS[kind]) diet[kind] = Math.max(diet[kind] ?? 0, gain);
      }
    }
    return Object.entries(diet).sort((a, b) => b[1] - a[1]).map(([kind]) => kind);
  }

  /** Toys suited to the displayed species: floating ones for a groundless species, placed ones otherwise. */
  _toyKinds() {
    const critter = this._critters[0]?.critter;
    const groundless = critter ? !critter.supports(Locomotion.GROUND) : false;
    return Object.keys(TOYS).filter((kind) => toyFits(kind, groundless));
  }

  _addItem(item) {
    const actor = new ItemActor(item, this._itemImages);
    Main.layoutManager.addChrome(actor.actor);
    this._items.push({ item, actor });
    return item;
  }

  /** Drops an object right next to (above) the critter, it falls back down; `model`: model or variant. */
  _dropNear(type, kind, critter, model = null) {
    const bounds = computeWorldBounds(getMonitors());
    // Without a specific critter (global menu): falls from the top of the screen, at the cursor's x position.
    const anchor = critter ?? { x: getPointer().x, y: bounds.y + 110, facing: 0 };
    const x = Math.min(Math.max(anchor.x + anchor.facing * 48, bounds.x + 16), bounds.x + bounds.width - 16);
    const y = Math.max(bounds.y + 20, anchor.y - 90);
    return this._addItem(createItem(type, kind, x, y, model));
  }

  _fillBowl(kind, critter) {
    const reference = critter ?? getPointer();
    const bowls = this._items.map((e) => e.item).filter((i) => i.type === 'bowl' && !i.removed);
    const bowl =
      bowls.sort((a, b) => Math.abs(a.x - reference.x) - Math.abs(b.x - reference.x))[0] ??
      this._dropNear('bowl', kind, critter);
    if (bowl.kind === kind && bowl.portions >= BOWL_CAPACITY) this._player.stats.add('bowlOverfills');
    fillBowl(bowl, kind);
  }

  clearItems() {
    this._player.stats.add('clears');
    for (const { item } of this._items) item.removed = true;
  }

  /** "Tidy up toys": removes toys only (not the bowl, bed, or food). */
  /** "Clean up messes": removes every mess and resets litter boxes to zero (no coins). */
  cleanAll() {
    for (const { item } of this._items) {
      if (item.type === 'mess') item.removed = true;
      else if (item.type === 'litter') item.cleaned = true;
    }
  }

  clearToys() {
    this._player.stats.add('tidies');
    for (const { item } of this._items) if (isToy(item)) item.removed = true;
  }

  setLaser(on) {
    if (on && !this._laser) this._player.stats.add('laserToggles');
    this._laser = Boolean(on);
  }

  _removeGoneItems() {
    this._items = this._items.filter((entry) => {
      const { item } = entry;
      if (!isGone(item)) return true;
      if (item.collected && item.type === 'gift') {
        const coins = GIFTS[item.kind]?.coins ?? 0;
        this._player.award('gift', coins, 0);
        this._player.stats.add('giftsCollected');
        this._player.log(fmt(ngettext('Cadeau ramassé : +{coins} pièce.', 'Cadeau ramassé : +{coins} pièces.', coins), { coins }), Date.now());
      } else if (item.collected && item.type === 'mess') {
        this._player.award('clean', 1, 0); // a good deed: one coin per mess cleaned up
        this._player.stats.add('messesCleaned');
        if (item.age < 3) this._player.stats.mark('moment', 'fast-clean');
      }
      if (item.removedByPlayer) this._player.stats.add('itemsRemoved');
      if (item.removed && item.type === 'food' && !item.consumed && item.claimedBy) {
        this._player.stats.mark('moment', 'food-thief');
      }
      Main.layoutManager.removeChrome(entry.actor.actor);
      entry.actor.destroy();
      return false;
    });
  }

  start() {
    if (this._timeoutId) return;
    this._lastTickUs = GLib.get_monotonic_time();
    this._lastRealUs = GLib.get_real_time();
    this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._beginSettling());
    this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_INTERVAL_MS, () => {
      this._tick();
      return GLib.SOURCE_CONTINUE;
    });
    this._saveTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, SAVE_INTERVAL_S, () => {
      this._saveState();
      return GLib.SOURCE_CONTINUE;
    });
  }

  _saveState() {
    const json = serializeCritters(
      this.pack.meta.id,
      this._critters.map(({ critter }) => critter),
    );
    if (json !== this._lastSavedState) {
      this._lastSavedState = json;
      this.settings.set_string('saved-state', json);
    }

    const playerJson = this._player.serialize();
    if (playerJson !== this._lastSavedPlayer) {
      this._lastSavedPlayer = playerJson;
      this.settings.set_string('saved-player', playerJson);
    }

    const itemsJson = serializeItems(this._items.map(({ item }) => item));
    if (itemsJson !== this._lastSavedItems) {
      this._lastSavedItems = itemsJson;
      this.settings.set_string('saved-items', itemsJson);
    }
  }

  stop() {
    if (this._monitorsChangedId) {
      Main.layoutManager.disconnect(this._monitorsChangedId);
      this._monitorsChangedId = 0;
    }
    if (this._saveTimeoutId) {
      GLib.source_remove(this._saveTimeoutId);
      this._saveTimeoutId = null;
    }
    if (this._timeoutId) {
      GLib.source_remove(this._timeoutId);
      this._timeoutId = null;
    }
  }

  destroy() {
    if (this._critters.length > 0) this._saveState();
    this.stop();
    for (const id of this._settingsIds) this.settings.disconnect(id);
    this._settingsIds = [];
    this._indicator?.destroy();
    this._indicator = null;
    this._notifier?.destroy();
    this._notifier = null;
    this._sensors?.destroy();
    this._sensors = null;
    for (const { actor } of this._critters) {
      Main.layoutManager.removeChrome(actor.actor);
      actor.destroy();
    }
    this._critters = [];
    for (const { actor } of this._items) {
      Main.layoutManager.removeChrome(actor.actor);
      actor.destroy();
    }
    this._items = [];
    this._laserDot?.destroy();
    this._laserDot = null;
  }

  /**
   * Sleep or a screen change: GNOME reconfigures monitors and windows for a moment. Objects and
   * critters are frozen (nothing falls onto a transient surface: top bar, window), then
   * everything is put back on the ground once the geometry is stable.
   */
  _beginSettling() {
    this._settleUntilUs = GLib.get_monotonic_time() + SETTLE_S * 1_000_000;
    this._pendingReground = true;
  }

  _reground(monitors) {
    for (const { item } of this._items) regroundItem(item, monitors);
    for (const { critter } of this._critters) critter.regroundAfterResume(monitors);
  }

  _tick() {
    const nowUs = GLib.get_monotonic_time();
    const dt = Math.min((nowUs - this._lastTickUs) / 1_000_000, 0.25); // clamp against catch-up after a pause
    this._lastTickUs = nowUs;

    // CLOCK_MONOTONIC (get_monotonic_time) stops during sleep: only the wall clock sees it.
    const realUs = GLib.get_real_time();
    if ((realUs - this._lastRealUs) / 1_000_000 > RESUME_GAP_S) this._beginSettling();
    this._lastRealUs = realUs;
    if (nowUs < this._settleUntilUs) return;

    const monitors = getMonitors();
    if (this._pendingReground) {
      this._pendingReground = false;
      this._reground(monitors);
    }
    const windows = getWindows();
    const surfaces = computeSurfaces({ monitors, windows });
    const worldBounds = computeWorldBounds(monitors);
    const pointer = getPointer();

    // A window appearing between two ticks (no new sensor needed:
    // getWindows() is already called every frame) startles the critters.
    // this._knownWindowIds stays null on the very first tick so as not to
    // react to windows already there when the extension starts.
    const currentWindowIds = new Set(windows.map((w) => w.id));
    if (this._knownWindowIds) {
      const hasNewWindow = [...currentWindowIds].some((id) => !this._knownWindowIds.has(id));
      if (hasNewWindow) {
        for (const { critter } of this._critters) critter.interact('windowOpened');
      }
    }
    this._knownWindowIds = currentWindowIds;

    // Limited freshness window after a focus change (contrasting with the
    // pointer for FOLLOW, always a valid target): past this delay without
    // an idle critter having chosen it, the opportunity expires silently
    // rather than staying a permanent target.
    const focused = windows.find((w) => w.focused) ?? null;
    if (this._lastFocusedWindowId !== undefined && focused && focused.id !== this._lastFocusedWindowId) {
      this._focusedWindow = focused;
      this._focusedWindowExpiryUs = nowUs + 5_000_000; // 5s window
    }
    this._lastFocusedWindowId = focused?.id;
    const focusedWindow =
      this._focusedWindow && nowUs < this._focusedWindowExpiryUs ? this._focusedWindow : undefined;

    // Snapshot from before this tick (positions not yet updated) so the
    // order in which critters are processed doesn't bias who "sees" whom;
    // the reference to the instance travels alongside (not in the
    // targeting computation, only so GREET can trigger a reaction on the
    // target once reached -- see Critter._tickGreet).
    // An egg isn't a neighbor: nobody will greet it or chase it.
    const others = this._critters
      .filter(({ critter }) => critter.life.stage !== 'egg')
      .map(({ critter }) => ({ x: critter.x, y: critter.y, critter }));

    // Prey threats: critters (excluding eggs) and the cursor.
    const threats = [
      ...this._critters
        .filter(({ critter }) => critter.life.stage !== 'egg')
        .map(({ critter }) => ({ x: critter.x, y: critter.y, radius: FLEE_ANIMAL_RADIUS })),
      { x: pointer.x, y: pointer.y, radius: FLEE_POINTER_RADIUS },
    ];
    for (const { item, actor } of this._items) {
      if (item.yeeted) {
        item.yeeted = false;
        this._player.stats.mark('moment', 'yeet');
      }
      rescueItem(item, monitors);
      tickItem(item, dt, surfaces, worldBounds, { threats, random: Math.random });
      actor.sync();
    }
    this._autonomyTick(dt, surfaces, worldBounds);
    this._removeGoneItems();
    const items = this._items.map(({ item }) => item);
    this._laserDot?.update(pointer, this._laser);

    this._worldTick(dt, nowUs);
    const progress = { now: Date.now() };
    this._critters.forEach(({ critter, actor }, i) => {
      const otherCritters = others.length > 1 ? others.filter((_, j) => j !== i) : undefined;
      critter.ensureVisible(monitors, this.pack.spriteSize.height);
      const ambient = this._ambientFor(critter);
      const snapshot = critter.tick(dt, surfaces, {
        worldBounds, pointer, otherCritters, focusedWindow, items, laser: this._laser, ambient, progress,
      });
      actor.setNight(ambient.night);
      this._processProgress(i, critter, snapshot, nowUs);
      if (critter.takeAcknowledgement()) {
        this._breakTracker.acknowledge();
        this._reminder = null;
      }
      actor.updateAnimation(dt, snapshot);
    });
  }
}
