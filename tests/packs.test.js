import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Locomotion, behaviorOverrides } from '../core/critter.js';
import { needsOverrides } from '../core/needs.js';
import { appearanceOverrides } from '../core/colorShift.js';
import { stagesOverrides } from '../core/life.js';
import {
  buildAchievements, speciesProfile, CATEGORIES, PLAYER_CATEGORY,
} from '../core/achievements.js';
import { anchorsOverrides } from '../core/accessories.js';
import { tricksOverrides } from '../core/tricks.js';
import { namesOverrides } from '../core/names.js';

const PACKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'packs');

/** Pre-existing packs' achievements: their ids are in saves, they must stay obtainable. */
const LEGACY_ACHIEVEMENTS = {
  cat: ['nap-king', 'ball-hunter', 'gourmet', 'cuddle-pro', 'old-timer', 'mouser', 'salad'],
  bird: ['sky-lightning', 'traveler', 'pecker', 'cozy-nest', 'bug-hunter'],
  bug: ['alpinist', 'small-but-strong', 'speedster', 'aphid-hunter'],
  fish: ['big-swimmer', 'laser-dancer', 'glutton', 'krill-feast'],
};
const LOCOMOTIONS = new Set(Object.values(Locomotion));

/** A PNG's width/height, read from the IHDR header (bytes 16 to 24). */
function pngSize(path) {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** States reachable based on the pack's locomotions, plus one `trick_<name>` per declared trick. */
const ALWAYS = ['idle', 'fall', 'drag', 'hibernate', 'remind', 'gift', 'play', 'hunt', 'eat', 'seekFood'];
const BY_LOCOMOTION = {
  ground: ['walk', 'sleep', 'wash', 'follow', 'greet', 'seekFocus', 'seekNap', 'chase', 'flee', 'run', 'brushed', 'relieve'],
  wall: ['climb', 'seekWall'],
  ceiling: ['ceiling'],
  air: ['fly', 'flyFast', 'dive'],
  water: ['swim', 'swimFast'],
};
function requiredStates(meta) {
  const states = [...ALWAYS];
  for (const surface of meta.supportedSurfaces ?? []) states.push(...(BY_LOCOMOTION[surface] ?? []));
  for (const trick of meta.tricks ?? []) states.push(`trick_${trick}`);
  return [...new Set(states)];
}

/** Notable events that have a dedicated reaction. */
const REQUIRED_REACTIONS = [
  'petted', 'tickled', 'annoyed', 'noticed', 'startled', 'greeted', 'purring', 'brushed', 'hatched', 'grew',
  'awakened', 'ate', 'played', 'sick', 'accident', 'relieved', 'trickLearned', 'birthday', 'gift', 'reminded',
];

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
      // Same rule as packLoader.loadFrames: a single row of square frames.
      const { width, height } = pngSize(path);
      const cells = width / height;
      assert.ok(
        height >= (meta.spriteSize?.height ?? 32) && height % (meta.spriteSize?.height ?? 32) === 0,
        `${name} : hauteur ${height} pas multiple de spriteSize ${(meta.spriteSize?.height ?? 32)}`,
      );
      assert.ok(Number.isInteger(cells), `${name} : largeur ${width} pas multiple de la hauteur ${height}`);
      if (meta.smooth) {
        assert.ok(height > (meta.spriteSize?.height ?? 32), `${name} : pack "smooth" mais feuille de ${height}px, pas plus fine que spriteSize`);
      }
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

  test(`pack "${id}" : feuilles de stade complètes et de mêmes dimensions`, () => {
    const { folders } = stagesOverrides(meta.stages);
    for (const [stage, folder] of Object.entries(folders)) {
      for (const def of [...Object.values(meta.animations ?? {}), ...Object.values(meta.reactions ?? {})]) {
        const name = def.file.split('/').pop();
        if (name === 'egg.png') continue;
        const staged = join(packDir, folder, name);
        assert.ok(existsSync(staged), `${stage} : feuille absente ${folder}/${name}`);
        assert.deepEqual(pngSize(staged), pngSize(join(packDir, def.file)), `${stage} : dimensions de ${name}`);
      }
    }
  });

  test(`pack "${id}" : l'œuf du pack a 4 frames`, () => {
    const egg = meta.animations?.egg;
    if (!egg) return;
    assert.equal(egg.frames, 4);
  });

  test(`pack "${id}" : succès valides`, () => {
    const { ignored } = buildAchievements(meta.achievements, speciesProfile(meta));
    assert.deepEqual(ignored, [], `succès ignorés : ${ignored.join(', ')}`);
  });

  test(`pack "${id}" : bibliothèque de succès complète, avec une grosse part de bêtises`, () => {
    const profile = speciesProfile(meta);
    const { critter, player } = buildAchievements(meta.achievements, profile);
    const all = [...critter, ...player];
    assert.ok(all.length >= 150, `${all.length} succès`);
    const trolls = all.filter((def) => def.troll).length;
    assert.ok(trolls / all.length >= 0.4, `${trolls} bêtises sur ${all.length}`);
    for (const category of [...CATEGORIES, PLAYER_CATEGORY]) {
      assert.ok(all.some((def) => def.category === category), `catégorie ${category} vide`);
    }
    assert.ok(all.filter((def) => def.title).length >= 20, 'au moins 20 titres');
    assert.equal(new Set(all.map((def) => def.id)).size, all.length, 'ids uniques');
    assert.ok(all.every((def) => def.requires.can.every((c) => profile.can.has(c))), 'rien d’impossible pour l’espèce');
    for (const legacy of LEGACY_ACHIEVEMENTS[id] ?? []) {
      assert.ok(all.some((def) => def.id === legacy), `identifiant historique « ${legacy} » perdu (sauvegardes)`);
    }
    // Two identical achievements (same condition, same trait and stage) would be a duplicate.
    const keys = all.map((def) => JSON.stringify([def.scope, def.condition, def.requires.trait, def.requires.stage]));
    const twins = keys.filter((key, i) => keys.indexOf(key) !== i);
    assert.deepEqual(twins, [], 'succès en double');
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

  // Coverage: every reachable state has its own sheet, every notable event its own reaction.
  // The demo pack stays deliberately minimal (it shows the fallbacks).
  if (id !== 'critter-demo') {
    test(`pack "${id}" : un état atteignable = sa propre animation`, () => {
      const required = requiredStates(meta);
      const missing = required.filter((state) => !meta.animations?.[state]);
      assert.deepEqual(missing, [], `états sans animation : ${missing.join(', ')}`);

      const owners = new Map();
      const files = [
        ...required.map((state) => [state, meta.animations[state].file]),
        ...REQUIRED_REACTIONS.map((name) => [`réaction ${name}`, meta.reactions?.[name]?.file]),
      ];
      const absentReactions = files.filter(([, file]) => !file).map(([name]) => name);
      assert.deepEqual(absentReactions, [], `réactions absentes : ${absentReactions.join(', ')}`);
      for (const [name, file] of files) {
        if (owners.has(file)) assert.fail(`${name} partage sa feuille ${file} avec ${owners.get(file)}`);
        owners.set(file, name);
      }
    });
  }
}
