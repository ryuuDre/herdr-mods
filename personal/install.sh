#!/usr/bin/env bash
# Install this personal layout and the mods it uses, from these checkouts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
GRAPH="${GIT_GRAPH_DIR:-$ROOT/../herdr-git-graph}"

mkdir -p "$APP/mods" "$APP/layouts"

# A sync replaces what is installed, so anything already there is kept first.
BACKUP="${XDG_CACHE_HOME:-$HOME/.cache}/herdr-mods-backup/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
for mod in better-tabs better-icons better-files better-changes git-graph; do
  if [ -d "$APP/mods/$mod" ]; then
    cp -a "$APP/mods/$mod" "$BACKUP/$mod"
  fi
done

# sync.sh is how upstream installs: symlinks break icon loading.
"$ROOT/better-tabs/sync.sh"
"$ROOT/better-icons/sync.sh"
"$ROOT/better-files/sync.sh"
"$ROOT/better-changes/sync.sh"

rsync -a --delete "$GRAPH/mods/git-graph/" "$APP/mods/git-graph/"

install -m 0644 "$ROOT/personal/layouts/personal.json" \
  "$APP/layouts/personal.json"

for mod in better-tabs better-icons better-files better-changes git-graph; do
  herdr-app check "$APP/mods/$mod"
done

herdr-app status
