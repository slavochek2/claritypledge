"""READ-ONLY SQL against the TEST project via Supabase Management API.
Refuses anything that is not a single SELECT/WITH statement."""
import json, os, re, sys, urllib.request, urllib.error
sys.path.insert(0, "scripts/audit/p1207")
from probe_lib import load_env, TEST_REF

env = load_env(".env.local")
url = env["VITE_SUPABASE_URL"]
assert TEST_REF in url, f"REFUSING: not test ({url})"
ref = TEST_REF
token = env["SUPABASE_ACCESS_TOKEN"]

def q(sql):
    s = sql.strip()
    low = s.lower().lstrip("(")
    if not (low.startswith("select") or low.startswith("with")):
        raise SystemExit("REFUSING: not a read-only statement")
    if re.search(r"\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b", low):
        raise SystemExit("REFUSING: write keyword present")
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": s}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "User-Agent": "claritypledge-p1207-audit/1.0"},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode()[:500]}")

if __name__ == "__main__":
    sql = sys.stdin.read() if sys.argv[1:2] == ["-"] else sys.argv[1]
    print(json.dumps(q(sql), indent=1, default=str))
