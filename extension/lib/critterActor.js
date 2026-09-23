// Représentation visuelle d'un Critter : un Clutter.Actor posé dans
// Main.layoutManager.uiGroup, dont le contenu (Clutter.Image) change selon
// l'état renvoyé par core/critter.js. Gère aussi le clic/glisser et le clic
// simple (caresse) directement sur l'acteur.

import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';

const DRAG_THRESHOLD_PX = 4;

export class CritterActor {
  /**
   * @param {import('../../core/critter.js').Critter} critter
   * @param {ReturnType<typeof import('./packLoader.js').loadPack>} pack
   */
  constructor(critter, pack) {
    this.critter = critter;
    this.pack = pack;
    this._animState = null; // état d'animation en cours (peut différer de critter.state pour les réactions)
    this._frameIndex = 0;
    this._frameElapsed = 0;
    this._reaction = null; // {name, elapsed}
    this._dragging = false;
    this._dragStart = null;
    this._motionHandlerId = null;
    this._releaseHandlerId = null;

    this.actor = new Clutter.Actor({
      reactive: true,
      width: pack.spriteSize.width,
      height: pack.spriteSize.height,
      pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
    });

    this.actor.connect('button-press-event', (_actor, event) => this._onButtonPress(event));
    this.actor.connect('destroy', () => this._disconnectStageHandlers());

    this._applyFrame('fall', 0);
    this.syncPosition();
  }

  syncPosition() {
    const size = this.pack.spriteSize;
    this.actor.set_position(this.critter.x - size.width / 2, this.critter.y - size.height);
    this.actor.scale_x = this.critter.facing < 0 ? -1 : 1;
  }

  /**
   * Fait avancer l'animation d'un pas de temps. À appeler juste après
   * `critter.tick()`, avec le snapshot qu'il a renvoyé.
   * @param {number} dt
   * @param {{state: string, event: string|null}} snapshot
   */
  updateAnimation(dt, snapshot) {
    if (snapshot.event && this.pack.reactionFrames[snapshot.event]) {
      this._reaction = { name: snapshot.event, elapsed: 0, index: 0 };
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

  _onButtonPress(event) {
    if (event.get_button() !== Clutter.BUTTON_PRIMARY) return Clutter.EVENT_PROPAGATE;

    const [stageX, stageY] = event.get_coords();
    this._dragStart = { x: stageX, y: stageY, moved: false };

    const stage = this.actor.get_stage();
    this._motionHandlerId = stage.connect('motion-event', (_s, ev) => this._onMotion(ev));
    this._releaseHandlerId = stage.connect('button-release-event', (_s, ev) => this._onRelease(ev));

    return Clutter.EVENT_STOP;
  }

  _onMotion(event) {
    const [x, y] = event.get_coords();
    if (!this._dragging) {
      const dx = x - this._dragStart.x;
      const dy = y - this._dragStart.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return Clutter.EVENT_PROPAGATE;
      this._dragging = true;
      this.critter.startDrag();
    }
    this.critter.dragTo(x, y);
    return Clutter.EVENT_STOP;
  }

  _onRelease(event) {
    if (this._dragging) {
      this.critter.endDrag();
    } else {
      // Pas de déplacement notable entre press et release : c'est une
      // caresse, pas un glisser.
      this.critter.pet();
    }
    this._dragging = false;
    this._dragStart = null;
    this._disconnectStageHandlers();
    return Clutter.EVENT_STOP;
  }

  _disconnectStageHandlers() {
    const stage = this.actor?.get_stage?.();
    if (stage && this._motionHandlerId) stage.disconnect(this._motionHandlerId);
    if (stage && this._releaseHandlerId) stage.disconnect(this._releaseHandlerId);
    this._motionHandlerId = null;
    this._releaseHandlerId = null;
  }

  destroy() {
    this._disconnectStageHandlers();
    this.actor.destroy();
  }
}
