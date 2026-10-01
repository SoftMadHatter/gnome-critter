// "Anchors" tab: sets, frame by frame, where the critter's head is so that
// accessories follow it (crown on top, glasses on the face, medal on the
// neck), plus the pack-wide offsets of the face and neck slots. Click on the
// head in each frame; the draft survives reloads (localStorage) until saved
// (POST /api/anchors/<pack>, which only rewrites the pack's "anchors" block).

import { h, select, field, toast } from '../dom.js';
import { SpritePlayer } from '../sprites.js';
import { anchorsOverrides, accessoryLabel } from '../../../core/accessories.js';
import { STAGES } from '../../../core/life.js';
import { stageLabel } from '../../../core/labels.js';

const WITNESSES = ['crown', 'glasses', 'medal', 'bow'];
const DEFAULT_HEAD = { x: 0.72, y: 0.2 };
const round = (v) => Math.round(v * 1000) / 1000;
const key = (kind, name) => `${kind}:${name}`;

/** Draft of a pack: kept in memory and in localStorage. */
const drafts = new Map();
const storageKey = (id) => `anchors-draft:${id}`;

function readStored(id) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(id)));
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

/** Draft from the pack's current section: `entries[kind:name] = { rotation, points: ([x, y] | false | null)[] }`, one per frame, null = not set. */
function draftFromPack(pack) {
  const { anchors } = anchorsOverrides(pack.raw.anchors);
  const entries = {};
  for (const [kind, table, defs] of [['animation', anchors.animations, pack.meta.animations], ['reaction', anchors.reactions, pack.meta.reactions]]) {
    for (const [name, entry] of Object.entries(table)) {
      const count = defs?.[name]?.frames ?? entry.points.length;
      const points = Array.from({ length: count }, (_, i) => {
        const p = entry.points.length === 1 ? entry.points[0] : entry.points[i];
        return p ? [p.x, p.y] : false;
      });
      entries[key(kind, name)] = { rotation: entry.rotation, points };
    }
  }
  return { head: { ...anchors.head }, slots: structuredClone(anchors.slots), babyScale: anchors.stageFit.baby?.scale ?? null, entries };
}

/** The `anchors` section to write: unset frames take the nearest set one (before, else after), then the head. */
function draftToRaw(pack, draft) {
  const filled = (points) => {
    return points.map((p, i) => {
      if (p !== null) return p;
      for (let j = i - 1; j >= 0; j--) if (points[j] !== null) return points[j];
      for (let j = i + 1; j < points.length; j++) if (points[j] !== null) return points[j];
      return [draft.head.x, draft.head.y];
    });
  };
  const compact = (entry) => {
    const points = filled(entry.points).map((p) => (p ? [round(p[0]), round(p[1])] : false));
    const same = points.every((p) => p && p[0] === points[0][0] && p[1] === points[0][1]);
    let value = same ? points[0] : points;
    if (points.every((p) => p === false)) value = false;
    return entry.rotation ? { rotation: entry.rotation, points: value } : value;
  };
  const out = { head: { x: round(draft.head.x), y: round(draft.head.y) }, slots: {} };
  for (const [slot, d] of Object.entries(draft.slots)) out.slots[slot] = { dx: round(d.dx), dy: round(d.dy) };
  if (draft.babyScale && draft.babyScale !== 1) out.stageFit = { baby: { scale: round(draft.babyScale) } };
  for (const [kind, table, defs] of [['animation', 'animations', pack.meta.animations], ['reaction', 'reactions', pack.meta.reactions]]) {
    const rows = {};
    for (const name of Object.keys(defs ?? {})) {
      const entry = draft.entries[key(kind, name)];
      if (entry && entry.points.some((p) => p !== null)) rows[name] = compact(entry);
    }
    if (Object.keys(rows).length > 0) out[table] = rows;
  }
  return out;
}

