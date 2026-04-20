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
  test_file: e2e/p765-invite-overlay-realtime.spec.ts
  root_cause: >-
    The realtime INSERT handler in useOpenLiveInvite enriches via a SELECT on
    clarity_sessions for columns that do not exist on that table
    (creator_photo_url, creator_avatar_color, creator_is_pledger). PostgREST
    returns 42703 "column does not exist", session resolves null, and the hook
    bails before dispatch — banner never renders.
  confidence: confirmed
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

**Confirmed — realtime INSERT enrichment SELECT queries columns that do not exist on `clarity_sessions`.**

In `useOpenLiveInvite.ts`, the INSERT handler enriches the incoming `clarity_live_invites` row by selecting from `clarity_sessions`:

```typescript
.from('clarity_sessions')
.select(
  'code, creator_name, creator_photo_url, creator_avatar_color, creator_is_pledger, delivery_id, stories!...(content)',
)
```

`creator_photo_url`, `creator_avatar_color`, and `creator_is_pledger` **are not columns on `clarity_sessions`**. PostgREST returns:

```
{ code: "42703", message: 'column clarity_sessions.creator_photo_url does not exist' }
```

The hook's `.maybeSingle()` resolves with `data: null, error: <42703>`. The handler then hits its `if (!session) return` branch, logs a Sentry warning (in prod only), and bails **before calling `dispatch`**. The overlay never renders.

Force-refresh works because it goes through `getOpenLiveInviteForUser` (in `src/app/data/api.ts`), which uses the correct nested join: `profiles!clarity_sessions_creator_profile_id_fkey(avatar_url, avatar_color, has_pledged)`. The realtime path did not mirror that shape.

**Why this wasn't caught earlier:**
- `src/tests/p745-use-open-live-invite-extension.test.ts` mocks the Supabase client and fabricates a `session` object with the non-existent column names — the mock validates call-shape, not column existence.
- Sentry is prod-only; local UAT failures never surfaced a captured message.

### Disproven hypothesis — LOADED(null) reducer race

An earlier iteration proposed that `inviteReducer`'s `LOADED` action wiped an invite populated by INSERT when a slow initial fetch resolved null afterwards. The reducer guard added in that iteration (commit `b980782c`) is correct defense-in-depth and is retained, but the LOADED(null) race does **not** fire because INSERT never dispatches — the enrichment SELECT fails first.

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

**Primary — realtime enrichment SELECT rewritten to mirror `getOpenLiveInviteForUser`:**

`useOpenLiveInvite`'s INSERT handler now mirrors `getOpenLiveInviteForUser` — nested FK join for avatar fields, and a secondary lookup on `letter_deliveries` for `deliveryId` (since `clarity_sessions.delivery_id` is also not a column):

```typescript
.from('clarity_sessions')
.select(
  'code, creator_name, source_letter_id, ' +
  'profiles!clarity_sessions_creator_profile_id_fkey(avatar_url, avatar_color, has_pledged), ' +
  'stories!clarity_sessions_source_story_id_fkey(content)',
)
.eq('id', sessionId)
.maybeSingle()

// then, if source_letter_id present:
.from('letter_deliveries')
.select('id')
.eq('letter_id', sourceLetterId)
.eq('receiver_profile_id', userId)
.order('created_at', { ascending: false })
.limit(1)
```

Dispatch payload reads from the joined `profiles` object (normalized for array-or-object PostgREST shape) and from the secondary deliveries lookup:

```typescript
const profile = Array.isArray(session.profiles) ? session.profiles[0] : session.profiles;
// ...
inviterPhotoUrl: profile?.avatar_url ?? null,
inviterAvatarColor: profile?.avatar_color ?? null,
inviterIsPledger: profile?.has_pledged ?? false,
deliveryId,  // from letter_deliveries lookup
```

Columns `profiles.avatar_url`, `profiles.avatar_color`, and `profiles.has_pledged` exist and are the canonical source used by the RPCs introduced in P697, P725, and the working `getOpenLiveInviteForUser` path.

**Defense-in-depth — reducer guard + RESET action (retained from prior iteration):**

- `inviteReducer`'s LOADED(null) no longer wipes a populated invite — prevents a theoretical stale-fetch race from ever mattering once INSERT is dispatching correctly.
- Sign-out path dispatches `RESET` instead of `LOADED(null)` — unconditional clear with no guard interference.

**Sentry observability retained:** the enrichment-bail branch still records a Sentry warning (now with the PostgREST error message attached) so a future column/RLS regression surfaces in prod immediately rather than silently breaking the overlay.

**Test mock fixed:** `src/tests/p745-use-open-live-invite-extension.test.ts` previously fabricated `session.creator_photo_url` / `creator_avatar_color` / `creator_is_pledger` — the exact shape that cannot exist in the real DB. It now mocks the nested `profiles: { avatar_url, avatar_color, has_pledged }` shape, matching the real query response.

## Acceptance Criteria

- [x] Partner is on letter reading page; author starts session → overlay appears within ~2s, no refresh needed *(covered by `e2e/p765-invite-overlay-realtime.spec.ts`)*
- [x] Overlay appears even if author started session within 1s of partner loading the page *(seeded invite arrives after navigation; test asserts banner visible in realtime)*
- [x] No console errors during the invite delivery flow *(enrichment no longer emits 42703)*
- [ ] Force-refresh still works as fallback (no regression) *(two-party UAT — `getOpenLiveInviteForUser` is unchanged)*
- [x] Regression test: `e2e/p765-invite-overlay-realtime.spec.ts` passes — asserts both banner text (dispatch reached) and avatar color rgb(162, 28, 175) (nested profiles join populated)
- [x] Regression test: `src/tests/p765-invite-overlay-realtime.test.ts` — reducer LOADED-guard defense-in-depth still green
- [x] Regression test: `src/tests/p745-use-open-live-invite-extension.test.ts` — mock rewritten to nested profiles shape; extended interface fields still populated on INSERT
