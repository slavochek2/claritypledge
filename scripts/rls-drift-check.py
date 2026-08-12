#!/usr/bin/env python3
"""
P1048 — Detect RLS policy drift between live prod, live test, and migration files.

READ-ONLY. This script never issues DDL and never mutates either database. It runs
three SELECTs against pg_policies and reads .sql files off disk.

Why this exists
---------------
P1046 found four PERMISSIVE policies live on prod and absent from test. Postgres ORs
permissive policies together, so each one silently defeated the tightened policy beside
it; one caused a proven unauthenticated read of private data. Two distinct origins:

  1. Three were dropped by a migration that deploy-manifest.json records as APPLIED TO
     PROD. Prod never reflected the drops. The manifest is not evidence of live state.
  2. The fourth existed in NO migration at all — applied out-of-band.

Origin 1 is caught by comparing live prod against live test.
Origin 2 is caught by comparing live policy names against every CREATE POLICY in the
repo's migrations. Nothing else in the repo detects either.

Why Python and not bash
-----------------------
Policy `qual` expressions routinely contain `>`, `<` and `|`. .claude/rules/shell-safety.md
bans those characters from the output of scripts under scripts/ because a caller's stream
reversal can route them into `eval`, where the shell lexes them as redirects (the P783
.env.local truncation). That rule explicitly does not cover Python — its stdout does not
re-enter shell lexing. Emitting policy predicates from bash would have meant either
mangling them or reintroducing the P783 surface.

Usage
-----
  scripts/rls-drift-check.py                    # fetch both envs live, diff, exit 1 on drift
  scripts/rls-drift-check.py --json             # machine-readable report on stdout
  scripts/rls-drift-check.py \
      --prod-json f.json --test-json g.json     # offline, from snapshots (used by the self-test)
  scripts/rls-drift-check.py --dump-prod out.json   # capture a snapshot, no diff

Credentials (first hit wins per environment):
  prod: $SUPABASE_ACCESS_TOKEN_PROD, else SUPABASE_ACCESS_TOKEN in .env.prod
  test: $SUPABASE_ACCESS_TOKEN_TEST, else SUPABASE_ACCESS_TOKEN in .env.local
Project refs are derived from VITE_SUPABASE_URL in the same file, or from
$SUPABASE_PROJECT_REF_PROD / $SUPABASE_PROJECT_REF_TEST.

Exit codes:
  0  no unallowlisted prod-only or live-but-absent-from-files policy
  1  drift found (details on stdout)
  2  the check could not run (missing credentials, API error, unreadable migrations)

Exit 2 is deliberately distinct from 1: a check that could not run must never be
mistaken for a check that found nothing.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

POLICY_QUERY = """
select schemaname, tablename, policyname, permissive,
       roles::text as roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname
