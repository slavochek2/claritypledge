---
status: draft
created_date: 2026-01-19
created_by: TEA + Slava brainstorm
reviews:
  ux: pending
  architect: pending
  tea: pending
execution: /loop
---

# P76: Pledger Avatar Distinction

## Problem

Pledgers aren't visually distinguished across the app. When someone takes the Clarity Pledge, there's no consistent visual indicator that celebrates and identifies them as a pledger — except on their own profile page (P75 added a blue ring there).

**Current state:**
- Navigation avatar: No pledger indication
- Pledger cards (directory, landing): No pledger indication
- Profile page: Blue ring (P75) — but implemented inline, not reusable

**Desired state:**
- Consistent visual distinction everywhere avatars appear
- Single source of truth: `GravatarAvatar` component
- Blue ring + optional badge for pledgers

## Scope

### In Scope
- Enhance `GravatarAvatar` component with pledger ring + badge
- Update Navigation to show pledger status
- Update PledgerCard to show pledger ring
- Refactor CompactProfileCard to use `GravatarAvatar`
- Tests for all changes

### Out of Scope
- WitnessList refactor (can be P77)
- Prototype files (not production)
- Animations (keep it simple for v1)

## Design

### Visual Specification

```
Standard Avatar (non-pledger):
┌─────────┐
│  ┌───┐  │
│  │ AB│  │  ← Initials or photo
│  └───┘  │
└─────────┘

Pledger Avatar:
┌─────────┐
│ ╭─────╮ │
│ │ ┌───┐│ │  ← Blue ring (2px)
│ │ │ AB││ │
│ │ └───┘│ │
│ ╰─────╯✓│  ← Optional badge (bottom-right)
└─────────┘
```

### Component API

```tsx
interface GravatarAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  avatarColor?: string;
  photoUrl?: string;
  className?: string;
  // NEW PROPS
  isPledger?: boolean;       // Shows blue ring around avatar
  showPledgeBadge?: boolean; // Shows small checkmark badge
}
```

### Size-Specific Styling

| Size | Avatar | Ring Width | Badge Size |
|------|--------|------------|------------|
| sm (40px) | w-10 h-10 | 2px | 12px |
| md (56px) | w-14 h-14 | 2px | 14px |
| lg (64px) | w-16 h-16 | 3px | 16px |

### Colors (Design System)

- Ring: `ring-2 ring-blue-500` (or `ring-3` for lg)
- Badge background: `bg-blue-500`
- Badge icon: White checkmark

## Implementation

### Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `src/components/ui/gravatar-avatar.tsx` | Add ring + badge props | P0 |
| `src/app/components/layout/simple-navigation.tsx` | Pass `isPledger` | P0 |
| `src/app/components/social/pledger-card.tsx` | Pass `isPledger={true}` | P0 |
| `src/app/components/profile/compact-profile-card.tsx` | Refactor to use GravatarAvatar | P1 |

### Implementation Steps

1. **Update GravatarAvatar** — Add `isPledger` and `showPledgeBadge` props
2. **Write tests** for new props
3. **Update SimpleNavigation** — Pass `isPledger={user?.hasPledged}`
4. **Update PledgerCard** — Pass `isPledger={true}` (all are pledgers by definition)
5. **Refactor CompactProfileCard** — Replace inline avatar with GravatarAvatar
6. **Visual verification** — Check all locations in browser
7. **Update existing tests** if needed

### Code Example

```tsx
// gravatar-avatar.tsx - enhanced
export function GravatarAvatar({
  name,
  size = "md",
  avatarColor = "#0044CC",
  className = "",
  photoUrl,
  isPledger = false,
  showPledgeBadge = false,
}: GravatarAvatarProps) {
  const ringClass = isPledger
    ? size === "lg" ? "ring-3 ring-blue-500" : "ring-2 ring-blue-500"
    : "";

  return (
    <div className="relative inline-block">
      <div className={`rounded-full ${ringClass} ${sizeClasses[size]} ${className}`}>
        {/* existing avatar logic */}
      </div>
      {showPledgeBadge && (
        <div className="absolute -bottom-0.5 -right-0.5 bg-blue-500 rounded-full p-0.5">
          <CheckIcon className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
}
```

## Acceptance Criteria

- [ ] GravatarAvatar supports `isPledger` prop showing blue ring
- [ ] GravatarAvatar supports `showPledgeBadge` prop showing checkmark
- [ ] Navigation avatar shows ring when user is a pledger
- [ ] PledgerCard avatars show ring (all cards are pledgers)
- [ ] CompactProfileCard uses GravatarAvatar (not inline code)
- [ ] All sizes (sm/md/lg) render correctly
- [ ] Works with both photo URLs and initials fallback
- [ ] Unit tests cover new props
- [ ] No visual regressions in existing avatar usages

## Testing Strategy

### Unit Tests
- GravatarAvatar with `isPledger={true}` has ring class
- GravatarAvatar with `isPledger={false}` has no ring class
- Badge renders when `showPledgeBadge={true}`
- Badge hidden when `showPledgeBadge={false}` (default)

### Visual Verification (Playwright MCP)
- Navigation: logged-in pledger shows ring
- Pledgers page: all cards show ring
- Profile page: compact card shows ring for pledger
- Mobile: ring visible at small sizes

## Future Enhancements

- P77: Refactor WitnessList to use GravatarAvatar
- P78: Add subtle pulse animation on first view
- P79: "Founding Pledger" variant for early adopters
