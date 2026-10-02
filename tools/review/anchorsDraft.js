// Review tool (dev): the pure logic of the anchor editor's draft, apart from
// the page so that it can be tested. The draft holds the touch-ups being
// edited; what the script generated (`base`, `stages`) is carried through.

import { anchorEntry, anchorsOverrides } from '../../core/accessories.js';

// Draft format: bumped when slots changed unit (head widths), which makes older drafts wrong.
export const DRAFT_VERSION = 2;
// Sections the editor carries through without editing, and the order of the written keys.
const KEPT = ['stageFit', 'base', 'stages'];
const ORDER = ['head', 'headWidth', 'slots', 'stageFit', 'base', 'stages', 'animations', 'reactions'];
export const round = (v) => Math.round(v * 1000) / 1000;
export const key = (kind, name) => `${kind}:${name}`;

/** Draft of the touch-ups from the pack's current section: `entries[kind:name] = { rotation, points: ([x, y] | false | null)[] }`, one per frame, null = not set. */
export function draftFromPack(pack) {
  const { anchors } = anchorsOverrides(pack.raw.anchors);
  const entries = {};
  for (const [kind, table, defs] of [['animation', anchors.animations, pack.meta.animations], ['reaction', anchors.reactions, pack.meta.reactions]]) {
    for (const [name, entry] of Object.entries(table)) {
      const count = defs?.[name]?.frames ?? entry.points.length;
      const points = Array.from({ length: count }, (_, i) => {
        const p = entry.points.length === 1 ? entry.points[0] : entry.points[i];
        return p ? [p.x, p.y] : false;
      });
      entries[key(kind, name)] = { rotation: entry.rotation, width: entry.width, points };
    }
  }
  // What the editor doesn't edit (generated points, stages) is carried through untouched.
  const extra = {};
  for (const key of KEPT) if (pack.raw.anchors?.[key] !== undefined) extra[key] = structuredClone(pack.raw.anchors[key]);
  return { version: DRAFT_VERSION, head: { ...anchors.head }, headWidth: anchors.headWidth, slots: structuredClone(anchors.slots), extra, entries };
}

/** Anchors without any touch-up: what the script generated (so what an unset frame falls back to). */
export function generatedAnchors(draft) {
  const stages = Object.fromEntries(Object.entries(draft.extra.stages ?? {}).map(([name, { animations, reactions, ...rest }]) => [name, rest])); // eslint-disable-line no-unused-vars
  return anchorsOverrides({ head: draft.head, headWidth: draft.headWidth, slots: draft.slots, base: draft.extra.base, stages }).anchors;
}

/** The generated head of a frame: `{ point: [x, y] | false, rotation, width }`, or null when the script drew none. */
export function generatedAt(anchors, kind, name, frame, stage = 'adult') {
  const found = anchorEntry(anchors, { [kind === 'reaction' ? 'reaction' : 'animation']: name, stage });
  if (!found) return null;
  const { entry } = found;
  const p = entry.points[Math.min(frame, entry.points.length - 1)];
  return { point: p ? [p.x, p.y] : false, rotation: entry.rotation, width: entry.width };
}

const near = (a, b) => (a === false || b === false ? a === b : Math.abs(a[0] - b[0]) < 0.0006 && Math.abs(a[1] - b[1]) < 0.0006);

/**
 * The `anchors` section to write. A frame left unset follows the generated point (else its nearest set
 * neighbour, else the fallback); a touch-up identical to the generated points is not written at all.
 */
export function draftToRaw(pack, draft) {
  const gen = generatedAnchors(draft);
  const compact = (entry, kind, name) => {
    const filled = entry.points.map((p, i) => {
      if (p !== null) return p;
      const g = generatedAt(gen, kind, name, i)?.point;
      if (g !== undefined) return g;
      for (let j = i - 1; j >= 0; j--) if (entry.points[j] !== null) return entry.points[j];
      for (let j = i + 1; j < entry.points.length; j++) if (entry.points[j] !== null) return entry.points[j];
      return [draft.head.x, draft.head.y];
    });
    const points = filled.map((p) => (p ? [round(p[0]), round(p[1])] : false));
    const base = generatedAt(gen, kind, name, 0);
    if (base && (base.rotation ?? 0) === (entry.rotation ?? 0) && points.every((p, i) => near(p, generatedAt(gen, kind, name, i).point))) return null;
    const same = points.every((p) => p && p[0] === points[0][0] && p[1] === points[0][1]);
    let value = same ? points[0] : points;
    if (points.every((p) => p === false)) value = false;
    return entry.rotation || entry.width ? { ...(entry.rotation ? { rotation: entry.rotation } : {}), ...(entry.width ? { width: entry.width } : {}), points: value } : value;
  };
  const out = { head: { x: round(draft.head.x), y: round(draft.head.y) }, headWidth: round(draft.headWidth), slots: {}, ...draft.extra };
  for (const [slot, d] of Object.entries(draft.slots)) out.slots[slot] = { dx: round(d.dx), dy: round(d.dy) };
  for (const [kind, table, defs] of [['animation', 'animations', pack.meta.animations], ['reaction', 'reactions', pack.meta.reactions]]) {
    const rows = {};
    for (const name of Object.keys(defs ?? {})) {
      const entry = draft.entries[key(kind, name)];
      if (!entry || !entry.points.some((p) => p !== null)) continue;
      const value = compact(entry, kind, name);
      if (value !== null) rows[name] = value;
    }
    if (Object.keys(rows).length > 0) out[table] = rows;
  }
  // Same key order as scripts/gen_species_sprites.py, so that both write the same text.
  return Object.fromEntries([...ORDER.filter((k) => k in out), ...Object.keys(out).filter((k) => !ORDER.includes(k))].map((k) => [k, out[k]]));
}
