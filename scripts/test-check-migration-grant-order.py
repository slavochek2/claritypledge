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

# Every fixture below is a scratch repo. Run from pre-commit (it is, whenever the checker is
# staged), this process inherits the hook's GIT_DIR / GIT_INDEX_FILE, which override
# `git -C` and would aim the fixtures' `git add` at the COMMITTING repo's index (P1273).
# Scrubbed once here, the same family scripts/test-block-banned-git.py scrubs (P1131).
for _v in ("GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE",
           "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR", "GIT_PREFIX",
           "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE",
           "GIT_CEILING_DIRECTORIES", "GIT_TEMPLATE_DIR"):
    os.environ.pop(_v, None)

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

# The house lockdown idiom revokes PUBLIC/anon and grants authenticated IN ONE FILE —
# a file's own revoke never constrains its own grant.
code, out, err = run(mig_dir({
    A: "",
    B: f"REVOKE ALL ON FUNCTION {FN} FROM PUBLIC;\nREVOKE ALL ON FUNCTION {FN} FROM anon;\n" + GRANT_AUTH}), B)
check("ACCEPT: the lockdown idiom within one file", code == 0, out + err)
# Across files it is different (/finish review 2026-10-13): after file A, authenticated has
# no direct grant on record and PUBLIC is revoked, so it cannot execute; file B's direct
# GRANT re-opens it. This control previously asserted ACCEPT under "different roles never
# contradict"; that premise is what the review refuted.
code, out, err = run(mig_dir({
    A: f"REVOKE ALL ON FUNCTION {FN} FROM PUBLIC;\nREVOKE ALL ON FUNCTION {FN} FROM anon;\n",
    B: f"REVOKE ALL ON FUNCTION {FN} FROM PUBLIC;\n" + GRANT_AUTH}), B)
check("a later-file GRANT TO authenticated after REVOKE FROM PUBLIC is refused, named via PUBLIC",
      code == 1 and "revoked from authenticated (via PUBLIC)" in out, out + err)

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
print("\nCodex review 2026-10-13: overloads, schemas and type spellings (P1102)")
# Finding 2 — a DROP of a DIFFERENT overload must not reset the one being granted.
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_write(uuid) FROM authenticated;\n",
    B: "DROP FUNCTION IF EXISTS public.widget_write(text);\n"
       "GRANT EXECUTE ON FUNCTION public.widget_write(uuid) TO authenticated;\n"}), B)
check("a DROP of another overload does not excuse re-granting this one", code == 1, out + err)
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_write(uuid) FROM authenticated;\n",
    B: "DROP FUNCTION IF EXISTS public.widget_write(uuid);\n"
       "CREATE FUNCTION public.widget_write(uuid) RETURNS void LANGUAGE sql AS $$ select 1 $$;\n"
       "GRANT EXECUTE ON FUNCTION public.widget_write(uuid) TO authenticated;\n"}), B)
check("ACCEPT: a DROP of the same overload resets it", code == 0, out + err)
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_write(uuid) FROM authenticated;\n",
    B: "DROP FUNCTION public.widget_write(text);\n",
    C: "GRANT EXECUTE ON FUNCTION public.widget_write(uuid) TO authenticated;\n"}), C)
check("an intervening migration dropping another overload does not reset this one",
      code == 1, out + err)

# Finding 3 — the schema is part of the identity; unqualified means public.
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION private.widget_f(uuid) FROM anon;\n",
    B: "GRANT EXECUTE ON FUNCTION public.widget_f(uuid) TO anon;\n"}), B)
check("ACCEPT: a revoke in another schema does not constrain public", code == 0, out + err)
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_f(uuid) FROM anon;\n",
    B: "DROP FUNCTION private.widget_f(uuid);\n"
       "GRANT EXECUTE ON FUNCTION public.widget_f(uuid) TO anon;\n"}), B)
check("a DROP in another schema does not reset the public function", code == 1, out + err)
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION widget_f(uuid) FROM anon;\n",
    B: 'GRANT EXECUTE ON FUNCTION "public"."widget_f"(uuid) TO anon;\n'}), B)
check("an unqualified name is public, and quoted qualification still matches", code == 1, out)

# Finding 4 — equivalent argument type spellings are one signature.
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_t(uuid) FROM anon;\n",
    B: "GRANT EXECUTE ON FUNCTION public.widget_t(pg_catalog.uuid) TO anon;\n"}), B)
check("pg_catalog.uuid matches uuid", code == 1, out + err)
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_t(uuid) FROM anon;\n",
    B: "GRANT EXECUTE ON FUNCTION public.widget_t(pg_catalog.text) TO anon;\n"}), B)
check("ACCEPT: pg_catalog.text is a different overload from uuid", code == 0, out + err)
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_m(int4, int8, bool, varchar, timestamptz, text) FROM anon;\n",
    B: "GRANT EXECUTE ON FUNCTION public.widget_m(integer, bigint, boolean, character varying(32), "
       "timestamp with time zone, pg_catalog.text) TO anon;\n"}), B)
check("int4/int8/bool/varchar(n)/timestamptz/text aliases match their canonical names",
      code == 1, out + err)
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_m(timestamptz) FROM anon;\n",
    B: "GRANT EXECUTE ON FUNCTION public.widget_m(timestamp) TO anon;\n"}), B)
check("ACCEPT: timestamp without time zone is not timestamptz", code == 0, out + err)

# /finish review 2026-10-13 — PUBLIC includes every client role, so a grant or revoke
# spelled TO/FROM PUBLIC speaks for anon AND authenticated, in both directions.
code, out, err = run(mig_dir({
    A: f"REVOKE EXECUTE ON FUNCTION {FN} FROM anon;\n",
    B: f"GRANT EXECUTE ON FUNCTION {FN} TO PUBLIC;\n"}), B)
