#!/usr/bin/env bash
# Assemble a rough cut: normalize N clips to 1920x1080 / 30fps / h264, concat in order,
# then (optionally) mux a single voice bed over the result.
#
# Usage:
#   scripts/video/assemble-rough.sh <out.mp4> <voice|-> <clip1> <clip2> [clip3 ...]
#     <voice|->  path to an mp3/aiff voice track, or "-" for no audio.
#
# Clips may be mp4 or webm (any codec/size) — each is re-encoded to a common format so
# the concat is glitch-free. This is the rough-cut assembler; the final cut will narrate
# per-segment (kiss-narrate.mjs) instead of laying one continuous bed.
set -euo pipefail

OUT="${1:?out.mp4 required}"; shift
VOICE="${1:?voice path or - required}"; shift
[ "$#" -ge 1 ] || { echo "need at least one clip"; exit 1; }

CLIPS=("$@")
N="${#CLIPS[@]}"

# Build ffmpeg input args + a normalize-and-concat filter graph.
INPUTS=()
FILTER=""
for i in "${!CLIPS[@]}"; do
  INPUTS+=(-i "${CLIPS[$i]}")
  # scale to fit, pad to exact 1920x1080, fix SAR + fps so concat inputs are uniform.
  FILTER+="[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}];"
done
for i in "${!CLIPS[@]}"; do FILTER+="[v${i}]"; done
FILTER+="concat=n=${N}:v=1:a=0[vout]"

if [ "$VOICE" = "-" ]; then
  ffmpeg -y "${INPUTS[@]}" -filter_complex "$FILTER" \
    -map "[vout]" -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 "$OUT"
else
  ffmpeg -y "${INPUTS[@]}" -i "$VOICE" -filter_complex "$FILTER" \
    -map "[vout]" -map "${N}:a" \
    -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 \
    -c:a aac -b:a 192k -shortest "$OUT"
fi

echo "[assemble] wrote $OUT"
ffprobe -v error -show_entries format=duration:stream=width,height,codec_name -of default=noprint_wrappers=1 "$OUT"
