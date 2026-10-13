#!/usr/bin/env python3
"""
Self-test for scripts/function-grant-drift-check.py (P1065, epistemic gate 7).

A drift checker nobody has watched CATCH drift is unproven — a green run only
proves the happy path runs. This suite asserts the checker exits non-zero and
names the offender for each shape it claims to detect, and exits zero when the
surface is clean.

The shapes come from real incidents:
  - anon-executable and unlisted        P1063 (four RPCs reachable unauthenticated)
  - revoked on test, still open on prod P1063 (the lockdown that never took effect)
  - allowlist entry with no live grant  P1057 (a spec's functions not yet on prod)
  - a malformed allowlist               refuses to run rather than silently
                                        suppressing nothing

Hermetic: reads fixture JSON snapshots, makes no network calls, touches no
database. Passing `--test-json` also disables the guard probe in the checker, so
no function is ever invoked from this suite.

Run: scripts/test-function-grant-drift-check.py
Exit 0 = all assertions held. Exit 1 = the checker regressed.
"""

import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER = os.path.join(HERE, "function-grant-drift-check.py")
FIXTURES = os.path.join(HERE, "fixtures", "function-grant")

PROD_DRIFTED = os.path.join(FIXTURES, "prod-drifted.json")
TEST_CONVERGED = os.path.join(FIXTURES, "test-converged.json")
CLEAN = os.path.join(FIXTURES, "clean.json")
ALLOWLIST = os.path.join(FIXTURES, "allowlist-valid.txt")
ALLOWLIST_NO_REASON = os.path.join(FIXTURES, "allowlist-no-reason.txt")

results = []


def absent(name):
    """A path guaranteed not to exist, outside any tracked directory."""
    path = os.path.join(tempfile.gettempdir(), name)
    if os.path.exists(path):
        os.unlink(path)
    return path


def run(prod, test, allowlist=ALLOWLIST, baseline=None, extra=()):
    """Invoke the checker with every ambient input pinned.

    The allowlist and the baseline are ALWAYS explicit. The checker's defaults are
    the repo's real allowlist and a backlog file under .private/ — machine-local
    and gitignored. Letting either resolve would make this suite's verdict depend
    on the founder's working copy: green on one machine, red on another, for
    reasons unrelated to the code under test.
    """
    cmd = [sys.executable, CHECKER,
           "--prod-json", prod, "--test-json", test,
           "--allowlist", allowlist,
           "--baseline", baseline or absent("fgd-absent-baseline.json"),
           *extra]
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def check(label, condition, detail=""):
    results.append((label, bool(condition), detail))
    print(f"  {'PASS' if condition else 'FAIL'}  {label}"
          + (f"\n        {detail}" if detail and not condition else ""))


# ---------------------------------------------------------------------------
print("Drifted prod vs converged test")
code, out, err = run(PROD_DRIFTED, TEST_CONVERGED)

check("exits 1 on drift", code == 1, f"exit was {code}; stderr: {err[:300]}")
check("names the unlisted anon-executable function",
      "widget_leaked_rpc(uuid)" in out)
check("reports it under the gating heading",
      "ANON-EXECUTABLE, NOT ALLOWLISTED" in out)
# P1102: test revoked what prod still grants. That is the shape of every security
# fix between "applied to test" and "deployed to prod", so it is reported as a
# presumed in-flight fix — never as gating drift whose remedy is to restore prod's
# grant on test. The P1063 half of this shape (prod still open to anon, unlisted)
# keeps gating through anon-unlisted, which is asserted just above.
check("catches the prod-open / test-revoked divergence as a presumed in-flight fix",
      "TEST NARROWER THAN PROD" in out
      and "widget_owner_update(uuid,text)" in out.split("TEST NARROWER THAN PROD")[1])
check("the test-revoked divergence is not under the gating GRANT DIFFERS heading",
      "GRANT DIFFERS" not in out, out[:1200])

# The allowlist is the whole point: an entry with a real anon call site must make
# the finding disappear, or nobody will ever trust the file.
check("allowlisted anon-executable function is silent",
      "widget_public_lookup" not in out.split("ALLOWLIST ENTRY")[0])

