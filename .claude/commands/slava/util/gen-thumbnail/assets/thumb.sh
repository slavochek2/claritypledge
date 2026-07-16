#!/usr/bin/env bash
# gen-thumbnail — render a 1280x720 ClarityPledge YouTube thumbnail from the brand
# design system (same fonts/tokens/logo as the intro/outro cards). Fully local.
# Writes ~/video-library/<slug>/thumbnail.png. See SKILL.md.
set -euo pipefail

# ---- args -------------------------------------------------------------------
SLUG=""; HEADLINE=""; KICKER="ClarityPledge"; VLEFT=""; VRIGHT=""; OUT=""; PHOTO=""
while [ $# -gt 0 ]; do case "$1" in
  --slug)     SLUG="$2";     shift 2;;
  --headline) HEADLINE="$2"; shift 2;;   # the hook; wrap one word in *stars* for blue italic
  --kicker)   KICKER="$2";   shift 2;;
  --vleft)    VLEFT="$2";    shift 2;;    # left Venn label (optional)
  --vright)   VRIGHT="$2";   shift 2;;    # right Venn label (optional) — both empty hides the motif
  --photo)    PHOTO="$2";    shift 2;;    # optional: real still frame as background (photo mode) — hides Venn
  --out)      OUT="$2";      shift 2;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done
[ -z "$PHOTO" ] || [ -f "$PHOTO" ] || { echo "ERROR: --photo file not found: $PHOTO" >&2; exit 2; }

[ -n "$HEADLINE" ] || { echo "ERROR: --headline required" >&2; exit 2; }
if [ -z "$OUT" ]; then
  [ -n "$SLUG" ] || { echo "ERROR: need --out or --slug" >&2; exit 2; }
  OUT="$HOME/video-library/$SLUG/thumbnail.png"
fi
mkdir -p "$(dirname "$OUT")"

# ---- locate repo assets + playwright (same discovery as brand.sh) ----------
ASSETS="$(cd "$(dirname "$0")" && pwd)"
CP_ROOT="$(cd "$ASSETS" && git rev-parse --show-toplevel)"
PW="$CP_ROOT/tools/kanban/node_modules/playwright-core/index.js"
[ -f "$PW" ] || { echo "ERROR: playwright-core not found at $PW" >&2; exit 3; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/thumbgen.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

cp "$ASSETS/thumb.html" "$ASSETS/thumb.css" "$ASSETS/render-thumb.mjs" "$WORK/"
cp "$CP_ROOT/public/clarity-pledge-icon.png"            "$WORK/logo.png"
cp "$CP_ROOT/public/fonts/inter-latin.woff2"            "$WORK/inter.woff2"
cp "$CP_ROOT/public/fonts/playfair-display-latin.woff2" "$WORK/playfair.woff2"
cp "$CP_ROOT/public/fonts/playfair-display-italic-latin.woff2" "$WORK/playfair-italic.woff2"

# bash 3.2 (macOS default) treats "${ARR[@]}" on an EMPTY array as an unbound-variable
# error under `set -u` — no array expansion here, branch the invocation instead.
echo "rendering thumbnail -> $OUT"
if [ -n "$PHOTO" ]; then
  EXT=$(echo "$PHOTO" | sed -n 's/.*\(\.[a-zA-Z0-9]*\)$/\1/p')
  STAGED_PHOTO="$WORK/photo_src${EXT}"
  cp "$PHOTO" "$STAGED_PHOTO"
  node "$WORK/render-thumb.mjs" "$WORK/thumb.html" "$OUT" --pw "$PW" \
    --headline "$HEADLINE" --kicker "$KICKER" --vleft "$VLEFT" --vright "$VRIGHT" --photo "$STAGED_PHOTO" >&2
else
  node "$WORK/render-thumb.mjs" "$WORK/thumb.html" "$OUT" --pw "$PW" \
    --headline "$HEADLINE" --kicker "$KICKER" --vleft "$VLEFT" --vright "$VRIGHT" >&2
fi

# ---- verify a real PNG landed ----------------------------------------------
[ -f "$OUT" ] || { echo "ERROR: render produced no file" >&2; exit 4; }
read -r W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
  -of csv=p=0 "$OUT" | tr ',' ' ')
echo "DONE -> $OUT (${W}x${H})"
[ "${W:-0}" -ge 1280 ] || { echo "WARN: width ${W} below 1280 — check render" >&2; }
