---
status: done
completed_at: '2026-03-26'
type: bug
rank: 1000027.0
workstream: foundation
severity: low
date_reported: 2026-03-26
created_date: 2026-03-26
tags: [mobile, ui-polish]
---

# BUG: P589 — Mobile Card Footer Padding

## Problem

On mobile (< 640px), card footer action rows overflow or wrap to two lines because of large left padding (`pl-[52px]` / `pl-[68px]`) that aligns with the avatar column above but wastes ~50px of horizontal space. The row contains: point/story count + "Add point/story" blue pill + edit/delete/share/external icons — too much for one line at 396px with the avatar-aligned padding.

## Symptoms

- Action icons (edit, delete, share, external link) truncated or pushed off-screen on mobile
- With `flex-wrap` applied, icons drop to a second row — functional but ugly
- Inconsistent across surfaces — some cards have the padding, some don't

## Affected Surfaces (6 locations, 5 files)

| Surface | File | Current padding |
|---------|------|----------------|
| Profile story cards | `profile-page-v2.tsx:1282` | `pl-[68px]` |
| Story detail (feed, story page) | `StoryCardDetail.tsx:290` | `pl-[52px]` |
| Story embed (/live, embed) | `story-card-with-links.tsx:343` | `pl-[52px]` |
| Point card footer | `point-card-with-links.tsx:479` | `pl-[68px]` |
| Point card stories row | `point-card-with-links.tsx:577` | `pl-[68px]` |
| Live story card | `live-story-card-expanded.tsx:118` | `pl-[52px]` |

## Resolution

Responsive padding: `pl-4` on mobile, `sm:pl-[N]` on desktop. Revert `flex-wrap` (from prior fix attempt) back to single-row `flex`. CSS-only, no logic changes.

```
BEFORE (mobile):  [====68px pad====] 0 pts [+Add] ✎🗑↗ (overflow)
AFTER  (mobile):  [16px] 0 pts [+Add point]  ✎  🗑  ↗  🔗  (fits)
DESKTOP:          unchanged (avatar-aligned padding preserved via sm: breakpoint)
```

Also includes prior fix from this session (already committed):
- `whitespace-nowrap` on all Add point/story pills
- Text shortened: "Add a point" → "Add point", "Add your story" → "Add story"
- `px-3` → `px-2` on pills

## Acceptance Criteria

- [ ] All 6 footer rows use `pl-4 sm:pl-[N]` responsive padding
- [ ] `flex-wrap` reverted — single row on all screen sizes
- [ ] No icon truncation at 375px mobile width
- [ ] Desktop layout unchanged (avatar alignment preserved)
- [ ] Consistent across: profile, feed, story detail, point detail, /live, embed

## Verification

Visual check on mobile (375-396px) across all 5 surfaces. Compare desktop to confirm no regression.
