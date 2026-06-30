---
status: done
type: bug
rank: 1000943
severity: low
workstream: C1
date_reported: '2026-06-30'
created_date: '2026-06-30'
tags: [p952-class, security-definer, integrity, letters, state-machine]
delivery_stage: ship
pipeline_ran: [create-bug]
---

# P979: update_delivery_status_by_token dropped its forward-only (monotonic) transition guard (P952 class)

## Summary

`update_delivery_status_by_token(p_token, p_status)` — a `SECURITY DEFINER` RPC reachable by an anonymous letter-token holder — lost the forward-only state guard P651 added. P683 recreated the function from the pre-P651 base (header: "No logic or return-type changes"), silently reverting the guard; it remains absent in the current/latest definition and **is confirmed gone in prod**. A token holder can now drive their own delivery's `status` backward (e.g. `completed → opened → sent`), corrupting the sender's inbox progress display. This is a P952-class silent clause-drop, but the dropped clause is a **state-integrity** check, not a confidentiality/auth control — flagged here for completeness and ranked lowest.

## Root Cause

P651 (`supabase/migrations/20260405051035_p651_letter_onboarding_fixes.sql`, "add forward-only guard (bug #10)") ranked the status values and rejected backward transitions:

```sql
v_current_rank := CASE v_current_status WHEN 'sent' THEN 1 WHEN 'opened' THEN 2
                  WHEN 'in_progress' THEN 3 WHEN 'completed' THEN 4 ELSE 0 END;
v_new_rank     := CASE p_status          WHEN 'sent' THEN 1 WHEN 'opened' THEN 2
                  WHEN 'in_progress' THEN 3 WHEN 'completed' THEN 4 ELSE 0 END;
IF v_new_rank <= v_current_rank THEN RETURN true; END IF;  -- reject backward transitions
```

P683 (`supabase/migrations/20260411201933_p683_engagement_rpcs_drop_expiry_check.sql`) recreated the function from the P642 body, dropping the rank logic. The current/latest definition (`supabase/migrations/20260412000001_p684_anon_rpc_auth_guard.sql`) does an unconditional `UPDATE letter_deliveries SET status = p_status ...`. No CHECK constraint or trigger enforces status monotonicity (not relocated). P683's header ("No logic or return-type changes") does not acknowledge the revert.

**Prod verification (Management API SQL, read-only, `.env.prod`):** `pg_get_functiondef` of the live `update_delivery_status_by_token` contains neither `v_new_rank` nor `v_current_rank` — the guard is gone in prod.

## Reproduction Steps

1. A recipient opens their token link and progresses their delivery to `completed` (status = `completed`).
2. Call `update_delivery_status_by_token(token, 'opened')` (or `'sent'`).
3. Observe: the delivery's `status` is set backward to `opened`; the sender's inbox/progress view shows the delivery as "in progress" / not completed again.

**Reproduction rate:** 100% (unconditional update).

## Expected Behavior

Delivery status is monotonic forward-only: a request to move to a status of equal-or-lower rank is a no-op (`RETURN true` without mutating), as P651 guaranteed. The sender's progress view does not regress after a delivery completes.

## Actual Behavior

Any token-supplied status is written unconditionally, so a recipient can move their own delivery's status backward, and the `opened_at`/`completed_at` first-transition stamps can be skipped on the re-forwarded path — corrupting the sender's inbox progress state.

## Affected Files

- `supabase/migrations/20260412000001_p684_anon_rpc_auth_guard.sql` — current/latest definition (live in prod), unconditional status write
- `supabase/migrations/20260411201933_p683_engagement_rpcs_drop_expiry_check.sql` — the recreate that dropped the forward-only guard while claiming "no logic changes"
- `supabase/migrations/20260405051035_p651_letter_onboarding_fixes.sql` — the version with the monotonic rank guard

## Severity

**Low** — state-integrity / monotonicity regression scoped to the caller's **own** delivery row. No cross-tenant write, no data disclosure, no auth bypass; the only impact is corrupted sender-facing progress display, which the next legitimate forward transition re-corrects. Included because it is a genuine, silent P952-class clause loss still live in prod.

## Fix Approach

Restore the P651 forward-only rank guard on top of the current P684 body (keeping the P684 anon/one-to-many auth guard and the intentional expiry-check drop). Add a regression test asserting the latest migration defining `update_delivery_status_by_token` contains the monotonic rank check; confirm it fails against the current P684 definition before wiring it in. Consider whether status monotonicity belongs in a CHECK/trigger rather than per-RPC, so future recreates can't drop it (architectural call for `/fix`).

## Acceptance Criteria

- [ ] A backward transition request (e.g. `completed → opened`) is a no-op and does not mutate `status` (integration test against the token RPC)
- [ ] Forward transitions still advance status and stamp `opened_at`/`completed_at` on first transition
- [ ] P684 anon/one-to-many auth guard and the intentional expiry-check drop remain intact
- [ ] Regression test asserts the latest migration contains the monotonic guard; fails pre-fix, passes post-fix
