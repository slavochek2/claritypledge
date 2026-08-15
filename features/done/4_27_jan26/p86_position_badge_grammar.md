---
status: prepped
type: bug
prepped_date: 2026-01-22
prepped_by: /prep-spec
reviews:
  ux: passed
  architect: passed
  tea: skipped
execution: /loop
tags: []
rank: 125336.0
created_date: 2026-01-22
---

# P86: Position Badge — Hide for Self, Fix Grammar for Others

## Problem

Two issues with PositionBadge in linkedin-like prototype:

1. **Redundant display:** When viewing your own content, position shows twice:
   - Top: "You Unsure" (PositionBadge)
   - Bottom: Highlighted button (PositionButtons)

2. **Grammar bug:** If we kept the badge, it says "You Agrees" instead of "You Agree"

## Solution

**Don't show PositionBadge for current user** — the buttons already indicate your position.

| Viewing | PositionBadge shows | PositionButtons shows |
|---------|--------------------|-----------------------|
| Your content | Nothing (hide) | Your position (highlighted) |
| Other's content | "Alice Agrees" | Your position (highlighted) |

Grammar fix only needed for third-person case now.

## Files to Modify

**[PositionBadge.tsx](../../../src/app/components/shared/PositionBadge.tsx)**

```tsx
// Return null when showing current user's position
if (isCurrentUser) {
  return null;
}

// Third-person always uses "Agrees/Disagrees" — no change needed
```

**Callers** — pass `isCurrentUser` where applicable:
- [PointCard.tsx:96](../src/app/prototypes/linkedin-like/components/PointCard.tsx#L96)
- [StoryCard.tsx:102](../src/app/prototypes/linkedin-like/components/StoryCard.tsx#L102)
- [StoryCard.tsx:267](../src/app/prototypes/linkedin-like/components/StoryCard.tsx#L267)

## Test

- [ ] Own profile: No "You Agrees/Disagrees/Unsure" badge (buttons show position)
- [ ] Other's profile: "Alice Agrees" badge visible
- [ ] Standalone badge (no name): "Agrees" still works
- [ ] Pre-commit checks pass

## Scope

**In:** linkedin-like prototype PositionBadge only
**Out:** converged prototype, EngagerList, shared/utils
