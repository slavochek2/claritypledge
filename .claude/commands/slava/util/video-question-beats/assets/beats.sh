#!/usr/bin/env bash
# video-question-beats — overlay interview question lower-thirds onto a finished cut.
# Each question card SLIDES IN as a lower-third at its beat time, holds, fades out;
# audio level unchanged (2026-07-14: duck removed — cards are visual-only).
# Fully local. Output contract (shell-safety P783): status lines use ':' only.
#
# 2026-07 windowed-reencode decision (docs/decisions.md): when the caller (Stage 3
# assemble.sh) has produced the sibling *_keyframes.txt + *_audio.m4a artifacts, this
# script re-encodes ONLY the windows around each beat card and stream-copies the
# untouched majority, instead of re-encoding the entire timeline for every correction.
# Went through two rounds of adversarial review before implementation — see
# beat_planner.py's docstring and docs/decisions.md for what was found and fixed
# (audio is NEVER stream-copy-cut at a video seam; the merge/snap/fuse math lives in
# beat_planner.py, not bash arrays, specifically because that's where the review
# found ordering bugs). If either sibling artifact is missing (older assemble.sh
# runs, or manual invocation), this falls back to the original full-timeline
# re-encode path — never a hard failure on an old-format input.
set -euo pipefail

# ---- args -------------------------------------------------------------------
IN=""; OUT=""; BEATS=""; KEEP=0; KEYFRAMES=""; AUDIO_MASTER=""
while [ $# -gt 0 ]; do case "$1" in
  --in)            IN="$2";            shift 2;;
  --out)           OUT="$2";           shift 2;;
  --beats)         BEATS="$2";         shift 2;;   # TSV: <start_seconds>\t<question text>
  --keyframes)     KEYFRAMES="$2";     shift 2;;   # optional override; default: sibling of --in
  --audio-master)  AUDIO_MASTER="$2";  shift 2;;   # optional override; default: sibling of --in
  --keep)          KEEP=1;             shift;;
  *) echo "unknown arg: $1" >&2; exit 2;;
esac; done
[ -n "$IN" ]    && [ -f "$IN" ]    || { echo "ERROR: --in <cut.mp4> required and must exist" >&2; exit 2; }
[ -n "$BEATS" ] && [ -f "$BEATS" ] || { echo "ERROR: --beats <beats.tsv> required and must exist" >&2; exit 2; }
[ -n "$OUT" ]   || OUT="${IN%.*}_beats.mp4"
[ -n "$KEYFRAMES" ]    || KEYFRAMES="${IN%.*}_keyframes.txt"
[ -n "$AUDIO_MASTER" ] || AUDIO_MASTER="${IN%.*}_audio.m4a"

# ---- motion constants (named, so they can be tuned in one place) ------------
SL=0.4        # slide-in duration (s)
HOLD=3.6      # card hold (s)
FADE=0.5      # alpha fade-out (s)
D=$(awk "BEGIN{print $SL+$HOLD+$FADE}")   # total per-beat visible duration — must match beat_planner.py's --card-duration default

# ---- locate repo assets + playwright + planner -----------------------------
ASSETS="$(cd "$(dirname "$0")" && pwd)"
CP_ROOT="$(cd "$ASSETS" && git rev-parse --show-toplevel)"
PW="$CP_ROOT/tools/kanban/node_modules/playwright-core/index.js"
[ -f "$PW" ] || { echo "ERROR: playwright-core not found at $PW" >&2; exit 3; }
PLANNER="$ASSETS/beat_planner.py"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/qbeats.XXXXXX")"
cleanup(){ [ "$KEEP" = 1 ] && echo "kept work dir: $WORK" || rm -rf "$WORK"; }
trap cleanup EXIT

echo "[1/6] staging assets : $WORK"
cp "$ASSETS/beat.css" "$ASSETS/beat.html" "$ASSETS/render-beat.mjs" "$WORK/"
cp "$CP_ROOT/public/fonts/inter-latin.woff2"                "$WORK/inter.woff2"
cp "$CP_ROOT/public/fonts/playfair-display-italic-latin.woff2" "$WORK/playfair.woff2"

