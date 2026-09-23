# Critter — animal de bureau pour GNOME

Nom d'affichage : **Critter** · UUID : `desktop-critter@beedi.xyz` (déjà choisi
et renseigné dans `extension/metadata.json`, pas besoin d'y retoucher).

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

Prérequis : `zip`, `glib-compile-schemas` (paquet `libglib2.0-bin` sur
Debian/Ubuntu, `glib2-devel` sur Fedora), Python 3 + Pillow si tu veux
régénérer les sprites placeholder.

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
gnome-extensions enable desktop-critter@beedi.xyz

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
