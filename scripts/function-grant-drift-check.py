#!/usr/bin/env python3
"""
P1065 — Detect function EXECUTE-grant drift, and whether the guard behind a grant
actually refuses an unauthenticated caller.

READ-ONLY. This script never issues DDL, never GRANTs, never REVOKEs, and commits
nothing. The grant leg runs one SELECT per environment. The guard leg (test only)
runs each probe inside an explicit transaction that ends in ROLLBACK.

Why this exists
---------------
P1063 found four RPCs executable by unauthenticated callers on prod. Every one
already carried a lockdown in its own migration; the lockdown had never taken
effect. Nothing in this repo could have detected that:

  - `rls-drift-check.py` compares POLICIES. Nothing read `pg_proc.proacl` or
    `has_function_privilege()`.
  - Grepping the migrations is actively misleading: the ineffective revoke form
    and the working one are textually near-identical, and the ineffective one
    raises no error. Two of the three known instances never appeared in migration
    text at all (an out-of-band function, and an overload orphaned by
    CREATE OR REPLACE on a changed signature).

The defect was found by accident while verifying something else. This check reads
the live catalog instead, and diffs it against P1064's committed allowlist
(`scripts/anon-execute-allowlist.txt`).

Why the guard leg lives in the same script (absorbed from P1066)
----------------------------------------------------------------
A finding only exists in the CONJUNCTION of two facts: the function is reachable
by an anonymous caller, AND its identity guard fails to refuse one. Either alone
is not a vulnerability — a degenerate guard on a function with no anon grant is
unreachable, and an anon grant on a correctly-guarded function is the product
working. Splitting the two halves across two scripts forces a human to perform
that join every morning, which is how a signal gets tuned out.

P1066 originally proposed detecting the guard half by grepping migration text.
That was red-teamed and withdrawn: the unsafe form and P1053's sanctioned fix are
textual siblings, the house idiom routes identity through a variable (22
`:= auth.uid()` assignments across 18 files), and the text-level check cannot
evaluate the grant half at all. Observing the refusal replaces reading the guard,
and every one of those evasions collapses into one signal.

Exit codes:
  0  no unallowlisted anon-executable function and no prod/test grant divergence
  1  gating drift found (details on stdout)
  2  the check could not run (credentials, API error, unreadable allowlist,
     or a probe that cannot distinguish refusal from success)

Exit 2 is deliberately distinct from 1: a check that could not run must never be
mistaken for a check that found nothing.

Usage
-----
  scripts/function-grant-drift-check.py              # full run: grants + guard probe
  scripts/function-grant-drift-check.py --summary    # one line, for callers like /day
  scripts/function-grant-drift-check.py --json
  scripts/function-grant-drift-check.py --no-probe   # grant leg only, no DB calls to functions
  scripts/function-grant-drift-check.py --update-baseline
  scripts/function-grant-drift-check.py --self-test-fail-injection SIGNATURE
        # pretend SIGNATURE is anon-executable and unlisted; used to exercise the
        # failure path without touching a live grant (epistemic gate 7)

Credentials and project refs resolve exactly as rls-drift-check.py does; this
script imports that resolution rather than restating it.
"""

import argparse
import importlib.util
import json
import os
import sys
import urllib.error
import urllib.request

# ---------------------------------------------------------------------------
# Reuse rls-drift-check's credential/env resolution rather than duplicating it.
# CLAUDE.md "Reference Over Duplication": two copies of the worktree/.env.prod
# fallback would diverge, and the one that diverges silently is the security one.
# ---------------------------------------------------------------------------

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "_rls_drift_check", os.path.join(_HERE, "rls-drift-check.py")
)
_rls = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_rls)

repo_roots = _rls.repo_roots
resolve_credentials = _rls.resolve_credentials

API_HOST = "https://api.supabase.com"
USER_AGENT = "claritypledge-function-grant-drift-check/1.0"

