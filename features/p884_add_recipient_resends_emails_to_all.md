---
status: qa
type: bug
rank: 1000774.0
severity: high
workstream: letters
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [letters, email, mailgun, duplicate-send]
date_resolved: '2026-06-04'
root_cause: "send-letter-emails had no record of already-notified deliveries — every letter-wide invoke re-emailed all recipients"
resolution: "notified_at column + backfill; function claims deliveries atomically before sending; caller auth (401 unauthenticated, 404 non-sender); P778 on-open deliveries stamped do-not-notify at insert"
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: e2e/integration/p884-reproduce.spec.ts
  root_cause: "send-letter-emails fetches ALL letter_deliveries with receiver_email (index.ts:184-188 — no already-notified filter) and returns sent: deliveries.length; add-recipient modal invokes it letter-wide, so every add re-emails every prior recipient. No notified_at column exists on letter_deliveries; function is not idempotent against duplicate invokes either."
  confidence: high
  surfaces_in_scope: [add-recipient-resend, duplicate-invoke-idempotency]
  surfaces_deferred: []
  reproduced_at: 2026-06-04
---

# P884: Adding a recipient to a letter re-sends invitation emails to ALL previous recipients

## Summary

When the sender adds a new recipient to an existing (sealed) clarity letter, the `send-letter-emails` edge function emails **every** delivery row for that letter — not just the new one — so all previous recipients receive the "X sent you a Clarity Letter" email again. Observed in prod: recipient received duplicate letter emails on 2026-06-02 and earlier, matching each time a new recipient was added.

## Root Cause

**Confirmed live (reproduce, 2026-06-04):** canary `e2e/integration/p884-reproduce.spec.ts` against the deployed test-env function — invoke #1 with one delivery returned `sent: 1`; after inserting a second delivery, invoke #2 returned `sent: 2` (prior recipient re-emailed). Deterministic across retries.

**Scenario scope (confirmed with founder):** (2) add-recipient re-send AND (3) duplicate letter-wide invoke (double-click seal / network retry re-emails everyone) — same root cause: no record of who was already notified. Canary covers both. Sibling functions audited and NOT affected: `send-agreement-emails` (1:1, action-scoped), `send-event-emails` (intentional broadcast per host action), `send-letter-response-signin` (single explicit recipient).

Confirmed from code read:

1. Add-recipient mode in `letter-receiver-modal.tsx:436` calls `invokeLetterEmails(props.letterId)` after any successful `addRecipientToSealed`.
2. The edge function `send-letter-emails/index.ts:184-188` fetches **all** `letter_deliveries` rows for the letter where `receiver_email` is not null — there is no "already notified" filter.
3. `index.ts:197-288` then sends an email to every fetched delivery.

Secondary effect: for registered recipients the re-send regenerates a **magic link** (`index.ts:241-247`), which invalidates the previously emailed link — so the button in an older email may stop working.

## Reproduction Steps

