# GNOME Critter

Nom d'affichage : **Critter** · nom long : **GNOME Critter** · UUID :
`gnome-critter@beedi.xyz` · dépôt : <https://github.com/SoftMadHatter/gnome-critter>.

Squelette de départ pour une extension GNOME Shell (option A retenue : tout
en GJS/JavaScript, pas de démon séparé) faisant marcher un petit animal
pixel-art sur le bureau : sol, rebords de fenêtres, murs, plafond selon ce
que l'espèce sait faire.

Le code est séparé en deux pour pouvoir extraire le cœur plus tard (vers un
démon Java relié par D-Bus, par exemple) sans tout réécrire :

```
core/        logique pure JS, ZÉRO dépendance GJS/Clutter/Meta/St.
             État, physique, choix de comportement. Testé avec node --test.
extension/   couche GNOME Shell : lit l'état du bureau (fenêtres, moniteurs,
             souris), dessine les sprites, gère le clic/glisser.
packs/       données d'une espèce (voir docs/pack-format.md) : sprites +
             JSON, sans code.
scripts/     génération des sprites placeholder, build/packaging.
tests/       tests du cœur (node --test).
LICENSE      GNU GPL version 3 (voir « Licence » plus bas).
```

## Statut

- `core/` : implémenté et testé (`npm test` → 11/11 tests verts). États
  gérés : idle, walk, fall, drag, climb, ceiling, swim, fly, sleep.
- `extension/` : écrit et syntaxiquement vérifié (`node --check`), mais
  **jamais exécuté dans un vrai GNOME Shell** — cet environnement de
  développement n'a ni `gjs` ni `gnome-shell` disponibles. À tester en
  premier sur ta machine, c'est l'étape qui reste avant de considérer que
  ça marche vraiment.
- `packs/critter-demo/` : sprites placeholder générés par script (pas du
  pixel-art définitif), juste de quoi voir l'animal bouger.

## Essayer sur ta machine (GNOME 48+, Wayland)

Prérequis :

- `zip` ;
- `glib-compile-schemas` (paquet `libglib2.0-bin` sur Debian/Ubuntu,
  `glib2-devel` sur Fedora) ;
- `msgfmt` (paquet `gettext`) pour compiler les traductions ; sans lui,
  l'extension reste en français ;
- Python 3 et Pillow, seulement pour régénérer les sprites placeholder.

Le jeu est en français et en anglais : il suit la langue de la session GNOME.
Traductions : `docs/i18n.md`.

```bash
# 1. Build + installation en lien symbolique (pratique pour itérer : un
#    nouveau `build.sh --link` suffit après chaque modif, pas besoin de
#    réinstaller à la main)
./scripts/build.sh --link

# 2. Recharge GNOME Shell
#    - X11 : Alt+F2, tape "r", Entrée
#    - Wayland : déconnexion / reconnexion (pas de rechargement à chaud) --
#      OU, pour itérer sans se déconnecter, `scripts/dev.sh` (voir
#      docs/dev-workflow.md)

# 3. Active l'extension
gnome-extensions enable gnome-critter@beedi.xyz

# 4. Logs en cas de souci
journalctl -f -o cat /usr/bin/gnome-shell
```

Si rien n'apparaît : vérifier d'abord les logs (`journalctl`) pour une
erreur de chargement de `pack.json` ou de spritesheet — c'est le point le
plus probable de plantage au premier essai.

### Itérer vite sous Wayland

`Alt+F2, r` ne marche que sous X11. Sous Wayland, `scripts/dev.sh` lance
une session GNOME Shell imbriquée jetable (build + link + activation
automatique de l'extension dedans) qu'on peut fermer/relancer en quelques
secondes au lieu de se déconnecter :

```bash
scripts/dev.sh
```

Détails et limites de cette session imbriquée : `docs/dev-workflow.md`.

## Lancer les tests du cœur

```bash
npm test
```

## Régénérer les sprites placeholder

```bash
python3 scripts/gen_placeholder_sprites.py
```

## Contribuer

Tickets et pull requests sur <https://github.com/SoftMadHatter/gnome-critter>.

Les identifiants internes (schéma GSettings, domaine gettext, préfixe des
journaux) gardent le nom court `gnome-critter`/`Critter` du dépôt actuel ;
les journaux de l'extension se filtrent avec :

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep Critter
```

## Licence

Copyright © 2026 mad

Ce programme est un logiciel libre : vous pouvez le redistribuer et/ou le
modifier selon les termes de la licence publique générale GNU, telle que
publiée par la Free Software Foundation, soit la version 3 de la licence, soit
(à votre choix) toute version ultérieure (`GPL-3.0-or-later`). Le texte complet
est dans le fichier [`LICENSE`](LICENSE).

Ce programme est distribué dans l'espoir qu'il sera utile, mais **sans aucune
garantie**, sans même la garantie implicite de commercialisation ou
d'adéquation à un usage particulier.

Les sprites et les sons des packs, des objets, des accessoires et des bulles
sont générés par les scripts de ce dépôt (`scripts/gen_*.py`) : ils sont
distribués sous la même licence.

## Étapes suivantes suggérées

1. Valider que ça tourne réellement sous ton GNOME 50 (le point le plus
   incertain de ce squelette, faute d'environnement de test ici).
2. Remplacer les sprites placeholder par un vrai pixel-art (voir
   `docs/pack-format.md` pour le format attendu).
3. Étoffer le comportement (`core/critter.js`) : réactions aux notifications,
   à l'inactivité, faim/humeur, etc. — tout ça reste testable avec
   `node --test` sans jamais toucher à `extension/`.
4. Si le besoin de nager/voler devient central, définir comment déclarer des
   zones d'eau (actuellement : `environment.waterZones`, vide par défaut,
   à brancher sur un réglage utilisateur dans `prefs.js`).
5. Si un jour le besoin d'un vrai moteur de comportement (utility AI,
   persistance de l'humeur, synchro) se fait sentir, `core/` est du JS pur
   : portable vers un autre runtime sans toucher à `extension/`.
