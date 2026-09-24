import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Locomotion, behaviorOverrides } from '../core/critter.js';
import { needsOverrides } from '../core/needs.js';
import { appearanceOverrides } from '../core/colorShift.js';
import { stagesOverrides } from '../core/life.js';
import { achievementsOverrides } from '../core/achievements.js';
import { anchorsOverrides } from '../core/accessories.js';
import { tricksOverrides } from '../core/tricks.js';
import { namesOverrides } from '../core/names.js';

const PACKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs');
const LOCOMOTIONS = new Set(Object.values(Locomotion));

/** Largeur/hauteur d'un PNG, lues dans l'en-tête IHDR (octets 16 à 24). */
function pngSize(path) {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const packIds = readdirSync(PACKS_DIR).filter((id) =>
  existsSync(join(PACKS_DIR, id, 'pack.json')),
);

test('au moins un pack est présent', () => {
  assert.ok(packIds.length > 0);
});

for (const id of packIds) {
  const packDir = join(PACKS_DIR, id);
  const meta = JSON.parse(readFileSync(join(packDir, 'pack.json'), 'utf-8'));

  test(`pack "${id}" : locomotions connues`, () => {
    for (const s of meta.supportedSurfaces ?? []) {
      assert.ok(LOCOMOTIONS.has(s), `locomotion inconnue "${s}"`);
    }
  });

  test(`pack "${id}" : spritesheets présents et découpables`, () => {
    const entries = [
      ...Object.entries(meta.animations ?? {}),
      ...Object.entries(meta.reactions ?? {}),
    ];
    for (const [name, def] of entries) {
      const path = join(packDir, def.file);
      assert.ok(existsSync(path) && statSync(path).isFile(), `${name} : ${def.file} introuvable`);
      // Même règle que packLoader.loadFrames : une ligne de frames carrées.
      const { width, height } = pngSize(path);
      const cells = width / height;
      assert.ok(
        height >= (meta.spriteSize?.height ?? 32) && height % (meta.spriteSize?.height ?? 32) === 0,
        `${name} : hauteur ${height} pas multiple de spriteSize ${(meta.spriteSize?.height ?? 32)}`,
      );
      assert.ok(Number.isInteger(cells), `${name} : largeur ${width} pas multiple de la hauteur ${height}`);
      assert.ok(def.frames <= cells, `${name} : ${def.frames} frames demandées, ${cells} disponibles`);
    }
  });

  test(`pack "${id}" : sons référencés présents`, () => {
    for (const [name, def] of Object.entries(meta.reactions ?? {})) {
      if (!def.sound) continue;
      assert.ok(existsSync(join(packDir, def.sound)), `${name} : ${def.sound} introuvable`);
    }
  });

  test(`pack "${id}" : section behavior entièrement reconnue`, () => {
    const { ignored } = behaviorOverrides(meta.behavior);
    assert.deepEqual(ignored, [], `clés ignorées : ${ignored.join(', ')}`);
  });

  test(`pack "${id}" : section needs entièrement reconnue`, () => {
    const { ignored } = needsOverrides(meta.needs);
    assert.deepEqual(ignored, [], `clés ignorées : ${ignored.join(', ')}`);
  });

  test(`pack "${id}" : sections appearance et stages entièrement reconnues`, () => {
    assert.deepEqual(appearanceOverrides(meta.appearance).ignored, []);
    assert.deepEqual(stagesOverrides(meta.stages).ignored, []);
  });

  test(`pack "${id}" : succès valides`, () => {
    const { ignored } = achievementsOverrides(meta.achievements);
    assert.deepEqual(ignored, [], `succès ignorés : ${ignored.join(', ')}`);
  });

  test(`pack "${id}" : ancrages valides`, () => {
    assert.deepEqual(anchorsOverrides(meta.anchors).ignored, []);
  });

  test(`pack "${id}" : tours connus`, () => {
    assert.deepEqual(tricksOverrides(meta.tricks).ignored, []);
  });

  test(`pack "${id}" : noms valides`, () => {
    const { list, ignored } = namesOverrides(meta.names);
    assert.deepEqual(ignored, [], `noms ignorés : ${ignored.join(', ')}`);
    assert.ok(list.length >= 8, 'assez de noms pour plusieurs animaux');
  });
}
