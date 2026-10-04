// Colour variation of a sprite (pixel by pixel), to give each animal a
// look of its own. Pure module: works on RGBA bytes.

/** @returns {[number, number, number]} hue 0-360, saturation and value 0-1 */
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

/** @returns {[number, number, number]} components 0-255 */
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

const BLACK_BELOW = 0.15; // value below which a pixel (outline, eye) stays untouched
const GRAY_BELOW = 0.15; // saturation below which a pixel is "gray"
const WHITE_ABOVE = 0.9;

/**
 * @param {Uint8Array|number[]} rgba RGBA pixels (not modified)
 * @param {{hue?: number, saturation?: number, colorizeGrays?: boolean, tone?: number, graySaturation?: number}} [options]
 *   hue: hue shift in degrees (coloured pixels);
 *   saturation: factor applied to saturation (devoted/neglected variant);
 *   colorizeGrays: gives grays (a gray cat) the absolute hue `tone`,
 *   with saturation `graySaturation`;
 *   blacks and whites are always left untouched.
 * @returns {Uint8Array} new pixels
 */
export function shiftPixels(rgba, { hue = 0, saturation = 1, colorizeGrays = false, tone = 0, graySaturation = 0.35 } = {}) {
  const out = rgba instanceof Uint8Array ? rgba.slice() : Uint8Array.from(rgba);
  const shifted = shiftCache(`${hue}|${saturation}|${colorizeGrays}|${tone}|${graySaturation}`);
  let lastKey = -1; // runs of one colour are common: skip the lookup
  let lastPacked = UNCHANGED;
  for (let i = 0; i + 3 < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const key = (out[i] << 16) | (out[i + 1] << 8) | out[i + 2];
    if (key !== lastKey) {
      lastKey = key;
      lastPacked = shifted.get(key);
      if (lastPacked === undefined) {
        lastPacked = shiftColor(out[i], out[i + 1], out[i + 2], { hue, saturation, colorizeGrays, tone, graySaturation });
        shifted.set(key, lastPacked);
      }
    }
    const packed = lastPacked;
    if (packed === UNCHANGED) continue;
    out[i] = packed >> 16;
    out[i + 1] = (packed >> 8) & 255;
    out[i + 2] = packed & 255;
  }
  return out;
}

const UNCHANGED = -1;

/** Colour a pixel becomes, packed as 0xRRGGBB (or UNCHANGED: black, white, or gray left alone). */
function shiftColor(r, g, b, { hue, saturation, colorizeGrays, tone, graySaturation }) {
  const [h, s, v] = rgbToHsv(r, g, b);
  if (v < BLACK_BELOW) return UNCHANGED;
  let nh;
  let ns;
  if (s < GRAY_BELOW) {
    if (v > WHITE_ABOVE || !colorizeGrays) return UNCHANGED;
    nh = tone;
    ns = Math.min(1, graySaturation * saturation);
  } else {
    nh = h + hue;
    ns = Math.min(1, s * saturation);
  }
  const [nr, ng, nb] = hsvToRgb(nh, ns, v);
  return (nr << 16) | (ng << 8) | nb;
}

// A sprite has a hundred colours at most, repeated over thousands of pixels,
// and every image of an animal is shifted with the same options: the result
// for a colour is worked out once and kept until the options change.
let cacheKey = null;
let cache = new Map();

function shiftCache(key) {
  if (key !== cacheKey) {
    cacheKey = key;
    cache = new Map();
  }
  return cache;
}

/** Validates the `appearance` section of a pack.json. */
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
