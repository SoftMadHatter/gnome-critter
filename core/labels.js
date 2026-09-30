// Displayed labels (counters, achievement categories, stages, traits,
// items) and duration formatting. The tables keep the source texts
// (French, marked with N_ for extraction); the functions translate at
// display time, once the language is known (see core/i18n.js). Pure
// module: shared by the extension, the tests and the review tool.

import { _, N_, fmt } from './i18n.js';
import { FOOD_PRICES } from './accessories.js';

/** An animal's counters and facts. */
export const STAT_LABELS = {
  meals: N_('Repas'),
  mealsFavorite: N_('Repas préférés'),
  playSessions: N_('Parties de jeu'),
  ballKicks: N_('Coups de balle'),
  brushes: N_('Brossages'),
  purrs: N_('Ronronnements'),
  pets: N_('Caresses'),
  greets: N_('Salutations'),
  climbs: N_('Escalades'),
  flights: N_('Vols'),
  dives: N_('Piqués'),
  swims: N_('Nages'),
  runs: N_('Courses'),
  naps: N_('Siestes'),
  longestSleepSeconds: N_('Plus longue sieste'),
  tricksPerformed: N_('Tours réussis'),
  giftsGiven: N_('Cadeaux offerts'),
  hunts: N_('Proies attrapées'),
  grazes: N_('Grignotages'),
  reliefs: N_('Soulagements'),
  accidents: N_('Accidents'),
  tickles: N_('Chatouilles'),
  startles: N_('Sursauts'),
  awakenings: N_('Réveils'),
  annoyances: N_('Agacements'),
  sicknesses: N_('Indigestions'),
  birthdays: N_('Anniversaires'),
  drags: N_('Voyages à la souris'),
  falls: N_('Chutes'),
  follows: N_('Filatures du curseur'),
  flees: N_('Fuites'),
  chases: N_('Poursuites'),
  washes: N_('Toilettes'),
  ceilingWalks: N_('Marches au plafond'),
  hibernations: N_('Hibernations'),
  laserChases: N_('Poursuites du laser'),
  ringPushes: N_("Coups de museau à l'anneau"),
  leftovers: N_('Restes laissés'),
  sleepSeconds: N_('Temps de sommeil'),
  eggPets: N_("Caresses à l'œuf"),
  hovers: N_('Survols'),
  renames: N_('Changements de nom'),
  overfeeds: N_('Repas forcés'),
  pointlessBrushes: N_('Brossages inutiles'),
  trickFails: N_('Tours ratés'),
  hibernationWakes: N_("Réveils d'hibernation"),
  rescues: N_("Sorties d'écran"),
  typingWatches: N_('Séances de dactylo'),
  notificationsSeen: N_('Notifications remarquées'),
  daysAlive: N_('Jours de vie'),
  stageReached: N_('Stade atteint'),
  tricksLearned: N_('Tours appris'),
  achievementsUnlocked: N_('Succès obtenus'),
};

/** The player's counters and facts ("You" achievements). */
export const PLAYER_STAT_LABELS = {
  menuOpens: N_('Ouvertures du menu'),
  contextMenuOpens: N_("Ouvertures du menu d'un animal"),
  settingsOpens: N_('Ouvertures des réglages'),
  progressOpens: N_('Ouvertures de la progression'),
  journalOpens: N_('Ouvertures du journal'),
  vacations: N_('Départs en vacances'),
  laserToggles: N_('Allumages du laser'),
  clears: N_('Bureaux vidés'),
  tidies: N_('Jouets rangés'),
  itemsRemoved: N_('Objets retirés (clic droit)'),
  preyDrops: N_('Proies lâchées'),
  bowlOverfills: N_('Gamelles pleines remplies'),
  coinsSpent: N_('Pièces dépensées'),
  messesCleaned: N_('Traces nettoyées'),
  giftsCollected: N_('Cadeaux ramassés'),
  coins: N_('Pièces en poche'),
  accessoriesOwned: N_('Accessoires possédés'),
};

/** Mark families (`marks` conditions of achievements). */
export const MARK_FAMILY_LABELS = {
  food: N_('Aliments goûtés'),
  toy: N_('Jouets essayés'),
  accessory: N_('Accessoires portés'),
  gift: N_('Sortes de présents'),
  bed: N_('Lits essayés'),
  season: N_('Saisons vécues'),
  holiday: N_('Fêtes vécues'),
  moment: N_('Moments'),
  state: N_('États'),
  desk: N_('Bureau'),
  shop: N_('Boutique'),
};

/** Categories of the progress window. */
export const CATEGORY_LABELS = {
  care: N_('Soins'),
  play: N_('Jeu'),
  exploration: N_('Exploration'),
  life: N_('Vie'),
  collection: N_('Collection'),
  seasons: N_('Saisons'),
  player: N_('Toi'),
};

