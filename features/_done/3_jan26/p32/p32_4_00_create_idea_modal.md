# P32.4_00: Create Idea Modal (Foundation)

**Status:** Ready for Implementation
**Depends On:** None
**Blocks:** P32.4_06, P32.4_10, P32.4_11
**Estimated Time:** 30 minutes

---

## Purpose

Create a reusable `CreateIdeaModal` component that will be used by:
- Feed FAB (P32.4_11)
- Chat + button (P32.4_06)
- Live session (P32.4_10)

This is a foundational component with no dependencies.

---

## What Changed from P32.3

**Before:** `CreateIdea.tsx` was part of Feed component
**After:** Standalone modal component, reusable across app

---

## Component Spec

### File Location
```
src/app/prototypes/converged/components/CreateIdeaModal.tsx
```

### Component Interface

```tsx
interface CreateIdeaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIdeaCreated?: (ideaId: string) => void;
  prefillText?: string; // For "create from message"
  defaultPosition?: 'agree' | 'disagree' | 'unsure'; // Default: 'agree'
}

export function CreateIdeaModal({
  isOpen,
  onClose,
  onIdeaCreated,
  prefillText = '',
  defaultPosition = 'agree',
}: CreateIdeaModalProps) {
  // Implementation
}
```

---

## Layout (Mobile-First)

### Mobile (375px)

```
┌────────────────────────────────────────────────────┐
│  New Idea                                    [✕]  │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │                                              │ │
│  │ [Text area - 4 rows minimum]                │ │
│  │ "Remote work is more productive..."         │ │
│  │                                              │ │
│  │                                              │ │
│  │                                              │ │
│  │                                     240 / 280│ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  My position on this idea:                         │
│  ● Agree   ○ Disagree   ○ Unsure                  │
│                                                    │
│  [          Post Idea          ]                   │
└────────────────────────────────────────────────────┘
```

**Key elements:**
- Modal overlay (backdrop blur)
- Close button (X) top-right
- Text area with character counter (280 max)
- Position selector (radio buttons)
- Post button (primary, full-width on mobile)

### Desktop (≥768px)

- Modal centered, max-width 500px
- Post button fixed-width 200px, right-aligned
- Same layout otherwise

---

## Behavior

### Default State
- Text area: Empty (or prefilled if `prefillText` provided)
- Position: "Agree" selected by default (or `defaultPosition`)
- Post button: Disabled until text entered

### User Flow

**1. User types idea**
- Text area expands to content (max 5 rows before scroll)
- Character counter updates: "240 / 280"
- Post button enables when text.length > 0

**2. User selects position**
- Only one can be selected (radio group)
- Default: Agree

**3. User taps "Post Idea"**
- Show loading state on button ("Posting...")
- Create idea in mock data
- Call `onIdeaCreated(ideaId)` callback
- Close modal
- (If in Feed: scroll to top, show new idea)

**4. User taps X or outside modal**
- If text.length > 10: Show "Discard draft?" confirmation
- If text.length ≤ 10: Close immediately

---

## Edge Cases (P1 - Must Handle)

| Scenario | Expected Behavior |
|----------|------------------|
| Empty text | Post button disabled, show hint "Write your idea" |
| Text > 280 chars | Counter turns red, Post button disabled, show "Too long" |
| User taps outside modal | Confirm discard if text > 10 chars |
| Network fails (future) | Show "Saving..." spinner, queue for retry |
| Duplicate idea | (P2 - defer) Show warning, allow anyway |

---

## Mock Data Integration

### Add to `mock-data.ts`:

```tsx
export function createIdea(text: string, position: Position): Idea {
  const newIdea: Idea = {
    id: `idea-${Date.now()}`,
    text: text.trim(),
    createdAt: new Date().toISOString(),
    engagements: [
      {
        id: `e-${Date.now()}`,
        ideaId: `idea-${Date.now()}`,
        userId: 'current',
        position,
        timestamp: new Date().toISOString(),
        isVerified: false,
      },
    ],
    comments: [],
  };

  ideas.unshift(newIdea); // Add to beginning
  return newIdea;
}
```

---

## Accessibility

- Modal traps focus (can't tab outside)
- Escape key closes modal (with confirmation if needed)
- Text area auto-focuses on open
- Radio buttons keyboard navigable (arrow keys)

---

## Tests That Must Pass

### P1 (Critical)
- [ ] Can open modal
- [ ] Can type idea text
- [ ] Post button disabled when empty
- [ ] Post button disabled when > 280 chars
- [ ] Can select position (Agree/Disagree/Unsure)
- [ ] Can post idea (creates in mock data)
- [ ] onIdeaCreated callback fires
- [ ] Modal closes after post
- [ ] Can close modal with X
- [ ] Can close modal with Escape key

### P2 (Polish)
- [ ] Character counter updates live
- [ ] Discard confirmation shows if text > 10 chars
- [ ] Focus trapped in modal
- [ ] Text area auto-focuses on open

---

## Style Tokens

```tsx
// Spacing
padding: 20px (mobile), 24px (desktop)
gap: 16px between elements

// Text area
minHeight: 120px
maxHeight: 200px (before scroll)
fontSize: 16px (mobile), 14px (desktop)
lineHeight: 1.5

// Character counter
fontSize: 13px
color: gray-500 (default), red-500 (over limit)

// Post button
height: 44px (mobile), 40px (desktop)
borderRadius: 8px
```

---

## Done When

- [ ] Modal component created at correct path
- [ ] All P1 tests pass
- [ ] Works on mobile (375px) and desktop (≥768px)
- [ ] Can be imported and used by other components
- [ ] `createIdea()` helper in mock-data.ts
- [ ] No console errors
- [ ] Clean, readable code

---

## Notes

- This component does NOT include "From my ideas" picker (that's in P32.4_06)
- This component does NOT handle chat context (that's in P32.4_06)
- Keep it simple: text input + position selector + post button
- Refer to [white/new idea.png](../docs/inspiration/white/new%20idea.png) for visual reference

---

## Run Command

```bash
/loop "Create P32.4_00 per @features/p32_4_00_create_idea_modal.md"
```
