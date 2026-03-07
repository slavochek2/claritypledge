#!/bin/bash
# scripts/tests/test_migrate_api_response.sh
#
# Regression test for P417: migrate.sh must NOT treat HTTP 200 + error body as success.
#
# Sources _check_api_success() from migrate.sh. If the function is absent or
# the logic is wrong, tests fail — preventing silent schema drift from creeping back.
#
# Usage: bash scripts/tests/test_migrate_api_response.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATE_SH="$SCRIPT_DIR/../migrate.sh"

# Source only the _check_api_success function from migrate.sh.
# We use a trick: grep out the function definition and eval it.
# This is safe — we only eval the single named function.
if ! grep -q "_check_api_success" "$MIGRATE_SH"; then
  echo "FAIL: _check_api_success() not found in migrate.sh"
  echo "      This function is required to fix P417 (silent schema drift)."
  echo "      See: features/p417_migrate_silent_schema_drift.md"
  exit 1
fi

# Extract and load the function
eval "$(sed -n '/_check_api_success()/,/^}/p' "$MIGRATE_SH")"

PASS=0
FAIL=0

assert_success() {
  local DESC="$1"
  local BODY="$2"
  if _check_api_success "$BODY"; then
    echo "  ✓ $DESC"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: $DESC — expected success but got failure"
    FAIL=$((FAIL + 1))
  fi
}

assert_failure() {
  local DESC="$1"
  local BODY="$2"
  if ! _check_api_success "$BODY"; then
    echo "  ✓ $DESC"
    PASS=$((PASS + 1))
  else
    echo "  ✗ FAIL: $DESC — expected failure but got success"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== P417 regression: migrate.sh API response body validation ==="
echo ""
echo "--- Success cases (DDL returns empty/row array) ---"

assert_success \
  "Empty array [] — standard DDL success" \
  '[]'

assert_success \
  "Array with rows — SELECT-style result" \
  '[{"version":"20250101"},{"version":"20250117"}]'

assert_success \
  "Single-row array" \
  '[{"id":"abc","bio":null}]'

echo ""
echo "--- Failure cases (HTTP 200 + error body — the P417 bug scenario) ---"

assert_failure \
  "SQL syntax error (42601)" \
  '{"message":"syntax error at or near \"ALTEER\"","code":"42601","details":null,"hint":null}'

assert_failure \
  "Column does not exist (42703) — exact P417 failure mode for profiles.bio" \
  '{"code":"42703","details":null,"hint":null,"message":"column profiles.bio does not exist"}'

assert_failure \
  "Permission denied (42501)" \
  '{"message":"permission denied for table profiles","code":"42501","details":null,"hint":null}'

assert_failure \
  "Generic error object with message key" \
  '{"message":"something went wrong"}'

assert_failure \
  "Unparseable / non-JSON body (network error, truncation)" \
  'Internal Server Error'

echo ""
echo "--- Edge cases ---"

assert_success \
  "JSON object without message key (non-error shape)" \
  '{"version":"20250101"}'

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

if [ $FAIL -gt 0 ]; then
  echo "FAIL"
  exit 1
else
  echo "PASS"
  exit 0
fi
