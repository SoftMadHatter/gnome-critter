// Page de revue (dev) : en-tête (pack, langue, onglets), état dans l'adresse
// (#tab=...&pack=...&lang=...), rechargement automatique quand le serveur
// signale un fichier modifié. L'interface de l'outil reste en français ; les
// textes du jeu suivent la langue choisie.

import { h, select, badge } from './dom.js';
import { loadData } from './data.js';
import { checkPack, checkTranslations, checkCatalog } from './checks.js';

/** [id, libellé, module] : chaque module exporte `render(racine, contexte)`. */
const TABS = [
  ['achievements', 'Succès', () => import('./tabs/achievements.js')],
  ['simulate', 'Vue en jeu', () => import('./tabs/simulate.js')],
  ['titles', 'Titres', () => import('./tabs/titles.js')],
  ['rewards', 'Récompenses', () => import('./tabs/rewards.js')],
  ['narrator', 'Le Comité', () => import('./tabs/narrator.js')],
  ['creatures', 'Créatures', () => import('./tabs/creatures.js')],
  ['items', 'Objets', () => import('./tabs/items.js')],
  ['checks', 'Contrôles', () => import('./tabs/checks.js')],
];

/** Langues des textes du jeu : [code, libellé]. */
const LANGUAGE_CHOICES = [
  ['fr', 'Français'],
  ['en', 'English'],
];

let data = null;
let state = {};
let issues = {};
/** État du flux de rechargement, réaffiché à chaque redessin de l'en-tête. */
let live = { text: 'rechargement automatique', off: false };

function readState() {
  return Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
}

function writeState() {
  const clean = Object.entries(state).filter(([, value]) => value !== '' && value !== undefined && value !== null);
  history.replaceState(null, '', `#${new URLSearchParams(clean)}`);
}

/** Met à jour l'état ; `silent` : sans redessiner (filtres gérés par l'onglet lui-même). */
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
      // Le traducteur est global et les succès sont développés au chargement : on recharge.
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
  if (id !== renderId) return; // un autre onglet a été demandé entre-temps
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
  // `?noreload` : pas de flux ouvert (captures automatiques, navigateur sans interface).
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
  state.lang = data.lang === 'fr' ? '' : data.lang; // le français, langue source, reste implicite dans l'adresse
  writeState();
  // Textes source relus en français ; hors du français, contrôles de la traduction en plus.
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
