---
status: week
type: bug
rank: 1000760.0
severity: high
workstream: live
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [session-end, realtime, live, letter-live-overlay]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P762: Session-end state propagation regression + overlay X redundancy

## Summary

Three session-end UX failures surfaced together during P745 visual QA: (1) creator's banner stays visible after clicking "End Session"; (2) partner still sees active /live UI after creator ends the session; (3) `LetterLiveOverlay` renders a redundant ✕ close button alongside the "End Session" banner exit path.

## Root Cause

**Symptom 1 — Creator stale banner:** Three candidate causes, highest-probability first:
- **H1 (Realtime-vs-sync-clear race):** After `clearActiveSession()` wipes React state + localStorage, an in-flight Realtime UPDATE callback in `use-active-session.ts:86-97` fires with a stale pre-end snapshot and calls `setActiveSession(...)`, re-populating state. The current guard (`if (!sessionIdRef.current) return`) checks the ref, not whether the snapshot shows `sessionEnded: true`.
- **H2 (silent UPDATE failure):** `endClaritySession` (api.ts:1173-1200) issues an UPDATE without `.select()` — Supabase returns no error if RLS blocks the write with 0 rows affected. The 30s poll then re-finds the session with `sessionEnded: false` still in DB and rehydrates the banner.
- **H3 (missing key / grace period):** `getActiveSessionByCode` (api.ts:1094-1127) checks `liveState?.sessionEnded === true`; if `live_state = {}` (no key), the result is `undefined` and the session is treated as active.

**Symptom 2 — Partner doesn't see ended state:** `clarity-live-page.tsx:1036-1050` has a Realtime sub on `clarity_sessions` that should flip `setSessionEnded(true)`. Either (a) the sub isn't firing on the partner side (wrong filter/subscription), or (b) the sub fires but a conditional in the render tree blocks the "ended" UI branch.

**Symptom 3 — Redundant overlay X:** `letter-live-overlay.tsx:28-34` renders a top-right `✕` button controlled by an `onClose?` prop. `LiveSessionBanner`'s "End Session" is already the single correct exit path — the X creates a second, divergent exit.

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

- `src/hooks/use-active-session.ts:86-97` — Realtime callback; missing `sessionEnded` guard (H1)
- `src/app/components/session/active-session-banner.tsx:26-46` — `handleEndSession`; errors not surfaced to user (H2 surface)
- `src/app/data/api.ts:1173-1200` — `endClaritySession`; no `.select()` post-write verification (H2)
- `src/app/data/api.ts:1094-1127` — `getActiveSessionByCode`; `live_state` key assumption (H3)
- `src/app/pages/clarity-live-page.tsx:1036-1050` — partner Realtime handler
- `src/app/pages/clarity-live-page.tsx:1213-1230` — partner polling fallback
- `src/app/components/letters/letter-live-overlay.tsx:28-34` — redundant ✕ button
- `src/app/pages/letter-reading-page.tsx` — `onClose` prop passthrough to overlay

## Severity

**High** — session-end is the core exit path from /live; a stale banner and partner stuck in active-session UI breaks the post-session flow for both parties.

## Fix Approach

**Symptom 3 first** (trivial, unblocks morale): delete `letter-live-overlay.tsx:28-34` (✕ button block) and remove the `onClose?` prop from the interface and any parent passing it. Verify no other callers depend on `onClose` via grep first.

**Symptom 1 — Disprove H1 first:** add guard at top of Realtime callback in `use-active-session.ts`: `if (liveState?.sessionEnded === true || liveState?.joinerEnded === true) { clearActiveSession(); return; }`. Stops any stale-snapshot race from repopulating state. If H2 also confirmed: add `.select('id, live_state').single()` to `endClaritySession` and throw (surfaced as toast) if `live_state.sessionEnded !== true` post-write.

**Symptom 2:** Investigate whether the Realtime sub fires on partner side by logging in two browsers and checking WS messages in DevTools. If sub fires but UI doesn't change → trace the `sessionEnded &&` / `sessionEnded ?` render branches. If sub doesn't fire → check subscription filter (may be filtering by creator-id instead of session-id on partner side).

Reference pattern: `src/tests/p743-joiner-banner-stale.test.tsx`.

## Acceptance Criteria

- [ ] Author clicks "End Session" → banner disappears within 1s, no console errors
- [ ] Partner on /live sees "{creatorName} ended the session" message within ~1s of author ending
- [ ] Partner active session UI (story selector, Speak button) is no longer visible after session ends
- [ ] `LetterLiveOverlay` renders no ✕ button; only "End Session" banner exit path exists
- [ ] Clicking "End Session" inside the overlay dismisses the overlay AND ends the session
- [ ] Existing P743 test (`p743-joiner-banner-stale.test.tsx`) still passes after changes
- [ ] Canary test: stale Realtime echo after creator-end does NOT re-populate banner state
- [ ] Canary test: partner Realtime callback sets ended UI with creator name
- [ ] `npm run build` clean, no TypeScript errors
