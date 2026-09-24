// Variation de couleur d'un sprite (pixel par pixel), pour donner à chaque
// animal une apparence propre. Module pur : travaille sur des octets RGBA.

/** @returns {[number, number, number]} teinte 0-360, saturation et valeur 0-1 */
export function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

/** @returns {[number, number, number]} composantes 0-255 */
export function hsvToRgb(h, s, v) {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  let rgb;
  if (hh < 1) rgb = [c, x, 0];
  else if (hh < 2) rgb = [x, c, 0];
  else if (hh < 3) rgb = [0, c, x];
  else if (hh < 4) rgb = [0, x, c];
  else if (hh < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((channel) => Math.round((channel + m) * 255));
}

const BLACK_BELOW = 0.15; // valeur en dessous de laquelle un pixel (contour, oeil) reste intact
const GRAY_BELOW = 0.15; // saturation en dessous de laquelle un pixel est « gris »
const WHITE_ABOVE = 0.9;

/**
 * @param {Uint8Array|number[]} rgba pixels RGBA (non modifiés)
 * @param {{hue?: number, saturation?: number, colorizeGrays?: boolean, tone?: number, graySaturation?: number}} [options]
 *   hue : décalage de teinte en degrés (pixels colorés) ;
 *   saturation : facteur appliqué à la saturation (variante choyé/négligé) ;
 *   colorizeGrays : donne aux gris (un chat gris) la teinte absolue `tone`,
 *   avec la saturation `graySaturation` ;
 *   noirs et blancs restent toujours intacts.
 * @returns {Uint8Array} nouveaux pixels
 */
export function shiftPixels(rgba, { hue = 0, saturation = 1, colorizeGrays = false, tone = 0, graySaturation = 0.35 } = {}) {
  const out = Uint8Array.from(rgba);
  for (let i = 0; i + 3 < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const [h, s, v] = rgbToHsv(out[i], out[i + 1], out[i + 2]);
    if (v < BLACK_BELOW) continue;
    let nh;
    let ns;
    if (s < GRAY_BELOW) {
      if (v > WHITE_ABOVE || !colorizeGrays) continue;
      nh = tone;
      ns = Math.min(1, graySaturation * saturation);
    } else {
      nh = h + hue;
      ns = Math.min(1, s * saturation);
    }
    const [r, g, b] = hsvToRgb(nh, ns, v);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
}

/** Valide la section `appearance` d'un pack.json. */
export function appearanceOverrides(raw = {}) {
  const config = { enabled: true, hueRange: [-35, 35], colorizeGrays: false, graySaturation: 0.35 };
  const ignored = [];
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (key === 'enabled' && typeof value === 'boolean') config.enabled = value;
    else if (key === 'colorizeGrays' && typeof value === 'boolean') config.colorizeGrays = value;
    else if (key === 'graySaturation' && Number.isFinite(value) && value >= 0 && value <= 1) config.graySaturation = value;
    else if (
      key === 'hueRange' &&
      Array.isArray(value) &&
      value.length === 2 &&
      value.every(Number.isFinite) &&
      value[0] <= value[1]
    ) {
      config.hueRange = value;
    } else ignored.push(key);
  }
  return { config, ignored };
}
