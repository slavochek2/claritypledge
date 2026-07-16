#!/usr/bin/env bash
# video-question-beats — overlay interview question lower-thirds onto a finished cut.
# Each question card SLIDES IN as a lower-third at its beat time, holds, fades out;
# the video keeps playing underneath, audio level unchanged (2026-07-14: duck removed
# per founder call — cards are visual-only). Fully local.
# Motion + alpha fade are all done in ffmpeg (the PNG is a static alpha graphic).
# Output contract (shell-safety P783): status lines use ':' separators only — never > < |.
set -euo pipefail

# ---- args -------------------------------------------------------------------
IN=""; OUT=""; BEATS=""; KEEP=0
while [ $# -gt 0 ]; do case "$1" in
  --in)    IN="$2";    shift 2;;
  --out)   OUT="$2";   shift 2;;
  --beats) BEATS="$2"; shift 2;;   # TSV: <start_seconds>\t<question text>  (one beat per line, '#' comments ok)
  --keep)  KEEP=1;     shift;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done
[ -n "$IN" ]    && [ -f "$IN" ]    || { echo "ERROR: --in <cut.mp4> required and must exist" >&2; exit 2; }
[ -n "$BEATS" ] && [ -f "$BEATS" ] || { echo "ERROR: --beats <beats.tsv> required and must exist" >&2; exit 2; }
[ -n "$OUT" ]   || OUT="${IN%.*}_beats.mp4"

# ---- motion constants (named, so they can be tuned in one place) ------------
SL=0.4        # slide-in duration (s)
HOLD=3.6      # card hold (s)
FADE=0.5      # alpha fade-out (s)
D=$(awk "BEGIN{print $SL+$HOLD+$FADE}")   # total per-beat visible duration

