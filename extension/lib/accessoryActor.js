// Accessoire porté (chapeau, nœud, lunettes...) : un petit acteur non réactif
// posé sur la tête de l'animal, ancré via la section `anchors.head` du pack.
// Ajouté à uiGroup sans addChrome : il laisse passer les clics.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ACCESSORIES } from '../core/accessories.js';
import { loadImage } from './packLoader.js';

/** Décalage vers le bas (fraction de la taille) : les chapeaux reposent sur
 * l'ancrage, le nœud et les lunettes se placent plus bas. */
const OFFSETS = { glasses: 0.45, bow: 0.3 };

/**
 * @param {string} dir extension/assets/accessories
 * @returns {Record<string, St.ImageContent>} vide si le chargement échoue
 */
export function loadAccessoryImages(dir) {
  const images = {};
  try {
    for (const id of Object.keys(ACCESSORIES)) images[id] = loadImage(GLib.build_filenamev([dir, `${id}.png`]));
  } catch (e) {
    console.warn(`Scamper : accessoires indisponibles (${e.message})`);
    return {};
  }
  return images;
}

export class AccessoryActor {
  /**
   * @param {Record<string, St.ImageContent>} images
   * @param {{head: {x:number, y:number}}} anchors
   */
  constructor(images, anchors) {
    this._images = images;
    this._anchors = anchors;
    this._id = null;
    this.actor = new Clutter.Actor({ reactive: false, visible: false, pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }) });
    // Accessoires dessinés au double de leur taille d'affichage : réduction lissée.
    this.actor.set_content_scaling_filters(Clutter.ScalingFilter.TRILINEAR, Clutter.ScalingFilter.LINEAR);
    Main.layoutManager.uiGroup.add_child(this.actor);
  }

  /**
   * @param {string|null} id accessoire à porter, ou null
   * @param {{x:number, y:number, width:number, height:number}} box rectangle du sprite à l'écran
   * @param {number} facing 1 (droite) ou -1 (gauche)
   * @param {boolean} visible faux quand le sprite est masqué
   */
  update(id, box, facing, visible) {
    const image = id && visible ? this._images[id] : null;
    if (!image) {
      if (this.actor.visible) this.actor.hide();
      this._id = null;
      return;
    }
    if (id !== this._id) {
      this._id = id;
      this.actor.content = image;
    }
    const size = Math.max(6, Math.round(box.width / 2));
    const head = this._anchors.head;
    const ax = box.x + (facing >= 0 ? head.x : 1 - head.x) * box.width;
    const ay = box.y + head.y * box.height + (OFFSETS[id] ?? 0) * size;
    this.actor.set_size(size, size);
    this.actor.set_position(Math.round(ax - size / 2), Math.round(ay - size));
    this.actor.scale_x = facing < 0 ? -1 : 1;
    if (!this.actor.visible) this.actor.show();
  }

  destroy() {
    this.actor.destroy();
  }
}
