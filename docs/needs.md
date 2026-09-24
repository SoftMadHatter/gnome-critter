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
| `cleanliness` | 4 | fin d'un lavage : +30 |
| `stimulation` (contre l'ennui) | 10 | activité physique : +25 par heure ; jeux, réactions |
| `affection` | 4 | caresse +8, chatouille +3, salutation +4 |
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