export const STAGE_LABELS = { egg: N_('Œuf'), baby: N_('Bébé'), young: N_('Jeune'), adult: N_('Adulte'), senior: N_('Senior') };

export const TRAIT_LABELS = { playful: N_('joueur'), lazy: N_('paresseux'), greedy: N_('gourmand'), shy: N_('timide') };

export const EVOLUTION_LABELS = { devoted: N_('choyé'), neglected: N_('négligé') };

export const FOOD_LABELS = {
  meat: N_('Viande'),
  fish: N_('Poisson'),
  pate: N_('Pâtée'),
  kibble: N_('Croquettes'),
  seeds: N_('Graines'),
  mealworms: N_('Vers de farine'),
  apple: N_('Pomme'),
  plankton: N_('Plancton'),
  flakes: N_('Flocons'),
};

export const TOY_LABELS = { ball: N_('Balle'), yarn: N_('Pelote de laine'), plush: N_('Peluche'), ring: N_('Anneau flottant') };

export const BED_LABELS = { cushion: N_('Coussin'), basket: N_('Panier'), cradle: N_('Couffin') };

export const BOWL_LABELS = { ceramic: N_('Céramique'), steel: N_('Inox'), wood: N_('Bois') };

export const PREY_LABELS = { mouse: N_('Souris'), beetle: N_('Scarabée'), aphid: N_('Puceron'), krill: N_('Krill') };

export const PLANT_LABELS = { grass: N_('Herbe'), berries: N_('Baies'), leaf: N_('Feuille'), algae: N_('Algue') };

const label = (table, key) => (table[key] ? _(table[key]) : key);

export const statLabel = (key) => label(STAT_LABELS, key);
export const playerStatLabel = (key) => label(PLAYER_STAT_LABELS, key);
export const markFamilyLabel = (family) => label(MARK_FAMILY_LABELS, family);
export const categoryLabel = (id) => label(CATEGORY_LABELS, id);
export const stageLabel = (stage) => label(STAGE_LABELS, stage);
export const traitLabel = (trait) => label(TRAIT_LABELS, trait);
export const toyLabel = (kind) => label(TOY_LABELS, kind);
export const bedLabel = (model) => label(BED_LABELS, model);
export const bowlLabel = (model) => label(BOWL_LABELS, model);
export const preyLabel = (kind) => label(PREY_LABELS, kind);
export const plantLabel = (kind) => label(PLANT_LABELS, kind);

/** Label of a food with its price (premium foods only), for `portions` portions. */
export function foodLabel(kind, portions = 1) {
  const price = (FOOD_PRICES[kind] ?? 0) * portions;
  const name = label(FOOD_LABELS, kind);
  return price > 0 ? fmt(_('{food} ({price} pièces)'), { food: name, price }) : name;
}

/** Compact duration: "12 min", "45 s". */
export function formatSeconds(seconds) {
  return seconds >= 60 ? fmt(_('{n} min'), { n: Math.floor(seconds / 60) }) : fmt(_('{n} s'), { n: seconds });
}

/** Long duration: "3 h 20 min", "12 min". */
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? fmt(_('{h} h {m} min'), { h: hours, m: minutes }) : fmt(_('{n} min'), { n: minutes });
}

/** Value of a counter in the statistics tab. */
export function statValue(key, value) {
  if (key === 'longestSleepSeconds') return formatSeconds(value);
  if (key === 'sleepSeconds') return formatDuration(value);
  return String(value);
}

/** Short journal date: "12/09 14:30". */
export function formatJournalDate(ms) {
  const d = new Date(ms);
  const two = (n) => String(n).padStart(2, '0');
  return fmt(_('{day}/{month} {hour}:{minute}'), {
    day: two(d.getDate()), month: two(d.getMonth() + 1), hour: two(d.getHours()), minute: two(d.getMinutes()),
  });
}

/** Compact age: "12 min", "5 h", "3 j" (day, in the French text). */
export function formatAge(seconds) {
  if (seconds < 3600) return fmt(_('{n} min'), { n: Math.floor(seconds / 60) });
  if (seconds < 48 * 3600) return fmt(_('{n} h'), { n: Math.floor(seconds / 3600) });
  return fmt(_('{n} j'), { n: Math.floor(seconds / 86400) });
}

/** "Adult, playful, devoted, 3 d" (+ "hibernating" if applicable). */
export function lifeSummary(life) {
  const parts = [stageLabel(life.stage)];
  if (life.trait) parts.push(traitLabel(life.trait));
  if (EVOLUTION_LABELS[life.evolution]) parts.push(_(EVOLUTION_LABELS[life.evolution]));
  parts.push(formatAge(life.ageSeconds));
  if (life.hibernating) parts.push(_('hibernation'));
  return parts.join(', ');
}
