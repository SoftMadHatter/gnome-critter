// "Anchors" tab: sets, frame by frame, where the critter's head is so that
// accessories follow it (crown on top, glasses on the face, medal on the
// neck), plus the pack-wide offsets of the face and neck slots. Click on the
// head in each frame; the draft survives reloads (localStorage) until saved
// (POST /api/anchors/<pack>, which only rewrites the pack's "anchors" block).

import { h, select, field, toast } from '../dom.js';
import { SpritePlayer } from '../sprites.js';
import { ACCESSORIES, accessoryLabel, anchorsOverrides } from '../../../core/accessories.js';
import {
  DRAFT_VERSION, round, key, draftFromPack, draftToRaw, generatedAnchors, generatedAt,
  codeLayout, effectiveLayout, setLayout, stageHeadWidth, setStageHeadWidth,
} from '../anchorsDraft.js';
import { SLOTS } from '../../../core/accessories.js';
import { STAGES } from '../../../core/life.js';
import { stageLabel } from '../../../core/labels.js';

const WITNESSES = ['crown', 'glasses', 'medal', 'bow']; // worn together by default; any accessory can be picked alone

/** Draft of a pack: kept in memory and in localStorage. */
const drafts = new Map();
const storageKey = (id) => `anchors-draft:${id}`;

function readStored(id) {
  try {
    const draft = JSON.parse(localStorage.getItem(storageKey(id)));
    return draft?.version === DRAFT_VERSION ? draft : null;
  } catch {
    return null;
  }
}

function store(id, draft) {
  try {
    if (draft) localStorage.setItem(storageKey(id), JSON.stringify(draft));
    else localStorage.removeItem(storageKey(id));
  } catch {
    // private window or blocked storage: the draft just stays in memory
  }
}

