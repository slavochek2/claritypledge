# P32.4_06: Chat Plus Button (Insert Ideas)

**Status:** Ready for Implementation
**Depends On:** P32.4_00 (uses CreateIdeaModal)
**Can Run In Parallel With:** P32.4_07, P32.4_08
**Estimated Time:** 45 minutes

---

## Purpose

Add + button in chat input area to insert/create ideas.

**Addresses critique #5:** "Chat needs + button for ideas"
**Addresses critique #9:** "Chat should allow creating ideas"

---

## What Changed from P32.3

### Before (P32.3):
```
┌──────────────────────────────────────┐
│ [Message........................] [→]│
└──────────────────────────────────────┘
```

### After (P32.4_06):
```
┌──────────────────────────────────────┐
│ [+] [Message...................] [→]│
└──────────────────────────────────────┘
```

**Tap + → Menu:**
```
┌──────────────────────────────┐
│ New Idea                     │
│ From My Ideas                │
└──────────────────────────────┘
```

---

## Files to Modify

### `ChatConversation.tsx`

**Add + button to input area:**

```tsx
export function ChatConversation() {
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMyIdeasPicker, setShowMyIdeasPicker] = useState(false);

  return (
    <div className="flex flex-col h-screen">
      {/* ... chat messages ... */}

      {/* Input area */}
      <div className="border-t bg-white p-4">
        <div className="flex items-center gap-2">
          {/* + Button */}
          <button
            onClick={() => setShowInsertMenu(true)}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Plus className="w-5 h-5" />
          </button>

          {/* Message input */}
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Message"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Send button */}
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
            className="p-2 text-white bg-blue-500 rounded-lg disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Insert menu */}
      {showInsertMenu && (
        <InsertIdeaMenu
          onSelectNew={() => {
            setShowInsertMenu(false);
            setShowCreateModal(true);
          }}
          onSelectFromMyIdeas={() => {
            setShowInsertMenu(false);
            setShowMyIdeasPicker(true);
          }}
          onClose={() => setShowInsertMenu(false)}
        />
      )}

      {/* Create Idea Modal */}
      {showCreateModal && (
        <CreateIdeaModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onIdeaCreated={(ideaId) => {
            // Insert idea reference into chat
            insertIdeaIntoChat(ideaId);
            setShowCreateModal(false);
          }}
        />
      )}

      {/* My Ideas Picker */}
      {showMyIdeasPicker && (
        <MyIdeasPicker
          onSelect={(ideaId) => {
            insertIdeaIntoChat(ideaId);
            setShowMyIdeasPicker(false);
          }}
          onClose={() => setShowMyIdeasPicker(false)}
        />
      )}
    </div>
  );
}
```

---

## New Component: `InsertIdeaMenu.tsx`

**Simple bottom sheet menu:**

```tsx
interface InsertIdeaMenuProps {
  onSelectNew: () => void;
  onSelectFromMyIdeas: () => void;
  onClose: () => void;
}

export function InsertIdeaMenu({ onSelectNew, onSelectFromMyIdeas, onClose }: InsertIdeaMenuProps) {
  return (
    <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onSelectNew}
          className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3"
        >
          <Plus className="w-5 h-5 text-gray-600" />
          <span className="font-medium">New Idea</span>
        </button>

        <button
          onClick={onSelectFromMyIdeas}
          className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3"
        >
          <Lightbulb className="w-5 h-5 text-gray-600" />
          <span className="font-medium">From My Ideas</span>
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

## New Component: `MyIdeasPicker.tsx`

**Modal showing ideas current user has positioned on:**

```tsx
interface MyIdeasPickerProps {
  onSelect: (ideaId: string) => void;
  onClose: () => void;
}

export function MyIdeasPicker({ onSelect, onClose }: MyIdeasPickerProps) {
  const myIdeas = getEngagedIdeas('current', 'all');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">My Ideas</h3>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {myIdeas.map(item => (
            <button
              key={item.idea.id}
              onClick={() => onSelect(item.idea.id)}
              className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50"
            >
              <p className="text-sm text-gray-900 line-clamp-2">{item.idea.text}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                <PositionBadge position={item.position} label="You" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Behavior

### Insert Idea into Chat

When idea is inserted, send a special message type:

```tsx
function insertIdeaIntoChat(ideaId: string) {
  const idea = getIdeaById(ideaId);
  if (!idea) return;

  const newMsg: Message = {
    id: `m-${Date.now()}`,
    senderId: 'current',
    text: `💡 ${idea.text}`, // Special format for idea references
    timestamp: new Date().toISOString(),
    isRead: false,
    ideaId: ideaId, // NEW field
  };

  setMessages(prev => [...prev, newMsg]);
}
```

**Message display:**
- Idea messages get special styling (border, lightbulb icon)
- Tappable to navigate to idea detail
- Shows positions: "You: Agree · Partner: Disagree"

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Tap + button | Show insert menu |
| Tap outside menu | Close menu |
| No engaged ideas | "From My Ideas" shows "No ideas yet" |
| Insert same idea twice | Allow (can discuss multiple times) |
| Mobile keyboard open | Menu appears above keyboard |
| Desktop | Menu appears as popover near + button |

---

## Tests That Must Pass

### P1 (Critical)
- [ ] + button visible in chat input
- [ ] Tap + → menu appears
- [ ] Tap "New Idea" → CreateIdeaModal opens
- [ ] Tap "From My Ideas" → MyIdeasPicker opens
- [ ] Can create new idea from chat
- [ ] Idea inserts into chat as message
- [ ] Idea message has special styling
- [ ] Mobile: menu slides from bottom
- [ ] Desktop: menu appears as popover

---

## Done When

- [ ] + button added to ChatConversation
- [ ] InsertIdeaMenu component created
- [ ] MyIdeasPicker component created
- [ ] insertIdeaIntoChat() function works
- [ ] Idea messages styled distinctly
- [ ] All P1 tests pass
- [ ] Works on mobile and desktop
- [ ] No console errors

---

## Run Command

```bash
/loop "Implement P32.4_06 per @features/p32_4_06_chat_plus_button_after_00.md"
```
