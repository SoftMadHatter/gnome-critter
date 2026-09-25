// Onglet « Créatures » : fiche du pack, lecteur d'animation (stade, vitesse,
// taille, lissage, retournement, couleurs, accessoire) et planche de toutes
// les animations d'un stade.

import { h, select, table, field, debounce } from '../dom.js';
import { SpritePlayer, stageScales } from '../sprites.js';
import { STAGES, stagesOverrides } from '../../../core/life.js';
import { appearanceOverrides } from '../../../core/colorShift.js';
import { ACCESSORIES, anchorsOverrides, accessoryLabel } from '../../../core/accessories.js';
import { needsOverrides } from '../../../core/needs.js';
import { behaviorOverrides } from '../../../core/critter.js';
import { tricksOverrides, trickLabel } from '../../../core/tricks.js';
import { namesOverrides } from '../../../core/names.js';
import { FOOD_LABELS, foodLabel, plantLabel, preyLabel, stageLabel } from '../../../core/labels.js';

const list = (values) => (values.length > 0 ? values.join(', ') : '—');

function packSheet(pack) {
  const meta = pack.meta;
  const needs = needsOverrides(meta.needs);
  const stages = stagesOverrides(meta.stages);
  const scales = stageScales(meta);
  const appearance = appearanceOverrides(meta.appearance).config;
  const behavior = behaviorOverrides(meta.behavior).config;
  const food = (kind) => (FOOD_LABELS[kind] ? foodLabel(kind) : plantLabel(kind));
  const rows = [
    ['Identifiant', pack.id],
    ['Nom affiché', meta.displayName ?? '—'],
    ['Surfaces', list(meta.supportedSurfaces ?? ['ground'])],
    ['Taille d’affichage', `${meta.spriteSize?.width ?? 32} × ${meta.spriteSize?.height ?? 32} px${meta.smooth ? ' (dessin fin, lissé)' : ' (pixel-art)'}`],
    ['Vitesses', list(Object.entries(meta.speeds ?? {}).map(([k, v]) => `${k} ${v}`))],
    ['Comportement', list(Object.entries(behavior).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join('–') : v}`))],
    ['Baisse des besoins (par heure)', list(Object.entries(needs.rates).map(([k, v]) => `${k} ${v}`))],
    ['Régime', list(Object.entries(needs.diet).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${food(k)} ${v}`))],
    ['Proies', list(Object.entries(needs.prey).map(([k, v]) => `${preyLabel(k)} ${v}`))],
    ['Tours', list(tricksOverrides(meta.tricks).list.map((t) => trickLabel(t)))],
    ['Prénoms', list(namesOverrides(meta.names).list)],
    ['Stades', list(STAGES.map((s) => `${stageLabel(s)} ×${scales[s]}${stages.folders[s] ? ` (${stages.folders[s]})` : ''}`))],
    ['Apparence', appearance.enabled
      ? `teinte ${appearance.hueRange.join(' à ')}°${appearance.colorizeGrays ? `, gris colorisés (saturation ${appearance.graySaturation})` : ''}`
      : 'désactivée'],
    ['Ancrage de la tête', `x ${anchorsOverrides(meta.anchors).anchors.head.x}, y ${anchorsOverrides(meta.anchors).anchors.head.y}`],
    ['Animations / réactions', `${Object.keys(meta.animations ?? {}).length} / ${Object.keys(meta.reactions ?? {}).length}`],
  ];
  return table([['', (r) => h('b', {}, r[0]), 'nowrap'], ['', (r) => r[1]]], rows);
}

