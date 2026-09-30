#!/usr/bin/env bash
# P1378 canary: the Clarity Agent system identity must never be listed as a pledger.
#   1. static: bootstrap-align-agent.mjs sets has_pledged:false on create AND adopt
#   2. live (read-only, anon): prod get_pledgers_page does not return slug clarity-agent
# Exit non-zero on any failure.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
f=scripts/bootstrap-align-agent.mjs
n=$(/usr/bin/grep -c "has_pledged: false" "$f")
if [ "$n" -ge 2 ]; then echo "PASS bootstrap sets has_pledged:false ($n sites)"; else echo "FAIL bootstrap sets has_pledged:false at $n sites, need create + adopt"; fail=1; fi

if [ "${P1378_SKIP_LIVE:-0}" != 1 ]; then
  url=$(/usr/bin/grep -E '^VITE_SUPABASE_URL=' .env.prod | cut -d= -f2-)
  key=$(/usr/bin/grep -E '^VITE_SUPABASE_ANON_KEY=' .env.prod | cut -d= -f2-)
  out=$(curl -s "$url/rest/v1/rpc/get_pledgers_page" -H "apikey: $key" -H "Content-Type: application/json" -d '{"p_limit":100,"p_offset":0}')
  listed=$(printf '%s' "$out" | python3 -c "import json,sys;d=json.load(sys.stdin);print(any(p.get('slug')=='clarity-agent' for p in d['profiles']))" 2>&1)
  case "$listed" in
    False) echo "PASS prod /pledgers does not list clarity-agent";;
    True)  echo "FAIL prod /pledgers lists clarity-agent"; fail=1;;
    *)     echo "FAIL could not read prod pledgers: $listed"; fail=1;;
  esac
fi
exit $fail
