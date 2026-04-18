#!/bin/bash
# Verifies scripts/audit-privacy.sh catches known patterns and ignores safe ones.
set -e

AUDIT="$(git rev-parse --show-toplevel)/scripts/audit-privacy.sh"
PASS=0
FAIL=0

assert_blocks() {
  local label="$1"
  local content="$2"
  local tmpfile
  tmpfile=$(mktemp)
  echo "$content" > "$tmpfile"
  if "$AUDIT" --msg "$tmpfile" >/dev/null 2>&1; then
    echo "  ✗ $label — expected block, got pass"
    FAIL=$((FAIL+1))
  else
    echo "  ✓ $label — blocked"
    PASS=$((PASS+1))
  fi
  rm -f "$tmpfile"
}

assert_allows() {
  local label="$1"
  local content="$2"
  local tmpfile
  tmpfile=$(mktemp)
  echo "$content" > "$tmpfile"
  if "$AUDIT" --msg "$tmpfile" >/dev/null 2>&1; then
    echo "  ✓ $label — allowed"
    PASS=$((PASS+1))
  else
    echo "  ✗ $label — expected pass, got block"
    FAIL=$((FAIL+1))
  fi
  rm -f "$tmpfile"
}

echo "=== Hard blocks ==="
assert_blocks "bare googlemail" "see slavochek@googlemail.com"
assert_blocks "alias +98723" "fixture: slavochek+98723@googlemail.com"
assert_blocks "slavochek246 username" "recipient slavochek246 logged in"
assert_blocks "Kaka Mukaka literal" "test fixture: Kaka Mukaka"
assert_blocks "absolute path" "see /Users/slavochek/Projects/foo"
assert_blocks "@inguro extra" "contact bob@inguro.com"

echo ""
echo "=== Safe allows ==="
assert_allows "github URL" "repo at github.com/slavochek2/claritypledge"
assert_allows "slava@inguro.com allowed" "mail slava@inguro.com"
assert_allows "synthetic fixture" "receiver: test-recipient@example.com"
assert_allows "slavochek2 bounded (not 246)" "github.com/slavochek2/foo"
assert_allows "empty" ""

echo ""
echo "=== Summary ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"
[ "$FAIL" = "0" ]