check("a GRANT TO PUBLIC re-opens a function revoked from anon",
      code == 1 and "widens-revoked" in out and "anon" in out and "PUBLIC" in out, out + err)
code, out, err = run(mig_dir({
    A: f"REVOKE EXECUTE ON FUNCTION {FN} FROM PUBLIC;\n",
    B: f"GRANT EXECUTE ON FUNCTION {FN} TO anon;\n"}), B)
check("a GRANT TO anon after a REVOKE FROM PUBLIC is a re-grant to anon",
      code == 1 and "widens-revoked" in out and "anon" in out, out + err)
code, out, err = run(mig_dir({
    A: f"REVOKE EXECUTE ON FUNCTION {FN} FROM authenticated;\n",
    B: f"GRANT EXECUTE ON FUNCTION {FN} TO PUBLIC;\n"}), A)
check("a later GRANT TO PUBLIC undoes an earlier REVOKE FROM authenticated (revoke-undone)",
      code == 1 and "revoke-undone" in out, out + err)
code, out, err = run(mig_dir({
    A: f"GRANT EXECUTE ON FUNCTION {FN} TO PUBLIC;\n",
    B: f"REVOKE EXECUTE ON FUNCTION {FN} FROM PUBLIC;\nGRANT EXECUTE ON FUNCTION {FN} TO authenticated;\n"}), B)
check("ACCEPT: the lockdown idiom after an earlier PUBLIC grant narrows anon, keeps authenticated",
      code == 0, out + err)
code, out, err = run(mig_dir({
    A: f"REVOKE EXECUTE ON FUNCTION {FN} FROM anon;\n",
    B: f"GRANT EXECUTE ON FUNCTION {FN} TO authenticated;\n"}), B)
check("ACCEPT: a revoke from anon does not constrain a grant to authenticated", code == 0, out + err)

# Codex probes, final round 2026-10-13. A role can execute when it holds a DIRECT grant
# OR PUBLIC does; REVOKE FROM PUBLIC removes only the PUBLIC grant, REVOKE FROM <role>
# only that role's direct grant.
W1 = "public.widget_write(uuid)"
LOCKDOWN = f"REVOKE EXECUTE ON FUNCTION {W1} FROM PUBLIC, anon, authenticated;\n"
code, out, err = run(mig_dir({
    A: LOCKDOWN,
    B: f"GRANT EXECUTE ON FUNCTION {W1} TO PUBLIC;\n"
       f"REVOKE EXECUTE ON FUNCTION {W1} FROM anon, authenticated;\n"}), B)
check("probe 1: a PUBLIC grant re-opens every role even when the same file revokes them directly",
      code == 1 and "widens-revoked" in out, out + err)
code, out, err = run(mig_dir({
    A: LOCKDOWN,
    B: f"GRANT EXECUTE ON FUNCTION {W1} TO authenticated;\n",
    C: f"REVOKE EXECUTE ON FUNCTION {W1} FROM PUBLIC;\n"}), A)
check("probe 2: a later REVOKE FROM PUBLIC does not re-assert over a later DIRECT grant",
      code == 1 and "revoke-undone" in out, out + err)
code, out, err = run(mig_dir({
    A: LOCKDOWN,
    B: f"GRANT EXECUTE ON FUNCTION {W1} TO authenticated;\n",
    C: f"REVOKE EXECUTE ON FUNCTION {W1} FROM authenticated;\n"}), A)
check("ACCEPT: a later REVOKE FROM the same role does re-assert", code == 0, out + err)
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_batch(uuid[]) FROM anon;\n",
    B: "GRANT EXECUTE ON FUNCTION widget_batch(uuid ARRAY) TO anon;\n"}), B)
check("probe 3: `uuid ARRAY` is the same type as `uuid[]`", code == 1, out + err)
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_out(IN p_id uuid, OUT result text) FROM anon;\n",
    B: "GRANT EXECUTE ON FUNCTION widget_out(uuid) TO anon;\n"}), B)
check("probe 4: OUT parameters are not part of the signature", code == 1, out + err)
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.widget_out(INOUT p uuid, VARIADIC v text[]) FROM anon;\n",
    B: "GRANT EXECUTE ON FUNCTION widget_out(uuid) TO anon;\n"}), B)
check("ACCEPT: INOUT and VARIADIC types stay in the signature", code == 0, out + err)
code, out, err = run(mig_dir({
    A: "REVOKE EXECUTE ON FUNCTION public.f(uuid), public.g(uuid) FROM authenticated;\n",
    B: "REVOKE EXECUTE ON FUNCTION public.g(uuid) FROM authenticated;\n",
    C: "-- widens-revoked-grant: 20260101000000 intentionally reopen f only\n"
       "GRANT EXECUTE ON FUNCTION public.f(uuid), public.g(uuid) TO authenticated;\n"}), A)
check("probe 5: acknowledging one function's revoke does not cover another's",
      code == 1 and "public.g(uuid)" in out and "public.f(uuid)" not in out, out + err)

# Missing target — a file the checker cannot find must refuse, never pass silently.
code, out, err = run(mig_dir({A: REVOKE_AUTH}), "20260109000000_not_there.sql")
check("a target that is not in the migrations directory exits 2, never 0",
      code == 2 and "did NOT run" in err, f"exit {code}: {out}{err}")

# ---------------------------------------------------------------------------
print("\n--index reads what the commit will hold, not the working tree (Codex finding 1)")


