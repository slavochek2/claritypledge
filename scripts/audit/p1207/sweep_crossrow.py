"""Class B sweep: can authenticated user A see rows that are not A's?
READ-ONLY, TEST only. Produces LEADS (per Decision Criterion 2), not findings —
a lead becomes a finding only when a reproduction names the row and its true owner.
"""
import json, sys
sys.path.insert(0, "scripts/audit/p1207")
from probe_lib import load_env, mint_token, probe_select, TEST_REF

env = load_env(".env.test.local")
url, anon, svc = env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"]
assert TEST_REF in url, "REFUSING: not test"

sweep = json.load(open("/tmp/p1207_anon_sweep.json"))
tables = sorted(sweep)

a_uid, a_tok = mint_token(url, anon, env["TEST_LISTENER_EMAIL"], env["TEST_LISTENER_PASSWORD"])
b_uid, b_tok = mint_token(url, anon, env["TEST_PARTNER_EMAIL"], env["TEST_PARTNER_PASSWORD"])
print(f"env=TEST  A(listener)={a_uid}  B(partner)={b_uid}\n")

LIM = 1000
out = {}
for t in tables:
    s = probe_select(url, anon, t, token=svc, select="*", limit=LIM)
    a = probe_select(url, anon, t, token=a_tok, select="*", limit=LIM)
    b = probe_select(url, anon, t, token=b_tok, select="*", limit=LIM)
    out[t] = {"svc": s["rows"], "A": a["rows"], "B": b["rows"],
              "svc_status": s["status"], "A_status": a["status"], "B_status": b["status"]}

json.dump(out, open("/tmp/p1207_crossrow.json", "w"), indent=1)

print(f"{'table':30s} {'svc':>5s} {'A':>5s} {'B':>5s}  lead")
leads = []
for t in tables:
    r = out[t]
    s_, a_, b_ = r["svc"], r["A"], r["B"]
    lead = ""
    if s_ and a_ and s_ == a_ and s_ > 1:
        lead = "A SEES ALL ROWS"; leads.append(t)
    elif s_ and a_ and b_ and a_ == b_ and a_ > 1:
        lead = "A and B see identical set"; leads.append(t)
    if lead or (a_ or 0) > 0:
        print(f"{t:30s} {str(s_):>5s} {str(a_):>5s} {str(b_):>5s}  {lead}")

print(f"\nLEADS ({len(leads)}): {' '.join(leads)}")