# Whitespace: the allowlist is hand-written (`fn(uuid, jsonb)`), regprocedure is
# not (`fn(uuid,jsonb)`). A mismatch here reads as an unlisted anon-executable
# function — a false alarm in the ONLY leg that gates, which is the fastest way
# to train a reader to ignore the check.
check("spaced allowlist signature matches unspaced regprocedure rendering",
      "widget_spaced_args" not in out.split("ALLOWLIST ENTRY")[0])

check("function with no anon grant is not reported",
      "widget_locked_down" not in out)

# widget_owner_update is anon-executable-and-unlisted on prod AND narrower on test,
# so it raises TWO findings: a gating one and a report-only one. That is intended:
# they are different questions with different remedies (does an anon call site
# exist? / is the fix on test on its way to prod?), and collapsing them would hide
# whichever the reader did not think to ask. Pinned because a future
# de-duplication would look tidy and would silently drop a signal.
check("one function can raise two distinct findings",
      out.count("widget_owner_update(uuid,text)") >= 2,
      f"appeared {out.count('widget_owner_update(uuid,text)')} time(s)")

# Non-gating shapes must be visible but must not carry the exit code.
check("one-environment-only function is reported",
      "widget_prod_only()" in out and "widget_test_only(text)" in out)
check("stale allowlist entry is reported",
      "widget_absent_entry(text)" in out and "ALLOWLIST ENTRY WITH NO LIVE GRANT" in out)

# ---------------------------------------------------------------------------
print("\nNon-gating findings alone do not fail the run")
# clean vs clean differs only by allowlist staleness (widget_absent_entry), so any
# non-zero exit here means a report-only direction leaked into the exit code.
code, out, err = run(CLEAN, CLEAN)
check("exits 0 when only report-only findings exist", code == 0,
      f"exit was {code}; stdout tail: {out[-400:]}")
check("says so plainly", "RESULT: no unallowlisted anon-executable function" in out)
check("still prints the stale entry", "widget_absent_entry(text)" in out)

# ---------------------------------------------------------------------------
print("\nA malformed allowlist refuses to run")
code, out, err = run(PROD_DRIFTED, TEST_CONVERGED, allowlist=ALLOWLIST_NO_REASON)
check("exits 2, not 1", code == 2, f"exit was {code}")
check("exit 2 is explained as 'did not run', not as clean",
      "did NOT run" in err or "Refusing to run" in err)
check("names the offending line", "has no reason" in err)

# ---------------------------------------------------------------------------
print("\nA missing allowlist is an error, never an empty allowlist")
# Treating an absent allowlist as empty would make every anon-executable function
# gate — loud, but for the wrong reason, and it would mask a deleted file.
code, out, err = run(PROD_DRIFTED, TEST_CONVERGED, allowlist=absent("fgd-no-such-allowlist.txt"))
check("exits 2 when the allowlist is absent", code == 2, f"exit was {code}")
check("says the baseline is missing", "allowlist not found" in err)

# ---------------------------------------------------------------------------
print("\nBaseline records a backlog without suppressing it")
baseline_path = absent("fgd-baseline.json")
# Recorded by the checker itself rather than hand-written. Keys carry a severity
# shape (see finding_shape), so a hand-built key is a second, silently diverging
# implementation of the key format — and the divergence would show up as this
# suite passing while the real baseline never matches anything.
code, out, err = run(PROD_DRIFTED, TEST_CONVERGED, baseline=baseline_path,
                     extra=("--update-baseline",))
check("--update-baseline records the backlog", code == 0, f"exit {code}: {err[:200]}")
recorded = json.load(open(baseline_path))["findings"]
# Two, not three: since P1102 the test-narrower divergence is report-only, and a
# baseline records only what gates.
check("both gating findings are recorded, and the in-flight fix is not",
      len(recorded) == 2 and all(e[0] == "anon-unlisted" for e in recorded), str(recorded))

code, out, err = run(PROD_DRIFTED, TEST_CONVERGED, baseline=baseline_path)
check("a fully baselined backlog exits 0", code == 0, f"exit was {code}")
check("baselined findings are STILL printed (baseline is not an allowlist)",
      "widget_leaked_rpc(uuid)" in out)
