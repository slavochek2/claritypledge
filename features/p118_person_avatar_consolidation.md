---
status: done
priority: medium
prepped_date: '2026-02-05'
completed_at: '2026-02-05'
reviews:
  ux: passed
  architect: passed-with-notes
  alignment: passed
decisions:
  - witnesses-keep-checkmark
  - avatarColor-optional-with-fallback
---

# P118: Person Avatar Consolidation

## Summary

Ensure pledge badge (blue ring) displays consistently everywhere a person's avatar appears. Create a single `PersonAvatar` component and canonical `PersonRef` type to make correct behavior the default.

## Problem

A person either has the pledge badge or they don't — it's intrinsic to them, not contextual. Currently:

- **Some places** use `GravatarAvatar` with `isPledger` prop → badge shows correctly
- **Many places** render inline `div`s → badge never shows

This causes visual inconsistency. Example: Event organizer avatar shows no badge even when the host has signed the pledge.

### Root Cause

No enforcement that avatar rendering goes through `GravatarAvatar`. Easy to create inline `div`s that bypass the design system.

## Solution

### 1. Canonical Type

Every person reference includes pledge status. TypeScript enforces completeness.

```typescript
// src/app/types/index.ts
interface PersonRef {
  name: string;
  slug?: string;
  avatarColor?: string;  // Optional — component defaults to #3B82F6
  avatarUrl?: string | null;
  hasPledged: boolean;   // ALWAYS present
}
```

### 2. Single Component

One component for rendering any person's avatar. Internally uses `GravatarAvatar`.

```typescript
// src/components/ui/person-avatar.tsx
interface PersonAvatarProps {
  person: PersonRef;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const DEFAULT_AVATAR_COLOR = '#3B82F6';

export function PersonAvatar({ person, size = "md", className }: PersonAvatarProps) {
  return (
    <GravatarAvatar
      name={person.name}
      avatarColor={person.avatarColor ?? DEFAULT_AVATAR_COLOR}
      photoUrl={person.avatarUrl}
      size={size}
      isPledger={person.hasPledged}
      className={className}
    />
  );
}
```

### 3. Data Layer Updates

Add `hasPledged` to event host queries only. Witnesses have their own badge treatment.

| Type | Change |
|------|--------|
| `EventWithHost` | Add `hostHasPledged: boolean` |
| `EventAttendee` | Already has `hasPledged` ✓ |

## Scope

**Production code only.** Prototypes are experimental — fix them opportunistically, not as part of this spec.

### Locations to Update

| File | Current | Change | Data Layer |
|------|---------|--------|------------|
| `EventDetail.tsx` | Inline div for organizer | Use `PersonAvatar` | events-service |
| `EventCard.tsx` | Inline div for attendee stack | Use `PersonAvatar` | events-service |
| `sign-pledge-page.tsx` | Inline div for signatories | Use `PersonAvatar` | api.ts |
| `clarity-tax-section.tsx` | Inline div for social proof | Use `PersonAvatar` | api.ts |

### Excluded from Scope

| Location | Reason |
|----------|--------|
| `witness-list.tsx` | Witnesses have their own badge (✓ checkmark for verification). Different semantic meaning — see Prep Notes. |
| `profile-visitor-view.tsx` | Same as above — witness avatars, not pledger avatars. |

## Implementation Steps

0. **Audit data layers** — Run grep to confirm which locations use `events-service-*.ts` vs `api.ts`
1. Add `PersonRef` type to `src/app/types/index.ts`
2. Create `PersonAvatar` component in `src/components/ui/person-avatar.tsx`
3. Add `hostHasPledged` to `EventWithHost` type
4. Update `events-service-real.ts` to fetch host pledge status
5. Update `events-service-mock.ts` to include mock pledge status
6. Convert 4 production locations to use `PersonAvatar`
7. Add test: "person with pledge shows ring"

## Testing

### Unit Test

```typescript
// person-avatar.test.tsx
describe('PersonAvatar', () => {
  it('shows blue ring when person has pledge', () => {
    render(<PersonAvatar person={{ ...mockPerson, hasPledged: true }} />);
    expect(screen.getByTestId('gravatar-avatar')).toHaveClass('ring-blue-500');
  });

  it('shows no ring when person has no pledge', () => {
    render(<PersonAvatar person={{ ...mockPerson, hasPledged: false }} />);
    expect(screen.getByTestId('gravatar-avatar')).not.toHaveClass('ring-blue-500');
  });

  it('uses default color when avatarColor not provided', () => {
    render(<PersonAvatar person={{ name: 'Test', hasPledged: false }} />);
    // Should render without error, using #3B82F6
  });
});
```

### Visual Verification

After implementation, verify these pages show badge consistently:
- [ ] Event detail page (organizer avatar)
- [ ] Event card (attendee stack)
- [ ] Sign pledge page (signatory avatars)
- [ ] Landing page social proof section

## Why This Approach

| Alternative | Why Not |
|-------------|---------|
| Lint rule for inline avatars | Requires maintenance, can be bypassed, doesn't fix data model |
| Fix each bug individually | Whack-a-mole, will regress |
| Trust developer discipline | Already failed — that's why we have this bug |
| Add pledge badge to witnesses | Different semantic: witnesses verify understanding, pledgers commit to clarity. Mixing badges creates confusion. |

**Make the right thing the easy thing.** `PersonAvatar` is simpler to use than inline divs once it exists.

## Success Criteria

1. `PersonRef` type exists with required `hasPledged`
2. `PersonAvatar` component is the standard way to render person avatars
3. All 4 production locations use `PersonAvatar`
4. Test verifies ring shows for pledgers
5. Visual QA confirms consistency across pages

## Out of Scope

- Prototype code (10+ locations) — fix opportunistically
- Refactoring `GravatarAvatar` internals — it works fine
- Adding pledge badge to non-avatar contexts (e.g., name text)
- Witness avatars — they have their own verification badge

---

## Prep Notes

### Decision: Witnesses Keep Checkmark

Witnesses show a ✓ checkmark badge (for "verified this person's understanding"), not a pledge ring. These are different semantics:

- **Pledge badge** = "I commit to clear communication" (trust signal)
- **Witness badge** = "I verified someone understood correctly" (verification signal)

A person could theoretically be both a pledger AND a witness, but we don't mix badges. In witness contexts, show the witness badge. In general person contexts, show the pledge badge.

### Decision: avatarColor Optional

`PersonRef.avatarColor` is optional. `PersonAvatar` defaults to `#3B82F6` (blue) when not provided. This keeps the API clean — callers don't need to handle fallbacks.

### Data Layer Note

Two data layers exist in parallel:
- `src/app/data/events-service-*.ts` — Interface-based, used by event pages
- `src/app/data/api.ts` — Legacy, used by sign-pledge-page, clarity-tax-section

Step 0 (audit) confirms which locations use which, preventing wasted work.
