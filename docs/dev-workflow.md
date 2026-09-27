# Boucle de développement (Wayland)

## Le problème

Sous X11, on peut recharger GNOME Shell à chaud avec `Alt+F2`, `r`, Entrée.
**Ce raccourci n'existe pas sous Wayland** : le compositeur Wayland ne peut
pas se remplacer lui-même en place. La seule façon « officielle » de
repartir d'un Shell propre est de se déconnecter/reconnecter — beaucoup
trop lourd pour itérer sur une extension.

Deux choses à distinguer :

- **Activer/désactiver** une extension (`gnome-extensions enable|disable`)
  ne nécessite jamais de redémarrer le Shell, sur aucune des deux sessions
  d'affichage. Ça suffit pour tester un changement dans `packs/`
  (spritesheets, `pack.json`) ou `schemas/`.
- **Modifier du code JS** (`extension.js`, `lib/*.js`, `prefs.js`) ne
  suffit pas avec un simple disable/enable : depuis GNOME 45, les
  extensions sont chargées comme des modules ES natifs, mis en cache par
  GJS une fois importés. Rien ne force GJS à relire le fichier depuis le
  disque — il faut un **nouveau processus `gnome-shell`** pour que le
  nouveau code soit pris en compte.

## La solution : une session GNOME Shell imbriquée

`gnome-shell --devkit --wayland` lance un Shell complet dans une fenêtre
plutôt que de prendre le contrôle de l'affichage, sur son propre bus D-Bus
(via `dbus-run-session`). C'est un Shell jetable :

> Historiquement ce mode s'activait avec un flag explicite `--nested`,
> disparu à partir de GNOME Shell 49/50 (voir `gnome-shell --help`).
> `--wayland` seul (sans `--devkit`) a été **testé et échoue** sur GNOME 50
> avec `Failed to take control of the session: GDBus.Error:System.Error.EBUSY:
> Device or resource busy` : le process enfant, lancé depuis un terminal de
> la session réelle, appartient à la même session logind que le vrai Shell
> (`loginctl session-status` le confirme) et tente d'en prendre le contrôle
> alors que le vrai Shell le détient déjà — un seul contrôleur possible par
> session logind.
>
> `--devkit` (GNOME 48+, « development kit », pensé justement pour tester
> des extensions sans quitter sa session) évite ce conflit : les logs
> montrent `Will monitor session 8` au lieu d'une tentative de prise de
> contrôle. Un avertissement `Failed to launch devkit: ... mutter-devkit ...
> Aucun fichier ou dossier de ce nom` peut apparaître si le paquet
> `mutter-devkit` optionnel n'est pas installé — sans conséquence, le Shell
> imbriqué démarre quand même normalement.

- il tourne en tant que processus enfant, isolé de la vraie session (bus
  D-Bus dédié) — un crash ou un `disable`/`enable` dedans n'affecte jamais
  le vrai Shell ni les autres extensions actives sur le bureau réel ;
- pour repartir d'un état propre après une modif de code JS, il suffit de
  fermer la fenêtre (ou `Ctrl+C` dans le terminal qui l'a lancée) et de
  relancer la commande — quelques secondes, pas de déconnexion ;
- les réglages GSettings (`enabled-extensions`, réglages de l'extension
  elle-même comme `pack-id`/`critter-count`) sont stockés dans dconf, qui
  est partagé entre les deux sessions : pas besoin de tout reconfigurer à
  chaque lancement.

## Usage

```bash
scripts/dev.sh
```

Ce script :

1. reconstruit l'extension et met à jour le symlink de dev
   (`scripts/build.sh --link`, comme `README.md` le documente) ;
2. lance la session imbriquée sur un bus D-Bus dédié ;
3. y active automatiquement l'extension (`gnome-extensions enable`, exécuté
   sur ce même bus) dès que le Shell imbriqué est prêt.

Pour itérer :

- modif de `packs/`, `schemas/`, ou tout ce qui ne touche pas à un fichier
  `.js` → `gnome-extensions disable gnome-critter@beedi.xyz && gnome-extensions
  enable gnome-critter@beedi.xyz` **dans le terminal de la session
  imbriquée** (ou sur le bureau réel si tu testes là) suffit, pas besoin de
  relancer `dev.sh` ;
- modif de `extension.js` / `lib/*.js` / `prefs.js` → ferme la fenêtre
  imbriquée (`Ctrl+C`) et relance `scripts/dev.sh` (ou `scripts/dev.sh
  --no-build` si tu as déjà rebuild par ailleurs).

`--no-build` saute l'étape 1 (utile si le lien symlink pointe déjà vers un
`dist/` à jour).

`--lang en` lance la session imbriquée dans une autre langue (`LANGUAGE`),
sans toucher à la vraie session : menus, notifications, fenêtre de
progression, préférences et prénoms en anglais. Traductions et outillage :
`docs/i18n.md`.

## Logs

Dans un terminal séparé, pendant que la session imbriquée tourne :

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

Les erreurs JS de l'extension (exceptions dans `enable()`, `loadPack()`,
etc.) y apparaissent avec leur stack trace.