check("the report says the backlog is still unfixed", "known-open" in out)

# A NEW finding on top of a recorded backlog must still gate — otherwise the
# baseline has quietly become the allowlist it is documented not to be.
partial = absent("fgd-baseline-partial.json")
with open(partial, "w", encoding="utf-8") as fh:
    # Derived from the recorded baseline with one entry dropped, so this asserts
    # "an unrecorded finding gates" and not merely "a wrongly-shaped key misses".
    json.dump({"findings": [e for e in recorded if e[0] != "anon-unlisted"
                            or "leaked" not in e[1]]}, fh)
code, out, err = run(PROD_DRIFTED, TEST_CONVERGED, baseline=partial)
check("a new finding on top of a baseline still exits 1", code == 1, f"exit was {code}")
check("the new finding is called out as NEW", "NEW" in out or "new" in out)

# ---------------------------------------------------------------------------
print("\nJSON and summary modes agree with the report")
code, out, err = run(PROD_DRIFTED, TEST_CONVERGED, extra=("--json",))
check("--json still exits 1", code == 1, f"exit was {code}")
try:
    payload = json.loads(out)
    directions = {f["direction"] for f in payload["findings"]}
    check("--json emits parseable findings",
          {"anon-unlisted", "grant-narrower-on-test"} <= directions
          and "grant-differs" not in directions, str(directions))
    check("--json counts match the fixtures",
          payload["counts"]["prod"] == 6 and payload["counts"]["test"] == 6,
          str(payload["counts"]))
except (json.JSONDecodeError, KeyError) as exc:
    check("--json emits parseable findings", False, str(exc))
    check("--json counts match the fixtures", False, "unparseable")

code, out, err = run(PROD_DRIFTED, TEST_CONVERGED, extra=("--summary",))
check("--summary exits 1 and stays to one screen", code == 1 and len(out.splitlines()) <= 3,
      f"exit {code}, {len(out.splitlines())} lines")
check("--summary names the new finding", "widget_leaked_rpc(uuid)" in out)

code, out, err = run(CLEAN, CLEAN, extra=("--summary",))
check("--summary on a clean surface says clean", code == 0 and "clean" in out,
      f"exit {code}: {out.strip()}")

# ---------------------------------------------------------------------------
print("\nA grant difference is judged by its direction (P1102)")
# The incident: a security fix revoked `authenticated` on test, prod was not yet
# patched, the check called it gating drift, and the remediation restored the grant
# on test — reverting the fix. A narrowing on test is now presumed an in-flight fix
# and reported only; anything test grants that prod does not still gates. Every
# report-only assertion sits next to a gating one built from the same rows, so a
# checker that silenced every divergence would fail this section too (gate 7c).
_rows = json.load(open(CLEAN))


def pair(name, prod_grants, test_grants):
    """Write a prod/test snapshot pair: CLEAN plus one function with the given
    (anon, authenticated) grants on each side. Returns (prod_path, test_path)."""
    row = dict(_rows[2], signature=f"{name}(uuid)", name=name, argtypes=["uuid"])
    paths = []
    for side, (anon, auth) in (("prod", prod_grants), ("test", test_grants)):
        path = absent(f"fgd-dir-{name}-{side}.json")
        with open(path, "w") as fh:
            json.dump(_rows + [dict(row, anon_exec=anon, auth_exec=auth)], fh)
        paths.append(path)
    return paths


# The P1093 shape exactly: prod anon=false auth=true, test anon=false auth=false.
p_narrow, t_narrow = pair("widget_fix_in_flight", (False, True), (False, False))
code, out, err = run(p_narrow, t_narrow)
check("test narrower than prod does not gate (exit 0)", code == 0,
      f"exit {code}; stdout: {out[:800]}")
check("it is still reported, as a presumed in-flight fix",
      "TEST NARROWER THAN PROD" in out and "widget_fix_in_flight(uuid)" in out, out[:800])
check("it names which role test revoked",
      "test revoked: authenticated" in out, out[:800])
check("the report says not to restore prod's grant on test",
      "Do NOT restore" in out, out[:800])
