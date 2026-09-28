// "Titles" tab: every title of a species, the achievement that grants it,
// and its condition, with the checks' alerts (gendered title, duplicate).

import { h, table, badge } from '../dom.js';
import { traitLabel } from '../../../core/labels.js';
import { categoryLabel, conditionText } from '../format.js';

export function render(root, { pack, issues }) {
  const titled = pack.all.filter((def) => def.title).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  const sample = pack.meta.names?.[0] ?? 'Pistache';
  const alerts = (def) => (issues[pack.id] ?? []).filter((issue) => issue.id === def.id && /titre|title/.test(issue.message));
  root.append(
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, `Titres — ${pack.meta.displayName ?? pack.id} (${titled.length})`),
      h(
        'p',
        { class: 'muted' },
        'Un titre se gagne au dernier palier d’une série (ou avec certaines bêtises), se choisit dans la rangée « Titre » ',
        'du menu de l’animal et s’affiche sous son nom : « Minou, as de la sieste ». Il doit rester invariable (pas de genre).',
      ),
      table(
        [
          ['Titre', (def) => h('b', {}, def.title)],
          ['Aperçu', (def) => `${sample}, ${def.title}`],
          ['Succès', (def) => [def.name, def.troll ? badge('bêtise', 'troll') : null, h('small', {}, `${categoryLabel(def.category)} · ${def.id}`)]],
          ['Condition', (def) => [conditionText(def), def.requires.trait ? h('small', {}, `caractère ${traitLabel(def.requires.trait)}`) : null]],
          ['Alertes', (def) => alerts(def).map((issue) => h('div', { class: 'warning-text' }, issue.message))],
        ],
        titled,
      ),
    ),
  );
}
