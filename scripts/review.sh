#!/usr/bin/env bash
# Outil de revue (dev) : page locale, en lecture seule, pour relire les
# succès, titres, récompenses, annonces du Système, créatures et objets tels
# que le jeu les calcule. Les corrections se font dans l'éditeur ; la page se
# recharge seule à chaque enregistrement. Rien n'est livré avec l'extension
# (tools/ n'est pas copié par build.sh). Voir docs/dev-workflow.md.
#
# Usage : scripts/review.sh [--port N] [--open]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8765
OPEN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --open) OPEN=1; shift ;;
    *) echo "Option inconnue : $1 (usage : scripts/review.sh [--port N] [--open])" >&2; exit 2 ;;
  esac
done

if [ "$OPEN" = 1 ]; then
  if command -v xdg-open >/dev/null 2>&1; then
    (sleep 1 && xdg-open "http://127.0.0.1:$PORT/" >/dev/null 2>&1) &
  else
    echo "xdg-open introuvable : ouvre http://127.0.0.1:$PORT/ à la main." >&2
  fi
fi

exec node "$ROOT_DIR/tools/review/server.mjs" --port "$PORT"
