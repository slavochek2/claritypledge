#!/bin/bash
# scripts/check-prod-deploy.sh — P1211: is <sha>'s Vercel Production deployment live?
#
# /push step 6 (and step 2.5, for an overdue coupled migration) must never apply a
# client-breaking migration while the OLD bundle is still being served (Gemini F5).
# This asks GitHub's deployments API, where Vercel's integration records every
# deployment, and accepts only one shape (Codex review 2026-09-21, #10):
#   environment == "Production", creator == vercel[bot], sha == <sha> exactly,
#   created at or after --since, and its LATEST status is "success".
#
# Usage: check-prod-deploy.sh --sha <sha> [--since <unix-epoch>] [--wait <seconds>]
#   --since  ignore deployments created before this moment (default: no lower bound).
#            /push passes the promote time, so an older redeploy cannot answer.
#   --wait   poll until success/failure or this many seconds pass (default 0 = once).
#
# Exit: 0 live · 1 the deployment failed/errored · 2 not live yet (timed out, none
#   found, or the API could not be read — never read that as "failed", never as "live").
#
# Public repo: reads work unauthenticated (60 requests/hour). A token from
# `gh auth token` is used when available. Nothing here writes anything.

set -u

SHA=""; SINCE=0; WAIT=0
while [ $# -gt 0 ]; do
  case "$1" in
    --sha)   shift; SHA="${1:-}" ;;
    --since) shift; SINCE="${1:-0}" ;;
    --wait)  shift; WAIT="${1:-0}" ;;
    *) echo "check-prod-deploy: unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
echo "$SHA" | grep -qE '^[0-9a-f]{40}$' || { echo "check-prod-deploy: --sha must be a full 40-char sha" >&2; exit 2; }

SLUG=$(git remote get-url origin 2>/dev/null | sed -E 's#^.*github\.com[:/]##; s#\.git$##')
echo "$SLUG" | grep -qE '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' || { echo "check-prod-deploy: cannot derive owner/repo from origin" >&2; exit 2; }
API="${CHECK_PROD_DEPLOY_API:-https://api.github.com}"
# The override exists for the hermetic canary only. It may point at localhost and nowhere
# else — otherwise any endpoint could answer "live" for step 2.5 / step 6 (Codex impl #6).
case "$API" in
  https://api.github.com|http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "check-prod-deploy: CHECK_PROD_DEPLOY_API may only point at localhost (got: $API)" >&2; exit 2 ;;
esac
TOKEN=$(gh auth token 2>/dev/null || true)

get() { # get <path> — body on stdout, non-zero on transport/HTTP failure
  local out code
  if [ -n "$TOKEN" ]; then
    out=$(curl -s --max-time 30 -w $'\n%{http_code}' -H @<(printf 'Authorization: Bearer %s\n' "$TOKEN") \
      -H "Accept: application/vnd.github+json" "$API$1") || return 1
  else
    out=$(curl -s --max-time 30 -w $'\n%{http_code}' -H "Accept: application/vnd.github+json" "$API$1") || return 1
  fi
  code=$(printf '%s\n' "$out" | tail -n1)
  [ "$code" = "200" ] || { echo "check-prod-deploy: HTTP $code for $1" >&2; return 1; }
  printf '%s\n' "$out" | sed '$d'
}

once() { # prints live | failed | pending | none ; non-zero = API unreadable
  local deps id statuses
  deps=$(get "/repos/$SLUG/deployments?sha=$SHA&environment=Production&per_page=100") || return 1
  id=$(python3 -c '
import json, sys, datetime
since = int(sys.argv[1]); sha = sys.argv[2]
best = None
for d in json.loads(sys.stdin.read()):
    if d.get("environment") != "Production" or d.get("sha") != sha:
        continue
    if (d.get("creator") or {}).get("login") != "vercel[bot]":
        continue
    t = datetime.datetime.strptime(d["created_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc).timestamp()
    if t < since:
        continue
    if best is None or d["created_at"] > best["created_at"]:
        best = d
print(best["id"] if best else "")
' "$SINCE" "$SHA" <<< "$deps") || return 1
  if [ -z "$id" ]; then echo none; return 0; fi
  statuses=$(get "/repos/$SLUG/deployments/$id/statuses?per_page=100") || return 1
  python3 -c '
import json, sys
st = json.loads(sys.stdin.read())
if not st:
    print("pending"); sys.exit(0)
latest = max(st, key=lambda s: (s["created_at"], s["id"]))["state"]
print({"success": "live", "failure": "failed", "error": "failed", "inactive": "failed"}.get(latest, "pending"))
' <<< "$statuses"
}

DEADLINE=$(( $(date +%s) + WAIT ))
while :; do
  if R=$(once); then
    case "$R" in
      live)   echo "check-prod-deploy: ${SHA:0:12} is live on Production."; exit 0 ;;
      failed) echo "check-prod-deploy: ${SHA:0:12}'s Production deployment FAILED — do not apply coupled migrations." >&2; exit 1 ;;
    esac
    STATE="$R"
  else
    STATE="unreadable"
  fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "check-prod-deploy: ${SHA:0:12} not live (state: $STATE) — NOT a failure verdict, and NOT live." >&2
    exit 2
  fi
  sleep 15
done
