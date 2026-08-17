---
status: today
type: bug
rank: 3
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
accepted trade-off?]`

**ANSWERED 2026-08-13 — load-bearing. N1 is a defect, fix it.** Recorded in
[docs/decisions.md](../docs/decisions.md) 2026-08-13 [product]. The reasoning that decided it: a
reader who sees the prediction first is anchored by it, so the rating stops being an independent
measurement — which means the contamination is not primarily a privacy loss but a **measurement**
loss. Calibration figures drawn from public letters cannot then be cited as corroboration by the
research programme. The gate must be enforced server-side, as every sibling path already does.

This unblocks step 3 of the Approach. N3 is a violation of the same guarantee by a different route
(reveal without having rated), so the ruling covers it too — it is not merely design work.

### Second decision — N1's shape (ANSWERED 2026-08-17)

The design pass found the ruling above had **no sibling to copy**. Every path that enforces
rate-first resolves the caller from a delivery or an invitation token. N1's path has neither: an
anonymous reader on this route is refused by the write path outright, so their rating never becomes
server-side state at all — it lives in the browser until they sign in, which is why the reveal was
built client-side in the first place. There was no guard to add, because there was nothing for a
guard to check.

`[FOUNDER DECISION: mint server-side reader state, or move the reveal behind sign-in?]`

**ANSWERED 2026-08-17 — mint server-side state for the anonymous reader.** The server issues
letter-scoped reader state at load, each rating is recorded against it, and the reveal is gated on
that record. Chosen over moving the reveal behind sign-in because it keeps the read-and-reveal loop
open to readers without an account **and** starts capturing calibration data that is discarded today
whenever a reader rates and never signs in — a research-programme gain, not only a fix.

Accepted cost, to be designed against rather than discovered: this adds an anonymous **write**
surface and a bearer capability, the same class P1053/P1057 have been narrowing. Carried
requirements and the full design are in the private log.

## Approach

**REVISED 2026-08-17** after the design pass (details in the private log; the original ordering is
preserved in git history).

1. **N2 + N3 together, in one migration** — they need the same schema addition on the same table,
   written by the same anonymous entry point and read by its sibling gate. The addition is also what
   makes N2's suppression guard real, so designing them apart would mean designing the same column
   twice. Shipping them apart buys a second migration and a second prod deploy for one column —
   the cost the founder's own P1066 scope-change rejected. **Founder approved folding
   (2026-08-17).** N2's membership check and the resolution of existing duplicate rows ride along.
2. **N1** — proceeds on the shape decided above. Spans the database plus three client call sites,
   so it is not a patch and does not belong in the migration above.
3. **The design flag** (unrestricted JSONB merge on an intentional anon branch) — scope a key
   allowlist, or accept and document.
4. ~~N5, N4~~ — shipped in P1066.

**Prod evidence gathered before sequencing** (read-only, live catalog — not migration text): N2's
guard is genuinely inert, but its realized corruption on prod is **zero** in both counters the
review predicted, and one of the two predicted effects cannot occur on that path at all. N3 has
**never been exercised** on prod — the state its exploit requires does not exist there. Both remain
real holes with a live unbounded-write surface; neither is a data-repair job. Two corrections to the
review's findings, and the counts behind them, are in the private log.

## Risks / Non-Goals

### Risks

- ~~**The shared anon sentinel is load-bearing.** N3's defect is that all anonymous raters share one
  synthetic identity. Any fix that gives them distinct identities touches the token flow.
  MITIGATE: treat N3 as design work, not a patch.~~ **WITHDRAWN 2026-08-17 — this was wrong, and it
  was the reason N3 looked expensive.** The correct fix grants no identities at all: both functions
  already resolve the delivery before the gate runs, so scoping the gate to the delivery closes the
  defeat with no new identity, no new token, and no client change. Verified by reading both bodies,
  not inferred. Cited in the private log as correction 3.
- **Adding a unique constraint can fail on existing data.** MITIGATE: **done — counted on prod
  2026-08-17.** Small and tractable: a handful of excess rows in two groups, and a minority of
  historical rows that cannot be assigned deterministically. Resolution is a partial index plus
  keep-earliest, leaving the unassignable rows out of scope — **no row is deleted**. Counts and the
  reasoning are in the private log; verify against test before the index lands.
- **N4's idiom is used safely elsewhere.** The discriminator is whether the other operand can be
  NULL — safe against a `NOT NULL` column, unsafe against a nullable one or any caller-supplied
  parameter. Confirmed against live prod `pg_attribute`, with the per-site verdicts, in the private
  log under "Triage rule for the `IS DISTINCT FROM` shape". MITIGATE: apply that test per site
  before editing. It is the difference between four targeted fixes and six rewrites of code that is
  already correct.

### Non-Goals

- Do **NOT** merge this into P1066. Different class, different fixes, and P1066 should ship first
  and independently — it holds the two confirmed reachable defects.

  **SCOPE CHANGE 2026-08-13 (founder, overriding this line for two items only):** **N4 and N5 move
  into P1066's migration.** Both are single-guard fixes — N4 is literally the same NULL-degenerate
  class, N5 is `partner_profile_id := auth.uid()` instead of trusting the parameter — and carrying
  them separately buys a second migration, a second prod deploy, and a second disclosure window for
  two lines. The argument above still holds for **N1, N2 and N3**, which stay here: those need
  checks designed against what the function is for, and N2 needs a schema change.

  If the P1066 migration starts growing a third concern, push back and split them out again — the
  reason for folding was deploy count, and it stops applying the moment the migration stops being
  small.
- P1067's remaining scope is therefore **N1, N2, N3 + the design flag**, sequenced **after** P1066.
- Do **NOT** change N1's behaviour before the founder decision.
- Do **NOT** put mechanism or function names in any public file, migration header, or commit
  message while prod is unpatched.

## Done-When

- [x] Founder decision recorded on N1 — **load-bearing, fix it** (see Founder Decision above)
- [x] Second founder decision recorded on N1 — **mint server-side reader state** (2026-08-17)
- [x] The inflated-counter blast radius assessed against prod — **zero realized corruption**, and
      one of the two predicted counter effects is structurally impossible on that path (private log,
      corrections 1 and 2)
- [ ] N1: rate-first gate enforced server-side, not in the client
- [ ] N2: membership check added; unique constraint added after resolving existing duplicates
- [ ] N3: server-side check added, with a test exercising a genuinely unauthenticated caller
- [ ] ~~N4, N5~~ — **moved to P1066** (founder, 2026-08-13; see the Non-Goals scope change).
      Both were reproduced against test during P1064's pass; evidence in the private log
- [ ] Design flag triaged (allowlist or documented acceptance)
- [ ] Every fix verified against the live catalog / live behaviour, not a green migration run
      (P1066 F6: the ledger is not evidence a statement took effect)
- [ ] `.private/docs/security-log.md` updated with fixes and verification
