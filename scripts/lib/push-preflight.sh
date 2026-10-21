#!/usr/bin/env bash
# push-preflight.sh — P1526: prove the push credential can WRITE before a push window is spent.
#
# Incident (2026-10-20): the staging push failed with 403 for ~24 minutes because the push
# credential had Contents read-only. The only credential check in push-docs (`gh auth status`)
# ran AFTER that push and proves login, not write access.
#
# push_write_preflight <repo_root> <sha> [remote]
#   Dry-runs a push of <sha> to a throwaway refs/heads/staging/preflight-* ref. A dry run
#   authenticates against the remote and reads its ref advertisement, but creates NO ref.
#   Returns 0 when the push would be accepted by transport, 1 otherwise (message on stderr).
#
# Why the dry-run disables hooks (core.hooksPath=/dev/null): git runs the local pre-push hook for
# --dry-run too. The hook is minutes of checks that the REAL staging push runs anyway; running it
# twice would double the cost and print its refusals twice. Hooks are NOT bypassed for the real
# push, which this function never performs.
#
# Test seam: PUSH_PREFLIGHT_GIT overrides the git executable (scripts/test-p1526-*.sh).
# Credentials are never printed: URL userinfo is masked in the echoed git error.
push_write_preflight() {
  local repo_root="$1" sha="$2" remote="${3:-origin}"
  local git_bin="${PUSH_PREFLIGHT_GIT:-git}"
  local ref="staging/preflight-${sha:0:9}-$$"
  local out rc
  out="$(GIT_TERMINAL_PROMPT=0 "$git_bin" -C "$repo_root" -c core.hooksPath=/dev/null \
          push --dry-run "$remote" "${sha}:refs/heads/${ref}" 2>&1)"
  rc=$?
  if (( rc == 0 )); then
    return 0
  fi
  out="$(printf '%s\n' "$out" | sed -E 's#(://)[^/@[:space:]]+@#\1***@#g')"
  {
    echo ""
    echo "  ❌ push preflight failed (exit ${rc}): the push credential cannot write to ${remote}."
    echo "     Likely cause: the credential lacks Contents write (or is expired / not wired into git)."
    echo "     Fix the push credential row in .private/docs/accounts.md, then re-run."
    echo "     Raw git error:"
    printf '%s\n' "$out" | sed 's/^/       /'
  } >&2
  return 1
}
