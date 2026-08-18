---
status: all-done
type: bug
rank: 4
created_date: '2026-08-17'
tags: [security, letters, integrity, calibration]
pipeline_ran: [create-bug, fix, ship]
driver: anomaly
reproduce_artifact:
  test_file: e2e/integration/20260818090000_p1093_signup_payload_gates.spec.ts
  root_cause: >-
    The writer had no caller anywhere in the repo and had never written a prod row, yet
    carried a live EXECUTE grant to every signed-in user; its story, version, speaker and
    ordering fields — plus a point id nobody had named — were taken verbatim from the
    caller. The fix removes the grant rather than validating the payload, and restores the
    replay it was built for as a parameter-free function.
  confidence: high
  surfaces_in_scope: [completion-writer-grant, positions-half, dead-replay]
  surfaces_deferred: []
  reproduced_at: '2026-08-18'
completed_at: 2026-08-18
---

# P1093: the sign-up-after-reading path records whatever the caller sends it

## Problem

**Situation:** When a reader signs up after reading a letter, the ratings they made in the browser are
written server-side in one call. Found by enumerating the database for every writer of verification
rows during P1067 — it was in no part of the original security review, which had looked only at the
paths the browser calls directly.

**Complication:** That call takes the story, the version, **who is credited as the speaker**, and the
ordering **verbatim from the caller's payload**, and checks none of them against the letter. It is
executable by any signed-in user. So a signed-in caller can record a verification for a story that is
not in the letter, and name **any profile** as the person whose story was understood.

This is the *same defect class* P1067 just closed on the sibling path — a caller-supplied identifier
written without a membership check. P1067 fixed it where the review had pointed and did not widen
scope; this is the other half.

**Downstream effects worth naming:** the counter trigger credits the row's listener, so a caller can
inflate **their own** verification and understanding counters at will. Those are the counters that
feed calibration claims. And since P1067 brought this path under a per-delivery uniqueness rule, a
forged row now also occupies the slot for a real rating of the same story — a caller can silently
block their own genuine rating from ever being recorded.

**Question:** which of these fields should the server derive rather than accept?

## Appetite

Small and self-contained, but it is two distinct decisions, not one: (1) reject stories that are not
in the letter — a direct mirror of the check P1067 added on the sibling path; (2) stop trusting the
caller's claim about who the speaker was — that one is derived from the letter, so it should not be a
parameter at all. Reversible. Worth checking whether the sort order needs validating too.

## Root Cause

**Confirmed by reproduction 2026-08-18** (canary in `reproduce_artifact`, run against test;
4 of 7 layers failed on the symptom before the fix, 3 controls passed).

**The premise the spec was written on is false, and that changes the fix.** The Approach below
assumed a browser caller whose payload needed validating. There is none:

- **No call site anywhere in the repo.** The only two `src/` mentions are comments; both `e2e/`
  mentions are schema introspection. Verified by grep over the whole tree, not a subset.
- **It has never written a row on prod.** It is the only writer of `story_verifications.sort_order`
  (confirmed by enumerating every function that inserts that table from the live prod catalog), and
  that column is NULL across all 98 rows.
- **It was reachable by every signed-in user regardless** — live prod ACL carried `authenticated=X`.

So the four unchecked fields were reachable but unused: a live write surface serving no caller.

**Realized damage on prod: zero**, measured before any change — 0 rows whose story is outside the
letter, 0 whose speaker is not the sender, 0 with a version mismatch, across 35 linked letter rows;
and 0 rows from this writer at all. No repair is needed.

**A fifth field nobody had named.** Reading the body rather than the spec found the positions half
of the same payload: a caller-chosen `point_id` is written to `letter_point_responses` and then
replayed into `point_positions` as that caller's own recorded position on an unrelated point. Same
defect class, one table over. Covered by canary layer L3.

**The half that was real.** This function was P705's replay — staged `letter_point_responses` lifted
into `point_positions` once a reader verifies, because RLS blocks the client write until then. With
no caller, that replay never ran: unverified readers' positions have been stranded in staging since
P705. Folded into this spec by founder decision (2026-08-18).

## Approach

**REVISED 2026-08-18** after the evidence above (the original is preserved in git history).

