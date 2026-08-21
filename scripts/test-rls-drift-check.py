#!/usr/bin/env python3
"""
Self-test for scripts/rls-drift-check.py (P1048, epistemic gate 7).

A drift checker nobody has watched CATCH drift is unproven. A green run only
proves the happy path runs. This replays the pre-P1046 state — prod carrying the
four PERMISSIVE policies that test had already dropped — and asserts the checker
exits non-zero AND names all four, distinguishing the two origins P1046 found.

Hermetic: reads fixture JSON snapshots and a fixture migrations directory. Makes
no network calls and touches no database.

Written in Python rather than bash for the same reason the checker is: policy
predicates carry `>` and `|`, which .claude/rules/shell-safety.md bans from the
stdout of scripts under scripts/ (the P783 eval-lexing surface). Python stdout
does not re-enter shell lexing.

Run: scripts/test-rls-drift-check.py
Exit 0 = all assertions held. Exit 1 = the checker regressed.
"""

import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER = os.path.join(HERE, "rls-drift-check.py")
FIXTURES = os.path.join(HERE, "fixtures", "rls-drift")
FIX_MIGRATIONS = os.path.join(FIXTURES, "migrations")

PROD_PRE = os.path.join(FIXTURES, "prod-pre-p1046.json")
TEST_CONVERGED = os.path.join(FIXTURES, "test-converged.json")

# The four policies P1046 found live on prod and absent from test.
P1046_POLICIES = [
    "Anyone can read sessions",
    "Anyone can update feed ideas",
    "Anyone can update comments",
    "Anyone can update their own votes",
]

# Applied out-of-band: present in no migration. The other three were created by a
# migration, so only this one may also surface under NOT IN MIGRATIONS.
OUT_OF_BAND = "Anyone can read sessions"

results = []


def run(args, allowlist=None):
    """Invoke the checker with an explicit allowlist path so the repo's real
    allowlist can never influence a test outcome."""
    if allowlist is None:
        # A path that does not exist — the checker treats a missing allowlist as
        # empty. Deliberately not a file in FIXTURES: a test must not leave an
        # artifact in a tracked directory.
        allowlist = os.path.join(tempfile.gettempdir(), "rls-drift-absent-allowlist.txt")
        if os.path.exists(allowlist):
            os.unlink(allowlist)
    # Pin the baseline to a path that cannot exist, for the same reason the
    # allowlist is pinned: the checker's default baseline lives under .private/,
    # which is gitignored and machine-local. Letting it resolve would make this
    # suite's verdict depend on whether the founder happens to have recorded a
    # backlog — green on one machine, red on another, for reasons unrelated to
    # the code under test.
    absent_baseline = os.path.join(tempfile.gettempdir(), "rls-drift-absent-baseline.json")
    if os.path.exists(absent_baseline):
        os.unlink(absent_baseline)

    cmd = [sys.executable, CHECKER, "--migrations", FIX_MIGRATIONS,
           "--allowlist", allowlist, "--baseline", absent_baseline] + args
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def check(name, condition, detail=""):
    results.append((name, condition, detail))
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {name}" + (f"  -- {detail}" if detail and not condition else ""))


def section(title):
    print(f"\n{title}")


# --------------------------------------------------------------------------
section("1. Pre-P1046 state: prod carries four policies test had dropped")

code, out, err = run(["--prod-json", PROD_PRE, "--test-json", TEST_CONVERGED])

check("exits non-zero on known drift", code == 1, f"got exit {code}; stderr: {err[:200]}")

for policy in P1046_POLICIES:
    check(f"names {policy!r} in the report", policy in out)

prod_only_block = out.split("PROD-ONLY")[1].split("\n\n")[0] if "PROD-ONLY" in out else ""
for policy in P1046_POLICIES:
    check(f"{policy!r} classified prod-only", policy in prod_only_block)

not_in_files_block = (
    out.split("NOT IN MIGRATIONS")[1].split("\n\n")[0] if "NOT IN MIGRATIONS" in out else ""
)
check(f"{OUT_OF_BAND!r} also flagged absent from migrations",
      OUT_OF_BAND in not_in_files_block)
for policy in P1046_POLICIES:
    if policy == OUT_OF_BAND:
        continue
    check(f"{policy!r} NOT flagged absent from migrations (it was created by one)",
          policy not in not_in_files_block,
          "a migration-created policy must not read as out-of-band")

check("reports DRIFT verdict", "RESULT: DRIFT" in out)
check("states its coverage limits", "WHAT THIS CHECK DOES NOT COVER" in out)


# --------------------------------------------------------------------------
section("2. Converged state: both environments agree")

code, out, err = run(["--prod-json", TEST_CONVERGED, "--test-json", TEST_CONVERGED])
check("exits zero when converged", code == 0, f"got exit {code}; stdout tail: {out[-300:]}")
check("reports no gating finding", "RESULT: no unallowlisted" in out)


# --------------------------------------------------------------------------
section("3. Allowlist suppresses a named finding, and only that one")

with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as fh:
    fh.write("# fixture allowlist\n")
    fh.write("prod-only|clarity_idea_votes|Anyone can update their own votes\n")
    allow_path = fh.name

code, out, err = run(["--prod-json", PROD_PRE, "--test-json", TEST_CONVERGED],
                     allowlist=allow_path)
check("still exits non-zero — other findings remain", code == 1, f"got exit {code}")
check("allowlisted entry moves to the ALLOWLISTED section",
      "ALLOWLISTED" in out and "Anyone can update their own votes" in out.split("ALLOWLISTED")[1])
remaining = out.split("PROD-ONLY")[1].split("\n\n")[0] if "PROD-ONLY" in out else ""
check("allowlisting one does not suppress the others",
      all(p in out for p in P1046_POLICIES) and "Anyone can update feed ideas" in remaining)
