import { clamp, sign } from './vec2.js';
import {
  findSurfaceBelow,
  isOnSegment,
  findSegmentById,
  findWallById,
  findWallNear,
  findCeilingAbove,
  findReachableWall,
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
  WASH: 'wash', // idle passif minuté, se lave sur place (même mécanisme que SLEEP)
  FOLLOW: 'follow', // marche vers le curseur, cible recalculée en continu
  GREET: 'greet', // marche vers le critter le plus proche, salue en l'atteignant
  SEEK_WALL: 'seekWall', // marche vers un mur atteignable pour grimper délibérément
  SEEK_FOCUS: 'seekFocus', // marche vers la fenêtre qui vient de prendre le focus
  CHASE: 'chase', // poursuit une cible précise (référence fixe, pas "le plus proche")
  FLEE: 'flee', // s'éloigne d'un poursuivant
});

/** Types de surface qu'une espèce peut savoir utiliser. */
export const Locomotion = Object.freeze({
  GROUND: 'ground', // sol + rebords de fenêtres (segments 'ground'/'shelf')
  WALL: 'wall',
  CEILING: 'ceiling',
  WATER: 'water',
  AIR: 'air',
});

/** Geste brut détecté côté extension -> nom d'événement thématique émis
 * (et donc nom de réaction dans pack.json). Centralisé ici pour rester
 * facile à retoucher sans aller fouiller la détection d'événements Clutter. */
const INTERACTION_REACTIONS = {
  click: 'petted',
  doubleClick: 'tickled',
  rightClick: 'annoyed',
  hover: 'noticed',
  windowOpened: 'startled',
  meetCritter: 'greeted', // posé sur LA CIBLE d'un GREET (voir _tickGreet) : arrive entre deux de ses propres ticks, donc via interact()/_pendingEvent comme les autres événements externes -- contrairement à l'initiateur, qui pose this.lastEvent directement puisque ça se passe DANS son propre tick.
};

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
  // Poids relatifs du choix pondéré fait par _tickWaiting entre les
  // activités idle (voir weightedChoice ci-dessous) : pas besoin de sommer
  // à 1, seule l'importance relative compte. Valeurs choisies pour garder
  // le ressenti des anciennes probabilités indépendantes (5%/6%/12%/reste).
  walkWeight: 77,
  sleepWeight: 5,
  sleepDuration: [4, 10],
  washWeight: 6,
  washDuration: [3, 6],
  followWeight: 12,
  followDuration: [2, 4],
  followMaxDistance: 600, // au-delà, suivre le curseur devient très improbable (pas impossible)
  greetWeight: 10,
  greetDuration: [2, 4],
  greetMaxDistance: 600,
  greetDistance: 20, // distance en dessous de laquelle on considère avoir "atteint" l'autre critter
  climbSeekWeight: 10,
  climbSeekDuration: [3, 6],
  climbSeekMaxDistance: 600,
  climbApproachDistance: 6, // distance en dessous de laquelle on considère avoir "atteint" le mur
  seekFocusWeight: 10,
  seekFocusDuration: [3, 6],
  seekFocusMaxDistance: 600,
  seekFocusDistance: 20, // distance en dessous de laquelle on considère avoir "atteint" la fenêtre
  chaseChance: 0.4, // probabilité d'enchaîner sur une poursuite après un GREET réussi
  chaseDuration: [2, 4],
  fleeWeight: 50,
  fleeMaxDistance: 600,
  fleeDuration: [2, 4],
  repeatPenalty: 0.3, // multiplicateur de poids si la dernière activité spéciale était déjà celle-ci
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

/**
 * Choisit un candidat au hasard, proportionnellement à son poids (les poids
 * n'ont pas besoin de sommer à 1, seule leur importance relative compte).
 * @param {{value: *, weight: number}[]} candidates
 * @param {() => number} random
 * @returns {*} null si la somme des poids est <= 0 (aucun candidat valable)
 */