1. **Revoke the grant rather than validate the payload.** A writer with no caller does not need its
   payload checked; it needs to be unreachable. One statement closes all five fields at once.
   Founder-approved 2026-08-18, overriding the Non-Goal below.
2. **Do not DROP it.** P1063's regression test asserts an anonymous caller receives `42501` from this
   function; dropping turns that into "does not exist" and retires a live guard against a different
   defect. The body stays, unreachable from any client role.
3. **Restore the replay as `replay_letter_positions()`, taking no parameters at all.** Caller,
   deliveries and positions are all derived from server state, so the defect cannot recur here by
   construction rather than by validation. Wired at the point verification lands.

### Original approach (superseded)

1. Reject any payload entry whose story is not in the named letter's snapshot. Mirror the wording and
   shape of the check P1067 added, so the two paths read the same.
2. Derive the speaker from the letter rather than the payload. Confirm first that no legitimate caller
   depends on sending it — the browser builds this payload, so check what it puts there today.
3. Decide on the ordering field: validate, derive, or accept with a stated reason.
4. Assess whether any inflated counters exist in production from this path before deciding whether a
   repair is needed. P1067's equivalent check found zero realized damage; do not assume the same here,
   measure it.

## Risks / Non-Goals

### Risks

- **The browser may already send a speaker that is correct but not derivable the way I expect.**
  MITIGATE: step 2 reads the client payload builder before changing the signature's meaning.
- **This path runs at sign-up, so a wrong refusal loses a reader's whole set of ratings** — worse than
  a rejected single rating. MITIGATE: decide explicitly whether an invalid entry drops that entry or
  fails the whole call, and state which.

### Non-Goals

- ~~Do **NOT** change who may call it. The caller must be signed in already, and that is correct.~~
  **OVERRIDDEN 2026-08-18 (founder), and the reason it was written is what falsified it.** This line
  assumed a legitimate signed-in caller existed. None does. "Signed in" was never the constraint that
  made the call safe — it was the entire attack surface, because every signed-in user has it.
- Do **NOT** fold this into P1067's migration. That one is verified and shipping; adding a concern
  after verification means verifying it again.

## Done-When

- [x] A payload entry whose story is not in the letter is refused — **the whole call is refused**
      (founder decision 2026-08-18: fail, not drop). The refusal is now a grant refusal rather than
      a membership check, which makes the drop-vs-fail question moot: there is no partial acceptance
      because there is no acceptance. Canary L1.
- [x] The speaker is derived server-side — **or rather, is no longer accepted from anyone**, because
      the only path that took it as a parameter is unreachable. Canary L2.
- [x] A decision recorded on the ordering field — same disposition. `sort_order` was written verbatim
      from the payload by this writer alone, and no other writer sets it; closing the writer closes the
      field. It needed no validation rule of its own.
- [x] Production checked for counters already inflated through this path — **zero**, stated in Root
      Cause with the four counts behind it. No repair needed.
- [x] A test that fails before the fix, exercising a forged payload from a signed-in caller —
      `e2e/integration/20260818090000_p1093_signup_payload_gates.spec.ts`. 4 fail / 3 pass before,
      8 pass after (L8 added mid-fix, see below).
- [x] **Surfaced while fixing, folded in rather than deferred (founder, 2026-08-18):** the P705 replay
      of staged positions into `point_positions` never ran, because nothing called its host function.
      Restored as parameter-free `replay_letter_positions()` and wired at verification.
- [x] **Found by the catalog, not the file:** the first draft of the migration left `anon=X` on the new
      replay function. Supabase's default privileges grant EXECUTE to `anon` at creation time, and
      `REVOKE ... FROM PUBLIC` does not remove a role-level grant. Not exploitable (the body refuses a
      NULL `auth.uid()`), but pinned by canary L8, which was watched failing (`P0001` — proof `anon`
      was executing the body) before the corrective revoke.
- [x] Verified against the live **test** catalog, not the migration ledger — `persist_anonymous_completion`
      ACL is `{postgres, service_role}` (no `authenticated`, no `anon`); `replay_letter_positions`
      is `{postgres, authenticated, service_role}` with `pronargs = 0`.
- [ ] `[post-deploy]` Verified against the live **prod** catalog after deploy — **prod is NOT patched by this spec
      closing.** Deploy is its own step.
- [x] `.private/docs/security-log.md` updated — findings, prod counts, the anon-grant mistake and the untested surfaces

