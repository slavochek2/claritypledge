#!/bin/bash
# scripts/selfhosted/lib/land-job.sh — the detached half of a landing's TEST update (P1612, P1672).
# Started by deploy-on-land.sh, from a `git archive` copy of main's tip, in its own session with its
# output going to the landing log. Never run by hand.
#
#   land-job.sh <extract-dir> <repo> <landed-sha> <lock-wait-s> <deadline-s> [fn-changed] [mig-changed]
#
# 1. Migrations (P1672), when the landing added or changed any, or when an older caller did not say:
#    under the TEST deploy lock, main's tip is read and its supabase/migrations + scripts are archived,
#    then the archived migrate.sh applies them to the MAIN lane by name (--main-lane: never through the
#    per-worktree resolver). A failure writes cp-test-migrate-land.failed, independent of the functions
#    record, so a function deploy that succeeds in the same landing cannot hide it; a later success clears it.
# 2. Functions, when the landing changed them (default when an older caller did not say): the archived
#    deploy-functions.sh in --from-main-tip mode under a hard deadline. On failure it writes the one-line
#    record deploy-drift.sh (and so /day) reports, until a later deploy of main succeeds.
# Output: no redirect or pipe tokens in status lines (shell-safety.md).
set -u
tmp="$1"; repo="$2"; landed="$3"; wait_s="$4"; deadline="$5"; fn_changed="${6:-1}"; mig_changed="${7:-1}"
# shellcheck source=deploy-guard.sh
source "$tmp/scripts/selfhosted/lib/deploy-guard.sh"
failed="$(dg_land_failed_file "$repo")"
log="${failed%.failed}.log"
mig_failed="${failed%/*}/cp-test-migrate-land.failed"
mig_tmp=""
trap 'rm -rf "$tmp" ${mig_tmp:+"$mig_tmp"}' EXIT

echo "LAND-JOB-START $(date -u +%Y-%m-%dT%H:%M:%SZ) landed=${landed:0:9} functions=$fn_changed migrations=$mig_changed"
start="$(date +%s)"

record_mig_failure() { # exit-code why
  printf '%s\t%s\t%s\t%s\n' "$(date +%s)" "$landed" "$1" "$log" > "$mig_failed"
  echo "TEST migrations: MIGRATION FAILED ($2) after landing ${landed:0:9}. The landing stands and is NOT undone. The TEST main lane is behind main's schema: re-run the main checkout's scripts/selfhosted/migrate.sh --env selfhosted --main-lane; scripts/selfhosted/deploy-drift.sh (and /day) report it until a landing's migration succeeds."
}

mig_rc=0
if [ "$mig_changed" = 1 ]; then
  if ! dg_lock_acquire "$repo" "$wait_s" 1; then
    mig_rc=75
    record_mig_failure "$mig_rc" "could not take the TEST deploy lock within ${wait_s}s"
  else
    mig_tmp="$(mktemp -d)"
    tip="$(git -C "$repo" rev-parse --verify -q "$DG_MAIN_REF^{commit}" 2>/dev/null)" || tip=""
    if [ -z "$tip" ] || ! git -C "$repo" archive "$tip" -- scripts/selfhosted scripts/lib supabase/migrations | tar -x -C "$mig_tmp" 2>/dev/null \
       || [ ! -x "$mig_tmp/scripts/selfhosted/migrate.sh" ]; then
      mig_rc=66
      record_mig_failure "$mig_rc" "could not extract main's tip"
    else
      ( cd "$mig_tmp" && dg_deadline "$deadline" "$mig_tmp/scripts/selfhosted/migrate.sh" --env selfhosted --main-lane ) || mig_rc=$?
      if [ "$mig_rc" -eq 0 ]; then
        rm -f "$mig_failed"
        echo "TEST migrations: every migration version in main's tip ${tip:0:9} is applied to the main lane after landing ${landed:0:9}. A file edited after its version was applied is NOT re-run (migrations are versioned, not diffed)."
      else
        why="exit $mig_rc"; [ "$mig_rc" -ne 124 ] || why="timed out after ${deadline}s"
        record_mig_failure "$mig_rc" "$why"
      fi
    fi
    dg_lock_release
  fi
fi

rc=0
if [ "$fn_changed" = 1 ]; then
  # The deploy script writes (failure) or clears (success) the landing record itself while it still
  # holds the deploy lock, so results cannot race. If it was killed before it could (SIGKILL, the
  # deadline), this job writes the failure record as a fallback.
  ( cd "$repo" && dg_deadline "$deadline" "$tmp/scripts/selfhosted/deploy-functions.sh" \
      --from-main-tip --lock-wait "$wait_s" --clear-dead-lock --record-landing "$landed" ) || rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "TEST functions: deployed main's tip after landing ${landed:0:9}."
  else
    why="exit $rc"; [ "$rc" -ne 124 ] || why="timed out after ${deadline}s"
    recorded="$(cut -f1 "$failed" 2>/dev/null || true)"
    if [ -z "$recorded" ] || [ "$recorded" -lt "$start" ]; then
      printf '%s\t%s\t%s\t%s\n' "$(date +%s)" "$landed" "$rc" "$log" > "$failed"
    fi
    echo "TEST functions: DEPLOY FAILED ($why) after landing ${landed:0:9}. The landing stands and is NOT undone. TEST may be serving older functions: re-run scripts/deploy-functions.sh from main; scripts/selfhosted/deploy-drift.sh (and /day) report it until a deploy of main succeeds."
  fi
fi
echo "LAND-JOB-END exit=$rc migrate-exit=$mig_rc"
exit 0
