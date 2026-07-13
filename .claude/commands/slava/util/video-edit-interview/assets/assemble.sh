#!/usr/bin/env bash
# video-edit-interview Stage 3 — apply approved cuts + reorder + cross-fade.
# Reads interview.manifest.json, slices every state=="keep" segment from the source,
# reassembles them in `order` with a constant cross-fade (XFADE), then writes each
# segment's out_start/out_end back into the manifest (the timeline positions the
# question beats place against — NEVER source timestamps). Also emits a beats.tsv
# for /video-question-beats. Fully local, deterministic.
# Output contract (shell-safety P783): status lines use ':' separators only.
set -euo pipefail

MANIFEST=""; OUT=""; BEATS_OUT=""; KEEP=0
while [ $# -gt 0 ]; do case "$1" in
  --manifest)  MANIFEST="$2"; shift 2;;
  --out)       OUT="$2";      shift 2;;
  --beats-out) BEATS_OUT="$2"; shift 2;;
  --keep)      KEEP=1;        shift;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done
[ -n "$MANIFEST" ] && [ -f "$MANIFEST" ] || { echo "ERROR: --manifest <interview.manifest.json> required" >&2; exit 2; }
[ -n "$OUT" ] || { echo "ERROR: --out <reordered.mp4> required" >&2; exit 2; }
[ -n "$BEATS_OUT" ] || BEATS_OUT="${OUT%.*}_beats.tsv"

SRC=$(jq -r '.source' "$MANIFEST")
X=$(jq -r '.xfade // 0.5' "$MANIFEST")
[ -f "$SRC" ] || { echo "ERROR: source not found: $SRC" >&2; exit 2; }

# segment ids MUST be unique — the out_start/out_end write-back and beats query both
# key on id; a duplicate would update multiple rows and produce multi-line beats.
DUP=$(jq -r '[.segments[].id] | group_by(.) | map(select(length>1)[0]) | .[]?' "$MANIFEST")
[ -z "$DUP" ] || { echo "ERROR: duplicate segment id(s): $(echo "$DUP" | tr '\n' ' ')— ids must be unique" >&2; exit 2; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/interview-asm.XXXXXX")"
cleanup(){ [ "$KEEP" = 1 ] && echo "kept work dir: $WORK" || rm -rf "$WORK"; }
trap cleanup EXIT

# target geometry from source; force consistent params so xfade can chain
IFS=, read -r W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$SRC")
: "${W:?width}"; : "${H:?height}"
FPS=30
ENC=(-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r $FPS -c:a aac -ar 48000 -ac 2)

# kept segments, sorted by order
KEPT=$(jq -c '[.segments[] | select(.state=="keep")] | sort_by(.order) | .[]' "$MANIFEST")
[ -n "$KEPT" ] || { echo "ERROR: no state==keep segments in manifest" >&2; exit 2; }

# ---- slice each kept segment, collect ids + durations ----------------------
ids=(); durs=()
i=0
while IFS= read -r seg; do
  id=$(jq -r '.id' <<<"$seg")
  s=$(jq -r '.src_start' <<<"$seg")
  e=$(jq -r '.src_end'   <<<"$seg")
  awk "BEGIN{exit !($e > $s)}" || { echo "ERROR: segment $id has src_end <= src_start" >&2; exit 2; }
  d=$(awk "BEGIN{printf \"%.3f\", $e-$s}")
  awk "BEGIN{exit !($d > $X)}" || { echo "ERROR: segment $id ($d s) shorter than xfade ($X s) — cannot cross-fade" >&2; exit 2; }
  echo "  slice $i : $id : ${s}s..${e}s : ${d}s"
  # accurate seek: -ss before -i (fast) then re-encode for frame accuracy + uniform params
  ffmpeg -v error -y -ss "$s" -to "$e" -i "$SRC" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}" \
    "${ENC[@]}" "$WORK/seg_${i}.mp4"
  ids+=("$id"); durs+=("$d")
  i=$((i+1))
done <<<"$KEPT"
n=$i
echo "[asm] ${n} kept segment(s) : xfade ${X}s"

# ---- compute cumulative timeline (out_start/out_end per segment) ------------
# L = combined length after adding each clip; L_i = L_{i-1} + d_i - X (for i>0)
# out_start_0 = 0; out_start_i = L_{i-1} - X (transition-in point). out_end_i = L_i.
declare -a OS OE
L=0
for ((i=0;i<n;i++)); do
  if [ "$i" -eq 0 ]; then
    OS[0]=0
    L=${durs[0]}
    OE[0]=$L
  else
    OS[$i]=$(awk "BEGIN{printf \"%.3f\", $L-$X}")
    L=$(awk "BEGIN{printf \"%.3f\", $L+${durs[$i]}-$X}")
    OE[$i]=$L
  fi
done

# ---- assemble: xfade video + acrossfade audio ------------------------------
if [ "$n" -eq 1 ]; then
  cp "$WORK/seg_0.mp4" "$OUT"
else
  INPUTS=(); for ((i=0;i<n;i++)); do INPUTS+=(-i "$WORK/seg_${i}.mp4"); done
  # video xfade chain
  vprev="0:v"; aprev="0:a"; fg=""
  Lrun=${durs[0]}
  for ((i=1;i<n;i++)); do
    off=$(awk "BEGIN{printf \"%.3f\", $Lrun-$X}")
    fg+="[${vprev}][${i}:v]xfade=transition=fade:duration=${X}:offset=${off}[vx${i}];"
    fg+="[${aprev}][${i}:a]acrossfade=d=${X}[ax${i}];"
    vprev="vx${i}"; aprev="ax${i}"
    Lrun=$(awk "BEGIN{printf \"%.3f\", $Lrun+${durs[$i]}-$X}")
  done
  fg="${fg%;}"
  ffmpeg -v error -y "${INPUTS[@]}" -filter_complex "$fg" \
    -map "[${vprev}]" -map "[${aprev}]" "${ENC[@]}" -movflags +faststart "$OUT"
fi

# ---- write out_start/out_end back into the manifest ------------------------
tmp="$WORK/manifest.next.json"
cp "$MANIFEST" "$tmp"
for ((i=0;i<n;i++)); do
  jq --arg id "${ids[$i]}" --argjson os "${OS[$i]}" --argjson oe "${OE[$i]}" \
    '(.segments[] | select(.id==$id)) |= (.out_start=$os | .out_end=$oe)' "$tmp" > "$tmp.2" && mv "$tmp.2" "$tmp"
done
mv "$tmp" "$MANIFEST"
echo "[asm] wrote out_start/out_end back to $MANIFEST"

# ---- emit beats.tsv : fire at out_start + XFADE, only non-null question_text
: > "$BEATS_OUT"
for ((i=0;i<n;i++)); do
  id="${ids[$i]}"
  q=$(jq -r --arg id "$id" '.segments[] | select(.id==$id) | .question_text // ""' "$MANIFEST")
  [ -z "$q" ] || [ "$q" = "null" ] && continue
  bt=$(awk "BEGIN{printf \"%.3f\", ${OS[$i]}+$X}")
  printf '%s\t%s\n' "$bt" "$q" >> "$BEATS_OUT"
done
echo "[asm] beats.tsv : $BEATS_OUT ($(wc -l < "$BEATS_OUT" | tr -d ' ') beat(s))"

echo "DONE : $OUT"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" \
  | awk '{printf "assembled duration: %.1fs\n",$1}'
