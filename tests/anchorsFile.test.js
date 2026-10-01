import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { formatAnchors, replaceAnchors, anchorsProblems, saveAnchors } from '../tools/review/anchorsFile.mjs';

const PACK = `{
  "id": "x",
  "animations": { "walk": { "file": "w.png", "frames": 3 }, "sleep": { "file": "s.png", "frames": 2 } },
  "reactions": { "petted": { "file": "p.png", "frames": 2 } },
  "anchors": {
    "head": { "x": 0.5, "y": 0.5 }
  },
  "tricks": ["sit"]
}
`;

test('formatAnchors : une ligne par animation, format compact', () => {
  const text = formatAnchors({
    head: { x: 0.5, y: 0.1 },
    animations: { walk: [[0.1, 0.2], [0.2, 0.3], false], ceiling: { rotation: 180, points: [0.8, 0.8] } },
  });
  assert.equal(text, `  "anchors": {
    "head": { "x": 0.5, "y": 0.1 },
    "animations": {
      "walk": [[0.1, 0.2], [0.2, 0.3], false],
      "ceiling": { "rotation": 180, "points": [0.8, 0.8] }
    }
  }`);
});

test('replaceAnchors : seul le bloc change, ajout si absent', () => {
  const next = replaceAnchors(PACK, { head: { x: 0.1, y: 0.2 } });
  assert.deepEqual(JSON.parse(next).anchors, { head: { x: 0.1, y: 0.2 } });
  assert.equal(next.replace(/ {2}"anchors": \{[^}]*\{[^}]*\}[^}]*\}/, ''), PACK.replace(/ {2}"anchors": \{[^}]*\{[^}]*\}[^}]*\}/, ''));
  const bare = '{\n  "id": "x"\n}\n';
  assert.deepEqual(JSON.parse(replaceAnchors(bare, { head: { x: 0.1, y: 0.2 } })), { id: 'x', anchors: { head: { x: 0.1, y: 0.2 } } });
});

test('anchorsProblems : entrées invalides, inconnues, mauvais nombre de points', () => {
  const meta = JSON.parse(PACK);
  assert.deepEqual(anchorsProblems({ animations: { walk: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]], sleep: [0.5, 0.5] }, reactions: { petted: [[0.1, 0.1], false] } }, meta), []);
  assert.deepEqual(anchorsProblems({ animations: { walk: [[0.1, 0.1]], fly: [0.5, 0.5], sleep: [[0, 0], [1, 1], [0, 1]] } }, meta), [
    'unknown animations.fly',
    'animations.sleep: 3 points for 2 frames',
  ]);
  assert.deepEqual(anchorsProblems({ head: { x: 3, y: 0 } }, meta), ['invalid: head']);
  assert.deepEqual(anchorsProblems([], meta), ['anchors must be an object']);
});

test('saveAnchors : écrit, refuse un pack inconnu ou des données invalides sans toucher au fichier', async () => {
  const root = await mkdtemp(join(tmpdir(), 'anchors-'));
  await mkdir(join(root, 'packs', 'x'), { recursive: true });
  const file = join(root, 'packs', 'x', 'pack.json');
  await writeFile(file, PACK);
  assert.deepEqual(await saveAnchors(root, 'x', { head: { x: 0.1, y: 0.2 }, animations: { sleep: [0.5, 0.5] } }), []);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).anchors.animations, { sleep: [0.5, 0.5] });
  const saved = await readFile(file, 'utf8');
  assert.deepEqual(await saveAnchors(root, 'x', { animations: { fly: [0.5, 0.5] } }), ['unknown animations.fly']);
  assert.equal(await readFile(file, 'utf8'), saved);
  assert.deepEqual(await saveAnchors(root, 'nope', {}), ['unknown pack']);
  assert.deepEqual(await saveAnchors(root, '../x', {}), ['invalid pack']);
});
