// Onglet « Contrôles » : erreurs de structure et avertissements sur les
// textes (voir checks.js), pour le pack affiché ou pour tous les packs.

import { h, select, table, badge } from '../dom.js';

const LEVELS = { error: ['erreur', 'error'], warning: ['à vérifier', 'warning'] };

export function render(root, { data, state, setState, issues }) {
  const scope = state.scope === 'all' ? data.ids : [state.pack];
  const level = state.level ?? '';
  root.append(
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Contrôles'),
      h(
        'p',
        { class: 'muted' },
        'Les erreurs reprennent les règles de tests/packs.test.js ; les avertissements signalent des textes à relire ',
        '(typographie, doublons, longueurs, titres genrés, descriptions de paliers identiques).',
      ),
      h(
        'div',
        { class: 'controls' },
        select([['', 'Ce pack'], ['all', 'Tous les packs']], state.scope ?? '', (v) => setState({ scope: v })),
        select([['', 'Erreurs et avertissements'], ['error', 'Erreurs seulement'], ['warning', 'Avertissements seulement']], level, (v) =>
          setState({ level: v }),
        ),
      ),
    ),
  );
  for (const id of scope) {
    const pack = data.packs[id];
    const found = (issues[id] ?? []).filter((issue) => !level || issue.level === level);
    const errors = found.filter((issue) => issue.level === 'error').length;
    root.append(
      h(
        'section',
        { class: 'panel' },
        h(
          'h2',
          {},
          pack.meta.displayName ?? id,
          errors > 0 ? badge(`${errors} erreur${errors > 1 ? 's' : ''}`, 'error') : badge('aucune erreur', 'ok'),
          badge(`${found.length - errors} à vérifier`, found.length - errors > 0 ? 'warning' : ''),
        ),
        table(
          [
            ['Niveau', (issue) => badge(LEVELS[issue.level][0], LEVELS[issue.level][1]), 'nowrap'],
            ['Succès', (issue) => issue.id ?? '—', 'nowrap'],
            ['Message', (issue) => issue.message],
          ],
          found,
          { empty: 'Rien à signaler.' },
        ),
      ),
    );
  }
}
