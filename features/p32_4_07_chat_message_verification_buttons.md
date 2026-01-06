# P32.4_07: Chat Message Verification Buttons

**Status:** Ready for Implementation
**Depends On:** None
**Can Run In Parallel With:** P32.4_06, P32.4_08
**Estimated Time:** 1 hour

---

## Purpose

Add verification buttons on chat messages:
- MY messages: "Did you understand me?"
- THEIR messages: "Did I understand you?"

**Addresses:** Per-message verification triggers from original p32_2 concept

---

## What Changed from P32.3

### Before (P32.3):
```
[Message bubble]
[Another message]
```

### After (P32.4_07):
```
[Message bubble]  ← Hover/long-press → [Did you understand me?]

[Their message]   ← Hover/long-press → [Did I understand you?]
```

---

## Files to Modify

### `ChatConversation.tsx`

**Desktop:** Show button on hover
**Mobile:** Show button on long-press (context menu)

```tsx
export function ChatMessage({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const [showVerifyButton, setShowVerifyButton] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showFirstTimeTooltip, setShowFirstTimeTooltip] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Check if this is user's first time (localStorage)
  useEffect(() => {
    const hasSeenHint = localStorage.getItem('hasSeenMessageVerifyHint');
    if (!hasSeenHint) {
      setShowFirstTimeTooltip(true);
      setTimeout(() => {
        setShowFirstTimeTooltip(false);
        localStorage.setItem('hasSeenMessageVerifyHint', 'true');
      }, 3000);
    }
  }, []);

  const handleVerify = () => {
    // Navigate to /live with message context
    navigate('/live', {
      state: {
        partnerId: otherUser.id,
        messageId: message.id,
        messageText: message.text,
        convertToIdea: true,
      }
    });
  };

  // Long-press handlers (300ms)
  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      // Haptic feedback (if supported)
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }
      setShowContextMenu(true);
    }, 300); // iOS standard timing
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  return (
    <div
      className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}
      onMouseEnter={() => setShowVerifyButton(true)}
      onMouseLeave={() => setShowVerifyButton(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowContextMenu(true);
      }}
    >
      <div className="flex flex-col gap-1 max-w-[75%]">
        {/* Message bubble */}
        <div className={cn(
          'px-4 py-2 rounded-2xl',
          isOwn ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-900'
        )}>
          <p className="text-sm">{message.text}</p>
        </div>

        {/* Verification button (desktop hover) */}
        {showVerifyButton && (
          <div className="relative">
            <button
              onClick={handleVerify}
              className="text-xs text-blue-600 hover:underline self-start px-2"
            >
              {isOwn ? 'Did you understand me?' : 'Did I understand you?'}
            </button>

            {/* First-time tooltip */}
            {showFirstTimeTooltip && (
              <div className="absolute -top-8 left-0 bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap animate-fade-in">
                💡 Hover messages to verify understanding
                <div className="absolute -bottom-1 left-4 w-2 h-2 bg-blue-600 rotate-45" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context menu (mobile long-press) */}
      {showContextMenu && (
        <MessageContextMenu
          message={message}
          isOwn={isOwn}
          onVerify={handleVerify}
          onClose={() => setShowContextMenu(false)}
        />
      )}
    </div>
  );
}
```

---

## New Component: `MessageContextMenu.tsx`

**Mobile long-press menu:**

```tsx
interface MessageContextMenuProps {
  message: Message;
  isOwn: boolean;
  onVerify: () => void;
  onClose: () => void;
}

export function MessageContextMenu({ message, isOwn, onVerify, onClose }: MessageContextMenuProps) {
  return (
    <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            onVerify();
            onClose();
          }}
          className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3"
        >
          <Mic className="w-5 h-5 text-blue-600" />
          <span className="font-medium">
            {isOwn ? 'Did you understand me?' : 'Did I understand you?'}
          </span>
        </button>

        <button
          onClick={onClose}
          className="w-full text-center px-4 py-3 rounded-lg hover:bg-gray-50 text-gray-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
```

---

## Behavior

### Desktop (Hover)
- Hover over message → "Did you understand me?" button appears below
- Click button → Navigate to /live with message context
- Button disappears when hover ends
- **First-time only:** Show tooltip "💡 Hover messages to verify understanding" (auto-dismiss after 3s)

### Mobile (Long-Press)
- Long-press message (**300ms** - iOS standard) → Context menu slides up
- Tap "Did you understand me?" → Navigate to /live
- Tap outside → Close menu
- **Haptic feedback** on long-press (if supported)

### Message → Idea Conversion
When verification is triggered from message:
1. Navigate to /live with `convertToIdea: true` flag
2. /live shows: "Convert this to an idea? [Yes] [Skip]"
3. If Yes: Create idea from message text, continue with verification
4. If Skip: Proceed with free-form verification

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Desktop: hover, then scroll | Button disappears (hover lost) |
| Mobile: long-press while scrolling | No menu (scroll takes precedence) |
| Same message clicked twice | Allow (can re-verify) |
| Message is idea reference | Show different button: "Verify this idea" |
| Partner offline | Button still shows (queue verification attempt) |

---

## Tests That Must Pass

### P1 (Critical)
- [ ] Desktop: hover shows button
- [ ] Desktop: button hidden when not hovering
- [ ] Desktop: click button navigates to /live
- [ ] Mobile: long-press shows context menu
- [ ] Mobile: menu has correct button text
- [ ] Mobile: tap outside closes menu
- [ ] MY messages: "Did you understand me?"
- [ ] THEIR messages: "Did I understand you?"
- [ ] Navigation to /live includes message context

### P2 (Polish)
- [ ] Button animation smooth
- [ ] Long-press vibration feedback (mobile)
- [ ] Hover doesn't trigger on touch devices

---

## Done When

- [ ] Message hover/long-press behavior implemented
- [ ] MessageContextMenu component created
- [ ] Desktop hover states work
- [ ] Mobile long-press works
- [ ] Correct button text for own/other messages
- [ ] Navigate to /live with message context
- [ ] All P1 tests pass
- [ ] No console errors

---

## Run Command

```bash
/loop "Implement P32.4_07 per @features/p32_4_07_chat_message_verification_buttons.md"
```