"""

API_HOST = "https://api.supabase.com"

# Directions the allowlist can suppress. Only the first two affect the exit code;
# the others are reported for eyeballs and never gate.
DIR_PROD_ONLY = "prod-only"
DIR_NOT_IN_FILES = "not-in-files"
DIR_TEST_ONLY = "test-only"
DIR_DIFFERS = "differs"

FAILING_DIRECTIONS = (DIR_PROD_ONLY, DIR_NOT_IN_FILES)
ALL_DIRECTIONS = (DIR_PROD_ONLY, DIR_NOT_IN_FILES, DIR_TEST_ONLY, DIR_DIFFERS)


# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

def repo_roots():
    """Return (this_root, main_root).

    Inside a worktree these differ, and it matters: setup-worktree.sh symlinks
    .env.local and .env.test.local into the worktree but NOT .env.prod, so a
    worktree run must reach back to the main checkout for prod credentials.
    `git rev-parse --git-common-dir` points at the main checkout's .git.
    """
    this_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    main_root = this_root
    try:
        common = subprocess.run(
            ["git", "rev-parse", "--git-common-dir"],
            cwd=this_root, capture_output=True, text=True, check=True,
        ).stdout.strip()
        if common:
            if not os.path.isabs(common):
                common = os.path.join(this_root, common)
            candidate = os.path.dirname(os.path.abspath(common))
            if os.path.isdir(candidate):
                main_root = candidate
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return this_root, main_root


def find_env_file(name):
    """Locate an env file, preferring this checkout, falling back to the main one."""
    this_root, main_root = repo_roots()
    for root in (this_root, main_root):
        path = os.path.join(root, name)
        if os.path.isfile(path):
            return path
    return None


def read_env_value(env_file, key):
    if not env_file:
        return None
    try:
        with open(env_file, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith(f"{key}="):
                    return line[len(key) + 1:].strip().strip('"').strip("'")
    except OSError:
        return None
    return None


# --------------------------------------------------------------------------
# Live state
# --------------------------------------------------------------------------

def resolve_credentials(env_name):
    """Return (project_ref, token, source_description) for 'prod' or 'test'."""
    if env_name == "prod":
        env_file_name, token_var, ref_var = ".env.prod", "SUPABASE_ACCESS_TOKEN_PROD", "SUPABASE_PROJECT_REF_PROD"
    else:
        env_file_name, token_var, ref_var = ".env.local", "SUPABASE_ACCESS_TOKEN_TEST", "SUPABASE_PROJECT_REF_TEST"

    env_file = find_env_file(env_file_name)

    token = os.environ.get(token_var) or read_env_value(env_file, "SUPABASE_ACCESS_TOKEN")
    ref = os.environ.get(ref_var)
    if not ref:
        url = read_env_value(env_file, "VITE_SUPABASE_URL") or ""
        m = re.match(r"https://([a-z0-9]+)\.", url)
        ref = m.group(1) if m else None

    source = f"${token_var}" if os.environ.get(token_var) else (env_file or f"<{env_file_name} not found>")
    return ref, token, source


def fetch_policies(env_name):
    """Run the pg_policies SELECT against one project. Raises RuntimeError on any failure."""
    ref, token, source = resolve_credentials(env_name)
    if not ref:
        raise RuntimeError(f"{env_name}: could not determine project ref (source: {source})")
    if not token:
        raise RuntimeError(f"{env_name}: no access token (source: {source})")

    req = urllib.request.Request(
        f"{API_HOST}/v1/projects/{ref}/database/query",
        data=json.dumps({"query": POLICY_QUERY}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            # api.supabase.com sits behind Cloudflare, which rejects urllib's default
            # "Python-urllib/x.y" signature with HTTP 403 / error code 1010 before the
            # request ever reaches Supabase. That looks exactly like an auth failure
            # and is not one. Observed 2026-08-12; curl (which migrate.sh uses) is
            # unaffected because it sends a conventional User-Agent.
            "User-Agent": "claritypledge-rls-drift-check/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise RuntimeError(f"{env_name}: HTTP {exc.code} from Management API: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{env_name}: cannot reach Management API: {exc.reason}") from exc

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{env_name}: unparseable API response: {body[:200]}") from exc

    # The Management API returns HTTP 200 with an error OBJECT when the SQL itself
    # fails (P417). An object here is a failure, not an empty result — treating it
    # as "no policies" would make a broken check look like a clean database.
    if isinstance(parsed, dict):
        raise RuntimeError(f"{env_name}: API returned an error object: {json.dumps(parsed)[:300]}")
    if not isinstance(parsed, list):
        raise RuntimeError(f"{env_name}: unexpected API response shape: {type(parsed).__name__}")
    if not parsed:
        raise RuntimeError(
            f"{env_name}: pg_policies returned zero rows. This project has RLS policies, "
            "so an empty result means the query or the credentials are wrong, not that "
            "the database is clean."
        )
    return parsed


def load_snapshot(path):
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise RuntimeError(f"{path}: expected a JSON array of pg_policies rows")
    return data


# --------------------------------------------------------------------------
# Normalisation
# --------------------------------------------------------------------------

def key_of(row):
    return (row.get("tablename") or "", row.get("policyname") or "")


def definition_of(row):
    """The comparable body of a policy — everything except its identity."""
    def norm(v):
        if v is None:
            return None
        return " ".join(str(v).split())
    return {
        "permissive": norm(row.get("permissive")),
        "roles": norm(row.get("roles")),
        "cmd": norm(row.get("cmd")),
        "qual": norm(row.get("qual")),
        "with_check": norm(row.get("with_check")),
    }


def index_by_key(rows):
    return {key_of(r): r for r in rows}


# --------------------------------------------------------------------------
# The migration-files leg
# --------------------------------------------------------------------------

# Matches `CREATE POLICY "name" ON public.table` and the unquoted variant, across
# newlines. Deliberately captures the NAME only for the membership test below.
CREATE_POLICY_RE = re.compile(
    r'CREATE\s+POLICY\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_$]*))',
    re.IGNORECASE,
)


def policy_names_in_migrations(migrations_dir):
    """Every policy name any migration has ever CREATEd.

    This is a MEMBERSHIP test, not a replay. It answers exactly one question:
    "was this live policy ever created by a file in this repo?" A name absent
    from this set was applied out-of-band — that is P1046's origin 2, and it is
    the only conclusion this leg draws.

    It deliberately does NOT resolve final state. Doing that would mean replaying
    210 migrations (226 CREATE POLICY / 134 DROP POLICY) into a scratch database
    or writing a parser that orders them; a parser that mis-resolves a re-create
    emits phantom drift, and phantom drift is what gets a check ignored. Whether
    a policy that IS in the files is still correct is the prod-vs-test leg's job.
    """
    if not os.path.isdir(migrations_dir):
        raise RuntimeError(f"migrations directory not found: {migrations_dir}")
    names = set()
    files = sorted(f for f in os.listdir(migrations_dir) if f.endswith(".sql"))
    if not files:
        raise RuntimeError(f"no .sql files in {migrations_dir}")
    for fname in files:
        with open(os.path.join(migrations_dir, fname), "r", encoding="utf-8", errors="replace") as fh:
            for m in CREATE_POLICY_RE.finditer(fh.read()):
                names.add(m.group(1) or m.group(2))
    return names, len(files)


# --------------------------------------------------------------------------
# Allowlist
# --------------------------------------------------------------------------

def load_allowlist(path):
    """Parse `direction|table|policyname` lines. Returns (set_of_entries, errors)."""
    entries, errors = set(), []
    if not os.path.isfile(path):
        return entries, errors
    with open(path, "r", encoding="utf-8") as fh:
        for lineno, raw in enumerate(fh, 1):
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) != 3:
                errors.append(f"{path}:{lineno}: expected 'direction|table|policy', got: {line}")
                continue
            direction, table, policy = parts
            if direction not in ALL_DIRECTIONS:
                errors.append(f"{path}:{lineno}: unknown direction '{direction}' (expected one of {', '.join(ALL_DIRECTIONS)})")
                continue
            entries.add((direction, table, policy))
    return entries, errors


# --------------------------------------------------------------------------
# Diff
# --------------------------------------------------------------------------

def compute_findings(prod_rows, test_rows, file_names):
    prod, test = index_by_key(prod_rows), index_by_key(test_rows)
    findings = []

    for key in sorted(set(prod) | set(test)):
        table, policy = key
        in_prod, in_test = key in prod, key in test
        if in_prod and not in_test:
            findings.append({
                "direction": DIR_PROD_ONLY, "table": table, "policy": policy,
                "detail": definition_of(prod[key]),
            })
        elif in_test and not in_prod:
            findings.append({
                "direction": DIR_TEST_ONLY, "table": table, "policy": policy,
                "detail": definition_of(test[key]),
            })
        else:
            d_prod, d_test = definition_of(prod[key]), definition_of(test[key])
            if d_prod != d_test:
                findings.append({
                    "direction": DIR_DIFFERS, "table": table, "policy": policy,
                    "detail": {"prod": d_prod, "test": d_test},
                })

    # Origin 2: live in either environment, created by no migration in the repo.
    for key in sorted(set(prod) | set(test)):
        table, policy = key
        if policy not in file_names:
            findings.append({
                "direction": DIR_NOT_IN_FILES, "table": table, "policy": policy,
                "detail": {"live_in": [e for e, idx in (("prod", prod), ("test", test)) if key in idx]},
            })

    return findings


def apply_allowlist(findings, allowlist):
    for f in findings:
        f["allowlisted"] = (f["direction"], f["table"], f["policy"]) in allowlist
    return findings


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------

HEADINGS = {
    DIR_PROD_ONLY: "PROD-ONLY — live on prod, absent from test (security-relevant)",
    DIR_NOT_IN_FILES: "NOT IN MIGRATIONS — live but created by no migration in this repo (security-relevant)",
    DIR_DIFFERS: "DIFFERS — same policy, different definition between environments (review)",
    DIR_TEST_ONLY: "TEST-ONLY — live on test, absent from prod (usually expected)",
}

NOT_COVERED = """WHAT THIS CHECK DOES NOT COVER
  - Only RLS policies on schema `public`. Not table/column GRANTs, not role
    memberships, not RPC definitions, not SECURITY DEFINER function bodies.
  - The migrations leg is a membership test, not a replay: it proves a policy was
    never created by any file in this repo. It cannot tell you that a policy which
    IS in the files still matches what the files would produce today.
  - Policies renamed by ALTER POLICY ... RENAME are not tracked; the new name will
    read as absent from migrations.
  - Green means these three queries agreed. It is not a statement about prod."""


def render(findings, counts, allowlist_path, migration_file_count):
    out = []
    out.append("=" * 78)
    out.append("RLS DRIFT CHECK (P1048) — live prod vs live test vs migration files")
    out.append("=" * 78)
    out.append(f"prod policies: {counts['prod']}   test policies: {counts['test']}   "
               f"migrations scanned: {migration_file_count}")
    out.append("")

    active = [f for f in findings if not f["allowlisted"]]
    suppressed = [f for f in findings if f["allowlisted"]]

    for direction in ALL_DIRECTIONS:
        group = [f for f in active if f["direction"] == direction]
        if not group:
            continue
        out.append(HEADINGS[direction])
        for f in group:
            out.append(f"  {f['table']}.{f['policy']}")
            detail = f["detail"]
            if direction == DIR_DIFFERS:
                for side in ("prod", "test"):
                    fields = ", ".join(f"{k}={v!r}" for k, v in detail[side].items() if v is not None)
                    out.append(f"      {side}: {fields}")
            elif direction == DIR_NOT_IN_FILES:
                out.append(f"      live in: {', '.join(detail['live_in'])}")
            else:
                fields = ", ".join(f"{k}={v!r}" for k, v in detail.items() if v is not None)
                out.append(f"      {fields}")
        out.append("")

    if suppressed:
        out.append(f"ALLOWLISTED ({len(suppressed)}) — see {allowlist_path}")
        for f in suppressed:
            out.append(f"  [{f['direction']}] {f['table']}.{f['policy']}")
        out.append("")

    failing = [f for f in active if f["direction"] in FAILING_DIRECTIONS]
    if failing:
        out.append(f"RESULT: DRIFT — {len(failing)} unallowlisted security-relevant finding(s).")
        out.append("Do not auto-remediate. Investigate each, then converge via a migration.")
    else:
        other = len(active)
        out.append("RESULT: no unallowlisted prod-only or absent-from-migrations policy."
                   + (f" ({other} non-gating finding(s) above.)" if other else ""))
    out.append("")
    out.append(NOT_COVERED)
    return "\n".join(out)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Detect RLS policy drift (P1048). Read-only.")
    ap.add_argument("--prod-json", help="read the prod snapshot from a file instead of the API")
    ap.add_argument("--test-json", help="read the test snapshot from a file instead of the API")
    ap.add_argument("--dump-prod", metavar="FILE", help="write the live prod snapshot to FILE and exit")
    ap.add_argument("--dump-test", metavar="FILE", help="write the live test snapshot to FILE and exit")
    ap.add_argument("--migrations", help="override the migrations directory")
    ap.add_argument("--allowlist", help="override the allowlist path")
    ap.add_argument("--json", action="store_true", help="emit the findings as JSON")
    args = ap.parse_args()

    this_root, _ = repo_roots()
    migrations_dir = args.migrations or os.path.join(this_root, "supabase", "migrations")
    allowlist_path = args.allowlist or os.path.join(this_root, "scripts", "rls-drift-allowlist.txt")

    try:
        if args.dump_prod or args.dump_test:
            for env_name, path in (("prod", args.dump_prod), ("test", args.dump_test)):
                if path:
                    with open(path, "w", encoding="utf-8") as fh:
                        json.dump(fetch_policies(env_name), fh, indent=2)
                    print(f"wrote {env_name} snapshot: {path}")
            return 0

        prod_rows = load_snapshot(args.prod_json) if args.prod_json else fetch_policies("prod")
        test_rows = load_snapshot(args.test_json) if args.test_json else fetch_policies("test")
        file_names, migration_file_count = policy_names_in_migrations(migrations_dir)
    except (RuntimeError, OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        print("The check did NOT run. This is not a clean result.", file=sys.stderr)
        return 2

    allowlist, allowlist_errors = load_allowlist(allowlist_path)
    if allowlist_errors:
        for err in allowlist_errors:
            print(f"ERROR: {err}", file=sys.stderr)
        print("Refusing to run with a malformed allowlist — a line that fails to parse "
              "would silently suppress nothing while looking like it suppresses something.",
              file=sys.stderr)
        return 2

    findings = apply_allowlist(
        compute_findings(prod_rows, test_rows, file_names), allowlist
    )
    counts = {"prod": len(prod_rows), "test": len(test_rows)}

    if args.json:
        print(json.dumps({
            "counts": counts,
            "migrations_scanned": migration_file_count,
            "findings": findings,
        }, indent=2))
    else:
        print(render(findings, counts, allowlist_path, migration_file_count))

    failing = [f for f in findings
               if not f["allowlisted"] and f["direction"] in FAILING_DIRECTIONS]
    return 1 if failing else 0


if __name__ == "__main__":
    sys.exit(main())
