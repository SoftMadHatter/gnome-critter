import { clamp, sign } from './vec2.js';
import {
  findSurfaceBelow,
  isOnSegment,
  findSegmentById,
  findWallById,
  findWallNear,
  findCeilingAbove,
} from './surfaceMap.js';

/** États possibles. Volontairement une simple union de chaînes : facile à
 * sérialiser, à logger, et à mapper vers un nom d'animation dans un pack. */
export const State = Object.freeze({
  IDLE: 'idle',
  WALK: 'walk',
  FALL: 'fall',
  DRAG: 'drag',
  CLIMB: 'climb', // sur un mur, vertical
  CEILING: 'ceiling', // marche au plafond, tête en bas
  SWIM: 'swim',
  FLY: 'fly',
  SLEEP: 'sleep',
});

/** Types de surface qu'une espèce peut savoir utiliser. */
export const Locomotion = Object.freeze({
  GROUND: 'ground', // sol + rebords de fenêtres (segments 'ground'/'shelf')
  WALL: 'wall',
  CEILING: 'ceiling',
  WATER: 'water',
  AIR: 'air',
});

const DEFAULT_CONFIG = {
  speciesId: 'unknown',
  walkSpeed: 40, // px/s
  climbSpeed: 30,
  swimSpeed: 25,
  flySpeed: 60,
  gravity: 900, // px/s^2
  terminalVelocity: 800,
  idleDuration: [1.5, 4], // secondes, [min, max]
  walkDuration: [1, 3],
  sleepChance: 0.05, // probabilité de s'endormir au lieu de marcher, par cycle idle
  sleepDuration: [4, 10],
  supportedSurfaces: new Set([Locomotion.GROUND]),
  random: Math.random,
};

/**
 * Tire un flottant uniforme dans [min, max] avec la fonction random fournie
 * (remplaçable pour des tests déterministes).
 */
function randRange([min, max], random) {
  return min + random() * (max - min);
}

