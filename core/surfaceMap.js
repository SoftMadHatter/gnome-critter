// Construit la liste des surfaces praticables (sol, rebords de fenêtres,
// murs, plafond) à partir de l'état brut de l'environnement (moniteurs,
// fenêtres, éventuelles zones d'eau déclarées par l'utilisateur).
//
// Ce module ne connaît rien à GJS/Clutter/Meta : il prend des objets JS
// simples en entrée. C'est la couche `extension/` qui traduit les objets
// Meta.Window / Meta.Rectangle en `environment` ci-dessous.
//
// Modèle volontairement simplifié pour la v1 : uniquement des segments
// horizontaux (sol/rebords/plafond) et verticaux (murs). Pas de pente, pas
// de fenêtres qui se chevauchent en profondeur (on ignore le z-order pour
// le calcul des surfaces, seul le premier-plan « visible » sert de rebord).

/**
 * @typedef {Object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} Environment
 * @property {Rect[]} monitors
 * @property {(Rect & {id: string|number, focused?: boolean})[]} windows
 * @property {Rect[]} [waterZones] Zones d'eau optionnelles (aucune par défaut)
 */

/**
 * @typedef {Object} Segment
 * @property {'ground'|'shelf'|'ceiling'|'water'} type
 * @property {number} y
 * @property {number} x1
 * @property {number} x2
 * @property {string|number} [surfaceId] id de la fenêtre porteuse, sinon 'monitor:<i>'
 */

/**
 * @typedef {Object} Wall
 * @property {'left'|'right'} side
 * @property {number} x
 * @property {number} y1
 * @property {number} y2
 * @property {string|number} surfaceId
 */

/**
 * @param {Environment} environment
 * @returns {{segments: Segment[], walls: Wall[]}}
 */
export function computeSurfaces(environment) {
  const segments = [];
  const walls = [];

  const monitors = environment.monitors ?? [];
  const windows = environment.windows ?? [];
  const waterZones = environment.waterZones ?? [];

  for (const [i, monitor] of monitors.entries()) {
    const surfaceId = `monitor:${i}`;
    // Sol = bas du moniteur.
    segments.push({
      type: 'ground',
      y: monitor.y + monitor.height,
      x1: monitor.x,
      x2: monitor.x + monitor.width,
      surfaceId,
    });
    // Plafond = haut du moniteur (praticable seulement par les espèces qui
    // savent marcher au plafond).
    segments.push({
      type: 'ceiling',
      y: monitor.y,
      x1: monitor.x,
      x2: monitor.x + monitor.width,
      surfaceId,
    });
    // Murs = bords gauche/droit du moniteur.
    walls.push({
      side: 'left',
      x: monitor.x,
      y1: monitor.y,
      y2: monitor.y + monitor.height,
      surfaceId,
    });
    walls.push({
      side: 'right',
      x: monitor.x + monitor.width,
      y1: monitor.y,
      y2: monitor.y + monitor.height,
      surfaceId,
    });
  }

  for (const win of windows) {
    // Rebord = haut de la fenêtre (barre de titre incluse dans win.y côté
    // extension : on lui passe la frame rect, décorations comprises).
    segments.push({
      type: 'shelf',
      y: win.y,
      x1: win.x,
      x2: win.x + win.width,
      surfaceId: win.id,
    });
    // Dessous = bas de la fenêtre, praticable seulement par les espèces qui
    // savent marcher au plafond (même type 'ceiling' que le plafond d'un
    // moniteur : l'animal s'y accroche tête en bas en grimpant le long
    // d'un des murs de la fenêtre, cf. Critter._tickClimb).
    segments.push({
      type: 'ceiling',
      y: win.y + win.height,
      x1: win.x,
      x2: win.x + win.width,
      surfaceId: win.id,
    });
    walls.push({
      side: 'left',
      x: win.x,
      y1: win.y,
      y2: win.y + win.height,
      surfaceId: win.id,
    });
    walls.push({
      side: 'right',
      x: win.x + win.width,
      y1: win.y,
      y2: win.y + win.height,
      surfaceId: win.id,
    });
  }

  for (const [i, zone] of waterZones.entries()) {
    segments.push({
      type: 'water',
      y: zone.y,
      x1: zone.x,
      x2: zone.x + zone.width,
      surfaceId: `water:${i}`,
    });
  }

  return { segments, walls };
}

/**
 * Cherche la surface la plus proche verticalement sous un point donné
 * (utilisé pour savoir sur quoi l'animal doit tomber / se poser).
 *
 * @param {Segment[]} segments
 * @param {number} x
 * @param {number} y point de référence (typiquement les pieds de l'animal)
 * @param {number} maxFallDistance distance de recherche vers le bas
 * @param {Set<string>} allowedTypes types de surfaces que l'espèce sait utiliser
 * @returns {Segment|null}
 */
export function findSurfaceBelow(segments, x, y, maxFallDistance, allowedTypes) {
  let best = null;
  let bestDistance = maxFallDistance;

  for (const seg of segments) {
    if (!allowedTypes.has(seg.type)) continue;
    if (x < seg.x1 || x > seg.x2) continue;
    const d = seg.y - y;
    if (d < 0 || d > bestDistance) continue;
    bestDistance = d;
    best = seg;
  }

  return best;
}

/**
 * Renvoie true si le point (x, y) est encore au-dessus du segment donné,
 * à epsilon près (sert à détecter qu'on a marché hors du rebord).
 */
export function isOnSegment(segment, x, y, epsilon = 2) {
  return x >= segment.x1 && x <= segment.x2 && Math.abs(y - segment.y) <= epsilon;
}

