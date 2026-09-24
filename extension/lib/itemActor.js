// Représentation d'un objet du bureau (aliment, gamelle, lit) : un acteur
// posé comme le critter dans le chrome du Shell. Se déplace à la souris
// (glisser-déposer, il retombe au relâchement) et se retire au clic droit.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { loadImage } from './packLoader.js';
import { throwItem } from '../core/items.js';
import { spriteName, spriteSize } from '../core/itemLooks.js';

const THROW_WINDOW_US = 100_000; // fenêtre de mesure de la vitesse du glisser
const MAX_THROW_SPEED = 900; // px/s
const PREY_FRAME_SECONDS = 0.18; // cadence des deux frames de marche

export const FOOD_LABELS = {
  meat: 'Viande',
  fish: 'Poisson',
  pate: 'Pâtée',
  kibble: 'Croquettes',
  seeds: 'Graines',
  mealworms: 'Vers de farine',
  apple: 'Pomme',
  plankton: 'Plancton',
  flakes: 'Flocons',
};

import { FOOD_PRICES } from '../core/accessories.js';

/** Libellé d'un aliment avec son prix (aliments premium seulement), pour `portions` portions. */
export function foodLabel(kind, portions = 1) {
  const price = (FOOD_PRICES[kind] ?? 0) * portions;
  return `${FOOD_LABELS[kind] ?? kind}${price > 0 ? ` (${price} pièces)` : ''}`;
}

export const TOY_LABELS = { ball: 'Balle', yarn: 'Pelote de laine', plush: 'Peluche', ring: 'Anneau flottant' };
export const BED_LABELS = { cushion: 'Coussin', basket: 'Panier', cradle: 'Couffin' };
export const BOWL_LABELS = { ceramic: 'Céramique', steel: 'Inox', wood: 'Bois' };

export const PREY_LABELS = { mouse: 'Souris', beetle: 'Scarabée', aphid: 'Puceron', krill: 'Krill' };
export const PLANT_LABELS = { grass: 'Herbe', berries: 'Baies', leaf: 'Feuille', algae: 'Algue' };

/**
 * Sprites d'objets (noms : core/itemLooks.js), chargés à la première demande
 * puis gardés en cache ; un sprite absent n'est signalé qu'une fois.
 * @param {string} dir extension/assets/items
 * @returns {{get: (name: string) => St.ImageContent|null}}
 */
export function loadItemImages(dir) {
  const cache = new Map();
  return {
    get(name) {
      if (!cache.has(name)) {
        let image = null;
        try {
          image = loadImage(GLib.build_filenamev([dir, `${name}.png`]));
        } catch (e) {
          console.warn(`Scamper : sprite d'objet « ${name} » indisponible (${e.message})`);
        }
        cache.set(name, image);
      }
      return cache.get(name);
    },
  };
}

export class ItemActor {
  /**
   * @param {ReturnType<typeof import('../core/items.js').createItem>} item
   * @param {ReturnType<typeof loadItemImages>} images
   */
  constructor(item, images) {
    this.item = item;
    this._images = images;
    this._grab = null;
    this._imageName = null;

    const size = spriteSize(item);
    this.actor = new Clutter.Actor({
      reactive: true,
      width: size.width,
      height: size.height,
      pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
    });
    this._samples = []; // derniers points du glisser, pour l'élan au lancer
    // Sprites dessinés au double de la taille d'affichage : réduction lissée, nette en HiDPI.
    this.actor.set_content_scaling_filters(Clutter.ScalingFilter.TRILINEAR, Clutter.ScalingFilter.LINEAR);
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

    if (this.item.type === 'mess' || this.item.type === 'litter') {
      // Un clic nettoie : la trace disparaît (+1 pièce), la litière redevient propre.
      const clean = new Clutter.ClickGesture();
      clean.connect('recognize', () => {
        if (this.item.type === 'mess') {
          this.item.collected = true;
          this.item.removed = true;
        } else {
          this.item.cleaned = true;
        }
      });
      this.actor.add_action(clean);
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
      const size = spriteSize(this.item);
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
    const size = spriteSize(this.item);
    // Proie : deux frames de marche alternées tant qu'elle bouge.
    const frame =
      this.item.type === 'prey' && this.item.moving
        ? Math.floor(GLib.get_monotonic_time() / 1_000_000 / PREY_FRAME_SECONDS) % 2
        : 0;
    const name = spriteName(this.item, frame);
    if (name !== this._imageName) {
      const image = this._images.get(name);
      if (image) {
        this._imageName = name;
        this.actor.content = image;
      }
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
    this.actor.set_content_scaling_filters(Clutter.ScalingFilter.TRILINEAR, Clutter.ScalingFilter.LINEAR);
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
