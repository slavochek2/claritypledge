---
status: today
type: bug
rank: 46877.672
severity: low
workstream: live
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags:
  - session-end
  - realtime
  - live
  - banner
delivery_stage: create-bug
pipeline_ran:
  - create-bug
locked_at: '2026-04-20T09:49:29.481Z'
superseded_by: p769
---

# P764: creator-end propagation to partner is unreliable (stranded /live + stale banner)

## Summary

After the creator ends a session, the partner fails to observe the end reliably. Two symptoms, likely shared root cause:

- **Symptom 1 — stranded on /live:** Partner sits on `/live/{code}` after the creator ends the session. No redirect, no "Session ended" screen. Partner keeps interacting with a dead session. (Screenshot: Apr 18 21-44-14.)
- **Symptom 2 — stale banner after refresh:** Partner left `/live` for `/letters`, creator ends, partner refreshes within the Realtime propagation window. Fresh SELECT reads the row as still-live; `ActiveSessionBanner` renders and persists up to 30s. (Screenshot: Apr 18 21-17-24.)

## Reproduction Steps

**Symptom 1:**
1. Browser A (author) and Browser B (partner) both on `/live/{code}`.
2. A clicks "End Session".
3. B stays on `/live/{code}` — no "Session ended" screen appears (or appears much later than expected).

**Symptom 2:**
1. Same two-party setup; B leaves `/live` for `/letters`.
2. A clicks "End Session".
3. B refreshes `/letters` within ~5s of A ending.
4. B sees `ActiveSessionBanner` re-appear; it persists until the 30s poll or another reload.

Reproduction rate: intermittent (timing-dependent).

## Root Cause (partial — hypotheses refined, not yet confirmed)

What code review in this session **falsified**:

- **Not a `mapSessionFromDb` bug.** `src/app/data/api.ts:793` preserves `live_state` JSON intact (`liveState: dbSession.live_state`). A shared mapping helper is not dropping the `sessionEnded` flag.
- **Not an `isLoading` flash in `ActiveSessionBanner`.** `src/app/contexts/live-session-context.tsx:95` initializes `activeSessionCode` to `null`. The banner renders `null` when `!activeSessionCode` (`active-session-banner.tsx:15`). `activeSessionCode` is only set by `setActiveSession()` inside `validateSession` **after** the DB confirms a live session. There is no render path where the banner flashes before validation completes. Prior spec's "Option A" fix is invalid.
- **Not a subscription-shape bug.** `subscribeToClaritySession` in `api.ts:1208` uses `postgres_changes` UPDATE with full `payload.new` — it receives the entire row, including `live_state`.

Remaining hypothesis (unverified):

- **Creator's `sessionEnded` UPDATE is not delivered to partner's Realtime subscription reliably.** Both symptoms reduce to "partner did not observe the UPDATE". For Symptom 1, /live page's own subscription (`clarity-live-page.tsx:1021`) should flip `sessionEnded` state → render `PartnerLeftScreen` (`clarity-live-page.tsx:3525`). For Symptom 2, after partner leaves `/live`, the fresh mount-SELECT in `getActiveSessionByCode` can race a sub-100ms write and read the row as live.

Both symptoms need live-data reproduction before fix.

## Affected Files (to investigate)

- `src/hooks/use-active-session.ts` — mount validation, 30s polling, Realtime subscription lifecycle
- `src/app/data/api.ts` — `getActiveSessionByCode` (SELECT vs UPDATE race), `subscribeToClaritySession` (delivery reliability)
- `src/app/pages/clarity-live-page.tsx` — subscription + polling on /live; `sessionEnded` state flip; `PartnerLeftScreen` render gate
- `src/app/components/partners/live-mode-view.tsx:277` — "Session ended" title render

## Severity

**Low** — intermittent; self-corrects on next reload or 30s poll. No data loss. But user-visible confusion: partner continues interacting with a dead session (Symptom 1) or sees a ghost banner (Symptom 2).

## Fix Approach (sketch — pending reproduction)

- **Symptom 2:** In `useActiveSession` mount validation, when `getActiveSessionByCode` returns a live session from localStorage hydration, re-read after ~400ms before calling `setActiveSession`. Defeats the sub-100ms SELECT/UPDATE race. Low risk.
- **Symptom 1:** Diagnose why `/live` page's subscription misses the `sessionEnded` UPDATE. Candidates: subscription set up before row exists, subscription lost on tab-background, `postgres_changes` filter mismatch. Needs live instrumentation before proposing a fix.

## Acceptance Criteria

- [ ] Partner on `/live` sees "Session ended" within 3s of creator ending
- [ ] Partner on `/letters` refreshing within 5s of creator ending does NOT see `ActiveSessionBanner` reappear
- [ ] Partner refreshing 15s+ after end sees no banner (existing behavior)
- [ ] Author's UI unaffected
- [ ] No console errors

## Reproduce Blocker (2026-04-18)

`/reproduce` was attempted and stopped at Phase 3 (canary). Blocker:

- `createTwoPartySessionRealistic` (`e2e/helpers/test-session.ts:223`) crashes host `/live` with an error boundary ("Something went wrong") **before** any canary assertion runs. Failure is at `helpers/test-session.ts:282` — the first sanity expect on host page.
- This is a pre-existing two-party E2E infra issue, not something introduced by this work.
- The failing canary (`e2e/p764-reproduce.spec.ts`) was deleted to avoid polluting the suite.

**Next attempt (resume `/reproduce`):**

1. Run `e2e/p666-two-party-infra-proof.spec.ts` first — confirms whether `createTwoPartySessionRealistic` is broken across the board, or just for this session shape.
2. If broken across the board → separate infra bug ticket; use `createTwoPartySession` (simpler helper, pre-inserts both users as joined) for P764 canary.
3. If only broken for a specific setup path → fix the path before writing P764 canary.
4. Canary targets:
   - **Symptom 1:** Guest on `/live/{code}`; write `live_state.sessionEnded: true` via `advanceSessionState`; expect "Session ended" heading within 3s.
   - **Symptom 2:** Guest on `/letters` with active banner visible; write `sessionEnded: true`; reload; expect banner NOT to reappear within 3s.
5. Both must FAIL before any fix is written.
