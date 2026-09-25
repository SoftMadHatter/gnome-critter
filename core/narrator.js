// Le Système : la voix des notifications de succès, façon animateur de jeu
// cynique. Sobre pour un vrai succès, déchaîné pour une bêtise ; il tutoie le
// joueur et se moque de lui, jamais de l'animal. Module pur (hasard injecté).

import { BOX_LABELS } from './lootBoxes.js';
import { formatCount } from './achievements.js';
import { ACCESSORIES } from './accessories.js';

export const NARRATOR = 'Le Système';

export const SOBER_OPENERS = ['Nouveau succès !', 'Succès débloqué.', 'Le Système prend note.'];
export const TROLL_OPENERS = ['Nouveau succès !', 'Bêtise débloquée !', 'Attention, succès en approche.', 'Le Système a tout vu.'];
export const TROLL_CLOSERS = [
  'Les spectateurs adorent.',
  'Nos sponsors se désolidarisent.',
  'Ce succès ne compte pour rien. Comme les autres.',
  'Applaudissements enregistrés.',
  "Le Système n'en revient pas.",
  'Personne ne te jugera. Sauf le Système.',
  '',
];

const pick = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/** « Nom » suivi d'un point, sauf si le nom finit déjà par une ponctuation forte. */
const quoted = (name) => `« ${name} »${/[?!.…]$/.test(name) ? '' : '.'}`;

export function coinsText(n) {
  return `${formatCount(n)} pièce${n > 1 ? 's' : ''}`;
}

/**
 * Texte de la récompense reçue.
 * @param {{coins?: number, box?: string, accessory?: string, text?: string}} reward récompense du succès
 * @param {{paid?: boolean, box?: {text: string}, accessoryLabel?: string}} [outcome] ce qui s'est passé :
 *   frais de dossier payés ou non, contenu de la boîte, nom de l'accessoire
 */
export function rewardText(reward, outcome = {}) {
  if (reward.box) return `${BOX_LABELS[reward.box]}… qui contient : ${outcome.box?.text ?? 'rien'}.`;
  if (reward.accessory) return `${(outcome.accessoryLabel ?? reward.accessory).toLowerCase()}. À porter, si tu oses.`;
  if (reward.coins < 0) {
    const fee = reward.text ?? 'frais de dossier';
    return outcome.paid ? `−${coinsText(-reward.coins)} (${fee}).` : `des ${fee} que tu ne peux même pas payer. Touchant.`;
  }
  if (reward.coins > 0) return `${reward.text ?? coinsText(reward.coins)}.`;
  if (reward.text) return `${reward.text}.`;
  return 'rien. Absolument rien.';
}

/** Récompense annoncée d'un succès, telle que la fenêtre de progression la rappelle. */
export function rewardLabel(reward) {
  if (reward.box) return BOX_LABELS[reward.box];
  if (reward.accessory) return (ACCESSORIES[reward.accessory]?.label ?? reward.accessory).toLowerCase();
  if (reward.coins < 0) return `−${coinsText(-reward.coins)} (${reward.text ?? 'frais de dossier'})`;
  if (reward.coins > 0) return reward.text ?? coinsText(reward.coins);
  return reward.text ?? 'rien';
}

/**
 * Annonce d'un succès.
 * @param {{def: object, who?: string|null, outcome?: object, random?: () => number}} params
 *   who : nom de l'animal, ou null pour un succès du joueur
 * @returns {{title: string, body: string}}
 */
export function announceUnlock({ def, who = null, outcome = {}, random = Math.random }) {
  const subject = who ? `${who} : ` : '';
  if (!def.troll) {
    const coins = def.reward?.coins ?? 0;
    return {
      title: NARRATOR,
      body: `${pick(SOBER_OPENERS, random)} ${subject}${quoted(def.name)} Récompense : ${coins > 0 ? coinsText(coins) : 'la gloire'}.`,
    };
  }
  const parts = [
    `${pick(TROLL_OPENERS, random)} ${subject}${quoted(def.name)}`,
    def.quip,
    `Récompense : ${rewardText(def.reward, outcome)}`,
    pick(TROLL_CLOSERS, random),
  ];
  return { title: NARRATOR, body: parts.filter(Boolean).join(' ') };
}

/**
 * Rafale de succès (rattrapage d'un animal ancien, gros progrès) : une seule notification.
 * @param {{who?: string|null, defs: object[], coins?: number}} params
 */
export function announceBurst({ who = null, defs, coins = 0 }) {
  const names = defs.slice(0, 3).map((def) => `« ${def.name} »`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}` : names[0];
  const trolls = defs.filter((def) => def.troll).length;
  const extra = trolls > 0 ? ` Dont ${trolls} bêtise${trolls > 1 ? 's' : ''}. Le Système ne dira rien.` : '';
  const gain = coins > 0 ? ` +${coinsText(coins)}.` : '';
  return {
    title: NARRATOR,
    body: `Le Système a pris du retard : ${who ? `${who} obtient` : 'tu obtiens'} ${defs.length} succès d'un coup, dont ${list}.${extra}${gain}`,
  };
}

/** Trophée gagné au nombre total de succès. */
export function announceTrophy({ label, count }) {
  return {
    title: NARRATOR,
    body: `${formatCount(count)} succès. Tu as droit à : ${label.toLowerCase()}. Le Système est presque impressionné.`,
  };
}
