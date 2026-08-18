---
status: week
type: bug
rank: 3
created_date: '2026-08-18'
tags: [security, letters, integrity, calibration, rls]
delivery_stage: create-bug
pipeline_ran: [create-bug]
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

- [ ] Prod measured for rows already written through this path, with the number stated even if zero
- [ ] A decision recorded on shape: definer-function path vs policy predicate, with the reason
- [ ] The authenticated submission path no longer writes these rows with a client-supplied story id
- [ ] A test that fails before the fix, inserting a forged letter verification as a signed-in caller
- [ ] A control layer proving `/live` verifications and legitimate letter submission still work
- [ ] Verified against the live catalog after deploy, not the migration ledger
- [ ] `.private/docs/security-log.md` updated
