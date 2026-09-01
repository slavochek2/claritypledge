#!/usr/bin/env python3
"""P1207 canary — asserts two privilege-floor invariants against a live project.

  1. F6: anon/authenticated hold no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on any
     table in schema public, and the schema's default ACL does not grant them either.
  2. F1: clarity_idea_votes has no UPDATE policy with an unconditional predicate.

Read-only: issues SELECT only, via the Supabase Management API.
Usage: scripts/check-p1207-privilege-floor.py [test|prod]   (default: test)
       scripts/check-p1207-privilege-floor.py --self-test   (offline, no token)
Exit 0 = floor holds. Exit 1 = a violation is listed on stdout.
"""
import json, os, re, sys, urllib.request, urllib.error

BANNED = ("TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN")
# pg ACL letters for the same four privileges, as they appear in pg_default_acl.
BANNED_ACL = {"D": "TRUNCATE", "x": "REFERENCES", "t": "TRIGGER", "m": "MAINTAIN"}
# A write-admitting policy on this table MUST consult caller identity. Enumerating the ways a
# predicate can spell "true" is a losing game — an adversarial review of the first version of
# this file defeated the allowlist below with `true AND true`, `NOT false` and `2 > 1` in under
# a minute, which is P1044's finding (check-rls-scope.py is bypassable the same way) reproduced
# in a fresh artifact. So the test is inverted: instead of recognising unsafe predicates, require
# a safe one. Anything that never mentions auth.uid()/auth.email()/auth.jwt() cannot distinguish
# one caller from another, whatever it is spelled like.
IDENTITY = re.compile(r"\bauth\.(uid|email|jwt|role)\s*\(", re.I)
# Kept only to make the common case legible in the failure message, never as the test itself.
OBVIOUSLY_TRUE = re.compile(r"^\s*\(*\s*(true|1\s*=\s*1|true::boolean)\s*\)*\s*$", re.I)

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

def self_test():
    """Offline control pass: the detector must score known-bad and known-good DIFFERENTLY.

    A privilege check that returns the same verdict for every input is blind whichever way it
    answered, so this runs both directions and fails if either side is unanimous the wrong way.
    Every BAD entry below is an evasion that defeated the first version of this file (an
    adversarial review supplied `true AND true`, `NOT false` and `2 > 1`; the rest are the
    annotation-smuggling and cast forms P1044 documents against check-rls-scope.py).
    Requires no network and no token — run it in CI or by hand: --self-test
    """
    BAD = ["true", "(true)", "true AND true", "NOT false", "2 > 1", "1=1", "true::boolean",
           "((true))", "(SELECT true)", "1 = 1 /* ok */", "$$x$$ IS NOT NULL"]
    GOOD = ["(voter_session_id = auth.uid())",
            "(lower(partner_email) = lower(auth.email()))",
            "(auth.uid() IS NOT NULL)",
            "((auth.jwt() ->> 'role') = 'admin')"]
    failures = []
    for pred in BAD:
        if IDENTITY.search(pred):
            failures.append(f"MISS: unconditional predicate not flagged: {pred!r}")
    for pred in GOOD:
        if not IDENTITY.search(pred):
            failures.append(f"FALSE POSITIVE: identity-scoped predicate flagged: {pred!r}")
    # PUBLIC appears in an ACL as an EMPTY grantee; the named-role regex cannot see it.
    if not re.search(r"(?:^|,)=([a-zA-Z]*)/", "{postgres=arwdDxtm/postgres,=arwdDxtm/postgres}"):
        failures.append("MISS: PUBLIC default-ACL entry (empty grantee) not detected")
    if failures:
        print("SELF-TEST FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"self-test ok: {len(BAD)} known-bad predicates flagged, {len(GOOD)} known-good "
          f"predicates passed, PUBLIC ACL entry detected — the detector discriminates")
    return 0


def main():
    if "--self-test" in sys.argv:
        return self_test()
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

    # A table-level REVOKE does not remove a column-level grant of the same privilege; they are
    # tracked separately. Nothing holds one today (measured: zero rows), but the whole point of a
    # standing control is the day that changes.
    colrows = query(ref, token, """
        select table_name, column_name, grantee, privilege_type
        from information_schema.column_privileges
        where table_schema = 'public'
          and grantee in ('anon','authenticated')
          and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
        order by privilege_type, grantee, table_name, column_name
    """)
    for r in colrows:
        violations.append(
            f"F6 column privilege: {r['grantee']} holds {r['privilege_type']} on "
            f"public.{r['table_name']}.{r['column_name']}")

    # PUBLIC is a distinct grantee that reaches anon and authenticated through role inheritance.
    # Zero rows today; checked so a future GRANT ... TO PUBLIC cannot pass silently.
    pubrows = query(ref, token, """
        select table_name, privilege_type
        from information_schema.table_privileges
        where table_schema = 'public' and grantee = 'PUBLIC'
          and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
    """)
    for r in pubrows:
        violations.append(
            f"F6 table privilege: PUBLIC holds {r['privilege_type']} on public.{r['table_name']}")

    acl = query(ref, token, """
        select pg_get_userbyid(d.defaclrole) as owner, d.defaclacl::text as acl
        from pg_default_acl d
        join pg_namespace n on n.oid = d.defaclnamespace
        where n.nspname = 'public' and d.defaclobjtype = 'r'
    """)
    for r in acl:
        # Only the entries our own migrations can alter: those owned by postgres.
        # supabase_admin's platform default is not ours to change; reported, not failed.
        # PUBLIC is spelled as an EMPTY grantee ("=arwdDxtm/postgres"). A grant to PUBLIC reaches
        # anon and authenticated as surely as a named one, and the first version of this check
        # could not see it at all.
        for grantee in ("anon", "authenticated", "PUBLIC"):
            pattern = r"(?:^|,)=([a-zA-Z]*)/" if grantee == "PUBLIC" else rf"\b{grantee}=([a-zA-Z]*)/"
            m = re.search(pattern, r["acl"] or "")
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

    # cmd='ALL' matters as much as cmd='UPDATE': Postgres applies a FOR ALL policy to UPDATE too,
    # and permissive policies are OR-ed together, so ONE later unconditional policy of either kind
    # re-opens the write. Checking only cmd='UPDATE' would have missed it.
    pol = query(ref, token, """
        select policyname, cmd, permissive, roles::text as roles, qual, with_check
        from pg_policies
        where schemaname = 'public' and tablename = 'clarity_idea_votes'
          and cmd in ('UPDATE', 'ALL')
    """)
    for p in pol:
        if p["permissive"] != "PERMISSIVE":
            continue  # A RESTRICTIVE policy only ever narrows; it cannot admit a write on its own.
        # BOTH halves gate the write: qual chooses which rows may be targeted, with_check which
        # resulting rows are allowed. An unconditional with_check under a scoped qual still lets a
        # caller rewrite a row they legitimately reached into anything at all. The first version
        # of this check fetched with_check and never looked at it.
        for half in ("qual", "with_check"):
            pred = p[half]
            if pred is None:
                continue  # absent half = not granted by this policy
            if IDENTITY.search(pred):
                continue  # consults the caller; scoping correctness is out of scope here
            shape = "literally true" if OBVIOUSLY_TRUE.match(pred) else "no auth.* reference"
            violations.append(
                f"F1 policy: clarity_idea_votes {p['cmd']} \"{p['policyname']}\" "
                f"roles={p['roles']} {half}={pred!r} admits every caller ({shape})")

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
