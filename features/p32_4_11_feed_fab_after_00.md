# P32.4_11: Feed FAB (Floating Action Button)

**Status:** Ready for Implementation
**Depends On:** P32.4_00 (uses CreateIdeaModal)
**Can Run In Parallel With:** P32.4_06
**Estimated Time:** 30 minutes

---

## Purpose

Add FAB (Floating Action Button) to Feed for creating new ideas.

**Addresses:** Critique #2 - "Share input → Removed (use FAB)"

---

## What Changed from P32.3

### Before (P32.3):
```
Feed Header:
┌──────────────────────────────────┐
│ [Clarity]           [🔔 2] [@]   │
│ [Search bar..................]   │
│ [Share an idea...............]   │  ← Remove this
└──────────────────────────────────┘
```

### After (P32.4_11):
```
Feed Header:
┌──────────────────────────────────┐
│ [Clarity]           [🔔 2] [@]   │
│ [🔍]                             │
└──────────────────────────────────┘

Feed:
┌──────────────────────────────────┐
│ [Idea cards...]                  │
│                                  │
│                            [+]   │  ← FAB (floating)
└──────────────────────────────────┘
```

---

## Files to Modify

### `Feed.tsx`

**Add FAB to Feed:**

```tsx
import { Plus } from 'lucide-react';
import { CreateIdeaModal } from '../components/CreateIdeaModal';

export function Feed() {
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Feed Header */}
      <FeedHeader />

      {/* Story Circles */}
      <StoryCircles />

      {/* Feed Content */}
      <div className="pb-24">
        {ideas.map(idea => (
          <IdeaCard key={idea.id} idea={idea} />
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-600 transition-all hover:scale-110 active:scale-95"
        aria-label="Create new idea"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Create Idea Modal */}
      {showCreateModal && (
        <CreateIdeaModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onIdeaCreated={(ideaId) => {
            console.log('New idea created:', ideaId);
            setShowCreateModal(false);
            // Idea appears in feed automatically via mock data
          }}
        />
      )}
    </div>
  );
}
```

---

## Styling Details

### FAB Position
- **Mobile:** `bottom-20` (80px from bottom to avoid nav bar)
- **Mobile:** `right-4` (16px from right edge)
- **Desktop:** Consider `bottom-8` (32px from bottom)
- **z-index:** Higher than feed cards, lower than modals

### FAB States
```tsx
// Default
className="bg-blue-500 text-white shadow-lg"

// Hover (desktop)
className="hover:bg-blue-600 hover:scale-110"

// Active (tap)
className="active:scale-95"

// Focus (keyboard)
className="focus:outline-none focus:ring-4 focus:ring-blue-300"
```

### Animation
```css
/* Optional: FAB entrance animation */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fab {
  animation: fadeInUp 0.3s ease-out;
}
```

---

## Behavior

### FAB Action
1. User scrolls feed
2. Taps FAB (+)
3. CreateIdeaModal opens
4. User creates idea
5. Modal closes
6. New idea appears at top of feed (mock data update)
7. FAB remains visible

### Scroll Behavior
- FAB is **always visible** (doesn't hide on scroll)
- Stays fixed in bottom-right corner
- Always accessible for quick idea creation

---

## Mock Data Integration

After idea creation, prepend new idea to feed:

```tsx
// In CreateIdeaModal's onIdeaCreated callback
function handleIdeaCreated(ideaId: string) {
  const newIdea = getIdeaById(ideaId);

  // Update feed state to show new idea at top
  setIdeas(prev => [newIdea, ...prev]);

  setShowCreateModal(false);
}
```

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| FAB while modal open | Modal open = FAB not clickable (z-index) |
| Mobile keyboard open | FAB above keyboard (CSS `bottom` accounts for this) |
| Desktop | FAB in same position (consistent) |
| Empty feed | FAB still visible |
| FAB overlaps last card | Feed has `pb-24` padding to prevent overlap |
| User creates idea while scrolled down | New idea appears at top, user stays at current scroll position |
| Tap FAB rapidly | Only one modal opens (state guard) |

---

## Accessibility

```tsx
<button
  onClick={() => setShowCreateModal(true)}
  className="..."
  aria-label="Create new idea"
  role="button"
>
  <Plus className="w-6 h-6" aria-hidden="true" />
</button>
```

- **aria-label**: "Create new idea"
- **role**: "button"
- **keyboard**: Enter/Space opens modal
- **focus**: Blue ring on focus (keyboard nav)

---

## Tests That Must Pass

### P1 (Critical)
- [ ] FAB visible on Feed page
- [ ] FAB in correct position (bottom-right)
- [ ] Tap FAB → CreateIdeaModal opens
- [ ] Can create idea from FAB
- [ ] New idea appears at top of feed
- [ ] FAB doesn't overlap last card (pb-24 padding)
- [ ] Mobile: FAB above nav bar
- [ ] Desktop: FAB in same position
- [ ] Keyboard: Enter/Space opens modal

### P2 (Polish)
- [ ] FAB hover state (scale-110)
- [ ] FAB active state (scale-95)
- [ ] FAB entrance animation (optional)
- [ ] Shadow renders correctly

---

## Done When

- [ ] FAB added to Feed.tsx
- [ ] FAB positioned correctly (bottom-20 right-4)
- [ ] Tap FAB opens CreateIdeaModal
- [ ] New ideas appear at top of feed
- [ ] Feed padding prevents overlap (pb-24)
- [ ] All P1 tests pass
- [ ] Works on mobile and desktop
- [ ] No console errors

---

## Design Reference

**Visual:** FAB matches critique image references showing blue circular button with + icon

**Inspiration:** Similar to Twitter/X compose button, Instagram create button

---

## Run Command

```bash
/loop "Implement P32.4_11 per @features/p32_4_11_feed_fab_after_00.md"
```