# ---- probe the video --------------------------------------------------------
IFS=, read -r W H < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$IN")
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
: "${W:?width}"; : "${H:?height}"
MARGIN=$(awk "BEGIN{print int($W*0.042)}")   # left/bottom inset
CARDW=$(awk "BEGIN{w=1180; m=$W-2*$MARGIN; print int((w<m)?w:m)}")  # cap to fit narrow/portrait frames
FPSNUM=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$IN")  # e.g. "30/1" or "30000/1001"
FPS=$(awk -F/ '{print ($2=="" || $2==0) ? $1 : $1/$2}' <<<"$FPSNUM")
echo "[2/6] video : ${W}x${H} : ${DUR}s : ${FPS}fps : margin ${MARGIN}px : card ${CARDW}px"

# ---- render one alpha PNG per beat (id = "<partIdx>_<beatIdx>") -------------
render_card(){ # $1 qtext -> prints "id\tcw\tch" via global RENDER_CW/RENDER_CH
  local id="$1" qtext="$2"
  local png="$WORK/card_${id}.png"
  local dims; dims=$(node "$WORK/render-beat.mjs" "$WORK/beat.html" "$png" --question "$qtext" --width "$CARDW" --pw "$PW" | tail -1)
  RENDER_CW=${dims%x*}; RENDER_CH=${dims#*x}
  [[ "$RENDER_CW" =~ ^[0-9]+$ && "$RENDER_CH" =~ ^[0-9]+$ ]] || { echo "ERROR: bad card dims '$dims' for beat $id" >&2; exit 4; }
}

# =============================================================================
# LEGACY PATH — whole-file re-encode. Used when keyframes/audio-master siblings
# are missing (older assemble.sh output, or standalone invocation on a plain
# video). Preserves the original (pre-windowing) behavior exactly.
# =============================================================================
run_legacy_full_reencode(){
  if [ "$RUN_WINDOWED_ENABLED" = 1 ]; then
    echo "[3/6] no sibling *_keyframes.txt / *_audio.m4a found — falling back to full-timeline re-encode (legacy path)"
  else
    echo "[3/6] windowed re-encode disabled (RUN_WINDOWED_ENABLED=0, see comment above dispatch) — full-timeline re-encode (legacy path)"
  fi
  declare -a T CW CH CY
  n=0
  while IFS=$'\t' read -r start qtext; do
    [ -z "${start:-}" ] && continue
    case "$start" in \#*) continue;; esac
    [[ "$start" =~ ^[0-9]+(\.[0-9]+)?$ ]] || { echo "ERROR: non-numeric beat start '$start'" >&2; exit 2; }
    awk "BEGIN{exit !($start+$SL < $DUR)}" || { echo "ERROR: beat at ${start}s starts too close to end (no room for the ${SL}s slide-in in ${DUR}s video)" >&2; exit 2; }
    awk "BEGIN{exit !($start+$D < $DUR)}" || echo "  note: beat at ${start}s clamped to video end (${DUR}s) — hold/fade shortened" >&2
    if [ "$n" -gt 0 ]; then
      prev=${T[$((n-1))]}
      awk "BEGIN{exit !($start-$prev < $D)}" && echo "  note: beat at ${start}s starts within ${D}s of the previous (${prev}s) — cards may overlap at the lower-third" >&2
    fi
    render_card "$n" "$qtext"
    cw=$RENDER_CW; ch=$RENDER_CH
    cy=$(awk "BEGIN{print int($H-$MARGIN-$ch)}")
    awk "BEGIN{exit !($cy >= 0)}" || { echo "ERROR: beat $n card (${cw}x${ch}) taller than available frame height (${H}px, margin ${MARGIN}px) — shorten the question or raise CARDW" >&2; exit 4; }
    T[$n]=$start; CW[$n]=$cw; CH[$n]=$ch; CY[$n]=$cy
    echo "  beat $n : t=${start}s : card ${cw}x${ch} : y ${cy}px : \"${qtext}\""
    n=$((n+1))
  done < "$BEATS"
  [ "$n" -gt 0 ] || { echo "ERROR: no beats parsed from $BEATS" >&2; exit 2; }

  INPUTS=(-i "$IN")
  for ((i=0;i<n;i++)); do INPUTS+=(-loop 1 -t "$DUR" -i "$WORK/card_${i}.png"); done
  FG=""; PREV="0:v"
  for ((i=0;i<n;i++)); do
    t=${T[$i]}; cw=${CW[$i]}; cy=${CY[$i]}
    vend=$(awk "BEGIN{e=$t+$D; m=$DUR-0.05; print (e<m)?e:m}")
    fout=$(awk "BEGIN{f=$vend-$FADE; s=$t+$SL; print (f>s)?f:s}")
    FG+="[$((i+1)):v]format=yuva420p,fade=t=in:st=${t}:d=0.25:alpha=1,fade=t=out:st=${fout}:d=${FADE}:alpha=1[c${i}];"
    XEXPR="${MARGIN}-(${cw}+${MARGIN})*(1-min(1\,max(0\,(t-${t})/${SL})))"
    FG+="[${PREV}][c${i}]overlay=x='${XEXPR}':y=${cy}:enable='between(t,${t},${vend})'[v${i}];"
    PREV="v${i}"
  done
  echo "[4/6] compositing ${n} beat(s) — full-timeline re-encode"
  ffmpeg -v error -y "${INPUTS[@]}" \
    -filter_complex "${FG%;}" \
    -map "[${PREV}]" -map "0:a" \
    -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -ar 48000 -b:a 192k \
    -movflags +faststart "$OUT"
}

# =============================================================================
# WINDOWED PATH — re-encode only the windows around beats, stream-copy the rest.
# =============================================================================
run_windowed(){
  echo "[3/6] windowed re-encode : keyframes=$KEYFRAMES audio-master=$AUDIO_MASTER"
  PLAN="$WORK/plan.json"
  if ! python3 "$PLANNER" --keyframes "$KEYFRAMES" --beats "$BEATS" --duration "$DUR" --card-duration "$D" > "$PLAN" 2>"$WORK/planner.err"; then
    echo "  planner failed — falling back to full-timeline re-encode:" >&2
    cat "$WORK/planner.err" >&2
    run_legacy_full_reencode
    return
  fi
  NPARTS=$(python3 -c "import json;print(len(json.load(open('$PLAN'))['parts']))")
  echo "  plan : $NPARTS part(s) (see $PLAN)"

  PARTLIST="$WORK/concat_list.txt"; : > "$PARTLIST"
  pi=0
  while IFS= read -r idx; do
    ptype=$(python3 -c "import json;print(json.load(open('$PLAN'))['parts'][$idx]['type'])")
    pstart=$(python3 -c "import json;print(json.load(open('$PLAN'))['parts'][$idx]['start'])")
    pend=$(python3 -c "import json;print(json.load(open('$PLAN'))['parts'][$idx]['end'])")
    partfile="$WORK/part_$(printf '%03d' "$idx").mp4"

    if [ "$ptype" = "copy" ]; then
      # input-side seek (fast, keyframe-accurate — start is already snapped to a real
      # keyframe). Time-based -to/-t with -c copy was verified (this implementation) to
      # overshoot by ~2 frames past the intended boundary — ffmpeg's stream-copy path
      # doesn't trim precisely on time. Use an exact frame count instead: this is what
      # caught the video/audio duration-drift bug via the assert below rather than
      # shipping it silently (the exact failure mode the 2nd adversarial-review round
      # flagged -shortest for masking).
      nframes=$(awk "BEGIN{printf \"%d\", int(($pend-$pstart)*$FPS+0.5)}")
      # Two-stage extraction (2026-07-18 real-footage finding): a single-stage deep seek
      # + -frames:v -c copy directly against the multi-GB original was found to silently
      # undercount frames by a whole GOP on ~30% of copy segments in the real 2h12m
      # interview, DETERMINISTICALLY (retrying the identical command reproduced the same
      # shortfall) — yet an isolated repro of the same seek in a fresh process succeeded.
      # Root cause not fully isolated (suspected I/O/page-cache behavior seeking deep into
      # a large file under repeated sequential access), but a two-stage approach reliably
      # avoids it: (a) a generous time-based `-to` copy (allowed to overshoot by a couple
      # frames — the known, harmless -c copy imprecision found earlier) off the ORIGINAL
      # file, producing a small clip; (b) an exact `-frames:v` trim off that SMALL clip,
      # never combining a deep seek with frame-exact copy against the giant source. Verify
      # + retry once as a second line of defense; abort loudly (never silently short) if
      # still wrong — the whole-file duration assert further down is the last resort, not
      # the primary catch (expensive: full concat+mux to discover it that late).
      pend_overshoot=$(awk "BEGIN{printf \"%.3f\", $pend+0.5}")
      ffmpeg -v error -y -nostdin -ss "$pstart" -to "$pend_overshoot" -i "$IN" -map 0:v -an -c copy "$WORK/copy_stage_a_${idx}.mp4" < /dev/null
      ffmpeg -v error -y -nostdin -i "$WORK/copy_stage_a_${idx}.mp4" -map 0:v -an -frames:v "$nframes" -c copy "$partfile" < /dev/null
      actual_nf=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "$partfile")
      if [ "$actual_nf" != "$nframes" ]; then
        echo "  part $idx : copy   : WARNING got ${actual_nf}/${nframes} frames — retrying once" >&2
        ffmpeg -v error -y -nostdin -ss "$pstart" -to "$pend_overshoot" -i "$IN" -map 0:v -an -c copy "$WORK/copy_stage_a_${idx}.mp4" < /dev/null
        ffmpeg -v error -y -nostdin -i "$WORK/copy_stage_a_${idx}.mp4" -map 0:v -an -frames:v "$nframes" -c copy "$partfile" < /dev/null
        actual_nf=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "$partfile")
        [ "$actual_nf" = "$nframes" ] || { echo "ERROR: part $idx copy still short after retry: got ${actual_nf}, wanted ${nframes} frames — aborting rather than shipping a truncated segment" >&2; exit 6; }
      fi
      echo "  part $idx : copy   : ${pstart}s..${pend}s (${nframes} frames)"
    else
      nbeats=$(python3 -c "import json;print(len(json.load(open('$PLAN'))['parts'][$idx]['beats']))")
      declare -a WT WCW WCH WCY
      for ((bi=0;bi<nbeats;bi++)); do
        t_local=$(python3 -c "import json;print(json.load(open('$PLAN'))['parts'][$idx]['beats'][$bi]['t_local'])")
        qtext=$(python3 -c "import json;print(json.load(open('$PLAN'))['parts'][$idx]['beats'][$bi]['text'])")
        render_card "${idx}_${bi}" "$qtext"
        cw=$RENDER_CW; ch=$RENDER_CH
        cy=$(awk "BEGIN{print int($H-$MARGIN-$ch)}")
        awk "BEGIN{exit !($cy >= 0)}" || { echo "ERROR: beat ${idx}_${bi} card (${cw}x${ch}) taller than available frame height" >&2; exit 4; }
        WT[$bi]=$t_local; WCW[$bi]=$cw; WCH[$bi]=$ch; WCY[$bi]=$cy
        echo "  part $idx : window : t_local=${t_local}s : \"${qtext}\""
      done
      wdur=$(awk "BEGIN{printf \"%.3f\", $pend-$pstart}")
      # input-side accurate seek + re-encode (same idiom assemble.sh already uses for
      # its per-segment slices: `-ss <s> -to <e> -i SRC` then re-encode) — ffmpeg resets
      # the first output frame's PTS to 0, so window-local t=0 lines up with the
      # rebase-against-snapped-start math in beat_planner.py (finding #3 fix).
      CARDINPUTS=()
      for ((bi=0;bi<nbeats;bi++)); do CARDINPUTS+=(-loop 1 -t "$wdur" -i "$WORK/card_${idx}_${bi}.png"); done
      FG=""; PREV="0:v"
      for ((bi=0;bi<nbeats;bi++)); do
        t=${WT[$bi]}; cw=${WCW[$bi]}; cy=${WCY[$bi]}
        vend=$(awk "BEGIN{e=$t+$D; m=$wdur-0.05; print (e<m)?e:m}")
        fout=$(awk "BEGIN{f=$vend-$FADE; s=$t+$SL; print (f>s)?f:s}")
        FG+="[$((bi+1)):v]format=yuva420p,fade=t=in:st=${t}:d=0.25:alpha=1,fade=t=out:st=${fout}:d=${FADE}:alpha=1[c${bi}];"
        XEXPR="${MARGIN}-(${cw}+${MARGIN})*(1-min(1\,max(0\,(t-${t})/${SL})))"
        FG+="[${PREV}][c${bi}]overlay=x='${XEXPR}':y=${cy}:enable='between(t,${t},${vend})'[v${bi}];"
        PREV="v${bi}"
      done
      ffmpeg -v error -y -nostdin -ss "$pstart" -to "$pend" -i "$IN" "${CARDINPUTS[@]}" \
        -filter_complex "${FG%;}" -map "[${PREV}]" -an \
        -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 30 "$partfile"
      unset WT WCW WCH WCY
      echo "  part $idx : window : ${pstart}s..${pend}s : ${nbeats} card(s) re-encoded"
    fi
    printf "file '%s'\n" "$partfile" >> "$PARTLIST"
    pi=$((pi+1))
  done < <(seq 0 $((NPARTS-1)))

  echo "[4/6] concatenating ${pi} part(s) (video-only)"
  VIDEO_ONLY="$WORK/video_only.mp4"
  ffmpeg -v error -y -nostdin -f concat -safe 0 -i "$PARTLIST" -c copy "$VIDEO_ONLY"

  # ---- mux the untouched single audio master back in, with a hard duration
  # assert instead of -shortest (2nd-round review fix: -shortest silently
  # truncates on any drift, masking exactly the bug this is meant to catch) ----
  echo "[5/6] muxing audio master (no per-cut audio splicing — single continuous track)"
  vdur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO_ONLY")
  adur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$AUDIO_MASTER")
  awk "BEGIN{d=$vdur-$adur; if(d<0)d=-d; exit !(d<0.034)}" || {
    echo "ERROR: video/audio duration drift ${vdur}s vs ${adur}s exceeds 1 frame — aborting rather than letting -shortest silently truncate" >&2
    exit 5
  }
  ffmpeg -v error -y -nostdin -i "$VIDEO_ONLY" -i "$AUDIO_MASTER" -map 0:v -map 1:a -c:v copy -c:a copy "$OUT"
}

