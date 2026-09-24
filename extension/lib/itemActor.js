// Représentation d'un objet du bureau (aliment, gamelle, lit) : un acteur
// posé comme le critter dans le chrome du Shell. Se déplace à la souris
// (glisser-déposer, il retombe au relâchement) et se retire au clic droit.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { loadImage } from './packLoader.js';
import { throwItem, isMoldy, PLANTS } from '../core/items.js';
import { PREY } from '../core/prey.js';

const THROW_WINDOW_US = 100_000; // fenêtre de mesure de la vitesse du glisser
const MAX_THROW_SPEED = 900; // px/s

/** Taille d'affichage par type d'objet (px, sprites à taille réelle). */
const SIZES = { food: { width: 16, height: 16 }, bowl: { width: 24, height: 12 }, bed: { width: 32, height: 12 } };
const TOY_SIZES = { ball: { width: 12, height: 12 }, plush: { width: 16, height: 14 } };

const PREY_SIZES = { mouse: { width: 16, height: 10 }, beetle: { width: 10, height: 8 }, aphid: { width: 6, height: 5 }, krill: { width: 8, height: 6 } };
const PLANT_SIZE = { width: 16, height: 14 };
const PREY_FRAME_SECONDS = 0.18; // cadence des deux frames de marche

const sizeOf = (item) => {
  if (item.type === 'toy') return TOY_SIZES[item.kind];
  if (item.type === 'gift') return { width: 12, height: 12 };
  if (item.type === 'prey') return PREY_SIZES[item.kind];
  if (item.type === 'plant') return PLANT_SIZE;
  return SIZES[item.type];
};

export const FOOD_LABELS = {
  meat: 'Viande',
  fish: 'Poisson',
  kibble: 'Croquettes',
  seeds: 'Graines',
  plankton: 'Plancton',
};

import { FOOD_PRICES } from '../core/accessories.js';

/** Libellé d'un aliment avec son prix (aliments premium seulement), pour `portions` portions. */
export function foodLabel(kind, portions = 1) {
  const price = (FOOD_PRICES[kind] ?? 0) * portions;
  return `${FOOD_LABELS[kind] ?? kind}${price > 0 ? ` (${price} pièces)` : ''}`;
}

export const TOY_LABELS = { ball: 'Balle', plush: 'Peluche' };

export const PREY_LABELS = { mouse: 'Souris', beetle: 'Scarabée', aphid: 'Puceron', krill: 'Krill' };
export const PLANT_LABELS = { grass: 'Herbe', berries: 'Baies', leaf: 'Feuille', algae: 'Algue' };

const IMAGE_NAMES = [
  'meat', 'fish', 'kibble', 'seeds', 'plankton', 'bowl_empty', 'bowl_full', 'bowl_moldy', 'bed', 'ball', 'plush',
  'laser', 'coin', 'flower', 'feather',
  ...Object.keys(PREY).flatMap((kind) => [`${kind}_0`, `${kind}_1`]),
  ...Object.keys(PLANTS).flatMap((kind) => [0, 1, 2, 3].map((n) => `${kind}_${n}`)),
];

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
  if (item.type === 'bowl') {
    if (isMoldy(item)) return 'bowl_moldy';
    return item.portions > 0 ? 'bowl_full' : 'bowl_empty';
  }
  if (item.type === 'plant') return `${item.kind}_${item.portions}`;
  if (item.type === 'prey') {
    // Deux frames de marche alternées tant que la proie bouge.
    const frame = item.moving ? Math.floor(GLib.get_monotonic_time() / 1_000_000 / PREY_FRAME_SECONDS) % 2 : 0;
    return `${item.kind}_${frame}`;
  }
  return item.kind; // aliments et jouets : le nom du sprite est le `kind`
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

    const size = sizeOf(item);
    this.actor = new Clutter.Actor({
      reactive: true,
      width: size.width,
      height: size.height,
      pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
    });
    this._samples = []; // derniers points du glisser, pour l'élan au lancer
    this.actor.set_content_scaling_filters(Clutter.ScalingFilter.NEAREST, Clutter.ScalingFilter.NEAREST);
    this._setupGestures();
    this.sync();
  }

  _setupGestures() {
    if (this.item.type === 'gift') {
      // Un clic ramasse le cadeau : le Manager crédite les pièces.
      const collect = new Clutter.ClickGesture();
      collect.connect('recognize', () => {
        this.item.collected = true;
        this.item.removed = true;
      });
      this.actor.add_action(collect);
    }

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
      this.item.vx = 0;
      this._samples = [];
    });
    pan.connect('pan-update', () => {
      const coords = pan.get_centroid_abs();
      const size = sizeOf(this.item);
      this.item.x = coords.x;
      this.item.y = coords.y + size.height / 2;
      const now = GLib.get_monotonic_time();
      this._samples.push({ x: coords.x, y: coords.y, t: now });
      this._samples = this._samples.filter((s) => now - s.t <= THROW_WINDOW_US);
      this.sync();
    });
    pan.connect('end', () => {
      this._releaseGrab();
      this.item.grabbed = false; // la physique reprend : il retombe
      // Élan : vitesse moyenne du pointeur sur les derniers instants.
      const first = this._samples[0];
      const last = this._samples[this._samples.length - 1];
      if (first && last && last.t - first.t > 20_000) {
        const seconds = (last.t - first.t) / 1_000_000;
        const clampSpeed = (v) => Math.max(-MAX_THROW_SPEED, Math.min(MAX_THROW_SPEED, v));
        throwItem(this.item, clampSpeed((last.x - first.x) / seconds), clampSpeed((last.y - first.y) / seconds));
      }
      this._samples = [];
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
    const size = sizeOf(this.item);
    const name = imageName(this.item);
    if (name !== this._imageName && this._images[name]) {
      this._imageName = name;
      this.actor.content = this._images[name];
    }
    this.actor.set_position(Math.round(this.item.x - size.width / 2), Math.round(this.item.y - size.height));
    if (this.item.type === 'prey') this.actor.scale_x = this.item.dir < 0 ? -1 : 1;
  }

  destroy() {
    this._releaseGrab();
    this.actor.destroy();
  }
}

/** Point rouge qui suit le curseur quand le mode pointeur laser est actif.
 * Non réactif, ajouté à uiGroup sans addChrome : il laisse passer les clics. */
export class LaserDot {
  /** @param {St.ImageContent} image */
  constructor(image) {
    this.actor = new Clutter.Actor({ reactive: false, width: 8, height: 8, visible: false });
    this.actor.set_content_scaling_filters(Clutter.ScalingFilter.NEAREST, Clutter.ScalingFilter.NEAREST);
    this.actor.content = image;
    Main.layoutManager.uiGroup.add_child(this.actor);
  }

  update(pointer, on) {
    if (on !== this.actor.visible) this.actor.visible = on;
    if (on) this.actor.set_position(Math.round(pointer.x - 4), Math.round(pointer.y - 4));
  }

  destroy() {
    this.actor.destroy();
  }
}
