---
status: all-done
type: story
tags: []
rank: 125435.0
created_date: 2026-01-14
completed_at: '2026-02-09'
---

# P40: Microphone Permission Handling

**Status:** FAILED ATTEMPT - Needs Re-implementation with TDD
**Priority:** HIGH (Required for Live Meetings)
**Est. Effort:** 2-3 hours (including tests)
**Created:** 2026-01-07
**Updated:** 2026-01-07 (Post-mortem: First implementation failed)
**Depends On:** None
**Included In:** P37.2a (Consent Mechanism)

---

## ⚠️ POST-MORTEM: First Implementation Failed (2026-01-07)

### What Happened

An initial implementation was attempted in worktree 1 (`claritypledge-1`). It created the hook and dialog but had critical integration bugs:

1. **Dialog not rendering:** The `MicrophonePermissionDialog` was placed in an unreachable code path. The component has multiple early `return` statements for different views (`start`, `waiting`, `live`), and the dialog was only in a final fallback `return` that's never reached.

2. **State not resetting:** After canceling the dialog, clicking "New Meeting" again did nothing. The `micStatus` stayed in a bad state, and the button click handlers weren't being called.

3. **Toast not showing:** The `toast.error()` call in `handleMicCancel` wasn't displaying. Unclear if Toaster component was mounted or if there was a timing issue.

4. **Linter kept reverting fixes:** Each manual fix to add the dialog to individual views was reverted by the linter/formatter, suggesting the code structure was fighting against the solution.

### Root Cause Analysis

1. **Component structure incompatible with global dialogs:** `clarity-live-page.tsx` uses early returns for each view state. Any component that needs to render across all views (like a dialog/overlay) must either:
   - Be rendered INSIDE each view's return statement (repetitive, error-prone)
   - OR the component must be restructured to use a single return with conditional content

2. **No tests = no safety net:** The refactoring introduced bugs that would have been caught by basic tests like "when permission denied, dialog should be visible."

3. **Callback dependency issues:** `proceedWithCreate` and `proceedWithJoin` were converted to `useCallback` but the dependency arrays and state flow had issues causing stale closures.

### What Needs to Change

#### Option A: Restructure the Component (Recommended)

Refactor `clarity-live-page.tsx` to use a single return statement with conditional rendering:

```tsx
// CURRENT (broken for global overlays):
if (view === 'start') {
  return <StartView />;  // Early return - dialog not rendered
}
if (view === 'waiting') {
  return <WaitingView />;  // Early return - dialog not rendered
}
// ... more early returns

// PROPOSED (works with global overlays):
return (
  <>
    {/* Global overlays always render */}
    {micStatus === 'checking' && <LoadingOverlay />}
    <MicrophonePermissionDialog ... />

    {/* View content */}
    {view === 'start' && <StartView />}
    {view === 'waiting' && <WaitingView />}
    {view === 'live' && <LiveView />}
  </>
);
```

#### Option B: Extract to Context/Provider

Move mic permission state to a context provider that wraps the entire app, with the dialog rendered at the app root level.

#### Option C: Use Portals

Render the dialog via a React Portal to document.body, bypassing the component structure issue.

### Required Tests (Write BEFORE Implementation)

```typescript
// src/tests/useMicrophonePermission.test.ts
describe('useMicrophonePermission', () => {
  it('returns granted=true when getUserMedia succeeds', async () => {});
  it('returns denied=true when getUserMedia throws NotAllowedError', async () => {});
  it('increments attemptCount on each request', async () => {});
  it('resets state when reset() is called', async () => {});
  it('returns unsupported when mediaDevices is not available', async () => {});
});

// src/tests/MicrophonePermissionDialog.test.tsx
describe('MicrophonePermissionDialog', () => {
  it('renders when open=true', () => {});
  it('shows error message when error prop is set', () => {});
  it('shows escalated message when attemptCount >= 2', () => {});
  it('calls onRetry when Try Again clicked', () => {});
  it('calls onCancel when Cancel clicked', () => {});
  it('shows iOS instructions on iOS device', () => {});
});

// src/tests/clarity-live-page-mic.test.tsx
describe('ClarityLivePage microphone flow', () => {
  it('shows dialog when mic permission denied on New Meeting click', async () => {});
  it('proceeds to session when mic permission granted', async () => {});
  it('shows toast when user cancels mic dialog', async () => {});
  it('allows retry after cancel - New Meeting works again', async () => {});
});
```

### TDD Implementation Order

1. **Write tests first** using the test cases above
2. **Refactor component structure** (Option A) to support global overlays
3. **Implement hook** - make hook tests pass
4. **Implement dialog** - make dialog tests pass
5. **Integrate** - make integration tests pass
6. **Manual verification** - test on actual devices

