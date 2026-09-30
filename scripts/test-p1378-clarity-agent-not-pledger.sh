#!/usr/bin/env bash
# P1378 canary: the Clarity Agent system identity must never be listed as a pledger.
#   1. static: bootstrap-align-agent.mjs sets has_pledged:false on create AND adopt
#   2. live (read-only, anon): prod get_pledgers_page does not return slug clarity-agent
# Exit non-zero on any failure.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
f=scripts/bootstrap-align-agent.mjs
# Anchored to the code shapes, so a comment cannot satisfy either site.
if /usr/bin/grep -q "JSON.stringify({ has_pledged: false })" "$f"; then echo "PASS adopt path sets has_pledged:false"; else echo "FAIL adopt path does not set has_pledged:false"; fail=1; fi
if /usr/bin/grep -qE "is_verified: true, has_pledged: false, avatar_color" "$f"; then echo "PASS create path sets has_pledged:false"; else echo "FAIL create path does not set has_pledged:false"; fail=1; fi

if [ "${P1378_SKIP_LIVE:-0}" != 1 ]; then
  # .env.prod is gitignored, so a worktree has none; read the main checkout's copy.
  envf="$(cd "$(git rev-parse --git-common-dir)/.." && pwd)/.env.prod"
  url=$(/usr/bin/grep -E '^VITE_SUPABASE_URL=' "$envf" | cut -d= -f2-)
  key=$(/usr/bin/grep -E '^VITE_SUPABASE_ANON_KEY=' "$envf" | cut -d= -f2-)
  # Page to exhaustion: a single page would false-pass once the agent sorts past it.
  listed=$(URL="$url" KEY="$key" python3 -c "
import json,os,urllib.request
off,seen,total=0,[],None
while total is None or off<total:
    r=urllib.request.Request(os.environ['URL']+'/rest/v1/rpc/get_pledgers_page',data=json.dumps({'p_limit':100,'p_offset':off}).encode(),headers={'apikey':os.environ['KEY'],'Content-Type':'application/json'})
    d=json.load(urllib.request.urlopen(r)); total=d['total']; ps=d['profiles']
    if not ps: break
    seen+=ps; off+=len(ps)
if len(seen)!=total: raise SystemExit('paged %d of %d'%(len(seen),total))
print(any(p.get('slug')=='clarity-agent' for p in seen))" 2>&1)
  case "$listed" in
    False) echo "PASS prod /pledgers does not list clarity-agent";;
    True)  echo "FAIL prod /pledgers lists clarity-agent"; fail=1;;
    *)     echo "FAIL could not read prod pledgers: $listed"; fail=1;;
  esac
fi
exit $fail
