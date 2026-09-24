# Rythme du monde

Les animaux réagissent à l'heure, à ta présence, à ton rythme de travail et à
quelques événements du bureau. La logique est dans `core/rhythm.js` et
`core/critter.js` (pures et testées) ; les capteurs sont dans
`extension/lib/activitySensor.js` et `extension/lib/manager.js`.

**Confidentialité** : aucun contenu n'est jamais lu ni conservé. Une
notification n'est qu'un « il y en a une » (ni titre, ni texte, ni
application) ; la frappe n'est qu'un « une touche a été pressée » (jamais
laquelle) ; l'inactivité n'est qu'une durée.

## Jour et nuit

De 23 h à 7 h (heure locale), les animaux dorment davantage (poids du sommeil
x3, activités énergiques x0,4) et sont légèrement assombris. Réglage : cycle
jour/nuit.

## Absence du joueur

Après 10 minutes d'inactivité (réglable), ils s'endorment plus volontiers
(sommeil x4, énergiques x0,3). À ton retour, ils te saluent et les dormeurs
se réveillent. Réglages : dormir en votre absence, minutes d'inactivité.

## Rappel de pause

Désactivé par défaut. Après 60 minutes d'activité continue (réglable), le
premier animal éveillé vient vers ton curseur avec une bulle de tasse pendant
25 secondes. Un clic sur lui acquitte le rappel (le compteur repart de zéro).
Une vraie pause (5 minutes d'inactivité) remet aussi le compteur à zéro, et un
délai de grâce de 30 minutes suit chaque rappel. Un œuf ou un animal qui
hiberne n'est jamais choisi.

## Notifications et frappe

- **Notifications** (actif par défaut) : l'animal remarque l'arrivée d'une
  notification (réaction de curiosité), sans réveiller un dormeur.
- **Frappe** (désactivé par défaut) : réaction de curiosité limitée à une
  fois toutes les 20 secondes par animal.

Un œuf ignore tout cela, comme il ignore toute interaction.

## Animations de pack

`remind` (repli sur `follow` puis `walk`). Les réactions utilisées sont
`noticed` (notification, frappe) et `greeted` (retour du joueur), déjà
présentes dans les packs.
