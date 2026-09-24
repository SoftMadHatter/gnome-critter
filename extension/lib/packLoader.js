// Charge un pack d'animal (voir docs/pack-format.md) : lit pack.json, puis
// découpe chaque spritesheet en frames individuelles converties en
// St.ImageContent, prêtes à être posées sur un acteur.
//
// GdkPixbuf fait le décodage PNG et le découpage (new_subpixbuf), Cogl fait
// le pont vers une texture GPU utilisable par Clutter. C'est le chemin
// standard pour afficher des images arbitraires dans GNOME Shell.
//
// Clutter.Image a été supprimé (GNOME Shell 48+, voir
// https://gjs.guide/extensions/upgrading/gnome-shell-48.html#clutter-image) :
// St.ImageContent le remplace, et set_data() exige désormais explicitement
// le Cogl.Context du compositeur en premier argument.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import St from 'gi://St';
import Cogl from 'gi://Cogl';

import { shiftPixels, appearanceOverrides } from '../core/colorShift.js';
import { stagesOverrides } from '../core/life.js';

/**
 * @param {GdkPixbuf.Pixbuf} pixbuf
 * @param {((pixels: Uint8Array) => Uint8Array)|null} [transform] variation de couleur
 * @returns {St.ImageContent}
 */
function pixbufToImage(pixbuf, transform = null) {
  const coglContext = global.stage.context.get_backend().get_cogl_context();
  const format = pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888;
  const width = pixbuf.get_width();
  const height = pixbuf.get_height();

  const pixels = transform && pixbuf.get_has_alpha() ? transform(pixbuf.get_pixels()) : pixbuf.get_pixels();
  const image = St.ImageContent.new_with_preferred_size(width, height);
  const ok = image.set_data(coglContext, pixels, format, width, height, pixbuf.get_rowstride());
  if (!ok) {
    throw new Error('St.ImageContent.set_data a échoué (spritesheet corrompue ?)');
  }
  return image;
}

/**
 * Charge une image PNG seule (icônes d'interface, hors packs).
 * @param {string} path chemin absolu
 * @returns {St.ImageContent}
 */
export function loadImage(path) {
  return pixbufToImage(GdkPixbuf.Pixbuf.new_from_file(path));
}

/**
 * Découpe un spritesheet décodé (une ligne de frames carrées) en `count` images.
 * @param {GdkPixbuf.Pixbuf} sheet
 * @param {string} path pour les messages d'erreur
 * @param {number} count
 * @param {((pixels: Uint8Array) => Uint8Array)|null} transform
 * @returns {St.ImageContent[]}
 */
function sliceFrames(sheet, path, count, transform) {
  const frameSize = sheet.get_height();
  const sheetFrameCount = sheet.get_width() / frameSize;

  if (!Number.isInteger(sheetFrameCount) || count > sheetFrameCount) {
    throw new Error(
      `${path}: largeur ${sheet.get_width()} incohérente avec ${count} frames de ${frameSize}px`,
    );
  }

  const frames = [];
  for (let i = 0; i < count; i++) {
    frames.push(pixbufToImage(sheet.new_subpixbuf(i * frameSize, 0, frameSize, frameSize), transform));
  }
  return frames;
}

/** Vrai quand l'apparence ne change aucun pixel (teinte nulle, saturation normale). */
function isIdentity(appearance, colorizeGrays) {
  return !appearance || (Math.abs(appearance.hue) < 0.5 && appearance.saturation === 1 && !colorizeGrays);
}

function cacheKey(appearance) {
  return `${Math.round(appearance.hue)}|${Math.round(appearance.tone)}|${appearance.saturation.toFixed(2)}`;
}

/**
 * Feuille d'une seule ligne (ex. l'œuf, commun à toutes les espèces), avec
 * une variante de couleur par apparence, calculée à la demande et mise en cache.
 * @param {string} path
 * @returns {{framesFor: (appearance: {hue:number, tone:number, saturation:number}) => St.ImageContent[]}}
 */
export function loadVariantSheet(path) {
  const sheet = GdkPixbuf.Pixbuf.new_from_file(path);
  const count = sheet.get_width() / sheet.get_height();
  const cache = new Map();
  return {
    framesFor(appearance) {
      const key = isIdentity(appearance, false) ? 'base' : cacheKey(appearance);
      if (!cache.has(key)) {
        const transform =
          key === 'base'
            ? null
            : (pixels) => shiftPixels(pixels, { hue: appearance.hue, saturation: appearance.saturation });
        cache.set(key, sliceFrames(sheet, path, count, transform));
      }
      return cache.get(key);
    },
  };
}

