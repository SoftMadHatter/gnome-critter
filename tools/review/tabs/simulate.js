// Onglet « Vue en jeu » : on règle les compteurs et marques d'un animal (et
// du joueur), les succès se débloquent comme en jeu, et la fenêtre de
// progression s'affiche telle que le joueur la voit, avec les annonces du
// Système. Le scénario est gardé dans le navigateur (par pack) : il survit
// au rechargement automatique après une correction.

import { h, select, field, debounce, fill } from '../dom.js';
import { newlyUnlocked, achievementView, formatCount } from '../../../core/achievements.js';
import { STAT_KEYS, PLAYER_STAT_KEYS, MARK_FAMILIES, PLAYER_MARK_FAMILIES } from '../../../core/stats.js';
import { STAGES, TRAITS } from '../../../core/life.js';
import { SEASONS, HOLIDAYS } from '../../../core/calendar.js';
import { GIFTS, BED_MODELS } from '../../../core/items.js';
import { ACCESSORIES } from '../../../core/accessories.js';
import { openBox } from '../../../core/lootBoxes.js';
import { announceUnlock, announceBurst, rewardLabel } from '../../../core/narrator.js';
import { STAT_LABELS, PLAYER_STAT_LABELS, MARK_FAMILY_LABELS } from '../../../extension/lib/progressLabels.js';
import { TRAIT_LABELS, STAGE_LABELS } from '../../../extension/lib/lifeLabels.js';
import { categoryLabel } from '../format.js';

const STORE = 'scamper-review-simulation';
/** Faits d'animal saisis à la main ; `achievementsUnlocked` est calculé. */
const CRITTER_KEYS = ['daysAlive', 'stageReached', 'tricksLearned', ...STAT_KEYS];
const PLAYER_KEYS = [...PLAYER_STAT_KEYS, 'coins', 'accessoriesOwned'];
const MONTH = {
  daysAlive: 30, stageReached: 3, tricksLearned: 1, meals: 150, mealsFavorite: 40, pets: 300, purrs: 40, brushes: 20,
  washes: 60, greets: 30, playSessions: 60, ballKicks: 150, runs: 80, climbs: 60, ceilingWalks: 10, flights: 60,
  dives: 20, swims: 300, hunts: 25, grazes: 20, naps: 90, sleepSeconds: 100 * 3600, longestSleepSeconds: 1800,
  reliefs: 60, accidents: 2, giftsGiven: 10, tricksPerformed: 30, falls: 40, drags: 20, tickles: 15, hovers: 200,
};

function loadSim(packId) {
  try {
    return JSON.parse(localStorage.getItem(`${STORE}:${packId}`)) ?? null;
  } catch {
    return null;
  }
}

function saveSim(packId, sim) {
  try {
    localStorage.setItem(`${STORE}:${packId}`, JSON.stringify(sim));
  } catch {
    // stockage indisponible (navigation privée) : le scénario ne survivra pas au rechargement
  }
}

const emptySim = () => ({ trait: 'playful', stage: 'adult', stats: {}, marks: [], playerStats: {}, playerMarks: [] });

/** Marques proposées par famille : ce que l'espèce peut connaître, plus celles que citent les succès. */
function markChoices(pack, defs, families) {
  const choices = new Map(families.map((family) => [family, new Set()]));
  const add = (family, value) => choices.get(family)?.add(value);
  for (const kind of pack.profile.diet) add('food', kind);
  for (const kind of pack.profile.toys) add('toy', kind);
  for (const id of Object.keys(ACCESSORIES)) add('accessory', id);
  for (const kind of Object.keys(GIFTS)) add('gift', kind);
  for (const model of BED_MODELS) add('bed', model);
  for (const season of SEASONS) add('season', season);
  for (const holiday of HOLIDAYS) add('holiday', holiday);
  for (const def of defs) {
    if (!def.condition.mark) continue;
    const [family, value] = def.condition.mark.split(':');
    add(family, value);
  }
  return [...choices].filter(([, values]) => values.size > 0);
}

/** Déblocage comme en jeu, répété tant que de nouveaux succès tombent (le nombre de succès obtenus compte lui-même). */
function unlockAll(defs, { trait = null, stage, facts, countSelf = false }) {
  const unlocked = new Set();
  for (let pass = 0; pass < 30; pass++) {
    if (countSelf) facts.stats.achievementsUnlocked = unlocked.size;
    const ids = newlyUnlocked(defs, { trait, stage, facts }, unlocked);
    if (ids.length === 0) break;
    for (const id of ids) unlocked.add(id);
  }
  return unlocked;
}

