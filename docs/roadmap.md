# Feuille de route

Plan à moyen terme, établi le 2026-09-23, mis à jour le 2026-09-24 (étapes 1
à 9 et sous-étapes 10.1 à 10.9 terminées ; l'ancienne étape 8 — vol/nage — avait été
fusionnée dans l'étape 6). Chaque étape est motivée par ses dépendances
sur les précédentes (voir la justification sous chaque titre) ; l'ordre
n'est pas figé si les priorités changent, mais s'écarter des dépendances
signifie probablement refaire du travail plus tard.

## 1. Interactions & réactions enrichies — ✅ fait

Étoffer le vocabulaire d'événements au-delà du simple clic (`petted`) :
double-clic, clic droit, survol, etc., avec les réactions pack
correspondantes. C'est la brique la plus rapide et la plus fondatrice — le
pipeline existe déjà (`pack.reactionFrames`, `Critter.lastEvent`), il ne
fait que jouer `petted`. Sert de base à quasiment tout le reste (le
mode compagnon aura besoin d'une interaction "nourrir", le mode IA aura besoin
de déclencheurs).

Livré : `tickled`/`annoyed`/`noticed` en plus de `petted`, via
`Critter.interact()` + table `INTERACTION_REACTIONS` centralisée. Détection
clic/glisser migrée vers `Clutter.ClickGesture`/`PanGesture` en cours de
route (l'ancienne détection par signaux bruts ne fonctionnait plus sur
GNOME 50).

## 2. Sons — ✅ fait

Effets sonores accrochés aux réactions/animations existantes. Cheap une
fois qu'il y a du vocabulaire d'événements à habiller (étape 1) — placé ici
comme quick-win avant d'attaquer l'autonomie.

Livré : un son par réaction (`Meta.SoundPlayer.play_from_file`), réglage
"Sons activés" dans les préférences, sons placeholder générés par script
(stdlib Python, pas de dépendance).

## 3. Réactions automatiques — ✅ fait

Suivre le curseur, réagir à l'ouverture d'une fenêtre/notification, se
laver en idle, etc. Peu de code nouveau requis : les capteurs (souris,
fenêtres) existent déjà via `sensors.js`. Consomme le vocabulaire de
l'étape 1 comme base commune.

Livré : états `FOLLOW` et `WASH`, réaction `startled` sur nouvelle fenêtre
(diff des IDs de fenêtres d'un tick à l'autre, pas de nouveau capteur).
Notifications explicitement laissées de côté (aurait demandé d'accrocher
`Main.messageTray`, un sous-système Shell plus engageant).

## 4. Mode IA basique — ✅ fait

Pas une feature séparée : la couche d'orchestration qui choisit entre les
comportements automatiques de l'étape 3, à la place du tirage aléatoire
simpliste actuel dans `Critter._tickWaiting`. N'a de sens qu'une fois qu'il
y a plusieurs comportements à arbitrer.

Livré : `weightedChoice()` (choix pondéré générique, fonction pure
testable) remplace la cascade de seuils indépendants, avec deux effets
contextuels — anti-répétition et suivi sensible à la distance du curseur.

## 5. Interactions entre critters — ✅ fait

Réutilise l'arbitrage de l'étape 4 pour qu'un critter puisse remarquer un
autre critter (avec `critter-count > 1`). Testé d'abord avec plusieurs
instances du même pack démo, pour éviter la complexité de règles
d'interaction inter-espèces avant d'avoir de la variété d'espèces.

Livré : état `GREET` (marche vers le critter le plus proche, `_chase()`
mutualisé avec `FOLLOW`), réaction `greeted` déclenchée sur l'initiateur
ET sur la cible (référence à l'instance réelle transportée à côté de
l'instantané de positions dans `manager.js`, réaction cible délivrée via
`interact()`/`_pendingEvent`). Testé en conditions réelles avec
`critter-count` ≥ 2.

## 6. Autres comportements automatiques — ✅ fait

Étape ouverte : plusieurs pistes proposées et retenues ensemble (pas
fixées à l'avance dans la version initiale de cette feuille de route).
Englobe désormais ce qui était l'ancienne étape 8 (câblage de
`State.FLY`, aujourd'hui du code mort, et refonte de la nage) : leur scope
s'est avéré recouper directement celui-ci une fois discuté.

Comportements retenus :
- **Grimper activement** — chercher délibérément un mur/une fenêtre
  proche pour y grimper, au lieu de ne déclencher CLIMB/CEILING que
  passivement lors d'une chute providentielle (quasi jamais observé en
  pratique aujourd'hui).
- **Réagir à la fenêtre active** — se précipiter vers la fenêtre qui
  vient de prendre le focus (`getWindows()` expose déjà `focused`),
  distinct de `startled` qui réagit à l'ouverture.
- **Course-poursuite entre critters** — extension ludique de GREET
  (étape 5) : après une salutation, poursuite brève entre deux critters.
  Demande `critter-count > 1`, comme GREET.
- **Sieste ciblée** — chercher un rebord de fenêtre proche avant de
  lancer SLEEP, repli sur place si rien à portée.
- **Voler et nager en roaming libre 2D** — `FLY` récupère une vraie
  logique d'atterrissage (aujourd'hui absente : une fois entré, il ne
  s'arrête jamais). `SWIM` est redéfini en roaming libre 2D façon vol
  (recalcul de cible périodique, mouvement en X et Y), plutôt que limité à
  une zone d'eau déclarée comme aujourd'hui (`waterZones`, jamais peuplé
  côté extension/prefs — ce blocage disparaît avec cette refonte).

Livré : états `SEEK_WALL`, `SEEK_FOCUS`, `CHASE`/`FLEE`, `SEEK_NAP`, et
`FLY`/`SWIM` réécrits autour d'un `_tickRoam()` commun (sortie par `FALL`,
donc atterrissage via la détection existante ; nage ondulante
perpendiculairement à la trajectoire). La fuite est une invitation que la
cible peut ignorer, pondérée par la distance au poursuivant. Le pack démo
supporte désormais toutes les locomotions. Testé en conditions réelles.

## 7. Nouveaux animaux — ✅ fait

Fusionne les anciennes étapes 7 ("animaux faciles") et 8 (poissons/oiseaux
"difficiles") : une fois l'étape 6 terminée, toutes les locomotions
(`ground`/`wall`/`ceiling`/`air`/`water`) sont câblées, donc plus de
distinction facile/difficile — juste des packs à créer (chat, insecte
rampant, poisson, oiseau...), qui servent aussi de test de charge pour les
étapes 1-6.

Livré : 4 packs (`cat`, `bug`, `fish`, `bird`), sprites et sons placeholder
générés par script. Deux prérequis ajoutés en chemin : une section
`behavior` dans `pack.json` pour régler le caractère de chaque espèce
(`behaviorOverrides()`, clés filtrées), et le fait qu'une espèce sans sol
(le poisson) ne se pose jamais et enchaîne ses nages. Les préférences
proposent une liste déroulante des packs, et `tests/packs.test.js` valide
automatiquement chaque pack. Testé en conditions réelles avec chaque animal.

## 8. Rendu sprites amélioré — ✅ fait

Polish visuel (pixel-art plus abouti, animations plus fluides) une fois la
liste d'états et d'animaux stabilisée par les étapes précédentes — éviter
de repeindre deux fois si un nouvel état apparaît en cours de route (ex.
"se laver" à l'étape 3).

Livré : rendu au plus proche voisin (`set_content_scaling_filters`),
sprites dessinés en 32x32 par `scripts/gen_species_sprites.py` (ombrage à
trois tons, contour automatique, 6 frames de marche/vol/nage), feuilles
dédiées par état (grimper, plafond, course, fuite, salut) et par réaction
pour cat/bug/fish/bird.

## 9. Persistance de l'état — ✅ fait

Position, humeur, etc. qui survivent à un redémarrage de GNOME Shell.
Aujourd'hui tout repart de zéro à chaque activation de l'extension. Prérequis
technique isolé, dont le seul vrai consommateur est le mode compagnon
(étape 10) : humeur/croissance qui doivent survivre dans le temps.

Livré : `core/persistence.js` (JSON versionné, lecture tolérante),
`Critter.serialize()`/`restore()` (position + orientation, reprise en
`FALL` ; l'objet `extra` est réservé au mode compagnon), clé GSettings cachée
`saved-state` écrite toutes les 30 s et à la désactivation, restaurée si le
pack est le même.

## 10. Mode compagnon

S'occuper de l'animal, le faire grandir, gérer ses besoins. Le morceau le
plus gros : capstone qui s'appuie sur les interactions/besoins des étapes
1-6 et sur la persistance de l'étape 9. Découpé en sous-étapes livrables
séparément, chacune précédée de son propre plan détaillé. Principes
communs : modèle pur et testable dans `core/` (le critter garde la
décision, les jauges modulent les poids), temps réel avec rattrapage
plafonné, aucune mort (départ doux et réversible), extension limitée à
l'affichage et aux capteurs, réglages d'espèce dans `pack.json`.

### 10.1 Besoins et humeur — ✅ fait
Jauges (faim, énergie, bonheur, propreté, ennui, santé, affection),
difficulté et mode vacances, effets sur les poids de comportement,
sauvegarde v2 avec migration, icône de barre avec les jauges, bulles de
pensée. Voir `docs/needs.md`. « Nourrir » du menu est provisoire (10.2).

### 10.2 Nourrir et objets du bureau — ✅ fait
Framework d'objets (nourriture, gamelle, lit), états de recherche de
nourriture et de repas, menu contextuel (clic milieu) et menu de l'icône. Voir `docs/needs.md`.

### 10.3 Jouer, ennui, affection — ✅ fait
Balle et peluche (physique, lancer à la souris), pointeur laser, état de
jeu, caresses prolongées, brossage, « Ranger les jouets ». Voir `docs/needs.md`.

### 10.4 Croissance, personnalité, évolution — ✅ fait
Âge et stades (œuf à senior), personnalité, évolution selon les soins,
apparence aléatoire à la naissance (rotation de teinte, sauvegardée),
sprites par stade, départ doux et retour. Voir `docs/life.md`.

### 10.5 Rythme du monde — ✅ fait
Jour/nuit, inactivité, rappel de pause, notifications, frappe clavier. Voir `docs/rhythm.md`.

### 10.6 Progression — ✅ fait
Pièces et boutique, succès propres à chaque espèce et à sa personnalité
(déclarés dans `pack.json`), boutique et accessoires, tours, cadeaux,
anniversaires. Voir `docs/progression.md`.

### 10.7 Mode autonomie — ✅ fait
L'animal couvre lui-même ses besoins (proies, plantes, gamelle) : niveau
d'autonomie qui suit la croissance et l'apprentissage, forçable dans les
réglages ; proies qui fuient, plantes qui repoussent, gamelle qui moisit.
Voir `docs/autonomy.md`.

### 10.8 Besoins naturels — ✅ fait
« Faire ses besoins » : jauge de soulagement, litière ou coin, traces à
nettoyer au clic, propreté et santé en jeu, accidents. Voir `docs/needs.md`.

### 10.9 Noms et menus multi-créatures — ✅ fait
Donner un nom à chaque créature (choisi par le joueur, modifiable, sauvegardé)
et revoir les menus quand il y a plusieurs créatures : menu de l'icône de
barre (un bloc par créature, actions ciblées sur l'une d'elles), menu
contextuel, affichage des noms. Voir `docs/creatures.md`.

## 11. Sprites dédiés pour chaque état — ✅ fait

Aujourd'hui beaucoup d'états réutilisent l'animation d'un autre (marche pour
le suivi, la recherche de mur ou de nourriture ; sommeil pour le lavage ;
vol pour le piqué ; etc.). Donner une animation propre à chaque état de
`core/critter.js` (jeu, brossage, hibernation, rappel de pause, repas,
recherche de nourriture, escalade, plafond, poursuite...) et à chaque
réaction, pour toutes les espèces, avec le même soin de dessin que la
passe de l'étape 8.

Livré : chat, oiseau, insecte et poisson ont une feuille propre pour chaque état
atteignable et 20 réactions distinctes (générées par recettes de poses,
vérifiées par `tests/packs.test.js`). Le pack de démonstration reste minimal.

## 12. Apparence propre à chaque stade de croissance — ✅ fait

Remplacer la simple mise à l'échelle des stades (bébé 50 %, jeune 75 %) par
des sprites différents : proportions de bébé (grosse tête, petits membres),
silhouette de jeune, adulte, senior (pelage grisonnant, posture voûtée),
œuf propre à chaque espèce. Format `stages` de `pack.json` étendu pour
désigner les feuilles par stade, avec repli sur la mise à l'échelle.

## 13. Rendu moins pixellisé — ✅ fait

Sortir de l'aspect « gros pixels » : résolution de dessin plus fine (sprites
64 px ou plus pour un affichage identique), lissage adapté au HiDPI,
ombrage plus riche, contours plus doux. À trancher au moment de planifier :
garder un style pixel-art plus détaillé, ou passer à un rendu vectoriel/lissé.
Impacte le générateur de sprites, le chargeur de packs et le filtre
d'affichage.

Livré (créatures seulement) : style hybride. Feuilles des 4 espèces en 64 px
(`spriteSize` inchangé), formes tracées à 256 px puis réduites (bords lissés),
ombrage en dégradé, contour doux, yeux et marques fins ; `"smooth": true` dans
`pack.json` fait lisser la réduction par l'extension. Objets, accessoires et
bulles restent en pixel-art (étape 14). Corrigé au passage : le chat était vert
(constantes de la chenille qui écrasaient celles du chat).

## 14. Objets : visuels et variations — à tester

Améliorer le dessin des objets du bureau (nourriture, gamelle, lit, jouets)
et ajouter des variations : plusieurs modèles de lit et de gamelle, couleurs
de balle, plus d'aliments et de jouets, états visibles (gamelle qui se vide,
nourriture entamée), sprites cohérents avec le nouveau rendu de l'étape 13.

Livré : tous les sprites d'interface (objets, proies, plantes, cadeaux,
litière, traces, laser, accessoires, bulles, œuf commun) passent au rendu fin
de l'étape 13 (`scripts/finedraw.py`, partagé avec les créatures), au double
de leur taille d'affichage. Lits (coussin, panier, couffin) et gamelles
(céramique, inox, bois) choisis dans un sous-menu ; balle, pelote et peluche
tirent une variante au hasard. Aliments en bouchées : un animal repu laisse un
reste entamé, visible et sauvegardé ; la gamelle montre son aliment et son
niveau. Nouveaux aliments (pâtée, vers de farine, pomme, flocons) et jouets
(pelote de laine, anneau flottant pour le poisson). Noms et tailles des
sprites dans `core/itemLooks.js`, vérifiés contre les fichiers par
`tests/itemLooks.test.js`. Corrigé au passage : les menus « Donner à manger »
proposaient les plantes du régime, qui posaient un aliment invisible.

