// Petites fonctions vecteur 2D. Volontairement minimal (pas de classe, pas de
// dépendance) pour rester facile à porter ou à supprimer.

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
