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

# P451: Story CTA missing on profile page points tab

## Bug

The "Tell your story →" CTA only appears on `/points/:id` (point detail page) after staking a position. It does not appear when staking a position from the profile page points tab — which is the most common discovery path (browsing someone else's profile).

The p425 spec says: "After a user stakes a position on a point, a prompt appears: 'Want to explain why?'" — no restriction to the detail page.

## Root cause

`showStoryCTA` state and the CTA rendering live exclusively in `point-detail-page.tsx`. The profile page points tab (`agreement-page.tsx` or profile points component) stakes positions but has no CTA logic.

## Fix

Add the same CTA trigger to the profile page points tab component — after a successful position stake, show "Tell your story →" / "Not now" buttons linking to `/chat?from=position&pointId=${id}`.

Find the relevant component:
```bash
grep -rn "stakePosition\|setPosition\|position.*stake" src/app/pages/profile-page.tsx src/app/components/
```

## Acceptance Criteria

- [ ] Staking a position from the profile page points tab shows the story CTA
- [ ] CTA links to `/chat?from=position&pointId=${id}` (same as detail page)
- [ ] "Not now" dismisses the CTA
- [ ] Detail page behavior unchanged
