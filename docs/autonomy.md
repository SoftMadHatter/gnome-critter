# Autonomie

Un animal autonome couvre lui-même une partie de ses besoins : il chasse des
proies, grignote des plantes et se sert dans une gamelle, et ses besoins
baissent plus lentement. Le modèle est dans `core/autonomy.js`, `core/prey.js`
et `core/items.js` (purs et testés).

## Niveau d'autonomie (0 à 1)

Réglage « Autonomie » (préférences, page Besoins et vie), appliqué à chaud :

- **Auto** (défaut) : suit la croissance et l'apprentissage. Bébé 0, jeune 0,4,
  adulte et senior 0,7, plus 0,1 par tour appris (jusqu'à +0,3). Un œuf ou un
  animal qui hiberne : 0.
- **Désactivée** (0), **Partielle** (0,5), **Totale** (1) : forcent le niveau.

Effets : les besoins baissent plus lentement (à autonomie 1, à 20 % de leur
vitesse, jamais nulle) ; la négligence qui mène à l'hibernation ne s'accumule
plus (« aucun enjeu ») ; le tirage d'activités gagne deux candidats,
**chasser** et **grignoter**, pondérés par le niveau et par la faim.

## Proies

Petites créatures sur le bureau, propres à chaque espèce (section
`needs.prey` du pack : `{ "mouse": 40 }` donne la proie et le gain de satiété) :
souris (chat), scarabée (oiseau), puceron (insecte), krill flottant (poisson).

- Elles **flânent** sur les surfaces (marche, pauses, demi-tour aux bords),
  **fuient** un animal à moins de 110 px et le curseur à moins de 80 px (plus
  vite que leur marche), et disparaissent après 10 minutes.
- **Apparition automatique** (réglage « Proies automatiques ») : toutes les 60
  à 180 s, au plus 3 à la fois, tant qu'un animal a plus de 0,3 d'autonomie.
  « Lâcher une proie » dans « Bureau… » en dépose une près du curseur. Elles se
  déplacent à la souris comme les autres objets.
- **Chasse** : l'animal autonome affamé poursuit la proie (12 s au plus) ; à
  14 px il l'attrape, elle se fige, il la mange et gagne le gain de la proie.
  Une proie qui s'échappe ou disparaît : il abandonne, sans conséquence.
  Compteur `hunts` (succès « Chasseur de souris », etc.).

## Plantes décoratives

Herbe (chat), baies (oiseau), feuille (insecte), algue flottante (poisson) : trois
portions, une **repousse toutes les 5 minutes**, ne disparaissent jamais. Deux
sont maintenues automatiquement (réglage « Plantes décoratives »), on peut en
poser d'autres (« Poser une plante »). Petit gain de satiété défini dans
`needs.diet`. Compteur `grazes`. Seuls les animaux autonomes les grignotent.

## Gamelle moisie

Une gamelle dont la nourriture n'est pas renouvelée moisit après **24 h** (sprite
verdâtre) : la manger fait perdre 20 points de santé (et l'animal a un aspect
malade) ; **6 h plus tard**, le contenu disparaît (la gamelle reste). La remplir
remet le compteur à zéro. Un animal autonome (niveau 0,5 et plus) évite la
nourriture moisie ; un animal qui dépend de toi la mange.