/**
 * @param {string} packDirPath dossier contenant pack.json
 * @returns {{
 *   meta: object,
 *   spriteSize: {width:number, height:number},
 *   smooth: boolean,
 *   supportedSurfaces: Set<string>,
 *   speeds: object,
 *   behavior: object,
 *   needs: object,
 *   animationFrames: Record<string, St.ImageContent[]>,
 *   animationTiming: Record<string, {frameDuration:number, loop:boolean}>,
 *   reactionFrames: Record<string, St.ImageContent[]>,
 *   reactionTiming: Record<string, {frameDuration:number, loop:boolean}>,
 *   reactionSounds: Record<string, Gio.File>,
 *   framesFor: (appearance: {hue:number, tone:number, saturation:number}) =>
 *     {animationFrames: Record<string, St.ImageContent[]>, reactionFrames: Record<string, St.ImageContent[]>},
 * }}
 */
export function loadPack(packDirPath) {
  const dir = Gio.File.new_for_path(packDirPath);
  const packFile = dir.get_child('pack.json');
  const [, contents] = packFile.load_contents(null);
  const meta = JSON.parse(new TextDecoder('utf-8').decode(contents));
  const appearanceConfig = appearanceOverrides(meta.appearance).config;

  // Feuilles décodées une seule fois : chaque variante de couleur repart des
  // pixels d'origine.
  const sheets = new Map();
  const sheetOf = (relativePath) => {
    if (!sheets.has(relativePath)) {
      sheets.set(relativePath, GdkPixbuf.Pixbuf.new_from_file(dir.get_child(relativePath).get_path()));
    }
    return sheets.get(relativePath);
  };

  // Dossier de feuilles propre à un stade (bébé, jeune, senior) ; une feuille absente retombe sur l'adulte.
  const stageFolders = stagesOverrides(meta.stages).folders;
  const fileFor = (file, stage) => {
    const folder = stageFolders[stage];
    if (!folder) return file;
    const candidate = `${folder}/${file.split('/').pop()}`;
    return dir.get_child(candidate).query_exists(null) ? candidate : file;
  };

  const buildFrames = (transform, stage) => {
    const animationFrames = {};
    for (const [state, def] of Object.entries(meta.animations ?? {})) {
      const file = fileFor(def.file, stage);
      animationFrames[state] = sliceFrames(sheetOf(file), file, def.frames, transform);
    }
    const reactionFrames = {};
    for (const [name, def] of Object.entries(meta.reactions ?? {})) {
      const file = fileFor(def.file, stage);
      reactionFrames[name] = sliceFrames(sheetOf(file), file, def.frames, transform);
    }
    return { animationFrames, reactionFrames };
  };

  const base = buildFrames(null, null);
  const variants = new Map();
  const framesFor = (appearance, stage = null) => {
    const stageKey = stageFolders[stage] ? stage : null; // sans dossier, tous les stades partagent le jeu adulte
    const identity = !appearanceConfig.enabled || isIdentity(appearance, appearanceConfig.colorizeGrays);
    if (identity && !stageKey) return base;
    const key = `${stageKey}|${identity ? 'base' : cacheKey(appearance)}`;
    if (!variants.has(key)) {
      variants.set(
        key,
        identity
          ? buildFrames(null, stageKey)
          : buildFrames((pixels) =>
          shiftPixels(pixels, {
            hue: appearance.hue,
            saturation: appearance.saturation,
            colorizeGrays: appearanceConfig.colorizeGrays,
            tone: appearance.tone,
            graySaturation: appearanceConfig.graySaturation,
          }), stageKey),
      );
    }
    return variants.get(key);
  };

  const animationTiming = {};
  for (const [state, def] of Object.entries(meta.animations ?? {})) {
    animationTiming[state] = { frameDuration: def.frameDuration, loop: def.loop !== false };
  }
  const reactionTiming = {};
  const reactionSounds = {};
  for (const [name, def] of Object.entries(meta.reactions ?? {})) {
    reactionTiming[name] = { frameDuration: def.frameDuration, loop: def.loop === true };
    // Optionnel : un pack peut ne fournir aucun son, ou seulement pour
    // certaines réactions (rétrocompatible avec les packs sans "sound").
    if (def.sound) reactionSounds[name] = dir.get_child(def.sound);
  }

  return {
    meta,
    spriteSize: meta.spriteSize ?? { width: 32, height: 32 },
    smooth: meta.smooth === true,
    supportedSurfaces: new Set(meta.supportedSurfaces ?? ['ground']),
    speeds: meta.speeds ?? {},
    behavior: meta.behavior ?? {},
    needs: meta.needs ?? {},
    appearance: appearanceConfig,
    animationFrames: base.animationFrames,
    animationTiming,
    reactionFrames: base.reactionFrames,
    reactionTiming,
    reactionSounds,
    framesFor,
  };
}

/** Résout un chemin de pack relatif au dossier de l'extension. */
export function resolvePackPath(extensionDir, packId) {
  return GLib.build_filenamev([extensionDir, 'packs', packId]);
}
