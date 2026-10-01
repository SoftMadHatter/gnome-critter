// Reads sprite sheets into a canvas, the way the extension displays them:
// square frames in a row, `spriteSize` display size and the stage's scale,
// smoothing per `smooth`, flipping, color variations (shiftPixels), and an
// accessory placed on the head (accessoryPlacement).

import { shiftPixels } from '../../core/colorShift.js';
import { accessoryPlacement, anchorForState } from '../../core/accessories.js';
import { stagesOverrides, Life } from '../../core/life.js';

const images = new Map();

/** Image loaded only once (shared promise). */
export function loadImage(url) {
  if (!images.has(url)) {
    images.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`image not found: ${url}`));
        img.src = url;
      }),
    );
  }
  return images.get(url);
}

/** Display scale of each stage (the game's default values, filled in by the pack). */
export function stageScales(meta) {
  return new Life({}, { scales: stagesOverrides(meta.stages).scales }).scales;
}

/**
 * URL of an animation's sheet for a stage: the one in the stage's folder
 * if the pack provides it, otherwise the adult's (same rule as packLoader).
 */
export function sheetUrl(pack, file, stage) {
  const folder = stagesOverrides(pack.meta.stages).folders[stage];
  const candidate = folder ? `${folder}/${file.split('/').pop()}` : null;
  const path = candidate && pack.files.has(candidate) ? candidate : file;
  return `/packs/${pack.id}/${path}`;
}

/** A stage's animation: sheet, frame count, frame duration (the shared egg if the pack has none of its own). */
export function animationOf(pack, name, stage) {
  if (stage === 'egg') {
    const egg = pack.meta.animations?.egg;
    return egg
      ? { url: `/packs/${pack.id}/${egg.file}`, frames: egg.frames, duration: egg.frameDuration }
      : { url: '/extension/assets/life/egg.png', frames: 4, duration: 0.6 };
  }
  const def = pack.meta.animations?.[name] ?? pack.meta.reactions?.[name];
  if (!def) return null;
  return { url: sheetUrl(pack, def.file, stage), frames: def.frames, duration: def.frameDuration ?? 0.2 };
}

/** Recolored sheet (cached per setting). */
async function tintedSheet(url, color) {
  const img = await loadImage(url);
  if (!color || (Math.abs(color.hue) < 0.5 && color.saturation === 1 && !color.colorizeGrays)) return img;
  const key = `${url}|${color.hue}|${color.saturation}|${color.tone}|${color.colorizeGrays}|${color.graySaturation}`;
  if (!images.has(key)) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    data.data.set(shiftPixels(data.data, color));
    ctx.putImageData(data, 0, 0);
    images.set(key, Promise.resolve(canvas));
  }
  return images.get(key);
}

/** Active players, animated by a single loop; a player whose canvas left the page stops. */
const players = new Set();
let looping = false;

function loop(time) {
  for (const player of players) {
    if (!player.canvas.isConnected) players.delete(player);
    else player.draw(time);
  }
  looping = players.size > 0;
  if (looping) requestAnimationFrame(loop);
}

/**
 * Player for an animation in a canvas.
 * options: pack, name (state or reaction), stage, zoom, speed, smooth, facing (1 | -1),
 * color ({hue, saturation, tone, colorizeGrays, graySaturation} or null), accessory (id or null), padding.
 */
export class SpritePlayer {
  constructor(options) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'checker';
    this.options = options;
    this.sheet = null;
    this.accessory = null;
    this.ready = this.reload();
    players.add(this);
    if (!looping) {
      looping = true;
      requestAnimationFrame(loop);
    }
  }

  async reload() {
    const { pack, name, stage, zoom = 2, color = null, accessory = null, padding = 0.5 } = this.options;
    this.animation = animationOf(pack, name, stage);
    if (!this.animation) return;
    const scale = stageScales(pack.meta)[stage] ?? 1;
    const size = pack.meta.spriteSize ?? { width: 32, height: 32 };
    this.display = { width: Math.round(size.width * scale * zoom), height: Math.round(size.height * scale * zoom) };
    const pad = Math.round(Math.max(this.display.width, this.display.height) * padding);
    this.canvas.width = this.display.width + 2 * pad;
    this.canvas.height = this.display.height + 2 * pad;
    this.box = { x: pad, y: pad, width: this.display.width, height: this.display.height };
    try {
      this.sheet = await tintedSheet(this.animation.url, color);
      // Like in the game: no accessory on an egg.
      const egg = stage === 'egg' || this.options.name === 'egg';
      this.accessory = accessory && !egg ? await loadImage(`/extension/assets/accessories/${accessory}.png`) : null;
      this.error = null;
    } catch (e) {
      this.error = e.message;
    }
  }

  draw(time) {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.sheet || !this.animation) return;
    const { pack, speed = 1, smooth = pack.meta.smooth === true, facing = 1, accessory = null } = this.options;
    const frameSize = this.sheet.height;
    const frame = Math.floor(time / 1000 / (this.animation.duration / speed)) % this.animation.frames;
    ctx.imageSmoothingEnabled = smooth;
    ctx.imageSmoothingQuality = 'high';
    const { x, y, width, height } = this.box;
    ctx.save();
    if (facing < 0) {
      ctx.translate(x + width / 2, 0);
      ctx.scale(-1, 1);
      ctx.translate(-(x + width / 2), 0);
    }
    ctx.drawImage(this.sheet, frame * frameSize, 0, frameSize, frameSize, x, y, width, height);
    ctx.restore();
    if (this.accessory && accessory) {
      const anchors = this.options.anchors ?? { head: { x: 0.72, y: 0.2 }, states: {} };
      const anchor = anchorForState(anchors, this.options.name);
      if (!anchor) return;
      const place = accessoryPlacement(accessory, this.box, anchor, facing, anchor.rotation);
      const cx = place.x + place.size / 2;
      const cy = place.y + place.size / 2;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.translate(cx, cy);
      if (facing < 0) ctx.scale(-1, 1);
      ctx.rotate((anchor.rotation * Math.PI) / 180);
      ctx.drawImage(this.accessory, -place.size / 2, -place.size / 2, place.size, place.size);
      ctx.restore();
    }
  }
}
