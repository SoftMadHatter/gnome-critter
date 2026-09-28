// Common achievement library, expanded for each species by
// core/achievements.js (a pack can replace, remove or add entries; format
// in docs/progression.md).
//
// The "troll" ones (an animal's mischief, the player's gestures) are
// hidden until discovered; `quip` is the Committee's comment announcing
// them (core/narrator.js), `reward` their silly reward. Titles are
// invariable appositions ("Minou, nap ace"): creatures have no gender.

export const LIBRARY = Object.freeze([
  // --- Care ---------------------------------------------------------------------
  {
    series: 'meals', category: 'care', stat: 'meals', tiers: [10, 50, 200, 1000, 5000],
    names: ['Petit creux', 'Bon appétit', 'Belle fourchette', 'Estomac sur pattes', 'Gouffre sans fond'],
    description: 'Faire {n} repas', title: 'gouffre sans fond',
  },
  {
    series: 'mealsFavorite', category: 'care', stat: 'mealsFavorite', tiers: [10, 50, 250],
    names: ['Plat du jour', 'Menu préféré', 'Habitué de la maison'],
    description: 'Manger {n} fois son aliment préféré', title: 'fine bouche',
  },
  {
    series: 'pets', category: 'care', stat: 'pets', tiers: [10, 100, 500, 2000],
    names: ['Première caresse', 'Câlin régulier', "Pelote d'affection", 'Aimant à caresses'],
    description: 'Recevoir {n} caresses', title: 'aimant à caresses',
  },
  {
    series: 'purrs', category: 'care', stat: 'purrs', tiers: [5, 25, 100, 500],
    names: ['Aux anges', 'Nuage de bonheur', 'Béatitude', 'Nirvana du câlin'],
    description: 'Savourer {n} séries de caresses', title: 'sage du câlin',
  },
  {
    series: 'brushes', category: 'care', stat: 'brushes', tiers: [5, 25, 100, 300],
    names: ['Coup de brosse', 'Brushing', 'Toujours impeccable', 'Star du toilettage'],
    description: 'Être brossé {n} fois', title: 'star du toilettage',
  },
  {
    series: 'washes', category: 'care', stat: 'washes', tiers: [10, 50, 200], requires: { can: 'groom' },
    names: ['Brin de toilette', 'Propre sur soi', 'Obsession de la propreté'],
    description: 'Faire sa toilette {n} fois', title: 'maniaque de la propreté',
  },
  {
    series: 'greets', category: 'care', stat: 'greets', tiers: [10, 50, 200],
    names: ['Bonjour !', "Comité d'accueil", 'Vedette de la politesse'],
    description: 'Saluer ou être salué {n} fois', title: "vedette de l'accueil",
  },

  // --- Play -----------------------------------------------------------------------
  {
    series: 'playSessions', category: 'play', stat: 'playSessions', tiers: [10, 50, 200, 1000],
    names: ['Récréation', 'Partie de plaisir', 'Infatigable', 'Tornade ludique'],
    description: "Jouer {n} fois jusqu'au bout", title: 'tornade ludique',
  },
  {
    series: 'ballKicks', category: 'play', stat: 'ballKicks', tiers: [25, 100, 500, 2000], requires: { can: 'ground' },
    names: ['Premier dribble', 'Petit pont', 'Frappe de mule', "Ballon d'or"],
    description: 'Frapper la balle ou la pelote {n} fois', title: 'virtuose du ballon',
  },
  {
    series: 'tricksPerformed', category: 'play', stat: 'tricksPerformed', tiers: [10, 50, 200, 500], requires: { can: 'tricks' },
    names: ['Numéro de cirque', 'Artiste de rue', "Tête d'affiche", 'Légende du chapiteau'],
    description: 'Réussir {n} tours', title: 'légende du chapiteau',
  },
  {
    series: 'follows', category: 'play', stat: 'follows', tiers: [10, 50, 200], requires: { can: 'ground' },
    names: ['Dans tes pas', 'Ombre fidèle', 'Pot de colle'],
    description: 'Suivre le curseur {n} fois', title: 'pot de colle',
  },
  {
    series: 'ringPushes', category: 'play', stat: 'ringPushes', tiers: [10, 50, 250], requires: { can: 'water' },
    names: ['Coup de museau', 'Jonglerie aquatique', 'Otarie de cirque'],
    description: "Pousser l'anneau {n} fois", title: "otarie d'honneur",
  },

  // --- Exploration ------------------------------------------------------------------
  {
    series: 'runs', category: 'exploration', stat: 'runs', tiers: [10, { at: 50, id: 'speedster' }, 200, 1000],
    requires: { can: 'ground' },
    names: ['Petite foulée', 'Sprint', 'Marathon de bureau', 'Fusée'],
    description: 'Courir {n} fois', title: 'fusée du bureau',
  },
  {
    series: 'climbs', category: 'exploration', stat: 'climbs', tiers: [10, 50, { at: 100, id: 'alpinist' }, 500],
    requires: { can: 'wall' },
    names: ['Premier mur', 'Grimpette', 'Alpiniste', 'Maître de la varappe'],
    description: 'Grimper {n} fois', title: 'as de la varappe',
  },
  {
    series: 'ceilingWalks', category: 'exploration', stat: 'ceilingWalks', tiers: [5, 25, 100], requires: { can: 'ceiling' },
    names: ['Tête en bas', "Vue d'en haut", 'Lustre vivant'],
    description: 'Marcher au plafond {n} fois', title: 'chauve-souris honoraire',
  },
  {
    series: 'flights', category: 'exploration', stat: 'flights', tiers: [10, 50, { at: 100, id: 'traveler' }, 500, 2000],
    requires: { can: 'air' },
    names: ['Premier envol', 'Vol de croisière', 'Grand voyageur', 'Long-courrier', 'Maître des airs'],
    description: 'Voler {n} fois', title: 'as des airs',
  },
  {
    series: 'dives', category: 'exploration', stat: 'dives', tiers: [5, 25, 100, 500], requires: { can: 'air' },
    names: ['Plongeon', 'Piqué', 'Chute contrôlée', 'Faucon pèlerin'],
    description: 'Faire {n} piqué{s}', title: 'missile à plumes',
  },
  {
    series: 'swims', category: 'exploration', stat: 'swims', tiers: [25, 100, { at: 200, id: 'big-swimmer' }, 500, 2000],
    requires: { can: 'water' },
    names: ['Premières brasses', 'Nage libre', 'Grand nageur', 'Traversée', 'Océan de bureau'],
    description: 'Nager {n} fois', title: 'terreur des abysses',
  },
  {
    series: 'hunts', category: 'exploration', stat: 'hunts', tiers: [5, 25, 100, 500], requires: { can: 'hunt' },
    names: ['Première prise', 'Instinct de chasse', 'Terreur des proies', 'Sommet de la chaîne alimentaire'],
    description: 'Attraper {n} proie{s}', title: 'sommet de la chaîne alimentaire',
  },
  {
    series: 'grazes', category: 'exploration', stat: 'grazes', tiers: [5, 25, 100], requires: { can: 'graze' },
    names: ["Brin d'herbe", 'Salade verte', 'Tondeuse'],
    description: 'Grignoter {n} fois une plante', title: 'tondeuse à gazon',
  },

  // --- Life -----------------------------------------------------------------------
  {
    series: 'daysAlive', category: 'life', stat: 'daysAlive', tiers: [1, 7, { at: 30, id: 'old-timer' }, 100, 365, 1000],
    names: ['Premier jour', 'Première semaine', 'Doyen', 'Centenaire (en jours)', 'Un an de bureau', 'Millénaire (en jours)'],
    description: 'Vivre {n} jour{s}', title: 'pilier du bureau',
  },
  {
    series: 'stageReached', category: 'life', stat: 'stageReached', tiers: [1, 2, 3, 4],
    names: ['Éclosion', 'Jeunesse', 'Âge adulte', "Âge d'or"],
    descriptions: ["Sortir de l'œuf", 'Devenir jeune', 'Devenir adulte', 'Devenir senior'], title: 'sagesse incarnée',
  },
  {
    series: 'naps', category: 'life', stat: 'naps', tiers: [10, 50, 200, 1000], requires: { can: 'sleep' },
    names: ['Petite sieste', 'Pause méritée', 'Pro de la sieste', 'Sieste olympique'],
    description: 'Faire {n} siestes', title: 'as de la sieste',
  },
  {
    series: 'sleepHours', category: 'life', stat: 'sleepSeconds', unit: 3600, tiers: [1, 10, 100, 500], requires: { can: 'sleep' },
    names: ['Une heure de rêve', 'Nuit complète', 'Hibernation amateur', 'Oreiller vivant'],
    description: 'Dormir {n} h au total', title: 'oreiller vivant',
  },
  {
    series: 'birthdays', category: 'life', stat: 'birthdays', tiers: [1, 2, 5],
    names: ['Joyeux anniversaire', 'Deux bougies', 'Cinq bougies'],
    description: 'Fêter {n} anniversaire{s}', title: 'gâteau sur pattes',
  },
  {
    series: 'reliefs', troll: true, stat: 'reliefs', tiers: [10, 50, 200], requires: { can: 'relieve' },
    names: ['Propre', 'Bonnes manières', 'Diplôme de propreté'],
    description: 'Se soulager proprement {n} fois',
    quips: [
      'Dix fois aux toilettes. Comme prévu. Le Comité salue cet exploit du quotidien.',
      'Cinquante fois, toujours au bon endroit. Le Comité se demande si c\'est vraiment un succès.',
      "Deux cents fois. Un diplôme de propreté, décerné pour avoir fait ce qu'on attendait de lui depuis le début.",
    ],
    reward: [{ coins: 1 }, { coins: 1 }, { box: 'bronze' }],
  },

  // --- Personality (one series per trait) -----------------------------------------
  {
    series: 'trait-playful', category: 'play', stat: 'playSessions', tiers: [25, 100, 500], requires: { trait: 'playful' },
    names: ["Boule d'énergie", 'Pile électrique', 'Ouragan'],
    description: 'Jouer {n} fois (caractère joueur)', title: 'ouragan de poche',
  },
  {
    series: 'trait-lazy', category: 'life', stat: 'sleepSeconds', unit: 3600, tiers: [24, 72, 240],
    requires: { trait: 'lazy', can: 'sleep' },
    names: ['Grasse matinée', 'Week-end prolongé', 'Marmotte'],
    description: 'Dormir {n} h au total (caractère paresseux)', title: 'marmotte officielle',
  },
  {
    series: 'trait-greedy', category: 'care', stat: 'mealsFavorite', tiers: [25, 100, 500], requires: { trait: 'greedy' },
    names: ['Gourmandise', 'Péché mignon', 'Fine gueule'],
    description: 'Manger {n} fois son aliment préféré (caractère gourmand)', title: 'fine gueule',
  },
  {
    series: 'trait-shy', category: 'life', stat: 'flees', tiers: [10, 50, 200], requires: { trait: 'shy' },
    names: ['Pas vu, pas pris', 'Discrétion', 'Ninja'],
    description: 'Fuir {n} fois (caractère timide)', title: 'ninja du bureau',
  },

  // --- Collection --------------------------------------------------------------------
  {
    series: 'foodsTasted', category: 'collection', marks: 'food', tiers: [2, 4, 'all'],
    names: ['Palais curieux', 'Gastronomie', 'Tour du menu'],
    description: 'Goûter {n} aliment{s} différent{s}', title: 'critique gastronomique',
  },
  {
    series: 'toysTried', category: 'collection', marks: 'toy', tiers: [2, 'all'],
    names: ['Coffre à jouets', 'Tous les jouets'],
    description: 'Jouer avec {n} jouet{s} différent{s}',
  },
  {
    series: 'accessoriesWorn', category: 'collection', marks: 'accessory', tiers: [1, 3, 'all'],
    names: ['Première tenue', 'Défilé de mode', 'Garde-robe complète'],
    description: 'Porter {n} accessoire{s} différent{s}', title: 'icône de mode',
  },
  {
    series: 'giftsGiven', category: 'collection', stat: 'giftsGiven', tiers: [5, 25, 100],
    names: ['Petite attention', 'Cœur sur la patte', 'Distributeur de présents'],
    description: 'Rapporter {n} présent{s}', title: 'cœur sur la patte',
  },
  {
    series: 'giftKinds', category: 'collection', marks: 'gift', tiers: ['all'],
    names: ['Trois trésors'],
    description: 'Rapporter les {n} sortes de présents',
  },
  {
    series: 'tricksLearned', category: 'collection', stat: 'tricksLearned', tiers: [1, 'all'], requires: { can: 'tricks' },
    names: ['Premier tour', 'Répertoire complet'],
    description: 'Apprendre {n} tour{s}', title: 'bête de scène',
  },
  {
    series: 'bedsTried', category: 'collection', marks: 'bed', tiers: ['all'], requires: { can: 'sleep' },
    names: ['Critique de literie'],
    description: 'Dormir dans {n} modèles de lit',
  },
  {
    series: 'achievementsUnlocked', category: 'collection', stat: 'achievementsUnlocked', tiers: [10, 25, 50, 100, 150],
    names: ['Collection naissante', 'Vitrine', 'Musée', 'Panthéon', 'Légende'],
    description: 'Obtenir {n} succès', title: 'légende vivante',
  },

  // --- Seasons ----------------------------------------------------------------------
  { id: 'christmas', category: 'seasons', mark: 'holiday:christmas', name: 'Joyeux Noël', description: 'Être là à Noël', coins: 20 },
  { id: 'newyear', category: 'seasons', mark: 'holiday:newyear', name: 'Bonne année', description: "Être là le jour de l'An", coins: 20 },
  { id: 'valentine', category: 'seasons', mark: 'holiday:valentine', name: 'Cœur de Saint-Valentin', description: 'Être là à la Saint-Valentin', coins: 20 },
  { id: 'easter', category: 'seasons', mark: 'holiday:easter', name: 'Chasse aux œufs', description: 'Être là à Pâques', coins: 20 },
  { id: 'halloween', category: 'seasons', mark: 'holiday:halloween', name: 'Des bonbons ou un sort', description: 'Être là à Halloween', coins: 20 },
  {
    series: 'holidays', category: 'seasons', marks: 'holiday', tiers: [3, 'all'],
    names: ['Esprit de fête', 'Calendrier complet'],
    description: 'Vivre {n} fêtes différentes', title: 'boute-en-train',
  },
  { id: 'santa-worn', category: 'seasons', mark: 'accessory:santa', name: 'Esprit de Noël', description: 'Porter le bonnet de Noël', coins: 20 },
  { id: 'witch-worn', category: 'seasons', mark: 'accessory:witch', name: 'Sortilège', description: 'Porter le chapeau de sorcière', coins: 20 },
  {
    series: 'seasons', category: 'seasons', marks: 'season', tiers: [1, 2, 3, 4],
    names: ['Première saison', 'Deux saisons', 'Trois saisons', 'Quatre saisons'],
    description: 'Vivre {n} saison{s} différente{s}', title: 'baromètre vivant',
  },

  // --- Animal mischief (troll, hidden) -------------------------------------------
  {
    series: 'egg-pets', troll: true, stat: 'eggPets', tiers: [10, 50],
    names: ['Toc toc', 'Obstination'],
    description: 'Caresser un œuf {n} fois',
    quips: [
      "Tu as caressé un œuf dix fois. Il ne s'est rien passé. Il ne se passera jamais rien.",
      'Cinquante caresses à une coquille. Nos spectateurs se demandent si tout va bien chez toi.',
    ],
    reward: [{ text: 'un écho' }, { box: 'bronze' }],
  },
  {
    series: 'tickles', troll: true, stat: 'tickles', tiers: [50, 250],
    names: ['Chatouilleux', 'Supplice des plumes'],
    description: 'Être chatouillé {n} fois', title: 'martyr des chatouilles',
    quips: [
      "Cinquante chatouilles. Il rit, mais à l'intérieur, il prépare sa vengeance.",
      "Deux cent cinquante chatouilles. Le Comité a prévenu une association. Elle n'a pas rappelé.",
    ],
    reward: [{ coins: 1 }, { box: 'silver' }],
  },
  {
    series: 'drags', troll: true, stat: 'drags', tiers: [25, 100, 500],
    names: ['Mal des transports', 'Tapis volant', 'Colis express'],
    description: 'Être porté à la souris {n} fois',
    quips: [
      "Vingt-cinq voyages en cabine souris. Aucun n'était demandé.",
      'Cent déménagements express. Voici une chaussette. Ne demande pas pourquoi.',
      'Cinq cents livraisons. À ce tarif, tu devrais facturer.',
    ],
    reward: [{ text: "un sachet pour le mal de l'air" }, { accessory: 'sock' }, { coins: 3, text: '3,14 pièces, arrondies à 3' }],
  },
  {
    series: 'falls', troll: true, stat: 'falls', tiers: [100, 500], requires: { can: 'ground' },
    names: ['Chute libre', "Pilote d'essai"],
    description: 'Tomber {n} fois', title: "pilote d'essai en chute libre",
    quips: [
      'Cent chutes. La gravité te remercie pour ta fidélité.',
      "Cinq cents chutes. Tu as officiellement fait plus d'essais qu'un programme spatial.",
    ],
    reward: [{ coins: 0 }, { box: 'gold' }],
  },
  {
    series: 'sicknesses', troll: true, stat: 'sicknesses', tiers: [1, 5],
    names: ['Estomac en carton', 'Cobaye'],
    description: 'Tomber malade {n} fois (nourriture moisie)',
    quips: [
      "Il a mangé de la nourriture moisie. Tu l'as laissée moisir. Bravo à vous deux.",
      "Cinq intoxications. À ce stade, ce n'est plus de la négligence, c'est de la science.",
    ],
    reward: [{ text: 'une ordonnance illisible' }, { coins: -1, text: 'frais de consultation' }],
  },
  {
    series: 'accidents', troll: true, stat: 'accidents', tiers: [1, 10, 25], requires: { can: 'relieve' },
    names: ['Oups', 'Récidive', 'Dossier ouvert'],
    description: 'Avoir {n} accident{s}',
    quips: [
      'Un petit accident. Le Comité a tout vu. Les spectateurs aussi.',
      "Dix accidents. Voici le cône de la honte. On ne sait pas encore qui doit le porter.",
      "Vingt-cinq accidents. Le Comité ouvre un dossier à son nom. Frais de dossier.",
    ],
    reward: [{ coins: 0 }, { accessory: 'cone' }, { coins: -1, text: 'frais de dossier' }],
  },
  {
    series: 'awakenings', troll: true, stat: 'awakenings', tiers: [10, 50],
    names: ['Réveil brutal', 'Sommeil interdit'],
    description: 'Être réveillé {n} fois',
    quips: ['Dix réveils. Le sommeil était un droit. Était.', 'Cinquante réveils. Il dort désormais les yeux ouverts, par précaution.'],
    reward: [{ text: 'un réveille-matin cassé' }, { box: 'bronze' }],
  },
  {
    series: 'startles', troll: true, stat: 'startles', tiers: [25, 100],
    names: ['Cardiaque', "Nerfs d'acier (non)"],
    description: 'Sursauter {n} fois',
    quips: [
      "Vingt-cinq sursauts. Arrête d'ouvrir des fenêtres comme si tu enfonçais une porte.",
      "Cent sursauts. Il ne s'y habituera jamais. Toi non plus, apparemment.",
    ],
    reward: [{ coins: 1 }, { box: 'bronze' }],
  },
  {
    series: 'annoyances', troll: true, stat: 'annoyances', tiers: [20, 100],
    names: ['Tu le fais exprès ?', 'Clic droit compulsif'],
    description: 'Être agacé {n} fois (clic droit)', title: 'souffre-douleur officiel',
    quips: [
      'Vingt clics droits. Oui, tu le fais exprès. Le Comité prélève des frais de dossier.',
      "Cent agacements. Il a fondé un groupe de soutien. Tu n'y es pas invité.",
    ],
    reward: [{ coins: -1, text: 'frais de dossier' }, { box: 'silver' }],
  },
  {
    id: 'night-owl', troll: true, mark: 'moment:night-owl', name: 'Noctambule', description: 'Être éveillé à 3 h du matin',
    quip: 'Trois heures du matin et il est réveillé. Toi aussi. Va dormir.', reward: { text: 'une tisane imaginaire' },
  },
  {
    series: 'leftovers', troll: true, stat: 'leftovers', tiers: [10, 50],
    names: ['Anti-gaspi (raté)', 'Restes à volonté'],
    description: 'Laisser {n} restes',
    quips: ['Dix restes abandonnés. Quelque part, une grand-mère soupire.', 'Cinquante restes. Ton bureau est officiellement un buffet froid.'],
    reward: [{ coins: 0 }, { box: 'bronze' }],
  },
  {
    series: 'hibernations', troll: true, stat: 'hibernations', tiers: [1, 3],
    names: ['Hibernatus', 'Ours polaire'],
    description: 'Hiberner {n} fois',
    quips: ['Il a hiberné. Par manque de soins. Les tiens.', 'Trois hibernations. Il a acheté un sac de couchage avec ses économies.'],
    reward: [{ text: 'une couverture de survie' }, { box: 'bronze' }],
  },
  {
    series: 'overfeeds', troll: true, stat: 'overfeeds', tiers: [5, 25],
    names: ['Gavage', 'Buffet forcé'],
    description: 'Être nourri {n} fois sans avoir faim',
    quips: [
      "Il n'avait plus faim. Tu as insisté. Cinq fois.",
      'Vingt-cinq repas de trop. Le Comité t\'a inscrit à un concours de pâtisserie. Tu as perdu.',
    ],
    reward: [{ coins: 0 }, { box: 'bronze' }],
  },
  {
    series: 'pointless-brushes', troll: true, stat: 'pointlessBrushes', tiers: [10, 50],
    names: ['Brossage de précision', 'Lustrage'],
    description: 'Être brossé {n} fois alors que tout était propre',
    quips: [
      "Tu as brossé un animal déjà impeccable. Dix fois. Le poil n'en demandait pas tant.",
      "Cinquante brossages inutiles. Il brille tellement qu'on le voit depuis l'espace.",
    ],
    reward: [{ text: 'un poil' }, { box: 'bronze' }],
  },
  {
    series: 'trick-fails', troll: true, stat: 'trickFails', tiers: [10, 50], requires: { can: 'tricks' },
    names: ['Persévérance', 'Toujours pas'],
    description: "Rater {n} fois l'apprentissage d'un tour", title: 'cancre du cirque',
    quips: ["Dix échecs. L'important, c'est de participer. Non, en fait.", 'Cinquante échecs. Le problème vient peut-être du professeur.'],
    reward: [{ coins: 1 }, { box: 'bronze' }],
  },
  {
    series: 'laser-chases', troll: true, stat: 'laserChases', tiers: [100, 500],
    names: ['Point rouge', 'Obsession écarlate'],
    description: 'Poursuivre le laser {n} fois', title: 'victime du point rouge',
    quips: [
      "Cent poursuites. Il ne l'attrapera jamais. Jamais.",
      'Cinq cents poursuites. Toujours pas attrapé. Le point rouge remercie ses fans.',
    ],
    reward: [{ coins: 0 }, { box: 'silver' }],
  },
  {
    series: 'renames', troll: true, stat: 'renames', tiers: [5, 20],
    names: ["Crise d'identité", 'Témoin protégé'],
    description: 'Être renommé {n} fois', title: 'témoin protégé',
    quips: [
      'Cinq noms différents. Il ne sait plus qui il est. Toi non plus.',
      'Vingt identités. Le programme de protection des témoins est impressionné.',
    ],
    reward: [{ text: 'un badge « Bonjour, je m’appelle… »' }, { box: 'bronze' }],
  },
  {
    series: 'hovers', troll: true, stat: 'hovers', tiers: [500, 5000],
    names: ['Regard insistant', 'Tu le fixes encore'],
    description: 'Être survolé {n} fois par le curseur',
    quips: ['Cinq cents survols. Il sait que tu le regardes.', 'Cinq mille survols. Ça devient gênant pour tout le monde.'],
    reward: [{ coins: 0 }, { box: 'silver' }],
  },
  {
    id: 'starving', troll: true, mark: 'state:starving', name: 'Régime extrême', description: 'Laisser la satiété tomber à zéro',
    quip: "Satiété à zéro. Il y avait de la nourriture. Quelque part. Chez quelqu'un d'autre.",
    reward: { coins: -1, text: 'frais de dossier' },
  },
  {
    id: 'filthy', troll: true, mark: 'state:filthy', requires: { can: 'groom' }, name: 'Fleur de fumier',
    description: 'Laisser la propreté tomber à zéro',
    quip: 'Propreté à zéro. Les mouches ont déposé une demande de résidence.', reward: { text: 'une pince à linge (pour le nez)' },
  },
  {
    id: 'perfect', troll: true, mark: 'state:perfect', name: 'Perfection (provisoire)', description: 'Avoir toutes les jauges au maximum',
    quip: 'Toutes les jauges au maximum. Profite, ça ne durera pas trois minutes.', reward: { box: 'gold' },
  },
  {
    id: 'rock-bottom', troll: true, mark: 'state:rock-bottom', requires: { can: ['sleep', 'groom', 'relieve'] },
    name: 'Au fond du trou', description: 'Avoir toutes les jauges au plus bas',
    quip: "Toutes les jauges au plus bas. Le Comité n'a pas de mots. Si, un seul : bravo.",
    reward: { text: 'une pelle, pour creuser plus bas' },
  },
  {
    id: 'coma', troll: true, stat: 'longestSleepSeconds', atLeast: 36000, requires: { can: 'sleep' },
    name: 'Coma', description: "Dormir 10 h d'affilée",
    quip: "Dix heures d'affilée. Vérifie qu'il respire. (Il respire.)", reward: { box: 'bronze' },
  },
  {
    series: 'hibernation-wakes', troll: true, stat: 'hibernationWakes', tiers: [1, 10],
    names: ["Réveil de l'ours", 'Printemps forcé'],
    description: 'Être tiré {n} fois de son hibernation',
    quips: [
      "Tu as tiré un hibernant de son sommeil. Il ne t'en veut pas. Pour l'instant.",
      "Dix réveils d'hibernation. Le printemps, c'est quand tu le décides, visiblement.",
    ],
    reward: [{ coins: 1 }, { box: 'bronze' }],
  },
  {
    id: 'rare-feather', troll: true, mark: 'gift:feather', name: 'La plume rare', description: 'Rapporter la plume rare',
    quip: 'Une plume rare ! Ta récompense : une plume. Oui, la même.', reward: { text: 'une plume' },
  },
  {
    id: 'tendinitis', troll: true, stat: 'pets', atLeast: 10000, name: 'Tendinite', description: 'Recevoir 10 000 caresses',
    quip: 'Dix mille caresses. Ton poignet a déposé une réclamation.', reward: { box: 'gold' },
  },
  {
    id: 'black-hole', troll: true, stat: 'meals', atLeast: 10000, name: 'Trou noir', description: 'Faire 10 000 repas',
    title: 'trou noir', quip: "Dix mille repas. Les astronomes s'intéressent à son cas.", reward: { box: 'platinum' },
  },
  {
    id: 'earthquake', troll: true, stat: 'purrs', atLeast: 1000, name: 'Tremblement de terre',
    description: 'Savourer 1 000 séries de caresses',
    quip: "Mille séries de caresses. Les voisins pensent que c'est la machine à laver.", reward: { box: 'silver' },
  },
  {
    id: 'sleep-is-life', troll: true, stat: 'naps', atLeast: 5000, requires: { can: 'sleep' },
    name: "Dormir, c'est vivre", description: 'Faire 5 000 siestes',
    quip: "Cinq mille siestes. Il a compris quelque chose que tu n'as pas compris.", reward: { box: 'gold' },
  },
  {
    id: 'still-here', troll: true, stat: 'daysAlive', atLeast: 3650, name: 'Tu es encore là ?', description: 'Vivre 3 650 jours',
    title: 'fossile de bureau',
    quip: "Dix ans. Ce succès a été écrit en pensant que personne ne l'obtiendrait. Le Comité est ému. Un peu.",
    reward: { box: 'legendary' },
  },
  {
    id: 'bald', troll: true, stat: 'brushes', atLeast: 1000, name: 'Chauve', description: 'Être brossé 1 000 fois',
    quip: "Mille brossages. Il ne lui reste plus un poil. (Si. C'était pour voir ta tête.)", reward: { box: 'silver' },
  },
  {
    id: 'overpolite', troll: true, stat: 'greets', atLeast: 500, name: 'Politesse excessive',
    description: 'Saluer ou être salué 500 fois',
    quip: 'Cinq cents bonjours. Même le Comité ne dit pas bonjour autant.', reward: { coins: 1 },
  },
  {
    id: 'extinction', troll: true, stat: 'hunts', atLeast: 1000, requires: { can: 'hunt' }, name: 'Extinction',
    description: 'Attraper 1 000 proies',
    quip: "Mille proies. Leur espèce a porté plainte. Le Comité a classé l'affaire.", reward: { box: 'gold' },
  },
  {
    id: 'all-nighter', troll: true, mark: 'moment:all-nighter', requires: { can: 'sleep' }, name: 'Nuit blanche',
    description: "Rester éveillé 24 h d'affilée",
    quip: 'Vingt-quatre heures sans dormir. Il tient debout grâce à la seule force de ta négligence.', reward: { coins: 0 },
  },
  {
    id: 'ceiling-fall', troll: true, mark: 'moment:ceiling-fall', requires: { can: 'ceiling' }, name: 'Décollage du plafond',
    description: 'Tomber du plafond',
    quip: 'Il est tombé du plafond. Tu as ri. Le Comité a enregistré ton rire.', reward: { coins: 1 },
  },
  {
    series: 'rescues', troll: true, stat: 'rescues', tiers: [1, 10],
    names: ['Porté disparu', 'Triangle des Bermudes'],
    description: "Sortir de l'écran {n} fois",
    quips: ["Il est sorti de l'écran. Le Comité l'a ramené. Tu n'avais rien remarqué.", "Dix disparitions. À ce stade, c'est un numéro de magie."],
    reward: [{ text: 'un avis de recherche' }, { box: 'bronze' }],
  },
  {
    id: 'pet-while-eating', troll: true, mark: 'state:pet-while-eating', name: 'Pas pendant le repas !',
    description: 'Être caressé en mangeant',
    quip: "Une caresse en plein repas. Tu aimes qu'on te tapote la tête au restaurant ?", reward: { coins: 0 },
  },
  {
    id: 'tickle-sleep', troll: true, mark: 'state:tickle-sleep', requires: { can: 'sleep' }, name: 'Cauchemar chatouilleux',
    description: 'Être chatouillé en dormant',
    quip: "Chatouiller quelqu'un qui dort. Même le Comité trouve ça bas. Frais de dossier.",
    reward: { coins: -1, text: 'frais de dossier' },
  },
  {
    id: 'dinner-thief', troll: true, mark: 'state:dinner-thief', name: 'Voleur de repas', description: 'Être soulevé en plein repas',
    quip: "Soulevé en plein repas. Il s'en souviendra. Longtemps.", reward: { coins: 0 },
  },
  {
    id: 'sleepwalk', troll: true, mark: 'state:sleepwalk', requires: { can: 'sleep' }, name: 'Somnambule',
    description: 'Être déplacé pendant son sommeil',
    quip: 'Déplacé pendant son sommeil. Il se réveillera ailleurs, perplexe. Comme toi un lundi.', reward: { box: 'bronze' },
  },
  {
    id: 'skydive', troll: true, mark: 'moment:skydive', requires: { can: 'ground' }, name: 'Saut sans parachute',
    description: "Tomber de toute la hauteur de l'écran",
    quip: "Une chute de toute la hauteur de l'écran. Atterrissage parfait. Enfin, atterrissage.", reward: { box: 'bronze' },
  },
  {
    id: 'royal-nap', troll: true, mark: 'state:royal-nap', requires: { can: 'sleep' }, name: 'Sieste royale',
    description: 'Dormir en portant la couronne',
    quip: 'Dormir avec une couronne. Le luxe, le vrai.', reward: { coins: 3, text: '3,14 pièces, arrondies à 3' },
  },
  {
    id: 'glasses-nap', troll: true, mark: 'state:glasses-nap', requires: { can: 'sleep' }, name: 'Lecture soporifique',
    description: 'Dormir avec ses lunettes',
    quip: "Il s'est endormi avec ses lunettes. Il lisait sûrement tes statistiques.", reward: { coins: 1 },
  },
  {
    id: 'sock-play', troll: true, mark: 'state:sock-play', name: 'Tenue décontractée',
    description: 'Jouer avec une chaussette sur la tête',
    quip: "Jouer avec une chaussette sur la tête. Le style n'a pas de règles. Enfin si, mais pas ici.", reward: { coins: 0 },
  },
  {
    id: 'pet-while-relieving', troll: true, mark: 'state:pet-while-relieving', requires: { can: 'relieve' },
    name: "Un peu d'intimité ?", description: "Être caressé pendant qu'il se soulage",
    quip: "Une caresse pendant qu'il se soulage. Il existe des limites. Tu viens de les trouver.",
    reward: { coins: -1, text: 'frais de dossier' },
  },
  {
    id: 'bored-stiff', troll: true, mark: 'state:bored-stiff', name: 'Ennui mortel', description: 'Laisser la stimulation tomber à zéro',
    quip: "Stimulation à zéro. Il compte les pixels de l'écran. Il en est à trois.", reward: { text: 'un pixel à compter' },
  },
  {
    id: 'cone-worn', troll: true, mark: 'accessory:cone', name: 'La honte, assumée', description: 'Porter le cône de la honte',
    quip: 'Il porte le cône de la honte. Avec une certaine élégance, il faut bien le dire.', reward: { coins: 0 },
  },
  {
    id: 'sock-worn', troll: true, mark: 'accessory:sock', name: 'Chaussette de compétition', description: 'Porter la chaussette',
    quip: "Une chaussette sur la tête. Propre, on l'espère. Le Comité préfère ne pas vérifier.", reward: { coins: 1 },
  },
  {
    id: 'foilhat-worn', troll: true, mark: 'accessory:foilhat', name: 'Ils nous écoutent', description: 'Porter le chapeau en papier alu',
    quip: "Chapeau en papier alu enfilé. Le Comité renonce à lire dans tes pensées. Il n'y avait pas grand-chose à lire.",
    reward: { text: 'un rouleau d’aluminium entamé' },
  },
  {
    id: 'hungry-nap', troll: true, mark: 'state:hungry-nap', requires: { can: 'sleep' }, name: 'Au lit sans dîner',
    description: "S'endormir le ventre vide",
    quip: "Il s'est endormi le ventre vide. Il rêve de croquettes. Tu pourrais en poser, tu sais.", reward: { coins: 0 },
  },
  {
    series: 'typing-watches', troll: true, stat: 'typingWatches', tiers: [100, 1000],
    names: ['Spectateur de clavier', 'Dactylo'],
    description: 'Te regarder taper {n} fois',
    quips: [
      'Il t\'a regardé taper cent fois. Il pense que tu joues du piano. Mal.',
      "Mille séances de dactylo. Il n'a toujours pas compris à quoi tu sers.",
    ],
    reward: [{ coins: 0 }, { box: 'bronze' }],
  },
  {
    id: 'notification-fan', troll: true, stat: 'notificationsSeen', atLeast: 100, name: 'Fan de notifications',
    description: 'Remarquer 100 notifications',
    quip: 'Cent notifications remarquées. Lui, au moins, il les lit. (Non. Personne ne les lit.)', reward: { coins: 1 },
  },

  // --- You (player achievements, shared between animals) ---------------------------------
  {
    series: 'accessoriesOwned', scope: 'player', stat: 'accessoriesOwned', tiers: [1, 2, 4],
    names: ['Premier achat', 'Garde-robe', 'Collection de chapeaux'],
    description: 'Posséder {n} accessoire{s}',
  },
  {
    series: 'coinsSpent', scope: 'player', stat: 'coinsSpent', tiers: [50, 250, 1000],
    names: ['Client', 'Client fidèle', 'Actionnaire'],
    description: 'Dépenser {n} pièces',
  },
  {
    series: 'messesCleaned', scope: 'player', stat: 'messesCleaned', tiers: [10, 100, 500],
    names: ['Coup de balai', 'Service de propreté', 'Brigade antipoussière'],
    description: 'Nettoyer {n} traces',
  },
  {
    series: 'giftsCollected', scope: 'player', stat: 'giftsCollected', tiers: [10, 50, 200],
    names: ['Merci !', 'Collection de babioles', 'Caverne aux trésors'],
    description: 'Ramasser {n} cadeaux',
  },

  // --- Player mischief (troll, hidden) ---------------------------------------------
  {
    series: 'menu-opens', scope: 'player', troll: true, stat: 'menuOpens', tiers: [1, 100, 1000, 10000],
    names: ['Curiosité', 'Habitué du menu', 'Accro au menu', "Tu n'as vraiment rien d'autre à faire ?"],
    description: 'Ouvrir le menu {n} fois',
    quips: [
      "Tu as ouvert le menu. Bravo. C'est le début d'une longue addiction.",
      "Cent ouvertures. Il n'y a toujours rien de nouveau dedans.",
      "Mille ouvertures. Le menu a demandé une mesure d'éloignement.",
      "Dix mille ouvertures du menu. Le Comité a vérifié : non, tu n'as vraiment rien d'autre à faire.",
    ],
    reward: [{ coins: 0 }, { box: 'bronze' }, { box: 'silver' }, { box: 'legendary' }],
  },
  {
    id: 'middle-click', scope: 'player', troll: true, stat: 'contextMenuOpens', atLeast: 50, name: 'Molette sensible',
    description: "Ouvrir 50 fois le menu d'un animal (clic du milieu)",
    quip: 'Cinquante clics du milieu. Ta molette demande un arrêt de travail.', reward: { coins: 1 },
  },
  {
    series: 'settings-opens', scope: 'player', troll: true, stat: 'settingsOpens', tiers: [10, 50],
    names: ['Réglages compulsifs', 'Complotiste des paramètres'],
    description: 'Ouvrir les réglages {n} fois',
    quips: [
      "Dix visites aux réglages. Rien n'a changé. Rien ne change jamais.",
      'Cinquante fois. Tu crois qu\'on te cache un réglage ? Tiens, un chapeau en papier alu.',
    ],
    reward: [{ coins: 0 }, { accessory: 'foilhat' }],
  },
  {
    series: 'progress-opens', scope: 'player', troll: true, stat: 'progressOpens', tiers: [25, 100],
    names: ['Obsession des stats', 'Tableur vivant'],
    description: 'Ouvrir la fenêtre de progression {n} fois',
    quips: [
      'Vingt-cinq consultations. Les chiffres ne montent pas plus vite quand on les regarde.',
      'Cent consultations. Le Comité songe à te facturer des jetons de présence.',
    ],
    reward: [{ coins: 0 }, { box: 'bronze' }],
  },
  {
    series: 'journal-opens', scope: 'player', troll: true, stat: 'journalOpens', tiers: [10, 50],
    names: ['Lecture du soir', 'Archiviste'],
    description: 'Ouvrir le journal {n} fois',
    quips: [
      "Dix lectures du journal. C'est la même histoire, avec un peu plus de chutes.",
      'Cinquante lectures. Tu pourrais le réciter. Ne le fais pas.',
    ],
    reward: [{ coins: 1 }, { box: 'bronze' }],
  },
  {
    series: 'vacations', scope: 'player', troll: true, stat: 'vacations', tiers: [1, 5],
    names: ["Tu l'abandonnes ?", 'Globe-trotteur indigne'],
    description: 'Partir en vacances {n} fois',
    quips: [
      'Mode vacances. Il ne bougera plus. Toi, profite. Et culpabilise un peu.',
      'Cinq départs en vacances. Il a arrêté de compter. Pas le Comité.',
    ],
    reward: [{ text: 'une carte postale' }, { box: 'bronze' }],
  },
  {
    id: 'short-vacation', scope: 'player', troll: true, mark: 'moment:short-vacation', name: 'Vacances express',
    description: "Revenir de vacances en moins d'une minute",
    quip: 'Moins d\'une minute de vacances. Même pas le temps de boucler la valise.', reward: { coins: 1 },
  },
  {
    series: 'laser-toggles', scope: 'player', troll: true, stat: 'laserToggles', tiers: [50, 250],
    names: ['Disco', 'Boule à facettes'],
    description: 'Allumer le laser {n} fois',
    quips: [
      "Cinquante allumages du laser. Ce n'est plus un jeu, c'est une soirée disco.",
      'Deux cent cinquante allumages. Le laser a demandé une augmentation.',
    ],
    reward: [{ coins: 0 }, { box: 'silver' }],
  },
  {
    series: 'clears', scope: 'player', troll: true, stat: 'clears', tiers: [10, 50],
    names: ['Grand ménage', 'Table rase'],
    description: 'Tout retirer du bureau {n} fois',
    quips: ['Dix fois, tu as tout retiré. Le minimalisme te va bien. Enfin, bof.', "Cinquante grands ménages. Le vide, c'est ton style."],
    reward: [{ coins: 0 }, { box: 'bronze' }],
  },
  {
    id: 'forced-tidy', scope: 'player', troll: true, stat: 'tidies', atLeast: 10, name: 'Rangement forcé',
    description: 'Ranger les jouets 10 fois',
    quip: "Dix rangements de jouets. Il n'a même pas eu le temps de jouer.", reward: { coins: 1 },
  },
  {
    id: 'right-click-revenge', scope: 'player', troll: true, stat: 'itemsRemoved', atLeast: 50, name: 'Clic droit vengeur',
    description: "Retirer 50 objets d'un clic droit",
    quip: 'Cinquante objets retirés d\'un clic droit. Le Comité voit se dessiner une tendance.', reward: { coins: 0 },
  },
  {
    id: 'pet-hotel', scope: 'player', troll: true, mark: 'desk:beds', name: 'Hôtel pour animaux',
    description: 'Avoir 10 lits posés en même temps',
    quip: "Dix lits en même temps. Il n'en utilise qu'un. Toujours le même.", reward: { box: 'bronze' },
  },
  {
    id: 'toy-store', scope: 'player', troll: true, mark: 'desk:toys', name: 'Magasin de jouets',
    description: 'Avoir 20 jouets posés en même temps',
    quip: 'Vingt jouets posés. Il préfère jouer avec la gamelle.', reward: { box: 'bronze' },
  },
  {
    id: 'bowl-collection', scope: 'player', troll: true, mark: 'desk:bowls', name: 'Collection de gamelles',
    description: 'Avoir 5 gamelles posées en même temps',
    quip: "Cinq gamelles. Il n'a qu'un estomac, tu sais ?", reward: { coins: 1 },
  },
  {
    id: 'olympic-throw', scope: 'player', troll: true, mark: 'moment:yeet', name: 'Lancer olympique',
    description: 'Lancer un objet à pleine vitesse',
    quip: 'Objet lancé à pleine vitesse. Record homologué par personne.', reward: { coins: 3, text: '3,14 pièces, arrondies à 3' },
  },
  {
    series: 'bowl-overfills', scope: 'player', troll: true, stat: 'bowlOverfills', tiers: [3, 20],
    names: ['Débordement', 'Les yeux plus gros que la gamelle'],
    description: 'Remplir {n} fois une gamelle déjà pleine',
    quips: [
      'Remplir une gamelle déjà pleine, trois fois. La gravité et le Comité désapprouvent.',
      'Vingt débordements. Le bureau sent la croquette.',
    ],
    reward: [{ coins: 0 }, { box: 'bronze' }],
  },
  {
    series: 'prey-drops', scope: 'player', troll: true, stat: 'preyDrops', tiers: [10, 50],
    names: ['Buffet à volonté', 'Élevage intensif'],
    description: 'Lâcher {n} proies',
    quips: [
      "Dix proies lâchées. Ce n'est plus de la chasse, c'est de la livraison à domicile.",
      'Cinquante proies. Le Comité a prévenu les services vétérinaires. Ils sont en pause.',
    ],
    reward: [{ coins: 1 }, { box: 'silver' }],
  },
  {
    id: 'broke', scope: 'player', troll: true, mark: 'state:broke', name: 'Fauché', description: 'Tomber à zéro pièce après un achat',
    quip: "Zéro pièce. Le Comité te donne un conseil gratuit : arrête d'acheter des chapeaux.",
    reward: { text: 'un conseil (non remboursable)' },
  },
  {
    id: 'delusions-of-grandeur', scope: 'player', troll: true, mark: 'shop:crown', name: 'Folie des grandeurs',
    description: 'Acheter la couronne',
    quip: "Quatre-vingts pièces pour une couronne. Il ne sait même pas ce qu'est un roi.",
    reward: { coins: 1, text: 'une pièce de consolation' },
  },
  {
    id: 'dragon-hoard', scope: 'player', troll: true, stat: 'coins', atLeast: 1000, name: 'Dragon sur son trésor',
    description: 'Avoir 1 000 pièces en poche',
    quip: 'Mille pièces et tu ne dépenses rien. Le Comité respecte. Un peu.', reward: { box: 'gold' },
  },
  {
    id: 'night-menu', scope: 'player', troll: true, mark: 'moment:night-menu', name: 'Insomnie',
    description: 'Ouvrir le menu à 3 h du matin',
    quip: 'Ouvrir le menu à 3 h du matin. Ton animal dort, lui.', reward: { coins: 0 },
  },
  {
    id: 'janitor-reflexes', scope: 'player', troll: true, mark: 'moment:fast-clean', name: 'Réflexes de concierge',
    description: 'Nettoyer une trace moins de 3 s après son apparition',
    quip: 'Nettoyé en moins de trois secondes. Tu attendais à côté ?', reward: { coins: 1 },
  },
  {
    id: 'food-thief', scope: 'player', troll: true, mark: 'moment:food-thief', name: 'Voleur de goûter',
    description: "Retirer la nourriture qu'un animal allait manger",
    quip: "Tu as retiré la nourriture qu'il allait manger. Le Comité n'a rien vu. Si. Frais de dossier.",
    reward: { coins: -1, text: 'frais de dossier' },
  },
]);
