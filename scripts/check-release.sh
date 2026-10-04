#!/usr/bin/env bash
# Pre-upload checks for extensions.gnome.org (EGO): builds the archive, then
# verifies metadata.json, the archive's contents, the code against the
# review guidelines that can be checked mechanically, and runs the tests.
# Exits non-zero if anything is wrong; warnings don't fail the run.
#
# Rules: https://gjs.guide/extensions/review-guidelines/review-guidelines.html
#
# Usage: scripts/check-release.sh [--no-tests]

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_SRC="$ROOT_DIR/extension"
SIZE_WARN_MB=10

run_tests=1
[[ "${1:-}" == "--no-tests" ]] && run_tests=0

errors=0
fail() { echo "FAIL  $*" >&2; errors=$((errors + 1)); }
warn() { echo "warn  $*" >&2; }
ok() { echo "ok    $*"; }

# --- metadata.json ---------------------------------------------------------

meta_report="$(python3 - "$EXT_SRC/metadata.json" <<'PY'
import json, re, sys

m = json.load(open(sys.argv[1]))
problems = []

for key in ("uuid", "name", "description", "shell-version", "url"):
    if not m.get(key):
        problems.append(f"missing or empty field: {key}")

uuid = m.get("uuid", "")
if not re.fullmatch(r"[A-Za-z0-9._-]+@[A-Za-z0-9._-]+", uuid):
    problems.append(f"uuid '{uuid}' isn't of the form name@namespace")

url = m.get("url", "")
if not url.startswith("https://") or "example" in url or ".invalid" in url:
    problems.append(f"url '{url}' isn't a real public https address")

versions = m.get("shell-version", [])
if not isinstance(versions, list) or not all(re.fullmatch(r"\d+(\.\d+)?", str(v)) for v in versions):
    problems.append(f"shell-version must be a list of stable versions, got {versions}")

if "version" in m:
    problems.append("'version' is managed by the site: remove it")

name = m.get("version-name")
if name is not None and not 1 <= len(str(name)) <= 16:
    problems.append(f"version-name '{name}' must be 1 to 16 characters")

for p in problems:
    print(p)
PY
)"
if [[ -n "$meta_report" ]]; then
  while IFS= read -r line; do fail "metadata.json: $line"; done <<<"$meta_report"
else
  ok "metadata.json"
fi

UUID="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['uuid'])" "$EXT_SRC/metadata.json")"
ZIP="$ROOT_DIR/dist/$UUID.shell-extension.zip"

# --- build the archive -----------------------------------------------------

if "$ROOT_DIR/scripts/build.sh" >/dev/null 2>&1 && [[ -f "$ZIP" ]]; then
  ok "archive built: dist/$(basename "$ZIP")"
else
  fail "scripts/build.sh failed"
  exit 1
fi

# --- archive contents ------------------------------------------------------

files="$(unzip -Z1 "$ZIP")"

for required in metadata.json extension.js prefs.js LICENSE; do
  grep -qx "$required" <<<"$files" || fail "archive: $required is missing"
done
grep -q '^schemas/.*\.gschema\.xml$' <<<"$files" || fail "archive: no schemas/*.gschema.xml"
grep -q '^locale/.*\.mo$' <<<"$files" || warn "archive: no compiled translation (.mo)"

forbidden='(^|/)(gschemas\.compiled|__pycache__|\.git|\.idea|node_modules|tests?|critter-demo)(/|$)|\.(po|pot|py|sh|so|exe|dll|pyc)$'
bad="$(grep -E "$forbidden" <<<"$files" || true)"
if [[ -n "$bad" ]]; then
  while IFS= read -r line; do fail "archive: forbidden file: $line"; done <<<"$bad"
else
  ok "archive: no forbidden file"
fi

size_mb=$(($(stat -c %s "$ZIP") / 1024 / 1024))
count="$(wc -l <<<"$files")"
if ((size_mb >= SIZE_WARN_MB)); then
  warn "archive: ${size_mb} MB, $count files (above ${SIZE_WARN_MB} MB)"
else
  ok "archive: ${size_mb} MB, $count files"
fi

# --- code ------------------------------------------------------------------

# Deprecated or forbidden in extensions (Mainloop, Lang, ByteArray, imports.*).
legacy="$(grep -rnE "\bMainloop\b|\bLang\.|\bByteArray\b|\bimports\." "$EXT_SRC" "$ROOT_DIR/core" --include='*.js' || true)"
if [[ -n "$legacy" ]]; then
  while IFS= read -r line; do fail "legacy API: $line"; done <<<"$legacy"
else
  ok "code: no legacy API"
fi

# prefs.js runs in a separate process: it must not import the Shell's libraries.
shell_in_prefs="$(grep -nE "gi://(Clutter|Meta|St|Shell)|resource:///org/gnome/shell/" "$EXT_SRC/prefs.js" || true)"
if [[ -n "$shell_in_prefs" ]]; then
  while IFS= read -r line; do fail "prefs.js imports a Shell library: $line"; done <<<"$shell_in_prefs"
else
  ok "prefs.js: no Shell library"
fi

# The extension's process has no Gtk/Gdk (and must not import them).
gtk_in_shell="$(grep -rnE "gi://(Gtk|Gdk|Adw)\b" "$EXT_SRC/extension.js" "$EXT_SRC/lib" || true)"
if [[ -n "$gtk_in_shell" ]]; then
  while IFS= read -r line; do fail "Gtk/Gdk/Adw in the Shell's process: $line"; done <<<"$gtk_in_shell"
else
  ok "extension: no Gtk/Gdk/Adw"
fi

# --- tests -----------------------------------------------------------------

if ((run_tests)); then
  if (cd "$ROOT_DIR" && npm test >/dev/null 2>&1); then
    ok "npm test"
  else
    fail "npm test failed (run it to see the output)"
  fi
fi

echo
if ((errors > 0)); then
  echo "$errors problem(s): not ready to upload." >&2
  exit 1
fi
echo "Ready to upload: $ZIP"
