---
status: all-done
type: story
tags: []
rank: 125456.0
created_date: 2026-02-04
completed_at: '2026-02-09'
---

# P116: Story & Point Detail Pages — Match Prototype Design

---
status: all-done
completed_at: '2026-02-05'
prepped_date: 2026-02-04
reviews:
  ux: passed-with-notes
  architect: passed-with-notes
  alignment: passed
---

## Context

We migrated story/point navigation from prototype routes (`/prototype/linkedin-like/story/:id`) to main app routes (`/story/:id`, `/point/:id`). The navigation works, but the new pages are visually simplified compared to the prototype.

**Problem:** Users clicking stories/points from profiles now see a degraded experience compared to the prototype. The prototype has richer UI (credibility counts, Clarity Sessions, interactive position buttons) that we lost in the migration.

**Root cause:** Instead of reusing the prototype's battle-tested components, we created new simplified versions. This was faster initially but created visual/functional debt.

## Decision

**Fork prototype components** to `src/app/components/social/` and refactor to accept data via props.

Why fork instead of reuse directly:
- Prototype components hard-import mock-data functions — they don't accept data via props
- Wrapper/adapter approaches are fragile (import hacks) or complex (dependency injection)
- The prototype is effectively dead after this migration — clean ownership is better
- Forked components can be refactored to work with real backend data later

## Current State (What We Have)

### Story Detail Page (`/story/:id`)
- ✅ Blue left border on story card
- ✅ Author avatar + name (links to profile)
- ✅ Story text
- ✅ Basic verification stats
- ✅ Linked Points section (simple cards)
- ✅ Author credibility count (👂 N)
- ❌ Missing: Visibility icon (deferred — cosmetic)
- ✅ "X understood" badge (expandable)
- ✅ Thread lines on linked points
- ✅ Interactive position buttons on points
- ✅ **Clarity Sessions section** (verification history)

### Point Detail Page (`/point/:id`)
- ✅ Gray left border on point card
- ✅ Position buttons (Disagree/Unsure/Agree)
- ✅ Filter tabs (Agree/Disagree/Unsure)
- ✅ Position holders with stories
- ✅ "No story yet" for position-only users
- ✅ Pin icon before point text
- ✅ Share button
- ✅ Author credibility counts
- ✅ Full story text (currently truncated)
- ✅ Role/date on story cards

## Target State (Match Prototype)

### Story Detail Page
- Full story card with all metadata (credibility, visibility icon)
- Expandable linked points section with thread lines
- Interactive position buttons on each point
- **Clarity Sessions section** showing verification history

### Point Detail Page
- Point card with pin icon, share button
- Full story cards (not truncated) for position holders
- Author credibility, role, date on all cards

## Implementation Approach

### Strategy: Fork and Refactor

1. **Copy components** from `src/app/prototypes/linkedin-like/components/` to `src/app/components/social/`
2. **Refactor to accept data via props** instead of importing from mock-data
3. **Update detail pages** to use forked components with profile-based data

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/app/components/social/StoryCardDetail.tsx` | Fork from prototype `StoryCard.tsx`, refactor props |
| `src/app/components/social/PointCardDetail.tsx` | Fork from prototype `PointCard.tsx`, refactor props |
| `src/app/components/social/ClaritySessions.tsx` | Fork from prototype `StoryDetail.tsx` (just the section) |
| `src/app/pages/story-detail-page.tsx` | Use forked components |
| `src/app/pages/point-detail-page.tsx` | Use forked components |

### Component Props Pattern

Forked components should accept data explicitly:

```typescript
interface StoryCardDetailProps {
  story: Story;
  author: User;
  authorCredibility: { ear: number; mic: number };
  linkedPoints: Point[];
  isDetailView?: boolean;
  // ... other UI props
}
```

This removes the hard dependency on mock-data imports and prepares for real backend data.

## Acceptance Criteria

### Story Detail Page
- [x] Shows story card with full metadata (credibility, understood badge — visibility icon deferred)
- [x] Linked Points section has thread lines and is expandable
- [x] Each linked point has interactive position buttons
- [x] Clarity Sessions section shows verification history
- [x] "X understands Y" entries with rating dots
- [x] "Across disagreement" indicator where applicable
- [x] Back button returns to previous page
- [x] Author name/avatar links to profile

### Point Detail Page
- [x] Shows point card with pin icon and share button
- [x] Position buttons are interactive
- [x] Filter tabs work (Agree/Disagree/Unsure)
- [x] Story cards show full text, author credibility, role, date
- [x] Position-only rows show credibility and role
- [x] Clicking a story navigates to `/story/:id`
- [x] Back button returns to previous page

### States (UX requirement)
- [x] **Loading:** Skeleton loaders while fetching story/point data
- [x] **Error:** "Story not found" / "Point not found" with back button
- [x] **Empty:** "No verifications yet" for Clarity Sessions, counts on filter tabs
- [x] **Unauthenticated:** Position buttons show disabled with "Sign in to share your position" tooltip

### Visual Verification
- [x] Screenshot comparison: story detail matches prototype
- [x] Screenshot comparison: point detail matches prototype
- [ ] Mobile viewport looks correct at 375px width
- [ ] Mobile viewport looks correct at 320px width (position buttons don't squish)

## Out of Scope

- Real data (still using mock data)
- Backend API integration
- Database schema for stories/points
- Creating new stories/points (read-only for now)

## Post-Implementation

- [ ] Add "Clarity Sessions" definition to `docs/definitions.md`
- [ ] Run `/kdd` to capture component fork decision

## Related

- P115: Navigation and Data Fixes (predecessor — fixed routing)
- P113: Prototype Promotion (original prototype work)
- Prototype source: `src/app/prototypes/linkedin-like/`
