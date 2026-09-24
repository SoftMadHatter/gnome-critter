import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { spriteCatalog, spriteName, spriteSize, SPRITE_SCALE } from '../core/itemLooks.js';
import {
  createItem, consume, fillBowl, isBowlFood, FOODS, TOYS, PLANTS, GIFTS, BED_MODELS, BOWL_MODELS,
  BOWL_MOLD_SECONDS, LITTER_CAPACITY, MESS_OLD_SECONDS, PLANT_MAX_PORTIONS,
} from '../core/items.js';
import { PREY } from '../core/prey.js';
import { ACCESSORIES } from '../core/accessories.js';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'assets');

function pngSize(path) {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test("chaque sprite du catalogue existe, au double de sa taille d'affichage", () => {
  for (const [name, size] of Object.entries(spriteCatalog())) {
    const path = join(ASSETS, 'items', `${name}.png`);
    assert.ok(existsSync(path), `${name}.png introuvable (lancer scripts/gen_ui_sprites.py)`);
    assert.deepEqual(pngSize(path), { width: size.width * SPRITE_SCALE, height: size.height * SPRITE_SCALE }, name);
  }
});

test('aucun PNG orphelin dans assets/items', () => {
  const catalog = spriteCatalog();
  const orphans = readdirSync(join(ASSETS, 'items')).filter((f) => f.endsWith('.png') && !catalog[f.slice(0, -4)]);
  assert.deepEqual(orphans, []);
});

test('tout état atteignable a son sprite, à la taille de son objet', () => {
  const catalog = spriteCatalog();
  const check = (item, frame = 0) => {
    const name = spriteName(item, frame);
    assert.ok(catalog[name], `${item.type}/${item.kind}/${item.model} -> « ${name} » absent du catalogue`);
    assert.deepEqual(catalog[name], spriteSize(item), name);
  };
  for (const kind of Object.keys(FOODS)) {
    const food = createItem('food', kind, 0, 0);
    while (!food.consumed) {
      check(food);
      consume(food);
    }
  }
  for (const model of BOWL_MODELS) {
    const bowl = createItem('bowl', null, 0, 0, model);
    check(bowl);
    for (const kind of Object.keys(FOODS).filter(isBowlFood)) {
      fillBowl(bowl, kind);
      while (bowl.portions > 0) {
        check(bowl);
        bowl.fillAge = BOWL_MOLD_SECONDS;
        check(bowl);
        bowl.fillAge = 0;
        consume(bowl);
      }
      check(bowl);
    }
  }
  for (const model of BED_MODELS) check(createItem('bed', null, 0, 0, model));
  for (const [kind, toy] of Object.entries(TOYS)) {
    for (const variant of toy.variants) check(createItem('toy', kind, 0, 0, variant));
  }
  for (const kind of Object.keys(PLANTS)) {
    const plant = createItem('plant', kind, 0, 0);
    for (let n = PLANT_MAX_PORTIONS; n >= 0; n--) {
      plant.portions = n;
      check(plant);
    }
  }
  for (const kind of Object.keys(PREY)) for (const frame of [0, 1]) check(createItem('prey', kind, 0, 0), frame);
  for (const kind of Object.keys(GIFTS)) check(createItem('gift', kind, 0, 0));
  const litter = createItem('litter', null, 0, 0);
  check(litter);
  litter.uses = LITTER_CAPACITY;
  check(litter);
  const mess = createItem('mess', null, 0, 0);
  check(mess);
  mess.age = MESS_OLD_SECONDS;
  check(mess);
});

test('accessoires : un PNG par accessoire, au double de 16 px', () => {
  for (const id of Object.keys(ACCESSORIES)) {
    const path = join(ASSETS, 'accessories', `${id}.png`);
    assert.ok(existsSync(path), `${id}.png introuvable`);
    assert.deepEqual(pngSize(path), { width: 32, height: 32 }, id);
  }
});
