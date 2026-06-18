#!/usr/bin/env bash
# lib-datetime.sh — shared date/time helpers, sourced (never executed).
#
# WHY THIS EXISTS: parsing an ISO-8601 "Z" (UTC) timestamp with BSD `date -j`
# WITHOUT `-u` silently interprets it as LOCAL time, producing a wrong epoch
# offset by the machine's UTC offset (e.g. −7h in PDT). This bug has bitten
# this repo twice (privacy-hook stamp staleness, 2026-06-12; push-docs CI-poll
# staleness, 2026-06-18) — both as latent "everything looks stale forever"
# hangs. Route EVERY ISO-Z parse through parse_utc_epoch so the `-u` and the
# GNU fallback live in exactly one reviewed place.
#
# Proven by: scripts/test-lib-datetime.sh (asserts a known UTC string parses to
# the TZ-independent oracle epoch; would fail if `-u` were dropped).

# parse_utc_epoch <iso8601-Z> — echo the Unix epoch (UTC) for an ISO timestamp
# like "2026-06-18T10:43:41Z". Returns non-zero (and echoes nothing) on empty
# or unparseable input — callers decide the fallback (do NOT silently treat a
# parse failure as epoch 0 unless that is intended).
#
# Portable across BSD (macOS) and GNU (Linux/CI) `date`.
parse_utc_epoch() {
  local iso="$1"
  [[ -n "$iso" ]] || return 1
  # BSD: -u is load-bearing (interprets the input as UTC, not local).
  date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s 2>/dev/null && return 0
  # GNU fallback.
  date -u -d "$iso" +%s 2>/dev/null && return 0
  return 1
}
