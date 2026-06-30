---
status: week
type: bug
rank: 1000942
severity: medium
workstream: C1
date_reported: '2026-06-30'
created_date: '2026-06-30'
tags: [security, p952-class, security-definer, sealed-bid, letters, integrity]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P978: reveal_prediction_by_token dropped its per-listener sealed-bid scope guard (P952 class)

## Summary

`reveal_prediction_by_token(p_token, p_story_id)` — a `SECURITY DEFINER` RPC reachable by an anonymous letter-token holder — lost the delivery/listener-scoped sealed-bid guard that P651 added. P683 recreated the function from the pre-P651 (P648) base under a header that claimed "verbatim clones … No logic or return-type changes," silently reverting P651. The current gate unlocks the sender's prediction as soon as **any** listener has rated the story — defeating the sealed-bid "rate before you can see the prediction" integrity the core mechanic depends on. **Verified live in prod: the `letter_story_snapshots` join and `listener_id` scoping are both absent.** Same shape as P952/P975: recreate from an older base drops a guard a prior migration added.

## Root Cause

P651 (`supabase/migrations/20260405051035_p651_letter_onboarding_fixes.sql`, "scope sealed-bid to delivery (bug #3)") gated the reveal so a caller only sees the prediction once **their own** rating exists, and only within this letter's snapshot:

```sql
-- anon branch
IF NOT EXISTS (
  SELECT 1 FROM story_verifications sv
  JOIN letter_story_snapshots lss ON lss.story_id = sv.story_id AND lss.letter_id = v_letter_id
  WHERE sv.story_id = p_story_id
    AND sv.speaker_id = v_sender_id
    AND sv.source = 'letter'
    AND sv.listener_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
) THEN RETURN NULL; END IF;
-- (authenticated branch keyed on sv.listener_id = v_receiver_id)
```

P683 (`supabase/migrations/20260411201933_p683_engagement_rpcs_drop_expiry_check.sql`) recreated the function from the P648 body, reverting to the un-scoped gate. It is carried unchanged into the current/latest definition, `supabase/migrations/20260412000001_p684_anon_rpc_auth_guard.sql`:

```sql
IF NOT EXISTS (
  SELECT 1 FROM story_verifications
  WHERE story_id = p_story_id AND speaker_id = v_sender_id AND source = 'letter'
) THEN RETURN NULL; END IF;
```

No `listener_id`, no `letter_story_snapshots` join. The gate now passes whenever **any** rating row exists for `(story_id, sender, source='letter')` — produced by a co-recipient of the same letter, or by the same story rated under any other letter from the same sender. P683's header ("No logic or return-type changes") does not acknowledge reverting P651. The returned prediction is still scoped to `v_letter_id`/`v_delivery_id`, so this is a peek-before-commit / cross-delivery-unlock bypass, not raw cross-tenant PII exfiltration. No RLS/trigger/CHECK re-imposes the scoping (SECURITY DEFINER bypasses RLS).

**Prod verification (Management API SQL, read-only, `.env.prod`):** `pg_get_functiondef` of the live `reveal_prediction_by_token` contains neither `letter_story_snapshots` nor `listener_id` — the P651 guard is gone in prod.

## Reproduction Steps

1. Sender A seals a one-to-many letter containing story S, with a prediction for S, sent to recipients R1 and R2 (two deliveries).
2. R1 opens their token link and submits a rating for S → a `story_verifications` row exists for `(S, A, source='letter')`.
3. R2 opens their token link and, **without rating S**, calls `reveal_prediction_by_token(R2_token, S)`.
4. Observe: the gate's `NOT EXISTS` is false (R1's row satisfies it), so the function returns A's prediction to R2 before R2 has committed their own rating.

Alternate single-recipient path: A sends story S in letter L1 and again in letter L2 to the same recipient; rating S under L1 unlocks the reveal under L2.

**Reproduction rate:** 100% once any listener has rated the `(story, sender, source='letter')` tuple.

## Expected Behavior

A caller can reveal the sender's prediction for a story only after **their own** rating for that story (within this letter/delivery) exists — the P651 sealed-bid contract. Another listener's rating must not unlock the reveal.

## Actual Behavior

The reveal unlocks for any caller as soon as a single listener anywhere has rated the story for that sender under any letter, letting a recipient peek at the sender's prediction without committing their own — undermining the calibration mechanic's sealed-bid integrity.

## Affected Files

- `supabase/migrations/20260412000001_p684_anon_rpc_auth_guard.sql` — current/latest definition (live in prod), carries the un-scoped gate
- `supabase/migrations/20260411201933_p683_engagement_rpcs_drop_expiry_check.sql` — the recreate that reverted P651 while claiming "no logic changes"
- `supabase/migrations/20260405051035_p651_letter_onboarding_fixes.sql` — the version with the per-listener + snapshot-scoped guard

## Severity

**Medium** — information-integrity regression on the product's core sealed-bid mechanic (a recipient can peek at the sender's prediction before committing their own). No cross-tenant PII exfiltration (the prediction is still letter/delivery-scoped), and impact is bounded to recipients of the same sender's letters, but it defeats the calibration guarantee the product is built on.

## Fix Approach

Restore the P651 per-listener + snapshot-scoped gate on top of the current P684 body, keeping the P684 anon/one-to-many auth guard and the P683 expiry-check drop (both intentional). Re-add the authenticated branch (`sv.listener_id = v_receiver_id`) and the anon branch (`sv.listener_id = COALESCE(auth.uid(), sentinel)` + `JOIN letter_story_snapshots`). Add a regression test (mirror `src/tests/p975-letter-scope-gate.test.ts`) asserting the latest migration defining `reveal_prediction_by_token` contains the `listener_id` scoping; confirm it FAILS against the current P684 definition before wiring it in (epistemic gate: exercise the gate's failure path).

## Acceptance Criteria

- [ ] A recipient who has not rated story S cannot reveal the sender's prediction for S, even when a co-recipient has already rated S (integration test with two deliveries)
- [ ] Rating S under one letter does not unlock the reveal for S under a different letter from the same sender
- [ ] The legitimate path still works: after the caller submits their own rating for S in this delivery, the reveal returns the prediction
- [ ] P684 anon/one-to-many auth guard and the intentional expiry-check drop remain intact
- [ ] Regression test asserts the latest migration contains the `listener_id`/snapshot scoping; fails pre-fix, passes post-fix
