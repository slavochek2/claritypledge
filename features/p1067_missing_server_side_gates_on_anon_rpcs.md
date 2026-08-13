---
status: today
type: bug
rank: 1000980.0
created_date: '2026-08-13'
tags: [security, rpc, anon, integrity]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
---

# P1067: several anon-reachable RPCs are missing a server-side gate entirely — a different class from P1066

## Problem

**Situation:** P1066 covers RPCs whose authorization guard is *present but degenerate* for an
unauthenticated caller. An exhaustive review of all 63 SECURITY DEFINER bodies — every
`auth.uid()` occurrence enumerated, not sampled — established that class is now **closed**: no
comparison against a variable-held caller identity exists anywhere in the corpus.

**Complication:** The same review found the misses are elsewhere. Several anon-reachable functions
have **no server-side gate at all** — the check is client-side, or absent, or scoped to something
that does not distinguish callers. Two are reproduced; one was verified against the live prod
catalog rather than migration text. These are not fixed by P1066's guard-preamble idiom: each
needs its own server-side check.

**The findings, their evidence, and their severities are in `.private/docs/security-log.md`**
§ "Completeness review — 2026-08-13", items N1–N5 plus one design flag. As with P1066, mechanism
and function names stay out of this public file while prod is unpatched.

**Question:** Add the missing gates, and decide the one that is a product question rather than a
bug.

## Appetite

Blast radius: higher than P1066. These are not one-line guard swaps — each needs a check designed
against what the function is *for*, and one of them (N2) needs a schema change (a unique
constraint) whose absence has been silently accepted by live data, so backfill conflicts are
possible. Reversible per-item. **Decision density: genuinely non-zero — see Founder Decision.**

## Founder Decision

**N1 defeats the sealed-bid mechanic for unauthenticated readers, and the gate is client-side by
design, not by accident** — the client code says so in a comment. Reproduced: no Authorization
header, HTTP 200, all broadcast predictions returned before the reader rates anything.

This is a **product** question before it is a security one:

- If the sealed-bid guarantee is load-bearing for the product's central claim — that a reader
  commits before seeing the sender's prediction — then an honour-system client gate does not
  deliver it, and this is a correctness bug in the mechanic itself.
- If shipping predictions to the client and gating the reveal in the UI is an accepted trade-off
  (it makes local/offline reveal work), then this is a known limitation to document, not fix.

`[FOUNDER DECISION: is the sealed-bid guarantee load-bearing, or is the client-side reveal gate an
accepted trade-off?]` Nothing in this spec should change N1's behaviour until that is answered.

## Approach

1. **N2 first** — it is the only one with an unbounded write and it corrupts a metric. Needs a
   membership check on the caller-supplied id, a real unique constraint (the current
   `ON CONFLICT DO NOTHING` has no constraint to catch and therefore suppresses nothing), and a
   decision on existing duplicate rows before the constraint can be added.
2. **N5, N3, N4** — each gets a server-side check. N5's correct shape is to derive the identity
   from `auth.uid()` rather than trusting the caller's parameter.
3. **N1** — blocked on the founder decision above.
4. **The design flag** (unrestricted JSONB merge on an intentional anon branch) — scope a key
   allowlist, or accept and document.

## Risks / Non-Goals

### Risks

- **The shared anon sentinel is load-bearing.** N3's defect is that all anonymous raters share one
  synthetic identity. Any fix that gives them distinct identities touches the token flow.
  MITIGATE: treat N3 as design work, not a patch.
- **Adding a unique constraint can fail on existing data.** MITIGATE: count duplicates first;
  decide dedupe vs partial index before writing the migration.
- **N4's idiom is used safely elsewhere.** The discriminator is whether the other operand can be
  NULL — safe against a `NOT NULL` column, unsafe against a nullable one or any caller-supplied
  parameter. Confirmed against live prod `pg_attribute`, with the per-site verdicts, in the private
  log under "Triage rule for the `IS DISTINCT FROM` shape". MITIGATE: apply that test per site
  before editing. It is the difference between four targeted fixes and six rewrites of code that is
  already correct.

### Non-Goals

- Do **NOT** merge this into P1066. Different class, different fixes, and P1066 should ship first
  and independently — it holds the two confirmed reachable defects.
- Do **NOT** change N1's behaviour before the founder decision.
- Do **NOT** put mechanism or function names in any public file, migration header, or commit
  message while prod is unpatched.

## Done-When

- [ ] Founder decision recorded on N1; N1 then either fixed or documented as accepted
- [ ] N2: membership check added; unique constraint added after resolving existing duplicates;
      the inflated counter's blast radius assessed
- [ ] N3, N4, N5: server-side checks added, each with a test exercising a genuinely
      unauthenticated caller
- [ ] Design flag triaged (allowlist or documented acceptance)
- [ ] Every fix verified against the live catalog / live behaviour, not a green migration run
      (P1066 F6: the ledger is not evidence a statement took effect)
- [ ] `.private/docs/security-log.md` updated with fixes and verification
