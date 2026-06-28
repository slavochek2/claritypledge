#!/usr/bin/env bash
# KISS test — Stage 3: mux voice over the captured UI with one cinematic zoom punch-in.
# Produces a single playable final.mp4. Usage: scripts/video/kiss-compose.sh <dir>
set -euo pipefail

DIR="${1:-tmp/video-kiss}"
WEBM="$(ls "$DIR"/*.webm | head -1)"
# Prefer the ElevenLabs mp3; fall back to the macOS `say` placeholder.
if [ -f "$DIR/voice.mp3" ]; then VOICE="$DIR/voice.mp3"; else VOICE="$DIR/voice.aiff"; fi
OUT="$DIR/final.mp4"

# Match output length to the narration (+1s tail) so we don't dangle on silence.
VOICE_DUR="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$VOICE")"
DUR="$(echo "$VOICE_DUR + 1" | bc)"

# Gentle Ken-Burns punch-in (1.0x → ~1.04x) so page edges stay visible — a
# walkthrough must show the whole UI, not crop it. Output 1080p.
ffmpeg -y \
  -i "$WEBM" \
  -i "$VOICE" \
  -filter_complex "[0:v]fps=30,scale=3840:-1,zoompan=z='min(zoom+0.0003,1.04)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30,trim=duration=${DUR},setpts=PTS-STARTPTS[v]" \
  -map "[v]" -map 1:a \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 \
  -c:a aac -b:a 192k \
  -shortest \
  "$OUT"

echo "[compose] wrote $OUT"
ffprobe -v error -show_entries format=duration:stream=width,height,codec_name -of default=noprint_wrappers=1 "$OUT"
