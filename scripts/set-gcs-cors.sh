#!/usr/bin/env bash
# Apply CORS configuration to the claritypledge-story-images GCS bucket.
# Affects both test and prod (same bucket). Adds localhost dev ports 5001,5100-5700.
# Usage: ./scripts/set-gcs-cors.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gsutil cors set "$SCRIPT_DIR/gcs-cors.json" gs://claritypledge-story-images
echo "CORS config applied. Verify with:"
echo "  ./scripts/verify-gcs-cors.sh http://localhost:5400"
