---
status: in-progress
type: bug
rank: 31251.781
severity: high
workstream: live
date_reported: '2026-04-20'
created_date: '2026-04-20'
tags:
  - realtime
  - live
  - invite
  - letter-reading
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p765-invite-overlay-realtime.test.ts
  root_cause: >-
    inviteReducer LOADED action unconditionally replaces invite — when the slow
    initial fetch resolves null after INSERT dispatch, it wipes the invite and
    overlay disappears. Secondary: clarity_sessions secondary fetch returns null
    silently (H-B) with no Sentry log or retry.
  confidence: high
  surfaces_in_scope:
    - letter-reading-page
  surfaces_deferred: []
  reproduced_at: '2026-04-20'
locked_at: '2026-04-20T09:44:01.138Z'
---

# P765: Live invite overlay does not appear via Realtime on partner's letter reading page

## Summary

When the author starts a /live session, the partner's letter reading page does not show the join overlay automatically — the overlay only appears after a manual force-refresh.

## Root Cause

**Confirmed primary cause — LOADED(null) race in `inviteReducer`:**

`inviteReducer`'s `LOADED` action (line 44) unconditionally replaces `invite` with `action.payload`:

```typescript
case 'LOADED':
  return { invite: action.payload, loading: false };
```

Race sequence (reproduces ~100% when author starts within ~1s of page load):
1. `useOpenLiveInvite` mounts → initial fetch fires (`getOpenLiveInviteForUser`, async) → handler registered
2. Author starts session → INSERT fires → INSERT handler fires → secondary `clarity_sessions` SELECT → INSERT dispatch → `state.invite = invite` (overlay appears)
3. Initial fetch resolves (it was sent before the invite existed → returns null) → LOADED(null) → `state.invite = null` → overlay disappears silently

Force-refresh works because the initial fetch runs fresh after the invite is in DB, so LOADED(invite) applies correctly.

**Confirmed secondary cause — H-B, silent failure in secondary fetch:**

In the INSERT handler (`useOpenLiveInvite.ts`, line 115-116), if the secondary `clarity_sessions` SELECT returns null (network hiccup, RLS mismatch, or transaction timing), the code silently returns with no Sentry log, no retry, and no dispatch. Overlay never appears.

Observed: invite IS in DB immediately after session start (force-refresh confirms) — so the invite creation is not the issue.

## Reproduction Steps

1. Open app in two browsers — author (Browser A, verified), partner (Browser B, verified)
2. Partner opens a letter on their reading page (`/letters/[id]` or via delivery URL)
3. Wait for letter reading page to fully load (ensures hook is mounted)
4. Author navigates to `/live/[code]` (or starts session from letter results page)
5. Author sees "Waiting for [partner]..." — invite created in DB
6. **Observe on Browser B:** No overlay appears on partner's letter reading page
7. Partner force-refreshes page → overlay appears immediately

**Reproduction rate:** Intermittent — occurs when INSERT fires during a timing window; 100% if author starts session within ~1s of partner loading the page.

## Expected Behavior

Within ~1s of author starting the session, the partner's letter reading page shows the join overlay ("Vyacheslav Ladischenski is inviting you to Clarity" with a Join button) without any manual refresh.

## Actual Behavior

No overlay appears. Partner must force-refresh to see the invite.

## Affected Files

- `src/app/hooks/useOpenLiveInvite.ts` — INSERT callback (line 100-137): handler registration race vs. shared channel; secondary clarity_sessions fetch may return null silently
- `src/app/data/api.ts` — `subscribeToLiveInvites` (line 4028): multiplexed channel registry; handlers array populated after channel already SUBSCRIBED

## Severity

**High** — partner cannot join a /live session without refreshing; breaks the seamless real-time invite delivery that is central to the /live flow.

## Fix Applied

**Primary (`inviteReducer` LOADED guard):** LOADED(null) no longer wipes a populated invite. When `state.invite !== null` and `action.payload === null`, the reducer keeps the invite and just clears `loading`. Non-null LOADED payloads still apply. Revocation is unaffected — it flows via UPDATE (closed_at set) or DELETE, not LOADED.

**Structural reset (`RESET` action):** Sign-out path (`!user`) now dispatches `RESET` instead of `LOADED(null)` — unconditional clear. LOADED and RESET are decoupled: the LOADED guard preserves invite across race, RESET always clears. Sign-out cannot trigger the race (no invite for a signed-out user).

**Secondary (H-B — silent enrichment failure):** `INSERT` handler's secondary `clarity_sessions` SELECT now emits Sentry warnings when `!session` or `!session.code`, instead of silently returning. Surfaces the failure mode if RLS/timing regresses.

## Acceptance Criteria

- [ ] Partner is on letter reading page; author starts session → overlay appears within ~2s, no refresh needed *(two-party UAT)*
- [ ] Overlay appears even if author started session within 1s of partner loading the page *(two-party UAT)*
- [ ] No console errors during the invite delivery flow *(two-party UAT)*
- [ ] Force-refresh still works as fallback (no regression) *(two-party UAT)*
- [x] Regression test: `src/tests/p765-invite-overlay-realtime.test.ts` passes (4 cases: INSERT→LOADED(null) race, normal mount, empty LOADED(null), RESET on sign-out)
