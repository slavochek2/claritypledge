---
status: backlog
type: bug
rank: 55
severity: low
date_reported: '2026-09-04'
created_date: '2026-09-04'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [privacy, rls, erasure, live-session]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P1245: a paraphrase can still be written into a session the erased user closed

## Problem

`erase_my_account()` (P520) sets every session the leaver shared to `status = 'cancelled'`, and
the INSERT policies on `clarity_live_turns`, `clarity_demo_rounds` and `clarity_ideas` refuse
writes into a cancelled session. **`clarity_verifications` does not carry that clause**, so a
surviving counterparty can still insert a paraphrase against a message in a session the erased
user closed by leaving.

It was omitted for a structural reason, not an oversight in the predicate: the other three tables
have a `session_id` column and the guard is one line. `clarity_verifications` has no session
reference — its session is reachable only through `message_id -> clarity_chat_messages.session_id`
— so the same clause cannot be expressed without a join.

**Blast radius is narrow, and stating it honestly matters more than the fix.** What gets written
is the *counterparty's own* paraphrase text, not the erased user's data, so this does not recreate
erased personal data and is not a GDPR erasure failure. It is a write into a conversation the
erased user ended. The live page carries no cancelled-status check of its own (verified 2026-09-04
— `clarity-live-page.tsx` has no session-status guard), so these policies are the only control;
whether the counterparty's client can still *reach* a cancelled session to trigger the write is
NOT established and is the first thing to determine.

## Appetite

Small — but it is a write-path change on the core live flow, which is why it was not folded into
P1243 as a footnote.

## Solution

1. **First establish reachability.** Can a client still load a cancelled session and submit a
   paraphrase? If the UI cannot reach it, this is defence-in-depth and the priority stays low. If
   it can, the severity rises.
2. Add the joined guard to the `clarity_verifications` INSERT policy:
   `NOT EXISTS (SELECT 1 FROM clarity_chat_messages m JOIN clarity_sessions s ON s.id = m.session_id
   WHERE m.id = clarity_verifications.message_id AND s.status = 'cancelled')`.
3. Verify the predicate with a normalised `pg_get_expr` assertion, not substring matching.

## Risks / Non-Goals

- **The real risk is a false positive, not a false negative.** This policy runs on every paraphrase
  insert in every live session — the hot path of the product's core mechanic. A subtly wrong join
  breaks legitimate paraphrases mid-session, in the moment that matters most to a user. The
  legitimate-path tests matter more here than the attack test.
- Per-write cost: the guard adds a two-table join to an RLS predicate. Measure it before assuming
  it is free.
- Non-goal: adding a `session_id` column to `clarity_verifications`. That is a schema change with
  a backfill and its own migration ordering problem; the join is the smaller move.

## Done-When

- [ ] Reachability established and recorded: can a client still write a paraphrase into a cancelled
      session, or does the UI block it first?
- [ ] The guard is in place and its predicate asserted by normalised `pg_get_expr` equality.
- [ ] Attack test: a counterparty cannot insert a verification against a message in a cancelled
      session (42501).
- [ ] False-positive tests: paraphrases in an ACTIVE session still succeed, across every round
      number and both participants — a guard tested only against inputs it should reject has an
      unmeasured false-positive rate.
- [ ] The residual note in `20260902090000_p520_erasure_hardening.sql` is updated to say it is now
      closed, rather than left claiming an open residual.