check("it is not filed under the gating GRANT DIFFERS heading",
      "GRANT DIFFERS" not in out, out[:800])
check("the report still ends in the no-drift RESULT line",
      "RESULT: no unallowlisted anon-executable function" in out
      and "RESULT: DRIFT" not in out, out[-1500:])

code, out, err = run(p_narrow, t_narrow, extra=("--summary",))
check("--summary surfaces the in-flight fix instead of calling the surface clean",
      code == 0 and "clean" not in out and "widget_fix_in_flight(uuid)" in out
      and "in-flight" in out, f"exit {code}: {out.strip()}")

code, out, err = run(p_narrow, t_narrow, extra=("--json",))
try:
    _found = {(f["direction"], f["signature"]): f for f in json.loads(out)["findings"]}
    _f = _found.get(("grant-narrower-on-test", "widget_fix_in_flight(uuid)"))
    check("--json carries the report-only direction and the revoked role",
          _f is not None and _f["detail"]["narrowed_on_test"] == ["authenticated"]
          and _f["detail"]["widened_on_test"] == [], str(_found.keys()))
except (json.JSONDecodeError, KeyError) as exc:
    check("--json carries the report-only direction and the revoked role", False, str(exc))

_nb = absent("fgd-narrow-baseline.json")
code, out, err = run(p_narrow, t_narrow, baseline=_nb, extra=("--update-baseline",))
check("a baseline never records an in-flight fix as backlog",
      code == 0 and json.load(open(_nb))["findings"] == [], open(_nb).read())

# A pre-P1102 baseline recorded this exact shape as gating grant-differs. It must
# read as resolved, never re-raise, and never make the run fail.
_old = absent("fgd-pre-p1102-baseline.json")
with open(_old, "w") as fh:
    json.dump({"findings": [["grant-differs", "widget_fix_in_flight(uuid)",
                             "prod:anon=False,auth=True;test:anon=False,auth=False"]]}, fh)
code, out, err = run(p_narrow, t_narrow, baseline=_old)
check("a pre-P1102 baseline entry for the same narrowing does not fail the run",
      code == 0 and "1 resolved" in out, f"exit {code}: {out[-600:]}")

# Controls: the same function, with test granting MORE than prod.
p_wide, t_wide = pair("widget_test_widened", (False, False), (False, True))
code, out, err = run(p_wide, t_wide)
check("test wider than prod still gates (exit 1)", code == 1, f"exit {code}")
check("it is filed under GRANT DIFFERS and names the widened role",
      "GRANT DIFFERS" in out and "widget_test_widened(uuid)" in out
      and "test grants: authenticated" in out, out[:900])
check("a widening is never presented as an in-flight fix",
      "TEST NARROWER THAN PROD" not in out, out[:900])
# Exactly one RESULT line, and the right one: a report that says DRIFT and "no
# divergence" in the same breath is read by whichever line the reader sees last.
check("a gating run prints RESULT: DRIFT and never the no-drift line",
      "RESULT: DRIFT" in out and "RESULT: no unallowlisted" not in out
      and out.count("RESULT:") == 1, out[-1500:])

# Mixed: test revoked authenticated but GRANTED anon. One widened role is enough
# to gate — a narrowing elsewhere on the same function must not launder it.
p_mix, t_mix = pair("widget_mixed", (False, True), (True, False))
code, out, err = run(p_mix, t_mix)
check("a difference that narrows one role and widens another gates", code == 1,
      f"exit {code}; stdout: {out[:800]}")
check("the mixed case is filed under GRANT DIFFERS, not as an in-flight fix",
      "GRANT DIFFERS" in out and "TEST NARROWER THAN PROD" not in out, out[:900])

# The P1063 shape: prod still anon-executable and unlisted, test already revoked.
# The narrowing is report-only, but prod's reachable anon grant still gates — the
# remedy the report points at is deploying the revoke, never restoring the grant.
p_63, t_63 = pair("widget_p1063_shape", (True, True), (False, True))
code, out, err = run(p_63, t_63)
check("an in-flight fix whose prod side is still anon-reachable keeps gating",
      code == 1 and "ANON-EXECUTABLE, NOT ALLOWLISTED" in out
      and "TEST NARROWER THAN PROD" in out, f"exit {code}; stdout: {out[:900]}")