def git_repo(files, stage):
    """A throwaway repo holding supabase/migrations/<files>; only `stage` are added."""
    root = tempfile.mkdtemp(prefix="mgo-git-")
    subprocess.run(["git", "init", "-q", root], check=True)
    d = os.path.join(root, "supabase", "migrations")
    os.makedirs(d)
    for name, body in files.items():
        with open(os.path.join(d, name), "w", encoding="utf-8") as fh:
            fh.write(body)
    if stage:
        subprocess.run(["git", "-C", root, "add", "--",
                        *[os.path.join("supabase", "migrations", n) for n in stage]], check=True)
    return root, d


def run_index(d, *targets):
    # Targets are passed repo-relative, exactly as pre-commit passes them.
    p = subprocess.run([sys.executable, CHECKER, "--index", "--dir", d,
                        *[f"supabase/migrations/{t}" for t in targets]],
                       capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(d)))
    return p.returncode, p.stdout, p.stderr


root, d = git_repo({A: REVOKE_AUTH, B: GRANT_AUTH}, stage=[A, B])
with open(os.path.join(d, B), "w") as fh:
    fh.write("SELECT 1;\n")   # working tree now harmless; the index still holds the GRANT
code, out, err = run_index(d, B)
check("a staged GRANT is refused even when the working tree copy is harmless",
      code == 1 and "widens-revoked" in out, out + err)
subprocess.run(["git", "-C", root, "add", "--", f"supabase/migrations/{B}"], check=True)
code, out, err = run_index(d, B)
check("ACCEPT: once the harmless version is what is staged, it passes", code == 0, out + err)

root, d = git_repo({A: REVOKE_AUTH, B: GRANT_AUTH, C: REVOKE_AUTH}, stage=[A, B])
code, out, err = run_index(d, A)
check("an UNTRACKED re-assert does not hide a staged revoke-undone contradiction",
      code == 1 and "revoke-undone" in out, out + err)
subprocess.run(["git", "-C", root, "add", "--", f"supabase/migrations/{C}"], check=True)
code, out, err = run_index(d, A)
check("ACCEPT: once the re-assert is staged it counts", code == 0, out + err)

root, d = git_repo({A: REVOKE_AUTH, B: GRANT_AUTH}, stage=[A])
code, out, err = run_index(d, B)
check("a target that is not in the index exits 2, never 0",
      code == 2 and "did NOT run" in err, f"exit {code}: {out}{err}")

# ---------------------------------------------------------------------------
print("\nRound 5 (Opus adversarial review 2026-10-14)")


def run_gate(d, *targets, invariant=False):
    cmd = [sys.executable, CHECKER, "--index", "--dir", d]
    cmd += ["--invariant"] if invariant else []
    cmd += [f"supabase/migrations/{t}" for t in targets]
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(d)))
    return p.returncode, p.stdout, p.stderr


def git(root, *args):
    subprocess.run(["git", "-C", root, *args], check=True, capture_output=True)


GA = "GRANT EXECUTE ON FUNCTION public.widget_write(uuid, jsonb) TO anon;\n"
RA = "REVOKE EXECUTE ON FUNCTION public.widget_write(uuid, jsonb) FROM anon;\n"
D0101, D0115, D0201 = ("20260101000000_create.sql", "20260115000000_new.sql",
                       "20260201000000_applied.sql")

# 1. Apply order is not filename order: migrate.sh applies every version missing from
# remote history, so a NEW file dated before an applied revoke runs AFTER it.
root, d = git_repo({D0101: "", D0201: RA, D0115: GA}, stage=[D0101, D0201, D0115])
code, out, err = run_gate(d, D0115)
check("1: a new GRANT dated before an applied REVOKE is refused (it applies last)",
      code == 1 and "widens-revoked" in out, out + err)
root, d = git_repo({D0101: "", D0201: RA,
                    D0115: "-- widens-revoked-grant: 20260201000000 reopened on purpose (P9)\n" + GA},
                   stage=[D0101, D0201, D0115])
code, out, err = run_gate(d, D0115)
check("1 ACCEPT: the same grant acknowledging the applied revoke", code == 0, out + err)
code, out, err = run(mig_dir({D0101: "", D0201: RA, D0115: GA}), D0115)
check("1: the same holds when reading the working tree", code == 1, out + err)
root, d = git_repo({D0101: "", D0201: GA, D0115: RA}, stage=[D0101, D0201, D0115])
code, out, err = run_gate(d, D0115)
check("1: a new REVOKE dated before an existing GRANT is still refused (replay ends granted)",
      code == 1 and "revoke-undone" in out, out + err)


def commit_all(root):
    """Record the index as HEAD with plumbing (no hooks involved: this is a fixture)."""
    tree = subprocess.run(["git", "-C", root, "write-tree"], capture_output=True, text=True,
                          check=True).stdout.strip()
    c = subprocess.run(["git", "-C", root, "-c", "user.name=t", "-c", "user.email=t@t",
                        "commit-tree", tree, "-m", "fixture"], capture_output=True, text=True,
                       check=True).stdout.strip()
    git(root, "update-ref", "HEAD", c)


# Gate 7c: an EDIT to an already-committed migration does not move it — migrate.sh never
# re-runs a version already applied, so its filename position is its real place.
root, d = git_repo({D0101: "", D0115: GA, D0201: RA}, stage=[D0101, D0115, D0201])
commit_all(root)
with open(os.path.join(d, D0115), "a") as fh:
    fh.write("-- comment-only edit\n")
git(root, "add", f"supabase/migrations/{D0115}")
code, out, err = run_gate(d, D0115)
check("1 ACCEPT: editing an already-committed early GRANT is judged in place, not as last",
      code == 0, out + err)

