---
status: done
priority: important
hypothesis: H-Biz
tags:
  - testing
  - demo
sort_order: 1000001
---

# P107: /live Demo Readiness

**Goal:** Ensure /live is ready for coach validation demos

---

## Context

/live exists in production but hasn't been tested for coach demo use case.

**Known issue:** Works for 1-on-1 when ideas are prepared. Doesn't work well for ad-hoc.

**Solution:** Demo Kit provides prepared ideas. This doc ensures the mechanics work.

---

## Readiness Checklist

### Must Work (Blocking)

| Component | Status | Notes |
|-----------|--------|-------|
| Start /live session | ⬜ Test | How does coach start session with client? |
| Share link/join | ⬜ Test | Can client join without account? |
| Speaker shares idea | ⬜ Test | Text or audio? What's the UX? |
| Listener plays back | ⬜ Test | Text or audio? Recording works? |
| Rating (both parties) | ⬜ Test | Confidence + accuracy scores |
| Gap display | ⬜ Test | Shows the Understanding Gap? |
| Session end | ⬜ Test | Clean close, data saved? |

### Nice to Have (Not Blocking)

| Component | Status | Notes |
|-----------|--------|-------|
| Session history | ⬜ | Can coach see past sessions with client? |
| Calibration over time | ⬜ | Shows improvement? |
| Export/share results | ⬜ | Can coach show client their gap? |

---

## Test Scenario

**Before coach outreach, test this flow:**

1. **You (as coach):** Open /live, create session
2. **Friend (as client):** Join via link (no account)
3. **You:** Share Demo Kit idea #3 (Understanding Gap)
4. **Friend:** Plays back what they understood
5. **Both:** Rate (confidence vs accuracy)
6. **Verify:** Gap displays, session saves

**Pass criteria:**
- Flow completes without errors
- Both parties see the gap
- Takes < 5 minutes total

---

## Known Gaps

*Fill in after testing*

| Gap | Impact | Fix Needed? |
|-----|--------|-------------|
| | | |

---

## Decision: What's Minimum for Coach Demos?

Options:
- **A: Full flow works** — All checklist items pass
- **B: Core flow works** — Start, share, playback, rate, gap display
- **C: Manual demo** — Show the concept, platform not ready

**Current assumption:** Need at least B for credible demos.

---

## Next Steps

1. ⬜ Test flow with a friend (30 min)
2. ⬜ Document gaps found
3. ⬜ Decide: fix gaps or work around?
4. ⬜ If ready: proceed to coach outreach

---

## Related

- [p_demo_kit.md](p_demo_kit.md) — Content to use in demos
- [p_coach_validation.md](p_coach_validation.md) — Coach outreach plan
- [roadmap.md](../docs/roadmap.md) — Phase 0.0 includes this