check("gating plus an in-flight fix prints exactly one RESULT line, DRIFT",
      out.count("RESULT:") == 1 and "RESULT: DRIFT" in out, out[-1500:])

# ---------------------------------------------------------------------------
print("\nThe guard probe's blindness control fires when the probe is blind")
# The probe reports a non-refusal as a finding, so a probe that can no longer
# reach the database reports NOTHING and looks exactly like a clean surface.
# probe_self_check() exists to catch that — and a control nobody has watched
# fail is the same unproven gate one level down. These load the checker as a
# module and replace its transport, so no network call is made.
import importlib.util  # noqa: E402  (deliberately late — after the CLI assertions)

_spec = importlib.util.spec_from_file_location("_fgd", CHECKER)
fgd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fgd)

_real_run_sql = fgd.run_sql

def _all_requests_fail(env, sql, timeout=90, needs_role_switch=False):
    raise fgd.ApiError(503, '{"message":"upstream unavailable"}')

fgd.run_sql = _all_requests_fail
problems, _info = fgd.probe_self_check("test")
check("a probe that can reach nothing is reported blind, not clean",
      any("positive control" in p for p in problems), str(problems))

# The mirror failure: a transport that swallows errors and returns success for
# everything. Then a degenerate guard and a correct one look identical, and the
# probe silently reports every function as permitting anon.
def _all_requests_succeed(env, sql, timeout=90, needs_role_switch=False):
    return [{"ok": 1}]

fgd.run_sql = _all_requests_succeed
problems, _info = fgd.probe_self_check("test")
check("a probe that never sees a refusal is reported blind",
      any("negative control" in p for p in problems), str(problems))

fgd.run_sql = _real_run_sql

# ---------------------------------------------------------------------------
print("\nThe probe cannot be injected through a hostile catalog value")
# pg_proc.proname accepts any character. The probe builds SQL by interpolation,
# so a quote in a function name would otherwise break out of the quoted call
# into a statement this script executes. Creating such a name needs DDL access
# and is not externally reachable — but a tool whose docstring promises
# read-only has to hold against a hostile catalog, not just an honest one.
check("a quote in a function name is doubled, not passed through",
      fgd.quote_ident('fn"; DROP TABLE x; --') == '"fn""; DROP TABLE x; --"',
      fgd.quote_ident('fn"; DROP TABLE x; --'))

hostile = {"name": 'fn"; DROP TABLE x; --', "argtypes": ["uuid"], "retset": False}
stmt = fgd.probe_statement(hostile)
# The payload survives as inert text INSIDE the quoted identifier. What must not
# happen is a statement boundary escaping it.
check("the injected statement stays inside the quoted identifier",
      stmt.count('"') == 4 and stmt.endswith("(NULL::uuid)"), stmt)

# Real type names carry spaces, brackets and parens; the guard must admit those
# or it would refuse to probe most of the surface.
for t in ("timestamp with time zone", "character varying(32)", "uuid[]", "numeric(10,2)"):
    ok = True
    try:
        fgd.probe_statement({"name": "f", "argtypes": [t], "retset": False})
    except fgd.UnsafeIdentifier:
        ok = False
    check(f"legitimate type name is probeable: {t}", ok)

for t in ("uuid; DROP TABLE x", "uuid'", 'uuid"'):
    refused = False
    try:
        fgd.probe_statement({"name": "f", "argtypes": [t], "retset": False})
    except fgd.UnsafeIdentifier:
        refused = True
    check(f"unsafe type name is refused, not sanitised: {t!r}", refused)

# ---------------------------------------------------------------------------
print("\nA baselined finding that gets WORSE re-alarms")
# The failure this closes: an anon-unlisted finding is baselined while the
# function is plain, then becomes SECURITY DEFINER with the anon grant intact.
# Under a (direction, signature) key that escalation stays 'known-open' forever.
esc_before = absent("fgd-esc-before.json")
esc_after = absent("fgd-esc-after.json")
base_rows = json.load(open(CLEAN))
plain = dict(base_rows[2], signature="widget_escalates(uuid)", name="widget_escalates",
             argtypes=["uuid"], anon_exec=True, auth_exec=True, secdef=False)
