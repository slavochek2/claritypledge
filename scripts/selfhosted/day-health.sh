#!/usr/bin/env bash
# scripts/selfhosted/day-health.sh — what /day's cp.selfhosted reads (P1584)
#
# The hourly workflow (.github/workflows/selfhosted-health.yml) is the monitor; /day only reads its
# verdict: the latest scheduled run, and the alert issue that run opens or closes. Until the workflow
# has a scheduled run on main (not yet pushed, or gh unavailable), it falls back to probing the server
# from this Mac with health.sh, and says so, so /day never goes blind during the switch.
#
# Same contract as health.sh: "<check>: ok|warn|unknown: <detail>" lines; exit 0 ok, 1 warn, 2 unknown.
# Output contract (shell-safety.md): no redirect or pipe tokens in status lines.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORKFLOW="selfhosted-health.yml"; TITLE="Self-hosted TEST server health failing"
MAX_AGE_S="${SELFHOSTED_MAX_RUN_AGE_S:-10800}"   # hourly schedule; GitHub delays cron runs, so 3 h

# The local probe is a real reading, so its verdict stands; the source line says where it came from.
fallback() { echo "source: ok: local probe, because $1"; "$HERE/health.sh"; exit $?; }

runs="$(gh run list --workflow "$WORKFLOW" --branch main --event schedule --limit 5 \
  --json conclusion,createdAt,status,url 2>/dev/null)" || fallback "could not list the workflow's runs"
last="$(printf '%s' "$runs" | jq -c '[.[] | select(.status=="completed")] | first // empty' 2>/dev/null)"
[ -n "$last" ] || fallback "the workflow has no completed scheduled run yet"

conclusion="$(printf '%s' "$last" | jq -r .conclusion)"; url="$(printf '%s' "$last" | jq -r .url)"
created="$(printf '%s' "$last" | jq -r .createdAt)"
age="$(python3 -I -c 'import sys,datetime as d; t=d.datetime.fromisoformat(sys.argv[1].replace("Z","+00:00")); print(int((d.datetime.now(d.timezone.utc)-t).total_seconds()))' "$created" 2>/dev/null)"
issue="$(gh issue list --state open --limit 100 --json number,title,author 2>/dev/null \
  | jq -r --arg t "$TITLE" '[.[] | select(.title==$t and .author.login=="app/github-actions") | .number] | first // empty' 2>/dev/null)"; issue_rc=$?

if [ -z "$age" ]; then echo "workflow: unknown: could not read the last run's time"; exit 2; fi
if [ "$conclusion" != success ]; then echo "workflow: warn: the last run itself failed ($conclusion), so its alert may not have fired: $url"; exit 1; fi
if [ -n "$issue" ]; then echo "workflow: warn: alert issue #$issue is open ($TITLE)"; exit 1; fi
if [ "$issue_rc" != 0 ]; then echo "workflow: unknown: could not list open issues"; exit 2; fi
if [ "$age" -gt "$MAX_AGE_S" ]; then echo "workflow: unknown: last scheduled run was $(( age / 3600 )) h ago: $url"; exit 2; fi
echo "workflow: ok: hourly check healthy, last run $(( age / 60 )) min ago, no alert open"
exit 0
