"""Set-equality dismissal check: does A's REST-visible set EQUAL the policy-expected set?
Count equality is not set equality; this compares keys. READ-ONLY."""
import os, json, subprocess, sys, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe_lib import load_env, mint_token, TEST_REF
env = load_env(".env.test.local"); url=env["VITE_SUPABASE_URL"]; anon=env["VITE_SUPABASE_ANON_KEY"]
assert TEST_REF in url
a_uid, a_tok = mint_token(url, anon, env["TEST_LISTENER_EMAIL"], env["TEST_LISTENER_PASSWORD"])
from readonly_sql import q

def rest_keys(table, cols):
    keys=set(); off=0
    while True:
        u=f"{url}/rest/v1/{table}?select={','.join(cols)}&limit=1000&offset={off}&order={cols[0]}"
        req=urllib.request.Request(u, headers={"apikey":anon,"Authorization":f"Bearer {a_tok}"})
        with urllib.request.urlopen(req, timeout=60) as r: rows=json.loads(r.read().decode())
        if not rows: break
        for x in rows: keys.add(tuple(str(x[c]) for c in cols))
        off+=len(rows)
        if len(rows)<1000: break
    return keys

CASES = {
 "clarity_docs": (["id"], "select id::text as k1 from clarity_docs where visibility='public' or owner_id='%s'"),
 "organization": (["id"], "select id::text as k1 from organization where visibility='public'"),
 "stories": (["id"], "select id::text as k1 from stories where visibility='public' or author_id='%s'"),
 "story_versions": (["id"], "select sv.id::text as k1 from story_versions sv where exists(select 1 from stories s where s.id=sv.story_id and (s.visibility='public' or s.author_id='%s'))"),
 "story_point_history": (["id"], "select sh.id::text as k1 from story_point_history sh where exists(select 1 from stories s where s.id=sh.story_id and (s.visibility='public' or s.author_id='%s'))"),
 "story_verifications": (["id"], "select v.id::text as k1 from story_verifications v where (case when v.source='letter' then (v.speaker_id='%s' or v.listener_id='%s') else exists(select 1 from stories s where s.id=v.story_id and (s.visibility='public' or s.author_id='%s')) end)"),
 "story_points": (["story_id","point_id"], "select sp.story_id::text as k1, sp.point_id::text as k2 from story_points sp where exists(select 1 from stories s where s.id=sp.story_id and (s.visibility='public' or s.author_id='%s'))"),
 "doc_stories": (["doc_id","story_id"], "select ds.doc_id::text as k1, ds.story_id::text as k2 from doc_stories ds where exists(select 1 from clarity_docs d where d.id=ds.doc_id and (d.visibility='public' or d.owner_id='%s'))"),
 "points": (["id"], "select id::text as k1 from points where visibility='public' or first_validator_id='%s'"),
 "point_positions": (["id"], "select pp.id::text as k1 from point_positions pp where exists(select 1 from points p where p.id=pp.point_id and (p.visibility='public' or p.first_validator_id='%s')) or pp.user_id='%s'"),
 "point_position_history": (["id"], "select ph.id::text as k1 from point_position_history ph where exists(select 1 from points p where p.id=ph.point_id and (p.visibility='public' or p.first_validator_id='%s')) or ph.user_id='%s'"),
}
report={}
for t,(cols,sql) in CASES.items():
    n = sql.count("%s")
    expected = {tuple(str(r[f"k{i+1}"]) for i in range(len(cols))) for r in q(sql % tuple([a_uid]*n))}
    actual = rest_keys(t, cols)
    extra = actual - expected; missing = expected - actual
    report[t]={"expected":len(expected),"actual":len(actual),"extra_rows_A_should_not_see":len(extra),
               "rows_A_expected_but_did_not_get":len(missing),"extra_sample":[list(x) for x in list(extra)[:3]]}
    v = "SET-EQUAL (dismiss)" if not extra and not missing else ("WIDENING: "+str(len(extra))+" extra" if extra else "narrowing only: "+str(len(missing))+" missing")
    print(f"{t:24s} exp={len(expected):5d} act={len(actual):5d}  {v}")
    for x in list(extra)[:3]: print("      EXTRA:", x)
json.dump({"A":a_uid,"setcheck":report}, open("/tmp/p1207_b_setcheck.json","w"), indent=1)
