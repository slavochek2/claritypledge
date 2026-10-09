# P1321 — re-audit of the permission surface: method and verdict

**Run:** 2026-10-08 · Branch: `feature/p1321-agent-access-gate` · Re-answers P1207's Decision
Criterion 1 for P1215.

**Specifics are deliberately not published here.** Every defect found is fixed on the test database
and staged as a migration. On 2026-10-09 the four definer-function fixes were applied to production
on the founder's go and re-probed there with controls; the column-visibility fix waits for its
coupled frontend change to deploy. Exact tables, functions, predicates and reproductions live in
`.private/docs/security-log.md` (2026-10-08, 2026-10-09) — per CLAUDE.md's rule on unpatched
vulnerability mechanics. This file records the method, the verdict, and what the method learned.

## Decision Criterion 1 — answered

**No.** The permission surface is not yet safe to build agent access on.

The re-audit found **five reachability defects live in production**: one column-visibility defect
on a public table, and four in SECURITY DEFINER functions (see "What it found" below). Each one now
has a failing-then-passing integration test and a migration applied to test. A merged fix is not a
closed finding (spec invariant): the answer becomes **Yes** only after those migrations reach
production and the probes below are re-run there with their controls, and after the three low-severity
leads still open are each fixed or ruled harmless with evidence.

## Method

Four classes, both caller roles — logged-out (anon) and signed-in as an unrelated user — run against
test, with read-only production confirmation. Every empty result was paired with a control that
had to come back non-empty on the identical probe.

| Class | Question | Instrument | Result |
|---|---|---|---|
| A — table and column reach | What can each role read, per table and per column? | Catalog ACLs (`aclexplode`), never `information_schema`; then anon PostgREST reads on both projects | 1 defect (column visibility) |
| B — cross-user row reach | Can a signed-in user read another user's private rows? | Seeded private rows owned by a second user, read as the first | 16 of 16 table families clean; positive control (a table public by design) read in full |
| C — SECURITY DEFINER functions | Does any definer function act on the caller's say-so instead of their identity? | One independent reviewer over all 100 definer functions, then each lead reproduced by a failing test | 4 defects confirmed; 3 low-severity leads open |
| D — side channels | Do Realtime, Storage and edge functions bypass the above? | Realtime subscription harness with a control; bucket policy and edge-function caller-gate review | Clean (from the earlier part of this run; not repeated after the fixes) |

Production migration history was read (read-only) after the work: no P1321 migration is present, and
every version the deploy manifest records for production is in production's ledger. **No snapshot
was taken before the run**, so before/after identity is not shown directly. What is shown is that
production holds nothing this run wrote.

## What it found, in transferable terms

The four definer-function defects share one shape: **a function trusted a value the caller could
choose, in place of a fact the server already knew.**

1. **An enrolment function with no state check.** It created the "you are a recipient" row for
   any object id it was given. The sibling function that does the same job on another path carried
   the right guard. One function had the guard and the other didn't.
2. **A relationship-scope input writable by the caller.** A scope function unioned several "these
   people are related to me" sources. One source was a row the caller could insert, naming anyone.
   The scope gate was correct; one of its inputs was forgeable.
3. **An identity column writable by its owner.** Several functions resolved "the person at this
   address" through a profile column the owner could edit, and one erasure function used it to decide
   which other people's rows to anonymise. A uniqueness constraint hid this from a naive probe (below).

All three fixes are on the write side: the guard, the check on the input, the pinned column.
None of them edits the consumers.

## What the method got wrong, and what it cost

- **A probe that could not fail.** The first test for the identity-column defect tried to take a
  registered user's exact address. A uniqueness constraint refuses that whether or not the defect
  exists, so the test passed against the unfixed database. Caught by the rule that a fix's failing
  test must fail *before* the fix; rewritten around an unregistered address and a case variant, it
  then failed on both write paths. This is the P1207 lesson again from a new angle: a known-bad
  control must be bad for the reason under test, not for some other reason.
- **A test fixture that ran as the wrong role.** Signing a test user in on the shared admin client
  replaced its privileged session, so teardown ran as that user and left fixtures behind. Two older
  specs carry the same pattern (filed).
- **One reviewer for the definer sweep.** Leads that became defects were each confirmed by a failing
  test. The low-severity leads were confirmed by reading only.

## Browser regression baseline

The column fix changes what a public read can select, so it could break the UI without any error
message. To rule that out, the browser specs that had failed after it were re-run twice on test:
once with the column grant reverted to its pre-fix state and once with it applied. Both runs failed
the **same 14 tests** in the same way, so the column fix causes none of them. The 14 fail
independently of this change; their causes were not investigated in this run.

## Reviews

Recorded in `features/verification/p1321/assumptions.md` with which reviewer actually reviewed each
round.
