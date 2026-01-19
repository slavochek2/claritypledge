---
status: prepped
prepped_date: 2026-01-19
prepped_by: /prep-spec
created_date: 2026-01-19
created_by: TEA + Slava brainstorm
reviews:
  ux: passed
  architect: passed
  tea: skipped
execution: /loop
findings:
  blockers: 0 (accessibility resolved in revision)
  warnings: 5
  suggestions: 6
revised: 2026-01-19 (added badge, animation, accessibility)
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
- Enhance `GravatarAvatar` component with pledger ring + badge + subtle animation
- Update Navigation to show pledger status (ring + badge)
- Update PledgerCard to show pledger ring + badge
- Refactor CompactProfileCard to use `GravatarAvatar`
- Tests for all changes

### Out of Scope
- WitnessList refactor (can be P77)
- Prototype files (not production)

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
- Ring glow: `shadow-[0_0_8px_rgba(59,130,246,0.3)]`
- Badge background: `bg-blue-500`
- Badge icon: White checkmark

### Animation

**Ring glow pulse** — Very subtle, barely noticeable shadow that breathes in/out.

```css
/* Add to tailwind.config.js */
animation: {
  'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
}
keyframes: {
  'glow-pulse': {
    '0%, 100%': { boxShadow: '0 0 8px rgba(59, 130, 246, 0.3)' },
    '50%': { boxShadow: '0 0 12px rgba(59, 130, 246, 0.5)' },
  }
}
```

- Animation runs continuously but is so subtle it's not distracting
- 3-second cycle keeps it calm
- Only applies to pledger avatars (`isPledger={true}`)

## Implementation

### Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `tailwind.config.js` | Add `glow-pulse` animation keyframes | P0 |
| `src/components/ui/gravatar-avatar.tsx` | Add ring + badge + animation props | P0 |
| `src/app/components/layout/simple-navigation.tsx` | Pass `isPledger` + `showPledgeBadge` | P0 |
| `src/app/components/social/pledger-card.tsx` | Pass `isPledger={true}` + `showPledgeBadge` | P0 |
| `src/app/components/profile/compact-profile-card.tsx` | Refactor to use GravatarAvatar | P1 |

### Implementation Steps

1. **Add animation to Tailwind config** — Add `glow-pulse` keyframes
2. **Update GravatarAvatar** — Add `isPledger`, `showPledgeBadge` props with ring, badge, animation
3. **Write tests** for new props
4. **Update SimpleNavigation** — Pass `isPledger={hasPledged}` and `showPledgeBadge={hasPledged}` (use hook's `hasPledged`)
5. **Update PledgerCard** — Pass `isPledger={true}` and `showPledgeBadge={true}` (all are pledgers)
6. **Refactor CompactProfileCard** — Replace inline avatar with GravatarAvatar
7. **Visual verification** — Check all locations in browser, verify animation is subtle
8. **Update existing tests** if needed

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
    ? size === "lg"
      ? "ring-3 ring-blue-500 animate-glow-pulse"
      : "ring-2 ring-blue-500 animate-glow-pulse"
    : "";

  return (
    <div className="relative inline-block">
      <div className={`rounded-full ${ringClass} ${sizeClasses[size]} ${className}`}>
        {/* existing avatar logic */}
      </div>
      {showPledgeBadge && (
        <div
          className="absolute -bottom-0.5 -right-0.5 bg-blue-500 rounded-full p-0.5"
          aria-label="Verified pledger"
        >
          <CheckIcon className="w-3 h-3 text-white" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
```

## Acceptance Criteria

- [ ] GravatarAvatar supports `isPledger` prop showing blue ring with glow animation
- [ ] GravatarAvatar supports `showPledgeBadge` prop showing checkmark badge
- [ ] Badge has `aria-label="Verified pledger"` for accessibility
- [ ] Navigation avatar shows ring + badge when user is a pledger
- [ ] PledgerCard avatars show ring + badge (all cards are pledgers)
- [ ] CompactProfileCard uses GravatarAvatar (not inline code)
- [ ] All sizes (sm/md/lg) render correctly
- [ ] Works with both photo URLs and initials fallback
- [ ] Animation is subtle (3s cycle, barely noticeable glow pulse)
- [ ] Unit tests cover new props
- [ ] No visual regressions in existing avatar usages

## Testing Strategy

### Unit Tests
- GravatarAvatar with `isPledger={true}` has ring class and animation class
- GravatarAvatar with `isPledger={false}` has no ring class
- Badge renders when `showPledgeBadge={true}` with aria-label
- Badge hidden when `showPledgeBadge={false}` (default)
- Badge has correct accessibility attributes

### Visual Verification (Playwright MCP)
- Navigation: logged-in pledger shows ring + badge + animation
- Pledgers page: all cards show ring + badge
- Profile page: compact card shows ring for pledger
- Mobile: ring and badge visible at small sizes
- Animation: subtle glow pulse visible but not distracting

## Future Enhancements

- P77: Refactor WitnessList to use GravatarAvatar
- P78: "Founding Pledger" variant for early adopters
