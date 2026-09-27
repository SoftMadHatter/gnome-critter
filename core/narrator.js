// Le Comité : la voix des notifications de succès, façon animateur de jeu
// cynique. Sobre pour un vrai succès, déchaîné pour une bêtise ; il tutoie le
// joueur et se moque de lui, jamais de l'animal. Module pur (hasard injecté).
// Les textes des succès (nom, commentaire, récompense) arrivent déjà traduits
// par buildAchievements ; les phrases du Comité sont traduites ici.

import { boxLabel } from './lootBoxes.js';
import { formatCount } from './achievements.js';
import { accessoryLabel } from './accessories.js';
import { _, N_, ngettext, fmt } from './i18n.js';

/** Nom du narrateur (texte source ; affiché traduit). */
export const NARRATOR = N_('Le Comité');

export const SOBER_OPENERS = [N_('Nouveau succès !'), N_('Succès débloqué.'), N_('Le Comité prend note.')];
export const TROLL_OPENERS = [
  N_('Nouveau succès !'),
  N_('Bêtise débloquée !'),
  N_('Attention, succès en approche.'),
  N_('Le Comité a tout vu.'),
];
/** `null` : pas de conclusion. */
export const TROLL_CLOSERS = [
  N_('Les spectateurs adorent.'),
  N_('Nos sponsors se désolidarisent.'),
  N_('Ce succès ne compte pour rien. Comme les autres.'),
  N_('Applaudissements enregistrés.'),
  N_("Le Comité n'en revient pas."),
  N_('Personne ne te jugera. Sauf le Comité.'),
  null,
];

const pick = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];
const translated = (text) => (text ? _(text) : null);

/** Nom d'un succès entre guillemets, suivi d'un point sauf s'il finit déjà par une ponctuation forte. */
function quoted(name) {
  const text = fmt(_('« {name} »'), { name });
  return /[?!.…]$/.test(name) ? text : `${text}.`;
}

/** Sujet de l'annonce : le nom de l'animal et celui du succès, ou le succès seul (succès du joueur). */
function subject(who, name) {
  return who ? fmt(_('{name} : {achievement}'), { name: who, achievement: quoted(name) }) : quoted(name);
}

export function coinsText(n) {
  return fmt(ngettext('{n} pièce', '{n} pièces', n), { n: formatCount(n) });
}

const feeText = (reward) => reward.text ?? _('frais de dossier');

/**
 * Texte de la récompense reçue.
 * @param {{coins?: number, box?: string, accessory?: string, text?: string}} reward récompense du succès (textes déjà traduits)
 * @param {{paid?: boolean, box?: {text: string}, accessoryLabel?: string}} [outcome] ce qui s'est passé :
 *   frais de dossier payés ou non, contenu de la boîte, nom de l'accessoire
 */
export function rewardText(reward, outcome = {}) {
  if (reward.box) return fmt(_('{box}… qui contient : {content}.'), { box: boxLabel(reward.box), content: outcome.box?.text ?? _('rien') });
  if (reward.accessory) {
    const accessory = (outcome.accessoryLabel ?? accessoryLabel(reward.accessory)).toLowerCase();
    return fmt(_('{accessory}. À porter, si tu oses.'), { accessory });
  }
  if (reward.coins < 0) {
    return outcome.paid
      ? fmt(_('−{coins} ({fee}).'), { coins: coinsText(-reward.coins), fee: feeText(reward) })
      : fmt(_('des {fee} que tu ne peux même pas payer. Touchant.'), { fee: feeText(reward) });
  }
  if (reward.coins > 0) return `${reward.text ?? coinsText(reward.coins)}.`;
  if (reward.text) return `${reward.text}.`;
  return _('rien. Absolument rien.');
}

/** Récompense annoncée d'un succès, telle que la fenêtre de progression la rappelle. */
export function rewardLabel(reward) {
  if (reward.box) return boxLabel(reward.box);
  if (reward.accessory) return accessoryLabel(reward.accessory).toLowerCase();
  if (reward.coins < 0) return fmt(_('−{coins} ({fee})'), { coins: coinsText(-reward.coins), fee: feeText(reward) });
  if (reward.coins > 0) return reward.text ?? coinsText(reward.coins);
  return reward.text ?? _('rien');
}

/**
 * Annonce d'un succès.
 * @param {{def: object, who?: string|null, outcome?: object, random?: () => number}} params
 *   who : nom de l'animal, ou null pour un succès du joueur
 * @returns {{title: string, body: string}}
 */
export function announceUnlock({ def, who = null, outcome = {}, random = Math.random }) {
  const title = _(NARRATOR);
  if (!def.troll) {
    const coins = def.reward?.coins ?? 0;
    const reward = fmt(_('Récompense : {reward}.'), { reward: coins > 0 ? coinsText(coins) : _('la gloire') });
    return { title, body: [_(pick(SOBER_OPENERS, random)), subject(who, def.name), reward].join(' ') };
  }
  const parts = [
    _(pick(TROLL_OPENERS, random)),
    subject(who, def.name),
    def.quip,
    fmt(_('Récompense : {reward}'), { reward: rewardText(def.reward, outcome) }),
    translated(pick(TROLL_CLOSERS, random)),
  ];
  return { title, body: parts.filter(Boolean).join(' ') };
}

/**
 * Rafale de succès (rattrapage d'un animal ancien, gros progrès) : une seule notification.
 * @param {{who?: string|null, defs: object[], coins?: number}} params
 */
export function announceBurst({ who = null, defs, coins = 0 }) {
  const names = defs.slice(0, 3).map((def) => fmt(_('« {name} »'), { name: def.name }));
  const list = names.length > 1 ? fmt(_('{first} et {last}'), { first: names.slice(0, -1).join(', '), last: names[names.length - 1] }) : names[0];
  const count = defs.length;
  const parts = [
    who
      ? fmt(ngettext(
        "Le Comité a pris du retard : {name} obtient {count} succès d'un coup, dont {list}.",
        "Le Comité a pris du retard : {name} obtient {count} succès d'un coup, dont {list}.",
        count,
      ), { name: who, count, list })
      : fmt(ngettext(
        "Le Comité a pris du retard : tu obtiens {count} succès d'un coup, dont {list}.",
        "Le Comité a pris du retard : tu obtiens {count} succès d'un coup, dont {list}.",
        count,
      ), { count, list }),
  ];
  const trolls = defs.filter((def) => def.troll).length;
  if (trolls > 0) {
    parts.push(fmt(ngettext('Dont {n} bêtise. Le Comité ne dira rien.', 'Dont {n} bêtises. Le Comité ne dira rien.', trolls), { n: trolls }));
  }
  if (coins > 0) parts.push(fmt(_('+{coins}.'), { coins: coinsText(coins) }));
  return { title: _(NARRATOR), body: parts.join(' ') };
}

/** Trophée gagné au nombre total de succès. */
export function announceTrophy({ label, count }) {
  return {
    title: _(NARRATOR),
    body: fmt(
      ngettext(
        '{count} succès. Tu as droit à : {trophy}. Le Comité est presque impressionné.',
        '{count} succès. Tu as droit à : {trophy}. Le Comité est presque impressionné.',
        count,
      ),
      { count: formatCount(count), trophy: label.toLowerCase() },
    ),
  };
}