# 2. Whole-tree invariant over the index: no UNACKNOWLEDGED revoke-then-grant whose
# final state is granted. Renames, deletes and edits of a re-assert all reach it.
BASE = {A: REVOKE_AUTH, B: GRANT_AUTH, C: REVOKE_AUTH}
root, d = git_repo(BASE, stage=list(BASE))
code, out, err = run_gate(d, invariant=True)
check("2 ACCEPT: the invariant passes while the re-assert is last", code == 0, out + err)
git(root, "mv", f"supabase/migrations/{C}", "supabase/migrations/20260101120000_c.sql")
code, out, err = run_gate(d, "20260101120000_c.sql", invariant=True)
check("2: renaming the re-assert to before the grant is refused",
      code == 1 and "invariant" in out, out + err)
root, d = git_repo(BASE, stage=list(BASE))
git(root, "rm", "-q", "--cached", f"supabase/migrations/{C}")
code, out, err = run_gate(d, invariant=True)
check("2: deleting the re-assert is refused", code == 1 and "invariant" in out, out + err)
root, d = git_repo(BASE, stage=list(BASE))
with open(os.path.join(d, C), "w") as fh:
    fh.write("SELECT 1;\n")
git(root, "add", f"supabase/migrations/{C}")
code, out, err = run_gate(d, C, invariant=True)
check("2: editing the re-assert so it no longer revokes is refused",
      code == 1 and "invariant" in out, out + err)
root, d = git_repo({A: REVOKE_AUTH,
                    B: "-- widens-revoked-grant: 20260101000000 reopened on purpose (P9)\n" + GRANT_AUTH},
                   stage=[A, B])
code, out, err = run_gate(d, invariant=True)
check("2 ACCEPT: an acknowledged re-grant ending granted passes the invariant", code == 0, out + err)

# 4a. The annotation counts only as a real `--` comment line.
for where, body in (
        ("a block comment", "/*\n-- widens-revoked-grant: 20260101000000 sneaky\n*/\n"),
        ("a string literal", "SELECT '\n-- widens-revoked-grant: 20260101000000 sneaky\n';\n"),
        ("a DO body", "DO $$\n-- widens-revoked-grant: 20260101000000 sneaky\nBEGIN END $$;\n")):
    code, out, err = run(mig_dir({A: REVOKE_AUTH, B: body + GRANT_AUTH}), B)
    check(f"4a: an annotation inside {where} does not count", code == 1, out + err)

# 4b. _T is the internal name of T[].
code, out, err = run(mig_dir({A: "REVOKE EXECUTE ON FUNCTION public.f(text[]) FROM anon;\n",
                              B: "GRANT EXECUTE ON FUNCTION public.f(_text) TO anon;\n"}), B)
check("4b: _text matches text[]", code == 1, out + err)
code, out, err = run(mig_dir({A: "REVOKE EXECUTE ON FUNCTION public.f(int4[]) FROM anon;\n",
                              B: "GRANT EXECUTE ON FUNCTION public.f(_int4) TO anon;\n"}), B)
check("4b: _int4 matches integer[]", code == 1, out + err)
code, out, err = run(mig_dir({A: "REVOKE EXECUTE ON FUNCTION public.f(text[]) FROM anon;\n",
                              B: "GRANT EXECUTE ON FUNCTION public.f(text) TO anon;\n"}), B)
check("4b ACCEPT: text is not text[]", code == 0, out + err)

# 4c. An argument whose NAME is a type word.
code, out, err = run(mig_dir({A: "REVOKE EXECUTE ON FUNCTION public.f(timestamptz) FROM anon;\n",
                              B: "GRANT EXECUTE ON FUNCTION public.f(time timestamptz) TO anon;\n"}), B)
check("4c: an argument named `time` of type timestamptz is timestamptz", code == 1, out + err)
code, out, err = run(mig_dir({A: "REVOKE EXECUTE ON FUNCTION public.f(timetz) FROM anon;\n",
                              B: "GRANT EXECUTE ON FUNCTION public.f(time with time zone) TO anon;\n"}), B)
check("4c: `time with time zone` is still a bare type", code == 1, out + err)
code, out, err = run(mig_dir({A: "REVOKE EXECUTE ON FUNCTION public.f(timestamptz) FROM anon;\n",
                              B: "GRANT EXECUTE ON FUNCTION public.f(p time) TO anon;\n"}), B)
check("4c ACCEPT: `p time` is type time, not timestamptz", code == 0, out + err)

# 4d. An argument-less GRANT reaches every overload, so it is judged against each.
code, out, err = run(mig_dir({A: "REVOKE EXECUTE ON FUNCTION public.o(uuid) FROM anon;\n",
                              B: "DROP FUNCTION public.o(text);\nGRANT EXECUTE ON FUNCTION o TO anon;\n"}), B)
check("4d: DROP o(text) then GRANT ON FUNCTION o still re-opens o(uuid)", code == 1, out + err)
code, out, err = run(mig_dir({A: "REVOKE EXECUTE ON FUNCTION public.o(uuid) FROM anon;\n"
                                 "GRANT EXECUTE ON FUNCTION public.o(text) TO anon;\n",
                              B: "GRANT EXECUTE ON FUNCTION o TO anon;\n"}), B)
check("4d: a newer grant on another overload does not hide o(uuid)'s revoke", code == 1, out + err)

# ---------------------------------------------------------------------------
print("\nRound 6 (Codex 2026-10-14)")
ACK_A = "-- widens-revoked-grant: 20260101000000 reopened on purpose (P9)\n"
Z = "20251231000000_z.sql"

