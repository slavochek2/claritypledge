# P90: Content Strength Signals (Impact Score)

## Status: Planning

## Problem Statement

We have no way to surface which Points and Stories are "strong" — meaning they exhibit truth-seeking patterns according to our core hypothesis (H-Core: Asymmetric Conversion).

Currently:
- All Points look the same (just show engagement counts)
- All Stories look the same (just show verification counts)
- Users can't distinguish "viral but wrong" from "genuinely closer to truth"

## Solution: Impact Score

A single number (0-100) displayed on every Point and Story card.

```
┌────────────────────────────────┐
│ "Climate change is human..."   │
│                          ⚡ 72 │
│  👍 23  🤷 8  👎 11             │
└────────────────────────────────┘
```

### What Impact Score Measures

| Content | Question It Answers |
|---------|---------------------|
| **Point** | "How much do stories move people on THIS point?" |
| **Story** | "How much does THIS story move people on linked points?" |

Higher score = more position shifts happened after quality verifications.

## Connection to H-Core

This feature operationalizes [Asymmetric Conversion](../docs/visions/v7_communicative_critical_rationalism.md#the-asymmetric-conversion-hypothesis) from philosophy to UI.

A high Impact Score means: people who genuinely understood the content changed their position. This is the signal of truth-seeking — minds moving after real engagement, not just likes or shares.

## MVP Formula

### Raw Calculation

```
Raw = Σ (shift_magnitude × verification_score)
```

Where:
- `shift_magnitude` = |positionAfter - positionBefore| (0-6)
- `verification_score` = author's rating of verification quality (0-10)

### Normalization

```
Score = min(100, round((Raw / BENCHMARK) × 100))
```

Where:
- `BENCHMARK = 60` (tunable based on real data)
- Score is capped at 100

### Example

| Verifier | Shift | Rating | Contribution |
|----------|-------|--------|--------------|
| A | +3 | 8 | 24 |
| B | +1 | 6 | 6 |
| C | +2 | 9 | 18 |
| **Total** | | | **48** |

Score = min(100, round((48 / 60) × 100)) = **80**

### Implementation

```typescript
function calculateImpactScore(verifications: VerificationEvent[]): number | null {
  if (verifications.length === 0) return null;

  const raw = verifications.reduce((sum, v) => {
    const shift = Math.abs(v.positionAfter - v.positionBefore);
    return sum + (shift * v.verificationScore);
  }, 0);

  const BENCHMARK = 60;
  return Math.min(100, Math.round((raw / BENCHMARK) * 100));
}
```

## Data Model

### VerificationEvent (new table)

```typescript
interface VerificationEvent {
  id: string;
  verifierId: string;         // Who verified
  authorId: string;           // Whose Story was verified
  storyId: string;            // Which Story
  pointId: string | null;     // Linked Point (if any)

  // Position tracking
  positionBefore: -3 | -2 | -1 | 0 | 1 | 2 | 3 | null;
  positionAfter: -3 | -2 | -1 | 0 | 1 | 2 | 3 | null;

  // Verification quality
  verificationScore: number;  // 0-10, from author rating

  timestamp: Date;
}
```

### Computed (not stored)

```typescript
interface ImpactScore {
  contentId: string;          // Point or Story ID
  contentType: 'point' | 'story';

  score: number | null;       // 0-100, null if no verifications
  rawScore: number;           // Before normalization
  verificationCount: number;  // How many verifications

  // Display hints
  isLowConfidence: boolean;   // < 3 verifications
}
```

## UI Specification

### Card Display

```
┌────────────────────────────────┐
│ 📍 "Climate change is human..." │
│                                │
│                          ⚡ 72 │
│                                │
│  👍 23  🤷 8  👎 11             │
└────────────────────────────────┘

┌────────────────────────────────┐
│ 📖 "My father was a coal miner" │
│    by @sarah_k                 │
│                                │
│                          ⚡ 64 │
│                                │
│  ✓ 12 verified                 │
└────────────────────────────────┘
```

### Display States

| Verifications | Display | Style |
|---------------|---------|-------|
| 0 | `⚡ --` | Gray, muted |
| 1-2 | `⚡ 23` | Gray (low confidence) |
| 3+ | `⚡ 72` | Full color |

### Icon Choice

`⚡` (lightning) — represents impact/energy of position shifts.

Alternative considered: `🎯` (target) — fits "truth-seeking" but implies accuracy we can't guarantee.

## Future Enhancements (Post-MVP)

### Weighted Formula

Once we have more data, add weights for:

```
Raw = Σ (shift × verification_score × sqrt(ears) × calibration)
```

| Factor | What It Is | Why It Matters |
|--------|------------|----------------|
| **Ears** | Verifier's reputation | Respected person moving = stronger signal |
| **Calibration** | Verifier's self-assessment accuracy | Well-calibrated = trustworthy signal |

### Expanded Analytics (Tap to See)

On card expansion or detail page, show breakdown:

```
┌─────────────────────────────────────────────────┐
│ 📍 POINT: "Climate change is human-caused"      │
│                                           ⚡ 72 │
│                                                 │
│ How stories move people on this point:          │
│                                                 │
│      AGAINST              FOR                   │
│        ←━━━━━━━○━━━━━━━━━━━━━━━━→              │
│         -0.3        +1.8                        │
│                                                 │
│ FOR stories:                                    │
│  📖 "Ice core data..." ━━━━━━→ +2.1            │
│  📖 "My father..." ━━━→ +1.4                   │
│                                                 │
│ AGAINST stories:                                │
│  📖 "Jobs will be lost..." ←━ -0.6             │
│  📖 "Models are flawed..." · (0.0)             │
└─────────────────────────────────────────────────┘
```

## Open Questions

1. **Benchmark tuning** — Is 60 the right benchmark? Need real data.
2. **Time horizon** — When to measure `positionAfter`? Immediately after verification.
3. **Gaming risk** — Mitigated by verification quality rating from author.
4. **Negative scores?** — MVP shows magnitude only. Direction could be added later.

## Anti-Gaming

| Risk | Mitigation |
|------|------------|
| Fake shifts | Author rates verification quality — bad verifications get low score |
| Sybil attacks | Low verification count = low confidence display |
| Strategic positioning | Need genuine verification to count |

## Dependencies

- Requires `/live` sessions to be working (H1 validated ✅)
- Requires position tracking on Points
- Requires linking Stories to Points
- Requires author rating of verification quality

## Success Criteria

1. **Instrumentation:** Every verification logs a complete VerificationEvent
2. **Calculation:** Impact Score computed correctly from logged data
3. **Display:** Score visible on all Point and Story cards
4. **Validation:** High-Impact content correlates with quality (manual review)

## Phases

| Phase | Scope | Effort |
|-------|-------|--------|
| 1. Instrumentation | Log VerificationEvents with positions | Small |
| 2. Score Calculation | Implement formula, add to API | Small |
| 3. UI Display | Show `⚡ N` on cards | Small |
| 4. Analytics View | Expanded breakdown on tap | Medium |
| 5. Weighted Formula | Add ears, calibration | Medium |

## Related Documents

- [v7_communicative_critical_rationalism.md](../docs/visions/v7_communicative_critical_rationalism.md) — Philosophical foundation
- [hypotheses.md](../docs/hypotheses.md) — H-Core hypothesis definition
- [p89_swipeable_card_view.md](p89_swipeable_card_view.md) — Card UI where score appears