1. As a verified sender, compose a clarity letter and seal/send it to recipient A (A receives invitation email #1).
2. Open the letter and add recipient B via the add-recipient modal.
3. Observe: recipient A receives the invitation email **again**, in addition to B receiving theirs.

**Reproduction rate:** 100% (deterministic from code path)

## Expected Behavior

Only the newly added recipient(s) receive an invitation email. Previous recipients receive nothing, and their existing magic links remain valid.

## Actual Behavior

All recipients with a `receiver_email` on the letter receive the invitation email again on every add. Previously emailed magic links for registered recipients are invalidated by the regenerated link.

## Affected Files

- `supabase/functions/send-letter-emails/index.ts:184-188` — delivery query has no notified filter
- `src/app/components/letters/letter-receiver-modal.tsx:436` — add-recipient mode invokes the function letter-wide
- `src/lib/letter-emails.ts` — `invokeLetterEmails(letterId)` API carries no delivery scoping
- `src/app/pages/letter-compose-page.tsx:210` — initial-send call site (must keep working after fix)

## Severity

**High** — affects every multi-recipient letter in prod; spams external recipients (trust/deliverability damage) and silently invalidates previously sent magic links.

## Fix Approach

Two options (decide in /fix):

1. **Scope by delivery IDs (root-cause fix):** extend the function body to accept optional `deliveryIds: string[]`; add-recipient mode passes only the newly created delivery IDs. Initial send omits it (all deliveries).
2. **`notified_at` column on `letter_deliveries`:** function skips rows where `notified_at` is set and stamps it after a successful send. Also makes the function idempotent against retries — preferable for robustness; requires a migration.

Option 2 (or both) recommended: idempotency at the function level protects against any future caller making the same mistake.

## Resolution

**Fixed:** 2026-06-04 — Option 2 implemented, plus caller authorization (founder-approved scope inclusion during /fix).

1. **Migration `20260604100000_p884_letter_deliveries_notified_at.sql`** — adds `letter_deliveries.notified_at TIMESTAMPTZ`; backfills every existing delivery with a `receiver_email` to its `created_at` (both creation paths emailed immediately after insert, so all existing rows were already notified — without the backfill the next add-recipient would re-email everyone one final time).
2. **`send-letter-emails/index.ts`** — (a) caller authorization runs before body parsing: 401 without a user JWT; non-sender callers get the same 404 as a missing letter so letter IDs cannot be enumerated (closes the anyone-with-a-letterId-can-trigger-emails gap — letterIds are public in one-to-many share URLs); (b) delivery query adds `.is('notified_at', null)`; (c) atomic claim-then-send per delivery (`UPDATE … WHERE notified_at IS NULL` before Mailgun, unclaim on send failure so retries can resend); (d) response `sent` counts only deliveries actually claimed and sent this invoke.
3. **Migration `20260605090000_p884_stamp_on_open_deliveries.sql`** (review finding M1) — P778 self-enrolled reader deliveries (`create_letter_delivery_on_open`) carry a `receiver_email` but must never be emailed; the RPC now stamps `notified_at` at insert, with an idempotent catch-up UPDATE for the gap window.
4. **No client changes** — `invokeLetterEmails(letterId)` keeps its signature; function-level idempotency makes the letter-wide invoke correct for every caller. Verified that `supabase.functions.invoke` forwards the signed-in user's JWT (locked in by a dedicated regression test).

Magic-link invalidation (secondary effect) is resolved structurally: already-notified deliveries are never re-processed, so `generateLink` is not called for them.

**Why claim-then-send (at-most-once):** correctness — the duplicate-spam bug class is what P884 fixes; a concurrent invoke racing the fetch could otherwise double-send. Mailgun API failures unclaim the row, so the email is recoverable on the next invoke.

**Regression tests:**
- `e2e/integration/p884-reproduce.spec.ts` — function contract: 401 anon / 404 non-sender / sent 1-1-0 across initial, add-recipient, and retry invokes / `notified_at` stamps / supabase-js JWT forwarding
- `e2e/integration/20260604100000_p884_letter_deliveries_notified_at.spec.ts` — migration guarantees: column, NULL default, claim-exactly-once primitive, unclaim
- `e2e/integration/20260605090000_p884_stamp_on_open_deliveries.spec.ts` — on-open deliveries stamped at insert; sender-invoked letter-wide send emails 0 self-enrolled readers; idempotent re-open
- `e2e/p884-add-recipient-ui.spec.ts` — UI-driven success path (p688's submit test only covers the failure path): real modal submit stamps only the new delivery, prior recipient untouched, zero console errors

## Pre-deploy Checklist

### Deploy commands (order matters)
- [ ] **First:** run prod migrations (both `20260604100000` column+backfill and `20260605090000` on-open stamp) — the updated function queries `notified_at`; deploying the function before the migrations breaks all letter emails with 42703
- [ ] **Then:** `supabase functions deploy send-letter-emails --project-ref besjtuodziykmjidubzw`

### Post-deploy verification
- [ ] Smoke: seal a test letter on prod → exactly one email to the new recipient; check Mailgun logs for single send
- [ ] Check Sentry/function logs for 401/403/500 spikes in first 10 minutes (a 401 spike = client JWT not forwarded — emails silently stopping)

## Acceptance Criteria

- [x] Adding a recipient to a sealed letter sends an email only to the new recipient (canary invoke #2: `sent: 1`, delivery A `notified_at` unchanged; UI test: only B stamped)
- [x] Initial seal/send still emails all recipients exactly once (canary invoke #1: `sent: 1`; retry invoke #3: `sent: 0`)
- [x] Existing recipients' magic links are not invalidated when someone else is added (already-notified deliveries never re-processed — `generateLink` not reached; A's stamp unchanged across invokes)
- [x] Regression test covering the add-recipient email scoping passes (4 test files, 9 tests — see Resolution)
- [x] No console errors during compose → seal → add-recipient flow (`e2e/p884-add-recipient-ui.spec.ts` captures console through the real submit: zero errors)
- [x] Only the letter sender can trigger letter emails: unauthenticated invoke → 401, authenticated non-sender → 404 (no letter-ID enumeration), rejected invokes stamp nothing (added in /fix with founder approval)
