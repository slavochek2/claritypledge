#!/usr/bin/env python3
"""
Self-test for scripts/check-migration-grant-order.py (P1102, epistemic gates 7 / 7c / 7d).

Every refusal below sits next to an ACCEPT control built from the same text, so a
checker that refused everything would fail as surely as one that refused nothing.
The last section runs against the REAL migrations: the one file from the P1093
incident must be refused, every other file must pass, and deleting the real
re-assert migration must turn the incident's revoke into a refusal.

Hermetic apart from reading supabase/migrations: no network, no database.
Run: scripts/test-check-migration-grant-order.py   Exit 0 = all assertions held.
"""

import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER = os.path.join(HERE, "check-migration-grant-order.py")
REAL_DIR = os.path.join(os.path.dirname(HERE), "supabase", "migrations")

results = []


def check(label, condition, detail=""):
    results.append((label, bool(condition), detail))
    print(f"  {'PASS' if condition else 'FAIL'}  {label}"
          + (f"\n        {detail}" if detail and not condition else ""))


def mig_dir(files):
    d = tempfile.mkdtemp(prefix="mgo-")
    for name, body in files.items():
        with open(os.path.join(d, name), "w", encoding="utf-8") as fh:
            fh.write(body)
    return d


def run(d, *targets, tree=False):
    cmd = [sys.executable, CHECKER, "--dir", d]
    cmd += ["--tree"] if tree else [os.path.join(d, t) for t in targets]
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


FN = "public.widget_write(uuid, jsonb)"
REVOKE_AUTH = f"REVOKE EXECUTE ON FUNCTION {FN} FROM authenticated;\n"
GRANT_AUTH = f"GRANT EXECUTE ON FUNCTION {FN} TO authenticated;\n"
A, B, C = "20260101000000_a.sql", "20260102000000_b.sql", "20260103000000_c.sql"

# ---------------------------------------------------------------------------
print("widens-revoked: a GRANT that undoes an earlier REVOKE needs a human's word")
d = mig_dir({A: REVOKE_AUTH, B: GRANT_AUTH})
code, out, err = run(d, B)
check("refuses a grant whose role an earlier migration revoked (exit 1)", code == 1, out + err)
check("names both files and the role", "widens-revoked" in out and A in out
      and "authenticated" in out, out)
check("tells the author the exact annotation, citing the revoking version",
      "-- widens-revoked-grant: 20260101000000" in out, out)

code, out, err = run(mig_dir({A: REVOKE_AUTH,
                              B: "-- widens-revoked-grant: 20260101000000 callers came back (P9)\n"
                                 + GRANT_AUTH}), B)
check("ACCEPT: the annotation citing the revoking version", code == 0, out + err)

code, out, err = run(mig_dir({A: REVOKE_AUTH,
                              B: "-- widens-revoked-grant: 20250101000000 wrong file\n" + GRANT_AUTH}), B)
check("an annotation citing some other version does not count", code == 1, out)

code, out, err = run(mig_dir({A: REVOKE_AUTH,
                              B: "-- widens-revoked-grant: 20260101000000\n" + GRANT_AUTH}), B)
check("an annotation with no reason does not count", code == 1, out)

code, out, err = run(mig_dir({A: REVOKE_AUTH,
                              B: f"REVOKE EXECUTE ON FUNCTION {FN} FROM authenticated;\n" + GRANT_AUTH}), B)
check("a revoke-then-grant inside the new file still widens an earlier revoke", code == 1, out)

code, out, err = run(mig_dir({A: "", B: REVOKE_AUTH + GRANT_AUTH}), B)
check("ACCEPT: revoke-then-grant in one file with no earlier revoke", code == 0, out + err)

# The house lockdown idiom revokes PUBLIC/anon and grants authenticated. Different
# roles never contradict each other.
code, out, err = run(mig_dir({
    A: f"REVOKE ALL ON FUNCTION {FN} FROM PUBLIC;\nREVOKE ALL ON FUNCTION {FN} FROM anon;\n",
    B: f"REVOKE ALL ON FUNCTION {FN} FROM PUBLIC;\n" + GRANT_AUTH}), B)
