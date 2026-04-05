# UAT: P638 — Fold Mode Switcher into getViewState + Dev Observability

> Two-browser manual validation required. Focus: the mode switcher IIFE is gone — all behavior now comes from getViewState().

## Prerequisites

- Two authenticated users in a /live session on localhost:5100 (w1 worktree)
- Dev tools open on listener's browser (to check observability logs)

---

## Scenarios

### UAT-1: Mode switcher enabled on idle (same as P617)

**Given:** Both users joined, on idle screen
**When:** Session loads
**Then:** Both see [Open mode] [Guided mode] pill toggle, enabled (blue highlight on active)
**Verify:** Screenshot both tabs

---

### UAT-2: Mode switcher disabled when partner clicks Speak

**Given:** Both on idle
**When:** Speaker clicks "Speak"
**Then:** Listener's mode switcher becomes disabled (grayed, opacity-50) WITHOUT page reload
**Verify:** Watch listener's tab — mode switcher should gray out within ~10s (drift polling interval)

---

### UAT-3: Mode switcher hidden in round

**Given:** Speaker clicked Speak, then submitted rating
**When:** Both users are in the round
**Then:** Mode switcher not visible on either side
**Verify:** Screenshot both tabs — no [Open mode] [Guided mode] visible

---

### UAT-4: Dev observability logs visible

**Given:** Dev tools console open on listener's browser, `import.meta.env.DEV` is true
**When:** Speaker clicks Speak → submits rating
**Then:** Console shows `[Realtime]`, `[LiveUpdate]`, and `[Guard]` prefixed logs
**Verify:** Check for: event applied/dropped, write success, guard ref vs state

---

### UAT-5: No display names in dev logs

**Given:** Dev tools console open
**When:** Speaker clicks Speak
**Then:** Console logs show structural state (ratingPhase, action) but NOT user display names
**Verify:** Search console for the speaker's name — should not appear in any `[Guard]` or `[Realtime]` log

---

### UAT-6: IIFE is gone — mode switcher rendered from getViewState

**Given:** Code inspection
**When:** Search `live-mode-view.tsx` for the old IIFE pattern
**Then:** No inline function at line ~1392 computing mode switcher visibility. IdleScreen receives `modeSwitcherState` as prop.
**Verify:** `grep -n "IIFE\|(() =>" src/app/components/partners/live-mode-view.tsx | grep -i mode`

---

## Test Execution Log

| Scenario | Result | Notes |
|----------|--------|-------|
| UAT-1: Mode switcher enabled on idle | ⬜ | |
| UAT-2: Mode switcher disabled (no reload) | ⬜ | |
| UAT-3: Mode switcher hidden in round | ⬜ | |
| UAT-4: Dev observability logs visible | ⬜ | |
| UAT-5: No display names in logs | ⬜ | |
| UAT-6: IIFE is gone (code inspection) | ⬜ | |