# 1. An acknowledgement covers only the revoke it cites. A NEW revoke dated before A is
# re-opened by B on replay, and B never cited it.
root, d = git_repo({A: REVOKE_AUTH, B: ACK_A + GRANT_AUTH}, stage=[A, B])
commit_all(root)
with open(os.path.join(d, Z), "w") as fh:
    fh.write(REVOKE_AUTH)
git(root, "add", f"supabase/migrations/{Z}")
code, out, err = run_gate(d, Z, invariant=True)
check("6.1: an acknowledgement of A does not exempt a different, earlier revoke",
      code == 1 and "20251231000000" in out, out + err)
root, d = git_repo({A: REVOKE_AUTH,
                    B: "-- widens-revoked-grant: 20251231000000 also this one (P9)\n" + ACK_A + GRANT_AUTH,
                    Z: REVOKE_AUTH}, stage=[A, B, Z])
code, out, err = run_gate(d, Z, invariant=True)
check("6.1 ACCEPT: citing both revokes covers both", code == 0, out + err)

# 2. Equivalent type spellings.
for revoked, granted in (("uuid[]", "uuid[][]"), ("character varying", "char varying"),
                         ("varchar", "national character varying"), ("varbit", "bit varying"),
                         ("int2[]", "smallint[][]")):
    code, out, err = run(mig_dir({A: f"REVOKE EXECUTE ON FUNCTION public.f({revoked}) FROM anon;\n",
                                  B: f"GRANT EXECUTE ON FUNCTION public.f({granted}) TO anon;\n"}), B)
    check(f"6.2: {granted} is the same type as {revoked}", code == 1, out + err)
code, out, err = run(mig_dir({A: "REVOKE EXECUTE ON FUNCTION public.f(character varying) FROM anon;\n",
                              B: "GRANT EXECUTE ON FUNCTION public.f(character) TO anon;\n"}), B)
check("6.2 ACCEPT: character is not character varying", code == 0, out + err)

# 3. Transaction control: a rolled-back revoke must not count as protection. Fail closed.
TX = f"BEGIN;\n{REVOKE_AUTH}ROLLBACK;\n"
code, out, err = run(mig_dir({A: TX, B: GRANT_AUTH}), A)
check("6.3: ROLLBACK in a file that revokes is refused as unsupported transaction control",
      code == 1 and "unsupported transaction control" in out, out + err)
code, out, err = run(mig_dir({A: REVOKE_AUTH, B: f"SAVEPOINT s;\n{GRANT_AUTH}ROLLBACK TO s;\n"}), A)
check("6.3: a SAVEPOINT / ROLLBACK TO in a corpus file the analysis depends on is refused",
      code == 1 and "unsupported transaction control" in out, out + err)
code, out, err = run(mig_dir({A: "-- grant-order-transaction-control: reviewed, the revoke is outside the rolled-back part\n"
                                 + REVOKE_AUTH + "BEGIN;\nSELECT 1;\nROLLBACK;\n"}), A)
check("6.3 ACCEPT: annotated transaction control", code == 0, out + err)
code, out, err = run(mig_dir({A: REVOKE_AUTH + "-- ROLLBACK;\nSELECT 'ROLLBACK;';\n"
                                 "DO $$ BEGIN ROLLBACK; END $$;\n"}), A)
check("6.3 ACCEPT: ROLLBACK in a comment, a literal or a body is not transaction control",
      code == 0, out + err)
code, out, err = run(mig_dir({A: REVOKE_AUTH, B: "SAVEPOINT s;\nSELECT 1;\nROLLBACK TO s;\n"}), A)
check("6.3 ACCEPT: transaction control in a file with no function GRANT/REVOKE", code == 0, out + err)

# 4. Generations: a DROP of the same overload ends the object; transitions before it are
# judged within it, so the invariant no longer refuses an old, since re-asserted restore.
HIST = {A: REVOKE_AUTH, B: GRANT_AUTH, C: REVOKE_AUTH}
RECREATE = (f"DROP FUNCTION {FN};\nCREATE FUNCTION {FN} RETURNS void LANGUAGE sql AS $$ select 1 $$;\n"
            + GRANT_AUTH)
D4 = "20260104000000_d.sql"
root, d = git_repo(HIST, stage=list(HIST))
commit_all(root)
with open(os.path.join(d, D4), "w") as fh:
    fh.write(RECREATE)
git(root, "add", f"supabase/migrations/{D4}")
code, out, err = run_gate(d, D4, invariant=True)
check("6.4 ACCEPT: drop + recreate + grant after an old re-asserted restore", code == 0, out + err)
root, d = git_repo({A: REVOKE_AUTH, B: GRANT_AUTH,
                    D4: "DROP FUNCTION public.widget_write(text);\n"}, stage=[A, B, D4])
code, out, err = run_gate(d, D4, invariant=True)
check("6.4: dropping a DIFFERENT overload does not end the generation", code == 1, out + err)

# ---------------------------------------------------------------------------
print("\nRound 7 (Codex 2026-10-14, parser)")
RA_U = "REVOKE EXECUTE ON FUNCTION public.f(uuid) FROM anon;\n"
GA_U = "GRANT EXECUTE ON FUNCTION public.f(uuid) TO anon;\n"


def create_f(args):
    return f"CREATE FUNCTION public.f(\n  {args}\n) RETURNS integer LANGUAGE sql AS $$ select 1 $$;\n"


