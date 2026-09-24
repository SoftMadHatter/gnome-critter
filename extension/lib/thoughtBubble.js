// Bulle de pensée au-dessus d'un animal : icône du besoin le plus urgent.
// Acteur séparé du sprite (qui est retourné horizontalement selon le sens de
// marche) et NON réactif : ajouté directement à uiGroup, sans passer par
// addChrome, il n'entre pas dans la région d'input et laisse donc passer
// tous les clics.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { loadImage } from './packLoader.js';

const ICON_FOR_NEED = {
  satiety: 'hungry',
  energy: 'sleepy',
  cleanliness: 'dirty',
  stimulation: 'bored',
  affection: 'heart',
  health: 'sick',
};

const DISPLAY_SIZE = 24; // icônes de 12 px affichées en x2
const FADE_MS = 250;
const GAP_PX = 2;

/**
 * Charge les icônes de bulles une fois pour tous les animaux.
 * @param {string} dir dossier extension/assets/bubbles
 * @returns {Record<string, St.ImageContent>} vide si le chargement échoue
 */
export function loadBubbleIcons(dir) {
  const icons = {};
  try {
    for (const name of new Set(Object.values(ICON_FOR_NEED))) {
      icons[name] = loadImage(GLib.build_filenamev([dir, `${name}.png`]));
    }
  } catch (e) {
    console.warn(`Scamper : icônes de bulles indisponibles (${e.message})`);
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
    this.actor.set_content_scaling_filters(Clutter.ScalingFilter.NEAREST, Clutter.ScalingFilter.NEAREST);
    Main.layoutManager.uiGroup.add_child(this.actor);
  }

  /**
   * @param {string|null} need besoin urgent (clé de Needs) ou null
   * @param {{x:number, y:number, width:number, height:number}} spriteBox
   *   rectangle du sprite à l'écran
   * @param {boolean} spriteVisible faux quand le sprite est masqué
   *   (chrome caché en plein écran)
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
