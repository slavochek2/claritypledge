---
status: in-progress
type: task
rank: 29
workstream: infrastructure
created_date: '2026-10-13'
tags: [migrations, pre-commit, client-safety, gates]
disclosure: public
intent: cold-start
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1473: The migration client-safety gate cannot see a dropped or re-signed RPC

## Problem

Filed cold from an agent-written task-inbox note. There was no founder conversation to quote.

**Situation:** `scripts/check-migration-client-safety.sh` (P887, after the P886 incident) runs from
pre-commit (`pre-commit-checks.sh:1643`) on newly staged migrations. A migration that matches a
client-breaking SQL shape must carry `-- requires-frontend: <sha>` or `-- client-safe: <reason>`.
`BREAKING_SHAPES` (`:27`) covers four shapes: `REVOKE … FROM … anon|authenticated`, `DROP POLICY`,
`ALTER TABLE … DROP COLUMN`, and `ALTER COLUMN … TYPE`.

**Complication:** It has no `DROP FUNCTION` arm, so it cannot see a changed RPC signature. A changed
signature is exactly what breaks a deployed client: PGRST202, or 42501 on every call, which is the
incident class the gate exists for. During P1058, three migrations dropped and recreated
`release_joiner_seat` under a new signature. They needed no annotation, so their `requires-frontend`
markers were purely voluntary. The 2026-09-09 ruling (below) says this shape *needs* the marker.

Reproduced on main 2026-10-13 with a scratch fixture containing `DROP FUNCTION IF EXISTS
public.f(uuid); CREATE FUNCTION public.f(uuid, text) …; REVOKE ALL ON FUNCTION public.f(uuid, text)
FROM PUBLIC;` and no annotation: **exit 0**. Control: `REVOKE SELECT ON public.profiles FROM anon;`
with no annotation: **exit 1**.

