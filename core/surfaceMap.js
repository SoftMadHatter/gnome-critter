// Builds the list of walkable surfaces (ground, window ledges, walls,
// ceiling) from the raw state of the environment (monitors, windows, any
// water zones declared by the user).
//
// This module knows nothing about GJS/Clutter/Meta: it takes plain JS
// objects as input. It's the `extension/` layer that translates
// Meta.Window / Meta.Rectangle objects into the `environment` below.
//
// Deliberately simplified model for v1: only horizontal segments
// (ground/ledges/ceiling) and vertical ones (walls). No slopes, no
// windows overlapping in depth (z-order is ignored for surface
// computation, only the "visible" foreground serves as a ledge).

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
 * @property {Rect[]} [waterZones] Optional water zones (none by default)
 */

/**
 * @typedef {Object} Segment
 * @property {'ground'|'shelf'|'ceiling'|'water'} type
 * @property {number} y
 * @property {number} x1
 * @property {number} x2
 * @property {string|number} [surfaceId] id of the carrying window, otherwise 'monitor:<i>'
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
    // Ground = bottom of the monitor.
    segments.push({
      type: 'ground',
      y: monitor.y + monitor.height,
      x1: monitor.x,
      x2: monitor.x + monitor.width,
      surfaceId,
    });
    // Ceiling = top of the monitor (walkable only by species that can
    // walk on ceilings).
    segments.push({
      type: 'ceiling',
      y: monitor.y,
      x1: monitor.x,
      x2: monitor.x + monitor.width,
      surfaceId,
    });
    // Walls = left/right edges of the monitor.
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
    // Ledge = top of the window (the title bar is included in win.y on
    // the extension side: it's given the frame rect, decorations included).
    segments.push({
      type: 'shelf',
      y: win.y,
      x1: win.x,
      x2: win.x + win.width,
      surfaceId: win.id,
    });
    // Underside = bottom of the window, walkable only by species that
    // can walk on ceilings (same 'ceiling' type as a monitor's ceiling:
    // the animal hangs upside down there by climbing up one of the
    // window's walls, see Critter._tickClimb).
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
 * Looks for the closest surface vertically below a given point (used to
 * know what the animal should fall onto / land on).
 *
 * @param {Segment[]} segments
 * @param {number} x
 * @param {number} y reference point (typically the animal's feet)
 * @param {number} maxFallDistance search distance downward
 * @param {Set<string>} allowedTypes surface types the species can use
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
 * Returns true if the point (x, y) is still above the given segment,
 * within epsilon (used to detect walking off a ledge).
 */
export function isOnSegment(segment, x, y, epsilon = 2) {
  return x >= segment.x1 && x <= segment.x2 && Math.abs(y - segment.y) <= epsilon;
}

/**
 * Finds, in the list of segments freshly recomputed this tick, the
 * segment that still matches `surfaceId`/`type` (used to detect that a
 * window under the animal's feet has been closed/moved/resized since the
 * tick it landed there: a stored segment can go stale).
 */
export function findSegmentById(segments, surfaceId, type) {
  return segments.find((s) => s.surfaceId === surfaceId && s.type === type) ?? null;
}

/** Equivalent of {@link findSegmentById} for walls (CLIMB state). */
export function findWallById(walls, surfaceId, side) {
  return walls.find((w) => w.surfaceId === surfaceId && w.side === side) ?? null;
}

/**
 * Looks for a wall close enough horizontally to `x` (within `epsilon`)
 * whose vertical span [y1, y2] crosses the interval [yMin, yMax]. Used
 * during FALL to detect passing right by a grabbable wall (window or
 * monitor edge).
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
 * Looks for the closest wall horizontally whose bottom (`y2`) is at the
 * given level (within `epsilon`): a wall "reachable" by walking, as
 * opposed to a floating window's wall whose bottom isn't level with the
 * ground the animal is on. Used to climb deliberately rather than
 * waiting for a lucky fall that happens to cross a wall (see FALL /
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
 * Looks for the closest "shelf" segment horizontally, within a maximum
 * distance, whose `y` matches (within `epsilon`) the given one -- a
 * ledge "reachable" by walking, as opposed to one at a different height
 * only reachable by falling/climbing (same principle as
 * findReachableWall). `excludeSurfaceId` avoids "finding" the surface
 * already occupied. Used for a deliberate nap: instead of sleeping in
 * place, walking first toward a nearby window ledge.
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
 * Looks, among the segments walkable on the ceiling, for the closest one
 * above a given point, within `maxDistance`. Used during CLIMB: the
 * animal stops under the first overhanging surface it meets while
 * climbing (a monitor's ceiling, or the underside of a window), rather
 * than always climbing all the way to the top of the wall.
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

/** True if the point is inside one of the monitors (edges included). */
export function isInsideAnyMonitor(monitors, x, y) {
  return monitors.some((m) => x >= m.x && x <= m.x + m.width && y >= m.y && y <= m.y + m.height);
}

/** Closest monitor to the point (the one containing it, if any), or null. */
function nearestMonitor(monitors, x, y) {
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
  return best;
}

/**
 * Respawn point for someone no longer inside any monitor (resolution
 * change, a monitor unplugged or switched): at the top of the closest
 * monitor, at the x-coordinate clamped to its bounds.
 * @param {{x:number,y:number,width:number,height:number}[]} monitors
 * @param {number} topOffset offset below the top edge (sprite height: y is the feet)
 * @returns {{x:number, y:number}|null} null if no monitor is known
 */
export function respawnPoint(monitors, x, y, topOffset = 0, margin = 16) {
  const best = nearestMonitor(monitors, x, y);
  if (!best) return null;
  const safe = Math.min(margin, best.width / 2);
  return {
    x: Math.min(Math.max(x, best.x + safe), best.x + best.width - safe),
    y: best.y + topOffset,
  };
}

/**
 * Ground point (bottom of the closest monitor), at the x-coordinate
 * clamped to its bounds: where everything should return to after a
 * suspend, once the desktop's geometry is stable again.
 * @returns {{x:number, y:number}|null} null if no monitor is known
 */
export function groundPoint(monitors, x, y, margin = 16) {
  const best = nearestMonitor(monitors, x, y);
  if (!best) return null;
  const safe = Math.min(margin, best.width / 2);
  return {
    x: Math.min(Math.max(x, best.x + safe), best.x + best.width - safe),
    y: best.y + best.height,
  };
}
