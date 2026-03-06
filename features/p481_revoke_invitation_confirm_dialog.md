---
status: qa
delivery_stage: uat
type: change-request
rank: 500004.5
changes: p459
flow: dev
tags:
  - redesign
  - p459
  - p422
created_date: 2026-03-06
uat_file: features/uat/p481.md
test_files:
  - src/tests/p481-revoke-confirm-dialog.test.tsx
---

# P481: Revoke Invitation — Replace Inline Confirm with Dialog

> **Redesign of:** [P459: Move Partner Agreements to Connections Page](features/done/5_feb_26/p459_agreements_to_connections_page.md)
> **What was wrong:** The "Revoke" action on pending invitations uses an inline state swap (Revoke button becomes Keep/Cancel text links in the same row). This is cramped, confusing (three small text links side by side), and inconsistent with the rest of the app which uses modal dialogs for destructive confirmations (P422 specifies dialogs for Terminate and Decline).

## Problem Statement

Revoking a pending invitation is a destructive, irreversible action — the partner loses access to the invite link. The current inline confirm pattern (button swap to Keep/Cancel) is easy to mis-tap on mobile, visually indistinguishable from navigation actions, and breaks the established confirmation pattern used everywhere else in the app (dialogs for Terminate, Decline, Remove Position).

## Jobs To Be Done

- **Preserved from P459:** Owner can cancel a pending invitation from the partners page
- **Corrected:** Confirmation UX — from inline swap to dialog, matching app-wide destructive action pattern
- **New:** None

## Current State

P459 renders pending invitation rows with `cancelable={true}`, which shows a `CancelButton` component in `agreement-row.tsx`. Clicking "Revoke" toggles local `confirming` state, swapping the button to two inline text links: "Keep" and "Cancel".

**Before (current):**
```
┌─────────────────────────────────────────────────────────┐
│  Karl Marx                          [Resend] [Revoke]   │
│  Invited 04 Mar 26                                      │
└─────────────────────────────────────────────────────────┘
                          | click Revoke
                          v
┌─────────────────────────────────────────────────────────┐
│  Karl Marx                     [Resend] [Keep] [Cancel] │
│  Invited 04 Mar 26                                      │
└─────────────────────────────────────────────────────────┘
```

## Root Cause

The `CancelButton` component (`agreement-row.tsx:149-213`) was implemented with an inline confirm pattern rather than a dialog. P422 specified dialogs for Terminate (line 666) and Decline (line 339), but the Revoke action on the connections page was added in P459 without an explicit confirmation UX spec — the inline pattern was an implementation choice, not a design decision.

Code reference: `src/app/components/agreements/agreement-row.tsx:149-213`

## Redesign

Replace the inline Keep/Cancel swap with a bottom-sheet `ConfirmDialog` (Drawer). The existing `ConfirmDialog` component in `src/app/prototypes/events/components/ConfirmDialog.tsx` is already generic and uses shadcn Drawer — move it to shared and reuse.

**After (redesign):**
```
┌─────────────────────────────────────────────────────────┐
│  Karl Marx                          [Resend] [Revoke]   │
│  Invited 04 Mar 26                                      │
└─────────────────────────────────────────────────────────┘
                          | click Revoke
                          v
              ┌───────────────────────────┐
              │   Revoke invitation?      │
              │                           │
              │   Karl Marx will no       │
              │   longer be able to       │
              │   accept this invite.     │
              │                           │
              │    [Keep]    [Revoke]     │
              └───────────────────────────┘
                  (bottom-sheet Drawer)
```

Dialog shows partner name dynamically. "Keep" dismisses, "Revoke" executes `cancelInvitation()`. Loading state on Revoke button while API call is in flight.

## Predecessor Sections Superseded

| Section | P459 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Implementation (CancelButton) | Inline confirming state swap with Keep/Cancel buttons | Superseded | ConfirmDialog drawer in this spec |

No other P459 sections are affected — the page layout, data fetching, resend behavior, and visibility logic remain unchanged.

## Requirements

1. Clicking "Revoke" on a pending invitation row opens a ConfirmDialog (bottom-sheet Drawer)
2. Dialog title: "Revoke invitation?"
3. Dialog description includes partner name: "{Name} will no longer be able to accept this invite."
4. "Keep" button dismisses the dialog (no action)
5. "Revoke" button calls `cancelInvitation()`, shows loading state, then removes the row on success
6. Toast messages unchanged: success "Invitation cancelled.", error "Failed to cancel. Try again."

## What Stays the Same

- Data model — no DB changes
- `agreementsService.cancelInvitation()` API — unchanged
- `ResendButton` component — unchanged
- Row layout, partner name display, sub-label — unchanged
- Page-level state management (`onCancelled` callback removing row) — unchanged
- All other agreement pages (create, accept, certificate, terminate) — unchanged

## Surfaces in Scope

**In scope:**
- `src/app/components/agreements/agreement-row.tsx` — rewrite `CancelButton` to use ConfirmDialog
- `src/app/components/shared/confirm-dialog.tsx` — new file (moved from prototypes/events)
- `src/app/prototypes/events/components/ConfirmDialog.tsx` — delete (replaced by shared version)
- `src/app/prototypes/events/components/EventDetail.tsx` — update import path

**Out of scope:**
- `profile-connections-page.tsx` — no changes
- `ResendButton` — no changes
- Any agreement page (create, accept, certificate) — no changes
- `RemovePositionDialog` — separate component, not affected

## Acceptance Criteria

- [ ] Clicking "Revoke" on a pending invitation opens a bottom-sheet Drawer dialog
- [ ] Dialog shows partner name in description
- [ ] "Keep" dismisses the dialog without action
- [ ] "Revoke" in dialog cancels the invitation and removes the row
- [ ] Loading state shown on "Revoke" button during API call
- [ ] Toast messages match current behavior (success/error)
- [ ] Surfaces NOT in scope are visually unchanged
- [ ] All existing tests for P459 still pass
- [ ] Inline Keep/Cancel button swap no longer appears (regression check)

## Test Coverage Strategy

**What's Tested (unit — `src/tests/p481-revoke-confirm-dialog.test.tsx`):**
- Clicking "Revoke" opens a dialog (not inline swap)
- Dialog shows partner name dynamically (partnerDisplayName, partner.name, fallback)
- "Keep" dismisses dialog without API call
- "Revoke" in dialog calls `cancelInvitation()` with correct agreement ID
- `onCancelled` callback fires on success
- Success toast: "Invitation cancelled."
- Error toast on API failure (returns false) and API exception (throws)
- `onCancelled` not called on failure
- Loading state during API call
- Regression: no inline `role="group"` or "Cancel" button in old pattern
- Non-cancelable rows and active agreements don't show Revoke

**What's NOT Tested (and why):**
- ConfirmDialog component internals — it's a generic shared component, already proven in events prototype; tested indirectly via AgreementRow
- Drawer animation/swipe — Vaul library responsibility, not testable in jsdom
- Mobile bottom-sheet rendering — requires real browser (covered by UAT-7)
- ResendButton — unchanged, out of scope for P481
- Page-level state management — `onCancelled` callback tested; parent integration is existing P459 behavior

**Test Pyramid:**
```
     /\
    /  \   0 E2E
   /____\
  / 0 INT \
 /__________\
/ 14 UNIT   \
```

Total: 14 automated unit tests + 7 UAT scenarios
Estimated run time: ~3 seconds

## Next Steps

Run `/spec-review` then `/dev` then `/verify`.
