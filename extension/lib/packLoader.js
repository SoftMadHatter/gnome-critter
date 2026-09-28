// Loads an animal pack (see docs/pack-format.md): reads pack.json, then
// slices each spritesheet into individual frames converted to
// St.ImageContent, ready to be placed on an actor.
//
// GdkPixbuf does the PNG decoding and slicing (new_subpixbuf), Cogl bridges
// to a GPU texture usable by Clutter. This is the standard path to display
// arbitrary images in GNOME Shell.
//
// Clutter.Image was removed (GNOME Shell 48+, see
// https://gjs.guide/extensions/upgrading/gnome-shell-48.html#clutter-image):
// St.ImageContent replaces it, and set_data() now explicitly requires the
// compositor's Cogl.Context as its first argument.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import St from 'gi://St';
import Cogl from 'gi://Cogl';

import { shiftPixels, appearanceOverrides } from '../core/colorShift.js';
import { stagesOverrides } from '../core/life.js';
import { localizePack } from '../core/packTranslations.js';
import { language } from '../core/i18n.js';

/**
 * @param {GdkPixbuf.Pixbuf} pixbuf
 * @param {((pixels: Uint8Array) => Uint8Array)|null} [transform] color variation
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
    throw new Error('St.ImageContent.set_data failed (corrupt spritesheet?)');
  }
  return image;
}

/**
 * Loads a single PNG image (interface icons, outside of packs).
 * @param {string} path absolute path
 * @returns {St.ImageContent}
 */
export function loadImage(path) {
  return pixbufToImage(GdkPixbuf.Pixbuf.new_from_file(path));
}

/**
 * Slices a decoded spritesheet (a single row of square frames) into `count` images.
 * @param {GdkPixbuf.Pixbuf} sheet
 * @param {string} path for error messages
 * @param {number} count
 * @param {((pixels: Uint8Array) => Uint8Array)|null} transform
 * @returns {St.ImageContent[]}
 */
function sliceFrames(sheet, path, count, transform) {
  const frameSize = sheet.get_height();
  const sheetFrameCount = sheet.get_width() / frameSize;

  if (!Number.isInteger(sheetFrameCount) || count > sheetFrameCount) {
    throw new Error(
      `${path}: width ${sheet.get_width()} inconsistent with ${count} frames of ${frameSize}px`,
    );
  }

  const frames = [];
  for (let i = 0; i < count; i++) {
    frames.push(pixbufToImage(sheet.new_subpixbuf(i * frameSize, 0, frameSize, frameSize), transform));
  }
  return frames;
}

/** True when the appearance changes no pixel (zero hue, normal saturation). */
function isIdentity(appearance, colorizeGrays) {
  return !appearance || (Math.abs(appearance.hue) < 0.5 && appearance.saturation === 1 && !colorizeGrays);
}

function cacheKey(appearance) {
  return `${Math.round(appearance.hue)}|${Math.round(appearance.tone)}|${appearance.saturation.toFixed(2)}`;
}

/**
 * A single-row sheet (e.g. the egg, shared by every species), with one
 * color variant per appearance, computed on demand and cached.
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
 * @param {string} packDirPath folder containing pack.json
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
  // The pack's name, given names, and achievements in the session's language (`translations` section).
  const meta = localizePack(JSON.parse(new TextDecoder('utf-8').decode(contents)), language());
  const appearanceConfig = appearanceOverrides(meta.appearance).config;

  // Sheets decoded only once: every color variant starts over from the
  // original pixels.
  const sheets = new Map();
  const sheetOf = (relativePath) => {
    if (!sheets.has(relativePath)) {
      sheets.set(relativePath, GdkPixbuf.Pixbuf.new_from_file(dir.get_child(relativePath).get_path()));
    }
    return sheets.get(relativePath);
  };

  // Sheet folder specific to a stage (baby, young, senior); a missing sheet falls back to the adult's.
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
    const stageKey = stageFolders[stage] ? stage : null; // without a folder, every stage shares the adult set
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
    // Optional: a pack may provide no sound at all, or only for some
    // reactions (backward compatible with packs without "sound").
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

/** Resolves a pack path relative to the extension's folder. */
export function resolvePackPath(extensionDir, packId) {
  return GLib.build_filenamev([extensionDir, 'packs', packId]);
}
