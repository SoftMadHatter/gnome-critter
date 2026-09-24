import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rgbToHsv, hsvToRgb, shiftPixels, appearanceOverrides } from '../core/colorShift.js';

const px = (r, g, b, a = 255) => [r, g, b, a];

test('conversion RGB <-> HSV aller-retour', () => {
  for (const [r, g, b] of [[255, 0, 0], [12, 200, 90], [240, 140, 40], [0, 0, 255]]) {
    const [h, s, v] = rgbToHsv(r, g, b);
    assert.deepEqual(hsvToRgb(h, s, v), [r, g, b]);
  }
});

test('un rouge décalé de 120 degrés devient vert', () => {
  const out = shiftPixels(px(255, 0, 0), { hue: 120 });
  assert.deepEqual([...out], [0, 255, 0, 255]);
});

test("l'alpha est conservé et les pixels transparents ne bougent pas", () => {
  const out = shiftPixels([...px(255, 0, 0, 128), ...px(10, 20, 30, 0)], { hue: 120 });
  assert.equal(out[3], 128);
  assert.deepEqual([...out.slice(4)], [10, 20, 30, 0]);
});

test('noirs, blancs et gris très sombres restent intacts', () => {
  const src = [...px(28, 24, 32), ...px(255, 255, 255), ...px(0, 0, 0), ...px(30, 30, 30)];
  assert.deepEqual([...shiftPixels(src, { hue: 90, colorizeGrays: true })], src);
});

test('les gris ne bougent pas par simple rotation, mais se colorisent à la demande', () => {
  const gray = px(150, 152, 165);
  assert.deepEqual([...shiftPixels(gray, { hue: 90 })], gray);

  const tinted = shiftPixels(gray, { hue: 90, colorizeGrays: true, tone: 0 });
  assert.notDeepEqual([...tinted], gray);
  assert.ok(tinted[0] > tinted[1] && tinted[0] > tinted[2], 'teinte rouge demandée');
});

test('le facteur de saturation ternit ou avive', () => {
  const dull = shiftPixels(px(230, 120, 60), { saturation: 0.5 });
  const vivid = shiftPixels(px(230, 120, 60), { saturation: 1.3 });
  const spread = (p) => Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
  assert.ok(spread(dull) < spread(px(230, 120, 60)));
  assert.ok(spread(vivid) > spread(px(230, 120, 60)));
});

test("la source n'est pas modifiée", () => {
  const src = Uint8Array.from(px(255, 0, 0));
  shiftPixels(src, { hue: 120 });
  assert.deepEqual([...src], [255, 0, 0, 255]);
});

test('appearanceOverrides valide la section du pack', () => {
  assert.deepEqual(appearanceOverrides(undefined).config.hueRange, [-35, 35]);
  const { config, ignored } = appearanceOverrides({ hueRange: [-10, 60], colorizeGrays: true, graySaturation: 9, x: 1, enabled: false });
  assert.deepEqual(config.hueRange, [-10, 60]);
  assert.equal(config.colorizeGrays, true);
  assert.equal(config.enabled, false);
  assert.equal(config.graySaturation, 0.35);
  assert.deepEqual(ignored.sort(), ['graySaturation', 'x']);
});
