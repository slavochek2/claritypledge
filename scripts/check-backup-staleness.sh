#!/usr/bin/env bash
# Asserts the newest prod DB backup has a matching .verified marker (P991 step 8)
# and is less than 25 hours old. Exits non-zero on any failure — the caller
# (backup-staleness.yml) treats non-zero as "open/append a GitHub issue", zero
# as "healthy, auto-close any open issue". This script never mutates the
# bucket — read-only (list + get), matching db-backup-writer's create+get+list
# scope.
set -o pipefail

BUCKET="claritypledge-db-backups"
THRESHOLD_SECONDS=$((25 * 3600))

# Newest by NAME, not by GCS listing order — object names are
# prod-backup-YYYYMMDD-HHMMSS.sql.gz, which sorts lexically == chronologically.
NEWEST=$(gcloud storage ls "gs://${BUCKET}/prod-backup-*.sql.gz" 2>/dev/null | sort | tail -n 1)
if [[ -z "${NEWEST}" ]]; then
  echo "ERROR: no backup objects found in gs://${BUCKET}/"
  exit 1
fi
echo "Newest backup object: ${NEWEST}"

MARKER="${NEWEST}.verified"
echo "Checking marker: ${MARKER}"

# A missing marker means either the object predates marker-writing (P991 step
# 8) or pg_dump died mid-stream and the object was finalized without ever
# reaching the marker write (the poison case this check exists to catch).
# Either way: treat as stale, never as healthy.
if ! MARKER_CONTENT=$(gcloud storage cat "${MARKER}" 2>/dev/null); then
  echo "ERROR: no .verified marker for newest backup (${NEWEST}) — unverified or poisoned object"
  exit 1
fi

VERIFIED_AT=$(printf '%s\n' "${MARKER_CONTENT}" | awk -F= '/^verified_at=/{print $2; exit}')
if [[ -z "${VERIFIED_AT}" ]]; then
  echo "ERROR: marker ${MARKER} has no verified_at field — malformed"
  exit 1
fi

# python3, not `date -u -d`: the latter is GNU-only (ubuntu-latest has it,
# but BSD date on macOS doesn't) — python3 parses portably wherever this
# script runs, including fixture testing outside CI.
VERIFIED_EPOCH=$(python3 -c "
import sys, datetime
try:
    dt = datetime.datetime.strptime(sys.argv[1], '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc)
    print(int(dt.timestamp()))
except ValueError:
    sys.exit(1)
" "${VERIFIED_AT}" 2>/dev/null)
if [[ -z "${VERIFIED_EPOCH}" ]]; then
  echo "ERROR: could not parse verified_at timestamp: ${VERIFIED_AT}"
  exit 1
fi

NOW_EPOCH=$(date -u +%s)
AGE=$((NOW_EPOCH - VERIFIED_EPOCH))
echo "Marker verified_at: ${VERIFIED_AT} (age: ${AGE}s)"

if [[ "${AGE}" -gt "${THRESHOLD_SECONDS}" ]]; then
  echo "ERROR: newest verified backup is stale — ${AGE}s old (threshold ${THRESHOLD_SECONDS}s / 25h)"
  exit 1
fi

echo "OK: newest backup (${NEWEST}) verified ${AGE}s ago — within the 25h threshold"
exit 0
