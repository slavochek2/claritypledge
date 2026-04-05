---
status: in-progress
type: bug
rank: 1
chain_root: p617
tags:
  - live
  - ux
created_date: 2026-04-04T00:00:00.000Z
---

# P643: /live — Speaker's Speak Click Doesn't Open Drawer (Cascading 3-Bug Chain)

## Problem

Speaker clicks Speak → nothing happens. They see the Speak button again instead of the rating drawer. Has to click twice. This is the root bug — it causes two downstream failures.

### The 3 bugs (one causal chain)

**Bug 1 (root): Speaker clicks Speak → sees Speak button again instead of drawer.**
Speaker clicks Speak once, should immediately see the rating drawer (1-10 scale). Instead sees a redundant Speak button — has to click twice. This is a local state problem: `handleStartCheck` guard silently rejects the first click, so `isLocallyRating` is never set to true and the drawer never opens.

**Bug 2 (downstream): Listener's mode switcher stays enabled instead of disabling.**
When speaker clicks Speak, listener's mode switcher should show DISABLED (grayed out, tooltip "Mode locked — your partner is rating"). Instead it stays fully clickable. Because bug 1 means the speaker never picks a number, `ratingInitiatedBy` is never written to DB, so the listener never receives the signal to disable.

**Bug 3 (downstream): Listener enters round too early — sees story card before speaker submits.**
Listener should see NO change when speaker clicks Speak (except mode switcher disabling per bug 2). Story card + rating drawer appear ONLY after speaker submits a number from the drawer. Instead the listener sees the story card immediately on the Speak click — before the speaker has even opened their drawer.

### Why it's one chain

Fix bug 1 (drawer opens on first click) → speaker picks a number → `ratingInitiatedBy` written to DB → listener receives signal → bug 2 resolves (switcher disables) → listener transitions only after speaker submits → bug 3 resolves.

### P646 name collision: real fix, NOT the root cause

Code on w1 fixes name-string identity (`04517305`, `3aad2b6d`). But bugs persist with different names — confirmed by founder testing with a guest entering a different name. P646 is a valid fix that ships with this spec, but it does not resolve bugs 1-3.

### Why 7 sessions failed + why agents can't see the bug

1. **The two-party E2E test has a broken import and has never run.** `e2e/p617-mode-switcher-lifecycle.spec.ts` imports from `../src/lib/supabase-admin` (old path). P644 moved the module to `e2e/helpers/supabase-admin`. The test silently fails to load — Playwright reports "No tests found." The "1601 tests pass" count is unit tests only.
2. **No P643-specific E2E test exists.** P644 built helpers (`createTwoPartySession`, `waitForUIUpdate`) but they were never pointed at the 3 bugs.
3. **Each session treated it as a logic bug.** Agents fixed `getViewState()` (pure function, already correct). The pure function is correct — the inputs don't arrive or the guard blocks them.

## What's already done on w1 (branch `feature/p617-mode-switcher-lifecycle`)

- `getViewState()` extracted and unit-tested (P617, P638)
- Mode switcher IIFE folded into `getViewState()` (P638)
- Name collision identity fix (P646)
- `ratingInitiatedBy` passthrough during in-flight writes (P643 commit)
- 20 commits, 1712 insertions across 13 files
- 1601 unit tests passing
- P644 test helpers merged from main
- **Broken:** `e2e/p617-mode-switcher-lifecycle.spec.ts` import path — never ran

## First step: reproduce, don't theorize

Fix the broken import. Run the E2E test. If it passes → the test doesn't catch the bug (write a better one). If it fails → we have a reproduction and can debug from there.

Do NOT read more code or form hypotheses before running the test.

## Acceptance Criteria

- [ ] Speaker clicks Speak ONCE → drawer opens immediately (no redundant Speak button)
- [ ] Listener's mode switcher shows DISABLED (grayed, tooltip) when speaker clicks Speak — not hidden, not enabled
- [ ] Listener sees NO story card until speaker submits a number from the drawer
- [ ] All 3 verified via two-party E2E test using `waitForUIUpdate()` (no `page.reload()`)
- [ ] All 3 verified in two-browser manual UAT
- [ ] Name collision (P646): two users with same display name don't break identity checks

## Risks / Non-Goals

- Do NOT rewrite the component as a state machine (deferred — too expensive for a bug fix)
- Do NOT fix `updateInFlightRef` event dropping unless required to pass ACs — if ACs pass without it, ship and file separately
- Do NOT theorize about code paths before running the E2E test — reproduce first

## References

- **Root cause analysis:** `.private/thinking/t010_p617_systemic_failure.md`
- **Test infrastructure:** P644 (done), P637 (done), P636 (done)
- **Superseded specs:** P614, P617, P626 (rejected), P638, P646 — all rejected, consolidated here
- **Key files:** `src/app/pages/clarity-live-page.tsx`, `src/app/components/partners/live-mode-view.tsx`
- **Branch:** `feature/p617-mode-switcher-lifecycle` (w1)
