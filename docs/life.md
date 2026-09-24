# Vie de l'animal : croissance, caractère, évolution

Chaque animal a une vie (`core/life.js`, pur et testé) : il naît d'un œuf,
grandit par stades, a un caractère et une couleur tirés à la naissance,
évolue selon les soins reçus, et peut partir hiberner s'il est trop négligé.
Il n'y a jamais de mort.

## Stades

| Stade | Commence à | Effets |
|---|---|---|
| Œuf | naissance | immobile, posé, se balance puis se fissure ; besoins figés |
| Bébé | 15 min | affiché à 50 %, vitesses x0,7, dort plus (x1,5), besoins x1,2 |
| Jeune | 6 h | affiché à 75 % |
| Adulte | 48 h | taille normale ; l'évolution est fixée à ce passage |
| Senior | 30 jours | vitesses x0,8, dort plus (x1,3) |

L'âge est du temps réel : le mode vacances le fige, et le temps passé animal
éteint est rattrapé à demi-vitesse (plafonné à 8 h par démarrage). Un animal
neuf naît en œuf ; avec la croissance désactivée (préférences), il naît
adulte. Les sauvegardes d'avant la croissance deviennent des adultes.
La « vitesse de croissance » des préférences (1 à 1000) sert à essayer les
stades sans attendre des jours.

## Caractère

Tiré au hasard à la naissance et conservé :

| Trait | Effet |
|---|---|
| joueur | joue x1,6, court x1,5, s'ennuie plus vite (x1,4) |
| paresseux | dort x1,8, activités énergiques x0,6, fatigue plus lente (x0,8) |
| gourmand | cherche à manger x1,5, a faim plus vite (x1,4) |
| timide | salue x0,4, suit le curseur x0,6, fuit x1,5 |

Les facteurs multiplient les poids de comportement et les débits de besoins
(cumulés avec ceux du stade). Le caractère et le stade apparaissent dans le
menu de l'icône de barre (« Adulte, joueur, choyé, 3 j »).

## Apparence

À la naissance l'animal reçoit un décalage de teinte aléatoire (par défaut
+/-35 degrés, réglable par pack) : deux chats de la même espèce n'ont pas la
même couleur. La variation est calculée au chargement (`core/colorShift.js`)
sur les pixels colorés ; noirs, blancs et gris très sombres restent
intacts. Les gris (le chat) ne bougent pas par rotation : le pack peut
demander de les coloriser (`colorizeGrays`) avec une teinte tirée à part.

Au passage à l'adulte, la moyenne des soins fixe une variante : choyé
(couleurs plus vives), normal, ou négligé (couleurs ternes).

## Hibernation

Une santé sous 15 pendant 6 h de temps actif (divisé par la difficulté, figé
en vacances) met l'animal en hibernation : immobile, besoins et âge figés.
Un clic, un brossage ou « Réveiller » (menu de l'animal) le réveille avec
des jauges remises à un niveau moyen. Le survol ne le réveille pas.

## Réglages par pack (`pack.json`)

```json
"appearance": { "hueRange": [-35, 35], "colorizeGrays": true, "graySaturation": 0.4 },
"stages": { "baby": { "scale": 0.5 }, "young": { "scale": 0.75 } }
```

`appearance.enabled: false` supprime la variation de couleur. `stages`
règle l'échelle d'affichage (0,25 à 2) d'un stade ; les vrais sprites par
stade viendront plus tard. Les autres clés sont ignorées avec un
avertissement, et `tests/packs.test.js` valide ces sections.

Animations facultatives : `egg` (sinon l'œuf générique de
`extension/assets/life/egg.png`, teinté comme l'animal) et `hibernate`
(repli sur `sleep` puis `idle`). Réactions : `hatched` (éclosion), `grew`
(nouveau stade), `awakened` (réveil).