# 1. A CREATE's argument list runs to its BALANCED close paren: a `)` inside a DEFAULT
# expression must not cut it short and record a reset of the wrong overload.
for desc, args in (("a parenthesised DEFAULT", "p uuid DEFAULT gen_random_uuid(), q text DEFAULT ''"),
                   ("a plain DEFAULT (control)", "p uuid DEFAULT NULL, q text DEFAULT ''")):
    root, d = git_repo({A: RA_U, B: create_f(args) + GA_U}, stage=[A, B])
    code, out, err = run_gate(d, B, invariant=True)
    check(f"7.1: CREATE f(uuid, text) with {desc} does not reset f(uuid)",
          code == 1 and "widens-revoked" in out, out + err)
root, d = git_repo({A: RA_U, B: create_f("p uuid DEFAULT gen_random_uuid()") + GA_U}, stage=[A, B])
code, out, err = run_gate(d, B, invariant=True)
check("7.1 ACCEPT: CREATE f(uuid) with a parenthesised DEFAULT still resets f(uuid)", code == 0, out + err)
root, d = git_repo({A: RA_U, B: 'CREATE FUNCTION public."f)"(p uuid) RETURNS integer LANGUAGE sql '
                                "AS $$ select 1 $$;\n" + GA_U}, stage=[A, B])
code, out, err = run_gate(d, B, invariant=True)
check('7.1: a `)` inside a quoted identifier does not end the scan (public."f)" is another function)',
      code == 1 and "widens-revoked" in out, out + err)

# 2. Typmods are not part of function identity, and a space inside one must not split it
# into an argument name and a type.
for granted in ("numeric(10, 2)", "numeric(10,2)", "numeric", "p numeric(10, 2)", "numeric (10, 2)",
                "numeric(10, 2)[]"):
    revoked = "numeric[]" if granted.endswith("[]") else "numeric"
    code, out, err = run(mig_dir({A: f"REVOKE EXECUTE ON FUNCTION public.f({revoked}) FROM anon;\n",
                                  B: f"GRANT EXECUTE ON FUNCTION public.f({granted}) TO anon;\n"}), B)
    check(f"7.2: f({granted}) is f({revoked})", code == 1 and "widens-revoked" in out, out + err)
code, out, err = run(mig_dir({A: "REVOKE EXECUTE ON FUNCTION public.f(numeric) FROM anon;\n",
                              B: "GRANT EXECUTE ON FUNCTION public.f(integer) TO anon;\n"}), B)
check("7.2 ACCEPT: f(integer) is not f(numeric)", code == 0, out + err)

# 3. revoke-undone judges a revoke within its own generation: a later DROP/CREATE of the
# same signature ends the object the revoke closed, so a grant on the NEW object does not
# undo it — the invariant already sees the reset.
for desc, b_body, refused in (
        ("dropped and re-created", "DROP FUNCTION public.f(uuid);\n" + create_f("p uuid"), False),
        ("a DIFFERENT overload dropped (control)", "DROP FUNCTION public.f(text);\n", True)):
    root, d = git_repo({A: RA_U, B: b_body, C: GA_U}, stage=[A, B, C])
    commit_all(root)
    with open(os.path.join(d, A), "a") as fh:
        fh.write("-- comment-only edit\n")
    git(root, "add", f"supabase/migrations/{A}")
    code, out, err = run_gate(d, A, invariant=True)
    if refused:
        check(f"7.3: comment edit to a revoke, {desc}: still revoke-undone",
              code == 1 and "revoke-undone" in out, out + err)
    else:
        check(f"7.3 ACCEPT: comment edit to a revoke whose function was later {desc}",
              code == 0, out + err)

# ---------------------------------------------------------------------------
print("\nP1488: --index under a REAL pre-commit hook, from a linked worktree and from main")
# git exports GIT_DIR to hooks, absolute and without GIT_WORK_TREE, from a linked worktree
# (not from a main checkout). With GIT_DIR set, git takes the cwd as the top of the work
# tree, so the checker's `git -C <migrations dir> ls-files` read the migrations dir as the
# repo root: every entry came back as supabase/migrations/..., none was a bare migration
# name, and the corpus was EMPTY. A staged migration then exited 2 ("not found"), and a
# commit staging only a rename or deletion passed --invariant over 0 migrations. A
# reconstructed env would only prove the variables I thought of, so these cases run an
# actual `git commit` and read what the checker said inside the hook.


def hook_run(repo_root, worktree, *pathspec):
    """`git commit` in `worktree` through a pre-commit hook that runs the checker exactly
    as pre-commit-checks.sh does (targets = staged ACMR migrations, so none for a
    deletion-only commit). The hook records exit code + output and then aborts, so the
    fixture stays staged."""
    rec = tempfile.mkdtemp(prefix="mgo-hookrec-")
    hook = os.path.join(repo_root, ".git", "hooks", "pre-commit")
    targets = "$(git diff --cached --name-only --diff-filter=ACMR | grep '^supabase/migrations/.*\\.sql$')"
    with open(hook, "w") as fh:
        fh.write("#!/bin/sh\n"
                 f"'{sys.executable}' '{CHECKER}' --index --dir \"$PWD/supabase/migrations\" "
                 f"--invariant {targets} > '{rec}/out' 2>&1\n"
                 f"echo $? > '{rec}/rc'\n"
                 "exit 1\n")
    os.chmod(hook, 0o755)
    subprocess.run(["git", "-C", worktree, "-c", f"core.hooksPath={os.path.dirname(hook)}",
                    "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false",
                    "commit", "-q", "-m", "fixture", *pathspec], capture_output=True)
    if not os.path.exists(os.path.join(rec, "rc")):
        return None, "hook did not run"
    with open(os.path.join(rec, "rc")) as fh, open(os.path.join(rec, "out")) as fo:
        return int(fh.read().strip()), fo.read()


