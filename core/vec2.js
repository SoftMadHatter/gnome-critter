// Small 2D vector helpers. Deliberately minimal (no class, no dependency)
// to stay easy to port or drop.

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function sign(x) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}
