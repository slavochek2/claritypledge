#!/usr/bin/env bash
# Hermetic tests for the browser-tool evidence allowlist shared by
# verify-screenshot-before-reedit.py and verify-before-stop.py (epistemic gate 7 —
# exercise a gate's failure path before trusting it). Covers: block with no browser
# tool, pass with each sanctioned prefix (claude-in-chrome, chrome-devtools,
# playwright), and the verify-before-stop curl-in-Bash path.
# Usage: bash scripts/test-browser-evidence-hooks.sh
# Gated by scripts/pre-commit-checks.sh section 4.7e (P1221): runs automatically
# whenever either hook above, or this file, is staged.
# Exit 0 = all pass, non-zero = first failure.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_DIR="$(cd "$SCRIPT_DIR/../.claude/hooks" && pwd)"
REEDIT_HOOK="$HOOKS_DIR/verify-screenshot-before-reedit.py"
STOP_HOOK="$HOOKS_DIR/verify-before-stop.py"

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

PASS=0
FAIL=0

check() {
  local label="$1" expected_exit="$2" actual_exit="$3"
  if [[ "$actual_exit" == "$expected_exit" ]]; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label (expected exit $expected_exit, got $actual_exit)"
    FAIL=$((FAIL + 1))
  fi
}

# Writes JSONL lines to $1 from the remaining args (each arg is one line's JSON).
write_transcript() {
  local file="$1"; shift
  : > "$file"
  for line in "$@"; do
    echo "$line" >> "$file"
  done
}

run_reedit_hook() {
  local transcript="$1"
  echo "{\"tool_input\":{\"file_path\":\"src/app/pages/feed-page.tsx\"},\"transcript_path\":\"$transcript\"}" \
    | python3 "$REEDIT_HOOK" >/dev/null 2>&1
}

run_stop_hook() {
  local transcript="$1"
  echo "{\"transcript_path\":\"$transcript\",\"stop_hook_active\":false}" \
    | python3 "$STOP_HOOK" >/dev/null 2>&1
}

echo "=== Browser evidence allowlist tests ==="
echo ""

# ── verify-screenshot-before-reedit.py ───────────────────────────────────────

echo "[reedit] complaint, no browser tool since -> BLOCK"
T="$TMP/reedit-block.jsonl"
write_transcript "$T" \
  '{"type":"user","message":{"content":"I still don'"'"'t see it"}}'
actual=0; run_reedit_hook "$T" || actual=$?
check "reedit: block with no evidence tool" 2 "$actual"

for prefix in "mcp__claude-in-chrome__navigate" "mcp__chrome-devtools__take_screenshot" "mcp__playwright__browser_navigate"; do
  echo "[reedit] complaint, then $prefix -> PASS"
  T="$TMP/reedit-pass-$prefix.jsonl"
  write_transcript "$T" \
    '{"type":"user","message":{"content":"I still don'"'"'t see it"}}' \
    "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"tool_use\",\"name\":\"$prefix\",\"input\":{}}]}}"
  actual=0; run_reedit_hook "$T" || actual=$?
  check "reedit: pass with $prefix" 0 "$actual"
done

echo "[reedit] no complaint at all -> PASS (nothing flagged)"
T="$TMP/reedit-no-complaint.jsonl"
write_transcript "$T" \
  '{"type":"user","message":{"content":"looks great, ship it"}}'
actual=0; run_reedit_hook "$T" || actual=$?
check "reedit: pass with no complaint" 0 "$actual"

# ── verify-before-stop.py ─────────────────────────────────────────────────────

echo "[stop] Edit then completion claim, no verification -> BLOCK"
T="$TMP/stop-block.jsonl"
write_transcript "$T" \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{}}]}}' \
  '{"type":"assistant","message":{"content":"It'"'"'s live now"}}'
actual=0; run_stop_hook "$T" || actual=$?
check "stop: block with no verification" 2 "$actual"

for prefix in "mcp__claude-in-chrome__navigate" "mcp__chrome-devtools__take_screenshot" "mcp__playwright__browser_navigate"; do
  echo "[stop] Edit, then $prefix, then completion claim -> PASS"
  T="$TMP/stop-pass-$prefix.jsonl"
  write_transcript "$T" \
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{}}]}}' \
    "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"tool_use\",\"name\":\"$prefix\",\"input\":{}}]}}" \
    '{"type":"assistant","message":{"content":"It'"'"'s live now"}}'
  actual=0; run_stop_hook "$T" || actual=$?
  check "stop: pass with $prefix" 0 "$actual"
done

echo "[stop] Edit, then curl in Bash, then completion claim -> PASS"
T="$TMP/stop-pass-curl.jsonl"
write_transcript "$T" \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{}}]}}' \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"curl -sf https://claritypledge.com/feed"}}]}}' \
  '{"type":"assistant","message":{"content":"It'"'"'s live now"}}'
actual=0; run_stop_hook "$T" || actual=$?
check "stop: pass with curl verification" 0 "$actual"

echo "[stop] no completion-claim language -> PASS (nothing flagged)"
T="$TMP/stop-no-claim.jsonl"
write_transcript "$T" \
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{}}]}}' \
  '{"type":"assistant","message":{"content":"Applied the fix, still need to test it."}}'
actual=0; run_stop_hook "$T" || actual=$?
check "stop: pass with no completion claim" 0 "$actual"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
(( FAIL == 0 )) && exit 0 || exit 1