# ---- dispatch ----------------------------------------------------------------
# 2026-07-18: run_windowed is DISABLED (forced to legacy) pending a redesign. Real-
# footage testing (2h12m interview) found frame-exact `-frames:v N -c copy` trimming
# of copy segments is unreliable in the presence of B-frames — not a flake, a category
# error: `-frames:v` counts packets in decode order while B-frames make decode order
# diverge from display order, so no amount of retry/two-stage-extraction fixed it
# (confirmed via 3 independent real-footage failures, root-caused by hand). The
# correct fix (Opus-reviewed, NOT yet implemented): make copy segments keyframe-to-
# keyframe only (no frame-exact trim), and widen the adjacent re-encoded windows to
# absorb the sub-GOP slack via their own already-decoded, genuinely frame-accurate
# re-encode. See docs/decisions.md 2026-07-18 for the full root-cause chain — do not
# re-attempt frame-exact `-c copy` trimming without that redesign.
RUN_WINDOWED_ENABLED=0
if [ "$RUN_WINDOWED_ENABLED" = 1 ] && [ -f "$KEYFRAMES" ] && [ -f "$AUDIO_MASTER" ]; then
  run_windowed
else
  run_legacy_full_reencode
fi

# ---- emit sibling artifacts for downstream stages (brand.sh), regardless of path taken
echo "[6/6] emitting sibling *_keyframes.txt / *_audio.m4a for downstream stages"
ffprobe -v error -select_streams v:0 -show_entries frame=pts_time -skip_frame nokey \
  -of csv=p=0 "$OUT" > "${OUT%.*}_keyframes.txt"
ffmpeg -v error -y -nostdin -i "$OUT" -vn -c:a copy "${OUT%.*}_audio.m4a"

echo "DONE : $OUT"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT" \
  | awk '{printf "final duration: %.1fs\n",$1}'
