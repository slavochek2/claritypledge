#!/usr/bin/env bash
# event-photo-prep.sh — resize and upload an event cover photo once.
#
# Usage:
#   ./scripts/event-photo-prep.sh <slug> <photo-path>          # upload local file (default)
#   ./scripts/event-photo-prep.sh <slug> --unsplash "<query>"  # search Unsplash instead
#
# Idempotent: if the Supabase Storage object for <slug> already exists, downloads
# it back to ~/Downloads/clarity-event-photo.jpg and exits early.
#
# Failure modes:
#   - Missing PROD_SUPABASE_SERVICE_ROLE_KEY in .env.local → exit 1
#   - Missing UNSPLASH_ACCESS_KEY when --unsplash used → exit 1
#   - Supabase upload non-2xx → exit 2 (likely 401: check service role key)
#   - sips not on PATH → exit 3 (macOS-only assumption)
#   - Local photo-path provided but file not found → exit 4
#
# Output (exactly two lines, machine-parseable):
#   LOCAL=~/Downloads/clarity-event-photo.jpg
#   PUBLIC=https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/event-banners/<slug>.jpg

set -euo pipefail

SLUG="${1:-}"
PHOTO_PATH=""
QUERY=""
USE_UNSPLASH=false

if [[ -z "$SLUG" ]]; then
  echo "ERROR: slug required. Usage: $0 <slug> <photo-path> | --unsplash \"<query>\"" >&2
  exit 1
fi

# Parse remaining args: either a local path or --unsplash <query>
shift
if [[ $# -ge 1 && "$1" == "--unsplash" ]]; then
  USE_UNSPLASH=true
  QUERY="${2:-morning running lake park}"
elif [[ $# -ge 1 ]]; then
  PHOTO_PATH="$1"
else
  echo "ERROR: provide a photo path or --unsplash \"<query>\"" >&2
  echo "Usage: $0 <slug> <photo-path> | --unsplash \"<query>\"" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# Source only the two vars we need, tolerantly.
PROD_SUPABASE_SERVICE_ROLE_KEY="$(grep -E '^PROD_SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' || true)"
UNSPLASH_ACCESS_KEY="$(grep -E '^UNSPLASH_ACCESS_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' || true)"

if [[ -z "$PROD_SUPABASE_SERVICE_ROLE_KEY" ]]; then
  echo "ERROR: PROD_SUPABASE_SERVICE_ROLE_KEY not set in $ENV_FILE" >&2
  exit 1
fi

if ! command -v sips >/dev/null 2>&1; then
  echo "ERROR: sips not on PATH (macOS-only). Install or run on macOS." >&2
  exit 3
fi

SUPABASE_REF="besjtuodziykmjidubzw"
BUCKET="event-banners"
OBJECT_PATH="$SLUG.jpg"
PUBLIC_URL="https://$SUPABASE_REF.supabase.co/storage/v1/object/public/$BUCKET/$OBJECT_PATH"
UPLOAD_URL="https://$SUPABASE_REF.supabase.co/storage/v1/object/$BUCKET/$OBJECT_PATH"
LOCAL_PATH="$HOME/Downloads/clarity-event-photo.jpg"

# 1. If object exists, download and skip Unsplash.
HTTP_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -I "$PUBLIC_URL")"

if [[ "$HTTP_STATUS" == "200" ]]; then
  curl -s -o "$LOCAL_PATH" "$PUBLIC_URL"
  echo "LOCAL=$LOCAL_PATH"
  echo "PUBLIC=$PUBLIC_URL"
  exit 0
fi

# 2. Local file or Unsplash.
if [[ "$USE_UNSPLASH" == "true" ]]; then
  if [[ -z "$UNSPLASH_ACCESS_KEY" ]]; then
    echo "ERROR: UNSPLASH_ACCESS_KEY not set in $ENV_FILE" >&2
    exit 1
  fi

  SEARCH_JSON="$(curl -s -G "https://api.unsplash.com/search/photos" \
    --data-urlencode "query=$QUERY" \
    --data-urlencode "orientation=landscape" \
    --data-urlencode "per_page=1" \
    -H "Authorization: Client-ID $UNSPLASH_ACCESS_KEY")"

  PHOTO_URL="$(echo "$SEARCH_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["results"][0]["urls"]["regular"] if d.get("results") else "")')"

  if [[ -z "$PHOTO_URL" ]]; then
    echo "ERROR: Unsplash returned no results for query: $QUERY" >&2
    echo "Response: $SEARCH_JSON" >&2
    exit 1
  fi

  curl -s -o "$LOCAL_PATH" "$PHOTO_URL"
else
  # Local file path
  EXPANDED_PATH="${PHOTO_PATH/#\~/$HOME}"
  if [[ ! -f "$EXPANDED_PATH" ]]; then
    echo "ERROR: photo not found: $EXPANDED_PATH" >&2
    exit 4
  fi
  cp "$EXPANDED_PATH" "$LOCAL_PATH"
fi

# 3. Resize: max edge 1920px, JPEG quality 80.
sips -Z 1920 -s format jpeg --setProperty formatOptions 80 "$LOCAL_PATH" >/dev/null

# 4. Upload to Supabase Storage (upsert).
UPLOAD_STATUS="$(curl -s -o /tmp/event-photo-upload.log -w '%{http_code}' -X POST \
  -H "apikey: $PROD_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $PROD_SUPABASE_SERVICE_ROLE_KEY" \
  -H "x-upsert: true" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@$LOCAL_PATH" \
  "$UPLOAD_URL")"

if [[ "$UPLOAD_STATUS" != "200" && "$UPLOAD_STATUS" != "201" ]]; then
  echo "ERROR: Supabase upload failed (HTTP $UPLOAD_STATUS). Response:" >&2
  cat /tmp/event-photo-upload.log >&2
  exit 2
fi

echo "LOCAL=$LOCAL_PATH"
echo "PUBLIC=$PUBLIC_URL"
