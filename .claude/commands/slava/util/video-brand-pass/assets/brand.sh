#!/usr/bin/env bash
# video-brand-pass — add a branded intro card, persistent corner logo bug, and
# branded outro card to a finished talk video. Fully local: headless Chrome
# renders the design-system cards, ffmpeg composites. See SKILL.md.
set -euo pipefail

# ---- args -------------------------------------------------------------------
IN=""; OUT=""; TITLE=""; SUB=""; CTA=""; KEEP=0
while [ $# -gt 0 ]; do case "$1" in
  --in)       IN="$2";    shift 2;;
  --out)      OUT="$2";   shift 2;;
  --title)    TITLE="$2"; shift 2;;
  --subtitle) SUB="$2";   shift 2;;
  --cta)      CTA="$2";   shift 2;;
  --keep)     KEEP=1;     shift;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done

[ -n "$IN" ]    || { echo "ERROR: --in <final.mp4> required" >&2; exit 2; }
[ -f "$IN" ]    || { echo "ERROR: input not found: $IN" >&2; exit 2; }
[ -n "$TITLE" ] || { echo "ERROR: --title required" >&2; exit 2; }
[ -n "$CTA" ]   || { echo "ERROR: --cta required (outro call-to-action)" >&2; exit 2; }
[ -n "$OUT" ]   || OUT="${IN%.*}_branded.mp4"

# ---- locate repo assets + playwright ---------------------------------------
ASSETS="$(cd "$(dirname "$0")" && pwd)"
CP_ROOT="$(cd "$ASSETS" && git rev-parse --show-toplevel)"
PW="$CP_ROOT/tools/kanban/node_modules/playwright-core/index.js"
[ -f "$PW" ] || { echo "ERROR: playwright-core not found at $PW" >&2; exit 3; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/brandpass.XXXXXX")"
cleanup(){ [ "$KEEP" = 1 ] && echo "kept work dir: $WORK" || rm -rf "$WORK"; }
trap cleanup EXIT

echo "[1/6] staging assets -> $WORK"
cp "$ASSETS/card.css" "$ASSETS/intro.html" "$ASSETS/outro.html" "$ASSETS/record.mjs" "$WORK/"
cp "$CP_ROOT/public/clarity-pledge-icon.png"               "$WORK/logo.png"
cp "$CP_ROOT/public/fonts/inter-latin.woff2"               "$WORK/inter.woff2"
cp "$CP_ROOT/public/fonts/playfair-display-latin.woff2"    "$WORK/playfair.woff2"
cp "$CP_ROOT/public/fonts/playfair-display-italic-latin.woff2" "$WORK/playfair-italic.woff2"

# ---- probe the talk so cards match its geometry ----------------------------
IFS=, read -r W H < <(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height -of csv=p=0 "$IN")
: "${W:?could not read width}"; : "${H:?could not read height}"
echo "[2/6] talk geometry: ${W}x${H}"

INTRO_MS=4300; OUTRO_MS=4500
ENC=(-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -ar 48000 -ac 2)

render_card(){ # $1 html  $2 ms  $3 out.mp4  $4 fade(in|out)  ...text args
  local html="$1" ms="$2" out="$3" fade="$4"; shift 4
  local rdir="$WORK/rec_$(basename "$html" .html)"; mkdir -p "$rdir"
  node "$WORK/record.mjs" "$WORK/$html" "$rdir" "$ms" --pw "$PW" "$@" >&2
  local webm; webm="$(ls "$rdir"/*.webm | head -1)"
  local dur; dur=$(awk "BEGIN{print $ms/1000}")
  local vf="scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1"
  if [ "$fade" = in ]; then vf="$vf,fade=t=in:st=0:d=0.4";
  else vf="$vf,fade=t=out:st=$(awk "BEGIN{print $dur-0.4}"):d=0.4"; fi
  ffmpeg -v error -y -i "$webm" -f lavfi -t "$dur" -i anullsrc=r=48000:cl=stereo \
    -t "$dur" -vf "$vf" -map 0:v -map 1:a "${ENC[@]}" "$out"
}

echo "[3/6] rendering intro card"
render_card intro.html "$INTRO_MS" "$WORK/seg_intro.mp4" in --title "$TITLE" --subtitle "$SUB"
echo "[4/6] rendering outro card"
render_card outro.html "$OUTRO_MS" "$WORK/seg_outro.mp4" out --title "$TITLE" --cta "$CTA"

# ---- corner logo bug over the whole talk -----------------------------------
echo "[5/6] compositing corner bug onto talk"
BUG_W=$(awk "BEGIN{print int($W*0.072)}"); MARGIN=$(awk "BEGIN{print int($W*0.025)}")
ffmpeg -v error -y -i "$IN" -i "$WORK/logo.png" -filter_complex \
  "[1:v]format=rgba,colorchannelmixer=aa=0.55,scale=${BUG_W}:-1[bug];\
   [0:v][bug]overlay=W-w-${MARGIN}:H-h-${MARGIN}:format=auto,setsar=1[v]" \
  -map "[v]" -map 0:a? "${ENC[@]}" "$WORK/seg_body.mp4"

# ---- concat: intro | body | outro (re-encode for bulletproof joins) --------
echo "[6/6] concatenating"
ffmpeg -v error -y -i "$WORK/seg_intro.mp4" -i "$WORK/seg_body.mp4" -i "$WORK/seg_outro.mp4" \
  -filter_complex "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" "${ENC[@]}" -movflags +faststart "$OUT"

echo "DONE -> $OUT"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" \
  | awk '{printf "final duration: %.1fs\n",$1}'