def linked_worktree(root):
    wt = tempfile.mkdtemp(prefix="mgo-wt-")
    os.rmdir(wt)
    git(root, "worktree", "add", "-q", "-b", "feat", wt)
    return wt, os.path.join(wt, "supabase", "migrations")


root, d = git_repo({A: REVOKE_AUTH}, stage=[A])
commit_all(root)
wt, wd = linked_worktree(root)
with open(os.path.join(wd, B), "w") as fh:
    fh.write("SELECT 1;\n")
git(wt, "add", f"supabase/migrations/{B}")
code, out = hook_run(root, wt)
check("P1488: a harmless migration committed from a linked worktree passes inside the hook",
      code == 0 and "across 2 migrations" in out, f"exit {code}: {out}")

with open(os.path.join(wd, B), "w") as fh:
    fh.write(GRANT_AUTH)
git(wt, "add", f"supabase/migrations/{B}")
code, out = hook_run(root, wt)
check("P1488: from a linked worktree the hook still REFUSES a contradiction (exit 1, not 2)",
      code == 1 and "widens-revoked" in out, f"exit {code}: {out}")

# A pathspec commit records the WORKING TREE copy of the named path, through a temporary
# index git exports as GIT_INDEX_FILE. The default index still holds the harmless version,
# so a fix that dropped GIT_INDEX_FILE would read that and pass a GRANT being committed.
with open(os.path.join(wd, B), "w") as fh:
    fh.write("SELECT 1;\n")
git(wt, "add", f"supabase/migrations/{B}")
with open(os.path.join(wd, B), "w") as fh:
    fh.write(GRANT_AUTH)
code, out = hook_run(root, wt, "--", f"supabase/migrations/{B}")
check("P1488: a pathspec commit from a linked worktree is judged on the temporary index "
      "it records (refused, though the default index holds a harmless copy)",
      code == 1 and "widens-revoked" in out, f"exit {code}: {out}")

# The kept GIT_INDEX_FILE is only sound for the repository GIT_DIR names. Pointed at a
# different one, the checker must refuse rather than read one repo's paths from another's index.
other, od = git_repo({A: REVOKE_AUTH}, stage=[A])
p = subprocess.run([sys.executable, CHECKER, "--index", "--invariant", "--dir", od],
                   capture_output=True, text=True, cwd=wt,
                   env={**os.environ, "GIT_DIR": subprocess.run(
                       ["git", "-C", wt, "rev-parse", "--absolute-git-dir"],
                       capture_output=True, text=True, check=True).stdout.strip()})
check("P1488: GIT_DIR naming a different repository than --dir exits 2, never reads it",
      p.returncode == 2 and "another repository" in p.stderr, f"exit {p.returncode}: {p.stdout}{p.stderr}")

# Deleting the re-assert leaves the unacknowledged GRANT as the last word. The commit
# stages no ACMR migration, so the hook runs --invariant alone — which over an empty
# corpus reported "holds across 0 migrations" and exited 0.
root, d = git_repo({A: REVOKE_AUTH, B: GRANT_AUTH, C: REVOKE_AUTH}, stage=[A, B, C])
commit_all(root)
wt, wd = linked_worktree(root)
git(wt, "rm", "-q", f"supabase/migrations/{C}")
code, out = hook_run(root, wt)
check("P1488: deleting a re-assert from a linked worktree is refused inside the hook "
      "(exit 1, not a vacuous 0)",
      code == 1 and "REFUSED" in out, f"exit {code}: {out}")

# Control: the main checkout, where git exports only a relative GIT_INDEX_FILE. This
# passed before the fix too; it pins that the fix did not trade one checkout for the other.
root, d = git_repo({A: REVOKE_AUTH}, stage=[A])
commit_all(root)
with open(os.path.join(d, B), "w") as fh:
    fh.write(GRANT_AUTH)
git(root, "add", f"supabase/migrations/{B}")
code, out = hook_run(root, root)
check("P1488 control: from the main checkout the hook refuses the same contradiction",
      code == 1 and "widens-revoked" in out, f"exit {code}: {out}")
with open(os.path.join(d, B), "w") as fh:
    fh.write("SELECT 1;\n")
git(root, "add", f"supabase/migrations/{B}")
code, out = hook_run(root, root)
check("P1488 control: from the main checkout a harmless migration passes",
      code == 0 and "across 2 migrations" in out, f"exit {code}: {out}")

# An index that holds no migrations at all is a scoping fault, never a clean tree.
root, d = git_repo({A: REVOKE_AUTH}, stage=[])
code, out, err = run_gate(d, invariant=True)
check("P1488: --index over an index holding no migrations exits 2, never 0",
      code == 2 and "did NOT run" in err, f"exit {code}: {out}{err}")

# ---------------------------------------------------------------------------
print("\nP1488: the PRODUCTION hook block (extracted from pre-commit-checks.sh, real run-quiet.sh)")
# The cases above call the checker directly, so they prove the checker and nothing about the
# hook. The hook wrapper is what unblocks branches still carrying the PRE-fix checker: the
# hook is main's pre-commit-checks.sh, but ./scripts/check-migration-grant-order.py is the
# committing checkout's copy. So the block is lifted from pre-commit-checks.sh at test time,
# sourced after the real run-quiet.sh exactly as the hook does, and run by a real `git commit`
# against both checkers, from both checkouts, for plain / pathspec / `commit -a` commits.
# The hook lets the commit land when the block reports no error, so a pass is judged by the
# commit actually landing, not by a log line.
PRECOMMIT = os.environ.get("MGO_PRECOMMIT_SCRIPT", os.path.join(HERE, "pre-commit-checks.sh"))
RUN_QUIET = os.path.join(HERE, "lib", "run-quiet.sh")
PRE_FIX_SHA = "8eb928e55"   # P1102's last commit on main: the checker every pre-P1488 branch carries
CHECKER_DEPS = ("check-migration-grant-order.py", "function-grant-drift-check.py", "rls-drift-check.py")

