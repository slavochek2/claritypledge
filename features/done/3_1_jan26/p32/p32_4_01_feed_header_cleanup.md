# P32.4_01: Feed Header Cleanup

**Status:** Ready for Implementation
**Depends On:** None
**Can Run In Parallel With:** P32.4_02, P32.4_03
**Estimated Time:** 30 minutes

---

## Purpose

Simplify Feed header to reduce cognitive load:
- Search bar → Search icon only
- Remove "Share an idea" input box
- Keep filter pills
- Keep stories row

---

## What Changed from P32.3

### Before (P32.3):
```
[Profile icon] [Search ideas..................] [🔔]
[All Ideas] [Disputed] [Verified] [My Network ▼]
[+ Share an idea for discussion....................]
[Stories row...]
```

### After (P32.4_01):
```
[Profile icon] [🔍] [🔔]
[All Ideas] [Disputed] [Verified] [My Network ▼]
[Stories row...]
```

**Removed:**
- Full search bar (becomes icon)
- "Share an idea" input (replaced by FAB in P32.4_11)

**Result:** Header goes from 3 rows → 2 rows. More breathing room.

---

## Files to Modify

### `FeedHeader.tsx`

**Current structure:**
```tsx
<div className="sticky top-0 bg-white z-10">
  {/* Row 1: Profile, Search Bar, Notifications */}
  <div className="flex items-center gap-3 px-4 py-3">
    <User className="w-6 h-6" />
    <input placeholder="Search ideas..." />
    <Bell className="w-6 h-6" />
  </div>

  {/* Row 2: Filter pills */}
  <div className="flex gap-2 px-4 pb-3">
    {filters.map(...)}
  </div>

  {/* Row 3: Share input */}
  <div className="px-4 pb-3">
    <button onClick={onCreateIdea}>
      + Share an idea for discussion...
    </button>
  </div>
</div>
```

**New structure:**
```tsx
<div className="sticky top-0 bg-white z-10">
  {/* Row 1: Profile, Search Icon, Notifications */}
  <div className="flex items-center justify-between px-4 py-3">
    <button onClick={onProfileClick}>
      <User className="w-6 h-6 text-gray-700" />
    </button>

    <button onClick={onSearchClick}>
      <Search className="w-6 h-6 text-gray-700" />
    </button>

    <button onClick={onNotificationsClick} className="relative">
      <Bell className="w-6 h-6 text-gray-700" />
      {hasUnread && (
        <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />
      )}
    </button>
  </div>

  {/* Row 2: Filter pills */}
  <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
    {filters.map(...)}
  </div>
</div>
```

---

## Component Props

```tsx
interface FeedHeaderProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  // Remove: onCreateIdea (moved to FAB)
  // Add: onSearchClick, onNotificationsClick
}
```

---

## Behavior

### Search Icon
**On click (Desktop):**
- Expand to full search bar inline
- Auto-focus input
- Show recent searches (P2 - defer)

**On click (Mobile):**
- Navigate to `/prototype/converged/search` (P2 - defer for now)
- OR: Show modal with search input (simpler)

**For now:** Just a placeholder icon (no-op)

### Notification Bell
**Badge logic:**
- Show blue dot if any user has `hasUnviewedActivity: true` in mock data
- On click: Navigate to `/prototype/converged/profile` (placeholder)

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| User taps search icon | (P2 - defer) Show placeholder toast "Search coming soon" |
| User taps notification bell | (P2 - defer) Navigate to profile or show toast |
| Filter pills overflow on small screen | Horizontal scroll with fade indicator |
| No active filter | "All Ideas" is highlighted |

---

## Mobile vs Desktop

### Mobile (375px)
- Icons: 24px (w-6 h-6)
- Touch targets: 44px minimum
- Filter pills scroll horizontally

### Desktop (≥768px)
- Icons: 24px
- Hover states on all icons
- Filter pills stay in one row (no scroll needed)

---

## Style Updates

```css
/* Header container */
.feed-header {
  border-bottom: 1px solid #e5e7eb; /* gray-200 */
  background: white;
}

/* Icon buttons */
.icon-button {
  padding: 10px; /* 44px touch target */
  border-radius: 8px;
  transition: background 0.2s;
}

.icon-button:hover {
  background: #f3f4f6; /* gray-100 */
}

/* Notification badge */
.notification-badge {
  width: 8px;
  height: 8px;
  background: #3b82f6; /* blue-500 */
  border: 2px solid white;
}

/* Filter pills - no change from P32.3 */
```

---

## Tests That Must Pass

### P1 (Critical)
- [ ] Header has 2 rows (not 3)
- [ ] Search icon visible
- [ ] Notification bell visible
- [ ] Profile icon visible
- [ ] Filter pills work (click changes filter)
- [ ] No "Share an idea" input visible
- [ ] Mobile: touch targets ≥ 44px
- [ ] Desktop: hover states work

### P2 (Polish)
- [ ] Notification badge shows when unread
- [ ] Filter pills scroll horizontally on mobile
- [ ] Search icon shows tooltip on hover (desktop)

---

## Mock Data Updates

Add to users (if not already present):
```tsx
export const users: User[] = [
  currentUser,
  {
    id: 'alice',
    hasUnviewedActivity: true, // ← For notification badge
    ...
  },
  ...
];
```

---

## Done When

- [ ] FeedHeader component updated
- [ ] onCreateIdea prop removed
- [ ] Search icon + Notification bell present
- [ ] Header is 2 rows (not 3)
- [ ] All P1 tests pass
- [ ] Mobile (375px) looks clean with breathing room
- [ ] Desktop (≥768px) hover states work
- [ ] No console errors

---

## Notes

- **DO NOT** implement search functionality (placeholder only)
- **DO NOT** implement notification panel (placeholder only)
- FAB for creating ideas comes in P32.4_11
- This is just visual cleanup: remove clutter, simplify

---

## Run Command

```bash
/loop "Implement P32.4_01 per @features/p32_4_01_feed_header_cleanup.md"
```
