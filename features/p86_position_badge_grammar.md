# P86: Position Badge Grammar Fix

## Problem

Position badges display grammatically incorrect text when showing the current user's stance:
- **Current:** "You Agrees" / "You Disagrees"
- **Expected:** "You Agree" / "You Disagree"

Screenshot evidence: Profile page showing "Point · You Agrees" on a PointCard.

## Root Cause

The [PositionBadge.tsx](../src/app/prototypes/linkedin-like/components/shared/PositionBadge.tsx#L32-45) component uses hardcoded third-person verb forms regardless of subject:

```tsx
const config = {
  agree: { label: 'Agrees', ... },    // Always third-person
  disagree: { label: 'Disagrees', ... },
  dont_know: { label: 'Unsure', ... },
};
```

When `isCurrentUser={true}`, it renders "You Agrees" instead of "You Agree".

## Solution

Make labels context-aware based on `isCurrentUser` prop:

| Position | isCurrentUser=true | isCurrentUser=false |
|----------|-------------------|---------------------|
| agree | "Agree" | "Agrees" |
| disagree | "Disagree" | "Disagrees" |
| dont_know | "Unsure" | "Unsure" |

## Files to Modify

### Primary (P0)

1. **[PositionBadge.tsx](../src/app/prototypes/linkedin-like/components/shared/PositionBadge.tsx)**
   - Add context-aware label selection based on `isCurrentUser`
   - Keep existing color logic (already correct per design system)

### Secondary (P1) - Review Only

2. **[EngagerList.tsx](../src/app/prototypes/converged/components/shared/EngagerList.tsx#L96)**
   - Currently shows "Alice (Agrees)" - third-person is correct here
   - No change needed, but verify during testing

3. **[shared/utils.ts](../src/app/prototypes/shared/utils.ts#L74-81)**
   - `getPositionLabel()` returns third-person forms
   - Consider adding `getPositionLabelForSubject()` if needed elsewhere
   - May not be necessary if only PositionBadge needs fixing

## Implementation

### Step 1: Update PositionBadge

```tsx
// Replace hardcoded labels with context-aware function
const getLabel = (position: PositionType, isYou: boolean) => {
  const labels = {
    agree: isYou ? 'Agree' : 'Agrees',
    disagree: isYou ? 'Disagree' : 'Disagrees',
    dont_know: 'Unsure',
  };
  return labels[position];
};

// In render:
const label = getLabel(position, isCurrentUser);
```

### Step 2: Verify All Usage Sites

| Component | Usage | Expected Output |
|-----------|-------|-----------------|
| PointCard | `isCurrentUser={isCurrentUserProfile}` | "You Agree" on own profile |
| PointCard | `isCurrentUser={false}` | "Alice Agrees" on other profile |
| StoryCard | `isCurrentUser={story.authorId === currentUser.id}` | Same pattern |
| IdeaDetail | No name prop, just position | "Agrees" (standalone badge) |

## Test Scenarios

1. **Own profile, own Point** → "You Agree" (blue badge)
2. **Own profile, viewing other's position** → "Alice Agrees" (semantic color)
3. **Other's profile, their Point** → "Bob Disagrees" (semantic color)
4. **Other's profile, your position shown** → "You Disagree" (blue badge)
5. **Standalone badge (no name)** → "Agrees" (no subject)

## Design System Compliance

Per [design-system.md](../docs/design-system.md#L150-164):
- Blue = "Your" content/status ✓ (already implemented)
- Gray = "Other person's" content/status ✓ (already implemented)
- Grammar fix aligns with semantic distinction

## Acceptance Criteria

- [ ] "You Agree" displays correctly (not "You Agrees")
- [ ] "You Disagree" displays correctly (not "You Disagrees")
- [ ] Third-person names still work: "Alice Agrees", "Bob Disagrees"
- [ ] Standalone badges (no name) still show "Agrees", "Disagrees"
- [ ] "Unsure" unchanged (no conjugation needed)
- [ ] No visual regressions in badge colors
- [ ] Pre-commit checks pass

## Scope

- **In scope:** Grammar fix for PositionBadge
- **Out of scope:**
  - Refactoring shared/utils.ts (unless needed)
  - Changes to converged prototype (uses different pattern)
  - Changes to TheirIdeas.tsx (already correct for third-person)
