#!/usr/bin/env bash
# Assembles the installable extension from the separate sources
# (extension/ + core/ + packs/) and, optionally, installs it or links it
# for development into ~/.local/share/gnome-shell/extensions/.
#
# Necessary because GNOME Shell loads an extension as a self-contained
# folder (renamed to its UUID): the shared core (core/) and the packs must
# therefore be copied INSIDE that folder, not referenced via `../`.
#
# Usage:
#   scripts/build.sh                 # builds dist/<uuid>/ and dist/<uuid>.shell-extension.zip
#   scripts/build.sh --install       # + copies into ~/.local/share/gnome-shell/extensions/
#   scripts/build.sh --link          # + dev symlink (simpler live reloading)

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

echo "==> Extension UUID: $UUID"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

cp -r "$EXT_SRC"/. "$BUILD_DIR"/
mkdir -p "$BUILD_DIR/core" "$BUILD_DIR/packs"
cp -r "$CORE_SRC"/. "$BUILD_DIR/core"/
cp -r "$PACKS_SRC"/. "$BUILD_DIR/packs"/
cp "$ROOT_DIR/LICENSE" "$BUILD_DIR"/ # the license text ships with the distributed archive

if command -v glib-compile-schemas >/dev/null 2>&1; then
  glib-compile-schemas "$BUILD_DIR/schemas"
  echo "==> GSettings schema compiled."
else
  echo "!! glib-compile-schemas not found: preferences won't work until" >&2
  echo "   the schema is compiled (the 'libglib2.0-bin' / 'glib2-devel' package)." >&2
fi

# Translations: each po/<language>.po becomes locale/<language>/LC_MESSAGES/gnome-critter.mo.
if command -v msgfmt >/dev/null 2>&1; then
  for po in "$ROOT_DIR"/po/*.po; do
    [ -e "$po" ] || continue
    lang="$(basename "$po" .po)"
    mkdir -p "$BUILD_DIR/locale/$lang/LC_MESSAGES"
    msgfmt -o "$BUILD_DIR/locale/$lang/LC_MESSAGES/gnome-critter.mo" "$po"
  done
  echo "==> Translations compiled."
else
  echo "!! msgfmt not found: the extension will stay in French (the 'gettext' package)." >&2
fi

ZIP_PATH="$DIST_DIR/$UUID.shell-extension.zip"
rm -f "$ZIP_PATH"
(cd "$BUILD_DIR" && zip -qr "$ZIP_PATH" .)
echo "==> Archive ready: $ZIP_PATH"

if [[ "${1:-}" == "--install" || "${1:-}" == "--link" ]]; then
  TARGET="$HOME/.local/share/gnome-shell/extensions/$UUID"
  rm -rf "$TARGET"
  if [[ "${1:-}" == "--link" ]]; then
    ln -s "$BUILD_DIR" "$TARGET"
    echo "==> Symlink created: $TARGET -> $BUILD_DIR"
  else
    cp -r "$BUILD_DIR" "$TARGET"
    echo "==> Installed into: $TARGET"
  fi
  echo "==> Restart GNOME Shell (Alt+F2, r, Enter, on X11; log out/log back in on Wayland)"
  echo "    then enable it: gnome-extensions enable $UUID"
fi
