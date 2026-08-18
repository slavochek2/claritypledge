---
status: qa
type: bug
rank: 4
created_date: '2026-08-17'
tags: [security, letters, integrity, calibration]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
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

## Disclosure ordering — read before pushing

**The branch must not reach public GitHub before prod is migrated** (the P1063 ordering, inherited
from P1067). This spec's migration and canary name the function and describe the reachable path in a
public repo. Prod currently carries the live `authenticated` grant.

Sequence: apply the migration to prod → re-read the prod catalog → then push.
