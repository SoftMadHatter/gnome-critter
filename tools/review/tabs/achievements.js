// Onglet « Succès » : tous les succès d'une espèce tels que le jeu les
// développe, avec filtres, recherche, origine (bibliothèque ou pack) et copie
// du gabarit source pour en ajouter un nouveau.

import { h, select, table, badge, debounce, copyText, percent } from '../dom.js';
import { DISPLAY_ORDER, isEligible } from '../../../core/achievements.js';
import { rewardLabel } from '../../../core/narrator.js';
import { TRAIT_LABELS, traitLabel } from '../../../core/labels.js';
import { categoryLabel, conditionText, requiresText } from '../format.js';

const KINDS = [
  ['', 'Tous'],
  ['real', 'Vrais succès'],
  ['troll', 'Bêtises'],
  ['player', 'Succès du joueur'],
];
const ORIGINS = { library: ['bibliothèque', ''], pack: ['pack', 'pack'], override: ['remplacé par le pack', 'pack'] };

function matchesKind(def, kind) {
  if (kind === 'real') return !def.troll && def.scope === 'critter';
  if (kind === 'troll') return def.troll && def.scope === 'critter';
  if (kind === 'player') return def.scope === 'player';
  return true;
}

function matchesText(def, query) {
  if (!query) return true;
  const haystack = [def.id, def.name, def.description, def.quip, def.title, def.series].filter(Boolean).join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => haystack.includes(word));
}

function summary(pack) {
  const counts = new Map(DISPLAY_ORDER.map((id) => [id, 0]));
  for (const def of pack.all) counts.set(def.category, (counts.get(def.category) ?? 0) + 1);
  const trolls = pack.all.filter((def) => def.troll).length;
  return h(
    'div',
    { class: 'summary' },
    [...counts].filter(([, n]) => n > 0).map(([id, n]) => h('span', {}, `${categoryLabel(id)} `, h('b', {}, n))),
    h('span', {}, '— total ', h('b', {}, pack.all.length)),
    h('span', {}, 'bêtises ', h('b', {}, percent(trolls / pack.all.length))),
    h('span', {}, 'titres ', h('b', {}, pack.all.filter((def) => def.title).length)),
  );
}

export function render(root, { pack, state, setState }) {
  const filters = { trait: state.trait ?? '', category: state.category ?? '', kind: state.kind ?? '', q: state.q ?? '' };
  const results = h('div');

  const update = () => {
    setState(filters, { silent: true });
    const order = (def) => DISPLAY_ORDER.indexOf(def.category);
    const rows = pack.all
      .filter((def) => !filters.trait || isEligible(def, { trait: filters.trait }))
      .filter((def) => !filters.category || def.category === filters.category)
      .filter((def) => matchesKind(def, filters.kind))
      .filter((def) => matchesText(def, filters.q))
      .sort((a, b) => order(a) - order(b));
    results.replaceChildren(
      h('p', { class: 'muted' }, `${rows.length} succès affichés.`),
      table(
        [
          ['Rubrique', (def) => categoryLabel(def.category), 'nowrap'],
          ['Succès', (def) => [
            h('b', {}, def.name),
            def.troll ? badge('bêtise', 'troll') : null,
            badge(ORIGINS[pack.origin(def)][0], ORIGINS[pack.origin(def)][1]),
            h('small', {}, def.description),
            h('small', {}, def.id),
          ]],
          ['Condition', (def) => conditionText(def)],
          ['Récompense', (def) => rewardLabel(def.reward)],
          ['Titre', (def) => def.title ?? ''],
          ['Exigences', (def) => requiresText(def)],
          ['Commentaire du Comité', (def) => (def.quip ? h('span', { class: 'quip' }, def.quip) : '')],
          ['', (def) => h('button', { title: 'Copier le gabarit source (JSON)', onclick: () => copyText(JSON.stringify(pack.source(def), null, 2)) }, 'Copier')],
        ],
        rows,
        { empty: 'Aucun succès ne correspond aux filtres.' },
      ),
    );
  };
  const refresh = debounce(update);

  root.append(
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, `Succès — ${pack.meta.displayName ?? pack.id}`),
      summary(pack),
      h(
        'div',
        { class: 'controls' },
        select([['', 'Tous caractères'], ...Object.keys(TRAIT_LABELS).map((t) => [t, traitLabel(t)])], filters.trait, (v) => {
          filters.trait = v;
          update();
        }),
        select([['', 'Toutes rubriques'], ...DISPLAY_ORDER.map((id) => [id, categoryLabel(id)])], filters.category, (v) => {
          filters.category = v;
          update();
        }),
        select(KINDS, filters.kind, (v) => {
          filters.kind = v;
          update();
        }),
        h('input', {
          type: 'search',
          placeholder: 'Rechercher (id, nom, description, commentaire, titre)',
          value: filters.q,
          oninput: (e) => {
            filters.q = e.target.value;
            refresh();
          },
        }),
      ),
      results,
    ),
  );
  update();
}
