# P32.4_02: Story Badge Counts

**Status:** Ready for Implementation
**Depends On:** None
**Can Run In Parallel With:** P32.4_01, P32.4_03
**Estimated Time:** 45 minutes

---

## Purpose

Add badge counts to story avatars showing number of new engagements since last viewed.

**Reference:** [black/stories.png](../docs/inspiration/black/stories.png)

---

## What Changed from P32.3

### Before:
```
[😊] [👩] [🧑] [👩‍💼] [👨] →
You  Alice Bob  Carol  Dan
```

### After:
```
[😊₃] [👩₁] [🧑₂] [👩‍💼] [👨] →
 You   Alice Bob   Carol  Dan
  ↑      ↑    ↑
Badge counts (new engagements)
```

**Key changes:**
- Small badge on top-right of avatar
- Shows count (1-9, or "9+" if > 9)
- Blue ring around avatar if has badge
- Badge clears when you view that user's story

---

## Files to Modify

### `StoriesRow.tsx`

**Current:**
```tsx
export function StoriesRow() {
  const users = [currentUser, ...users.filter(u => u.hasUnviewedActivity)];

  return (
    <div className="flex gap-4 px-4 py-4 overflow-x-auto">
      {users.map(user => (
        <button key={user.id} onClick={() => navigate(`/story/${user.id}`)}>
          <div className="flex flex-col items-center gap-1">
            <div className="w-16 h-16 rounded-full bg-gray-200">
              <span className="text-2xl">{user.avatar}</span>
            </div>
            <span className="text-xs text-gray-700">{user.name}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
```

**New:**
```tsx
export function StoriesRow() {
  const users = [currentUser, ...getAllUsers()];

  return (
    <div className="flex gap-4 px-4 py-4 overflow-x-auto">
      {users.map(user => {
        const badgeCount = getUnviewedActivityCount(user.id);
        const hasBadge = badgeCount > 0;

        return (
          <button
            key={user.id}
            onClick={() => handleStoryClick(user.id)}
            className="flex flex-col items-center gap-1"
          >
            <div className="relative">
              {/* Avatar with optional ring */}
              <div className={cn(
                "w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center",
                hasBadge && "ring-2 ring-blue-500 ring-offset-2"
              )}>
                <span className="text-2xl">{user.avatar}</span>
              </div>

              {/* Badge */}
              {hasBadge && (
                <div className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-blue-500 rounded-full flex items-center justify-center px-1.5">
                  <span className="text-xs font-semibold text-white">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                </div>
              )}
            </div>

            <span className="text-xs text-gray-700 font-medium">
              {user.id === 'current' ? 'You' : user.name.split(' ')[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

---

## Mock Data Updates

### Add to User type:
```tsx
export interface User {
  id: string;
  name: string;
  avatar: string;
  role?: string;
  bio?: string;
  verifiedListenerScore: number;
  ideasEngaged: number;
  hasUnviewedActivity: boolean; // Keep for compatibility
  unviewedActivityCount?: number; // NEW: Specific count
}
```

### Update users data:
```tsx
export const users: User[] = [
  currentUser,
  {
    id: 'alice',
    name: 'Alice Chen',
    avatar: '👩',
    role: 'Senior PM at TechCorp',
    verifiedListenerScore: 9.2,
    ideasEngaged: 47,
    hasUnviewedActivity: true,
    unviewedActivityCount: 3, // NEW
  },
  {
    id: 'bob',
    name: 'Bob Smith',
    avatar: '🧑',
    role: 'Staff Engineer at StartupXYZ',
    verifiedListenerScore: 8.8,
    ideasEngaged: 32,
    hasUnviewedActivity: true,
    unviewedActivityCount: 2, // NEW
  },
  {
    id: 'carol',
    name: 'Carol Davis',
    avatar: '👩‍💼',
    role: 'Research Lead at DesignCo',
    verifiedListenerScore: 9.5,
    ideasEngaged: 56,
    hasUnviewedActivity: false,
    unviewedActivityCount: 0,
  },
  {
    id: 'dan',
    name: 'Dan Wilson',
    avatar: '👨',
    role: 'VP Engineering',
    verifiedListenerScore: 7.9,
    ideasEngaged: 19,
    hasUnviewedActivity: true,
    unviewedActivityCount: 1, // NEW
  },
  {
    id: 'eve',
    name: 'Eve Martinez',
    avatar: '👧',
    role: 'UX Researcher',
    verifiedListenerScore: 8.1,
    ideasEngaged: 28,
    hasUnviewedActivity: false,
    unviewedActivityCount: 0,
  },
];
```

### Add helper function:
```tsx
export function getUnviewedActivityCount(userId: string): number {
  const user = users.find(u => u.id === userId);
  return user?.unviewedActivityCount || 0;
}

