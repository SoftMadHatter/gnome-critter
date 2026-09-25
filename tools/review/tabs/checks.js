// Onglet « Contrôles » : erreurs de structure et avertissements sur les
// textes (voir checks.js), pour le pack affiché ou pour tous les packs ;
// hors du français, contrôles du catalogue de la langue et des traductions.

import { h, select, table, badge } from '../dom.js';

const LEVELS = { error: ['erreur', 'error'], warning: ['à vérifier', 'warning'], info: ['info', ''] };

function issuesTable(found, subject) {
  return table(
    [
      ['Niveau', (issue) => badge(LEVELS[issue.level][0], LEVELS[issue.level][1]), 'nowrap'],
      [subject, (issue) => issue.id ?? '—', subject === 'Succès' ? 'nowrap' : ''],
      ['Message', (issue) => issue.message],
    ],
    found,
    { empty: 'Rien à signaler.' },
  );
}

function counts(found) {
  const errors = found.filter((issue) => issue.level === 'error').length;
  const warnings = found.filter((issue) => issue.level === 'warning').length;
  const infos = found.length - errors - warnings;
  return [
    errors > 0 ? badge(`${errors} erreur${errors > 1 ? 's' : ''}`, 'error') : badge('aucune erreur', 'ok'),
    badge(`${warnings} à vérifier`, warnings > 0 ? 'warning' : ''),
    infos > 0 ? badge(`${infos} info${infos > 1 ? 's' : ''}`) : null,
  ];
}

export function render(root, { data, state, setState, issues }) {
  const scope = state.scope === 'all' ? data.ids : [state.pack];
  const level = state.level ?? '';
  const keep = (issue) => !level || issue.level === level;
  root.append(
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Contrôles'),
      h(
        'p',
        { class: 'muted' },
        'Les erreurs reprennent les règles de tests/packs.test.js ; les avertissements signalent des textes à relire ',
        '(typographie, doublons, longueurs, titres genrés, descriptions de paliers identiques). Ces contrôles portent ',
        'sur les textes source, en français.',
        data.catalog
          ? ` Langue « ${data.lang} » : catalogue po/${data.lang}.po (traductions manquantes, espaces réservés, textes identiques `
            + 'au français) et section translations de chaque pack.json, comme tests/i18n.test.js.'
          : '',
      ),
      h(
        'div',
        { class: 'controls' },
        select([['', 'Ce pack'], ['all', 'Tous les packs']], state.scope ?? '', (v) => setState({ scope: v })),
        select(
          [['', 'Tous les niveaux'], ['error', 'Erreurs seulement'], ['warning', 'Avertissements seulement'], ['info', 'Infos seulement']],
          level,
          (v) => setState({ level: v }),
        ),
      ),
    ),
  );
  if (data.catalog) {
    const found = data.catalogIssues.filter(keep);
    root.append(
      h(
        'section',
        { class: 'panel' },
        h('h2', {}, `Catalogue po/${data.lang}.po (${data.catalog.entries.length} textes)`, ...counts(found)),
        issuesTable(found, 'Texte source'),
      ),
    );
  }
  for (const id of scope) {
    const pack = data.packs[id];
    const found = (issues[id] ?? []).filter(keep);
    root.append(
      h(
        'section',
        { class: 'panel' },
        h('h2', {}, pack.meta.displayName ?? id, ...counts(found)),
        issuesTable(found, 'Succès'),
      ),
    );
  }
}
