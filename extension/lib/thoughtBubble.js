// Thought bubble above a critter: icon of its most urgent need. An actor
// separate from the sprite (which is flipped horizontally based on
// walking direction) and NON-reactive: added directly to uiGroup, without
// going through addChrome, it doesn't enter the input region and so lets
// every click through.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { loadImage } from './packLoader.js';
import { warn } from './log.js';

const ICON_FOR_NEED = {
  relief: 'relief',
  break: 'break', // break reminder (not a need: comes from snapshot.bubble)
  satiety: 'hungry',
  energy: 'sleepy',
  cleanliness: 'dirty',
  stimulation: 'bored',
  affection: 'heart',
  health: 'sick',
};

const DISPLAY_SIZE = 24; // icons drawn at 48 px, displayed at 24 (crisp on HiDPI)
const FADE_MS = 250;
const GAP_PX = 2;

/**
 * Loads the bubble icons once for every critter.
 * @param {string} dir extension/assets/bubbles folder
 * @returns {Record<string, St.ImageContent>} empty if loading fails
 */
export function loadBubbleIcons(dir) {
  const icons = {};
  try {
    for (const name of new Set(Object.values(ICON_FOR_NEED))) {
      icons[name] = loadImage(GLib.build_filenamev([dir, `${name}.png`]));
    }
  } catch (e) {
    warn(`bubble icons unavailable (${e.message})`);
    return {};
  }
  return icons;
}

export class ThoughtBubble {
  /** @param {Record<string, St.ImageContent>} icons */
  constructor(icons) {
    this._icons = icons;
    this._need = null;
    this._frame = 0;
    this.actor = new Clutter.Actor({
      reactive: false,
      width: DISPLAY_SIZE,
      height: DISPLAY_SIZE,
      opacity: 0,
      visible: false,
    });
    this.actor.set_content_scaling_filters(Clutter.ScalingFilter.TRILINEAR, Clutter.ScalingFilter.LINEAR);
    Main.layoutManager.uiGroup.add_child(this.actor);
  }

  /**
   * @param {string|null} need urgent need (a Needs key) or null
   * @param {{x:number, y:number, width:number, height:number}} spriteBox
   *   the sprite's on-screen rectangle
   * @param {boolean} spriteVisible false when the sprite is hidden
   *   (chrome hidden in fullscreen)
   */
  update(need, spriteBox, spriteVisible) {
    const icon = need && spriteVisible ? this._icons[ICON_FOR_NEED[need]] : null;

    if (icon && need !== this._need) {
      this.actor.content = icon;
    }
    if (Boolean(icon) !== Boolean(this._need)) {
      this.actor.remove_all_transitions();
      if (icon) {
        this.actor.show();
        this.actor.ease({ opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
      } else {
        this.actor.ease({
          opacity: 0,
          duration: FADE_MS,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD,
          onComplete: () => this.actor.hide(),
        });
      }
    }
    this._need = icon ? need : null;
    if (!this._need && this.actor.opacity === 0) return;

    this._frame += 1;
    const bob = Math.round(Math.sin(this._frame / 12) * 1.5);
    this.actor.set_position(
      Math.round(spriteBox.x + spriteBox.width / 2 - DISPLAY_SIZE / 2),
      Math.max(0, Math.round(spriteBox.y - DISPLAY_SIZE - GAP_PX + bob)),
    );
  }

  destroy() {
    this.actor.remove_all_transitions();
    this.actor.destroy();
  }
}
