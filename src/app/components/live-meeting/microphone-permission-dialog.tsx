/**
 * @file microphone-permission-dialog.tsx
 * @description P40: Dialog shown when microphone permission is denied
 *
 * Provides platform-specific instructions and escalated messaging
 * after repeated failures.
 */
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
          <DialogDescription>
            Clarity Meetings need microphone access to work.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">

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
                  <li>
                    <strong>iOS Safari:</strong> Settings app → Safari → Microphone
                  </li>
                  <li>
                    <strong>iOS Chrome:</strong> Settings app → Chrome → Microphone
                  </li>
                  <li className="text-xs italic">
                    Note: iOS resets permissions when you close the browser.
                  </li>
                </>
              ) : platform === 'android' ? (
                <>
                  <li>
                    <strong>Chrome:</strong> Tap lock icon in address bar → Permissions →
                    Microphone
                  </li>
                  <li>
                    <strong>Firefox:</strong> Tap lock icon → Edit Site Settings
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <strong>Chrome:</strong> Click lock icon in address bar → Site settings
                  </li>
                  <li>
                    <strong>Safari:</strong> Safari menu → Settings → Websites → Microphone
                  </li>
                  <li>
                    <strong>Firefox:</strong> Click lock icon in address bar → Permissions
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onRetry}>Try Again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
