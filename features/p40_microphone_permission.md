# P40: Microphone Permission Handling

**Status:** Ready for Implementation (Part of P37.2a)
**Priority:** HIGH (Required for Live Meetings)
**Est. Effort:** 2-3 hours
**Created:** 2026-01-07
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

**Current State:** No explicit microphone permission check. Users who deny permission see unclear error states.

---

## Objectives

- [ ] Check microphone permission before joining session
- [ ] Show clear UI when permission denied
- [ ] Provide instructions for enabling microphone in browser settings
- [ ] Block session join until microphone access granted

---

## User Flow

### Happy Path

```
1. User clicks "Join Session"
2. Browser prompts for microphone permission
3. User grants permission
4. Session proceeds normally
```

### Permission Denied

```
┌─────────────────────────────────────────────────────┐
│  🎙️  Microphone Access Required                     │
│                                                     │
│  Clarity Meetings need microphone access to work.   │
│                                                     │
│  Please enable microphone in your browser settings: │
│                                                     │
│  Chrome: Click 🔒 in address bar → Site settings    │
│  Safari: Safari menu → Settings → Websites → Mic    │
│  Firefox: Click 🔒 in address bar → Permissions     │
│                                                     │
│  [Try Again]                                        │
└─────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Permission Check Hook

**File:** `src/hooks/useMicrophonePermission.ts`

```typescript
import { useState, useCallback } from 'react';

export type MicrophoneStatus = 'unknown' | 'granted' | 'denied' | 'prompt';

export function useMicrophonePermission() {
  const [status, setStatus] = useState<MicrophoneStatus>('unknown');
  const [error, setError] = useState<string | null>(null);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Permission granted - stop the stream immediately (we just needed permission)
      stream.getTracks().forEach(track => track.stop());

      setStatus('granted');
      setError(null);
      return true;
    } catch (err) {
      const error = err as Error;

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setStatus('denied');
        setError('Microphone permission denied');
      } else if (error.name === 'NotFoundError') {
        setStatus('denied');
        setError('No microphone found');
      } else {
        setStatus('denied');
        setError(`Microphone error: ${error.message}`);
      }

      return false;
    }
  }, []);

  const checkPermission = useCallback(async (): Promise<MicrophoneStatus> => {
    try {
      // Check permission status without prompting
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      const newStatus = result.state as MicrophoneStatus;
      setStatus(newStatus);
      return newStatus;
    } catch {
      // permissions.query not supported - status unknown
      return 'unknown';
    }
  }, []);

  return {
    status,
    error,
    requestPermission,
    checkPermission,
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
import { Mic } from 'lucide-react';

interface MicrophonePermissionDialogProps {
  open: boolean;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
}

export function MicrophonePermissionDialog({
  open,
  error,
  onRetry,
  onCancel,
}: MicrophonePermissionDialogProps) {
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
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="bg-muted p-4 rounded-md text-sm space-y-2">
            <p className="font-medium">Enable microphone in your browser:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li><strong>Chrome:</strong> Click lock icon in address bar → Site settings</li>
              <li><strong>Safari:</strong> Safari menu → Settings → Websites → Microphone</li>
              <li><strong>Firefox:</strong> Click lock icon in address bar → Permissions</li>
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

// In component:
const { status: micStatus, error: micError, requestPermission } = useMicrophonePermission();
const [showMicDialog, setShowMicDialog] = useState(false);

// Before joining session:
const handleJoinSession = async () => {
  // Step 1: Check microphone permission
  const hasPermission = await requestPermission();

  if (!hasPermission) {
    setShowMicDialog(true);
    return;
  }

  // Step 2: Proceed with join (consent is part of join dialog)
  proceedWithJoin();
};

const handleMicRetry = async () => {
  const hasPermission = await requestPermission();
  if (hasPermission) {
    setShowMicDialog(false);
    proceedWithJoin();
  }
};

// Render:
return (
  <>
    <MicrophonePermissionDialog
      open={showMicDialog}
      error={micError}
      onRetry={handleMicRetry}
      onCancel={() => setShowMicDialog(false)}
    />

    {/* Rest of UI */}
  </>
);
```

---

## Acceptance Criteria

- [ ] Microphone permission requested before session starts
- [ ] Clear dialog shown when permission denied
- [ ] Browser-specific instructions displayed
- [ ] "Try Again" button re-requests permission
- [ ] Session blocked until permission granted
- [ ] Works on Chrome, Safari, Firefox
- [ ] Works on mobile browsers (iOS Safari, Chrome Android)

---

## Testing Checklist

### Manual Testing
- [ ] Grant permission → session starts normally
- [ ] Deny permission → dialog appears with instructions
- [ ] Click "Try Again" → permission re-requested
- [ ] Revoke permission in browser settings → dialog appears on next attempt
- [ ] No microphone device → appropriate error shown

### Browser Testing
- [ ] Chrome (desktop)
- [ ] Safari (desktop)
- [ ] Firefox (desktop)
- [ ] Chrome (Android)
- [ ] Safari (iOS)

---

## Edge Cases

1. **No microphone device:** Show "No microphone found" error
2. **Permission previously denied:** Browser may not show prompt again - instructions help user enable manually
3. **Incognito/Private mode:** Permission must be granted each session
4. **Multiple microphones:** Browser handles device selection, not our concern

---

## Related Documents

- [P37.2a: Recording Consent](./p37_2a_consent_mechanism.md) - Consent flow after mic permission granted
- [clarity-live-page.tsx](../src/app/pages/clarity-live-page.tsx) - Integration point