export class Critter {
  /**
   * @param {Partial<typeof DEFAULT_CONFIG>} config
   * @param {{x: number, y: number}} initialPosition
   */
  constructor(config, initialPosition) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.x = initialPosition.x;
    this.y = initialPosition.y;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1; // 1 = droite, -1 = gauche
    this.state = State.FALL; // au démarrage, on tombe jusqu'à trouver un support
    this.stateTimer = 0;
    this.currentSurface = null;
    this.walkTargetX = null;
    this.wallSide = null; // 'left' | 'right' pendant CLIMB
    this._dragTarget = null;
    /** Dernier événement notable (pour déclencher un son/une réaction), vidé à chaque tick. */
    this.lastEvent = null;
    /** Événement posé par une méthode publique (pet/startDrag/...) entre deux
     * ticks. On ne l'écrit pas directement dans lastEvent car tick() vide
     * lastEvent en entrée : sans cette file, un événement posé juste avant
     * tick() serait effacé avant d'avoir pu être lu par l'appelant. */
    this._pendingEvent = null;
  }

  supports(locomotion) {
    return this.config.supportedSurfaces.has(locomotion);
  }

  // --- Interactions utilisateur -------------------------------------------------

  startDrag() {
    this.state = State.DRAG;
    this.vx = 0;
    this.vy = 0;
    this.currentSurface = null;
    this._pendingEvent = 'grabbed';
  }

  dragTo(x, y) {
    this._dragTarget = { x, y };
  }

  endDrag() {
    this.state = State.FALL;
    this.stateTimer = 0;
    this._pendingEvent = 'released';
  }

  pet() {
    this._pendingEvent = 'petted';
    // Ne change pas forcément l'état ; c'est à la couche animation de jouer
    // une réaction courte (ex: petite bulle de cœur) par-dessus l'état courant.
  }

  // --- Boucle principale ----------------------------------------------------

  /**
   * @param {number} dt secondes écoulées depuis le tick précédent
   * @param {{segments: import('./surfaceMap.js').Segment[], walls: import('./surfaceMap.js').Wall[]}} surfaces
   * @param {{worldBounds: {x:number,y:number,width:number,height:number}}} options bornes globales (union des moniteurs), utilisées par FLY/sécurité
   */
  tick(dt, surfaces, options = {}) {
    this.lastEvent = this._pendingEvent;
    this._pendingEvent = null;
    this.stateTimer -= dt;

    // La fenêtre/le rebord sur lequel on s'est posé a pu être fermé,
    // déplacé ou redimensionné depuis le tick où `currentSurface` a été
    // mémorisé : on le retrouve dans les surfaces fraîchement recalculées
    // de CE tick avant d'agir, sinon on continue de raisonner sur des
    // coordonnées périmées (le critter resterait suspendu dans le vide).
    if (this.currentSurface && this.currentSurface.surfaceId !== undefined) {
      this._resyncCurrentSurface(surfaces);
    }

    switch (this.state) {
      case State.DRAG:
        this._tickDrag();
        break;
      case State.FALL:
        this._tickFall(dt, surfaces, options);
        break;
      case State.WALK:
        this._tickWalk(dt, surfaces);
        break;
      case State.CLIMB:
        this._tickClimb(dt, surfaces);
        break;
      case State.CEILING:
        this._tickCeiling(dt, surfaces);
        break;
      case State.SWIM:
        this._tickSwim(dt, surfaces);
        break;
      case State.FLY:
        this._tickFly(dt, options);
        break;
      case State.IDLE:
      case State.SLEEP:
        this._tickWaiting(dt, surfaces);
        break;
      default:
        this.state = State.IDLE;
        this.stateTimer = randRange(this.config.idleDuration, this.config.random);
    }

    return this.snapshot();
  }

  snapshot() {
    return {
      x: this.x,
      y: this.y,
      facing: this.facing,
      state: this.state,
      event: this.lastEvent,
    };
  }

  // --- Implémentations par état ----------------------------------------------

  /**
   * Remplace `currentSurface` par sa version à jour dans `surfaces` (mêmes
   * `surfaceId`/`type`, ou `side` pour un mur), ou fait tomber le critter si
   * elle n'existe plus (fenêtre fermée entre-temps).
   */
  _resyncCurrentSurface(surfaces) {
    const surface = this.currentSurface;
    const fresh = surface.side
      ? findWallById(surfaces.walls, surface.surfaceId, surface.side)
      : findSegmentById(surfaces.segments, surface.surfaceId, surface.type);

    if (!fresh) {
      this._enterState(State.FALL);
      return;
    }
    this.currentSurface = fresh;
  }

  _tickDrag() {
    if (!this._dragTarget) return;
    this.x = this._dragTarget.x;
    this.y = this._dragTarget.y;
  }

  _tickFall(dt, surfaces, options) {
    this.vy = clamp(this.vy + this.config.gravity * dt, -Infinity, this.config.terminalVelocity);
    const nextY = this.y + this.vy * dt;

    const allowed = new Set(['ground', 'shelf']);
    if (this.supports(Locomotion.WATER)) allowed.add('water');

    const landing = findSurfaceBelow(surfaces.segments, this.x, nextY, this.vy * dt + 1, allowed);
    if (landing) {
      this.y = landing.y;
      this.vy = 0;
      this.currentSurface = landing;
      if (landing.type === 'water' && this.supports(Locomotion.WATER)) {
        this._enterState(State.SWIM);
      } else {
        this._enterState(State.IDLE);
      }
      this.lastEvent = 'landed';
      return;
    }

    if (this.supports(Locomotion.WALL)) {
      const wall = findWallNear(surfaces.walls, this.x, Math.min(this.y, nextY), Math.max(this.y, nextY));
      if (wall) {
        this.x = wall.x; // plaqué contre le mur, pas juste "à epsilon près"
        this.y = clamp(nextY, wall.y1, wall.y2);
        this.vy = 0;
        this.currentSurface = wall;
        this._enterState(State.CLIMB);
        this.lastEvent = 'landed';
        return;
      }
    }

    this.y = nextY;

    // Filet de sécurité : si on tombe hors de tout moniteur connu, on se
    // replie sur le bas du premier moniteur pour ne jamais sortir de l'écran.
    const bounds = options.worldBounds;
    if (bounds && this.y > bounds.y + bounds.height + 200) {
      this.x = clamp(this.x, bounds.x, bounds.x + bounds.width);
      this.y = bounds.y + bounds.height;
      this.vy = 0;
      this._enterState(State.IDLE);
    }
  }

  _tickWaiting(dt, surfaces) {
    // Vérifie qu'on n'est pas resté « en l'air » suite à une fenêtre fermée
    // ou déplacée sous nos pieds.
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer > 0) return;

    if (this.state === State.SLEEP) {
      this._enterState(State.IDLE);
      return;
    }

    const roll = this.config.random();
    if (roll < this.config.sleepChance) {
      this.state = State.SLEEP;
      this.stateTimer = randRange(this.config.sleepDuration, this.config.random);
      this.lastEvent = 'sleep';
      return;
    }

    this._startWalkOnCurrentSurface(surfaces);
  }

  _startWalkOnCurrentSurface(surfaces) {
    const surface = this.currentSurface;
    if (!surface) {
      this._enterState(State.IDLE);
      return;
    }
    const margin = 4;
    const min = surface.x1 + margin;
    const max = surface.x2 - margin;
    if (max <= min) {
      this._enterState(State.IDLE);
      return;
    }
    this.walkTargetX = randRange([min, max], this.config.random);
    this.facing = sign(this.walkTargetX - this.x) || this.facing;
    this.state = State.WALK;
    this.stateTimer = randRange(this.config.walkDuration, this.config.random);
  }

  _tickWalk(dt, surfaces) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    const dir = sign(this.walkTargetX - this.x);
    if (dir === 0 || this.stateTimer <= 0) {
      this._enterState(State.IDLE);
      return;
    }

    this.facing = dir;
    this.x += dir * this.config.walkSpeed * dt;

    if (this.currentSurface) {
      this.x = clamp(this.x, this.currentSurface.x1, this.currentSurface.x2);
    }

    if (Math.abs(this.walkTargetX - this.x) < 1) {
      this._enterState(State.IDLE);
    }
  }

  _tickClimb(dt, surfaces) {
    // Monte le long du mur courant. Si l'espèce sait marcher au plafond,
    // elle s'arrête et s'accroche dès qu'elle croise, en chemin, une
    // surface en surplomb (plafond d'un moniteur, dessous d'une fenêtre) ;
    // sinon elle grimpe jusqu'au sommet du mur et s'y arrête (rien à quoi
    // se suspendre là-haut).
    const wall = this.currentSurface;
    if (!wall) {
      this._enterState(State.FALL);
      return;
    }

    const prevY = this.y;
    this.y = Math.max(this.y - this.config.climbSpeed * dt, wall.y1);

    if (this.supports(Locomotion.CEILING)) {
      const ceiling = findCeilingAbove(surfaces.segments, wall.x, prevY, prevY - this.y);
      if (ceiling) {
        this.y = ceiling.y;
        this.currentSurface = ceiling;
        // On vient de grimper ce mur : repartir vers le bord opposé plutôt
        // que de continuer vers l'extérieur, où on retomberait aussitôt.
        this.facing = wall.side === 'left' ? 1 : -1;
        this._enterState(State.CEILING);
        return;
      }
    }

    if (this.y <= wall.y1) {
      // Rien à agripper au sommet : on reste accroché là, immobile, plutôt
      // que de "se tenir debout" sur un mur (qui n'a pas de x1/x2 valides
      // pour la vérification de surface des états IDLE/WALK).
      this.currentSurface = null;
      this._enterState(State.IDLE);
    }
  }

  _tickCeiling(dt, surfaces) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer <= 0) {
      this._enterState(State.FALL);
      return;
    }

    this.x += this.facing * this.config.walkSpeed * dt;

    if (this.currentSurface) {
      const clamped = clamp(this.x, this.currentSurface.x1, this.currentSurface.x2);
      if (clamped !== this.x) {
        // Bout du surplomb atteint : plus rien à quoi se tenir.
        this.x = clamped;
        this._enterState(State.FALL);
      }
    }
  }

  _tickSwim(dt, surfaces) {
    const zone = this.currentSurface;
    if (!zone) {
      this._enterState(State.FALL);
      return;
    }
    if (this.stateTimer <= 0) {
      this.walkTargetX = randRange([zone.x1 + 4, zone.x2 - 4], this.config.random);
      this.stateTimer = randRange(this.config.walkDuration, this.config.random);
      this.facing = sign(this.walkTargetX - this.x) || this.facing;
    }
    this.x += this.facing * this.config.swimSpeed * dt;
    this.x = clamp(this.x, zone.x1, zone.x2);
  }

  _tickFly(dt, options) {
    if (this.stateTimer <= 0) {
      const bounds = options.worldBounds ?? { x: 0, y: 0, width: 1920, height: 1080 };
      this.walkTargetX = randRange([bounds.x, bounds.x + bounds.width], this.config.random);
      this._flyTargetY = randRange([bounds.y, bounds.y + bounds.height / 2], this.config.random);
      this.stateTimer = randRange(this.config.walkDuration, this.config.random);
    }
    const dx = sign(this.walkTargetX - this.x);
    const dy = sign(this._flyTargetY - this.y);
    this.facing = dx || this.facing;
    this.x += dx * this.config.flySpeed * dt;
    this.y += dy * this.config.flySpeed * dt;
  }

  _enterState(state) {
    this.state = state;
    switch (state) {
      case State.IDLE:
        this.stateTimer = randRange(this.config.idleDuration, this.config.random);
        break;
      case State.FALL:
        this.vy = 0;
        this.currentSurface = null;
        break;
      case State.CEILING:
        // stateTimer hérité de l'état précédent (WALK/CLIMB...) serait déjà
        // épuisé : sans ce reset, _tickCeiling retomberait dès le tick
        // suivant, avant même d'avoir pu s'accrocher visiblement.
        this.stateTimer = randRange(this.config.walkDuration, this.config.random);
        break;
      default:
        break;
    }
  }
}
