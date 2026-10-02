import { test } from 'node:test';
import assert from 'node:assert/strict';

import { draftFromPack, draftToRaw, generatedAnchors, generatedAt, DRAFT_VERSION } from '../tools/review/anchorsDraft.js';

const meta = { animations: { walk: { frames: 3 }, ceiling: { frames: 2 } }, reactions: { petted: { frames: 2 } } };
const raw = {
  head: { x: 0.7, y: 0.2 },
  headWidth: 0.4,
  slots: { top: { dx: 0, dy: 0.3 } },
  base: {
    animations: { walk: [[0.5, 0.2], [0.5, 0.25], [0.5, 0.3]], ceiling: { rotation: 180, points: [[0.5, 0.8], [0.5, 0.78]] } },
    reactions: { petted: [0.4, 0.4] },
  },
  stages: { baby: { headWidth: 0.5, base: { animations: { walk: [0.6, 0.6] } } } },
  animations: { walk: [[0.55, 0.2], false, [0.5, 0.3]] },
};
const pack = (anchors) => ({ raw: { anchors }, meta });

test('brouillon : seules les retouches sont éditables, le généré est conservé', () => {
  const draft = draftFromPack(pack(raw));
  assert.equal(draft.version, DRAFT_VERSION);
  assert.deepEqual(Object.keys(draft.entries), ['animation:walk']);
  assert.deepEqual(draft.entries['animation:walk'].points, [[0.55, 0.2], false, [0.5, 0.3]]);
  assert.deepEqual(Object.keys(draft.extra), ['base', 'stages']);
  assert.equal(draft.headWidth, 0.4);
});

test('généré : point, rotation et stade lus sans les retouches', () => {
  const gen = generatedAnchors(draftFromPack(pack(raw)));
  assert.deepEqual(generatedAt(gen, 'animation', 'walk', 1), { point: [0.5, 0.25], rotation: 0, width: null });
  assert.equal(generatedAt(gen, 'animation', 'ceiling', 0).rotation, 180);
  assert.deepEqual(generatedAt(gen, 'reaction', 'petted', 1).point, [0.4, 0.4]);
  assert.deepEqual(generatedAt(gen, 'animation', 'walk', 2, 'baby').point, [0.6, 0.6]);
  assert.equal(generatedAt(gen, 'animation', 'run', 0), null);
});

test('enregistrement : sections générées conservées, ordre des clés, retouches gardées', () => {
  const out = draftToRaw(pack(raw), draftFromPack(pack(raw)));
  assert.deepEqual(Object.keys(out), ['head', 'headWidth', 'slots', 'base', 'stages', 'animations']);
  assert.deepEqual(out.base, raw.base);
  assert.deepEqual(out.stages, raw.stages);
  assert.deepEqual(out.animations, { walk: [[0.55, 0.2], false, [0.5, 0.3]] });
});

test('enregistrement : une image non retouchée suit le point généré', () => {
  const draft = draftFromPack(pack({ ...raw, animations: undefined }));
  draft.entries['animation:walk'] = { rotation: 0, width: null, points: [null, [0.6, 0.6], null] };
  const out = draftToRaw(pack(raw), draft);
  assert.deepEqual(out.animations.walk, [[0.5, 0.2], [0.6, 0.6], [0.5, 0.3]]);
});

test('enregistrement : une retouche identique au généré est supprimée', () => {
  const draft = draftFromPack(pack({ ...raw, animations: undefined }));
  draft.entries['animation:walk'] = { rotation: 0, width: null, points: [[0.5, 0.2], [0.5, 0.25], null] };
  assert.equal(draftToRaw(pack(raw), draft).animations, undefined);
  // The same points but upside down are a real touch-up.
  draft.entries['animation:ceiling'] = { rotation: 0, width: null, points: [[0.5, 0.8], [0.5, 0.78]] };
  assert.deepEqual(draftToRaw(pack(raw), draft).animations, { ceiling: [[0.5, 0.8], [0.5, 0.78]] });
});

test('enregistrement : sans point généré, une image libre prend sa voisine puis le repli', () => {
  const bare = { head: { x: 0.7, y: 0.2 } };
  const draft = draftFromPack(pack(bare));
  draft.entries['animation:walk'] = { rotation: 0, width: null, points: [null, [0.6, 0.6], null] };
  assert.deepEqual(draftToRaw(pack(bare), draft).animations.walk, [0.6, 0.6]);
  draft.entries['animation:walk'] = { rotation: 180, width: 0.3, points: [null, null, null] };
  assert.equal(draftToRaw(pack(bare), draft).animations, undefined);
  draft.entries['animation:walk'] = { rotation: 180, width: 0.3, points: [null, [0.2, 0.2], null] };
  assert.deepEqual(draftToRaw(pack(bare), draft).animations.walk, { rotation: 180, width: 0.3, points: [0.2, 0.2] });
});
