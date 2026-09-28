#!/usr/bin/env bash
# Translations (gettext, "gnome-critter" domain, source text in French):
# extracts text into po/gnome-critter.pot and updates the po/<language>.po
# catalogs listed in po/LINGUAS. Pack text doesn't go through here: it's
# translated in each pack.json's `translations` section. See docs/i18n.md.
#
# Usage:
#   scripts/i18n.sh update   # extracts text, updates the .po files (new text to translate: empty msgstr)
#   scripts/i18n.sh check    # checks the .po files (syntax, formats) and shows the translation rate

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PO_DIR="$ROOT_DIR/po"
DOMAIN=gnome-critter

for tool in xgettext msgcat msgmerge msginit msgfilter msgfmt; do
  command -v "$tool" >/dev/null 2>&1 || { echo "$tool not found (the 'gettext' package)." >&2; exit 1; }
done

case "${1:-}" in
  update)
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    cd "$ROOT_DIR"
    xgettext --from-code=UTF-8 --language=JavaScript --keyword=_ --keyword=N_ --keyword=ngettext:1,2 \
      --add-comments=Translation --package-name="$DOMAIN" --sort-by-file -o "$tmp/code.pot" \
      extension/*.js extension/lib/*.js core/*.js
    xgettext --from-code=UTF-8 -o "$tmp/schema.pot" extension/schemas/*.gschema.xml
    node scripts/i18n-data.mjs > "$tmp/data.pot"
    msgcat --use-first -o "$PO_DIR/$DOMAIN.pot" "$tmp/code.pot" "$tmp/schema.pot" "$tmp/data.pot"
    echo "==> $PO_DIR/$DOMAIN.pot: $(grep -c '^msgid ' "$PO_DIR/$DOMAIN.pot") entries."
    while read -r lang; do
      [ -z "$lang" ] && continue
      if [ -f "$PO_DIR/$lang.po" ]; then
        msgmerge --quiet --update --backup=none --no-fuzzy-matching "$PO_DIR/$lang.po" "$PO_DIR/$DOMAIN.pot"
      else
        msginit --no-translator --locale="$lang" -i "$PO_DIR/$DOMAIN.pot" -o "$PO_DIR/$lang.po"
        # msginit copies the source text for an English locale: start over with empty translations.
        msgfilter --keep-header -i "$PO_DIR/$lang.po" -o "$PO_DIR/$lang.po" true
      fi
      echo "==> $lang.po updated."
    done < "$PO_DIR/LINGUAS"
    ;;
  check)
    while read -r lang; do
      [ -z "$lang" ] && continue
      printf '%s: ' "$lang"
      msgfmt --check --statistics -o /dev/null "$PO_DIR/$lang.po"
    done < "$PO_DIR/LINGUAS"
    ;;
  *)
    echo "Usage: scripts/i18n.sh update | check" >&2
    exit 2
    ;;
esac
