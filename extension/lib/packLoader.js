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

/**
 * @param {GdkPixbuf.Pixbuf} pixbuf
 * @returns {St.ImageContent}
 */
function pixbufToImage(pixbuf) {
  const coglContext = global.stage.context.get_backend().get_cogl_context();
  const format = pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888;
  const width = pixbuf.get_width();
  const height = pixbuf.get_height();

  const image = St.ImageContent.new_with_preferred_size(width, height);
  const ok = image.set_data(
    coglContext,
    pixbuf.get_pixels(),
    format,
    width,
    height,
    pixbuf.get_rowstride(),
  );
  if (!ok) {
    throw new Error('St.ImageContent.set_data a échoué (spritesheet corrompue ?)');
  }
  return image;
}

/**
 * Découpe un spritesheet (une ligne de frames carrées) en `count` images.
 * @param {Gio.File} baseDir
 * @param {string} relativePath
 * @param {number} count
 * @returns {St.ImageContent[]}
 */
function loadFrames(baseDir, relativePath, count) {
  const file = baseDir.get_child(relativePath);
  const path = file.get_path();
  const sheet = GdkPixbuf.Pixbuf.new_from_file(path);
  const frameSize = sheet.get_height();
  const sheetFrameCount = sheet.get_width() / frameSize;

  if (!Number.isInteger(sheetFrameCount) || count > sheetFrameCount) {
    throw new Error(
      `${path}: largeur ${sheet.get_width()} incohérente avec ${count} frames de ${frameSize}px`,
    );
  }

  const frames = [];
  for (let i = 0; i < count; i++) {
    const sub = sheet.new_subpixbuf(i * frameSize, 0, frameSize, frameSize);
    frames.push(pixbufToImage(sub));
  }
  return frames;
}

/**
 * @param {string} packDirPath dossier contenant pack.json
 * @returns {{
 *   meta: object,
 *   spriteSize: {width:number, height:number},
 *   supportedSurfaces: Set<string>,
 *   speeds: object,
 *   behavior: object,
 *   animationFrames: Record<string, St.ImageContent[]>,
 *   animationTiming: Record<string, {frameDuration:number, loop:boolean}>,
 *   reactionFrames: Record<string, St.ImageContent[]>,
 *   reactionTiming: Record<string, {frameDuration:number, loop:boolean}>,
 *   reactionSounds: Record<string, Gio.File>,
 * }}
 */
export function loadPack(packDirPath) {
  const dir = Gio.File.new_for_path(packDirPath);
  const packFile = dir.get_child('pack.json');
  const [, contents] = packFile.load_contents(null);
  const meta = JSON.parse(new TextDecoder('utf-8').decode(contents));

  const animationFrames = {};
  const animationTiming = {};
  for (const [state, def] of Object.entries(meta.animations ?? {})) {
    animationFrames[state] = loadFrames(dir, def.file, def.frames);
    animationTiming[state] = { frameDuration: def.frameDuration, loop: def.loop !== false };
  }

  const reactionFrames = {};
  const reactionTiming = {};
  const reactionSounds = {};
  for (const [name, def] of Object.entries(meta.reactions ?? {})) {
    reactionFrames[name] = loadFrames(dir, def.file, def.frames);
    reactionTiming[name] = { frameDuration: def.frameDuration, loop: def.loop === true };
    // Optionnel : un pack peut ne fournir aucun son, ou seulement pour
    // certaines réactions (rétrocompatible avec les packs sans "sound").
    if (def.sound) reactionSounds[name] = dir.get_child(def.sound);
  }

  return {
    meta,
    spriteSize: meta.spriteSize ?? { width: 32, height: 32 },
    supportedSurfaces: new Set(meta.supportedSurfaces ?? ['ground']),
    speeds: meta.speeds ?? {},
    behavior: meta.behavior ?? {},
    animationFrames,
    animationTiming,
    reactionFrames,
    reactionTiming,
    reactionSounds,
  };
}

/** Résout un chemin de pack relatif au dossier de l'extension. */
export function resolvePackPath(extensionDir, packId) {
  return GLib.build_filenamev([extensionDir, 'packs', packId]);
}