The existing test block (`src/tests/p887-reproduce.test.ts:346`, "P887:
check-migration-client-safety.sh") has no `DROP FUNCTION` or `FROM PUBLIC` case.

**Question:** Which new shapes can the gate require an annotation for without flagging routine,
safe migrations?

## Appetite

- **Blast radius:** every future migration commit. Too broad a shape adds annotation friction to
  routine work; too narrow a shape is the current gap.
- **Reversibility:** `git revert`. The gate only runs on newly staged migrations, so existing files
  are never re-gated.
- **Decision density:** zero founder decisions.

## Invariants

- **Comment lines stay excluded from shape detection** (`:31-34`). Prose such as `-- this migration
  does not DROP FUNCTION` must not trip the gate.
- **The two annotation forms and their meaning are unchanged.** `migrate.sh --env prod` reads
  `requires-frontend`. A single malformed marker rejects the whole prod run (decisions.md
  2026-09-15), so this spec must not change the marker syntax.

## Solution

Add two arms to `BREAKING_SHAPES`, each chosen against a corpus measurement already taken
(2026-10-13, 413 migrations, counting only files with **no** existing annotation):

| Candidate arm | Unannotated corpus files it would flag | Verdict |
|---|---|---|
| `DROP[[:space:]]+FUNCTION` | 12 | **Add.** Dropping a function a client calls is breaking by definition. 12 of 413 is a reviewable rate, and the remedy is one comment line |
| `REVOKE … FROM PUBLIC`, bare | 9, **all** of which also `CREATE FUNCTION` in the same file (new-function hardening) | **Do not add bare.** Every hit is the standard harden-a-new-function pattern, so every hit is a false positive |
| `REVOKE … FROM PUBLIC` only in a file that does not itself `CREATE [OR REPLACE] FUNCTION` | 0 | **Add.** This is a revoke on an existing function, which is the case that can break a deployed client |

The second REVOKE arm is file-level, not function-level. Implement it as a separate check after the
regex, so that `BREAKING_SHAPES` stays a single readable alternation. Update the header comment's
"Detected shapes" list to match.

The implementer re-runs the measurement against current `supabase/migrations/` before merging and
records the numbers in this spec. If the numbers have moved materially from the table above, re-decide
with the same rule: a shape whose unannotated hits are all false positives is not added.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| `DROP FUNCTION` of a helper no client calls now needs a `client-safe:` line | ACCEPT | One comment line. That rationale is exactly what the gate exists to make the author write |
| `CREATE OR REPLACE FUNCTION` with a new argument list creates an overload and still passes | DEFER | Not detectable by a line regex. The 2026-09-09 ruling says the correct authoring shape is `DROP FUNCTION` then `CREATE`, which this spec makes visible. Unblock: a parser-based check, if overloads recur |
| A revoke on an existing function inside a file that also creates an unrelated function is missed by the file-level REVOKE arm | ACCEPT | Measured at 0 cases today. The post-migrate prod smoke in `migrate.sh` remains the backstop, as the header already states |

**Non-Goals**
- Do NOT backfill annotations into existing migrations. They are never re-gated, and editing applied
  migrations is out of bounds.
- Do NOT change `migrate.sh` or the marker syntax.
- Do NOT try to detect column renames or other shapes the header already calls unenumerable.
- Do NOT read staged blob content instead of the working-tree file. That is P1049's scope.

## Done-When

- [x] New cases in `src/tests/p887-reproduce.test.ts`, each run with `npx vitest run
      src/tests/p887-reproduce.test.ts`:
  - [x] a fixture with `DROP FUNCTION` and no annotation → `VIOLATION`, non-zero exit;
  - [x] a fixture with `REVOKE … ON FUNCTION … FROM PUBLIC` on a function **not** created in the
        file, with no annotation → `VIOLATION`, non-zero exit;
  - [x] a fixture that creates a function and then `REVOKE ALL … FROM PUBLIC` on it → passes (the
        false-positive guard);
  - [x] each of the first two passes once it carries `-- client-safe: <reason>`;
  - [x] a comment line mentioning `DROP FUNCTION` → passes.
- [x] Each new failing case was seen to fail **before** the gate change and pass after (gate 7: paste
      both runs).
- [x] The corpus measurement re-run on current `supabase/migrations/` is recorded in this spec: per-arm
      count of unannotated files newly flagged (gate 7c).
- [x] `scripts/check-migration-client-safety.sh supabase/migrations/20260908114500_p1058_release_seat_requires_code.sql`
      still exits 0 (it carries `requires-frontend`).

## Evidence (dev, 2026-10-13)

**Gate 7, before/after.** Before the gate change: `Tests 3 failed | 6 passed | 8 skipped (17)` —
the three failures were the must-fail cases (DROP FUNCTION; REVOKE FROM PUBLIC on an existing
function; the same REVOKE wrapped onto a second line). After: `Tests 17 passed (17)`.

**Corpus re-measurement (gate 7c), 413 migrations.** Old gate (main) flags 36, all pre-P887 legacy
files that were never gated. New gate flags 47. The 11 newly flagged files all match the
`DROP FUNCTION` arm. Twelve unannotated files contain `DROP FUNCTION`, which matches the table above;
`20260414100001_p703_letter_sourced_live.sql` was already flagged by the anon arm. The narrowed
REVOKE-PUBLIC arm flags **0** unannotated files. It would fire on 15 annotated files once their
annotation is stripped, which is the positive control. Every newly flagged file is dated 2026-04-18
or earlier, so none was authored under the gate. The numbers have not moved, so the decision in the
Solution table stands.

**Statement-level REVOKE-PUBLIC arm.** The arm matches per SQL statement rather than per line. Six
corpus files wrap `FROM PUBLIC, anon, authenticated` onto its own line after a long function
signature, and a line regex cannot see those. The statement-level count is the same as the line
count for unannotated files without a CREATE FUNCTION, which is 0.

**Real-migration canary (gate 7d).** `scripts/test-p1473-migration-client-safety.sh` contains:
- P1058 (DROP FUNCTION) and P1104 name-guards (REVOKE FROM PUBLIC), each with its annotation stripped.
  Both fail. A gate mutant with the matching arm removed lets each one through.
- P707 (create, then REVOKE FROM PUBLIC). It passes; the no-narrowing mutant flags it.
- A full-corpus census.

Run against the real gate it reports 13 passed, 0 failed, exit 0. Against main's gate it exits 1
with 9 failed.

**Review round (/finish: 2 MEDIUM, 1 LOW).** Each finding was reproduced as a failing canary case
(section E) before the fix:
- The file-level narrowing failed open when a file created one function and revoked another
  existing one. It is now per statement: a REVOKE target is narrowed only by a CREATE of the same
  object in the same file. For a function that means the same schema-qualified name and, when
  argument types are given, the same normalized types.
- `/* */` block comments are now blanked by a string-, identifier- and dollar-quote-aware
  tokenizer, an inline python3 helper modelled on check-rls-scope.py. All shape arms read this
  comment-free view.
- The violation message now names the kind of target: function, table or schema.

The census after the fix finds 47 flagged, unchanged. The REVOKE-PUBLIC arm fires on one
unannotated file, `20260405051035_p651_letter_onboarding_fixes.sql`. It is a true positive of the
re-sign shape (it revokes existing helpers from `public`) and is a pre-P887 legacy file that the
anon arm already flagged. No file is flagged by the REVOKE-PUBLIC arm alone. The canary reports
23 passed, 0 failed; p887 reports 17 of 17.

## Related

- P887: the gate. P886: the incident. P1058: where the gap was found.
- P1049 (open): pre-commit content checks read the working tree, not the staged blob. Related, and
  not in scope.
- decisions.md 2026-09-09 [technical] "Dropping a policy does not constrain a SECURITY DEFINER
  function": `DROP FUNCTION` then `CREATE` is client-breaking and needs `requires-frontend`.
- decisions.md 2026-09-15 [process]: a malformed `requires-frontend` marker rejects the entire prod
  run.

Promoted from the task inbox, 2026-10-13.