## Limites de la session imbriquée

- Pas d'accélération GPU complète dans certains environnements (VM,
  pilotes proprio) → peut être plus lente/saccadée que la vraie session,
  sans rapport avec un bug de l'extension.
- Certains portails (captures d'écran, sélection de fichiers) peuvent se
  comporter différemment ou ne pas être disponibles.
- Si `dbus-run-session` n'est pas installé : paquet `dbus` (Fedora) ou
  `dbus-user-session` (Debian/Ubuntu).

Pour valider un comportement dépendant fortement de l'environnement réel
(plusieurs moniteurs physiques, vrai multi-fenêtrage), retester
ponctuellement dans la vraie session (déconnexion/reconnexion classique).

## Sauvegarde de l'état

Les positions des critters sont sauvegardées dans la clé GSettings cachée
`saved-state` (toutes les 30 s et à la désactivation). Pour l'inspecter ou
repartir de zéro :

```bash
SCHEMAS=dist/gnome-critter@beedi.xyz/schemas
gsettings --schemadir "$SCHEMAS" get org.gnome.shell.extensions.gnome-critter saved-state
gsettings --schemadir "$SCHEMAS" reset org.gnome.shell.extensions.gnome-critter saved-state
```

## Réglages à chaud

Tous les réglages de la fenêtre « Réglages… » (menu de l'icône) s'appliquent sans
recharger l'extension. Pour les tester : `gsettings --schemadir
dist/gnome-critter@beedi.xyz/schemas set org.gnome.shell.extensions.gnome-critter
critter-count 3` fait apparaître deux animaux de plus tout de suite.

## Outil de revue (succès, titres, récompenses, créatures, objets)

Une page locale, en **lecture seule**, pour relire le contenu du jeu tel que le
moteur le calcule, sans lancer GNOME Shell :

```bash
scripts/review.sh --open        # http://127.0.0.1:8765/ ; --port N pour un autre port
```

Le mini serveur (`tools/review/server.mjs`, Node, sans dépendance) n'écoute que
sur 127.0.0.1, ne répond qu'aux lectures (GET) et ne sert que `core/`,
`packs/`, `po/`, `extension/lib/`, `extension/assets/` et `tools/review/`. La page
charge directement les modules du cœur (`buildAchievements`,
`achievementView`, le Système, les boîtes, `shiftPixels`...) : ce qu'elle
affiche est exactement ce que calcule le jeu. Quand un fichier change, elle se
recharge seule en gardant l'onglet et les filtres (dans l'adresse) : on
corrige dans l'éditeur, on vérifie dans la page. `tools/` n'est pas copié par
`scripts/build.sh` : rien n'est livré avec l'extension.

Le choix de langue de l'en-tête (français, anglais ; `&lang=en` dans
l'adresse) affiche les textes du jeu traduits par `po/<langue>.po` et la
section `translations` des packs. L'interface de l'outil reste en français
(voir `docs/i18n.md`).

Onglets :

- **Succès** : tous les succès d'une espèce, filtrés par caractère, rubrique,
  type (vrais, bêtises, joueur) ou texte ; condition, récompense, titre,
  exigences, commentaire du Système, origine (bibliothèque, pack, remplacé par
  le pack). « Copier » copie le gabarit source en JSON pour en ajouter un.
- **Vue en jeu** : on règle compteurs et marques (préréglages : animal neuf,
  un mois de vie, tout débloqué ; aussi dans l'adresse avec `&preset=all`) ;
  la fenêtre de progression s'affiche telle que le joueur la voit, avec les
  annonces du Système. Le scénario est gardé par pack dans le navigateur.
- **Titres** : chaque titre, le succès qui le donne, sa condition, les alertes.
- **Récompenses** : lots et probabilités des boîtes, simulation de 1 000
  ouvertures, budget de pièces par rubrique, trophées et farces.
- **Le Système** : annonces d'un succès (plusieurs tirages), rafales, trophée,
  phrases d'ouverture et de conclusion, commentaires triés par longueur.
- **Créatures** : fiche du pack, lecteur d'animation (stade, vitesse, taille,
  lissage, retournement, couleurs, accessoire sur la tête), planche de toutes
  les animations d'un stade.
- **Objets** : tous les sprites du catalogue, à la taille d'affichage et au
  double.
- **Contrôles** : erreurs de structure (les règles de `tests/packs.test.js`)
  et textes à relire (typographie, doublons, longueurs, titres genrés,
  descriptions de paliers identiques) ; leur nombre s'affiche sur l'onglet.
  Hors du français s'ajoutent :
  - les contrôles du catalogue : traductions manquantes, espaces réservés,
    textes identiques au français ;
  - ceux de la section `translations` de chaque pack.

Limites : aucune écriture (les corrections se font dans l'éditeur) ; ce n'est
pas le rendu réel de GNOME Shell (menus, notifications, HiDPI, filtres de
Clutter) : les sprites sont rejoués dans un canevas du navigateur. Pour une
capture sans interface (`chromium --headless`), ajouter `?noreload` à
l'adresse : sans cela, le flux de rechargement garde la page ouverte.
