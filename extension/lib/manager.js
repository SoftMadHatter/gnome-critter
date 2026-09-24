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
import { computeSurfaces } from '../core/surfaceMap.js';
import {
  createItem, fillBowl, tickItem, isGone, isToy, rescueItem, serializeItems, parseSavedItems,
} from '../core/items.js';
import { getMonitors, getWindows, getPointer, computeWorldBounds } from './sensors.js';
import { CritterActor } from './critterActor.js';
import { loadBubbleIcons } from './thoughtBubble.js';
import { addIndicator } from './panelIndicator.js';
import { ItemActor, LaserDot, loadItemImages } from './itemActor.js';

const SAVE_INTERVAL_S = 30;
const DIFFICULTY_SCALE = { relaxed: 0.4, normal: 1, strict: 2 };
const TICK_INTERVAL_MS = 33; // ~30 fps ; suffisant pour un sprite pixel-art, léger en CPU

export class Manager {
  /**
   * @param {ReturnType<typeof import('./packLoader.js').loadPack>} pack
   * @param {Gio.Settings} settings
   * @param {{extensionPath: string, uuid: string}} extension
   */
  constructor(pack, settings, { extensionPath, uuid }) {
    this.pack = pack;
    this.settings = settings;
    this._extensionPath = extensionPath;
    this._uuid = uuid;
    this._indicator = null;
    this._settingsIds = [];
    /** @type {{item: object, actor: ItemActor}[]} */
    this._items = [];
    this._itemImages = {};
    this._lastSavedItems = null;
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
    this._itemImages = loadItemImages(GLib.build_filenamev([this._extensionPath, 'assets', 'items']));
    if (this._itemImages.laser) this._laserDot = new LaserDot(this._itemImages.laser);
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

      if (saved[i]) critter.restore(saved[i], { elapsedSeconds: saved[i].elapsedSeconds });

      const actor = new CritterActor(critter, this.pack, this.settings, bubbleIcons, this._menuOwner());
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
    this._settingsIds.push(this.settings.connect('changed::show-indicator', () => this._syncIndicator()));
    this._syncIndicator();
  }

  /** Difficulté choisie, ou 0 en mode vacances (tout figé). */
  _needsRateScale() {
    if (this.settings.get_boolean('vacation-mode')) return 0;
    return DIFFICULTY_SCALE[this.settings.get_string('difficulty')] ?? 1;
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
      dropFood: (kind, critter) => this._dropNear('food', kind, critter),
      fillBowl: (kind, critter) => this._fillBowl(kind, critter),
      dropBed: (critter) => this._dropNear('bed', null, critter),
      dropToy: (kind, critter) => this._dropNear('toy', kind, critter),
      brush: (critter) => critter.brush(),
      setLaser: (on) => this.setLaser(on),
      isLaser: () => this._laser,
      hasToys: () => this._items.some(({ item }) => isToy(item) && !item.removed),
      clearToys: () => this.clearToys(),
    };
  }

  /** Aliments que connaissent les animaux affichés, le plus apprécié d'abord. */
  _foods() {
    const diet = {};
    for (const { critter } of this._critters) {
      for (const [kind, gain] of Object.entries(critter.config.needsDiet)) diet[kind] = Math.max(diet[kind] ?? 0, gain);
    }
    return Object.entries(diet).sort((a, b) => b[1] - a[1]).map(([kind]) => kind);
  }

  _addItem(item) {
    const actor = new ItemActor(item, this._itemImages);
    Main.layoutManager.addChrome(actor.actor);
    this._items.push({ item, actor });
    return item;
  }

  /** Lâche un objet juste à côté (au-dessus) de l'animal, il retombe. */
  _dropNear(type, kind, critter = this._critters[0]?.critter) {
    if (!critter) return null;
    const bounds = computeWorldBounds(getMonitors());
    const x = Math.min(Math.max(critter.x + critter.facing * 48, bounds.x + 16), bounds.x + bounds.width - 16);
    const y = Math.max(bounds.y + 20, critter.y - 90);
    return this._addItem(createItem(type, kind, x, y));
  }

  _fillBowl(kind, critter = this._critters[0]?.critter) {
    if (!critter) return;
    const bowls = this._items.map((e) => e.item).filter((i) => i.type === 'bowl' && !i.removed);
    const bowl =
      bowls.sort((a, b) => Math.abs(a.x - critter.x) - Math.abs(b.x - critter.x))[0] ??
      this._dropNear('bowl', kind, critter);
    if (bowl) fillBowl(bowl, kind);
  }

  clearItems() {
    for (const { item } of this._items) item.removed = true;
  }

  /** « Ranger les jouets » : retire les jouets seulement (pas la gamelle, le lit ni la nourriture). */
  clearToys() {
    for (const { item } of this._items) if (isToy(item)) item.removed = true;
  }

  setLaser(on) {
    this._laser = Boolean(on);
  }

  _removeGoneItems() {
    this._items = this._items.filter((entry) => {
      if (!isGone(entry.item)) return true;
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
    const others = this._critters.map(({ critter }) => ({ x: critter.x, y: critter.y, critter }));

    for (const { item, actor } of this._items) {
      rescueItem(item, monitors);
      tickItem(item, dt, surfaces, worldBounds);
      actor.sync();
    }
    this._removeGoneItems();
    const items = this._items.map(({ item }) => item);
    this._laserDot?.update(pointer, this._laser);

    this._critters.forEach(({ critter, actor }, i) => {
      const otherCritters = others.length > 1 ? others.filter((_, j) => j !== i) : undefined;
      critter.ensureVisible(monitors, this.pack.spriteSize.height);
      const snapshot = critter.tick(dt, surfaces, { worldBounds, pointer, otherCritters, focusedWindow, items, laser: this._laser });
      actor.updateAnimation(dt, snapshot);
    });
  }
}
