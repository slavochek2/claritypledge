#!/usr/bin/env bash
# P807 canary: GCS bucket CORS must echo `x-goog-content-length-range` in
# preflight responses, because `uploadToGCS()` sends that header on every
# browser PUT. A bucket with a glob like `x-goog-*` in its responseHeader
# config silently fails preflight for this specific header (the glob is
# accepted by gsutil but not expanded by the CORS handler).
#
# Exit 0: both buckets echo the header in Access-Control-Allow-Headers.
# Exit 1: at least one bucket is broken (bug present).
#
# Usage: ./scripts/canary-gcs-cors-preflight.sh
#
# Output contract (shell-safety.md): status lines use `:` separators only.
set -euo pipefail

readonly ORIGIN="https://claritypledge.com"
readonly REQUIRED_HEADER="x-goog-content-length-range"
readonly BUCKETS=(
  "claritypledge-ml-training"
  "claritypledge-story-images"
)

fail_count=0

check_bucket() {
  local bucket="$1"
  local probe_url="https://storage.googleapis.com/${bucket}/canary-probe-$(date +%s)"
  local acah
  acah="$(curl -sS -i -X OPTIONS "$probe_url" \
    -H "Origin: ${ORIGIN}" \
    -H "Access-Control-Request-Method: PUT" \
    -H "Access-Control-Request-Headers: ${REQUIRED_HEADER}" \
    | awk 'BEGIN{IGNORECASE=1} /^access-control-allow-headers:/ {sub(/^[^:]+:[[:space:]]*/, ""); print; exit}' \
    | tr -d '\r')"

  if [[ -z "$acah" ]]; then
    echo "FAIL: gs://${bucket} : preflight returned no access-control-allow-headers"
    return 1
  fi

  local lowercased_acah
  lowercased_acah="$(echo "$acah" | tr '[:upper:]' '[:lower:]')"
  if [[ "$lowercased_acah" != *"${REQUIRED_HEADER}"* ]]; then
    echo "FAIL: gs://${bucket} : access-control-allow-headers missing required token"
    echo "  required : ${REQUIRED_HEADER}"
    echo "  got      : ${acah}"
    return 1
  fi

  echo "PASS: gs://${bucket} : access-control-allow-headers echoes ${REQUIRED_HEADER}"
  return 0
}

for bucket in "${BUCKETS[@]}"; do
  if ! check_bucket "$bucket"; then
    fail_count=$((fail_count + 1))
  fi
done

if [[ "$fail_count" -gt 0 ]]; then
  echo ""
  echo "Canary FAILED : ${fail_count} bucket(s) reject the preflight."
  echo "Fix : update the bucket's CORS responseHeader to include ${REQUIRED_HEADER} explicitly."
  echo "      (see features/p807_gcs_cors_preflight_blocks_upload.md)"
  exit 1
fi

echo ""
echo "Canary PASSED : all buckets echo ${REQUIRED_HEADER} in preflight."
exit 0