os.unlink(allow_path)


# --------------------------------------------------------------------------
section("4. A malformed allowlist refuses to run rather than silently suppressing nothing")

with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as fh:
    fh.write("prod-only|only-two-fields\n")
    bad_path = fh.name

code, out, err = run(["--prod-json", PROD_PRE, "--test-json", TEST_CONVERGED],
                     allowlist=bad_path)
check("exits 2 (could-not-run), not 0 or 1", code == 2, f"got exit {code}")
check("explains the malformed line", "expected 'direction|table|policy'" in err)
os.unlink(bad_path)

with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as fh:
    fh.write("sideways|foo|bar\n")
    bad_dir_path = fh.name
code, out, err = run(["--prod-json", PROD_PRE, "--test-json", TEST_CONVERGED],
                     allowlist=bad_dir_path)
check("unknown direction also exits 2", code == 2, f"got exit {code}")
os.unlink(bad_dir_path)


# --------------------------------------------------------------------------
section("5. A missing migrations directory cannot read as 'clean'")

code, out, err = run(["--prod-json", TEST_CONVERGED, "--test-json", TEST_CONVERGED,
                      "--migrations", "/nonexistent/migrations"])
check("exits 2 when migrations are unreadable", code == 2, f"got exit {code}")
check("says the check did not run", "did NOT run" in err)


# --------------------------------------------------------------------------
section("6. Baseline separates 'new' from 'known-open' without suppressing either")

import json as _json

# Baseline recording every current finding: the run must go quiet (exit 0) while
# STILL listing them — a baseline is not an allowlist.
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
    _json.dump({"findings": [
        ["prod-only", "clarity_feed_ideas", "Anyone can update feed ideas"],
        ["prod-only", "clarity_idea_comments", "Anyone can update comments"],
        ["prod-only", "clarity_idea_votes", "Anyone can update their own votes"],
        ["prod-only", "clarity_sessions", "Anyone can read sessions"],
        ["not-in-files", "clarity_sessions", "Anyone can read sessions"],
    ]}, fh)
    full_baseline = fh.name

code, out, err = run(["--prod-json", PROD_PRE, "--test-json", TEST_CONVERGED,
                      "--baseline", full_baseline])
check("fully-baselined drift exits 0", code == 0, f"got exit {code}")
check("baselined findings are STILL reported, not hidden",
      all(p in out for p in P1046_POLICIES),
      "a baseline must not make a finding disappear from the report")
check("output distinguishes known-open from new", "known-open" in out)

# Drop one entry: that finding is now NEW and must re-gate.
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
    _json.dump({"findings": [
        ["prod-only", "clarity_feed_ideas", "Anyone can update feed ideas"],
        ["prod-only", "clarity_idea_comments", "Anyone can update comments"],
        ["prod-only", "clarity_idea_votes", "Anyone can update their own votes"],
    ]}, fh)
    partial_baseline = fh.name

code, out, err = run(["--prod-json", PROD_PRE, "--test-json", TEST_CONVERGED,
                      "--baseline", partial_baseline, "--summary"])
check("an unbaselined finding re-gates the run", code == 1, f"got exit {code}")
check("summary names the new finding", "Anyone can read sessions" in out)
check("summary counts the known-open ones separately", "known-open" in out)

# A corrupt baseline must refuse to run rather than read as empty-or-clean.
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
    fh.write("{not json")
    corrupt_baseline = fh.name
code, out, err = run(["--prod-json", PROD_PRE, "--test-json", TEST_CONVERGED,
                      "--baseline", corrupt_baseline])
check("corrupt baseline exits 2, not 0 or 1", code == 2, f"got exit {code}")

for path in (full_baseline, partial_baseline, corrupt_baseline):
    os.unlink(path)


# --------------------------------------------------------------------------
section("7. Schema-qualified keys: storage.objects is covered, and a same-named "
        "policy on public.objects does not launder an out-of-band policy (P1135, 2026-08-21)")

STORAGE_PROD = os.path.join(FIXTURES, "storage-schema-prod.json")
STORAGE_TEST = os.path.join(FIXTURES, "storage-schema-test.json")

code, out, err = run(["--prod-json", STORAGE_PROD, "--test-json", STORAGE_TEST])

check("a storage.objects policy identical on both envs and present in a "
      "migration raises no finding at all",
      "public can read agent avatars" not in out, f"stdout: {out[:600]}")
check("a public.objects policy of the SAME name, live on prod only and in no "
      "migration, IS classified prod-only",
      "PROD-ONLY" in out and "duplicate name test" in out.split("PROD-ONLY")[1].split("\n\n")[0])
check("that public.objects policy is ALSO flagged absent from migrations — the "
      "identically-named storage.objects policy in the fixture migration must "
      "not launder it",
      "NOT IN MIGRATIONS" in out and "duplicate name test" in out.split("NOT IN MIGRATIONS")[1].split("\n\n")[0])
check("public schema stays unprefixed in the report (only non-public schemas "
      "get a schema. prefix) — 'objects.duplicate name test', not "
      "'public.objects.duplicate name test'",
      "objects.duplicate name test" in out and "public.objects.duplicate name test" not in out,
      f"stdout: {out[:900]}")
check("exits non-zero — the out-of-band public.objects policy gates the run",
      code == 1, f"got exit {code}")


# --------------------------------------------------------------------------
print()
failed = [name for name, ok, _ in results if not ok]
print("=" * 70)
if failed:
    print(f"FAILED — {len(failed)} of {len(results)} assertions did not hold:")
    for name in failed:
        print(f"  - {name}")
    sys.exit(1)
print(f"All {len(results)} assertions held. The checker has been observed catching "
      "the P1046 drift and distinguishing both of its origins.")
sys.exit(0)
