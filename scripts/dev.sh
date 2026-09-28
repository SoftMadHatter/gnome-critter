#!/usr/bin/env bash
# Fast development loop on Wayland: rebuilds the extension, links it in dev
# mode (symlink), then launches a disposable nested GNOME Shell session to
# test without logging out of the real session.
#
# Why: on Wayland, GNOME Shell can't reload live (Alt+F2, r only works on
# X11); the only way to start from a "clean" Shell is normally to log
# out/back in. The nested session (dbus-run-session -- gnome-shell --devkit
# --wayland) gives a disposable Shell, isolated from the real session (its
# own D-Bus bus), that can be closed and relaunched in a few seconds. See
# docs/dev-workflow.md.
#
# Note: the --nested flag was removed starting with GNOME Shell 49/50 (see
# `gnome-shell --help`). `gnome-shell --wayland` alone (without --devkit)
# was tested and fails with "Failed to take control of the session: EBUSY"
# on GNOME 50 when already inside an active Wayland session: the child
# process tries to take logind control of THE SAME session the real Shell
# already holds. --devkit (GNOME 48+, "development kit") avoids this
# conflict -- seen in practice: "Will monitor session 8" instead of trying
# to control it -- and that's what this script runs.
#
# Usage:
#   scripts/dev.sh              # build --link, launches the nested session,
#                                # enables the extension in it automatically
#   scripts/dev.sh --no-build   # skips the rebuild (useful if only packs/
#                                # or schemas/ changed and the symlink is
#                                # already up to date)
#   scripts/dev.sh --lang en    # nested session in another language
#                                # (translations, see docs/i18n.md)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="gnome-critter@beedi.xyz"

# Colors/icons: disabled if the output isn't a terminal (log, pipe...).
# Exported (variables + functions) to stay usable in the `bash -c` launched
# further down by dbus-run-session, which inherits the environment but not
# unexported local definitions.
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'
else
  BOLD=''; DIM=''; RESET=''; RED=''; GREEN=''; YELLOW=''; BLUE=''
fi
export BOLD DIM RESET RED GREEN YELLOW BLUE

info() { printf '%s➜%s %s\n' "$BLUE" "$RESET" "$*"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%s⚠%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
err()  { printf '%s✗%s %s\n' "$RED" "$RESET" "$*" >&2; }
export -f info ok warn err

BUILD=1
LANG_CODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) BUILD=0; shift ;;
    --lang) LANG_CODE="${2:-}"; shift 2 ;;
    *) err "Unknown option: $1 (usage: scripts/dev.sh [--no-build] [--lang en])"; exit 2 ;;
  esac
done

if [[ "$BUILD" == 1 ]]; then
  "$ROOT_DIR/scripts/build.sh" --link
fi

# Nested session's language: LANGUAGE takes priority over the locale for
# the gettext catalogs; the real session isn't touched.
if [[ -n "$LANG_CODE" ]]; then
  export LANGUAGE="$LANG_CODE"
  info "Nested session in language \"$LANG_CODE\"."
fi

if ! command -v dbus-run-session >/dev/null 2>&1; then
  err "dbus-run-session not found (the 'dbus' / 'dbus-user-session' package)."
  exit 1
fi

DEVKIT_BIN="/usr/libexec/mutter-devkit"
if [[ ! -x "$DEVKIT_BIN" ]]; then
  err "$DEVKIT_BIN not found: --devkit will start with no error but"
  err "NO window will appear to see/control the nested Shell"
  err "(the companion binary that displays the devkit is missing)."
  err "Install it then relaunch: ${BOLD}sudo dnf install mutter-devkit${RESET}"
  exit 1
fi

info "${BOLD}Launching a nested GNOME Shell session (Wayland).${RESET}"
printf '  %sJust close the window (or Ctrl+C here) to quit it --%s\n' "$DIM" "$RESET"
printf '  %sit does not affect your real session or your real GNOME Shell.%s\n' "$DIM" "$RESET"
echo

# On its own private D-Bus bus (the one dbus-run-session just created):
# the nested Shell is launched in the background, we wait for it to be
# ready, enable the extension on it (gnome-extensions inherits the same
# bus), then wait for the nested Shell to end before returning control.
exec dbus-run-session -- bash -c '
  gnome-shell --devkit --wayland &
  shell_pid=$!

  for _ in $(seq 1 20); do
    sleep 0.5
    if gnome-extensions enable "'"$UUID"'" 2>/dev/null; then
      ok "Extension enabled in the nested session."
      break
    fi
  done

  wait "$shell_pid"
'
