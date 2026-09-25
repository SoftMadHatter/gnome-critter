// Représentation visuelle d'un Critter : un Clutter.Actor posé dans
// Main.layoutManager.uiGroup, dont le contenu (Clutter.Image) change selon
// l'état renvoyé par core/critter.js. Gère aussi le clic/glisser et le clic
// simple (caresse) directement sur l'acteur.

import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';

import { State } from '../core/critter.js';
import { ThoughtBubble } from './thoughtBubble.js';
import { CritterMenu } from './critterMenu.js';
import { AccessoryActor } from './accessoryActor.js';
import { NameTag } from './nameTag.js';

const DRAG_BEGIN_THRESHOLD_PX = 4;
const EGG_FRAME_SECONDS = 0.6;

// Animation de repli d'un état que le pack ne décrit pas, avant le repli
// final sur "idle" : une allure rapide ressemble à son allure normale.
const ANIMATION_FALLBACKS = {
  run: ['walk'],
  swimFast: ['swim'],
  flyFast: ['fly'],
  dive: ['fly'],
  seekFood: ['walk'],
  eat: ['idle'],
  play: ['run', 'walk'],
  brushed: ['wash', 'idle'],
  hibernate: ['sleep', 'idle'],
  remind: ['follow', 'walk'],
  hunt: ['run', 'walk'],
  relieve: ['trick_sit', 'idle'],
  gift: ['follow', 'walk'],
  trick_sit: ['idle'],
  trick_roll: ['play', 'run', 'walk'],
  trick_flip: ['play', 'swim', 'fly', 'walk'],
};

export class CritterActor {
  /**
   * @param {import('../../core/critter.js').Critter} critter
   * @param {ReturnType<typeof import('./packLoader.js').loadPack>} pack
   * @param {Gio.Settings} settings
   * @param {Record<string, St.ImageContent>} [bubbleIcons] icônes des bulles de pensée (aucune bulle si vide)
   * @param {object} [menuOwner] actions du menu contextuel (voir CritterMenu) ; pas de menu si absent
   * @param {{framesFor: Function}|null} [eggSheet] feuille de l'œuf (générique, avec variantes de couleur)
   */
  constructor(critter, pack, settings, bubbleIcons = {}, menuOwner = null, eggSheet = null) {
    this.critter = critter;
    this.pack = pack;
    this._settings = settings;
    this._animState = null; // état d'animation en cours (peut différer de critter.state pour les réactions)
    this._frameIndex = 0;
    this._frameElapsed = 0;
    this._reaction = null; // {name, elapsed}
    this._grab = null;
    this._eggSheet = eggSheet;
    this._appearanceKey = null;
    this._frames = pack.framesFor(critter.life.appearance, critter.life.stage);
    this._eggFrames = eggSheet?.framesFor(critter.life.appearance) ?? null;
    this._scale = critter.life.scale;
    this._stage = critter.life.stage;
    this._night = false;
    this._nightEffect = null;
    this._accessory = null;
    this._nameTag = new NameTag();
    this._bubble = Object.keys(bubbleIcons).length > 0 ? new ThoughtBubble(bubbleIcons) : null;
    this._menu = menuOwner ? new CritterMenu(critter, pack, menuOwner) : null;
    this._titleOf = menuOwner?.titleOf ?? (() => null);

    this.actor = new Clutter.Actor({
      reactive: true,
      width: pack.spriteSize.width,
      height: pack.spriteSize.height,
      pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
    });

    // Pack au dessin fin (feuilles plus grandes que spriteSize) : réduction lissée ;
    // pixel-art pur : au plus proche voisin, sinon flou en HiDPI et au retournement.
    this.actor.set_content_scaling_filters(
      pack.smooth ? Clutter.ScalingFilter.TRILINEAR : Clutter.ScalingFilter.NEAREST,
      pack.smooth ? Clutter.ScalingFilter.LINEAR : Clutter.ScalingFilter.NEAREST,
    );

    this._setupGestures();

    this.actor.connect('enter-event', () => {
      this.critter.interact('hover');
      this._nameTag.setHover(true);
      return Clutter.EVENT_PROPAGATE;
    });
    this.actor.connect('leave-event', () => {
      this._nameTag.setHover(false);
      return Clutter.EVENT_PROPAGATE;
    });

    this._applyFrame('fall', 0);
    this.syncPosition();
  }