# ---------------------------------------------------------------------------
# Scope
# ---------------------------------------------------------------------------
#
# `public` alone is far too wide. On test it holds 211 functions, of which the
# `vector` extension owns 118. Gating on the raw set would emit ~162 findings on
# day one against a 17-entry allowlist — which is the "flag everything" outcome
# this check's own spec names as its failure mode, and is indistinguishable from
# switching it off.
#
# Three exclusions, each for a different reason:
#   - EXTENSION-OWNED (pg_depend deptype 'e'): not ours to grant or revoke. The
#     grants come with the extension; changing them is an extension concern.
#   - TRIGGER-RETURNING: not callable by a client at all. PostgREST cannot reach
#     them and neither can SQL; an EXECUTE grant on one is inert. P1064 excluded
#     8 of these from its own classification for the same reason.
#   - AGGREGATES / WINDOW functions (prokind <> 'f'): not RPC surface.
#
# What remains is the surface this repo actually authors: 62 callable functions
# on test, 32 anon-executable — the same 32 P1064 classified. If that arithmetic
# ever stops matching, the scope filter has drifted and this comment is the place
# to start.

GRANT_QUERY = """
select p.oid::regprocedure::text                     as signature,
       p.proname                                     as name,
       p.prosecdef                                   as secdef,
       p.proretset                                   as retset,
       coalesce(
         (select array_agg(format_type(t, null) order by ord)
            from unnest(p.proargtypes) with ordinality as a(t, ord)),
         array[]::text[]
       )                                             as argtypes,
       has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_type rt     on rt.oid = p.prorettype
where n.nspname = 'public'
  and p.prokind = 'f'
  and rt.typname <> 'trigger'
  and not exists (
        select 1 from pg_depend d
         where d.objid = p.oid
           and d.classid = 'pg_proc'::regclass
           and d.deptype = 'e'
      )
order by 1
"""

# Directions. Only FAILING_DIRECTIONS affect the exit code.
#
# The split is deliberate and is the same one rls-drift-check.py makes. Grant
# drift is a catalog fact: the grant is there or it is not, and a finding is
# never a false positive. The guard probe is a heuristic — it calls a function
# with NULL arguments and reads what comes back, so it can misread an incidental
# error as a refusal. Letting the noisier leg carry the exit code would drag the
# whole check toward suppression, and the suppressed half would be the reliable
# one.
DIR_ANON_UNLISTED = "anon-unlisted"
DIR_GRANT_DIFFERS = "grant-differs"
DIR_FN_ENV_ONLY = "fn-env-only"
DIR_ALLOWLIST_STALE = "allowlist-stale"
DIR_GUARD_PERMITS = "guard-permits-anon"

FAILING_DIRECTIONS = (DIR_ANON_UNLISTED, DIR_GRANT_DIFFERS)
ALL_DIRECTIONS = (
    DIR_ANON_UNLISTED,
    DIR_GRANT_DIFFERS,
    DIR_GUARD_PERMITS,
    DIR_FN_ENV_ONLY,
    DIR_ALLOWLIST_STALE,
)

HEADINGS = {
    DIR_ANON_UNLISTED: "ANON-EXECUTABLE, NOT ALLOWLISTED — an anonymous caller can reach this (gating)",
    DIR_GRANT_DIFFERS: "GRANT DIFFERS — prod and test disagree on who may execute (gating)",
    DIR_GUARD_PERMITS: "GUARD PERMITS ANON — invoked unauthenticated on test, it did NOT refuse (report-only)",
    DIR_FN_ENV_ONLY: "FUNCTION IN ONE ENVIRONMENT ONLY — object drift, not grant drift (report-only)",
    DIR_ALLOWLIST_STALE: "ALLOWLIST ENTRY WITH NO LIVE GRANT — the entry is stale (report-only)",
}


# ---------------------------------------------------------------------------
# Live state
# ---------------------------------------------------------------------------

