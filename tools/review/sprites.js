// Lecture des feuilles de sprites dans un canevas, comme l'extension les
// affiche : frames carrées sur une ligne, taille d'affichage `spriteSize` et
// échelle du stade, lissage selon `smooth`, retournement, variations de
// couleur (shiftPixels) et accessoire posé sur la tête (accessoryPlacement).

import { shiftPixels } from '../../core/colorShift.js';
import { accessoryPlacement } from '../../core/accessories.js';
import { stagesOverrides, Life } from '../../core/life.js';

const images = new Map();

/** Image chargée une seule fois (promesse partagée). */
export function loadImage(url) {
  if (!images.has(url)) {
    images.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`image introuvable : ${url}`));
        img.src = url;
      }),
    );
  }
  return images.get(url);
}

/** Échelle d'affichage de chaque stade (valeurs par défaut du jeu, complétées par le pack). */
export function stageScales(meta) {
  return new Life({}, { scales: stagesOverrides(meta.stages).scales }).scales;
}

/**
 * Adresse de la feuille d'une animation pour un stade : celle du dossier du
 * stade si le pack la fournit, sinon celle de l'adulte (même règle que packLoader).
 */
export function sheetUrl(pack, file, stage) {
  const folder = stagesOverrides(pack.meta.stages).folders[stage];
  const candidate = folder ? `${folder}/${file.split('/').pop()}` : null;
  const path = candidate && pack.files.has(candidate) ? candidate : file;
  return `/packs/${pack.id}/${path}`;
}

/** Animation d'un stade : feuille, nombre de frames, durée d'une frame (l'œuf commun si le pack n'a pas le sien). */
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

/** Feuille recolorée (mise en cache par réglage). */
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

/** Lecteurs actifs, animés par une seule boucle ; un lecteur dont le canevas a quitté la page s'arrête. */
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
 * Lecteur d'une animation dans un canevas.
 * options : pack, name (état ou réaction), stage, zoom, speed, smooth, facing (1 | -1),
 * color ({hue, saturation, tone, colorizeGrays, graySaturation} ou null), accessory (id ou null), padding.
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
      // Comme en jeu : pas d'accessoire sur un œuf.
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
      const head = this.options.head ?? { x: 0.72, y: 0.2 };
      const place = accessoryPlacement(accessory, this.box, head, facing);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      if (facing < 0) {
        ctx.translate(place.x + place.size / 2, 0);
        ctx.scale(-1, 1);
        ctx.translate(-(place.x + place.size / 2), 0);
      }
      ctx.drawImage(this.accessory, place.x, place.y, place.size, place.size);
      ctx.restore();
    }
  }
}