  /**
   * Clic/double-clic/clic droit/glisser via le framework de gestes Clutter
   * (mutter-18, GNOME 50) : event.get_click_count() n'existe plus sur
   * Clutter.Event, et plus aucun widget du Shell ne détecte ça via des
   * signaux bruts (button-press-event/motion-event/button-release-event) --
   * y compris le glisser, cf. le slider de ui/popupMenu.js qui utilise
   * Clutter.PanGesture avec le même global.stage.grab() que ci-dessous.
   */
  _setupGestures() {
    const clickGesture = new Clutter.ClickGesture();
    clickGesture.connect('recognize', () => this.critter.pet());
    this.actor.add_action(clickGesture);

    const doubleClickGesture = new Clutter.ClickGesture({ n_clicks_required: 2 });
    doubleClickGesture.connect('recognize', () => this.critter.interact('doubleClick'));
    this.actor.add_action(doubleClickGesture);

    // recognize_on_press : action immédiate, pas de glisser possible au
    // clic droit (même pattern que ui/appDisplay.js pour le menu contextuel
    // des icônes).
    const rightClickGesture = new Clutter.ClickGesture({
      required_button: Clutter.BUTTON_SECONDARY,
      recognize_on_press: true,
    });
    rightClickGesture.connect('recognize', () => this.critter.interact('rightClick'));
    this.actor.add_action(rightClickGesture);

    // Clic milieu : menu contextuel (nourrir, gamelle, lit). Le clic droit
    // reste « agacé ».
    if (this._menu) {
      const middleClickGesture = new Clutter.ClickGesture({
        required_button: Clutter.BUTTON_MIDDLE,
        recognize_on_press: true,
      });
      middleClickGesture.connect('recognize', () => {
        if (this._stage !== 'egg') this._menu.open(this._displaySize().height);
      });
      this.actor.add_action(middleClickGesture);
    }

    const panGesture = new Clutter.PanGesture();
    panGesture.set_begin_threshold(DRAG_BEGIN_THRESHOLD_PX);
    panGesture.connect('recognize', () => {
      // Capture tous les événements pointeur pendant le glisser, même
      // quand le curseur passe au-dessus d'une vraie fenêtre : sans grab,
      // Mutter livre sinon les mises à jour directement au client Wayland
      // de la fenêtre survolée (le drag "se figeait" dès que la souris
      // quittait le sprite).
      this._grab = global.stage.grab(this.actor);
      this.critter.startDrag();
    });
    panGesture.connect('pan-update', () => {
      const coords = panGesture.get_centroid_abs();
      this.critter.dragTo(coords.x, coords.y);
    });
    panGesture.connect('end', () => {
      if (this._grab) {
        this._grab.dismiss();
        this._grab = null;
      }
      this.critter.endDrag();
    });
    this.actor.add_action(panGesture);
  }

  /** Active l'affichage des accessoires (images et point d'ancrage de la tête). */
  attachAccessories(images, anchors) {
    if (Object.keys(images).length > 0) this._accessory = new AccessoryActor(images, anchors);
  }

  _updateAccessory(snapshot) {
    if (!this._accessory) return;
    const size = this._displaySize();
    const id = snapshot.stage === 'egg' ? null : (snapshot.accessory ?? (snapshot.birthdayToday ? 'partyhat' : null));
    this._accessory.update(
      id,
      {
        x: this.critter.x - size.width / 2,
        y: snapshot.state === State.CEILING ? this.critter.y : this.critter.y - size.height,
        width: size.width,
        height: size.height,
      },
      snapshot.facing ?? this.critter.facing,
      this.actor.visible,
    );
  }

