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

## Summary

After a recipient completes a letter, the **sender's results view** shows:
- "Recipient's confidence: Not yet rated" (empty, no star value)
- Position buttons show only the sender's positions — no recipient positions visible

The **recipient's own results view** shows complete data for both parties (both confidences, both positions).

Confirmed on a private letter (`mode = 'one-to-one'`) with `status = completed` delivery — so the root cause is NOT P715 (email delivery path). Data is correctly saved; the bug is in how the sender's results page fetches or renders recipient data.

## Reproduction

1. Sender creates and sends a private letter
2. Recipient opens via email, completes the letter (rates stories, submits positions)
3. Sender opens the Results view for that delivery
4. **Expected:** Recipient's confidence rating and positions visible alongside sender's
5. **Actual:** Recipient's confidence shows "Not yet rated"; position buttons show no recipient selection

## Confirmed Data State

- Delivery `af9c686e-c745-40b4-9fb1-6164f558d5ed` (Test Recipient, `p716-fixture@example.com`)
- Letter `315ec9f2-69f4-4402-8c97-1f95ab8f66e2`, `mode: one-to-one`, `status: sealed`
- Delivery `status: completed`
- Recipient's own results page: shows COMPLETE data (both confidences, both positions)
- Sender's results page: shows INCOMPLETE data

## Root Cause

Unknown. Needs investigation. Key question: what RPC/service call does the sender's results view use vs the recipient's view, and why does the sender's call not return recipient data?

## Affected Files (suspected)

- `src/app/pages/letter-reading-page.tsx` — `LetterCompletionSummary` call site (sender view)
- `src/app/components/letters/letter-completion-summary.tsx` — results rendering
- The RPC or service function used to fetch letter results for the sender

## Acceptance Criteria

- [ ] Sender's results view shows recipient's confidence rating (filled stars matching what recipient submitted)
- [ ] Sender's results view shows recipient's position choices alongside sender's positions
- [ ] Recipient's own results view unchanged (still complete)
- [ ] `npm test` passes
