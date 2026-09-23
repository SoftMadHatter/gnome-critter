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
  `.js` → `gnome-extensions disable desktop-critter@beedi.xyz && gnome-extensions
  enable desktop-critter@beedi.xyz` **dans le terminal de la session
  imbriquée** (ou sur le bureau réel si tu testes là) suffit, pas besoin de
  relancer `dev.sh` ;
- modif de `extension.js` / `lib/*.js` / `prefs.js` → ferme la fenêtre
  imbriquée (`Ctrl+C`) et relance `scripts/dev.sh` (ou `scripts/dev.sh
  --no-build` si tu as déjà rebuild par ailleurs).

`--no-build` saute l'étape 1 (utile si le lien symlink pointe déjà vers un
`dist/` à jour).

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
