// Review page (dev): header (pack, language, tabs), state in the address
// (#tab=...&pack=...&lang=...), automatic reload when the server signals a
// changed file. The tool's own interface stays in French; the game's text
// follows the chosen language.

import { h, select, badge } from './dom.js';
import { loadData } from './data.js';
import { checkPack, checkTranslations, checkCatalog } from './checks.js';

/** [id, label, module]: each module exports `render(root, context)`. */
const TABS = [
  ['achievements', 'Succès', () => import('./tabs/achievements.js')],
  ['simulate', 'Vue en jeu', () => import('./tabs/simulate.js')],
  ['titles', 'Titres', () => import('./tabs/titles.js')],
  ['rewards', 'Récompenses', () => import('./tabs/rewards.js')],
  ['narrator', 'Le Comité', () => import('./tabs/narrator.js')],
  ['creatures', 'Créatures', () => import('./tabs/creatures.js')],
  ['anchors', 'Ancrages', () => import('./tabs/anchors.js')],
  ['items', 'Objets', () => import('./tabs/items.js')],
  ['checks', 'Contrôles', () => import('./tabs/checks.js')],
];

/** Languages for the game's text: [code, label]. */
const LANGUAGE_CHOICES = [
  ['fr', 'Français'],
  ['en', 'English'],
];

let data = null;
let state = {};
let issues = {};
/** State of the reload stream, redisplayed on every header redraw. */
let live = { text: 'rechargement automatique', off: false };

function readState() {
  return Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
}

function writeState() {
  const clean = Object.entries(state).filter(([, value]) => value !== '' && value !== undefined && value !== null);
  history.replaceState(null, '', `#${new URLSearchParams(clean)}`);
}

/** Updates the state; `silent`: without redrawing (filters handled by the tab itself). */
function setState(patch, { silent = false } = {}) {
  state = { ...state, ...patch };
  writeState();
  if (!silent) {
    renderHeader();
    renderTab();
  }
}

function renderHeader() {
  const found = issues[state.pack] ?? [];
  const errors = found.filter((issue) => issue.level === 'error').length;
  const warnings = found.filter((issue) => issue.level === 'warning').length;
  const packLabel = (id) => {
    const name = data.packs[id].meta.displayName;
    return name ? `${name} (${id})` : id;
  };
  document.getElementById('top').replaceChildren(
    h('h1', {}, 'Revue Critter'),
    select(data.ids.map((id) => [id, packLabel(id)]), state.pack, (pack) => setState({ pack }), { title: 'Espèce' }),
    select(LANGUAGE_CHOICES, data.lang, (lang) => {
      // The translator is global and achievements are expanded at load time: reload.
      state.lang = lang;
      writeState();
      location.reload();
    }, { title: 'Langue des textes du jeu' }),
    h(
      'nav',
      { class: 'tabs' },
      TABS.map(([id, label]) =>
        h(
          'button',
          { class: id === state.tab ? 'active' : '', onclick: () => setState({ tab: id }) },
          label,
          id === 'checks' && errors > 0 ? badge(errors, 'error') : null,
          id === 'checks' && warnings > 0 ? badge(warnings, 'warning') : null,
        ),
      ),
    ),
    h('span', { class: `status${live.off ? ' off' : ''}`, id: 'status' }, live.text),
  );
}

let renderId = 0;
async function renderTab() {
  const id = ++renderId;
  const main = document.getElementById('main');
  const [, , load] = TABS.find(([tab]) => tab === state.tab);
  const module = await load();
  if (id !== renderId) return; // a different tab was requested in the meantime
  main.replaceChildren();
  module.render(main, { data, pack: data.packs[state.pack], state, setState, issues });
}

function listen() {
  const status = (text, off = false) => {
    live = { text, off };
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('off', off);
  };
  // `?noreload`: no stream opened (automated captures, headless browser).
  if (new URLSearchParams(location.search).has('noreload')) {
    status('sans rechargement automatique');
    return;
  }
  const events = new EventSource('/api/events');
  events.addEventListener('change', () => location.reload());
  events.onopen = () => status('rechargement automatique');
  events.onerror = () => status('serveur arrêté : plus de rechargement', true);
}

async function main() {
  state = readState();
  try {
    data = await loadData(state.lang);
  } catch (e) {
    document.getElementById('main').replaceChildren(
      h('p', { class: 'error-text' }, `Chargement impossible : ${e.message}`),
      h('p', { class: 'muted' }, 'Lance la page avec scripts/review.sh.'),
    );
    return;
  }
  if (!data.packs[state.pack]) state.pack = data.ids.includes('cat') ? 'cat' : data.ids[0];
  if (!TABS.some(([id]) => id === state.tab)) state.tab = TABS[0][0];
  state.lang = data.lang === 'fr' ? '' : data.lang; // French, the source language, stays implicit in the address
  writeState();
  // Source text reviewed in French; outside of French, translation checks are added.
  issues = Object.fromEntries(data.ids.map((id) => {
    const pack = data.packs[id];
    return [id, [...checkPack(pack.french ?? pack), ...(pack.french ? checkTranslations(pack) : [])]];
  }));
  data.catalogIssues = data.catalog ? checkCatalog(data.catalog) : [];
  renderHeader();
  renderTab();
  listen();
}

main();
