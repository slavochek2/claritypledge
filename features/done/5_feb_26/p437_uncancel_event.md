---
status: all-done
type: feature
rank: 125469
workstream: E1
created_date: 2026-02-25T00:00:00.000Z
tags:
  - events
uat_file: features/uat/p437.md
test_files:
  - src/tests/uncancel-event-service.test.ts
  - e2e/p437-uncancel-event.spec.ts
  - e2e/a11y/p437-accessibility.spec.ts
locked_at: '2026-02-26T04:17:07.517Z'
---

# P437: Uncancel Event

## Problem

When a host cancels an event and wants to reinstate it, there's no UI action. They must do it via a DB patch. Attendees who received the cancellation email get no re-announcement. The gap exists because `cancelEvent()` fires an email but there's no matching `uncancelEvent()` flow.

## Solution

Add an "Uncancel Event" button inside the red cancellation banner (host-only). Clicking opens a confirm dialog. On confirm: status → `upcoming`, edge function sends re-announcement email to all attendees.

## UX Design

**State: cancelled + isHost — button added to existing banner**
```
┌─────────────────────────────────────────────────────┐
│ 🚫  This event has been cancelled                    │
│     You cancelled this event. Attendees have         │
│     been notified.                                   │
│                                                      │
│                        [↩ Uncancel Event]            │
└─────────────────────────────────────────────────────┘
```

**Confirm dialog**
```
┌──────────────────────────────────────┐
│ Reinstate this event?                │
│                                      │
│ All attendees will receive a         │
│ re-announcement email with the       │
│ current event details.               │
│                                      │
│  [Keep Cancelled]   [Yes, Uncancel]  │
└──────────────────────────────────────┘
```

**After success:**
- Toast: "Event is back on — attendees notified"
- Red cancellation banner removed
- Blue host controls bar (Edit + Cancel) reappears
- Status reflects `upcoming`

**Constraint:** Block uncancel if event datetime is in the past (no point reinstating a past event — button should not appear for `isPast && isCancelled`).

## Technical Notes

**Files to change:**

1. `src/lib/event-emails.ts` — add `'uncancel'` to `EmailAction` type
2. `src/app/data/events-service.interface.ts` — add `uncancelEvent(eventId: string): Promise<boolean>`
3. `src/app/data/events-service-real.ts` — implement `uncancelEvent()` mirroring `cancelEvent()` pattern; sets `status: 'upcoming'`, calls `invokeEventEmails('uncancel', eventId)`
4. `src/app/data/events-service-mock.ts` — stub implementation
5. `supabase/functions/send-event-emails/index.ts` — add `'uncancel'` handler: re-announcement email to all attendees with current event date/location
6. `src/app/prototypes/events/components/EventDetail.tsx` — add Uncancel button inside the `isCancelled` banner (host-only), confirm dialog, handler

**Pattern reference:** Mirror the existing `cancelEvent` / `confirmCancelEvent` flow exactly in reverse.

## Acceptance Criteria

- [x] Uncancel button appears in cancellation banner when `isHost && isCancelled && !isPast`
- [x] Button does NOT appear for past cancelled events
- [x] Confirm dialog matches copy above
- [x] On confirm: event status → `upcoming` in DB
- [x] On confirm: re-announcement email sent to all attendees via edge function
- [x] On success: red banner gone, blue host controls reappear, toast shown
- [x] On failure: toast error, event state unchanged
- [x] Edge function handles `'uncancel'` action without error

## Testing

- Unit: `uncancelEvent()` service method (mirrors existing `cancelEvent` tests)
- Edge function: `uncancel` action sends email to attendees
- UI: button visibility conditions (host + cancelled + not past)
- UI: confirm dialog flow (cancel = no change, confirm = success path)

## Test Coverage Strategy

**What's Tested:**
- ✅ `uncancelEvent()` service (unit) — mirrors `cancelEvent` tests: auth check, host check, DB error, status value
- ✅ Button visibility (E2E) — host/non-host/anon/past-event conditions
- ✅ Confirm dialog (E2E) — open, dismiss (Keep Cancelled), dismiss (Escape), confirm
- ✅ Success path (E2E) — banner gone, host controls reappear, toast
- ✅ Keyboard accessible (a11y) — Tab to button, Enter to open, Escape to dismiss, focus trap
- ✅ Smoke — cancelled page loads without errors, Uncancel button present

**What's NOT Tested (rationale):**
- ❌ Edge function email delivery — fire-and-forget; email integration tested manually via UAT-3.3
- ❌ `cancelEvent` regression — covered by existing tests; not changed
- ❌ DB RLS for update — same RLS as `cancelEvent` (host_id match); already validated

**Test Pyramid:**
```
       /\
      /  \   6 E2E tests (flows + conditions)
     /    \
    / 4 A11Y\
   /----------\
  /  1 SMOKE   \
 /--------------\
/ 5 UNIT         \
```

**Files generated:**
- `src/tests/uncancel-event-service.test.ts` (5 unit tests)
- `e2e/p437-uncancel-event.spec.ts` (6 E2E tests)
- `e2e/p437-smoke.spec.ts` (1 smoke test)
- `e2e/a11y/p437-accessibility.spec.ts` (4 a11y tests)
- `features/uat/p437.md` (4 UAT scenarios, 11 sub-scenarios)

**Total:** 16 automated tests + 11 UAT scenarios
