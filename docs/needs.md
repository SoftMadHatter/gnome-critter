# Besoins et humeur

Chaque animal a des jauges de 0 à 100, où **100 = satisfait**. Elles baissent
avec le temps réel, orientent son comportement, sont sauvegardées et
visibles dans l'icône de la barre supérieure et dans les bulles de pensée.
Le modèle est dans `core/needs.js` (pur, testé), le `Critter` en possède une
instance.

## Jauges

| Jauge | Baisse (par heure, difficulté normale) | Remontée |
|---|---|---|
| `satiety` (satiété) | 5 | « Nourrir » (menu de l'icône), +40 |
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

Seules les cinq jauges de besoin acceptent un débit (nombre >= 0, 0 pour
désactiver une jauge : le poisson ne dort ni ne se lave). Les autres clés
sont ignorées avec un avertissement dans le journal de GNOME Shell.
`tests/packs.test.js` valide cette section pour chaque pack.
