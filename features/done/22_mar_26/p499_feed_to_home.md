---
status: all-done
completed_at: "2026-03-13"
type: feature
rank: 250002.75
workstream: E1
created_date: 2026-03-13
flow: dev
tags: []
---

# P499: Rename Feed to Home + Write Story CTA + Filter Internal Tags

## Problem

The `/feed` page is a passive content stream with no call to action. It contradicts the product thesis ("people want connection, not more feeds"). Renaming to "Home" and adding a story creation prompt makes the logged-in experience feel intentional. Internal tags (st1, st2, etc.) leak into the public tag cloud.

## Solution

Three minimal changes to existing files — no new components, no new routes:

1. **Rename "Feed" → "Home"** in nav labels (top nav + bottom nav) and page heading
2. **Add "Write a Story" button** above the search bar (logged-in users only)
3. **Filter internal tags** from the tag cloud (hide tags matching `st` + number pattern)

### Final Layout

```
Logged in:                    Anonymous (unchanged):

Home                          Home

[Write a Story →]             [search bar]
[search bar]                  [Points] [Stories]
[Points] [Stories]            #leadership #calibration
#leadership #calibration      ...cards (read-only)...
...cards...
```

Route stays `/feed` — no URL change needed. Logo link stays `/` (landing page).

## Technical Notes

Files to edit:
- `src/app/components/layout/simple-navigation.tsx` — "Feed" label → "Home"
- `src/app/components/layout/bottom-nav.tsx` — "Feed" label → "Home"
- `src/app/pages/feed-page.tsx` — heading, Write Story button, tag cloud filter
- `src/app/components/seo.tsx` — if SEO title references "Feed"

Tag filter: exclude tags matching `/^st\d+$/i` from the tag cloud. Feed cards keep showing all tags — only the cloud chips are filtered.

## Acceptance Criteria

- [ ] Nav shows "Home" instead of "Feed" on both desktop and mobile
- [ ] Page heading says "Home" instead of "Feed"
- [ ] Logged-in users see a "Write a Story" button/link above the search bar that navigates to `/create`
- [ ] Anonymous users do NOT see the Write Story button
- [ ] Tags matching `st` + digits (e.g., st1, st2, st10) are hidden from the tag cloud
- [ ] Tags are still visible on individual feed cards (not stripped from content)
- [ ] Existing feed functionality (tabs, search, tag filter, cards) is unchanged

## Testing

Manual: log in → see "Home" in nav, see Write Story button, click it → goes to /create. Log out → no button. Check tag cloud has no st1/st2 tags.
