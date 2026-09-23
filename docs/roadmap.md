# Feuille de route

Plan à moyen terme, établi le 2026-09-23, mis à jour le 2026-09-23 (avancement
après l'étape 4). Chaque étape est motivée par ses dépendances sur les
précédentes (voir la justification sous chaque titre) ; l'ordre n'est pas
figé si les priorités changent, mais s'écarter des dépendances signifie
probablement refaire du travail plus tard.

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

## 5. Interactions entre critters

Réutilise l'arbitrage de l'étape 4 pour qu'un critter puisse remarquer un
autre critter (avec `critter-count > 1`). Testé d'abord avec plusieurs
instances du même pack démo, pour éviter la complexité de règles
d'interaction inter-espèces avant d'avoir de la variété d'espèces.

## 6. Autres comportements automatiques

Étape ouverte, contrairement aux précédentes : au moment de l'attaquer,
plusieurs idées de comportements seront proposées (pas fixées à l'avance
dans cette feuille de route) pour choisir ensemble lesquels valent le
coup. Placée ici plutôt que plus tard : encore dans l'arc "comportement
solo/multi-critter" des étapes 3-5, avant de passer à du contenu (nouvelles
espèces) qui bénéficie d'avoir déjà un roster de comportements riche.

## 7. Animaux "faciles"

Chat, insecte rampant, etc. — tout ce qui reste dans les locomotions déjà
câblées (`ground`/`wall`/`ceiling`). Contenu réutilisant tel quel ce qui
existe, et sert de test de charge pour les étapes 1-6.

## 8. Mécaniques manquantes + animaux "difficiles"

`State.FLY` est aujourd'hui du code mort (comme `CLIMB` l'était avant
qu'on le câble) : aucune transition n'y mène. Les zones d'eau
(`waterZones`) existent dans `core/surfaceMap.js` mais ne sont jamais
peuplées côté extension/prefs. Une fois ces deux mécaniques branchées,
poissons et oiseaux deviennent des packs comme les autres.

## 9. Rendu sprites amélioré

Polish visuel (pixel-art plus abouti, animations plus fluides) une fois la
liste d'états et d'animaux stabilisée par les étapes précédentes — éviter
de repeindre deux fois si un nouvel état apparaît en cours de route (ex.
"se laver" à l'étape 3).

## 10. Persistance de l'état

Position, humeur, etc. qui survivent à un redémarrage de GNOME Shell.
Aujourd'hui tout repart de zéro à chaque activation de l'extension. Prérequis
technique isolé, dont le seul vrai consommateur est le tamagotchi
(étape 11) : humeur/croissance qui doivent survivre dans le temps.

## 11. Mode tamagotchi

S'occuper de l'animal, le faire grandir, gérer ses besoins. Le morceau le
plus gros : capstone qui s'appuie sur les interactions/besoins des étapes
1-6 et sur la persistance de l'étape 10. Les stades de croissance
demanderont plusieurs jeux de sprites par animal, d'où sa place après la
passe graphique de l'étape 9.
