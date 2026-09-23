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
