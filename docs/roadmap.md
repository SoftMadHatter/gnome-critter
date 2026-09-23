# Feuille de route

Plan à moyen terme, établi le 2026-09-23, mis à jour le 2026-09-23 (fusion
de l'ancienne étape 8 — mécaniques de vol/nage — dans l'étape 6, suite à
l'élargissement de son scope). Chaque étape est motivée par ses dépendances
sur les précédentes (voir la justification sous chaque titre) ; l'ordre
n'est pas figé si les priorités changent, mais s'écarter des dépendances
signifie probablement refaire du travail plus tard.

## 1. Interactions & réactions enrichies — ✅ fait

Étoffer le vocabulaire d'événements au-delà du simple clic (`petted`) :
double-clic, clic droit, survol, etc., avec les réactions pack
correspondantes. C'est la brique la plus rapide et la plus fondatrice — le
pipeline existe déjà (`pack.reactionFrames`, `Critter.lastEvent`), il ne
fait que jouer `petted`. Sert de base à quasiment tout le reste (le
tamagotchi aura besoin d'une interaction "nourrir", le mode IA aura besoin
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

## 5. Interactions entre critters — 🧪 à tester

Réutilise l'arbitrage de l'étape 4 pour qu'un critter puisse remarquer un
autre critter (avec `critter-count > 1`). Testé d'abord avec plusieurs
instances du même pack démo, pour éviter la complexité de règles
d'interaction inter-espèces avant d'avoir de la variété d'espèces.

Livré : état `GREET` (marche vers le critter le plus proche, `_chase()`
mutualisé avec `FOLLOW`), réaction `greeted` déclenchée sur l'initiateur
ET sur la cible (référence à l'instance réelle transportée à côté de
l'instantané de positions dans `manager.js`, réaction cible délivrée via
`interact()`/`_pendingEvent`). 39/39 tests verts ; reste à vérifier en
conditions réelles (`scripts/dev.sh`, `critter-count` ≥ 2).

## 6. Autres comportements automatiques — 🚧 en cours

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

## 7. Nouveaux animaux

Fusionne les anciennes étapes 7 ("animaux faciles") et 8 (poissons/oiseaux
"difficiles") : une fois l'étape 6 terminée, toutes les locomotions
(`ground`/`wall`/`ceiling`/`air`/`water`) sont câblées, donc plus de
distinction facile/difficile — juste des packs à créer (chat, insecte
rampant, poisson, oiseau...), qui servent aussi de test de charge pour les
étapes 1-6.

## 8. Rendu sprites amélioré

Polish visuel (pixel-art plus abouti, animations plus fluides) une fois la
liste d'états et d'animaux stabilisée par les étapes précédentes — éviter
de repeindre deux fois si un nouvel état apparaît en cours de route (ex.
"se laver" à l'étape 3).

## 9. Persistance de l'état

Position, humeur, etc. qui survivent à un redémarrage de GNOME Shell.
Aujourd'hui tout repart de zéro à chaque activation de l'extension. Prérequis
technique isolé, dont le seul vrai consommateur est le tamagotchi
(étape 10) : humeur/croissance qui doivent survivre dans le temps.

## 10. Mode tamagotchi

S'occuper de l'animal, le faire grandir, gérer ses besoins. Le morceau le
plus gros : capstone qui s'appuie sur les interactions/besoins des étapes
1-6 et sur la persistance de l'étape 9. Les stades de croissance
demanderont plusieurs jeux de sprites par animal, d'où sa place après la
passe graphique de l'étape 8.
