---
status: qa
type: bug
rank: 1000740.0
severity: high
workstream: letters
date_reported: '2026-04-17'
created_date: '2026-04-17'
tags: [letters, live, invite, session-exit]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P740: Joiner-leave does not close letter-sourced invite

## Summary

When the joiner of a letter-sourced `/live` session exits, the `clarity_live_invites` row is never closed — leaving three UI surfaces stuck in an active-invite state: the recipient's inbox shows the "invited you to verify…" row with a Join button, the author's letter-results shows Return to Session + End Session buttons, and the author's `/live` view shows "Your partner has left" instead of an ended state.

## Root Cause

The exit handler in `clarity-live-page.tsx` has an `if (isCreator) { … } else { … }` branch. The creator-leave branch calls `completeClaritySession(session.id)`, which sets `closed_at` on the invite row. The joiner-leave `else` branch only calls `clearSessionJoiner(session.id)` — it never calls `completeClaritySession`. All three surfaces read from `closed_at IS NULL`, so they never converge on the ended state until the author manually clicks "End Session".

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — lines 3281-3284, joiner-leave `else` branch missing `completeClaritySession` call
- `src/app/hooks/useOpenLiveInvite.ts` — lines 46-49, clears invite only when `closed_at` is set (correct, upstream fix needed)
- `src/app/data/api.ts` — lines 4108-4113, `getOpenInviteForSender` filters by `closed_at IS NULL` (correct, upstream fix needed)
- `src/app/components/letters/inbox-tab.tsx` — line 135, gates invite row on `!openInvite.closedAt` (correct, upstream fix needed)

## Reproduction Steps

1. Log in as author (User A). Create a letter and send it to a recipient (User B).
2. User B opens the letter and clicks "Join" on the live-invite row in their inbox — a letter-sourced `/live` session starts.
3. User B (joiner) clicks "Leave" / exits the session.
4. Observe User B's inbox: the "invited you to verify…" row with Join button is still visible.
5. Observe User A's letter-results page: "Return to Session" and "End Session" buttons are still visible.
6. Observe User A's `/live` view: shows "Your partner has left" (not "Session ended").

**Reproduction rate:** 100%

## Expected Behavior

When the joiner exits, `completeClaritySession` is called (same as creator-leave). `closed_at` is set on the invite row. All three surfaces automatically converge: inbox invite row disappears, letter-results buttons disappear, `/live` view shows "Session ended".

## Actual Behavior

`closed_at` remains NULL. All three surfaces stay stuck in active-invite state. The author must manually click "End Session" to close the invite — there is no prompt or indication that this is required.

## Severity

**High** — three separate UI surfaces show incorrect state after every joiner-exit from a letter-sourced session. The author has no clear path to recovery without clicking "End Session" themselves.

## Fix Approach

In the joiner-leave `else` branch of the exit handler, add a `completeClaritySession(session.id)` call guarded by `session.targetListenerId` (so non-letter sessions — which have no invite row — are unaffected):

```tsx
} else {
  await clearSessionJoiner(session.id);
  if (session.targetListenerId) {
    await completeClaritySession(session.id).catch((err) => {
      console.error('[P740] completeClaritySession failed on joiner exit:', err);
    });
  }
}
```

`completeClaritySession` is already imported at line 40. No schema changes needed — the RPC already authorizes the joiner (`auth.uid() == joiner_profile_id`, per migration `20260415130000_p703_complete_session_closes_invites.sql:19-31`).

## Acceptance Criteria

- [x] After joiner exits a letter-sourced session, the invite row disappears from the recipient's inbox without page reload
- [x] After joiner exits, the author's letter-results page no longer shows "Return to Session" or "End Session"
- [x] After joiner exits, the author's `/live` view shows "X has left" — this is correct UX (partner left, not a creator-ended session); `sessionEnded` flips via `live_state.joinerEnded` set by `clearSessionJoiner`, not by this fix
- [x] Non-letter-sourced sessions (no `targetListenerId`) are unaffected — `completeClaritySession` is NOT called
- [x] Creator-leave behavior is unchanged (regression guard)
- [x] Canary test passes: `src/tests/p740-joiner-leave-closes-invite.test.tsx`
- [x] No console errors during joiner-exit flow
