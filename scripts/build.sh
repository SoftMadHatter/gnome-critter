#!/usr/bin/env bash
# Assemble l'extension installable à partir des sources séparées
# (extension/ + core/ + packs/) et, en option, l'installe ou la relie en
# développement dans ~/.local/share/gnome-shell/extensions/.
#
# Nécessaire car GNOME Shell charge une extension comme un dossier autonome
# (renommé à son UUID) : le cœur partagé (core/) et les packs doivent donc
# être copiés À L'INTÉRIEUR de ce dossier, pas référencés par un `../`.
#
# Usage :
#   scripts/build.sh                 # construit dist/<uuid>/ et dist/<uuid>.shell-extension.zip
#   scripts/build.sh --install       # + copie dans ~/.local/share/gnome-shell/extensions/
#   scripts/build.sh --link          # + symlink dev (rechargement à chaud plus simple)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_SRC="$ROOT_DIR/extension"
CORE_SRC="$ROOT_DIR/core"
PACKS_SRC="$ROOT_DIR/packs"
DIST_DIR="$ROOT_DIR/dist"

UUID=$(python3 - "$EXT_SRC/metadata.json" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))["uuid"])
PY
)

BUILD_DIR="$DIST_DIR/$UUID"

echo "==> UUID de l'extension : $UUID"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

cp -r "$EXT_SRC"/. "$BUILD_DIR"/
mkdir -p "$BUILD_DIR/core" "$BUILD_DIR/packs"
cp -r "$CORE_SRC"/. "$BUILD_DIR/core"/
cp -r "$PACKS_SRC"/. "$BUILD_DIR/packs"/
cp "$ROOT_DIR/LICENSE" "$BUILD_DIR"/ # le texte de la licence accompagne l'archive distribuée

if command -v glib-compile-schemas >/dev/null 2>&1; then
  glib-compile-schemas "$BUILD_DIR/schemas"
  echo "==> Schéma GSettings compilé."
else
  echo "!! glib-compile-schemas introuvable : les préférences ne fonctionneront pas tant que" >&2
  echo "   le schéma n'est pas compilé (paquet 'libglib2.0-bin' / 'glib2-devel')." >&2
fi

# Traductions : chaque po/<langue>.po devient locale/<langue>/LC_MESSAGES/gnome-critter.mo.
if command -v msgfmt >/dev/null 2>&1; then
  for po in "$ROOT_DIR"/po/*.po; do
    [ -e "$po" ] || continue
    lang="$(basename "$po" .po)"
    mkdir -p "$BUILD_DIR/locale/$lang/LC_MESSAGES"
    msgfmt -o "$BUILD_DIR/locale/$lang/LC_MESSAGES/gnome-critter.mo" "$po"
  done
  echo "==> Traductions compilées."
else
  echo "!! msgfmt introuvable : l'extension restera en français (paquet 'gettext')." >&2
fi

ZIP_PATH="$DIST_DIR/$UUID.shell-extension.zip"
rm -f "$ZIP_PATH"
(cd "$BUILD_DIR" && zip -qr "$ZIP_PATH" .)
echo "==> Archive prête : $ZIP_PATH"

if [[ "${1:-}" == "--install" || "${1:-}" == "--link" ]]; then
  TARGET="$HOME/.local/share/gnome-shell/extensions/$UUID"
  rm -rf "$TARGET"
  if [[ "${1:-}" == "--link" ]]; then
    ln -s "$BUILD_DIR" "$TARGET"
    echo "==> Lien symbolique créé : $TARGET -> $BUILD_DIR"
  else
    cp -r "$BUILD_DIR" "$TARGET"
    echo "==> Installée dans : $TARGET"
  fi
  echo "==> Redémarre GNOME Shell (Alt+F2, r, Entrée, sous X11 ; déconnexion/reconnexion sous Wayland)"
  echo "    puis active-la : gnome-extensions enable $UUID"
fi
