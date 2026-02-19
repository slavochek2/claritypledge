---
status: all-done
type: comment
tags: []
rank: 125410.0
created_date: 2026-01-20
completed_at: '2026-02-09'
---

# P71: Simplify /live — Remove Redundant Taps

**Status:** Planning
**Created:** 2026-01-20
**Priority:** Medium — UX improvement to existing /live
**Approach:** In-place simplification (not a new feature)

---

## One-Sentence Description

Remove the "begin turn" tap so listener goes directly from gap-revealed to explain-back phase — reducing 2 taps to 1.

---

## Problem Statement

**The friction:** Listener has to tap TWICE for one logical action:
1. Tap "Explain back what I heard" → **begin turn**
2. (Explains verbally)
3. Tap "I'm done with active listening" → **end turn**

This is 2 taps for what feels like 1 action.

---

## Current Flow (The 2-Tap Problem)

```
GAP REVEALED (Listener view):
┌────────────────────────────────────┐
│ [Explain back what I heard]  ← TAP 1 (begin)
│ [Speak freely]                     │
└────────────────────────────────────┘

EXPLAIN-BACK PHASE (Listener view):
┌────────────────────────────────────┐
│ [I'm done with active listening] ← TAP 2 (end)
│ [Speak freely]                     │
└────────────────────────────────────┘

Only AFTER tap 2 does speaker get to rate.
```

---

## Proposed Simplification

**Remove the "begin turn" tap.** When gap is revealed:
- Listener automatically enters explain-back phase
- Listener only needs to tap "Done" when finished

| Current | Simplified |
|---------|------------|
| Tap "Explain back" → Explain → Tap "Done" | Explain → Tap "Done" |
| 2 taps | 1 tap |

---

## Why Remove Tap 1?

| Keep Both Taps | Remove Tap 1 |
|----------------|--------------|
| Coordination signal to speaker | Speaker already sees "Waiting..." message |
| Readiness check for listener | Instruction text provides same guidance |
| Explicit handoff | Verbal conversation handles this naturally |

**Decision:** Remove tap 1. The "Done" tap is sufficient signal.

---

## Simplified Flow

```
GAP REVEALED (Listener view) — AUTO-TRANSITIONS:
┌────────────────────────────────────┐
│ Explain back what you heard.       │
│ Tap "Done" when finished.          │
│                                    │
│ [Done explaining]                  │  ← Only 1 tap needed
│ [Speak freely]                     │
└────────────────────────────────────┘
```

**What happens:**
1. Gap revealed → Listener automatically enters explain-back phase
2. Listener explains verbally
3. Listener taps "Done explaining"
4. Speaker rates understanding

---

## Files to Modify

| File | Changes |
|------|---------|
| [live-mode-view.tsx:1898-2000](src/app/components/partners/live-mode-view.tsx) | GAP REVEALED phase: Auto-call `onExplainBackStart()` for listener |
| [live-mode-view.tsx:1524-1760](src/app/components/partners/live-mode-view.tsx) | EXPLAIN-BACK phase: Update button copy to "Done explaining" |

**Estimated lines changed:** ~30-50

---

## Implementation Details

### In GAP REVEALED phase (listener view):

**Current code (around line 1953):**
```tsx
<Button onClick={onExplainBackStart}>
  Explain back what I heard
</Button>
```

**New code:**
```tsx
// Auto-trigger on mount for listener
useEffect(() => {
  if (!isChecker && phase === 'gap-revealed') {
    onExplainBackStart();
  }
}, [phase, isChecker]);

// Show instruction instead of button
<p className="text-center text-muted-foreground">
  Explain back what you heard. Tap "Done" when finished.
</p>
```

### In EXPLAIN-BACK phase (listener view):

**Update button copy:**
- Current: "I'm done with active listening"
- New: "Done explaining" (shorter, clearer)

---

## What Stays the Same

- Speaker flow unchanged
- Rating mechanics unchanged (0-10 scale)
- Loop mechanics unchanged (explain-back can still repeat)
- "Speak freely" escape hatch preserved
- Real-time sync preserved
- All other phases unchanged

---

## Verification

1. **Manual test:**
   - Create session → both rate → gap revealed
   - Verify: Listener goes directly to explain-back phase (no tap needed)
   - Listener taps "Done" → speaker rates

2. **Edge cases:**
   - Perfect understanding (no gap) → still goes to celebration
   - "Speak freely" still works from explain-back phase
   - Multiple rounds still work

3. **E2E tests:**
   - Run existing /live tests
   - May need to update test expectations if they click "Explain back" button

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Listener confused by auto-transition | Low | Add instructional text |
| Breaking E2E tests | Medium | Update test selectors |
| State sync issues | Low | `onExplainBackStart` already handles sync |

---

## Related Documents

- [hypotheses.md](../docs/hypotheses.md) — H1: /live reduces Understanding Gap
- [lean-canvas.md](../docs/lean-canvas.md) — Core value prop

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-20 | Created from /simplify session with Victor |
| 2026-01-20 | **Revised:** Changed from "build new simple /live" to "simplify existing /live in-place" — remove redundant "begin turn" tap |
