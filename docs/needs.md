# Besoins et humeur

Chaque animal a des jauges de 0 à 100, où **100 = satisfait**. Elles baissent
avec le temps réel, orientent son comportement, sont sauvegardées et
visibles dans l'icône de la barre supérieure et dans les bulles de pensée.
Le modèle est dans `core/needs.js` (pur, testé), le `Critter` en possède une
instance.

## Jauges

| Jauge | Baisse (par heure, difficulté normale) | Remontée |
|---|---|---|
| `satiety` (satiété) | 5 | manger : gain propre à l'aliment (`needs.diet`) |
| `energy` | 6 | dormir : +60 par heure |
| `cleanliness` | 4 | fin d'un lavage : +30 ; brossage : +25 |
| `stimulation` (contre l'ennui) | 10 | activité physique : +25 par heure ; jeu : +25 ; réactions |
| `affection` | 4 | caresse +8 (ronronnement +12), chatouille +3, salutation +4, jeu +6, brossage +6 |
| `relief` (soulagement) | 8, et un cinquième du gain de chaque repas | se soulager : +85 |
| `health` | baisse de 6 par heure quand la moyenne des cinq autres est sous 25 | remonte de 4 par heure au-dessus de 50 |

L'humeur (`mood`) n'est pas stockée : moyenne des cinq besoins pondérée par
la santé. Un nouvel animal démarre à 80 partout. Il n'y a jamais de mort :
la santé se rétablit dès que l'on s'occupe de l'animal.

Pendant le sommeil, les besoins baissent à 25 % de leur vitesse.

## Effet sur le comportement

Le critter garde la décision : les jauges multiplient seulement les poids de
son tirage (`needMultiplier`), sans jamais forcer un état. Énergie basse :
sommeil plus probable. Propreté basse : lavage. Affection basse : il suit
davantage le curseur. Stimulation basse : activités énergiques (course,
vol, nage rapide, escalade). Une jauge comblée (au-dessus de 90) réduit au
contraire l'activité correspondante. Sous 30 de santé, les activités
énergiques sont réduites à 30 %.

## Besoins naturels

L'animal doit se soulager. Sous 60 sa jauge de soulagement lui donne de plus en
plus envie d'y aller (sous 30 : bulle « urgent »).

- **Où** : une **litière** propre posée sur sa surface (« Bureau… » > « Poser une
  litière » ; un animal qui vole rejoint sa surface), sinon le **coin** le plus
  proche (bord de la fenêtre ou de l'écran). Il s'accroupit 3,5 s, puis le
  soulagement remonte. Le poisson n'a pas ce besoin.
- **Litière** : sale après 3 usages (et plus utilisée) ; un clic la nettoie.
- **Trace** : hors litière l'animal laisse une trace ; un **clic** la nettoie (+1
  pièce), « Nettoyer les traces » dans « Bureau… » les retire toutes. Une trace
  proche (200 px, même surface) fait baisser la propreté (6 par heure, trois
  traces au plus) ; **après 2 h** elle vieillit et fait baisser la santé (5 par
  heure et par trace, trois au plus, atténué par l'autonomie : un animal
  autonome nettoie derrière lui). Tout est figé en mode vacances.
- **Accident** : si le soulagement tombe sous 8, il se soulage sur place (trace,
  propreté -15).

## Nourriture, gamelle et lit

Les objets sont des entités du bureau (`core/items.js`), qui tombent sur le
sol ou un rebord de fenêtre comme les animaux et retombent si la fenêtre
bouge ou disparaît.

- **Donner à manger** : clic milieu sur l'animal (menu contextuel) ou menu de
  l'icône de barre. L'aliment tombe à côté de l'animal. Aliments : viande,
  poisson, croquettes, graines, plancton (flottant, pour le poisson). Une
  nourriture non mangée expire (15 min, plancton 10 min).
- **Régime** : chaque espèce ne mange que les aliments de son `needs.diet`,
  avec un gain de satiété par aliment ; l'aliment au gain maximal fait aussi
  plaisir (affection +5). Un animal rassasié ignore la nourriture, un affamé
  la préfère à tout. Il la rejoint en marchant, en volant vers un autre
  rebord (oiseau) ou en nageant (poisson et plancton), puis mange quelques
  secondes (état `eat`).
- **Gamelle** : « Remplir la gamelle » la crée au besoin et y met 5 portions
  d'un aliment ; elle reste sur le bureau et se vide portion par portion.
- **Lit** : « Poser un lit ». Quand un animal veut dormir et qu'un lit est
  sur sa surface, il s'y rend, et récupère 1,5 fois plus vite dessus.
- **Déplacer / retirer** : les objets se glissent à la souris (ils retombent
  au relâchement), clic droit pour en retirer un, « Retirer les objets »
  pour tout enlever. Gamelles, lits et nourriture fraîche sont conservés au
  redémarrage (clé `saved-items`).

## Jouer, caresser, brosser

- **Jouets** : balle et peluche (« Jouer » dans le menu contextuel de
  l'animal, « Poser un jouet » dans le menu de l'icône). La balle roule avec
  du frottement, rebondit, rebondit contre les bords de l'écran et peut
  tomber du rebord d'une fenêtre ; la peluche reste posée. Un animal qui
  s'ennuie va jouer (à la course) : il frappe la balle puis la poursuit, ou
  se colle à la peluche. Une session dure 6 à 12 s et, menée à son terme,
  donne stimulation +25 et affection +6. Un animal comblé ne joue presque pas.
- **Lancer à la souris** : les objets se glissent, et partent avec l'élan du
  pointeur au relâchement (jusqu'à 900 px/s), pour lancer la balle.
- **Pointeur laser** : interrupteur dans les deux menus. Un point rouge suit
  le curseur et les animaux se précipitent dessus (le poisson le poursuit
  aussi, en 2D). Le mode est en mémoire : éteint à chaque activation.
- **Caresses prolongées** : à partir de la 3e caresse en moins de 3 s d'écart
  (clics), l'animal ronronne (`purring`, affection +12 au lieu de +8).
- **Brosser** : dans le menu contextuel ; l'animal reste immobile 4 s
  (`brushed`), propreté +25, affection +6. Réveille un animal endormi.
- **Ranger les jouets** : retire tous les jouets d'un coup, sans toucher à la
  gamelle, au lit ni à la nourriture (« Retirer les objets » enlève tout).
  Balles et peluches sont conservées au redémarrage.

## Difficulté et mode vacances

Réglages des préférences (et mode vacances aussi dans le menu de l'icône) :
difficulté détendue (x0,4), normale (x1), stricte (x2). Le mode vacances
fige toutes les jauges, y compris pendant le rattrapage hors ligne. Les
changements agissent tout de suite, sans recharger l'extension.

## Bulles de pensée

Quand une jauge passe sous 30 (ou la santé sous 40, prioritaire), une bulle
apparaît au-dessus de l'animal : faim, sommeil, saleté, ennui, coeur
(affection), croix verte (santé). Les icônes viennent de
`extension/assets/bubbles/`, générées par `scripts/gen_ui_sprites.py`. Les
bulles ne bloquent jamais les clics.

## Sauvegarde et rattrapage

Les jauges sont sauvegardées avec la position (voir l'étape 9), toutes les
30 secondes et à la désactivation. Au redémarrage, le temps passé animal
éteint est rattrapé à demi-vitesse, plafonné à 8 heures. Les anciennes
sauvegardes (version 1, position seule) restent lisibles.

## Réglages par espèce

Section optionnelle `needs` de `pack.json` :

```json
"needs": { "decayPerHour": { "energy": 3, "cleanliness": 2 } }
```

La clé `diet` liste les aliments acceptés (`meat`, `fish`, `kibble`,
`seeds`, `plankton`) avec leur gain de satiété (> 0). Seules les cinq jauges de
besoin acceptent un débit (nombre >= 0, 0 pour
désactiver une jauge : le poisson ne dort ni ne se lave). Les autres clés
sont ignorées avec un avertissement dans le journal de GNOME Shell.
`tests/packs.test.js` valide cette section pour chaque pack.
