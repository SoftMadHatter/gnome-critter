// Libellés français des compteurs de vie et des rubriques de succès, pour la
// fenêtre de progression.

export const STAT_LABELS = {
  meals: 'Repas',
  mealsFavorite: 'Repas préférés',
  playSessions: 'Parties de jeu',
  ballKicks: 'Coups de balle',
  brushes: 'Brossages',
  purrs: 'Ronronnements',
  pets: 'Caresses',
  greets: 'Salutations',
  climbs: 'Escalades',
  flights: 'Vols',
  dives: 'Piqués',
  swims: 'Nages',
  runs: 'Courses',
  naps: 'Siestes',
  longestSleepSeconds: 'Plus longue sieste',
  tricksPerformed: 'Tours réussis',
  giftsGiven: 'Cadeaux offerts',
  hunts: 'Proies attrapées',
  grazes: 'Grignotages',
  reliefs: 'Soulagements',
  accidents: 'Accidents',
  tickles: 'Chatouilles',
  startles: 'Sursauts',
  awakenings: 'Réveils',
  annoyances: 'Agacements',
  sicknesses: 'Indigestions',
  birthdays: 'Anniversaires',
  drags: 'Voyages à la souris',
  falls: 'Chutes',
  follows: 'Filatures du curseur',
  flees: 'Fuites',
  chases: 'Poursuites',
  washes: 'Toilettes',
  ceilingWalks: 'Marches au plafond',
  hibernations: 'Hibernations',
  laserChases: 'Poursuites du laser',
  ringPushes: "Coups de museau à l'anneau",
  leftovers: 'Restes laissés',
  sleepSeconds: 'Temps de sommeil',
  eggPets: "Caresses à l'œuf",
  hovers: 'Survols',
  renames: 'Changements de nom',
  overfeeds: 'Repas forcés',
  pointlessBrushes: 'Brossages inutiles',
  trickFails: 'Tours ratés',
  hibernationWakes: "Réveils d'hibernation",
  rescues: "Sorties d'écran",
  typingWatches: 'Séances de dactylo',
  notificationsSeen: 'Notifications remarquées',
  daysAlive: 'Jours de vie',
  stageReached: 'Stade atteint',
  tricksLearned: 'Tours appris',
  achievementsUnlocked: 'Succès obtenus',
};

/** Compteurs et faits du joueur (succès « Toi »). */
export const PLAYER_STAT_LABELS = {
  menuOpens: 'Ouvertures du menu',
  contextMenuOpens: "Ouvertures du menu d'un animal",
  settingsOpens: 'Ouvertures des réglages',
  progressOpens: 'Ouvertures de la progression',
  journalOpens: 'Ouvertures du journal',
  vacations: 'Départs en vacances',
  laserToggles: 'Allumages du laser',
  clears: 'Bureaux vidés',
  tidies: 'Jouets rangés',
  itemsRemoved: 'Objets retirés (clic droit)',
  preyDrops: 'Proies lâchées',
  bowlOverfills: 'Gamelles pleines remplies',
  coinsSpent: 'Pièces dépensées',
  messesCleaned: 'Traces nettoyées',
  giftsCollected: 'Cadeaux ramassés',
  coins: 'Pièces en poche',
  accessoriesOwned: 'Accessoires possédés',
};

/** Familles de marques (conditions `marks` des succès). */
export const MARK_FAMILY_LABELS = {
  food: 'Aliments goûtés',
  toy: 'Jouets essayés',
  accessory: 'Accessoires portés',
  gift: 'Sortes de présents',
  bed: 'Lits essayés',
  season: 'Saisons vécues',
  holiday: 'Fêtes vécues',
  moment: 'Moments',
  state: 'États',
  desk: 'Bureau',
  shop: 'Boutique',
};

/** Rubriques de la fenêtre de progression. */
export const CATEGORY_LABELS = {
  care: 'Soins',
  play: 'Jeu',
  exploration: 'Exploration',
  life: 'Vie',
  collection: 'Collection',
  seasons: 'Saisons',
  mischief: 'Bêtises',
  player: 'Toi',
};

/** Durée compacte : « 12 min », « 45 s ». */
export function formatSeconds(seconds) {
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min` : `${seconds} s`;
}

/** Durée longue : « 3 h 20 min », « 12 min ». */
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function statValue(key, value) {
  if (key === 'longestSleepSeconds') return formatSeconds(value);
  if (key === 'sleepSeconds') return formatDuration(value);
  return String(value);
}

/** Date courte du journal : « 12/09 14:30 ». */
export function formatJournalDate(ms) {
  const d = new Date(ms);
  const two = (n) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
