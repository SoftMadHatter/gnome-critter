// Représentation d'un objet du bureau (aliment, gamelle, lit) : un acteur
// posé comme le critter dans le chrome du Shell. Se déplace à la souris
// (glisser-déposer, il retombe au relâchement) et se retire au clic droit.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { loadImage } from './packLoader.js';

/** Taille d'affichage par type d'objet (px, sprites à taille réelle). */
const SIZES = { food: { width: 16, height: 16 }, bowl: { width: 24, height: 12 }, bed: { width: 32, height: 12 } };

export const FOOD_LABELS = {
  meat: 'Viande',
  fish: 'Poisson',
  kibble: 'Croquettes',
  seeds: 'Graines',
  plankton: 'Plancton',
};

const IMAGE_NAMES = ['meat', 'fish', 'kibble', 'seeds', 'plankton', 'bowl_empty', 'bowl_full', 'bed'];

/**
 * @param {string} dir extension/assets/items
 * @returns {Record<string, St.ImageContent>} vide si le chargement échoue
 */
export function loadItemImages(dir) {
  const images = {};
  try {
    for (const name of IMAGE_NAMES) images[name] = loadImage(GLib.build_filenamev([dir, `${name}.png`]));
  } catch (e) {
    console.warn(`Scamper : sprites d'objets indisponibles (${e.message})`);
    return {};
  }
  return images;
}

function imageName(item) {
  if (item.type === 'bed') return 'bed';
  if (item.type === 'bowl') return item.portions > 0 ? 'bowl_full' : 'bowl_empty';
  return item.kind;
}

export class ItemActor {
  /**
   * @param {ReturnType<typeof import('../core/items.js').createItem>} item
   * @param {Record<string, St.ImageContent>} images
   */
  constructor(item, images) {
    this.item = item;
    this._images = images;
    this._grab = null;
    this._imageName = null;

    const size = SIZES[item.type];
    this.actor = new Clutter.Actor({ reactive: true, width: size.width, height: size.height });
    this.actor.set_content_scaling_filters(Clutter.ScalingFilter.NEAREST, Clutter.ScalingFilter.NEAREST);
    this._setupGestures();
    this.sync();
  }

  _setupGestures() {
    const remove = new Clutter.ClickGesture({
      required_button: Clutter.BUTTON_SECONDARY,
      recognize_on_press: true,
    });
    remove.connect('recognize', () => {
      this.item.removed = true;
    });
    this.actor.add_action(remove);

    const pan = new Clutter.PanGesture();
    pan.set_begin_threshold(4);
    pan.connect('recognize', () => {
      this._grab = global.stage.grab(this.actor);
      this.item.grabbed = true;
      this.item.surface = null;
      this.item.vy = 0;
    });
    pan.connect('pan-update', () => {
      const coords = pan.get_centroid_abs();
      const size = SIZES[this.item.type];
      this.item.x = coords.x;
      this.item.y = coords.y + size.height / 2;
      this.sync();
    });
    pan.connect('end', () => {
      this._releaseGrab();
      this.item.grabbed = false; // la physique reprend : il retombe
    });
    this.actor.add_action(pan);
  }

  _releaseGrab() {
    if (this._grab) {
      this._grab.dismiss();
      this._grab = null;
    }
  }

  sync() {
    const size = SIZES[this.item.type];
    const name = imageName(this.item);
    if (name !== this._imageName && this._images[name]) {
      this._imageName = name;
      this.actor.content = this._images[name];
    }
    this.actor.set_position(Math.round(this.item.x - size.width / 2), Math.round(this.item.y - size.height));
  }

  destroy() {
    this._releaseGrab();
    this.actor.destroy();
  }
}