### Tools Available

- **Playwright MCP:** Use `browser_snapshot` to verify dialog visibility
- **Vitest:** Unit tests for hook and component
- **React Testing Library:** Component integration tests

### Files to Reset

Before re-implementing, reset worktree 1 to main:
```bash
cd ~/Documents/claritypledge-1
git checkout main -- .
git clean -fd
```

### Suggestion for `/loop` Workflow

The `/loop` workflow's checklist says "Tests written (where appropriate)" which is too weak. For features that involve:
- State management across component lifecycles
- User interaction flows with multiple states
- Integration with browser APIs (like mediaDevices)

Tests should be **required**, not optional. Consider updating the workflow to:

1. **Detect testable code:** If the spec includes state transitions, user flows, or browser API mocking, mark tests as required
2. **TDD gate:** Don't proceed to implementation until test stubs are written
3. **Visual verification step:** For UI changes, use Playwright MCP to take screenshots before/after

### Re-implementation Approach

**Recommended: Use `/loop` with explicit TDD instruction:**

```
/loop implement P40 microphone permission with TDD:
1. FIRST write failing tests for hook, dialog, and integration
2. THEN refactor clarity-live-page.tsx to single-return pattern
3. THEN implement to make tests pass
4. Use Playwright MCP to visually verify dialog appears
```

This forces the agent to write tests first, which would have caught all 3 bugs from the failed attempt.

---

---

## Implementation Order

```
┌─────────────────────────────────────────────────────────────┐
│  Live Meeting Join Flow                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. CONSENT (P37.2a) ──► 2. MICROPHONE (P40) ──► 3. JOIN   │
│     Legal agreement       Technical requirement    Session   │
│                                                             │
│  P40 is a UTILITY that P37.2a uses internally              │
│  Consent happens FIRST (legal gate)                        │
│  Microphone check happens AFTER consent is recorded        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**For AI agents:** P40 provides the `useMicrophonePermission` hook and `MicrophonePermissionDialog` component. These are used by P37.2a AFTER consent is recorded. Implement as part of P37.2a or as a reusable utility.

---

## Context

Live Meetings require microphone access to record audio. Browser microphone permissions must be granted before the session can start. Without proper handling, users see confusing browser errors.

**Current State:** `use-audio-recorder.ts` has basic permission handling but no user-facing dialog or retry logic. Users who deny permission see unclear error states.

**Architecture Decision:** Extract permission logic from `use-audio-recorder.ts` into a dedicated hook, then have the recorder use it internally. This avoids duplication and creates one source of truth.

---

## Objectives

- [ ] Check microphone permission before joining session
- [ ] Show clear UI when permission denied
- [ ] Provide platform-specific instructions (desktop vs iOS vs Android)
- [ ] Block session join until microphone access granted
- [ ] Show loading state while checking permission
- [ ] Escalate messaging after repeated failures
- [ ] Handle edge cases (no mic, mic in use, unsupported browser)

---

## User Flow

### Happy Path

```
1. User clicks "Join Session"
2. UI shows "Checking microphone..." (brief loading state)
3. Browser prompts for microphone permission
4. User grants permission
5. Session proceeds normally
```

### Permission Denied (First Attempt)

```
┌─────────────────────────────────────────────────────┐
│  🎙️  Microphone Access Required                     │
│                                                     │
│  Clarity Meetings need microphone access to work.   │
│                                                     │
│  ⚠️ Microphone access was blocked                   │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ Enable microphone in your browser:            │ │
│  │                                               │ │
│  │ Chrome: Click 🔒 in address bar → Site settings│ │
│  │ Safari: Safari menu → Settings → Websites     │ │
│  │ Firefox: Click 🔒 in address bar → Permissions│ │
│  │                                               │ │
│  │ iOS Safari: Settings app → Safari → Microphone│ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  [Cancel]                        [Try Again]        │
└─────────────────────────────────────────────────────┘
```

### Permission Denied (After 2+ Failed Retries)

```
┌─────────────────────────────────────────────────────┐
│  🎙️  Microphone Access Required                     │
│                                                     │
│  Clarity Meetings need microphone access to work.   │
│                                                     │
│  ⚠️ Microphone access was blocked                   │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │ 🔒 Your browser may have blocked this site.   │ │
│  │ You'll need to enable the microphone in your  │ │
│  │ browser settings manually (see below).        │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  [Instructions per browser...]                      │
│                                                     │
│  [Cancel]                        [Try Again]        │
└─────────────────────────────────────────────────────┘
```

### Cancel Behavior

When user clicks "Cancel":
1. Close the dialog
2. Return user to session lobby/landing
3. Show toast: "Microphone access is required to join Clarity Meetings"
4. User can try joining again when ready

---

## Implementation

### 1. Permission Check Hook

**File:** `src/hooks/useMicrophonePermission.ts`

```typescript
import { useState, useCallback } from 'react';