export function clearUnviewedActivity(userId: string): void {
  const user = users.find(u => u.id === userId);
  if (user) {
    user.hasUnviewedActivity = false;
    user.unviewedActivityCount = 0;
  }
}
```

---

## Behavior

### Badge Logic
- Badge shows if `unviewedActivityCount > 0`
- Count increments when:
  - User takes new position on idea
  - User verifies with you
  - User changes position
- Count clears when:
  - You view their story (`/story/:userId`)
  - You open their profile

### Visual States

**No badge:**
```
┌─────────┐
│  [👩]   │  ← Gray avatar, no ring
│  Alice  │
└─────────┘
```

**With badge:**
```
┌─────────┐
│ [👩]₃   │  ← Blue ring + badge
│  Alice  │
└─────────┘
```

**Badge > 9:**
```
┌─────────┐
│ [👩]9+  │  ← Shows "9+"
│  Alice  │
└─────────┘
```

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Badge count > 9 | Show "9+" |
| Badge count = 0 | No badge, no ring |
| User taps story avatar | Navigate to story view, clear badge |
| Current user ("You") has activity | Can show badge (user's own new positions) |
| Stories overflow screen width | Horizontal scroll with fade indicator |

---

## Style Tokens

```tsx
// Avatar
size: 64px (w-16 h-16)
borderRadius: 50% (rounded-full)

// Blue ring (when has badge)
ring: 2px solid blue-500
ringOffset: 2px

// Badge
minWidth: 20px
height: 20px
background: blue-500
color: white
fontSize: 12px
fontWeight: 600
borderRadius: 10px (rounded-full)
position: absolute top-[-4px] right-[-4px]

// Name label
fontSize: 12px (text-xs)
fontWeight: 500 (font-medium)
color: gray-700
```

---

## Tests That Must Pass

### P1 (Critical)
- [ ] Badges show on avatars with unviewedActivityCount > 0
- [ ] Badge shows correct count (1-9)
- [ ] Badge shows "9+" when count > 9
- [ ] Blue ring appears around avatar when has badge
- [ ] No badge/ring when count = 0
- [ ] Tap avatar navigates to story view
- [ ] Mobile: horizontal scroll works
- [ ] Mobile: touch targets ≥ 44px

### P2 (Polish)
- [ ] Badge clears when viewing story (need to wire up)
- [ ] Smooth animation when badge appears/disappears
- [ ] Fade indicators on scroll edges

---

## Done When

- [ ] StoriesRow component updated
- [ ] Mock data has unviewedActivityCount
- [ ] Helper functions added (getUnviewedActivityCount, clearUnviewedActivity)
- [ ] All P1 tests pass
- [ ] Badge displays correctly on mobile
- [ ] Badge displays correctly on desktop
- [ ] No layout shift when badge appears
- [ ] No console errors

---

## Notes

- Badge clearing logic will be fully wired in StoryView component (separate from this story)
- For now, just show badges based on mock data
- Reference [black/stories.png](../docs/inspiration/black/stories.png) for exact visual style
- Keep "You" as first avatar (always visible)

---

## Run Command

```bash
/loop "Implement P32.4_02 per @features/p32_4_02_story_badges.md"
```
