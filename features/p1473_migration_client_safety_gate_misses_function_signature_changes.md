---
status: week
type: task
rank: 29
workstream: infrastructure
created_date: '2026-10-13'
tags: [migrations, pre-commit, client-safety, gates]
disclosure: public
intent: cold-start
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

- [ ] New cases in `src/tests/p887-reproduce.test.ts`, each run with `npx vitest run
      src/tests/p887-reproduce.test.ts`:
  - [ ] a fixture with `DROP FUNCTION` and no annotation → `VIOLATION`, non-zero exit;
  - [ ] a fixture with `REVOKE … ON FUNCTION … FROM PUBLIC` on a function **not** created in the
        file, with no annotation → `VIOLATION`, non-zero exit;
  - [ ] a fixture that creates a function and then `REVOKE ALL … FROM PUBLIC` on it → passes (the
        false-positive guard);
  - [ ] each of the first two passes once it carries `-- client-safe: <reason>`;
  - [ ] a comment line mentioning `DROP FUNCTION` → passes.
- [ ] Each new failing case was seen to fail **before** the gate change and pass after (gate 7: paste
      both runs).
- [ ] The corpus measurement re-run on current `supabase/migrations/` is recorded in this spec: per-arm
      count of unannotated files newly flagged (gate 7c).
- [ ] `scripts/check-migration-client-safety.sh supabase/migrations/20260908114500_p1058_release_seat_requires_code.sql`
      still exits 0 (it carries `requires-frontend`).

## Related

- P887: the gate. P886: the incident. P1058: where the gap was found.
- P1049 (open): pre-commit content checks read the working tree, not the staged blob. Related, and
  not in scope.
- decisions.md 2026-09-09 [technical] "Dropping a policy does not constrain a SECURITY DEFINER
  function": `DROP FUNCTION` then `CREATE` is client-breaking and needs `requires-frontend`.
- decisions.md 2026-09-15 [process]: a malformed `requires-frontend` marker rejects the entire prod
  run.

Promoted from the task inbox, 2026-10-13.
