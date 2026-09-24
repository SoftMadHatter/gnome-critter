import { clamp, sign } from './vec2.js';
import { Needs, needMultiplier, NEED_GAUGES } from './needs.js';
import { Life, modifiersFor } from './life.js';
import { Stats } from './stats.js';
import { newlyUnlocked } from './achievements.js';
import { edibleFor, consume, bedsOn, toysFor, kick, push, pickGift, litterFor, isDirty, isOldMess } from './items.js';
import { TrickBook, TRICKS } from './tricks.js';
import { sanitizeName } from './names.js';
import { autonomyLevel } from './autonomy.js';
import {
  findSurfaceBelow,
  isOnSegment,
  findSegmentById,
  findWallById,
  findWallNear,
  findCeilingAbove,
  findReachableWall,
  findReachableShelf,
  isInsideAnyMonitor,
  respawnPoint,
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
  SEEK_FOOD: 'seekFood', // rejoint une nourriture visée
  EAT: 'eat', // mange, immobile
  EGG: 'egg', // œuf : immobile, posé, jusqu'à l'éclosion
  HIBERNATE: 'hibernate', // hibernation après une négligence prolongée
  PLAY: 'play', // rejoint et joue avec un jouet, ou poursuit le pointeur laser
  BRUSHED: 'brushed', // se laisse brosser, immobile
  TRICK: 'trick', // exécute un tour (assis, roulade...)
  RELIEVE: 'relieve', // va à la litière (ou au coin) et se soulage
  HUNT: 'hunt', // poursuit une proie (animal autonome)
  GIFT: 'gift', // apporte un cadeau au curseur
  REMIND: 'remind', // vient vers le curseur rappeler au joueur de faire une pause
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
  notification: 'noticed', // une notification arrive (contenu jamais lu)
  typing: 'noticed', // le joueur tape (touches jamais lues), limité par typingCooldown
  userReturned: 'greeted', // le joueur revient après une absence
  meetCritter: 'greeted', // posé sur LA CIBLE d'un GREET (voir _tickGreet) : arrive entre deux de ses propres ticks, donc via interact()/_pendingEvent comme les autres événements externes -- contrairement à l'initiateur, qui pose this.lastEvent directement puisque ça se passe DANS son propre tick.
};

/** États où l'animal se dépense (gain de stimulation, cf. Needs.advance). */
/** Compteur incrémenté à chaque événement d'animal. */
const EVENT_STATS = {
  ate: 'meals', played: 'playSessions', brushed: 'brushes', purring: 'purrs', petted: 'pets', greeted: 'greets',
};

/** Compteurs d'activité : entrée dans un état depuis un état qui n'en fait pas partie. */
const STATE_GROUPS = [
  ['climbs', new Set(['climb'])],
  ['flights', new Set(['fly', 'flyFast', 'dive'])],
  ['dives', new Set(['dive'])],
  ['swims', new Set(['swim', 'swimFast'])],
  ['runs', new Set(['run'])],
  ['naps', new Set(['sleep'])],
];

const ACTIVE_STATES = new Set([
  State.WALK, State.RUN, State.CLIMB, State.CEILING, State.SWIM, State.SWIM_FAST,
  State.FLY, State.FLY_FAST, State.DIVE, State.FOLLOW, State.GREET, State.SEEK_WALL,
  State.SEEK_FOCUS, State.SEEK_NAP, State.CHASE, State.FLEE, State.SEEK_FOOD, State.PLAY, State.REMIND, State.GIFT, State.HUNT,
]);

/** Activités idle dont le poids suit la stimulation (l'animal s'ennuie : il bouge). */
const ENERGETIC_ACTIVITIES = new Set(['run', 'fly', 'flyFast', 'swim', 'swimFast', 'climb']);

/** Gestes qui réveillent un animal endormi. */
const WAKING_GESTURES = new Set(['click', 'doubleClick', 'rightClick']);

