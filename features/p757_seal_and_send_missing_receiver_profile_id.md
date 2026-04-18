---
status: qa
type: bug
rank: 1000757.0
severity: high
workstream: letter
date_reported: '2026-04-18'
created_date: '2026-04-18'
date_resolved: '2026-04-18'
root_cause: seal_and_send_letter deliveries loop INSERT omitted receiver_profile_id; P731 patched add_recipient_to_sealed_letter but missed this path
resolution: CREATE OR REPLACE adds profiles.id lookup (lower() match) before each delivery INSERT; backfill UPDATE fixes existing NULL rows
tags: [letter-delivery, inbox, rls, db-function]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P757: `seal_and_send_letter` inserts letter_deliveries with NULL receiver_profile_id — private letters invisible in inbox

## Summary

`seal_and_send_letter` does not look up `profiles.id` by `receiver_email` before inserting into `letter_deliveries`, so `receiver_profile_id` is always NULL for letters sealed at compose-time. `get_inbox_items` filters `WHERE ld.receiver_profile_id = v_user_id`, so NULL rows never appear — private letters are silently invisible to recipients who don't open the email link.

## Root Cause

P731 (2026-04-16) patched `add_recipient_to_sealed_letter` with an email→profile lookup but missed the seal-time write path. The INSERT inside `seal_and_send_letter`'s deliveries loop (migration `20260418144500_p749_seal_rpc_hidden_per_point.sql`, lines 125–132) omits `receiver_profile_id` entirely. Public letters recover via `claim_letter_delivery` when the recipient opens the link; private letters have no such recovery path.

## Invariants

- `receiver_profile_id` must be populated at every `letter_deliveries` write path: `seal_and_send_letter`, `add_recipient_to_sealed_letter`, `create_letter_delivery`. Partial coverage breaks inbox visibility without any error signal.
- Email matching must use `lower()` on both sides — `profiles.email` is stored as-provided and case-mismatch misses are silent.
- `_is_letter_receiver` RLS helper (used by `letter_point_responses`, `letter_predictions`, `letter_story_snapshots`) depends on `receiver_profile_id` being non-NULL to grant receiver access.

## Reproduction Steps

1. Log in as the letter author (test DB)
2. Compose a private letter (delivery type: private, not public link)
3. Add a recipient whose email exists in `profiles` (e.g. `vyacheslav.ladischenski@gmail.com`)
4. Seal and send the letter
5. Log in as the recipient
6. Open inbox — letter does not appear

**Reproduction rate:** 100% for private letters where recipient already has a profile

## Expected Behavior

After step 4, `letter_deliveries` row has `receiver_profile_id` set to the recipient's profile UUID. Letter appears in recipient's inbox without requiring the email link to be opened.

## Actual Behavior

`letter_deliveries` row is inserted with `receiver_profile_id = NULL`. `get_inbox_items` Branch 1 (`WHERE ld.receiver_profile_id = v_user_id`) skips the row. Recipient sees an empty inbox. All existing `status='sent'` rows for affected recipients have `receiver_profile_id = NULL` confirmed on test DB.

## Affected Files

- `supabase/migrations/20260418144500_p749_seal_rpc_hidden_per_point.sql` — lines 125–132: deliveries loop INSERT missing `receiver_profile_id`
- `supabase/migrations/20260418200000_p755_restore_inbox_in_progress_rpc.sql` — line 76: `get_inbox_items` Branch 1 filter (`WHERE ld.receiver_profile_id = v_user_id`) — correct behavior, wrong upstream data
- `supabase/migrations/20260416210000_p731_set_receiver_profile_id_on_add_recipient.sql` — reference: correct email→profile lookup pattern to mirror

## Severity

**High** — private letters are silently invisible to recipients who have a profile but haven't opened the email link; data already in DB is affected and requires a backfill.

## Fix Approach

Mirror the P731 pattern into `seal_and_send_letter`: `CREATE OR REPLACE` the function adding a `SELECT id INTO v_receiver_profile_id FROM profiles WHERE lower(email) = lower(v_receiver_email)` lookup before each INSERT. Add a backfill `UPDATE letter_deliveries SET receiver_profile_id = p.id FROM profiles p WHERE ld.receiver_profile_id IS NULL AND lower(ld.receiver_email) = lower(p.email)` in the same migration (idempotent: `IS NULL` guard). Add Playwright integration spec covering three scenarios: profile match → set, no profile → NULL, inbox visible without opening link.

## Acceptance Criteria

- [x] After sealing a private letter to a registered email, `letter_deliveries.receiver_profile_id` is non-NULL immediately (no email link required)
- [x] Recipient's inbox shows the sealed letter within one poll cycle (≤15s) without opening the email link
- [x] Existing NULL rows for recipients with matching profiles are backfilled to the correct `profile_id` after migration runs
- [x] Sealing a letter to an unregistered email still inserts with `receiver_profile_id = NULL` (no error)
- [x] Regression test passes: `e2e/integration/20260418210000_p757_seal_sets_receiver_profile_id.spec.ts`
- [x] No console errors during the seal flow (DB-only fix, no UI path changed)
