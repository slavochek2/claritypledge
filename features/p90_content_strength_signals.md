# P90: Content Strength Signals

## Status: Planning

## Problem Statement

We have no way to surface which Points and Stories are "strong" — meaning they exhibit truth-seeking patterns according to our core hypothesis (H-Core: Asymmetric Conversion).

Currently:
- All Points look the same (just show engagement counts)
- All Stories look the same (just show verification counts)
- Users can't distinguish "viral but wrong" from "genuinely closer to truth"

## Connection to H-Core

This feature operationalizes [Asymmetric Conversion](../docs/visions/v7_communicative_critical_rationalism.md#the-asymmetric-conversion-hypothesis) from philosophy to UI.

### What Makes a "Strong Point"

A Point closest to truth exhibits BOTH:

| Metric | Definition | Formula |
|--------|------------|---------|
| **Retention Rate** | Holders stay after understanding opposing Stories | (holders who stayed) / (holders who verified opposing Stories) |
| **Conversion Rate** | Opponents flip toward after understanding supporting Stories | (opponents who flipped toward) / (opponents who verified supporting Stories) |

**Asymmetry Score** = Conversion Rate − (1 − Retention Rate)

### What Makes a "Strong Story"

A Story that changes minds:

| Metric | Definition | Formula |
|--------|------------|---------|
| **Flip Rate** | Verifiers change position on linked Point | (verifiers who flipped) / (total verifiers) |
| **Flip Magnitude** | How far they move | Average |positionAfter - positionBefore| |

## Data Model

### VerificationEvent (new)

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

### Computed Metrics (derived, not stored)

```typescript
interface PointStrength {
  pointId: string;

  // Raw counts
  totalVerifications: number;
  holdersWhoVerifiedOpposing: number;
  holdersWhoStayed: number;
  opponentsWhoVerifiedSupporting: number;
  opponentsWhoFlipped: number;

  // Rates
  retentionRate: number;      // 0-1
  conversionRate: number;     // 0-1
  asymmetryScore: number;     // -1 to +1

  // Confidence
  sampleSize: number;
  isStatisticallySignificant: boolean;
}

interface StoryStrength {
  storyId: string;

  // Raw counts
  totalVerifications: number;
  verifiersWhoFlipped: number;

  // Metrics
  flipRate: number;           // 0-1
  averageFlipMagnitude: number; // 0-6

  // Confidence
  sampleSize: number;
  isStatisticallySignificant: boolean;
}
```

## UI Concepts

### Phase 1: Instrumentation Only

No UI changes. Just log VerificationEvents during `/live` sessions.

**When to log:**
1. User takes position on Point → record `positionBefore`
2. User completes verification of Story linked to Point → record `positionAfter`, `verificationScore`

### Phase 2: Simple Badges (future)

Once we have ~100 verifications, show badges:

| Badge | Criteria | Visual |
|-------|----------|--------|
| **High-conviction Point** | Asymmetry > 0.3, sample > 10 | 🎯 icon |
| **Perspective-shifting Story** | Flip rate > 0.4, sample > 5 | 💡 icon |

### Phase 3: Detailed View (future)

Show full strength metrics on Point/Story detail pages for transparency.

## Open Questions

1. **Threshold sensitivity** — What asymmetry score threshold = "strong"? Need empirical data.
2. **Sample size** — Minimum verifications before showing badge? 5? 10? 20?
3. **Time horizon** — When to measure `positionAfter`? Immediately? 24 hours later? A week?
4. **Gaming risk** — Could people game this by strategic position-taking? How to detect?

## Dependencies

- Requires `/live` sessions to be working (H1 validated ✅)
- Requires position tracking on Points
- Requires linking Stories to Points

## Success Criteria

1. **Instrumentation:** Every verification logs a complete VerificationEvent
2. **Analysis:** Can compute strength metrics from logged data
3. **Validation:** Strong Points (by asymmetry) correlate with domain expert judgment
4. **UI:** Users can distinguish strong from weak content at a glance

## Timeline

| Phase | Scope | Effort |
|-------|-------|--------|
| 1. Instrumentation | Log VerificationEvents | Small |
| 2. Analysis | Compute metrics, validate with real data | Medium |
| 3. UI Badges | Show badges on qualifying content | Small |
| 4. Detail View | Full transparency on metrics | Medium |

## Related Documents

- [v7_communicative_critical_rationalism.md](../docs/visions/v7_communicative_critical_rationalism.md) — Philosophical foundation
- [hypotheses.md](../docs/hypotheses.md) — H-Core hypothesis definition
- [p89_swipeable_card_view.md](p89_swipeable_card_view.md) — Card UI where badges would appear
