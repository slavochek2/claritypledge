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
  local repo="$1" before="$2" after="$3" changed target wait="${CP_LAND_LOCK_WAIT:-300}"
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
  # Detach. A landing must never wait for a deploy (a hung tunnel, a long lock wait and a 24-function
  # probe add up to many minutes): the deploy runs in its own session, outlives this command, writes
  # to a log in the git common dir, and leaves a failure record the drift check reports.
  # The script that runs is taken from `git archive` of main's tip, not from this working tree, so
  # a co-tenant's uncommitted edit or a switched branch cannot change what runs.
  local common log tip tmp
  common="$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || common=""
  tip="$(git -C "$repo" rev-parse --verify -q 'refs/heads/main^{commit}' 2>/dev/null)" || tip=""
  if [ -z "$common" ] || [ -z "$tip" ]; then
    echo "TEST functions: cannot read main or the git dir; not deploying. Run scripts/deploy-functions.sh by hand." >&2
    return 0
  fi
  log="$common/cp-test-deploy-land.log"
  [ "$(wc -c < "$log" 2>/dev/null || echo 0)" -gt 200000 ] && : > "$log"
  tmp="$(mktemp -d)" || { echo "TEST functions: cannot make a temp dir; not deploying. Run scripts/deploy-functions.sh by hand." >&2; return 0; }
  if ! git -C "$repo" archive "$tip" -- scripts/selfhosted | tar -x -C "$tmp" 2>/dev/null || [ ! -x "$tmp/scripts/selfhosted/lib/land-job.sh" ]; then
    echo "TEST functions: main's tip has no landing deploy job (scripts/selfhosted/lib/land-job.sh); not deploying. Run scripts/deploy-functions.sh by hand." >&2
    rm -rf "$tmp"; return 0
  fi
  # perl: fork, the parent exits at once, the child starts a new session with stdin closed and
  # stdout/stderr on the log, so the job survives this command and its terminal.
  if ! perl -e '
      use POSIX qw(setsid);
      my ($log, @cmd) = @ARGV;
      defined(my $pid = fork) or exit 1;
      exit 0 if $pid;
      setsid();
      open(STDIN, "<", "/dev/null"); open(STDOUT, ">>", $log) or exit 1; open(STDERR, ">&", \*STDOUT);
      exec @cmd; exit 127;
    ' "$log" bash "$tmp/scripts/selfhosted/lib/land-job.sh" "$tmp" "$repo" "$after" "$wait" "${CP_LAND_JOB_DEADLINE:-1200}"; then
    echo "TEST functions: could not start the background deploy; run scripts/deploy-functions.sh by hand." >&2
    rm -rf "$tmp"; return 0
  fi
  echo "TEST functions: deploy of main's tip started in the background (log: $log). Check scripts/selfhosted/deploy-drift.sh afterwards." >&2
  return 0
}
