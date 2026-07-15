#!/usr/bin/env bash
# video-brand-pass — brand a finished talk: COLD-OPEN intro bumper (drops in a few
# seconds into the footage, talk audio ducks underneath + a sound sting), a persistent
# corner logo bug, and an appended outro card. Fully local. See SKILL.md.
set -euo pipefail

# ---- args -------------------------------------------------------------------
IN=""; OUT=""; TITLE=""; OFFSET=6; KEEP=0
while [ $# -gt 0 ]; do case "$1" in
  --in)     IN="$2";          shift 2;;
  --out)    OUT="$2";         shift 2;;
  --title)  TITLE="$2";       shift 2;;
  --offset) OFFSET="$2";      shift 2;;   # seconds into the talk the intro drops in
  --keep)   KEEP=1;           shift;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done

[ -n "$IN" ]    || { echo "ERROR: --in <final.mp4> required" >&2; exit 2; }
[ -f "$IN" ]    || { echo "ERROR: input not found: $IN" >&2; exit 2; }
# --title is optional: omit it for a brand-only intro (ClarityPledge + tagline, no per-talk line)
[ -n "$OUT" ]   || OUT="${IN%.*}_branded.mp4"

# ---- locate repo assets + playwright ---------------------------------------
ASSETS="$(cd "$(dirname "$0")" && pwd)"
CP_ROOT="$(cd "$ASSETS" && git rev-parse --show-toplevel)"
PW="$CP_ROOT/tools/kanban/node_modules/playwright-core/index.js"
[ -f "$PW" ] || { echo "ERROR: playwright-core not found at $PW" >&2; exit 3; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/brandpass.XXXXXX")"
cleanup(){ [ "$KEEP" = 1 ] && echo "kept work dir: $WORK" || rm -rf "$WORK"; }
trap cleanup EXIT

echo "[1/7] staging assets -> $WORK"
cp "$ASSETS/card.css" "$ASSETS/intro.html" "$ASSETS/outro.html" "$ASSETS/record.mjs" "$WORK/"
[ -f "$ASSETS/sting.mp3" ] && cp "$ASSETS/sting.mp3" "$WORK/sting.mp3"
cp "$CP_ROOT/public/clarity-pledge-icon.png"                   "$WORK/logo.png"
cp "$CP_ROOT/public/fonts/inter-latin.woff2"                   "$WORK/inter.woff2"
cp "$CP_ROOT/public/fonts/playfair-display-latin.woff2"        "$WORK/playfair.woff2"
cp "$CP_ROOT/public/fonts/playfair-display-italic-latin.woff2" "$WORK/playfair-italic.woff2"

# ---- probe the talk so cards match its geometry ----------------------------
IFS=, read -r W H < <(ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height -of csv=p=0 "$IN")
DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$IN")
: "${W:?width}"; : "${H:?height}"
echo "[2/7] talk: ${W}x${H}, ${DUR}s, intro drops at ${OFFSET}s"
awk "BEGIN{exit !($OFFSET+1 < $DUR)}" || { echo "ERROR: --offset $OFFSET too close to end (${DUR}s)" >&2; exit 2; }

INTRO_MS=5800; OUTRO_MS=6500   # intro holds longer so the tagline is readable
ILEN=$(awk "BEGIN{print $INTRO_MS/1000}")
ENC=(-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -ar 48000 -ac 2)

render_card(){ # $1 html  $2 ms  $3 out.mp4  $4 fade(none|inout)  ...text args
  local html="$1" ms="$2" out="$3" fade="$4"; shift 4
  local rdir="$WORK/rec_$(basename "$html" .html)"; mkdir -p "$rdir"
  node "$WORK/record.mjs" "$WORK/$html" "$rdir" "$ms" --pw "$PW" "$@" >&2
  local webm; webm="$(ls "$rdir"/*.webm | head -1)"
  local dur; dur=$(awk "BEGIN{print $ms/1000}")
  local vf="scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1"
  [ "$fade" = inout ] && vf="$vf,fade=t=in:st=0:d=0.4,fade=t=out:st=$(awk "BEGIN{print $dur-0.4}"):d=0.4"
  ffmpeg -v error -y -i "$webm" -f lavfi -t "$dur" -i anullsrc=r=48000:cl=stereo \
    -t "$dur" -vf "$vf" -map 0:v -map 1:a "${ENC[@]}" "$out"
}

echo "[3/7] rendering intro card (raw — overlay handles the fade)"
render_card intro.html "$INTRO_MS" "$WORK/intro.mp4" none --title "$TITLE"
echo "[4/7] rendering outro card"
render_card outro.html "$OUTRO_MS" "$WORK/seg_outro.mp4" inout

# ---- prepare the entry sting (bundled SFX, or synth fallback) --------------
if [ -f "$WORK/sting.mp3" ]; then
  echo "[5/7] preparing bundled sting"
  STING_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WORK/sting.mp3")
  ffmpeg -v error -y -i "$WORK/sting.mp3" \
    -af "loudnorm=I=-30:TP=-3,afade=t=out:st=$(awk "BEGIN{print $STING_DUR-0.25}"):d=0.25" \
    -ar 48000 -ac 2 "$WORK/sting.wav"
else
  echo "[5/7] no bundled sting — synthesizing fallback"
  ffmpeg -v error -y -f lavfi -i "anoisesrc=d=0.7:c=pink:a=0.55" \
    -af "highpass=f=180,lowpass=f=5200,afade=t=in:st=0:d=0.28,afade=t=out:st=0.32:d=0.38,volume=1.4" \
    -ar 48000 -ac 2 "$WORK/sting.wav"
fi

# ---- composite: talk + bug + cold-open intro overlay + sting + tail fade-out --
echo "[6/7] compositing cold-open + corner bug"
BUG_W=$(awk "BEGIN{print int($W*0.040)}"); MARGIN=$(awk "BEGIN{print int($W*0.028)}")
STMS=$(awk "BEGIN{print int($OFFSET*1000)+800}")   # sting lands on the title clarity-flip, not the blurry start
TAILFADE=1.0   # video+audio fade to black/silence over the last second, so the cut into the outro isn't abrupt
TAILST=$(awk "BEGIN{print $DUR-$TAILFADE}")
ffmpeg -v error -y -i "$IN" -i "$WORK/logo.png" -i "$WORK/intro.mp4" -i "$WORK/sting.wav" \
  -filter_complex "\
   [1:v]format=rgba,colorchannelmixer=aa=0.55,scale=${BUG_W}:-1[bug];\
   [0:v][bug]overlay=W-w-${MARGIN}:${MARGIN}:format=auto[base];\
   [2:v]format=yuva420p,fade=t=in:st=0:d=0.4:alpha=1,fade=t=out:st=$(awk "BEGIN{print $ILEN-0.4}"):d=0.4:alpha=1,tpad=start_duration=${OFFSET}:color=0x00000000[intro];\
   [base][intro]overlay=0:0:eof_action=pass:shortest=0,setsar=1,fade=t=out:st=${TAILST}:d=${TAILFADE}[v];\
   [3:a]adelay=${STMS}|${STMS}[st];\
   [0:a][st]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${TAILST}:d=${TAILFADE}[a]" \
  -map "[v]" -map "[a]" "${ENC[@]}" "$WORK/seg_body.mp4"

# ---- concat body + outro ----------------------------------------------------
echo "[7/7] appending outro"
ffmpeg -v error -y -i "$WORK/seg_body.mp4" -i "$WORK/seg_outro.mp4" \
  -filter_complex "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]" \
  -map "[v]" -map "[a]" "${ENC[@]}" -movflags +faststart "$OUT"

echo "DONE : $OUT"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" \
  | awk '{printf "final duration: %.1fs\n",$1}'
