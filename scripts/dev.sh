#!/usr/bin/env bash
# Boucle de développement rapide sous Wayland : reconstruit l'extension, la
# relie en mode dev (symlink), puis lance une session GNOME Shell imbriquée
# jetable pour tester sans se déconnecter de la vraie session.
#
# Pourquoi : sous Wayland, GNOME Shell ne sait pas se recharger à chaud
# (Alt+F2, r ne marche que sous X11) ; la seule façon de repartir d'un Shell
# "propre" est normalement de se déconnecter/reconnecter. La session
# imbriquée (dbus-run-session -- gnome-shell --devkit --wayland) donne un
# Shell jetable, isolé de la vraie session (bus D-Bus dédié), qu'on peut
# fermer et relancer en quelques secondes. Voir docs/dev-workflow.md.
#
# Note : le flag --nested a disparu à partir de GNOME Shell 49/50 (voir
# `gnome-shell --help`). `gnome-shell --wayland` seul (sans --devkit) a été
# testé et échoue avec "Failed to take control of the session: EBUSY" sur
# GNOME 50 quand on est déjà dans une session Wayland active : le process
# enfant essaie de prendre le contrôle logind de LA MÊME session que le vrai
# Shell, qui la détient déjà. --devkit (GNOME 48+, "development kit") évite
# ce conflit -- vu en pratique : "Will monitor session 8" au lieu de tenter
# de la contrôler -- et c'est ce que fait tourner ce script.
#
# Usage :
#   scripts/dev.sh              # build --link, lance la session imbriquée,
#                                # active l'extension automatiquement dedans
#   scripts/dev.sh --no-build   # saute le rebuild (utile si seul packs/ ou
#                                # schemas/ a changé et que le lien symlink
#                                # est déjà à jour)
#   scripts/dev.sh --lang en    # session imbriquée dans une autre langue
#                                # (traductions, voir docs/i18n.md)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="desktop-critter@beedi.xyz"

# Couleurs/icônes : désactivées si la sortie n'est pas un terminal (log,
# pipe...). Exportées (variables + fonctions) pour rester utilisables dans
# le `bash -c` lancé plus bas par dbus-run-session, qui hérite de
# l'environnement mais pas des définitions locales non exportées.
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
    *) err "Option inconnue : $1 (usage : scripts/dev.sh [--no-build] [--lang en])"; exit 2 ;;
  esac
done

if [[ "$BUILD" == 1 ]]; then
  "$ROOT_DIR/scripts/build.sh" --link
fi

# Langue de la session imbriquée : LANGUAGE passe devant la locale pour les
# catalogues gettext ; la vraie session n'est pas touchée.
if [[ -n "$LANG_CODE" ]]; then
  export LANGUAGE="$LANG_CODE"
  info "Session imbriquée en langue « $LANG_CODE »."
fi

if ! command -v dbus-run-session >/dev/null 2>&1; then
  err "dbus-run-session introuvable (paquet 'dbus' / 'dbus-user-session')."
  exit 1
fi

DEVKIT_BIN="/usr/libexec/mutter-devkit"
if [[ ! -x "$DEVKIT_BIN" ]]; then
  err "$DEVKIT_BIN introuvable : --devkit démarrera sans erreur mais"
  err "AUCUNE fenêtre n'apparaîtra pour voir/piloter le Shell imbriqué"
  err "(le binaire compagnon qui affiche le devkit manque)."
  err "Installe-le puis relance : ${BOLD}sudo dnf install mutter-devkit${RESET}"
  exit 1
fi

info "${BOLD}Lancement d'une session GNOME Shell imbriquée (Wayland).${RESET}"
printf '  %sFerme simplement la fenêtre (ou Ctrl+C ici) pour la quitter --%s\n' "$DIM" "$RESET"
printf '  %sça n'"'"'affecte pas ta vraie session ni ton vrai GNOME Shell.%s\n' "$DIM" "$RESET"
echo

# Sur son propre bus D-Bus privé (celui que dbus-run-session vient de créer) :
# on lance le Shell imbriqué en tâche de fond, on attend qu'il soit prêt, on
# active l'extension dessus (gnome-extensions hérite du même bus), puis on
# attend la fin du Shell imbriqué pour rendre la main.
exec dbus-run-session -- bash -c '
  gnome-shell --devkit --wayland &
  shell_pid=$!

  for _ in $(seq 1 20); do
    sleep 0.5
    if gnome-extensions enable "'"$UUID"'" 2>/dev/null; then
      ok "Extension activée dans la session imbriquée."
      break
    fi
  done

  wait "$shell_pid"
'