with open(esc_before, "w") as fh:
    json.dump(base_rows + [plain], fh)
with open(esc_after, "w") as fh:
    json.dump(base_rows + [dict(plain, secdef=True)], fh)

esc_baseline = absent("fgd-esc-baseline.json")
code, out, err = run(esc_before, esc_before, baseline=esc_baseline,
                     extra=("--update-baseline",))
check("recording the pre-escalation backlog succeeds", code == 0, f"exit {code}: {err[:200]}")

code, out, err = run(esc_before, esc_before, baseline=esc_baseline)
check("the recorded backlog is quiet while unchanged", code == 0, f"exit {code}")

code, out, err = run(esc_after, esc_after, baseline=esc_baseline)
check("the same finding turning SECURITY DEFINER re-alarms as NEW", code == 1,
      f"exit {code} — a severity escalation was absorbed as known-open")

# ---------------------------------------------------------------------------
print("\nA policy: entry's citation is verified, not trusted (P1327)")
# Built by mutating the REAL allowlist (epistemic gate 7d): a synthetic fixture has
# no neighbouring entries, comments or example text that could satisfy a sloppy
# matcher. Every mutation must refuse the run (exit 2), and the unmutated file must
# still load — the second half is the false-positive control (gate 7c).
REAL_ALLOWLIST = os.path.join(HERE, "anon-execute-allowlist.txt")
real_text = open(REAL_ALLOWLIST, encoding="utf-8").read()
POLICY_MIGRATION = "supabase/migrations/20260901180000_p1207_session_children_inherit_parent_scope.sql"
real_citation = f"policy: {POLICY_MIGRATION}:70"
check("the real allowlist carries the policy citation this suite mutates",
      real_citation in real_text)

code, out, err = run(CLEAN, CLEAN, allowlist=REAL_ALLOWLIST)
check("the real allowlist, policy entries included, parses and runs",
      code in (0, 1) and "malformed allowlist" not in err, f"exit {code}; stderr: {err[:300]}")


def mutated(new_citation):
    fd, path = tempfile.mkstemp(prefix="fgd-policy-", suffix=".txt")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(real_text.replace(real_citation, new_citation))
    return path


for label, citation, needle in [
    # Line 65 is `GRANT EXECUTE ON FUNCTION public.can_read_clarity_session(uuid) ...`:
    # it names the function, so only the statement check can refuse it.
    ("a cited line that names the function outside any policy is refused",
     f"policy: {POLICY_MIGRATION}:65", "not inside a CREATE/ALTER POLICY"),
    # Line 69 is the `ON public.clarity_demo_rounds FOR SELECT` line of a real policy,
    # so only the calls-the-function check can refuse it.
    ("a cited policy line that does not call the function is refused",
     f"policy: {POLICY_MIGRATION}:69", "does not call can_read_clarity_session()"),
    ("a cited file that does not exist is refused",
     "policy: supabase/migrations/19990101000000_no_such_file.sql:1", "cited policy file not found"),
    ("a policy entry with no file:line citation is refused",
     "policy: the sessions table reads it", "must cite"),
]:
    path = mutated(citation)
    code, out, err = run(CLEAN, CLEAN, allowlist=path)
    check(label, code == 2 and needle in err, f"exit {code}; stderr: {err[:300]}")
    os.unlink(path)

# ---------------------------------------------------------------------------
print("\nA policy: citation cannot be satisfied by comments, literals, other schemas, "
      "wrong arity, or a policy a later migration dropped (P1327 review)")
# Each shape was reported by the 2026-09-17 Codex/Gemini review. Every refusal sits next
# to an ACCEPT control built from the same text, so a checker that refused everything
# would fail this section too (gate 7c).
import importlib.util as _ilu  # noqa: E402
_spec = _ilu.spec_from_file_location("_fgd_unit", CHECKER)
fgdu = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(fgdu)

POLICY_OK = '''CREATE POLICY "Rows follow their session's visibility"
  ON public.widgets FOR SELECT TO anon
  USING (note <> 'a;b' AND can_read_widget(session_id));
'''