export function render(root, { pack, state, setState }) {
  const meta = pack.meta;
  const animations = Object.keys(meta.animations ?? {}).filter((n) => n !== 'egg');
  const reactions = Object.keys(meta.reactions ?? {});
  if (!drafts.has(pack.id)) drafts.set(pack.id, readStored(pack.id) ?? draftFromPack(pack));
  const draft = drafts.get(pack.id);

  const wanted = state.anim ?? '';
  const name = wanted.startsWith('r:') ? wanted.slice(2) : wanted;
  const current = {
    name: animations.includes(name) || reactions.includes(name) ? name : animations[0],
    stage: STAGES.includes(state.stage) ? state.stage : 'adult',
    frame: Math.max(0, Number(state.frame) || 0),
    advance: state.next !== '0',
    witness: WITNESSES.includes(state.wit) ? state.wit : '',
  };
  current.kind = wanted.startsWith('r:') && reactions.includes(current.name) ? 'reaction' : 'animation';
  const def = (current.kind === 'reaction' ? meta.reactions : meta.animations)[current.name];
  current.frame = Math.min(current.frame, def.frames - 1);
  const id = key(current.kind, current.name);
  const entry = () => (draft.entries[id] ??= { rotation: 0, points: Array(def.frames).fill(null) });

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
    return e ? `${e.points.filter((p) => p !== null).length}/${total}` : `0/${total}`;
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
    const frameEntry = draft.entries[id]?.points[current.frame];
    player.ready.then(() => {
      if (!player.box || !frameEntry) return;
      const rect = player.canvas.getBoundingClientRect();
      const k = rect.width / player.canvas.width;
      marker.style.left = `${(player.box.x + frameEntry[0] * player.box.width) * k}px`;
      marker.style.top = `${(player.box.y + frameEntry[1] * player.box.height) * k}px`;
      marker.style.display = 'block';
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
      h('div', { style: { position: 'relative', display: 'inline-block' } }, player.canvas, marker),
      h('div', {}, h('div', { class: 'muted' }, 'Aperçu animé'), live.canvas),
    );
    info.textContent = editable
      ? `Image ${current.frame + 1} / ${def.frames} — clique sur le haut de la tête (point d’ancrage des chapeaux). ${progress(current.kind, current.name)} images réglées${draft.entries[id]?.points[current.frame] === null || !draft.entries[id] ? ' ; cette image n’est pas réglée (elle prend sa voisine, sinon le repli).' : '.'}`
      : 'Les points se règlent sur l’adulte ; ici seul le curseur « échelle bébé » agit.';
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
        field('Témoin', select([['', 'Tous'], ...WITNESSES.map((w) => [w, accessoryLabel(w)])], current.witness, (v) => { current.witness = v; go({}); })),
        frameButton('◀', -1), frameButton('▶', 1),
        field('Suivante après clic', h('input', { type: 'checkbox', checked: current.advance, onchange: (e) => { current.advance = e.target.checked; go({}); } })),
        field('Tête à l’envers (180°)', h('input', {
          type: 'checkbox', checked: (draft.entries[id]?.rotation ?? 0) === 180,
          onchange: (e) => { entry().rotation = e.target.checked ? 180 : 0; persist(); redraw(); },
        }))),
      h('div', { class: 'controls' },
        h('button', { onclick: () => { entry().points[current.frame] = false; persist(); go({}); } }, 'Masquer sur cette image'),
        h('button', { onclick: () => { entry().points[current.frame] = null; persist(); go({}); } }, 'Effacer cette image'),
        h('button', {
          onclick: () => {
            const p = entry().points[current.frame];
            if (p !== null) entry().points.fill(p, 0, def.frames);
            persist();
            go({});
          },
        }, 'Copier sur toutes les images'),
        h('button', {
          onclick: () => {
            const before = entry().points[current.frame - 1];
            if (current.frame > 0 && before !== null) entry().points[current.frame] = before;
            persist();
            go({});
          },
        }, 'Reprendre l’image précédente'),
        h('button', { onclick: () => { delete draft.entries[id]; persist(); go({}); } }, 'Tout effacer (animation)')),
      info,
      stage),
    h('section', { class: 'panel' },
      h('h2', {}, 'Réglages du pack'),
      h('div', { class: 'controls' },
        numberField('Repli x', () => draft.head.x, (v) => { draft.head.x = v; }),
        numberField('Repli y', () => draft.head.y, (v) => { draft.head.y = v; }),
        numberField('Visage dx', () => draft.slots.face.dx, (v) => { draft.slots.face.dx = v; }, { min: -1 }),
        numberField('Visage dy', () => draft.slots.face.dy, (v) => { draft.slots.face.dy = v; }, { min: -1 }),
        numberField('Cou dx', () => draft.slots.neck.dx, (v) => { draft.slots.neck.dx = v; }, { min: -1 }),
        numberField('Cou dy', () => draft.slots.neck.dy, (v) => { draft.slots.neck.dy = v; }, { min: -1 }),
        numberField('Échelle bébé', () => draft.babyScale ?? 1, (v) => { draft.babyScale = v; }, { min: 0.3, max: 1.5, step: 0.01 })),
      h('p', { class: 'muted' }, 'Visage et cou : décalages depuis le point de tête, en fraction du sprite. Échelle bébé : les points sont rapprochés du bas-centre du cadre.'),
      h('div', { class: 'controls' },
        h('button', { class: 'primary', onclick: save }, 'Enregistrer dans pack.json'),
        h('button', { onclick: () => { drafts.delete(pack.id); store(pack.id, null); go({}); } }, 'Abandonner le brouillon'),
        h('span', { class: 'muted' }, 'Le brouillon est gardé dans le navigateur tant que tu n’enregistres pas.'))),
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
