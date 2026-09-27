# Progression : compteurs, succès, pièces, journal

## Compteurs et marques

Chaque animal compte ce qu'il fait (`core/stats.js`) : repas, parties, coups de
balle, brossages, caresses, escalades, vols, nages, siestes, temps de sommeil,
chutes, voyages à la souris, chatouilles, sursauts, restes laissés, tours
ratés... (une cinquantaine de compteurs, tous visibles dans « Statistiques »),
plus des **marques** de ce qu'il a connu : aliments goûtés, jouets essayés,
accessoires portés, sortes de cadeaux, lits, saisons et fêtes vécues, moments
insolites (éveillé à 3 h du matin, tombé du plafond...). Le joueur a les siens
(`core/player.js`) : ouvertures des menus, des réglages et du journal,
vacances, laser, objets retirés, pièces dépensées... Tout est sauvegardé ; un
œuf ne compte rien (sauf les caresses qu'on lui fait).

## Succès

Environ 200 à 260 succès par espèce, développés à partir de **gabarits**
(`core/achievements.js`) : une bibliothèque commune (`core/achievementLibrary.js`)
et la section `achievements` du pack. Ils se rangent en rubriques : Soins, Jeu,
Exploration, Vie, Collection, Saisons, **Bêtises** (les succès « troll » de
l'animal) et **Toi** (les succès du joueur, partagés entre ses animaux). Plus de
40 % sont des bêtises : inutiles, moqueuses, aux récompenses farfelues.

### Gabarits

Une **série** donne plusieurs paliers :

```jsonc
{
  "series": "meals", "category": "care", "stat": "meals",
  "tiers": [10, 50, 200, 1000, 5000],
  "names": ["Petit creux", "Bon appétit", "Belle fourchette", "Estomac sur pattes", "Gouffre sans fond"],
  "description": "Faire {n} repas",   // {n} : le palier (« 1 000 »), {s} : « s » au pluriel
  "title": "gouffre sans fond"          // titre gagné au dernier palier (facultatif)
}
```

- Condition : `stat` (un compteur, ou `daysAlive`, `stageReached`,
  `tricksLearned`, `achievementsUnlocked`), ou `marks` (nombre de marques d'une
  famille : `food`, `toy`, `accessory`, `gift`, `bed`, `season`, `holiday`...).
- `tiers` : des nombres croissants, `"all"` (tout ce que l'espèce peut
  collectionner : tous les aliments de son régime, tous ses jouets, tous ses
  tours...), ou `{ "at": 100, "id": "traveler" }` pour garder un ancien
  identifiant (les sauvegardes restent valides). `unit` : 3600 pour des
  paliers en heures ; `descriptions` : une description par palier.
- Pièces par défaut selon le rang du palier : 5, 10, 20, 40, 80, 150 (ou
  `coins`, un tableau).

Un **succès unique** : `{ "id", "category", "name", "description", "stat" +
"atLeast" | "marks" + "atLeast" | "mark": "holiday:christmas", "coins" }`.
L'ancien format `"condition": { "stat", "atLeast" }` reste accepté.

Communs aux deux :

- `requires` : `trait` (`playful`, `lazy`, `greedy`, `shy`), `stage`, et `can`
  (`ground`, `wall`, `ceiling`, `air`, `water`, `hunt`, `graze`, `relieve`,
  `sleep`, `groom`, `tricks`) : un succès impossible pour l'espèce (voler pour
  un chat, dormir pour un poisson) est écarté d'office.
- `scope: "player"` : succès du joueur (rubrique « Toi »), sur ses propres
  compteurs (`menuOpens`, `coinsSpent`, `coins`, `accessoriesOwned`...).
- Un pack remplace une entrée de la bibliothèque en reprenant son `series`
  (ou son `id`), ou la retire avec `{ "series": "...", "disabled": true }`.

### Bêtises (succès « troll ») et le Système

`"troll": true` : le succès est **caché** jusqu'à sa découverte (la rubrique
n'en donne que le nombre), et porte un `quip`, le commentaire du Système. Sa
`reward` est farfelue : `{ "coins": 0 }` (rien), une somme absurde
(`{ "coins": 3, "text": "3,14 pièces, arrondies à 3" }`), des frais de dossier
(`{ "coins": -1 }`, jamais sous zéro), une **boîte** (`{ "box": "bronze" }`,
`silver`, `gold`, `platinum`, `legendary` : ouverte d'office, le plus souvent
vide ou presque, parfois un vrai lot), un accessoire ridicule
(`{ "accessory": "cone" }`) ou un simple texte (`{ "text": "une plume" }`).
Exemples : caresser un œuf 10 fois, 500 chutes, ouvrir le menu 10 000 fois,
remplir une gamelle déjà pleine, être éveillé à 3 h du matin.

**Le Système** (`core/narrator.js`) annonce tous les succès, en tutoyant le
joueur : sobre pour un vrai succès, sarcastique pour une bêtise (spectateurs et
sponsors imaginaires ; il se moque du joueur, jamais de l'animal). Plus de trois
succès d'un coup (un animal ancien qui rattrape son retard) donnent une seule
notification et une seule ligne de journal.

### Récompenses

- **Pièces** : selon le palier, ou la valeur du succès.
- **Titres** : chaque série terminée (et quelques bêtises) donne un titre
  invariable (« as de la sieste », « pilote d'essai en chute libre »). Il se
  choisit dans la rangée « Titre » du menu de l'animal, s'affiche sous son nom
  au survol et dans les en-têtes des menus (« Minou, as de la sieste — Adulte… »).
- **Trophées** : médaille (25 succès), couronne de laurier (50), auréole (100),
  au total des succès du joueur (animaux et joueur confondus, il ne redescend
  jamais). Offerts d'office, jamais en boutique.
- **Accessoires ridicules** : cône de la honte, chaussette, chapeau en papier
  alu, gagnés par certaines bêtises ou dans les boîtes.

`tests/packs.test.js` valide la bibliothèque de chaque pack : aucune entrée
rejetée, au moins 150 succès dont 40 % de bêtises, chaque rubrique
représentée, au moins 20 titres, identifiants historiques préservés, aucun
doublon.

## Pièces

Gagnées en s'occupant des animaux : repas +1, jeu +2, brossage +1,
ronronnement +1 (ces quatre-là espacés de 30 s par animal pour empêcher de les
enchaîner), éclosion +10, nouveau stade +15, succès (leur valeur). Le solde,
les achats, le journal, les compteurs et succès du joueur sont sauvegardés à
part (`saved-player`).

## Journal

Les 100 derniers événements (éclosion, nouveau stade, succès...), dans l'onglet
« Journal » de la fenêtre de progression.

Les annonces du Système (succès, bêtises, rafales, trophées) sont **notifiées**
et gardées en entier : le journal en conserve le texte complet, en gras avec un
point tant qu'elles ne sont pas lues. Le nombre de non lues s'affiche en
pastille à côté de l'icône du panneau et dans la ligne « Journal » du menu. Un
clic sur une entrée la marque lue ; « Tout marquer comme lu » vide le compteur
et « Non lus seulement » filtre la liste. Les autres événements sont des
entrées simples, déjà lues.

Les annonces passent aussi par une source de notifications GNOME « Critter »
(`extension/lib/notifier.js`) : elles restent dans la liste jusqu'à leur
fermeture. Fermer une notification la marque lue ; cliquer dessus ouvre le
journal. Si l'API du shell échoue, repli sur `Main.notify` (éphémère).

## Boutique et accessoires

Menu de l'icône de barre, « Boutique » : chapeau de fête (20 pièces), nœud
(15), lunettes (30), couronne (80), plus des accessoires **gratuits de
saison** (bonnet de Noël en décembre, chapeau de sorcière en octobre).
Trophées et accessoires ridicules ne s'achètent pas (voir Récompenses). Une
fois acheté, un accessoire se porte via « Accessoires » dans le menu de
l'animal (clic milieu). Il se pose sur la tête, suit le sens de marche et
l'échelle du stade, et disparaît dans l'œuf. Le point d'ancrage de la tête
est réglable par pack : `"anchors": { "head": { "x": 0.78, "y": 0.2 } }`
(fractions du sprite tourné vers la droite).

Les aliments premium coûtent des pièces à chaque don : poisson 3, viande 2,
pâtée 2 (x5 pour remplir une gamelle). Croquettes, graines, vers de farine,
pomme, plancton, flocons, jouets, gamelles et lits restent gratuits.

## Anniversaires

À chaque année de vie (365 jours d'âge), l'animal fête son anniversaire :
+25 pièces, une entrée de journal, et un chapeau de fête pendant vingt-quatre
heures (s'il ne porte pas déjà un accessoire).

## Tours

Chaque pack déclare les tours de l'espèce (`"tricks": ["sit", "roll"]` ;
tours connus : `sit` assis, `roll` roulade, `flip` saut périlleux). Dans le
menu de l'animal, « Tours » > « Entraîner » : un essai réussit avec la
probabilité de la maîtrise (15 % minimum), qui monte à chaque essai (plus
vite pour un joueur, plus lentement pour un paresseux). À 100 % le tour est
appris (+10 pièces, entrée de journal) et « Faire : ... » apparaît. Les tours
sont sauvegardés avec l'animal. Animations : `trick_sit`, `trick_roll`,
`trick_flip` (replis sur `idle`, `play`, `swim`, `walk`).

## Cadeaux

Un adulte (ou senior) dont l'affection dépasse 70 peut, rarement (au plus un
toutes les 20 minutes, la première après 20 minutes d'activité), venir
déposer un cadeau près de ton curseur : pièce (5 pièces), fleur (3) ou plume
(8, rare). Un clic le ramasse et crédite les pièces ; oublié, il disparaît
au bout de 30 minutes. Sans pénalité.
