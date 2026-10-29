#!/bin/bash
# scripts/lib/active-test.sh — which TEST server is active (P1591). Sourced, never executed.
#
#   active_test_target        prints "selfhosted" or "hosted" on stdout; return 0.
#                             Anything else (file missing, state unknown, resolver missing or
#                             unreadable): reason on stderr, return 2. FAIL CLOSED: callers must
#                             stop; nothing here ever falls back to hosted.
#   active_test_warn_stale    warns on stderr when this checkout's scripts/migrate.sh differs from
#                             the main checkout's (the P1576 cause); never refuses.
#
# The one source of truth is `flip-test-env.py active`, the flip state of the main checkout's
# .env.test.local. Test seam: CP_ACTIVE_TEST_FILE=<path> reads that file instead (hermetic tests).
#
# Output contract (shell-safety.md): nothing here prints a bare redirect token.

active_test_target() {
  local lib_dir resolver out rc
  lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  resolver="$lib_dir/../selfhosted/flip-test-env.py"
  if [ ! -f "$resolver" ]; then
    echo "active-test: resolver not found ($resolver); cannot tell which TEST server is active." >&2
    return 2
  fi
  if [ -n "${CP_ACTIVE_TEST_FILE:-}" ]; then
    out=$(python3 "$resolver" active --file "$CP_ACTIVE_TEST_FILE") || rc=$?
  else
    out=$(python3 "$resolver" active) || rc=$?
  fi
  rc=${rc:-0}
  if [ "$rc" -ne 0 ]; then
    return 2
  fi
  case "$out" in
    selfhosted|hosted) printf '%s\n' "$out" ;;
    *) echo "active-test: resolver answered '$out'; refusing." >&2; return 2 ;;
  esac
}

active_test_warn_stale() {
  local project_dir="$1" common main_root
  common=$(git -C "$project_dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || return 0
  main_root=$(dirname "$common")
  [ "$main_root" != "$project_dir" ] || return 0
  [ -f "$main_root/scripts/migrate.sh" ] || return 0
  if ! cmp -s "$project_dir/scripts/migrate.sh" "$main_root/scripts/migrate.sh"; then
    echo "WARNING: this checkout's scripts/migrate.sh differs from the main checkout's ($main_root). A stale copy can apply to the wrong TEST server (P1576). Rebase on main, or run the main checkout's script." >&2
  fi
  return 0
}
