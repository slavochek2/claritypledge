---
status: today
type: change-request
rank: 1
tags:
  - agreements
  - redesign
  - p472
changes: p472
flow: dev
created_date: 2026-03-06
---

# P478: Celebration dialog redundancy — replace with navigation

After partner signs an agreement, the celebration dialog shows the same certificate that's visible behind it. User sees duplicate content — modal adds confusion, not value.

**Predecessor:** P472 (agreements post-UAT polish)

---

## Problem

1. `CelebrationDialog` renders `AgreementCertificate variant="celebration"` — visually identical to the pending certificate behind the modal
2. User asks: "Why popup when same thing is behind it?"
3. The detail page (`/agreements/:id`) already has `ActiveView` with distinct active variant + /live link + terminate button

## Acceptance Criteria

- [x] AC1: After successful acceptance, navigate directly to `/agreements/:id` (the detail page's `ActiveView`) instead of showing the celebration modal
- [x] AC2: Show a success toast: "Agreement Sealed — your Clarity Partner Agreement with [partnerName] is now active." before navigating
- [x] AC3: The detail page shows the active certificate (gold seal variant), /live session link, and terminate button — all already implemented in `ActiveView`
- [x] AC4: Remove `showCelebration` state and `CelebrationDialog` usage from `accept-agreement-page.tsx` (dead code after AC1)

## Decisions Made

- **Navigate vs slim modal:** Navigate. The `ActiveView` already exists with everything the user needs. A slim modal would still duplicate the detail page.
- **Keep CelebrationDialog component:** Don't delete the component file — it may be useful for other flows (e.g., creator sees celebration when partner signs). Just remove usage from accept page.

## Technical Notes

**Files to change:**
- `src/app/pages/accept-agreement-page.tsx` — replace `setShowCelebration(true)` with `navigate()` + toast, remove celebration dialog JSX and state
- No changes to `celebration-dialog.tsx` (keep component, remove usage)

**Key constraint:** The `handleAccept()` function (line ~136) already refetches the agreement after RPC success. After the navigate, the detail page will load the fresh active agreement.
