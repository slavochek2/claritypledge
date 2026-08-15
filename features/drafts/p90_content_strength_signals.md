---
status: draft
type: story
workstream: C1
tags: []
rank: 125374.0
created_date: 2026-01-23
---
# P90: Content Strength Signals (Impact Score)

## Status: Planning

## Problem

All Points and Stories look the same. Users can't distinguish "viral but wrong" from "genuinely moving minds."

## Solution

Show `⚡ 72` on every card. One number (0-100).

```
┌────────────────────────────────┐
│ "Climate change is human..."   │
│                          ⚡ 72 │
│  👍 23  🤷 8  👎 11             │
└────────────────────────────────┘
```

## Formula

```typescript
function impactScore(verifications: {shift: number, rating: number}[]): number | null {
  if (verifications.length === 0) return null;
  const raw = verifications.reduce((sum, v) => sum + v.shift * v.rating, 0);
  return Math.min(100, Math.round(raw / 50 * 100));
}
```

Where:
- `shift` = |positionAfter - positionBefore| (0-6)
- `rating` = author's verification quality rating (0-10)
- `50` = benchmark (tune with real data)

### Example

| Person | Shift | Rating | Contribution |
|--------|-------|--------|--------------|
| Alice | 3 | 8 | 24 |
| Bob | 1 | 6 | 6 |
| Carol | 2 | 9 | 18 |
| **Raw** | | | **48** |

Score = min(100, round(48 / 50 × 100)) = **96**

## Data Needed

Log this on every verification:

```typescript
interface VerificationEvent {
  storyId: string;
  pointId: string | null;
  positionBefore: number;  // -3 to +3
  positionAfter: number;   // -3 to +3
  verificationScore: number; // 0-10
}
```

## UI States

| Verifications | Display |
|---------------|---------|
| 0 | `⚡ --` (gray) |
| 1-2 | `⚡ 23` (gray) |
| 3+ | `⚡ 72` (full color) |

## Open Questions

1. **Benchmark** — Is 50 right? Tune with real data.
2. **Direction** — We show magnitude only. Add direction later?
3. **Gaming** — Author rates quality. Bad verifications = low score.

## Phases

| Phase | What |
|-------|------|
| 1 | Log VerificationEvents |
| 2 | Calculate score, add to API |
| 3 | Show `⚡ N` on cards |

## Future (Post-MVP)

- Weight by verifier reputation (ears) and calibration
- Show tug-of-war breakdown on expanded view
- Decay old verifications?

## Related

- [philosophy.md](../../docs/philosophy.md) — Asymmetric Conversion theory
- [p89_swipeable_card_view.md](../done/4_27_jan26/p89_swipeable_card_view.md)