const DEFAULT_CONFIG = {
  speciesId: 'unknown',
  needsRateScale: 1, // difficulté * (vacances ? 0 : 1), voir core/needs.js
  needsRates: {}, // débits par heure propres à l'espèce (section `needs` du pack, filtrée par needsOverrides)
  lifeAgeScale: 1, // vitesse de croissance (réglage), 0 en mode vacances
  stageScales: {}, // échelle d'affichage par stade (section `stages` du pack, filtrée par stagesOverrides)
  needsDiet: {}, // aliment -> gain de satiété (section `needs.diet` du pack) ; un aliment absent est ignoré
  foodWeight: 40, // multiplié par la faim : un affamé préfère manger, un rassasié ignore
  foodSeekDuration: [6, 12], // temps maximal pour rejoindre une nourriture
  eatDuration: [2, 4], // durée d'une bouchée
  eatMoreBelow: 80, // satiété sous laquelle il enchaîne la bouchée suivante ; au-dessus, il laisse un reste
  bedSleepFactor: 1.5, // multiplicateur du gain d'énergie en dormant sur un lit
  bedRadius: 24, // distance sous laquelle on dort « sur » le lit
  playWeight: 30, // multiplié par l'ennui : un animal qui s'ennuie joue
  laserWeight: 80, // mode pointeur laser actif : il se précipite dessus
  playDuration: [6, 12],
  kickDistance: 18, // distance sous laquelle il « touche » la balle
  kickInterval: 1.2, // secondes entre deux frappes
  floatingPlayChance: 0.2, // espèce sans sol qui s'ennuie : chance par seconde d'aller jouer avec un jouet flottant
  floatingPlayBelow: 60, // stimulation sous laquelle elle s'ennuie assez pour y aller
  petStreakWindow: 3, // secondes max entre deux caresses d'une même série
  petStreakMin: 3, // caresses pour que la série devienne un ronronnement
  brushDuration: 4,
  nightSleepFactor: 3, // nuit : poids du sommeil
  nightEnergeticFactor: 0.4, // nuit : poids des activités énergiques
  awaySleepFactor: 4, // joueur absent : poids du sommeil
  awayEnergeticFactor: 0.3,
  remindWeight: 1000, // rappel de pause demandé : il l'emporte
  remindDuration: 25, // secondes passées près du curseur
  tricks: [], // tours de l'espèce (liste `tricks` du pack, filtrée par tricksOverrides)
  giftWeight: 6, // rare : un animal très affectueux ramène un cadeau
  giftCooldown: 1200, // secondes entre deux cadeaux
  giftAffection: 70, // affection minimale pour offrir
  giftDuration: [12, 25],
  giftChancePerSecond: 0.01, // espèce sans sol : chance par seconde de partir offrir
  autonomyMode: 'auto', // `auto` (suit la croissance), `off`, `partial`, `full` (voir core/autonomy.js)
  needsPrey: {}, // proies chassées -> gain de satiété (section `needs.prey` du pack)
  huntWeight: 30, // multiplié par l'autonomie et la faim
  grazeWeight: 15, // idem, pour les plantes
  huntDuration: 12, // secondes de poursuite au plus
  catchDistance: 14, // distance à laquelle il attrape la proie
  reliefWeight: 60, // multiplié par l'urgence : un animal pressé y va tout de suite
  reliefDuration: 3.5, // secondes accroupi
  accidentBelow: 8, // soulagement sous lequel l'animal se soulage sur place
  accidentCleanlinessLoss: 15,
  messRadius: 200, // distance à laquelle une trace le dérange
  messCleanlinessLoss: 6, // propreté perdue par heure et par trace proche (trois au plus)
  oldMessHealthLoss: 5, // santé perdue par heure et par vieille trace proche (trois au plus)
  moldSickness: 20, // santé perdue en mangeant de la nourriture moisie
  achievements: [], // succès du pack (section `achievements`, filtrée par achievementsOverrides)
  typingCooldown: 20, // secondes minimales entre deux réactions à la frappe
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
    this._baseConfig = { ...DEFAULT_CONFIG, ...config };
    this.config = { ...this._baseConfig };
    this.needs = new Needs({ rates: this.config.needsRates, rateScale: this.config.needsRateScale });
    this._baseRates = { ...this.needs.rates };
    /** Adulte neutre par défaut : le Manager fournit la vraie vie (œuf, caractère,
     * couleur) avec setLife(), ce qui garde le cœur déterministe pour les tests. */
    this.life = new Life({}, { scales: this.config.stageScales });
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
    this._clock = 0;
    this._lastPetAt = -Infinity;
    this._petStreak = 0;
    this._playTarget = null;
    this._lastTypingAt = -Infinity;
    this._acknowledged = false;
    this.stats = new Stats();
    this.autonomy = 0; // niveau d'autonomie courant (recalculé à chaque tick)
    this._reliefTarget = null;
    this._pendingMess = null;
    this._huntTarget = null;
    this.tricks = new TrickBook();
    this._trick = null;
    this._lastGiftAt = 0; // le premier cadeau n'arrive qu'après giftCooldown secondes d activité
    this._pendingGift = null;
    this._giftArrived = false;
    /** Accessoire porté (id de core/accessories.js) ou null. */
    this.accessory = null;
    /** Nom de la créature (choisi ou tiré à la naissance), ou null. */
    this.name = null;
    /** Succès déjà obtenus et ceux à annoncer (voir takeUnlocked). */
    this.unlocked = new Set();
    this._pendingUnlocked = [];
    this._sleepStreak = 0;
    this._achieveTimer = 0;
  }

  /** Remplace la vie (œuf, caractère...) et recalcule la configuration qui en découle. */
  setLife(life) {
    this.life = life;
    this._recomputeConfig();
    // Un œuf (ou un hibernant) qui remplace un animal déjà actif : posé, il passe tout de
    // suite à l'état immobile ; en l'air, il retombe d'abord.
    if (this._lifeFrozen() && this.state !== State.DRAG && this.state !== State.FALL) {
      if (this.currentSurface) this.state = this.life.hibernating ? State.HIBERNATE : State.EGG;
      else this._enterState(State.FALL);
    }
  }

  /**
   * Configuration effective = configuration de base (défauts + pack) avec les
   * facteurs de caractère et de stade sur les poids et les vitesses, et les
   * débits de besoins ajustés. Rappelé à chaque changement de vie.
   */
  _recomputeConfig() {
    const mods = modifiersFor(this.life.trait, this.life.stage);
    const config = { ...this._baseConfig };
    for (const [key, factor] of Object.entries(mods.weights)) {
      if (typeof config[key] === 'number') config[key] *= factor;
    }
    for (const key of ['walkSpeed', 'climbSpeed', 'swimSpeed', 'flySpeed']) config[key] *= mods.speed;
    this.config = config;
    for (const gauge of NEED_GAUGES) {
      this.needs.rates[gauge] = this._baseRates[gauge] * (mods.decay[gauge] ?? 1) * (mods.decay.all ?? 1);
    }
  }

  setLifeAgeScale(scale) {
    this._baseConfig.lifeAgeScale = scale;
    this.config.lifeAgeScale = scale;
  }

  /** Le joueur réveille l'animal hibernant (soin) : jauges remontées, retour au repos. */
  wake() {
    if (!this.life.wake()) return;
    this.needs.revive();
    this._enterState(State.IDLE);
    this._pendingEvent = 'awakened';
  }

  _countEvent(event) {
    if (this.life.stage === 'egg') return;
    if (EVENT_STATS[event]) this.stats.add(EVENT_STATS[event]);
  }

  /** Compteurs d'activité, plus longue sieste et évaluation des succès (une fois par seconde). */
  _trackProgress(dt, previousState) {
    if (this._lifeFrozen()) {
      this._sleepStreak = 0;
      return;
    }
    if (this.state !== previousState) {
      for (const [key, states] of STATE_GROUPS) {
        if (states.has(this.state) && !states.has(previousState)) this.stats.add(key);
      }
    }
    if (this.state === State.SLEEP) {
      this._sleepStreak += dt;
      this.stats.max('longestSleepSeconds', Math.floor(this._sleepStreak));
    } else {
      this._sleepStreak = 0;
    }

    this._achieveTimer += dt;
    if (this._achieveTimer < 1 || this.config.achievements.length === 0) return;
    this._achieveTimer = 0;
    const stats = { ...this.stats.counters, daysAlive: Math.floor(this.life.ageSeconds / 86400) };
    for (const id of newlyUnlocked(this.config.achievements, { trait: this.life.trait, stage: this.life.stage, stats }, this.unlocked)) {
      this.unlocked.add(id);
      this._pendingUnlocked.push(id);
    }
  }

  /** Nomme la créature ; un texte vide ou invalide ne change rien. */
  setName(text) {
    const name = sanitizeName(text);
    if (name !== null) this.name = name;
    return this.name;
  }

  /** Équipe un accessoire (le Manager vérifie qu'il est acheté ou de saison) ; null pour l'enlever. */
  equip(id) {
    this.accessory = typeof id === 'string' ? id : null;
  }

  /** Succès débloqués depuis le dernier appel (chacun une seule fois). */
  takeUnlocked() {
    const ids = this._pendingUnlocked;
    this._pendingUnlocked = [];
    return ids;
  }

  /** Point d'extension de la persistance : tout ce qui doit survivre à un
   * redémarrage (le mode compagnon y ajoutera humeur, faim...) va dans `extra`. */
  serialize() {
    return {
      x: Math.round(this.x),
      y: Math.round(this.y),
      facing: this.facing,
      extra: {
        needs: this.needs.serialize(),
        life: this.life.serialize(),
        stats: this.stats.serialize(),
        achievements: [...this.unlocked],
        accessory: this.accessory,
        name: this.name,
        tricks: this.tricks.serialize(),
      },
    };
  }

  /** Repart en chute depuis la position sauvée : les surfaces ayant pu
   * changer, on se repose sur ce qui se trouve dessous. */
  restore(saved, { elapsedSeconds = 0 } = {}) {
    this.x = saved.x;
    this.y = saved.y;
    this.facing = saved.facing;
    if (saved.extra?.life) this.life.restore(saved.extra.life);
    this.stats.restore(saved.extra?.stats);
    this.tricks.restore(saved.extra?.tricks);
    this.name = sanitizeName(saved.extra?.name);
    this.accessory = typeof saved.extra?.accessory === 'string' ? saved.extra.accessory : null;
    if (Array.isArray(saved.extra?.achievements)) {
      this.unlocked = new Set(saved.extra.achievements.filter((id) => typeof id === 'string'));
    }
    this._recomputeConfig();
    this.needs.restore(saved.extra?.needs);
    if (!this._lifeFrozen()) this.needs.catchUp(elapsedSeconds);
    this.life.catchUp(elapsedSeconds, { ageScale: this.config.lifeAgeScale });
    this._recomputeConfig();
    this._enterState(State.FALL);
  }

  /**
   * Après un changement de résolution ou d'écran, l'animal peut se retrouver
   * hors de tout moniteur : il réapparaît alors en haut du moniteur le plus
   * proche et retombe. Sans effet pendant un glisser (l'utilisateur le tient).
   * @param {{x:number,y:number,width:number,height:number}[]} monitors
   * @param {number} spriteHeight hauteur du sprite (y désigne les pieds)
   * @returns {boolean} vrai s'il a été replacé
   */
  /** Besoins et décisions à l'arrêt : dans l'œuf ou en hibernation. */
  _lifeFrozen() {
    return this.life.hibernating || this.life.stage === 'egg';
  }

  ensureVisible(monitors, spriteHeight) {
    if (this.state === State.DRAG || monitors.length === 0) return false;
    // Un pixel au-dessus des pieds : posé sur le bord bas d'un moniteur, il est visible.
    if (isInsideAnyMonitor(monitors, this.x, this.y - 1)) return false;
    const point = respawnPoint(monitors, this.x, this.y, spriteHeight);
    if (!point) return false;
    this.x = point.x;
    this.y = point.y;
    this.vx = 0;
    this.vy = 0;
    this.currentSurface = null;
    this._enterState(State.FALL);
    return true;
  }

  /** Réglage d'autonomie vivant : `auto`, `off`, `partial` ou `full`. */
  setAutonomyMode(mode) {
    this._baseConfig.autonomyMode = mode;
    this.config.autonomyMode = mode;
  }

  setNeedsRateScale(scale) {
    this.needs.setRateScale(scale);
  }

  supports(locomotion) {
    return this.config.supportedSurfaces.has(locomotion);
  }

  // --- Interactions utilisateur -------------------------------------------------

  startDrag() {
    this._releaseFood();
    this._playTarget = null;
    this._huntTarget = null;
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
    // Dans l'œuf : aucune interaction (ni réaction, ni caresse) ; seul le glisser reste possible.
    if (this.life.stage === 'egg') return;
    let event = INTERACTION_REACTIONS[kind];
    if (kind === 'typing') {
      if (this._clock - this._lastTypingAt < this.config.typingCooldown) return;
      this._lastTypingAt = this._clock;
    }
    if (kind === 'userReturned' && this.state === State.SLEEP) this._enterState(State.IDLE); // il t'accueille
    if (kind === 'click' && this.state === State.REMIND) {
      this._acknowledged = true; // le joueur a vu le rappel
      this._enterState(State.IDLE);
    }
    if (kind === 'click') {
      // Des caresses rapprochées forment une série : à partir de la 3e,
      // ronronnement (plus d'affection) au lieu d'une simple caresse.
      this._petStreak = this._clock - this._lastPetAt <= this.config.petStreakWindow ? this._petStreak + 1 : 1;
      this._lastPetAt = this._clock;
      if (this._petStreak >= this.config.petStreakMin) event = 'purring';
    }
    if (event) this._pendingEvent = event;
    // Seul un clic réveille : ni le survol, ni une fenêtre qui s'ouvre. Une
    // surface qui bouge ou disparaît sous l'animal le réveille par la chute
    // (cf. _tickWaiting/_resyncCurrentSurface).
    if (this.state === State.SLEEP && WAKING_GESTURES.has(kind)) this._enterState(State.IDLE);
    if (this.state === State.HIBERNATE && WAKING_GESTURES.has(kind)) this.wake();
  }

  /**
   * Propose une fuite (utilisé par CHASE, cf. _tickGreet) : ne force rien,
   * juste une opportunité de plus pour le choix pondéré de _tickWaiting
   * -- la cible pourra l'accepter ou l'ignorer à sa prochaine décision
   * idle, au même titre que sleep/wash/follow/etc.
   */
  /** Vrai une seule fois après un clic sur l'animal venu rappeler la pause (le Manager remet le compteur à zéro). */
  takeAcknowledgement() {
    const acknowledged = this._acknowledged;
    this._acknowledged = false;
    return acknowledged;
  }

  proposeChase(chaser) {
    if (this.life.stage === 'egg') return;
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
    // L'événement venu de l'extérieur agit sur les jauges tout de suite : la
    // logique du tick peut ensuite écraser lastEvent (ex. 'sleep').
    const external = this.lastEvent;
    if (external) {
      this.needs.apply(external);
      this._countEvent(external);
    }
    const previousState = this.state;
    this.autonomy = autonomyLevel(this.config.autonomyMode, this.life, this.tricks.learned().length);
    this.needs.setAutonomy(this.autonomy);
    this.stateTimer -= dt;
    this._clock += dt;
    if (!this._lifeFrozen()) {
      this.needs.advance(dt, {
        sleeping: this.state === State.SLEEP,
        active: ACTIVE_STATES.has(this.state),
        sleepFactor: this._bedSleepFactor(options),
      });
    }
    this._applyLifeTransitions(
      this.life.advance(dt, {
        mood: this.needs.mood,
        health: this.needs.values.health,
        ageScale: this.config.lifeAgeScale,
        needsScale: this.needs.rateScale * (1 - this.autonomy), // un animal autonome ne tombe pas dans la négligence
      }),
    );

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
        this._tickSeekNap(dt, surfaces, options);
        break;
      case State.SEEK_FOOD:
        this._tickSeekFood(dt);
        break;
      case State.EAT:
        this._tickEat(dt);
        break;
      case State.REMIND:
        this._tickRemind(dt, options);
        break;
      case State.HUNT:
        this._tickHunt(dt);
        break;
      case State.RELIEVE:
        this._tickRelieve(dt);
        break;
      case State.TRICK:
        this._tickTrick();
        break;
      case State.GIFT:
        this._tickGift(dt, options);
        break;
      case State.EGG:
      case State.HIBERNATE:
        this._tickResting();
        break;
      case State.PLAY:
        this._tickPlay(dt, options);
        break;
      case State.BRUSHED:
        this._tickBrushed(dt);
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

    this._environment(dt, options);
    if (this.lastEvent && this.lastEvent !== external) {
      this.needs.apply(this.lastEvent);
      this._countEvent(this.lastEvent);
    }
    this._trackProgress(dt, previousState);

    return this.snapshot();
  }

  snapshot() {
    return {
      x: this.x,
      y: this.y,
      facing: this.facing,
      state: this.state,
      event: this.life.stage === 'egg' ? null : this.lastEvent,
      name: this.name,
      autonomy: this.autonomy,
      accessory: this.accessory,
      trick: this._trick,
      bubble: this.state === State.REMIND ? 'break' : null,
      urgentNeed: this._lifeFrozen() ? null : this.needs.urgent(),
      mood: this.needs.mood,
      ...this.life.snapshot(),
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
      if (this.life.hibernating) {
        this.state = State.HIBERNATE;
      } else if (this.life.stage === 'egg') {
        this.state = State.EGG;
      } else if (landing.type === 'water' && this.supports(Locomotion.WATER)) {
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
      if (this.state === State.WASH) this.needs.apply('washed');
      this._enterState(State.IDLE);
      return;
    }

    // Urgence : il ne tient plus, il se soulage sur place (trace, propreté en baisse).
    if (this.needs.values.relief < this.config.accidentBelow && this.supports(Locomotion.GROUND) && this.currentSurface) {
      this._accident();
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

    const edible = this._edibleTargets(options);
    if (edible.length > 0) candidates.push({ value: 'food', weight: this.config.foodWeight });

    const toys =
      options.items?.length && this.supports(Locomotion.GROUND) && this.currentSurface
        ? toysFor(options.items, {
            x: this.x,
            surfaceId: this.currentSurface.surfaceId,
            canFly: this.supports(Locomotion.AIR),
          })
        : [];
    if (toys.length > 0) candidates.push({ value: 'play', weight: this.config.playWeight });
    if (options.laser && options.pointer) candidates.push({ value: 'laser', weight: this.config.laserWeight });
    if (options.ambient?.breakReminder && options.pointer) {
      candidates.push({ value: 'remind', weight: this.config.remindWeight });
    }
    if (this._giftReady(options)) candidates.push({ value: 'gift', weight: this.config.giftWeight });

    // Autonomie : un animal qui se débrouille chasse et grignote, selon sa faim.
    const prey = this._preyTargets(options);
    // Envie de se soulager : nulle tant que la jauge est confortable (>= 60), de plus en plus forte ensuite.
    if (this.supports(Locomotion.GROUND) && this.currentSurface && this.needs.values.relief < 60) {
      candidates.push({ value: 'relieve', weight: this.config.reliefWeight * 4 * ((60 - this.needs.values.relief) / 60) });
    }
    if (prey.length > 0) candidates.push({ value: 'hunt', weight: this.config.huntWeight * this.autonomy });
    const plants = this.autonomy > 0 ? this._edibleTargets(options, { plants: true }) : [];
    if (plants.length > 0) candidates.push({ value: 'graze', weight: this.config.grazeWeight * this.autonomy });

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

    // Les besoins orientent le choix sans jamais le forcer : un poids
    // multiplié reste un tirage.
    const levels = this.needs.values;
    const tired = levels.health < 30;
    for (const c of candidates) {
      if (c.value === 'sleep') c.weight *= needMultiplier(levels.energy, { boost: 6, satisfied: 0.3 });
      else if (c.value === 'wash') c.weight *= needMultiplier(levels.cleanliness, { boost: 5, satisfied: 0.3 });
      else if (c.value === 'follow') c.weight *= needMultiplier(levels.affection, { boost: 4, satisfied: 0.5 });
      else if (c.value === 'food') c.weight *= needMultiplier(levels.satiety, { boost: 8, satisfied: 0.05 });
      else if (c.value === 'play') c.weight *= needMultiplier(levels.stimulation, { boost: 5, satisfied: 0.2 });
      else if (c.value === 'hunt' || c.value === 'graze') c.weight *= needMultiplier(levels.satiety, { boost: 6, satisfied: 0.05 });
      else if (ENERGETIC_ACTIVITIES.has(c.value)) {
        c.weight *= needMultiplier(levels.stimulation, { boost: 3, satisfied: 0.6 });
        if (tired) c.weight *= 0.3;
      }
    }

    // Contexte du monde : la nuit et l'absence du joueur poussent à dormir.
    const ambient = options.ambient ?? {};
    const sleepy = (ambient.night ? this.config.nightSleepFactor : 1) * (ambient.away ? this.config.awaySleepFactor : 1);
    const lively =
      (ambient.night ? this.config.nightEnergeticFactor : 1) * (ambient.away ? this.config.awayEnergeticFactor : 1);
    for (const c of candidates) {
      if (c.value === 'sleep') c.weight *= sleepy;
      else if (ENERGETIC_ACTIVITIES.has(c.value) || c.value === 'play') c.weight *= lively;
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
      case 'food':
        this._startSeekFood(edible[0]);
        return;
      case 'play': {
        const toy = toys[0];
        if (toy.surface.surfaceId !== this.currentSurface.surfaceId) {
          this._takeOffToward(toy, toy.x);
          return;
        }
        this._startPlay({ item: toy });
        return;
      }
      case 'laser':
        this._startPlay({ laser: true });
        return;
      case 'remind':
        this._startRemind();
        return;
      case 'gift':
        this._startGift();
        return;
      case 'relieve':
        this._startRelieve(options);
        return;
      case 'hunt':
        this._startHunt(prey[0]);
        return;
      case 'graze':
        this._startSeekFood(plants[0]);
        return;
      case 'sleep': {
        // Un lit passe avant tout, quelle que soit la distance : on s'y rend
        // (le temps de marche s'adapte), ou on dort directement dessus si on y
        // est déjà. Espèce qui vole avec un lit sur une autre surface :
        // décollage vers ce lit, la sieste suivra une fois posée.
        const beds = (options.items ?? []).filter((i) => i.type === 'bed' && !i.removed && i.surface && !i.grabbed);
        const here = this.currentSurface
          ? beds
              .filter((b) => b.surface.surfaceId === this.currentSurface.surfaceId)
              .sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0]
          : null;
        if (here) {
          const distance = Math.abs(here.x - this.x);
          if (distance >= this.config.napApproachDistance) {
            this._napBed = here;
            this.state = State.SEEK_NAP;
            this.stateTimer = Math.max(
              randRange(this.config.napSeekDuration, this.config.random),
              (distance / this.config.walkSpeed) * 1.5 + 2,
            );
            return;
          }
          this.state = State.SLEEP;
          this.stateTimer = randRange(this.config.sleepDuration, this.config.random);
          this.lastEvent = 'sleep';
          return;
        }
        if (this.supports(Locomotion.AIR) && beds.length > 0) {
          const bed = beds.sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0];
          this._takeOffToward(bed);
          return;
        }
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

  _tickSeekNap(dt, surfaces, options = {}) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }

    if (this._napBed) {
      const bed = this._napBed;
      const stillThere =
        !bed.removed &&
        this.currentSurface &&
        bedsOn(options.items ?? [], this.currentSurface.surfaceId, this.x).includes(bed);
      if (this.stateTimer <= 0 || !stillThere) {
        this._napBed = null;
        this._enterState(State.IDLE);
        return;
      }
      if (Math.abs(bed.x - this.x) < this.config.napApproachDistance) {
        this.x = bed.x;
        this._napBed = null;
        this.state = State.SLEEP;
        this.stateTimer = randRange(this.config.sleepDuration, this.config.random);
        this.lastEvent = 'sleep';
        return;
      }
      this._chase(dt, bed.x);
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

  // --- Nourriture et lit ----------------------------------------------------

  /** Cibles comestibles pour cette espèce, la plus proche d'abord. */
  /** Cibles comestibles ; les plantes (grignotage, autonomie) sont demandées à part. */
  _edibleTargets(options, { plants = false } = {}) {
    if (!options.items?.length) return [];
    return edibleFor(options.items, this.config.needsDiet, {
      x: this.x,
      surfaceId: this.currentSurface?.surfaceId,
      canFly: this.supports(Locomotion.AIR),
      floating: !this.supports(Locomotion.GROUND),
      self: this,
      avoidMold: this.autonomy >= 0.5, // un animal autonome ne mange pas de nourriture moisie
    }).filter((e) => (e.item.type === 'plant') === plants);
  }

  /** Proies que cette espèce chasse, atteignables : la plus proche d'abord. */
  _preyTargets(options) {
    if (!options.items?.length || this.autonomy <= 0) return [];
    const floating = !this.supports(Locomotion.GROUND);
    const canFly = this.supports(Locomotion.AIR);
    return options.items
      .filter(
        (i) =>
          i.type === 'prey' && !i.consumed && !i.removed && !i.grabbed && !i.caught &&
          this.config.needsPrey[i.kind] > 0 &&
          i.floating === floating &&
          (floating || (i.surface && (canFly || i.surface.surfaceId === this.currentSurface?.surfaceId))),
      )
      .sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x));
  }

  _releaseFood() {
    if (this._foodTarget?.item.claimedBy === this) this._foodTarget.item.claimedBy = null;
    this._foodTarget = null;
  }

  _startSeekFood(target) {
    const { item } = target;
    const seg = item.surface;
    const sameSurface = seg && this.currentSurface && seg.surfaceId === this.currentSurface.surfaceId;

    if (!item.floating && !sameSurface) {
      // Espèce qui vole, nourriture sur une autre surface : décollage vers
      // cette surface ; une fois posée, la nourriture sera sur sa surface.
      this._takeOffToward(item);
      return;
    }

    this._releaseFood();
    this._foodTarget = target;
    if (item.type === 'food') item.claimedBy = this;
    this.state = State.SEEK_FOOD;
    this.stateTimer = randRange(this.config.foodSeekDuration, this.config.random);
  }

  _foodGone(item) {
    return !item || item.consumed || item.removed || item.grabbed || (item.type === 'bowl' && item.portions <= 0);
  }

  /** Abandon (cible mangée, disparue, injoignable) : retour au repos ou au roaming. */
  _giveUpFood() {
    this._releaseFood();
    const roam = this._groundlessRoamState();
    if (roam) this._startRoam(roam);
    else this._enterState(State.IDLE);
  }

  _tickSeekFood(dt) {
    const item = this._foodTarget?.item;
    const groundless = !this.supports(Locomotion.GROUND);

    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const unreachable =
      item &&
      !groundless &&
      !item.floating &&
      (!item.surface || item.surface.surfaceId !== this.currentSurface?.surfaceId);
    if (this._foodGone(item) || unreachable || this.stateTimer <= 0) {
      this._giveUpFood();
      return;
    }

    if (groundless) {
      const toX = item.x - this.x;
      const toY = item.y - this.y;
      const distance = Math.hypot(toX, toY);
      if (distance < 10) {
        this._startEating();
        return;
      }
      this._approach2D(dt, item.x, item.y, this.supports(Locomotion.WATER) ? this.config.swimSpeed : this.config.flySpeed);
      return;
    }

    if (Math.abs(item.x - this.x) < this.config.napApproachDistance) {
      this._startEating();
      return;
    }
    this._chase(dt, item.x);
  }

  _startEating() {
    const item = this._foodTarget.item;
    this.facing = sign(item.x - this.x) || this.facing;
    this.state = State.EAT;
    this.stateTimer = randRange(this.config.eatDuration, this.config.random);
  }

  _tickEat(dt) {
    const target = this._foodTarget;
    const groundless = !this.supports(Locomotion.GROUND);
    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    if (!target || this._foodGone(target.item)) {
      this._giveUpFood();
      return;
    }
    if (this.stateTimer > 0) return;

    const { item, gain } = target;
    const { sick, fraction, finished } = consume(item);
    this.needs.feed(gain * fraction);
    if (sick) {
      // Nourriture moisie : un petit coup de santé, une bulle « malade » à soigner.
      this.needs.boost('health', -this.config.moldSickness);
      this.lastEvent = 'sick';
    } else {
      // Encore faim et un reste : bouchée suivante, sans lâcher l'aliment ;
      // sinon il laisse le reste entamé (pour plus tard, ou un autre).
      if (!finished && this.needs.values.satiety < this.config.eatMoreBelow) {
        item.claimedBy = this;
        this.stateTimer = randRange(this.config.eatDuration, this.config.random);
        return;
      }
      if (finished && item.type === 'food' && gain >= Math.max(...Object.values(this.config.needsDiet))) {
        this.needs.boost('affection', 5);
        this.stats.add('mealsFavorite');
      }
      if (item.type === 'plant') this.stats.add('grazes');
      this.lastEvent = 'ate';
    }
    this._giveUpFood();
  }

  // --- Besoins naturels -----------------------------------------------------------

  /** Trace à déposer, demandée par l'animal (le Manager en fait un objet), ou null. */
  takeMess() {
    const mess = this._pendingMess;
    this._pendingMess = null;
    return mess;
  }

  _accident() {
    this._pendingMess = { x: this.x, y: this.y };
    this.needs.relieve();
    this.needs.boost('cleanliness', -this.config.accidentCleanlinessLoss);
    this.stats.add('accidents');
    this.lastEvent = 'accident';
    this._enterState(State.IDLE);
  }

  /** Va à une litière propre de sa surface, sinon au coin (bord) le plus proche ; en vol, rejoint la surface de la litière. */
  _startRelieve(options) {
    const seg = this.currentSurface;
    const litter =
      litterFor(options.items ?? [], { x: this.x, surfaceId: seg.surfaceId, canFly: this.supports(Locomotion.AIR) })[0] ?? null;
    if (litter && litter.surface.surfaceId !== seg.surfaceId) {
      this._takeOffToward(litter);
      return;
    }
    const corner = Math.abs(this.x - seg.x1) < Math.abs(seg.x2 - this.x) ? seg.x1 + 10 : seg.x2 - 10;
    this._reliefTarget = { x: clamp(litter ? litter.x : corner, seg.x1 + 4, seg.x2 - 4), litter, acting: false };
    this.state = State.RELIEVE;
    this.stateTimer = 20; // trajet : au-delà, il se soulage là où il est
  }

  _tickRelieve(dt) {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const target = this._reliefTarget;
    if (!target) {
      this._enterState(State.IDLE);
      return;
    }
    // Litière devenue sale, retirée ou déplacée en chemin : il se rabat sur le coin le plus proche.
    if (target.litter && (target.litter.removed || target.litter.grabbed || isDirty(target.litter))) {
      const seg = this.currentSurface;
      target.litter = null;
      target.x = clamp(Math.abs(this.x - seg.x1) < Math.abs(seg.x2 - this.x) ? seg.x1 + 10 : seg.x2 - 10, seg.x1 + 4, seg.x2 - 4);
    }

    if (!target.acting) {
      if (this.stateTimer <= 0 || Math.abs(target.x - this.x) < 6) {
        target.acting = true;
        this.stateTimer = this.config.reliefDuration;
        return;
      }
      this._chase(dt, target.x);
      return;
    }
    if (this.stateTimer > 0) return;
    this._finishRelieve(target);
  }

  _finishRelieve(target) {
    this.needs.relieve();
    this.stats.add('reliefs');
    if (target.litter) target.litter.uses += 1;
    else this._pendingMess = { x: this.x, y: this.y };
    this.lastEvent = 'relieved';
    this._enterState(State.IDLE);
  }

  /**
   * Traces proches sur la même surface : elles salissent, et les vieilles
   * (plus de deux heures) rendent malade, sauf pour un animal autonome qui
   * nettoie derrière lui. Figé en mode vacances.
   */
  _environment(dt, options) {
    if (this._lifeFrozen() || !this.currentSurface || !options.items?.length || this.needs.rateScale <= 0) return;
    let nearby = 0;
    let old = 0;
    for (const item of options.items) {
      if (item.type !== 'mess' || item.removed || !item.surface) continue;
      if (item.surface.surfaceId !== this.currentSurface.surfaceId || Math.abs(item.x - this.x) >= this.config.messRadius) continue;
      nearby += 1;
      if (isOldMess(item)) old += 1;
    }
    const hours = (dt / 3600) * this.needs.rateScale;
    if (nearby > 0) this.needs.boost('cleanliness', -this.config.messCleanlinessLoss * Math.min(nearby, 3) * hours);
    if (old > 0) this.needs.boost('health', -this.config.oldMessHealthLoss * Math.min(old, 3) * (1 - this.autonomy) * hours);
  }

  // --- Chasse ---------------------------------------------------------------------

  _startHunt(prey) {
    const sameSurface = prey.surface && this.currentSurface && prey.surface.surfaceId === this.currentSurface.surfaceId;
    if (!prey.floating && !sameSurface) {
      this._takeOffToward(prey); // espèce qui vole : décolle vers la surface de la proie
      return;
    }
    this._releaseFood();
    this._playTarget = null;
    this._huntTarget = prey;
    this.state = State.HUNT;
    this.stateTimer = this.config.huntDuration;
  }

  _endHunt() {
    this._huntTarget = null;
    const roam = this._groundlessRoamState();
    if (roam) this._startRoam(roam);
    else this._enterState(State.IDLE);
  }

  /** Poursuite : abandon sans conséquence si la proie s'échappe, disparaît ou change de surface. */
  _tickHunt(dt) {
    const groundless = !this.supports(Locomotion.GROUND);
    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const prey = this._huntTarget;
    const lost =
      !prey || prey.consumed || prey.removed || prey.grabbed || prey.caught || this.stateTimer <= 0 ||
      (!groundless && (!prey.surface || prey.surface.surfaceId !== this.currentSurface?.surfaceId));
    if (lost) {
      this._endHunt();
      return;
    }

    if (groundless) {
      const speed = this.supports(Locomotion.WATER)
        ? this.config.swimSpeed * this.config.swimFastFactor
        : this.config.flySpeed * this.config.flyFastFactor;
      if (Math.hypot(prey.x - this.x, prey.y - this.y) < this.config.catchDistance) {
        this._catch(prey);
        return;
      }
      this._approach2D(dt, prey.x, prey.y, speed);
      return;
    }
    if (Math.abs(prey.x - this.x) < this.config.catchDistance) {
      this._catch(prey);
      return;
    }
    this._chase(dt, prey.x, this.config.walkSpeed * this.config.runSpeedFactor);
  }

  /** La proie est attrapée : elle se fige, l'animal la mange (état EAT réutilisé). */
  _catch(prey) {
    prey.caught = true;
    this._huntTarget = null;
    this._foodTarget = { item: prey, gain: this.config.needsPrey[prey.kind] };
    this.stats.add('hunts');
    this._startEating();
  }

  /** Décolle vers la surface d'un objet (espèce qui vole) ; une fois posée,
   * l'objet sera sur sa surface et pourra être rejoint à pied. */
  _takeOffToward(item, x = item.x) {
    const seg = item.surface;
    this._releaseFood();
    this._startRoam(State.FLY);
    const margin = Math.min(8, (seg.x2 - seg.x1) / 2);
    this._flyTarget = { segment: seg, x: clamp(x, seg.x1 + margin, seg.x2 - margin), y: seg.y };
  }

  /** Avance vers un point en 2D (espèce sans sol) ; renvoie la distance restante. */
  _approach2D(dt, targetX, targetY, speed) {
    const toX = targetX - this.x;
    const toY = targetY - this.y;
    const distance = Math.hypot(toX, toY);
    if (distance < 1e-6) return 0;
    const step = Math.min(speed * dt, distance);
    this.facing = sign(toX) || this.facing;
    this.x += (toX / distance) * step;
    this.y += (toY / distance) * step;
    return distance - step;
  }

  // --- Jeu, caresses, brossage ------------------------------------------------

  _startPlay(target) {
    this._playTarget = target;
    this._kickTimer = 0;
    this.state = State.PLAY;
    this.stateTimer = randRange(this.config.playDuration, this.config.random);
  }

  /** Fin d'une session (jouée jusqu'au bout : récompense) ou abandon. */
  _endPlay(completed) {
    this._playTarget = null;
    if (completed) this.lastEvent = 'played';
    const roam = this._groundlessRoamState();
    if (roam) this._startRoam(roam);
    else this._enterState(State.IDLE);
  }

  _tickPlay(dt, options) {
    const groundless = !this.supports(Locomotion.GROUND);
    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const target = this._playTarget;
    if (!target) {
      this._endPlay(false);
      return;
    }
    if (this.stateTimer <= 0) {
      this._endPlay(true);
      return;
    }

    let tx;
    let ty;
    if (target.laser) {
      if (!options.laser || !options.pointer) {
        this._endPlay(false);
        return;
      }
      tx = options.pointer.x;
      ty = options.pointer.y;
    } else {
      const toy = target.item;
      const lost =
        toy.removed ||
        toy.grabbed ||
        (toy.surface && !this.supports(Locomotion.AIR) && toy.surface.surfaceId !== this.currentSurface?.surfaceId);
      if (lost) {
        this._endPlay(false);
        return;
      }
      tx = toy.x;
      ty = toy.y;
    }

    if (groundless) {
      const speed = this.supports(Locomotion.WATER)
        ? this.config.swimSpeed * this.config.swimFastFactor
        : this.config.flySpeed * this.config.flyFastFactor;
      const remaining = this._approach2D(dt, tx, ty, speed);
      // Jouet flottant à portée : un coup de museau le pousse plus loin.
      if (!target.laser && remaining < this.config.kickDistance) {
        this._kickTimer -= dt;
        if (this._kickTimer <= 0) {
          this._kickTimer = this.config.kickInterval;
          push(target.item, tx - this.x || this.facing, ty - this.y);
        }
      }
      return;
    }

    if (Math.abs(tx - this.x) >= this.config.kickDistance) {
      this._chase(dt, tx, this.config.walkSpeed * this.config.runSpeedFactor);
      return;
    }
    this.facing = sign(tx - this.x) || this.facing;
    // Jouet qui roule (balle, pelote) : un coup de patte de temps en temps ; la peluche ne bouge pas.
    if (!target.laser) {
      this._kickTimer -= dt;
      if (this._kickTimer <= 0) {
        this._kickTimer = this.config.kickInterval;
        if (kick(target.item, sign(tx - this.x) || this.facing)) this.stats.add('ballKicks');
      }
    }
  }

  /** Transitions de vie : éclosion, croissance, hibernation. */
  _applyLifeTransitions(transitions) {
    if (transitions.length === 0) return;
    for (const transition of transitions) {
      if (transition === 'hatched') {
        this.lastEvent = 'hatched';
        if (this.state === State.EGG) this._enterState(State.IDLE);
      } else if (transition === 'grew') {
        this.lastEvent = 'grew';
      } else if (transition === 'birthday') {
        this.lastEvent = 'birthday';
      } else if (transition === 'hibernated') {
        this.lastEvent = 'hibernated';
        this._releaseFood();
        this._playTarget = null;
        if (this.state !== State.DRAG && this.state !== State.FALL) this.state = State.HIBERNATE;
      }
    }
    this._recomputeConfig();
  }

  /** Œuf et hibernation : immobile, seulement attentif à ce que le support tienne. */
  _tickResting() {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
    }
  }

  // --- Tours et cadeaux -----------------------------------------------------------

  /** Le tour existe pour l'espèce et l'animal est en état de l'exécuter (ni œuf, ni hibernation, ni en chute). */
  _canPerform(name) {
    if (!this.config.tricks.includes(name) || this._lifeFrozen()) return false;
    const blocked = [State.DRAG, State.FALL, State.EGG, State.HIBERNATE, State.CLIMB, State.CEILING];
    return !blocked.includes(this.state) && (Boolean(this.currentSurface) || !this.supports(Locomotion.GROUND));
  }

  _startTrick(name) {
    this._releaseFood();
    this._playTarget = null;
    this._trick = name;
    this.state = State.TRICK;
    this.stateTimer = TRICKS[name].duration;
    this.stats.add('tricksPerformed');
  }

  /**
   * Entraînement (action du joueur) : réussi avec la probabilité de la
   * maîtrise, qui monte dans tous les cas. Un tour enfin appris est annoncé
   * (événement `trickLearned`).
   * @returns {boolean} vrai si l'animal a exécuté le tour
   */
  trainTrick(name) {
    if (!this._canPerform(name)) return false;
    const { success, learned } = this.tricks.train(name, this.config.random, this.life.trait);
    if (success) this._startTrick(name);
    else this._pendingEvent = 'noticed'; // il hésite
    if (learned) this._pendingEvent = 'trickLearned';
    return success;
  }

  /** Exécute un tour déjà appris (action du joueur). */
  performTrick(name) {
    if (!this.tricks.isLearned(name) || !this._canPerform(name)) return false;
    this._startTrick(name);
    return true;
  }

  _tickTrick() {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    if (this.stateTimer > 0) return;
    this._trick = null;
    const roam = this._groundlessRoamState();
    if (roam) this._startRoam(roam);
    else this._enterState(State.IDLE);
  }

  /** Un adulte très affectueux, sans cadeau récent, peut en ramener un près du curseur. */
  _giftReady(options) {
    return (
      Boolean(options.pointer) &&
      (this.life.stage === 'adult' || this.life.stage === 'senior') &&
      this.needs.values.affection >= this.config.giftAffection &&
      this._clock - this._lastGiftAt >= this.config.giftCooldown
    );
  }

  _startGift() {
    this._releaseFood();
    this._playTarget = null;
    this.state = State.GIFT;
    this.stateTimer = randRange(this.config.giftDuration, this.config.random);
  }

  /** Rejoint le curseur puis y dépose son cadeau (à ramasser par le joueur). */
  _tickGift(dt, options) {
    const groundless = !this.supports(Locomotion.GROUND);
    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const pointer = options.pointer;
    const end = () => {
      const roam = this._groundlessRoamState();
      if (roam) this._startRoam(roam);
      else this._enterState(State.IDLE);
    };
    if (this.stateTimer <= 0 || !pointer) {
      end(); // pas arrivé à temps : pas de cadeau, pas de délai consommé
      return;
    }

    let distance;
    if (groundless) {
      const speed = this.supports(Locomotion.WATER) ? this.config.swimSpeed : this.config.flySpeed;
      distance = this._approach2D(dt, pointer.x, pointer.y, speed);
    } else {
      distance = Math.abs(pointer.x - this.x);
      if (distance >= this.config.kickDistance) this._chase(dt, pointer.x);
    }
    if (distance < this.config.kickDistance * 1.5) {
      this._pendingGift = { kind: pickGift(this.config.random), x: this.x, y: this.y - 16 };
      this._lastGiftAt = this._clock;
      this.stats.add('giftsGiven');
      this.lastEvent = 'gift';
      end();
    }
  }

  /** Cadeau déposé depuis le dernier appel (le Manager en fait un objet), ou null. */
  takeGift() {
    const gift = this._pendingGift;
    this._pendingGift = null;
    return gift;
  }

  _startRemind() {
    this._releaseFood();
    this._playTarget = null;
    this._remindArrived = false;
    this.state = State.REMIND;
    this.stateTimer = this.config.remindDuration;
  }

  /** Rappel de pause : rejoint le curseur (marche, vol ou nage) et reste à côté jusqu'à la fin. */
  _tickRemind(dt, options) {
    const groundless = !this.supports(Locomotion.GROUND);
    if (!groundless && this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    const pointer = options.pointer;
    if (this.stateTimer <= 0 || !pointer || !options.ambient?.breakReminder) {
      const roam = this._groundlessRoamState();
      if (roam) this._startRoam(roam);
      else this._enterState(State.IDLE);
      return;
    }

    let distance;
    if (groundless) {
      const speed = this.supports(Locomotion.WATER)
        ? this.config.swimSpeed * this.config.swimFastFactor
        : this.config.flySpeed * this.config.flyFastFactor;
      distance = this._approach2D(dt, pointer.x, pointer.y, speed);
    } else {
      distance = Math.abs(pointer.x - this.x);
      if (distance >= this.config.kickDistance) {
        this._chase(dt, pointer.x, this.config.walkSpeed * this.config.runSpeedFactor);
      }
    }
    if (distance < this.config.kickDistance * 1.5 && !this._remindArrived) {
      this._remindArrived = true;
      this.lastEvent = 'reminded';
    }
  }

  /** Brossage (action du joueur) : immobile quelques secondes, puis propreté et affection en hausse. */
  brush() {
    const blocked = [
      State.DRAG, State.FALL, State.CLIMB, State.CEILING, State.SWIM, State.SWIM_FAST,
      State.FLY, State.FLY_FAST, State.DIVE,
    ];
    if (this.state === State.HIBERNATE) {
      this.wake();
      return;
    }
    if (!this.currentSurface || blocked.includes(this.state) || this.state === State.EGG) return;
    this._releaseFood();
    this._playTarget = null;
    this.state = State.BRUSHED;
    this.stateTimer = this.config.brushDuration;
  }

  _tickBrushed() {
    if (this.currentSurface && !isOnSegment(this.currentSurface, this.x, this.y, 4)) {
      this._enterState(State.FALL);
      return;
    }
    if (this.stateTimer > 0) return;
    this.lastEvent = 'brushed';
    this._enterState(State.IDLE);
  }

  /** Multiplicateur du gain d'énergie en dormant : plus fort sur un lit. */
  _bedSleepFactor(options) {
    if (this.state !== State.SLEEP || !this.currentSurface || !options?.items) return 1;
    const bed = bedsOn(options.items, this.currentSurface.surfaceId, this.x)[0];
    return bed && Math.abs(bed.x - this.x) < this.config.bedRadius ? this.config.bedSleepFactor : 1;
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
  _chase(dt, targetX, speed = this.config.walkSpeed) {
    const dir = sign(targetX - this.x);
    this.facing = dir || this.facing;
    this.x += dir * speed * dt;

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
    // Une espèce sans sol ne passe jamais par _tickWaiting : c'est ici
    // qu'elle remarque la nourriture flottante quand elle a faim.
    if (this._groundlessRoamState()) {
      this._foodCheckTimer = (this._foodCheckTimer ?? 0) - dt;
      if (this._foodCheckTimer <= 0) {
        this._foodCheckTimer = 1;
        if (options.ambient?.breakReminder && options.pointer) {
          this._startRemind();
          return;
        }
        if (this._giftReady(options) && this.config.random() < this.config.giftChancePerSecond) {
          this._startGift();
          return;
        }
        if (options.laser && options.pointer) {
          this._startPlay({ laser: true });
          return;
        }
        if (this.needs.values.satiety < 70) {
          const edible = this._edibleTargets(options);
          if (edible.length > 0) {
            this._startSeekFood(edible[0]);
            return;
          }
          const prey = this._preyTargets(options);
          if (prey.length > 0) {
            this._startHunt(prey[0]);
            return;
          }
          const plants = this.autonomy > 0 ? this._edibleTargets(options, { plants: true }) : [];
          if (plants.length > 0) {
            this._startSeekFood(plants[0]);
            return;
          }
        }
        // Il s'ennuie et un jouet flotte (l'anneau) : il va le pousser.
        if (this.needs.values.stimulation < this.config.floatingPlayBelow && options.items?.length) {
          const toy = toysFor(options.items, { x: this.x, y: this.y, floating: true })[0];
          if (toy && this.config.random() < this.config.floatingPlayChance) {
            this._startPlay({ item: toy });
            return;
          }
        }
      }
    }

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
    this._reliefTarget = null;
    this._releaseFood();
    this._playTarget = null;
    this._huntTarget = null;
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
