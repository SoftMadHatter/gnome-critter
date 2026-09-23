// Représentation visuelle d'un Critter : un Clutter.Actor posé dans
// Main.layoutManager.uiGroup, dont le contenu (Clutter.Image) change selon
// l'état renvoyé par core/critter.js. Gère aussi le clic/glisser et le clic
// simple (caresse) directement sur l'acteur.

import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';

import { State } from '../core/critter.js';

const DRAG_BEGIN_THRESHOLD_PX = 4;

export class CritterActor {
  /**
   * @param {import('../../core/critter.js').Critter} critter
   * @param {ReturnType<typeof import('./packLoader.js').loadPack>} pack
   * @param {Gio.Settings} settings
   */
  constructor(critter, pack, settings) {
    this.critter = critter;
    this.pack = pack;
    this._settings = settings;
    this._animState = null; // état d'animation en cours (peut différer de critter.state pour les réactions)
    this._frameIndex = 0;
    this._frameElapsed = 0;
    this._reaction = null; // {name, elapsed}
    this._grab = null;

    this.actor = new Clutter.Actor({
      reactive: true,
      width: pack.spriteSize.width,
      height: pack.spriteSize.height,
      pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
    });

    this._setupGestures();

    this.actor.connect('enter-event', () => {
      this.critter.interact('hover');
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

  syncPosition() {
    const size = this.pack.spriteSize;
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
  updateAnimation(dt, snapshot) {
    // La garde sur this._reaction?.name évite qu'un événement répété (ex.
    // 'noticed' au survol, qui peut se redéclencher souvent si le curseur
    // reste immobile pendant que le critter marche dessous) ne redémarre
    // sans cesse la même réaction depuis le début ; une réaction DIFFÉRENTE
    // interrompt toujours l'actuelle normalement.
    if (
      snapshot.event &&
      this.pack.reactionFrames[snapshot.event] &&
      this._reaction?.name !== snapshot.event
    ) {
      this._reaction = { name: snapshot.event, elapsed: 0, index: 0 };
      this._playReactionSound(snapshot.event);
    }

    if (this._reaction) {
      const timing = this.pack.reactionTiming[this._reaction.name];
      const frames = this.pack.reactionFrames[this._reaction.name];
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

    this._applyFrame(snapshot.state, dt);
    this.syncPosition();
  }

  _playReactionSound(name) {
    const file = this.pack.reactionSounds?.[name];
    if (!file || !this._settings.get_boolean('sounds-enabled')) return;
    global.display.get_sound_player().play_from_file(file, `Critter: ${name}`, null);
  }

  _applyFrame(state, dt) {
    const frames = this.pack.animationFrames[state] ?? this.pack.animationFrames.idle;
    const timing = this.pack.animationTiming[state] ?? { frameDuration: 0.2, loop: true };

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
    if (this._grab) {
      this._grab.dismiss();
      this._grab = null;
    }
    this.actor.destroy();
  }
}
