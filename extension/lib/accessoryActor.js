// A worn accessory (hat, bow tie, glasses...): a small non-reactive actor
// placed on the critter's head, anchored via the pack's `anchors.head`
// section. Added to uiGroup without addChrome: it lets clicks through.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ACCESSORIES, accessoryPlacement } from '../core/accessories.js';
import { loadImage } from './packLoader.js';

/**
 * @param {string} dir extension/assets/accessories
 * @returns {Record<string, St.ImageContent>} empty if loading fails
 */
export function loadAccessoryImages(dir) {
  const images = {};
  try {
    for (const id of Object.keys(ACCESSORIES)) images[id] = loadImage(GLib.build_filenamev([dir, `${id}.png`]));
  } catch (e) {
    console.warn(`Critter: accessories unavailable (${e.message})`);
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
    // Accessories drawn at double their display size: smoothed downscaling.
    this.actor.set_content_scaling_filters(Clutter.ScalingFilter.TRILINEAR, Clutter.ScalingFilter.LINEAR);
    Main.layoutManager.uiGroup.add_child(this.actor);
  }

  /**
   * @param {string|null} id accessory to wear, or null
   * @param {{x:number, y:number, width:number, height:number}} box the sprite's on-screen rectangle
   * @param {number} facing 1 (right) or -1 (left)
   * @param {boolean} visible false when the sprite is hidden
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
    const { x, y, size } = accessoryPlacement(id, box, this._anchors.head, facing);
    this.actor.set_size(size, size);
    this.actor.set_position(x, y);
    this.actor.scale_x = facing < 0 ? -1 : 1;
    if (!this.actor.visible) this.actor.show();
  }

  destroy() {
    this.actor.destroy();
  }
}
