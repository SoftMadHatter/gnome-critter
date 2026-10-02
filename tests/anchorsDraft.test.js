import { test } from 'node:test';
import assert from 'node:assert/strict';

import { draftFromPack, draftToRaw, generatedAnchors, generatedAt, DRAFT_VERSION, codeLayout, effectiveLayout, setLayout, stageHeadWidth, setStageHeadWidth } from '../tools/review/anchorsDraft.js';

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
  assert.deepEqual(generatedAt(gen, 'animation', 'walk', 1), { point: [0.5, 0.25], rotation: 0, width: null, hide: [] });
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
  assert.deepEqual(draftToRaw(pack(bare), draft).animations.walk, { rotation: 180, width: 0.3, points: [0.7, 0.2] }, 'rotation seule : points du repli');
  draft.entries['animation:walk'] = { rotation: 180, width: 0.3, points: [null, [0.2, 0.2], null] };
  assert.deepEqual(draftToRaw(pack(bare), draft).animations.walk, { rotation: 180, width: 0.3, points: [0.2, 0.2] });
});

test('mise en page : seuls les écarts au défaut du code sont gardés', () => {
  const draft = draftFromPack(pack(raw));
  assert.deepEqual(codeLayout('bow'), { slot: 'neck', span: 0.5, shift: 0, at: [0.5, 0.5] });
  assert.deepEqual(codeLayout('crown'), { slot: 'top', span: 0.95, shift: 0, at: [0.5, 1] });
  setLayout(draft, 'bow', 'span', 0.4);
  setLayout(draft, 'bow', 'at', [0.5, 0.3]);
  setLayout(draft, 'crown', 'span', 0.95); // = default: no override
  assert.deepEqual(draftToRaw(pack(raw), draft).layout, { bow: { span: 0.4, at: [0.5, 0.3] } });
  assert.deepEqual(effectiveLayout(draft, 'bow'), { slot: 'neck', span: 0.4, shift: 0, at: [0.5, 0.3] });
  setLayout(draft, 'bow', 'span', 0.5);
  setLayout(draft, 'bow', 'at', [0.5, 0.5]);
  assert.equal(draftToRaw(pack(raw), draft).layout, undefined);
  // The slot changes the default anchor point of the drawn part.
  setLayout(draft, 'bow', 'slot', 'top');
  assert.deepEqual(effectiveLayout(draft, 'bow').at, [0.5, 1], 'sans at explicite, un accessoire du dessus repose par le bas');
  // A saved layout comes back into the draft.
  const again = draftFromPack(pack({ ...raw, layout: { bow: { span: 0.3 }, ghost: { span: 1 } } }));
  assert.deepEqual(again.layout, { bow: { span: 0.3 } });
});

test('largeur de tête par stade et par animation', () => {
  const draft = draftFromPack(pack(raw));
  assert.equal(stageHeadWidth(draft, 'adult'), 0.4);
  assert.equal(stageHeadWidth(draft, 'baby'), 0.5);
  assert.equal(stageHeadWidth(draft, 'senior'), 0.4, 'sans bloc de stade : celle de l\'adulte');
  setStageHeadWidth(draft, 'baby', 0.45);
  setStageHeadWidth(draft, 'young', 0.38);
  const out = draftToRaw(pack(raw), draft);
  assert.equal(out.stages.baby.headWidth, 0.45);
  assert.deepEqual(out.stages.baby.base, raw.stages.baby.base, 'le généré du stade est conservé');
  assert.equal(out.stages.young.headWidth, 0.38);
  // The width of one animation alone is a touch-up whose points stay the generated ones.
  draft.entries['animation:walk'] = { rotation: 0, width: 0.3, points: [null, null, null] };
  assert.deepEqual(draftToRaw(pack(raw), draft).animations.walk, { width: 0.3, points: [[0.5, 0.2], [0.5, 0.25], [0.5, 0.3]] });
});

test('vue de dos : hide généré conservé par la retouche, modifiable', () => {
  const back = { ...raw, base: { ...raw.base, animations: { ...raw.base.animations, climb: { hide: ['face', 'neck'], points: [[0.5, 0.1], [0.5, 0.12]] } } } };
  const climbMeta = { ...meta, animations: { ...meta.animations, climb: { frames: 2 } } };
  const p = { raw: { anchors: back }, meta: climbMeta };
  const draft = draftFromPack(p);
  assert.deepEqual(generatedAt(generatedAnchors(draft), 'animation', 'climb', 0).hide, ['face', 'neck']);
  // Touching one frame up keeps the generated hide.
  draft.entries['animation:climb'] = { rotation: 0, width: null, hide: ['face', 'neck'], points: [[0.4, 0.1], null] };
  assert.deepEqual(draftToRaw(p, draft).animations.climb, { hide: ['face', 'neck'], points: [[0.4, 0.1], [0.5, 0.12]] });
  // Showing the face again is a touch-up even if the points are the generated ones.
  draft.entries['animation:climb'] = { rotation: 0, width: null, hide: [], points: [null, null] };
  assert.deepEqual(draftToRaw(p, draft).animations.climb, [[0.5, 0.1], [0.5, 0.12]]);
});