  /** Ambiance de nuit : léger assombrissement du sprite. */
  setNight(night) {
    if (night === this._night) return;
    this._night = night;
    if (!this._nightEffect) {
      this._nightEffect = new Clutter.BrightnessContrastEffect();
      this._nightEffect.set_brightness(-0.25);
      this.actor.add_effect_with_name('night', this._nightEffect);
    }
    this._nightEffect.set_enabled(night);
  }

  /** Taille affichée : la taille du pack, mise à l'échelle du stade (bébé plus petit). */
  _displaySize() {
    const size = this.pack.spriteSize;
    return { width: Math.round(size.width * this._scale), height: Math.round(size.height * this._scale) };
  }

  syncPosition() {
    const size = this._displaySize();
    if (this.actor.width !== size.width || this.actor.height !== size.height) {
      this.actor.set_size(size.width, size.height);
    }
    // critter.y est le point d'accroche : les pieds pour tout état posé sur
    // le dessus d'une surface, mais le haut du sprite pour CEILING (accroché
    // sous un surplomb, donc suspendu SOUS ce point plutôt que dessus).
    const y = this.critter.state === State.CEILING ? this.critter.y : this.critter.y - size.height;
    this.actor.set_position(this.critter.x - size.width / 2, y);
    this.actor.scale_x = this.critter.facing < 0 ? -1 : 1;
  }

  /**
   * Fait avancer l'animation d'un pas de temps. À appeler juste après
   * `critter.tick()`, avec le snapshot qu'il a renvoyé.
   * @param {number} dt
   * @param {{state: string, event: string|null}} snapshot
   */
  /** Nouvelle apparence (évolution) : bascule sur le jeu de frames correspondant. */
  _refreshAppearance(snapshot) {
    const { hue, tone, saturation } = snapshot.appearance;
    const key = `${snapshot.stage}|${Math.round(hue)}|${Math.round(tone)}|${saturation}`;
    if (key === this._appearanceKey) return;
    this._appearanceKey = key;
    this._frames = this.pack.framesFor(snapshot.appearance, snapshot.stage);
    this._eggFrames = this._eggSheet?.framesFor(snapshot.appearance) ?? null;
  }

  updateAnimation(dt, snapshot) {
    this._scale = snapshot.scale ?? 1;
    this._refreshAppearance(snapshot);
    this._updateSprite(dt, snapshot);
    this._updateBubble(snapshot);
    this._updateAccessory(snapshot);
    this._updateNameTag(dt, snapshot);
  }

  _updateNameTag(dt, snapshot) {
    const size = this._displaySize();
    this._nameTag.update(
      dt,
      snapshot.name,
      this._titleOf(this.critter),
      {
        x: this.critter.x - size.width / 2,
        y: snapshot.state === State.CEILING ? this.critter.y : this.critter.y - size.height,
        width: size.width,
        height: size.height,
      },
      this.actor.visible && snapshot.stage !== 'egg',
    );
  }

  _updateBubble(snapshot) {
    if (!this._bubble) return;
    const size = this._displaySize();
    const need = snapshot.state === State.DRAG ? null : (snapshot.bubble ?? snapshot.urgentNeed);
    this._bubble.update(
      need,
      {
        x: this.critter.x - size.width / 2,
        y: snapshot.state === State.CEILING ? this.critter.y : this.critter.y - size.height,
        width: size.width,
        height: size.height,
      },
      this.actor.visible,
    );
  }

