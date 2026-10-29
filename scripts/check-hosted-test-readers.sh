#!/bin/bash
# scripts/check-hosted-test-readers.sh — P1591 guard: no NEW code may reach the hosted TEST project.
#
# Fails when a file in scope (scripts/, e2e/, src/tests/, playwright.config.ts) that is NOT in
# scripts/hosted-test-readers.allowlist contains the hosted TEST project ref or reads
# the hosted-TEST variable families (see PATTERN below). New code resolves the active TEST via
# scripts/lib/active-test.sh instead. Existing readers are allowlisted, not fixed here.
#
#   check-hosted-test-readers.sh [--root DIR] [--allowlist FILE]
#   Exit 0 clean · 1 a new reader found (files listed) · 2 usage/unreadable
#
# The patterns are assembled from fragments so this file does not match itself. Output contract
# (shell-safety.md): no bare redirect tokens.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
ALLOW="$HERE/hosted-test-readers.allowlist"
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="${2:-}"; shift 2 ;;
    --allowlist) ALLOW="${2:-}"; shift 2 ;;
    *) echo "check-hosted-test-readers: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
[ -d "$ROOT" ] || { echo "check-hosted-test-readers: no such root: $ROOT" >&2; exit 2; }
[ -r "$ALLOW" ] || { echo "check-hosted-test-readers: cannot read allowlist $ALLOW" >&2; exit 2; }
PATTERN='ayibkeoyukulb''sjpxgaw|TEST_SUPABASE''_|(^|[^A-Za-z0-9_])HOSTED''_TEST_'

cd "$ROOT" || exit 2
if git rev-parse --show-toplevel >/dev/null 2>&1 && [ "$(git rev-parse --show-toplevel)" = "$(pwd -P)" ]; then
  FILES=$(git ls-files -co --exclude-standard -- scripts e2e src/tests playwright.config.ts)
else
  FILES=$(find scripts e2e src/tests playwright.config.ts -type f 2>/dev/null | sed 's|^\./||')
fi
HITS=""
while IFS= read -r f; do
  [ -f "$f" ] || continue
  grep -qE "$PATTERN" "$f" 2>/dev/null && HITS="${HITS}${f}"$'\n'
done <<< "$FILES"
NEW=$(printf '%s' "$HITS" | grep -v '^$' | sort -u | grep -vxFf <(grep -v '^[[:space:]]*#' "$ALLOW" | grep -v '^[[:space:]]*$') || true)
if [ -n "$NEW" ]; then
  echo "check-hosted-test-readers: FAIL. New file(s) reach the hosted TEST project directly:" >&2
  printf '%s\n' "$NEW" | sed 's/^/  - /' >&2
  echo "  Resolve the active TEST via scripts/lib/active-test.sh (P1591); do not hard-code hosted TEST." >&2
  exit 1
fi
echo "check-hosted-test-readers: OK ($(printf '%s' "$HITS" | grep -c . ) allowlisted reader(s))."
exit 0
