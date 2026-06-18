#!/usr/bin/env bash
# test-lib-datetime.sh — canary for parse_utc_epoch (scripts/lib-datetime.sh).
#
# Guards the bug that hung push-docs and the privacy hook: a BSD `date -j`
# without `-u` parses an ISO-Z timestamp as LOCAL time, yielding a wrong epoch.
# This test asserts parse_utc_epoch matches a TZ-INDEPENDENT oracle, so it fails
# on any machine where the helper regresses to local-time parsing.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-datetime.sh"

fail=0
check() { # <name> <expected> <actual>
  if [[ "$2" == "$3" ]]; then echo "PASS: $1"; else echo "FAIL: $1 (expected '$2', got '$3')"; fail=1; fi
}

ISO="2026-06-18T10:43:41Z"
# Oracle: calendar.timegm treats the struct as UTC regardless of local TZ.
ORACLE="$(python3 -c "import calendar,time;print(calendar.timegm(time.strptime('$ISO','%Y-%m-%dT%H:%M:%SZ')))")"

# 1. Known UTC string parses to the oracle epoch (catches the −offset bug).
check "UTC parse matches TZ-independent oracle" "$ORACLE" "$(parse_utc_epoch "$ISO")"

# 2. The result must be identical under a deliberately wrong local TZ — proves
#    the parse does NOT depend on the machine's timezone.
check "TZ-invariant (forced TZ=America/Los_Angeles)" "$ORACLE" "$(TZ='America/Los_Angeles' parse_utc_epoch "$ISO")"
check "TZ-invariant (forced TZ=Asia/Tokyo)" "$ORACLE" "$(TZ='Asia/Tokyo' parse_utc_epoch "$ISO")"

# 3. Empty input returns non-zero (callers must not get a silent 0).
if parse_utc_epoch "" >/dev/null 2>&1; then echo "FAIL: empty input should return non-zero"; fail=1; else echo "PASS: empty input returns non-zero"; fi

# 4. Garbage input returns non-zero.
if parse_utc_epoch "not-a-date" >/dev/null 2>&1; then echo "FAIL: garbage input should return non-zero"; fail=1; else echo "PASS: garbage input returns non-zero"; fi

if [[ "$fail" -eq 0 ]]; then echo "PASS: all lib-datetime invariants hold"; exit 0
else echo "FAIL: lib-datetime canary failed"; exit 1; fi
