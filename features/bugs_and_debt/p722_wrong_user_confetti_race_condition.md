---
id: P722
title: Wrong user sees confetti (completed state) when clicking expired magic link
type: bug
status: qa
delivery_stage: fix
pipeline_plan: [reproduce, fix]
pipeline_ran: [reproduce, fix]
tags: [auth, letters, race-condition]
rank: 1
reproduce_artifact:
  test_file: src/tests/p722-reproduce.test.tsx
  root_cause: "P695 completion shortcut (line 322) has no currentUser guard — anon/race user with currentUser=null skips P717 email guard and hits the status='completed' check directly, setting viewState='complete' and showing confetti"
  confidence: high
  scenarios_in_scope: [scenario-3-race-null-user, scenario-4-anon-unverified]
  scenarios_deferred: []
  reproduced_at: 2026-04-16
---

## Problem

When user A is logged in and clicks an email link meant for user B, where the link
contains an **expired Supabase OTP** (magic link token), they see the letter's
confetti completion screen instead of the "This link is for a different account —
Sign out" page. Clicking the "See Your Letter Summary" button then redirects them
to login.

Intermittent: occurs when Supabase fires a transient SIGNED_OUT event during the
failed OTP redirect, briefly clearing `currentUser` before recovering. Timing-
dependent — does not always fire.

## Context: Relationship to P717

P717 fixed the original wrong-user bug by adding `receiver_email` to the
`get_letter_for_reading` RPC. That fix works when auth is fully settled. This is
a separate, new failure mode triggered by the expired magic link OTP URL hash.
P717 is `status: qa` — do not reopen it.

## Reproduction Steps (observed 2026-04-16)

Exact sequence from screenshots:

1. User is logged in as `slavochek@googlemail.com` (the letter sender).
2. A letter was previously sent to `test-recipient@googlemail.com` (test recipient).
   The recipient's delivery has `status: completed` (they read it before).
3. User opens Gmail, sees email: "Vyacheslav Ladischenski sent you a Clarity Letter"
   — this email contains a Supabase magic link for test-recipient.
4. User clicks "Open the Letter" in the email.
5. Browser hits Supabase auth endpoint. OTP is expired → Supabase returns
   `error=access_denied&error_code=otp_expired`.
6. Supabase redirects to the letter page URL with the error appended as a hash:
   `/letter/<deliveryId>?token=<invitationToken>#error=access_denied&error_code=otp_expir...`
7. **Expected:** "This link is for a different account — Sign out" screen.
8. **Actual:** Confetti "You've completed it. 8 stories read." with "See Your Letter
   Summary" button. Clicking it redirects to login (user was signed out).

## Root Cause Hypothesis

**Primary (high confidence):** The `#error=access_denied` hash from the failed
Supabase magic link auth triggers a transient `SIGNED_OUT` event on
`onAuthStateChange` in `AuthContext.tsx`. `AuthContext` clears `user` immediately
(`setUser(null)`). The load effect in `letter-reading-page.tsx` has `sessionChecked`
already `true` from the initial `getSession()` call, so the gate does not block.
The load fires with `currentUser = null`.

In the anon token path (lines 270–338 of `letter-reading-page.tsx`), the email
guard at line 292 is:
```typescript
if (currentUser && readData.delivery?.receiver_email) { ... }
```
`currentUser` is null → guard **skipped entirely**. Code hits line 322:
```typescript
if (readData.delivery?.status === 'completed') {
    setSafe('ready');
    if (!cancelled) setViewState('complete');
    return;
}
```
Delivery was completed by test-recipient → shows confetti. After auth recovers
(`SIGNED_IN` re-fires), the `pageStateRef` guard at line 136 prevents a reload
(`'ready'` already set) — confetti sticks.

**Secondary (should also fix):** Even without the race, an anon user should never
see a completed delivery's confetti for a 1-to-1 letter — they haven't been verified
as the intended recipient.

## Scenario Audit (Track B — all paths to "wrong user sees letter content")

Per the new /reproduce Phase 2b Scenario Audit:

