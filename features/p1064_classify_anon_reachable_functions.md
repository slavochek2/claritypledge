---
status: today
type: task
rank: 1000977.0
created_date: '2026-08-13'
tags: [security, grants, audit, rls]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1064: 45 of 63 SECURITY DEFINER functions are anon-executable and nobody knows which are intentional

## Problem

**Situation:** P1063 closed four functions that were executable by unauthenticated callers on prod.
Two were reproduced: an anon caller sealed another user's draft letter, and ended a live session.

**Complication:** Those four were found by following one thread, not by an audit. A live query
shows **45 of 63** SECURITY DEFINER functions on prod carry anon EXECUTE. Most are legitimate —

> **Count corrected during the audit:** the live figure is **40 of 63**, not 45 — P1063's revokes
> had landed by the time this ran. 8 of the 40 return `trigger` and are not PostgREST-callable,
> so the classification surface was **32**. The 45 is left in place above because it is what the
> spec was written against; measurements below supersede it.

guests join rooms with a code and no account, recipients open letters from a token link; that is
the product working. But **no record exists of which are intentional.** The audit meant to produce
that record died on an API error before reporting.

Intent cannot be read from the source. P1063 proved the broken lockdown and the working one are
textually identical (`REVOKE ALL ... FROM PUBLIC` vs `REVOKE ... FROM anon`), and that the wrong
one fails silently. So "it looks locked down" is worth nothing here.

**Question:** Which of the 45 are deliberate, and which are the next P1063?

## Appetite

Zero blast radius until it recommends something — this is read-only classification. Reversible.
**Decision density: low but non-zero** — a function that turns out to be accidentally open but is
relied on by a live anon path becomes a founder trade-off, exactly as P1058's F4 did.

## Approach

For each of the 63, resolve the CURRENT definition (last `CREATE [OR REPLACE]` in filename order —
never audit a superseded body), read its grants, and classify INTENDED-ANON / ACCIDENTAL-ANON /
CLOSED against its call sites in `src/`. For every ACCIDENTAL-ANON, state what an anon caller can
actually do — specifically whether its authorization sits in an `IF ... != auth.uid()`, which is
**skipped entirely** when `auth.uid()` is NULL.

Deliverable: a committed allowlist of deliberately-anon functions with a one-line reason each.
That file is the input P1065's drift check needs; without it there is nothing to diff against.

## Risks / Non-Goals

### Risks

- **Over-tightening.** Revoking a function a guest path needs breaks joining without an account.
  MITIGATE: every proposed revoke needs a named call site or the absence of one, proven by grep.
- **Audit fatigue producing rubber-stamps.** MITIGATE: classification must cite the call site or
  state plainly that none was found — "looks fine" is not a classification.

### Non-Goals

- Do **NOT** revoke anything in this spec. Classification only; fixes are follow-on work.
- Do **NOT** trust migration text for grant state. Query `pg_proc.proacl` / `has_function_privilege()`.
- Do **NOT** report a finding as real without reproducing it on test.

## Done-When

- [x] All 63 current SECURITY DEFINER definitions classified, each with evidence — 23 carry no
      anon EXECUTE at all (closed by measurement, not by reading); 8 return `trigger`, so their
      grant is not PostgREST-callable, though their bodies still run inside anon-initiated
      transactions and stay in scope for P1065; the remaining **32** are classified individually.
      Bodies resolved from the live catalog per `oid::regprocedure`, never by filename order.
- [x] Every INTENDED-ANON entry names a real anon call site (file:line) or is downgraded — an
      entry justified by reasoning rather than a grep hit is the one P1065 blesses permanently.
      17 of the 32 qualified. The other 15 were downgraded, including several whose signature
      suggests a guest path but whose only call sites are gated on a logged-in user.
- [x] Every ACCIDENTAL-ANON entry names what an anon caller could do, and whether its internal
      guard is skipped for NULL `auth.uid()` — recorded per function in `.private/docs/`
- [x] A committed allowlist of deliberately-anon functions with a reason per entry —
      `scripts/anon-execute-allowlist.txt`, the input P1065 needs
- [x] Anything exploitable is reproduced on test, then filed with a severity — two code-read
      findings from the concurrent completeness review were executed against test for the first
      time (transactional, rolled back, with a discriminating negative control and a role control
      confirming the probe ran unauthenticated). Both confirmed. Severity and live-exposure counts
      recorded privately.
- [ ] `.private/docs/security-log.md` updated with anything found — **blocked, not skipped.** A
      concurrent session was writing that file throughout this pass. The full record is in
      `.private/docs/p1064-anon-execute-classification.md`; it needs a one-line pointer added to
      the log's P1064 section once that session is done.

## Deliverable

`scripts/anon-execute-allowlist.txt` — 17 entries, each with a grep'd anon call site.
Per-function verdicts, reproductions, and grant-provenance detail:
`.private/docs/p1064-anon-execute-classification.md` (private — this repo is public and prod is
not yet fully patched).

**Not done here, by design:** nothing was revoked. Classification only, per the Non-Goals.
