---
status: backlog
type: task
prep_status: ready
prep_date: 2026-01-23
prep_by: /prep-spec
reviews:
  ux: warnings
  architect: warnings
  tea: skipped
open_questions: 0
blindspots: 0
execution: /loop --with-checkpoints
tags: []
rank: 125337.0
created_date: 2026-01-23
---

# P93: Story-Point Display Refactor

**Status:** Ready
**Priority:** High (UX consistency)
**Prototype:** `src/app/prototypes/linkedin-like/`

## Problem

The current prototype has inconsistent and visually overloaded display of Story-Point relationships:

1. **Profile StoryCards** show full Point position breakdowns (Agree/Disagree/Unsure counts) — too complex for scanning
2. **Profile PointCards** show all quoted Stories inline — but Stories come from different users with different positions
3. **Point detail page** shows Stories in a flat list, ignoring that each Story explains a specific position
4. **Duplicate users** — same person appears in Stories list AND position breakdown
5. **Outdated UI elements** — "Verify" button, icons on tabs, recursive Point quoting

## Solution

### 1. Profile Cards — Show Counts Only

**StoryCard:**
```
┌─────────────────────────────────────────┐
│ 👤 Jordan Taylor · Jan 7                │
│ I started working remotely 2 years ago  │
│ and my work-life balance has...         │
│                                         │
│ 🔗 2 points                             │  ← count only
└─────────────────────────────────────────┘
```

**PointCard:**
```
┌─────────────────────────────────────────┐
│ 👥 4 Stances                            │
│ Remote work is more productive...       │
│ [Disagree(0)] [Unsure(2)] [Agree(2)]    │
│                                         │
│ ▶ Your 2 stories                        │  ← collapsed, this user only
└─────────────────────────────────────────┘
```

- On profile page: Only show THIS user's stories (collapsed by default)
- Clicking "▶" expands to show their stories
- Show "Your 0 stories" when count is 0 (consistent, always visible)
- Other users' stories live on Point detail page

### 2. Story Detail Page — Show Linked Points

Keep current behavior. One user links their story to relevant Points. Makes sense inline.

### 3. Point Detail Page — Group by Position

**Before (flat list):**
```
Stories: Alice, Bob, Carol (mixed positions)
Tabs: [All] [Agreed] [Disagreed] [Unsure]
```

**After (position-grouped):**
```
[Agree (2)] [Disagree (0)] [Unsure (2)]    ← no "All" tab, no icons

═══ Agree (2) ═══════════════════════════
  ┌─────────────────────────────────────┐
  │ Alice Chen · Jan 3                  │
  │ After switching to fully remote...  │
  └─────────────────────────────────────┘
  ┌─────────────────────────────────────┐
  │ Carol Davis · Jan 5                 │
  │ Our research team went remote...    │
  └─────────────────────────────────────┘

═══ Unsure (2) ══════════════════════════
  ┌─────────────────────────────────────┐
  │ Bob Smith · Jan 4                   │
  │ I tried remote work for 6 months... │
  └─────────────────────────────────────┘
  ...

═══ Disagree (0) ════════════════════════
  (no positions yet)
```

**Behavior:**
- Default: All position sections visible (no "All" tab needed)
- Click tab: Filter to single position (collapse others)
- Click active tab again: Deselect and show all (toggle pattern)
- Empty positions: Show "(no positions yet)" for discoverability
- Position badge: Always show above story (not within, not hidden when filtered)
- Loading: Show skeleton for card counts and expand sections
- Mobile: Expand toggle min 44x44px, always visible (no hover-only)

### 4. Remove Outdated Elements

- [ ] Remove "Verify" button from Point detail page
- [ ] Remove icons from position tabs (✓, ✗, —)
- [ ] Remove recursive Point quoting inside Stories on Point page
- [ ] Fix duplicate user issue (Alice in stories AND position list)

## Tasks

### Phase 0: Prerequisites
- [ ] Fix `dont_know` → `unsure` type mismatch in PointDetail.tsx (line 45-46)
- [ ] Add `context: 'profile' | 'point-detail' | 'story-detail'` prop to StoryCard

### Phase 1: Profile Cards
- [ ] StoryCard: Replace inline Points with "🔗 N points" count (hide QuotedPoints when context='profile')
- [ ] PointCard: Replace inline Stories with collapsible "Your N stories" (show even when 0)
- [ ] Add expand/collapse toggle for user's stories (min 44x44px touch target)

### Phase 2: Point Detail Page
- [ ] Refactor to position-grouped layout
- [ ] Remove "All" tab (click active tab to deselect)
- [ ] Remove icons from tabs
- [ ] Show empty position sections with "(no positions yet)"
- [ ] Position badge always above story (not conditional)
- [ ] Pass `context='point-detail'` to StoryCard (hides QuotedPoints)
- [ ] Remove "Verify" button

### Phase 3: Cleanup
- [ ] Verify no duplicate users in display
- [ ] Test all states (0 stories, 1 story, many stories per position)

## Files to Modify

```
src/app/prototypes/linkedin-like/components/
├── StoryCard.tsx          # Add context prop, conditional QuotedPoints
├── PointCard.tsx          # Collapsible user stories
├── PointDetail.tsx        # Position-grouped layout, fix dont_know→unsure
└── shared/FilterTabs.tsx  # Add showAllTab prop or toggle behavior
```

## References

- [DECISIONS.md](../docs/DECISIONS.md) — 2026-01-23 entry
- [p60_navigating_stories_and_points.md](p60_navigating_stories_and_points.md)