/**
 * Retrouve, dans la liste de segments fraîchement recalculée à ce tick, le
 * segment qui correspond encore à `surfaceId`/`type` (utilisé pour détecter
 * qu'une fenêtre sous les pieds de l'animal a été fermée/déplacée/redimensionnée
 * depuis le tick où il s'y est posé : un segment mémorisé peut devenir périmé).
 */
export function findSegmentById(segments, surfaceId, type) {
  return segments.find((s) => s.surfaceId === surfaceId && s.type === type) ?? null;
}

/** Équivalent de {@link findSegmentById} pour les murs (état CLIMB). */
export function findWallById(walls, surfaceId, side) {
  return walls.find((w) => w.surfaceId === surfaceId && w.side === side) ?? null;
}

/**
 * Cherche un mur assez proche horizontalement de `x` (à `epsilon` près)
 * dont la portée verticale [y1, y2] croise l'intervalle [yMin, yMax].
 * Utilisé pendant FALL pour détecter qu'on passe juste à côté d'un mur
 * agrippable (bord de fenêtre ou de moniteur).
 */
export function findWallNear(walls, x, yMin, yMax, epsilon = 6) {
  for (const wall of walls) {
    if (Math.abs(wall.x - x) > epsilon) continue;
    if (yMax < wall.y1 || yMin > wall.y2) continue;
    return wall;
  }
  return null;
}

/**
 * Cherche le mur le plus proche horizontalement dont le bas (`y2`) est au
 * niveau donné (à `epsilon` près) : un mur "atteignable" en marchant, par
 * opposition à un mur de fenêtre flottante dont le bas n'est pas au niveau
 * du sol où se trouve l'animal. Utilisé pour grimper délibérément plutôt
 * que d'attendre une chute providentielle qui croise un mur (cf. FALL /
 * findWallNear).
 */
export function findReachableWall(walls, x, y, epsilon = 4) {
  let best = null;
  let bestDistance = Infinity;

  for (const wall of walls) {
    if (Math.abs(wall.y2 - y) > epsilon) continue;
    const d = Math.abs(wall.x - x);
    if (d < bestDistance) {
      bestDistance = d;
      best = wall;
    }
  }

  return best;
}

/**
 * Cherche le segment de type "shelf" le plus proche horizontalement, à une
 * distance maximale, dont le `y` correspond (à `epsilon` près) à celui
 * donné -- un rebord "atteignable" en marchant, par opposition à un rebord
 * à une autre hauteur qui ne le serait qu'en tombant/grimpant (même
 * principe que findReachableWall). `excludeSurfaceId` évite de "chercher"
 * la surface déjà occupée. Utilisé pour une sieste ciblée : au lieu de
 * dormir sur place, marcher d'abord vers un rebord de fenêtre proche.
 */
export function findReachableShelf(segments, x, y, excludeSurfaceId, maxDistance = Infinity, epsilon = 4) {
  let best = null;
  let bestDistance = maxDistance;

  for (const seg of segments) {
    if (seg.type !== 'shelf') continue;
    if (seg.surfaceId === excludeSurfaceId) continue;
    if (Math.abs(seg.y - y) > epsilon) continue;
    const d = x < seg.x1 ? seg.x1 - x : x > seg.x2 ? x - seg.x2 : 0;
    if (d > bestDistance) continue;
    bestDistance = d;
    best = seg;
  }

  return best;
}

/**
 * Cherche, parmi les segments praticables au plafond, le plus proche
 * au-dessus d'un point donné, à `maxDistance` près. Utilisé pendant CLIMB :
 * l'animal s'arrête sous la première surface en surplomb qu'il rencontre en
 * grimpant (plafond d'un moniteur, ou dessous d'une fenêtre), plutôt que de
 * grimper systématiquement jusqu'en haut du mur.
 */
export function findCeilingAbove(segments, x, fromY, maxDistance, allowedTypes = new Set(['ceiling'])) {
  let best = null;
  let bestDistance = maxDistance;

  for (const seg of segments) {
    if (!allowedTypes.has(seg.type)) continue;
    if (x < seg.x1 || x > seg.x2) continue;
    const d = fromY - seg.y;
    if (d < 0 || d > bestDistance) continue;
    bestDistance = d;
    best = seg;
  }

  return best;
}

/** Vrai si le point est dans l'un des moniteurs (bords compris). */
export function isInsideAnyMonitor(monitors, x, y) {
  return monitors.some((m) => x >= m.x && x <= m.x + m.width && y >= m.y && y <= m.y + m.height);
}

/**
 * Point de réapparition pour quelqu'un qui n'est plus dans aucun moniteur
 * (changement de résolution, écran débranché ou basculé) : en haut du
 * moniteur le plus proche, à l'abscisse ramenée dans ses bornes.
 * @param {{x:number,y:number,width:number,height:number}[]} monitors
 * @param {number} topOffset décalage sous le bord haut (hauteur du sprite : y désigne les pieds)
 * @returns {{x:number, y:number}|null} null si aucun moniteur n'est connu
 */
export function respawnPoint(monitors, x, y, topOffset = 0, margin = 16) {
  let best = null;
  let bestDistance = Infinity;
  for (const m of monitors) {
    const cx = Math.min(Math.max(x, m.x), m.x + m.width);
    const cy = Math.min(Math.max(y, m.y), m.y + m.height);
    const distance = Math.hypot(x - cx, y - cy);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = m;
    }
  }
  if (!best) return null;
  const safe = Math.min(margin, best.width / 2);
  return {
    x: Math.min(Math.max(x, best.x + safe), best.x + best.width - safe),
    y: best.y + topOffset,
  };
}
