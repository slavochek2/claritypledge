#!/usr/bin/env python3
"""supabase-readonly-sql.py — P1214: run one read-only SQL query, holding no write authority.

The one path for skills and scripts that only LOOK at production (or test) data. It
exists so that a daily or weekly report never has to hold the prod master key or the
account-wide platform token just to count rows.

    python3 scripts/supabase-readonly-sql.py --env prod "SELECT count(*) AS n FROM public.profiles"
    echo "SELECT ..." | python3 scripts/supabase-readonly-sql.py --env prod

Output: the result rows as a JSON array on stdout — the same shape a PostgREST GET
returns, so existing `len(r)` / `r[0]["n"]` parsers keep working.

Exit codes:
  0  query ran; stdout is a JSON array
  2  the query could NOT run. stdout carries {"message": "..."} (never an array), so a
     caller that renders "query failed: <message>" for a JSON object still does; the
     detail also goes to stderr. Never read exit 2 as "zero rows".

Three properties this relies on, all measured 2026-09-15 against the live token:

1. CREDENTIAL. Only SUPABASE_READONLY_TOKEN — a project-scoped `Database: Read` token.
   There is deliberately NO fallback to SUPABASE_ACCESS_TOKEN or any service-role key:
   a fallback would silently put write authority back into every caller, and because
   both paths return the same rows nothing would look different.
2. ENDPOINT. /database/query/read-only, which executes as supabase_read_only_user inside
   a read-only transaction (DDL returns SQLSTATE 25006). The token is read-only even on
   the read-write endpoint; using the read-only one as well costs nothing.
3. NOT BLIND. supabase_read_only_user currently has BYPASSRLS, so counts over RLS tables
   (profiles, auth.users) are complete. If a future token or role change removed that,
   every count would shrink silently and still exit 0 — the 2026-09-14 failure shape,
   where a privilege reduction blinded its own detector. So every call asserts
   rolbypassrls in the SAME request and refuses to return rows without it.

Values never pass through argv: the token is read from the environment or an env file
and sent in a request header by this process.

WHAT THIS IS NOT (independent review, 2026-09-15). The caller's SQL is TRUSTED — it comes
from this repo's own skills and scripts. The subquery wrapper is not a sandbox: a caller who
deliberately writes unbalanced SQL can break out of it, and could shape the response so the
RLS-bypass check reads true. The security boundary is the credential and the endpoint — a
read-only token inside a read-only transaction cannot write whatever SQL it sends. The bypass
check defends against the helper going BLIND after a role change, not against a hostile caller.
The token itself is deliberately NOT behind the per-access lock: it cannot write, and its
consumers include daily checks (decisions.md 2026-09-08). Its residual risk — a full read of
prod including emails if it leaks — is P1214's recorded ACCEPT.
"""
import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse

API_HOST = os.environ.get("SUPABASE_API_HOST", "https://api.supabase.com")
USER_AGENT = "claritypledge-supabase-readonly-sql/1.0"
# Cloudflare fronts api.supabase.com and 403s urllib's default User-Agent before the
# request reaches Supabase — indistinguishable from an auth failure. Always send ours.


def fail(message):
    """Exit 2 with a JSON object on stdout (never an array) and the reason on stderr."""
    print(json.dumps({"message": message}))
    sys.stderr.write(f"supabase-readonly-sql: {message}\n")
    sys.exit(2)


def _load_env_helpers():
    """Reuse rls-drift-check.py's env-file resolution (worktree -> main checkout fallback).

    Looked up next to this file first, then at the current checkout's root, so the same
    helper works from the main checkout, a worktree, or a copy under test.
    """
    candidates = [os.path.join(os.path.dirname(os.path.abspath(__file__)), "rls-drift-check.py")]
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                             capture_output=True, text=True, check=True).stdout.strip()
        candidates.append(os.path.join(top, "scripts", "rls-drift-check.py"))
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    for path in candidates:
        if os.path.isfile(path):
            spec = importlib.util.spec_from_file_location("_rls_drift_check", path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            return mod
    fail("cannot locate scripts/rls-drift-check.py for env-file resolution")


def resolve(env_name):
    rls = _load_env_helpers()
    env_file = rls.find_env_file(".env.prod" if env_name == "prod" else ".env.local")
    token = os.environ.get("SUPABASE_READONLY_TOKEN") or rls.read_env_value(env_file, "SUPABASE_READONLY_TOKEN")
    ref = os.environ.get("SUPABASE_PROJECT_REF_PROD" if env_name == "prod" else "SUPABASE_PROJECT_REF_TEST")
    if not ref:
        m = re.match(r"https://([a-z0-9]+)\.", rls.read_env_value(env_file, "VITE_SUPABASE_URL") or "")
        ref = m.group(1) if m else None
    if not token:
        fail(f"no SUPABASE_READONLY_TOKEN for {env_name} (env var, or {env_file or 'the env file'}). "
             "This helper never falls back to a write-capable credential — issue the scoped "
             "Database:Read token instead (P1214).")
    if not ref:
        fail(f"could not determine the {env_name} project ref")
    return ref, token


def build_query(sql):
    body = sql.strip().rstrip(";").strip()
    if not body:
        fail("empty SQL")
    # One request: the RLS-bypass assertion and the rows travel together, so there is no
    # window in which a different role answers the check than answers the query.
    return ("SELECT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS __bypassrls, "
            "current_user AS __role, "
            f"(SELECT coalesce(json_agg(__q), '[]'::json) FROM ({body}) AS __q) AS __rows")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--env", choices=["prod", "test"], default="prod")
    ap.add_argument("sql", nargs="?", help="SQL (a single SELECT); read from stdin when omitted")
    args = ap.parse_args()
    sql = args.sql if args.sql is not None else sys.stdin.read()

    host = urlparse(API_HOST)
    if API_HOST != "https://api.supabase.com" and host.hostname not in ("127.0.0.1", "localhost"):
        # The override exists for the hermetic canary only. Never let it route a real
        # token to an arbitrary host.
        fail(f"SUPABASE_API_HOST may only point at localhost (got {host.hostname})")

    ref, token = resolve(args.env)
    req = urllib.request.Request(
        f"{API_HOST}/v1/projects/{ref}/database/query/read-only",
        data=json.dumps({"query": build_query(sql)}).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "User-Agent": USER_AGENT},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        fail(f"{args.env}: HTTP {exc.code}: {exc.read().decode('utf-8', errors='replace')[:300]}")
    except urllib.error.URLError as exc:
        fail(f"{args.env}: cannot reach the Management API: {exc.reason}")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        fail(f"{args.env}: unparseable API response: {raw[:200]}")
    # A 2xx can still carry an error object ({"message": ...}) — the P417 shape.
    if not isinstance(parsed, list) or len(parsed) != 1 or "__rows" not in parsed[0]:
        fail(f"{args.env}: unexpected response shape: {raw[:300]}")
    row = parsed[0]
    if row.get("__bypassrls") is not True:
        fail(f"{args.env}: role {row.get('__role')!r} does not bypass RLS — counts over RLS tables "
             "would be silently incomplete, so no rows are returned. Re-check the token's role.")
    rows = row["__rows"]
    if isinstance(rows, str):  # json columns may arrive serialized, depending on API version
        rows = json.loads(rows)
    if not isinstance(rows, list):
        fail(f"{args.env}: rows did not decode to an array")
    print(json.dumps(rows))


if __name__ == "__main__":
    main()