with open(PRECOMMIT) as fh:
    _lines = fh.read().splitlines()
try:
    _start = next(i for i, ln in enumerate(_lines) if ln.startswith("GRANT_ORDER_TOUCHED="))
    _end = next(i for i in range(_start, len(_lines)) if _lines[i] == "fi")
    HOOK_BLOCK = "\n".join(_lines[_start:_end + 1]) + "\n"
except StopIteration:
    HOOK_BLOCK = ""
check("the P1102 block is found in pre-commit-checks.sh and calls the checker",
      "check-migration-grant-order.py --index --invariant" in HOOK_BLOCK, PRECOMMIT)


def checker_sources():
    fixed = {}
    for f in CHECKER_DEPS:
        with open(os.path.join(HERE, f)) as fh:
            fixed[f] = fh.read()
    pre = {}
    for f in CHECKER_DEPS:
        p = subprocess.run(["git", "-C", HERE, "show", f"{PRE_FIX_SHA}:scripts/{f}"],
                           capture_output=True, text=True)
        pre[f] = p.stdout if p.returncode == 0 else None
    return {"fixed": fixed, "pre-fix": pre}


SOURCES = checker_sources()
check(f"the pre-fix checker is readable from history ({PRE_FIX_SHA}) and really is pre-fix",
      all(SOURCES["pre-fix"].values())
      and "_git_env" not in SOURCES["pre-fix"]["check-migration-grant-order.py"])

HARMLESS = "SELECT 1;\n"


def block_fixture(sources, linked):
    """A repo whose checkout carries `sources` as its ./scripts/ checker, A (a REVOKE)
    committed, and the production block installed as its pre-commit hook. Returns
    (repo root, checkout to commit in, hook record dir)."""
    root, _ = git_repo({A: REVOKE_AUTH}, stage=[A])
    os.makedirs(os.path.join(root, "scripts"))
    for f, body in sources.items():
        with open(os.path.join(root, "scripts", f), "w") as fh:
            fh.write(body)
    git(root, "add", "scripts")
    commit_all(root)
    rec = tempfile.mkdtemp(prefix="mgo-blockrec-")
    hook = os.path.join(root, ".git", "hooks", "pre-commit")
    with open(hook, "w") as fh:
        fh.write("#!/bin/bash\n"
                 f". '{RUN_QUIET}'\n"
                 "ERRORS=0\n"
                 + HOOK_BLOCK +
                 f"echo \"$ERRORS\" > '{rec}/errors'\n"
                 "[ \"$ERRORS\" -eq 0 ]\n")
    os.chmod(hook, 0o755)
    co = linked_worktree(root)[0] if linked else root
    return root, co, rec


def block_commit(root, co, rec, mode, recorded, other):
    """Arrange the checkout so the commit RECORDS `recorded` for B while the other copy
    (index or working tree, by mode) holds `other`, then commit through the real hook.
    Returns (landed, errors, output)."""
    path = os.path.join(co, "supabase", "migrations", B)
    rel = f"supabase/migrations/{B}"
    if mode == "plain":            # records the index
        index_body, tree_body = recorded, other
    else:                          # pathspec / -a record the working tree
        index_body, tree_body = other, recorded
    with open(path, "w") as fh:
        fh.write(index_body)
    git(co, "add", rel)
    with open(path, "w") as fh:
        fh.write(tree_body)
    extra = {"plain": [], "pathspec": ["--", rel], "all": ["-a"]}[mode]
    before = subprocess.run(["git", "-C", co, "rev-parse", "HEAD"], capture_output=True, text=True).stdout
    p = subprocess.run(["git", "-C", co, "-c", f"core.hooksPath={os.path.join(root, '.git', 'hooks')}",
                        "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false",
                        "commit", "-q", "-m", "fixture", *extra], capture_output=True, text=True)
    after = subprocess.run(["git", "-C", co, "rev-parse", "HEAD"], capture_output=True, text=True).stdout
    try:
        with open(os.path.join(rec, "errors")) as fh:
            errors = fh.read().strip()
    except OSError:
        errors = "hook did not run"
    return before != after, errors, p.stdout + p.stderr


for which in ("fixed", "pre-fix"):
    for linked in (False, True):
        where = "linked worktree" if linked else "main checkout"
        for mode in ("plain", "pathspec", "all"):
            root, co, rec = block_fixture(SOURCES[which], linked)
            landed, errors, out = block_commit(root, co, rec, mode, recorded=GRANT_AUTH, other=HARMLESS)
            check(f"hook block, {which} checker, {where}, {mode} commit: a recorded contradicting "
                  "GRANT is REFUSED and does not land",
                  not landed and errors == "1" and "widens-revoked" in out,
                  f"landed={landed} errors={errors}\n{out[-600:]}")
            root, co, rec = block_fixture(SOURCES[which], linked)
            landed, errors, out = block_commit(root, co, rec, mode, recorded=HARMLESS, other=GRANT_AUTH)
            check(f"hook block, {which} checker, {where}, {mode} commit: a recorded harmless "
                  "migration passes and lands",
                  landed and errors == "0", f"landed={landed} errors={errors}\n{out[-600:]}")

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
