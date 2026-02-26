---
status: week
type: bug
rank: 125495.0
tags:
  - p425
  - story
  - profile
  - position
---

# P451: Story CTA missing everywhere except point detail page

## Bug

The "Tell your story →" CTA only appears on `/points/:id` (point detail page) after staking a position. `PositionButtons` is used in 6+ surfaces — none of the others show the CTA.

The p425 spec says: "After a user stakes a position on a point, a prompt appears: 'Want to explain why?'" — no restriction to the detail page.

## Affected surfaces (confirmed via grep)

| Component | Surface | CTA? |
|-----------|---------|------|
| `point-detail-page.tsx` | Point detail page | ✅ |
| `PointCardDetail.tsx` | Point cards in feeds | ❌ |
| `point-card-with-links.tsx` | Inline point cards | ❌ |
| `story-card-with-links.tsx` | Points linked inside stories | ❌ |
| `StoryCardDetail.tsx` | Story detail view | ❌ |
| `live-story-card-expanded.tsx` | /live session | ❌ (intentional?) |

## Root cause

`showStoryCTA` state and CTA rendering are hardcoded in `point-detail-page.tsx` only. `PositionButtons` has no `onPositionStaked` callback prop.

## Fix

Add `onPositionStaked?: (pointId: string) => void` to `PositionButtons` props. Fire it when a position is first staked (not toggled off). Each consumer that should show the CTA wires it up — the CTA itself can live in a shared component or inline per surface.

Note: `/live` surface (`live-story-card-expanded.tsx`) may intentionally skip the CTA — the /live flow has its own post-session story entry point. Confirm before adding.

## Acceptance Criteria

- [ ] Staking a position on a point card (feed, profile, story) shows "Tell your story →" / "Not now"
- [ ] CTA links to `/chat?from=position&pointId=${id}`
- [ ] "Not now" dismisses the CTA without navigating
- [ ] Detail page behavior unchanged
- [ ] `/live` surface scoped separately (confirm intent first)
