// Libellés français des compteurs de vie, pour le menu de l'icône de barre.

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
  daysAlive: 'Jours de vie',
};

/** Durée compacte : « 12 min », « 45 s ». */
export function formatSeconds(seconds) {
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min` : `${seconds} s`;
}

export function statValue(key, value) {
  return key === 'longestSleepSeconds' ? formatSeconds(value) : String(value);
}

/** Date courte du journal : « 12/09 14:30 ». */
export function formatJournalDate(ms) {
  const d = new Date(ms);
  const two = (n) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
