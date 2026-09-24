import { clamp, sign } from './vec2.js';
import {
  findSurfaceBelow,
  isOnSegment,
  findSegmentById,
  findWallById,
  findWallNear,
  findCeilingAbove,
  findReachableWall,
  findReachableShelf,
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
  RUN: 'run', // marche rapide (même mécanique que WALK)
  SWIM_FAST: 'swimFast', // nage rapide (mêmes sessions que SWIM)
  FLY_FAST: 'flyFast', // vol rapide (mêmes sessions que FLY, se pose aussi)
  DIVE: 'dive', // piqué en fin de vol vers la surface visée
  SLEEP: 'sleep',
  WASH: 'wash', // idle passif minuté, se lave sur place (même mécanisme que SLEEP)
  FOLLOW: 'follow', // marche vers le curseur, cible recalculée en continu
  GREET: 'greet', // marche vers le critter le plus proche, salue en l'atteignant
  SEEK_WALL: 'seekWall', // marche vers un mur atteignable pour grimper délibérément
  SEEK_FOCUS: 'seekFocus', // marche vers la fenêtre qui vient de prendre le focus
  SEEK_NAP: 'seekNap', // marche vers un rebord de fenêtre proche avant de s'endormir
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

/** Gestes qui réveillent un animal endormi. */
const WAKING_GESTURES = new Set(['click', 'doubleClick', 'rightClick']);

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
  sleepDuration: [20, 90], // secondes ; chaque espèce règle la sienne (le chat va jusqu'à 15 minutes)
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
  napSeekMaxDistance: 400, // recherche locale, plus courte que les 600 des autres comportements ("proche" au sens du roadmap)
  napSeekDuration: [3, 6],
  napApproachDistance: 6,
  runWeight: 10,
  runSpeedFactor: 2.2, // multiplicateur de walkSpeed
  swimFastWeight: 4,
  swimFastFactor: 2.2,
  flyFastWeight: 4,
  flyFastFactor: 2.2,
  fastChance: 0.2, // espèce sans sol : probabilité qu'une nouvelle session enchaînée soit rapide
  diveChance: 0.25, // probabilité PAR SECONDE de piquer quand la cible est assez basse et l'angle raide
  diveMinHeight: 120, // dénivelé minimal (px) vers la cible pour piquer
  diveSpeedFactor: 3.5,
  flyCruiseChance: 0.6, // probabilité de monter d'abord vers une altitude de croisière au décollage
  swimRetargetDuration: [5, 10], // cadence de reciblage de la nage (le vol libre garde roamRetargetDuration)
  swimTurnMax: 60, // degrés : virage maximal à chaque reciblage de nage
  flyWeight: 8,
  flyDuration: [4, 8],
  swimWeight: 8,
  swimDuration: [4, 8],
  flyRetargetChance: 0.01, // probabilité PAR SECONDE de changer de cible d'atterrissage en plein vol (très rare)
  roamRetargetDuration: [1, 3], // cadence de reciblage pendant une session FLY/SWIM
  swimWaveFrequency: 4, // rad/s, cadence du battement de nage
  swimWaveAmplitude: 0.6, // fraction de la composante perpendiculaire à la trajectoire directe (< 1 : reste orienté vers la cible)
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

/**
 * Filtre la section `behavior` d'un pack.json avant de l'appliquer : seules
 * les clés existantes de DEFAULT_CONFIG de type nombre ou intervalle
 * [min, max] passent. random (fonction), supportedSurfaces (Set) et les
 * clés inconnues sont écartées : un JSON ne doit pas pouvoir casser le cœur.
 * @param {object} [raw]
 * @returns {{config: object, ignored: string[]}}
 */
export function behaviorOverrides(raw = {}) {
  const config = {};
  const ignored = [];
  for (const [key, value] of Object.entries(raw)) {
    const def = DEFAULT_CONFIG[key];
    const isNumber = typeof def === 'number' && typeof value === 'number' && Number.isFinite(value);
    const isRange =
      Array.isArray(def) &&
      Array.isArray(value) &&
      value.length === 2 &&
      value.every((v) => typeof v === 'number' && Number.isFinite(v));
    if (isNumber || isRange) config[key] = value;
    else ignored.push(key);
  }
  return { config, ignored };
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
    /** Compte à rebours avant le prochain reciblage pendant FLY/SWIM
     * (undefined tant qu'aucune session n'a démarré : _tickRoam s'en
     * accommode, cf. sa garde). */
    this._roamTimer = undefined;
    /** Phase de l'ondulation de nage (State.SWIM), continue d'une session à l'autre. */
    this._swimPhase = undefined;
    /** Dernier événement notable (pour déclencher un son/une réaction), vidé à chaque tick. */
    this.lastEvent = null;
    /** Événement posé par une méthode publique (pet/startDrag/...) entre deux
     * ticks. On ne l'écrit pas directement dans lastEvent car tick() vide
     * lastEvent en entrée : sans cette file, un événement posé juste avant
     * tick() serait effacé avant d'avoir pu être lu par l'appelant. */
    this._pendingEvent = null;
  }

  /** Point d'extension de la persistance : tout ce qui doit survivre à un
   * redémarrage (le mode compagnon y ajoutera humeur, faim...) va dans `extra`. */
  serialize() {
    return { x: Math.round(this.x), y: Math.round(this.y), facing: this.facing, extra: {} };
  }

  /** Repart en chute depuis la position sauvée : les surfaces ayant pu
   * changer, on se repose sur ce qui se trouve dessous. */
  restore(saved) {
    this.x = saved.x;
    this.y = saved.y;
    this.facing = saved.facing;
    this._enterState(State.FALL);
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
    // Seul un clic réveille : ni le survol, ni une fenêtre qui s'ouvre. Une
    // surface qui bouge ou disparaît sous l'animal le réveille par la chute
    // (cf. _tickWaiting/_resyncCurrentSurface).
    if (this.state === State.SLEEP && WAKING_GESTURES.has(kind)) this._enterState(State.IDLE);
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
        this._tickWalk(dt);
        break;
      case State.RUN:
        this._tickWalk(dt, this.config.walkSpeed * this.config.runSpeedFactor);
        break;
      case State.CLIMB:
        this._tickClimb(dt, surfaces);
        break;
      case State.CEILING:
        this._tickCeiling(dt);
        break;
      case State.SWIM:
      case State.SWIM_FAST:
        this._tickSwim(dt, options);
        break;
      case State.FLY:
      case State.FLY_FAST:
      case State.DIVE:
        this._tickFly(dt, surfaces, options);
        break;
      case State.FOLLOW:
        this._tickFollow(dt, options);
        break;
      case State.GREET:
        this._tickGreet(dt, options);
        break;
      case State.SEEK_WALL:
        this._tickSeekWall(dt, surfaces);
        break;
      case State.SEEK_FOCUS:
        this._tickSeekFocus(dt, options);
        break;
      case State.CHASE:
        this._tickChase(dt);
        break;
      case State.FLEE:
        this._tickFlee(dt);
        break;
      case State.SEEK_NAP:
        this._tickSeekNap(dt, surfaces);
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
      const groundless = this._groundlessRoamState();
      if (landing.type === 'water' && this.supports(Locomotion.WATER)) {
        this._startRoam(State.SWIM);
      } else if (groundless) {
        // Espèce sans sol (poisson, créature purement aérienne) : ne se pose
        // jamais, repart directement dans son roaming (spawn, fin de glisser).
        this._startRoam(groundless);
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

    // Décollage/plongeon : poids fixes, pas de proximité (rien à "viser"
    // pour un décollage, contrairement aux comportements ci-dessus).
    if (this.supports(Locomotion.GROUND)) {
      candidates.push({ value: 'run', weight: this.config.runWeight });
    }
    if (this.supports(Locomotion.AIR)) {
      candidates.push({ value: 'fly', weight: this.config.flyWeight });
      candidates.push({ value: 'flyFast', weight: this.config.flyFastWeight });
    }
    if (this.supports(Locomotion.WATER)) {
      candidates.push({ value: 'swim', weight: this.config.swimWeight });
      candidates.push({ value: 'swimFast', weight: this.config.swimFastWeight });
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
      case 'sleep': {
        // Sieste ciblée : plutôt que de dormir sur place, cherche d'abord
        // un rebord de fenêtre proche et atteignable en marchant ; repli
        // sur place si rien à portée (comportement d'avant ce raffinement).
        const shelf = this.currentSurface
          ? findReachableShelf(
              surfaces.segments,
              this.x,
              this.y,
              this.currentSurface.surfaceId,
              this.config.napSeekMaxDistance,
            )
          : null;
        if (shelf) {
          this.state = State.SEEK_NAP;
          this.stateTimer = randRange(this.config.napSeekDuration, this.config.random);
          return;
        }
        this.state = State.SLEEP;
        this.stateTimer = randRange(this.config.sleepDuration, this.config.random);
        this.lastEvent = 'sleep';
        return;
      }
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
      case 'fly':
        this._startRoam(State.FLY);
        return;
      case 'swim':
        this._startRoam(State.SWIM);
        return;
      case 'flyFast':
        this._startRoam(State.FLY_FAST);
        return;
      case 'swimFast':
        this._startRoam(State.SWIM_FAST);
        return;
      case 'run':
        this._startWalkOnCurrentSurface(State.RUN);
        return;
      default:
        this._startWalkOnCurrentSurface();
    }
  }

  _tickFollow(dt, options) {
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

  _tickGreet(dt, options) {
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
  _tickChase(dt) {
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

  _tickFlee(dt) {
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

  _tickSeekNap(dt, surfaces) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    // Recalculé à chaque tick (comme SEEK_WALL) : un rebord peut devenir
    // injoignable (fenêtre fermée/déplacée) en chemin.
    const shelf = this.currentSurface
      ? findReachableShelf(
          surfaces.segments,
          this.x,
          this.y,
          this.currentSurface.surfaceId,
          this.config.napSeekMaxDistance,
        )
      : null;

    if (this.stateTimer <= 0 || !shelf) {
      this._enterState(State.IDLE);
      return;
    }

    const targetX = clamp(this.x, shelf.x1, shelf.x2); // point le plus proche sur le rebord
    if (Math.abs(targetX - this.x) < this.config.napApproachDistance) {
      this.x = targetX;
      this.y = shelf.y;
      this.currentSurface = shelf;
      this.state = State.SLEEP;
      this.stateTimer = randRange(this.config.sleepDuration, this.config.random);
      this.lastEvent = 'sleep';
      return;
    }

    this._chase(dt, targetX);
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

  _tickSeekFocus(dt, options) {
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

  _startWalkOnCurrentSurface(state = State.WALK) {
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
    this.state = state;
    this.stateTimer = randRange(this.config.walkDuration, this.config.random);
  }

  _tickWalk(dt, speed = this.config.walkSpeed) {
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
    this.x += dir * speed * dt;

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

  _tickCeiling(dt) {
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

  /**
   * Mécanique partagée par FLY et SWIM : cible 2D recalculée
   * périodiquement (contrairement à WALK, qui vise un point fixe une fois
   * pour toutes). "Atterrir" ne demande aucune logique dédiée : une fois
   * stateTimer écoulé, on repasse en FALL et la détection d'atterrissage
   * déjà en place (findSurfaceBelow) s'occupe du reste.
   * @param {boolean} wavy si vrai, ondule perpendiculairement à la
   * trajectoire directe vers la cible (nage) plutôt que d'y aller tout
   * droit (vol).
   */
  /** Locomotion de roaming d'une espèce qui ne supporte pas le sol :
   * SWIM (eau) en priorité, sinon FLY (air), sinon null. */
  _groundlessRoamState() {
    if (this.supports(Locomotion.GROUND)) return null;
    if (this.supports(Locomotion.WATER)) return State.SWIM;
    if (this.supports(Locomotion.AIR)) return State.FLY;
    return null;
  }

  /** État de base d'une variante : SWIM_FAST -> SWIM ; FLY_FAST/DIVE -> FLY. */
  _roamBase(state) {
    if (state === State.SWIM_FAST) return State.SWIM;
    if (state === State.FLY_FAST || state === State.DIVE) return State.FLY;
    return state;
  }

  /** Session enchaînée d'une espèce sans sol : rapide avec `fastChance`. */
  _roamVariant(base) {
    const fast = this.config.random() < this.config.fastChance;
    if (!fast) return base;
    return base === State.SWIM ? State.SWIM_FAST : State.FLY_FAST;
  }

  /** Démarre une session FLY/SWIM. Pas _enterState() : stateTimer et
   * _roamTimer doivent être posés dès la première frame, sinon _tickRoam
   * verrait stateTimer déjà <= 0 et terminerait aussitôt la session. */
  _startRoam(state) {
    if (this._roamBase(this.state) !== State.SWIM) this._roamHasTarget = false;
    this.state = state;
    const swimming = this._roamBase(state) === State.SWIM;
    const duration = swimming ? this.config.swimDuration : this.config.flyDuration;
    this.stateTimer = randRange(duration, this.config.random);
    this._roamTimer = 0; // force un premier ciblage dès le premier tick
    this._flyTarget = null; // cible d'atterrissage, choisie au premier tick de vol
    this._flyWaypoint = null;
    // En vol on n'est plus attaché à la surface de départ : si sa fenêtre se
    // ferme, tick() ne doit pas nous faire tomber (cf. _resyncCurrentSurface).
    this._flyOriginId = this.currentSurface?.surfaceId;
    this.currentSurface = null;
  }

  _tickRoam(dt, options, speed, yRangeFactors, wavy = false) {
    if (this.stateTimer <= 0) {
      // Une espèce sans sol enchaîne une nouvelle session plutôt que de
      // retomber : elle n'aurait nulle part où se poser.
      const base = this._roamBase(this.state);
      if (this._groundlessRoamState() === base) this._startRoam(this._roamVariant(base));
      else this._enterState(State.FALL);
      return;
    }

    const arrived =
      this.walkTargetX != null &&
      this._flyTargetY != null &&
      Math.hypot(this.walkTargetX - this.x, this._flyTargetY - this.y) < 24;
    if (this._roamTimer === undefined || this._roamTimer <= 0 || (arrived && this._roamHasTarget)) {
      const bounds = options.worldBounds ?? { x: 0, y: 0, width: 1920, height: 1080 };
      const [yMinFactor, yMaxFactor] = yRangeFactors;
      const yMin = bounds.y + bounds.height * yMinFactor;
      const yMax = bounds.y + bounds.height * yMaxFactor;
      if (wavy && this._roamHasTarget) {
        // Nage : nouveau cap proche du précédent (virage limité), pas un
        // point tiré n'importe où, pour éviter les changements de direction
        // brusques et fréquents.
        const heading = Math.atan2(this._flyTargetY - this.y, this.walkTargetX - this.x);
        const turn = (this.config.swimTurnMax * Math.PI) / 180;
        const angle = heading + randRange([-turn, turn], this.config.random);
        const dist = randRange([0.3, 0.7], this.config.random) * bounds.width;
        let cos = Math.cos(angle);
        let sin = Math.sin(angle);
        // Trop près d'un bord : on repart dans l'autre sens sur cet axe.
        if (this.x + cos * dist < bounds.x || this.x + cos * dist > bounds.x + bounds.width) cos = -cos;
        if (this.y + sin * dist < yMin || this.y + sin * dist > yMax) sin = -sin;
        this.walkTargetX = clamp(this.x + cos * dist, bounds.x, bounds.x + bounds.width);
        this._flyTargetY = clamp(this.y + sin * dist, yMin, yMax);
      } else {
        this.walkTargetX = randRange([bounds.x, bounds.x + bounds.width], this.config.random);
        this._flyTargetY = randRange([yMin, yMax], this.config.random);
      }
      this._roamHasTarget = true;
      this._roamTimer = randRange(
        wavy ? this.config.swimRetargetDuration : this.config.roamRetargetDuration,
        this.config.random,
      );
    }
    this._roamTimer -= dt;

    const toX = this.walkTargetX - this.x;
    const toY = this._flyTargetY - this.y;
    const distance = Math.hypot(toX, toY) || 1;
    let dirX = toX / distance;
    let dirY = toY / distance;

    if (wavy) {
      // Onde perpendiculaire à la trajectoire directe, façon nage
      // ondulante (queue de poisson) plutôt qu'une ligne droite. Amplitude
      // < 1 : la composante "vers la cible" reste toujours dominante, donc
      // la cible finit toujours par être atteinte (ou re-tirée avant).
      this._swimPhase = (this._swimPhase ?? 0) + dt * this.config.swimWaveFrequency;
      const wobble = Math.sin(this._swimPhase) * this.config.swimWaveAmplitude;
      const perpX = -dirY;
      const perpY = dirX;
      dirX += perpX * wobble;
      dirY += perpY * wobble;
      const norm = Math.hypot(dirX, dirY) || 1;
      dirX /= norm;
      dirY /= norm;
    }

    this.facing = sign(dirX) || this.facing;
    this.x += dirX * speed * dt;
    this.y += dirY * speed * dt;
  }

  /**
   * Vol d'une espèce qui sait marcher au sol : on choisit dès le décollage
   * une surface où se poser (rebord de fenêtre ou sol), on y vole en ligne
   * droite et on s'y pose, sans jamais retomber en chute libre. La cible ne
   * change que très rarement (`flyRetargetChance`) ou si sa surface a
   * disparu ou bougé. Une espèce purement aérienne n'a nulle part où se
   * poser : elle garde le roaming libre de _tickRoam.
   */
  _tickFly(dt, surfaces, options) {
    const factor =
      this.state === State.DIVE
        ? this.config.diveSpeedFactor
        : this.state === State.FLY_FAST
          ? this.config.flyFastFactor
          : 1;

    if (this._groundlessRoamState() === State.FLY) {
      this._tickRoam(dt, options, this.config.flySpeed * factor, [0, 0.5], false);
      return;
    }

    let target = this._flyTarget;
    if (target?.segment) {
      const seg = target.segment;
      const fresh = findSegmentById(surfaces.segments ?? [], seg.surfaceId, seg.type);
      if (!fresh || fresh.y !== seg.y || fresh.x1 !== seg.x1 || fresh.x2 !== seg.x2) target = null;
    }
    if (target && this.state !== State.DIVE && this.config.random() < this.config.flyRetargetChance * dt) {
      target = null;
    }
    if (!target) {
      target = this._flyTarget = this._pickFlyTarget(surfaces, options);
      this._flyWaypoint = this._pickCruise(target, options);
      if (this.state === State.DIVE) this.state = State.FLY; // cible perdue : on reprend un vol normal
    }

    // Piqué : seulement vers une cible nettement plus basse et raide, et
    // jamais pendant la montée vers l'altitude de croisière.
    if (this.state !== State.DIVE && !this._flyWaypoint && target.segment) {
      const dy = target.y - this.y;
      const dx = Math.abs(target.x - this.x);
      if (
        dy >= this.config.diveMinHeight &&
        dx <= 1.5 * dy &&
        this.config.random() < this.config.diveChance * dt
      ) {
        this.state = State.DIVE;
      }
    }

    const goal = this._flyWaypoint ?? target;
    const speed = this.config.flySpeed * (this.state === State.DIVE ? this.config.diveSpeedFactor : factor);
    const toX = goal.x - this.x;
    const toY = goal.y - this.y;
    const distance = Math.hypot(toX, toY);
    const step = speed * dt;
    if (distance <= step + 1) {
      this.x = goal.x;
      this.y = goal.y;
      if (this._flyWaypoint) {
        this._flyWaypoint = null;
        return;
      }
      this._flyTarget = null;
      if (target.segment) {
        this.currentSurface = target.segment;
        this.vy = 0;
        this._enterState(State.IDLE);
        this.lastEvent = 'landed';
      } else {
        this._enterState(State.FALL); // aucune surface connue : le sol du monde
      }
      return;
    }
    this.facing = sign(toX) || this.facing;
    this.x += (toX / distance) * step;
    this.y += (toY / distance) * step;
  }

  /** Point de croisière optionnel : haut dans l'écran et au-dessus de la
   * cible, pour que la descente qui suit puisse être un piqué. */
  _pickCruise(target, options) {
    if (!target.segment || this.config.random() >= this.config.flyCruiseChance) return null;
    const bounds = options.worldBounds ?? { x: 0, y: 0, width: 1920, height: 1080 };
    const top = bounds.y + bounds.height * 0.08;
    const bottom = Math.min(target.y - this.config.diveMinHeight, bounds.y + bounds.height * 0.5);
    if (bottom <= top) return null;
    const y = randRange([top, bottom], this.config.random);
    const spread = (target.y - y) * 0.5;
    const x = clamp(
      target.x + randRange([-spread, spread], this.config.random),
      bounds.x,
      bounds.x + bounds.width,
    );
    return { x, y };
  }

  /** Surface d'atterrissage (sol ou rebord, autre que celle qu'on quitte si
   * possible) et point d'arrivée dessus ; à défaut, le bas du monde. */
  _pickFlyTarget(surfaces, options) {
    const landable = (surfaces.segments ?? []).filter(
      (seg) => (seg.type === 'ground' || seg.type === 'shelf') && seg.x2 > seg.x1,
    );
    const others = landable.filter((seg) => seg.surfaceId !== (this._flyOriginId ?? this.currentSurface?.surfaceId));
    const pool = others.length > 0 ? others : landable;

    if (pool.length === 0) {
      const bounds = options.worldBounds ?? { x: 0, y: 0, width: 1920, height: 1080 };
      return {
        segment: null,
        x: randRange([bounds.x, bounds.x + bounds.width], this.config.random),
        y: bounds.y + bounds.height,
      };
    }
    const segment = pool[Math.min(pool.length - 1, Math.floor(this.config.random() * pool.length))];
    const margin = Math.min(8, (segment.x2 - segment.x1) / 2);
    return {
      segment,
      x: randRange([segment.x1 + margin, segment.x2 - margin], this.config.random),
      y: segment.y,
    };
  }

  _tickSwim(dt, options) {
    const factor = this.state === State.SWIM_FAST ? this.config.swimFastFactor : 1;
    this._tickRoam(dt, options, this.config.swimSpeed * factor, [0, 1], true); // tout l'écran, ondulant
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
