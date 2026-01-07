# P32.4_04: Idea Card Stats Redesign + ReactionsModal

**Status:** Ready for Implementation
**Depends On:** P32.4_01, P32.4_02, P32.4_03 (to avoid conflicts)
**Blocks:** P32.4_05 (Profile uses IdeaCard pattern)
**Estimated Time:** 1 hour

---

## Purpose

Move stats ABOVE position buttons and make them clickable to show WHO reacted.

**Addresses critique #4:** "Move numbers from buttons - stats above, clickable"

---

## What Changed from P32.3

### Before (P32.3):
```
┌────────────────────────────────────────┐
│ Remote work is more productive...     │
│                                        │
│ [✓ Agree (2)] [✗ Disagree (2)] [? (1)]│  ← Counts inside
│ ⟳ 3 verified · ✦ 1 cross-disagreement │
└────────────────────────────────────────┘
```

### After (P32.4_04):
```
┌────────────────────────────────────────┐
│ 👥 3 from My Network engaged           │
│                                        │
│ Remote work is more productive...     │
│                                        │
│ 👍 12    👎 5    ❓ 3                   │  ← Clickable stats
│                                        │
│ [✓ Agree]  [✗ Disagree]  [? Unsure]   │  ← Clean buttons
│                                        │
│ ✦ 1 cross-verified  💬 2    Jan 15    │
└────────────────────────────────────────┘
```

---

## Files to Modify

### `IdeaCard.tsx`

**New layout:**

```tsx
export function IdeaCard({ idea, currentUserPosition, onPositionChange }: IdeaCardProps) {
  const [showReactions, setShowReactions] = useState(false);
  const stats = getIdeaStats(idea);

  return (
    <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200">
      {/* Attribution */}
      <Attribution idea={idea} />

      {/* Idea text */}
      <p className="text-base text-gray-900 mb-4">{idea.text}</p>

      {/* Stats row (clickable) */}
      <div className="flex items-center gap-6 mb-4">
        <button
          onClick={() => setShowReactions('agree')}
          className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600"
        >
          <ThumbsUp className="w-4 h-4" />
          <span className="font-medium">{stats.agree}</span>
        </button>

        <button
          onClick={() => setShowReactions('disagree')}
          className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600"
        >
          <ThumbsDown className="w-4 h-4" />
          <span className="font-medium">{stats.disagree}</span>
        </button>

        <button
          onClick={() => setShowReactions('unsure')}
          className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-blue-600"
        >
          <HelpCircle className="w-4 h-4" />
          <span className="font-medium">{stats.unsure}</span>
        </button>
      </div>

      {/* Position buttons (no counts) */}
      <div className="flex gap-3 mb-4">
        <PositionButton
          position="agree"
          active={currentUserPosition === 'agree'}
          onClick={() => onPositionChange(idea.id, 'agree')}
        />
        {/* ... other buttons */}
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          {stats.crossVerified > 0 && (
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              {stats.crossVerified} cross-verified
            </span>
          )}
          <span className="flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" />
            {stats.comments}
          </span>
        </div>
        <span>{formatDate(idea.createdAt)}</span>
      </div>

      {/* Reactions Modal */}
      {showReactions && (
        <ReactionsModal
          idea={idea}
          filter={showReactions}
          onClose={() => setShowReactions(false)}
        />
      )}
    </div>
  );
}
```

---

## New File: `ReactionsModal.tsx`

**Purpose:** Show WHO agreed/disagreed/unsure

```tsx
interface ReactionsModalProps {
  idea: Idea;
  filter: 'agree' | 'disagree' | 'unsure';
  onClose: () => void;
}

export function ReactionsModal({ idea, filter, onClose }: ReactionsModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const reactions = idea.engagements.filter(e => e.position === filter);

  // Simulate loading (remove in production with real data)
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">
            {filter === 'agree' && 'Agreed'}
            {filter === 'disagree' && 'Disagreed'}
            {filter === 'unsure' && 'Unsure'}
          </h3>
          <button onClick={onClose} aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            /* Loading skeleton */
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    <div className="h-3 bg-gray-200 rounded w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : reactions.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <HelpCircle className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">No one yet</p>
            </div>
          ) : (
            /* Loaded content */
            <div className="space-y-3">
              {reactions.map(engagement => {
                const user = getUserById(engagement.userId);
                return (
                  <div key={engagement.id} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-lg">{user?.avatar}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{user?.name}</p>
                      <p className="text-xs text-gray-500">{user?.role}</p>
                    </div>
                    {engagement.isVerified && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Mock Data Helper

```tsx
export interface IdeaStats {
  agree: number;
  disagree: number;
  unsure: number;
  verified: number;
  crossVerified: number;
  comments: number;
}

export function getIdeaStats(idea: Idea): IdeaStats {
  const stats = {
    agree: 0,
    disagree: 0,
    unsure: 0,
    verified: 0,
    crossVerified: 0,
    comments: idea.comments.length,
  };

  idea.engagements.forEach(e => {
    if (e.position === 'agree') stats.agree++;
    if (e.position === 'disagree') stats.disagree++;
    if (e.position === 'unsure') stats.unsure++;
    if (e.isVerified) stats.verified++;
    if (e.isCrossDisagreement) stats.crossVerified++;
  });

  return stats;
}
```

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Stats = 0 | Show "0" (still clickable) |
| No reactions for filter | Modal shows "No one yet" |
| User taps outside modal | Close modal |
| User presses Escape | Close modal |
| Modal on mobile | Slide up from bottom, 80vh max |
| Modal on desktop | Centered, max-width 500px |

---

## Tests That Must Pass

### P1 (Critical)
- [ ] Stats appear above buttons
- [ ] Buttons have NO counts inside them
- [ ] Tap stat → ReactionsModal opens with correct filter
- [ ] ReactionsModal shows correct people
- [ ] Verified badge shows on verified engagements
- [ ] Close modal with X button
- [ ] Close modal with backdrop tap
- [ ] Close modal with Escape key
- [ ] Mobile: modal slides from bottom
- [ ] Desktop: modal centered

---

## Done When

- [ ] IdeaCard updated with stats above buttons
- [ ] ReactionsModal component created
- [ ] getIdeaStats() helper in mock-data.ts
- [ ] All P1 tests pass
- [ ] Clean, readable code
- [ ] No console errors

---

## Run Command

```bash
/loop "Implement P32.4_04 per @features/p32_4_04_idea_card_stats_redesign.md"
```
