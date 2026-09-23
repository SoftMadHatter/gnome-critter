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
import { Critter, Locomotion } from '../core/critter.js';
import { computeSurfaces } from '../core/surfaceMap.js';
import { getMonitors, getWindows, getPointer, computeWorldBounds } from './sensors.js';
import { CritterActor } from './critterActor.js';

const TICK_INTERVAL_MS = 33; // ~30 fps ; suffisant pour un sprite pixel-art, léger en CPU

export class Manager {
  /**
   * @param {ReturnType<typeof import('./packLoader.js').loadPack>} pack
   * @param {Gio.Settings} settings
   */
  constructor(pack, settings) {
    this.pack = pack;
    this.settings = settings;
    /** @type {{critter: Critter, actor: CritterActor}[]} */
    this._critters = [];
    this._timeoutId = null;
    this._lastTickUs = null;
    /** @type {Set<number>|null} null tant que le premier tick n'a pas eu
     * lieu, pour ne jamais réagir aux fenêtres déjà ouvertes au démarrage. */
    this._knownWindowIds = null;
  }

  spawn(count = 1) {
    const monitors = getMonitors();
    const bounds = computeWorldBounds(monitors);

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

      const actor = new CritterActor(critter, this.pack, this.settings);
      // GNOME 50 (layout.js) : addChrome() inclut automatiquement l'acteur
      // dans la région d'input selon sa taille/position/visibilité ; le
      // paramètre affectsInputRegion n'existe plus (Params.parse rejette
      // toute clé inconnue). Seuls trackFullscreen/affectsStruts restent.
      Main.layoutManager.addChrome(actor.actor);

      this._critters.push({ critter, actor });
    }
  }

  start() {
    if (this._timeoutId) return;
    this._lastTickUs = GLib.get_monotonic_time();
    this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TICK_INTERVAL_MS, () => {
      this._tick();
      return GLib.SOURCE_CONTINUE;
    });
  }

  stop() {
    if (this._timeoutId) {
      GLib.source_remove(this._timeoutId);
      this._timeoutId = null;
    }
  }

  destroy() {
    this.stop();
    for (const { actor } of this._critters) {
      Main.layoutManager.removeChrome(actor.actor);
      actor.destroy();
    }
    this._critters = [];
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

    for (const { critter, actor } of this._critters) {
      const snapshot = critter.tick(dt, surfaces, { worldBounds, pointer });
      actor.updateAnimation(dt, snapshot);
    }
  }
}
