---
status: all-done
type: story
rank: 2
tags:
  - pledge
  - settings
  - off-boarding
flow: inline
delivery_stage: done
created_date: '2026-03-15'
locked_at: '2026-03-18T08:10:22.410Z'
---

# P524: Withdraw Pledge Toggle

## Problem Statement

Users who want to stop carrying the Clarity Pledge commitment have no self-serve way to do so. The only option is contacting the founder via WhatsApp. Gosha (first exit request) initially wanted a pause but was funneled to full account deletion because no withdraw option existed.

## Solution

Add a "Withdraw my pledge" button to the settings page. One click + confirmation sets `has_pledged: false`. All downstream logic already handles this correctly:

- Pledgers page filters `.eq('has_pledged', true)` — withdrawn user disappears
- Featured profiles same filter — social proof stays honest
- Pledge certificate page shows "not found" for non-pledgers
- Profile page conditionally shows pledge badge
- Re-pledging works via existing `/sign-pledge` upgrade flow (`has_pledged: false → true`)

## Acceptance Criteria

- [ ] Settings page shows "Withdraw my pledge" option (only visible when `has_pledged: true`)
- [ ] Confirmation dialog explains: pledge removed, profile stays, can re-pledge anytime via /sign-pledge
- [ ] Calls `updateProfile({ has_pledged: false })` — no new API needed
- [ ] Immediate effect — pledgers page, featured profiles, profile badge all update
- [ ] No guilt language in confirmation
- [ ] Settings page shows "Re-take the pledge" link to /sign-pledge when `has_pledged: false`

## Scope

Inline fix — ~30 minutes. No edge function, no migration, no new API. Just UI in settings-page.tsx.
