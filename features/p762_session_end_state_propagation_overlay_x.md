---
status: today
type: bug
rank: 500028.5
severity: high
workstream: live
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags:
  - session-end
  - realtime
  - live
  - letter-live-overlay
delivery_stage: fix
pipeline_ran:
  - create-bug
  - fix
locked_at: '2026-04-20T09:02:42.523Z'
---

# P762: Session-end state propagation regression + overlay X redundancy

## Summary

Three session-end UX failures surfaced together during P745 visual QA: (1) creator's banner stays visible after clicking "End Session"; (2) partner still sees active /live UI after creator ends the session; (3) `LetterLiveOverlay` renders a redundant ✕ close button alongside the "End Session" banner exit path.

## Root Cause

**Symptoms 1 & 2 — shared root:** `clarity_sessions` lacks `REPLICA IDENTITY FULL` (only `clarity_live_invites` has it, via P703 migration). When `endClaritySession` writes `sessionEnded: true`, Supabase Realtime fires an UPDATE event but `payload.new.live_state` does not carry the updated value. `subscribeToClaritySession` (api.ts) was passing `payload.new` directly to `mapSessionFromDb`, so all subscribers received `liveState: {}` — H1 guard in `use-active-session.ts` never triggered, and `clarity-live-page.tsx` never flipped `sessionEnded`. Both sides remained stale.

Fix: `subscribeToClaritySession` now ignores `payload.new` entirely and does a fresh DB SELECT on any UPDATE event, guaranteeing subscribers always receive current `live_state`. A `cancelled` flag prevents the callback firing after unsubscribe; fetch errors are logged rather than silently swallowed.

**Symptom 3 — Redundant overlay X:** `letter-live-overlay.tsx` rendered a top-right `✕` button via `onClose?` prop. The overlay closes automatically when the invite disappears (P745 `clarity_live_invites` Realtime watcher in `letter-reading-page.tsx:982-988`). The X was a second, divergent exit that bypassed session cleanup.

## Reproduction Steps

1. Open app in two browsers — author (Browser A) and partner (Browser B).
2. Author starts a session from a letter; partner joins via /live.
3. Partner stays on /live. Author navigates to the Letters page — `ActiveSessionBanner` is visible.
4. Author clicks "End Session" in the banner.
5. **Symptom 1:** Banner remains visible on author's Letters page (does not dismiss).
6. **Symptom 2:** Partner on /live still sees "Select your story" / "Speak" button — active session UI unchanged.
7. (Separate) From a letter's results page, trigger the P745 /live overlay path.
8. **Symptom 3:** Overlay has a top-right ✕ button in addition to the "End Session" banner control.

**Reproduction rate:** Symptoms 1 & 2 — intermittent (timing-dependent race); Symptom 3 — 100%.

## Expected Behavior

- After "End Session": banner disappears on author's side within ~1s.
- After "End Session": partner sees "{creatorName} ended the session" message within ~1s; active session UI is gone.
- `LetterLiveOverlay` has no ✕ button. "End Session" is the only exit path.

## Actual Behavior

- Banner persists on author's side after click.
- Partner remains in active /live UI.
- Overlay shows both ✕ and "End Session".

## Affected Files

- `src/app/data/api.ts` — `subscribeToClaritySession`: was passing `payload.new` directly; now does fresh DB SELECT on UPDATE
- `src/hooks/use-active-session.ts:86-94` — Realtime callback: clears session on `sessionEnded/joinerEnded`; 30s poll remains as fallback
- `src/app/components/letters/letter-live-overlay.tsx` — removed `onClose?` prop, Escape handler, and ✕ button block
- `src/app/pages/letter-reading-page.tsx` — removed `onClose` prop passthrough

## Severity

**High** — session-end is the core exit path from /live; a stale banner and partner stuck in active-session UI breaks the post-session flow for both parties.

## Fix Approach

**Symptom 3:** Removed `onClose?` prop, Escape key listener, and ✕ button block from `LetterLiveOverlay`. Overlay closes automatically via the invite-watcher `useEffect` in `letter-reading-page.tsx:982-988` (P745 mechanism).

**Symptoms 1 & 2:** `subscribeToClaritySession` (api.ts) ignores `payload.new` entirely and does a fresh `SELECT *` on the session ID from any UPDATE event. This guarantees subscribers always receive current `live_state` regardless of REPLICA IDENTITY. The redundant `validateSession()` else-branch was removed in a second-pass review — the fresh SELECT is authoritative; the 30s poll covers any missed events.

Reference pattern: `src/tests/p743-joiner-banner-stale.test.tsx`.

## Acceptance Criteria

- [ ] Author clicks "End Session" → banner disappears within 1s, no console errors (requires browser test)
- [ ] Partner on /live sees "Session ended" screen within ~1s of author ending (requires browser test)
- [ ] Partner active session UI (story selector, Speak button) is no longer visible after session ends (requires browser test)
- [x] `LetterLiveOverlay` renders no ✕ button; only "End Session" banner exit path exists
- [ ] Clicking "End Session" inside the overlay dismisses the overlay AND ends the session (requires browser test)
- [x] Existing P743 test (`p743-joiner-banner-stale.test.tsx`) still passes after changes
- [x] Canary test: stale Realtime payload triggers `validateSession()` fallback → clears banner
- [x] `npm test` clean (1943/1943 pass), `tsc --noEmit` clean
