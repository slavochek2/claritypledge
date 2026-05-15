#!/bin/bash
# scripts/audit-secrets-history.sh — full-history secret scan.
# Pre-commit/pre-push hooks only scan the diff being committed/pushed. This catches
# anything already in git log (which is forever-public for this repo).
#
# Usage:
#   ./scripts/audit-secrets-history.sh          # scan full history, summary to stdout
#   ./scripts/audit-secrets-history.sh --json   # full JSON report at /tmp/cp-gitleaks-history.json
#
# Run monthly, or after any incident where you suspect a leak slipped past hooks.

set -eo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "Not a git repo"; exit 2; }
cd "$REPO_ROOT"

if ! command -v gitleaks &> /dev/null; then
  echo "gitleaks not installed — run: brew install gitleaks"
  exit 2
fi

REPORT="/tmp/cp-gitleaks-history.json"
echo "Scanning full git history (this can take ~10s for ~3000 commits)..."
echo ""

# Don't let pipefail or set -e abort us — we handle the non-zero exit explicitly below.
set +e
gitleaks detect --no-banner --redact --report-format json --report-path "$REPORT" 2>&1 | tail -5
GITLEAKS_RC=${PIPESTATUS[0]}
set -e

if [ "$GITLEAKS_RC" = "0" ]; then
  echo ""
  echo "✓ Clean — no leaks in history."
  rm -f "$REPORT"
  exit 0
fi

# Leaks found — summarize
COUNT=$(jq 'length' "$REPORT" 2>/dev/null || echo "?")
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  $COUNT leak(s) found. Full report: $REPORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "${1:-}" = "--json" ]; then
  cat "$REPORT"
else
  jq -r '.[] | "\(.RuleID) | \(.File) | \(.Commit[0:8]) | \(.Date)"' "$REPORT" | sort -u
  echo ""
  echo "Triage workflow:"
  echo "  1. For each finding, inspect: git show <commit>:<file> | grep -nE '<pattern>'"
  echo "  2. False positive? Add pattern to .gitleaks.toml allowlist."
  echo "  3. Real secret? It is in public history forever — rotate the credential. Do NOT rewrite history."
  echo ""
  echo "Re-run with --json for full structured report."
fi

exit 1
