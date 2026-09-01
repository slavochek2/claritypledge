#!/usr/bin/env python3
"""P1207 canary — asserts two privilege-floor invariants against a live project.

  1. F6: anon/authenticated hold no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on any
     table in schema public, and the schema's default ACL does not grant them either.
  2. F1: clarity_idea_votes has no UPDATE policy with an unconditional predicate.

Read-only: issues SELECT only, via the Supabase Management API.
Usage: scripts/check-p1207-privilege-floor.py [test|prod]   (default: test)
Exit 0 = floor holds. Exit 1 = a violation is listed on stdout.
"""
import json, os, re, sys, urllib.request, urllib.error

BANNED = ("TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN")
# pg ACL letters for the same four privileges, as they appear in pg_default_acl.
BANNED_ACL = {"D": "TRUNCATE", "x": "REFERENCES", "t": "TRIGGER", "m": "MAINTAIN"}
UNCONDITIONAL = re.compile(r"^\s*\(*\s*(true|1\s*=\s*1|true::boolean)\s*\)*\s*$", re.I)

def load_env(path):
    env = {}
    if not os.path.exists(path):
        return env
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def query(ref, token, sql):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 # Cloudflare rejects urllib's default UA with a 403/1010 that reads as
                 # an auth failure. Documented in scripts/rls-drift-check.py.
                 "User-Agent": "claritypledge-p1207-canary/1.0"},
        method="POST")
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())

def main():
    which = (sys.argv[1] if len(sys.argv) > 1 else "test").lower()
    env_file = ".env.prod" if which == "prod" else ".env.local"
    env = load_env(env_file)
    if not env:
        root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        env = load_env(os.path.join(root, env_file))
    token = env.get("SUPABASE_ACCESS_TOKEN")
    url = env.get("VITE_SUPABASE_URL", "")
    ref = url.replace("https://", "").split(".")[0]
    if not token or not ref:
        print(f"ERROR: need SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL in {env_file}")
        return 2

    violations = []

    rows = query(ref, token, """
        select table_name, grantee, privilege_type
        from information_schema.table_privileges
        where table_schema = 'public'
          and grantee in ('anon','authenticated')
          and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
        order by privilege_type, grantee, table_name
    """)
    for r in rows:
        violations.append(
            f"F6 table privilege: {r['grantee']} holds {r['privilege_type']} on public.{r['table_name']}")

    acl = query(ref, token, """
        select pg_get_userbyid(d.defaclrole) as owner, d.defaclacl::text as acl
        from pg_default_acl d
        join pg_namespace n on n.oid = d.defaclnamespace
        where n.nspname = 'public' and d.defaclobjtype = 'r'
    """)
    for r in acl:
        # Only the entries our own migrations can alter: those owned by postgres.
        # supabase_admin's platform default is not ours to change; reported, not failed.
        for grantee in ("anon", "authenticated"):
            m = re.search(rf"\b{grantee}=([a-zA-Z]*)/", r["acl"] or "")
            if not m:
                continue
            held = [name for letter, name in BANNED_ACL.items() if letter in m.group(1)]
            if not held:
                continue
            line = (f"F6 default ACL ({r['owner']}-owned): future public tables grant "
                    f"{','.join(held)} to {grantee}")
            if r["owner"] == "postgres":
                violations.append(line)
            else:
                print(f"note: {line} — owned by {r['owner']}, outside this repo's control")

    pol = query(ref, token, """
        select policyname, roles::text as roles, qual, with_check
        from pg_policies
        where schemaname = 'public' and tablename = 'clarity_idea_votes' and cmd = 'UPDATE'
    """)
    for p in pol:
        if UNCONDITIONAL.match(p["qual"] or "") or p["qual"] is None:
            violations.append(
                f"F1 policy: clarity_idea_votes UPDATE \"{p['policyname']}\" "
                f"roles={p['roles']} qual={p['qual']!r} is unconditional")

    if violations:
        print(f"FAIL ({which}/{ref}): {len(violations)} privilege-floor violation(s)")
        for v in violations[:20]:
            print(f"  - {v}")
        if len(violations) > 20:
            print(f"  ... and {len(violations) - 20} more")
        return 1
    print(f"ok ({which}/{ref}): no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN to anon or "
          f"authenticated in schema public; clarity_idea_votes UPDATE is not unconditional")
    return 0

if __name__ == "__main__":
    sys.exit(main())
