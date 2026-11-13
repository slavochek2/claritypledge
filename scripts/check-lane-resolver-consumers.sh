#!/usr/bin/env bash
# scripts/check-lane-resolver-consumers.sh — P1672: no consumer of the self-hosted TEST target hard-codes it.
#
#   check-lane-resolver-consumers.sh
#
# A consumer that fixes the main lane's origin (136-85-1-126.sslip.io) or its container names
# (supabase-db, supabase-meta, supabase-edge-functions) cannot follow a worktree to its lane: it asks the
# resolver (scripts/selfhosted/lane.py) instead. This greps scripts/, e2e/, src/, supabase/functions/, .github/, vite.config.ts and
# playwright*.config.ts for those literals and FAILS on any file not in the allowlist below. Each allowlist
# entry is a path (a trailing slash means a directory) and the one-line reason the main lane is meant there.
# An entry that no longer matches anything also fails, so the list cannot rot into a blanket permission.
#
# Exit: 0 clean · 1 a hit outside the allowlist, or a stale allowlist entry · 2 could not run.
# Output contract (shell-safety.md): no redirect or pipe tokens in status lines.
set -uo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null)" || { echo "check-lane-resolver-consumers: not in a git checkout" >&2; exit 2; }
cd "$ROOT" || exit 2

PATTERN='136-85-1-126|supabase-db|supabase-meta|supabase-edge-functions'

# path::reason
ALLOW=(
  "scripts/selfhosted/lane.py::the resolver itself: it defines the main lane's constants"
  "scripts/selfhosted/lanes/::lane lifecycle on the VM: provisions a lane by copying the main lane"
  "scripts/selfhosted/deploy-functions.sh::landing-hook invariant: --from-commit, --from-main-tip, --record-landing, --setup, --secrets, --check-secrets always target the main lane explicitly"
  "scripts/selfhosted/migrate.sh::--main-lane fixes the main lane for the landing hook (never the resolver)"
  "scripts/selfhosted/branch-functions-check.sh::main-lane defaults that the resolver's answer overrides for a lane"
  "scripts/selfhosted/health.sh::server health (front door, certificate, disk, main WAL): main-lane explicit, runs with no worktree"
  "scripts/selfhosted/upkeep.sh::main-lane maintenance of the shared stack, never resolver-driven"
  "scripts/selfhosted/vm/cp-health-report.sh::runs on the VM itself and reports the main database's WAL"
  "scripts/selfhosted/flip-test-env.py::records which server is active: describes the main lane by definition"
  "scripts/e2e-load-test.mjs::the load driver measures the main server's containers"
  "e2e/helpers/test-psql.ts::the main-lane branch of selfHostedPsqlCommand, used when no lane is claimed"
  "e2e/p1536-v-round1.spec.ts::asserts the main server on purpose and skips on any other origin"
  "src/tests/integration/p1536-s1-1-atomicity.test.ts::asserts the main server on purpose and skips on any other origin"
  "src/tests/p1608-guard.test.ts::asserts the main lane's origin on purpose"
  "scripts/test-p1173-manifest-stamp-concurrency.sh::mentions the hosted supabase-db-push path in a comment, not the container"
  "src/tests/p1672-test-lane.test.ts::asserts selfHostedPsqlCommand's main-lane default on purpose"
  "scripts/test-p1672-lane-resolve.sh::asserts the resolver's main-lane answer for an unclaimed worktree"
  "scripts/test-p1312-branch-functions-check.sh::hermetic test of the main-lane path"
  "scripts/test-p1584-selfhosted.sh::hermetic test with fixture output from the main lane"
  "scripts/test-p1591-active-test.sh::hermetic test of the main-lane flip state"
  "scripts/test-p1612-deploy-guard.sh::hermetic test of the main-lane deploy guard"
)

# Archived scripts (scripts/archive/) are not run, so they are not consumers; the script itself names the literals.
HITS="$(grep -rIlE "$PATTERN" scripts e2e src supabase/functions .github vite.config.ts playwright.config.ts playwright.*.config.ts 2>/dev/null | grep -v -e '^scripts/check-lane-resolver-consumers.sh$' -e '^scripts/archive/' | LC_ALL=C sort -u)"

allowed_by() { # file -> prints the matching allowlist path, returns 0 when allowed
  local f="$1" e p
  for e in "${ALLOW[@]}"; do
    p="${e%%::*}"
    case "$p" in
      */) case "$f" in "$p"*) echo "$p"; return 0 ;; esac ;;
      *) [ "$f" = "$p" ] && { echo "$p"; return 0; } ;;
    esac
  done
  return 1
}

fail=0; used=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if p="$(allowed_by "$f")"; then used="$used $p "; continue; fi
  fail=1
  echo "HIT outside the allowlist: $f"
  grep -nE "$PATTERN" "$f" | cut -c1-160 | sed 's/^/    /'
done <<< "$HITS"

for e in "${ALLOW[@]}"; do
  p="${e%%::*}"
  case "$used" in *" $p "*) ;; *) fail=1; echo "STALE allowlist entry (matches nothing): $p" ;; esac
done

if [ "$fail" -ne 0 ]; then
  echo "FAILED: ask the resolver (python3 scripts/selfhosted/lane.py resolve --format shell) instead of fixing the main lane, or add an allowlist entry with its reason."
  exit 1
fi
echo "ok: every fixed main-lane origin or container name is in the allowlist ($(printf '%s\n' "$HITS" | grep -c .) files)"
exit 0
