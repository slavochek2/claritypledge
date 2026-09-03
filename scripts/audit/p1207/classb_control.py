"""Known-bad / known-good control through the IDENTICAL probe + metric (spec Risks row).
Metric: |A's REST-visible key set| minus |owner-scoped expected set| = extra rows."""
import os, json, sys, urllib.request
sys.path.insert(0,"scripts/audit/p1207"); 
from probe_lib import load_env, mint_token, TEST_REF
from readonly_sql import q
env=load_env(".env.test.local"); url=env["VITE_SUPABASE_URL"]; anon=env["VITE_SUPABASE_ANON_KEY"]
assert TEST_REF in url
a_uid,a_tok = mint_token(url,anon,env["TEST_LISTENER_EMAIL"],env["TEST_LISTENER_PASSWORD"])
def rest_ids(t):
    u=f"{url}/rest/v1/{t}?select=id&limit=1000"
    r=urllib.request.Request(u,headers={"apikey":anon,"Authorization":f"Bearer {a_tok}"})
    with urllib.request.urlopen(r,timeout=60) as z: return {x["id"] for x in json.loads(z.read().decode())}
CASES=[("clarity_docs","KNOWN-GOOD (per-user filter present)","select id::text as k1 from clarity_docs where visibility='public' or owner_id='%s'"),
       ("badge_points","KNOWN-BAD (USING true, owner col user_id)","select id::text as k1 from badge_points where user_id='%s'"),
       ("event_rsvps","KNOWN-BAD (USING true, owner col profile_id)","select id::text as k1 from event_rsvps where profile_id='%s'")]
for t,label,sql in CASES:
    exp={r["k1"] for r in q(sql % a_uid)}; act=rest_ids(t); extra=act-exp
    print(f"{t:16s} {label:42s} expected={len(exp):4d} actual={len(act):4d} EXTRA={len(extra):4d} -> {'FLAGS' if extra else 'clean'}")
