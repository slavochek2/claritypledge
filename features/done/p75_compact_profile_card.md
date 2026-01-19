---
status: prepped
prepped_date: 2026-01-19
prepped_by: /prep-spec
reviews:
  ux: passed
  architect: passed
  tea: skipped
execution: /loop
---

# P75: Compact Profile Card

## Problem

The current profile page (`/p/:slug` and `/me`) is a large, vertically-centered card that takes up the full viewport. This makes it difficult to add content below (ideas, events, activity feed) and doesn't match the direction we're heading with the prototype designs.

**Current state:**
- Full-page centered card (max-w-3xl)
- Large centered avatar (96px)
- Name/role centered vertically
- Pledge CTAs below
- No room for additional content

**Desired state (inspired by `/prototype/linkedin-like/profile`):**
- Compact horizontal card at top
- Avatar (64px) on left, name/role on right
- Optional metrics row
- Room for content below (ideas, events, etc.)

## Scope

### In Scope
- Redesign profile card to be compact horizontal layout
- Apply to both `/me` and `/p/:slug` pages
- Keep existing pledge CTAs (View My Pledge / Take the Pledge)
- Add share button
- Responsive design (mobile-friendly)

### Out of Scope (for now)
- Metrics row (positions taken, clarity sessions, verifications) - we don't have this data yet
- Ideas feed below profile - separate feature
- Events attended section - separate feature

### Questions to Resolve
1. Should we show any metrics? Options:
   - No metrics (simplest)
   - Witness count only (we have this data)
   - Placeholder for future metrics

2. Where should pledge CTAs go?
   - Below the compact card (current approach adapted)
   - Inside the card on the right
   - In a separate section below

## Design

### Compact Profile Card Layout

```
┌─────────────────────────────────────────────────────────┐
│  ┌────┐                                                 │
│  │    │  Name                              [Share]      │
│  │ AV │  Role at Company                                │
│  └────┘                                                 │
│  ─────────────────────────────────────────────────────  │
│  [Pledge CTA or Status]                                 │
└─────────────────────────────────────────────────────────┘
```

### States

**Owner (pledger):**
- Shows "View My Pledge" button
- Blue ring around avatar

**Owner (non-pledger):**
- Shows "Take the Pledge" CTA

**Visitor (viewing pledger):**
- Shows "View their pledge →" link
- Blue ring around avatar

**Visitor (viewing non-pledger):**
- No pledge section

## Implementation

### Files to Modify
- `src/app/pages/profile-page.tsx` - Main profile page
- `src/app/pages/me-page.tsx` - Check if separate or redirects to profile-page

### New Components (optional)
- `src/app/components/profile/compact-profile-card.tsx` - Reusable card component

### Implementation Steps
1. Create compact profile card component
2. Update profile-page.tsx to use new layout
3. Ensure /me page uses same component
4. Add share button functionality
5. Test all states (owner/visitor × pledger/non-pledger)
6. Update any existing tests

## Acceptance Criteria

- [x] Profile card is compact (horizontal layout, ~150px height max)
- [x] Avatar on left (64px), name/role on right
- [x] Share button visible and functional
- [x] Pledge CTAs still work for all user states
- [x] Blue ring shows for pledgers
- [x] Responsive on mobile
- [x] Page has room for future content below card
- [x] Works on both /me and /p/:slug routes

## Future Enhancements (separate features)

- P76: Add metrics row (when we have the data)
- P77: Ideas feed on profile page
- P78: Events attended section
