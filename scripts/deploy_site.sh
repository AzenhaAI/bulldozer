#!/usr/bin/env bash
# Build BullDozer and put it on azenha.ai.
#
# The site is assembled from several repos: each product is built in its own
# project and copied into the azenha tree, which is what Cloudflare Pages
# actually uploads. That copy step used to live only in people's heads, so this
# is it, written down.
#
#   scripts/deploy_site.sh          build, copy, publish
#   scripts/deploy_site.sh --stage  build and copy, stop before publishing
#
# Two-phase copy on purpose. Hashed assets go first and are never deleted in
# that pass, so a page already open in someone's browser can still fetch the
# bundle it was built against; pages follow; only then are orphaned assets
# pruned. Publishing first and deleting after is what leaves people staring at
# a blank page.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="$HOME/Projects/azenha"
DEST="$SITE/bulldozer"

[ -d "$SITE/.git" ] || { echo "✗ $SITE is not the site repo" >&2; exit 1; }
[ -d "$DEST" ] || { echo "✗ $DEST missing — wrong site checkout?" >&2; exit 1; }

echo "→ building"
cd "$HERE"
npm run build

# A build that produced almost nothing usually means a parser wiped its input;
# copying it over the live site would take the site down with it.
pages=$(find dist -name index.html | wc -l | tr -d ' ')
[ "$pages" -ge 100 ] || { echo "✗ only $pages pages built — refusing to copy" >&2; exit 1; }
echo "→ $pages pages"

echo "→ copying into the site tree"
rsync -a dist/_astro/ "$DEST/_astro/"                      # add, never remove
rsync -a --delete --exclude '_astro' dist/ "$DEST/"        # pages, mirrored
pruned=0
while read -r f; do rm -f "$DEST/_astro/$f"; pruned=$((pruned + 1)); done \
  < <(comm -23 <(cd "$DEST/_astro" && ls | sort) <(cd dist/_astro && ls | sort))
echo "→ pruned $pruned stale assets"

if [ "${1:-}" = "--stage" ]; then
  echo "✓ staged in $DEST — publish with: cd $SITE && bash scripts/deploy_prod.sh"
  exit 0
fi

echo "→ publishing the whole site"
cd "$SITE"
# Pages uploads a snapshot of the directory, so this publishes every product,
# not only BullDozer. Its own script checks the tree is complete and current.
bash scripts/deploy_prod.sh