export function render(root, { pack, state, setState }) {
  const meta = pack.meta;
  const appearance = appearanceOverrides(meta.appearance).config;
  const head = anchorsOverrides(meta.anchors).anchors.head;
  const animations = Object.keys(meta.animations ?? {});
  const reactions = Object.keys(meta.reactions ?? {});
  const options = {
    name: animations.includes(state.anim) || reactions.includes(state.anim) ? state.anim : animations[0],
    stage: STAGES.includes(state.stage) ? state.stage : 'adult',
    zoom: Number(state.zoom) || 4,
    speed: Number(state.speed) || 1,
    smooth: state.smooth === undefined ? meta.smooth === true : state.smooth === '1',
    facing: state.facing === '-1' ? -1 : 1,
    accessory: ACCESSORIES[state.acc] ? state.acc : null,
    hue: Number(state.hue) || 0,
    saturation: state.sat === undefined ? 1 : Number(state.sat),
    tone: Number(state.tone) || 0,
    colorize: state.cz === '1',
  };
  const color = () => ({
    hue: options.hue,
    saturation: options.saturation,
    tone: options.tone,
    colorizeGrays: appearance.colorizeGrays && options.colorize,
    graySaturation: appearance.graySaturation,
  });
  const save = () =>
    setState(
      {
        anim: options.name, stage: options.stage, zoom: options.zoom, speed: options.speed, smooth: options.smooth ? '1' : '0',
        facing: String(options.facing), acc: options.accessory ?? '', hue: options.hue, sat: options.saturation, tone: options.tone,
        cz: options.colorize ? '1' : '0',
      },
      { silent: true },
    );

  const stage = h('div', { style: { display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' } });
  const contact = h('div');
  const redraw = () => {
    save();
    const player = new SpritePlayer({ pack, ...options, color: color(), head, padding: 0.6 });
    const info = h('p', { class: 'muted' });
    player.ready.then(() => {
      const a = player.animation;
      info.textContent = a
        ? `${a.frames} frames de ${player.sheet?.height ?? '?'} px, ${a.duration} s par frame — ${a.url}${player.error ? ` — ${player.error}` : ''}`
        : 'Animation absente pour ce stade.';
    });
    stage.replaceChildren(player.canvas, info);
    renderContactSoon();
  };
  const renderContact = () => {
    const card = (name) => {
      const player = new SpritePlayer({ pack, ...options, name, zoom: 2, color: color(), head, padding: 0.3 });
      return h('div', { class: 'card' }, player.canvas, h('div', { class: 'label' }, name));
    };
    const sheets = options.stage === 'egg'
      ? [h('div', { class: 'grid' }, card('egg'))]
      : [h('div', { class: 'grid' }, animations.map(card)), h('h3', {}, 'Réactions'), h('div', { class: 'grid' }, reactions.map(card))];
    contact.replaceChildren(h('h3', {}, `Animations — ${stageLabel(options.stage)}`), ...sheets);
  };
  const renderContactSoon = debounce(() => renderContact(), 250); // la planche recolore toutes les feuilles
  const control = (label, element) => field(label, element);
  const number = (key, min, max, step) =>
    h('input', {
      type: 'range', min: String(min), max: String(max), step: String(step), value: String(options[key]),
      oninput: (e) => {
        options[key] = Number(e.target.value);
        e.target.title = String(options[key]);
        redraw();
      },
    });

  root.append(
    h('section', { class: 'panel' }, h('h2', {}, `Créature — ${meta.displayName ?? pack.id}`), packSheet(pack)),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Lecteur'),
      h(
        'div',
        { class: 'controls' },
        control('Animation', h('select', {
          onchange: (e) => { options.name = e.target.value; redraw(); },
        }, h('optgroup', { label: 'États' }, animations.map((a) => h('option', { value: a, selected: a === options.name }, a))),
        h('optgroup', { label: 'Réactions' }, reactions.map((a) => h('option', { value: a, selected: a === options.name }, a))))),
        control('Stade', select(STAGES.map((s) => [s, stageLabel(s)]), options.stage, (v) => { options.stage = v; redraw(); })),
        control('Taille', select([['1', '×1'], ['2', '×2'], ['4', '×4'], ['6', '×6']], String(options.zoom), (v) => { options.zoom = Number(v); redraw(); })),
        control('Vitesse', select([['0.25', '×0,25'], ['0.5', '×0,5'], ['1', '×1'], ['2', '×2']], String(options.speed), (v) => { options.speed = Number(v); redraw(); })),
        control('Lissé', h('input', { type: 'checkbox', checked: options.smooth, onchange: (e) => { options.smooth = e.target.checked; redraw(); } })),
        control('Vers la gauche', h('input', { type: 'checkbox', checked: options.facing < 0, onchange: (e) => { options.facing = e.target.checked ? -1 : 1; redraw(); } })),
        control('Accessoire', select([['', 'Aucun'], ...Object.entries(ACCESSORIES).map(([id]) => [id, accessoryLabel(id)])], options.accessory ?? '', (v) => {
          options.accessory = v || null;
          redraw();
        })),
      ),
      h(
        'div',
        { class: 'controls' },
        control('Teinte', number('hue', -180, 180, 1)),
        control('Saturation', number('saturation', 0, 2, 0.05)),
        appearance.colorizeGrays
          ? control('Gris colorisés', h('input', { type: 'checkbox', checked: options.colorize, onchange: (e) => { options.colorize = e.target.checked; redraw(); } }))
          : null,
        control('Ton des gris', number('tone', 0, 360, 1)),
        h('button', {
          onclick: () => {
            Object.assign(options, { hue: 0, saturation: 1, tone: 0, colorize: false });
            save();
            setState({});
          },
        }, 'Couleurs d’origine'),
        h('span', { class: 'muted' }, appearance.enabled
          ? `Variations du jeu pour ce pack : teinte de ${appearance.hueRange[0]} à ${appearance.hueRange[1]}°${appearance.colorizeGrays ? ', gris colorisés' : ''}.`
          : 'Variations de couleur désactivées pour ce pack.'),
      ),
      stage,
    ),
    h('section', { class: 'panel' }, contact),
  );
  redraw();
}
