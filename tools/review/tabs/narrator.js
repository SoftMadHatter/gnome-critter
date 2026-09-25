// Onglet « Le Système » : annonces d'un succès (plusieurs tirages), phrases
// d'ouverture et de conclusion, rafale et trophée, commentaires par longueur.

import { h, select, table } from '../dom.js';
import {
  announceUnlock, announceBurst, announceTrophy, SOBER_OPENERS, TROLL_OPENERS, TROLL_CLOSERS,
} from '../../../core/narrator.js';
import { openBox } from '../../../core/lootBoxes.js';
import { accessoryLabel } from '../../../core/accessories.js';
import { _ } from '../../../core/i18n.js';
import { categoryLabel } from '../format.js';
import { LIMITS } from '../checks.js';

function outcomeFor(def) {
  return {
    paid: true,
    box: def.reward.box ? openBox(def.reward.box, Math.random) : undefined,
    accessoryLabel: def.reward.accessory ? accessoryLabel(def.reward.accessory) : undefined,
  };
}

function notification({ title, body }) {
  const long = body.length > LIMITS.notification;
  return h('div', { class: 'notif' }, h('b', {}, `${title} — ${body.length} caractères${long ? ' (trop long)' : ''}`), body);
}

export function render(root, { pack, state, setState }) {
  const defs = pack.all;
  const current = defs.find((def) => def.id === state.def) ?? defs.find((def) => def.troll) ?? defs[0];
  const sample = pack.meta.names?.[0] ?? 'Pistache';
  const who = (def) => (def.scope === 'player' ? null : state.who || sample);
  const samples = h('div');
  const draw = () => {
    samples.replaceChildren(...[1, 2, 3].map(() => notification(announceUnlock({ def: current, who: who(current), outcome: outcomeFor(current) }))));
  };
  const trolls = defs.filter((def) => def.troll).sort((a, b) => b.quip.length - a.quip.length);

  root.append(
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Annonces du Système'),
      h(
        'div',
        { class: 'controls' },
        h(
          'select',
          { onchange: (e) => setState({ def: e.target.value }) },
          [...new Set(defs.map((def) => def.category))].map((category) =>
            h('optgroup', { label: categoryLabel(category) },
              defs.filter((def) => def.category === category).map((def) => h('option', { value: def.id, selected: def === current }, `${def.name} (${def.id})`)))),
        ),
        h('button', { onclick: () => setState({ def: defs[Math.floor(Math.random() * defs.length)].id }) }, 'Au hasard'),
        h('button', { onclick: draw }, 'Autres tirages'),
        h('input', { type: 'text', placeholder: 'Nom de l’animal', value: state.who ?? '', onchange: (e) => setState({ who: e.target.value }) }),
      ),
      h('p', { class: 'muted' }, current.troll ? `Commentaire : « ${current.quip} »` : 'Vrai succès : annonce sobre.'),
      samples,
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Rafale et trophée'),
      notification(announceBurst({ who: sample, defs: defs.slice(0, 7), coins: 45 })),
      notification(announceBurst({ who: null, defs: defs.filter((def) => def.scope === 'player').slice(0, 5) })),
      notification(announceTrophy({ label: accessoryLabel('laurel'), count: 50 })),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Phrases du Système'),
      h('div', { class: 'columns' },
        h('div', {}, h('h3', {}, 'Ouvertures (vrais succès)'), h('ul', {}, SOBER_OPENERS.map((t) => h('li', {}, _(t))))),
        h('div', {}, h('h3', {}, 'Ouvertures (bêtises)'), h('ul', {}, TROLL_OPENERS.map((t) => h('li', {}, _(t))))),
        h('div', {}, h('h3', {}, 'Conclusions (bêtises)'), h('ul', {}, TROLL_CLOSERS.map((t) => h('li', {}, t ? _(t) : '(aucune)'))))),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', {}, `Commentaires des bêtises, du plus long au plus court (${trolls.length})`),
      table(
        [
          ['Longueur', (def) => def.quip.length, 'num'],
          ['Bêtise', (def) => [h('b', {}, def.name), h('small', {}, def.id)]],
          ['Commentaire', (def) => h('span', { class: 'quip' }, def.quip)],
          ['', (def) => h('button', { onclick: () => setState({ def: def.id }) }, 'Annonces')],
        ],
        trolls,
      ),
    ),
  );
  draw();
}
