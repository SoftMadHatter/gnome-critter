// Onglet « Objets » : tous les sprites d'objets du catalogue (core/itemLooks.js),
// groupés, à la taille d'affichage (lissée, comme l'extension) et au double.

import { h, select, fill } from '../dom.js';
import { spriteCatalog } from '../../../core/itemLooks.js';
import { FOODS, PLANTS, GIFTS, BED_MODELS, BOWL_MODELS, TOYS, isBowlFood } from '../../../core/items.js';
import { PREY } from '../../../core/prey.js';
import {
  FOOD_LABELS, TOY_LABELS, BED_LABELS, BOWL_LABELS, PREY_LABELS, PLANT_LABELS,
} from '../../../extension/lib/itemLabels.js';

const BACKGROUNDS = [['checker', 'Damier'], ['light', 'Clair'], ['dark', 'Sombre']];
const BG_STYLE = { checker: '', light: 'background:#eef0f4', dark: 'background:#2a2f38' };

function sprite(name, size, background, caption) {
  const url = `/extension/assets/items/${name}.png`;
  const style = BG_STYLE[background];
  return h(
    'div',
    { class: `card ${background === 'checker' ? 'checker' : ''}`, style: style || undefined, title: name },
    h('img', { src: url, width: size.width, height: size.height, alt: name, style: { imageRendering: 'auto', margin: '4px' } }),
    h('img', { src: url, width: size.width * 2, height: size.height * 2, alt: name, style: { imageRendering: 'auto', margin: '4px' } }),
    h('div', { class: 'label' }, caption, h('small', { class: 'muted', style: { display: 'block' } }, name)),
  );
}

export function render(root, { state, setState }) {
  const background = BG_STYLE[state.bg] !== undefined ? state.bg : 'checker';
  const catalog = spriteCatalog();
  const card = (name, caption) => (catalog[name] ? sprite(name, catalog[name], background, caption) : null);
  const bites = (n) => `${n} bouchée${n > 1 ? 's' : ''}`;
  const levels = ['vide', 'fond', 'moitié', 'pleine'];

  const groups = [
    ['Aliments (par bouchées restantes)', Object.entries(FOODS).flatMap(([kind, food]) =>
      Array.from({ length: food.bites }, (_, i) => card(`food_${kind}_${food.bites - i}`, `${FOOD_LABELS[kind] ?? kind} — ${bites(food.bites - i)}`)))],
    ...BOWL_MODELS.map((model) => [`Gamelle ${BOWL_LABELS[model] ?? model} (vide, aliments par niveau, moisie)`, [
      card(`bowl_${model}_empty`, 'vide'),
      ...Object.keys(FOODS).filter(isBowlFood).flatMap((kind) =>
        [1, 2, 3].map((level) => card(`bowl_${model}_${kind}_${level}`, `${FOOD_LABELS[kind] ?? kind} — ${levels[level]}`))),
      ...[1, 2, 3].map((level) => card(`bowl_${model}_moldy_${level}`, `moisie — ${levels[level]}`)),
    ]]),
    ['Lits', BED_MODELS.map((model) => card(`bed_${model}`, BED_LABELS[model] ?? model))],
    ['Jouets (variantes)', Object.entries(TOYS).flatMap(([kind, toy]) =>
      toy.variants.map((variant) => card(`toy_${kind}_${variant}`, `${TOY_LABELS[kind] ?? kind} — ${variant}`)))],
    ['Plantes (portions restantes)', Object.keys(PLANTS).flatMap((kind) =>
      [3, 2, 1, 0].map((n) => card(`${kind}_${n}`, `${PLANT_LABELS[kind] ?? kind} — ${n}`)))],
    ['Proies (deux frames de marche)', Object.keys(PREY).flatMap((kind) =>
      [0, 1].map((frame) => card(`${kind}_${frame}`, `${PREY_LABELS[kind] ?? kind} — frame ${frame}`)))],
    ['Cadeaux, litière, traces, laser', [
      ...Object.entries(GIFTS).map(([kind, gift]) => card(kind, `${kind} (${gift.coins} pièces)`)),
      card('litter_clean', 'litière propre'),
      card('litter_dirty', 'litière sale'),
      card('mess', 'trace'),
      card('mess_old', 'vieille trace'),
      card('laser', 'point laser'),
    ]],
  ];

  fill(
    root,
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Objets'),
      h(
        'p',
        { class: 'muted' },
        `${Object.keys(catalog).length} sprites dans le catalogue. Chaque objet est montré à sa taille d'affichage `,
        '(réduction lissée, comme dans l’extension) puis à sa taille réelle (le double). ',
        'Les sprites se régénèrent avec scripts/gen_ui_sprites.py.',
      ),
      h('div', { class: 'controls' }, select(BACKGROUNDS, background, (v) => setState({ bg: v }))),
    ),
    groups.map(([title, cards]) => h('section', { class: 'panel' }, h('h2', {}, title), h('div', { class: 'grid' }, cards))),
  );
}