check("ACCEPT: granting authenticated after revoking PUBLIC and anon", code == 0, out + err)

code, out, err = run(mig_dir({A: REVOKE_AUTH,
                              B: f"DROP FUNCTION IF EXISTS {FN};\nCREATE FUNCTION {FN} RETURNS void "
                                 "LANGUAGE sql AS $$ select 1; $$;\n" + GRANT_AUTH}), B)
check("ACCEPT: a grant on a function dropped and re-created in the same file", code == 0, out + err)

code, out, err = run(mig_dir({A: REVOKE_AUTH,
                              B: f"DROP FUNCTION {FN};\n",
                              C: GRANT_AUTH}), C)
check("ACCEPT: a grant after an intervening migration dropped the function", code == 0, out + err)

code, out, err = run(mig_dir({A: GRANT_AUTH, B: REVOKE_AUTH}), B)
check("ACCEPT: a revoke after an earlier grant — narrowing is never refused", code == 0, out + err)

code, out, err = run(mig_dir({A: REVOKE_AUTH,
                              B: f"GRANT EXECUTE ON FUNCTION {FN} TO service_role;\n"}), B)
check("ACCEPT: roles outside anon/authenticated/PUBLIC are out of scope", code == 0, out + err)

code, out, err = run(mig_dir({
    A: REVOKE_AUTH,
    B: f"-- GRANT EXECUTE ON FUNCTION {FN} TO authenticated;\n"
       f"/* {GRANT_AUTH} */\nSELECT 'GRANT EXECUTE ON FUNCTION {FN} TO authenticated';\n"
       "DO $$ BEGIN RAISE NOTICE 'x'; END $$;\n"}), B)
check("ACCEPT: a grant inside a comment, a block comment or a literal is not a grant",
      code == 0, out + err)

# Signature matching: the same function spelled differently must still collide.
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_count(int, UUID) FROM anon;\n",
    B: 'GRANT EXECUTE ON FUNCTION "widget_count"(p_n integer, p_id uuid) TO anon;\n'}), B)
check("matches through type aliases, case, quoting, schema and argument names", code == 1, out)

code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_count(text) FROM anon;\n",
    B: "GRANT EXECUTE ON FUNCTION public.widget_count(uuid) TO anon;\n"}), B)
check("ACCEPT: a different overload is a different function", code == 0, out + err)

code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_count(text) FROM anon;\n",
    B: "GRANT EXECUTE ON FUNCTION widget_count TO anon;\n"}), B)
check("an argument-less grant covers every overload, so it collides", code == 1, out)

code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.f1(uuid), public.f2(text) FROM anon, authenticated;\n",
    B: "GRANT EXECUTE ON FUNCTION public.f2(text) TO authenticated;\n"}), B)
check("multi-function, multi-role statements are split per function and role",
      code == 1 and "f2(text)" in out and "f1" not in out, out)

# ---------------------------------------------------------------------------
print("\nrevoke-undone: a REVOKE that a later-sorting GRANT overrides on ordered apply")
code, out, err = run(mig_dir({A: REVOKE_AUTH, B: GRANT_AUTH}), A)
check("refuses a revoke a later migration grants back (exit 1)",
      code == 1 and "revoke-undone" in out and B in out, out + err)

code, out, err = run(mig_dir({A: REVOKE_AUTH, B: GRANT_AUTH, C: REVOKE_AUTH}), A)
check("ACCEPT: a re-assert ordered after the grant closes it", code == 0, out + err)

code, out, err = run(mig_dir({
    A: REVOKE_AUTH,
    B: "-- widens-revoked-grant: 20260101000000 intended reopening (P9)\n" + GRANT_AUTH}), A)
check("ACCEPT: the later grant is an acknowledged widening of this very revoke", code == 0, out + err)

# ---------------------------------------------------------------------------
print("\n--tree and failure modes")
code, out, err = run(mig_dir({A: REVOKE_AUTH, B: GRANT_AUTH}), tree=True)
check("--tree lists the transition and exits 0 (an audit, not a gate)",
      code == 0 and "1 revoke-then-grant" in out and "UNACKNOWLEDGED" in out, out + err)