## 15. Grande bibliothèque de succès

Définir puis générer une grosse bibliothèque de succès (des dizaines à des
centaines), propres aux espèces et aux caractères : paliers (10, 50, 200...),
succès cachés, succès de collection (accessoires, tours, cadeaux), de
saison et de durée de vie. À trancher au moment de planifier : compteurs
supplémentaires à suivre dans `core/stats.js`, format des paliers et de la
génération (gabarits dans les packs plutôt que des listes écrites à la main),
récompenses, affichage groupé dans le menu, validation automatique de la
bibliothèque par les tests.

## 16. Langues et traductions

Prendre en compte plusieurs langues : sortir tous les textes français
(menus, fenêtres, notifications, libellés d'aliments, jouets, accessoires, tours,
noms et descriptions des succès, journal, préférences) vers un mécanisme de
traduction standard de GNOME (gettext : `_()` côté extension, domaine
`gettext-domain` déjà présent dans le schéma), avec des fichiers `.po` par
langue (français, anglais au minimum). À trancher au moment de planifier : la
langue de référence des sources, la traduction des textes portés par les packs
(noms d'espèce, prénoms, succès) et par le cœur (événements du journal),
l'outillage d'extraction (`xgettext`) et de compilation (`msgfmt`) dans
`scripts/build.sh`, et des tests qui vérifient qu'aucun texte n'échappe à la
traduction.