export function weightedChoice(candidates, random) {
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  if (total <= 0) return null;

  let r = random() * total;
  for (const c of candidates) {
    if (r < c.weight) return c.value;
    r -= c.weight;
  }
  return candidates[candidates.length - 1].value; // filet flottant
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
    /** Dernière activité spéciale choisie par _tickWaiting ('sleep'/'wash'/
     * 'follow', jamais 'walk') : sert de mémoire anti-répétition. */
    this._lastActivity = null;
    /** Référence Critter précise poursuivie pendant CHASE (pas recalculée
     * par proximité, contrairement à FOLLOW/GREET/SEEK_WALL/SEEK_FOCUS). */
    this._chaseTarget = null;
    /** Référence Critter dont on s'éloigne pendant FLEE. */
    this._fleeFrom = null;
    /** Invitation posée par proposeChase() : simple opportunité de plus
     * pour le choix pondéré de _tickWaiting, pas un ordre -- peut être
     * ignorée si un autre candidat l'emporte au tirage. */
    this._chaseInvitation = null;
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
    this.interact('click');
  }

  /**
   * Pose une réaction ponctuelle sans toucher à l'état physique (contraste
   * avec startDrag/endDrag, qui changent aussi state/vx/vy). `kind` est le
   * geste brut détecté côté extension (ex. 'doubleClick') ; INTERACTION_REACTIONS
   * fait le lien vers le nom d'événement thématique correspondant, pour que
   * ce mapping reste modifiable à un seul endroit.
   */
  interact(kind) {
    const event = INTERACTION_REACTIONS[kind];
    if (event) this._pendingEvent = event;
  }

  /**
   * Propose une fuite (utilisé par CHASE, cf. _tickGreet) : ne force rien,
   * juste une opportunité de plus pour le choix pondéré de _tickWaiting
   * -- la cible pourra l'accepter ou l'ignorer à sa prochaine décision
   * idle, au même titre que sleep/wash/follow/etc.
   */
  proposeChase(chaser) {
    this._chaseInvitation = chaser;
  }

  // --- Boucle principale ----------------------------------------------------

  /**
   * @param {number} dt secondes écoulées depuis le tick précédent
   * @param {{segments: import('./surfaceMap.js').Segment[], walls: import('./surfaceMap.js').Wall[]}} surfaces
   * @param {{worldBounds: {x:number,y:number,width:number,height:number}, pointer: {x:number,y:number}, otherCritters: {x:number,y:number,critter?:Critter}[]}} options bornes globales (union des moniteurs, utilisées par FLY/sécurité), position du curseur (utilisée par FOLLOW) et positions des autres critters, avec référence optionnelle à l'instance (utilisées par GREET pour cibler et, en arrivant, déclencher une réaction sur elle)
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
      case State.FOLLOW:
        this._tickFollow(dt, surfaces, options);
        break;
      case State.GREET:
        this._tickGreet(dt, surfaces, options);
        break;
      case State.SEEK_WALL:
        this._tickSeekWall(dt, surfaces);
        break;
      case State.SEEK_FOCUS:
        this._tickSeekFocus(dt, surfaces, options);
        break;
      case State.CHASE:
        this._tickChase(dt, surfaces);
        break;
      case State.FLEE:
        this._tickFlee(dt, surfaces);
        break;
      case State.IDLE:
      case State.SLEEP:
      case State.WASH:
        this._tickWaiting(dt, surfaces, options);
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

  _tickWaiting(dt, surfaces, options = {}) {
    // Vérifie qu'on n'est pas resté « en l'air » suite à une fenêtre fermée
    // ou déplacée sous nos pieds.
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer > 0) return;

    if (this.state === State.SLEEP || this.state === State.WASH) {
      this._enterState(State.IDLE);
      return;
    }

    const candidates = [
      { value: 'walk', weight: this.config.walkWeight },
      { value: 'sleep', weight: this.config.sleepWeight },
      { value: 'wash', weight: this.config.washWeight },
    ];

    if (this.currentSurface && options.pointer) {
      const distance = Math.abs(options.pointer.x - this.x);
      // Moins tentant de suivre un curseur loin, jamais totalement exclu
      // (il peut se rapprocher pendant que le critter marche vers lui).
      const proximity = clamp(1 - distance / this.config.followMaxDistance, 0.15, 1);
      candidates.push({ value: 'follow', weight: this.config.followWeight * proximity });
    }

    if (options.otherCritters?.length) {
      const nearest = options.otherCritters.reduce((a, b) =>
        Math.abs(b.x - this.x) < Math.abs(a.x - this.x) ? b : a,
      );
      const distance = Math.abs(nearest.x - this.x);
      const proximity = clamp(1 - distance / this.config.greetMaxDistance, 0.15, 1);
      candidates.push({ value: 'greet', weight: this.config.greetWeight * proximity });
    }

    if (this.supports(Locomotion.WALL) && this.currentSurface) {
      const wall = findReachableWall(surfaces.walls, this.x, this.y);
      if (wall) {
        const distance = Math.abs(wall.x - this.x);
        const proximity = clamp(1 - distance / this.config.climbSeekMaxDistance, 0.15, 1);
        candidates.push({ value: 'climb', weight: this.config.climbSeekWeight * proximity });
      }
    }

    if (this.currentSurface && options.focusedWindow) {
      const targetX = options.focusedWindow.x + options.focusedWindow.width / 2;
      const distance = Math.abs(targetX - this.x);
      const proximity = clamp(1 - distance / this.config.seekFocusMaxDistance, 0.15, 1);
      candidates.push({ value: 'seekFocus', weight: this.config.seekFocusWeight * proximity });
    }

    // Invitation posée par proposeChase() (voir _tickGreet/_tickChase) :
    // consommée en une seule fois ici, acceptée ou pas -- pas de relance si
    // elle perd le tirage, c'est ça qui porte le "peut l'ignorer". Poids
    // relatif à la distance au poursuivant AU MOMENT de la décision
    // (référence live : il a pu se rapprocher ou s'éloigner entre-temps),
    // même schéma que les autres comportements de proximité.
    const chaseInvitation = this._chaseInvitation;
    this._chaseInvitation = null;
    if (chaseInvitation) {
      const distance = Math.abs(chaseInvitation.x - this.x);
      const proximity = clamp(1 - distance / this.config.fleeMaxDistance, 0.15, 1);
      candidates.push({ value: 'flee', weight: this.config.fleeWeight * proximity });
    }

    // Anti-répétition : uniquement sur les activités spéciales. "walk" est
    // déjà l'option la plus fréquente ; la pénaliser aussi surcorrigerait
    // en faveur des autres à chaque cycle qui suit une marche.
    for (const c of candidates) {
      if (c.value !== 'walk' && c.value === this._lastActivity) {
        c.weight *= this.config.repeatPenalty;
      }
    }

    const choice = weightedChoice(candidates, this.config.random);
    this._lastActivity = choice; // 'walk' ne matche jamais la garde !== 'walk' ci-dessus : équivalent à un reset

    switch (choice) {
      case 'sleep':
        this.state = State.SLEEP;
        this.stateTimer = randRange(this.config.sleepDuration, this.config.random);
        this.lastEvent = 'sleep';
        return;
      case 'wash':
        this.state = State.WASH;
        this.stateTimer = randRange(this.config.washDuration, this.config.random);
        this.lastEvent = 'wash';
        return;
      case 'follow':
        this.state = State.FOLLOW;
        this.stateTimer = randRange(this.config.followDuration, this.config.random);
        return;
      case 'greet':
        this.state = State.GREET;
        this.stateTimer = randRange(this.config.greetDuration, this.config.random);
        return;
      case 'climb':
        this.state = State.SEEK_WALL;
        this.stateTimer = randRange(this.config.climbSeekDuration, this.config.random);
        return;
      case 'seekFocus':
        this.state = State.SEEK_FOCUS;
        this.stateTimer = randRange(this.config.seekFocusDuration, this.config.random);
        return;
      case 'flee':
        this.state = State.FLEE;
        this._fleeFrom = chaseInvitation;
        this.stateTimer = randRange(this.config.fleeDuration, this.config.random);
        return;
      default:
        this._startWalkOnCurrentSurface(surfaces);
    }
  }

  _tickFollow(dt, surfaces, options) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer <= 0 || !options.pointer) {
      this._enterState(State.IDLE);
      return;
    }

    // Cible recalculée à chaque tick (contrairement à WALK, qui vise un
    // point fixe) : le critter suit un curseur qui continue de bouger.
    this._chase(dt, options.pointer.x);
  }

  _tickGreet(dt, surfaces, options) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    // Recalculé à chaque tick, comme le pointeur pour FOLLOW : pas de suivi
    // d'identité par id, si un autre critter devient plus proche entre-temps
    // la cible peut changer en cours de route.
    const target = options.otherCritters?.length
      ? options.otherCritters.reduce((a, b) => (Math.abs(b.x - this.x) < Math.abs(a.x - this.x) ? b : a))
      : null;

    if (this.stateTimer <= 0 || !target) {
      this._enterState(State.IDLE);
      return;
    }

    if (Math.abs(target.x - this.x) < this.config.greetDistance) {
      // this.lastEvent directement pour SOI-MÊME (pas interact()) : déclenché
      // DANS ce tick, après que tick() a déjà copié _pendingEvent vers
      // lastEvent en entrée -- passer par interact() ici décalerait
      // l'événement au tick suivant. Même pattern que 'landed'/'sleep'/'wash'
      // ailleurs. Pour LA CIBLE en revanche, la salutation arrive bien entre
      // deux de ses propres ticks : interact() (donc _pendingEvent) est le
      // mécanisme approprié, comme pour un événement externe (windowOpened).
      this.lastEvent = 'greeted';
      target.critter?.interact('meetCritter');

      // Enchaîne parfois sur une poursuite au lieu de repasser directement
      // en IDLE : propose (pas n'impose pas, cf. proposeChase) à la cible
      // de fuir, et se lance à sa poursuite.
      if (target.critter && this.config.random() < this.config.chaseChance) {
        target.critter.proposeChase(this);
        this.state = State.CHASE;
        this._chaseTarget = target.critter;
        this.stateTimer = randRange(this.config.chaseDuration, this.config.random);
        return;
      }

      this._enterState(State.IDLE);
      return;
    }

    // Pas atteignable (autre niveau, mur au milieu...) : le critter bute
    // contre le bord de sa propre surface et stateTimer finit par expirer
    // normalement, pas de cas particulier à gérer ici.
    this._chase(dt, target.x);
  }

  /**
   * Contrairement à GREET/FOLLOW/SEEK_WALL/SEEK_FOCUS, la cible est une
   * référence FIXE (`_chaseTarget`, posée par _tickGreet) plutôt que
   * recalculée par proximité à chaque tick : une vraie poursuite suit une
   * cible précise, pas "qui que ce soit de plus proche".
   */
  _tickChase(dt, surfaces) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer <= 0 || !this._chaseTarget) {
      this._chaseTarget = null;
      this._enterState(State.IDLE);
      return;
    }

    if (Math.abs(this._chaseTarget.x - this.x) < this.config.greetDistance) {
      // Rattrapé : réutilise 'greeted' (départ ET arrivée d'une poursuite
      // restent la même émotion) plutôt que d'ajouter un nouvel événement
      // et ses assets rien que pour ça.
      this.lastEvent = 'greeted';
      this._chaseTarget.interact('meetCritter'); // la cible réagit aussi en se faisant rattraper
      this._chaseTarget = null;
      this._enterState(State.IDLE);
      return;
    }

    // Référence live : suit la cible où qu'elle se soit rendue, pas une
    // position figée au moment où la poursuite a commencé.
    this._chase(dt, this._chaseTarget.x);
  }

  _tickFlee(dt, surfaces) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer <= 0 || !this._fleeFrom) {
      this._fleeFrom = null;
      this._enterState(State.IDLE);
      return;
    }

    // Symétrique de _chase, mais en s'éloignant de la cible plutôt qu'en
    // s'en approchant.
    const dir = sign(this.x - this._fleeFrom.x) || this.facing || 1;
    this.facing = dir;
    this.x += dir * this.config.walkSpeed * dt;

    if (this.currentSurface) {
      this.x = clamp(this.x, this.currentSurface.x1, this.currentSurface.x2);
    }
  }

  _tickSeekWall(dt, surfaces) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    // Recalculé à chaque tick (comme FOLLOW/GREET) : un mur peut devenir
    // injoignable (fenêtre fermée) ou un autre plus proche apparaître.
    const wall = findReachableWall(surfaces.walls, this.x, this.y);

    if (this.stateTimer <= 0 || !wall) {
      this._enterState(State.IDLE);
      return;
    }

    if (Math.abs(wall.x - this.x) < this.config.climbApproachDistance) {
      this.x = wall.x;
      this.y = clamp(this.y, wall.y1, wall.y2); // no-op ou presque : mur déjà filtré "atteignable" à la sélection
      this.currentSurface = wall;
      this._enterState(State.CLIMB);
      return;
    }

    this._chase(dt, wall.x);
  }

  _tickSeekFocus(dt, surfaces, options) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this.stateTimer <= 0 || !options.focusedWindow) {
      this._enterState(State.IDLE);
      return;
    }

    const targetX = options.focusedWindow.x + options.focusedWindow.width / 2;
    if (Math.abs(targetX - this.x) < this.config.seekFocusDistance) {
      // Arrivé : simple curiosité, pas de nouvelle réaction/son dédiés pour
      // ce comportement (contrairement à GREET -> 'greeted').
      this._enterState(State.IDLE);
      return;
    }

    this._chase(dt, targetX);
  }

  /** Avance vers `targetX` le long de la surface courante (WALK vise un
   * point fixe une fois pour toutes ; FOLLOW/GREET rappellent ceci chaque
   * tick avec une cible qui peut avoir bougé). */
  _chase(dt, targetX) {
    const dir = sign(targetX - this.x);
    this.facing = dir || this.facing;
    this.x += dir * this.config.walkSpeed * dt;

    if (this.currentSurface) {
      this.x = clamp(this.x, this.currentSurface.x1, this.currentSurface.x2);
    }
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
