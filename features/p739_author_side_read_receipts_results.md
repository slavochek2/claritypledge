---
status: backlog
type: story
rank: 53
created_date: '2026-04-17'
tags: [letters, results, read-receipts, author]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P739: Author-side read receipts on results page

## Problem

**Situation:** A letter author viewing their own results page has no signal that the recipient actually opened or read the letter. `letter_deliveries` already tracks `read_at` (set by `markDeliveryRead` on inbox tap); the field is simply not surfaced to the author.

**Complication:** Author uncertainty: "Did they see it? Is silence disengagement or just unread?" Without a read signal, the author is stuck guessing. Real-world usage suggests this is a common trust gap.

**Question:** Where and how should the read-status signal appear on the results page — and are there privacy considerations for the recipient?

## Appetite

Small blast radius. Data already exists (`letter_deliveries.read_at`). Mostly a render-layer change. Reversible: remove the render block. Low decision density once the UX placement is chosen.

## Solution

Sketch:
1. Extend `get_letter_results` RPC (already touched by P725) to return `read_at` alongside recipient profile data.
2. On results page (author view only), render read status in or next to the identity row:
   - `read_at` null → "Not yet opened" (subtle muted text)
   - `read_at` set → "Opened X ago" (relative time)
3. Recipient view does not show this signal — it's only meaningful to the author.
4. No DB writes. No new columns. No new RLS.

[FOUNDER DECISION] — wording and placement. Default suggestion: small muted line below the "Letter to [Name]" identity row.

## Risks / Non-Goals

### Risks
- **Privacy concern** — recipients may not know their read status is exposed to the author. Mitigation: `read_at` is already set on inbox interaction (implicit consent via product design), but a product-level acknowledgment in settings/terms may be warranted.
- **Stale data** — if the recipient opens the letter between results-page loads, the signal is stale. Mitigation: poll or revalidate on focus.
- **Interaction with public-link letters** — multiple recipients each have their own `read_at`; roster view would need to aggregate.

### Non-Goals
- No opt-out mechanism for recipients (separate spec if needed).
- No "delivered" status distinct from "read" (SMTP-style two-tier).
- No real-time push — polling or revalidation on page load is sufficient.

## Done-When

- [ ] Results page (author view) shows read status next to identity row
- [ ] Recipient view is unchanged (does not see this signal)
- [ ] `read_at` null and non-null cases both render correctly
- [ ] No new DB columns; no change to `markDeliveryRead` behavior
- [ ] Visual QA on mobile + desktop
