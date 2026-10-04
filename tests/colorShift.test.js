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

// The pixel-by-pixel version the cached one replaced: the output must stay identical.
function referenceShift(rgba, { hue = 0, saturation = 1, colorizeGrays = false, tone = 0, graySaturation = 0.35 } = {}) {
  const out = Uint8Array.from(rgba);
  for (let i = 0; i + 3 < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const [h, s, v] = rgbToHsv(out[i], out[i + 1], out[i + 2]);
    if (v < 0.15) continue;
    let nh;
    let ns;
    if (s < 0.15) {
      if (v > 0.9 || !colorizeGrays) continue;
      nh = tone;
      ns = Math.min(1, graySaturation * saturation);
    } else {
      nh = h + hue;
      ns = Math.min(1, s * saturation);
    }
    const [r, g, b] = hsvToRgb(nh, ns, v);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
}

test('shiftPixels : même résultat que le calcul pixel par pixel, quelles que soient les options', () => {
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pixels = new Uint8Array(4 * 3000);
  for (let i = 0; i < pixels.length; i += 4) {
    const kind = random();
    if (kind < 0.2) pixels.set([0, 0, 0, 0], i); // transparent
    else if (kind < 0.35) pixels.set([20, 20, 20, 255], i); // outline
    else if (kind < 0.5) pixels.set([250, 250, 250, 255], i); // white
    else if (kind < 0.7) pixels.set([120 + Math.floor(random() * 20), 125, 130, 255], i); // grays
    else pixels.set([Math.floor(random() * 256), Math.floor(random() * 256), Math.floor(random() * 256), 40 + Math.floor(random() * 216)], i);
  }
  const variants = [
    {},
    { hue: 30 },
    { hue: -35, saturation: 1.3 },
    { hue: 120, saturation: 0.5, colorizeGrays: true, tone: 210, graySaturation: 0.35 },
    { colorizeGrays: true, tone: 0, graySaturation: 1 },
    { hue: 30 }, // back to the first options: the cache restarts cleanly
  ];
  for (const options of variants) {
    assert.deepEqual(shiftPixels(pixels, options), referenceShift(pixels, options), JSON.stringify(options));
  }
});
