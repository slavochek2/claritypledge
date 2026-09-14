#!/usr/bin/env python3
"""P1207 canary — asserts two privilege-floor invariants against a live project.

  1. F6: anon/authenticated hold no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on any
     table in schema public, and the schema's default ACL does not grant them either.
  2. F1: clarity_idea_votes has no UPDATE policy with an unconditional predicate.

Read-only by construction, not by convention: every query goes through the Management
API's /database/query/read-only endpoint, which Postgres executes as
supabase_read_only_user inside a read-only transaction. A DDL or DML statement sent to
that endpoint is refused by the server (SQLSTATE 25006), so this canary cannot mutate
either project even if a future edit tries to.

Usage: scripts/check-p1207-privilege-floor.py [test|prod]   (default: test)
       scripts/check-p1207-privilege-floor.py --self-test   (offline, no token)
Exit 0 = floor holds. Exit 1 = a violation is listed on stdout.
"""
import json, os, re, subprocess, sys, urllib.request, urllib.error

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

# ---------------------------------------------------------------------------
# Why these read pg_catalog and NOT information_schema
# ---------------------------------------------------------------------------
# information_schema.table_privileges and .column_privileges are ROLE-FILTERED: per the
# SQL standard they expose only privileges granted TO or BY a *currently enabled role*.
# As the `postgres` superuser that is everything, so the original queries were correct.
# This file now runs as supabase_read_only_user, which is a member of neither anon nor
# authenticated and granted nothing by them — so those views return ZERO ROWS for every
# grantee this canary asks about, whatever the database actually holds.
#
# That failure is silent and inverted: the check is looking for an EMPTY result as its
# pass condition, so a blinded view reports "ok, floor holds" on a database that has just
# handed anon TRUNCATE on every table. Measured 2026-09-14 on both projects: a control
# query for SELECT (which anon demonstrably holds) returned 100 rows as postgres and 0 as
# supabase_read_only_user, while the four banned privileges returned 0 under both — i.e.
# the real queries looked perfectly healthy exactly when the view had gone blind.
#
# pg_class.relacl / pg_attribute.attacl are ordinary catalog columns with no role filter,
# so they answer identically under any role. Both forms below were verified to return the
# byte-identical grant set as information_schema-as-postgres on test AND prod
# (403/377 table grants, 2745/2632 column grants, zero missing, zero extra).
#
# DO NOT "simplify" these back to information_schema. It will pass its tests, pass review,
# and silently stop detecting anything.
#
# aclexplode() spells the PUBLIC pseudo-role as a NULL grantee; coalesce turns it back into
# the literal 'PUBLIC', which is how the old information_schema query named it. That folds
# the former separate PUBLIC query into the table query below with identical output.
TABLE_PRIVS_SQL = """
    select c.relname as table_name, t.grantee as grantee, t.privilege_type
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral (
      select coalesce(pg_catalog.pg_get_userbyid(x.grantee), 'PUBLIC') as grantee,
             x.privilege_type
      from pg_catalog.aclexplode(c.relacl) x
    ) t
    where n.nspname = 'public'
      and c.relkind in ('r','v','m','p','f')
      and t.grantee in ('anon','authenticated','PUBLIC')
      and t.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
    order by t.privilege_type, t.grantee, c.relname
"""

# A column's effective grants are the UNION of its own ACL and its table's ACL -- not a
# coalesce. A column carrying an explicit attacl STILL inherits the table-level grants;
# taking only attacl dropped 124 real grants in measurement, and taking only relacl misses
# every explicit column grant. Restricted to the four column-grantable privileges because
# aclexplode over a table ACL also yields DELETE/TRUNCATE/etc., which information_schema
# never reports at column level (832 spurious rows before this filter).
COLUMN_PRIVS_SQL = """
    select distinct c.relname as table_name, a.attname as column_name,
           t.grantee as grantee, t.privilege_type
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral (
      select coalesce(pg_catalog.pg_get_userbyid(x.grantee), 'PUBLIC') as grantee,
             x.privilege_type
      from pg_catalog.aclexplode(a.attacl) x
      union
      select coalesce(pg_catalog.pg_get_userbyid(y.grantee), 'PUBLIC') as grantee,
             y.privilege_type
      from pg_catalog.aclexplode(c.relacl) y
    ) t
    where n.nspname = 'public'
      and c.relkind in ('r','v','m','p','f')
      and a.attnum > 0 and not a.attisdropped
      and t.grantee in ('anon','authenticated','PUBLIC')
      and t.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
    order by t.privilege_type, t.grantee, c.relname, a.attname
"""