/** Tout ce qu'il faut pour débloquer tous les succès de `defs`. */
function everything(defs, choices) {
  const stats = {};
  const marks = new Set();
  for (const def of defs) {
    const { stat, marks: family, mark, atLeast } = def.condition;
    if (stat) stats[stat] = Math.max(stats[stat] ?? 0, atLeast);
    if (family) for (const value of choices.get(family) ?? []) marks.add(`${family}:${value}`);
    if (mark) marks.add(mark);
  }
  return { stats, marks: [...marks] };
}

/** Fenêtre de progression telle que le joueur la voit (mêmes règles que extension/lib/progressDialog.js). */
function progressWindow(view, open) {
  return h(
    'div',
    {},
    h('p', {}, h('b', {}, `${view.done} / ${view.total} débloqués`)),
    view.categories.map((category) => {
      const count = category.id === 'mischief'
        ? `${category.done} découverte${category.done > 1 ? 's' : ''} sur ${category.total}`
        : `${category.done}/${category.total}`;
      return h(
        'details',
        { open },
        h('summary', {}, `${categoryLabel(category.id)} (${count})`),
        category.entries.length === 0 ? h('p', { class: 'muted' }, "Rien de découvert pour l'instant. Le Système attend.") : null,
        category.entries.map((entry) =>
          h(
            'div',
            { style: { margin: '6px 0 10px 14px' } },
            h('b', {}, `${entry.done ? '✓ ' : ''}${entry.name}`),
            h('div', { class: 'muted' }, entry.description,
              entry.done || entry.target === null ? '' : ` — ${formatCount(entry.value)} / ${formatCount(entry.target)}`),
            !entry.done && entry.target
              ? h('div', { class: 'bar' }, h('div', { style: { width: `${Math.min(100, (100 * entry.value) / entry.target)}%` } }))
              : null,
            entry.last ? h('div', { class: 'muted' }, `Palier obtenu : ${entry.last.name} (${entry.tier}/${entry.tiers})`) : null,
            entry.done && entry.title ? h('div', {}, h('i', {}, `Titre gagné : ${entry.title}`)) : null,
            entry.troll ? h('div', { class: 'quip' }, `« ${entry.quip} »`) : null,
            entry.troll ? h('div', { class: 'muted' }, `Récompense : ${rewardLabel(entry.reward)}`) : null,
          )),
      );
    }),
  );
}

function notice({ title, body }) {
  return h('div', { class: 'notif' }, h('b', {}, title), body);
}

