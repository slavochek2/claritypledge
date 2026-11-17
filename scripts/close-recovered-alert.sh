#!/usr/bin/env bash
# P1697: close a smoke gate's open alert issue(s) once the gate passes again.
#
# Usage: close-recovered-alert.sh "<exact issue title>"
# Env (set by the workflow): GH_TOKEN, EVENT_NAME, GIT_REF, INPUT_URL, RUN_URL
#
# Eligibility (spec P1697 Invariants): only a scheduled run, or a manual run on main against the
# default prod URL, may close a prod alert. Exact string match, never a prefix: `startsWith` would
# accept a lookalike host (decisions 2026-10, P1567 defect list).
#
# Match: exact title AND the Actions bot as author, same as the open step (P1155). The author is
# filtered server-side, so no page limit across all authors can hide the alert; `gh` takes the
# REST spelling (`github-actions[bot]`) for the filter while its JSON reports `app/github-actions`
# (both measured 2026-11-17), so the jq check stays as defense in depth.
#
# Every matching issue is closed, not only the first. A gh failure exits non-zero on purpose:
# a red run means "the alerting itself broke" (decisions 2026-07, alert-only pattern).
set -euo pipefail

TITLE="${1:?usage: close-recovered-alert.sh <exact issue title>}"
PROD_URL="https://claritypledge.com"

eligible() {
  case "${EVENT_NAME:-}" in
    schedule) return 0 ;;
    workflow_dispatch)
      [ "${GIT_REF:-}" = "refs/heads/main" ] || return 1
      case "${INPUT_URL:-}" in
        "" | "$PROD_URL" | "$PROD_URL/") return 0 ;;
        *) return 1 ;;
      esac ;;
    *) return 1 ;;
  esac
}

if ! eligible; then
  echo "not eligible to close (event=${EVENT_NAME:-} ref=${GIT_REF:-} url=${INPUT_URL:-}); leaving alerts as they are"
  exit 0
fi

json=$(gh issue list --state open --author "github-actions[bot]" --limit 1000 --json number,title,author)
numbers=$(jq -r --arg t "$TITLE" '.[] | select(.title==$t and .author.login=="app/github-actions") | .number' <<<"$json")

if [ -z "$numbers" ]; then
  echo "nothing to close: no open bot issue titled \"$TITLE\""
  exit 0
fi

for n in $numbers; do
  gh issue close "$n" --comment "Recovered: this gate passed again. Run: ${RUN_URL:-unknown}"
  echo "closed #$n"
done
