---
status: all-done
type: story
tags: []
rank: 125454.0
created_date: 2026-01-22
completed_at: '2026-02-09'
---

# P88: Position Badge Clarity — Remove Redundant Badges from Story Cards

## Problem

When viewing a Point with linked Stories, the UI shows position badges (e.g., "Alice Agrees") on the **Story cards** nested inside the Point. This creates ambiguity:

- User sees: `👤 Alice [Agrees]` on a Story card
- User thinks: "Agrees with what? Her own story? The Point above?"

The position badge appears in **two places**:
1. **Point header** — `Point · 5 Stances · Alice Agrees` ✅ Clear
2. **QuotedStory card** — `👤 Alice [Agrees]` ❌ Ambiguous

## Root Cause

The `QuotedStory` component (inside `PointCard.tsx`) displays the author's position on the Point, but the visual hierarchy suggests it's about the Story itself.

## Context Rules

| Context | What to show | Position display |
|---------|--------------|------------------|
| **My Profile** | Points I took stance on + my stories | My stance = buttons (interactive) |
| **Someone's Profile** | Points they took stance on + their stories | Their stance = badge in **Point header only** |
| **Feed/Explore** | All Points, no person context | Just counts — no position badges on stories |

## Solution

**Remove position badge from QuotedStory component.** The Point header already shows the profile owner's position — no need to repeat it on nested story cards.

### Before (Redundant)

```
┌─ POINT (on Alice's profile) ─────────────┐
│ 📌 Point · Alice Agrees                   │  ← Position shown here
│ "Remote work is more productive..."       │
│ [Agree 3] [Disagree 1] [Unsure 1]        │
│                                           │
│   ┌─ QuotedStory ───────────────────────┐ │
│   │ 👤 Alice 📌 [Agrees]                 │  ← AND here (redundant!)
│   │ "After switching to remote..."       │
│   └─────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

### After (Clean)

```
┌─ POINT (on Alice's profile) ─────────────┐
│ 📌 Point · Alice Agrees                   │  ← Position shown once
│ "Remote work is more productive..."       │
│ [Agree 3] [Disagree 1] [Unsure 1]        │
│                                           │
│   ┌─ QuotedStory ───────────────────────┐ │
│   │ 👤 Alice's Story                     │  ← Just the story
│   │ "After switching to remote..."       │
│   └─────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

## Implementation

### Files to Modify

1. **PointCard.tsx** — `QuotedStory` component (lines ~259-268)
   - Remove the position badge block

### Code Change

In `QuotedStory` component, delete:

```tsx
// DELETE this block:
{authorPosition && author && !isCurrentUser && (
  <>
    <Pin size={10} className="text-slate-400 ml-1" />
    <PositionBadge
      position={authorPosition}
      name={author.name.split(' ')[0]}
      isCurrentUser={false}
    />
  </>
)}
```

Keep only:
```tsx
{/* Author name - clickable */}
{author && (
  <span ... className="text-xs font-medium text-gray-700 hover:underline cursor-pointer">
    {author.name}'s Story
  </span>
)}
```

### Also Check

- **StoryCard.tsx** — The `authorPosition` prop display (lines ~97-108) is only used when StoryCard is rendered in PointDetail context. This may also need review, but is a separate case (Story shown in list filtered by Point).

## Success Criteria

- [ ] On someone's profile → Point shows their position in header only
- [ ] QuotedStory cards show "Author's Story" without position badge
- [ ] No visual regression in Feed view (Points without profile context)
- [ ] Position buttons still work correctly

## Out of Scope

- Changing position badge styling
- Adding tooltips or other clarification mechanisms
- Modifying StoryCard in PointDetail list view (separate context)

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Remove vs. add tooltip | Remove | KISS — position already visible in Point header |
| Keep Pin icon | No | Pin icon was a workaround for ambiguity; removing badge removes need |