function counters(keys, values, labels, onChange) {
  return h(
    'div',
    { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' } },
    keys.map((key) =>
      h('label', { class: 'field', style: { justifyContent: 'space-between' } },
        h('span', { title: key }, labels[key] ?? key),
        h('input', {
          type: 'number', min: '0', value: String(values[key] ?? 0),
          oninput: (e) => {
            values[key] = Number(e.target.value) || 0;
            onChange();
          },
        }))),
  );
}

function marksPicker(choices, selected, onChange) {
  return choices.map(([family, values]) =>
    h('div', { style: { margin: '4px 0' } },
      h('b', {}, `${MARK_FAMILY_LABELS[family] ?? family} : `),
      [...values].map((value) => {
        const mark = `${family}:${value}`;
        return h('label', { style: { marginRight: '10px', whiteSpace: 'nowrap' } },
          h('input', {
            type: 'checkbox', checked: selected.has(mark),
            onchange: (e) => {
              if (e.target.checked) selected.add(mark);
              else selected.delete(mark);
              onChange();
            },
          }), ` ${value}`);
      })));
}

/** Scénario d'un préréglage : animal neuf, un mois de vie, ou tout débloqué. */
function presetSim(name, pack, sim) {
  if (name === 'all') {
    const all = everything(pack.critter, new Map(markChoices(pack, pack.critter, MARK_FAMILIES)));
    const player = everything(pack.player, new Map(markChoices(pack, pack.player, PLAYER_MARK_FAMILIES)));
    return { ...sim, stats: all.stats, marks: all.marks, playerStats: player.stats, playerMarks: player.marks };
  }
  if (name === 'month') {
    return {
      ...sim,
      stats: { ...MONTH },
      marks: ['season:spring', 'season:summer', `food:${pack.profile.diet[0] ?? 'kibble'}`],
      playerStats: { menuOpens: 120, coins: 80, coinsSpent: 60, messesCleaned: 20, giftsCollected: 12 },
      playerMarks: [],
    };
  }
  return { ...emptySim(), trait: sim.trait };
}

export function render(root, { pack, state, setState }) {
  const stored = { ...emptySim(), ...(loadSim(pack.id) ?? {}) };
  if (['new', 'month', 'all'].includes(state.preset)) {
    // Préréglage demandé dans l'adresse (#...&preset=all) : appliqué une fois, puis retiré de l'adresse.
    saveSim(pack.id, presetSim(state.preset, pack, stored));
    setState({ preset: '' });
    return;
  }
  const sim = stored;
  const open = state.open === '1';
  const marks = new Set(sim.marks);
  const playerMarks = new Set(sim.playerMarks);
  const critterChoices = markChoices(pack, pack.critter, MARK_FAMILIES);
  const playerChoices = markChoices(pack, pack.player, PLAYER_MARK_FAMILIES);
  const results = h('div', { class: 'columns' });
  const notices = h('div');

  const store = () => saveSim(pack.id, { ...sim, marks: [...marks], playerMarks: [...playerMarks] });
  const compute = () => {
    store();
    const facts = { stats: Object.fromEntries(CRITTER_KEYS.map((key) => [key, Number(sim.stats[key]) || 0])), marks };
    const unlocked = unlockAll(pack.critter, { trait: sim.trait, stage: sim.stage, facts, countSelf: true });
    const view = achievementView(pack.critter, { trait: sim.trait, unlocked, facts });
    const playerFacts = { stats: Object.fromEntries(PLAYER_KEYS.map((key) => [key, Number(sim.playerStats[key]) || 0])), marks: playerMarks };
    const playerUnlocked = unlockAll(pack.player, { facts: playerFacts });
    const playerView = achievementView(pack.player, { unlocked: playerUnlocked, facts: playerFacts });
    results.replaceChildren(
      h('div', {}, h('h3', {}, `Fenêtre de progression — ${TRAIT_LABELS[sim.trait]}, ${STAGE_LABELS[sim.stage].toLowerCase()}`), progressWindow(view, open)),
      h('div', {}, h('h3', {}, 'Succès du joueur (rubrique « Toi »)'), progressWindow(playerView, open)),
    );
    const got = [...pack.critter, ...pack.player].filter((def) => unlocked.has(def.id) || playerUnlocked.has(def.id));
    const coins = got.reduce((sum, def) => sum + Math.max(0, def.reward.coins ?? 0), 0);
    fill(
      notices,
      h('h3', {}, `Annonces du Système (${got.length} succès)`),
      got.length > 3
        ? [notice(announceBurst({ who: 'Pistache', defs: got, coins })),
          h('p', { class: 'muted' }, 'Plus de 3 succès d’un coup : en jeu, une seule notification (ci-dessus). Annonces individuelles :')]
        : null,
      got.slice(0, 40).map((def) => notice(announceUnlock({
        def,
        who: def.scope === 'player' ? null : 'Pistache',
        outcome: { paid: true, box: def.reward.box ? openBox(def.reward.box, Math.random) : undefined, accessoryLabel: ACCESSORIES[def.reward.accessory]?.label },
      }))),
      got.length > 40 ? h('p', { class: 'muted' }, `… et ${got.length - 40} autres.`) : null,
    );
  };
  const soon = debounce(compute, 150);
  const preset = (name) => setState({ preset: name });

  root.append(
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, `Vue en jeu — ${pack.meta.displayName ?? pack.id}`),
      h('p', { class: 'muted' }, 'Règle les compteurs et marques : les succès se débloquent comme en jeu (le moteur est le vrai). Le scénario est gardé par pack dans ce navigateur.'),
      h(
        'div',
        { class: 'controls' },
        field('Caractère', select(TRAITS.map((t) => [t, TRAIT_LABELS[t]]), sim.trait, (v) => { sim.trait = v; compute(); })),
        field('Stade', select(STAGES.map((s) => [s, STAGE_LABELS[s]]), sim.stage, (v) => { sim.stage = v; compute(); })),
        h('button', { onclick: () => preset('new') }, 'Animal neuf'),
        h('button', { onclick: () => preset('month') }, 'Un mois de vie'),
        h('button', { onclick: () => preset('all') }, 'Tout débloqué'),
        field('Tout déplier', h('input', { type: 'checkbox', checked: open, onchange: (e) => setState({ open: e.target.checked ? '1' : '' }) })),
      ),
      h('details', {}, h('summary', {}, 'Compteurs de l’animal'), counters(CRITTER_KEYS, sim.stats, STAT_LABELS, soon)),
      h('details', {}, h('summary', {}, 'Marques de l’animal'), marksPicker(critterChoices, marks, soon)),
      h('details', {}, h('summary', {}, 'Compteurs et marques du joueur'), counters(PLAYER_KEYS, sim.playerStats, PLAYER_STAT_LABELS, soon),
        marksPicker(playerChoices, playerMarks, soon)),
    ),
    h('section', { class: 'panel' }, results),
    h('section', { class: 'panel' }, notices),
  );
  compute();
}