```
Scenario 1: Wrong user, receiver_email set, auth settled
  → email guard fires (line 292) ✓  [fixed by P717]

Scenario 2: Wrong user, receiver_email null (legacy deliveries)
  → email guard skipped (null check) — P717 migration covers new deliveries
  → may affect old rows: investigate during /reproduce

Scenario 3: Wrong user, auth briefly null (race condition — THIS BUG)
  → email guard skipped (currentUser null check)
  → delivery.status='completed' → confetti shown ✗

Scenario 4: Correct user (anon, never verified), delivery completed
  → same code path as Scenario 3 — also sees confetti with no auth check ✗
```

Scenarios 3 and 4 are in scope for this ticket. Scenario 2 (legacy null rows)
needs investigation during /reproduce — may need a migration or can be deferred.

## Affected Files

- `src/app/pages/letter-reading-page.tsx`
  - Lines 292–299: email guard (requires `currentUser` — skipped when anon)
  - Lines 322–326: P695 "skip to completion" (no auth check — shows confetti for anon)
  - Lines 101–121: `magicLinkProcessing` guard (only handles `access_token=` hash,
    not `error=` hash)
- `src/auth/AuthContext.tsx`
  - Lines 78–87: `onAuthStateChange` — clears user immediately on SIGNED_OUT

## Proposed Fix Direction

Two complementary changes (confirm during /fix):

**Fix A (primary):** Add `currentUser` guard to the P695 completion shortcut in
the token path. An anon or wrong user should never skip to completed state:
```typescript
// Before (line 322):
if (readData.delivery?.status === 'completed') {

// After:
if (currentUser && readData.delivery?.status === 'completed') {
```

**Fix B (belt-and-suspenders):** Treat `#error=access_denied` in URL hash same as
`magicLinkProcessing` — block the load until the hash is cleared and auth has
settled. Prevents the race window entirely. Simpler cleanup: just strip the error
hash on mount without blocking (since auth should recover on its own).

Validate during /reproduce which fix is sufficient and whether both are needed.

## Root Cause (Confirmed)

`getLetterForReadingByToken` returns data for the delivery. At line 292 of `letter-reading-page.tsx`, the P717 email guard is `if (currentUser && readData.delivery?.receiver_email)` — when `currentUser` is null (transient SIGNED_OUT race), this guard is skipped entirely. Code then hits line 322: `if (readData.delivery?.status === 'completed')` which has no `currentUser` check — sets `pageState='ready'` and `viewState='complete'`, causing `LetterCompletionSummary` (confetti) to render.

The fix is a one-line change: add `currentUser &&` to line 322.

## Branch

Feature branch: `feature/letters-ship` (worktree w2)
This bug exists on the branch. Canary test should be added to this branch.
Run /reproduce from w2 or create a new worktree off `feature/letters-ship`.

## Canary Test Guidance

Auth/flow bug → integration test in `src/tests/p722-reproduce.test.ts`.

The test must simulate the race: render `LetterReadingPage` with `currentUser=null`
(simulating the brief signed-out window) + `token` present + a completed delivery
(mock `getLetterForReadingByToken` returning `status: 'completed'`). Assert that
`pageState` becomes `wrong_user` or `unauthenticated`, NOT that `viewState` becomes
`complete`.

Existing test file to reference:
`src/tests/p717-wrong-user-token-guard.test.tsx` — uses the same test infrastructure.

## Done-When

- [x] Canary test FAILS before fix (proves race condition reproduces in test)
- [x] Fix applied — canary test passes
- [x] Scenario 3 (race): wrong user with `currentUser=null` on load never sees `complete` view
- [x] Scenario 4 (anon unverified): anon user landing on completed 1-to-1 delivery
  never sees `complete` view
- [x] Scenario 1 (P717 settled-auth fix) still passes — no regression
- [x] Browser verified: N/A — race only triggered by real expired OTP hash; covered by canary tests

## Resolution

**Fixed:** 2026-04-16
**Root cause:** P695 completion shortcut at `letter-reading-page.tsx:322` had no `currentUser` guard — `if (readData.delivery?.status === 'completed')` fired for any user including `currentUser=null` (transient SIGNED_OUT race from expired OTP hash), showing confetti to unverified users.
**Fix:** Added `currentUser &&` guard to line 322: `if (currentUser && readData.delivery?.status === 'completed')`.
**Files changed:** `src/app/pages/letter-reading-page.tsx` (1 line + comment)
**Regression test:** `src/tests/p722-reproduce.test.tsx` (3 scenarios, all green)
