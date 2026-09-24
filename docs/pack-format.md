# Format d'un pack d'animal (pixel-art)

Un pack décrit une espèce : ses sprites, ses animations, ce qu'elle sait
faire (marcher au sol, grimper aux murs, marcher au plafond, nager, voler)
et quelques paramètres de comportement. Objectif : ajouter un nouvel animal
sans toucher au code, en ne fournissant qu'un dossier.

## Arborescence d'un pack

```
packs/<species-id>/
  pack.json
  sprites/
    walk.png       # spritesheet, une ligne de frames par animation
    idle.png
    fall.png
    sleep.png
    ...
```

## `pack.json`

```jsonc
{
  "id": "critter-demo",
  "displayName": "Critter (démo)",
  "version": "0.1.0",
  "author": "toi",

  // Ce que l'espèce sait utiliser comme surfaces. Valeurs possibles :
  // "ground" (sol + rebords de fenêtres), "wall", "ceiling", "water", "air".
  "supportedSurfaces": ["ground"],

  // Taille d'affichage à l'écran, en pixels logiques (avant mise à l'échelle
  // HiDPI). Libre : l'insecte (packs/bug) utilise 16x16.
  "spriteSize": { "width": 32, "height": 32 },

  // Vitesses en px/s, reprises telles quelles par core/critter.js.
  "speeds": {
    "walk": 40,
    "climb": 30,
    "swim": 25,
    "fly": 60
  },

  // Optionnel : surcharge du caractère de l'espèce. Toute clé de
  // DEFAULT_CONFIG (core/critter.js) de type nombre ou intervalle [min, max]
  // est acceptée : poids des activités idle (sleepWeight, washWeight,
  // followWeight, greetWeight, climbSeekWeight, seekFocusWeight, flyWeight,
  // swimWeight...), durées (idleDuration, sleepDuration, flyDuration...),
  // ondulation de nage (swimWaveAmplitude, swimWaveFrequency), etc. Les
  // autres clés sont ignorées avec un avertissement dans le journal de
  // GNOME Shell. Les vitesses de "speeds" gardent la priorité.
  "behavior": {
    "sleepWeight": 15,
    "idleDuration": [1, 3]
  },

  // Une entrée par état du cœur (voir core/critter.js State). "frameDuration"
  // est en secondes. "loop" indique si l'animation boucle ou se fige sur la
  // dernière frame (utile pour une transition courte).
  "animations": {
    "idle":   { "file": "sprites/idle.png",  "frames": 4, "frameDuration": 0.5, "loop": true },
    "walk":   { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "fall":   { "file": "sprites/fall.png",  "frames": 2, "frameDuration": 0.15, "loop": true },
    "drag":   { "file": "sprites/fall.png",  "frames": 1, "frameDuration": 1,   "loop": false },
    "sleep":  { "file": "sprites/sleep.png", "frames": 2, "frameDuration": 0.8, "loop": true },
    "climb":  { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "ceiling":{ "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "swim":   { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.2, "loop": true },
    "fly":    { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.1, "loop": true },
    "follow": { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "wash":   { "file": "sprites/sleep.png", "frames": 2, "frameDuration": 0.5, "loop": true },
    "greet":  { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "seekWall": { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "seekFocus": { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "chase":    { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "flee":     { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "seekNap":  { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.12, "loop": true },
    "run":      { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.06, "loop": true },
    "swimFast": { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.1,  "loop": true },
    "flyFast":  { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.05, "loop": true },
    "dive":     { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.1,  "loop": true },
    "eat":      { "file": "sprites/idle.png",  "frames": 4, "frameDuration": 0.15, "loop": true },
    "seekFood": { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.1,  "loop": true },
    "play":     { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.08, "loop": true },
    "brushed":  { "file": "sprites/sleep.png", "frames": 2, "frameDuration": 0.5,  "loop": true },
    "remind":   { "file": "sprites/walk.png",  "frames": 4, "frameDuration": 0.08, "loop": true }
  },
  // Un état sans entrée retombe silencieusement sur "idle" (rétrocompatible :
  // rien à faire pour profiter d'un nouvel état ajouté à core/critter.js),
  // sauf les allures rapides qui retombent d'abord sur leur allure normale :
  // "run" et "seekFood" -> "walk", "swimFast" -> "swim", "flyFast" et "dive"
  // -> "fly", "eat" -> "idle", "play" -> "run" puis "walk", "brushed" ->
  // "wash" puis "idle", "remind" -> "follow" puis "walk".

  // Réactions courtes jouées par-dessus l'animation courante, déclenchées par
  // les événements du cœur (voir Critter#lastEvent : "petted", "tickled",
  // "annoyed", "noticed", "startled" (nouvelle fenêtre), "greeted" (a
  // atteint un autre critter en état GREET), "purring" (3e caresse d'une série),
  // "brushed" (fin du brossage), "played" (fin d'une session de jeu), "ate",
  // "grabbed", "released",
  // "landed", "sleep", "wash", ...).
  // "sound" est optionnel : chemin relatif au pack vers un .wav/.ogg joué
  // une fois au déclenchement (rien ne se passe si absent ou si l'utilisateur
  // a désactivé les sons dans les préférences de l'extension).
  "reactions": {
    "petted": {
      "file": "sprites/idle.png",
      "frames": 1,
      "frameDuration": 0.6,
      "sound": "sounds/petted.wav"
    }
  }
}
```