  _updateSprite(dt, snapshot) {
    this._stage = snapshot.stage;
    // Tant qu'il n'a pas éclos, rien d'autre que l'œuf : même en chute ou
    // pendant un glisser, et sans aucune réaction de l'espèce.
    if (snapshot.stage === 'egg') {
      this._reaction = null;
      const packEgg = this._frames.animationFrames.egg;
      if (packEgg?.length >= 4) this._applyEgg(dt, snapshot, packEgg);
      else if (this._eggFrames) this._applyEgg(dt, snapshot, this._eggFrames);
      else this._applyFrame(snapshot.state, dt);
      this.syncPosition();
      return;
    }

    // La garde sur this._reaction?.name évite qu'un événement répété (ex.
    // 'noticed' au survol, qui peut se redéclencher souvent si le curseur
    // reste immobile pendant que le critter marche dessous) ne redémarre
    // sans cesse la même réaction depuis le début ; une réaction DIFFÉRENTE
    // interrompt toujours l'actuelle normalement.
    if (
      snapshot.event &&
      this._frames.reactionFrames[snapshot.event] &&
      this._reaction?.name !== snapshot.event
    ) {
      this._reaction = { name: snapshot.event, elapsed: 0, index: 0 };
      this._playReactionSound(snapshot.event);
    }

    if (this._reaction) {
      const timing = this.pack.reactionTiming[this._reaction.name];
      const frames = this._frames.reactionFrames[this._reaction.name];
      this._reaction.elapsed += dt;
      if (this._reaction.elapsed >= timing.frameDuration) {
        this._reaction.elapsed = 0;
        this._reaction.index += 1;
        if (this._reaction.index >= frames.length) {
          this._reaction = null;
        }
      }
      if (this._reaction) {
        this.actor.content = frames[this._reaction.index];
        this.syncPosition();
        return;
      }
    }

    this._applyFrame(snapshot.state === State.TRICK ? `trick_${snapshot.trick}` : snapshot.state, dt);
    this.syncPosition();
  }

  _playReactionSound(name) {
    const file = this.pack.reactionSounds?.[name];
    if (!file || !this._settings.get_boolean('sounds-enabled')) return;
    global.display.get_sound_player().play_from_file(file, `Critter: ${name}`, null);
  }

  /** Œuf (celui de l'espèce ou le générique) : se balance, puis se fissure à l'approche de l'éclosion. */
  _applyEgg(dt, snapshot, frames) {
    if (this._animState !== State.EGG) {
      this._animState = State.EGG;
      this._frameIndex = 0;
      this._frameElapsed = 0;
    }
    this._frameElapsed += dt;
    if (this._frameElapsed >= EGG_FRAME_SECONDS) {
      this._frameElapsed = 0;
      this._frameIndex = (this._frameIndex + 1) % 4;
    }
    const cracking = snapshot.hatchProgress >= 0.9;
    const sequence = cracking ? [3, 1, 3, 2] : [0, 1, 0, 2];
    this.actor.content = frames[sequence[this._frameIndex]];
  }

  _applyFrame(state, dt) {
    const key = [state, ...(ANIMATION_FALLBACKS[state] ?? []), 'idle'].find((k) => this._frames.animationFrames[k]);
    const frames = this._frames.animationFrames[key] ?? this._frames.animationFrames.idle;
    const timing = this.pack.animationTiming[key] ?? { frameDuration: 0.2, loop: true };

    if (state !== this._animState) {
      this._animState = state;
      this._frameIndex = 0;
      this._frameElapsed = 0;
    } else {
      this._frameElapsed += dt;
      if (this._frameElapsed >= timing.frameDuration) {
        this._frameElapsed = 0;
        this._frameIndex += 1;
        if (this._frameIndex >= frames.length) {
          this._frameIndex = timing.loop ? 0 : frames.length - 1;
        }
      }
    }

    this.actor.content = frames[Math.min(this._frameIndex, frames.length - 1)];
  }

  destroy() {
    this._bubble?.destroy();
    this._bubble = null;
    this._menu?.destroy();
    this._menu = null;
    this._accessory?.destroy();
    this._accessory = null;
    this._nameTag.destroy();
    if (this._grab) {
      this._grab.dismiss();
      this._grab = null;
    }
    this.actor.destroy();
  }
}