def run_sql(env_name, sql, timeout=90):
    """POST one SQL string to the Management API. Returns parsed JSON.

    Raises ApiError carrying the server's message on any non-200, so callers can
    distinguish "the function raised" from "the request failed".
    """
    ref, token, source = resolve_credentials(env_name)
    if not ref:
        raise RuntimeError(f"{env_name}: could not determine project ref (source: {source})")
    if not token:
        raise RuntimeError(f"{env_name}: no access token (source: {source})")

    req = urllib.request.Request(
        f"{API_HOST}/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            # Cloudflare fronts api.supabase.com and rejects urllib's default
            # "Python-urllib/x.y" with HTTP 403 before the request reaches
            # Supabase. That looks exactly like an auth failure and is not one.
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raise ApiError(exc.code, exc.read().decode("utf-8", errors="replace")[:600]) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{env_name}: cannot reach Management API: {exc.reason}") from exc

    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{env_name}: unparseable API response: {body[:200]}") from exc


class ApiError(Exception):
    """A non-200 from the Management API. For a probe, this is the refusal."""

    def __init__(self, status, detail):
        super().__init__(f"HTTP {status}: {detail}")
        self.status = status
        self.detail = detail


def fetch_functions(env_name):
    parsed = run_sql(env_name, GRANT_QUERY)
    # The Management API returns HTTP 200 with an error OBJECT when the SQL
    # itself fails. An object here is a failure, not an empty result — treating
    # it as "no functions" would make a broken check look like a clean database.
    if isinstance(parsed, dict):
        raise RuntimeError(f"{env_name}: API returned an error object: {json.dumps(parsed)[:300]}")
    if not isinstance(parsed, list):
        raise RuntimeError(f"{env_name}: unexpected API response shape: {type(parsed).__name__}")
    if not parsed:
        raise RuntimeError(
            f"{env_name}: the function query returned zero rows. This project has "
            "public functions, so an empty result means the query or the credentials "
            "are wrong, not that the surface is clean."
        )
    return {normalise_signature(r["signature"]): r for r in parsed}


def load_snapshot(path):
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise RuntimeError(f"{path}: expected a JSON array of function rows")
    return {normalise_signature(r["signature"]): r for r in data}


def normalise_signature(sig):
    """Collapse whitespace so `fn(uuid, jsonb)` and `fn(uuid,jsonb)` are one key.

    regprocedure's rendering and the allowlist's hand-written entries do not
    agree on the space after a comma, and a signature that fails to match its
    allowlist entry reads as an unlisted anon-executable function — a false
    alarm in the one leg that gates.
    """
    return "".join(str(sig).split())


# ---------------------------------------------------------------------------
# Allowlist
# ---------------------------------------------------------------------------

def load_allowlist(path):
    """Parse `signature  # reason` lines. Returns (dict signature->reason, errors).

    An entry with no reason is an error, not a warning. The allowlist's own
    header makes the reason load-bearing: it is the record of the anon call site
    that justifies the grant, and an entry without one is the "this looks like a
    guest path" reasoning the file exists to prevent.
    """
    entries, errors = {}, []
    if not os.path.isfile(path):
        errors.append(f"{path}: allowlist not found — without it this check has no baseline")
        return entries, errors
    with open(path, "r", encoding="utf-8") as fh:
        for lineno, raw in enumerate(fh, 1):
            if not raw.strip() or raw.lstrip().startswith("#"):
                continue
            sig, sep, reason = raw.partition("#")
            sig = sig.strip()
            if not sig:
                continue
            if not sep or not reason.strip():
                errors.append(f"{path}:{lineno}: entry has no reason: {sig}")
                continue
            if "(" not in sig or not sig.endswith(")"):
                errors.append(
                    f"{path}:{lineno}: not a function signature (expected `name(argtype,...)`): {sig}"
                )
                continue
            entries[normalise_signature(sig)] = reason.strip()
    return entries, errors


# ---------------------------------------------------------------------------
# Grant diff
# ---------------------------------------------------------------------------

def compute_grant_findings(prod, test, allowlist):
    findings = []

    for sig in sorted(set(prod) | set(test)):
        in_prod, in_test = sig in prod, sig in test

        if not (in_prod and in_test):
            # Object drift, not grant drift. P1054 owns whether an object should
            # exist; this check owns who may execute it. Reported so the reader
            # sees why a signature is missing from the comparison, never gated —
            # test routinely carries functions ahead of a prod deploy, and gating
            # on that would fire on every unshipped migration.
            findings.append({
                "direction": DIR_FN_ENV_ONLY,
                "signature": sig,
                "detail": {"live_in": ["prod"] if in_prod else ["test"]},
            })
            continue

        p, t = prod[sig], test[sig]
        if (p["anon_exec"], p["auth_exec"]) != (t["anon_exec"], t["auth_exec"]):
            findings.append({
                "direction": DIR_GRANT_DIFFERS,
                "signature": sig,
                "detail": {
                    "prod": {"anon": p["anon_exec"], "authenticated": p["auth_exec"]},
                    "test": {"anon": t["anon_exec"], "authenticated": t["auth_exec"]},
                },
            })

    # The gating question. Asked of PROD, because prod is the surface an
    # anonymous caller can actually reach. A test-only anon grant is caught by
    # grant-differs above.
    for sig in sorted(prod):
        if prod[sig]["anon_exec"] and sig not in allowlist:
            findings.append({
                "direction": DIR_ANON_UNLISTED,
                "signature": sig,
                "detail": {"secdef": prod[sig]["secdef"]},
            })

    # A stale entry is not dangerous, but it is misleading: it is a standing
    # claim that an anon call site exists. Reported so the allowlist stays a
    # record of reality rather than of history.
    for sig in sorted(allowlist):
        if sig not in prod:
            findings.append({
                "direction": DIR_ALLOWLIST_STALE,
                "signature": sig,
                "detail": {"why": "no such function on prod"},
            })
        elif not prod[sig]["anon_exec"]:
            findings.append({
                "direction": DIR_ALLOWLIST_STALE,
                "signature": sig,
                "detail": {"why": "function exists on prod but carries no anon EXECUTE grant"},
            })

    return findings


# ---------------------------------------------------------------------------
# The guard probe — behavioural, test only, always rolled back
# ---------------------------------------------------------------------------
#
# WHY THIS SHAPE, AND WHAT IT DOES NOT SEE.
#
# The faithful reproduction of an attack is an unauthenticated POST to PostgREST
# with the anon key. This check does NOT do that, for one reason: a function whose
# guard is degenerate is exactly the function whose body then runs, and over REST
# there is no way to undo it. A daily monitor that writes damage into test on
# precisely the days it finds something is not a monitor. P1064's own
# classification pass made the same call and probed transactionally.
#
# So each probe is:
#
#     BEGIN;
#     SET LOCAL ROLE anon;                  -- current_user = anon
#     SET LOCAL "request.jwt.claims" TO ''; -- auth.uid() IS NULL
#     SELECT public.fn(NULL::t1, NULL::t2);
#     ROLLBACK;
#
# `auth.uid()` reads the request.jwt.claims GUC, so under this setup it returns
# NULL exactly as it does for a real anonymous REST call — verified live, not
# assumed. That is the identity condition the whole defect class turns on.
#
# WHAT IT CANNOT SEE (epistemic gate 7b — the honest list):
#   - PostgREST's own layer. Schema exposure, its argument coercion, and its
#     error mapping are all upstream of this probe and are not exercised.
#   - Any guard that depends on request headers other than the JWT.
#   - Anything that only fails with REAL arguments. Probes pass NULL for every
#     parameter, so a function that refuses NULL for an unrelated reason (a NOT
#     NULL column, a lookup that finds no row) reads as "refused" when its guard
#     may not refuse a well-formed anonymous call. This leg UNDER-reports, which
#     is the safe direction for a report-only signal but is not the same as
#     silence meaning safety.
#   - Side effects that survive ROLLBACK: anything a function does outside the
#     transaction (pg_net calls, dblink, advisory locks, sequence consumption).
#     Sequence burn is harmless; an outbound HTTP call is not undone.
#
# A "refusal" here means the statement raised. The SQLSTATE is reported alongside
# so a reader can tell an authorization refusal (42501, or a bespoke RAISE) from
# an incidental one (23502 not-null violation), rather than the check guessing.

PROBE_PREAMBLE = 'BEGIN; SET LOCAL ROLE anon; SET LOCAL "request.jwt.claims" TO \'\';'


def probe_statement(row):
    args = ", ".join(f"NULL::{t}" for t in (row.get("argtypes") or []))
    call = f'public."{row["name"]}"({args})'
    if row.get("retset"):
        return f"SELECT * FROM {call} LIMIT 1"
    return f"SELECT {call}"


def run_probe(env_name, inner_sql):
    """Run one statement as an unauthenticated caller and roll it back.

    Returns (permitted: bool, detail: str).
    """
    sql = f"{PROBE_PREAMBLE} {inner_sql}; ROLLBACK;"
    try:
        run_sql(env_name, sql, timeout=45)
        return True, "returned without raising"
    except ApiError as exc:
        return False, summarise_error(exc.detail)


def summarise_error(detail):
    """Pull the SQLSTATE and message out of the API's error envelope."""
    try:
        msg = json.loads(detail).get("message", detail)
    except (json.JSONDecodeError, AttributeError):
        msg = detail
    return " ".join(str(msg).split())[:220]


def probe_self_check(env_name):
    """Prove the probe can distinguish both outcomes before trusting any result.

    A probe that reports "refused" for everything looks exactly like a clean
    surface. Two controls run through the IDENTICAL path:

      positive control — `SELECT 1` must come back permitted
      negative control — `SELECT 1/0` must come back refused

    If either control is wrong, the probe is blind and the guard leg is dropped
    rather than reported as clean. (~/.claude/CLAUDE.md: when a probe returns
    emptiness for every candidate, run a known-good control through the identical
    probe on the identical metric.)
    """
    ok_permitted, ok_detail = run_probe(env_name, "SELECT 1")
    ok_refused, bad_detail = run_probe(env_name, "SELECT 1/0")
    problems = []
    if not ok_permitted:
        problems.append(f"positive control (SELECT 1) read as REFUSED: {ok_detail}")
    if ok_refused:
        problems.append("negative control (SELECT 1/0) read as PERMITTED")
    return problems, {"negative_control_sqlstate": bad_detail}


def compute_guard_findings(env_name, test_rows, allowlist, targets):
    """Probe each target and return (findings, control_info).

    Targets are the anon-executable functions on test that the allowlist does NOT
    cover — P1066's prescription. Allowlisted functions are deliberately excluded:
    an anonymous caller reaching those is the product working, so a "permitted"
    result there is the expected outcome and reporting it would be pure noise.
    """
    problems, control = probe_self_check(env_name)
    if problems:
        return None, {"blind": True, "problems": problems, **control}

    findings = []
    for sig in sorted(targets):
        row = test_rows.get(sig)
        if not row:
            continue
        permitted, detail = run_probe(env_name, probe_statement(row))
        if permitted:
            findings.append({
                "direction": DIR_GUARD_PERMITS,
                "signature": sig,
                "detail": {"probe": detail, "env": env_name},
            })
    return findings, {"blind": False, "probed": len(targets), **control}


# ---------------------------------------------------------------------------
# Baseline — "known backlog", never an allowlist
# ---------------------------------------------------------------------------
#
# Same two-file split as rls-drift-check.py, for the same reason. The ALLOWLIST
# says "this is expected, forever" and removes a finding from the report. The
# BASELINE says "this is open, unfixed, and already on someone's list — tell me
# when the set CHANGES", and removes nothing: baselined findings still print on
# every run, they just stop re-raising the alarm.
#
# This check needs it more than the policy one does. On the day it ships, 32
# anon-executable functions face a 20-entry allowlist, and the remainder are a
# known backlog with specs already written. Without a baseline, wiring this into
# /day prints DRIFT every morning for findings the reader already knows about —
# which is Risk 1 in this check's own spec arriving through the front door.
#
# It lives under .private/ because it names live, unpatched function identities,
# which this public repo must not carry. When absent, every unallowlisted finding
# gates — so a missing baseline can only make the check louder, never quieter.

def default_baseline_path():
    _, main_root = repo_roots()
    return os.path.join(main_root, ".private", "function-grant-baseline.json")


def finding_key(f):
    return [f["direction"], f["signature"]]


def load_baseline(path):
    if not path or not os.path.isfile(path):
        return set(), False
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    entries = data.get("findings", []) if isinstance(data, dict) else data
    if not isinstance(entries, list):
        raise RuntimeError(f"{path}: expected a list under 'findings'")
    return {tuple(e) if isinstance(e, list) else (e["direction"], e["signature"])
            for e in entries}, True


def write_baseline(path, findings, note):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump({"note": note, "findings": [finding_key(f) for f in findings]}, fh, indent=2)
        fh.write("\n")


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

NOT_COVERED = """WHAT THIS CHECK DOES NOT COVER
  - EXECUTE on `public` functions only. Not table or column GRANTs, not role
    memberships, not RLS policies (that is scripts/rls-drift-check.py), not other
    schemas, and not functions owned by an extension.
  - Only the `anon` and `authenticated` roles. A grant to another role, or to
    PUBLIC via a path neither role inherits, is not compared.
  - has_function_privilege() answers "can this role execute it", which is the
    reachability question. It does not distinguish a role-direct grant from one
    inherited through PUBLIC — and BOTH must be revoked to close a hole (P1066).
    A revoke that removes only one leaves this check green and the hole open.
  - The guard probe runs on TEST only, with NULL arguments, inside a rolled-back
    transaction. It under-reports: an incidental error reads as a refusal. It
    does not exercise PostgREST, and it cannot undo effects that escape the
    transaction (outbound HTTP, advisory locks).
  - Nothing here proves a function is correct. An allowlisted, correctly-guarded
    function can still leak through its own logic.
  - Green means these queries agreed with the allowlist. It is not a statement
    that prod is safe."""


def render(findings, counts, allowlist_path, guard_info):
    out = []
    out.append("=" * 78)
    out.append("FUNCTION GRANT DRIFT CHECK (P1065) — live prod vs live test vs allowlist")
    out.append("=" * 78)
    out.append(
        f"prod functions: {counts['prod']}   test functions: {counts['test']}   "
        f"allowlist entries: {counts['allowlist']}"
    )
    out.append(
        f"anon-executable on prod: {counts['anon_prod']}   on test: {counts['anon_test']}"
    )
    if guard_info.get("blind"):
        out.append("guard probe: NOT RUN — the probe could not distinguish refusal from success:")
        for p in guard_info["problems"]:
            out.append(f"    {p}")
    elif guard_info.get("skipped"):
        out.append("guard probe: skipped (--no-probe)")
    else:
        out.append(f"guard probe: {guard_info.get('probed', 0)} function(s) invoked "
                   "unauthenticated on test, each rolled back")
    out.append("")

    for direction in ALL_DIRECTIONS:
        group = [f for f in findings if f["direction"] == direction]
        if not group:
            continue
        out.append(HEADINGS[direction])
        for f in group:
            out.append(f"  {f['signature']}")
            detail = f["detail"]
            if direction == DIR_GRANT_DIFFERS:
                for side in ("prod", "test"):
                    d = detail[side]
                    out.append(f"      {side}: anon={d['anon']}, authenticated={d['authenticated']}")
            elif direction == DIR_GUARD_PERMITS:
                out.append(f"      probed on {detail['env']}: {detail['probe']}")
            elif direction == DIR_FN_ENV_ONLY:
                out.append(f"      live in: {', '.join(detail['live_in'])}")
            elif direction == DIR_ALLOWLIST_STALE:
                out.append(f"      {detail['why']}")
            else:
                out.append(f"      SECURITY DEFINER: {detail.get('secdef')}")
        out.append("")

    gating = [f for f in findings if f["direction"] in FAILING_DIRECTIONS]
    if gating:
        out.append(f"RESULT: DRIFT — {len(gating)} gating finding(s).")
        out.append("Do not auto-revoke. Each one is a question: is there a real anonymous")
        out.append("call site? If yes, allowlist it with the file:line. If no, revoke via a")
        out.append("migration — BOTH from the role and from PUBLIC (P1066).")
    else:
        other = len(findings) - len(gating)
        out.append("RESULT: no unallowlisted anon-executable function, no prod/test grant divergence."
                   + (f" ({other} non-gating finding(s) above.)" if other else ""))
    out.append("")
    out.append(f"Allowlist: {allowlist_path}")
    out.append("")
    out.append(NOT_COVERED)
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(
        description="Detect function EXECUTE-grant drift and non-refusing guards (P1065). Read-only."
    )
    ap.add_argument("--prod-json", help="read the prod snapshot from a file instead of the API")
    ap.add_argument("--test-json", help="read the test snapshot from a file instead of the API")
    ap.add_argument("--dump-prod", metavar="FILE", help="write the live prod snapshot to FILE and exit")
    ap.add_argument("--dump-test", metavar="FILE", help="write the live test snapshot to FILE and exit")
    ap.add_argument("--allowlist", help="override the allowlist path")
    ap.add_argument("--no-probe", action="store_true",
                    help="grant leg only — do not invoke any function")
    ap.add_argument("--json", action="store_true", help="emit the findings as JSON")
    ap.add_argument("--baseline", metavar="FILE",
                    help="compare against a recorded backlog; gate only on findings NOT in it")
    ap.add_argument("--update-baseline", action="store_true",
                    help="rewrite the baseline from the current findings (records, never suppresses)")
    ap.add_argument("--summary", action="store_true", help="one line of output, for callers like /day")
    ap.add_argument("--self-test-fail-injection", metavar="SIGNATURE",
                    help="treat SIGNATURE as anon-executable and unlisted, to exercise the "
                         "failure path without touching a live grant")
    args = ap.parse_args()

    this_root, _ = repo_roots()
    allowlist_path = args.allowlist or os.path.join(this_root, "scripts", "anon-execute-allowlist.txt")

    try:
        if args.dump_prod or args.dump_test:
            for env_name, path in (("prod", args.dump_prod), ("test", args.dump_test)):
                if path:
                    with open(path, "w", encoding="utf-8") as fh:
                        json.dump(list(fetch_functions(env_name).values()), fh, indent=2)
                    print(f"wrote {env_name} snapshot: {path}")
            return 0

        prod = load_snapshot(args.prod_json) if args.prod_json else fetch_functions("prod")
        test = load_snapshot(args.test_json) if args.test_json else fetch_functions("test")
    except (ApiError, RuntimeError, OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        print("The check did NOT run. This is not a clean result.", file=sys.stderr)
        return 2

    allowlist, allowlist_errors = load_allowlist(allowlist_path)
    if allowlist_errors:
        for err in allowlist_errors:
            print(f"ERROR: {err}", file=sys.stderr)
        print("Refusing to run with a malformed allowlist — a line that fails to parse would "
              "silently suppress nothing while looking like it suppresses something.",
              file=sys.stderr)
        return 2

    # Fail-injection (epistemic gate 7). Flips one signature's anon grant in the
    # in-memory snapshot ONLY. It issues no GRANT, so exercising the failure path
    # never widens a live surface — which is what made this safe to run against
    # prod credentials and paste the exit code.
    if args.self_test_fail_injection:
        sig = normalise_signature(args.self_test_fail_injection)
        if sig not in prod:
            print(f"ERROR: --self-test-fail-injection: no such function on prod: {sig}",
                  file=sys.stderr)
            return 2
        prod[sig] = dict(prod[sig], anon_exec=True)
        allowlist.pop(sig, None)
        print(f"[self-test] pretending {sig} is anon-executable and unlisted. "
              "No live grant was changed.", file=sys.stderr)

    findings = compute_grant_findings(prod, test, allowlist)

    guard_info = {"skipped": True}
    if not args.no_probe and not args.test_json:
        targets = {s for s, r in test.items() if r["anon_exec"] and s not in allowlist}
        try:
            guard_findings, guard_info = compute_guard_findings("test", test, allowlist, targets)
        except (ApiError, RuntimeError) as exc:
            guard_findings, guard_info = None, {"blind": True, "problems": [str(exc)]}
        if guard_findings is not None:
            findings.extend(guard_findings)

    counts = {
        "prod": len(prod), "test": len(test), "allowlist": len(allowlist),
        "anon_prod": sum(1 for r in prod.values() if r["anon_exec"]),
        "anon_test": sum(1 for r in test.values() if r["anon_exec"]),
    }

    gating = [f for f in findings if f["direction"] in FAILING_DIRECTIONS]

    baseline_path = args.baseline or default_baseline_path()
    try:
        baseline, baseline_exists = load_baseline(baseline_path)
    except (OSError, json.JSONDecodeError, RuntimeError, KeyError, TypeError) as exc:
        print(f"ERROR: unreadable baseline {baseline_path}: {exc}", file=sys.stderr)
        print("The check did NOT run. This is not a clean result.", file=sys.stderr)
        return 2

    new = [f for f in gating if tuple(finding_key(f)) not in baseline]
    known = [f for f in gating if tuple(finding_key(f)) in baseline]
    resolved = sorted(baseline - {tuple(finding_key(f)) for f in gating})

    if args.update_baseline:
        write_baseline(baseline_path, gating,
                       "Known-open function-grant findings. NOT an allowlist: these are unfixed, "
                       "still reported on every run, and still need specs. This file only stops "
                       "them re-raising the alarm daily. Regenerate with "
                       "scripts/function-grant-drift-check.py --update-baseline.")
        print(f"baseline updated: {baseline_path} now records {len(gating)} open finding(s).")
        return 0

    if args.json:
        print(json.dumps({
            "counts": counts,
            "guard_probe": guard_info,
            "findings": findings,
            "new": [finding_key(f) for f in new],
            "known": [finding_key(f) for f in known],
            "resolved": [list(k) for k in resolved],
        }, indent=2))
    elif args.summary:
        bits = []
        if new:
            bits.append(f"{len(new)} NEW")
        if known:
            bits.append(f"{len(known)} known-open")
        if resolved:
            bits.append(f"{len(resolved)} resolved since baseline")
        guards = [f for f in findings if f["direction"] == DIR_GUARD_PERMITS]
        if guard_info.get("blind"):
            bits.append("guard probe BLIND (not run)")
        elif guards:
            bits.append(f"{len(guards)} guard(s) did not refuse anon")
        if not bits:
            print("Function grants: clean (no unallowlisted anon-executable function, "
                  "no prod/test divergence).")
        else:
            head = "FUNCTION GRANT DRIFT" if new else "Function grants"
            # Tag each with its direction. One signature can legitimately raise
            # two gating findings (unlisted AND divergent), and an untagged list
            # renders that as the same name twice, which reads as a rendering bug
            # and invites someone to "fix" it by dropping a real finding.
            print(f"{head}: " + ", ".join(bits) + "."
                  + ("" if not new else " New: "
                     + "; ".join(f"{f['signature']} [{f['direction']}]" for f in new)))
            if resolved and not new:
                print("  Re-record the backlog: scripts/function-grant-drift-check.py --update-baseline")
    else:
        print(render(findings, counts, allowlist_path, guard_info))
        if baseline_exists:
            print()
            print(f"BASELINE ({baseline_path})")
            print(f"  {len(new)} new, {len(known)} known-open, {len(resolved)} resolved since it was recorded.")
            print("  Known-open findings are still unfixed and still listed above. The baseline")
            print("  only stops them re-raising the alarm on every run — it is not an allowlist.")

    return 1 if (new if baseline_exists else gating) else 0


if __name__ == "__main__":
    sys.exit(main())
