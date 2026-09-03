"""Ownership reproduction for class-B leads. READ-ONLY GETs."""
import os, json, sys, urllib.parse, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe_lib import load_env, mint_token, TEST_REF
env = load_env(".env.test.local")
url, anon = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"]
svc = env["SUPABASE_SERVICE_ROLE_KEY"]
assert TEST_REF in url, "REFUSING: not test"
a_uid, a_tok = mint_token(url, anon, env["TEST_LISTENER_EMAIL"], env["TEST_LISTENER_PASSWORD"])
b_uid, b_tok = mint_token(url, anon, env["TEST_PARTNER_EMAIL"], env["TEST_PARTNER_PASSWORD"])

def get(table, token, qs="select=*&limit=1000"):
    u=f"{url}/rest/v1/{table}?{qs}"
    req=urllib.request.Request(u, headers={"apikey":anon,"Authorization":f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read().decode())
    except urllib.error.HTTPError as e: return {"error":e.code,"body":e.read().decode()[:200]}

OWNER = {
 "badge_points":"user_id", "clarity_idea_comments":"author_session_id",
 "clarity_idea_vote_history":"voter_session_id", "clarity_idea_votes":"voter_session_id",
 "event_practice_rooms":"creator_id", "event_rsvps":"profile_id", "events":"host_id",
 "transcribe_rooms":None,
}
out={}
for t,col in OWNER.items():
    rows=get(t,a_tok)
    if isinstance(rows,dict): print(t,"ERR",rows); continue
    if col is None:
        out[t]={"rows_seen_by_A":len(rows),"sample":rows[:3]}
        print(f"\n=== {t}: A sees {len(rows)} rows (no owner column)")
        for r in rows[:4]: print("   ", json.dumps(r))
        continue
    foreign=[r for r in rows if r.get(col) not in (a_uid, None)]
    out[t]={"rows_seen_by_A":len(rows),"owner_col":col,"foreign_rows":len(foreign),
            "distinct_owners":sorted({str(r.get(col)) for r in rows}),"sample_foreign":foreign[:3]}
    print(f"\n=== {t}: A sees {len(rows)}, owner col={col}, rows NOT owned by A = {len(foreign)}")
    print("    distinct owners:", sorted({str(r.get(col)) for r in rows})[:8])
    for r in foreign[:3]: print("    FOREIGN ROW:", json.dumps(r)[:400])
json.dump({"A":a_uid,"B":b_uid,"tables":out}, open("/tmp/p1207_b_ownership.json","w"), indent=1, default=str)
