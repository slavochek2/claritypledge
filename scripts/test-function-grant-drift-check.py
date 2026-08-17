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
check("catches the prod-open / test-revoked divergence",
      "GRANT DIFFERS" in out and "widget_owner_update(uuid,text)" in out)

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

# widget_owner_update is anon-executable-and-unlisted AND prod/test divergent, so
# it raises TWO gating findings. That is intended: they are different questions
# with different remedies (does an anon call site exist? / why do the two
# environments disagree?), and collapsing them would hide whichever the reader
# did not think to ask. Pinned because a future de-duplication would look tidy
# and would silently drop a signal.
check("one function can raise two distinct gating findings",
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
check("all three gating findings are recorded", len(recorded) == 3, str(recorded))

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
          {"anon-unlisted", "grant-differs"} <= directions, str(directions))
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

def _all_requests_fail(env, sql, timeout=90):
    raise fgd.ApiError(503, '{"message":"upstream unavailable"}')

fgd.run_sql = _all_requests_fail
problems, _info = fgd.probe_self_check("test")
check("a probe that can reach nothing is reported blind, not clean",
      any("positive control" in p for p in problems), str(problems))

# The mirror failure: a transport that swallows errors and returns success for
# everything. Then a degenerate guard and a correct one look identical, and the
# probe silently reports every function as permitting anon.
def _all_requests_succeed(env, sql, timeout=90):
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
passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print(f"\n{passed}/{total} assertions held.")
if passed != total:
    print("\nFAILED:")
    for label, ok, detail in results:
        if not ok:
            print(f"  - {label}: {detail}")
sys.exit(0 if passed == total else 1)
