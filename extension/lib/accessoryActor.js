// A worn accessory (hat, bow tie, glasses...): a small non-reactive actor
// placed on the critter's head, face or neck (per accessory), anchored via
// the pack's `anchors` section, frame by frame. Added to uiGroup without
// addChrome: it lets clicks through.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { accessoryImageId, accessoryImageIds, accessoryPlacement, accessorySlot, anchorFor, layoutFor } from '../core/accessories.js';
import { loadImage } from './packLoader.js';
import { warn } from './log.js';

/**
 * @param {string} dir extension/assets/accessories
 * @returns {Record<string, St.ImageContent>} empty if loading fails
 */
export function loadAccessoryImages(dir) {
  const images = {};
  try {
    for (const id of accessoryImageIds()) images[id] = loadImage(GLib.build_filenamev([dir, `${id}.png`]));
  } catch (e) {
    warn(`accessories unavailable (${e.message})`);
    return {};
  }
  return images;
}

export class AccessoryActor {
  /**
   * @param {Record<string, St.ImageContent>} images
   * @param {ReturnType<typeof import('../core/accessories.js').anchorsOverrides>['anchors']} anchors
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
   * @param {{animation?: string, reaction?: string, frame: number}} pose the animation or reaction on screen and its frame
   * @param {string} stage life stage
   */
  update(id, box, facing, visible, pose, stage) {
    const anchor = id ? anchorFor(this._anchors, { ...pose, stage, slot: accessorySlot(id, this._anchors) }) : null;
    const imageId = id ? accessoryImageId(id, this._anchors) : null;
    const image = id && visible && anchor ? this._images[imageId] : null;
    if (!image) {
      if (this.actor.visible) this.actor.hide();
      this._id = null;
      return;
    }
    if (imageId !== this._id) {
      this._id = imageId;
      this.actor.content = image;
    }
    const { x, y, size } = accessoryPlacement(id, box, anchor, facing, anchor.rotation, layoutFor(id, this._anchors));
    this.actor.set_size(size, size);
    this.actor.set_position(x, y);
    this.actor.scale_x = facing < 0 ? -1 : 1;
    this.actor.rotation_angle_z = anchor.rotation * (facing < 0 ? -1 : 1);
    if (!this.actor.visible) this.actor.show();
  }

  destroy() {
    this.actor.destroy();
  }
}
