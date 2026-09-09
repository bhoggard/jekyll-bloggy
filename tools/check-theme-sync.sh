#!/usr/bin/env bash
#
# Guard against jekyll-theme-chirpy version drift.
#
# This repo overrides a handful of theme files by copying them out of the gem
# and editing them (see tools/theme-overrides.sha256). Those copies are forks:
# when upstream changes the file we forked, our copy silently goes stale. The
# theme ships its layouts, includes AND its JavaScript together, so a stale
# fork can desync the markup from the script that drives it -- that is how the
# PWA service-worker update path broke the live site before.
#
# This checks the gem's current copy of each overridden file against the
# checksum recorded when we forked it, and fails if upstream moved.
#
# Usage:
#   bash tools/check-theme-sync.sh            # verify (exits 1 on drift)
#   bash tools/check-theme-sync.sh --update   # re-record after re-syncing

set -eu

MANIFEST="$(dirname "$0")/theme-overrides.sha256"

gem_path() {
  bundle info --path jekyll-theme-chirpy 2>/dev/null
}

gem_version() {
  bundle list 2>/dev/null | sed -n 's/.*jekyll-theme-chirpy (\(.*\))/\1/p'
}

GEM="$(gem_path)"
if [[ -z $GEM || ! -d $GEM ]]; then
  echo "check-theme-sync: cannot locate jekyll-theme-chirpy; run 'bundle install' first." >&2
  exit 1
fi

VERSION="$(gem_version)"

if [[ ${1:-} == "--update" ]]; then
  {
    # keep the header, refresh the version line and the checksums
    sed -n '1,/^# theme-version:/p' "$MANIFEST" | sed '$d'
    echo "# theme-version: $VERSION"
    while read -r _ path; do
      sha256sum "$GEM/$path" | sed "s|$GEM/||"
    done < <(grep -v '^#' "$MANIFEST" | grep -v '^[[:space:]]*$')
  } >"$MANIFEST.tmp"
  mv "$MANIFEST.tmp" "$MANIFEST"
  echo "check-theme-sync: manifest updated for jekyll-theme-chirpy $VERSION"
  exit 0
fi

recorded_version="$(sed -n 's/^# theme-version: //p' "$MANIFEST")"
drift=0

while read -r want path; do
  if [[ ! -f "$GEM/$path" ]]; then
    echo "DRIFT: $path no longer exists in jekyll-theme-chirpy $VERSION" >&2
    drift=1
    continue
  fi
  got="$(sha256sum "$GEM/$path" | cut -d' ' -f1)"
  if [[ $got != "$want" ]]; then
    echo "DRIFT: upstream $path changed since it was forked" >&2
    drift=1
  fi
done < <(grep -v '^#' "$MANIFEST" | grep -v '^[[:space:]]*$')

if ((drift)); then
  cat >&2 <<MSG

jekyll-theme-chirpy is at $VERSION; the overrides in _includes/ and _layouts/
were forked from $recorded_version. Diff each file above against the gem:

    diff -u "\$(bundle info --path jekyll-theme-chirpy)/<path>" <path>

port the upstream changes into our copy, then re-record:

    bash tools/check-theme-sync.sh --update
MSG
  exit 1
fi

echo "check-theme-sync: overrides in sync with jekyll-theme-chirpy $VERSION"