p = subprocess.run([sys.executable, CHECKER, "--dir", "/nonexistent-mgo", "--tree"],
                   capture_output=True, text=True)
check("a missing migrations directory exits 2, never 0", p.returncode == 2, p.stderr)

_bad = mig_dir({A: REVOKE_AUTH})
with open(os.path.join(_bad, B), "wb") as fh:
    fh.write(b"\xff\xfe not utf-8")
code, out, err = run(_bad, A)
check("an unreadable migration exits 2 with 'did NOT run'", code == 2 and "did NOT run" in err,
      f"exit {code}: {err}")

# The checker borrows its SQL blanker from function-grant-drift-check.py. If that
# module cannot load, an uncaught traceback would exit 1 — which reads as "refused",
# a finding, rather than "could not run".
_lonely = tempfile.mkdtemp(prefix="mgo-noimport-")
shutil.copy(CHECKER, _lonely)
p = subprocess.run([sys.executable, os.path.join(_lonely, os.path.basename(CHECKER)),
                    "--dir", mig_dir({A: REVOKE_AUTH}), "--tree"], capture_output=True, text=True)
check("a missing helper module exits 2, never 1", p.returncode == 2 and "did NOT run" in p.stderr,
      f"exit {p.returncode}: {p.stderr[-300:]}")

# ---------------------------------------------------------------------------
print("\nThe real migrations (gate 7c and 7d)")
INCIDENT_RESTORE = "20260818140000_p1065_restore_authenticated_grant_persist_anonymous_completion.sql"
INCIDENT_REVOKE = "20260818090000_p1093_close_unchecked_payload_writer.sql"
INCIDENT_REASSERT = "20260818150000_p1093_reassert_revoke_over_drift_restore.sql"
real = sorted(f for f in os.listdir(REAL_DIR) if f.endswith(".sql"))
check("the incident's three migrations are present", {INCIDENT_RESTORE, INCIDENT_REVOKE,
                                                     INCIDENT_REASSERT} <= set(real))

p = subprocess.run([sys.executable, CHECKER, "--dir", REAL_DIR,
                    *[os.path.join(REAL_DIR, f) for f in real]], capture_output=True, text=True)
refused = sorted({line.split()[1].split(":")[0] for line in p.stdout.splitlines()
                  if line.strip().startswith("REFUSED")})
check(f"of {len(real)} real migrations, exactly the P1065 restore is refused",
      p.returncode == 1 and refused == [INCIDENT_RESTORE], f"refused: {refused}\n{p.stdout[-800:]}")

p = subprocess.run([sys.executable, CHECKER, "--dir", REAL_DIR,
                    *[os.path.join(REAL_DIR, f) for f in real if f != INCIDENT_RESTORE]],
                   capture_output=True, text=True)
check("every other real migration passes", p.returncode == 0, p.stdout[-800:])

# The incident at deploy time: before the re-assert existed, the revoke was undone by
# a later-sorting restore. Rebuilt by deleting the real re-assert from a copy.
mutated = tempfile.mkdtemp(prefix="mgo-real-")
for f in real:
    if f != INCIDENT_REASSERT:
        shutil.copy(os.path.join(REAL_DIR, f), mutated)
code, out, err = run(mutated, INCIDENT_REVOKE)
check("without the re-assert, the P1093 revoke is refused as revoke-undone",
      code == 1 and "revoke-undone" in out and INCIDENT_RESTORE in out, out + err)
code, out, err = run(REAL_DIR, INCIDENT_REVOKE)
check("with the real re-assert in place, the same revoke passes", code == 0, out + err)

# ---------------------------------------------------------------------------
passed = sum(1 for _, ok, _ in results if ok)
print(f"\n{passed}/{len(results)} assertions held.")
if passed != len(results):
    print("\nFAILED:")
    for label, ok, detail in results:
        if not ok:
            print(f"  - {label}: {detail}")
sys.exit(0 if passed == len(results) else 1)
