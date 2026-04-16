---
status: in-progress
type: bug
rank: 1000716.0
severity: high
workstream: letters
date_reported: '2026-04-16'
created_date: '2026-04-16'
tags: [letters, results, data-fetch]
delivery_stage: fix
pipeline_ran: [create-bug]
---

# P716: Sender's results view missing recipient's confidence and positions

## Problem

After a recipient completes a letter, the **sender's results view** shows:
- "Recipient's confidence: Not yet rated" (empty, no star value)
- Position buttons show only the sender's positions — no recipient positions visible

The **recipient's own results view** shows complete data for both parties.

Confirmed on a private letter (`mode = 'one-to-one'`) with `status = completed` delivery. Data is correctly saved in the database; the bug is purely in how the sender navigates to the results page.

## Root Cause

**Missing `?delivery=` URL parameter on all sender-initiated navigation to results.**

The `get_letter_results` RPC (`p_delivery_id DEFAULT NULL`) has NULL guards at steps 6 and 7. When `p_delivery_id` is NULL, `v_actual_delivery_id` stays NULL, so the RPC skips ratings and point_responses, returning empty arrays. The sender's view shows "Not yet rated" and no recipient positions.

### Exact code paths

**Sender paths (broken — no delivery param):**

1. `sent-tab.tsx:145` — `handleResults`:
   ```ts
   navigate(`/letter/${letter.id}/results`);
   ```
2. `sent-tab.tsx:221` — mobile dropdown:
   ```ts
   navigate(`/letter/${letter.id}/results`);
   ```
3. `inbox-tab.tsx:85-88` — sender inbox items of type `recipient_responded` or `link_respondent`:
   ```ts
   const deliveryParam = (item.type === 'recipient_in_progress' || item.type === 'link_respondent_in_progress')
     ? `?delivery=${item.delivery_id}`
     : '';
   navigate(`/letter/${item.letter_id}/results${deliveryParam}`);
   ```
   This passes delivery for `*_in_progress` types but NOT for completed response types (`recipient_responded`, `link_respondent`).

**Recipient path (working — has delivery param):**
- `inbox-tab.tsx:79`: `navigate(\`/letter/${item.letter_id}/results?delivery=${item.delivery_id}\`)`
- `letter-completion-summary.tsx:69`: `navigate(\`/letter/${letterId}/results?delivery=${deliveryId}\`)`

### RPC behavior

- `supabase/migrations/20260413100000_p699_get_letter_results.sql`
- Step 2 (line 64): sender with `p_delivery_id IS NOT NULL` resolves `v_actual_delivery_id`
- Step 6 (line 163): `IF v_actual_delivery_id IS NOT NULL` — fetches ratings
- Step 7 (line 186): `IF v_actual_delivery_id IS NOT NULL` — fetches point_responses
- When `p_delivery_id` is NULL (sender path), both return `'[]'::jsonb`

## Reproduction

1. Sender creates and sends a private letter
2. Recipient opens via email, completes the letter (rates stories, submits positions)
3. Sender opens Results from sent-tab or inbox
4. **Expected:** Recipient's confidence rating and positions visible
5. **Actual:** "Not yet rated", no recipient positions

## Confirmed Data State

- Delivery `af9c686e-c745-40b4-9fb1-6164f558d5ed` (Test Recipient, `p716-fixture@example.com`)
- Letter `315ec9f2-69f4-4402-8c97-1f95ab8f66e2`, `mode: one-to-one`, `status: sealed`
- Delivery `status: completed`
- Recipient's own results page: shows COMPLETE data
- Sender's results page: shows INCOMPLETE data

## Solution

### Case 1: One-to-one letter (single delivery)

**Fix `sent-tab.tsx`:** The `LetterCard` component already has `deliveries: LetterDelivery[]` in its data. For one-to-one letters with exactly one completed delivery, pass `?delivery=${deliveries[0].id}` on navigation.

**Fix `inbox-tab.tsx`:** The `else` branch (sender items) should pass `?delivery=${item.delivery_id}` for ALL sender inbox item types, not just `*_in_progress`. The `item.delivery_id` is always available.

### Case 2: One-to-many letter (multiple deliveries)

For `sent-tab.tsx` with multiple completed deliveries, the sender needs to pick which recipient's results to view. Two sub-options:

- **(A) Auto-select first completed delivery** — navigate to the first completed delivery's results. Simple, ships fast, but the sender only sees one recipient at a time. They can later switch via the expanded recipient rows.
- **(B) Make RecipientRow clickable** — each completed `RecipientRow` navigates to `/letter/${letter.id}/results?delivery=${delivery.id}`. The top-level "Results" button navigates to the first completed delivery. This gives the sender per-recipient access.

**Recommendation: (B).** It's minimal extra work (add onClick to `RecipientRow` for completed deliveries), and it's the only path that makes one-to-many results usable.

## Risks / Non-Goals

- **Non-goal:** Changing the `get_letter_results` RPC to auto-resolve a single delivery when `p_delivery_id` is NULL. The RPC's NULL-guard behavior is correct by design (SECURITY DEFINER — explicit is safer).
- **Non-goal:** Aggregated multi-recipient results view (showing all recipients' data on one page).
- **Risk:** If `deliveries` array is empty when sender clicks Results (race condition: letter sealed but delivery not yet created). Mitigate with a guard — don't navigate if no completed deliveries exist.

## Affected Files

| File | Change |
|------|--------|
| `src/app/components/letters/sent-tab.tsx` | Pass `?delivery=` in `handleResults` and mobile dropdown; make `RecipientRow` clickable for completed deliveries |
| `src/app/components/letters/inbox-tab.tsx` | Pass `?delivery=${item.delivery_id}` for all sender inbox item types (remove the type-gated conditional) |

No RPC changes. No migration. No new files.

## Acceptance Criteria

- [ ] Sender's results view for a **one-to-one** letter shows recipient's confidence rating (filled stars matching what recipient submitted)
- [ ] Sender's results view for a **one-to-one** letter shows recipient's position choices alongside sender's positions
- [ ] Sender clicking "Results" on a **one-to-many** letter navigates to the first completed delivery's results (not a blank page)
- [ ] Completed `RecipientRow` entries in expanded sent-tab are clickable and navigate to that delivery's results
- [ ] Sender inbox items of type `recipient_responded` and `link_respondent` navigate to results with `?delivery=` param
- [ ] Recipient's own results view unchanged (still complete)
- [ ] No navigation occurs when zero deliveries are completed (guard)
- [ ] `npm test` passes
