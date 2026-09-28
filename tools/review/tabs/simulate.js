// "In-game view" tab: a critter's (and the player's) counters and marks
// are set, achievements unlock as in the game, and the progression window
// displays exactly as the player sees it, with the Committee's
// announcements. The scenario is kept in the browser (per pack): it
// survives the automatic reload after a fix.

import { h, select, field, debounce, fill } from '../dom.js';
import { newlyUnlocked, achievementView, formatCount } from '../../../core/achievements.js';
import { STAT_KEYS, PLAYER_STAT_KEYS, MARK_FAMILIES, PLAYER_MARK_FAMILIES } from '../../../core/stats.js';
import { STAGES, TRAITS } from '../../../core/life.js';
import { SEASONS, HOLIDAYS } from '../../../core/calendar.js';
import { GIFTS, BED_MODELS } from '../../../core/items.js';
import { ACCESSORIES, accessoryLabel } from '../../../core/accessories.js';
import { openBox } from '../../../core/lootBoxes.js';
import { announceUnlock, announceBurst, rewardLabel } from '../../../core/narrator.js';
import { statLabel, playerStatLabel, markFamilyLabel, traitLabel, stageLabel } from '../../../core/labels.js';
import { _, ngettext, fmt } from '../../../core/i18n.js';
import { categoryLabel } from '../format.js';

const STORE = 'gnome-critter-review-simulation';
/** Critter facts entered by hand; `achievementsUnlocked` is computed. */
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
    // storage unavailable (private browsing): the scenario won't survive a reload
  }
}

const emptySim = () => ({ trait: 'playful', stage: 'adult', stats: {}, marks: [], playerStats: {}, playerMarks: [] });

/** Marks offered per family: what the species can experience, plus those achievements mention. */
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

/** Unlocking as in the game, repeated as long as new achievements land (the count of earned achievements counts toward itself). */
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

/** Everything needed to unlock every achievement in `defs`. */
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

/** Progression window exactly as the player sees it (same rules and same text as extension/lib/progressDialog.js). */
function progressWindow(view, open) {
  return h(
    'div',
    {},
    h('p', {}, h('b', {}, fmt(_('{done} / {total} débloqués'), { done: view.done, total: view.total }))),
    view.categories.map((category) => {
      const count = category.id === 'mischief'
        ? fmt(ngettext('{done} découverte sur {total}', '{done} découvertes sur {total}', category.done), { done: category.done, total: category.total })
        : `${category.done}/${category.total}`;
      return h(
        'details',
        { open },
        h('summary', {}, `${categoryLabel(category.id)} (${count})`),
        category.id === 'player' ? h('p', { class: 'muted' }, _('Tes succès à toi, partagés entre tous tes animaux.')) : null,
        category.entries.length === 0 ? h('p', { class: 'muted' }, _("Rien de découvert pour l'instant. Le Comité attend.")) : null,
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
            entry.last
              ? h('div', { class: 'muted' }, fmt(_('Palier obtenu : {name} ({tier}/{tiers})'), { name: entry.last.name, tier: entry.tier, tiers: entry.tiers }))
              : null,
            entry.done && entry.title ? h('div', {}, h('i', {}, fmt(_('Titre gagné : {title}'), { title: entry.title }))) : null,
            entry.troll ? h('div', { class: 'quip' }, fmt(_('« {name} »'), { name: entry.quip })) : null,
            entry.troll ? h('div', { class: 'muted' }, fmt(_('Récompense : {reward}'), { reward: rewardLabel(entry.reward) })) : null,
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
        h('span', { title: key }, labels(key)),
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
      h('b', {}, `${markFamilyLabel(family)} : `),
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

/** A preset's scenario: new critter, a month of life, or everything unlocked. */
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
    // Preset requested in the address (#...&preset=all): applied once, then removed from the address.
    saveSim(pack.id, presetSim(state.preset, pack, stored));
    setState({ preset: '' });
    return;
  }
  const sim = stored;
  const sample = pack.meta.names?.[0] ?? 'Pistache';
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
      h('div', {}, h('h3', {}, `Fenêtre de progression — ${traitLabel(sim.trait)}, ${stageLabel(sim.stage).toLowerCase()}`), progressWindow(view, open)),
      h('div', {}, h('h3', {}, 'Succès du joueur (rubrique « Toi »)'), progressWindow(playerView, open)),
    );
    const got = [...pack.critter, ...pack.player].filter((def) => unlocked.has(def.id) || playerUnlocked.has(def.id));
    const coins = got.reduce((sum, def) => sum + Math.max(0, def.reward.coins ?? 0), 0);
    fill(
      notices,
      h('h3', {}, `Annonces du Comité (${got.length} succès)`),
      got.length > 3
        ? [notice(announceBurst({ who: sample, defs: got, coins })),
          h('p', { class: 'muted' }, 'Plus de 3 succès d’un coup : en jeu, une seule notification (ci-dessus). Annonces individuelles :')]
        : null,
      got.slice(0, 40).map((def) => notice(announceUnlock({
        def,
        who: def.scope === 'player' ? null : sample,
        outcome: { paid: true, box: def.reward.box ? openBox(def.reward.box, Math.random) : undefined, accessoryLabel: def.reward.accessory ? accessoryLabel(def.reward.accessory) : undefined },
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
        field('Caractère', select(TRAITS.map((t) => [t, traitLabel(t)]), sim.trait, (v) => { sim.trait = v; compute(); })),
        field('Stade', select(STAGES.map((s) => [s, stageLabel(s)]), sim.stage, (v) => { sim.stage = v; compute(); })),
        h('button', { onclick: () => preset('new') }, 'Animal neuf'),
        h('button', { onclick: () => preset('month') }, 'Un mois de vie'),
        h('button', { onclick: () => preset('all') }, 'Tout débloqué'),
        field('Tout déplier', h('input', { type: 'checkbox', checked: open, onchange: (e) => setState({ open: e.target.checked ? '1' : '' }) })),
      ),
      h('details', {}, h('summary', {}, 'Compteurs de l’animal'), counters(CRITTER_KEYS, sim.stats, statLabel, soon)),
      h('details', {}, h('summary', {}, 'Marques de l’animal'), marksPicker(critterChoices, marks, soon)),
      h('details', {}, h('summary', {}, 'Compteurs et marques du joueur'), counters(PLAYER_KEYS, sim.playerStats, playerStatLabel, soon),
        marksPicker(playerChoices, playerMarks, soon)),
    ),
    h('section', { class: 'panel' }, results),
    h('section', { class: 'panel' }, notices),
  );
  compute();
}
