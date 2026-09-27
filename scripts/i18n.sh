#!/usr/bin/env bash
# Traductions (gettext, domaine « gnome-critter », textes source en français) :
# extraction des textes vers po/gnome-critter.pot et mise à jour des catalogues
# po/<langue>.po listés dans po/LINGUAS. Les textes des packs ne passent pas
# par ici : ils sont traduits dans la section `translations` de chaque
# pack.json. Voir docs/i18n.md.
#
# Usage :
#   scripts/i18n.sh update   # extrait les textes, met à jour les .po (nouveaux textes à traduire : msgstr vide)
#   scripts/i18n.sh check    # vérifie les .po (syntaxe, formats) et affiche le taux de traduction

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PO_DIR="$ROOT_DIR/po"
DOMAIN=gnome-critter

for tool in xgettext msgcat msgmerge msginit msgfilter msgfmt; do
  command -v "$tool" >/dev/null 2>&1 || { echo "$tool introuvable (paquet 'gettext')." >&2; exit 1; }
done

case "${1:-}" in
  update)
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    cd "$ROOT_DIR"
    xgettext --from-code=UTF-8 --language=JavaScript --keyword=_ --keyword=N_ --keyword=ngettext:1,2 \
      --add-comments=Traduction --package-name="$DOMAIN" --sort-by-file -o "$tmp/code.pot" \
      extension/*.js extension/lib/*.js core/*.js
    xgettext --from-code=UTF-8 -o "$tmp/schema.pot" extension/schemas/*.gschema.xml
    node scripts/i18n-data.mjs > "$tmp/data.pot"
    msgcat --use-first -o "$PO_DIR/$DOMAIN.pot" "$tmp/code.pot" "$tmp/schema.pot" "$tmp/data.pot"
    echo "==> $PO_DIR/$DOMAIN.pot : $(grep -c '^msgid ' "$PO_DIR/$DOMAIN.pot") entrées."
    while read -r lang; do
      [ -z "$lang" ] && continue
      if [ -f "$PO_DIR/$lang.po" ]; then
        msgmerge --quiet --update --backup=none --no-fuzzy-matching "$PO_DIR/$lang.po" "$PO_DIR/$DOMAIN.pot"
      else
        msginit --no-translator --locale="$lang" -i "$PO_DIR/$DOMAIN.pot" -o "$PO_DIR/$lang.po"
        # msginit recopie le texte source pour une locale anglaise : on repart de traductions vides.
        msgfilter --keep-header -i "$PO_DIR/$lang.po" -o "$PO_DIR/$lang.po" true
      fi
      echo "==> $lang.po mis à jour."
    done < "$PO_DIR/LINGUAS"
    ;;
  check)
    while read -r lang; do
      [ -z "$lang" ] && continue
      printf '%s : ' "$lang"
      msgfmt --check --statistics -o /dev/null "$PO_DIR/$lang.po"
    done < "$PO_DIR/LINGUAS"
    ;;
  *)
    echo "Usage : scripts/i18n.sh update | check" >&2
    exit 2
    ;;
esac
