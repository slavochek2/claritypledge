---
status: week
type: bug
disclosure: public
rank: 7
created_date: '2026-08-18'
tags:
  - security
  - letters
  - integrity
  - calibration
  - rls
delivery_stage: create-bug
pipeline_ran: [create-bug, inline]
driver: anomaly
---

# P1100: a letter verification can be written straight to the table, with no letter involved

## Problem

**Situation:** P1093 closed a completion writer that accepted an unchecked caller payload. While
verifying that fix, the row-level policy governing the underlying table was read directly. It does
not carry the constraint the RPC layer was being fixed to enforce.

**Complication:** The write policy on that table is broader than the integrity rule the RPC layer
was being fixed to enforce, so rows can reach it without the letter-level checks the product
assumes. Mechanism, the executed proof, and the exact predicate are deliberately withheld from this
public spec — they are in `.private/docs/security-log.md` § 2026-08-18 (P1093/P1100), per the
disclosure rule in CLAUDE.md. **This is confirmed by execution, not inferred from policy text.**

**Why it outranks the path P1093 just closed:** that one had no caller anywhere in the product and
had never written a production row. This one is reachable through the path the application itself
already uses, which makes it both likelier to have been exercised and harder to close.

**It also sidesteps the P1067 constraint.** The uniqueness rule added there is partial, and this
path falls outside its scope, so the per-delivery "one rating per story" guarantee does not bind
here.

**Question:** should this table accept client writes at all, or should every letter verification go
through a SECURITY DEFINER path that resolves the letter — as the token path already does?

## Appetite

Blast radius is larger than P1093 and the decision density is real, so this is not a one-line policy
tightening. The authenticated submission path in the client writes these rows directly today, so
narrowing the policy without moving that path first would break letter submission for signed-in
readers. Reversible per step. Not urgent in the sense of active exploitation — see below — but it is
the load-bearing half of the class P1093 only partly closed.

## Approach

1. **Measure realized damage on prod first**, as P1067 and P1093 both did: count `source='letter'`
   rows whose story is in no letter the credited speaker sent, and rows with no delivery. State the
   number even if it is zero. Do not design before this is known.
2. **Decide the shape.** Either (a) move the authenticated submission path onto a SECURITY DEFINER
   function that resolves the letter server-side and derives the speaker — making it the sibling of
   the token path P1067 fixed — or (b) tighten the policy with a membership predicate. (a) is the
   direction the codebase has been moving for several specs; (b) puts a subquery in a hot policy.
3. **Sequence the client move before the policy narrows,** or signed-in letter submission breaks.
4. **Re-check the P1067 uniqueness rule** once rows can no longer arrive without a delivery.

## Risks / Non-Goals

### Risks

- **Narrowing the policy first breaks the authenticated letter submission path.** It writes these
  rows directly from the client today. MITIGATE: step 3 — move the writer before narrowing.
- **The same policy governs `/live` verifications, which are a different population.** A predicate
  written for letters must not refuse `source='live'` rows. MITIGATE: scope any new predicate by
  `source`, and add a control layer asserting the `/live` path still works.
- **Counter and calibration effects.** These rows feed the counters calibration claims are drawn
  from. MITIGATE: step 1 measures before anything changes.

### Non-Goals

- Do **NOT** fold this into P1093. That one is verified, committed, and awaiting a prod deploy;
  adding a concern after verification means verifying it again — the same reason P1093 itself was
  kept out of P1067's migration.
- Do **NOT** narrow the policy as a quick patch before the client writer moves.
- Do **NOT** put the exact predicate or the reproduction in any public file while prod is unpatched.

## Done-When

Closed 2026-10-14 as **delivered under other specs** — see § Closure below. Every box is ticked
against an artifact; one criterion is retired in prose rather than ticked, because it was written
for the shape that was not chosen.

- [x] Prod measured for rows already written through this path, with the number stated even if zero
      — **0 forged** letter verifications on prod (2026-09-01); the only rows without a delivery
      predate the delivery column and pass the provenance test. Detail:
      `.private/docs/security-log.md` § 2026-09-01 P1100 prod measurement
- [x] A decision recorded on shape: definer-function path vs policy predicate, with the reason —
      **policy predicate resolved by a SECURITY DEFINER admissibility helper**, recorded in
      [P1150](done/2026-06-10/p1150_story_verification_insert_unbound_counterparty.md) § Fix shape
      (the client keeps writing directly and RLS stays the single authorization point)
- [x] A test that fails before the fix, inserting a forged letter verification as a signed-in caller
      — `e2e/integration/p1150-story-verification-counterparty.spec.ts` gap tests; their
      before-fix failures are recorded in P1150's done spec (part A and part B). Re-run on test
      2026-10-14: green
- [x] A control layer proving `/live` verifications and legitimate letter submission still work —
      same file's controls (`submitRating` and batch submission payloads, the P1278 `/live`
      shapes, a definer writer). Re-run on test 2026-10-14: 35 passed, 2 failed on a test-project
      auth rate limit at sign-in (not an assertion); those 2 re-run alone: 2 passed
- [x] Verified against the live catalog after deploy, not the migration ledger — prod catalog
      2026-10-14: exactly one INSERT policy on the table; its letter branch requires the letter
      source, a delivery, the placeholder speaker rating and the admissibility helper; the helper
      is SECURITY DEFINER with an empty search_path and not executable by anon. Control: the same
      probes against an unrelated INSERT policy all return false
- [x] `.private/docs/security-log.md` updated — § 2026-10-14 P1100/P1092/P1059/P1098/P1226

**Retired, not ticked:** "The authenticated submission path no longer writes these rows with a
client-supplied story id." That criterion belongs to shape (a), the definer writer. Shape (b) was
chosen, so the client still sends a story id — but the policy admits it only when that story is in
a letter the named speaker sent and the caller holds a delivery of. The criterion's intent (no
forged story id is accepted) is what the gap tests above prove.

## Closure (2026-10-14)

Delivered by **P1150 part B** (`20260901220000_p1150_b_bind_delivery_and_caller.sql`) and **P1278
part C** (`20260910130000_p1278_c_live_rows_must_carry_both_ratings.sql`), both in `origin/main`'s
`supabase/deploy-manifest.json` `[prod].migrations` and confirmed in the live prod catalog on
2026-10-14 (the manifest is a record, not the database). This spec records no implementation of its
own: `inline` in `pipeline_ran` records the closure verification done inline on 2026-10-14, not code.