# The two queries above PASS by returning nothing, which makes them indistinguishable from a
# query that has gone blind -- the precise failure this file was rewritten to escape (a
# role-filtered view returned 0 rows for every grantee while the database was unchanged).
# So before believing an empty result, prove the detector can still see a grant that is known
# to exist: anon and authenticated hold SELECT on many public tables in both projects. If this
# returns nothing, the detector is broken and the run must report "could not run" (exit 2),
# never "floor holds" (exit 0).
# This is a control probe, not a test: it runs against the same live project, through the same
# endpoint, in the same role, scored on the same query shape as the real checks.
LIVENESS_SQL = """
    select count(*) as n
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral (
      select coalesce(pg_catalog.pg_get_userbyid(x.grantee), 'PUBLIC') as grantee,
             x.privilege_type
      from pg_catalog.aclexplode(c.relacl) x
    ) t
    where n.nspname = 'public'
      and c.relkind in ('r','v','m','p','f')
      and t.grantee in ('anon','authenticated')
      and t.privilege_type = 'SELECT'
"""


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
        f"https://api.supabase.com/v1/projects/{ref}/database/query/read-only",
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

    # Env files are gitignored, so they exist ONLY in the main checkout — never in a worktree.
    # And unlike deploy-functions.sh, we cannot resolve the main repo by following a symlink
    # from __file__: worktree scripts/ is a NATIVE checkout here (3d7a010e), so __file__ points
    # inside the worktree. Resolve the main checkout the way /day already does, via
    # --git-common-dir, which works identically from w0 or any worktree.
    # Found by running the prod invocation /day itself uses — the test path had always worked.
    candidates = [env_file]
    try:
        common = subprocess.run(
            ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
            capture_output=True, text=True, timeout=10, check=True).stdout.strip()
        if common:
            candidates.append(os.path.join(os.path.dirname(common), env_file))
    except Exception:
        pass  # fall through to the plain relative path; the error below stays accurate
    candidates.append(os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), env_file))

    env = {}
    for cand in candidates:
        env = load_env(cand)
        if env.get("SUPABASE_ACCESS_TOKEN") and env.get("VITE_SUPABASE_URL"):
            env_file = cand
            break

    # Prefer a reduced-privilege token when one exists (P1214). SUPABASE_ACCESS_TOKEN is an
    # account-wide platform management token: it can manage the production project outright,
    # which is far more than a read-only policy comparison needs. A scoped token carrying only
    # Database:Read for these two projects is the credential this job should hold.
    # The fallback is deliberate but must never be silent -- an unannounced fallback is how a
    # privilege reduction gets "completed" while every run keeps using the powerful token.
    token = os.environ.get("SUPABASE_READONLY_TOKEN") or env.get("SUPABASE_READONLY_TOKEN")
    token_kind = "scoped read-only token"
    if not token:
        token = env.get("SUPABASE_ACCESS_TOKEN")
        token_kind = "account-wide management token (no SUPABASE_READONLY_TOKEN set)"
    url = env.get("VITE_SUPABASE_URL", "")
    ref = url.replace("https://", "").split(".")[0]
    if not token or not ref:
        print(f"ERROR: need SUPABASE_ACCESS_TOKEN (or SUPABASE_READONLY_TOKEN) and "
              f"VITE_SUPABASE_URL in {env_file}")
        return 2
    print(f"credential: {token_kind}")

    live = query(ref, token, LIVENESS_SQL)
    live_n = int(live[0]["n"]) if live else 0
    if live_n == 0:
        print(f"ERROR ({which}/{ref}): detector liveness probe found ZERO SELECT grants to "
              f"anon/authenticated in schema public. That is not credible -- the application "
              f"could not work. The privilege queries have gone blind (role filtering, a "
              f"catalog change, or a wrong project), so their empty result proves nothing. "
              f"Refusing to report the floor as intact.")
        return 2
    print(f"detector liveness: {live_n} SELECT grants visible -- privilege queries can see grants")

    violations = []

    rows = query(ref, token, TABLE_PRIVS_SQL)
    for r in rows:
        violations.append(
            f"F6 table privilege: {r['grantee']} holds {r['privilege_type']} on public.{r['table_name']}")

    # A table-level REVOKE does not remove a column-level grant of the same privilege; they are
    # tracked separately. Nothing holds one today (measured: zero rows), but the whole point of a
    # standing control is the day that changes.
    # Of the four banned privileges only REFERENCES is column-grantable at all — TRUNCATE,
    # TRIGGER and MAINTAIN are table-level only, so this leg can only ever fire on REFERENCES.
    # All four are kept in the filter so that a future Postgres that widens column grants is
    # covered without anyone having to remember this file.
    colrows = query(ref, token, COLUMN_PRIVS_SQL)
    for r in colrows:
        violations.append(
            f"F6 column privilege: {r['grantee']} holds {r['privilege_type']} on "
            f"public.{r['table_name']}.{r['column_name']}")

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
            # KNOWN BOUND, stated rather than discovered later: a predicate that delegates the
            # identity check to a helper — story_explain_backs uses
            # `_is_delivery_receiver(delivery_id)` — has no literal auth.* and would be flagged
            # here. That is a false positive this check would produce if it were ever widened
            # beyond clarity_idea_votes, whose policies use no such helper. Widening the table
            # list requires teaching this to resolve helper bodies first.
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
