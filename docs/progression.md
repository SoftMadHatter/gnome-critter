# Progression : compteurs, succès, pièces, journal

## Compteurs

Chaque animal compte ce qu'il fait (`core/stats.js`) : repas (et repas de
l'aliment préféré), parties de jeu, coups de balle, brossages, ronronnements,
caresses, salutations, escalades, vols, piqués, nages, courses, siestes, plus
longue sieste, jours de vie. Ils sont sauvegardés avec l'animal et visibles dans
le menu de l'icône de barre (« Statistiques »). Un œuf ne compte rien.

## Succès propres à chaque espèce et à chaque caractère

Déclarés dans `pack.json`, section `achievements` :

```json
"achievements": [
  { "id": "nap-king", "name": "Roi de la sieste",
    "description": "Dormir 15 minutes d'affilée",
    "requires": { "trait": "lazy" },
    "condition": { "stat": "longestSleepSeconds", "atLeast": 900 },
    "coins": 15 }
]
```

- `condition.stat` : un compteur ci-dessus ou `daysAlive` ; `atLeast` : le seuil.
- `requires` (facultatif) : caractère (`playful`, `lazy`, `greedy`, `shy`)
  et/ou stade. Un succès n'est visible et gagnable que par un animal
  compatible.
- `coins` : récompense (10 par défaut).
- Débloqué une seule fois par animal, sauvegardé. Une notification GNOME
  l'annonce et l'entrée est ajoutée au journal.

Succès livrés : chat (Roi de la sieste, Chasseur de balle, Gourmet, Câlin
professionnel, Doyen), oiseau (Ailes de foudre, Grand voyageur, Picoreur, Nid
douillet), insecte (Alpiniste, Petit mais costaud, Éclair), poisson (Grand
nageur, Danseur laser, Glouton). `tests/packs.test.js` valide la section de
chaque pack.

## Pièces

Gagnées en s'occupant des animaux : repas +1, jeu +2, brossage +1,
ronronnement +1 (ces quatre-là espacés de 30 s par animal pour empêcher de les
enchaîner), éclosion +10, nouveau stade +15, succès (leur valeur). Le solde,
les achats et le journal sont sauvegardés à part (`saved-player`).

## Journal

Les 50 derniers événements (éclosion, nouveau stade, succès...), les 10
dernières lignes dans le menu de l'icône (« Journal »).

## Boutique et accessoires

Menu de l'icône de barre, « Boutique » : chapeau de fête (20 pièces), nœud
(15), lunettes (30), couronne (80), plus des accessoires **gratuits de
saison** (bonnet de Noël en décembre, chapeau de sorcière en octobre). Une
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