## What the code review caught, and why the canary had missed it

An independent review of the committed diff found two real defects in **my own fix**. Both were
verified against the live catalog before being accepted, and both were watched failing before being
corrected.

**HIGH — the restored replay silently dropped three of seven position values.** The enum filter was
copied forward from the dead body being replaced, which used `slightly_disagree` / `neutral` /
`slightly_agree`. Those labels have never existed in `position_type`; the real middle values are
`somewhat_disagree` / `unsure` / `somewhat_agree` (confirmed against `pg_enum` on prod). This is the
exact P705/P716 defect that `20260416150000_p714` had already fixed in a *sibling* function — the
dead body here was never patched, so the fix would have shipped a silent drop of the three commonest
answers, including `unsure`, into brand-new live code, under a migration comment that described the
inherited list as a feature.

**Why L6 passed anyway:** it staged `'agree'`, which is valid in both the broken list and the correct
one. The layer proved the replay ran, not that it replayed *what was staged*. L6 now stages `'unsure'`
and fails against the old filter.

**MEDIUM — the replay bypassed the verification gate it stands in for.** `point_positions` carries an
RLS policy admitting only verified users. A `SECURITY DEFINER` function bypasses that policy, and the
body checked only that a session existed. `mark_self_verified()` returns **false** rather than raising
when the email is unconfirmed, so a caller reaching this line cannot be assumed verified — the client
comment asserting otherwise was wrong. The check now lives in the function, mirroring how
`set_my_pledge` re-checks rather than trusting its caller. New layer L9 covers it, and was watched
writing a row for an unverified caller before the fix.

**The pattern in both, and in the `anon` grant earlier:** each was a claim in a comment that no test
bound and no catalog read had checked. Green was bounding what the fixture emitted, three times in one
spec.

## The fix was reverted mid-flight by a drift remediation — and the ordering would have carried to prod

Two catalog reads showed the revoke live. A later one showed `authenticated` back, appended last —
re-granted, not never-applied.

The P1065 grant-drift check compared live prod against live test, found this function disagreeing, and
shipped a migration restoring the grant (`20260818140000`, commit `9e8ebb71` on main), reasoning that
prod was the baseline and the revocation had "no trace in migration text." That trace was on this
unmerged branch, which the check cannot see.

**Nothing was done wrong.** A security fix lands on test first by design, and the disclosure rule keeps
prod unpatched until the branch is ready — so throughout that window a fix is indistinguishable from
drift, and "restore prod's privilege" re-opens the hole.

**The ordering is the dangerous part.** The restore is timestamped later than this spec's migration, so
on any ordered apply — including the pending prod deploy — it would have run *after* the revoke and
undone it in the same run, silently.

Resolved by `20260818150000_p1093_reassert_revoke_over_drift_restore.sql`, ordered after the restore.
The P1065 commit is deliberately not reverted. The class is filed as **P1102**.

Caught by an independent reviewer re-running the canary live rather than trusting this spec's own
"Canary 9 passed" — which was true when written and false ninety minutes later. L1/L2/L3 are now the
standing regression test for it.

## Scope boundary — what this spec does NOT close

**The defect class is still open on a third path. Filed as P1100 (2026-08-18).**

Found while verifying this fix, by asking whether revoking the grant actually closes the class rather
than assuming it: the row-level INSERT policy on the underlying table carries no membership predicate.
Any signed-in caller can write a letter verification for any story, crediting any profile as the
counterparty, through a plain table insert — no RPC, no letter, no delivery. Executed against test,
not inferred: the insert was accepted and the row was written.

That path is **more** reachable than the one closed here (this one had no caller and had never written
a production row), and it sidesteps the P1067 uniqueness rule by omitting the delivery. It is not
folded in, for the same reason P1067 kept this spec out of its own migration: this fix is verified and
committed, and adding a concern after verification means verifying it again.

Read every "closed" claim in this spec as scoped to the RPC named in it.

## Disclosure ordering — read before pushing

**The branch must not reach public GitHub before prod is migrated** (the P1063 ordering, inherited
from P1067). This spec's migration and canary name the function and describe the reachable path in a
public repo. Prod currently carries the live `authenticated` grant.

Sequence: apply the migration to prod → re-read the prod catalog → then push.
