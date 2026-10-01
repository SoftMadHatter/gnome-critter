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
// windows overlapping in depth beyond hiding: a window's surfaces are
// cut where a window in front covers them, and by the monitors' bounds.

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

/** Pieces of [a, b] left once the `cuts` intervals are removed. */
function subtractIntervals(a, b, cuts) {
  let pieces = [[a, b]];
  for (const [c1, c2] of cuts) {
    const next = [];
    for (const [p1, p2] of pieces) {
      if (c2 <= p1 || c1 >= p2) {
        next.push([p1, p2]);
        continue;
      }
      if (c1 > p1) next.push([p1, c1]);
      if (c2 < p2) next.push([c2, p2]);
    }
    pieces = next;
  }
  return pieces.filter(([p1, p2]) => p2 > p1);
}

/** Parts of [a, b] lying inside the union of the `keeps` intervals (touching parts merged). */
function intersectIntervals(a, b, keeps) {
  const parts = keeps
    .map(([k1, k2]) => [Math.max(a, k1), Math.min(b, k2)])
    .filter(([p1, p2]) => p2 > p1)
    .sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && part[0] <= last[1]) last[1] = Math.max(last[1], part[1]);
    else merged.push([...part]);
  }
  return merged;
}

/**
 * @param {Environment} environment `windows` ordered from back to front
 *   (stacking order): a window hides the surfaces of those behind it.
 * @returns {{segments: Segment[], walls: Wall[]}}
 */
export function computeSurfaces(environment) {
  const segments = [];
  const walls = [];

  const monitors = environment.monitors ?? [];
  const windows = environment.windows ?? [];
  const waterZones = environment.waterZones ?? [];

  const pushSegments = (type, y, x1, x2, cuts, keeps, surfaceId) => {
    let pieces = subtractIntervals(x1, x2, cuts);
    if (keeps) pieces = pieces.flatMap(([p1, p2]) => intersectIntervals(p1, p2, keeps));
    for (const [p1, p2] of pieces) segments.push({ type, y, x1: p1, x2: p2, surfaceId });
  };
  const pushWalls = (side, x, y1, y2, cuts, keeps, surfaceId) => {
    let pieces = subtractIntervals(y1, y2, cuts);
    if (keeps) pieces = pieces.flatMap(([p1, p2]) => intersectIntervals(p1, p2, keeps));
    for (const [p1, p2] of pieces) walls.push({ side, x, y1: p1, y2: p2, surfaceId });
  };
  // x-ranges of the rects strictly crossing the horizontal line `y`.
  const spansAtY = (rects, y) =>
    rects.filter((r) => r.y < y && y < r.y + r.height).map((r) => [r.x, r.x + r.width]);
  // y-ranges of the rects strictly crossing the vertical line `x`.
  const spansAtX = (rects, x) =>
    rects.filter((r) => r.x < x && x < r.x + r.width).map((r) => [r.y, r.y + r.height]);

  for (const [i, monitor] of monitors.entries()) {
    const surfaceId = `monitor:${i}`;
    const others = monitors.filter((_, j) => j !== i);
    const right = monitor.x + monitor.width;
    const bottom = monitor.y + monitor.height;
    // Ground = bottom of the monitor, ceiling = top (walkable only by
    // species that can walk on ceilings). Parts covered by another
    // monitor (different sizes/offsets) aren't a surface at all.
    pushSegments('ground', bottom, monitor.x, right, spansAtY(others, bottom), null, surfaceId);
    pushSegments('ceiling', monitor.y, monitor.x, right, spansAtY(others, monitor.y), null, surfaceId);
    // Walls = left/right edges of the monitor, except where another
    // monitor continues on the other side (the desktop goes on there).
    const touching = (x, side) =>
      others
        .filter((o) => (side === 'left' ? o.x + o.width === x : o.x === x))
        .map((o) => [o.y, o.y + o.height]);
    pushWalls(
      'left', monitor.x, monitor.y, bottom,
      [...spansAtX(others, monitor.x), ...touching(monitor.x, 'left')], null, surfaceId,
    );
    pushWalls(
      'right', right, monitor.y, bottom,
      [...spansAtX(others, right), ...touching(right, 'right')], null, surfaceId,
    );
  }

  for (const [k, win] of windows.entries()) {
    // Only the visible parts count: not hidden by a window in front, and
    // within the monitors (nothing to walk on over the dead space
    // around/between screens).
    const above = windows.slice(k + 1);
    const keepsX = monitors.length > 0
      ? monitors.filter((m) => m.y <= win.y && win.y <= m.y + m.height).map((m) => [m.x, m.x + m.width])
      : null;
    const bottom = win.y + win.height;
    const right = win.x + win.width;
    const keepsXBottom = monitors.length > 0
      ? monitors.filter((m) => m.y <= bottom && bottom <= m.y + m.height).map((m) => [m.x, m.x + m.width])
      : null;
    // Ledge = top of the window (the title bar is included in win.y on
    // the extension side: it's given the frame rect, decorations included).
    pushSegments('shelf', win.y, win.x, right, spansAtY(above, win.y), keepsX, win.id);
    // Underside = bottom of the window, walkable only by species that
    // can walk on ceilings (same 'ceiling' type as a monitor's ceiling:
    // the animal hangs upside down there by climbing up one of the
    // window's walls, see Critter._tickClimb).
    pushSegments('ceiling', bottom, win.x, right, spansAtY(above, bottom), keepsXBottom, win.id);
    for (const [side, x] of [['left', win.x], ['right', right]]) {
      const keepsY = monitors.length > 0
        ? monitors.filter((m) => m.x <= x && x <= m.x + m.width).map((m) => [m.y, m.y + m.height])
        : null;
      pushWalls(side, x, win.y, bottom, spansAtX(above, x), keepsY, win.id);
    }
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
 * tick it landed there: a stored segment can go stale). A surface partly
 * hidden comes in several pieces: with `x`, the piece closest to it is
 * returned, otherwise the first.
 */
export function findSegmentById(segments, surfaceId, type, x) {
  const matches = segments.filter((s) => s.surfaceId === surfaceId && s.type === type);
  return closestPiece(matches, x, (s) => [s.x1, s.x2]);
}

/** Equivalent of {@link findSegmentById} for walls (CLIMB state); `y` picks the piece. */
export function findWallById(walls, surfaceId, side, y) {
  const matches = walls.filter((w) => w.surfaceId === surfaceId && w.side === side);
  return closestPiece(matches, y, (w) => [w.y1, w.y2]);
}

function closestPiece(pieces, coord, range) {
  if (pieces.length === 0) return null;
  if (coord === undefined) return pieces[0];
  const distance = (p) => {
    const [a, b] = range(p);
    return coord < a ? a - coord : coord > b ? coord - b : 0;
  };
  return pieces.reduce((best, p) => (distance(p) < distance(best) ? p : best));
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
