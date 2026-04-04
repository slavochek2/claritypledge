---
status: today
type: bug
rank: 2
blocked_by: p644
chain_root: p617
tags:
  - live
  - ux
  - p617
  - p638
created_date: 2026-04-04T00:00:00.000Z
---

# P643: /live Mode Switcher + Drawer — 4 User-Visible Bugs (5 Sessions, Tests Pass, Feature Broken)

## Problem

Four bugs persist in the /live session despite 5 implementation sessions (P617, P626, P638) and 1400+ passing tests. Manual UAT consistently shows the same failures. Tests pass because they test a different delivery path than real browsers use.

### The 4 bugs (from user-annotated screenshots)

1. **Mode switcher DISAPPEARS** when partner clicks Speak — should DISABLE (gray + tooltip "Mode locked — your partner is rating"), not vanish entirely
2. **Partner sees redundant Speak button** after speaker submits — should get auto-drawer (rating buttons), no extra click needed
3. **No visual feedback** that mode is locked while speaker is rating — mode switcher just vanishes, no explanation
4. **Listener enters "round" too early** — sees story card before speaker has picked a number in the drawer. Story card should only appear after speaker submits.

### Why tests don't catch it

- **`page.reload()` bypasses Realtime** — Playwright tests sync state via DB poll + reload. Real browsers rely on Realtime WebSocket delivery, which flaps (`SUBSCRIBED → CHANNEL_ERROR` loop).
- **`createTwoPartySession` bypasses join flow** — pre-inserts both users, navigates simultaneously. Real users go through join flow with subscription timing gaps.
- **Unit tests only test `getViewState()` (pure function)** — the function is correct given correct inputs. The inputs don't arrive in the real browser.
- **`checkerName ? 'hidden'` logic bug** — P638's `/challenge-prd` correctly identified `checkerName` as a Realtime race condition but set it to `'hidden'` instead of `'disabled'`. After speaker submits, `checkerName` is set → mode switcher vanishes.

### Root cause (from deep analysis — t010 + 3-agent investigation)

This is a **distributed systems problem**, not a logic bug. Two browser tabs communicating through Supabase Realtime with optimistic updates, `updateInFlightRef` guards, `confirmedLiveStateRef` vs `liveState` divergence, and drift detection polling. The bugs are consistency bugs (stale reads, dropped messages, state residue), not logic bugs.

**The meta-problem:** Agents approach /live bugs as pure function correctness problems. `getViewState()` is correct. The inputs are wrong because state delivery is broken. No amount of unit-testing the pure function catches this.

## Evidence

### Implementation history

| Session | Date | What was tried | Tests | Manual UAT |
|---------|------|---------------|-------|-----------|
| 1 (P617) | Mar 30 | getViewState refactor, 6+ patches | 25 unit tests pass | Partial — same bugs reappear |
| 2 (P626) | Apr 2 | 3 commits fixing ratingInitiatedBy timing | 4 tests pass | All 3 commits wrong — spec misread 3x |
| 3 (P617 cont) | Apr 3 | Reverted P626, re-implemented per AD-0 | 1403 tests pass | NOTHING works — Realtime flapping found |
| 4 (P637) | Apr 3 | Drift detection fix for ratingInitiatedBy | Drift test passes | Mode switcher disables in E2E but not confirmed in real browser |
| 5 (P638) | Apr 3-4 | Folded IIFE into getViewState | 1421 tests pass | NOT YET VERIFIED — `checkerName ? 'hidden'` bug found by code tracer |

### Code-level findings (from 3-agent deep analysis)

1. **`live-mode-view.tsx` ~line 199:** `checkerName ? 'hidden'` — should be examined. When checkerName is set via Realtime race while ratingPhase is still idle, mode switcher vanishes instead of disabling.
2. **`clarity-live-page.tsx` ~line 1045-1060:** `updateInFlightRef` silently drops all non-position Realtime events. If listener has any in-flight write, `ratingInitiatedBy` update is dropped.
3. **`clarity-live-page.tsx` ~line 1360:** `handleStartCheck` guard reads `confirmedLiveStateRef.current`, not `liveState`. These diverge when Realtime delivers state that the ref hasn't been updated with.
4. **Realtime channel flapping:** Console logs show `SUBSCRIBED → CHANNEL_ERROR` in tight loop. Neither delivery mechanism (Realtime or drift polling) reliably delivers state.

## References

- **Root cause analysis:** `.private/thinking/t010_p617_systemic_failure.md`
- **Discovery session:** `~/.claude/projects/-Users-slavochek-Projects-public-claritypledge/593ee69e-4fbe-461d-b2af-44f00b84661c.jsonl`
- **Predecessor specs:** P617, P626, P637, P638
- **Test infrastructure fix:** P644 (filed alongside this bug)

## Acceptance Criteria

- [ ] Speaker clicks Speak → listener's mode switcher shows DISABLED (grayed, tooltip visible), NOT hidden
- [ ] Speaker submits rating → listener sees rating drawer automatically (no Speak button)
- [ ] Listener does NOT see story card until speaker submits
- [ ] All 3 above verified in REAL two-browser manual UAT (not Playwright)
- [ ] Dev console logs (`[Realtime]`, `[Guard]`, `[LiveUpdate]`) confirm state delivery chain works

## Constraint

**Do NOT fix this bug until P644 (test infrastructure) is implemented.** The testing gap is the real blocker — fixing code without fixing tests guarantees session 6 of the same pattern.
