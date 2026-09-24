// Orchestre la simulation : possède les instances Critter (cœur pur) et
// leurs CritterActor (rendu), fait tourner la boucle de tick, et traduit
// l'état du bureau (sensors.js) en `surfaces` à chaque frame.

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// NB : ces imports ciblent la mise en page du paquet ASSEMBLÉ par
// scripts/build.sh (où core/ est copié directement à la racine de
// l'extension), pas la mise en page du dépôt source (où core/ est un
// dossier frère de extension/). L'extension ne s'exécute jamais depuis
// l'arborescence source telle quelle : on développe toujours via
// `scripts/build.sh --link`, qui reconstruit dist/<uuid>/ à chaque appel.
import { Critter, Locomotion, behaviorOverrides } from '../core/critter.js';
import { serializeCritters, parseSavedState } from '../core/persistence.js';
import { needsOverrides } from '../core/needs.js';
import { Life, stagesOverrides } from '../core/life.js';
import { isNight, BreakTracker, IdleTracker } from '../core/rhythm.js';
import { Player } from '../core/player.js';
import { tricksOverrides } from '../core/tricks.js';
import { PreySpawner, pickSpawnPoint, PREY, FLEE_ANIMAL_RADIUS, FLEE_POINTER_RADIUS } from '../core/prey.js';
import { namesOverrides, pickName, sanitizeName, uniqueName } from '../core/names.js';
import { anchorsOverrides, shopList, equippable, ACCESSORIES, FOOD_PRICES } from '../core/accessories.js';
import { achievementsOverrides, isEligible } from '../core/achievements.js';
import { CONDITION_STATS } from '../core/stats.js';
import { STAGE_LABELS } from './lifeLabels.js';
import { computeSurfaces } from '../core/surfaceMap.js';
import {
  createItem, fillBowl, tickItem, FOODS, PLANTS, TOYS, isGone, isToy, rescueItem, serializeItems, parseSavedItems, GIFTS,
  pickVariant, toyFits,
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

const SAVE_INTERVAL_S = 30;
const DIFFICULTY_SCALE = { relaxed: 0.4, normal: 1, strict: 2 };
const TICK_INTERVAL_MS = 33; // ~30 fps ; suffisant pour un sprite pixel-art, léger en CPU

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
    this._settingsIds = [];
    /** @type {{item: object, actor: ItemActor}[]} */
    this._items = [];
    this._itemImages = { get: () => null }; // remplacé au chargement des sprites
    this._lastSavedItems = null;
    this._eggSheet = null;
    this._preySpawner = new PreySpawner();
    this._plantTimer = 0;
    this._player = new Player();
    this._achievements = [];
    this._lastSavedPlayer = null;
    this._sensors = null;
    this._idleTracker = new IdleTracker();
    this._breakTracker = new BreakTracker({ enabled: false });
    this._worldTimer = 0;
    this._night = false;
    this._nightHour = -1;
    /** Animal chargé du rappel de pause, et fin de la fenêtre de rappel (µs). */
    this._reminder = null;
    this._reminderUntilUs = 0;
    this._laser = false; // mode pointeur laser, en mémoire seulement (éteint à chaque activation)
    this._laserDot = null;
    /** @type {{critter: Critter, actor: CritterActor}[]} */
    this._critters = [];
    this._timeoutId = null;
    this._saveTimeoutId = null;
    this._lastSavedState = null;
    this._lastTickUs = null;
    /** @type {Set<number>|null} null tant que le premier tick n'a pas eu
     * lieu, pour ne jamais réagir aux fenêtres déjà ouvertes au démarrage. */
    this._knownWindowIds = null;
    /** @type {number|undefined} id de la fenêtre focalisée au tick précédent
     * (undefined tant que le premier tick n'a pas eu lieu, cf. plus haut). */
    this._lastFocusedWindowId = undefined;
    /** Fenêtre qui vient de prendre le focus, exposée aux critters tant que
     * `_focusedWindowExpiryUs` n'est pas dépassé (opportunité passagère,
     * pas une cible permanente comme le pointeur pour FOLLOW). */
    this._focusedWindow = null;
    this._focusedWindowExpiryUs = 0;
  }

  spawn(count = 1) {
    const monitors = getMonitors();
    const bounds = computeWorldBounds(monitors);

    const behavior = behaviorOverrides(this.pack.behavior);
    if (behavior.ignored.length > 0) {
      console.warn(
        `Scamper: pack "${this.pack.meta.id}", clés "behavior" ignorées : ${behavior.ignored.join(', ')}`,
      );
    }

    const needs = needsOverrides(this.pack.needs);
    if (needs.ignored.length > 0) {
      console.warn(`Scamper: pack "${this.pack.meta.id}", clés "needs" ignorées : ${needs.ignored.join(', ')}`);
    }
    this._accessoryImages = loadAccessoryImages(GLib.build_filenamev([this._extensionPath, 'assets', 'accessories']));
    const anchors = anchorsOverrides(this.pack.meta.anchors);
    if (anchors.ignored.length > 0) {
      console.warn(`Scamper: pack "${this.pack.meta.id}", clés "anchors" ignorées : ${anchors.ignored.join(', ')}`);
    }
    this._itemImages = loadItemImages(GLib.build_filenamev([this._extensionPath, 'assets', 'items']));
    const laser = this._itemImages.get('laser');
    if (laser) this._laserDot = new LaserDot(laser);
    try {
      this._eggSheet = loadVariantSheet(GLib.build_filenamev([this._extensionPath, 'assets', 'life', 'egg.png']));
    } catch (e) {
      console.warn(`Scamper : sprite d'œuf indisponible (${e.message})`);
    }
    const stages = stagesOverrides(this.pack.meta.stages);
    if (stages.ignored.length > 0) {
      console.warn(`Scamper: pack "${this.pack.meta.id}", clés "stages" ignorées : ${stages.ignored.join(', ')}`);
    }
    const namesList = namesOverrides(this.pack.meta.names).list;
    const achievements = achievementsOverrides(this.pack.meta.achievements);
    if (achievements.ignored.length > 0) {
      console.warn(`Scamper: pack "${this.pack.meta.id}", succès ignorés : ${achievements.ignored.join(', ')}`);
    }
    this._achievements = achievements.list;
    const tricks = tricksOverrides(this.pack.meta.tricks);
    if (tricks.ignored.length > 0) {
      console.warn(`Scamper: pack "${this.pack.meta.id}", tours ignorés : ${tricks.ignored.join(', ')}`);
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
      // critter.y est la position des pieds (voir CritterActor.syncPosition,
      // qui place le sprite en critter.y - height) : partir de bounds.y pile
      // rendrait le sprite entier hors écran au-dessus du moniteur pendant
      // la chute initiale. On décale d'une hauteur de sprite pour qu'il soit
      // visible dès la première frame, tout en haut de l'écran.
      const startY = bounds.y + this.pack.spriteSize.height;

      const critter = new Critter(
        {
          // En premier : les `speeds` et locomotions du pack, posés ensuite,
          // gardent la priorité sur d'éventuelles clés équivalentes.
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

      // Un animal neuf naît en œuf (si la croissance est active) ; une
      // sauvegarde d'avant la croissance en fait un adulte au caractère tiré.
      critter.setLife(
        Life.create(Math.random, { growth: growthEnabled && !saved[i], hueRange, scales: stages.scales }),
      );
      if (saved[i]) critter.restore(saved[i], { elapsedSeconds: saved[i].elapsedSeconds });
      // Nom : celui de la sauvegarde, sinon tiré dans la liste de l'espèce parmi les noms libres.
      if (!critter.name) {
        const taken = this._critters.map((e) => e.critter.name).filter(Boolean);
        critter.setName(pickName(Math.random, namesList, taken));
      }
      if (!saved[i] && growthEnabled) this._player.log(`Un œuf est déposé : ${critter.name}.`, Date.now());

      const actor = new CritterActor(critter, this.pack, this.settings, bubbleIcons, this._menuOwner(), this._eggSheet);
      actor.attachAccessories(this._accessoryImages, anchors.anchors);
      // GNOME 50 (layout.js) : addChrome() inclut automatiquement l'acteur
      // dans la région d'input selon sa taille/position/visibilité ; le
      // paramètre affectsInputRegion n'existe plus (Params.parse rejette
      // toute clé inconnue). Seuls trackFullscreen/affectsStruts restent.
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

  /** Événement du monde (notification, frappe, retour du joueur) transmis aux animaux. */
  _broadcast(kind, settingKey = null) {
    if (settingKey && !this.settings.get_boolean(settingKey)) return;
    for (const { critter } of this._critters) critter.interact(kind);
  }

  /**
   * Rythme du monde, une fois par seconde : absence et retour du joueur,
   * heure (nuit), suivi de la pause. Rien n'est lu au-delà du temps
   * d'inactivité et de l'heure locale.
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
  }

  /** Débite `price` pièces ; sans assez de pièces, prévient et refuse. */
  _pay(price) {
    if (price <= 0) return true;
    if (this._player.spend(price)) return true;
    Main.notify('Critter', `Pièces insuffisantes (${price} nécessaires, ${this._player.coins} en poche).`);
    return false;
  }

  buyAccessory(id) {
    const def = ACCESSORIES[id];
    if (!def || this._player.owns(id) || def.price === 0) return;
    if (!this._pay(def.price)) return;
    this._player.own(id);
    this._player.log(`Accessoire acheté : ${def.label}.`, Date.now());
    Main.notify('Critter', `${def.label} acheté (-${def.price} pièces).`);
  }

  /** Nom d'un animal dans les messages : l'espèce, numérotée s'il y en a plusieurs. */
  _nameOf(index) {
    return this._critters[index]?.critter.name ?? this.pack.meta.displayName ?? this.pack.meta.id;
  }

  /** Bouton « Nourrir » : l'aliment gratuit que l'espèce préfère (à défaut le moins cher), qui tombe près d'elle. */
  quickFeed(critter) {
    const kinds = Object.entries(critter.config.needsDiet)
      .filter(([kind]) => FOODS[kind]) // les plantes du régime ne se posent pas comme un aliment
      .sort((a, b) => b[1] - a[1])
      .map(([kind]) => kind);
    const kind = kinds.find((k) => !(FOOD_PRICES[k] > 0)) ?? kinds.sort((a, b) => (FOOD_PRICES[a] ?? 0) - (FOOD_PRICES[b] ?? 0))[0];
    if (kind && this._pay(FOOD_PRICES[kind] ?? 0)) this._dropNear('food', kind, critter);
  }

  /** Fenêtre de détail : succès (les non débloqués sont floutés), statistiques, journal. */
  openProgress(critter, tab) {
    const values = { ...critter.stats.counters, daysAlive: Math.floor(critter.life.ageSeconds / 86400) };
    new ProgressDialog({
      title: `${critter.name ?? 'Sans nom'} — progression`,
      tab,
      achievements: this.achievementsFor(critter),
      stats: Object.entries(values),
      journal: this._player.journal,
    }).open();
  }

  /** Ouvre la boîte de dialogue de renommage d'une créature. */
  openRename(critter) {
    new RenameDialog(critter.name ?? '', (text) => this.rename(critter, text)).open();
  }

  /** Renomme (nettoyé, unique parmi les animaux affichés) et l'inscrit au journal. */
  rename(critter, text) {
    const clean = sanitizeName(text);
    if (clean === null || clean === critter.name) return;
    const taken = this._critters.map((e) => e.critter.name).filter((n) => n && n !== critter.name);
    const previous = critter.name;
    critter.setName(uniqueName(clean, taken));
    this._player.log(`${previous ?? 'Une créature'} est rebaptisé(e) ${critter.name}.`, Date.now());
  }

  /** Succès qu'un animal peut obtenir (espèce et caractère compatibles), avec leur état. */
  achievementsFor(critter) {
    return this._achievements
      .filter((def) => isEligible(def, { trait: critter.life.trait }))
      .map((def) => ({ def, unlocked: critter.unlocked.has(def.id), progress: this._statOf(critter, def.condition.stat) }));
  }

  _statOf(critter, stat) {
    if (!CONDITION_STATS.includes(stat)) return 0;
    return stat === 'daysAlive' ? Math.floor(critter.life.ageSeconds / 86400) : critter.stats.get(stat);
  }

  /**
   * Progression d'un animal après son tick : pièces des événements, journal,
   * succès (pièces, entrée de journal, notification).
   */
  _processProgress(index, critter, snapshot, nowUs) {
    const name = this._nameOf(index);
    const nowSeconds = nowUs / 1_000_000;
    const event = snapshot.event;
    if (event) {
      this._player.awardEvent(`${index}`, event, nowSeconds);
      if (event === 'hatched') this._player.log(`${name} a éclos.`, Date.now());
      else if (event === 'birthday') this._player.log(`${name} fête son anniversaire !`, Date.now());
      else if (event === 'grew') this._player.log(`${name} devient ${STAGE_LABELS[snapshot.stage]?.toLowerCase() ?? snapshot.stage}.`, Date.now());
    }
    if (event === 'trickLearned') this._player.log(`${name} a appris un tour.`, Date.now());
    const mess = critter.takeMess();
    if (mess) this._addItem(createItem('mess', null, mess.x, mess.y - 4));
    const gift = critter.takeGift();
    if (gift) this._addItem(createItem('gift', gift.kind, gift.x, gift.y));
    for (const id of critter.takeUnlocked()) {
      const def = this._achievements.find((a) => a.id === id);
      if (!def) continue;
      this._player.award(`achievement:${index}:${id}`, def.coins, nowSeconds);
      this._player.log(`${name} : succès « ${def.name} ».`, Date.now());
      Main.notify('Critter', `${name} : succès « ${def.name} » (+${def.coins} pièces)`);
    }
  }

  /** Espèces de proies chassées par l'animal affiché (section `needs.prey` du pack). */
  _preyKinds() {
    return Object.keys(this._critters[0]?.critter.config.needsPrey ?? {});
  }

  /** Plantes que l'espèce grignote (son régime, restreint aux plantes connues). */
  _plantKinds() {
    return Object.keys(this._critters[0]?.critter.config.needsDiet ?? {}).filter((kind) => PLANTS[kind]);
  }

  /**
   * Proies et plantes d'un monde autonome : une proie apparaît de temps en
   * temps (si le réglage est actif et qu'un animal est assez autonome), et
   * deux plantes sont maintenues. Les objets tombent depuis une surface.
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

  /** Contexte du monde vu par un animal : nuit, absence, rappel de pause (le sien seulement). */
  _ambientFor(critter) {
    return {
      night: this.settings.get_boolean('day-night') && this._night,
      away: this.settings.get_boolean('away-sleep') && this._idleTracker.away,
      breakReminder: this._reminder === critter,
    };
  }

  /** Difficulté choisie, ou 0 en mode vacances (tout figé). */
  _needsRateScale() {
    if (this.settings.get_boolean('vacation-mode')) return 0;
    return DIFFICULTY_SCALE[this.settings.get_string('difficulty')] ?? 1;
  }

  /** Vitesse de croissance : réglage choisi, 0 en vacances ou croissance désactivée. */
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
          achievementsFor: (critter) => this.achievementsFor(critter),
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

  // --- Objets du bureau ---------------------------------------------------

  /** Actions offertes aux menus (contextuel de l'animal et icône de barre). */
  _menuOwner() {
    return {
      rename: (critter) => this.openRename(critter),
      openSettings: () => this._openSettings(),
      openProgress: (critter, tab) => this.openProgress(critter, tab),
      quickFeed: (critter) => this.quickFeed(critter),
      pet: (critter) => (critter.life.hibernating ? critter.wake() : critter.pet()),
      dropFood: (kind, critter) => {
        if (this._pay(FOOD_PRICES[kind] ?? 0)) this._dropNear('food', kind, critter);
      },
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
      dropPrey: (kind) => this._dropNear('prey', kind ?? this._preyKinds()[0], null),
      dropPlant: (kind) => this._dropNear('plant', kind ?? this._plantKinds()[0], null),
      wake: (critter) => critter.wake(),
      setLaser: (on) => this.setLaser(on),
      isLaser: () => this._laser,
      hasToys: () => this._items.some(({ item }) => isToy(item) && !item.removed),
      clearToys: () => this.clearToys(),
    };
  }

  /** Aliments que connaissent les animaux affichés (sans les plantes, posées à part), le plus apprécié d'abord. */
  _foods() {
    const diet = {};
    for (const { critter } of this._critters) {
      for (const [kind, gain] of Object.entries(critter.config.needsDiet)) {
        if (FOODS[kind]) diet[kind] = Math.max(diet[kind] ?? 0, gain);
      }
    }
    return Object.entries(diet).sort((a, b) => b[1] - a[1]).map(([kind]) => kind);
  }

  /** Jouets adaptés à l'espèce affichée : flottants pour une espèce sans sol, posés sinon. */
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

  /** Lâche un objet juste à côté (au-dessus) de l'animal, il retombe ; `model` : modèle ou variante. */
  _dropNear(type, kind, critter, model = null) {
    const bounds = computeWorldBounds(getMonitors());
    // Sans animal précis (menu global) : tombe en haut de l'écran, à l'abscisse du curseur.
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
    if (bowl) fillBowl(bowl, kind);
  }

  clearItems() {
    for (const { item } of this._items) item.removed = true;
  }

  /** « Ranger les jouets » : retire les jouets seulement (pas la gamelle, le lit ni la nourriture). */
  /** « Nettoyer les traces » : retire toutes les traces et remet les litières à zéro (sans pièces). */
  cleanAll() {
    for (const { item } of this._items) {
      if (item.type === 'mess') item.removed = true;
      else if (item.type === 'litter') item.cleaned = true;
    }
  }

  clearToys() {
    for (const { item } of this._items) if (isToy(item)) item.removed = true;
  }

  setLaser(on) {
    this._laser = Boolean(on);
  }

  _removeGoneItems() {
    this._items = this._items.filter((entry) => {
      if (!isGone(entry.item)) return true;
      if (entry.item.collected && entry.item.type === 'gift') {
        const coins = GIFTS[entry.item.kind]?.coins ?? 0;
        this._player.award('gift', coins, 0);
        this._player.log(`Cadeau ramassé : +${coins} pièces.`, Date.now());
      } else if (entry.item.collected && entry.item.type === 'mess') {
        this._player.award('clean', 1, 0); // service rendu : une pièce par trace nettoyée
      }
      Main.layoutManager.removeChrome(entry.actor.actor);
      entry.actor.destroy();
      return false;
    });
  }

  start() {
    if (this._timeoutId) return;
    this._lastTickUs = GLib.get_monotonic_time();
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

  _tick() {
    const nowUs = GLib.get_monotonic_time();
    const dt = Math.min((nowUs - this._lastTickUs) / 1_000_000, 0.25); // clamp anti-rattrapage après une pause (veille, etc.)
    this._lastTickUs = nowUs;

    const monitors = getMonitors();
    const windows = getWindows();
    const surfaces = computeSurfaces({ monitors, windows });
    const worldBounds = computeWorldBounds(monitors);
    const pointer = getPointer();

    // Une fenêtre qui apparaît entre deux ticks (pas de nouveau capteur :
    // getWindows() est déjà appelé chaque frame) fait sursauter les
    // critters. this._knownWindowIds reste null au tout premier tick pour
    // ne pas réagir aux fenêtres déjà là au démarrage de l'extension.
    const currentWindowIds = new Set(windows.map((w) => w.id));
    if (this._knownWindowIds) {
      const hasNewWindow = [...currentWindowIds].some((id) => !this._knownWindowIds.has(id));
      if (hasNewWindow) {
        for (const { critter } of this._critters) critter.interact('windowOpened');
      }
    }
    this._knownWindowIds = currentWindowIds;

    // Fenêtre de fraîcheur limitée après un changement de focus (contraste
    // avec le pointeur pour FOLLOW, toujours une cible valide) : passé ce
    // délai sans qu'un critter idle l'ait choisie, l'opportunité expire
    // silencieusement plutôt que de rester une cible permanente.
    const focused = windows.find((w) => w.focused) ?? null;
    if (this._lastFocusedWindowId !== undefined && focused && focused.id !== this._lastFocusedWindowId) {
      this._focusedWindow = focused;
      this._focusedWindowExpiryUs = nowUs + 5_000_000; // 5s
    }
    this._lastFocusedWindowId = focused?.id;
    const focusedWindow =
      this._focusedWindow && nowUs < this._focusedWindowExpiryUs ? this._focusedWindow : undefined;

    // Instantané d'avant ce tick (positions non encore mises à jour) pour
    // que l'ordre de traitement des critters ne biaise pas qui "voit" qui ;
    // la référence à l'instance voyage à côté (pas dans le calcul de
    // ciblage, seulement pour que GREET puisse déclencher une réaction sur
    // la cible une fois atteinte -- voir Critter._tickGreet).
    // Un œuf n'est pas un voisin : personne ne va le saluer ni le poursuivre.
    const others = this._critters
      .filter(({ critter }) => critter.life.stage !== 'egg')
      .map(({ critter }) => ({ x: critter.x, y: critter.y, critter }));

    // Menaces des proies : les animaux (hors œufs) et le curseur.
    const threats = [
      ...this._critters
        .filter(({ critter }) => critter.life.stage !== 'egg')
        .map(({ critter }) => ({ x: critter.x, y: critter.y, radius: FLEE_ANIMAL_RADIUS })),
      { x: pointer.x, y: pointer.y, radius: FLEE_POINTER_RADIUS },
    ];
    for (const { item, actor } of this._items) {
      rescueItem(item, monitors);
      tickItem(item, dt, surfaces, worldBounds, { threats, random: Math.random });
      actor.sync();
    }
    this._autonomyTick(dt, surfaces, worldBounds);
    this._removeGoneItems();
    const items = this._items.map(({ item }) => item);
    this._laserDot?.update(pointer, this._laser);

    this._worldTick(dt, nowUs);
    this._critters.forEach(({ critter, actor }, i) => {
      const otherCritters = others.length > 1 ? others.filter((_, j) => j !== i) : undefined;
      critter.ensureVisible(monitors, this.pack.spriteSize.height);
      const ambient = this._ambientFor(critter);
      const snapshot = critter.tick(dt, surfaces, {
        worldBounds, pointer, otherCritters, focusedWindow, items, laser: this._laser, ambient,
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
