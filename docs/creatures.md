# Créatures : noms et menus

## Noms

Chaque créature a un nom. À la naissance il est tiré dans la liste de son
espèce (section `names` de `pack.json`, ou une liste générique), en évitant
ceux déjà pris ; il est sauvegardé avec l'animal. Pour le changer :
« Renommer… » dans son menu (clic milieu) ou dans son bloc du menu de
l'icône de barre. Le nom est nettoyé (espaces repliés, caractères de contrôle
retirés, 24 caractères au plus) et rendu unique parmi les animaux affichés
(« Moka », puis « Moka 2 »). Il apparaît dans les menus, les notifications de
succès et le journal, et au-dessus de l'animal après une seconde de survol continu
(pas pour un œuf).

```json
"names": ["Minou", "Moka", "Câline", "Pixel", "Nougat", "Ronron", "Tigrou", "Luna"]
```

Au moins 8 noms par pack (vérifié par `tests/packs.test.js`).

## Menu de l'icône de barre

Un menu court, en « fiche + actions rapides » :

```
[Moka] [Pixel] [Luna]        sélecteur (s'il y a plusieurs animaux)
Moka — Adulte, joueur
Satiété ████   Énergie ██████
Propreté ███   Stimulation ████
Affection ██████   Santé ███████
[Nourrir] [Jouer] [Brosser] [Câlin]
▸ Plus…      ▸ Bureau…      ▸ Pièces : 42
  Réglages…
```

- **Sélecteur** : un bouton par animal ; la fiche affiche l'animal choisi.
- **Fiche** : nom, stade, caractère ; six jauges sur deux colonnes.
- **Actions rapides** (elles ne referment pas le menu) : « Nourrir » dépose
  l'aliment gratuit que l'espèce préfère, « Jouer » une balle (l'anneau
  flottant pour le poisson), « Brosser »,
  « Câlin » (une caresse, qui réveille un animal hibernant). Grisées pour un
  œuf ; seul « Câlin » reste actif pour un hibernant.
- **Plus…** : toutes les actions de l'animal choisi (renommer, aliments au
  choix, remplir ou poser une gamelle, lit, jouets, tours, accessoires,
  réveiller), plus « Succès (n/m) » et « Statistiques », qui ouvrent la
  fenêtre de progression. « Poser un lit » et « Poser une gamelle » se
  déplient sur leurs modèles (coussin, panier, couffin ; céramique, inox,
  bois) ; « Jouer » ne propose que les jouets adaptés à l'espèce.
- **Bureau…** : mode vacances, pointeur laser, poser de la nourriture, remplir
  ou poser une gamelle, un lit ou un jouet (ils tombent en haut de l'écran, à
  l'abscisse du curseur), ranger les jouets, retirer les objets.
- **Pièces : N** : la boutique (dépliante) et « Journal » (fenêtre de progression).
- **Réglages…** : ouvre la fenêtre de réglages.

Une seule rangée repliable est ouverte à la fois.

## Fenêtre de progression

« Succès », « Statistiques » et « Journal » ouvrent une fenêtre à onglets avec
défilement : les succès de l'animal choisi (puis les tiens, rubrique « Toi »),
ses statistiques, le journal (50 dernières entrées). Le menu n'affiche que le
**nombre** de succès débloqués. Dans la fenêtre, les succès sont rangés par
rubriques dépliables ; une série montre son dernier palier obtenu et le
suivant, avec la progression ; les bêtises restent cachées jusqu'à leur
découverte (voir `docs/progression.md`).

La rangée « Titre » du menu de l'animal liste les titres qu'il a gagnés ; le
titre choisi s'affiche sous son nom au survol et dans les en-têtes des menus.

Toutes les rangées dépliables du menu sont cliquables sur toute la zone en
surbrillance, et ne referment pas le menu.

## Fenêtre de réglages

Ouverte par « Réglages… » (fenêtre de préférences GNOME, non modale). Trois
pages : Général (animal, nombre, sons, icône de barre), Besoins et vie
(difficulté, vacances, croissance, vitesse), Rythme et capteurs (jour/nuit,
absence, rappel de pause, notifications, frappe). **Tout s'applique
immédiatement**, sans recharger l'extension : changer d'animal ou de nombre
recrée le gestionnaire à chaud (après 0,4 s, pour regrouper les clics d'un
champ numérique). Les animaux existants gardent leur vie quand seul le nombre
change ; un autre animal repart d'un œuf.

## Menu contextuel (clic milieu)

Un en-tête avec le nom et l'état, les mêmes actions de l'animal, le pointeur
laser et « Ranger les jouets ». Pas de menu pour un œuf.
