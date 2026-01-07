# P40: Microphone Permission Handling

**Status:** Ready for Implementation (Part of P37.2a)
**Priority:** HIGH (Required for Live Meetings)
**Est. Effort:** 1-2 hours
**Created:** 2026-01-07
**Updated:** 2026-01-07 (Architect Review - KISS improvements)
**Depends On:** None
**Included In:** P37.2a (Consent Mechanism)

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

- [P37.2a: Recording Consent](./p37_2a_consent_mechanism.md) - Consent flow (happens BEFORE mic check)
- [clarity-live-page.tsx](../src/app/pages/clarity-live-page.tsx) - Integration point
- [use-audio-recorder.ts](../src/hooks/use-audio-recorder.ts) - Existing mic handling to potentially refactor
