#!/bin/bash
# verify-ml-session.sh - Verify an ML training session is complete and valid
#
# Usage: ./scripts/verify-ml-session.sh SESSION_CODE
#
# Checks:
# 1. Audio chunks exist and start from 000
# 2. events.json exists and has valid structure
# 3. Combined audio is playable (valid WebM header)

set -e

SESSION_CODE=${1:-}
BUCKET="gs://claritypledge-ml-training"

if [ -z "$SESSION_CODE" ]; then
  echo "Usage: ./scripts/verify-ml-session.sh SESSION_CODE"
  echo ""
  echo "Available sessions:"
  gsutil ls "$BUCKET/sessions/" 2>/dev/null | sed 's|.*/sessions/||' | sed 's|/$||'
  exit 1
fi

echo "=== Verifying session: $SESSION_CODE ==="
echo ""

# Check if session exists
if ! gsutil ls "$BUCKET/sessions/$SESSION_CODE/" &>/dev/null; then
  echo "❌ Session not found: $SESSION_CODE"
  exit 1
fi

# List all files
echo "📁 Files in session:"
gsutil ls -la "$BUCKET/sessions/$SESSION_CODE/" 2>/dev/null | grep -v "TOTAL:" | while read size date path; do
  name=$(basename "$path")
  echo "   - $name ($size bytes)"
done
echo ""

# Check for chunk_000 files (critical - contains WebM header)
echo "🔍 Checking audio chunks..."
USERS=$(gsutil ls "$BUCKET/sessions/$SESSION_CODE/" 2>/dev/null | grep "_chunk_" | sed 's/.*\/\([^_]*\)_chunk_.*/\1/' | sort -u)

ALL_VALID=true
for USER in $USERS; do
  CHUNK_000="$BUCKET/sessions/$SESSION_CODE/${USER}_chunk_000.webm"
  if gsutil ls "$CHUNK_000" &>/dev/null; then
    # Check if it has valid WebM header
    HEADER=$(gsutil cat "$CHUNK_000" 2>/dev/null | head -c 4 | xxd -p)
    if [ "$HEADER" = "1a45dfa3" ]; then
      CHUNK_COUNT=$(gsutil ls "$BUCKET/sessions/$SESSION_CODE/${USER}_chunk_*.webm" 2>/dev/null | wc -l | tr -d ' ')
      echo "   ✅ $USER: $CHUNK_COUNT chunks (valid WebM header)"
    else
      echo "   ⚠️  $USER: chunk_000 exists but invalid header"
      ALL_VALID=false
    fi
  else
    echo "   ❌ $USER: Missing chunk_000 (cannot stitch without header)"
    ALL_VALID=false
  fi
done
echo ""

# Check events files (events.json or chunked {user}_events_XXX.json)
echo "📋 Checking events files..."
EVENTS_PATH="$BUCKET/sessions/$SESSION_CODE/events.json"
FOUND_EVENTS=false

# First check for final events.json
if gsutil ls "$EVENTS_PATH" &>/dev/null; then
  EVENTS=$(gsutil cat "$EVENTS_PATH" 2>/dev/null)
  EVENT_COUNT=$(echo "$EVENTS" | jq '.events | length' 2>/dev/null || echo "error")
  DURATION=$(echo "$EVENTS" | jq '.durationMs' 2>/dev/null || echo "error")
  PARTICIPANTS=$(echo "$EVENTS" | jq -r '.participants[].name' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')

  if [ "$EVENT_COUNT" != "error" ]; then
    DURATION_MIN=$(echo "scale=1; $DURATION / 60000" | bc 2>/dev/null || echo "?")
    echo "   ✅ events.json: $EVENT_COUNT events, ${DURATION_MIN}min duration"
    echo "   📝 Participants: $PARTICIPANTS"
    FOUND_EVENTS=true
  else
    echo "   ⚠️  events.json exists but failed to parse"
  fi
fi

# Also check for chunked events files (P28.2 format: {user}_events_XXX.json)
CHUNKED_EVENTS=$(gsutil ls "$BUCKET/sessions/$SESSION_CODE/"*_events_*.json 2>/dev/null || echo "")
if [ -n "$CHUNKED_EVENTS" ]; then
  # Find the highest numbered events file for each user
  for USER in $(echo "$CHUNKED_EVENTS" | sed 's/.*\/\([^_]*\)_events_.*/\1/' | sort -u); do
    LATEST=$(echo "$CHUNKED_EVENTS" | grep "${USER}_events_" | sort -V | tail -1)
    if [ -n "$LATEST" ]; then
      EVENTS=$(gsutil cat "$LATEST" 2>/dev/null)
      EVENT_COUNT=$(echo "$EVENTS" | jq '.events | length' 2>/dev/null || echo "error")
      if [ "$EVENT_COUNT" != "error" ]; then
        FILE_NAME=$(basename "$LATEST")
        echo "   ✅ $FILE_NAME: $EVENT_COUNT events (chunked)"
        FOUND_EVENTS=true
      fi
    fi
  done
fi

if [ "$FOUND_EVENTS" = false ]; then
  echo "   ❌ No events files found (neither events.json nor chunked events)"
  ALL_VALID=false
fi
echo ""

# Summary
echo "=== Summary ==="
if [ "$ALL_VALID" = true ]; then
  echo "✅ Session $SESSION_CODE is VALID and ready for analysis"
  echo ""
  echo "To download and stitch:"
  echo "  ./scripts/stitch-session.sh $SESSION_CODE ~/Desktop/"
else
  echo "⚠️  Session $SESSION_CODE has issues (see above)"
fi
