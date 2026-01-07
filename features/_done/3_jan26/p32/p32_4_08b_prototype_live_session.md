# P32.4_08b: Prototype Live Session Component

**Status:** Ready for Implementation
**Depends On:** None
**Blocks:** P32.4_09, P32.4_10
**Estimated Time:** 30 minutes

---

## Purpose

Create a mockup version of `/live` for prototype that:
- Accepts navigation state from Chat/Ideas
- Shows idea context if passed
- Has mount point for + button (P32.4_10)
- Returns to prototype via `returnTo` path
- Uses mock data (NO Supabase)

**This is NOT production /live** - it's a simplified prototype version.

---

## File Location

```
src/app/prototypes/premium/components/LiveSession.tsx
```

---

## Component Spec

### Interface

```tsx
// Navigation state accepted from Chat/Ideas
interface LiveSessionState {
  partnerId: string;
  ideaId?: string;
  ideaText?: string;
  messageId?: string;
  messageText?: string;
  convertToIdea?: boolean;
  returnTo?: string;
}
```

### Implementation

```tsx
import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { getUserById } from '../data/mock-data';
import { Plus, ArrowLeft, X } from 'lucide-react';

export function LiveSession() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LiveSessionState | null;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const partner = state?.partnerId ? getUserById(state.partnerId) : null;
  const returnPath = state?.returnTo || '/prototype/converged';

  // Cancel/Back handler with confirmation if user interacted
  const handleCancel = () => {
    if (hasInteracted) {
      const confirmed = window.confirm(
        'Leave this session? Your progress will not be saved.'
      );
      if (!confirmed) return;
    }
    navigate(returnPath);
  };

  // Keyboard shortcut: Escape to cancel
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [hasInteracted, returnPath]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="flex items-center justify-between px-4 h-14 max-w-[500px] mx-auto">
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label="Cancel session"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-sm font-semibold">Live Session</h1>
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label="Close session"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      {/* Session Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 max-w-[500px] mx-auto w-full">
        <div className="space-y-6 text-center">
          {/* Partner Info */}
          {partner && (
            <div>
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-2xl mx-auto mb-3">
                {partner.avatar}
              </div>
              <p className="text-sm text-gray-600">In session with</p>
              <p className="font-semibold text-lg">{partner.name}</p>
            </div>
          )}

          {/* Idea Context (if passed) */}
          {state?.ideaText && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
              <p className="text-xs text-blue-600 font-medium mb-2">Verifying Idea:</p>
              <p className="text-sm text-gray-900">{state.ideaText}</p>
            </div>
          )}

          {/* Message Context (if passed) */}
          {state?.messageText && !state?.ideaText && (
            <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 text-left">
              <p className="text-xs text-gray-600 font-medium mb-2">Message:</p>
              <p className="text-sm text-gray-900">{state.messageText}</p>
              {state.convertToIdea && (
                <p className="text-xs text-blue-600 mt-2">💡 Convert to idea?</p>
              )}
            </div>
          )}

          {/* Mock Session Status */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-sm text-gray-700">Prototype Mode</span>
            </div>
            <p className="text-xs text-gray-500">
              This is a mockup. Full verification flow coming soon.
            </p>
          </div>

          {/* Mock Actions */}
          <div className="space-y-2">
            <button
              disabled
              className="w-full py-3 bg-gray-200 text-gray-500 rounded-lg text-sm font-medium cursor-not-allowed"
            >
              I spoke (mock)
            </button>
            <button
              disabled
              className="w-full py-3 bg-gray-200 text-gray-500 rounded-lg text-sm font-medium cursor-not-allowed"
            >
              Rate understanding (mock)
            </button>
          </div>

          {/* Return Button */}
          <button
            onClick={() => navigate(returnPath)}
            className="w-full py-3 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
          >
            Done
          </button>
        </div>
      </main>

      {/* P32.4_10: FAB Mount Point (+ button) */}
      <button
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-600 transition-all hover:scale-110 active:scale-95"
        aria-label="Create new idea"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* P32.4_10: CreateIdeaModal will be added here */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4">
            <p>CreateIdeaModal will mount here (P32.4_10)</p>
            <button onClick={() => setShowCreateModal(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Routing Setup

### Add to prototype routes:

**File:** `src/app/prototypes/premium/index.tsx` (or wherever routes are defined)

```tsx
import { Routes, Route } from 'react-router-dom';
import { LiveSession } from './components/LiveSession';
import { Chat } from './components/Chat';
import { Feed } from './components/Feed';
import { IdeaDetail } from './components/IdeaDetail';
import { Profile } from './components/Profile';

export function PremiumPrototype() {
  return (
    <Routes>
      <Route path="/" element={<Feed />} />
      <Route path="/chat/:id" element={<Chat />} />
      <Route path="/idea/:id" element={<IdeaDetail />} />
      <Route path="/profile/:id" element={<Profile />} />
      <Route path="/live" element={<LiveSession />} /> {/* NEW */}
    </Routes>
  );
}
```

---

## Behavior

### Entry Points (from P32.4_07, P32.4_08, P32.4_09)

**From Chat message:**
```tsx
navigate('/prototype/converged/live', {
  state: {
    partnerId: 'alice',
    messageText: 'Remote work is better',
    convertToIdea: true,
    returnTo: '/prototype/converged/chat/alice',
  }
});
```

**From Idea detail:**
```tsx
navigate('/prototype/converged/live', {
  state: {
    partnerId: 'alice',
    ideaId: 'idea-1',
    ideaText: 'Remote work is more productive...',
    returnTo: '/prototype/converged/idea/idea-1',
  }
});
```

**Return flow:**
- User taps "Done" → navigate back via `returnTo` path
- Preserves navigation history

---

## What This Component Does

### ✅ Shows:
- Partner info (name, avatar)
- Idea context (if navigating from idea)
- Message context (if navigating from message)
- Mock session status ("Prototype Mode")
- Return button

### ✅ Accepts:
- Navigation state from Chat/Ideas
- `returnTo` path for going back

### ✅ Provides:
- Mount point for + button (P32.4_10)
- Mount point for CreateIdeaModal (P32.4_10)

### ❌ Does NOT:
- Implement full verification flow (that's for later)
- Use Supabase (mock data only)
- Handle recording/audio (prototype only)
- Match production /live complexity

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| No state passed | Show generic "Live Session" with no context |
| No returnTo path | Return to `/prototype/converged` (feed) |
| Partner not found | Show "Unknown partner" |
| Both ideaText and messageText | Prefer ideaText |

---

## Tests That Must Pass

### P1 (Critical)
- [ ] Can navigate to /prototype/converged/live
- [ ] Accepts navigation state
- [ ] Shows partner name and avatar
- [ ] Shows idea context if passed
- [ ] Shows message context if passed
- [ ] Return button navigates to returnTo path
- [ ] FAB visible in bottom-right
- [ ] Mobile: Works on 375px width
- [ ] Desktop: Works on ≥768px width

---

## Done When

- [ ] Component created at correct path
- [ ] Routing added to prototype
- [ ] All P1 tests pass
- [ ] Can navigate from Chat → LiveSession → back to Chat
- [ ] Can navigate from Idea → LiveSession → back to Idea
- [ ] FAB mount point ready for P32.4_10
- [ ] No console errors

---

## Notes

- This is a **simplified mockup** for prototype validation
- Full verification flow will be built later with backend
- Focus: Navigation integration + UI placement
- Keep it simple - boring technology that works

---

## Run Command

```bash
/loop "Implement P32.4_08b per @features/p32_4_08b_prototype_live_session.md"
```