export type MicrophoneStatus = 'unknown' | 'checking' | 'granted' | 'denied' | 'unsupported';

// Human-friendly error messages (never expose raw JS errors)
const ERROR_MESSAGES: Record<string, string> = {
  NotAllowedError: 'Microphone access was blocked',
  PermissionDeniedError: 'Microphone access was blocked',
  NotFoundError: 'No microphone detected on this device',
  NotReadableError: 'Microphone is in use by another app. Close Zoom, Teams, or other apps and try again.',
  OverconstrainedError: 'No microphone matches the requirements',
  unsupported: 'Your browser does not support microphone access. Try Chrome, Safari, or Firefox.',
  default: 'Unable to access microphone. Please try again.',
};

export function useMicrophonePermission() {
  const [status, setStatus] = useState<MicrophoneStatus>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    // Check browser support first
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      setError(ERROR_MESSAGES.unsupported);
      return false;
    }

    setStatus('checking');
    setError(null);
    setAttemptCount(prev => prev + 1);

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Permission granted - stop the stream immediately (we just needed permission)
      stream.getTracks().forEach(track => track.stop());

      setStatus('granted');
      return true;
    } catch (err) {
      const e = err as Error;
      const message = ERROR_MESSAGES[e.name] || ERROR_MESSAGES.default;

      setStatus('denied');
      setError(message);
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('unknown');
    setError(null);
    setAttemptCount(0);
  }, []);

  return {
    status,
    error,
    attemptCount,
    requestPermission,
    reset,
  };
}
```

### 2. Permission Denied Dialog

**File:** `src/app/components/live-meeting/microphone-permission-dialog.tsx`

```typescript
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Mic, AlertTriangle } from 'lucide-react';

interface MicrophonePermissionDialogProps {
  open: boolean;
  error: string | null;
  attemptCount: number;
  onRetry: () => void;
  onCancel: () => void;
}