## Besoins (`needs`)

Section optionnelle pour régler la vitesse à laquelle chaque besoin baisse
(`decayPerHour`, par jauge : `satiety`, `energy`, `cleanliness`,
`stimulation`, `affection`). Voir `docs/needs.md`.

```jsonc
"needs": {
  "decayPerHour": { "energy": 3, "cleanliness": 2 },
  "diet": { "fish": 60, "meat": 45, "kibble": 30 }
}
```

`diet` : aliments que l'espèce mange (`meat`, `fish`, `kibble`, `seeds`,
`plankton`) et gain de satiété de chacun ; un aliment absent est ignoré.

## Apparence et stades (`appearance`, `stages`)

Sections optionnelles décrites dans `docs/life.md` : plage de teinte et
colorisation des gris (`appearance`), échelle d'affichage par stade
(`stages`). Animations facultatives `egg` et `hibernate` ; réactions
`hatched`, `grew`, `awakened`.

## Progression (`achievements`, `tricks`, `anchors`)

Sections optionnelles décrites dans `docs/progression.md` : succès propres à
l'espèce et au caractère, tours de l'espèce, point d'ancrage de la tête pour
les accessoires. Animations facultatives `trick_sit`, `trick_roll`,
`trick_flip` (l'une par tour déclaré) et `gift`.

## Règle du spritesheet

Chaque fichier PNG référencé est une seule ligne de `frames` images carrées
sans marge entre les frames. La taille d'une case est la hauteur du PNG : elle
doit être un multiple entier de `spriteSize` (les packs cat/bug/fish/bird
dessinent en 32x32 ; l'insecte est affiché à 16 px, sa feuille est donc
réduite). L'affichage se fait au plus proche voisin (pas de flou). C'est le format le plus simple
à découper côté extension (un `Clutter.Image` par frame, généré une fois au
chargement du pack puis mis en cache).

Le sprite est dessiné face à droite par défaut ; quand `facing === -1`, la
couche de rendu retourne l'image horizontalement plutôt que de dupliquer les
frames.

## Vol

Une espèce qui sait marcher au sol et voler (oiseau, pack démo) choisit dès
le décollage un sol ou un rebord de fenêtre où se poser, y vole en ligne
droite et s'y pose : elle ne retombe jamais en chute libre. Elle ne change de
cible que très rarement (`flyRetargetChance`, probabilité par seconde) ou si
sa surface cible disparaît ou bouge. `flyDuration` ne s'applique donc qu'aux
espèces purement aériennes (voir ci-dessous).

Deux comportements en plus : le **vol rapide** (`flyFastWeight`,
`flyFastFactor`) et le **piqué** : au décollage, avec la probabilité
`flyCruiseChance`, l'animal monte d'abord à une altitude de croisière, puis
en descendant vers sa cible il peut piquer (`diveChance` par seconde, cible
au moins `diveMinHeight` plus bas et angle raide, vitesse `diveSpeedFactor`).
Le piqué finit toujours par l'atterrissage sur la cible.

## Allures rapides et nage

`run` (`runWeight`, `runSpeedFactor`), `swimFast` (`swimFastWeight`,
`swimFastFactor`) et `flyFast` sont les versions rapides de la marche, de la
nage et du vol. Une espèce sans sol enchaîne ses sessions en tirant une
session rapide avec la probabilité `fastChance`. La nage retire sa cible
toutes les `swimRetargetDuration` secondes (5 à 10 par défaut), avec un
virage d'au plus `swimTurnMax` degrés à chaque fois ; le vol libre des
espèces aériennes garde `roamRetargetDuration`.

## Espèces sans sol

Une espèce dont `supportedSurfaces` ne contient pas `"ground"` mais
contient `"water"` (ou `"air"`) ne se pose jamais : à la fin d'une session
de nage (ou de vol) elle en enchaîne une autre, et si elle tombe (spawn,
fin de glisser) elle repart dans son roaming en touchant le sol. C'est le
cas du poisson (`packs/fish`, `["water"]`).

## Packs fournis

| Dossier | Espèce | Locomotions | Particularités |
|---|---|---|---|
| `critter-demo` | Critter (démo) | toutes | pack de référence |
| `cat` | Chat | sol, murs, plafond | dort et se lave souvent, suit le curseur |
| `bug` | Insecte | sol, murs, plafond | 16 px, rapide, grimpe sans arrêt |
| `fish` | Poisson | eau seulement | nage ondulante en continu |
| `bird` | Oiseau | sol, air | vole souvent, se pose sur les rebords |

Leurs sons sont des placeholders générés par
`scripts/gen_placeholder_sounds.py`. Les sprites de `critter-demo` viennent de
`scripts/gen_placeholder_sprites.py` ; ceux de cat/bug/fish/bird de
`scripts/gen_species_sprites.py` (dessin 32x32 avec contour automatique), qui
réécrit aussi les sections `animations` et `reactions` de leur `pack.json`
(une espèce en argument pour n'en régénérer qu'une). Ces packs ont des
feuilles dédiées pour la plupart des états (grimper, plafond, course, fuite,
salut...) et pour chaque réaction. `tests/packs.test.js`
vérifie automatiquement chaque pack (fichiers présents, découpage des
spritesheets, sons, clés `behavior`).

## Ajouter une nouvelle espèce

1. Copier `packs/critter-demo/` sous un nouveau `<species-id>`.
2. Remplacer les spritesheets par les tiens (même convention de découpage).
3. Ajuster `supportedSurfaces` et `speeds` selon ce que l'animal doit savoir
   faire (un poisson : `["water"]` ; un oiseau : `["ground", "air"]`, etc.),
   puis donner du caractère à l'espèce via `behavior`.
4. Lancer `npm test` : `tests/packs.test.js` signale tout fichier manquant
   ou spritesheet mal découpé.
5. Aucun changement de code n'est nécessaire pour un comportement standard,
   y compris les activités idle automatiques déjà câblées (suivre le
   curseur, se laver, sursauter à l'ouverture d'une fenêtre) : elles
   marchent pour toute espèce, avec ou sans animation dédiée dans le pack.
   Un comportement vraiment nouveau (ex: une espèce qui vole en formation
   avec d'autres critters) reste un ajout dans `core/critter.js`.