export function render(root, { pack, state, setState }) {
  const meta = pack.meta;
  const animations = Object.keys(meta.animations ?? {}).filter((n) => n !== 'egg');
  const reactions = Object.keys(meta.reactions ?? {});
  if (!drafts.has(pack.id)) drafts.set(pack.id, readStored(pack.id) ?? draftFromPack(pack));
  const draft = drafts.get(pack.id);
  draft.layout ??= {};
  draft.extra ??= {};

  const wanted = state.anim ?? '';
  const name = wanted.startsWith('r:') ? wanted.slice(2) : wanted;
  const current = {
    name: animations.includes(name) || reactions.includes(name) ? name : animations[0],
    stage: STAGES.includes(state.stage) ? state.stage : 'adult',
    frame: Math.max(0, Number(state.frame) || 0),
    advance: state.next !== '0',
    witness: state.wit in ACCESSORIES ? state.wit : '',
  };
  current.kind = wanted.startsWith('r:') && reactions.includes(current.name) ? 'reaction' : 'animation';
  const def = (current.kind === 'reaction' ? meta.reactions : meta.animations)[current.name];
  current.frame = Math.min(current.frame, def.frames - 1);
  const id = key(current.kind, current.name);
  const generated = generatedAnchors(draft);
  const generatedHere = (frame, stg = 'adult') => generatedAt(generated, current.kind, current.name, frame, stg);
  const entry = () => {
    if (!draft.entries[id]) {
      const g = generatedHere(0);
      draft.entries[id] = { rotation: g?.rotation ?? 0, width: g?.width ?? null, hide: [...(g?.hide ?? [])], points: Array(def.frames).fill(null) };
    }
    return draft.entries[id];
  };
  // The point a frame really has: the touch-up if any, else the generated one.
  const effective = (frame) => draft.entries[id]?.points[frame] ?? generatedHere(frame)?.point ?? null;

  const persist = () => store(pack.id, draft);
  const go = (patch) => setState({
    anim: current.kind === 'reaction' ? `r:${current.name}` : current.name,
    stage: current.stage,
    frame: String(current.frame),
    next: current.advance ? '' : '0',
    wit: current.witness,
    ...patch,
  });

  const progress = (kind, nm) => {
    const e = draft.entries[key(kind, nm)];
    const total = (kind === 'reaction' ? meta.reactions : meta.animations)[nm].frames;
    const touched = e ? e.points.filter((p) => p !== null).length : 0;
    return touched > 0 ? `${touched}/${total} retouchées` : 'généré';
  };

  // Stage: the points are edited on the adult; the other stages only show the result.
  const editable = current.stage === 'adult';
  const stage = h('div', { class: 'anchor-stage' });
  const info = h('p', { class: 'muted' });
  const redraw = () => {
    const raw = draftToRaw(pack, draft);
    const anchors = anchorsOverrides(raw).anchors;
    const player = new SpritePlayer({
      pack, name: current.name, reaction: current.kind === 'reaction', stage: current.stage, zoom: 10, padding: 0.35,
      smooth: meta.smooth === true, accessory: current.witness || WITNESSES, anchors, frame: current.frame,
    });
    const live = new SpritePlayer({
      pack, name: current.name, reaction: current.kind === 'reaction', stage: current.stage, zoom: 4, padding: 0.35,
      smooth: meta.smooth === true, accessory: current.witness || WITNESSES, anchors,
    });
    const marker = h('div', { class: 'anchor-marker' });
    const genMarker = h('div', { class: 'anchor-marker generated' });
    const frameEntry = draft.entries[id]?.points[current.frame];
    const genHere = generatedHere(current.frame, current.stage)?.point;
    const place = (el, p) => {
      const rect = player.canvas.getBoundingClientRect();
      const k = rect.width / player.canvas.width;
      el.style.left = `${(player.box.x + p[0] * player.box.width) * k}px`;
      el.style.top = `${(player.box.y + p[1] * player.box.height) * k}px`;
      el.style.display = 'block';
    };
    player.ready.then(() => {
      if (!player.box) return;
      if (genHere) place(genMarker, genHere);
      if (editable && frameEntry) place(marker, frameEntry);
    });
    player.canvas.style.cursor = editable ? 'crosshair' : 'not-allowed';
    player.canvas.addEventListener('click', (ev) => {
      if (!editable || !player.box) return;
      const rect = player.canvas.getBoundingClientRect();
      const k = player.canvas.width / rect.width;
      const x = ((ev.clientX - rect.left) * k - player.box.x) / player.box.width;
      const y = ((ev.clientY - rect.top) * k - player.box.y) / player.box.height;
      entry().points[current.frame] = [round(Math.min(Math.max(x, 0), 1)), round(Math.min(Math.max(y, 0), 1))];
      persist();
      if (current.advance && current.frame < def.frames - 1) current.frame += 1;
      go({});
    });
    stage.replaceChildren(
      h('div', { style: { position: 'relative', display: 'inline-block' } }, player.canvas, genMarker, marker),
      h('div', {}, h('div', { class: 'muted' }, 'Aperçu animé'), live.canvas),
    );
    const touched = frameEntry !== undefined && frameEntry !== null;
    const status = frameEntry === false ? 'masquée par une retouche'
      : touched ? 'retouchée (rouge) ; le point généré est le cercle gris'
        : genHere === undefined ? 'sans point généré : repli du pack'
          : genHere === false ? 'masquée (générée)' : 'point généré (cercle gris)';
    info.textContent = editable
      ? `Image ${current.frame + 1} / ${def.frames} — ${status}. Clique sur le haut de la tête pour la retoucher (point d’ancrage des chapeaux).`
      : 'Les retouches se font sur l’adulte ; les autres stades montrent les points générés par le script (scripts/gen_species_sprites.py).';
  };

  const numberField = (label, get, set, { min = 0, max = 1, step = 0.005 } = {}) => field(label, h('input', {
    type: 'number', min: String(min), max: String(max), step: String(step), value: String(get()), style: { width: '80px' },
    oninput: (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) { set(v); persist(); redraw(); }
    },
  }));

  const frameButton = (label, delta) => h('button', {
    onclick: () => { current.frame = Math.min(Math.max(current.frame + delta, 0), def.frames - 1); go({}); },
  }, label);

  const save = async () => {
    const raw = draftToRaw(pack, draft);
    const response = await fetch(`/api/anchors/${pack.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(raw) });
    if (!response.ok) {
      toast(`Enregistrement refusé : ${await response.text()}`);
      return;
    }
    drafts.delete(pack.id);
    store(pack.id, null);
    toast('Enregistré dans pack.json.');
  };

  // Per accessory: slot, width (in head widths), vertical shift, and the point of the drawn part that sits on the slot.
  const layoutBody = h('tbody');
  const renderLayout = () => {
    const cell = (id, fieldName, index, props = {}) => {
      const overridden = draft.layout[id]?.[fieldName] !== undefined;
      const get = () => (index === undefined ? effectiveLayout(draft, id)[fieldName] : effectiveLayout(draft, id)[fieldName][index]);
      return h('input', {
        type: 'number', step: '0.01', value: String(round(get())), class: overridden ? 'overridden' : '', style: { width: '64px' }, ...props,
        oninput: (e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v)) return;
          const next = index === undefined ? v : Object.assign([...effectiveLayout(draft, id).at], { [index]: v });
          setLayout(draft, id, fieldName, next);
          persist();
          redraw();
        },
        onchange: renderLayout,
      });
    };
    layoutBody.replaceChildren(...Object.keys(ACCESSORIES).map((id) => {
      const eff = effectiveLayout(draft, id);
      return h('tr', { class: current.witness === id ? 'current' : '' },
        h('td', {}, accessoryLabel(id)),
        h('td', {}, select(SLOTS.map((sl) => [sl, { top: 'dessus', face: 'visage', neck: 'cou' }[sl]]), eff.slot, (v) => { setLayout(draft, id, 'slot', v); persist(); renderLayout(); redraw(); })),
        h('td', {}, cell(id, 'span', undefined, { min: '0.1', max: '3' })),
        h('td', {}, cell(id, 'shift', undefined, { min: '-3', max: '3' })),
        h('td', {}, cell(id, 'at', 0, { min: '0', max: '1' }), ' ', cell(id, 'at', 1, { min: '0', max: '1' })),
        h('td', {}, draft.layout[id] ? h('button', { onclick: () => { delete draft.layout[id]; persist(); renderLayout(); redraw(); } }, 'Défaut') : h('span', { class: 'muted' }, `défaut ${codeLayout(id).span}`)));
    }));
  };
  renderLayout();

  const optionLabel = (kind, nm) => `${nm}  (${progress(kind, nm)})`;
  root.append(
    h('section', { class: 'panel' },
      h('h2', {}, `Ancrages — ${meta.displayName ?? pack.id}`),
      h('div', { class: 'controls' },
        field('Animation', h('select', {
          onchange: (e) => {
            const v = e.target.value;
            current.kind = v.startsWith('r:') ? 'reaction' : 'animation';
            current.name = v.replace(/^r:/, '');
            current.frame = 0;
            go({ anim: v });
          },
        },
        h('optgroup', { label: 'États' }, animations.map((a) => h('option', { value: a, selected: current.kind === 'animation' && a === current.name }, optionLabel('animation', a)))),
        h('optgroup', { label: 'Réactions' }, reactions.map((a) => h('option', { value: `r:${a}`, selected: current.kind === 'reaction' && a === current.name }, optionLabel('reaction', a)))))),
        field('Stade', select(['adult', 'young', 'senior', 'baby'].map((s) => [s, stageLabel(s)]), current.stage, (v) => { current.stage = v; go({}); })),
        field('Témoin', select([['', 'Quatre ensemble'], ...Object.keys(ACCESSORIES).map((w) => [w, accessoryLabel(w)])], current.witness, (v) => { current.witness = v; go({}); })),
        frameButton('◀', -1), frameButton('▶', 1),
        field('Suivante après clic', h('input', { type: 'checkbox', checked: current.advance, onchange: (e) => { current.advance = e.target.checked; go({}); } })),
        field('Tête à l’envers (180°)', h('input', {
          type: 'checkbox', checked: (draft.entries[id]?.rotation ?? generatedHere(0)?.rotation ?? 0) === 180,
          onchange: (e) => { entry().rotation = e.target.checked ? 180 : 0; persist(); redraw(); },
        })),
        field('Vue de dos (sans visage ni cou)', h('input', {
          type: 'checkbox', checked: (draft.entries[id]?.hide ?? generatedHere(0)?.hide ?? []).length > 0,
          onchange: (e) => { entry().hide = e.target.checked ? ['face', 'neck'] : []; persist(); redraw(); },
        })),
        editable ? numberField('Largeur de tête (animation)', () => draft.entries[id]?.width ?? generatedHere(0)?.width ?? draft.headWidth, (v) => {
          entry().width = v === draft.headWidth ? null : v;
          persist();
        }, { min: 0.05, max: 1, step: 0.005 }) : ''),
      h('div', { class: 'controls' },
        h('button', { onclick: () => { entry().points[current.frame] = false; persist(); go({}); } }, 'Masquer sur cette image'),
        h('button', { onclick: () => { if (draft.entries[id]) draft.entries[id].points[current.frame] = null; persist(); go({}); } }, 'Revenir au point généré'),
        h('button', {
          onclick: () => {
            const p = effective(current.frame);
            if (p) entry().points.fill(p, 0, def.frames);
            persist();
            go({});
          },
        }, 'Copier sur toutes les images'),
        h('button', {
          onclick: () => {
            const before = current.frame > 0 ? effective(current.frame - 1) : null;
            if (before) entry().points[current.frame] = before;
            persist();
            go({});
          },
        }, 'Reprendre l’image précédente'),
        h('button', { onclick: () => { delete draft.entries[id]; persist(); go({}); } }, 'Revenir au généré (animation)')),
      info,
      stage),
    h('section', { class: 'panel' },
      h('h2', {}, 'Réglages du pack'),
      h('div', { class: 'controls' },
        numberField('Repli x', () => draft.head.x, (v) => { draft.head.x = v; }),
        numberField('Repli y', () => draft.head.y, (v) => { draft.head.y = v; }),
        numberField('Largeur de tête', () => draft.headWidth, (v) => { draft.headWidth = v; }, { min: 0.05, max: 1, step: 0.005 }),
        ...['baby', 'young', 'senior'].map((st) => numberField(`Largeur de tête (${stageLabel(st).toLowerCase()})`, () => stageHeadWidth(draft, st), (v) => setStageHeadWidth(draft, st, v), { min: 0.05, max: 1, step: 0.005 })),
        numberField('Dessus dx', () => draft.slots.top.dx, (v) => { draft.slots.top.dx = v; }, { min: -3, max: 3 }),
        numberField('Dessus dy', () => draft.slots.top.dy, (v) => { draft.slots.top.dy = v; }, { min: -3, max: 3 }),
        numberField('Visage dx', () => draft.slots.face.dx, (v) => { draft.slots.face.dx = v; }, { min: -3, max: 3 }),
        numberField('Visage dy', () => draft.slots.face.dy, (v) => { draft.slots.face.dy = v; }, { min: -3, max: 3 }),
        numberField('Cou dx', () => draft.slots.neck.dx, (v) => { draft.slots.neck.dx = v; }, { min: -3, max: 3 }),
        numberField('Cou dy', () => draft.slots.neck.dy, (v) => { draft.slots.neck.dy = v; }, { min: -3, max: 3 })),
      h('p', { class: 'muted' }, 'Largeur de tête : en fraction du sprite, elle dimensionne les accessoires. Dessus, visage et cou : décalages depuis le point de tête, en largeurs de tête (dessus : enfoncement du chapeau).'),
      h('div', { class: 'controls' },
        h('button', { class: 'primary', onclick: save }, 'Enregistrer dans pack.json'),
        h('button', { onclick: () => { drafts.delete(pack.id); store(pack.id, null); go({}); } }, 'Abandonner le brouillon'),
        h('span', { class: 'muted' }, 'Le brouillon est gardé dans le navigateur tant que tu n’enregistres pas.'))),
    h('section', { class: 'panel' },
      h('h2', {}, 'Accessoires'),
      h('p', { class: 'muted' }, 'Largeur : de la partie dessinée, en largeurs de tête. Décalage : vers le bas, en largeurs de tête. Point : l’endroit de l’accessoire (0 à 1, de gauche à droite et de haut en bas) posé sur l’emplacement. Seuls les écarts au défaut sont enregistrés (en gras).'),
      h('table', { class: 'layout-table' },
        h('thead', {}, h('tr', {}, ['Accessoire', 'Emplacement', 'Largeur', 'Décalage', 'Point x / y', ''].map((t) => h('th', {}, t)))),
        layoutBody)),
  );

  const onKey = (ev) => {
    if (!root.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (ev.target.matches('input, select, textarea')) return;
    if (ev.key === 'ArrowLeft') frameButton('', -1).click();
    if (ev.key === 'ArrowRight') frameButton('', 1).click();
  };
  document.addEventListener('keydown', onKey);
  redraw();
}