def mig_root(files):
    root = tempfile.mkdtemp(prefix="fgd-mig-")
    os.makedirs(os.path.join(root, "supabase", "migrations"))
    for name, body in files.items():
        with open(os.path.join(root, "supabase", "migrations", name), "w", encoding="utf-8") as fh:
            fh.write(body)
    return root


def verdict(files, sig="can_read_widget(uuid)", line=3, cite="001_p.sql"):
    return fgdu.verify_policy_citation(sig, f"policy: supabase/migrations/{cite}:{line} — r",
                                       root=mig_root(files))


check("ACCEPT: a real call, with a ';' inside a literal earlier in the statement",
      verdict({"001_p.sql": POLICY_OK}) is None, str(verdict({"001_p.sql": POLICY_OK})))
check("refuses a call that exists only inside a block comment",
      "does not call" in str(verdict({"001_p.sql": POLICY_OK.replace(
          "note <> 'a;b' AND can_read_widget(session_id)", "true /* can_read_widget(session_id) */")})))
check("refuses a call that exists only inside a string literal",
      "does not call" in str(verdict({"001_p.sql": POLICY_OK.replace(
          "note <> 'a;b' AND can_read_widget(session_id)", "note = 'can_read_widget(x)'")})))
check("refuses a call to a same-named function in another schema",
      "does not call" in str(verdict({"001_p.sql": POLICY_OK.replace(
          "can_read_widget(session_id)", "evil.can_read_widget(session_id)")})))
check("ACCEPT: a public.-qualified call",
      verdict({"001_p.sql": POLICY_OK.replace("can_read_widget(", "public.can_read_widget(")}) is None)
check("refuses a call whose argument count differs from the allowlisted signature",
      "argument(s)" in str(verdict({"001_p.sql": POLICY_OK.replace(
          "can_read_widget(session_id)", "can_read_widget(session_id, 'x')")})))
DROP = 'DROP POLICY IF EXISTS "Rows follow their session\'s visibility" ON public.widgets;\n'
check("refuses a citation whose policy a LATER migration drops and never re-creates",
      "never re-created" in str(verdict({"001_p.sql": POLICY_OK, "002_drop.sql": DROP})))
check("ACCEPT: dropped later and then re-created",
      verdict({"001_p.sql": POLICY_OK, "002_drop.sql": DROP, "003_again.sql": POLICY_OK}) is None)
check("refuses a policy scoped TO authenticated only",
      "never to anon" in str(verdict({"001_p.sql": POLICY_OK.replace("TO anon", "TO authenticated")})))
check("ACCEPT: a policy with no TO clause (applies to PUBLIC)",
      verdict({"001_p.sql": POLICY_OK.replace("  ON public.widgets FOR SELECT TO anon", "  ON public.widgets FOR SELECT")}) is None)
check("refuses a citation that points outside supabase/migrations (e.g. the allowlist itself)",
      "must point into supabase/migrations" in str(fgdu.verify_policy_citation(
          "can_read_clarity_session(uuid)", "policy: scripts/anon-execute-allowlist.txt:104 — r")))
check("refuses an absolute path",
      "must point into supabase/migrations" in str(fgdu.verify_policy_citation(
          "can_read_widget(uuid)", "policy: /private/tmp/x.sql:1 — r")))
_bad_root = mig_root({"001_p.sql": POLICY_OK})
with open(os.path.join(_bad_root, "supabase", "migrations", "002_bad.sql"), "wb") as _fh:
    _fh.write(b"\xff\xfe\x00 not utf-8")
check("an unreadable later migration refuses with a message instead of raising",
      "unreadable" in str(fgdu.verify_policy_citation(
          "can_read_widget(uuid)", "policy: supabase/migrations/001_p.sql:3 — r", root=_bad_root)))
check("refuses when the drop is later in the SAME file",
      "never re-created" in str(verdict({"001_p.sql": POLICY_OK + DROP})))

# ---------------------------------------------------------------------------
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n{passed}/{total} assertions held.")
if passed != total:
    print("\nFAILED:")
    for label, ok, detail in results:
        if not ok:
            print(f"  - {label}: {detail}")
sys.exit(0 if passed == total else 1)
