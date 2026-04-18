#!/usr/bin/env bash
# Verify GCS bucket CORS allows a given origin for a PUT preflight.
# Usage: ./scripts/verify-gcs-cors.sh <origin>
# Exit 0 = allowed (Access-Control-Allow-Origin echoed).
# Exit 1 = blocked (header missing) — this is the bug-present state.
set -euo pipefail
ORIGIN="${1:?Usage: $0 <origin>}"
URL="https://storage.googleapis.com/claritypledge-story-images/probe-$(date +%s)"
ACAO="$(curl -sS -i -X OPTIONS "$URL" \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type,x-goog-content-length-range" \
  | awk 'BEGIN{IGNORECASE=1} /^access-control-allow-origin:/ {print $2; exit}' \
  | tr -d '\r')"
if [[ "$ACAO" == "$ORIGIN" ]]; then
  echo "PASS: gs://claritypledge-story-images allows origin $ORIGIN"
  exit 0
else
  echo "FAIL: gs://claritypledge-story-images does NOT allow origin $ORIGIN (got ACAO='$ACAO')"
  exit 1
fi
