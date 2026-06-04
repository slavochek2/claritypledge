---
status: week
type: bug
rank: 1000774.0
severity: high
workstream: letters
date_reported: '2026-06-04'
created_date: '2026-06-04'
tags: [letters, email, mailgun, duplicate-send]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P884: Adding a recipient to a letter re-sends invitation emails to ALL previous recipients

## Summary

When the sender adds a new recipient to an existing (sealed) clarity letter, the `send-letter-emails` edge function emails **every** delivery row for that letter — not just the new one — so all previous recipients receive the "X sent you a Clarity Letter" email again. Observed in prod: recipient received duplicate letter emails on 2026-06-02 and earlier, matching each time a new recipient was added.

## Root Cause

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

## Acceptance Criteria

- [ ] Adding a recipient to a sealed letter sends an email only to the new recipient (verify via Mailgun logs or local test)
- [ ] Initial seal/send still emails all recipients exactly once
- [ ] Existing recipients' magic links are not invalidated when someone else is added
- [ ] Regression test covering the add-recipient email scoping passes
- [ ] No console errors during compose → seal → add-recipient flow
