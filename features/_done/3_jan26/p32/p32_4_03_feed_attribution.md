# P32.4_03: Feed Attribution ("Why Am I Seeing This?")

**Status:** Ready for Implementation
**Depends On:** None
**Can Run In Parallel With:** P32.4_01, P32.4_02
**Estimated Time:** 30 minutes

---

## Purpose

Add attribution line to idea cards showing WHO engaged and WHY you're seeing this idea.

**Addresses critique #13:** "In feed it should be clear why I see a specific idea"

---

## What Changed from P32.3

### Before:
```
┌────────────────────────────────────────┐
│ Remote work is more productive...     │
│ [✓ Agree] [✗ Disagree] [? Unsure]    │
└────────────────────────────────────────┘
```

### After:
```
┌────────────────────────────────────────┐
│ 👥 3 from My Network engaged           │  ← NEW
│                                        │
│ Remote work is more productive...     │
│ [✓ Agree] [✗ Disagree] [? Unsure]    │
└────────────────────────────────────────┘
```

---

## Files to Modify

### `IdeaCard.tsx`

**Add attribution line at top of card:**

```tsx
export function IdeaCard({ idea, currentUserPosition, onPositionChange }: IdeaCardProps) {
  const attribution = getIdeaAttribution(idea);

  return (
    <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
      {/* Attribution line */}
      {attribution && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
          <Users className="w-4 h-4" />
          <span>{attribution}</span>
        </div>
      )}

      {/* Idea text */}
      <p className="text-base text-gray-900 mb-4">{idea.text}</p>

      {/* Rest of card... */}
    </div>
  );
}
```

---

## Mock Data Updates

### Add helper function:

```tsx
export function getIdeaAttribution(idea: Idea): string | null {
  // Get engagements from My Network (excluding current user)
  const networkEngagements = idea.engagements.filter(
    e => e.userId !== 'current' && users.some(u => u.id === e.userId)
  );

  if (networkEngagements.length === 0) {
    return null; // No attribution needed (you created this idea)
  }

  const count = networkEngagements.length;

  if (count === 1) {
    const user = users.find(u => u.id === networkEngagements[0].userId);
    const position = networkEngagements[0].position;
    return `${user?.name} ${getPositionVerb(position)}`;
  }

  return `${count} from My Network engaged`;
}

function getPositionVerb(position: Position): string {
  switch (position) {
    case 'agree': return 'agreed';
    case 'disagree': return 'disagreed';
    case 'unsure': return 'marked unsure';
    default: return 'engaged';
  }
}
```

---

## Attribution Logic

### Rules:

**If 0 network engagements:**
- No attribution line (you created this)

**If 1 network engagement:**
- "Alice Chen agreed"
- "Bob Smith disagreed"
- "Carol Davis marked unsure"

**If 2+ network engagements:**
- "2 from My Network engaged"
- "5 from My Network engaged"

### Future (when groups implemented):
- "3 from Work Team engaged"
- "8 from Book Club engaged"

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Only current user engaged | No attribution line |
| 1 person engaged | "{Name} {agreed/disagreed/marked unsure}" |
| Multiple people | "{N} from My Network engaged" |
| Person not in your network | Don't show (shouldn't happen in MVP) |
| Filter = "My Network" | Always show attribution |
| Filter = "All Ideas" | Show attribution |

---

## Visual Design

### Attribution line style:

```tsx
// Container
display: flex
alignItems: center
gap: 8px
fontSize: 14px (text-sm)
color: gray-600
marginBottom: 12px

// Icon (Users)
width: 16px
height: 16px
color: gray-500

// Text
fontWeight: 400 (normal)
```

---

## Mock Data Expansion

Add more engagements to test multi-person attribution:

```tsx
// In mock-data.ts, update idea-1:
{
  id: 'idea-1',
  text: 'Remote work is more productive than office work for knowledge workers',
  createdAt: '2024-01-15T10:00:00Z',
  engagements: [
    { id: 'e1', ideaId: 'idea-1', userId: 'alice', position: 'agree', ... },
    { id: 'e2', ideaId: 'idea-1', userId: 'bob', position: 'disagree', ... },
    { id: 'e3', ideaId: 'idea-1', userId: 'carol', position: 'agree', ... },
    // Now 3 people from network engaged → "3 from My Network engaged"
  ],
  ...
}
```

---

## Tests That Must Pass

### P1 (Critical)
- [ ] Attribution shows on idea cards
- [ ] Single person: "{Name} agreed/disagreed/marked unsure"
- [ ] Multiple people: "{N} from My Network engaged"
- [ ] No attribution when only current user engaged
- [ ] Icon + text aligned properly
- [ ] Mobile: fits on one line (no wrap)

### P2 (Polish)
- [ ] Hover on attribution shows who engaged (modal/tooltip)
- [ ] Tappable to see engagement breakdown

---

## Done When

- [ ] IdeaCard updated with attribution line
- [ ] getIdeaAttribution() helper in mock-data.ts
- [ ] All P1 tests pass
- [ ] Attribution visible on mobile and desktop
- [ ] No layout shift
- [ ] No console errors

---

## Notes

- Keep it simple: just the text, no interactive elements (yet)
- Hover/tap interaction can come in P2 story
- Focus on clarity: user immediately knows WHY they see this idea

---

## Run Command

```bash
/loop "Implement P32.4_03 per @features/p32_4_03_feed_attribution.md"
```
