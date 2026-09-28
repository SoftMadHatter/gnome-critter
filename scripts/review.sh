#!/usr/bin/env bash
# Review tool (dev): a local, read-only page to review achievements,
# titles, rewards, Committee announcements, creatures, and objects the way
# the game computes them. Fixes are made in the editor; the page reloads
# itself on every save. Nothing ships with the extension (tools/ isn't
# copied by build.sh). See docs/dev-workflow.md.
#
# Usage: scripts/review.sh [--port N] [--open]

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=8765
OPEN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --open) OPEN=1; shift ;;
    *) echo "Unknown option: $1 (usage: scripts/review.sh [--port N] [--open])" >&2; exit 2 ;;
  esac
done

if [ "$OPEN" = 1 ]; then
  if command -v xdg-open >/dev/null 2>&1; then
    (sleep 1 && xdg-open "http://127.0.0.1:$PORT/" >/dev/null 2>&1) &
  else
    echo "xdg-open not found: open http://127.0.0.1:$PORT/ manually." >&2
  fi
fi

exec node "$ROOT_DIR/tools/review/server.mjs" --port "$PORT"