// Inline platform detection (KISS - no separate file needed)
function getPlatform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function MicrophonePermissionDialog({
  open,
  error,
  attemptCount,
  onRetry,
  onCancel,
}: MicrophonePermissionDialogProps) {
  const platform = getPlatform();
  const showEscalatedMessage = attemptCount >= 2;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Microphone Access Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-muted-foreground">
            Clarity Meetings need microphone access to work.
          </p>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          {showEscalatedMessage && (
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-md text-sm text-blue-800">
              <strong>Your browser may have blocked this site.</strong> You'll need to
              enable the microphone in your browser settings manually.
            </div>
          )}

          <div className="bg-muted p-4 rounded-md text-sm space-y-2">
            <p className="font-medium">Enable microphone in your browser:</p>
            <ul className="space-y-1 text-muted-foreground">
              {platform === 'ios' ? (
                <>
                  <li><strong>iOS Safari:</strong> Settings app → Safari → Microphone</li>
                  <li><strong>iOS Chrome:</strong> Settings app → Chrome → Microphone</li>
                  <li className="text-xs italic">Note: iOS resets permissions when you close the browser.</li>
                </>
              ) : platform === 'android' ? (
                <>
                  <li><strong>Chrome:</strong> Tap lock icon in address bar → Permissions → Microphone</li>
                  <li><strong>Firefox:</strong> Tap lock icon → Edit Site Settings</li>
                </>
              ) : (
                <>
                  <li><strong>Chrome:</strong> Click lock icon in address bar → Site settings</li>
                  <li><strong>Safari:</strong> Safari menu → Settings → Websites → Microphone</li>
                  <li><strong>Firefox:</strong> Click lock icon in address bar → Permissions</li>
                </>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onRetry}>
            Try Again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 3. Integration into Live Meeting Flow

**File:** `src/app/pages/clarity-live-page.tsx`

**Changes needed:**

```typescript
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';
import { MicrophonePermissionDialog } from '@/app/components/live-meeting/microphone-permission-dialog';
import { useToast } from '@/hooks/use-toast';

// In component:
const { status: micStatus, error: micError, attemptCount, requestPermission, reset: resetMic } = useMicrophonePermission();
const [showMicDialog, setShowMicDialog] = useState(false);
const { toast } = useToast();

// Before joining session (called AFTER consent is recorded per P37.2a):
const handleMicrophoneCheck = async () => {
  const hasPermission = await requestPermission();

  if (!hasPermission) {
    setShowMicDialog(true);
    return false;
  }

  return true;
};

const handleMicRetry = async () => {
  const hasPermission = await requestPermission();
  if (hasPermission) {
    setShowMicDialog(false);
    resetMic();
    proceedWithJoin();
  }
};

const handleMicCancel = () => {
  setShowMicDialog(false);
  resetMic();
  toast({
    title: 'Microphone required',
    description: 'Microphone access is required to join Clarity Meetings',
  });
  // Return user to lobby/landing (implement based on your routing)
};

// Render:
return (
  <>
    <MicrophonePermissionDialog
      open={showMicDialog}
      error={micError}
      attemptCount={attemptCount}
      onRetry={handleMicRetry}
      onCancel={handleMicCancel}
    />

    {/* Show loading state during permission check */}
    {micStatus === 'checking' && (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking microphone...
      </div>
    )}

    {/* Rest of UI */}
  </>
);
```

### 4. Refactor use-audio-recorder.ts (Optional but Recommended)

After implementing `useMicrophonePermission`, update `use-audio-recorder.ts` to use it internally for consistency. This removes duplicate error handling logic.

**File:** `src/hooks/use-audio-recorder.ts`

Replace the try/catch in `startRecording` (lines 118-196) to use the new hook, or simply have callers check permission first using `useMicrophonePermission` before calling `startRecording()`.

---

## Acceptance Criteria

- [ ] Microphone permission requested after consent recorded (per P37.2a flow)
- [ ] Loading state shown during permission check ("Checking microphone...")
- [ ] Clear dialog shown when permission denied
- [ ] Platform-specific instructions displayed (iOS/Android/Desktop)
- [ ] "Try Again" button re-requests permission
- [ ] After 2+ failed retries, escalated messaging shown (blue highlight, not amber)
- [ ] Cancel returns to lobby with toast notification
- [ ] Session blocked until permission granted
- [ ] Human-friendly error messages (no raw JS errors)
- [ ] Browser support check (graceful degradation for unsupported browsers)
- [ ] "Mic in use" error includes actionable guidance

---

## Testing Checklist

### Manual Testing
- [ ] Grant permission → session starts normally
- [ ] Deny permission → dialog appears with instructions
- [ ] Click "Try Again" → permission re-requested
- [ ] Click "Try Again" 2+ times → escalated message appears (blue box)
- [ ] Click "Cancel" → returns to lobby with toast
- [ ] Revoke permission in browser settings → dialog appears on next attempt
- [ ] No microphone device → "No microphone detected" shown
- [ ] Microphone in use by another app → "Microphone is in use..." with close apps guidance
- [ ] Test in incognito mode → permission prompt shown fresh

### Browser Testing
- [ ] Chrome (desktop) - verify instructions match
- [ ] Safari (desktop) - verify instructions match
- [ ] Firefox (desktop) - verify instructions match
- [ ] Chrome (Android) - verify mobile instructions shown
- [ ] Safari (iOS) - verify iOS-specific instructions shown + reset note

### Edge Case Testing
- [ ] Open in file:// protocol → "browser does not support" message
- [ ] Open in old browser without mediaDevices → graceful error

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No microphone device | "No microphone detected on this device" |
| Microphone in use | "Microphone is in use by another app. Close Zoom, Teams, or other apps and try again." |
| Permission permanently blocked | Escalated message (blue box) after 2 retries |
| iOS Safari permission | iOS-specific Settings app instructions + reset note |
| Incognito/Private mode | Permission must be granted each session |
| Multiple microphones | Browser handles device selection |
| User closes browser mid-prompt | Next attempt shows dialog again |
| Unsupported browser | "Your browser does not support microphone access" |
| No navigator.mediaDevices | Same as unsupported browser |

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useMicrophonePermission.ts` | Create | Permission hook with browser check, attempt tracking, human-friendly errors |
| `src/app/components/live-meeting/microphone-permission-dialog.tsx` | Create | Dialog with inline platform detection, escalation logic |
| `src/app/pages/clarity-live-page.tsx` | Modify | Integrate hook + dialog |
| `src/hooks/use-audio-recorder.ts` | Optional Modify | Can refactor to use new hook internally |

**Note:** No separate `platform.ts` file needed - platform detection is inlined in the dialog (KISS).

---

## Design System Compliance

- ✅ Uses `blue-50`/`blue-200`/`blue-800` for escalated message (not amber)
- ✅ Uses `bg-muted` for instruction box
- ✅ Uses `text-red-600` for error messages
- ✅ Standard Button variants from shadcn/ui
- ✅ Standard Dialog components from shadcn/ui

---

## Related Documents

- [P37.2a: Recording Consent](./p353_2a_consent_mechanism.md) - Consent flow (happens BEFORE mic check)
- [clarity-live-page.tsx](../../../src/app/pages/clarity-live-page.tsx) - Integration point
- [use-audio-recorder.ts](../../../src/hooks/use-audio-recorder.ts) - Existing mic handling to potentially refactor
