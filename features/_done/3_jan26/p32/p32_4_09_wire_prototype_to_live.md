# P32.4_09: Wire Prototype to Prototype Live Session

**Status:** Ready for Implementation
**Depends On:** P32.4_07, P32.4_08, P32.4_08b
**Estimated Time:** 30 minutes

---

## Purpose

Connect prototype verification buttons to **prototype LiveSession component** (NOT production /live).

All entry points (chat messages, idea detail, chat header "Go Live") should navigate to `/prototype/premium/live` with proper context.

---

## Integration Points

### 1. Chat Message Buttons (P32.4_07)
**"Did you understand me?" / "Did I understand you?"**

```tsx
// In Chat.tsx
const handleVerifyMessage = (message: Message, isOwn: boolean) => {
  navigate('/prototype/premium/live', {
    state: {
      partnerId: otherUser.id,
      messageId: message.id,
      messageText: message.text,
      convertToIdea: true,
      returnTo: `/prototype/premium/chat/${otherUser.id}`,
    }
  });
};
```

### 2. Idea Detail Button (P32.4_08)
**"Verify Understanding"**

```tsx
// In IdeaDetail.tsx
const handleVerifyIdea = (partnerId: string) => {
  navigate('/prototype/premium/live', {
    state: {
      partnerId,
      ideaId: idea.id,
      ideaText: idea.text,
      returnTo: `/prototype/premium/idea/${idea.id}`,
    }
  });
};
```

### 3. Chat Header "Go Live" (Existing)
**Free-form verification**

```tsx
// In Chat.tsx (existing "Go Live" button)
const handleGoLive = () => {
  navigate('/prototype/premium/live', {
    state: {
      partnerId: otherUser.id,
      returnTo: `/prototype/premium/chat/${otherUser.id}`,
    }
  });
};
```

---

## What Needs to be Wired

### Files to Modify:

**1. Chat.tsx** - Update "Go Live" button (already exists)
**2. Chat.tsx** - Add message verification handlers (from P32.4_07)
**3. IdeaDetail.tsx** - Update "Verify Understanding" buttons (from P32.4_08)

All navigations should go to `/prototype/premium/live` (NOT production `/live`).

The prototype LiveSession component (P32.4_08b) already accepts all state parameters - no additional changes needed there.

---

## User Flow Examples

### Flow 1: Message → Verification
```
User in Chat → Long-press message → "Did you understand me?"
    ↓
Navigate to /prototype/premium/live with message context
    ↓
LiveSession shows message + partner info
    ↓
User taps "Done"
    ↓
Return to Chat
```

### Flow 2: Idea → Verification
```
User in Idea Detail → Tap "Verify Understanding" on Alice
    ↓
Navigate to /prototype/premium/live with idea context
    ↓
LiveSession shows idea + partner info
    ↓
User taps "Done"
    ↓
Return to Idea Detail
```

### Flow 3: Free-form
```
User in Chat → Tap "Go Live" button
    ↓
Navigate to /prototype/premium/live with partner only
    ↓
LiveSession shows partner info
    ↓
User taps "Done"
    ↓
Return to Chat
```

---

## Improved Navigation Pattern

### Problem with Simple returnTo:
The original spec used `returnTo` string, but this can get stale if user navigates multiple pages before reaching LiveSession.

### Better Solution: Browser History
```tsx
// In LiveSession.tsx - use navigate(-1) instead of returnTo
const handleDone = () => {
  navigate(-1); // Go back to previous page
};

// This works because:
// Chat → LiveSession → Done → Back to Chat ✅
// Feed → Idea → LiveSession → Done → Back to Idea ✅
// Multi-step: Feed → Idea → Chat → LiveSession → Done → Back to Chat ✅
```

### Edge Case Handling:
```tsx
const handleDone = () => {
  // If user somehow deep-linked to LiveSession (no history)
  if (window.history.length <= 1) {
    navigate('/prototype/premium'); // Fallback to feed
  } else {
    navigate(-1); // Standard back navigation
  }
};
```

### Updated Entry Points:
All entry points can now REMOVE `returnTo` (simpler state):

```tsx
// From Chat (SIMPLIFIED)
navigate('/prototype/premium/live', {
  state: {
    partnerId: otherUser.id,
    messageText: message.text,
    // NO returnTo needed!
  }
});

// From Idea (SIMPLIFIED)
navigate('/prototype/premium/live', {
  state: {
    partnerId,
    ideaId: idea.id,
    ideaText: idea.text,
    // NO returnTo needed!
  }
});
```

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Partner not found | LiveSession shows "Unknown partner" |
| No state passed | LiveSession shows generic session |
| User presses Done | navigate(-1) to previous page |
| No browser history | Fallback to /prototype/premium (feed) |
| User navigates back button | Browser handles naturally |
| Deep link to LiveSession | Fallback to feed when done |

---

## Tests That Must Pass

### P1 (Critical)
- [ ] Chat message button → /prototype/premium/live with message context
- [ ] Idea detail button → /prototype/premium/live with idea context
- [ ] Chat "Go Live" → /prototype/premium/live without idea
- [ ] LiveSession receives correct state parameters
- [ ] LiveSession returns to prototype after done
- [ ] returnTo path works correctly
- [ ] Works on mobile and desktop

---

## Done When

- [ ] All prototype entry points navigate to /prototype/premium/live
- [ ] LiveSession receives state correctly
- [ ] LiveSession returns to prototype correctly
- [ ] All P1 tests pass
- [ ] No broken navigation
- [ ] No console errors
- [ ] Production /live untouched

---

## Run Command

```bash
/loop "Implement P32.4_09 per @features/p32_4_09_wire_prototype_to_live.md"
```
