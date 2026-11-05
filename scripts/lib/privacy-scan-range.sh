#!/bin/bash
# Scan range for the privacy-scan workflow. Prints a range, or SKIP when there is nothing to scan.
# Arguments: event before after pr_base pr_head ref
# Pushes to branches other than main are always scanned against origin/main; main keeps the pushed range.
privacy_scan_range() {
  local event="$1" before="$2" after="$3" pr_base="$4" pr_head="$5" ref="$6"
  local zero=0000000000000000000000000000000000000000
  if [ "$event" = "pull_request" ]; then
    printf '%s..%s\n' "$pr_base" "$pr_head"
    return 0
  fi
  if [ "$after" = "$zero" ]; then
    echo SKIP
    return 0
  fi
  if [ "$ref" = "refs/heads/main" ] && [ "$before" != "$zero" ] \
     && git rev-parse --verify --quiet "${before}^{commit}" >/dev/null 2>&1; then
    printf '%s..%s\n' "$before" "$after"
  else
    printf 'origin/main..%s\n' "$after"
  fi
}
