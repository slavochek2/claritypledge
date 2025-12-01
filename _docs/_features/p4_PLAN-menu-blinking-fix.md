# Plan: Fix Menu Blinking Issue

**Status**: PLANNING
**Priority**: Medium
**Estimated Time**: 20-30 minutes

---

## Problem Statement

The navigation menu shows a visible transition during page load:
1. Page loads → Empty space shown (loading state)
2. Auth check completes → Menu appears (logged-in or logged-out version)
3. **User sees a "blink" or "flash" as content appears**

Current implementation in `src/polymet/components/simple-navigation.tsx`:
```typescript
{isLoading ? (
  <div className="w-24 h-10" />  // ← Empty space during loading
) : currentUser ? (
  // User menu
) : (
  // Public menu
)}
```

---

## User Requirement

**Option B**: Show NOTHING during auth check, then show the correct menu (no visible transition)

---

## Proposed Solution

Use CSS visibility/opacity instead of conditional rendering to eliminate re-render flashing.

### Approach 1: CSS Visibility (Recommended)

**Pros**:
- No DOM changes (elements always present)
- Instant visibility toggle
- No layout shift
- Clean implementation

**Cons**:
- Elements still take up DOM space (minimal performance impact)

**Implementation**:
```typescript
// Desktop menu
<div className="hidden md:flex items-center gap-4">
  {/* User Menu - Hidden when loading or not logged in */}
  <div className={isLoading || !currentUser ? 'invisible' : 'visible'}>
    <DropdownMenu>...</DropdownMenu>
  </div>

  {/* Public Menu - Hidden when loading or logged in */}
  <div className={isLoading || currentUser ? 'invisible' : 'visible'}>
    <Link to="/login">Log In</Link>
    <Link to="/sign-pledge">Take the Pledge</Link>
  </div>
</div>
```

### Approach 2: Skeleton Loading State

**Pros**:
- Gives user visual feedback during loading
- Matches final menu size (no layout shift)
- Feels more responsive

**Cons**:
- Still technically shows something during loading
- More code to maintain

**Implementation**:
```typescript
{isLoading ? (
  <div className="flex items-center gap-4">
    <div className="h-10 w-20 bg-gray-200 animate-pulse rounded" />
    <div className="h-10 w-32 bg-gray-200 animate-pulse rounded" />
  </div>
) : currentUser ? (
  // User menu
) : (
  // Public menu
)}
```

### Approach 3: Opacity Transition

**Pros**:
- Smooth fade-in effect
- Professional appearance
- No layout shift

**Cons**:
- Slight delay in visibility (transition duration)
- More complex CSS

**Implementation**:
```typescript
<div className={`hidden md:flex items-center gap-4 transition-opacity duration-200 ${
  isLoading ? 'opacity-0' : 'opacity-100'
}`}>
  {currentUser ? (
    // User menu
  ) : (
    // Public menu
  )}
</div>
```

---

## Recommended Approach

**Approach 1 (CSS Visibility)** because:
- Simplest implementation
- Meets user requirement exactly (nothing visible during loading)
- No performance impact
- No layout shift
- No transition delay

---

## Files to Modify

1. **`src/polymet/components/simple-navigation.tsx`**
   - Desktop menu (lines ~80-131)
   - Mobile menu (lines ~150-212)

---

## Implementation Steps

1. Update desktop menu to use CSS visibility
2. Update mobile menu to use CSS visibility
3. Test on dev server with page reload
4. Verify no visible blink/flash
5. Test with both logged-in and logged-out states

---

## Testing Checklist

- [ ] Menu doesn't flash on initial page load (logged out)
- [ ] Menu doesn't flash on page reload (logged in)
- [ ] Correct menu appears after auth check (no wrong menu shown first)
- [ ] Mobile menu works correctly
- [ ] Desktop menu works correctly
- [ ] No console errors
- [ ] No layout shift/jumping

---

## Alternative If Issue Persists

If CSS visibility still shows some transition, consider:
1. Pre-render both menus server-side (if using SSR)
2. Use localStorage to remember last auth state (show cached state immediately)
3. Accept minimal flash as unavoidable with client-side auth

---

## Time Estimate

- Implementation: 15 minutes
- Testing: 10 minutes
- Debugging (if needed): 5 minutes
- **Total: 20-30 minutes**

---

## Success Criteria

✅ No visible menu transition on page load
✅ Correct menu appears immediately after ~200ms auth check
✅ Works for both logged-in and logged-out users
✅ Works on both desktop and mobile

---

**Status**: Ready for implementation when prioritized