# ---- locate repo assets + playwright ---------------------------------------
ASSETS="$(cd "$(dirname "$0")" && pwd)"
CP_ROOT="$(cd "$ASSETS" && git rev-parse --show-toplevel)"
PW="$CP_ROOT/tools/kanban/node_modules/playwright-core/index.js"
[ -f "$PW" ] || { echo "ERROR: playwright-core not found at $PW" >&2; exit 3; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/qbeats.XXXXXX")"
cleanup(){ [ "$KEEP" = 1 ] && echo "kept work dir: $WORK" || rm -rf "$WORK"; }
trap cleanup EXIT

echo "[1/4] staging assets : $WORK"
cp "$ASSETS/beat.css" "$ASSETS/beat.html" "$ASSETS/render-beat.mjs" "$WORK/"
cp "$CP_ROOT/public/fonts/inter-latin.woff2"                "$WORK/inter.woff2"
cp "$CP_ROOT/public/fonts/playfair-display-italic-latin.woff2" "$WORK/playfair.woff2"

# ---- probe the video --------------------------------------------------------
IFS=, read -r W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$IN")
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
: "${W:?width}"; : "${H:?height}"
MARGIN=$(awk "BEGIN{print int($W*0.042)}")   # left/bottom inset
CARDW=$(awk "BEGIN{w=1180; m=$W-2*$MARGIN; print int((w<m)?w:m)}")  # cap to fit narrow/portrait frames
echo "[2/4] video : ${W}x${H} : ${DUR}s : margin ${MARGIN}px : card ${CARDW}px"

# ---- render one alpha PNG per beat, collect (start, cardW, cardH) -----------
echo "[3/4] rendering beat cards"
declare -a T CW CH CY
n=0
while IFS=$'\t' read -r start qtext; do
  [ -z "${start:-}" ] && continue
  case "$start" in \#*) continue;; esac          # skip comment lines
  [[ "$start" =~ ^[0-9]+(\.[0-9]+)?$ ]] || { echo "ERROR: non-numeric beat start '$start'" >&2; exit 2; }
  # A short final segment can push start+D past the end. Only abort if there is no room
  # even to slide the card in (start+SL >= DUR); otherwise the beat is CLAMPED to the
  # video end below (shortened hold/fade) rather than failing the whole pass.
  awk "BEGIN{exit !($start+$SL < $DUR)}" || { echo "ERROR: beat at ${start}s starts too close to end (no room for the ${SL}s slide-in in ${DUR}s video)" >&2; exit 2; }
  awk "BEGIN{exit !($start+$D < $DUR)}" || echo "  note: beat at ${start}s clamped to video end (${DUR}s) — hold/fade shortened" >&2
  # warn if this beat overlaps the previous one (cards would stack at the same y)
  if [ "$n" -gt 0 ]; then
    prev=${T[$((n-1))]}
    awk "BEGIN{exit !($start-$prev < $D)}" && echo "  note: beat at ${start}s starts within ${D}s of the previous (${prev}s) — cards may overlap at the lower-third" >&2
  fi
  png="$WORK/card_${n}.png"
  dims=$(node "$WORK/render-beat.mjs" "$WORK/beat.html" "$png" --question "$qtext" --width "$CARDW" --pw "$PW" | tail -1)
  cw=${dims%x*}; ch=${dims#*x}
  [[ "$cw" =~ ^[0-9]+$ && "$ch" =~ ^[0-9]+$ ]] || { echo "ERROR: bad card dims '$dims' for beat $n" >&2; exit 4; }
  # bottom-anchor: card's own height decides its y, so it never overflows the frame
  # regardless of resolution or question length (was a fixed top-anchor before — P-fix 2026-07-16)
  cy=$(awk "BEGIN{print int($H-$MARGIN-$ch)}")
  awk "BEGIN{exit !($cy >= 0)}" || { echo "ERROR: beat $n card (${cw}x${ch}) taller than available frame height (${H}px, margin ${MARGIN}px) — shorten the question or raise CARDW" >&2; exit 4; }
  T[$n]=$start; CW[$n]=$cw; CH[$n]=$ch; CY[$n]=$cy
  echo "  beat $n : t=${start}s : card ${cw}x${ch} : y ${cy}px : \"${qtext}\""
  n=$((n+1))
done < "$BEATS"
[ "$n" -gt 0 ] || { echo "ERROR: no beats parsed from $BEATS" >&2; exit 2; }

# ---- build the ffmpeg filtergraph ------------------------------------------
# inputs: 0 = video; 1..n = looped card PNGs (one per beat)
INPUTS=(-i "$IN")
for ((i=0;i<n;i++)); do INPUTS+=(-loop 1 -t "$DUR" -i "$WORK/card_${i}.png"); done

FG=""; PREV="0:v"
for ((i=0;i<n;i++)); do
  t=${T[$i]}; cw=${CW[$i]}; cy=${CY[$i]}
  # clamp the visible end to just before the video end; keep the fade-out inside it,
  # but never let the fade start before the slide-in finishes (t+SL)
  vend=$(awk "BEGIN{e=$t+$D; m=$DUR-0.05; print (e<m)?e:m}")
  fout=$(awk "BEGIN{f=$vend-$FADE; s=$t+$SL; print (f>s)?f:s}")
  # card stream: alpha in at t, alpha out at fout; card idx is input i+1
  FG+="[$((i+1)):v]format=yuva420p,fade=t=in:st=${t}:d=0.25:alpha=1,fade=t=out:st=${fout}:d=${FADE}:alpha=1[c${i}];"
  # x slides from -cw (off-left) to MARGIN over SL, then rests; y bottom-anchored per-card (see cy above)
  XEXPR="${MARGIN}-(${cw}+${MARGIN})*(1-min(1\,max(0\,(t-${t})/${SL})))"
  FG+="[${PREV}][c${i}]overlay=x='${XEXPR}':y=${cy}:enable='between(t,${t},${vend})'[v${i}];"
  PREV="v${i}"
done
# audio plays at unchanged level throughout — cards are visual-only, no duck (2026-07-14 founder call)

echo "[4/4] compositing ${n} beat(s)"
ffmpeg -v error -y "${INPUTS[@]}" \
  -filter_complex "${FG%;}" \
  -map "[${PREV}]" -map "0:a" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -ar 48000 -b:a 192k \
  -movflags +faststart "$OUT"

echo "DONE : $OUT"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" \
  | awk '{printf "final duration: %.1fs\n",$1}'
