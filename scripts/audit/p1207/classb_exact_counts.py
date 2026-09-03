"""Exact-count re-measure of the class-B leads. READ-ONLY (GET/HEAD only)."""
import os, json, sys, urllib.parse, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from probe_lib import load_env, mint_token, TEST_REF

env = load_env(".env.test.local")
url, anon = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"]
svc = env["SUPABASE_SERVICE_ROLE_KEY"]
assert TEST_REF in url, "REFUSING: not test"

def exact_count(table, token, qs=""):
    u = f"{url}/rest/v1/{table}?select=id{('&'+qs) if qs else ''}"
    h = {"apikey": anon, "Authorization": f"Bearer {token}",
         "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"}
    req = urllib.request.Request(u, headers=h, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            cr = r.headers.get("Content-Range", "")
    except urllib.error.HTTPError as e:
        return f"HTTP{e.code}"
    return cr.split("/")[-1] if cr else "?"

a_uid, a_tok = mint_token(url, anon, env["TEST_LISTENER_EMAIL"], env["TEST_LISTENER_PASSWORD"])
b_uid, b_tok = mint_token(url, anon, env["TEST_PARTNER_EMAIL"], env["TEST_PARTNER_PASSWORD"])
print(f"A={a_uid} B={b_uid}\n")
TABLES = ['badge_points','clarity_feed_ideas','clarity_idea_comments','clarity_idea_vote_history',
 'clarity_idea_votes','event_practice_rooms','event_rsvps','events','point_position_history',
 'point_positions','points','transcribe_rooms','clarity_docs','doc_stories','organization',
 'stories','story_point_history','story_points','story_verifications','story_versions']
print(f"{'table':28s} {'svc':>7s} {'anon':>7s} {'A':>7s} {'B':>7s}")
res={}
for t in TABLES:
    s=exact_count(t,svc); an=exact_count(t,anon); a=exact_count(t,a_tok); b=exact_count(t,b_tok)
    res[t]={"svc":s,"anon":an,"A":a,"B":b}
    print(f"{t:28s} {s:>7s} {an:>7s} {a:>7s} {b:>7s}")
json.dump({"A_uid":a_uid,"B_uid":b_uid,"exact_counts":res}, open("/tmp/p1207_b_exact.json","w"), indent=1)
