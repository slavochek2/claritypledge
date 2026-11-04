#!/bin/bash
# scripts/selfhosted/lib/deploy-on-land.sh — bring the shared TEST server forward when a change to
# deployed edge-function inputs lands on main (P1612). Sourced by scripts/git-ops.sh, never run.
#
#   deploy_test_on_land <repo> <before-sha> <after-sha>
#
# Deploys main's tip (read under the TEST deploy lock, after waiting for a running deploy) from a
# `git archive` copy, never a working tree, so an uncommitted edit in the caller's checkout or a
# co-tenant's cannot ride along, and a burst of landings ends on the newest. Always returns 0:
# a failed deploy is printed loudly but the landing it follows is already done and stays. The
# durable record is the drift check (deploy-drift.sh, shown by /day); re-running a deploy is safe.
# Output contract (shell-safety.md): no redirect or pipe tokens in status lines.

# shellcheck source=deploy-guard.sh
source "$(dirname "${BASH_SOURCE[0]}")/deploy-guard.sh"

DEPLOY_ON_LAND_PATHS=(supabase/functions supabase/selfhosted/functions-main/index.ts supabase/no-verify-jwt-functions.txt)

# deploy_land_baseline <repo> <journal-start-head>: where a ship's "before" is measured from. The
# journal's start_head when it is a real commit that main still contains (so a resumed ship keeps
# the baseline from before its first pick); otherwise main's tip now.
deploy_land_baseline() {
  local repo="$1" start="${2:-}"
  if [ -n "$start" ] && git -C "$repo" rev-parse -q --verify "$start^{commit}" >/dev/null 2>&1 &&
     git -C "$repo" merge-base --is-ancestor "$start" HEAD 2>/dev/null; then
    git -C "$repo" rev-parse "$start^{commit}"
  else
    git -C "$repo" rev-parse HEAD
  fi
}

deploy_test_on_land() {
  local repo="$1" before="$2" after="$3" changed rc=0 target wait="${CP_LAND_LOCK_WAIT:-300}"
  changed="$(git -C "$repo" diff --name-only "$before" "$after" -- "${DEPLOY_ON_LAND_PATHS[@]}" 2>/dev/null)" || {
    echo "TEST functions: could not diff ${before:0:9}..${after:0:9}; not deploying. Run scripts/deploy-functions.sh by hand if functions changed." >&2
    return 0
  }
  changed="$(printf '%s\n' "$changed" | dg_filter_deployed_repo_paths)"
  [ -n "$changed" ] || return 0
  echo "TEST functions: this landing changed deployed edge-function inputs; deploying main's tip to the self-hosted TEST server." >&2
  # Fail closed: the deploy goes out only when the active TEST server is positively self-hosted.
  # A resolver that cannot be loaded, fails, or answers anything else skips the deploy.
  # shellcheck source=../../lib/active-test.sh
  if ! source "$repo/scripts/lib/active-test.sh" 2>/dev/null || ! type active_test_target >/dev/null 2>&1; then
    echo "TEST functions: cannot load the active-TEST resolver (scripts/lib/active-test.sh): not deploying, because the target is unknown. Deploy by hand when needed." >&2
    return 0
  fi
  target="$(active_test_target 2>/dev/null)" || target=""
  if [ "$target" != selfhosted ]; then
    echo "TEST functions: active TEST server is '${target:-unknown}', not self-hosted: not deploying. Deploy by hand when needed." >&2
    return 0
  fi
  # The deploy script waits for the lock (a running deploy may be a branch test), then deploys
  # main's tip as read under the lock, so a burst of landings ends on the newest one. The files come
  # from `git archive`, never a working tree.
  ( cd "$repo" && "$repo/scripts/selfhosted/deploy-functions.sh" --from-main-tip --lock-wait "$wait" ) >&2 || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "TEST functions: DEPLOY FAILED (exit $rc) after landing ${after:0:9}. The landing stands and is NOT undone. TEST may be serving older functions: re-run scripts/deploy-functions.sh from main; /day shows the drift." >&2
  else
    echo "TEST functions: deployed main's tip after landing ${after:0:9}." >&2
  fi
  return 0
}
