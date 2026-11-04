#!/bin/bash
# scripts/selfhosted/lib/land-job.sh — the detached half of a landing's TEST-functions deploy (P1612).
# Started by deploy-on-land.sh, from a `git archive` copy of main's tip, in its own session with its
# output going to the landing log. Never run by hand.
#
#   land-job.sh <extract-dir> <repo> <landed-sha> <lock-wait-s> <deadline-s>
#
# Runs the archived deploy-functions.sh in --from-main-tip mode under a hard deadline. On failure it
# writes the one-line failure record deploy-drift.sh (and so /day) reports, until a later deploy of
# main succeeds. Output: no redirect or pipe tokens in status lines (shell-safety.md).
set -u
tmp="$1"; repo="$2"; landed="$3"; wait_s="$4"; deadline="$5"
# shellcheck source=deploy-guard.sh
source "$tmp/scripts/selfhosted/lib/deploy-guard.sh"
failed="$(dg_land_failed_file "$repo")"
log="${failed%.failed}.log"
trap 'rm -rf "$tmp"' EXIT

echo "LAND-JOB-START $(date -u +%Y-%m-%dT%H:%M:%SZ) landed=${landed:0:9}"
rc=0
( cd "$repo" && dg_deadline "$deadline" "$tmp/scripts/selfhosted/deploy-functions.sh" \
    --from-main-tip --lock-wait "$wait_s" --clear-dead-lock ) || rc=$?
if [ "$rc" -eq 0 ]; then
  rm -f "$failed"
  echo "TEST functions: deployed main's tip after landing ${landed:0:9}."
else
  why="exit $rc"; [ "$rc" -ne 124 ] || why="timed out after ${deadline}s"
  printf '%s\t%s\t%s\t%s\n' "$(date +%s)" "$landed" "$rc" "$log" > "$failed"
  echo "TEST functions: DEPLOY FAILED ($why) after landing ${landed:0:9}. The landing stands and is NOT undone. TEST may be serving older functions: re-run scripts/deploy-functions.sh from main; scripts/selfhosted/deploy-drift.sh (and /day) report it until a deploy of main succeeds."
fi
echo "LAND-JOB-END exit=$rc"
exit 0
